"""Iteration 18 - Phase 3: trading_style-driven execution in /bridge/mentor-push + martingale streak.

Covers:
  - lot/max_trades multipliers per style (aggressive_scalping, day_trading, scalping, swing_trading, martingale)
  - audit fields on inserted trade_signals (trading_style, lot_base, lot_mult, martingale_streak)
  - Martingale 2^streak doubling, capped at MARTINGALE_STREAK_CAP=5
  - CLOSE actions never get martingale doubling
  - /bridge/jobs/{id}/ack streak maintenance: failed=>+1, executed=>0, skipped=>unchanged
  - Streak ack updates ONLY apply when trading_style='martingale'
  - /mobile/trading-style resets streak to 0 on any style change
  - Regression: symbol allow-list, direction filter, expired skipped, eligible_clients count
"""
import asyncio
import os
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://copy-trading-hub-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test_it6_ui_1778753851@test.com"
LICENSE = "EAC-2F9D-E69F-6F75-CEB3"
MENTOR_API_KEY = "mk_l7qx0ZhSMVz0pasVO33V5KphaH1G6yjllxzINQ"
EA_ID = "0694ce52-d108-491d-9f91-0eaa6276bd1e"
SYMBOL = "EURUSD"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


async def _set_license(db, **fields):
    await db.license_keys.update_one({"key": LICENSE}, {"$set": fields})


async def _get_license(db):
    return await db.license_keys.find_one({"key": LICENSE}, {"_id": 0})


async def _ensure_pair_config(db, lot_size=0.10, max_trades=1, direction="BOTH"):
    await db.pair_configs.update_one(
        {"license_key": LICENSE, "symbol": SYMBOL},
        {"$set": {"lot_size": lot_size, "max_trades": max_trades, "direction": direction, "platform": "mt5", "email": EMAIL}},
        upsert=True,
    )


async def _purge_signals(db):
    await db.trade_signals.delete_many({"license_key": LICENSE})


async def _latest_signal(db):
    docs = await db.trade_signals.find({"license_key": LICENSE}, {"_id": 0}).sort("created_at", -1).to_list(1)
    return docs[0] if docs else None


def _mentor_headers():
    return {"Authorization": f"Bearer {MENTOR_API_KEY}", "Content-Type": "application/json"}


def _push(symbol=SYMBOL, action="BUY", lot=0.10):
    return requests.post(
        f"{API}/bridge/mentor-push",
        headers=_mentor_headers(),
        json={"ea_id": EA_ID, "symbol": symbol, "action": action, "lot": lot, "comment": "iter18 test"},
        timeout=15,
    )


@pytest.fixture(scope="module", autouse=True)
def setup_module_state(event_loop, db):
    """Ensure pair_config exists with lot_size=0.10, max_trades=1, BOTH and starting trading_style/streak clean."""
    event_loop.run_until_complete(_ensure_pair_config(db, lot_size=0.10, max_trades=1, direction="BOTH"))
    event_loop.run_until_complete(_set_license(db, trading_style="day_trading", martingale_streak=0))
    event_loop.run_until_complete(_purge_signals(db))
    yield
    # Cleanup at end
    event_loop.run_until_complete(_purge_signals(db))
    event_loop.run_until_complete(_set_license(db, trading_style=None, martingale_streak=0, bound_device_id=None))
    # Restore pair_config to original lot_size 0.01 for legacy compat with other tests
    event_loop.run_until_complete(db.pair_configs.update_one(
        {"license_key": LICENSE, "symbol": SYMBOL},
        {"$set": {"lot_size": 0.01, "max_trades": 1, "direction": "BOTH"}},
    ))


# -------------------- 1. Style multipliers --------------------
class TestStyleMultipliers:
    @pytest.mark.parametrize(
        "style,expected_lot,expected_max",
        [
            ("aggressive_scalping", 0.15, 2),
            ("day_trading",         0.10, 1),
            ("scalping",            0.10, 1),
            ("swing_trading",       0.12, 1),  # 0.5*1 = 0.5 -> rounds to 1 due to max(1, ...)
            ("martingale",          0.10, 1),  # streak=0
        ],
    )
    def test_style_multiplier_applied(self, event_loop, db, style, expected_lot, expected_max):
        event_loop.run_until_complete(_purge_signals(db))
        event_loop.run_until_complete(_set_license(db, trading_style=style, martingale_streak=0))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["fanned_out"] == 1
        assert body["eligible_clients"] == 1

        sig = event_loop.run_until_complete(_latest_signal(db))
        assert sig is not None, "expected one inserted trade_signal"
        assert sig["lot"] == pytest.approx(expected_lot, abs=1e-6), f"lot mismatch for {style}: got {sig['lot']}"
        assert sig["max_trades"] == expected_max, f"max_trades mismatch for {style}: got {sig['max_trades']}"
        assert sig["action"] == "BUY"
        assert sig["symbol"] == SYMBOL


# -------------------- 2. Audit fields --------------------
class TestAuditFields:
    def test_audit_fields_present(self, event_loop, db):
        event_loop.run_until_complete(_purge_signals(db))
        event_loop.run_until_complete(_set_license(db, trading_style="aggressive_scalping", martingale_streak=0))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200, r.text
        sig = event_loop.run_until_complete(_latest_signal(db))
        assert sig is not None
        assert sig["trading_style"] == "aggressive_scalping"
        assert sig["lot_base"] == pytest.approx(0.10)
        assert sig["lot_mult"] == pytest.approx(1.5)
        assert sig["martingale_streak"] == 0  # non-martingale style => always 0

    def test_audit_fields_for_martingale_with_streak(self, event_loop, db):
        event_loop.run_until_complete(_purge_signals(db))
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=2))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200, r.text
        sig = event_loop.run_until_complete(_latest_signal(db))
        assert sig is not None
        assert sig["trading_style"] == "martingale"
        assert sig["lot_base"] == pytest.approx(0.10)
        assert sig["lot_mult"] == pytest.approx(1.0)
        assert sig["martingale_streak"] == 2


# -------------------- 3. Martingale doubling --------------------
class TestMartingaleDoubling:
    def test_streak_0(self, event_loop, db):
        event_loop.run_until_complete(_purge_signals(db))
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=0))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200
        sig = event_loop.run_until_complete(_latest_signal(db))
        assert sig["lot"] == pytest.approx(0.10)

    def test_streak_2_doubles_4x(self, event_loop, db):
        event_loop.run_until_complete(_purge_signals(db))
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=2))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200
        sig = event_loop.run_until_complete(_latest_signal(db))
        # 0.10 * 2^2 = 0.40
        assert sig["lot"] == pytest.approx(0.40), f"expected 0.40, got {sig['lot']}"

    def test_streak_10_caps_at_32x(self, event_loop, db):
        event_loop.run_until_complete(_purge_signals(db))
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=10))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200
        sig = event_loop.run_until_complete(_latest_signal(db))
        # capped at 2^5 = 32 => 0.10 * 32 = 3.20
        assert sig["lot"] == pytest.approx(3.20), f"expected 3.20 (capped), got {sig['lot']}"

    def test_close_not_doubled(self, event_loop, db):
        event_loop.run_until_complete(_purge_signals(db))
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=3))
        r = _push(action="CLOSE", lot=0.10)
        assert r.status_code == 200
        sig = event_loop.run_until_complete(_latest_signal(db))
        # CLOSE must NOT double — expect base lot 0.10 (or pair_config default), not 0.80
        assert sig["lot"] == pytest.approx(0.10), f"CLOSE should not double, got {sig['lot']}"
        assert sig["action"] == "CLOSE"


# -------------------- 4. Ack streak maintenance --------------------
class TestAckStreakMaintenance:
    @pytest.fixture(scope="class")
    def bridge_token(self, event_loop, db):
        # Pair to obtain a bridge token. Re-binds if needed: pair endpoint requires a verified license owner.
        # The /bridge/pair endpoint validates _verify_license_owner — which checks bound_to_email == email.
        # license is already bound to test_it6_ui_1778753851@test.com.
        r = requests.post(
            f"{API}/bridge/pair",
            json={"email": EMAIL, "license_key": LICENSE, "platform": "mt5", "machine_name": "iter18-test"},
            timeout=15,
        )
        assert r.status_code == 200, f"pair failed: {r.status_code} {r.text}"
        return r.json()["bridge_token"]

    def _push_and_get_job(self, event_loop, db):
        event_loop.run_until_complete(_purge_signals(db))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200
        sig = event_loop.run_until_complete(_latest_signal(db))
        return sig["id"]

    def test_failed_ack_increments(self, event_loop, db, bridge_token):
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=2))
        job_id = self._push_and_get_job(event_loop, db)
        r = requests.post(
            f"{API}/bridge/jobs/{job_id}/ack",
            headers={"Authorization": f"Bearer {bridge_token}"},
            json={"status": "failed", "error": "test fail"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        lic = event_loop.run_until_complete(_get_license(db))
        assert lic["martingale_streak"] == 3, f"streak should be 3, got {lic['martingale_streak']}"

    def test_executed_ack_resets(self, event_loop, db, bridge_token):
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=2))
        job_id = self._push_and_get_job(event_loop, db)
        r = requests.post(
            f"{API}/bridge/jobs/{job_id}/ack",
            headers={"Authorization": f"Bearer {bridge_token}"},
            json={"status": "executed", "mt_order_id": "12345"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        lic = event_loop.run_until_complete(_get_license(db))
        assert lic["martingale_streak"] == 0, f"streak should reset to 0, got {lic['martingale_streak']}"

    def test_skipped_ack_unchanged(self, event_loop, db, bridge_token):
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=2))
        job_id = self._push_and_get_job(event_loop, db)
        r = requests.post(
            f"{API}/bridge/jobs/{job_id}/ack",
            headers={"Authorization": f"Bearer {bridge_token}"},
            json={"status": "skipped"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        lic = event_loop.run_until_complete(_get_license(db))
        assert lic["martingale_streak"] == 2, f"streak should stay at 2, got {lic['martingale_streak']}"

    def test_non_martingale_failed_ack_does_not_increment(self, event_loop, db, bridge_token):
        event_loop.run_until_complete(_set_license(db, trading_style="day_trading", martingale_streak=0))
        job_id = self._push_and_get_job(event_loop, db)
        r = requests.post(
            f"{API}/bridge/jobs/{job_id}/ack",
            headers={"Authorization": f"Bearer {bridge_token}"},
            json={"status": "failed", "error": "x"},
            timeout=15,
        )
        assert r.status_code == 200
        lic = event_loop.run_until_complete(_get_license(db))
        assert lic["martingale_streak"] == 0, f"non-martingale style should never increment, got {lic['martingale_streak']}"


# -------------------- 5. Style switch resets streak --------------------
class TestStyleSwitchResetsStreak:
    def test_switch_resets_streak(self, event_loop, db):
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=4))
        r = requests.post(
            f"{API}/mobile/trading-style",
            json={"email": EMAIL, "license_key": LICENSE, "style": "day_trading"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        lic = event_loop.run_until_complete(_get_license(db))
        assert lic["martingale_streak"] == 0, f"streak should reset to 0 on style change, got {lic['martingale_streak']}"
        assert lic["trading_style"] == "day_trading"

    def test_switch_to_same_style_resets(self, event_loop, db):
        # Even a no-op style change should reset (per spec: "regardless of new style choice")
        event_loop.run_until_complete(_set_license(db, trading_style="martingale", martingale_streak=3))
        r = requests.post(
            f"{API}/mobile/trading-style",
            json={"email": EMAIL, "license_key": LICENSE, "style": "martingale"},
            timeout=15,
        )
        assert r.status_code == 200
        lic = event_loop.run_until_complete(_get_license(db))
        assert lic["martingale_streak"] == 0


# -------------------- 6. Regression --------------------
class TestRegression:
    def test_symbol_not_in_allow_list(self, event_loop, db):
        event_loop.run_until_complete(_set_license(db, trading_style="day_trading", martingale_streak=0))
        r = requests.post(
            f"{API}/bridge/mentor-push",
            headers=_mentor_headers(),
            json={"ea_id": EA_ID, "symbol": "BTCUSD", "action": "BUY", "lot": 0.10},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_direction_filter_buy_only(self, event_loop, db):
        """If pair_config.direction='SELL', a BUY mentor push should not be fanned out to that client."""
        event_loop.run_until_complete(_set_license(db, trading_style="day_trading", martingale_streak=0))
        event_loop.run_until_complete(_ensure_pair_config(db, lot_size=0.10, max_trades=1, direction="SELL"))
        event_loop.run_until_complete(_purge_signals(db))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200
        body = r.json()
        assert body["fanned_out"] == 0
        assert body["eligible_clients"] == 1  # licence is still eligible (count) even if filtered out

        # Restore
        event_loop.run_until_complete(_ensure_pair_config(db, lot_size=0.10, max_trades=1, direction="BOTH"))

    def test_direction_filter_both_allows_buy(self, event_loop, db):
        event_loop.run_until_complete(_set_license(db, trading_style="day_trading", martingale_streak=0))
        event_loop.run_until_complete(_ensure_pair_config(db, lot_size=0.10, max_trades=1, direction="BOTH"))
        event_loop.run_until_complete(_purge_signals(db))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200
        body = r.json()
        assert body["fanned_out"] == 1
        assert body["eligible_clients"] == 1

    def test_eligible_clients_count(self, event_loop, db):
        """eligible_clients should equal the count of activated, non-expired licences owned by mentor for this EA."""
        event_loop.run_until_complete(_set_license(db, trading_style="day_trading", martingale_streak=0))
        r = _push(action="BUY", lot=0.10)
        assert r.status_code == 200
        body = r.json()
        # we only have one matching active licence in the fixture set
        assert body["eligible_clients"] >= 1
