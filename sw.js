const CACHE_VERSION = 'v73i';
const STATIC_CACHE  = `po-static-${CACHE_VERSION}`;
const CDN_CACHE     = `po-cdn-${CACHE_VERSION}`;

// Local assets to pre-cache on install
const STATIC_SHELL = [
  './',
  './index.html',
  './workout.html',
  './manifest.json',
  './css/layout.css',
  './css/components.css',
  './css/styles.css',
  './js/app.js',
  './js/auth.js',
  './js/config.js',
  './js/storage.js',
  './js/github-api.js',
  './js/exercises.js',
  './js/workouts.js',
  './js/templates.js',
  './js/charts.js',
  './js/chart-helpers.js',
  './js/history.js',
  './js/rankings.js',
  './js/utils.js',
  './progressive-overload/exercises.json',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

// CDN URLs to cache on first use (cache-first thereafter)
const CDN_ORIGINS = [
  'https://unpkg.com',
  'https://cdn.jsdelivr.net',
];

// GitHub API — never serve from cache, always network-first
const GITHUB_API_ORIGIN = 'https://api.github.com';

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove stale caches ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  const validCaches = [STATIC_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. GitHub API — network only (no caching)
  if (url.origin === GITHUB_API_ORIGIN) {
    return; // fall through to browser default
  }

  // 2. CDN resources — cache-first, populate on miss
  if (CDN_ORIGINS.some(origin => url.origin === origin)) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // 3. Local static assets — cache-first, populate on miss
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a minimal offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
