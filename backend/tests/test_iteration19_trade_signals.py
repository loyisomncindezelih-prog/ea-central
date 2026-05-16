"""Iteration 19 — POST /api/mobile/trade-signals (last 3 signals + EA status panel).

Covers:
- happy path returns array (<=3) sorted DESC by created_at
- 404 on unknown licence
- 403 on email mismatch
- response shape (id/symbol/action/lot/status/created_at/ack_at/mt_order_id/error/trading_style)
- ack_at + error from result map correctly
"""

import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

def _read_frontend_env(key):
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"')
    raise KeyError(key)

BASE = os.environ.get("REACT_APP_BACKEND_URL", _read_frontend_env("REACT_APP_BACKEND_URL")).rstrip("/")
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "ea_central"

LICENSE_KEY = "EAC-2F9D-E69F-6F75-CEB3"
MENTOR_EMAIL = "test_it6_ui_1778753851@test.com"
EA_ID = "0694ce52-d108-491d-9f91-0eaa6276bd1e"


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module", autouse=True)
def seed_signals(mongo):
    # Ensure clean state, then insert 3 with distinct created_at + status
    mongo.trade_signals.delete_many({"license_key": LICENSE_KEY})
    now = datetime.now(timezone.utc)
    docs = [
        {
            "id": str(uuid.uuid4()),
            "license_key": LICENSE_KEY,
            "ea_id": EA_ID,
            "symbol": "EURUSD",
            "action": "BUY",
            "lot": 0.10,
            "status": "executed",
            "created_at": (now - timedelta(seconds=30)).isoformat(),
            "ack_at": (now - timedelta(seconds=25)).isoformat(),
            "result": {"mt_order_id": "12345", "error": None},
            "trading_style": "day_trading",
        },
        {
            "id": str(uuid.uuid4()),
            "license_key": LICENSE_KEY,
            "ea_id": EA_ID,
            "symbol": "XAUUSD",
            "action": "SELL",
            "lot": 0.20,
            "status": "failed",
            "created_at": (now - timedelta(seconds=20)).isoformat(),
            "ack_at": (now - timedelta(seconds=15)).isoformat(),
            "result": {"mt_order_id": None, "error": "no liquidity"},
            "trading_style": "scalping",
        },
        {
            "id": str(uuid.uuid4()),
            "license_key": LICENSE_KEY,
            "ea_id": EA_ID,
            "symbol": "GBPJPY",
            "action": "CLOSE",
            "lot": 0.15,
            "status": "pending",
            "created_at": (now - timedelta(seconds=10)).isoformat(),
            "ack_at": None,
            "result": None,
            "trading_style": "day_trading",
        },
    ]
    mongo.trade_signals.insert_many(docs)
    yield docs
    mongo.trade_signals.delete_many({"license_key": LICENSE_KEY})


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_happy_path_returns_three_sorted_desc(client, seed_signals):
    r = client.post(
        f"{BASE}/api/mobile/trade-signals",
        json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "signals" in data
    sigs = data["signals"]
    assert len(sigs) == 3

    # Sorted DESC by created_at => first is the most recent (pending CLOSE)
    times = [s["created_at"] for s in sigs]
    assert times == sorted(times, reverse=True), f"not sorted desc: {times}"

    # First record (most recent) is the pending CLOSE
    assert sigs[0]["action"] == "CLOSE"
    assert sigs[0]["status"] == "pending"
    assert sigs[0]["mt_order_id"] is None
    assert sigs[0]["error"] is None

    # Second is the failed SELL
    assert sigs[1]["action"] == "SELL"
    assert sigs[1]["status"] == "failed"
    assert sigs[1]["error"] == "no liquidity"

    # Third is the executed BUY
    assert sigs[2]["action"] == "BUY"
    assert sigs[2]["status"] == "executed"
    assert sigs[2]["mt_order_id"] == "12345"


def test_response_shape(client, seed_signals):
    r = client.post(
        f"{BASE}/api/mobile/trade-signals",
        json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY},
    )
    sigs = r.json()["signals"]
    s = sigs[0]
    for key in ["id", "symbol", "action", "lot", "status", "created_at",
                "ack_at", "mt_order_id", "error", "trading_style"]:
        assert key in s, f"missing key '{key}'"
    assert isinstance(s["lot"], (int, float))
    assert isinstance(s["id"], str)


def test_unknown_licence_returns_404(client):
    r = client.post(
        f"{BASE}/api/mobile/trade-signals",
        json={"email": MENTOR_EMAIL, "license_key": "EAC-XXXX-XXXX-XXXX-XXXX"},
    )
    assert r.status_code == 404


def test_email_mismatch_returns_403_when_bound(client, mongo):
    # Bind the licence to mentor email so mismatch -> 403
    mongo.license_keys.update_one(
        {"key": LICENSE_KEY},
        {"$set": {"bound_to_email": MENTOR_EMAIL}},
    )
    try:
        r = client.post(
            f"{BASE}/api/mobile/trade-signals",
            json={"email": "wrong@example.com", "license_key": LICENSE_KEY},
        )
        assert r.status_code == 403, r.text
    finally:
        # restore unbound state per next-iteration contract
        mongo.license_keys.update_one(
            {"key": LICENSE_KEY},
            {"$set": {"bound_to_email": None, "bound_device_id": None}},
        )


def test_caps_at_three_with_many_signals(client, mongo):
    # Insert 5 extra ones — endpoint must still return only 3
    extra_ids = []
    now = datetime.now(timezone.utc)
    for i in range(5):
        doc_id = str(uuid.uuid4())
        extra_ids.append(doc_id)
        mongo.trade_signals.insert_one({
            "id": doc_id,
            "license_key": LICENSE_KEY,
            "ea_id": EA_ID,
            "symbol": "EURUSD",
            "action": "BUY",
            "lot": 0.01,
            "status": "executed",
            "created_at": (now + timedelta(seconds=i)).isoformat(),
            "ack_at": (now + timedelta(seconds=i)).isoformat(),
            "result": {"mt_order_id": f"99{i}", "error": None},
            "trading_style": "day_trading",
        })
    try:
        r = client.post(
            f"{BASE}/api/mobile/trade-signals",
            json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY},
        )
        assert r.status_code == 200
        assert len(r.json()["signals"]) == 3
    finally:
        mongo.trade_signals.delete_many({"id": {"$in": extra_ids}})
