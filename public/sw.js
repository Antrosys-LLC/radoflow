// RadoFlow service worker.
//
// This exists only to satisfy install criteria and speed up repeat loads of
// the static app shell (icons, fonts, the manifest) — never to serve stale
// attendance or payroll data. Everything else is a plain network pass-through
// with no caching: showing a factory floor supervisor yesterday's attendance
// because it was "faster" would be actively harmful, not a convenience.

const SHELL_CACHE = "radoflow-shell-v1";
const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellAsset = SHELL_ASSETS.includes(url.pathname);

  if (event.request.method !== "GET" || !isShellAsset) {
    // Everything that isn't a static shell asset — pages, API routes, iclock
    // endpoints, exports — goes straight to the network. No offline fallback:
    // an attendance/payroll screen with no data is safer than one with wrong data.
    return;
  }

  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
