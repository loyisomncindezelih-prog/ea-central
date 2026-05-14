"""Iteration 7: ea-central bridge Phase 2 (mentor api-key, mentor-push, pair, jobs, ack, activity, download)
   + cascade-delete pair_configs when an EA symbol is removed.

NOTE: activate-license requires email's user.id == license.owner_id, so the mentor is also the
"client" in this test. We test direction filtering by reconfiguring the pair_config between pushes.
"""
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
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _approve(admin_token, uid):
    r = requests.post(f"{API}/admin/users/{uid}/approve",
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, r.text


def _register(email, username, password="Passw0rd!"):
    return requests.post(f"{API}/auth/register", json={
        "email": email, "username": username, "password": password,
        "country_code": "+27", "contact_number": "0810000000",
    }, timeout=20)


@pytest.fixture(scope="module")
def seed():
    admin = _admin_token()
    suffix = int(time.time())
    mentor_email = f"TEST_it7_m_{suffix}@test.com"
    r = _register(mentor_email, f"TEST_it7_m_{suffix}")
    assert r.status_code in (200, 201), r.text
    mentor_id = r.json()["user"]["id"]
    _approve(admin, mentor_id)

    login = requests.post(f"{API}/auth/login",
                          json={"email": mentor_email, "password": "Passw0rd!"}, timeout=20)
    assert login.status_code == 200
    mtoken = login.json()["access_token"]
    h = {"Authorization": f"Bearer {mtoken}"}

    ea = requests.post(f"{API}/mentor/eas", json={"name": "TEST_it7 EA"}, headers=h, timeout=20).json()
    for sym in SYMBOLS:
        sr = requests.post(f"{API}/mentor/eas/{ea['id']}/symbols",
                           json={"symbol": sym}, headers=h, timeout=20)
        assert sr.status_code == 200

    # ONE licence — activated by the mentor's own email (system constraint)
    key = requests.post(f"{API}/mentor/keys", json={
        "ea_id": ea["id"], "plan": "30d", "holder_username": "TEST_it7_holder"
    }, headers=h, timeout=20).json()["key"]
    act = requests.post(f"{API}/mobile/activate-license",
                       json={"email": mentor_email, "license_key": key}, timeout=20)
    assert act.status_code == 200, act.text

    # pair_config EURUSD direction BOTH, lot 0.05
    pc = requests.post(f"{API}/mobile/pair-config", json={
        "email": mentor_email, "license_key": key, "symbol": "EURUSD",
        "direction": "BOTH", "lot_size": 0.05, "max_trades": 3, "platform": "mt5",
    }, timeout=20)
    assert pc.status_code == 200, pc.text

    return {
        "admin_token": admin, "mentor_email": mentor_email, "mentor_id": mentor_id,
        "mentor_token": mtoken, "mentor_headers": h, "ea": ea, "key": key,
    }


# ============ Mentor API key generation / rotation ============
class TestMentorApiKey:
    def test_get_returns_null_initially(self, seed):
        r = requests.get(f"{API}/mentor/api-key", headers=seed["mentor_headers"], timeout=20)
        assert r.status_code == 200
        assert r.json().get("api_key") in (None, "")

    def test_rotate_creates_key(self, seed):
        r = requests.post(f"{API}/mentor/api-key/rotate", headers=seed["mentor_headers"], timeout=20)
        assert r.status_code == 200
        key1 = r.json()["api_key"]
        assert isinstance(key1, str) and key1.startswith("mk_") and len(key1) > 20
        g = requests.get(f"{API}/mentor/api-key", headers=seed["mentor_headers"], timeout=20)
        assert g.json()["api_key"] == key1
        seed["api_key_v1"] = key1

    def test_rotate_replaces_and_old_stops_working(self, seed):
        old = seed["api_key_v1"]
        r = requests.post(f"{API}/mentor/api-key/rotate", headers=seed["mentor_headers"], timeout=20)
        assert r.status_code == 200
        new_key = r.json()["api_key"]
        assert new_key != old
        push = requests.post(f"{API}/bridge/mentor-push",
                             headers={"Authorization": f"Bearer {old}"},
                             json={"ea_id": seed["ea"]["id"], "symbol": "EURUSD", "action": "BUY"},
                             timeout=20)
        assert push.status_code == 401, push.text
        seed["api_key"] = new_key


# ============ mentor-push auth + validation ============
class TestMentorPushAuth:
    def test_no_auth(self, seed):
        r = requests.post(f"{API}/bridge/mentor-push",
                          json={"ea_id": seed["ea"]["id"], "symbol": "EURUSD", "action": "BUY"},
                          timeout=20)
        assert r.status_code == 401

    def test_invalid_key(self, seed):
        r = requests.post(f"{API}/bridge/mentor-push",
                          headers={"Authorization": "Bearer mk_bogus_invalid_key"},
                          json={"ea_id": seed["ea"]["id"], "symbol": "EURUSD", "action": "BUY"},
                          timeout=20)
        assert r.status_code == 401

    def test_ea_not_owned(self, seed):
        r = requests.post(f"{API}/bridge/mentor-push",
                          headers={"Authorization": f"Bearer {seed['api_key']}"},
                          json={"ea_id": "ea-that-does-not-exist", "symbol": "EURUSD", "action": "BUY"},
                          timeout=20)
        assert r.status_code == 404

    def test_symbol_not_in_ea(self, seed):
        r = requests.post(f"{API}/bridge/mentor-push",
                          headers={"Authorization": f"Bearer {seed['api_key']}"},
                          json={"ea_id": seed["ea"]["id"], "symbol": "BTCUSD", "action": "BUY"},
                          timeout=20)
        assert r.status_code == 400


# ============ mentor-push happy path + direction filter ============
class TestMentorPushFanout:
    def test_buy_happy_path_both(self, seed):
        """pair_config direction=BOTH → BUY fans out to 1 eligible client, lot from cfg."""
        r = requests.post(f"{API}/bridge/mentor-push",
                          headers={"Authorization": f"Bearer {seed['api_key']}"},
                          json={"ea_id": seed["ea"]["id"], "symbol": "EURUSD", "action": "BUY"},
                          timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["eligible_clients"] == 1
        assert d["fanned_out"] == 1

    def test_buy_skipped_when_direction_sell_only(self, seed):
        """Reconfigure pair_config to SELL-only and push BUY → fanned_out=0, eligible_clients=1."""
        # Switch direction to SELL only
        upd = requests.post(f"{API}/mobile/pair-config", json={
            "email": seed["mentor_email"], "license_key": seed["key"], "symbol": "EURUSD",
            "direction": "SELL", "lot_size": 0.05, "max_trades": 3, "platform": "mt5",
        }, timeout=20)
        assert upd.status_code == 200

        r = requests.post(f"{API}/bridge/mentor-push",
                          headers={"Authorization": f"Bearer {seed['api_key']}"},
                          json={"ea_id": seed["ea"]["id"], "symbol": "EURUSD", "action": "BUY"},
                          timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["eligible_clients"] == 1
        assert d["fanned_out"] == 0, f"BUY should skip SELL-only client, got {d}"

        # SELL on the same config should now fan out
        r2 = requests.post(f"{API}/bridge/mentor-push",
                           headers={"Authorization": f"Bearer {seed['api_key']}"},
                           json={"ea_id": seed["ea"]["id"], "symbol": "EURUSD", "action": "SELL"},
                           timeout=20)
        assert r2.json()["fanned_out"] == 1

        # Reset to BOTH for downstream tests
        reset = requests.post(f"{API}/mobile/pair-config", json={
            "email": seed["mentor_email"], "license_key": seed["key"], "symbol": "EURUSD",
            "direction": "BOTH", "lot_size": 0.05, "max_trades": 3, "platform": "mt5",
        }, timeout=20)
        assert reset.status_code == 200


# ============ bridge pairing ============
class TestBridgePair:
    def test_pair_returns_token(self, seed):
        r = requests.post(f"{API}/bridge/pair", json={
            "email": seed["mentor_email"], "license_key": seed["key"],
            "platform": "mt5", "machine_name": "TEST_pc_A",
        }, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["bridge_token"].startswith("br_")
        assert d["ea_id"] == seed["ea"]["id"]
        assert d["ea_name"]
        assert d["poll_interval_seconds"] == 3
        assert "expires_at" in d
        seed["token_v1"] = d["bridge_token"]

    def test_pair_rotates_token(self, seed):
        r = requests.post(f"{API}/bridge/pair", json={
            "email": seed["mentor_email"], "license_key": seed["key"],
            "platform": "mt5", "machine_name": "TEST_pc_A",
        }, timeout=20)
        assert r.status_code == 200
        new_token = r.json()["bridge_token"]
        assert new_token != seed["token_v1"]
        j = requests.get(f"{API}/bridge/jobs",
                         headers={"Authorization": f"Bearer {seed['token_v1']}"}, timeout=20)
        assert j.status_code == 401
        seed["token"] = new_token


# ============ bridge jobs polling + ack ============
class TestBridgeJobs:
    def test_jobs_no_auth(self):
        r = requests.get(f"{API}/bridge/jobs", timeout=20)
        assert r.status_code == 401

    def test_jobs_invalid_token(self):
        r = requests.get(f"{API}/bridge/jobs",
                         headers={"Authorization": "Bearer br_invalid_xx"}, timeout=20)
        assert r.status_code == 401

    def test_get_jobs_delivers_and_clears(self, seed):
        r = requests.get(f"{API}/bridge/jobs",
                         headers={"Authorization": f"Bearer {seed['token']}"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["jobs"], list)
        assert len(data["jobs"]) >= 2  # BUY + SELL from earlier tests
        any_job = data["jobs"][0]
        assert any_job["license_key"] == seed["key"]
        assert any_job["symbol"] == "EURUSD"
        # payload.lot was None → must use cfg.lot_size = 0.05
        assert float(any_job["lot"]) == 0.05
        assert "broker" in data  # field present even when null
        seed["sample_job_id"] = any_job["id"]

        r2 = requests.get(f"{API}/bridge/jobs",
                          headers={"Authorization": f"Bearer {seed['token']}"}, timeout=20)
        assert r2.status_code == 200
        prev_ids = {j["id"] for j in data["jobs"]}
        next_ids = {j["id"] for j in r2.json()["jobs"]}
        assert prev_ids.isdisjoint(next_ids), "delivered jobs must not be re-returned"

    def test_ack_executed(self, seed):
        jid = seed.get("sample_job_id")
        assert jid
        r = requests.post(f"{API}/bridge/jobs/{jid}/ack",
                          headers={"Authorization": f"Bearer {seed['token']}"},
                          json={"status": "executed", "mt_order_id": "MT-12345",
                                "raw": {"price": 1.085}}, timeout=20)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_ack_cross_bridge_isolation(self, seed):
        """A job belonging to a different bridge cannot be acked."""
        # Create a separate mentor + licence + bridge token
        admin = seed["admin_token"]
        suffix = int(time.time())
        other_email = f"TEST_it7_other_{suffix}@test.com"
        rr = _register(other_email, f"TEST_it7_other_{suffix}")
        uid = rr.json()["user"]["id"]
        _approve(admin, uid)
        login = requests.post(f"{API}/auth/login",
                              json={"email": other_email, "password": "Passw0rd!"}, timeout=20)
        h = {"Authorization": f"Bearer {login.json()['access_token']}"}
        ea2 = requests.post(f"{API}/mentor/eas", json={"name": "TEST_it7 EA2"}, headers=h, timeout=20).json()
        requests.post(f"{API}/mentor/eas/{ea2['id']}/symbols",
                      json={"symbol": "EURUSD"}, headers=h, timeout=20)
        key2 = requests.post(f"{API}/mentor/keys", json={
            "ea_id": ea2["id"], "plan": "30d", "holder_username": "TEST_it7_other_holder"
        }, headers=h, timeout=20).json()["key"]
        requests.post(f"{API}/mobile/activate-license",
                      json={"email": other_email, "license_key": key2}, timeout=20)
        pair2 = requests.post(f"{API}/bridge/pair", json={
            "email": other_email, "license_key": key2, "platform": "mt5", "machine_name": "TEST_pc_B",
        }, timeout=20)
        token2 = pair2.json()["bridge_token"]

        # Try to ack seed's job with other bridge's token → 404
        jid = seed["sample_job_id"]
        r = requests.post(f"{API}/bridge/jobs/{jid}/ack",
                          headers={"Authorization": f"Bearer {token2}"},
                          json={"status": "executed"}, timeout=20)
        assert r.status_code == 404


# ============ mentor bridge activity ============
class TestMentorActivity:
    def test_activity_lists_bridges_and_signals(self, seed):
        r = requests.get(f"{API}/mentor/bridge/activity",
                         headers=seed["mentor_headers"], timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "bridges" in d and "recent_signals" in d
        license_keys = {b["license_key"] for b in d["bridges"]}
        assert seed["key"] in license_keys
        my_keys = {seed["key"]}
        for s in d["recent_signals"]:
            assert s["license_key"] in my_keys
        assert len(d["recent_signals"]) >= 1


# ============ bridge download ============
class TestBridgeDownload:
    def test_download_serves_python_file(self):
        r = requests.get(f"{API}/bridge/download", timeout=20)
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "ea_central_bridge.py" in cd
        assert r.text.startswith("#!/usr/bin/env python3"), r.text[:80]


# ============ cascade delete pair_configs on EA symbol removal ============
class TestCascadeDelete:
    def test_remove_symbol_cascades_pair_configs(self, seed):
        # Verify EURUSD pair_config currently present
        act = requests.post(f"{API}/mobile/activate-license", json={
            "email": seed["mentor_email"], "license_key": seed["key"]
        }, timeout=20).json()
        before = {c["symbol"] for c in act.get("pair_configs", [])}
        assert "EURUSD" in before

        # Remove EURUSD from the EA
        d = requests.delete(f"{API}/mentor/eas/{seed['ea']['id']}/symbols/EURUSD",
                            headers=seed["mentor_headers"], timeout=20)
        assert d.status_code == 200, d.text

        act2 = requests.post(f"{API}/mobile/activate-license", json={
            "email": seed["mentor_email"], "license_key": seed["key"]
        }, timeout=20).json()
        after = {c["symbol"] for c in act2.get("pair_configs", [])}
        assert "EURUSD" not in after, f"EURUSD pair_config not cascaded, got {after}"
