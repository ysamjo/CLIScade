// Service Worker for Harness Studio Remote PWA
const CACHE_NAME = 'harness-studio-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/icons.js',
  '/icon.svg',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

// Network-first strategy (prefer live updates, fallback to cache)
// Der Fallback muss den Stand zeigen, den der Nutzer zuletzt wirklich sah:
// deshalb wandert jede frische Antwort in den Cache — sonst bleibt der bei
// einem Abschalten des Servers auf dem Stand der Installation stehen.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/') || e.request.url.startsWith('ws')) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const kopie = res.clone();
          e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(e.request, kopie)));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
