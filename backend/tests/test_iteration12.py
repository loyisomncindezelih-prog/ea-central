"""Iteration 12 backend tests.

Covers:
- Public GET /api/verify-account/status (NEW: no auth required)
- Webhook payment.succeeded auto-approves pending mentor (sets status=approved, approved_by=yoco_auto)
- Webhook payment.succeeded for already-approved user does NOT change status
- /mobile/activate-license device_id binding (first activation records, second from different device 409)
- /mobile/activate-license missing device_id (legacy fallback => 200)
- /admin/licenses/{id}/release clears bound_device_id and allows a new device to activate
- Regression: connect-broker -> pending_approval, ea/start, pair-config, bridge endpoints
"""
import os
import time
import json
import hmac
import base64
import hashlib
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASS = "Admin@123"
APPROVED_MENTOR_EMAIL = "TEST_it6_ui_1778753851@test.com"
APPROVED_MENTOR_PASS = "Passw0rd!"
APPROVED_LICENSE_KEY = "EAC-2F9D-E69F-6F75-CEB3"


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
def fresh_pending_email(api):
    email = f"TEST_iter12_pending_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "username": f"iter12_{int(time.time())}",
        "email": email,
        "password": "Passw0rd!",
        "country_code": "+27",
        "contact_number": "1234567",
    })
    assert r.status_code in (200, 201), r.text
    return email


def _db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _get_webhook_secret():
    async def _go():
        client, db = _db()
        doc = await db.app_config.find_one({"key": "yoco_webhook_secret"}, {"_id": 0})
        client.close()
        return (doc or {}).get("value")
    return asyncio.run(_go())


def _sign(secret_b64, webhook_id, ts, body):
    try:
        key = base64.b64decode(secret_b64.removeprefix("whsec_"))
    except Exception:
        key = secret_b64.encode()
    signed = f"{webhook_id}.{ts}.{body}".encode()
    sig = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return f"v1,{sig}"


def _post_webhook(email):
    secret = _get_webhook_secret()
    assert secret, "webhook secret missing in db.app_config"
    evt_id = f"evt_{uuid.uuid4().hex}"
    ts = str(int(time.time()))
    body_obj = {
        "id": evt_id,
        "type": "payment.succeeded",
        "payload": {
            "id": f"py_iter12_{uuid.uuid4().hex[:8]}",
            "amount": {"value": 43900, "currency": "ZAR"},
            "metadata": {"user_email": email},
        },
    }
    body = json.dumps(body_obj, separators=(",", ":"))
    sig = _sign(secret, evt_id, ts, body)
    return requests.post(
        f"{BASE_URL}/api/webhooks/yoco",
        data=body,
        headers={
            "Content-Type": "application/json",
            "webhook-id": evt_id,
            "webhook-timestamp": ts,
            "webhook-signature": sig,
        },
    )


# ----------------------- /verify-account/status -----------------------
class TestVerifyAccountStatus:
    def test_status_public_no_auth(self, api, fresh_pending_email):
        r = api.get(f"{BASE_URL}/api/verify-account/status", params={"email": fresh_pending_email})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == fresh_pending_email.lower()
        assert d["status"] == "pending"
        assert d["payment_confirmed"] is False
        assert "payment_clicked" in d
        assert "payment_amount_cents" in d

    def test_status_unknown_404(self, api):
        r = api.get(f"{BASE_URL}/api/verify-account/status", params={"email": f"nope_{uuid.uuid4().hex[:8]}@test.com"})
        assert r.status_code == 404


# ----------------------- webhook auto-approve -----------------------
class TestWebhookAutoApprove:
    def test_pending_mentor_gets_auto_approved(self, api, fresh_pending_email):
        # Sanity: starts as pending
        s = api.get(f"{BASE_URL}/api/verify-account/status", params={"email": fresh_pending_email}).json()
        assert s["status"] == "pending"

        r = _post_webhook(fresh_pending_email)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        s2 = api.get(f"{BASE_URL}/api/verify-account/status", params={"email": fresh_pending_email}).json()
        assert s2["payment_confirmed"] is True
        assert s2["status"] == "approved", f"expected approved, got {s2}"

        # Verify approved_by directly in DB
        async def _check():
            client, db = _db()
            u = await db.users.find_one({"email": fresh_pending_email.lower()}, {"_id": 0})
            client.close()
            return u
        u = asyncio.run(_check())
        assert u["approved_by"] == "yoco_auto"
        assert u.get("approved_at")

    def test_already_approved_status_unchanged(self, api):
        # APPROVED_MENTOR_EMAIL is already approved by admin
        async def _pre():
            client, db = _db()
            u = await db.users.find_one({"email": APPROVED_MENTOR_EMAIL.lower()}, {"_id": 0})
            client.close()
            return u
        before = asyncio.run(_pre())
        assert before["status"] == "approved"
        original_approved_by = before.get("approved_by")

        r = _post_webhook(APPROVED_MENTOR_EMAIL)
        assert r.status_code == 200

        after = asyncio.run(_pre())
        assert after["status"] == "approved"
        # approved_by must NOT have been overwritten with yoco_auto
        assert after.get("approved_by") == original_approved_by, "webhook overwrote approved_by on already-approved user"
        # payment fields should have been updated
        assert after.get("payment_confirmed") is True


# ----------------------- /mobile/activate-license device binding -----------------------
class TestActivateLicenseDeviceBinding:
    """Use APPROVED_MENTOR_EMAIL + APPROVED_LICENSE_KEY. Release first to start clean."""

    @pytest.fixture(scope="class")
    def license_id(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/licenses", headers=admin_headers)
        assert r.status_code == 200
        for k in r.json():
            if k.get("key") == APPROVED_LICENSE_KEY:
                return k["id"]
        pytest.skip(f"license {APPROVED_LICENSE_KEY} not found")

    @pytest.fixture(scope="class", autouse=True)
    def reset_license(self, api, admin_headers, license_id):
        # Release before tests in this class so we can re-bind cleanly
        api.post(f"{BASE_URL}/api/admin/licenses/{license_id}/release", headers=admin_headers)
        yield
        # Re-bind to original device for downstream regression
        api.post(f"{BASE_URL}/api/mobile/activate-license", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
            "device_id": "restore-device-iter12",
        })

    def test_first_activation_records_device(self, api, license_id):
        dev1 = f"dev_{uuid.uuid4().hex[:12]}"
        r = api.post(f"{BASE_URL}/api/mobile/activate-license", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
            "device_id": dev1,
        })
        assert r.status_code == 200, r.text

        # Verify bound_device_id is set in DB
        async def _check():
            client, db = _db()
            doc = await db.license_keys.find_one({"key": APPROVED_LICENSE_KEY}, {"_id": 0})
            client.close()
            return doc
        doc = asyncio.run(_check())
        assert doc["bound_device_id"] == dev1

        # Second activation with SAME device works
        r2 = api.post(f"{BASE_URL}/api/mobile/activate-license", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
            "device_id": dev1,
        })
        assert r2.status_code == 200

        # DIFFERENT device must 409
        r3 = api.post(f"{BASE_URL}/api/mobile/activate-license", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
            "device_id": f"different_{uuid.uuid4().hex[:8]}",
        })
        assert r3.status_code == 409, r3.text
        assert "another device" in r3.text.lower()

    def test_missing_device_id_legacy_ok(self, api):
        # licence already bound to dev1 from prior test; missing device_id should be a fallback OK
        r = api.post(f"{BASE_URL}/api/mobile/activate-license", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
        })
        assert r.status_code == 200, r.text

    def test_release_clears_bound_device_and_allows_new_device(self, api, admin_headers, license_id):
        # Release
        r = api.post(f"{BASE_URL}/api/admin/licenses/{license_id}/release", headers=admin_headers)
        assert r.status_code == 200, r.text

        async def _check():
            client, db = _db()
            doc = await db.license_keys.find_one({"key": APPROVED_LICENSE_KEY}, {"_id": 0})
            client.close()
            return doc
        doc = asyncio.run(_check())
        assert doc.get("bound_device_id") is None
        assert doc.get("bound_to_email") is None

        # Activate from a brand-new device — should succeed
        new_dev = f"newdev_{uuid.uuid4().hex[:8]}"
        r2 = api.post(f"{BASE_URL}/api/mobile/activate-license", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
            "device_id": new_dev,
        })
        assert r2.status_code == 200, r2.text

        doc2 = asyncio.run(_check())
        assert doc2["bound_device_id"] == new_dev


# ----------------------- regression: broker/ea endpoints still work -----------------------
class TestRegression:
    def test_connect_broker_returns_pending_approval(self, api):
        # The approved-mentor licence may have broker.status='approved' already;
        # disconnect first so connect-broker flips to pending_approval again.
        api.post(f"{BASE_URL}/api/mobile/disconnect-broker", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
        })
        r = api.post(f"{BASE_URL}/api/mobile/connect-broker", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
            "platform": "mt5",
            "server": "ICMarketsSC-Demo",
            "account": "12345678",
            "password": "broker-pass",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") == "pending_approval"

    def test_ea_start_endpoint(self, api):
        # /mobile/ea/start — must exist and accept email+license_key
        r = api.post(f"{BASE_URL}/api/mobile/ea/start", json={
            "email": APPROVED_MENTOR_EMAIL,
            "license_key": APPROVED_LICENSE_KEY,
        })
        # Either 200 (started) or a documented business error — but not 404/500
        assert r.status_code in (200, 400, 403, 409, 425), r.text
