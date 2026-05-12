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

## Mocked / Placeholder
- `GET /api/dashboard/summary` returns static demo data (bot status, connected clients, trades). **MOCKED** — no real PC-bot bridge yet.
- Mobile preview page is fully static UI mock.

## Backlog (prioritized)
**P0** — none blocking.

**P1**
- Real PC-bot bridge protocol (WebSocket from desktop client → backend → mobile EA).
- Client (subscriber) account type + subscribe-to-mentor flow + per-client risk rules.
- Payments (Stripe) — mentor sets price, subscribers pay monthly.
- Live trade stream on dashboard + mobile preview (replace mock).

**P2**
- `/api/auth/refresh` endpoint (refresh cookie is set today but unused).
- Migrate FastAPI startup/shutdown to lifespan handlers.
- Password reset flow (`/auth/forgot-password`, `/auth/reset-password`).
- Mentor performance analytics (charts via recharts).
- Terms & Conditions page (currently link only).
- Email verification on signup.

## Next Action Items
- Confirm with user whether to start the PC-bot bridge work or the Stripe monetization next.
- Rotate JWT_SECRET before production deployment.
