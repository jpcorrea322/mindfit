// Caches the app shell so MindFit opens offline and launches fast from the home screen.
// Supabase requests are cross-origin and always go to the network.
const CACHE = "mindfit-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Pages: network first so new deploys show up, cached shell when offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => { caches.open(CACHE).then((c) => c.put("/", res.clone())); return res; })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Built assets have hashed names, so a cached copy never goes stale
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      }))
    );
    return;
  }

  // Icons, manifest: serve cached, refresh in the background
  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
