from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import secrets
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ----------------------- DB -----------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


# ----------------------- App -----------------------
app = FastAPI(title="ea-central API")
api_router = APIRouter(prefix="/api")


# ----------------------- Auth helpers -----------------------
JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 15
REFRESH_TTL_DAYS = 7
MAX_FAILED = 5
LOCKOUT_MIN = 15


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=ACCESS_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=REFRESH_TTL_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def public_user(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "username": doc["username"],
        "email": doc["email"],
        "country_code": doc.get("country_code", ""),
        "contact_number": doc.get("contact_number", ""),
        "role": doc.get("role", "mentor"),
        "status": doc.get("status", "approved"),
        "created_at": doc["created_at"],
        "approved_at": doc.get("approved_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        status = user.get("status", "approved")
        if status != "approved":
            raise HTTPException(status_code=403, detail="Account not approved")
        return public_user(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ----------------------- Pydantic schemas -----------------------
class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    username: str = Field(min_length=2, max_length=40)
    email: EmailStr
    country_code: str = Field(min_length=2, max_length=6)
    contact_number: str = Field(min_length=4, max_length=20)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    user: dict
    access_token: str


# ----------------------- Brute-force tracking -----------------------
async def is_locked(identifier: str) -> bool:
    rec = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if not rec:
        return False
    if rec.get("count", 0) >= MAX_FAILED:
        locked_until = rec.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            return True
        await db.login_attempts.delete_one({"identifier": identifier})
    return False


async def record_failure(identifier: str) -> None:
    rec = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    count = (rec or {}).get("count", 0) + 1
    update = {"identifier": identifier, "count": count}
    if count >= MAX_FAILED:
        update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MIN)).isoformat()
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)


async def clear_failures(identifier: str) -> None:
    await db.login_attempts.delete_one({"identifier": identifier})


# ----------------------- Auth endpoints -----------------------
@api_router.post("/auth/register")
async def register(payload: RegisterIn):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "username": payload.username.strip(),
        "email": email,
        "country_code": payload.country_code.strip(),
        "contact_number": payload.contact_number.strip(),
        "password_hash": hash_password(payload.password),
        "role": "mentor",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)

    # Do not log the user in — admin must approve first.
    return {"user": public_user(doc), "pending": True}


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip", "").strip()
    if real:
        return real
    return request.client.host if request.client else "unknown"


@api_router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower()
    ip = _client_ip(request)
    identifier = f"{ip}:{email}"

    if await is_locked(identifier):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failure(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    status = user.get("status", "approved")
    if status == "pending":
        await clear_failures(identifier)
        raise HTTPException(status_code=403, detail="Your account is awaiting admin approval. You'll be notified once it's approved.")
    if status == "rejected":
        await clear_failures(identifier)
        raise HTTPException(status_code=403, detail="Your account has been rejected. Please contact support.")

    await clear_failures(identifier)
    access = create_access_token(user["id"], email)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}


@api_router.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ----------------------- Dashboard / preview placeholder -----------------------
@api_router.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    return {
        "bot_status": "online",
        "connected_clients": 12,
        "trades_today": 34,
        "win_rate": 68.5,
        "recent_trades": [
            {"pair": "EURUSD", "side": "BUY",  "lot": 0.10, "pnl": 24.50, "time": "10:24"},
            {"pair": "XAUUSD", "side": "SELL", "lot": 0.05, "pnl": 71.20, "time": "10:11"},
            {"pair": "GBPJPY", "side": "BUY",  "lot": 0.20, "pnl": -8.30, "time": "09:58"},
            {"pair": "BTCUSD", "side": "BUY",  "lot": 0.01, "pnl": 132.10, "time": "09:42"},
            {"pair": "USDJPY", "side": "SELL", "lot": 0.15, "pnl": 12.80, "time": "09:20"},
        ],
    }


# ----------------------- Mentor portal: EAs + License keys -----------------------
EA_LIMIT_PER_USER = 3
KEY_CAP_PER_USER = 500

PLAN_DAYS = {
    "3d": 3, "5d": 5, "30d": 30,
    "3m": 90, "6m": 180, "1y": 365,
    "lifetime": None,
}
PLAN_LABEL = {
    "3d": "3 Days", "5d": "5 Days", "30d": "30 Days",
    "3m": "3 Months", "6m": "6 Months", "1y": "1 Year",
    "lifetime": "Lifetime",
}


def mentor_id_for(user_id: str) -> str:
    # Stable 6-digit ID derived from user UUID
    n = int(user_id.replace("-", "")[:8], 16) % 900000 + 100000
    return str(n)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def public_ea(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "name": doc["name"],
        "private_code": doc["private_code"],
        "symbols": doc.get("symbols", []),
        "created_at": doc["created_at"],
    }


def make_license_key() -> str:
    raw = secrets.token_hex(8).upper()  # 16 hex chars
    return "EAC-" + "-".join([raw[i:i + 4] for i in range(0, 16, 4)])


def key_status(doc: dict) -> str:
    if not doc.get("activated"):
        return "inactive"
    exp = parse_iso(doc.get("expires_at"))
    if exp is None:
        return "active"  # lifetime
    return "active" if exp > datetime.now(timezone.utc) else "expired"


def public_key(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "key": doc["key"],
        "ea_id": doc["ea_id"],
        "ea_name": doc["ea_name"],
        "holder_username": doc["holder_username"],
        "plan": doc["plan"],
        "plan_label": PLAN_LABEL.get(doc["plan"], doc["plan"]),
        "activated": bool(doc.get("activated", False)),
        "activated_at": doc.get("activated_at"),
        "expires_at": doc.get("expires_at"),
        "status": key_status(doc),
        "created_at": doc["created_at"],
    }


async def is_key_active(doc: dict) -> bool:
    return key_status(doc) == "active"


# ---------- Mentor stats ----------
@api_router.get("/mentor/stats")
async def mentor_stats(user: dict = Depends(get_current_user)):
    uid = user["id"]
    total_eas = await db.eas.count_documents({"owner_id": uid})
    generated = await db.license_keys.count_documents({"owner_id": uid})
    keys = await db.license_keys.find({"owner_id": uid, "activated": True}, {"_id": 0}).to_list(KEY_CAP_PER_USER + 1)
    active = sum(1 for k in keys if key_status(k) == "active")
    return {
        "license_usage": {"generated": generated, "cap": KEY_CAP_PER_USER},
        "active_subscriptions": active,
        "total_eas": total_eas,
        "ea_limit": EA_LIMIT_PER_USER,
        "mentor_id": mentor_id_for(uid),
    }


# ---------- EAs ----------
class EACreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)


@api_router.get("/mentor/eas")
async def list_eas(user: dict = Depends(get_current_user)):
    docs = await db.eas.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    out = []
    for d in docs:
        users = await db.license_keys.count_documents({"owner_id": user["id"], "ea_id": d["id"]})
        keys = await db.license_keys.find(
            {"owner_id": user["id"], "ea_id": d["id"], "activated": True}, {"_id": 0}
        ).to_list(KEY_CAP_PER_USER + 1)
        active = sum(1 for k in keys if key_status(k) == "active")
        out.append({**public_ea(d), "users": users, "active": active})
    return out


@api_router.post("/mentor/eas")
async def create_ea(payload: EACreateIn, user: dict = Depends(get_current_user)):
    count = await db.eas.count_documents({"owner_id": user["id"]})
    if count >= EA_LIMIT_PER_USER:
        raise HTTPException(status_code=400, detail=f"EA limit reached ({EA_LIMIT_PER_USER}). Delete an EA to add a new one.")
    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "name": payload.name.strip(),
        "private_code": secrets.token_hex(16),
        "symbols": [],
        "created_at": now_iso(),
    }
    await db.eas.insert_one(doc)
    return public_ea(doc)


@api_router.get("/mentor/eas/{ea_id}")
async def get_ea(ea_id: str, user: dict = Depends(get_current_user)):
    doc = await db.eas.find_one({"id": ea_id, "owner_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="EA not found")
    return public_ea(doc)


@api_router.delete("/mentor/eas/{ea_id}")
async def delete_ea(ea_id: str, user: dict = Depends(get_current_user)):
    doc = await db.eas.find_one({"id": ea_id, "owner_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="EA not found")
    await db.eas.delete_one({"id": ea_id, "owner_id": user["id"]})
    # Cascade: drop all keys for this EA
    await db.license_keys.delete_many({"owner_id": user["id"], "ea_id": ea_id})
    return {"ok": True}


class SymbolIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)


@api_router.post("/mentor/eas/{ea_id}/symbols")
async def add_symbol(ea_id: str, payload: SymbolIn, user: dict = Depends(get_current_user)):
    sym = payload.symbol.strip().upper()
    doc = await db.eas.find_one({"id": ea_id, "owner_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="EA not found")
    if sym in doc.get("symbols", []):
        raise HTTPException(status_code=400, detail=f"{sym} already in this EA")
    await db.eas.update_one(
        {"id": ea_id, "owner_id": user["id"]},
        {"$addToSet": {"symbols": sym}},
    )
    updated = await db.eas.find_one({"id": ea_id, "owner_id": user["id"]}, {"_id": 0})
    return public_ea(updated)


@api_router.delete("/mentor/eas/{ea_id}/symbols/{symbol}")
async def remove_symbol(ea_id: str, symbol: str, user: dict = Depends(get_current_user)):
    sym = symbol.strip().upper()
    result = await db.eas.update_one(
        {"id": ea_id, "owner_id": user["id"]},
        {"$pull": {"symbols": sym}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="EA not found")
    updated = await db.eas.find_one({"id": ea_id, "owner_id": user["id"]}, {"_id": 0})
    return public_ea(updated)


# ---------- License keys ----------
class KeyCreateIn(BaseModel):
    ea_id: str
    holder_username: str = Field(min_length=1, max_length=80)
    plan: str


@api_router.get("/mentor/keys")
async def list_keys(user: dict = Depends(get_current_user)):
    docs = await db.license_keys.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(KEY_CAP_PER_USER + 1)
    return [public_key(d) for d in docs]


@api_router.get("/mentor/keys/{key_id}")
async def get_key(key_id: str, user: dict = Depends(get_current_user)):
    doc = await db.license_keys.find_one({"id": key_id, "owner_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
    return public_key(doc)


@api_router.post("/mentor/keys")
async def create_key(payload: KeyCreateIn, user: dict = Depends(get_current_user)):
    if payload.plan not in PLAN_DAYS:
        raise HTTPException(status_code=400, detail="Invalid subscription plan")
    count = await db.license_keys.count_documents({"owner_id": user["id"]})
    if count >= KEY_CAP_PER_USER:
        raise HTTPException(status_code=400, detail=f"License key cap reached ({KEY_CAP_PER_USER}).")
    ea = await db.eas.find_one({"id": payload.ea_id, "owner_id": user["id"]}, {"_id": 0})
    if not ea:
        raise HTTPException(status_code=404, detail="Selected EA not found")

    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "ea_id": ea["id"],
        "ea_name": ea["name"],
        "holder_username": payload.holder_username.strip(),
        "plan": payload.plan,
        "key": make_license_key(),
        "activated": False,
        "activated_at": None,
        "expires_at": None,
        "created_at": now_iso(),
    }
    await db.license_keys.insert_one(doc)
    return public_key(doc)


@api_router.post("/mentor/keys/{key_id}/reactivate")
async def reactivate_key(key_id: str, user: dict = Depends(get_current_user)):
    doc = await db.license_keys.find_one({"id": key_id, "owner_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
    days = PLAN_DAYS.get(doc["plan"])
    expires = None
    if days is not None:
        expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    await db.license_keys.update_one(
        {"id": key_id, "owner_id": user["id"]},
        {"$set": {
            "activated": True,
            "activated_at": now_iso(),
            "expires_at": expires,
        }},
    )
    updated = await db.license_keys.find_one({"id": key_id, "owner_id": user["id"]}, {"_id": 0})
    return public_key(updated)


@api_router.delete("/mentor/keys/{key_id}")
async def delete_key(key_id: str, user: dict = Depends(get_current_user)):
    result = await db.license_keys.delete_one({"id": key_id, "owner_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"ok": True}


# ----------------------- Public mobile EA app endpoints (no auth header) -----------------------
class MobileEmailIn(BaseModel):
    email: EmailStr


class MobileActivateIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)


@api_router.post("/mobile/check-email")
async def mobile_check_email(payload: MobileEmailIn):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")
    if user.get("status") != "approved":
        raise HTTPException(status_code=403, detail="This account is pending admin approval. You'll be able to use the Mobile EA once it's approved.")
    return {"ok": True, "username": user["username"]}


@api_router.post("/mobile/activate-license")
async def mobile_activate_license(payload: MobileActivateIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or user.get("status") != "approved":
        raise HTTPException(status_code=403, detail="Account not authorised")

    key_doc = await db.license_keys.find_one(
        {"key": license_key, "owner_id": user["id"]}, {"_id": 0}
    )
    if not key_doc:
        raise HTTPException(status_code=404, detail="Invalid licence key for this account")

    # Auto-activate on first use
    if not key_doc.get("activated"):
        days = PLAN_DAYS.get(key_doc["plan"])
        expires = None if days is None else (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        await db.license_keys.update_one(
            {"id": key_doc["id"]},
            {"$set": {"activated": True, "activated_at": now_iso(), "expires_at": expires}},
        )
        key_doc = await db.license_keys.find_one({"id": key_doc["id"]}, {"_id": 0})

    if key_status(key_doc) == "expired":
        raise HTTPException(status_code=410, detail="Licence has expired. Please contact your mentor for a new key.")

    return {
        "ea_id": key_doc["ea_id"],
        "ea_name": key_doc["ea_name"],
        "key": key_doc["key"],
        "plan_label": PLAN_LABEL.get(key_doc["plan"], key_doc["plan"]),
        "plan": key_doc["plan"],
        "expires_at": key_doc.get("expires_at"),
        "holder_username": key_doc["holder_username"],
        "mentor_username": user["username"],
    }


# ----------------------- Admin endpoints -----------------------
@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(get_admin_user)):
    pending = await db.users.count_documents({"status": "pending"})
    approved = await db.users.count_documents({"status": "approved"})
    rejected = await db.users.count_documents({"status": "rejected"})
    total = await db.users.count_documents({})
    return {"pending": pending, "approved": approved, "rejected": rejected, "total": total}


@api_router.get("/admin/users")
async def admin_list_users(
    status: Optional[str] = None,
    _: dict = Depends(get_admin_user),
):
    query = {}
    if status in ("pending", "approved", "rejected"):
        query["status"] = status
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    # Ensure legacy users have a status field surfaced
    for u in users:
        u.setdefault("status", "approved")
    return users


@api_router.post("/admin/users/{user_id}/approve")
async def admin_approve_user(user_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": admin["id"],
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "user_id": user_id, "status": "approved"}


@api_router.post("/admin/users/{user_id}/reject")
async def admin_reject_user(user_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "status": "rejected",
            "rejected_at": datetime.now(timezone.utc).isoformat(),
            "rejected_by": admin["id"],
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "user_id": user_id, "status": "rejected"}


@api_router.get("/")
async def root():
    return {"service": "ea-central", "status": "ok"}


# ----------------------- App wiring -----------------------
app.include_router(api_router)

cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("ea-central")


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.eas.create_index([("owner_id", 1), ("created_at", -1)])
    await db.license_keys.create_index([("owner_id", 1), ("created_at", -1)])
    await db.license_keys.create_index([("owner_id", 1), ("ea_id", 1)])

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ea-central.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if not existing:
        now = datetime.now(timezone.utc).isoformat()
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": "admin",
            "email": admin_email,
            "country_code": "+1",
            "contact_number": "0000000000",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "status": "approved",
            "approved_at": now,
            "created_at": now,
        })
        logger.info("Admin seeded: %s", admin_email)
    else:
        updates = {}
        if not verify_password(admin_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
        if existing.get("role") != "admin":
            updates["role"] = "admin"
        if existing.get("status") != "approved":
            updates["status"] = "approved"
            updates["approved_at"] = datetime.now(timezone.utc).isoformat()
        if updates:
            await db.users.update_one({"email": admin_email}, {"$set": updates})
            logger.info("Admin record updated: %s", admin_email)

    # Backfill: legacy users without a status field => approved
    await db.users.update_many(
        {"status": {"$exists": False}},
        {"$set": {"status": "approved"}},
    )


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
