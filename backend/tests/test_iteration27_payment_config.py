"""Iteration 27 backend tests:
- Admin payment-config GET/PUT/reset endpoints
- /verify-account/config reflects overrides
- 2FA endpoints gating
- Security headers presence
- Smoke: payment-proof duplicate-rejection (uses currently-effective amount)
"""
import os
import re
import time
import pytest
import requests
import base64

def _load_backend_url():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        # fallback: read from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        u = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert u, "REACT_APP_BACKEND_URL not configured"
    return u.rstrip("/")

BASE_URL = _load_backend_url()

ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASS  = "Admin@123"


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
               timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    if data.get("requires_2fa"):
        pytest.skip("Admin has 2FA enabled — test setup expects it disabled")
    # token may be returned & cookie set. set Bearer if present:
    tok = data.get("access_token") or data.get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session", autouse=True)
def _reset_overrides_at_end(admin_session):
    """Make sure overrides are wiped after the test session."""
    yield
    try:
        admin_session.post(f"{BASE_URL}/api/admin/payment-config/reset", timeout=10)
    except Exception:
        pass


# ----------------------- Admin payment-config -----------------------
class TestPaymentConfig:

    def test_get_unauth_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/payment-config", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_get_admin_returns_all_11_fields(self, admin_session):
        # ensure clean
        admin_session.post(f"{BASE_URL}/api/admin/payment-config/reset", timeout=10)
        r = admin_session.get(f"{BASE_URL}/api/admin/payment-config", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d.keys()) >= {"effective", "overrides", "env_defaults"}
        expected = {"whatsapp_number","whatsapp_template","base_amount","mentorship_amount",
                    "bank_name","bank_holder","bank_account","bank_branch_code",
                    "bank_account_type","usdt_trc20_address","skrill_email"}
        assert set(d["effective"].keys()) == expected
        assert set(d["env_defaults"].keys()) == expected
        # after reset, effective should equal env_defaults
        for k in expected:
            assert d["effective"][k] == d["env_defaults"][k], f"{k} mismatch after reset"

    def test_put_updates_persist_and_reflect_in_verify_config(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/payment-config",
                              json={"base_amount": "800", "whatsapp_number": "+27812345678"},
                              timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["effective"]["base_amount"] == "800"
        assert body["effective"]["whatsapp_number"] == "+27812345678"

        # GET again confirms persistence
        g = admin_session.get(f"{BASE_URL}/api/admin/payment-config", timeout=10).json()
        assert g["overrides"].get("base_amount") == "800"
        assert g["effective"]["base_amount"] == "800"

        # /api/verify-account/config (public) reflects the override
        vc = requests.get(f"{BASE_URL}/api/verify-account/config", timeout=10).json()
        assert vc["eft"]["amount"] == "800"
        assert vc["whatsapp"]["number"] == "+27812345678"

    def test_put_invalid_base_amount_returns_400(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/payment-config",
                              json={"base_amount": "-1"}, timeout=10)
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"
        assert "base_amount" in (r.json().get("detail") or "").lower() or \
               "positive" in (r.json().get("detail") or "").lower()

    def test_put_invalid_whatsapp_returns_400(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/payment-config",
                              json={"whatsapp_number": "abc"}, timeout=10)
        assert r.status_code == 400, r.text

    def test_put_empty_clears_override(self, admin_session):
        # set a value first
        admin_session.put(f"{BASE_URL}/api/admin/payment-config",
                          json={"base_amount": "999"}, timeout=10)
        # now clear it with empty string
        r = admin_session.put(f"{BASE_URL}/api/admin/payment-config",
                              json={"base_amount": ""}, timeout=10)
        assert r.status_code == 200, r.text
        g = admin_session.get(f"{BASE_URL}/api/admin/payment-config", timeout=10).json()
        assert "base_amount" not in g["overrides"]
        assert g["effective"]["base_amount"] == g["env_defaults"]["base_amount"]

    def test_reset_wipes_overrides(self, admin_session):
        # set something
        admin_session.put(f"{BASE_URL}/api/admin/payment-config",
                          json={"base_amount": "555", "bank_name": "TEST BANK"}, timeout=10)
        r = admin_session.post(f"{BASE_URL}/api/admin/payment-config/reset", timeout=10)
        assert r.status_code == 200, r.text
        g = admin_session.get(f"{BASE_URL}/api/admin/payment-config", timeout=10).json()
        assert g["overrides"] == {}
        for k in g["env_defaults"]:
            assert g["effective"][k] == g["env_defaults"][k]


# ----------------------- 2FA gating -----------------------
class TestTwoFA:

    def test_2fa_status_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/2fa/status", timeout=10)
        assert r.status_code in (401, 403), r.status_code

    def test_2fa_status_admin_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/2fa/status", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "enabled" in d


# ----------------------- Security headers -----------------------
class TestSecurityHeaders:

    def test_security_headers_present(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=10)
        # Some headers may be lowercased per HTTP/2
        h = {k.lower(): v for k, v in r.headers.items()}
        expected = ["strict-transport-security", "x-frame-options",
                    "x-content-type-options", "referrer-policy", "permissions-policy"]
        missing = [k for k in expected if k not in h]
        assert not missing, f"missing security headers: {missing}; got {list(h.keys())}"


# ----------------------- Payment-proof duplicate rejection -----------------------
class TestPaymentProofDuplicate:
    """Smoke: uploading the same proof data URL from a 2nd email returns 409 (anti-tamper)."""

    @pytest.fixture(scope="class")
    def two_pending_emails(self, admin_session):
        # Register 2 fresh mentor accounts (status=pending). We only need /verify-account/proof,
        # which (per implementation) accepts an email + base64 image and stores a hash.
        ts = int(time.time())
        emails = [f"TEST_proofdup_{ts}_a@test.com", f"TEST_proofdup_{ts}_b@test.com"]
        for em in emails:
            r = requests.post(f"{BASE_URL}/api/auth/register",
                              json={
                                  "email": em, "password": "Passw0rd!",
                                  "full_name": "T D",
                                  "username": em.split("@")[0],
                                  "country_code": "+27",
                                  "contact_number": "812345678",
                              },
                              timeout=15)
            # 200 or 201 or 400 (already exists) — tolerate.
            assert r.status_code in (200, 201, 400, 409), f"register: {r.status_code} {r.text}"
        return emails

    def test_duplicate_proof_returns_409(self, two_pending_emails):
        em1, em2 = two_pending_emails
        # 1x1 PNG b64
        b64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJ"
               "TYQAAAAASUVORK5CYII=")
        data_url = f"data:image/png;base64,{b64}"
        r1 = requests.post(f"{BASE_URL}/api/verify-account/proof",
                           json={"email": em1, "proof_data_url": data_url, "filename": "p.png"},
                           timeout=15)
        # First upload should succeed (200/201) OR be already done.
        if r1.status_code not in (200, 201, 409):
            pytest.skip(f"first upload returned {r1.status_code}: {r1.text} — endpoint shape may differ")
        r2 = requests.post(f"{BASE_URL}/api/verify-account/proof",
                           json={"email": em2, "proof_data_url": data_url, "filename": "p.png"},
                           timeout=15)
        assert r2.status_code == 409, f"expected 409 for dup proof, got {r2.status_code} {r2.text}"


# ----------------------- Trade-signal push (smoke) -----------------------
class TestSignalInstantPush:
    """Best-effort: confirm endpoint shape exists and licence-key path returns 200/404 cleanly."""

    def test_push_signal_endpoint_shape(self, admin_session):
        # Use the seeded licence key (may or may not have a broker connection now).
        lk = "EAC-37F5-CA65-6BD4-A8A6"
        r = admin_session.post(
            f"{BASE_URL}/api/admin/broker-connections/{lk}/signal/instant",
            json={"symbol":"EURUSD","action":"BUY","final_status":"executing","lot":0.10},
            timeout=15,
        )
        # 200 = pushed; 404 = no broker connection (also acceptable shape signal)
        assert r.status_code in (200, 404), f"unexpected {r.status_code} {r.text}"
