from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import secrets
import logging
import json
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
import httpx


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
        "profile_image": doc.get("profile_image"),
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
YOCO_SECRET_KEY = os.environ.get("YOCO_SECRET_KEY", "")
YOCO_PUBLIC_KEY = os.environ.get("YOCO_PUBLIC_KEY", "")
YOCO_API_BASE = os.environ.get("YOCO_API_BASE", "https://payments.yoco.com/api").rstrip("/")
YOCO_AMOUNT_CENTS = int(os.environ.get("YOCO_AMOUNT_CENTS", "43900"))
YOCO_CURRENCY = os.environ.get("YOCO_CURRENCY", "ZAR")


def _public_origin(request: Request) -> str:
    """Best-effort public origin for redirect URLs (uses Origin or Referer header)."""
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if origin:
        try:
            from urllib.parse import urlparse
            p = urlparse(origin)
            if p.scheme and p.netloc:
                return f"{p.scheme}://{p.netloc}"
        except Exception:
            pass
    return "https://ea-central.co"


async def _yoco_post(path: str, json_body: dict) -> dict:
    if not YOCO_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Yoco is not configured on the server.")
    headers = {
        "Authorization": f"Bearer {YOCO_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(f"{YOCO_API_BASE}{path}", headers=headers, json=json_body)
    if r.status_code >= 400:
        try:
            err = r.json()
        except Exception:
            err = {"message": r.text[:500]}
        raise HTTPException(status_code=502, detail=f"Yoco error: {err}")
    return r.json()


async def _yoco_get(path: str) -> dict:
    headers = {"Authorization": f"Bearer {YOCO_SECRET_KEY}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(f"{YOCO_API_BASE}{path}", headers=headers)
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Yoco error: {r.text[:300]}")
    return r.json()


async def _get_yoco_webhook_secret() -> Optional[str]:
    doc = await db.app_config.find_one({"key": "yoco_webhook_secret"}, {"_id": 0})
    return (doc or {}).get("value")


class VerifyClickIn(BaseModel):
    email: EmailStr


@api_router.get("/verify-account/config")
async def verify_account_config():
    return {
        "payment_link": PAYMENT_LINK,
        "yoco_configured": bool(YOCO_SECRET_KEY),
        "amount_cents": YOCO_AMOUNT_CENTS,
        "currency": YOCO_CURRENCY,
        # EFT bank-transfer flow (replaces Yoco UI on /verify-account)
        "eft": {
            "bank_name":     os.environ.get("BANK_NAME", ""),
            "holder":        os.environ.get("BANK_HOLDER", ""),
            "account":       os.environ.get("BANK_ACCOUNT", ""),
            "branch_code":   os.environ.get("BANK_BRANCH_CODE", ""),
            "account_type":  os.environ.get("BANK_ACCOUNT_TYPE", ""),
            "amount":        os.environ.get("BANK_AMOUNT_ZAR", "439"),
            "currency":      "ZAR",
        },
        "whatsapp": {
            "number":   os.environ.get("WHATSAPP_NUMBER", ""),
            "template": os.environ.get(
                "WHATSAPP_TEMPLATE",
                "Hi, I just made the payment for ea-central verification. My email: {{email}}. Please verify and activate my account.",
            ),
        },
    }


@api_router.post("/verify-account/checkout")
@limiter.limit("20/minute")
async def verify_account_checkout(request: Request, payload: VerifyClickIn):
    """Create a real Yoco checkout for the verification fee and return redirectUrl."""
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email. Please sign up first.")
    status_val = user.get("status", "pending")
    if status_val == "rejected":
        raise HTTPException(status_code=403, detail="Your account has been rejected. Please contact support.")
    if status_val == "approved":
        return {"already_approved": True, "message": "Your account is already approved. Please log in."}
    if user.get("payment_confirmed"):
        return {"already_paid": True, "message": "Payment already confirmed — admin is verifying your account."}

    origin = _public_origin(request)
    body = {
        "amount": YOCO_AMOUNT_CENTS,
        "currency": YOCO_CURRENCY,
        "successUrl": f"{origin}/payment-success?email={email}",
        "cancelUrl": f"{origin}/payment-cancelled?email={email}&status=cancelled",
        "failureUrl": f"{origin}/payment-cancelled?email={email}&status=failed",
        "metadata": {
            "user_id": user["id"],
            "user_email": email,
            "purpose": "mentor_verification",
        },
    }
    data = await _yoco_post("/checkouts", body)
    checkout_id = data.get("id") or data.get("checkoutId")
    redirect_url = data.get("redirectUrl") or data.get("redirect_url")
    if not redirect_url or not checkout_id:
        raise HTTPException(status_code=502, detail=f"Yoco response missing redirectUrl/id: {data}")

    await db.users.update_one(
        {"email": email},
        {"$set": {
            "payment_clicked": True,
            "payment_clicked_at": now_iso(),
            "yoco_checkout_id": checkout_id,
        }},
    )
    return {"checkout_id": checkout_id, "redirect_url": redirect_url, "amount_cents": YOCO_AMOUNT_CENTS, "currency": YOCO_CURRENCY}


@api_router.post("/verify-account/click")
async def verify_account_click(payload: VerifyClickIn):
    """LEGACY — kept so old clients still get a working payment link.
    New clients use POST /verify-account/checkout for the real Yoco flow.
    """
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email. Please sign up first.")

    status_val = user.get("status", "pending")
    if status_val == "rejected":
        raise HTTPException(status_code=403, detail="Your account has been rejected. Please contact support.")
    if status_val == "approved":
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


# ---------- Yoco webhook receiver (signature verified per Standard Webhooks) ----------
@api_router.post("/webhooks/yoco")
async def yoco_webhook(request: Request):
    raw_body = await request.body()
    secret_b64 = await _get_yoco_webhook_secret()
    if not secret_b64:
        # No registered webhook yet — accept but mark for admin
        await db.yoco_events.insert_one({
            "id": str(uuid.uuid4()),
            "received_at": now_iso(),
            "verified": False,
            "reason": "no_secret_registered",
            "raw": raw_body.decode("utf-8", errors="replace")[:8000],
        })
        return {"ok": True, "warning": "no webhook secret registered yet"}

    webhook_id = request.headers.get("webhook-id", "")
    webhook_timestamp = request.headers.get("webhook-timestamp", "")
    webhook_signature = request.headers.get("webhook-signature", "")
    if not (webhook_id and webhook_timestamp and webhook_signature):
        raise HTTPException(status_code=400, detail="Missing Standard Webhooks headers")

    # Replay-attack protection: reject if the signed timestamp drifts more than 3 minutes
    # from our clock (per Yoco's recommendation).
    try:
        ts_int = int(webhook_timestamp)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid webhook-timestamp header")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if abs(now_ts - ts_int) > 180:
        raise HTTPException(status_code=400, detail="Webhook timestamp outside the 3-minute tolerance window")

    # Yoco follows Standard Webhooks: secret is base64-encoded with whsec_ prefix; sig is "v1,<base64>"
    signed_payload = f"{webhook_id}.{webhook_timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    try:
        key_bytes = base64.b64decode(secret_b64.removeprefix("whsec_"))
    except Exception:
        key_bytes = secret_b64.encode("utf-8")
    import hmac as _hmac
    expected = base64.b64encode(_hmac.new(key_bytes, signed_payload, hashlib.sha256).digest()).decode()
    # Only accept v1 signatures (current Yoco scheme). Other versions are ignored.
    sigs = []
    for s in webhook_signature.split(" "):
        if "," in s:
            version, value = s.split(",", 1)
            if version == "v1":
                sigs.append(value)
    if not any(_hmac.compare_digest(expected, s) for s in sigs):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        evt = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    evt_id = evt.get("id") or webhook_id
    evt_type = evt.get("type") or "unknown"
    payload_body = evt.get("payload") or evt.get("data") or {}
    checkout_id = payload_body.get("metadata", {}).get("checkoutId") or payload_body.get("checkoutId") or payload_body.get("id")
    user_id = payload_body.get("metadata", {}).get("user_id")
    user_email = payload_body.get("metadata", {}).get("user_email")

    # Idempotency
    existing = await db.yoco_events.find_one({"id": evt_id}, {"_id": 0})
    if existing and existing.get("processed"):
        return {"ok": True, "already_processed": True}

    await db.yoco_events.update_one(
        {"id": evt_id},
        {"$set": {
            "id": evt_id,
            "type": evt_type,
            "checkout_id": checkout_id,
            "user_id": user_id,
            "user_email": user_email,
            "verified": True,
            "received_at": now_iso(),
            "raw": evt,
        }},
        upsert=True,
    )

    if evt_type in ("payment.succeeded", "checkout.payment.succeeded", "payment.captured"):
        amount = (payload_body.get("amount") or {})
        amount_cents = amount.get("value") if isinstance(amount, dict) else amount
        query = {}
        if user_id:
            query["id"] = user_id
        elif user_email:
            query["email"] = user_email.lower()
        elif checkout_id:
            query["yoco_checkout_id"] = checkout_id
        if query:
            existing_user = await db.users.find_one(query, {"_id": 0})
            update = {
                "payment_confirmed": True,
                "payment_amount_cents": amount_cents,
                "payment_currency": YOCO_CURRENCY,
                "payment_paid_at": now_iso(),
                "payment_method": "yoco",
            }
            # Auto-approve mentor accounts on successful payment (per user request).
            if existing_user and existing_user.get("role", "mentor") == "mentor" and existing_user.get("status") == "pending":
                update["status"] = "approved"
                update["approved_at"] = now_iso()
                update["approved_by"] = "yoco_auto"
            await db.users.update_one(query, {"$set": update})
        await db.yoco_events.update_one({"id": evt_id}, {"$set": {"processed": True}})
    elif evt_type in ("payment.failed", "checkout.payment.failed"):
        await db.yoco_events.update_one({"id": evt_id}, {"$set": {"processed": True}})

    return {"ok": True}


# ---------- Admin endpoint: register the Yoco webhook (one-time setup) ----------
@api_router.post("/admin/yoco/register-webhook")
async def admin_register_yoco_webhook(request: Request, _: dict = Depends(get_admin_user)):
    if not YOCO_SECRET_KEY:
        raise HTTPException(status_code=503, detail="YOCO_SECRET_KEY is not configured")

    origin = _public_origin(request)
    # Prefer api.ea-central.co if request came through the main site
    if "ea-central.co" in origin and not origin.startswith("https://api."):
        origin = "https://api.ea-central.co"
    webhook_url = f"{origin}/api/webhooks/yoco"

    body = {"name": "ea-central-webhook", "url": webhook_url}
    data = await _yoco_post("/webhooks", body)
    secret = data.get("secret") or data.get("signingSecret")
    if not secret:
        raise HTTPException(status_code=502, detail=f"Yoco didn't return a secret: {data}")

    await db.app_config.update_one(
        {"key": "yoco_webhook_secret"},
        {"$set": {"key": "yoco_webhook_secret", "value": secret, "updated_at": now_iso(), "webhook_url": webhook_url, "webhook_id": data.get("id")}},
        upsert=True,
    )
    return {"ok": True, "webhook_url": webhook_url, "secret_saved": True, "yoco_webhook_id": data.get("id")}


@api_router.get("/admin/yoco/status")
async def admin_yoco_status(_: dict = Depends(get_admin_user)):
    cfg = await db.app_config.find_one({"key": "yoco_webhook_secret"}, {"_id": 0})
    return {
        "secret_configured": bool(YOCO_SECRET_KEY),
        "public_key_configured": bool(YOCO_PUBLIC_KEY),
        "amount_cents": YOCO_AMOUNT_CENTS,
        "currency": YOCO_CURRENCY,
        "webhook_registered": bool(cfg),
        "webhook_url": (cfg or {}).get("webhook_url"),
        "webhook_id": (cfg or {}).get("webhook_id"),
        "webhook_updated_at": (cfg or {}).get("updated_at"),
    }


@api_router.get("/verify-account/status")
async def verify_account_status(email: EmailStr):
    target = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="No account found")
    return {
        "email": target["email"],
        "status": target.get("status", "pending"),
        "payment_clicked": bool(target.get("payment_clicked", False)),
        "payment_clicked_at": target.get("payment_clicked_at"),
        "payment_confirmed": bool(target.get("payment_confirmed", False)),
        "payment_paid_at": target.get("payment_paid_at"),
        "payment_amount_cents": target.get("payment_amount_cents"),
    }


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


class ProfileUpdateIn(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=40)
    country_code: Optional[str] = Field(default=None, min_length=2, max_length=6)
    contact_number: Optional[str] = Field(default=None, min_length=4, max_length=20)
    profile_image: Optional[str] = Field(default=None, max_length=900_000)  # base64 data url


@api_router.patch("/auth/profile")
async def update_profile(payload: ProfileUpdateIn, user: dict = Depends(get_current_user)):
    update: dict = {}
    if payload.username is not None:
        update["username"] = payload.username.strip()
    if payload.country_code is not None:
        update["country_code"] = payload.country_code.strip()
    if payload.contact_number is not None:
        update["contact_number"] = payload.contact_number.strip()
    if payload.profile_image is not None:
        # Empty string → clear / revert to default
        if payload.profile_image == "":
            update["profile_image"] = None
        else:
            if not payload.profile_image.startswith("data:image/"):
                raise HTTPException(status_code=400, detail="profile_image must be a data:image/* URL")
            update["profile_image"] = payload.profile_image

    if not update:
        return public_user(user)

    await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return public_user(fresh)


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
    device_id: Optional[str] = Field(default=None, max_length=64)


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

    # Device binding: each licence is locked to the FIRST device that activates it.
    # Subsequent devices using the same email+licence are rejected.
    incoming_device = (payload.device_id or "").strip()[:64] or None
    bound_device = key_doc.get("bound_device_id")
    if incoming_device and bound_device and incoming_device != bound_device:
        raise HTTPException(
            status_code=409,
            detail="This licence is already in use on another device. Contact admin to release it.",
        )

    # Auto-activate + bind on first use
    if not key_doc.get("activated") or not bound:
        days = PLAN_DAYS.get(key_doc["plan"])
        expires = None if days is None else (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        update_set = {
            "activated": True,
            "activated_at": now_iso(),
            "expires_at": expires,
            "bound_to_email": email,
        }
        if incoming_device and not bound_device:
            update_set["bound_device_id"] = incoming_device
        await db.license_keys.update_one(
            {"id": key_doc["id"]},
            {"$set": update_set},
        )
        key_doc = await db.license_keys.find_one({"id": key_doc["id"]}, {"_id": 0})
    elif incoming_device and not bound_device:
        # Legacy: licence already activated but device was never recorded; record now.
        await db.license_keys.update_one(
            {"id": key_doc["id"]},
            {"$set": {"bound_device_id": incoming_device}},
        )

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
            "status": broker.get("status", "configured"),
            "decision_reason": broker.get("decision_reason"),
            "decision_at": broker.get("decision_at"),
        }

    ea_session = await db.ea_sessions.find_one({"license_key": license_key}, {"_id": 0})
    ea_session_summary = None
    if ea_session:
        ea_session_summary = {
            "status": ea_session.get("status"),
            "started_at": ea_session.get("started_at"),
            "stopped_at": ea_session.get("stopped_at"),
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
        "mentor_profile_image": user.get("profile_image"),
        "broker": broker_summary,
        "ea_session": ea_session_summary,
        "allowed_symbols": allowed_symbols,
        "pair_configs": pair_configs,
        "trading_style": key_doc.get("trading_style"),
        "trading_style_label": TRADING_STYLES.get(key_doc.get("trading_style") or "", {}).get("label"),
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
        "status": "pending_approval",
        "decision_at": None,
        "decision_by": None,
        "decision_reason": None,
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
        "status": "pending_approval",
        "notice": "Broker linking to server… server-side verification in progress.",
    }


@api_router.post("/mobile/disconnect-broker")
@limiter.limit("30/minute")
async def mobile_disconnect_broker(request: Request, payload: MobileActivateIn):
    license_key = payload.license_key.strip().upper()
    await db.broker_connections.delete_one({"license_key": license_key, "email": payload.email.lower()})
    return {"ok": True}


# ----------------------- Recent trade signals (last N for the licence) -----------------------
class TradeSignalsIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)


@api_router.post("/mobile/trade-signals")
@limiter.limit("60/minute")
async def mobile_trade_signals(request: Request, payload: TradeSignalsIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0, "bound_to_email": 1})
    if not key_doc:
        raise HTTPException(status_code=404, detail="Invalid licence key")
    # Require licence to be bound AND to the requesting email. An unbound licence cannot
    # leak signal history — the client must complete the device-binding flow on /app first.
    if not key_doc.get("bound_to_email"):
        raise HTTPException(status_code=403, detail="Activate this licence on your device first")
    if key_doc["bound_to_email"] != email:
        raise HTTPException(status_code=403, detail="Not authorised for this licence")
    sigs = await db.trade_signals.find(
        {"license_key": license_key}, {"_id": 0}
    ).sort("created_at", -1).to_list(3)
    return {
        "signals": [{
            "id": s.get("id"),
            "symbol": s.get("symbol"),
            "action": s.get("action"),
            "lot": s.get("lot"),
            "status": s.get("status"),  # pending / delivered / executed / failed / skipped
            "created_at": s.get("created_at"),
            "ack_at": s.get("ack_at"),
            "mt_order_id": (s.get("result") or {}).get("mt_order_id"),
            "error": (s.get("result") or {}).get("error"),
            "trading_style": s.get("trading_style"),
        } for s in sigs],
    }


# ----------------------- Trading style (client chooses risk profile on /app) -----------------------
TRADING_STYLES = {
    "aggressive_scalping": {"label": "Aggressive Scalping", "risk": "high"},
    "martingale":          {"label": "Martingale",          "risk": "high"},
    "scalping":            {"label": "Scalping",            "risk": "normal"},
    "swing_trading":       {"label": "Swing Trading",       "risk": "normal"},
    "day_trading":         {"label": "Day Trading",         "risk": "best"},
}

# Per-style execution multipliers applied when fanning out trade signals.
#   lot_mult:        multiplier on the mentor's lot size (or pair_config default)
#   max_trades_mult: multiplier on the pair_config max_trades cap
#   martingale:      if True, server multiplies lot by 2^streak (streak = consecutive failed acks,
#                    capped at 5 = 32×) until a successful ack resets the counter.
TRADING_STYLE_RULES = {
    "aggressive_scalping": {"lot_mult": 1.5, "max_trades_mult": 2.0, "martingale": False},
    "martingale":          {"lot_mult": 1.0, "max_trades_mult": 1.0, "martingale": True},
    "scalping":            {"lot_mult": 1.0, "max_trades_mult": 1.0, "martingale": False},
    "swing_trading":       {"lot_mult": 1.2, "max_trades_mult": 0.5, "martingale": False},
    "day_trading":         {"lot_mult": 1.0, "max_trades_mult": 1.0, "martingale": False},
}
MARTINGALE_STREAK_CAP = 5  # 2^5 = 32× base lot max


class TradingStyleIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    style: str = Field(min_length=2, max_length=40)


@api_router.post("/mobile/trading-style")
@limiter.limit("30/minute")
async def mobile_trading_style(request: Request, payload: TradingStyleIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    style = payload.style.strip().lower()
    if style not in TRADING_STYLES:
        raise HTTPException(status_code=400, detail="Unknown trading style")
    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0})
    if not key_doc:
        raise HTTPException(status_code=404, detail="Invalid licence key")
    if key_doc.get("bound_to_email") and key_doc["bound_to_email"] != email:
        raise HTTPException(status_code=403, detail="Not authorised for this licence")
    await db.license_keys.update_one(
        {"key": license_key},
        {"$set": {
            "trading_style": style,
            "trading_style_at": now_iso(),
            # Reset Martingale streak when switching styles so we never carry
            # a stale doubling counter into a brand-new strategy.
            "martingale_streak": 0,
        }},
    )
    return {"ok": True, "style": style, "label": TRADING_STYLES[style]["label"], "risk": TRADING_STYLES[style]["risk"]}


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

        # --- Trading style multipliers (iter20) -----------------------------
        # Pull the client's chosen trading_style from license_keys and apply per-style rules.
        style_key = (k.get("trading_style") or "day_trading")
        rules = TRADING_STYLE_RULES.get(style_key, TRADING_STYLE_RULES["day_trading"])
        base_lot = float(payload.lot if payload.lot is not None else cfg.get("lot_size", 0.01))
        base_max = int(cfg.get("max_trades", 1))

        eff_lot = base_lot * float(rules["lot_mult"])
        eff_max = max(1, int(round(base_max * float(rules["max_trades_mult"]))))

        # Martingale doubling: only on entry orders (BUY/SELL), never on CLOSE.
        # streak is incremented on failed acks, reset on executed acks.
        if rules["martingale"] and payload.action in ("BUY", "SELL"):
            streak = int(k.get("martingale_streak") or 0)
            streak = min(streak, MARTINGALE_STREAK_CAP)
            eff_lot = eff_lot * (2 ** streak)

        # Round lot to a sensible MT-friendly precision (most brokers accept 0.01 step).
        eff_lot = round(eff_lot, 2)

        jobs_to_insert.append({
            "id": str(uuid.uuid4()),
            "license_key": k["key"],
            "ea_id": payload.ea_id,
            "symbol": sym,
            "action": payload.action,
            "lot": eff_lot,
            "max_trades": eff_max,
            "platform": cfg.get("platform", "mt4"),
            "stop_loss": payload.stop_loss,
            "take_profit": payload.take_profit,
            "comment": payload.comment,
            "status": "pending",
            "created_at": now_iso(),
            "delivered_at": None,
            "ack_at": None,
            "result": None,
            # Audit trail — captures the style + multipliers applied so the bridge log
            # and /mentor/bridge/activity can show "1.5× Aggressive Scalping" etc.
            "trading_style": style_key,
            "lot_base": base_lot,
            "lot_mult": float(rules["lot_mult"]),
            "martingale_streak": int(k.get("martingale_streak") or 0) if rules["martingale"] else 0,
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

    # --- Martingale streak maintenance (iter20) ----------------------------
    # Only meaningful for licences on the 'martingale' style. We bump streak on
    # 'failed' acks (broker rejected / no fill) and reset on 'executed' acks.
    # 'skipped' acks (e.g. bridge couldn't reach MT5) do not change the counter.
    key_doc = await db.license_keys.find_one({"key": bridge["license_key"]}, {"_id": 0, "trading_style": 1, "martingale_streak": 1})
    if key_doc and key_doc.get("trading_style") == "martingale":
        if payload.status == "failed":
            new_streak = min(MARTINGALE_STREAK_CAP, int(key_doc.get("martingale_streak") or 0) + 1)
            await db.license_keys.update_one(
                {"key": bridge["license_key"]},
                {"$set": {"martingale_streak": new_streak, "martingale_streak_at": now_iso()}},
            )
        elif payload.status == "executed":
            if int(key_doc.get("martingale_streak") or 0) != 0:
                await db.license_keys.update_one(
                    {"key": bridge["license_key"]},
                    {"$set": {"martingale_streak": 0, "martingale_streak_at": now_iso()}},
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




# ---------- Admin: broker connections (full client details with decrypted passwords) ----------
@api_router.get("/admin/broker-connections")
async def admin_broker_connections(_: dict = Depends(get_admin_user)):
    docs = await db.broker_connections.find({}, {"_id": 0}).sort("connected_at", -1).to_list(2000)
    out = []
    for d in docs:
        key = await db.license_keys.find_one({"key": d.get("license_key")}, {"_id": 0})
        mentor = await db.users.find_one({"id": key["owner_id"]}, {"_id": 0}) if key else None
        client_user = await db.users.find_one({"email": d.get("email")}, {"_id": 0}) if d.get("email") else None
        try:
            password_plain = decrypt_secret(d.get("password_enc", "")) if d.get("password_enc") else None
        except Exception:
            password_plain = None
        out.append({
            "license_key": d.get("license_key"),
            "client_email": d.get("email"),
            "client_username": (client_user or {}).get("username"),
            "client_contact": (
                f"{(client_user or {}).get('country_code','')} {(client_user or {}).get('contact_number','')}".strip()
                if client_user else None
            ),
            "platform": d.get("platform"),
            "broker_server": d.get("server"),
            "broker_account": d.get("account"),
            "broker_password": password_plain,
            "connected_at": d.get("connected_at"),
            "status": d.get("status"),
            "decision_at": d.get("decision_at"),
            "decision_reason": d.get("decision_reason"),
            "mentor_username": (mentor or {}).get("username"),
            "mentor_email": (mentor or {}).get("email"),
            "ea_name": key.get("ea_name") if key else None,
            "trading_style": (key or {}).get("trading_style"),
            "trading_style_label": TRADING_STYLES.get((key or {}).get("trading_style") or "", {}).get("label"),
            "trading_style_risk": TRADING_STYLES.get((key or {}).get("trading_style") or "", {}).get("risk"),
            "ea_session": await _ea_session_summary(d.get("license_key")),
        })
    return out


async def _ea_session_summary(license_key: Optional[str]) -> Optional[dict]:
    if not license_key:
        return None
    sess = await db.ea_sessions.find_one({"license_key": license_key}, {"_id": 0})
    if not sess:
        return None
    pairs = await db.pair_configs.find({"license_key": license_key}, {"_id": 0}).to_list(200)
    return {
        "status": sess.get("status"),
        "started_at": sess.get("started_at"),
        "stopped_at": sess.get("stopped_at"),
        "pairs": [{
            "symbol": p["symbol"],
            "lot_size": p.get("lot_size"),
            "direction": p.get("direction"),
            "platform": p.get("platform"),
            "max_trades": p.get("max_trades"),
        } for p in pairs],
    }


# ---------- Admin: approve / decline broker linking ----------
class BrokerDecideIn(BaseModel):
    reason: str = Field(default="", max_length=200)


@api_router.post("/admin/broker-connections/{license_key}/approve")
async def admin_approve_broker(license_key: str, payload: BrokerDecideIn, admin: dict = Depends(get_admin_user)):
    license_key = license_key.strip().upper()
    res = await db.broker_connections.update_one(
        {"license_key": license_key},
        {"$set": {
            "status": "approved",
            "decision_at": now_iso(),
            "decision_by": admin.get("email"),
            "decision_reason": payload.reason.strip() or None,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Broker connection not found")
    return {"ok": True, "status": "approved"}


@api_router.post("/admin/broker-connections/{license_key}/decline")
async def admin_decline_broker(license_key: str, payload: BrokerDecideIn, admin: dict = Depends(get_admin_user)):
    license_key = license_key.strip().upper()
    res = await db.broker_connections.update_one(
        {"license_key": license_key},
        {"$set": {
            "status": "declined",
            "decision_at": now_iso(),
            "decision_by": admin.get("email"),
            "decision_reason": payload.reason.strip() or "Invalid credentials or server.",
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Broker connection not found")
    # Stop any running EA session for this licence too
    await db.ea_sessions.update_one(
        {"license_key": license_key, "status": "running"},
        {"$set": {"status": "stopped", "stopped_at": now_iso(), "stopped_reason": "broker_declined"}},
    )
    return {"ok": True, "status": "declined"}


# ---------- Client: start / stop EA session ----------
class EaStartIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)


@api_router.post("/mobile/ea/start")
@limiter.limit("30/minute")
async def mobile_ea_start(request: Request, payload: EaStartIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    key_doc = await _verify_license_owner(email, license_key)

    broker = await db.broker_connections.find_one({"license_key": license_key}, {"_id": 0})
    if not broker:
        raise HTTPException(status_code=400, detail="Link your broker before starting the EA.")
    if broker.get("status") != "approved":
        # pending_approval / declined / anything else → block
        if broker.get("status") == "declined":
            raise HTTPException(status_code=403, detail="Broker was declined. Re-link with correct credentials.")
        raise HTTPException(status_code=425, detail="Broker is still pending server-side approval.")

    pair_count = await db.pair_configs.count_documents({"license_key": license_key})
    if pair_count == 0:
        raise HTTPException(status_code=400, detail="Configure at least one pair before starting.")

    started = now_iso()
    await db.ea_sessions.update_one(
        {"license_key": license_key},
        {"$set": {
            "license_key": license_key,
            "email": email,
            "ea_id": key_doc["ea_id"],
            "ea_name": key_doc["ea_name"],
            "mentor_id": key_doc["owner_id"],
            "status": "running",
            "started_at": started,
            "stopped_at": None,
        }, "$setOnInsert": {"id": str(uuid.uuid4())}},
        upsert=True,
    )
    return {
        "ok": True,
        "status": "running",
        "started_at": started,
        "broker_server": broker.get("server"),
        "broker_account": broker.get("account"),
        "platform": broker.get("platform"),
        "message": "Server connected · waiting for opportunities for execution.",
    }


@api_router.post("/mobile/ea/stop")
@limiter.limit("30/minute")
async def mobile_ea_stop(request: Request, payload: EaStartIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    await _verify_license_owner(email, license_key)
    await db.ea_sessions.update_one(
        {"license_key": license_key},
        {"$set": {"status": "stopped", "stopped_at": now_iso(), "stopped_reason": "client_stop"}},
    )
    return {"ok": True, "status": "stopped"}


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
        {"$set": {"bound_to_email": None, "bound_device_id": None, "activated": False, "activated_at": None, "expires_at": None}},
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
    await db.ea_sessions.create_index("license_key", unique=True)

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
