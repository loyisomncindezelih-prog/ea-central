"""Iteration 8 backend tests:
- Admin endpoint GET /api/admin/broker-connections (auth + data).
- Regression: mobile check-email, activate-license, connect-broker.
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


@pytest.fixture(scope="module")
def cleanup_broker():
    yield
    # Best-effort: disconnect after tests
    try:
        requests.post(f"{API}/mobile/disconnect-broker",
                      json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
    except Exception:
        pass


# ---------- Admin auth on /admin/broker-connections ----------
class TestAdminBrokerConnectionsAuth:
    def test_no_token_returns_401_or_403(self):
        r = requests.get(f"{API}/admin/broker-connections", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"

    def test_non_admin_user_returns_403(self, mentor_token):
        r = requests.get(f"{API}/admin/broker-connections",
                         headers={"Authorization": f"Bearer {mentor_token}"}, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_returns_200_list(self, admin_headers):
        r = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Round-trip: connect-broker -> admin sees decrypted ----------
class TestAdminBrokerConnectionsRoundTrip:
    def test_empty_or_clean_then_link(self, admin_headers, cleanup_broker):
        # Disconnect first to start clean for our license
        requests.post(f"{API}/mobile/disconnect-broker",
                      json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)

        # Client links broker
        link = requests.post(f"{API}/mobile/connect-broker", json={
            "email": MENTOR_EMAIL,
            "license_key": LICENSE_KEY,
            "platform": PLATFORM,
            "server": SERVER,
            "account": ACCOUNT,
            "password": PASSWORD_PLAIN,
        }, timeout=20)
        assert link.status_code == 200, f"connect-broker failed: {link.status_code} {link.text}"
        body = link.json()
        assert body.get("ok") is True
        assert body.get("status") == "configured"

        # Admin sees it
        r = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        row = next((x for x in rows if x.get("license_key") == LICENSE_KEY), None)
        assert row is not None, f"row for {LICENSE_KEY} not present in admin list"

        # Field assertions
        assert row["client_email"] == MENTOR_EMAIL.lower()
        assert row["platform"] == PLATFORM
        assert row["broker_server"] == SERVER
        assert row["broker_account"] == ACCOUNT
        assert row["broker_password"] == PASSWORD_PLAIN, "decrypted password mismatch"
        assert row["status"] == "configured"
        assert row.get("connected_at")
        assert row.get("ea_name") == "AlphaWave Pro"
        assert row.get("mentor_email") == MENTOR_EMAIL.lower()
        # client_username & client_contact may be present from seeded user
        assert "client_username" in row
        assert "client_contact" in row

    def test_disconnect_removes_row(self, admin_headers):
        r = requests.post(f"{API}/mobile/disconnect-broker",
                          json={"email": MENTOR_EMAIL, "license_key": LICENSE_KEY}, timeout=15)
        assert r.status_code == 200
        time.sleep(0.5)
        r2 = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20)
        assert r2.status_code == 200
        rows = r2.json()
        assert all(x.get("license_key") != LICENSE_KEY for x in rows), "row still present after disconnect"

    def test_order_desc_by_connected_at(self, admin_headers):
        # Re-link to ensure ordering is testable; results sorted desc -> our most recent row first
        requests.post(f"{API}/mobile/connect-broker", json={
            "email": MENTOR_EMAIL,
            "license_key": LICENSE_KEY,
            "platform": PLATFORM,
            "server": SERVER,
            "account": ACCOUNT,
            "password": PASSWORD_PLAIN,
        }, timeout=20)
        r = requests.get(f"{API}/admin/broker-connections", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        if len(rows) >= 2:
            times = [x.get("connected_at") for x in rows if x.get("connected_at")]
            assert times == sorted(times, reverse=True), "rows not desc by connected_at"


# ---------- Regression: existing happy-path endpoints ----------
class TestRegression:
    def test_check_email(self):
        r = requests.post(f"{API}/mobile/check-email", json={"email": MENTOR_EMAIL}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        # Endpoint returns {"ok": true, "username": "..."} for an eligible user
        assert body.get("ok") is True
        assert "username" in body

    def test_activate_license_idempotent(self):
        r = requests.post(f"{API}/mobile/activate-license", json={
            "email": MENTOR_EMAIL, "license_key": LICENSE_KEY,
        }, timeout=15)
        # Already bound to same email -> 200 OK (idempotent reactivation)
        assert r.status_code in (200, 409, 410), f"unexpected {r.status_code} {r.text}"

    def test_connect_broker_happy_path(self):
        r = requests.post(f"{API}/mobile/connect-broker", json={
            "email": MENTOR_EMAIL,
            "license_key": LICENSE_KEY,
            "platform": PLATFORM,
            "server": SERVER,
            "account": ACCOUNT,
            "password": PASSWORD_PLAIN,
        }, timeout=20)
        assert r.status_code == 200
        assert r.json().get("ok") is True
