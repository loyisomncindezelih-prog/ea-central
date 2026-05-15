"""Iteration 11 backend tests — Yoco LIVE payment gateway integration.

Tests cover:
- Public GET /api/verify-account/config
- Admin GET /api/admin/yoco/status (auth + payload shape)
- POST /api/verify-account/checkout (unknown, approved, paid, happy path LIVE)
- POST /api/admin/yoco/register-webhook (auth + LIVE register, idempotent retry)
- POST /api/webhooks/yoco (missing headers, bad sig, valid sig, idempotency)
- Legacy POST /api/verify-account/click (regression)

Yoco hits the LIVE API. We DO NOT visit redirect_url URLs.
"""
import os
import time
import hmac
import json
import base64
import hashlib
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://copy-trading-hub-2.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASS = "Admin@123"

# A unique pending user per test session for the checkout happy path
PENDING_EMAIL = f"TEST_iter11_pending_{int(time.time())}@test.com"
APPROVED_EMAIL = "TEST_it6_ui_1778753851@test.com"   # already approved (per memory/test_credentials)


# ----------------------- fixtures -----------------------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token")


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def pending_user(api):
    """Register a fresh pending user once for the suite."""
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "username": f"iter11_{int(time.time())}",
        "email": PENDING_EMAIL,
        "password": "Passw0rd!",
        "country_code": "+27",
        "contact_number": "1234567",
    })
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text[:200]}"
    return PENDING_EMAIL


# ----------------------- config / status -----------------------
class TestConfigAndStatus:
    def test_public_config(self, api):
        r = api.get(f"{BASE_URL}/api/verify-account/config")
        assert r.status_code == 200
        data = r.json()
        assert data.get("yoco_configured") is True
        assert data.get("amount_cents") == 43900
        assert data.get("currency") == "ZAR"
        assert isinstance(data.get("payment_link"), str) and data["payment_link"]

    def test_admin_status_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/yoco/status")
        assert r.status_code == 401

    def test_admin_status_ok(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/yoco/status", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("secret_configured") is True
        assert d.get("public_key_configured") is True
        assert d.get("amount_cents") == 43900
        assert d.get("currency") == "ZAR"
        assert "webhook_registered" in d


# ----------------------- checkout -----------------------
class TestCheckout:
    def test_checkout_unknown_email_404(self, api):
        r = api.post(f"{BASE_URL}/api/verify-account/checkout", json={"email": f"nope_{uuid.uuid4().hex[:8]}@test.com"})
        assert r.status_code == 404

    def test_checkout_already_approved(self, api):
        r = api.post(f"{BASE_URL}/api/verify-account/checkout", json={"email": APPROVED_EMAIL})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("already_approved") is True

    def test_checkout_happy_path_live(self, api, pending_user):
        """Hits the REAL Yoco API. We don't visit the redirect_url."""
        r = api.post(f"{BASE_URL}/api/verify-account/checkout", json={"email": pending_user})
        assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text[:500]}"
        d = r.json()
        assert isinstance(d.get("checkout_id"), str) and d["checkout_id"].startswith("ch_")
        assert isinstance(d.get("redirect_url"), str)
        assert d["redirect_url"].startswith("https://c.yoco.com/checkout/") or d["redirect_url"].startswith("https://pay.yoco.com/")
        assert d.get("amount_cents") == 43900
        assert d.get("currency") == "ZAR"


# ----------------------- admin webhook registration -----------------------
class TestAdminWebhookRegister:
    def test_register_requires_auth(self, api):
        # Use a fresh request (no cookies/headers from session) to verify guard
        r = requests.post(f"{BASE_URL}/api/admin/yoco/register-webhook")
        assert r.status_code == 401

    def test_register_webhook_live(self, api, admin_headers):
        """Only register if not already registered to avoid duplicates against the Yoco account."""
        s = api.get(f"{BASE_URL}/api/admin/yoco/status", headers=admin_headers).json()
        if s.get("webhook_registered"):
            pytest.skip("Webhook already registered earlier — skipping re-register to avoid duplicate Yoco subscription.")
        r = api.post(f"{BASE_URL}/api/admin/yoco/register-webhook", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("secret_saved") is True
        assert isinstance(d.get("webhook_url"), str)
        # confirm status now flips to registered
        s2 = api.get(f"{BASE_URL}/api/admin/yoco/status", headers=admin_headers).json()
        assert s2.get("webhook_registered") is True


# ----------------------- webhook receiver -----------------------
def _get_secret_from_db():
    """Read the saved webhook secret directly from Mongo so we can sign a payload like Yoco would."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _go():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        doc = await db.app_config.find_one({"key": "yoco_webhook_secret"}, {"_id": 0})
        client.close()
        return (doc or {}).get("value")

    return asyncio.get_event_loop().run_until_complete(_go()) if False else asyncio.run(_go())


def _sign(secret_b64: str, webhook_id: str, ts: str, body: str) -> str:
    try:
        key = base64.b64decode(secret_b64.removeprefix("whsec_"))
    except Exception:
        key = secret_b64.encode()
    signed = f"{webhook_id}.{ts}.{body}".encode()
    sig = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return f"v1,{sig}"


class TestWebhookReceiver:
    def test_missing_headers_when_secret_registered(self, api, admin_headers):
        s = api.get(f"{BASE_URL}/api/admin/yoco/status", headers=admin_headers).json()
        if not s.get("webhook_registered"):
            pytest.skip("No webhook secret registered — endpoint returns 200 + warning in that mode.")
        r = api.post(f"{BASE_URL}/api/webhooks/yoco", data="{}")
        assert r.status_code == 400
        assert "Missing" in r.text or "headers" in r.text.lower()

    def test_bad_signature_401(self, api, admin_headers):
        s = api.get(f"{BASE_URL}/api/admin/yoco/status", headers=admin_headers).json()
        if not s.get("webhook_registered"):
            pytest.skip("No webhook secret registered.")
        body = json.dumps({"id": f"evt_{uuid.uuid4().hex}", "type": "payment.succeeded", "payload": {}})
        r = requests.post(
            f"{BASE_URL}/api/webhooks/yoco",
            data=body,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_bad",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "v1,YmFkc2lnbmF0dXJlYmFkc2lnbmF0dXJlYmFkc2ln",
            },
        )
        assert r.status_code == 401

    def test_valid_signature_marks_payment_confirmed_and_idempotent(self, api, admin_headers, pending_user):
        s = api.get(f"{BASE_URL}/api/admin/yoco/status", headers=admin_headers).json()
        if not s.get("webhook_registered"):
            pytest.skip("No webhook secret registered.")
        secret = _get_secret_from_db()
        assert secret, "expected secret in db.app_config.yoco_webhook_secret"

        evt_id = f"evt_{uuid.uuid4().hex}"
        ts = str(int(time.time()))
        body_obj = {
            "id": evt_id,
            "type": "payment.succeeded",
            "payload": {
                "id": "py_test_1",
                "amount": {"value": 43900, "currency": "ZAR"},
                "metadata": {"user_email": pending_user, "checkoutId": "ch_test"},
            },
        }
        body = json.dumps(body_obj, separators=(",", ":"))
        sig = _sign(secret, evt_id, ts, body)

        r = requests.post(
            f"{BASE_URL}/api/webhooks/yoco",
            data=body,
            headers={
                "Content-Type": "application/json",
                "webhook-id": evt_id,
                "webhook-timestamp": ts,
                "webhook-signature": sig,
            },
        )
        assert r.status_code == 200, f"webhook rejected: {r.status_code} {r.text[:300]}"
        assert r.json().get("ok") is True

        # Second delivery — must be idempotent
        r2 = requests.post(
            f"{BASE_URL}/api/webhooks/yoco",
            data=body,
            headers={
                "Content-Type": "application/json",
                "webhook-id": evt_id,
                "webhook-timestamp": ts,
                "webhook-signature": sig,
            },
        )
        assert r2.status_code == 200
        assert r2.json().get("already_processed") is True

        # Subsequent checkout for the same user now reports already_paid
        r3 = api.post(f"{BASE_URL}/api/verify-account/checkout", json={"email": pending_user})
        assert r3.status_code == 200, r3.text
        assert r3.json().get("already_paid") is True


# ----------------------- legacy regression -----------------------
class TestLegacyClick:
    def test_click_unknown_404(self, api):
        r = api.post(f"{BASE_URL}/api/verify-account/click", json={"email": f"nope_{uuid.uuid4().hex[:8]}@test.com"})
        assert r.status_code == 404

    def test_click_approved(self, api):
        r = api.post(f"{BASE_URL}/api/verify-account/click", json={"email": APPROVED_EMAIL})
        assert r.status_code == 200
        d = r.json()
        assert d.get("already_approved") is True

    def test_click_pending_returns_payment_link(self, api):
        # Use a fresh pending user so we don't collide with the checkout fixture state
        email = f"TEST_iter11_legacy_{int(time.time())}@test.com"
        reg = api.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"iter11l_{int(time.time())}",
            "email": email,
            "password": "Passw0rd!",
            "country_code": "+27",
            "contact_number": "1234567",
        })
        assert reg.status_code in (200, 201)
        r = api.post(f"{BASE_URL}/api/verify-account/click", json={"email": email})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("already_approved") is False
        assert isinstance(d.get("payment_link"), str) and d["payment_link"].startswith("http")
