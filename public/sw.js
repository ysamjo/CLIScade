// Service Worker for CLIScade Remote PWA
// Die Nummer hochziehen, wenn sich index.html, app.js oder style.css aendern: der
// activate-Handler loescht dann jeden aelteren Cache, statt ihn als Rueckfall
// weiterzureichen. Ohne den Sprung kann bei totem Server die Fassung von gestern
// erscheinen — die Seite sieht dann heil aus, spricht aber mit einem toten Backend.
const CACHE_NAME = 'cliscade-v18';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/image-composer.js',
  '/task-state.js',
  '/icons.js',
  '/konsole-schichten.js',
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
