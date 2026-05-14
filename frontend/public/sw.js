/* ea-central service worker — minimal, network-first with offline fallback.
   Purpose: satisfy PWA installability + give /app a fast warm-start.
   Strategy: network-first for navigation requests, stale-while-revalidate for static assets,
             never cache API calls (they are dynamic).
*/

const VERSION = "ea-central-v1";
const STATIC_CACHE = `${VERSION}-static`;

self.addEventListener("install", (event) => {
  // Pre-cache the app shell so /app can boot offline.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(["/", "/app", "/manifest.webmanifest"]).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never touch API calls — always go to network.
  if (url.pathname.startsWith("/api/")) return;

  // Navigation (HTML page) — network first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) => cached || caches.match("/app") || caches.match("/")
          )
        )
    );
    return;
  }

  // Static assets (JS / CSS / images / fonts) — stale-while-revalidate.
  if (
    url.origin === self.location.origin &&
    /\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|ico|webmanifest)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetcher = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || fetcher;
      })
    );
  }
});
