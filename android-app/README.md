# EA-CENTRAL — Mobile EA Android APK

Plain WebView wrapper of the live PWA at `/app`. **No floating bubble, no overlay permissions** — just the existing Mobile EA experience packaged as an installable APK.

## TL;DR — 3 ways to get an APK

### Option A (60 seconds, no code) — PWABuilder.com ⭐ Recommended
1. Go to **https://www.pwabuilder.com/**
2. Paste your live PWA URL (e.g. `https://ea-central.co.za/app`) → Start.
3. Click **Android → Generate**.
4. Download the signed `.apk` it gives you.
5. Upload it to your VPS: `/var/www/ea-central/frontend/build/downloads/ea-central.apk`.
6. Done — the Download APK button on the site will serve it.

### Option B — Capacitor build (on your Mac / VPS with Android Studio)
1. `cd /var/www/ea-central/android-app`
2. Edit `capacitor.config.ts` → set `server.url = "https://your-domain/app"`.
3. `yarn install && npx cap sync android && npx cap open android`
4. In Android Studio: **Build → Generate Signed Bundle / APK → APK** → keystore → next → finish.
5. Copy `android/app/build/outputs/apk/release/app-release.apk` to your VPS as above.

### Option C — Bubblewrap CLI (Google's TWA tool)
```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://ea-central.co.za/app/manifest.webmanifest
bubblewrap build  # outputs app-release-signed.apk
```

## Where to drop the APK on your VPS
Copy the file to a folder served by Nginx (so users can download it):
```bash
mkdir -p /var/www/ea-central/frontend/build/downloads
cp ea-central.apk /var/www/ea-central/frontend/build/downloads/ea-central.apk
```
After that, **https://ea-central.co.za/downloads/ea-central.apk** will be the download link.

## How the frontend finds the APK
The `/downloads` page reads `REACT_APP_APK_DOWNLOAD_URL` from `frontend/.env`. Defaults to `/downloads/ea-central.apk` (relative to your domain).

## Folder layout
```
/app/android-app/
├── capacitor.config.ts      # CHANGE server.url to your live URL
├── package.json              # Capacitor 6 deps
├── README.md                 # this file
├── web/index.html            # placeholder (live PWA is loaded from server.url)
└── android/                  # Android Studio project — open in Android Studio
    ├── build.gradle
    ├── settings.gradle
    ├── variables.gradle
    ├── gradle.properties
    └── app/
        ├── build.gradle
        └── src/main/
            ├── AndroidManifest.xml
            ├── java/com/eacentral/app/MainActivity.java
            └── res/
```

## What's intentionally NOT here
- No `SYSTEM_ALERT_WINDOW` permission, no overlay service. This is the plain PWA wrapper you asked for. The earlier floating-bubble version was removed.
- No FCM / Firebase. iOS still uses the PWA via "Add to Home Screen".
