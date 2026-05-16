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
- `/verify-account` smart branching (approved → login, pending+paid → await, pending+unpaid → Yoco).
- Animated candlestick chart on `/app` (theme-tinted, faster ticks while running).
- Pairs drawer with Allowed/Selected sections + per-pair config form (direction/platform/lot/trades) → `POST /api/mobile/pair-config`.
- MongoDB indexes for `pair_configs` and `broker_connections`.
- Tested: 14/14 backend + 5/5 frontend.

## What's been implemented (2026-05-14 — Iteration 11)
- **Real Yoco payment gateway** (replaces the manual hosted-link flow):
  - Env: `YOCO_SECRET_KEY`, `YOCO_PUBLIC_KEY`, `YOCO_API_BASE`, `YOCO_AMOUNT_CENTS=43900`, `YOCO_CURRENCY=ZAR`.
  - `POST /api/verify-account/checkout` → creates real Yoco checkout via `POST https://payments.yoco.com/api/checkouts`, returns `redirect_url` (`https://c.yoco.com/checkout/ch_...`).
  - `POST /api/webhooks/yoco` → Standard Webhooks (`webhook-id` / `webhook-timestamp` / `webhook-signature`) HMAC-SHA256 verification using stored signing secret; `payment.succeeded` flips `user.payment_confirmed=true`. Idempotent (replays return `{already_processed:true}`).
  - `POST /api/admin/yoco/register-webhook` (admin) → registers the webhook with Yoco programmatically and saves the returned secret in `db.app_config`.
  - `GET /api/admin/yoco/status` (admin) → reports config + webhook status.
  - Legacy `POST /api/verify-account/click` retained for backwards compatibility.
  - Frontend `/verify-account` does `window.location.href = redirect_url` (full redirect to Yoco), handles `?yoco=success|cancelled|failed` return params with toasts.
  - Admin dashboard shows a Yoco config card with one-click "Register webhook with Yoco" button.
- **Tested**: 13/13 backend pytest against the LIVE Yoco API + signed-webhook payment confirmation works end-to-end + frontend redirect verified.
- **Toast bug fixed** post-test: wrapped Yoco-return toasts in `setTimeout(0)` so Sonner's portal has mounted before they fire.
- **MetaTrader bridge — Phase 2 (signal fan-out + desktop helper)**:
  - **Mentor API key** — `POST /api/mentor/api-key/rotate` and `GET /api/mentor/api-key`. Used as `Bearer` auth by mentor's PC bot.
  - **Mentor push** — `POST /api/bridge/mentor-push` with `{ea_id, symbol, action: BUY|SELL|CLOSE, lot?, stop_loss?, take_profit?, comment?}`. Fans out one `trade_signals` doc per eligible client (activated key + non-expired + pair_config exists for symbol + direction matches; CLOSE bypasses direction filter intentionally). Uses `insert_many` for O(1) round-trip on large client lists.
  - **Bridge pairing** — `POST /api/bridge/pair` with `{email, license_key, platform, machine_name}` returns a 365-day `bridge_token`. Upsert: re-pair rotates the token.
  - **Job polling** — `GET /api/bridge/jobs` (Bearer bridge_token) returns pending jobs + decrypted broker credentials + bridge_platform/machine_name. Jobs stay in `pending` state until acked; `delivered_at` is the watermark and jobs re-deliver after 30s if not yet acked (at-least-once delivery against helper crashes).
  - **Ack** — `POST /api/bridge/jobs/{id}/ack` with `{status: executed|failed|skipped, mt_order_id?, error?, raw?}`. Idempotent: a second ack on a terminal job returns `{already_acked: true}` instead of overwriting.
  - **Mentor activity feed** — `GET /api/mentor/bridge/activity` returns paired bridges (with live/idle status) + last 100 signals.
  - **Desktop helper** — `GET /api/bridge/download` serves `ea_central_bridge.py` (Windows, `MetaTrader5` + `requests`). Real MT5 trade execution included; MT4 is Phase 3 placeholder.
  - **MongoDB indexes added**: `bridges.bridge_token` unique, `bridges.license_key` unique, `bridges.mentor_id`, `trade_signals (license_key, status, created_at)`, `users.mentor_api_key` sparse unique.
- **Cascade delete**: removing a symbol from a mentor's EA now also deletes all `pair_configs` tied to that EA's licence keys for that symbol.
- **Frontend `/dashboard/bridge` page**: API key card, copyable curl sample, downloadable bridge script, live "Paired bridges" + "Recent signals" feeds (auto-refresh every 8s).
- Tested: 19/19 backend pytest + frontend Playwright all PASS.

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

## What's been implemented (2026-02 — Iteration 13)
- **Device binding**: `/api/mobile/activate-license` accepts `device_id`, binds the licence to the first device on activation, rejects subsequent devices with HTTP 409. Frontend `/app` writes a stable per-device UUID to `localStorage.ea_mobile_device_id` and sends it on every activation/auth call.
- **Auto-redirect after Yoco payment**:
  - `/api/verify-account/checkout` now sets Yoco `successUrl=/payment-success?email=...`, `cancelUrl=/payment-cancelled?email=...&status=cancelled`, `failureUrl=/payment-cancelled?email=...&status=failed`.
  - New `PaymentSuccess` page polls `/api/verify-account/status` every 1.5s up to 20× and surfaces three states ("Almost there…" → "Payment received" → "You're in").
  - New `PaymentCancelled` page handles both `cancelled` (amber) and `failed` (red) reasons with a "Retry payment" button that re-creates the Yoco checkout.
- **Broker no-relink loop fixed**: `MobileApp.jsx` Connect drawer now renders an "Approved · Unlink broker" card when `broker.status === 'approved'` and hides the link form entirely.
- **Tested (iteration 13)**: 16/16 backend pytest (9 baseline + 7 supplemental in `test_iteration13.py`) + 3/3 frontend Playwright (PaymentSuccess approved, PaymentCancelled cancelled+failed, MobileApp broker no-relink).

## What's been implemented (2026-02 — Iteration 14)
- **Broker "linking" flicker bug — root-cause fixed** (`MobileApp.jsx` polling effect, lines 200-225):
  - **Root cause**: The 4s polling loop fires `/mobile/activate-license` requests concurrently. When admin approves a broker, a slower in-flight request (still carrying `pending_approval`) could arrive AFTER the request that already saw `approved`, calling `setEaData(data)` with stale data and downgrading the UI back to "linking…".
  - **Fix**: Switched to functional `setEaData((prev) => ...)` that refuses to downgrade `approved → pending_approval`. Added a `cancelled` flag so late responses arriving after the effect has been torn down are discarded.
  - **Net effect**: Once a broker is approved by admin, the /app UI permanently shows "approved" for that session. Only an explicit `declined` from admin or a user-initiated unlink/re-link will change it.
- **Add-to-Home-Screen tooltip** (`MobileApp.jsx` new `InstallPrompt` component):
  - **Android / Chromium**: captures the native `beforeinstallprompt` event and shows an "Install app" CTA that fires `event.prompt()`.
  - **iOS Safari**: deferred 6s timer shows instructional copy "tap Share → Add to Home Screen" (no native prompt exists on iOS).
  - **Smart hide**: skipped entirely when already installed (`display-mode: standalone`) or previously dismissed (persisted via `ea_mobile_install_dismissed` localStorage flag).
  - **Accessibility**: Share icon has `aria-hidden` + `sr-only "Share"` text for VoiceOver users.
  - **Tested (iter14)**: 4/4 frontend scenarios — Android native prompt, persistent dismissal across reloads, iOS UA path with deferred timer, and regression that prompt never renders outside the app stage.

## What's been implemented (2026-02 — Iteration 15)
- **/app full visual redesign — cyberpunk-trader**:
  - Background candlestick chart (new `ChartBackground` component, `BG_CANDLE_COUNT=56`) now lives full-bleed behind all content via absolute layering; animated cyber-grid drift (`ea-grid-anim`), drifting scanline (`ea-scan`), dual neon corner halos, top/bottom vignettes.
  - Big round 230px robot avatar REMOVED → replaced with a sleek `mobile-ea-avatar-chip` (12×12 square) inside a neon-edge glass card with EA name, status row, plan, and a live-price chip.
  - All cards refitted with `ea-glass-chart` (backdrop-blur 16px, saturate 140%, 72% black background) so they stay readable over the live chart.
  - LIVE/READY pill in header replaces the old centered title — pulses green when running.
  - `LivePriceChip` self-refreshes from a shared `livePriceRef` every 500ms (hidden on phones <640px so the header stays compact).
- **Responsive PhoneFrame**: max-w 400px phone centered on all viewports. Desktop (lg+) gains dual halo glow + animated grid backdrop + vertical-rl side tickers ("EA-CENTRAL · MOBILE EA" / "LIVE · TRADING · BRIDGE"). Height switched from fixed aspect to `min(92vh, 820px)` so it fits short laptops.
- **Bottom-padding adapt**: broker card auto-pads when install prompt is visible so it isn't covered.
- **Tested (iter15)**: 10/10 frontend checks pass — chart bg behind content, avatar chip swap, responsive across 375/768/1920, vertical side tickers gated to lg+, pairs/broker drawers regression, install prompt regression.

## What's been implemented (2026-02 — Iteration 16)
- **/app layout restored to match user's reference design (big circular neon robot avatar variant)**:
  - Reverted the compact cyberpunk-trader layout from iter15. Brought back the BIG circular robot avatar (~64vw, min 230px) with neon-blue ring + soft inner glow.
  - Restored large `EA-CENTRAL` nameplate (3xl→4xl, blue glow text) with "Fully automated EA" subtitle inside a rounded-2xl glow-bordered container.
  - Restored 3-column action row (PAIRS · START · INFO) inside a rounded-2xl container, with bigger icons (w-7 h-7 sm:w-8 h-8) and drop-shadow filter for the neon glow.
  - Restored "Powered by LOYISO" pill (rounded-full, neon border, blue LOYISO font-display).
  - Restored "Robot List" left-aligned text label + robot card without expiry sub-line (just EA name + "Adaptive AI Trading").
  - Bottom nav simplified to 2 columns (Home + Connect) — Settings moved into the menu drawer only.
  - **Background**: kept the new `ChartBackground` candlestick chart from iter15 as a faint full-bleed background (with top/bottom black-fade vignettes) so the new responsive desktop framing still works.
  - Default robot image cropped tighter (`objectPosition: 50% 20%`, `scale(2.0)`) so the baked-in "EA-CENTRAL" text in the asset is hidden — the real nameplate is the only one visible.
- **Tested (iter16)**: 100% frontend layout match — all critical testids present, none of the removed ones (mobile-nav-settings, mobile-robot-expiry, mobile-ea-avatar-chip) leaking back in, chart-bg behind z-10 foreground, responsive across 375/768/1920, vertical side tickers visible on lg+.

## What's been implemented (2026-02 — Iteration 17)
- **Admin header routing bug fix** (`Header.jsx`): the "Dashboard" button now detects `user.role === "admin"` and routes to `/admin/dashboard` (label changes to "Admin") instead of always sending admins to the mentor license-generation page at `/dashboard`. Mobile drawer version updated too.
- **/app skip-prevention** (`MobileApp.jsx`): defense-in-depth guard added — the main app screen will not render unless `eaData` is a valid server response containing `ea_name` and `key`. Even if `stage` is forced to "app" via React DevTools / a manual `setStage` call, the user is shown a "Session required → Sign in" screen and pushed back to the email stage. The actual security guarantee remains server-side (every stage transition calls `/mobile/check-email` or `/mobile/activate-license` which validate against the DB).
- **Same-email registration uniqueness** (already in place — verified): `/api/auth/register` returns HTTP 409 on duplicate emails AND there is a MongoDB unique index on `users.email`. Confirmed live on preview backend.
- **/app glow polish** (carry-over from previous message): `ActionBtn` and `NavBtn` now have double-layer drop-shadow icon glow, text-shadow accent labels, inset+outer box-shadow on active/highlight states, and hover icon scale-up.

## What's been implemented (2026-02 — Iteration 18)
- **Trading Style picker on /app** (`MobileApp.jsx`):
  - 5 options: Aggressive Scalping (HIGH RISK, red, "lose money immediately" warning), Martingale (HIGH RISK, red, "wipe your account" warning), Scalping (normal), Swing Trading (normal), Day Trading (BEST, green badge).
  - New card between "Powered by LOYISO" pill and "Robot List" — shows current style, badge color (red/green/blue) matches risk level, "Tap to choose" placeholder when empty.
  - New full-screen drawer `TradingStyleDrawer` with all 5 options + risk badges + inline red warning banners for high-risk picks. Currently selected shows "ACTIVE" chip.
  - Selecting a high-risk style fires a `toast.warning`; "Day Trading" fires `toast.success` ("solid choice"); others normal `toast.success`.
- **Backend** (`server.py`):
  - New `POST /api/mobile/trading-style` endpoint (rate-limit 30/min) — validates style ∈ TRADING_STYLES, verifies licence ownership, persists `license_keys.trading_style` + `trading_style_at` ISO timestamp.
  - `/api/mobile/activate-license` response now includes `trading_style` + `trading_style_label`.
  - `/api/admin/broker-connections` response now includes `trading_style`, `trading_style_label`, `trading_style_risk` per row.
- **Admin /admin/brokers** (`AdminBrokers.jsx`): new "Trading style" row on each broker card showing label + colored HIGH RISK / BEST badge.
- **"admin approval" → "server-side approval" rename** (everywhere):
  - Backend: `/mobile/connect-broker` notice ("Broker linking to server… server-side verification in progress."); `/mobile/start` blocker text ("Broker is still pending server-side approval."); decline message no longer says "by admin".
  - Frontend `/app`: broker connect toast ("awaiting server-side verification"); unlink confirm ("server-side approval again"); approved-card subtitle ("verified server-side").
  - Frontend `/admin/brokers`: status badge label is now "pending server-side approval"; primary CTA reads "Approve linking (server-side)".
- **Tested (iter18)**: 12/12 backend pytest pass (POST trading-style, invalid, ownership, activate-license payload, admin response shape, broker notice copy); 100% frontend (style card + drawer + persistence + admin display + every copy rename verified).

## What's been implemented (2026-02 — Iteration 19)
- **/app moving chart REMOVED** — `ChartBackground`, `LivePriceChip`, `seedCandles`, `livePriceRef`, `BG_CANDLE_COUNT` all deleted (~120 lines removed).
- **Premium static "4K" background** (`MobileApp.jsx` ~line 480): 8-layer composite — deep navy radial gradient base `radial-gradient(120% 80% at 50% 35%, #001a36, #000814, #000208)`; large central electric-blue halo behind the avatar (140% width, blurred 28px); secondary corner halo bottom-right; subtle dot-grid texture (22px spacing, accent-tinted); diagonal sheen highlight; top + bottom black-fade vignettes.
- **Saturated color tokens**: THEMES now use `soft: 0.22` (was 0.10), `glow: 0.95` (was 0.55), `border: 1.0` (was 0.70). All theme variants (blue/red/green) feel ~2× more vibrant.
- **Triple-layer button glows**: ActionBtn + NavBtn icons now have `drop-shadow(0 0 10px) drop-shadow(0 0 18px) drop-shadow(0 0 28px)` for 4K-style halos (was a single 8px shadow). Stroke widened to 2.2. Labels get `font-extrabold` + dual text-shadow.
- **Thicker accent borders**: avatar ring 2px→3px, EA name plate 2px→3px solid accent, action row 2px→2.5px, robot list card 2px solid accent, broker card 2px solid accent (linked), bottom nav 2px→2.5px solid accent.
- **Multi-radius shadows on cards**: 50px/80px/140px halo radii combined with inset glows for a "premium aircraft cockpit" depth.
- **Tested (iter19)**: 100% — `mobile-chart-bg` confirmed removed, 8 background layers detected, triple drop-shadow confirmed via computed-style on action buttons, 3px nameplate border confirmed, all preserved testids intact, responsive across 375/768/1920.

## Next Action Items
- **Admin "Test login to broker"** button on `/admin/brokers`: backend uses stored creds to call `MetaTrader5.initialize()` in a sandbox and report success/fail. (P1)
- **Webhook log section on `/admin/dashboard`**: show last 20 `yoco_events` for auditability. (P2)
- **Mentor profile image on Landing testimonials + License receipt** pages. (P2)
- **"Add to Home Screen" tooltip** on `/app` for iOS/Android first-time visitors. (P2)
- **MetaTrader bridge Phase 3** — real automated trade execution against live MT4/MT5. (P1)
- **Security hardening** (carried over from iter13 code review):
  - `device_id` should be regex-validated to UUID format (currently any 64-char string is accepted).
  - `/verify-account/checkout` should send a Yoco idempotency key to avoid duplicate checkouts.
  - Split `server.py` (>1870 lines) into routers `auth.py`, `mentor.py`, `mobile.py`, `admin.py`, `yoco.py`, `bridge.py`.
  - Rotate `JWT_SECRET` before production deployment.
