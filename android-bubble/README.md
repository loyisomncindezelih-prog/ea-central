# EA-CENTRAL — Android Bubble Wrapper

This is a **Capacitor 6** Android shell that wraps your existing PWA at
`https://ea-central.preview.emergentagent.com/app` and adds a **floating bubble overlay**
that hovers over WhatsApp, YouTube, browsers and the lockscreen (just like Messenger chat
heads).

> ⚠️ **iOS does not support floating overlays.** iOS users keep using the PWA via
> "Add to Home Screen".

---

## What this delivers

- ✅ Wraps `/app` (your existing PWA) as a native APK — **zero web code rewrite**.
- ✅ Real floating bubble using `SYSTEM_ALERT_WINDOW` + a foreground service.
- ✅ Bubble polls `/api/mobile/trade-signals` every 6 seconds.
- ✅ Shows latest **side (BUY / SELL / CLOSE)** with neon color matching `/app`.
- ✅ Tap-to-expand panel: **Status, Symbol, P&L, Balance, last 3 signals, Stop EA button, Open App**.
- ✅ Drag anywhere on screen, survives screen-off and app switching.
- ✅ Vibrates on a fresh executed BUY/SELL.
- ✅ Capacitor JS plugin (`Bubble`) wired into `MobileApp.jsx`:
      `Settings ▸ Floating Bubble ▸ Enable Floating Bubble`.
- ✅ No-op safely in plain browser (same React code runs in browser & APK).

---

## Build steps (on your VPS or local machine)

You need:

- **Node 18+** and **yarn**
- **Java 17 JDK**
- **Android Studio Hedgehog (2023.1)+** with Android SDK 34, Build-Tools 34, Platform-Tools.
- A keystore for signing release APKs (instructions below).

### 1. Sync Capacitor

```bash
cd /app/android-bubble
yarn install
npx cap sync android
```

> `cap sync` will copy `BubblePlugin.java`, `BubbleService.java`, layouts and drawables
> into a generated `android/` project. The repository already includes the **source-of-truth**
> versions at `android/app/src/main/...` so you can edit them freely — `cap sync` won't overwrite
> custom plugin code, only Capacitor core libs.

### 2. Set your live server URL

Open `capacitor.config.ts` and replace the placeholder URL with your production PWA URL:

```ts
server: {
  url: 'https://ea-central.co.za/app',  // <-- your real domain
  cleartext: false,
  androidScheme: 'https'
}
```

Then run `npx cap sync android` again so the change ships.

### 3. Open in Android Studio

```bash
npx cap open android
```

### 4. Build a debug APK (for sideloading)

```bash
cd android
./gradlew assembleDebug
# APK lands at android/app/build/outputs/apk/debug/app-debug.apk
```

Send that `.apk` to a client → they enable "Install from unknown sources" → tap to install.

### 5. Build a signed release APK / AAB (Play Store)

Generate a keystore once:

```bash
keytool -genkey -v -keystore ea-central-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias ea-central
```

Then in Android Studio: `Build ▸ Generate Signed Bundle / APK ▸ Android App Bundle ▸ ea-central-release.jks`.
Upload the resulting `.aab` to Google Play Console.

---

## How the bubble talks to your backend

The native `BubbleService.java` calls **the same FastAPI endpoints the PWA already uses**:

| Action               | Endpoint                            | Method |
|----------------------|-------------------------------------|--------|
| Poll trade signals   | `/api/mobile/trade-signals`         | POST   |
| Stop EA (quick btn)  | `/api/mobile/ea/stop`               | POST   |

Body for both: `{"email": "...", "license_key": "..."}`.

> So **admin push-signal trades from `/admin/brokers`** (added in Iteration 23)
> appear in the bubble too, marked as **server** executions — no extra backend work needed.

---

## Permissions the user grants on first launch

1. **POST_NOTIFICATIONS** (Android 13+) — for the persistent foreground service notification.
2. **SYSTEM_ALERT_WINDOW** — opens Settings ▸ "Display over other apps" ▸ enable EA-CENTRAL.
3. **VIBRATE** — silent grant, used for new-signal feedback.

The user only needs to grant #2 once. After that, tapping
`Settings ▸ Enable Floating Bubble` inside the app starts the overlay.

---

## File map

```
/app/android-bubble/
├── package.json                         # Capacitor deps
├── capacitor.config.ts                  # Points to your live PWA URL
├── web/index.html                       # Placeholder (real PWA is loaded from server.url)
├── README.md                            # this file
└── android/
    ├── build.gradle                     # project-level
    ├── settings.gradle
    ├── variables.gradle
    ├── gradle.properties
    └── app/
        ├── build.gradle                 # app-level
        └── src/main/
            ├── AndroidManifest.xml      # SYSTEM_ALERT_WINDOW + foreground service decl
            ├── java/com/eacentral/bubble/
            │   ├── MainActivity.java    # Capacitor BridgeActivity + registerPlugin
            │   ├── BubblePlugin.java    # Capacitor @CapacitorPlugin bridge
            │   └── BubbleService.java   # The floating bubble + foreground service
            └── res/
                ├── layout/bubble_view.xml      # The round bubble
                ├── layout/bubble_panel.xml     # Expanded info panel
                ├── drawable/*.xml              # Neon black/blue cyberpunk styling
                ├── values/strings.xml
                └── values/styles.xml
```

---

## Frontend hook (already added)

`/app/frontend/src/lib/bubble.js` exposes:

```js
isNative()                  // false on browser, true in APK
canDrawOverlays()           // {granted: bool}
requestOverlayPermission()  // opens system Settings
startBubble({email, licenseKey, apiBase})
stopBubble()
updateBubble({status, symbol, side, pnl, balance})
```

`MobileApp.jsx ▸ Settings drawer` already has the toggle button wired up — only renders
the "available in APK" hint when running on the web.

---

## Troubleshooting

| Symptom                                 | Fix |
|----------------------------------------|-----|
| Bubble doesn't appear                  | Grant "Display over other apps" in Android Settings. |
| Bubble appears but no signals          | Confirm `capacitor.config.ts ▸ server.url` matches your prod PWA and `REACT_APP_BACKEND_URL` is reachable. |
| `cap sync` errors about missing plugin | Re-run `yarn install` then `npx cap sync android`. |
| Foreground notif missing on Android 13+| User declined POST_NOTIFICATIONS — re-grant via system Settings. |

---

## What's intentionally NOT in this MVP

- **Push notifications (FCM)** — scaffolded via `@capacitor/push-notifications` dep, but no
  Firebase config file is shipped. Add `google-services.json` later if you want push.
- **iOS build** — iOS can't render floating overlays; skip for now.
- **In-app updates** — the WebView loads your live PWA, so OTA updates are automatic.
