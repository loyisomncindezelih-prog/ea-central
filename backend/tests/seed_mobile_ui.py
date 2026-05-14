"""Seed a fresh approved mentor + license keys for Playwright UI test."""
import os, time, json, requests
BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://copy-trading-hub-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

def main():
    suffix = int(time.time())
    email = f"TEST_ui_mentor_{suffix}@test.com"
    pwd = "Passw0rd!"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "username": f"TEST_ui_{suffix}",
        "password": pwd, "country_code": "+27", "contact_number": "0810000000",
    }, timeout=20)
    r.raise_for_status()
    user_id = r.json()["user"]["id"]

    # admin approve
    at = requests.post(f"{API}/auth/login", json={"email":"admin@ea-central.com","password":"Admin@123"}, timeout=20).json()["access_token"]
    requests.post(f"{API}/admin/users/{user_id}/approve", headers={"Authorization":f"Bearer {at}"}, timeout=20).raise_for_status()

    # mentor login
    mt = requests.post(f"{API}/auth/login", json={"email":email,"password":pwd}, timeout=20).json()["access_token"]
    h = {"Authorization": f"Bearer {mt}"}

    ea = requests.post(f"{API}/mentor/eas", json={"name": "AlphaWave Pro"}, headers=h, timeout=20).json()
    k1 = requests.post(f"{API}/mentor/keys", json={"ea_id": ea["id"], "plan": "30d", "holder_username": "ui_client"}, headers=h, timeout=20).json()
    k2 = requests.post(f"{API}/mentor/keys", json={"ea_id": ea["id"], "plan": "3d", "holder_username": "ui_client2"}, headers=h, timeout=20).json()

    out = {"mentor_email": email, "password": pwd, "ea_name": ea["name"], "key_30d": k1["key"], "key_3d": k2["key"]}
    print(json.dumps(out))

if __name__ == "__main__":
    main()
