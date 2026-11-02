/**
 * Zervia service worker — Phase 6 PWA.
 *
 * Strategy:
 * - App shell + static assets: cache-first (instant second load).
 * - Pages / API: network-first with offline fallback to /offline.
 * - Never cache authenticated /app/* HTML (stale private data is worse
 *   than no offline page) — only the public shell is cached.
 */
const CACHE = 'zervia-shell-v1';
const SHELL = ['/', '/offline', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve cached HTML for the authenticated app area.
  const isAppHtml =
    request.destination === 'document' && /\/app(\/|$)/.test(url.pathname);
  if (isAppHtml) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache a copy of successful shell/static responses.
        if (response.ok && (request.destination !== 'document' || url.pathname === '/')) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.destination === 'document') {
          const offline = await caches.match('/offline');
          if (offline) return offline;
        }
        return new Response('Offline', { status: 503 });
      })
  );
});
