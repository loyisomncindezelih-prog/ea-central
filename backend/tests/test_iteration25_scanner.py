"""Iteration 25 — Scanner + EA terminal 5-min filter + admin instant signal.

Covers:
- POST /api/mobile/trade-signals: 5-minute rolling filter (older signals not returned).
- POST /api/admin/broker-connections/{license_key}/signal/instant:
    * Auth guards (no JWT, mentor JWT)
    * 404 unknown licence
    * Happy path (executed, closed) creates trade_signal with final status, no bridge queue.
- POST /api/mobile/scanner/execute-request:
    * 403 wrong licence binding, 404 unknown scan, 403 not your scan
    * Happy path sets execution_status=verifying and execution_requested_at
    * Idempotent on repeat
- POST /api/mobile/scanner/purchase: creates scan_purchases doc with status=pending
- GET /api/admin/scan-purchases: admin only, sorted DESC
- POST /api/admin/scan-purchases/{id}/approve:
    * unlimited -> users.scans_plan="unlimited"
    * 100 -> users.scans_balance += 100
- POST /api/admin/scan-purchases/{id}/decline: status='declined' with reason
- GET /api/admin/scans returns execution_requested_at + execution_status fields
- Regression: scanner/balance, admin scan-topup, admin existing queued signal endpoint.
- Scanner upload happy path tested with a real chart-like image.
"""

import base64
import io
import os
import random
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
ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASS = "Admin@123"
EA_ID = "0694ce52-d108-491d-9f91-0eaa6276bd1e"


# ------------------- fixtures -------------------

@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def mentor_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": MENTOR_EMAIL, "password": MENTOR_PASS})
    assert r.status_code == 200, f"mentor login: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module", autouse=True)
def bind_and_seed(mongo):
    """Bind licence to mentor email + ensure approved broker + pair_configs."""
    original_key = mongo.license_keys.find_one({"key": LICENSE_KEY})
    original_broker = mongo.broker_connections.find_one({"license_key": LICENSE_KEY})
    original_pair = mongo.pair_configs.find_one({"license_key": LICENSE_KEY, "symbol": "EURUSD"})
    original_user = mongo.users.find_one({"email": MENTOR_EMAIL}, {"_id": 0, "scans_balance": 1, "scans_plan": 1})

    mongo.license_keys.update_one(
        {"key": LICENSE_KEY},
        {"$set": {"bound_to_email": MENTOR_EMAIL, "bound_device_id": "iter25-test-dev",
                  "trading_style": "day_trading"}},
    )
    mongo.broker_connections.update_one(
        {"license_key": LICENSE_KEY},
        {"$set": {
            "license_key": LICENSE_KEY, "email": MENTOR_EMAIL, "platform": "mt5",
            "server": "TestServer-Demo", "account": "100100", "password_enc": "ZmFrZQ==",
            "status": "approved",
        }, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    mongo.pair_configs.update_one(
        {"license_key": LICENSE_KEY, "symbol": "EURUSD"},
        {"$set": {"license_key": LICENSE_KEY, "symbol": "EURUSD", "lot_size": 0.10,
                  "max_trades": 1, "direction": "BOTH", "platform": "mt5"},
         "$setOnInsert": {"id": str(uuid.uuid4())}},
        upsert=True,
    )
    # Ensure user has predictable scans state
    mongo.users.update_one(
        {"email": MENTOR_EMAIL},
        {"$set": {"scans_balance": 5}, "$unset": {"scans_plan": ""}},
    )
    mongo.trade_signals.delete_many({"license_key": LICENSE_KEY})
    mongo.scans.delete_many({"email": MENTOR_EMAIL})
    mongo.scan_purchases.delete_many({"email": MENTOR_EMAIL})

    yield

    # Teardown
    mongo.trade_signals.delete_many({"license_key": LICENSE_KEY})
    mongo.scans.delete_many({"email": MENTOR_EMAIL})
    mongo.scan_purchases.delete_many({"email": MENTOR_EMAIL})
    if original_broker is None:
        mongo.broker_connections.delete_one({"license_key": LICENSE_KEY})
    if original_pair is None:
        mongo.pair_configs.delete_one({"license_key": LICENSE_KEY, "symbol": "EURUSD"})
    # Restore user scans state
    restore = {}
    unset = {}
    if original_user is not None:
        if "scans_balance" in original_user:
            restore["scans_balance"] = original_user["scans_balance"]
        else:
            unset["scans_balance"] = ""
        if "scans_plan" in original_user:
            restore["scans_plan"] = original_user["scans_plan"]
        else:
            unset["scans_plan"] = ""
        update_op = {}
        if restore:
            update_op["$set"] = restore
        if unset:
            update_op["$unset"] = unset
        if update_op:
            mongo.users.update_one({"email": MENTOR_EMAIL}, update_op)
    # Leave the licence bound for next iteration (matches prev iteration's seed behaviour)
    mongo.license_keys.update_one(
        {"key": LICENSE_KEY},
        {"$set": {"bound_to_email": None, "bound_device_id": None}},
    )


# ------------------- 1. 5-minute rolling filter -------------------

class TestTradeSignals5MinFilter:
    def test_old_signals_filtered_out(self, mongo):
        now = datetime.now(timezone.utc)
        old_id = str(uuid.uuid4())
        fresh_id = str(uuid.uuid4())
        # 10 minutes ago — must NOT be returned
        mongo.trade_signals.insert_one({
            "id": old_id, "license_key": LICENSE_KEY, "ea_id": EA_ID,
            "symbol": "EURUSD", "action": "BUY", "lot": 0.10, "status": "executed",
            "created_at": (now - timedelta(minutes=10)).isoformat(),
            "ack_at": None, "result": None, "trading_style": "day_trading",
        })
        # 30 seconds ago — must be returned
        mongo.trade_signals.insert_one({
            "id": fresh_id, "license_key": LICENSE_KEY, "ea_id": EA_ID,
            "symbol": "EURUSD", "action": "SELL", "lot": 0.10, "status": "pending",
            "created_at": (now - timedelta(seconds=30)).isoformat(),
            "ack_at": None, "result": None, "trading_style": "day_trading",
        })
        r = requests.post(f"{BASE}/api/mobile/trade-signals",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY})
        assert r.status_code == 200, r.text
        ids = [s["id"] for s in r.json()["signals"]]
        assert fresh_id in ids, f"fresh signal missing: {ids}"
        assert old_id not in ids, f"old (>5min) signal leaked: {ids}"


# ------------------- 2. Admin INSTANT-status push (no bridge queue) -------------------

class TestAdminInstantSignal:
    URL_TPL = "/api/admin/broker-connections/{}/signal/instant"

    def test_no_auth_rejected(self):
        r = requests.post(
            f"{BASE}{self.URL_TPL.format(LICENSE_KEY)}",
            json={"symbol": "EURUSD", "action": "BUY", "final_status": "executed"},
        )
        assert r.status_code in (401, 403)

    def test_mentor_jwt_rejected(self, mentor_token):
        r = requests.post(
            f"{BASE}{self.URL_TPL.format(LICENSE_KEY)}",
            json={"symbol": "EURUSD", "action": "BUY", "final_status": "executed"},
            headers={"Authorization": f"Bearer {mentor_token}"},
        )
        assert r.status_code == 403

    def test_unknown_licence_404(self, admin_token):
        r = requests.post(
            f"{BASE}{self.URL_TPL.format('EAC-NO-SUCH-XXXX-XXXX')}",
            json={"symbol": "EURUSD", "action": "BUY", "final_status": "executed"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404

    def test_instant_executed_creates_signal(self, admin_token, mongo):
        r = requests.post(
            f"{BASE}{self.URL_TPL.format(LICENSE_KEY)}",
            json={"symbol": "EURUSD", "action": "BUY", "final_status": "executed",
                  "lot": 0.10, "mt_order_id": "MT-INSTANT-1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["status"] == "executed"
        assert isinstance(body["id"], str) and len(body["id"]) > 10

        doc = mongo.trade_signals.find_one({"id": body["id"]}, {"_id": 0})
        assert doc is not None
        # Bypass bridge queue: status set directly, not pending
        assert doc["status"] == "executed"
        assert doc["issued_by"] == "server"
        assert doc["issued_by_email"] == ADMIN_EMAIL
        assert doc.get("instant") is True
        assert doc["platform"] == "manual"
        # delivered/ack_at already set so bridge poll skips this entirely
        assert doc.get("delivered_at") is not None
        assert doc.get("ack_at") is not None
        assert (doc.get("result") or {}).get("mt_order_id") == "MT-INSTANT-1"

    def test_instant_closed_creates_signal(self, admin_token, mongo):
        r = requests.post(
            f"{BASE}{self.URL_TPL.format(LICENSE_KEY)}",
            json={"symbol": "EURUSD", "action": "CLOSE", "final_status": "closed",
                  "note": "tp hit"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        doc = mongo.trade_signals.find_one({"id": r.json()["id"]}, {"_id": 0})
        assert doc["status"] == "closed"
        assert doc["action"] == "CLOSE"
        assert doc["result"]["note"] == "tp hit"


# ------------------- 3. Scanner execute-request -------------------

def _insert_scan(mongo, email=MENTOR_EMAIL, direction="BUY"):
    sid = str(uuid.uuid4())
    mongo.scans.insert_one({
        "id": sid, "license_key": LICENSE_KEY, "email": email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "direction": direction, "confidence": 78,
        "symbol": "EURUSD", "timeframe": "h1",
        "reasoning": "test", "executed_at": None,
    })
    return sid


class TestScannerExecuteRequest:
    def test_wrong_email_rejected(self, mongo):
        sid = _insert_scan(mongo)
        r = requests.post(f"{BASE}/api/mobile/scanner/execute-request",
                          json={"email": "stranger@example.com", "license_key": LICENSE_KEY, "scan_id": sid})
        assert r.status_code == 403

    def test_unknown_scan_404(self):
        r = requests.post(f"{BASE}/api/mobile/scanner/execute-request",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
                                "scan_id": str(uuid.uuid4())})
        assert r.status_code == 404

    def test_not_my_scan_403(self, mongo):
        sid = _insert_scan(mongo, email="someone-else@x.com")
        r = requests.post(f"{BASE}/api/mobile/scanner/execute-request",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY, "scan_id": sid})
        assert r.status_code == 403
        mongo.scans.delete_one({"id": sid})

    def test_neutral_scan_rejected(self, mongo):
        sid = _insert_scan(mongo, direction="NEUTRAL")
        r = requests.post(f"{BASE}/api/mobile/scanner/execute-request",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY, "scan_id": sid})
        assert r.status_code == 400

    def test_happy_path_sets_verifying(self, mongo):
        sid = _insert_scan(mongo)
        r = requests.post(f"{BASE}/api/mobile/scanner/execute-request",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY, "scan_id": sid})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["status"] == "verifying"
        doc = mongo.scans.find_one({"id": sid}, {"_id": 0})
        assert doc["execution_status"] == "verifying"
        assert doc["execution_requested_at"] is not None

        # Idempotent
        r2 = requests.post(f"{BASE}/api/mobile/scanner/execute-request",
                           json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY, "scan_id": sid})
        assert r2.status_code == 200
        assert r2.json().get("already_requested") is True


# ------------------- 4. Scanner purchase + admin approval/decline -------------------

TINY_PROOF = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"a" * 64).decode()


class TestScannerPurchaseAndAdminFlow:
    def test_purchase_creates_pending(self, mongo):
        r = requests.post(f"{BASE}/api/mobile/scanner/purchase",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
                                "plan": "100", "proof_data_url": TINY_PROOF})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["status"] == "pending"
        pid = body["id"]
        doc = mongo.scan_purchases.find_one({"id": pid}, {"_id": 0})
        assert doc["status"] == "pending"
        assert doc["plan"] == "100"
        assert doc["scans"] == 100
        assert doc["price_zar"] == 350
        assert doc["email"] == MENTOR_EMAIL

    def test_admin_list_purchases(self, admin_token, mongo):
        # ensure one exists
        mongo.scan_purchases.insert_one({
            "id": str(uuid.uuid4()), "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
            "plan": "unlimited", "plan_label": "Unlimited Scans", "price_zar": 730,
            "scans": -1, "proof_data_url": TINY_PROOF, "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "approved_at": None, "approved_by": None, "decline_reason": None,
        })
        r = requests.get(f"{BASE}/api/admin/scan-purchases",
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        rows = r.json()["purchases"]
        assert isinstance(rows, list)
        assert len(rows) >= 1
        # sorted DESC
        if len(rows) >= 2:
            assert rows[0]["created_at"] >= rows[1]["created_at"]
        # no mongo _id leaking
        assert "_id" not in rows[0]

    def test_admin_list_requires_admin(self, mentor_token):
        r = requests.get(f"{BASE}/api/admin/scan-purchases",
                         headers={"Authorization": f"Bearer {mentor_token}"})
        assert r.status_code == 403

    def test_approve_100_pack_increments_balance(self, admin_token, mongo):
        before = mongo.users.find_one({"email": MENTOR_EMAIL}, {"_id": 0, "scans_balance": 1})
        before_bal = int(before.get("scans_balance") or 0)
        pid = str(uuid.uuid4())
        mongo.scan_purchases.insert_one({
            "id": pid, "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
            "plan": "100", "plan_label": "100 Scans", "price_zar": 350, "scans": 100,
            "proof_data_url": TINY_PROOF, "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "approved_at": None, "approved_by": None, "decline_reason": None,
        })
        r = requests.post(f"{BASE}/api/admin/scan-purchases/{pid}/approve",
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # Balance bumped by 100
        after = mongo.users.find_one({"email": MENTOR_EMAIL}, {"_id": 0, "scans_balance": 1})
        assert int(after["scans_balance"]) == before_bal + 100
        # Purchase marked approved
        doc = mongo.scan_purchases.find_one({"id": pid}, {"_id": 0})
        assert doc["status"] == "approved"
        assert doc["approved_by"] == ADMIN_EMAIL
        # Can't re-approve
        r2 = requests.post(f"{BASE}/api/admin/scan-purchases/{pid}/approve",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert r2.status_code == 400

    def test_approve_unlimited_sets_plan(self, admin_token, mongo):
        pid = str(uuid.uuid4())
        mongo.scan_purchases.insert_one({
            "id": pid, "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
            "plan": "unlimited", "plan_label": "Unlimited Scans", "price_zar": 730, "scans": -1,
            "proof_data_url": TINY_PROOF, "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "approved_at": None, "approved_by": None, "decline_reason": None,
        })
        r = requests.post(f"{BASE}/api/admin/scan-purchases/{pid}/approve",
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        user = mongo.users.find_one({"email": MENTOR_EMAIL}, {"_id": 0, "scans_plan": 1})
        assert user["scans_plan"] == "unlimited"
        # Reset user back so subsequent tests have predictable state
        mongo.users.update_one({"email": MENTOR_EMAIL},
                               {"$unset": {"scans_plan": ""}})

    def test_decline_records_reason(self, admin_token, mongo):
        pid = str(uuid.uuid4())
        mongo.scan_purchases.insert_one({
            "id": pid, "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
            "plan": "100", "plan_label": "100 Scans", "price_zar": 350, "scans": 100,
            "proof_data_url": TINY_PROOF, "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "approved_at": None, "approved_by": None, "decline_reason": None,
        })
        r = requests.post(f"{BASE}/api/admin/scan-purchases/{pid}/decline",
                         headers={"Authorization": f"Bearer {admin_token}"},
                         json={"reason": "Proof unreadable"})
        assert r.status_code == 200
        doc = mongo.scan_purchases.find_one({"id": pid}, {"_id": 0})
        assert doc["status"] == "declined"
        assert doc["decline_reason"] == "Proof unreadable"

    def test_decline_requires_admin(self, mentor_token, mongo):
        pid = str(uuid.uuid4())
        mongo.scan_purchases.insert_one({
            "id": pid, "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
            "plan": "100", "plan_label": "100 Scans", "price_zar": 350, "scans": 100,
            "proof_data_url": TINY_PROOF, "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "approved_at": None, "approved_by": None, "decline_reason": None,
        })
        r = requests.post(f"{BASE}/api/admin/scan-purchases/{pid}/decline",
                         headers={"Authorization": f"Bearer {mentor_token}"},
                         json={"reason": "x"})
        assert r.status_code == 403
        mongo.scan_purchases.delete_one({"id": pid})


# ------------------- 5. /admin/scans returns execution fields -------------------

class TestAdminScansFields:
    def test_includes_execution_fields(self, admin_token, mongo):
        sid = str(uuid.uuid4())
        mongo.scans.insert_one({
            "id": sid, "license_key": LICENSE_KEY, "email": MENTOR_EMAIL,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "direction": "BUY", "confidence": 81, "symbol": "EURUSD",
            "execution_status": "verifying",
            "execution_requested_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{BASE}/api/admin/scans?limit=20",
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        rows = r.json()["scans"]
        match = next((s for s in rows if s["id"] == sid), None)
        assert match is not None, "newly inserted scan missing from admin list"
        assert match["execution_status"] == "verifying"
        assert match["execution_requested_at"] is not None
        # No _id leakage
        assert "_id" not in match


# ------------------- 6. scanner/balance regression -------------------

class TestScannerBalance:
    def test_balance_returns_shape(self):
        r = requests.post(f"{BASE}/api/mobile/scanner/balance",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
                                "style": "day_trading"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "scans_balance" in body
        assert "scans_plan" in body
        assert "plans" in body
        assert isinstance(body["plans"], list)


# ------------------- 7. Admin scan-topup regression -------------------

class TestAdminScanTopup:
    def test_100_topup(self, admin_token, mongo):
        before = mongo.users.find_one({"email": MENTOR_EMAIL}, {"_id": 0, "scans_balance": 1})
        bal0 = int(before.get("scans_balance") or 0)
        r = requests.post(f"{BASE}/api/admin/users/{MENTOR_EMAIL}/scan-topup",
                          json={"plan": "100"},
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["added"] == 100
        assert int(body["scans_balance"]) == bal0 + 100

    def test_custom_topup(self, admin_token, mongo):
        before = mongo.users.find_one({"email": MENTOR_EMAIL}, {"_id": 0, "scans_balance": 1})
        bal0 = int(before.get("scans_balance") or 0)
        r = requests.post(f"{BASE}/api/admin/users/{MENTOR_EMAIL}/scan-topup",
                          json={"plan": "custom", "custom_scans": 42},
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json()["added"] == 42


# ------------------- 8. Existing queued push endpoint still works -------------------

class TestQueuedSignalRegression:
    def test_queued_signal_remains_pending(self, admin_token, mongo):
        r = requests.post(
            f"{BASE}/api/admin/broker-connections/{LICENSE_KEY}/signal",
            json={"symbol": "EURUSD", "action": "BUY"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        doc = mongo.trade_signals.find_one({"id": body["id"]}, {"_id": 0})
        assert doc["status"] == "pending"
        assert doc["issued_by"] == "server"
        assert doc.get("instant") is not True  # this path does NOT set the instant flag


# ------------------- 9. Scanner upload (vision) -------------------

def _build_chart_image_data_url():
    """Build a small candle-chart-like PNG with real visual features (varied pixels,
    edges, candles) so the LLM vision model accepts it as a chart screenshot."""
    try:
        from PIL import Image, ImageDraw
    except Exception:
        pytest.skip("Pillow not available — skipping vision upload test")

    W, H = 600, 360
    img = Image.new("RGB", (W, H), (15, 20, 30))
    d = ImageDraw.Draw(img)
    # Grid
    for x in range(0, W, 50):
        d.line([(x, 0), (x, H)], fill=(35, 40, 55), width=1)
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=(35, 40, 55), width=1)

    # 30 candles with an upward trend (clear BUY-ish bias)
    rng = random.Random(42)
    price = 100.0
    candle_w = 16
    spacing = 18
    x = 20
    for i in range(30):
        drift = 0.6  # uptrend
        body = rng.uniform(-1.5, 2.0) + drift
        open_p = price
        close_p = price + body
        high_p = max(open_p, close_p) + rng.uniform(0.2, 1.0)
        low_p = min(open_p, close_p) - rng.uniform(0.2, 1.0)
        # Map price -> y (invert)
        def y_of(p):
            return int(H - 20 - (p - 80) * 4)
        # wick
        d.line([(x + candle_w // 2, y_of(high_p)), (x + candle_w // 2, y_of(low_p))],
               fill=(200, 200, 200), width=1)
        # body
        top = y_of(max(open_p, close_p))
        bot = y_of(min(open_p, close_p))
        color = (0, 200, 90) if close_p >= open_p else (220, 60, 60)
        d.rectangle([(x, top), (x + candle_w, bot)], fill=color, outline=(240, 240, 240))
        x += spacing
        price = close_p

    # Title text (real text -> more features)
    d.text((10, 8), "EURUSD H1", fill=(230, 230, 230))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


class TestScannerUploadVision:
    def test_upload_returns_shape_or_skip(self, mongo):
        # Ensure the user has at least 1 scan
        mongo.users.update_one({"email": MENTOR_EMAIL},
                               {"$set": {"scans_balance": 5}, "$unset": {"scans_plan": ""}})
        data_url = _build_chart_image_data_url()
        r = requests.post(f"{BASE}/api/mobile/scanner/upload",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
                                "image_data_url": data_url, "chart_context": "EURUSD H1"},
                          timeout=120)
        if r.status_code == 502:
            pytest.skip(f"vision LLM not available: {r.text}")
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["ok"] is True
        assert body["direction"] in ("BUY", "SELL", "NEUTRAL")
        assert isinstance(body["confidence"], int)
        assert 0 <= body["confidence"] <= 100
        assert isinstance(body["id"], str) and len(body["id"]) > 10
        # Balance was debited
        u = mongo.users.find_one({"email": MENTOR_EMAIL}, {"_id": 0, "scans_balance": 1})
        assert int(u["scans_balance"]) == 4
        # Saved in db.scans
        assert mongo.scans.find_one({"id": body["id"]}, {"_id": 0}) is not None

    def test_upload_402_when_out_of_scans(self, mongo):
        mongo.users.update_one({"email": MENTOR_EMAIL},
                               {"$set": {"scans_balance": 0}, "$unset": {"scans_plan": ""}})
        data_url = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * 32).decode()
        r = requests.post(f"{BASE}/api/mobile/scanner/upload",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
                                "image_data_url": data_url})
        assert r.status_code == 402, f"expected 402 when out of scans, got {r.status_code} {r.text}"
