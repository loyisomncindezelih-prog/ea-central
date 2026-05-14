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
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse
from cryptography.fernet import Fernet
import base64
import hashlib
from fastapi.responses import FileResponse


# ----------------------- DB -----------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


# ----------------------- App -----------------------
app = FastAPI(title="ea-central API")
api_router = APIRouter(prefix="/api")


def _xff_or_remote(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


limiter = Limiter(key_func=_xff_or_remote, default_limits=[])
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(_request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Too many requests. Please slow down ({exc.detail})."},
    )


# ----------------------- Symmetric cipher for broker credentials -----------------------
def _broker_cipher() -> Fernet:
    secret = os.environ["JWT_SECRET"]
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secret(plain: str) -> str:
    return _broker_cipher().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    return _broker_cipher().decrypt(token.encode("utf-8")).decode("utf-8")


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
        "payment_clicked": bool(doc.get("payment_clicked", False)),
        "payment_clicked_at": doc.get("payment_clicked_at"),
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
    role = user.get("role", "mentor")
    paid = bool(user.get("payment_clicked", False))

    # Mentors must pay R439.00 before they can even sit in the approval queue.
    # Admins skip the payment gate.
    if status == "pending" and role != "admin" and not paid:
        await clear_failures(identifier)
        raise HTTPException(
            status_code=402,
            detail={
                "code": "payment_required",
                "message": "Complete the R439.00 verification payment to unlock your mentor account.",
                "email": email,
            },
        )
    if status == "pending":
        await clear_failures(identifier)
        msg = "Payment received — admin is verifying. You'll be able to log in shortly." if paid \
              else "Your account is awaiting admin approval. You'll be notified once it's approved."
        raise HTTPException(status_code=403, detail=msg)
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


# ----------------------- Verify account (payment flow tracking) -----------------------
PAYMENT_LINK = os.environ.get("PAYMENT_LINK", "https://pay.yoco.com/r/7XlvGG")


class VerifyClickIn(BaseModel):
    email: EmailStr


@api_router.get("/verify-account/config")
async def verify_account_config():
    return {"payment_link": PAYMENT_LINK}


@api_router.post("/verify-account/click")
async def verify_account_click(payload: VerifyClickIn):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email. Please sign up first.")

    status = user.get("status", "pending")
    if status == "rejected":
        raise HTTPException(status_code=403, detail="Your account has been rejected. Please contact support.")
    if status == "approved":
        # Already approved — no payment needed. Send them to login.
        return {
            "ok": True,
            "already_approved": True,
            "message": "Your account is already approved. Please log in.",
        }

    already_paid = bool(user.get("payment_clicked"))
    if not already_paid:
        await db.users.update_one(
            {"email": email},
            {"$set": {
                "payment_clicked": True,
                "payment_clicked_at": now_iso(),
            }},
        )

    return {
        "ok": True,
        "already_approved": False,
        "already_paid": already_paid,
        "payment_link": PAYMENT_LINK,
        "message": (
            "Payment already received — admin is verifying your account."
            if already_paid else
            "Opening secure Yoco checkout. Complete the R439.00 payment to unlock your account."
        ),
    }


@api_router.get("/verify-account/status")
async def verify_account_status(email: EmailStr, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="No account found")
    return {
        "email": target["email"],
        "status": target.get("status", "pending"),
        "payment_clicked": bool(target.get("payment_clicked", False)),
        "payment_clicked_at": target.get("payment_clicked_at"),
    }


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
    # Cascade: remove any client pair_configs tied to (this EA's licence keys, this symbol)
    keys = await db.license_keys.find(
        {"owner_id": user["id"], "ea_id": ea_id}, {"_id": 0, "key": 1}
    ).to_list(2000)
    if keys:
        await db.pair_configs.delete_many({
            "license_key": {"$in": [k["key"] for k in keys]},
            "symbol": sym,
        })
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
@limiter.limit("60/minute")
async def mobile_check_email(request: Request, payload: MobileEmailIn):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")
    if user.get("status") != "approved":
        raise HTTPException(status_code=403, detail="This account is pending admin approval. You'll be able to use the Mobile EA once it's approved.")
    return {"ok": True, "username": user["username"]}


@api_router.post("/mobile/activate-license")
@limiter.limit("60/minute")
async def mobile_activate_license(request: Request, payload: MobileActivateIn):
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

    # Single-use binding: once a licence is used by an email, only that email can re-open it
    bound = key_doc.get("bound_to_email")
    if bound and bound != email:
        raise HTTPException(status_code=409, detail="This licence is already in use by another email. Contact admin to release it.")

    # Each email can only be bound to ONE licence at a time
    other = await db.license_keys.find_one(
        {"bound_to_email": email, "key": {"$ne": license_key}}, {"_id": 0}
    )
    if other:
        raise HTTPException(status_code=409, detail=f"This email is already linked to licence {other['key']}. Contact admin to release it before binding a new one.")

    # Auto-activate + bind on first use
    if not key_doc.get("activated") or not bound:
        days = PLAN_DAYS.get(key_doc["plan"])
        expires = None if days is None else (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        await db.license_keys.update_one(
            {"id": key_doc["id"]},
            {"$set": {
                "activated": True,
                "activated_at": now_iso(),
                "expires_at": expires,
                "bound_to_email": email,
            }},
        )
        key_doc = await db.license_keys.find_one({"id": key_doc["id"]}, {"_id": 0})

    if key_status(key_doc) == "expired":
        raise HTTPException(status_code=410, detail="Licence has expired. Please contact your mentor for a new key.")

    broker = await db.broker_connections.find_one({"license_key": key_doc["key"]}, {"_id": 0})
    broker_summary = None
    if broker:
        broker_summary = {
            "platform": broker.get("platform"),
            "server": broker.get("server"),
            "account": broker.get("account"),
            "connected_at": broker.get("connected_at"),
            "status": "configured",  # actual MT bridge execution coming soon
        }

    # EA allowed symbols (mentor-curated list from /dashboard/manage-eas/:id)
    ea_doc = await db.eas.find_one({"id": key_doc["ea_id"]}, {"_id": 0})
    allowed_symbols = ea_doc.get("symbols", []) if ea_doc else []

    # Client's previously saved per-pair trade configs for this licence
    pair_configs_cur = db.pair_configs.find({"license_key": license_key}, {"_id": 0})
    pair_configs = [
        {
            "symbol": d["symbol"],
            "lot_size": d.get("lot_size", 0.01),
            "direction": d.get("direction", "BOTH"),
            "platform": d.get("platform", "mt5"),
            "max_trades": d.get("max_trades", 1),
            "updated_at": d.get("updated_at"),
        }
        async for d in pair_configs_cur
    ]

    return {
        "ea_id": key_doc["ea_id"],
        "ea_name": key_doc["ea_name"],
        "key": key_doc["key"],
        "plan_label": PLAN_LABEL.get(key_doc["plan"], key_doc["plan"]),
        "plan": key_doc["plan"],
        "expires_at": key_doc.get("expires_at"),
        "holder_username": key_doc["holder_username"],
        "mentor_username": user["username"],
        "broker": broker_summary,
        "allowed_symbols": allowed_symbols,
        "pair_configs": pair_configs,
    }


# ----------------------- Broker (MetaTrader) connect — credentials capture -----------------------
# This stores broker creds tied to a licence key. The actual MT4/MT5 trade bridge
# (a desktop helper that connects to MetaTrader on the client's PC/VPS) is COMING SOON.
# For now we persist creds encrypted so the future bridge can pick them up.

class MobileBrokerConnectIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    platform: str = Field(pattern="^(mt4|mt5)$")
    server: str = Field(min_length=2, max_length=80)
    account: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=1, max_length=200)


@api_router.post("/mobile/connect-broker")
@limiter.limit("30/minute")
async def mobile_connect_broker(request: Request, payload: MobileBrokerConnectIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()

    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0})
    if not key_doc:
        raise HTTPException(status_code=404, detail="Invalid licence key")
    if key_doc.get("bound_to_email") and key_doc["bound_to_email"] != email:
        raise HTTPException(status_code=403, detail="This licence is bound to a different email.")
    if key_status(key_doc) == "expired":
        raise HTTPException(status_code=410, detail="Licence has expired.")

    doc = {
        "license_key": license_key,
        "email": email,
        "platform": payload.platform,
        "server": payload.server.strip(),
        "account": payload.account.strip(),
        "password_enc": encrypt_secret(payload.password),
        "connected_at": now_iso(),
        "status": "configured",
    }
    await db.broker_connections.update_one(
        {"license_key": license_key},
        {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4())}},
        upsert=True,
    )
    return {
        "ok": True,
        "platform": doc["platform"],
        "server": doc["server"],
        "account": doc["account"],
        "connected_at": doc["connected_at"],
        "status": "configured",
        "notice": "Credentials saved securely. Automatic trade execution via the ea-central bridge is coming soon.",
    }


@api_router.post("/mobile/disconnect-broker")
@limiter.limit("30/minute")
async def mobile_disconnect_broker(request: Request, payload: MobileActivateIn):
    license_key = payload.license_key.strip().upper()
    await db.broker_connections.delete_one({"license_key": license_key, "email": payload.email.lower()})
    return {"ok": True}


# ----------------------- Per-pair trade configuration (client picks pairs to trade) -----------------------
class PairConfigIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    symbol: str = Field(min_length=1, max_length=24)
    lot_size: float = Field(gt=0, le=100)
    direction: str = Field(pattern="^(BUY|SELL|BOTH)$")
    platform: str = Field(pattern="^(mt4|mt5)$")
    max_trades: int = Field(ge=1, le=999)


class PairDeleteIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    symbol: str = Field(min_length=1, max_length=24)


async def _verify_license_owner(email: str, license_key: str) -> dict:
    """Return the license doc if (email, license_key) is a valid bound activation, else raise."""
    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0})
    if not key_doc:
        raise HTTPException(status_code=404, detail="Invalid licence key")
    if key_doc.get("bound_to_email") and key_doc["bound_to_email"] != email:
        raise HTTPException(status_code=403, detail="This licence is bound to a different email.")
    if key_status(key_doc) == "expired":
        raise HTTPException(status_code=410, detail="Licence has expired.")
    return key_doc


@api_router.post("/mobile/pair-config")
@limiter.limit("60/minute")
async def mobile_set_pair_config(request: Request, payload: PairConfigIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    symbol = payload.symbol.strip().upper()

    key_doc = await _verify_license_owner(email, license_key)
    ea_doc = await db.eas.find_one({"id": key_doc["ea_id"]}, {"_id": 0})
    allowed = [s.upper() for s in (ea_doc.get("symbols", []) if ea_doc else [])]
    if symbol not in allowed:
        raise HTTPException(status_code=400, detail=f"{symbol} is not in the EA's allowed symbols list.")

    doc = {
        "license_key": license_key,
        "email": email,
        "symbol": symbol,
        "lot_size": float(payload.lot_size),
        "direction": payload.direction,
        "platform": payload.platform,
        "max_trades": int(payload.max_trades),
        "updated_at": now_iso(),
    }
    await db.pair_configs.update_one(
        {"license_key": license_key, "symbol": symbol},
        {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "config": doc}


@api_router.post("/mobile/pair-config/delete")
@limiter.limit("60/minute")
async def mobile_delete_pair_config(request: Request, payload: PairDeleteIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    symbol = payload.symbol.strip().upper()
    await _verify_license_owner(email, license_key)
    await db.pair_configs.delete_one({"license_key": license_key, "symbol": symbol})
    return {"ok": True}


# ============================ ea-central bridge (Phase 2) ============================
# - Mentor's PC bot pushes trade signals via POST /api/bridge/mentor-push (auth: mentor API key)
# - Backend fans out one trade_signal per activated licence of that EA
# - Each client desktop bridge pairs once via POST /api/bridge/pair (auth: email + license_key + PIN)
#   and gets back a long-lived bridge_token.
# - The bridge polls GET /api/bridge/jobs (auth: bridge_token) every few seconds and POSTs
#   ack on /api/bridge/jobs/{id}/ack to mark executed/failed.

BRIDGE_TOKEN_TTL_DAYS = 365


def _new_token(prefix: str = "tok") -> str:
    return f"{prefix}_{secrets.token_urlsafe(28)}"


# ---------- Mentor API key (used by their PC bot to push trade signals) ----------
@api_router.post("/mentor/api-key/rotate")
async def rotate_mentor_api_key(user: dict = Depends(get_current_user)):
    new_key = _new_token("mk")
    await db.users.update_one({"id": user["id"]}, {"$set": {"mentor_api_key": new_key}})
    return {"api_key": new_key}


@api_router.get("/mentor/api-key")
async def get_mentor_api_key(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "mentor_api_key": 1})
    return {"api_key": (doc or {}).get("mentor_api_key")}


async def _mentor_from_api_key(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Mentor API key required")
    key = auth[7:].strip()
    user = await db.users.find_one({"mentor_api_key": key, "role": "mentor", "status": "approved"}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid mentor API key")
    return user


# ---------- Mentor push: a trade signal from their PC bot ----------
class MentorPushIn(BaseModel):
    ea_id: str
    symbol: str = Field(min_length=1, max_length=24)
    action: str = Field(pattern="^(BUY|SELL|CLOSE)$")
    lot: Optional[float] = Field(default=None, gt=0, le=100)
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    comment: str = Field(default="", max_length=200)


@api_router.post("/bridge/mentor-push")
@limiter.limit("120/minute")
async def bridge_mentor_push(request: Request, payload: MentorPushIn):
    mentor = await _mentor_from_api_key(request)
    ea = await db.eas.find_one({"id": payload.ea_id, "owner_id": mentor["id"]}, {"_id": 0})
    if not ea:
        raise HTTPException(status_code=404, detail="EA not found for this mentor")
    sym = payload.symbol.strip().upper()
    if sym not in [s.upper() for s in ea.get("symbols", [])]:
        raise HTTPException(status_code=400, detail=f"{sym} is not in EA's symbols list")

    keys = await db.license_keys.find(
        {"owner_id": mentor["id"], "ea_id": payload.ea_id, "activated": True}, {"_id": 0}
    ).to_list(2000)

    pushed = 0
    eligible_pair_configs = await db.pair_configs.find(
        {"license_key": {"$in": [k["key"] for k in keys]}, "symbol": sym},
        {"_id": 0},
    ).to_list(2000)
    cfg_by_key = {c["license_key"]: c for c in eligible_pair_configs}

    jobs_to_insert = []
    for k in keys:
        if key_status(k) == "expired":
            continue
        cfg = cfg_by_key.get(k["key"])
        if not cfg:
            continue
        # Direction filter:
        # - BUY / SELL: only fan out to clients whose pair_config.direction is BOTH or matching
        # - CLOSE: ALWAYS fans out regardless of direction (closing is a safety action that should
        #   reach every active client of this symbol; intentional).
        if payload.action in ("BUY", "SELL") and cfg["direction"] not in ("BOTH", payload.action):
            continue

        jobs_to_insert.append({
            "id": str(uuid.uuid4()),
            "license_key": k["key"],
            "ea_id": payload.ea_id,
            "symbol": sym,
            "action": payload.action,
            "lot": float(payload.lot if payload.lot is not None else cfg.get("lot_size", 0.01)),
            "max_trades": int(cfg.get("max_trades", 1)),
            "platform": cfg.get("platform", "mt4"),
            "stop_loss": payload.stop_loss,
            "take_profit": payload.take_profit,
            "comment": payload.comment,
            "status": "pending",
            "created_at": now_iso(),
            "delivered_at": None,
            "ack_at": None,
            "result": None,
        })
    if jobs_to_insert:
        await db.trade_signals.insert_many(jobs_to_insert)
        pushed = len(jobs_to_insert)
    return {"ok": True, "fanned_out": pushed, "eligible_clients": len(keys)}


# ---------- Bridge pairing (one-time, returns long-lived token) ----------
class BridgePairIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    platform: str = Field(pattern="^(mt4|mt5)$")
    machine_name: str = Field(default="", max_length=80)


@api_router.post("/bridge/pair")
@limiter.limit("30/minute")
async def bridge_pair(request: Request, payload: BridgePairIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    key_doc = await _verify_license_owner(email, license_key)

    token = _new_token("br")
    expires = (datetime.now(timezone.utc) + timedelta(days=BRIDGE_TOKEN_TTL_DAYS)).isoformat()
    await db.bridges.update_one(
        {"license_key": license_key},
        {"$set": {
            "license_key": license_key,
            "email": email,
            "mentor_id": key_doc["owner_id"],
            "ea_id": key_doc["ea_id"],
            "platform": payload.platform,
            "machine_name": payload.machine_name.strip(),
            "bridge_token": token,
            "token_expires_at": expires,
            "last_seen_at": None,
            "paired_at": now_iso(),
        }, "$setOnInsert": {"id": str(uuid.uuid4())}},
        upsert=True,
    )
    return {
        "bridge_token": token,
        "expires_at": expires,
        "ea_id": key_doc["ea_id"],
        "ea_name": key_doc["ea_name"],
        "poll_interval_seconds": 3,
    }


async def _bridge_from_token(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bridge token required")
    token = auth[7:].strip()
    bridge = await db.bridges.find_one({"bridge_token": token}, {"_id": 0})
    if not bridge:
        raise HTTPException(status_code=401, detail="Invalid bridge token")
    if bridge.get("token_expires_at") and datetime.fromisoformat(bridge["token_expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Bridge token expired — re-pair the helper")
    return bridge


@api_router.get("/bridge/jobs")
@limiter.limit("600/minute")
async def bridge_get_jobs(request: Request):
    bridge = await _bridge_from_token(request)
    await db.bridges.update_one(
        {"license_key": bridge["license_key"]},
        {"$set": {"last_seen_at": now_iso()}},
    )

    # At-least-once delivery: only re-deliver pending jobs whose delivered_at is null
    # OR is older than REDELIVERY_AFTER_SECONDS. The job stays in 'pending' state until
    # the bridge acks (executed/failed/skipped). This protects against helper crashes
    # between delivery and execution.
    REDELIVERY_AFTER_SECONDS = 30
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=REDELIVERY_AFTER_SECONDS)).isoformat()
    jobs = await db.trade_signals.find(
        {
            "license_key": bridge["license_key"],
            "status": "pending",
            "$or": [{"delivered_at": None}, {"delivered_at": {"$lt": cutoff}}],
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(50)

    if jobs:
        await db.trade_signals.update_many(
            {"id": {"$in": [j["id"] for j in jobs]}},
            {"$set": {"delivered_at": now_iso()}},
        )

    broker = await db.broker_connections.find_one({"license_key": bridge["license_key"]}, {"_id": 0})
    broker_creds = None
    if broker:
        try:
            broker_creds = {
                "platform": broker["platform"],
                "server": broker["server"],
                "account": broker["account"],
                "password": decrypt_secret(broker["password_enc"]),
            }
        except Exception:
            broker_creds = None

    return {
        "jobs": jobs,
        "broker": broker_creds,
        "bridge_platform": bridge.get("platform"),
        "machine_name": bridge.get("machine_name"),
    }


class BridgeAckIn(BaseModel):
    status: str = Field(pattern="^(executed|failed|skipped)$")
    mt_order_id: Optional[str] = None
    error: Optional[str] = None
    raw: Optional[dict] = None


@api_router.post("/bridge/jobs/{job_id}/ack")
@limiter.limit("600/minute")
async def bridge_ack_job(request: Request, job_id: str, payload: BridgeAckIn):
    bridge = await _bridge_from_token(request)
    job = await db.trade_signals.find_one({"id": job_id, "license_key": bridge["license_key"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Idempotency: once a job has reached a terminal state, return the existing record
    # instead of overwriting it. This protects against the helper retrying an ack after
    # a partial network failure.
    if job.get("status") in ("executed", "failed", "skipped"):
        return {"ok": True, "already_acked": True, "status": job["status"]}
    await db.trade_signals.update_one(
        {"id": job_id},
        {"$set": {
            "status": payload.status,
            "ack_at": now_iso(),
            "result": {
                "mt_order_id": payload.mt_order_id,
                "error": payload.error,
                "raw": payload.raw,
            },
        }},
    )
    return {"ok": True, "already_acked": False, "status": payload.status}


@api_router.get("/mentor/bridge/activity")
async def mentor_bridge_activity(user: dict = Depends(get_current_user)):
    bridges = await db.bridges.find({"mentor_id": user["id"]}, {"_id": 0}).to_list(500)
    my_keys = await db.license_keys.find({"owner_id": user["id"]}, {"_id": 0, "key": 1}).to_list(2000)
    my_key_set = {k["key"] for k in my_keys}
    recent_signals = await db.trade_signals.find(
        {"license_key": {"$in": list(my_key_set)}}, {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    return {
        "bridges": [{
            "license_key": b["license_key"],
            "email": b["email"],
            "platform": b.get("platform"),
            "machine_name": b.get("machine_name"),
            "paired_at": b.get("paired_at"),
            "last_seen_at": b.get("last_seen_at"),
        } for b in bridges],
        "recent_signals": recent_signals,
    }


@api_router.get("/bridge/download")
async def download_bridge_script():
    """Public download of the desktop bridge helper script."""
    path = ROOT_DIR / "bridge_helper" / "ea_central_bridge.py"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Bridge helper not found")
    return FileResponse(
        path=str(path),
        media_type="text/x-python",
        filename="ea_central_bridge.py",
    )




# ---------- Admin: licence release (unbind from email) ----------
@api_router.get("/admin/licenses")
async def admin_list_licenses(_: dict = Depends(get_admin_user)):
    docs = await db.license_keys.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    out = []
    for d in docs:
        owner = await db.users.find_one({"id": d["owner_id"]}, {"_id": 0})
        out.append({
            **public_key(d),
            "bound_to_email": d.get("bound_to_email"),
            "mentor_email": owner["email"] if owner else "—",
            "mentor_username": owner["username"] if owner else "—",
        })
    return out


@api_router.post("/admin/licenses/{key_id}/release")
async def admin_release_license(key_id: str, _: dict = Depends(get_admin_user)):
    result = await db.license_keys.update_one(
        {"id": key_id},
        {"$set": {"bound_to_email": None, "activated": False, "activated_at": None, "expires_at": None}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Licence not found")
    return {"ok": True}


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
    await db.pair_configs.create_index([("license_key", 1), ("symbol", 1)], unique=True)
    await db.broker_connections.create_index("license_key", unique=True)
    await db.bridges.create_index("bridge_token", unique=True)
    await db.bridges.create_index("license_key", unique=True)
    await db.bridges.create_index("mentor_id")
    await db.trade_signals.create_index([("license_key", 1), ("status", 1), ("created_at", 1)])
    await db.users.create_index("mentor_api_key", sparse=True, unique=True)

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
