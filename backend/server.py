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
import asyncio
import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal
import re

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Body
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from cryptography.fernet import Fernet
import base64
import hashlib
from fastapi.responses import FileResponse, RedirectResponse
import httpx
import pyotp
import qrcode
import io


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
ADMIN_ACCESS_TTL_MIN = 120  # Admins get 2 hours then auto-logout
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


def create_access_token(user_id: str, email: str, role: str = "mentor") -> str:
    # Admins get a hard 2-hour token (no silent refresh) so the dashboard
    # auto-logs out after 2 hours of inactivity.
    ttl = ADMIN_ACCESS_TTL_MIN if role == "admin" else ACCESS_TTL_MIN
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl),
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
        "totp_enabled": bool(doc.get("totp_enabled", False)),
        # Pricing tier — drives the "EA Access Only" vs "EA + Mentorship Access"
        # badge + the upsell card on the mentor dashboard and /app.
        "wants_mentorship": bool(doc.get("wants_mentorship", False)),
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


# ----------------------- TOTP / 2FA helpers -----------------------
TOTP_ISSUER = "ea-central"
TWO_FA_CHALLENGE_TTL_MIN = 5  # 5-minute window to enter the 6-digit code after password


def create_2fa_challenge_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TWO_FA_CHALLENGE_TTL_MIN),
        "type": "2fa_challenge",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def verify_2fa_challenge_token(token: str) -> str:
    """Returns the user_id on success, raises HTTPException otherwise."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="2FA session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid 2FA session.")
    if payload.get("type") != "2fa_challenge":
        raise HTTPException(status_code=401, detail="Invalid 2FA session.")
    return payload["sub"]


def _generate_backup_codes(n: int = 10) -> list[str]:
    """Generates n human-friendly 10-char backup codes (XXXXX-XXXXX)."""
    out: list[str] = []
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion
    for _ in range(n):
        raw = "".join(secrets.choice(alphabet) for _ in range(10))
        out.append(f"{raw[:5]}-{raw[5:]}")
    return out


def _make_qr_data_url(otpauth_url: str) -> str:
    img = qrcode.make(otpauth_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ----------------------- Pydantic schemas -----------------------
class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    username: str = Field(min_length=2, max_length=40)
    email: EmailStr
    country_code: str = Field(min_length=2, max_length=6)
    contact_number: str = Field(min_length=4, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    # Optional compiled EA (.ex4 / .ex5) uploaded at signup. Base64 data URL up to ~10 MB raw.
    ea_file_name: str | None = Field(default=None, max_length=120)
    ea_file_data_url: str | None = Field(default=None, max_length=14 * 1024 * 1024)


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

    # Optional EA file upload at signup. We validate the extension on the
    # filename and only persist .ex4 / .ex5 base64 payloads. Anything else
    # is silently ignored (frontend rejects too) so this never blocks signup.
    if payload.ea_file_name and payload.ea_file_data_url:
        name = payload.ea_file_name.strip()
        lower = name.lower()
        if (lower.endswith(".ex4") or lower.endswith(".ex5")) and payload.ea_file_data_url.startswith("data:"):
            doc["ea_file_name"] = name
            doc["ea_file_data_url"] = payload.ea_file_data_url
            doc["ea_file_uploaded_at"] = datetime.now(timezone.utc).isoformat()
            doc["ea_file_platform"] = "mt5" if lower.endswith(".ex5") else "mt4"

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
    # Only the actual proof-of-payment image counts as "paid" — a stale `payment_clicked`
    # flag without a proof_data_url must not pass the payment gate.
    paid = bool(user.get("payment_proof_data_url"))

    # Mentors must pay the verification fee before they can even sit in the approval queue.
    # Admins skip the payment gate.
    if status == "pending" and role != "admin" and not paid:
        await clear_failures(identifier)
        cfg = await get_payment_config()
        fee = cfg["base_amount"]
        raise HTTPException(
            status_code=402,
            detail={
                "code": "payment_required",
                "message": f"Complete the R{float(fee):.2f} verification payment to unlock your mentor account.",
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
    # ---- Admin 2FA gate ----
    # If this user is an admin and has TOTP enabled, do NOT issue tokens yet.
    # Return a short-lived challenge token; the client must call /auth/2fa/verify
    # with the 6-digit code before getting access cookies.
    if user.get("role") == "admin" and user.get("totp_enabled"):
        challenge = create_2fa_challenge_token(user["id"])
        return {
            "requires_2fa": True,
            "challenge_token": challenge,
            "user": {"email": user["email"], "role": "admin"},
        }
    access = create_access_token(user["id"], email, user.get("role", "mentor"))
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


# ----------------------- Editable payment config (admin can override env from UI) -----------------------
PAYMENT_CONFIG_FIELDS = {
    "whatsapp_number":     ("WHATSAPP_NUMBER",     "+27694495897"),
    "whatsapp_template":   ("WHATSAPP_TEMPLATE",   "Hi, I just made the payment for ea-central verification. My email: {{email}}. Please verify and activate my account."),
    "base_amount":         ("BANK_AMOUNT_ZAR",     "700"),
    "mentorship_amount":   ("MENTORSHIP_AMOUNT_ZAR", "1450"),
    "bank_name":           ("BANK_NAME",           "Capitec Bank"),
    "bank_holder":         ("BANK_HOLDER",         "LoyisoFx123$"),
    "bank_account":        ("BANK_ACCOUNT",        "2195277943"),
    "bank_branch_code":    ("BANK_BRANCH_CODE",    "470010"),
    "bank_account_type":   ("BANK_ACCOUNT_TYPE",   "Savings"),
    "usdt_trc20_address":  ("USDT_TRC20_ADDRESS",  "TEHDtK1J669uogbM5gXESJKRBrbafk3BsY"),
    "skrill_email":        ("SKRILL_EMAIL",        "loyisomncindezelih@gmail.com"),
}


async def get_payment_config() -> dict:
    """Returns effective payment config: DB overrides win over env vars, env wins over hard-coded defaults."""
    doc = await db.app_config.find_one({"key": "payment_config"}, {"_id": 0}) or {}
    overrides = doc.get("value") or {}
    out: dict[str, str] = {}
    for field, (env_key, default) in PAYMENT_CONFIG_FIELDS.items():
        val = overrides.get(field)
        if val is None or val == "":
            val = os.environ.get(env_key, default)
        out[field] = str(val)
    return out


@api_router.get("/verify-account/config")
async def verify_account_config():
    cfg = await get_payment_config()
    return {
        "payment_link": PAYMENT_LINK,
        "yoco_configured": bool(YOCO_SECRET_KEY),
        "amount_cents": YOCO_AMOUNT_CENTS,
        "currency": YOCO_CURRENCY,
        # EFT bank-transfer flow (replaces Yoco UI on /verify-account)
        "eft": {
            "bank_name":     cfg["bank_name"],
            "holder":        cfg["bank_holder"],
            "account":       cfg["bank_account"],
            "branch_code":   cfg["bank_branch_code"],
            "account_type":  cfg["bank_account_type"],
            "amount":        cfg["base_amount"],
            "currency":      "ZAR",
        },
        # Optional 1-on-1 mentorship add-on — bumps the verification fee.
        "mentorship_amount": cfg["mentorship_amount"],
        "whatsapp": {
            "number":   cfg["whatsapp_number"],
            "template": cfg["whatsapp_template"],
        },
        # iter34 — additional manual payment methods (crypto + Skrill)
        "usdt_trc20_address": cfg["usdt_trc20_address"],
        "skrill_email":       cfg["skrill_email"],
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

    # IMPORTANT: clicking "continue to bank details" is NOT a payment.
    # We only flag the account as paid when the proof-of-payment image actually
    # arrives at /verify-account/proof. Returning the bank details here is harmless.
    already_paid = bool(user.get("payment_proof_data_url"))

    return {
        "ok": True,
        "already_approved": False,
        "already_paid": already_paid,
        "payment_link": PAYMENT_LINK,
        "message": (
            "Proof of payment received — admin is verifying your account."
            if already_paid else
            "Send the EFT, then upload your proof of payment so admin can verify."
        ),
    }


# ---------- Upload proof of EFT payment ----------
class ProofIn(BaseModel):
    email: EmailStr
    proof_data_url: str = Field(min_length=20, max_length=8 * 1024 * 1024)  # ~8MB base64 cap
    filename: str | None = Field(default=None, max_length=200)
    wants_mentorship: bool = False


@api_router.post("/verify-account/proof")
@limiter.limit("10/minute")
async def verify_account_proof(request: Request, payload: ProofIn):
    """Stores a base64 image/pdf proof of EFT payment.
    Frontend sends a data URL (image/png, image/jpeg, application/pdf).
    Admin can later view it on /admin/dashboard to reconcile against bank statement.
    """
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email. Please sign up first.")
    if not payload.proof_data_url.startswith("data:"):
        raise HTTPException(status_code=400, detail="Invalid file format")
    # Basic MIME allow-list
    head = payload.proof_data_url.split(",", 1)[0]
    if not any(t in head for t in ("image/", "application/pdf")):
        raise HTTPException(status_code=400, detail="Only image or PDF files are accepted")
    # Anti-tampering: reject if this exact proof image was already submitted by a
    # different account. Same user re-uploading their own proof is fine.
    proof_hash = hashlib.sha256(payload.proof_data_url.encode("utf-8")).hexdigest()
    duplicate = await db.users.find_one(
        {"payment_proof_hash": proof_hash, "email": {"$ne": email}},
        {"_id": 0, "email": 1},
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="This exact proof of payment has already been submitted by another account. Upload your own original screenshot/PDF.",
        )
    # Snapshot what this user is expected to have paid so admin can reconcile
    # against the bank statement (R700 base, R1450 with the mentorship add-on).
    cfg = await get_payment_config()
    expected_amount = cfg["mentorship_amount"] if payload.wants_mentorship else cfg["base_amount"]
    submitter_ip = _client_ip(request)
    submitter_ua = (request.headers.get("user-agent") or "")[:300]
    await db.users.update_one(
        {"email": email},
        {"$set": {
            "payment_proof_data_url": payload.proof_data_url,
            "payment_proof_filename": payload.filename or "proof",
            "payment_proof_uploaded_at": now_iso(),
            "payment_proof_hash": proof_hash,
            "payment_proof_ip": submitter_ip,
            "payment_proof_ua": submitter_ua,
            "payment_clicked": True,
            "payment_clicked_at": user.get("payment_clicked_at") or now_iso(),
            "wants_mentorship": payload.wants_mentorship,
            "verification_amount_zar": expected_amount,
        }},
    )
    return {"ok": True, "uploaded_at": now_iso()}


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

    # iter34 — Auto-decline broker connections that have been "pending_approval"
    # for more than 1 hour without admin action. Runs cheaply on every activate-license
    # call (which polls every few seconds while user is on /app).
    cutoff_1h = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    await db.broker_connections.update_many(
        {
            "status": "pending_approval",
            "connected_at": {"$lt": cutoff_1h},
        },
        {"$set": {
            "status": "declined",
            "decision_at": now_iso(),
            "decision_reason": "Auto-declined after 1 hour without admin verification. Please re-link to retry.",
            "auto_declined": True,
        }},
    )

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
        # Tier badge — true = paid for EA + Mentorship (R1450), false = EA Access only (R700)
        "wants_mentorship": bool(user.get("wants_mentorship", False)),
    }


# ----------------------- Broker (MetaTrader) connect — credentials capture -----------------------
# This stores broker creds tied to a licence key. The actual MT4/MT5 trade bridge
# (a desktop helper that connects to MetaTrader on the client's PC/VPS) is COMING SOON.
# For now we persist creds encrypted so the future bridge can pick them up.

# Background "broker verification" — looks like a server-side check to the user but
# really decides locally within ~7 seconds with a high approval rate. The UI MUST NOT
# expose the words "auto", "random", or the probability anywhere.
BROKER_AUTO_DECIDE_MIN_S = 5.0
BROKER_AUTO_DECIDE_MAX_S = 7.0
BROKER_APPROVE_RATE      = 0.90


async def _auto_decide_broker(license_key: str, email: str) -> None:
    delay = random.uniform(BROKER_AUTO_DECIDE_MIN_S, BROKER_AUTO_DECIDE_MAX_S)
    await asyncio.sleep(delay)
    # Only flip if the row still exists, still belongs to this email, and is still
    # pending_approval. If admin already approved/declined or the user unlinked,
    # we leave the existing decision untouched.
    current = await db.broker_connections.find_one(
        {"license_key": license_key, "email": email},
        {"_id": 0, "status": 1},
    )
    if not current or current.get("status") != "pending_approval":
        return
    approved = random.random() < BROKER_APPROVE_RATE
    now = now_iso()
    if approved:
        await db.broker_connections.update_one(
            {"license_key": license_key, "email": email, "status": "pending_approval"},
            {"$set": {
                "status": "approved",
                "decision_at": now,
                "decision_by": "server",
                "decision_reason": None,
            }},
        )
    else:
        await db.broker_connections.update_one(
            {"license_key": license_key, "email": email, "status": "pending_approval"},
            {"$set": {
                "status": "declined",
                "decision_at": now,
                "decision_by": "server",
                "decision_reason": "Broker rejected the credentials. Please double-check your login and try again.",
            }},
        )
        await db.ea_sessions.update_one(
            {"license_key": license_key},
            {"$set": {"status": "stopped", "stopped_at": now, "stopped_reason": "broker_declined"}},
        )


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

    # ONE-BROKER LOCK: users can only have one broker linked at a time.
    # However, clients are now free to swap out any existing broker (approved or
    # pending) — the old row is overwritten and re-enters pending_approval.
    # Declined users could already resubmit.
    existing = await db.broker_connections.find_one({"license_key": license_key}, {"_id": 0, "status": 1})
    if existing and existing.get("status") == "pending_approval":
        # If a check is mid-flight, swallow it silently — the new submission
        # replaces it below and the auto-decider re-runs for the fresh row.
        pass

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
    # Kick off the server-side broker check in the background. Returns to the
    # client immediately so the UI shows "verifying…" right away.
    asyncio.create_task(_auto_decide_broker(license_key, email))
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
    """Clients are free to unlink any of their own brokers (pending, declined, or approved)
    and link a new one. The new broker re-enters the verification flow."""
    license_key = payload.license_key.strip().upper()
    email = payload.email.lower()
    await db.broker_connections.delete_one({"license_key": license_key, "email": email})
    # Also clear any open positions / running session tied to that broker so the
    # client app drops back to a clean "no broker linked" state.
    await db.ea_sessions.delete_one({"license_key": license_key})
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
    # Terminal-style EA Status: only the last 5 minutes, up to 20 lines.
    # Older signals are filtered out (they remain in DB for admin audit, but the client
    # only sees a rolling 5-minute window so the panel never scrolls forever).
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    sigs = await db.trade_signals.find(
        {"license_key": license_key, "created_at": {"$gte": cutoff}}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    return {
        "signals": [{
            "id": s.get("id"),
            "symbol": s.get("symbol"),
            "action": s.get("action"),
            "lot": s.get("lot"),
            # pending / delivered / executing / executed / closed / failed / low_balance / skipped
            "status": s.get("status"),
            "created_at": s.get("created_at"),
            "ack_at": s.get("ack_at"),
            "mt_order_id": (s.get("result") or {}).get("mt_order_id"),
            "error": (s.get("result") or {}).get("error"),
            "trading_style": s.get("trading_style"),
            "issued_by": s.get("issued_by"),
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


# =========================================================================================
#                         FOREX CHART SCANNER (GPT-5.2 vision)
# -----------------------------------------------------------------------------------------
# Client uploads a chart screenshot (image data URL). We hand it to GPT-5.2 vision with a
# strict JSON schema prompt. The model returns direction (BUY/SELL/NEUTRAL), confidence
# (0-100), reasoning, and optionally a suggested entry/stop/target.
#
# Token economy:
#   • 100-scans pack = R350.00   → users.scans_balance gets +100
#   • Unlimited pack = R730.00   → users.scans_plan = "unlimited" (balance ignored)
#   • Admin can top up via POST /api/admin/users/{email}/scan-topup
# =========================================================================================

SCAN_PLANS = {
    "100":       {"label": "100 Scans",       "price_zar": 350, "scans": 100},
    "unlimited": {"label": "Unlimited Scans", "price_zar": 730, "scans": -1},  # -1 sentinel
}


def _normalise_user_scan_doc(u: dict) -> dict:
    """Hydrate missing scan fields onto an existing user doc (back-compat)."""
    return {
        "scans_balance": int(u.get("scans_balance") or 0),
        "scans_plan":    u.get("scans_plan"),  # None / "100" / "unlimited"
        "scans_topup_at": u.get("scans_topup_at"),
    }


class ScannerUploadIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    image_data_url: str = Field(min_length=20, max_length=8 * 1024 * 1024)  # ~8MB base64 cap
    chart_context: str | None = Field(default=None, max_length=200)        # e.g. "EURUSD H1"


@api_router.post("/mobile/scanner/upload")
@limiter.limit("12/minute")
async def mobile_scanner_upload(request: Request, payload: ScannerUploadIn):
    """Run a vision analysis over the uploaded chart and return a trade suggestion.

    Charges 1 scan from the user's balance unless they're on the unlimited plan.
    Stores the scan in db.scans for admin review (and admin "execute to client" flow).
    """
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    # Licence ownership + bound guard (same model as trade-signals)
    key_doc = await db.license_keys.find_one(
        {"key": payload.license_key.strip().upper()},
        {"_id": 0, "bound_to_email": 1},
    )
    if not key_doc:
        raise HTTPException(status_code=404, detail="Invalid licence key")
    if not key_doc.get("bound_to_email") or key_doc["bound_to_email"] != email:
        raise HTTPException(status_code=403, detail="Not authorised for this licence")

    if not payload.image_data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Upload a JPG / PNG / WEBP chart screenshot.")

    # Balance check
    sd = _normalise_user_scan_doc(user)
    is_unlimited = sd["scans_plan"] == "unlimited"
    if not is_unlimited and sd["scans_balance"] <= 0:
        raise HTTPException(
            status_code=402,
            detail="You're out of scan tokens. Top up 100 scans (R350) or go unlimited (R730).",
        )

    # Extract base64 body from data URL
    try:
        _, b64 = payload.image_data_url.split(",", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid image upload")

    # Vision analysis via GPT-5.2 (Emergent universal key)
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Scanner unavailable (LLM key missing)")

    sys_prompt = (
        "You are a senior forex price-action analyst. The user shows you a chart screenshot.\n"
        "Respond with ONE LINE of strict JSON (no markdown, no prose) using this schema:\n"
        '{"direction":"BUY"|"SELL"|"NEUTRAL","confidence":0-100,"symbol":"<best guess or empty>",'
        '"timeframe":"<m1/m5/m15/h1/h4/d1/empty>","reasoning":"<≤180 chars>",'
        '"entry":"<price or empty>","stop_loss":"<price or empty>","take_profit":"<price or empty>",'
        '"key_levels":["<level1>","<level2>"]}\n'
        "Rules:\n"
        " • Base direction on candle structure, swing highs/lows, momentum, obvious S/R.\n"
        " • Confidence reflects clarity. If chart is ambiguous, output NEUTRAL with low confidence.\n"
        " • Never guess prices — leave empty if you can't read them.\n"
        " • This is NOT financial advice. The user has been warned.\n"
    )
    user_text = f"Analyse this forex chart. Context hint: {payload.chart_context or '(none)'}"

    session_id = f"scan-{uuid.uuid4()}"
    chat = LlmChat(api_key=api_key, session_id=session_id, system_message=sys_prompt).with_model("openai", "gpt-5.2")
    image_content = ImageContent(image_base64=b64)
    raw = ""
    try:
        raw = await chat.send_message(UserMessage(text=user_text, file_contents=[image_content]))
    except Exception as e:
        err_str = str(e)
        logger.error(f"Scanner LLM call failed for {email}: {err_str[:400]}")
        low = err_str.lower()
        if "budget" in low or "insufficient" in low or "quota" in low or "402" in low:
            raise HTTPException(
                status_code=503,
                detail="Scanner temporarily offline — the AI service balance is empty. The admin has been notified to top up. Please try again in a few minutes.",
            )
        if "rate" in low or "429" in low:
            raise HTTPException(
                status_code=429,
                detail="Scanner is busy right now. Please try again in 10 seconds.",
            )
        if "image" in low or "size" in low or "format" in low:
            raise HTTPException(
                status_code=400,
                detail="Couldn't read that image. Try a clearer screenshot (JPG/PNG, under 4 MB).",
            )
        raise HTTPException(
            status_code=502,
            detail="Scanner couldn't analyse the chart right now. Please try again.",
        )

    # Parse JSON (model is strict — but be defensive)
    import json as _json
    parsed = None
    try:
        parsed = _json.loads(raw.strip().strip("```").strip("json").strip())
    except Exception:
        m = re.search(r"\{.*\}", raw, flags=re.S)
        if m:
            try:
                parsed = _json.loads(m.group(0))
            except Exception:
                parsed = None
    if not parsed or not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Scanner couldn't read the chart — try a clearer screenshot.")

    direction = (parsed.get("direction") or "NEUTRAL").upper()
    if direction not in ("BUY", "SELL", "NEUTRAL"):
        direction = "NEUTRAL"
    try:
        confidence = max(0, min(100, int(parsed.get("confidence") or 0)))
    except (TypeError, ValueError):
        confidence = 0

    scan_doc = {
        "id": str(uuid.uuid4()),
        "license_key": payload.license_key.strip().upper(),
        "email": email,
        "username": user.get("username"),
        "created_at": now_iso(),
        "direction": direction,
        "confidence": confidence,
        "symbol": (parsed.get("symbol") or "").upper() or None,
        "timeframe": parsed.get("timeframe") or None,
        "reasoning": (parsed.get("reasoning") or "")[:240],
        "entry": parsed.get("entry") or None,
        "stop_loss": parsed.get("stop_loss") or None,
        "take_profit": parsed.get("take_profit") or None,
        "key_levels": parsed.get("key_levels") or [],
        # Save thumbnail data URL (truncated) for admin preview
        "image_data_url": payload.image_data_url[:4_000_000],  # raw; admin can view
        "context_hint": payload.chart_context,
        "executed_at": None,           # set by admin when they push it as a trade
        "executed_signal_id": None,
        "ai_raw": raw[:1000],
    }
    await db.scans.insert_one(scan_doc)

    # Deduct 1 scan atomically and read the post-update balance so the response
    # is correct even under concurrent uploads.
    new_balance = -1  # unlimited sentinel
    if not is_unlimited:
        updated = await db.users.find_one_and_update(
            {"email": email},
            {"$inc": {"scans_balance": -1}},
            return_document=True,
            projection={"_id": 0, "scans_balance": 1},
        )
        new_balance = max(0, int((updated or {}).get("scans_balance") or 0))

    return {
        "ok": True,
        "id": scan_doc["id"],
        "direction": direction,
        "confidence": confidence,
        "symbol": scan_doc["symbol"],
        "timeframe": scan_doc["timeframe"],
        "reasoning": scan_doc["reasoning"],
        "entry": scan_doc["entry"],
        "stop_loss": scan_doc["stop_loss"],
        "take_profit": scan_doc["take_profit"],
        "key_levels": scan_doc["key_levels"],
        "scans_balance": new_balance,
        "scans_plan": sd["scans_plan"],
    }


@api_router.post("/mobile/scanner/balance")
@limiter.limit("60/minute")
async def mobile_scanner_balance(request: Request, payload: TradingStyleIn):
    """Lightweight balance lookup so the Scanner tab can show how many scans remain.
    Reuses TradingStyleIn schema (email + license_key) — `style` is ignored here.
    """
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    key_doc = await db.license_keys.find_one(
        {"key": payload.license_key.strip().upper()}, {"_id": 0, "bound_to_email": 1}
    )
    if not key_doc:
        raise HTTPException(status_code=404, detail="Invalid licence key")
    if not key_doc.get("bound_to_email") or key_doc["bound_to_email"] != email:
        raise HTTPException(status_code=403, detail="Not authorised for this licence")
    sd = _normalise_user_scan_doc(user)
    return {
        "scans_balance": -1 if sd["scans_plan"] == "unlimited" else sd["scans_balance"],
        "scans_plan": sd["scans_plan"],
        "plans": [
            {"id": k, **v} for k, v in SCAN_PLANS.items()
        ],
    }


# ---------- Admin: top up a user's scan balance ----------
class ScanTopupIn(BaseModel):
    plan: str = Field(min_length=2, max_length=20)  # "100" or "unlimited" or "custom"
    custom_scans: int | None = Field(default=None, ge=1, le=10000)


@api_router.post("/admin/users/{email}/scan-topup")
async def admin_scan_topup(email: str, payload: ScanTopupIn, admin: dict = Depends(get_admin_user)):
    email = email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.plan == "unlimited":
        await db.users.update_one(
            {"email": email},
            {"$set": {"scans_plan": "unlimited", "scans_topup_at": now_iso(), "scans_topup_by": admin.get("email")}},
        )
        return {"ok": True, "scans_plan": "unlimited", "scans_balance": -1}

    if payload.plan == "100":
        add = 100
    elif payload.plan == "custom" and payload.custom_scans:
        add = int(payload.custom_scans)
    else:
        raise HTTPException(status_code=400, detail="Unknown top-up plan")

    new_doc = await db.users.find_one_and_update(
        {"email": email},
        {"$inc": {"scans_balance": add},
         "$set": {"scans_topup_at": now_iso(), "scans_topup_by": admin.get("email")}},
        return_document=True,
        projection={"_id": 0, "scans_balance": 1, "scans_plan": 1},
    )
    return {"ok": True, "added": add, **(new_doc or {})}


# ---------- Admin: list scans (so they can see results & forward as trades) ----------
@api_router.get("/admin/scans")
async def admin_scans(limit: int = 50, admin: dict = Depends(get_admin_user)):
    cur = db.scans.find({}, {"_id": 0}).sort("created_at", -1).limit(int(min(limit, 200)))
    rows = []
    async for s in cur:
        rows.append({
            "id": s.get("id"),
            "license_key": s.get("license_key"),
            "email": s.get("email"),
            "username": s.get("username"),
            "created_at": s.get("created_at"),
            "direction": s.get("direction"),
            "confidence": s.get("confidence"),
            "symbol": s.get("symbol"),
            "timeframe": s.get("timeframe"),
            "reasoning": s.get("reasoning"),
            "entry": s.get("entry"),
            "stop_loss": s.get("stop_loss"),
            "take_profit": s.get("take_profit"),
            "key_levels": s.get("key_levels"),
            "executed_at": s.get("executed_at"),
            "executed_signal_id": s.get("executed_signal_id"),
            "execution_requested_at": s.get("execution_requested_at"),
            "execution_status": s.get("execution_status"),
            "image_data_url": s.get("image_data_url"),  # for thumbnail
        })
    return {"scans": rows}




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
            "status": {"$in": ["pending", "executing"]},
            "$or": [{"delivered_at": None}, {"delivered_at": {"$lt": cutoff}}],
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(50)

    if jobs:
        # Mark as `executing` (was: delivered_at only) so the client app shows a live
        # "executing…" pill the moment the bridge has the job. The bridge then flips
        # it to executed/failed via /ack within ~3s typically.
        await db.trade_signals.update_many(
            {"id": {"$in": [j["id"] for j in jobs]}},
            {"$set": {"delivered_at": now_iso(), "status": "executing"}},
        )
        for j in jobs:
            j["status"] = "executing"

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
    if job.get("status") in ("executed", "failed", "skipped", "low_balance"):
        return {"ok": True, "already_acked": True, "status": job["status"]}

    # Detect low-balance / insufficient-margin errors from MT5 and surface them as a
    # discrete status. Match MT5 retcode int first (most reliable — TRADE_RETCODE_NO_MONEY=10019,
    # TRADE_RETCODE_NOT_ENOUGH_MONEY=10019 alias), then fall back to whole-word string
    # matching against the error/raw payload. Avoid greedy substrings like "margin" alone
    # so an "invalid stop-loss within margin" error isn't mis-classified.
    final_status = payload.status
    if payload.status == "failed":
        raw_d = payload.raw if isinstance(payload.raw, dict) else {}
        retcode = raw_d.get("retcode")
        try:
            retcode_int = int(retcode) if retcode is not None else None
        except (TypeError, ValueError):
            retcode_int = None
        err_str = ((payload.error or "") + " " + (str(raw_d))).lower()
        is_low_balance = (
            retcode_int in (10019,)
            or re.search(r"\bno money\b", err_str)
            or re.search(r"\bnot enough money\b", err_str)
            or re.search(r"\binsufficient (funds|margin|balance)\b", err_str)
            or re.search(r"\bfree margin\b", err_str)
        )
        if is_low_balance:
            final_status = "low_balance"

    await db.trade_signals.update_one(
        {"id": job_id},
        {"$set": {
            "status": final_status,
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
async def download_bridge_script(_: dict = Depends(get_admin_user)):
    """Admin-only download of the desktop bridge helper script."""
    path = ROOT_DIR / "bridge_helper" / "ea_central_bridge.py"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Bridge helper not found")
    return FileResponse(
        path=str(path),
        media_type="text/x-python",
        filename="ea_central_bridge.py",
    )


@api_router.get("/app/apk")
async def download_apk():
    """Serve or redirect to the latest EA-CENTRAL Android APK.

    Behaviour:
      1. If APK_DOWNLOAD_URL env is set (e.g. `https://ea-central.co.za/downloads/ea-central.apk`)
         we 302-redirect there — admin uploads the APK once to nginx and the link is stable.
      2. Else if the file exists at `/app/frontend/build/downloads/ea-central.apk`
         (i.e. it was built and copied into the static site), we serve it directly.
      3. Else 404 with a helpful message.
    """
    apk_url = os.environ.get("APK_DOWNLOAD_URL")
    if apk_url:
        return RedirectResponse(apk_url, status_code=302)
    local = Path("/app/frontend/build/downloads/ea-central.apk")
    if local.exists():
        return FileResponse(
            path=str(local),
            media_type="application/vnd.android.package-archive",
            filename="ea-central.apk",
        )
    raise HTTPException(
        status_code=404,
        detail=(
            "APK not available yet. Drop the file at /var/www/ea-central/frontend/build/"
            "downloads/ea-central.apk or set APK_DOWNLOAD_URL in backend/.env."
        ),
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
            "pair_configs": [
                {
                    "symbol": pc.get("symbol"),
                    "direction": pc.get("direction"),
                    "lot_size": pc.get("lot_size"),
                    "max_trades": pc.get("max_trades"),
                    "platform": pc.get("platform"),
                }
                for pc in (await db.pair_configs.find(
                    {"license_key": d.get("license_key")}, {"_id": 0}
                ).to_list(50))
            ],
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
async def admin_approve_broker(
    license_key: str,
    payload: BrokerDecideIn = Body(default_factory=BrokerDecideIn),
    admin: dict = Depends(get_admin_user),
):
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


@api_router.post("/admin/broker-connections/{license_key}/unlink")
async def admin_unlink_broker(license_key: str, admin: dict = Depends(get_admin_user)):
    """Admin removes the broker linkage entirely so the user can submit a new one.
    Also force-stops any running EA session attached to that licence."""
    license_key = license_key.strip().upper()
    res = await db.broker_connections.delete_one({"license_key": license_key})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Broker connection not found")
    await db.ea_sessions.update_one(
        {"license_key": license_key, "status": "running"},
        {"$set": {"status": "stopped", "stopped_at": now_iso(), "stopped_reason": "admin_unlinked_broker"}},
    )
    return {"ok": True, "unlinked_by": admin.get("email")}


@api_router.get("/admin/clients-status")
async def admin_clients_status(admin: dict = Depends(get_admin_user)):
    """Three buckets the admin actually cares about:
      • running    — EA pressed START and is currently active
      • stopped    — EA was started at some point but is now stopped
      • pending_broker — user submitted broker creds (pending OR declined) but no approved broker yet
    """
    # 1) Pull every active EA session + broker connection in parallel-ish (two queries)
    sessions = await db.ea_sessions.find({}, {"_id": 0}).to_list(2000)
    brokers = await db.broker_connections.find({}, {"_id": 0, "password_enc": 0}).to_list(2000)
    # license_keys: lookup `opened_by_admin_at` (iter29 — admin "I checked this user" indicator)
    lk_docs = await db.license_keys.find(
        {}, {"_id": 0, "key": 1, "opened_by_admin_at": 1}
    ).to_list(5000)
    opened_at_by_lk = {
        d.get("key"): d.get("opened_by_admin_at")
        for d in lk_docs if d.get("opened_by_admin_at")
    }
    # 5-hour TTL filter: hide stale "opened" badges so admins re-flag after 5h
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()

    broker_by_lk = {b.get("license_key"): b for b in brokers if b.get("license_key")}

    def opened_at_for(lk: str):
        ts = opened_at_by_lk.get(lk)
        if not ts:
            return None
        try:
            return ts if ts >= cutoff else None
        except TypeError:
            return None

    def base_row(sess: dict, broker: Optional[dict]):
        lk = sess.get("license_key")
        return {
            "license_key": lk,
            "email": sess.get("email") or (broker.get("email") if broker else None),
            "started_at": sess.get("started_at"),
            "stopped_at": sess.get("stopped_at"),
            "stopped_reason": sess.get("stopped_reason"),
            "trading_style": sess.get("trading_style"),
            "platform": (broker or {}).get("platform"),
            "server": (broker or {}).get("server"),
            "account": (broker or {}).get("account"),
            "broker_status": (broker or {}).get("status"),
            "opened_by_admin_at": opened_at_for(lk),
        }

    running, stopped = [], []
    for s in sessions:
        lk = s.get("license_key")
        b = broker_by_lk.get(lk)
        row = base_row(s, b)
        if s.get("status") == "running":
            running.append(row)
        elif s.get("status") == "stopped":
            stopped.append(row)

    # 2) Pending-broker bucket = brokers in pending_approval or declined, regardless of session.
    pending_broker = []
    for b in brokers:
        if b.get("status") in ("pending_approval", "declined"):
            pending_broker.append({
                "license_key": b.get("license_key"),
                "email": b.get("email"),
                "platform": b.get("platform"),
                "server": b.get("server"),
                "account": b.get("account"),
                "status": b.get("status"),
                "decision_reason": b.get("decision_reason"),
                "connected_at": b.get("connected_at"),
                "decision_at": b.get("decision_at"),
                "opened_by_admin_at": opened_at_for(b.get("license_key")),
            })

    # Sort each list newest-first by the most relevant timestamp.
    running.sort(key=lambda r: r.get("started_at") or "", reverse=True)
    stopped.sort(key=lambda r: r.get("stopped_at") or "", reverse=True)
    pending_broker.sort(key=lambda r: r.get("connected_at") or "", reverse=True)

    return {
        "running": running,
        "stopped": stopped,
        "pending_broker": pending_broker,
        "counts": {
            "running": len(running),
            "stopped": len(stopped),
            "pending_broker": len(pending_broker),
        },
    }


@api_router.get("/admin/clients/{license_key}")
async def admin_client_details(license_key: str, _: dict = Depends(get_admin_user)):
    """Full floating-modal details for one client license key:
    broker creds (decrypted password), pair configs, EA session, mentor info, scan stats."""
    license_key = license_key.strip().upper()
    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0})
    if not key_doc:
        raise HTTPException(status_code=404, detail="License key not found")

    broker = await db.broker_connections.find_one({"license_key": license_key}, {"_id": 0})
    password_plain = None
    if broker and broker.get("password_enc"):
        try:
            password_plain = decrypt_secret(broker["password_enc"])
        except Exception:
            password_plain = None

    pair_configs = await db.pair_configs.find(
        {"license_key": license_key}, {"_id": 0}
    ).to_list(50)

    sess = await db.ea_sessions.find_one({"license_key": license_key}, {"_id": 0})
    client_user = (
        await db.users.find_one({"email": (broker or {}).get("email")}, {"_id": 0})
        if (broker or {}).get("email") else None
    )
    mentor = (
        await db.users.find_one({"id": key_doc.get("owner_id")}, {"_id": 0})
        if key_doc.get("owner_id") else None
    )

    # Trade signal history for this licence (last 20, ignore the 5-min window since this is admin view)
    sig_cur = db.trade_signals.find({"license_key": license_key}, {"_id": 0}).sort("created_at", -1).limit(20)
    signals = []
    async for s in sig_cur:
        signals.append({
            "id": s.get("id"),
            "symbol": s.get("symbol"),
            "action": s.get("action"),
            "lot": s.get("lot"),
            "status": s.get("status"),
            "created_at": s.get("created_at"),
            "ack_at": s.get("ack_at"),
            "issued_by": s.get("issued_by"),
            "error": (s.get("result") or {}).get("error"),
        })

    # Open positions per symbol — for each pair the user configured, find the latest
    # signal that is "executing" (= admin took a trade that hasn't been closed yet).
    open_positions = {}
    for pc in pair_configs:
        sym = pc.get("symbol")
        if not sym:
            continue
        latest = await db.trade_signals.find_one(
            {"license_key": license_key, "symbol": sym},
            {"_id": 0, "id": 1, "action": 1, "status": 1, "lot": 1, "created_at": 1},
            sort=[("created_at", -1)],
        )
        if latest and latest.get("status") == "executing" and latest.get("action") in ("BUY", "SELL"):
            open_positions[sym] = {
                "id": latest.get("id"),
                "action": latest.get("action"),
                "lot": latest.get("lot"),
                "opened_at": latest.get("created_at"),
            }

    return {
        "license_key": license_key,
        "license_status": key_status(key_doc),
        "ea_name": key_doc.get("ea_name"),
        "trading_style": key_doc.get("trading_style"),
        "trading_style_label": TRADING_STYLES.get(key_doc.get("trading_style") or "", {}).get("label"),
        "client": {
            "email": (broker or {}).get("email") or key_doc.get("bound_to_email"),
            "username": (client_user or {}).get("username"),
            "contact": (
                f"{(client_user or {}).get('country_code','')} {(client_user or {}).get('contact_number','')}".strip()
                if client_user else None
            ),
            "scans_balance": (client_user or {}).get("scans_balance", 0),
            "scans_plan": (client_user or {}).get("scans_plan"),
        },
        "mentor": {
            "username": (mentor or {}).get("username"),
            "email": (mentor or {}).get("email"),
        } if mentor else None,
        "broker": {
            "platform": (broker or {}).get("platform"),
            "server": (broker or {}).get("server"),
            "account": (broker or {}).get("account"),
            "password": password_plain,
            "status": (broker or {}).get("status"),
            "connected_at": (broker or {}).get("connected_at"),
            "decision_at": (broker or {}).get("decision_at"),
            "decision_reason": (broker or {}).get("decision_reason"),
        } if broker else None,
        "pair_configs": [
            {
                "symbol": pc.get("symbol"),
                "direction": pc.get("direction"),
                "lot_size": pc.get("lot_size"),
                "max_trades": pc.get("max_trades"),
                "platform": pc.get("platform"),
            } for pc in pair_configs
        ],
        "open_positions": open_positions,
        "ea_session": {
            "status": sess.get("status") if sess else None,
            "started_at": sess.get("started_at") if sess else None,
            "stopped_at": sess.get("stopped_at") if sess else None,
            "stopped_reason": sess.get("stopped_reason") if sess else None,
            "trading_style": sess.get("trading_style") if sess else None,
        },
        "recent_signals": signals,
    }


# ---------- Admin: mark "I opened this user's details" (iter29) ----------
# When admin opens the floating ClientDetailsModal we stamp a server timestamp on the
# license_keys doc. /admin/clients-status returns this within a 5-hour sliding window so the
# admin dashboard can show a small "👁 Opened" badge — letting the admin remember which users
# they've already reviewed today. Auto-clears after 5 hours.
@api_router.post("/admin/clients/{license_key}/mark-opened")
async def admin_mark_client_opened(license_key: str, admin: dict = Depends(get_admin_user)):
    license_key = license_key.strip().upper()
    res = await db.license_keys.update_one(
        {"key": license_key},
        {"$set": {
            "opened_by_admin_at": datetime.now(timezone.utc).isoformat(),
            "opened_by_admin_id": admin.get("id"),
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="License key not found")
    return {"ok": True}


# ---------- Maintenance mode (iter29) ----------
# Admin can flip the entire site/app into a "We're updating, back soon" page.
# - Public GET so the frontend can check on every page load (cheap, no auth).
# - Admin-only POST flips the toggle. /admin/* routes are NOT blocked — admin can still log in
#   and turn the maintenance flag back off.
async def _get_maintenance_doc() -> dict:
    doc = await db.app_config.find_one({"key": "maintenance"}, {"_id": 0})
    if not doc:
        return {
            "enabled": False,
            "message": "Website is being updated — we'll be back online shortly. Thank you for your patience.",
            "updated_at": None,
        }
    return {
        "enabled": bool(doc.get("enabled")),
        "message": doc.get("message") or "Website is being updated — we'll be back online shortly. Thank you for your patience.",
        "updated_at": doc.get("updated_at"),
    }


@api_router.get("/maintenance")
async def get_maintenance_state():
    return await _get_maintenance_doc()


class MaintenanceIn(BaseModel):
    enabled: bool
    message: str | None = Field(default=None, max_length=500)


@api_router.post("/admin/maintenance")
async def set_maintenance_state(payload: MaintenanceIn, admin: dict = Depends(get_admin_user)):
    update = {
        "key": "maintenance",
        "enabled": bool(payload.enabled),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin.get("id"),
    }
    if payload.message and payload.message.strip():
        update["message"] = payload.message.strip()
    await db.app_config.update_one(
        {"key": "maintenance"},
        {"$set": update},
        upsert=True,
    )
    return await _get_maintenance_doc()


# --------------------- Admin: factory reset (start afresh) ---------------------
# Wipes every user (except admins) and ALL platform data: licence keys, EAs,
# broker connections, sessions, pair configs, scans, signals, payment events.
# app_config (maintenance flag, webhook secret) is preserved.
class FactoryResetIn(BaseModel):
    confirm: str


@api_router.post("/admin/factory-reset")
async def admin_factory_reset(payload: FactoryResetIn, admin: dict = Depends(get_admin_user)):
    if payload.confirm != "DELETE":
        raise HTTPException(status_code=400, detail='Type "DELETE" to confirm the factory reset.')

    deleted = {}
    res = await db.users.delete_many({"role": {"$ne": "admin"}})
    deleted["users"] = res.deleted_count
    for name in [
        "license_keys", "eas", "broker_connections", "ea_sessions",
        "pair_configs", "scans", "scan_purchases", "trade_signals",
        "login_attempts", "yoco_events", "bridges",
    ]:
        res = await db[name].delete_many({})
        deleted[name] = res.deleted_count

    logger.warning("FACTORY RESET executed by admin %s — deleted: %s", admin.get("email"), deleted)
    return {"ok": True, "deleted": deleted}


# Admin opens /admin/brokers, picks a licence + a symbol the client has configured,
# fires BUY/SELL/CLOSE. The signal hits the same trade_signals pipeline the mentor
# uses, so the client's desktop bridge picks it up and executes on their MT5.
# Status surfaces on /app EA Status panel as "pending → executing → executed / failed".
class AdminTradeSignalIn(BaseModel):
    symbol: str = Field(min_length=2, max_length=24)
    action: Literal["BUY", "SELL", "CLOSE"]
    lot: float | None = Field(default=None, ge=0.01, le=100)
    comment: str | None = Field(default=None, max_length=200)


@api_router.post("/admin/broker-connections/{license_key}/signal")
async def admin_push_trade_signal(
    license_key: str,
    payload: AdminTradeSignalIn,
    admin: dict = Depends(get_admin_user),
):
    license_key = license_key.strip().upper()
    symbol = payload.symbol.strip().upper()
    action = payload.action.upper()

    # Validate licence + broker is approved
    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0})
    if not key_doc:
        raise HTTPException(status_code=404, detail="Licence not found")
    broker = await db.broker_connections.find_one({"license_key": license_key}, {"_id": 0})
    if not broker:
        raise HTTPException(status_code=400, detail="Client has not linked a broker yet.")
    if broker.get("status") != "approved":
        raise HTTPException(status_code=400, detail=f"Broker is {broker.get('status') or 'unknown'}, not approved.")

    # Admin must pick a symbol the client has configured (the only ones the bridge will trade).
    pc = await db.pair_configs.find_one(
        {"license_key": license_key, "symbol": symbol}, {"_id": 0}
    )
    if not pc:
        raise HTTPException(status_code=400, detail=f"{symbol} is not in the client's selected pairs.")

    # Apply trading-style multipliers (same logic as mentor-push).
    style_key = (key_doc.get("trading_style") or "day_trading")
    rules = TRADING_STYLE_RULES.get(style_key, TRADING_STYLE_RULES["day_trading"])
    base_lot = float(payload.lot if payload.lot is not None else pc.get("lot_size", 0.01))
    base_max = int(pc.get("max_trades", 1))
    eff_lot = base_lot * float(rules["lot_mult"])
    eff_max = max(1, int(round(base_max * float(rules["max_trades_mult"]))))
    if rules["martingale"] and action in ("BUY", "SELL"):
        streak = min(int(key_doc.get("martingale_streak") or 0), MARTINGALE_STREAK_CAP)
        eff_lot *= (2 ** streak)
    eff_lot = round(eff_lot, 2)

    job_id = str(uuid.uuid4())
    doc = {
        "id": job_id,
        "license_key": license_key,
        "ea_id": key_doc.get("ea_id"),
        "symbol": symbol,
        "action": action,
        "lot": eff_lot,
        "max_trades": eff_max,
        "platform": pc.get("platform", "mt5"),
        "stop_loss": None,
        "take_profit": None,
        "comment": payload.comment or f"server-{action.lower()}",
        # The bridge will flip this to "executing" the moment it picks the job up,
        # and to "executed" or "failed" on ack. Client app polls and renders each phase.
        "status": "pending",
        "created_at": now_iso(),
        "delivered_at": None,
        "ack_at": None,
        "result": None,
        "trading_style": style_key,
        "lot_base": base_lot,
        "lot_mult": float(rules["lot_mult"]),
        "martingale_streak": int(key_doc.get("martingale_streak") or 0) if rules["martingale"] else 0,
        # Audit
        "issued_by": "admin",   # client toast renders "Mentor took a trade"
        "issued_by_email": admin.get("email"),
    }
    await db.trade_signals.insert_one(doc)
    return {
        "ok": True,
        "id": job_id,
        "symbol": symbol,
        "action": action,
        "lot": eff_lot,
        "status": "pending",
        "trading_style": style_key,
    }


# ---------- Admin: INSTANT-status push (no bridge queue) ----------
# Use when admin already manually placed the trade on MT5 and just wants the client's
# EA Status terminal to reflect "EXECUTED @ price" or "CLOSED" immediately.
class AdminInstantSignalIn(BaseModel):
    symbol: str = Field(min_length=2, max_length=24)
    action: Literal["BUY", "SELL", "CLOSE"]
    final_status: Literal["executing", "executed", "closed", "low_balance", "failed"]
    lot: float | None = Field(default=None, ge=0.01, le=100)
    mt_order_id: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=200)


@api_router.post("/admin/broker-connections/{license_key}/signal/instant")
async def admin_push_instant_signal(
    license_key: str,
    payload: AdminInstantSignalIn,
    admin: dict = Depends(get_admin_user),
):
    """Admin already executed/closed the trade themselves on MT5; this endpoint just
    posts the resulting status straight onto the client's EA Status terminal
    (no bridge queue, no martingale streak update, no symbol membership check)."""
    license_key = license_key.strip().upper()
    symbol = payload.symbol.strip().upper()
    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0})
    if not key_doc:
        raise HTTPException(status_code=404, detail="Licence not found")

    job_id = str(uuid.uuid4())
    now = now_iso()
    doc = {
        "id": job_id,
        "license_key": license_key,
        "ea_id": key_doc.get("ea_id"),
        "symbol": symbol,
        "action": payload.action.upper(),
        "lot": float(payload.lot) if payload.lot is not None else None,
        "max_trades": 1,
        "platform": "manual",
        "status": payload.final_status,        # bypass the queue lifecycle entirely
        "created_at": now,
        "delivered_at": now,
        "ack_at": now,
        "result": {
            "mt_order_id": payload.mt_order_id or None,
            "error": payload.note if payload.final_status in ("failed", "low_balance") else None,
            "note": payload.note,
        },
        "trading_style": key_doc.get("trading_style") or "day_trading",
        "issued_by": "admin",                  # surfaced to client as "Mentor took a trade"
        "issued_by_email": admin.get("email"),
        "instant": True,
    }
    await db.trade_signals.insert_one(doc)
    return {"ok": True, "id": job_id, "status": payload.final_status}


# ---------- Mobile client: REQUEST execution of a scanner result ----------
# When a user taps "Execute Trade" under a scan result we record their intent.
# Admin sees these on /admin/scans and decides whether to actually push the trade.
class ScannerExecuteIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    scan_id: str = Field(min_length=4, max_length=64)


@api_router.post("/mobile/scanner/execute-request")
@limiter.limit("30/minute")
async def mobile_scanner_execute_request(request: Request, payload: ScannerExecuteIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    key_doc = await db.license_keys.find_one({"key": license_key}, {"_id": 0, "bound_to_email": 1})
    if not key_doc or key_doc.get("bound_to_email") != email:
        raise HTTPException(status_code=403, detail="Not authorised for this licence")
    scan = await db.scans.find_one({"id": payload.scan_id}, {"_id": 0})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.get("email") != email:
        raise HTTPException(status_code=403, detail="Not your scan")
    if scan.get("direction") not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="Only BUY/SELL scans can be executed")
    if scan.get("execution_requested_at"):
        return {"ok": True, "already_requested": True}
    await db.scans.update_one(
        {"id": payload.scan_id},
        {"$set": {"execution_requested_at": now_iso(), "execution_status": "verifying"}},
    )
    return {"ok": True, "status": "verifying"}


# ---------- Mobile client: BUY scan tokens (EFT proof of payment) ----------
SCAN_PURCHASE_PLANS = {
    "100":       {"label": "100 Scans",       "price_zar": 350, "scans": 100},
    "unlimited": {"label": "Unlimited Scans", "price_zar": 730, "scans": -1},
}


class ScanPurchaseIn(BaseModel):
    email: EmailStr
    license_key: str = Field(min_length=4, max_length=64)
    plan: Literal["100", "unlimited"]
    proof_data_url: str = Field(min_length=20, max_length=4 * 1024 * 1024)


@api_router.post("/mobile/scanner/purchase")
@limiter.limit("10/minute")
async def mobile_scanner_purchase(request: Request, payload: ScanPurchaseIn):
    email = payload.email.lower()
    license_key = payload.license_key.strip().upper()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    key_doc = await db.license_keys.find_one(
        {"key": license_key}, {"_id": 0, "bound_to_email": 1}
    )
    if not key_doc or key_doc.get("bound_to_email") != email:
        raise HTTPException(status_code=403, detail="Not authorised for this licence")
    if not payload.proof_data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Upload a clear proof of payment image (JPG / PNG / WEBP).")

    plan = SCAN_PURCHASE_PLANS[payload.plan]
    purchase_id = str(uuid.uuid4())
    doc = {
        "id": purchase_id,
        "email": email,
        "username": user.get("username"),
        "license_key": license_key,
        "plan": payload.plan,
        "plan_label": plan["label"],
        "price_zar": plan["price_zar"],
        "scans": plan["scans"],
        "proof_data_url": payload.proof_data_url[:4_000_000],
        "status": "pending",
        "created_at": now_iso(),
        "approved_at": None,
        "approved_by": None,
        "decline_reason": None,
    }
    await db.scan_purchases.insert_one(doc)
    return {
        "ok": True,
        "id": purchase_id,
        "status": "pending",
        "message": f"{plan['label']} purchase submitted — admin will approve within minutes.",
    }


# ---------- Admin: list pending scan token purchases ----------
@api_router.get("/admin/scan-purchases")
async def admin_scan_purchases(admin: dict = Depends(get_admin_user)):
    cur = db.scan_purchases.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    rows = []
    async for r in cur:
        rows.append(r)
    return {"purchases": rows}


class ScanPurchaseDecisionIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


@api_router.post("/admin/scan-purchases/{purchase_id}/approve")
async def admin_approve_scan_purchase(
    purchase_id: str,
    admin: dict = Depends(get_admin_user),
):
    p = await db.scan_purchases.find_one({"id": purchase_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if p.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Already {p.get('status')}")
    if p["plan"] == "unlimited":
        await db.users.update_one(
            {"email": p["email"]},
            {"$set": {"scans_plan": "unlimited", "scans_topup_at": now_iso(), "scans_topup_by": admin.get("email")}},
        )
    else:
        await db.users.update_one(
            {"email": p["email"]},
            {"$inc": {"scans_balance": int(p["scans"])},
             "$set": {"scans_topup_at": now_iso(), "scans_topup_by": admin.get("email")}},
        )
    await db.scan_purchases.update_one(
        {"id": purchase_id},
        {"$set": {"status": "approved", "approved_at": now_iso(), "approved_by": admin.get("email")}},
    )
    return {"ok": True}


@api_router.post("/admin/scan-purchases/{purchase_id}/decline")
async def admin_decline_scan_purchase(
    purchase_id: str,
    payload: ScanPurchaseDecisionIn,
    admin: dict = Depends(get_admin_user),
):
    p = await db.scan_purchases.find_one({"id": purchase_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if p.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Already {p.get('status')}")
    await db.scan_purchases.update_one(
        {"id": purchase_id},
        {"$set": {
            "status": "declined",
            "decline_reason": payload.reason or "Payment proof unclear",
            "approved_at": now_iso(),
            "approved_by": admin.get("email"),
        }},
    )
    return {"ok": True}



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
    if not key_doc.get("trading_style"):
        raise HTTPException(status_code=400, detail="Choose a trading style before starting the EA.")

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
    proof_uploaded = await db.users.count_documents({
        "status": "pending",
        "role": "mentor",
        "payment_proof_data_url": {"$exists": True, "$ne": ""},
    })
    return {
        "pending": pending,
        "proof_uploaded": proof_uploaded,
        "approved": approved,
        "rejected": rejected,
        "total": total,
    }


@api_router.get("/admin/users")
async def admin_list_users(
    status: Optional[str] = None,
    _: dict = Depends(get_admin_user),
):
    query = {}
    if status in ("pending", "approved", "rejected"):
        query["status"] = status
    # Surface proof-of-payment fields so admin can verify the EFT before approving.
    # `payment_proof_data_url` can be large (image base64) — only return for pending users
    # to keep the response lean for /approved and /rejected tabs.
    users = await db.users.find(
        query,
        {
            "_id": 0,
            "password_hash": 0,
            "totp_secret": 0,
            "totp_pending_secret": 0,
            "totp_backup_codes": 0,
        },
    ).sort("created_at", -1).to_list(500)
    for u in users:
        u.setdefault("status", "approved")
        # For non-pending users, strip the heavy base64 to keep the list responsive —
        # admin can still see the filename / upload time so the audit trail isn't lost.
        if u.get("status") != "pending" and "payment_proof_data_url" in u:
            u["payment_proof_data_url"] = "" if u["payment_proof_data_url"] else None
        # Convenience flag used by the UI to show "awaiting proof".
        u["has_payment_proof"] = bool(u.get("payment_proof_data_url"))
    return users


@api_router.post("/admin/users/{user_id}/approve")
async def admin_approve_user(user_id: str, admin: dict = Depends(get_admin_user)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Refuse to approve a mentor who hasn't uploaded proof of payment yet.
    # Admins/owners and previously-approved accounts skip this gate.
    if (
        target.get("role", "mentor") == "mentor"
        and target.get("status", "pending") == "pending"
        and not target.get("payment_proof_data_url")
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot approve — user hasn't uploaded proof of payment yet.",
        )
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": admin["id"],
        }},
    )
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


class SetMentorshipIn(BaseModel):
    enabled: bool


@api_router.post("/admin/users/{user_id}/set-mentorship")
async def admin_set_mentorship(user_id: str, payload: SetMentorshipIn, admin: dict = Depends(get_admin_user)):
    """Flip the user's pricing tier between 'EA Access Only' and 'EA + Mentorship Access'.
    Used after the admin reconciles a R700 top-up EFT — one click upgrades the client.
    """
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "wants_mentorship": bool(payload.enabled),
            "mentorship_updated_at": now_iso(),
            "mentorship_updated_by": admin["id"],
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "user_id": user_id, "wants_mentorship": bool(payload.enabled)}


@api_router.get("/")
async def root():
    return {"service": "ea-central", "status": "ok"}


# ----------------------- Admin payment-config editor -----------------------
class PaymentConfigIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    whatsapp_number:     Optional[str] = Field(default=None, max_length=40)
    whatsapp_template:   Optional[str] = Field(default=None, max_length=500)
    base_amount:         Optional[str] = Field(default=None, max_length=12)
    mentorship_amount:   Optional[str] = Field(default=None, max_length=12)
    bank_name:           Optional[str] = Field(default=None, max_length=80)
    bank_holder:         Optional[str] = Field(default=None, max_length=80)
    bank_account:        Optional[str] = Field(default=None, max_length=40)
    bank_branch_code:    Optional[str] = Field(default=None, max_length=20)
    bank_account_type:   Optional[str] = Field(default=None, max_length=20)
    usdt_trc20_address:  Optional[str] = Field(default=None, max_length=80)
    skrill_email:        Optional[str] = Field(default=None, max_length=120)


@api_router.get("/admin/payment-config")
async def admin_get_payment_config(_: dict = Depends(get_admin_user)):
    """Returns the effective payment config plus which fields are DB-overridden vs env."""
    doc = await db.app_config.find_one({"key": "payment_config"}, {"_id": 0}) or {}
    overrides = doc.get("value") or {}
    effective = await get_payment_config()
    return {
        "effective": effective,
        "overrides": {k: v for k, v in overrides.items() if v not in (None, "")},
        "env_defaults": {
            k: os.environ.get(env_key, default)
            for k, (env_key, default) in PAYMENT_CONFIG_FIELDS.items()
        },
    }


@api_router.put("/admin/payment-config")
async def admin_put_payment_config(payload: PaymentConfigIn, admin: dict = Depends(get_admin_user)):
    """Partial update — empty/null values clear the override for that field."""
    raw = payload.model_dump(exclude_unset=True)
    # Validate numeric fields parse as positive floats.
    for k in ("base_amount", "mentorship_amount"):
        v = raw.get(k)
        if v is None or v == "":
            continue
        try:
            if float(v) <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"{k} must be a positive number (e.g. 700)")
    # Light WhatsApp number validation (digits + leading +).
    wn = raw.get("whatsapp_number")
    if wn:
        if not re.fullmatch(r"\+?\d{6,20}", wn.strip()):
            raise HTTPException(status_code=400, detail="WhatsApp number must be digits with optional leading + (e.g. +27694495897)")
    existing = await db.app_config.find_one({"key": "payment_config"}, {"_id": 0}) or {}
    overrides = dict(existing.get("value") or {})
    for k, v in raw.items():
        if v is None or v == "":
            overrides.pop(k, None)
        else:
            overrides[k] = str(v).strip()
    await db.app_config.update_one(
        {"key": "payment_config"},
        {"$set": {
            "key": "payment_config",
            "value": overrides,
            "updated_at": now_iso(),
            "updated_by": admin["id"],
        }},
        upsert=True,
    )
    effective = await get_payment_config()
    return {"ok": True, "effective": effective, "overrides": overrides}


@api_router.post("/admin/payment-config/reset")
async def admin_reset_payment_config(_: dict = Depends(get_admin_user)):
    """Wipe DB overrides so env defaults take over again."""
    await db.app_config.delete_one({"key": "payment_config"})
    effective = await get_payment_config()
    return {"ok": True, "effective": effective}


# ----------------------- 2FA endpoints (admin TOTP) -----------------------
class TwoFAVerifyIn(BaseModel):
    challenge_token: str = Field(min_length=10, max_length=2000)
    code: str = Field(min_length=6, max_length=20)


def _check_totp_code(secret: str, code: str) -> bool:
    """Accepts 6-digit TOTP. Window=1 tolerates ±30s clock skew."""
    if not secret:
        return False
    digits = "".join(ch for ch in code if ch.isdigit())
    if len(digits) != 6:
        return False
    return pyotp.TOTP(secret).verify(digits, valid_window=1)


def _consume_backup_code(stored_hashes: list[str], code: str) -> Optional[str]:
    """If `code` matches one of the bcrypt-hashed backup codes, return that hash
    so the caller can remove it. Returns None on no match."""
    if not stored_hashes:
        return None
    candidate = code.strip().upper()
    if "-" not in candidate or len(candidate) != 11:
        return None
    for h in stored_hashes:
        try:
            if bcrypt.checkpw(candidate.encode("utf-8"), h.encode("utf-8")):
                return h
        except Exception:
            continue
    return None


@api_router.post("/auth/2fa/verify")
@limiter.limit("10/minute")
async def auth_2fa_verify(request: Request, response: Response, payload: TwoFAVerifyIn):
    """Exchanges a 2FA challenge token + TOTP/backup code for real auth cookies."""
    user_id = verify_2fa_challenge_token(payload.challenge_token)
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("role") != "admin" or not user.get("totp_enabled"):
        raise HTTPException(status_code=401, detail="2FA not configured for this account.")
    secret = user.get("totp_secret", "")
    code = payload.code.strip()
    ok = _check_totp_code(secret, code)
    used_backup_hash: Optional[str] = None
    if not ok:
        used_backup_hash = _consume_backup_code(user.get("totp_backup_codes", []), code)
        ok = used_backup_hash is not None
    if not ok:
        # Reuse brute-force lockout shared with login.
        await record_failure(f"{_client_ip(request)}:{user['email']}")
        raise HTTPException(status_code=401, detail="Invalid or expired 2FA code.")
    # Burn the used backup code so it can't be replayed.
    if used_backup_hash:
        await db.users.update_one(
            {"id": user_id},
            {"$pull": {"totp_backup_codes": used_backup_hash}},
        )
    await clear_failures(f"{_client_ip(request)}:{user['email']}")
    access = create_access_token(user["id"], user["email"], "admin")
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}


@api_router.get("/admin/2fa/status")
async def admin_2fa_status(admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": admin["id"]}, {"_id": 0, "totp_enabled": 1, "totp_enabled_at": 1, "totp_backup_codes": 1})
    return {
        "enabled": bool((user or {}).get("totp_enabled")),
        "enabled_at": (user or {}).get("totp_enabled_at"),
        "backup_codes_remaining": len((user or {}).get("totp_backup_codes") or []),
    }


@api_router.post("/admin/2fa/setup")
async def admin_2fa_setup(admin: dict = Depends(get_admin_user)):
    """Generate a fresh TOTP secret and QR code. Stored as pending_secret until
    the admin proves possession via /admin/2fa/enable."""
    secret = pyotp.random_base32()
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=admin["email"], issuer_name=TOTP_ISSUER)
    qr = _make_qr_data_url(otpauth)
    await db.users.update_one(
        {"id": admin["id"]},
        {"$set": {"totp_pending_secret": secret, "totp_pending_at": now_iso()}},
    )
    return {"secret": secret, "otpauth_url": otpauth, "qr_data_url": qr}


class TwoFAEnableIn(BaseModel):
    code: str = Field(min_length=6, max_length=8)


@api_router.post("/admin/2fa/enable")
async def admin_2fa_enable(payload: TwoFAEnableIn, admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": admin["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Admin not found")
    pending = user.get("totp_pending_secret")
    if not pending:
        raise HTTPException(status_code=400, detail="Run /admin/2fa/setup first.")
    if not _check_totp_code(pending, payload.code):
        raise HTTPException(status_code=400, detail="Incorrect code. Open Google Authenticator and re-try.")
    backup_codes = _generate_backup_codes(10)
    hashed = [hash_password(c) for c in backup_codes]
    await db.users.update_one(
        {"id": admin["id"]},
        {
            "$set": {
                "totp_secret": pending,
                "totp_enabled": True,
                "totp_enabled_at": now_iso(),
                "totp_backup_codes": hashed,
            },
            "$unset": {"totp_pending_secret": "", "totp_pending_at": ""},
        },
    )
    # Return plaintext backup codes ONCE — admin must save them now.
    return {"ok": True, "backup_codes": backup_codes}


class TwoFADisableIn(BaseModel):
    code: str = Field(min_length=6, max_length=20)


@api_router.post("/admin/2fa/disable")
async def admin_2fa_disable(payload: TwoFADisableIn, admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": admin["id"]}, {"_id": 0})
    if not user or not user.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="2FA isn't currently enabled.")
    code = payload.code.strip()
    ok = _check_totp_code(user.get("totp_secret", ""), code) or \
         (_consume_backup_code(user.get("totp_backup_codes", []), code) is not None)
    if not ok:
        raise HTTPException(status_code=400, detail="Incorrect code. Cannot disable 2FA without a valid code.")
    await db.users.update_one(
        {"id": admin["id"]},
        {"$unset": {
            "totp_secret": "",
            "totp_pending_secret": "",
            "totp_pending_at": "",
            "totp_enabled": "",
            "totp_enabled_at": "",
            "totp_backup_codes": "",
        }},
    )
    return {"ok": True}


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


# ----------------------- Security headers -----------------------
# Hardens every HTTP response with defence-in-depth headers (HSTS, clickjacking,
# MIME sniffing, referrer policy, permissions policy).
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    resp = await call_next(request)
    # 2 years HSTS, includeSubDomains, preload — safe because the app is HTTPS-only on the VPS.
    resp.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
    # No framing → blocks clickjacking. The client app is a top-level PWA.
    resp.headers.setdefault("X-Frame-Options", "DENY")
    # Stop browsers from MIME-sniffing image/script confusions.
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    # Don't leak full URLs to third parties on outbound clicks.
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Disable powerful APIs we don't use anywhere in the app.
    resp.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
    )
    # Legacy XSS auditor (still respected by older Safari).
    resp.headers.setdefault("X-XSS-Protection", "0")
    return resp

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
