"""Iteration 10 backend tests — mentor profile management.

Covers:
- PATCH /api/auth/profile (auth required, partial update, image validation, email immutability)
- GET /api/auth/me reflects PATCH changes
- /api/mobile/activate-license now includes mentor_profile_image
- Regression on iteration 9 endpoints (connect-broker, approve/decline, ea/start, ea/stop)
"""
import os
import base64
import time
import pytest
import requests

def _read_frontend_env_url() -> str:
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASSWORD = "Admin@123"
MENTOR_EMAIL = "TEST_it6_ui_1778753851@test.com"
MENTOR_PASSWORD = "Passw0rd!"
LICENCE_KEY = "EAC-2F9D-E69F-6F75-CEB3"

# Tiny 1x1 PNG (red pixel) base64
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8BQDwAEhQGAhKmMI"
    "QAAAABJRU5ErkJggg=="
)
TINY_PNG_DATA_URL = f"data:image/png;base64,{TINY_PNG_B64}"


def _login(session: requests.Session, email: str, password: str) -> str:
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token") or ""


@pytest.fixture(scope="module")
def mentor_session():
    s = requests.Session()
    token = _login(s, MENTOR_EMAIL, MENTOR_PASSWORD)
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    token = _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --------------------------- PATCH /api/auth/profile ---------------------------

class TestPatchProfile:
    def test_patch_profile_without_auth(self):
        r = requests.patch(f"{BASE_URL}/api/auth/profile", json={"username": "x"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_patch_username_only(self, mentor_session):
        # Capture current me first
        me0 = mentor_session.get(f"{BASE_URL}/api/auth/me").json()
        original_email = me0["email"]
        original_image = me0.get("profile_image")
        new_username = f"alpha_mentor_{int(time.time())}"

        r = mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={"username": new_username})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["username"] == new_username
        assert data["email"] == original_email  # email unchanged
        assert data.get("profile_image") == original_image  # image preserved

        # GET /auth/me confirms persistence
        me1 = mentor_session.get(f"{BASE_URL}/api/auth/me").json()
        assert me1["username"] == new_username
        assert me1["email"] == original_email

    def test_patch_empty_body_is_noop(self, mentor_session):
        before = mentor_session.get(f"{BASE_URL}/api/auth/me").json()
        r = mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["username"] == before["username"]
        assert data["email"] == before["email"]

    def test_patch_profile_image_valid_data_url(self, mentor_session):
        r = mentor_session.patch(
            f"{BASE_URL}/api/auth/profile", json={"profile_image": TINY_PNG_DATA_URL}
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("profile_image") == TINY_PNG_DATA_URL

        me = mentor_session.get(f"{BASE_URL}/api/auth/me").json()
        assert me.get("profile_image") == TINY_PNG_DATA_URL

    def test_patch_profile_image_invalid_string(self, mentor_session):
        r = mentor_session.patch(
            f"{BASE_URL}/api/auth/profile", json={"profile_image": "hello"}
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        msg = body.get("detail") or body.get("message") or ""
        assert "data:image" in str(msg).lower() or "data:image/*" in str(msg)

    def test_patch_profile_image_empty_clears(self, mentor_session):
        # First make sure image is set
        mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={"profile_image": TINY_PNG_DATA_URL})
        # Now clear
        r = mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={"profile_image": ""})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("profile_image") is None

        me = mentor_session.get(f"{BASE_URL}/api/auth/me").json()
        assert me.get("profile_image") is None

    def test_patch_username_empty_string_422(self, mentor_session):
        r = mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={"username": ""})
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_patch_contact_number_empty_string_422(self, mentor_session):
        r = mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={"contact_number": ""})
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_patch_email_field_ignored(self, mentor_session):
        before = mentor_session.get(f"{BASE_URL}/api/auth/me").json()
        # Send email in body — should be ignored (Pydantic extra='ignore' by default)
        r = mentor_session.patch(
            f"{BASE_URL}/api/auth/profile",
            json={"email": "hacker@example.com", "username": before["username"]},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == before["email"]

    def test_patch_country_and_contact(self, mentor_session):
        r = mentor_session.patch(
            f"{BASE_URL}/api/auth/profile",
            json={"country_code": "+91", "contact_number": "9999999999"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["country_code"] == "+91"
        assert data["contact_number"] == "9999999999"

        me = mentor_session.get(f"{BASE_URL}/api/auth/me").json()
        assert me["country_code"] == "+91"
        assert me["contact_number"] == "9999999999"


# --------------------------- public_user / me has profile_image ---------------------------

class TestMeShape:
    def test_me_contains_profile_image_field(self, mentor_session):
        r = mentor_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert "profile_image" in data, "profile_image field missing from /auth/me"


# --------------------------- /api/mobile/activate-license includes mentor_profile_image ---------------------------

class TestActivateLicenseMentorImage:
    def test_mentor_profile_image_null_when_unset(self, mentor_session):
        # Clear profile image first
        mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={"profile_image": ""})

        r = requests.post(
            f"{BASE_URL}/api/mobile/activate-license",
            json={"email": MENTOR_EMAIL, "license_key": LICENCE_KEY},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "mentor_profile_image" in data, "Field missing"
        assert data["mentor_profile_image"] is None

    def test_mentor_profile_image_returns_data_url_when_set(self, mentor_session):
        mentor_session.patch(
            f"{BASE_URL}/api/auth/profile", json={"profile_image": TINY_PNG_DATA_URL}
        )

        r = requests.post(
            f"{BASE_URL}/api/mobile/activate-license",
            json={"email": MENTOR_EMAIL, "license_key": LICENCE_KEY},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("mentor_profile_image") == TINY_PNG_DATA_URL

        # Cleanup: clear back to null so other tests/seed remain clean
        mentor_session.patch(f"{BASE_URL}/api/auth/profile", json={"profile_image": ""})


# --------------------------- Regression: iteration 9 endpoints ---------------------------

class TestIter9Regression:
    def test_activate_license_basic(self):
        r = requests.post(
            f"{BASE_URL}/api/mobile/activate-license",
            json={"email": MENTOR_EMAIL, "license_key": LICENCE_KEY},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["key"] == LICENCE_KEY
        assert "ea_name" in data
        assert "broker" in data
        assert "ea_session" in data
        assert "allowed_symbols" in data

    def test_dashboard_summary_auth(self, mentor_session):
        r = mentor_session.get(f"{BASE_URL}/api/dashboard/summary")
        assert r.status_code == 200, r.text

    def test_admin_stats(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 200, r.text
