/**
 * Bubble plugin client.
 *
 * Talks to the native Capacitor `Bubble` plugin defined in
 * /android-bubble/android/app/src/main/java/com/eacentral/bubble/BubblePlugin.java
 *
 * On a normal browser (no Capacitor runtime), every method becomes a safe no-op
 * and `isNative()` returns false — so the same MobileApp.jsx works in browser & APK.
 */

const ZERO = { granted: false };

function plugin() {
  if (typeof window === "undefined") return null;
  const cap = window.Capacitor;
  if (!cap || !cap.Plugins || !cap.Plugins.Bubble) return null;
  return cap.Plugins.Bubble;
}

export function isNative() {
  if (typeof window === "undefined") return false;
  const cap = window.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

export async function canDrawOverlays() {
  const p = plugin();
  if (!p) return ZERO;
  try { return await p.canDrawOverlays(); } catch { return ZERO; }
}

export async function requestOverlayPermission() {
  const p = plugin();
  if (!p) return;
  try { await p.requestOverlayPermission(); } catch {}
}

export async function startBubble({ email, licenseKey, apiBase }) {
  const p = plugin();
  if (!p) return { ok: false, reason: "not-native" };
  try {
    await p.start({ email, licenseKey, apiBase });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

export async function stopBubble() {
  const p = plugin();
  if (!p) return;
  try { await p.stop(); } catch {}
}

export async function updateBubble(payload) {
  const p = plugin();
  if (!p) return;
  try { await p.update(payload || {}); } catch {}
}
