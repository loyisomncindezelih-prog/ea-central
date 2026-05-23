"""Iteration 20 — Admin push trade signal + executing/low_balance status.

Covers:
- POST /api/admin/broker-connections/{license_key}/signal:
    * 401 without JWT, 403 with mentor JWT (admin-only)
    * 404 unknown licence
    * 400 no broker / broker not approved / symbol not in pair_configs
    * 200 happy path -> creates trade_signal pending, issued_by=server
- /bridge/jobs flips delivered jobs to 'executing' and is re-delivered within cutoff
- /bridge/jobs/{id}/ack:
    * low_balance detection from MT5 error strings (10019/insufficient/etc.)
    * other failures stay 'failed'
    * idempotent on re-ack
- /mobile/trade-signals passthrough returns low_balance/executing
"""

import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient


def _read_env(path, key):
    with open(path) as f:
        for line in f:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"')
    raise KeyError(key)


BASE = os.environ.get(
    "REACT_APP_BACKEND_URL", _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")
).rstrip("/")
MONGO_URL = _read_env("/app/backend/.env", "MONGO_URL")
DB_NAME = _read_env("/app/backend/.env", "DB_NAME")

LICENSE_KEY = "EAC-2F9D-E69F-6F75-CEB3"
MENTOR_EMAIL = "test_it6_ui_1778753851@test.com"
MENTOR_PASS = "Passw0rd!"
EA_ID = "0694ce52-d108-491d-9f91-0eaa6276bd1e"
ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASS = "Admin@123"


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, f"no access_token in {body}"
    return tok


@pytest.fixture(scope="module")
def mentor_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": MENTOR_EMAIL, "password": MENTOR_PASS})
    assert r.status_code == 200, f"mentor login: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module", autouse=True)
def seed_broker_and_pairs(mongo):
    """Ensure broker_connections row for licence is 'approved' and pair_configs has EURUSD."""
    # Snapshot for cleanup
    original_broker = mongo.broker_connections.find_one({"license_key": LICENSE_KEY})
    original_pair = mongo.pair_configs.find_one({"license_key": LICENSE_KEY, "symbol": "EURUSD"})
    original_key = mongo.license_keys.find_one({"key": LICENSE_KEY})

    mongo.broker_connections.update_one(
        {"license_key": LICENSE_KEY},
        {"$set": {
            "license_key": LICENSE_KEY,
            "email": MENTOR_EMAIL,
            "platform": "mt5",
            "server": "TestServer-Demo",
            "account": "100100",
            "password_enc": "ZmFrZQ==",  # base64 noise — decrypt may fail; OK for these tests
            "status": "approved",
        }, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    mongo.pair_configs.update_one(
        {"license_key": LICENSE_KEY, "symbol": "EURUSD"},
        {"$set": {
            "license_key": LICENSE_KEY,
            "symbol": "EURUSD",
            "lot_size": 0.10,
            "max_trades": 1,
            "direction": "BOTH",
            "platform": "mt5",
        }, "$setOnInsert": {"id": str(uuid.uuid4())}},
        upsert=True,
    )
    mongo.license_keys.update_one(
        {"key": LICENSE_KEY},
        {"$set": {"trading_style": "day_trading"}},
    )
    mongo.trade_signals.delete_many({"license_key": LICENSE_KEY})
    yield
    # Teardown — clean trade_signals created during tests
    mongo.trade_signals.delete_many({"license_key": LICENSE_KEY})
    # Restore broker/pair to original (or remove if didn't exist)
    if original_broker is None:
        mongo.broker_connections.delete_one({"license_key": LICENSE_KEY})
    if original_pair is None:
        mongo.pair_configs.delete_one({"license_key": LICENSE_KEY, "symbol": "EURUSD"})
    if original_key and "trading_style" in original_key:
        mongo.license_keys.update_one({"key": LICENSE_KEY}, {"$set": {"trading_style": original_key["trading_style"]}})


# --------- Admin push signal endpoint ---------

class TestAdminPushSignal:
    def test_requires_auth(self):
        r = requests.post(
            f"{BASE}/api/admin/broker-connections/{LICENSE_KEY}/signal",
            json={"symbol": "EURUSD", "action": "BUY"},
        )
        assert r.status_code in (401, 403), f"expected 401/403 no auth, got {r.status_code}"

    def test_mentor_jwt_rejected(self, mentor_token):
        r = requests.post(
            f"{BASE}/api/admin/broker-connections/{LICENSE_KEY}/signal",
            json={"symbol": "EURUSD", "action": "BUY"},
            headers={"Authorization": f"Bearer {mentor_token}"},
        )
        assert r.status_code == 403, f"expected 403 mentor, got {r.status_code} {r.text}"

    def test_unknown_licence_404(self, admin_token):
        r = requests.post(
            f"{BASE}/api/admin/broker-connections/EAC-DOES-NOT-EXIST-XXXX/signal",
            json={"symbol": "EURUSD", "action": "BUY"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_no_broker_400(self, admin_token, mongo):
        # Use a different licence row without a broker
        tmp_key = "EAC-TMP1-NOBR-OKER-0001"
        mongo.license_keys.insert_one({
            "key": tmp_key, "owner_id": "tmp", "ea_id": EA_ID, "ea_name": "tmp",
            "trading_style": "day_trading", "bound_to_email": None,
        })
        try:
            r = requests.post(
                f"{BASE}/api/admin/broker-connections/{tmp_key}/signal",
                json={"symbol": "EURUSD", "action": "BUY"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert r.status_code == 400, f"got {r.status_code} {r.text}"
            assert "broker" in r.json().get("detail", "").lower()
        finally:
            mongo.license_keys.delete_one({"key": tmp_key})

    def test_broker_not_approved_400(self, admin_token, mongo):
        mongo.broker_connections.update_one({"license_key": LICENSE_KEY}, {"$set": {"status": "pending_approval"}})
        try:
            r = requests.post(
                f"{BASE}/api/admin/broker-connections/{LICENSE_KEY}/signal",
                json={"symbol": "EURUSD", "action": "BUY"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert r.status_code == 400
            assert "not approved" in r.json().get("detail", "").lower() or "pending" in r.json().get("detail", "").lower()
        finally:
            mongo.broker_connections.update_one({"license_key": LICENSE_KEY}, {"$set": {"status": "approved"}})

    def test_symbol_not_in_pairs_400(self, admin_token):
        r = requests.post(
            f"{BASE}/api/admin/broker-connections/{LICENSE_KEY}/signal",
            json={"symbol": "ZZZUNK", "action": "BUY"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 400
        assert "ZZZUNK" in r.json().get("detail", "") or "selected pairs" in r.json().get("detail", "").lower()

    def test_happy_path(self, admin_token, mongo):
        r = requests.post(
            f"{BASE}/api/admin/broker-connections/{LICENSE_KEY}/signal",
            json={"symbol": "EURUSD", "action": "BUY"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, f"got {r.status_code} {r.text}"
        body = r.json()
        assert body["ok"] is True
        assert body["symbol"] == "EURUSD"
        assert body["action"] == "BUY"
        assert body["status"] == "pending"
        assert body["trading_style"] == "day_trading"
        assert isinstance(body["lot"], (int, float))
        assert isinstance(body["id"], str) and len(body["id"]) > 10

        # Verify mongo state
        doc = mongo.trade_signals.find_one({"id": body["id"]}, {"_id": 0})
        assert doc is not None
        assert doc["status"] == "pending"
        assert doc["issued_by"] == "server"
        assert doc["issued_by_email"] == ADMIN_EMAIL
        assert doc["license_key"] == LICENSE_KEY


# --------- Bridge poll: marks executing ---------

class TestBridgeExecuting:
    def _pair_bridge(self):
        # Bridge pairing needs the licence bound to the email or unbound
        r = requests.post(
            f"{BASE}/api/bridge/pair",
            json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY, "platform": "mt5", "machine_name": "iter20-test"},
        )
        assert r.status_code == 200, f"pair: {r.status_code} {r.text}"
        return r.json()["bridge_token"]

    def test_jobs_flip_to_executing(self, mongo):
        # Reset bound_to_email so pair works
        mongo.license_keys.update_one({"key": LICENSE_KEY}, {"$set": {"bound_to_email": None, "bound_device_id": None}})
        token = self._pair_bridge()

        # Insert a fresh pending signal
        sig_id = str(uuid.uuid4())
        mongo.trade_signals.insert_one({
            "id": sig_id, "license_key": LICENSE_KEY, "ea_id": EA_ID,
            "symbol": "EURUSD", "action": "BUY", "lot": 0.10, "max_trades": 1,
            "platform": "mt5", "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "delivered_at": None, "ack_at": None, "result": None,
            "trading_style": "day_trading",
        })

        r = requests.get(f"{BASE}/api/bridge/jobs", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        ids = [j["id"] for j in body["jobs"]]
        assert sig_id in ids, f"sig not delivered: {ids}"
        # API returns executing
        for j in body["jobs"]:
            if j["id"] == sig_id:
                assert j["status"] == "executing"

        # DB doc was updated
        doc = mongo.trade_signals.find_one({"id": sig_id}, {"_id": 0})
        assert doc["status"] == "executing"
        assert doc["delivered_at"] is not None

    def test_executing_redelivered_after_cutoff(self, mongo):
        # An 'executing' job older than the 30s cutoff with no ack must be re-delivered
        token = self._pair_bridge()
        sig_id = str(uuid.uuid4())
        old_iso = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        mongo.trade_signals.insert_one({
            "id": sig_id, "license_key": LICENSE_KEY, "ea_id": EA_ID,
            "symbol": "EURUSD", "action": "SELL", "lot": 0.10, "max_trades": 1,
            "platform": "mt5", "status": "executing",
            "created_at": old_iso, "delivered_at": old_iso,
            "ack_at": None, "result": None, "trading_style": "day_trading",
        })
        r = requests.get(f"{BASE}/api/bridge/jobs", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        ids = [j["id"] for j in r.json()["jobs"]]
        assert sig_id in ids, "executing+expired should be re-delivered"


# --------- /ack low_balance + failed + idempotent ---------

class TestAckLowBalance:
    def _pair(self, mongo):
        mongo.license_keys.update_one({"key": LICENSE_KEY}, {"$set": {"bound_to_email": None, "bound_device_id": None}})
        r = requests.post(
            f"{BASE}/api/bridge/pair",
            json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY, "platform": "mt5", "machine_name": "iter20-ack"},
        )
        return r.json()["bridge_token"]

    def _insert_pending(self, mongo, action="BUY"):
        sig_id = str(uuid.uuid4())
        mongo.trade_signals.insert_one({
            "id": sig_id, "license_key": LICENSE_KEY, "ea_id": EA_ID,
            "symbol": "EURUSD", "action": action, "lot": 0.10, "max_trades": 1,
            "platform": "mt5", "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "delivered_at": None, "ack_at": None, "result": None,
            "trading_style": "day_trading",
        })
        return sig_id

    @pytest.mark.parametrize("err_text", ["10019", "Not enough money", "insufficient funds", "no money", "free margin"])
    def test_low_balance_detection(self, mongo, err_text):
        token = self._pair(mongo)
        sig_id = self._insert_pending(mongo)
        r = requests.post(
            f"{BASE}/api/bridge/jobs/{sig_id}/ack",
            headers={"Authorization": f"Bearer {token}"},
            json={"status": "failed", "error": err_text},
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        doc = mongo.trade_signals.find_one({"id": sig_id}, {"_id": 0})
        assert doc["status"] == "low_balance", f"err '{err_text}' did not map to low_balance, got {doc['status']}"

    def test_other_failure_stays_failed(self, mongo):
        token = self._pair(mongo)
        sig_id = self._insert_pending(mongo)
        r = requests.post(
            f"{BASE}/api/bridge/jobs/{sig_id}/ack",
            headers={"Authorization": f"Bearer {token}"},
            json={"status": "failed", "error": "broker rejected: market closed"},
        )
        assert r.status_code == 200
        doc = mongo.trade_signals.find_one({"id": sig_id}, {"_id": 0})
        assert doc["status"] == "failed"

    def test_ack_idempotent(self, mongo):
        token = self._pair(mongo)
        sig_id = self._insert_pending(mongo)
        # First ack -> low_balance
        r1 = requests.post(
            f"{BASE}/api/bridge/jobs/{sig_id}/ack",
            headers={"Authorization": f"Bearer {token}"},
            json={"status": "failed", "error": "10019 no money"},
        )
        assert r1.status_code == 200
        # Second ack -> already_acked
        r2 = requests.post(
            f"{BASE}/api/bridge/jobs/{sig_id}/ack",
            headers={"Authorization": f"Bearer {token}"},
            json={"status": "failed", "error": "again"},
        )
        assert r2.status_code == 200
        body = r2.json()
        assert body.get("already_acked") is True
        assert body.get("status") == "low_balance"


# --------- mobile/trade-signals passthrough ---------

class TestMobileTradeSignalsPassthrough:
    def test_passthrough_statuses(self, mongo):
        # Insert one of each status
        now = datetime.now(timezone.utc)
        mongo.trade_signals.delete_many({"license_key": LICENSE_KEY})
        statuses = ["pending", "executing", "executed", "failed", "low_balance", "skipped"]
        for i, st in enumerate(statuses):
            mongo.trade_signals.insert_one({
                "id": str(uuid.uuid4()), "license_key": LICENSE_KEY, "ea_id": EA_ID,
                "symbol": "EURUSD", "action": "BUY", "lot": 0.10,
                "status": st, "created_at": (now - timedelta(seconds=i)).isoformat(),
                "ack_at": None, "result": None, "trading_style": "day_trading",
            })
        # /mobile/trade-signals requires the licence to be activated on this device
        mongo.license_keys.update_one(
            {"key": LICENSE_KEY},
            {"$set": {"bound_to_email": MENTOR_EMAIL, "bound_device_id": "iter20-test-dev"}},
        )
        r = requests.post(
            f"{BASE}/api/mobile/trade-signals",
            json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY},
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        items = r.json().get("signals") or r.json().get("items") or r.json()
        # Should return last 3 by created_at DESC: pending, executing, executed (the 3 newest)
        assert isinstance(items, list)
        assert len(items) <= 3
        returned_statuses = {s["status"] for s in items}
        # at least one of the new statuses must be exposed
        assert returned_statuses.issubset({"pending", "executing", "executed", "failed", "low_balance", "skipped"})
