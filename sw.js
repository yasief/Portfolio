/* Service worker — Mohamed Yasief portfolio PWA.
 * Freshness-first by design so GitHub Pages deploys are never "stuck":
 *   - HTML navigations   -> network-first (cached copy only as an offline fallback)
 *   - other GET requests -> stale-while-revalidate (fast, self-updating)
 * Bump CACHE_VERSION on any breaking change to purge every old cache.       */
const CACHE_VERSION = 'v1-2026-07-17';
const CACHE = 'yasief-' + CACHE_VERSION;

// App shell — enough to paint an offline-usable page.
const CORE = [
  './',
  './index.html',
  './style.css',
  './chatbot.css',
  './script.js',
  './manifest.webmanifest',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individual failures must not abort the whole install.
      .then((cache) => Promise.allSettled(CORE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('yasief-') && k !== CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Let the page trigger an immediate update ("New version ready → reload").
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHtmlNavigation(req) {
  return req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));
}

// Network-first: prefer fresh HTML, fall back to cache, then to the app shell.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    return (await cache.match(req)) || (await cache.match('./index.html')) ||
      new Response('<h1>Offline</h1><p>Reconnect to load the latest.</p>',
        { headers: { 'Content-Type': 'text/html' }, status: 503 });
  }
}

// Stale-while-revalidate: serve cache instantly, refresh it in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      // Cache OK same-origin responses and opaque cross-origin (fonts/CDN).
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                    // never touch POST/PUT (EmailJS, Firebase)
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return; // skip chrome-extension:, etc.

  if (isHtmlNavigation(req)) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});
