// Dynamic cache versioning — version is set via postMessage from the app.
// This means every new deployment gets a fresh cache, clearing stale files,
// while localStorage (user data) is completely separate and untouched.

let CACHE = 'wc2026-dev';
const STATIC = ['/', '/index.html', '/manifest.json'];

// Receive version from the app on registration
self.addEventListener('message', e => {
  if (e.data?.type === 'SET_VERSION') {
    const newCache = 'wc2026-' + e.data.version;
    if (newCache !== CACHE) {
      CACHE = newCache;
      // Delete all old caches
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      );
    }
  }
});

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network first — always try to get fresh content, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});