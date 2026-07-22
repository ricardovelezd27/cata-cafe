// Cata Café service worker — hand-rolled, no build step, no workbox/serwist.
//
// Bump SW_VERSION whenever a change would make old cached entries incompatible
// (e.g. cache-key logic changes, new required exclusion rule). Bumping it
// forces old caches to be dropped on the next activate.
const SW_VERSION = "v1";
const STATIC_CACHE = `cata-static-${SW_VERSION}`;
const PAGES_CACHE = `cata-pages-${SW_VERSION}`;
// RSC flight payloads live in their own cache so a navigation fallback can
// never serve one where an HTML document is expected.
const RSC_CACHE = `cata-rsc-${SW_VERSION}`;
const MAX_PAGES_ENTRIES = 60;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key !== STATIC_CACHE && key !== PAGES_CACHE && key !== RSC_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Trims a cache down to MAX_PAGES_ENTRIES using simple FIFO — caches.keys()
// returns entries in insertion order, so the earliest ones are the oldest.
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

function isStaticAsset(url, request) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/_next/image")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (/\.(?:svg|png|jpg|jpeg|webp|ico)$/i.test(url.pathname)) return true;
  const dest = request.destination;
  if (
    (dest === "font" || dest === "style" || dest === "script" || dest === "image") &&
    url.pathname.startsWith("/_next/")
  ) {
    return true;
  }
  return false;
}

function isRscRequest(request, url) {
  if (request.headers.get("RSC")) return true;
  if (request.headers.get("next-router-state-tree")) return true;
  if (url.searchParams.has("_rsc")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET requests are cacheable; everything else must hit the network
  // untouched (server actions POST to page URLs, etc.).
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests (e.g. Supabase Realtime wss://).
  if (url.origin !== self.location.origin) return;

  // Never touch API routes — /api/health MUST always hit the network so the
  // offline-detection layer never lies from a stale cached response.
  if (url.pathname.startsWith("/api/")) return;

  // Auth callback (and anything under /auth/) must always hit the network:
  // magic-link tokens are single-use and time-sensitive.
  if (url.pathname.startsWith("/auth/")) return;

  // Dev-only paths (Turbopack/webpack HMR sockets, etc.) — never intercept.
  if (url.pathname.includes("hmr")) return;

  // 1. Static assets: cache-first.
  if (isStaticAsset(url, request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.status === 200 && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // 2. Navigations + RSC data fetches: network-first, falling back to cache
  // so a reload/navigation while offline still renders the last-seen page.
  if (request.mode === "navigate" || isRscRequest(request, url)) {
    const cacheName = request.mode === "navigate" ? PAGES_CACHE : RSC_CACHE;
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
            trimCache(cacheName, MAX_PAGES_ENTRIES);
          }
          return response;
        } catch (err) {
          const cache = await caches.open(cacheName);
          const cached = await cache.match(request);
          if (cached) return cached;
          const cachedIgnoringSearch = await cache.match(request, {
            ignoreSearch: true,
          });
          if (cachedIgnoringSearch) return cachedIgnoringSearch;
          // Nothing cached — let the failure propagate so the route's own
          // error boundary (e.g. cup/error.tsx) can rebuild from IndexedDB.
          throw err;
        }
      })(),
    );
    return;
  }

  // 3. Everything else: pass through to the network untouched.
});
