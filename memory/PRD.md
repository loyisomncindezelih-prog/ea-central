# ea-central — Product Requirements Document

## Problem Statement (verbatim)
"the name of the website is ea-central users will Host Your PC Bot as Mobile EA. Host your PC bot, clients access as mobile EA. Your bot trades, clients copy from their phones. No VPS needed for clients. i added the logo, home page must be black and blue describing my website info that i provided you can also add more info, on home page i want a button that says be a mentor where it will redirect to a create account page. on create account page users must fill username, email, contact Number, Password, and a text saying by creating an account you agree with our terms and conditions, and on login users must use email and password."

## User Personas
- **Mentor** (primary): a trader running a bot on their PC who wants to monetize/share trades with subscribers without giving them broker accounts or asking them to install a terminal/VPS.
- **Client/Subscriber** (secondary, not implemented yet): a follower who pays the mentor and mirrors trades from a phone.

## Core Requirements (static)
- Black + electric blue (#1E90FF) + white branding, EA logo throughout.
- Landing page with: brand pitch, "Be a Mentor" hero CTA, features section, how-it-works (3 steps), final CTA, footer.
- Signup page: username, email, country code + contact number, password, T&C disclaimer/checkbox.
- Login page: email + password.
- Mentor dashboard (placeholder bot/clients/trades widgets).
- Client mobile-EA preview page (mock phone UI).
- JWT-based custom auth (custom email/password).

## Architecture
- **Backend**: FastAPI + Motor (MongoDB). JWT (HS256), bcrypt password hashing, httpOnly cookies + Authorization Bearer fallback (preview iframe cookie blocking).
- **Frontend**: React (CRA) + react-router + shadcn UI + Tailwind. AuthContext provides login/register/logout. axios with `withCredentials=true` and a Bearer interceptor (token stored in localStorage as fallback).
- **DB collections**: `users` (unique email index), `login_attempts` (brute force tracking by `xff_ip:email`).

## What's been implemented (2026-05-12)
- Backend `/api/auth/register | /login | /logout | /me`, `/api/dashboard/summary`, admin seeding on startup.
- Brute-force lockout fixed to use `X-Forwarded-For` (HTTP 429 after 5 failed attempts, 15 min cooldown).
- MongoDB indexes (unique email, unique id, login_attempts identifier).
- Frontend pages: `/`, `/signup`, `/login`, `/dashboard` (protected), `/mobile-preview`.
- Shadcn components used: Button, Input, Label, Checkbox, Select, Toaster (sonner).
- Outfit + IBM Plex Mono fonts via Google Fonts.
- Country code dropdown (47 countries) for contact number.
- Tested: 14/15 backend pytest + 13/13 frontend Playwright flows. Brute force regression verified manually (5x401 → 6th=429).

## What's been implemented (2026-05-14)
- **Client Mobile App at `/app`** — full phone-style portal (`/app/frontend/src/pages/MobileApp.jsx`):
  - Stage 1: email check (calls `/api/mobile/check-email`, blocks unknown / pending-approval emails).
  - Stage 2: license activation (`/api/mobile/activate-license`) — auto-activates on first use, single-use bound to one email, returns 410 on expiry.
  - Stage 3: phone-style EA dashboard showing mentor's EA name (replaces all "EA-CENTRAL" branding), expiry date, Start/Stop, Pairs, Info, Robot List, theme switcher (blue/red/green), menu drawer, settings drawer, **MT4/MT5 broker connect drawer**, broker status badge.
  - Session persistence via localStorage (`ea_mobile_email`, `ea_mobile_license`, `ea_mobile_theme`, `ea_mobile_broker`) — reload auto-resumes to app stage.
  - PWA meta tags for iOS "Add to Home Screen" full-screen mode.
- **Bug fixed**: `MobileApp.jsx` was missing `useState` declarations for `connectOpen` and `broker`. Now declared.

## What's been implemented (2026-05-14 — Iteration 5)
- **Paid signup gate (R439.00 via Yoco)** + login 402 redirect, `/verify-account` rebuilt, `/pending` shows pay CTA, admin still manually verifies.
- **MT4/MT5 broker credentials capture** at `/app` Connect drawer → `/api/mobile/connect-broker` saves platform/server/account/encrypted-password tied to a licence. Broker status badge on app screen.
- **Rate-limiting** (slowapi) — 60/min per X-Forwarded-For IP on all `/api/mobile/*` endpoints.
- Tested: 13/13 backend + 18/18 frontend.

## What's been implemented (2026-05-14 — Iteration 6)
- **`/verify-account` is smart**:
  - approved → auto-redirect to `/login`
  - pending + paid → "Awaiting admin approval" (no re-open Yoco)
  - pending + unpaid → opens Yoco link
  - unknown email / rejected → friendly error
- **Animated candlestick chart** on `/app` — 30 candles ticking every 1.6s (0.9s when EA running). Up/down candles re-tint with the active theme accent (blue / red / green). Cosmetic only — no real market data.
- **Pairs drawer** on `/app` — PAIRS button opens a panel with:
  - **"Allowed pairs · mentor EA"** — pulls `EA.symbols` from mentor's `/dashboard/manage-eas/:id` page
  - **"Selected pairs to trade"** — shows configured pairs as cards with chips
  - Tap an allowed pair → form opens with: Direction (BUY / SELL / BOTH), Platform (MT4 / MT5), Lot size (text input), # Trades (text input)
  - Saves to backend via `POST /api/mobile/pair-config` (mongo `pair_configs` collection, upsert on `license_key + symbol`)
  - Selected card has remove button → `POST /api/mobile/pair-config/delete`
- `/api/mobile/activate-license` response now includes `allowed_symbols` + `pair_configs` so the `/app` page hydrates the Pairs drawer on load.
- MongoDB indexes added: `pair_configs (license_key, symbol)` unique, `broker_connections (license_key)` unique.
- Tested: 14/14 backend + 5/5 frontend (chart, theme tint, drawer open, save, remove + VerifyAccount 3-branch).

## Mocked / Placeholder
- `GET /api/dashboard/summary` returns static demo data (bot status, connected clients, trades). **MOCKED** — no real PC-bot bridge yet.
- Mobile preview page is fully static UI mock.

## Backlog (prioritized)
**P0** — none blocking.

**P1**
- **MetaTrader bridge (Phase 2 — automatic trade execution)**: build the desktop helper that reads the encrypted broker credentials from `broker_connections` and connects to MT4 (custom EA + ZeroMQ) / MT5 (`MetaTrader5` Python package, Windows). Ship as a small installer for the mentor's PC/VPS. Pair to a licence via the existing `/api/mobile/connect-broker` data.
- **Real Yoco payment webhook**: today `/api/verify-account/click` is a self-reported flag; admin manually confirms on Yoco's dashboard before approving. A Yoco webhook would set a `payment_confirmed=true` field automatically.
- Client (subscriber) account type + subscribe-to-mentor flow + per-client risk rules.
- Live trade stream on dashboard + mobile preview (replace mock).

**P2**
- Use a dedicated `BROKER_ENC_KEY` env var instead of reusing `JWT_SECRET` for Fernet.
- `/api/mobile/connect-broker` should require the licence to already be activated+bound (or carry a short-lived session token from `/mobile/activate-license`).
- Encrypt broker credentials at rest in localStorage with a passphrase-derived key.
- Refactor `MobileApp.jsx` (660+ lines) — extract `PhoneFrame`, `AuthScreen`, `ActionBtn`, `NavBtn`, `DrawerInfo`, `BrokerField` to `/components/mobile/*`.
- Refactor `server.py` (~950 lines) into routers: `auth.py`, `mentor.py`, `mobile.py`, `admin.py`, `broker.py`.
- Loading skeleton on Generate-Key Success page.
- `/api/auth/refresh` endpoint (refresh cookie is set today but unused).
- Migrate FastAPI startup/shutdown to lifespan handlers.
- Password reset flow (`/auth/forgot-password`, `/auth/reset-password`).
- Mentor performance analytics (charts via recharts).
- Terms & Conditions page (currently link only).
- Email verification on signup.

## Next Action Items
- **MetaTrader bridge — Phase 2 (automatic execution)**: build the desktop helper (Python `MetaTrader5` for MT5, ZeroMQ EA for MT4) that polls `/api/bridge/jobs/{license_key}` for trade signals and uses the stored broker creds to execute. Requires a Windows installer.
- Wire a Yoco webhook to set `payment_confirmed=true` automatically (today the admin still verifies manually on the Yoco dashboard).
- Rotate JWT_SECRET before production deployment.
