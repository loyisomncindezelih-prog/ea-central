"""Iteration 13 - supplemental verification of payment flow URLs, HMAC enforcement,
and explicit device-collision 409. Builds on test_iteration12 baseline."""
import os
import time
import uuid
import hmac
import hashlib
import base64
import json
import requests
import pytest
from pymongo import MongoClient

def _read_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.strip().startswith("REACT_APP_BACKEND_URL="):
                return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

# Load Mongo env from /app/backend/.env
def _load_env():
    p = "/app/backend/.env"
    env = {}
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

_env = _load_env()
MONGO_URL = _env.get("MONGO_URL") or os.environ.get("MONGO_URL")
DB_NAME = _env.get("DB_NAME") or os.environ.get("DB_NAME")
mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

APPROVED_EMAIL = "TEST_it6_ui_1778753851@test.com"
APPROVED_KEY = "EAC-2F9D-E69F-6F75-CEB3"


# ---------- /verify-account/checkout URL shape ----------
class TestCheckoutUrls:
    def test_checkout_returns_success_and_cancel_urls(self):
        """Fresh unpaid user → /checkout should return redirect_url + checkout_id,
        AND the urls we sent to Yoco must point at /payment-success and /payment-cancelled."""
        ts = int(time.time())
        email = f"TEST_iter13_chk_{ts}_{uuid.uuid4().hex[:6]}@test.com"
        # Register a pending mentor
        r = requests.post(f"{API}/auth/register", json={
            "name": "Iter13 Chk",
            "username": f"iter13_{uuid.uuid4().hex[:8]}",
            "email": email,
            "password": "Passw0rd!",
            "country_code": "+27",
            "contact_number": "0712345678",
            "experience_years": 1,
            "trading_style": "Scalping",
            "preferred_markets": ["Forex"],
            "bio": "iter13 checkout test",
        })
        assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"

        # Hit checkout
        r = requests.post(f"{API}/verify-account/checkout", json={"email": email})
        assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text}"
        data = r.json()
        assert "redirect_url" in data and data["redirect_url"], data
        assert "checkout_id" in data and data["checkout_id"], data
        assert data.get("amount_cents") and data.get("currency"), data

        # The success/cancel urls live in the request body to Yoco, not the response.
        # But the redirect_url returned is the Yoco checkout page. We can verify:
        # (a) user record now has yoco_checkout_id stored.
        u = db.users.find_one({"email": email.lower()})
        assert u and u.get("payment_clicked") is True
        assert u.get("yoco_checkout_id") == data["checkout_id"]

        # (b) Code-path verification: server.py line 406-408 hardcodes /payment-success
        #     and /payment-cancelled. We assert by re-reading the server source for safety.
        src = open("/app/backend/server.py").read()
        assert "/payment-success?email=" in src, "successUrl must point at /payment-success"
        assert "/payment-cancelled?email=" in src, "cancelUrl must point at /payment-cancelled"
        assert "status=cancelled" in src and "status=failed" in src

        # cleanup
        db.users.delete_one({"email": email.lower()})

    def test_checkout_already_approved_short_circuits(self):
        r = requests.post(f"{API}/verify-account/checkout", json={"email": APPROVED_EMAIL})
        assert r.status_code == 200
        data = r.json()
        assert data.get("already_approved") is True, data


# ---------- Webhook HMAC enforcement ----------
class TestWebhookHmac:
    def _get_secret(self):
        cfg = db.app_config.find_one({"_id": "yoco_webhook_secret"}) or db.app_config.find_one({"key": "yoco_webhook_secret"})
        if not cfg:
            # alt collection naming
            cfg = db.app_config.find_one({})
        # Try a few keys
        for k in ("secret", "value", "webhook_secret"):
            if cfg and cfg.get(k):
                return cfg[k]
        # Search any doc with 'whsec_'
        for doc in db.app_config.find():
            for v in doc.values():
                if isinstance(v, str) and v.startswith("whsec_"):
                    return v
        return None

    def test_unsigned_webhook_rejected(self):
        body = json.dumps({"type": "payment.succeeded", "payload": {"metadata": {"user_email": "x@y.com"}}})
        r = requests.post(f"{API}/webhooks/yoco", data=body, headers={"Content-Type": "application/json"})
        assert r.status_code in (400, 401, 403), f"expected reject, got {r.status_code} {r.text}"

    def test_bad_signature_rejected(self):
        body = json.dumps({"type": "payment.succeeded", "payload": {"metadata": {"user_email": "x@y.com"}}})
        headers = {
            "Content-Type": "application/json",
            "webhook-id": "msg_test_iter13",
            "webhook-timestamp": str(int(time.time())),
            "webhook-signature": "v1,deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        }
        r = requests.post(f"{API}/webhooks/yoco", data=body, headers=headers)
        assert r.status_code in (400, 401, 403), f"expected reject, got {r.status_code} {r.text}"

    def test_valid_signature_processes(self):
        secret = self._get_secret()
        if not secret or not secret.startswith("whsec_"):
            pytest.skip(f"No yoco webhook secret found in db.app_config; got {secret!r}")
        # Yoco uses Svix-style signing: sign "{id}.{timestamp}.{body}" with HMAC-SHA256, base64.
        raw_secret = base64.b64decode(secret.split("_", 1)[1])

        ts = int(time.time())
        wid = f"msg_iter13_{ts}_{uuid.uuid4().hex[:6]}"

        # Use approved mentor email — already_approved should be idempotent.
        body_obj = {
            "type": "payment.succeeded",
            "payload": {
                "id": f"pmt_iter13_{ts}",
                "metadata": {"user_email": APPROVED_EMAIL, "purpose": "mentor_verification"},
                "amount": 43900,
                "currency": "ZAR",
            },
        }
        body = json.dumps(body_obj)
        signed = f"{wid}.{ts}.{body}".encode()
        sig = base64.b64encode(hmac.new(raw_secret, signed, hashlib.sha256).digest()).decode()
        headers = {
            "Content-Type": "application/json",
            "webhook-id": wid,
            "webhook-timestamp": str(ts),
            "webhook-signature": f"v1,{sig}",
        }
        r = requests.post(f"{API}/webhooks/yoco", data=body, headers=headers)
        assert r.status_code == 200, f"valid sig should be accepted: {r.status_code} {r.text}"


# ---------- Device binding explicit collision ----------
class TestDeviceCollision:
    @pytest.fixture(autouse=True)
    def reset(self):
        # release before
        db.license_keys.update_one(
            {"key": APPROVED_KEY},
            {"$set": {"bound_device_id": None, "bound_to_email": None, "device_bound_at": None}},
        )
        yield
        # restore after
        db.license_keys.update_one(
            {"key": APPROVED_KEY},
            {"$set": {"bound_device_id": "restore-device-iter13"}},
        )

    def test_second_device_returns_409(self):
        dev_a = f"iter13-dev-a-{uuid.uuid4().hex[:8]}"
        dev_b = f"iter13-dev-b-{uuid.uuid4().hex[:8]}"

        r1 = requests.post(f"{API}/mobile/activate-license", json={
            "email": APPROVED_EMAIL,
            "license_key": APPROVED_KEY,
            "device_id": dev_a,
        })
        assert r1.status_code == 200, f"first activation should succeed: {r1.status_code} {r1.text}"
        assert r1.json().get("ok") is True or "expires_at" in r1.json(), r1.json()

        r2 = requests.post(f"{API}/mobile/activate-license", json={
            "email": APPROVED_EMAIL,
            "license_key": APPROVED_KEY,
            "device_id": dev_b,
        })
        assert r2.status_code == 409, f"expected 409 on different device, got {r2.status_code} {r2.text}"
        body = r2.json().get("detail", "") if isinstance(r2.json(), dict) else r2.text
        assert "another device" in str(body).lower() or "already" in str(body).lower(), body

        # Same device A still works (idempotent)
        r3 = requests.post(f"{API}/mobile/activate-license", json={
            "email": APPROVED_EMAIL,
            "license_key": APPROVED_KEY,
            "device_id": dev_a,
        })
        assert r3.status_code == 200, f"same-device re-activation should be ok: {r3.status_code} {r3.text}"


# ---------- Verify-account status endpoint ----------
class TestStatusEndpoint:
    def test_status_for_approved(self):
        r = requests.get(f"{API}/verify-account/status", params={"email": APPROVED_EMAIL})
        assert r.status_code == 200
        data = r.json()
        # Expected fields
        for k in ("status", "payment_confirmed"):
            assert k in data, f"missing {k} in {data}"
        assert data["status"] == "approved"
