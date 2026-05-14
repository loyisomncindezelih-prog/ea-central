"""Iteration 5: Payment gate on login, rate-limits, broker connect endpoints."""
import os
import time
import uuid
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://copy-trading-hub-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASSWORD = "Admin@123"


def _admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _register(email, username, password="Passw0rd!"):
    return requests.post(f"{API}/auth/register", json={
        "email": email, "username": username, "password": password,
        "country_code": "+27", "contact_number": "0810000000",
    }, timeout=20)


def _approve(admin_token, user_id):
    r = requests.post(f"{API}/admin/users/{user_id}/approve",
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, f"approve: {r.status_code} {r.text}"


@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


@pytest.fixture(scope="module")
def fresh_pending():
    suffix = int(time.time())
    email = f"TEST_it5_pay_{suffix}@test.com"
    r = _register(email, f"TEST_it5_{suffix}")
    assert r.status_code in (200, 201), r.text
    user_id = r.json()["user"]["id"]
    # Server lowercases email; store the form we'll compare against.
    return {"email": email, "email_lc": email.lower(), "user_id": user_id, "password": "Passw0rd!"}


@pytest.fixture(scope="module")
def approved_with_key(admin_token):
    """Approved mentor + EA + 30d licence key (NOT yet bound). Used for broker tests."""
    suffix = int(time.time()) + 100
    email = f"TEST_it5_mentor_{suffix}@test.com"
    r = _register(email, f"TEST_it5_m_{suffix}")
    assert r.status_code in (200, 201), r.text
    uid = r.json()["user"]["id"]
    _approve(admin_token, uid)

    login = requests.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!"}, timeout=20)
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    ea = requests.post(f"{API}/mentor/eas", json={"name": "TEST IT5 EA"}, headers=h, timeout=20).json()
    key = requests.post(f"{API}/mentor/keys", json={
        "ea_id": ea["id"], "plan": "30d", "holder_username": "TEST_it5_client"
    }, headers=h, timeout=20).json()
    return {"email": email, "user_id": uid, "ea": ea, "key": key}


# ============ Payment gate on login ============
class TestPaymentGate:
    def test_login_pending_unpaid_returns_402(self, fresh_pending):
        r = requests.post(f"{API}/auth/login",
                          json={"email": fresh_pending["email"], "password": fresh_pending["password"]},
                          timeout=20)
        assert r.status_code == 402, r.text
        body = r.json()
        # FastAPI wraps HTTPException(detail=dict) as {"detail": {...}}
        detail = body.get("detail")
        assert isinstance(detail, dict)
        assert detail.get("code") == "payment_required"
        assert detail.get("email") == fresh_pending["email_lc"]

    def test_verify_click_then_login_returns_403(self, fresh_pending):
        r = requests.post(f"{API}/verify-account/click",
                          json={"email": fresh_pending["email"]}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        assert "payment_link" in r.json()

        # Now login should be 403 (paid, but still pending admin approval)
        login = requests.post(f"{API}/auth/login",
                              json={"email": fresh_pending["email"], "password": fresh_pending["password"]},
                              timeout=20)
        assert login.status_code == 403, login.text
        msg = login.json().get("detail", "")
        assert "Payment received" in msg or "verifying" in msg.lower()

    def test_admin_approve_then_login_returns_200(self, fresh_pending, admin_token):
        _approve(admin_token, fresh_pending["user_id"])
        login = requests.post(f"{API}/auth/login",
                              json={"email": fresh_pending["email"], "password": fresh_pending["password"]},
                              timeout=20)
        assert login.status_code == 200, login.text
        body = login.json()
        assert "access_token" in body
        assert body["user"]["email"] == fresh_pending["email_lc"]
        assert body["user"]["status"] == "approved"
        assert body["user"].get("payment_clicked") is True


# ============ Broker connect endpoints ============
class TestBrokerConnect:
    def test_connect_broker_mt5_happy(self, approved_with_key):
        payload = {
            "email": approved_with_key["email"],
            "license_key": approved_with_key["key"]["key"],
            "platform": "mt5",
            "server": "ICMarketsSC-Demo",
            "account": "12345678",
            "password": "broker-secret-pwd",
        }
        # First activate so key is bound to email
        act = requests.post(f"{API}/mobile/activate-license", json={
            "email": approved_with_key["email"], "license_key": approved_with_key["key"]["key"]
        }, timeout=20)
        assert act.status_code == 200, act.text
        assert act.json().get("broker") is None  # not yet configured

        r = requests.post(f"{API}/mobile/connect-broker", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["platform"] == "mt5"
        assert data["server"] == "ICMarketsSC-Demo"
        assert data["account"] == "12345678"
        assert data["status"] == "configured"
        assert "connected_at" in data
        assert "notice" in data

    def test_activate_license_now_includes_broker_summary(self, approved_with_key):
        r = requests.post(f"{API}/mobile/activate-license", json={
            "email": approved_with_key["email"],
            "license_key": approved_with_key["key"]["key"],
        }, timeout=20)
        assert r.status_code == 200, r.text
        broker = r.json().get("broker")
        assert broker is not None, "broker summary should be present after connect"
        assert broker["platform"] == "mt5"
        assert broker["server"] == "ICMarketsSC-Demo"
        assert broker["account"] == "12345678"
        assert broker["status"] == "configured"

    def test_connect_broker_mt4(self, approved_with_key):
        payload = {
            "email": approved_with_key["email"],
            "license_key": approved_with_key["key"]["key"],
            "platform": "mt4",
            "server": "FXCM-Real",
            "account": "999",
            "password": "abc",
        }
        r = requests.post(f"{API}/mobile/connect-broker", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["platform"] == "mt4"

    def test_connect_broker_invalid_platform_422(self, approved_with_key):
        payload = {
            "email": approved_with_key["email"],
            "license_key": approved_with_key["key"]["key"],
            "platform": "ctrader",
            "server": "X", "account": "1", "password": "p",
        }
        r = requests.post(f"{API}/mobile/connect-broker", json=payload, timeout=20)
        assert r.status_code == 422, r.text

    def test_connect_broker_short_fields_422(self, approved_with_key):
        # server too short
        r = requests.post(f"{API}/mobile/connect-broker", json={
            "email": approved_with_key["email"],
            "license_key": approved_with_key["key"]["key"],
            "platform": "mt5", "server": "X", "account": "12", "password": "p",
        }, timeout=20)
        assert r.status_code == 422

    def test_connect_broker_invalid_license_404(self, approved_with_key):
        r = requests.post(f"{API}/mobile/connect-broker", json={
            "email": approved_with_key["email"],
            "license_key": "EAC-ZZZZ-ZZZZ-ZZZZ-ZZZZ",
            "platform": "mt5", "server": "Srv", "account": "12", "password": "p",
        }, timeout=20)
        assert r.status_code == 404, r.text

    def test_connect_broker_bound_to_other_email_403(self, approved_with_key):
        r = requests.post(f"{API}/mobile/connect-broker", json={
            "email": f"someone_else_{uuid.uuid4().hex[:6]}@nope.com",
            "license_key": approved_with_key["key"]["key"],
            "platform": "mt5", "server": "Srv", "account": "12", "password": "p",
        }, timeout=20)
        assert r.status_code == 403, r.text

    def test_password_stored_encrypted(self, approved_with_key):
        """Direct Mongo check: broker_connections has password_enc, not password."""
        async def check():
            mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = mc[os.environ["DB_NAME"]]
            doc = await db.broker_connections.find_one(
                {"license_key": approved_with_key["key"]["key"]}, {"_id": 0}
            )
            mc.close()
            return doc

        doc = asyncio.get_event_loop().run_until_complete(check())
        assert doc is not None
        assert "password_enc" in doc
        assert "password" not in doc
        # encrypted token should not equal plaintext
        assert doc["password_enc"] != "abc"
        assert len(doc["password_enc"]) > 20

    def test_disconnect_broker(self, approved_with_key):
        r = requests.post(f"{API}/mobile/disconnect-broker", json={
            "email": approved_with_key["email"],
            "license_key": approved_with_key["key"]["key"],
        }, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # activate-license should now return broker=None
        act = requests.post(f"{API}/mobile/activate-license", json={
            "email": approved_with_key["email"],
            "license_key": approved_with_key["key"]["key"],
        }, timeout=20)
        assert act.status_code == 200
        assert act.json().get("broker") is None


# ============ Rate limit (run LAST to avoid affecting other tests) ============
class TestRateLimit:
    def test_zz_rate_limit_check_email_429(self):
        """31st request within a minute from the same IP returns 429."""
        suffix = int(time.time()) + 500
        email = f"TEST_rl_{suffix}@test.com"
        # Don't register — endpoint short-circuits on 404 quickly
        last_status = None
        got_429 = False
        for i in range(40):
            r = requests.post(f"{API}/mobile/check-email", json={"email": email}, timeout=20)
            last_status = r.status_code
            if r.status_code == 429:
                got_429 = True
                body = r.json()
                assert "Too many requests" in body.get("detail", ""), body
                break
        assert got_429, f"expected 429 within 40 calls, last_status={last_status}"
