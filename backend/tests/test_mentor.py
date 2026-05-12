"""
EA-Central mentor portal backend tests (iteration 3)
Covers:
- /api/mentor/stats shape + dynamic counts
- EA CRUD + 3-EA limit + cascade delete
- EA symbols (add, idempotency 400, delete)
- License key create (validation, 404 unknown EA, invalid plan)
- Key reactivate (sets expires per plan, lifetime->None)
- Key delete (frees slot)
- Auth gating: 401 unauth
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


# ---------- helpers / fixtures ----------
@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _register_and_approve(admin_headers, prefix="mentor"):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_{prefix}_{suffix}@example.com"
    pwd = "Passw0rd!"
    r = requests.post(f"{API}/auth/register", json={
        "username": f"{prefix}_{suffix}",
        "email": email,
        "country_code": "+1",
        "contact_number": "5551234567",
        "password": pwd,
    })
    assert r.status_code == 200, r.text
    uid = r.json()["user"]["id"]
    ar = requests.post(f"{API}/admin/users/{uid}/approve", headers=admin_headers)
    assert ar.status_code == 200
    lr = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert lr.status_code == 200
    return {
        "email": email,
        "id": uid,
        "token": lr.json()["access_token"],
    }


@pytest.fixture(scope="module")
def mentor(admin_headers):
    return _register_and_approve(admin_headers, "mentor")


@pytest.fixture(scope="module")
def H(mentor):
    return {"Authorization": f"Bearer {mentor['token']}", "Content-Type": "application/json"}


# ---------- auth gating ----------
def test_mentor_endpoints_require_auth():
    for path in ("/mentor/stats", "/mentor/eas", "/mentor/keys"):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} -> {r.status_code}"


# ---------- stats baseline ----------
def test_stats_shape(H):
    r = requests.get(f"{API}/mentor/stats", headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["license_usage"]["cap"] == 500
    assert isinstance(body["license_usage"]["generated"], int)
    assert body["ea_limit"] == 3
    assert isinstance(body["total_eas"], int)
    assert isinstance(body["active_subscriptions"], int)
    assert body["mentor_id"] and isinstance(body["mentor_id"], str)


# ---------- EA CRUD + limit ----------
def test_ea_create_and_list(H):
    r = requests.post(f"{API}/mentor/eas", headers=H, json={"name": "Scalper Pro v1.0"})
    assert r.status_code == 200, r.text
    ea = r.json()
    assert ea["name"] == "Scalper Pro v1.0"
    assert len(ea["private_code"]) == 32  # hex 16 bytes
    assert ea["symbols"] == []
    # list
    lr = requests.get(f"{API}/mentor/eas", headers=H)
    assert lr.status_code == 200
    assert any(e["id"] == ea["id"] for e in lr.json())


def test_ea_limit_enforced(H):
    # Already 1 EA from previous test. Add 2 more (total=3), 4th should fail.
    for i in range(2):
        r = requests.post(f"{API}/mentor/eas", headers=H, json={"name": f"EA Filler {i}"})
        assert r.status_code == 200, r.text
    # 4th should fail
    r = requests.post(f"{API}/mentor/eas", headers=H, json={"name": "Should Fail"})
    assert r.status_code == 400
    assert "limit" in r.json()["detail"].lower()


def test_stats_reflects_eas(H):
    r = requests.get(f"{API}/mentor/stats", headers=H)
    assert r.json()["total_eas"] == 3


# ---------- Symbols ----------
def test_symbols_add_idempotent_delete(H):
    eas = requests.get(f"{API}/mentor/eas", headers=H).json()
    ea_id = eas[0]["id"]
    # add lowercase -> upper
    r = requests.post(f"{API}/mentor/eas/{ea_id}/symbols", headers=H, json={"symbol": "xauusd"})
    assert r.status_code == 200
    assert "XAUUSD" in r.json()["symbols"]
    # duplicate -> 400
    r2 = requests.post(f"{API}/mentor/eas/{ea_id}/symbols", headers=H, json={"symbol": "XAUUSD"})
    assert r2.status_code == 400
    # delete
    r3 = requests.delete(f"{API}/mentor/eas/{ea_id}/symbols/XAUUSD", headers=H)
    assert r3.status_code == 200
    assert "XAUUSD" not in r3.json()["symbols"]


# ---------- License keys ----------
def test_key_create_invalid_plan(H):
    eas = requests.get(f"{API}/mentor/eas", headers=H).json()
    ea_id = eas[0]["id"]
    r = requests.post(f"{API}/mentor/keys", headers=H, json={
        "ea_id": ea_id, "holder_username": "alice", "plan": "10y"
    })
    assert r.status_code == 400


def test_key_create_unknown_ea_404(H):
    r = requests.post(f"{API}/mentor/keys", headers=H, json={
        "ea_id": "nonexistent-ea", "holder_username": "alice", "plan": "30d"
    })
    assert r.status_code == 404


def test_key_create_and_get(H):
    eas = requests.get(f"{API}/mentor/eas", headers=H).json()
    ea_id = eas[0]["id"]
    r = requests.post(f"{API}/mentor/keys", headers=H, json={
        "ea_id": ea_id, "holder_username": "alice", "plan": "30d"
    })
    assert r.status_code == 200, r.text
    k = r.json()
    assert k["key"].startswith("EAC-")
    assert len(k["key"].split("-")) == 5  # EAC + 4 groups
    assert k["activated"] is False
    assert k["status"] == "inactive"
    # GET single
    g = requests.get(f"{API}/mentor/keys/{k['id']}", headers=H)
    assert g.status_code == 200
    assert g.json()["id"] == k["id"]


def test_stats_reflects_generated(H):
    r = requests.get(f"{API}/mentor/stats", headers=H)
    assert r.json()["license_usage"]["generated"] >= 1


def test_key_reactivate_30d(H):
    eas = requests.get(f"{API}/mentor/eas", headers=H).json()
    ea_id = eas[0]["id"]
    # create
    c = requests.post(f"{API}/mentor/keys", headers=H, json={
        "ea_id": ea_id, "holder_username": "bob", "plan": "30d"
    }).json()
    # reactivate
    r = requests.post(f"{API}/mentor/keys/{c['id']}/reactivate", headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["activated"] is True
    assert body["status"] == "active"
    assert body["expires_at"] is not None
    # stats active should now include this
    s = requests.get(f"{API}/mentor/stats", headers=H).json()
    assert s["active_subscriptions"] >= 1


def test_key_reactivate_lifetime_no_expiry(H):
    eas = requests.get(f"{API}/mentor/eas", headers=H).json()
    ea_id = eas[0]["id"]
    c = requests.post(f"{API}/mentor/keys", headers=H, json={
        "ea_id": ea_id, "holder_username": "carol", "plan": "lifetime"
    }).json()
    r = requests.post(f"{API}/mentor/keys/{c['id']}/reactivate", headers=H)
    assert r.status_code == 200
    assert r.json()["expires_at"] is None
    assert r.json()["status"] == "active"


def test_key_delete_frees_slot(H):
    # create then delete
    eas = requests.get(f"{API}/mentor/eas", headers=H).json()
    ea_id = eas[0]["id"]
    before = requests.get(f"{API}/mentor/stats", headers=H).json()["license_usage"]["generated"]
    c = requests.post(f"{API}/mentor/keys", headers=H, json={
        "ea_id": ea_id, "holder_username": "todelete", "plan": "5d"
    }).json()
    mid = requests.get(f"{API}/mentor/stats", headers=H).json()["license_usage"]["generated"]
    assert mid == before + 1
    d = requests.delete(f"{API}/mentor/keys/{c['id']}", headers=H)
    assert d.status_code == 200
    after = requests.get(f"{API}/mentor/stats", headers=H).json()["license_usage"]["generated"]
    assert after == before


def test_ea_cascade_delete_keys(admin_headers):
    # fresh user to avoid mutating other tests
    m = _register_and_approve(admin_headers, "cascade")
    H = {"Authorization": f"Bearer {m['token']}", "Content-Type": "application/json"}
    ea = requests.post(f"{API}/mentor/eas", headers=H, json={"name": "EA Cascade"}).json()
    # create 3 keys
    for i in range(3):
        kr = requests.post(f"{API}/mentor/keys", headers=H, json={
            "ea_id": ea["id"], "holder_username": f"h{i}", "plan": "5d"
        })
        assert kr.status_code == 200
    assert requests.get(f"{API}/mentor/stats", headers=H).json()["license_usage"]["generated"] == 3
    # delete EA
    d = requests.delete(f"{API}/mentor/eas/{ea['id']}", headers=H)
    assert d.status_code == 200
    # keys should be cascade-deleted
    s = requests.get(f"{API}/mentor/stats", headers=H).json()
    assert s["license_usage"]["generated"] == 0
    assert s["total_eas"] == 0
    keys = requests.get(f"{API}/mentor/keys", headers=H).json()
    assert keys == []


def test_key_create_other_users_ea_404(admin_headers, H):
    # other user creates an EA
    other = _register_and_approve(admin_headers, "other")
    OH = {"Authorization": f"Bearer {other['token']}", "Content-Type": "application/json"}
    other_ea = requests.post(f"{API}/mentor/eas", headers=OH, json={"name": "Other EA"}).json()
    # main mentor tries to issue a key against other's EA
    r = requests.post(f"{API}/mentor/keys", headers=H, json={
        "ea_id": other_ea["id"], "holder_username": "x", "plan": "5d"
    })
    assert r.status_code == 404
