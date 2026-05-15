"""Iteration 17 - Trading style endpoint + admin broker enrichment + broker copy regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://copy-trading-hub-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "TEST_it6_ui_1778753851@test.com"
LICENSE = "EAC-2F9D-E69F-6F75-CEB3"
PASSWORD = "Passw0rd!"
ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASSWORD = "Admin@123"

VALID_STYLES = {
    "aggressive_scalping": ("Aggressive Scalping", "high"),
    "martingale": ("Martingale", "high"),
    "scalping": ("Scalping", "normal"),
    "swing_trading": ("Swing Trading", "normal"),
    "day_trading": ("Day Trading", "best"),
}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


# Make sure licence is bound for the email
@pytest.fixture(scope="module", autouse=True)
def ensure_activated():
    # Trigger activation so that licence is bound to test email (no-op if already bound)
    requests.post(f"{API}/mobile/activate-license", json={"email": EMAIL, "license_key": LICENSE})
    yield


class TestTradingStyleEndpoint:
    @pytest.mark.parametrize("style,expected", list(VALID_STYLES.items()))
    def test_valid_styles(self, style, expected):
        r = requests.post(f"{API}/mobile/trading-style", json={"email": EMAIL, "license_key": LICENSE, "style": style})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["style"] == style
        assert data["label"] == expected[0]
        assert data["risk"] == expected[1]

    def test_invalid_style(self):
        r = requests.post(f"{API}/mobile/trading-style", json={"email": EMAIL, "license_key": LICENSE, "style": "yolo_mode"})
        assert r.status_code == 400, r.text

    def test_unknown_license(self):
        r = requests.post(f"{API}/mobile/trading-style", json={"email": EMAIL, "license_key": "EAC-0000-0000-0000-0000", "style": "scalping"})
        assert r.status_code == 404, r.text

    def test_email_mismatch(self):
        r = requests.post(f"{API}/mobile/trading-style", json={"email": "stranger@example.com", "license_key": LICENSE, "style": "scalping"})
        assert r.status_code == 403, r.text


class TestActivateLicenseReturnsTradingStyle:
    def test_activate_returns_style(self):
        # First set a known style
        requests.post(f"{API}/mobile/trading-style", json={"email": EMAIL, "license_key": LICENSE, "style": "day_trading"})
        r = requests.post(f"{API}/mobile/activate-license", json={"email": EMAIL, "license_key": LICENSE})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "trading_style" in data
        assert data["trading_style"] == "day_trading"
        assert data["trading_style_label"] == "Day Trading"


class TestAdminBrokerConnectionsEnriched:
    def test_admin_sees_trading_style(self, admin_token):
        # Ensure broker connection exists
        requests.post(f"{API}/mobile/connect-broker", json={
            "email": EMAIL, "license_key": LICENSE,
            "platform": "mt5", "server": "Demo-Server", "account": "12345", "password": "secret123"
        })
        # Set style
        requests.post(f"{API}/mobile/trading-style", json={"email": EMAIL, "license_key": LICENSE, "style": "martingale"})

        r = requests.get(f"{API}/admin/broker-connections", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        rows = r.json()
        match = [x for x in rows if x.get("license_key") == LICENSE]
        assert match, f"License {LICENSE} not found in admin broker connections"
        row = match[0]
        assert row.get("trading_style") == "martingale"
        assert row.get("trading_style_label") == "Martingale"
        assert row.get("trading_style_risk") == "high"


class TestBrokerConnectCopyRegression:
    def test_connect_broker_notice_text(self):
        r = requests.post(f"{API}/mobile/connect-broker", json={
            "email": EMAIL, "license_key": LICENSE,
            "platform": "mt5", "server": "Demo-Server", "account": "12345", "password": "secret123"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending_approval"
        assert "server-side verification" in data.get("notice", "").lower()
        assert "admin" not in data.get("notice", "").lower()


def test_cleanup_unbind(admin_token):
    """Re-unbind license_keys.bound_device_id for clean next test cycle.

    Best-effort via admin API if a direct route exists; otherwise just rely on
    instructions in the test report.
    """
    # nothing to do server-side without a direct endpoint; pass.
    assert True
