"""Iteration 6: verify-account/click branching, activate-license allowed_symbols + pair_configs, pair-config endpoints."""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASSWORD = "Admin@123"
SYMBOLS = ["EURUSD", "XAUUSD", "GBPJPY"]


def _admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register(email, username, password="Passw0rd!"):
    return requests.post(f"{API}/auth/register", json={
        "email": email, "username": username, "password": password,
        "country_code": "+27", "contact_number": "0810000000",
    }, timeout=20)


def _approve(admin_token, uid):
    r = requests.post(f"{API}/admin/users/{uid}/approve",
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


@pytest.fixture(scope="module")
def approved_mentor_with_symbols(admin_token):
    """Approved mentor + EA with 3 symbols + 30d licence bound to mentor's email."""
    suffix = int(time.time())
    email = f"TEST_it6_mentor_{suffix}@test.com"
    r = _register(email, f"TEST_it6_m_{suffix}")
    assert r.status_code in (200, 201), r.text
    uid = r.json()["user"]["id"]
    _approve(admin_token, uid)

    login = requests.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!"}, timeout=20)
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    ea = requests.post(f"{API}/mentor/eas", json={"name": "TEST IT6 EA"}, headers=h, timeout=20).json()
    for sym in SYMBOLS:
        sr = requests.post(f"{API}/mentor/eas/{ea['id']}/symbols",
                           json={"symbol": sym}, headers=h, timeout=20)
        assert sr.status_code == 200, sr.text

    key = requests.post(f"{API}/mentor/keys", json={
        "ea_id": ea["id"], "plan": "30d", "holder_username": "TEST_it6_client"
    }, headers=h, timeout=20).json()

    # Bind via activate-license (mentor uses own email)
    act = requests.post(f"{API}/mobile/activate-license", json={
        "email": email, "license_key": key["key"]
    }, timeout=20)
    assert act.status_code == 200, act.text
    return {"email": email, "user_id": uid, "ea": ea, "key": key["key"]}


# ============ verify-account/click branching ============
class TestVerifyClick:
    def test_already_approved_admin(self):
        r = requests.post(f"{API}/verify-account/click",
                          json={"email": ADMIN_EMAIL}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("already_approved") is True
        assert body.get("ok") is True

    def test_pending_first_then_already_paid(self):
        suffix = int(time.time()) + 7
        email = f"TEST_it6_vac_{suffix}@test.com"
        r = _register(email, f"TEST_it6_vac_{suffix}")
        assert r.status_code in (200, 201), r.text

        # First click — payment_clicked goes from False to True
        r1 = requests.post(f"{API}/verify-account/click", json={"email": email}, timeout=20)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1.get("already_approved") is False
        assert b1.get("already_paid") is False
        assert "payment_link" in b1

        # Second click — already_paid=True
        r2 = requests.post(f"{API}/verify-account/click", json={"email": email}, timeout=20)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        assert b2.get("already_approved") is False
        assert b2.get("already_paid") is True

    def test_unknown_email_404(self):
        r = requests.post(f"{API}/verify-account/click",
                          json={"email": f"nobody_{int(time.time())}@nope.com"}, timeout=20)
        assert r.status_code == 404, r.text


# ============ activate-license now returns allowed_symbols + pair_configs ============
class TestActivateLicenseEnriched:
    def test_includes_allowed_symbols_and_pair_configs(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        r = requests.post(f"{API}/mobile/activate-license",
                          json={"email": m["email"], "license_key": m["key"]}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "allowed_symbols" in body
        assert isinstance(body["allowed_symbols"], list)
        assert set(body["allowed_symbols"]) == set(SYMBOLS)
        assert "pair_configs" in body
        assert isinstance(body["pair_configs"], list)


# ============ pair-config CRUD + validation ============
class TestPairConfig:
    def test_happy_path_save_and_persist(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        r = requests.post(f"{API}/mobile/pair-config", json={
            "email": m["email"], "license_key": m["key"],
            "symbol": "EURUSD", "lot_size": 0.01,
            "direction": "BUY", "platform": "mt4", "max_trades": 1,
        }, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        cfg = body["config"]
        assert cfg["symbol"] == "EURUSD"
        assert cfg["lot_size"] == 0.01
        assert cfg["direction"] == "BUY"
        assert cfg["platform"] == "mt4"
        assert cfg["max_trades"] == 1

        # Verify via activate-license that it's persisted
        act = requests.post(f"{API}/mobile/activate-license",
                            json={"email": m["email"], "license_key": m["key"]}, timeout=20)
        assert act.status_code == 200
        cfgs = act.json()["pair_configs"]
        eur = [c for c in cfgs if c["symbol"] == "EURUSD"]
        assert len(eur) == 1
        assert eur[0]["lot_size"] == 0.01
        assert eur[0]["direction"] == "BUY"
        assert eur[0]["platform"] == "mt4"
        assert eur[0]["max_trades"] == 1

    def test_upsert_same_symbol_updates(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        # Update existing EURUSD config
        r = requests.post(f"{API}/mobile/pair-config", json={
            "email": m["email"], "license_key": m["key"],
            "symbol": "EURUSD", "lot_size": 0.05,
            "direction": "BOTH", "platform": "mt5", "max_trades": 3,
        }, timeout=20)
        assert r.status_code == 200, r.text

        act = requests.post(f"{API}/mobile/activate-license",
                            json={"email": m["email"], "license_key": m["key"]}, timeout=20)
        cfgs = act.json()["pair_configs"]
        eur = [c for c in cfgs if c["symbol"] == "EURUSD"]
        assert len(eur) == 1, "should be upsert, not duplicate"
        assert eur[0]["lot_size"] == 0.05
        assert eur[0]["direction"] == "BOTH"
        assert eur[0]["platform"] == "mt5"
        assert eur[0]["max_trades"] == 3

    def test_symbol_not_in_allowed_400(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        r = requests.post(f"{API}/mobile/pair-config", json={
            "email": m["email"], "license_key": m["key"],
            "symbol": "BTCUSD", "lot_size": 0.01,
            "direction": "BUY", "platform": "mt4", "max_trades": 1,
        }, timeout=20)
        assert r.status_code == 400, r.text
        assert "allowed" in r.json().get("detail", "").lower()

    def test_invalid_direction_422(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        r = requests.post(f"{API}/mobile/pair-config", json={
            "email": m["email"], "license_key": m["key"],
            "symbol": "EURUSD", "lot_size": 0.01,
            "direction": "LONG", "platform": "mt4", "max_trades": 1,
        }, timeout=20)
        assert r.status_code == 422, r.text

    def test_invalid_platform_422(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        r = requests.post(f"{API}/mobile/pair-config", json={
            "email": m["email"], "license_key": m["key"],
            "symbol": "EURUSD", "lot_size": 0.01,
            "direction": "BUY", "platform": "ctrader", "max_trades": 1,
        }, timeout=20)
        assert r.status_code == 422, r.text

    def test_invalid_lot_size_422(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        for bad in [0, -0.1, 101]:
            r = requests.post(f"{API}/mobile/pair-config", json={
                "email": m["email"], "license_key": m["key"],
                "symbol": "EURUSD", "lot_size": bad,
                "direction": "BUY", "platform": "mt4", "max_trades": 1,
            }, timeout=20)
            assert r.status_code == 422, f"lot_size={bad}: {r.status_code} {r.text}"

    def test_invalid_max_trades_422(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        for bad in [0, -1, 1000]:
            r = requests.post(f"{API}/mobile/pair-config", json={
                "email": m["email"], "license_key": m["key"],
                "symbol": "EURUSD", "lot_size": 0.01,
                "direction": "BUY", "platform": "mt4", "max_trades": bad,
            }, timeout=20)
            assert r.status_code == 422, f"max_trades={bad}: {r.status_code} {r.text}"

    def test_invalid_license_404(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        r = requests.post(f"{API}/mobile/pair-config", json={
            "email": m["email"], "license_key": "EAC-ZZZZ-ZZZZ-ZZZZ-ZZZZ",
            "symbol": "EURUSD", "lot_size": 0.01,
            "direction": "BUY", "platform": "mt4", "max_trades": 1,
        }, timeout=20)
        assert r.status_code == 404, r.text

    def test_license_bound_to_other_email_403(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        r = requests.post(f"{API}/mobile/pair-config", json={
            "email": f"notme_{int(time.time())}@nope.com", "license_key": m["key"],
            "symbol": "EURUSD", "lot_size": 0.01,
            "direction": "BUY", "platform": "mt4", "max_trades": 1,
        }, timeout=20)
        assert r.status_code == 403, r.text

    def test_delete_pair_config(self, approved_mentor_with_symbols):
        m = approved_mentor_with_symbols
        # Create XAUUSD first
        c = requests.post(f"{API}/mobile/pair-config", json={
            "email": m["email"], "license_key": m["key"],
            "symbol": "XAUUSD", "lot_size": 0.02,
            "direction": "SELL", "platform": "mt5", "max_trades": 2,
        }, timeout=20)
        assert c.status_code == 200, c.text

        d = requests.post(f"{API}/mobile/pair-config/delete", json={
            "email": m["email"], "license_key": m["key"], "symbol": "XAUUSD",
        }, timeout=20)
        assert d.status_code == 200, d.text
        assert d.json()["ok"] is True

        act = requests.post(f"{API}/mobile/activate-license",
                            json={"email": m["email"], "license_key": m["key"]}, timeout=20)
        cfgs = act.json()["pair_configs"]
        assert not any(c["symbol"] == "XAUUSD" for c in cfgs), "XAUUSD should be deleted"
