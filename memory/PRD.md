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
  - Stage 3: phone-style EA dashboard showing mentor's EA name (replaces all "EA-CENTRAL" branding), expiry date, Start/Stop, Pairs, Info, Robot List, theme switcher (blue/red/green), menu drawer, settings drawer.
  - Session persistence via localStorage (`ea_mobile_email`, `ea_mobile_license`, `ea_mobile_theme`, `ea_mobile_broker`) — reload auto-resumes to app stage.
  - PWA meta tags for iOS "Add to Home Screen" full-screen mode.
  - Broker drawer (local-only credential vault for future MT4/MT5 bridge).
- **Bug fixed**: `MobileApp.jsx` was missing `useState` declarations for `connectOpen` and `broker`, causing the Connect drawer to crash. Now declared (lines 51, 60-67). Verified by testing agent (iteration_4) — 14/14 frontend + 8/8 backend tests passed.

## Mocked / Placeholder
- `GET /api/dashboard/summary` returns static demo data (bot status, connected clients, trades). **MOCKED** — no real PC-bot bridge yet.
- Mobile preview page is fully static UI mock.

## Backlog (prioritized)
**P0** — none blocking.

**P1**
- **MetaTrader broker bridge** (user-requested 2026-05-14): build a small "ea-central bridge" desktop helper (Python or Node service) that runs on the mentor's PC/VPS alongside MT4/MT5. The mobile `/app` Connect drawer already collects server/account/password/host into localStorage — these need to be POSTed to a new `/api/bridge/...` endpoint that pairs the device with the bridge over WebSocket so trades execute via the MetaTrader Python package (e.g. `MetaTrader5` for MT5, ZeroMQ/MT4 EA for MT4). Out of scope for the iframe preview — needs design + research.
- Real PC-bot bridge protocol (WebSocket from desktop client → backend → mobile EA).
- Client (subscriber) account type + subscribe-to-mentor flow + per-client risk rules.
- Payments (Stripe) — mentor sets price, subscribers pay monthly.
- Live trade stream on dashboard + mobile preview (replace mock).

**P2**
- Rate-limit `/api/mobile/check-email` and `/api/mobile/activate-license` (currently unauth + no throttle — license enumeration risk).
- Encrypt broker credentials at rest in localStorage with a passphrase-derived key.
- Refactor `MobileApp.jsx` (630 lines) — extract `PhoneFrame`, `AuthScreen`, `ActionBtn`, `NavBtn`, `DrawerInfo`, `BrokerField` to `/components/mobile/*`.
- Loading skeleton on Generate-Key Success page.
- `/api/auth/refresh` endpoint (refresh cookie is set today but unused).
- Migrate FastAPI startup/shutdown to lifespan handlers.
- Password reset flow (`/auth/forgot-password`, `/auth/reset-password`).
- Mentor performance analytics (charts via recharts).
- Terms & Conditions page (currently link only).
- Email verification on signup.

## Next Action Items
- **MetaTrader broker bridge architecture** — user wants real broker connectivity via VPS/RDP/PC. Needs design discussion: pick MT5 (Python `MetaTrader5` package, Windows-only) vs MT4 (custom EA + ZeroMQ). Then build bridge installer + `/api/bridge/pair` + WebSocket relay.
- Confirm whether `/app` email field should be the **client's** own email (free-form binding) or the **mentor's** email (current behavior). Spec is ambiguous.
- Rotate JWT_SECRET before production deployment.
