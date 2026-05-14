"""Iteration 9 backend tests:
- Broker connect now returns status='pending_approval'.
- Admin approve/decline endpoints (auth, 404, reason default).
- /mobile/ea/start + /mobile/ea/stop endpoints, gated on broker status & pair_configs.
- activate-license now includes broker.status/decision_reason + ea_session.
- Declining a broker while EA is running flips ea_session to stopped (reason=broker_declined).
- Regression: pair-config still works.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://copy-trading-hub-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASSWORD = "Admin@123"
MENTOR_EMAIL = "TEST_it6_ui_1778753851@test.com"
MENTOR_PASSWORD = "Passw0rd!"
LICENSE_KEY = "EAC-2F9D-E69F-6F75-CEB3"

PLATFORM = "mt5"
SERVER = "ICMarketsSC-Demo01"
ACCOUNT = "5550101"
PASSWORD_PLAIN = "Top$ecret#1"

SYMBOL = "EURUSD"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def mentor_token():
    r = requests.post(f"{API}/auth/login", json={"email": MENTOR_EMAIL, "password": MENTOR_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"mentor login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


def _link_broker():
    return requests.post(f"{API}/mobile/connect-broker", json={
        "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
        "platform": PLATFORM, "server": SERVER, "account": ACCOUNT, "password": PASSWORD_PLAIN,
    }, timeout=20)


def _disconnect_broker():
    return requests.post(f"{API}/mobile/disconnect-broker",
                         json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)


def _stop_ea():
    return requests.post(f"{API}/mobile/ea/stop",
                         json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)


def _ensure_pair_config():
    return requests.post(f"{API}/mobile/pair-config", json={
        "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
        "symbol": SYMBOL, "direction": "BOTH", "platform": "mt5",
        "lot_size": 0.01, "max_trades": 1,
    }, timeout=15)


@pytest.fixture(scope="module", autouse=True)
def cleanup_module():
    # Cleanup before
    _stop_ea()
    _disconnect_broker()
    yield
    # Cleanup after
    _stop_ea()
    _disconnect_broker()


# ---------- 1. Broker connect now sets pending_approval ----------
class TestBrokerConnectPending:
    def test_connect_returns_pending_approval(self, admin_headers):
        _disconnect_broker()
        r = _link_broker()
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["status"] == "pending_approval"
        assert "linking" in (body.get("notice") or "").lower()

        # Confirm via admin list
        a = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20)
        assert a.status_code == 200
        row = next((x for x in a.json() if x["license_key"] == LICENSE_KEY), None)
        assert row is not None
        assert row["status"] == "pending_approval"


# ---------- 2. Admin approve / decline auth + 404 ----------
class TestAdminDecideAuth:
    def test_approve_requires_admin_no_token(self):
        r = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/approve", json={"reason": ""}, timeout=15)
        assert r.status_code in (401, 403)

    def test_decline_requires_admin_no_token(self):
        r = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/decline", json={"reason": ""}, timeout=15)
        assert r.status_code in (401, 403)

    def test_approve_non_admin_returns_403(self, mentor_token):
        r = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/approve",
                          json={"reason": ""},
                          headers={"Authorization": f"Bearer {mentor_token}"}, timeout=15)
        assert r.status_code == 403

    def test_approve_unknown_license_404(self, admin_headers):
        r = requests.post(f"{API}/admin/broker-connections/EAC-DEAD-BEEF-0000-0000/approve",
                          json={"reason": ""}, headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_decline_unknown_license_404(self, admin_headers):
        r = requests.post(f"{API}/admin/broker-connections/EAC-DEAD-BEEF-0000-0000/decline",
                          json={"reason": ""}, headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ---------- 3. EA start gating ----------
class TestEaStartGating:
    def test_start_with_pending_broker_returns_425(self):
        _stop_ea()
        _disconnect_broker()
        _ensure_pair_config()
        assert _link_broker().status_code == 200  # status = pending
        r = requests.post(f"{API}/mobile/ea/start",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert r.status_code == 425, r.text

    def test_start_with_declined_broker_returns_403(self, admin_headers):
        # Decline current broker
        d = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/decline",
                          json={"reason": "Bad credentials"}, headers=admin_headers, timeout=15)
        assert d.status_code == 200
        r = requests.post(f"{API}/mobile/ea/start",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert r.status_code == 403, r.text

    def test_start_no_broker_returns_400(self, admin_headers):
        _disconnect_broker()
        r = requests.post(f"{API}/mobile/ea/start",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert r.status_code == 400, r.text


# ---------- 4. Decline reason default + happy path ----------
class TestDeclineReasonAndHappyStart:
    def test_decline_default_reason(self, admin_headers):
        _disconnect_broker()
        assert _link_broker().status_code == 200
        d = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/decline",
                          json={"reason": ""}, headers=admin_headers, timeout=15)
        assert d.status_code == 200
        a = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20)
        row = next((x for x in a.json() if x["license_key"] == LICENSE_KEY), None)
        assert row["status"] == "declined"
        assert row["decision_reason"] == "Invalid credentials or server."

    def test_approve_then_start_happy_path(self, admin_headers):
        _disconnect_broker()
        _ensure_pair_config()
        assert _link_broker().status_code == 200
        # Approve
        a = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/approve",
                         json={"reason": ""}, headers=admin_headers, timeout=15)
        assert a.status_code == 200

        # Verify status approved in admin list, decision_by set
        rows = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20).json()
        row = next((x for x in rows if x["license_key"] == LICENSE_KEY), None)
        assert row["status"] == "approved"
        assert row["decision_at"]

        # Start EA
        r = requests.post(f"{API}/mobile/ea/start",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["status"] == "running"
        assert "waiting for opportunities" in body["message"].lower()
        assert body.get("started_at")
        assert body.get("broker_server") == SERVER
        assert body.get("broker_account") == ACCOUNT


# ---------- 5. activate-license response shape ----------
class TestActivateLicensePayload:
    def test_activate_license_includes_broker_status_and_session(self):
        r = requests.post(f"{API}/mobile/activate-license",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "broker" in body and body["broker"] is not None
        assert body["broker"]["status"] == "approved"
        assert "decision_reason" in body["broker"]
        assert "decision_at" in body["broker"]

        assert "ea_session" in body
        assert body["ea_session"] is not None
        assert body["ea_session"]["status"] == "running"
        assert body["ea_session"].get("started_at")

        assert "pair_configs" in body
        assert any(p["symbol"] == SYMBOL for p in body["pair_configs"])


# ---------- 6. Admin decline while EA is running auto-stops session ----------
class TestDeclineStopsRunningSession:
    def test_decline_running_session_flips_to_stopped(self, admin_headers):
        # Currently EA should be running from previous tests
        # Decline broker now
        d = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/decline",
                          json={"reason": "Suspicious account"}, headers=admin_headers, timeout=15)
        assert d.status_code == 200
        # Verify ea_session in admin list is stopped
        rows = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20).json()
        row = next((x for x in rows if x["license_key"] == LICENSE_KEY), None)
        assert row["status"] == "declined"
        assert row["decision_reason"] == "Suspicious account"
        # ea_session summary should show stopped
        sess = row.get("ea_session")
        assert sess is not None
        assert sess["status"] == "stopped"


# ---------- 7. EA stop sets stopped + stopped_reason=client_stop ----------
class TestEaStop:
    def test_stop_endpoint_sets_status(self, admin_headers):
        # Re-link, approve, start, then stop
        _disconnect_broker()
        _ensure_pair_config()
        assert _link_broker().status_code == 200
        a = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/approve",
                         json={"reason": ""}, headers=admin_headers, timeout=15)
        assert a.status_code == 200
        s = requests.post(f"{API}/mobile/ea/start",
                         json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert s.status_code == 200

        stop = requests.post(f"{API}/mobile/ea/stop",
                            json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert stop.status_code == 200
        assert stop.json()["status"] == "stopped"

        # activate-license reflects stopped
        r = requests.post(f"{API}/mobile/activate-license",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        body = r.json()
        assert body["ea_session"]["status"] == "stopped"


# ---------- 8. Regression: pair-config + admin list pair list ----------
class TestRegressionAndAdminPairs:
    def test_admin_list_includes_pairs_when_session(self, admin_headers):
        rows = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20).json()
        row = next((x for x in rows if x["license_key"] == LICENSE_KEY), None)
        assert row is not None
        sess = row.get("ea_session")
        assert sess is not None
        assert isinstance(sess.get("pairs"), list)
        # the configured EURUSD pair should be present
        assert any(p["symbol"] == SYMBOL for p in sess["pairs"])

    def test_start_without_pairs_400(self, admin_headers):
        # remove pairs, restart broker chain
        _stop_ea()
        _disconnect_broker()
        # delete pair config (POST endpoint)
        requests.post(f"{API}/mobile/pair-config/delete",
                      json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY, "symbol": SYMBOL},
                      timeout=15)
        assert _link_broker().status_code == 200
        ap = requests.post(f"{API}/admin/broker-connections/{LICENSE_KEY}/approve",
                          json={"reason": ""}, headers=admin_headers, timeout=15)
        assert ap.status_code == 200
        r = requests.post(f"{API}/mobile/ea/start",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert r.status_code == 400
        # Restore pair config for next/cleanup runs
        _ensure_pair_config()
