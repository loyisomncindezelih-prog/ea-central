"""
EA-Central backend regression tests
Covers: auth (register, login, brute force, me, logout), dashboard summary, admin seed
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback to frontend/.env
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def fresh_user(session):
    """Register a brand new user and return creds + token"""
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_user_{suffix}@example.com"
    payload = {
        "username": f"test_{suffix}",
        "email": email,
        "country_code": "+1",
        "contact_number": "5551234567",
        "password": "Passw0rd!",
    }
    r = session.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": payload["password"], "token": data["access_token"], "user": data["user"]}


# ---------- root ----------
def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("service") == "ea-central"


# ---------- register ----------
def test_register_returns_user_and_token(fresh_user):
    assert fresh_user["token"]
    assert fresh_user["user"]["email"] == fresh_user["email"].lower()
    assert fresh_user["user"]["role"] == "mentor"
    assert "id" in fresh_user["user"]


def test_register_duplicate_email_409(session, fresh_user):
    payload = {
        "username": "dup",
        "email": fresh_user["email"],
        "country_code": "+1",
        "contact_number": "5551234567",
        "password": "Passw0rd!",
    }
    r = session.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"].lower()


def test_register_validation_missing_fields(session):
    r = session.post(f"{API}/auth/register", json={"email": "x@y.com"})
    assert r.status_code == 422
    body = r.json()
    assert "detail" in body
    # detail should be JSON-serializable list/string
    assert isinstance(body["detail"], (list, str))


def test_register_short_password(session):
    r = session.post(f"{API}/auth/register", json={
        "username": "shortpw",
        "email": f"TEST_short_{uuid.uuid4().hex[:6]}@x.com",
        "country_code": "+1",
        "contact_number": "5551234567",
        "password": "123",
    })
    assert r.status_code == 422


# ---------- login ----------
def test_login_admin_seeded(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["access_token"]
    assert data["user"]["email"] == ADMIN_EMAIL
    assert data["user"]["role"] == "admin"


def test_login_valid_fresh_user(session, fresh_user):
    r = session.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": fresh_user["password"]})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == fresh_user["email"].lower()


def test_login_wrong_password_401(session, fresh_user):
    r = session.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": "WrongPass!"})
    assert r.status_code == 401
    assert "invalid" in r.json()["detail"].lower()


def test_login_brute_force_lockout_429(session):
    # Use a fresh dedicated user to avoid interfering with other tests
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_bf_{suffix}@example.com"
    reg = session.post(f"{API}/auth/register", json={
        "username": f"bf_{suffix}",
        "email": email,
        "country_code": "+1",
        "contact_number": "5551234567",
        "password": "RightPass1!",
    })
    assert reg.status_code == 200

    last_status = None
    for _ in range(5):
        r = session.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        last_status = r.status_code
    # After 5 failures, next attempt should be 429
    r = session.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
    assert r.status_code == 429, f"expected 429 lockout, got {r.status_code} (prev {last_status}) body={r.text}"


# ---------- /auth/me ----------
def test_me_with_bearer(session, fresh_user):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {fresh_user['token']}"})
    assert r.status_code == 200
    assert r.json()["email"] == fresh_user["email"].lower()


def test_me_without_token_401():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---------- /auth/logout ----------
def test_logout_with_auth(fresh_user):
    r = requests.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {fresh_user['token']}"})
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_logout_without_auth_401():
    r = requests.post(f"{API}/auth/logout")
    assert r.status_code == 401


# ---------- dashboard ----------
def test_dashboard_summary_authed(fresh_user):
    r = requests.get(f"{API}/dashboard/summary", headers={"Authorization": f"Bearer {fresh_user['token']}"})
    assert r.status_code == 200
    data = r.json()
    for k in ["bot_status", "connected_clients", "trades_today", "win_rate", "recent_trades"]:
        assert k in data
    assert isinstance(data["recent_trades"], list)
    assert len(data["recent_trades"]) >= 1
    t0 = data["recent_trades"][0]
    for k in ["pair", "side", "lot", "pnl", "time"]:
        assert k in t0


def test_dashboard_summary_unauth_401():
    r = requests.get(f"{API}/dashboard/summary")
    assert r.status_code == 401
