"""
EA-Central backend regression tests (iteration 2)
Covers:
- auth: register (pending, no token), login (pending=403, approved=200), brute-force, /me, /logout
- admin: stats, users list, approve, reject, role enforcement
- dashboard summary (mocked) auth + unauth
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@ea-central.com"
ADMIN_PASSWORD = "Admin@123"


# ---------- session/admin fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# Register a fresh user (pending) — returns email/password/user dict (no token)
def _register(session, prefix="user"):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_{prefix}_{suffix}@example.com"
    payload = {
        "username": f"{prefix}_{suffix}",
        "email": email,
        "country_code": "+1",
        "contact_number": "5551234567",
        "password": "Passw0rd!",
    }
    r = session.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    return {"email": email.lower(), "password": payload["password"], "body": r.json()}


@pytest.fixture(scope="module")
def pending_user(session):
    return _register(session, prefix="pending")


@pytest.fixture(scope="module")
def approved_user(session, admin_headers):
    u = _register(session, prefix="approved")
    user_id = u["body"]["user"]["id"]
    r = requests.post(f"{API}/admin/users/{user_id}/approve", headers=admin_headers)
    assert r.status_code == 200, f"approve failed {r.status_code} {r.text}"
    # login now
    lr = requests.post(f"{API}/auth/login",
                       headers={"Content-Type": "application/json"},
                       json={"email": u["email"], "password": u["password"]})
    assert lr.status_code == 200, f"login after approve failed {lr.status_code} {lr.text}"
    u["token"] = lr.json()["access_token"]
    u["id"] = user_id
    return u


# ---------- root ----------
def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("service") == "ea-central"


# ---------- register: now creates pending user with NO token ----------
def test_register_creates_pending_no_token(pending_user):
    body = pending_user["body"]
    assert body.get("pending") is True
    assert "access_token" not in body, f"register should NOT return access_token, got {body}"
    assert body["user"]["email"] == pending_user["email"]
    assert body["user"]["status"] == "pending"
    assert body["user"]["role"] == "mentor"
    assert "id" in body["user"]
    # ensure password_hash and _id not leaked
    assert "password_hash" not in body["user"]
    assert "_id" not in body["user"]


def test_register_duplicate_email_409(session, pending_user):
    r = session.post(f"{API}/auth/register", json={
        "username": "dup",
        "email": pending_user["email"],
        "country_code": "+1",
        "contact_number": "5551234567",
        "password": "Passw0rd!",
    })
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"].lower()


def test_register_validation_missing_fields(session):
    r = session.post(f"{API}/auth/register", json={"email": "x@y.com"})
    assert r.status_code == 422


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
def test_login_pending_user_403(session, pending_user):
    r = session.post(f"{API}/auth/login", json={
        "email": pending_user["email"], "password": pending_user["password"]
    })
    assert r.status_code == 403, f"expected 403 for pending, got {r.status_code} {r.text}"
    assert "approval" in r.json()["detail"].lower()


def test_login_admin_seeded(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["access_token"]
    assert data["user"]["email"] == ADMIN_EMAIL
    assert data["user"]["role"] == "admin"
    assert data["user"]["status"] == "approved"


def test_login_approved_user_200(session, approved_user):
    r = session.post(f"{API}/auth/login", json={
        "email": approved_user["email"], "password": approved_user["password"]
    })
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["user"]["status"] == "approved"


def test_login_wrong_password_401(session, approved_user):
    r = session.post(f"{API}/auth/login", json={
        "email": approved_user["email"], "password": "WrongPass!"
    })
    assert r.status_code == 401


def test_login_brute_force_lockout_429(session, admin_headers):
    # register + approve a dedicated user, then trigger 5 wrong attempts
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
    user_id = reg.json()["user"]["id"]
    # Approve so login proceeds past the status check
    ar = requests.post(f"{API}/admin/users/{user_id}/approve", headers=admin_headers)
    assert ar.status_code == 200

    for _ in range(5):
        session.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
    r = session.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
    assert r.status_code == 429, f"expected 429 lockout, got {r.status_code} body={r.text}"


# ---------- /auth/me ----------
def test_me_with_bearer(approved_user):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {approved_user['token']}"})
    assert r.status_code == 200
    assert r.json()["email"] == approved_user["email"]


def test_me_without_token_401():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---------- /auth/logout ----------
def test_logout_with_auth(approved_user):
    r = requests.post(f"{API}/auth/logout",
                      headers={"Authorization": f"Bearer {approved_user['token']}"})
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_logout_without_auth_401():
    r = requests.post(f"{API}/auth/logout")
    assert r.status_code == 401


# ---------- dashboard ----------
def test_dashboard_summary_authed(approved_user):
    r = requests.get(f"{API}/dashboard/summary",
                     headers={"Authorization": f"Bearer {approved_user['token']}"})
    assert r.status_code == 200
    data = r.json()
    for k in ["bot_status", "connected_clients", "trades_today", "win_rate", "recent_trades"]:
        assert k in data
    assert isinstance(data["recent_trades"], list) and len(data["recent_trades"]) >= 1


def test_dashboard_summary_unauth_401():
    r = requests.get(f"{API}/dashboard/summary")
    assert r.status_code == 401


# ---------- ADMIN endpoints ----------
def test_admin_stats_requires_auth():
    r = requests.get(f"{API}/admin/stats")
    assert r.status_code == 401


def test_admin_stats_forbids_non_admin(approved_user):
    # approved_user is role=mentor; need a fresh token (previous one was logged out)
    lr = requests.post(f"{API}/auth/login",
                       headers={"Content-Type": "application/json"},
                       json={"email": approved_user["email"], "password": approved_user["password"]})
    assert lr.status_code == 200
    tok = lr.json()["access_token"]
    r = requests.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403
    assert "admin" in r.json()["detail"].lower()


def test_admin_stats_shape(admin_headers):
    r = requests.get(f"{API}/admin/stats", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    for k in ("pending", "approved", "rejected", "total"):
        assert k in body and isinstance(body[k], int)
    assert body["total"] >= body["pending"] + body["approved"] + body["rejected"] - 1  # allow rounding edge


def test_admin_list_users_no_filter(admin_headers):
    r = requests.get(f"{API}/admin/users", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    sample = body[0]
    assert "password_hash" not in sample
    assert "_id" not in sample
    assert "id" in sample and "email" in sample and "status" in sample


def test_admin_list_users_status_filter(admin_headers, session):
    # ensure at least one pending exists
    _register(session, prefix="filter")
    r = requests.get(f"{API}/admin/users?status=pending", headers=admin_headers)
    assert r.status_code == 200
    rows = r.json()
    assert all(u["status"] == "pending" for u in rows), [u["status"] for u in rows]


def test_admin_approve_flow(admin_headers, session):
    u = _register(session, prefix="approveflow")
    uid = u["body"]["user"]["id"]
    r = requests.post(f"{API}/admin/users/{uid}/approve", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    # verify via list filter
    rows = requests.get(f"{API}/admin/users?status=approved", headers=admin_headers).json()
    found = next((x for x in rows if x["id"] == uid), None)
    assert found is not None and found["status"] == "approved"
    assert found.get("approved_at")
    # login now works
    lr = requests.post(f"{API}/auth/login",
                       headers={"Content-Type": "application/json"},
                       json={"email": u["email"], "password": u["password"]})
    assert lr.status_code == 200


def test_admin_reject_flow(admin_headers, session):
    u = _register(session, prefix="rejectflow")
    uid = u["body"]["user"]["id"]
    r = requests.post(f"{API}/admin/users/{uid}/reject", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"
    # login should now return 403 with rejected message
    lr = requests.post(f"{API}/auth/login",
                       headers={"Content-Type": "application/json"},
                       json={"email": u["email"], "password": u["password"]})
    assert lr.status_code == 403
    assert "reject" in lr.json()["detail"].lower()


def test_admin_approve_unknown_user_404(admin_headers):
    r = requests.post(f"{API}/admin/users/does-not-exist-xyz/approve", headers=admin_headers)
    assert r.status_code == 404


def test_admin_endpoints_forbid_non_admin(approved_user):
    # use fresh token
    lr = requests.post(f"{API}/auth/login",
                       headers={"Content-Type": "application/json"},
                       json={"email": approved_user["email"], "password": approved_user["password"]})
    tok = lr.json()["access_token"]
    headers = {"Authorization": f"Bearer {tok}"}
    for path in ("/admin/stats", "/admin/users"):
        r = requests.get(f"{API}{path}", headers=headers)
        assert r.status_code == 403, f"{path} -> {r.status_code}"
    r = requests.post(f"{API}/admin/users/{approved_user['id']}/approve", headers=headers)
    assert r.status_code == 403
