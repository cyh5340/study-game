const CACHE_NAME = 'circuit-runner-v12';
const APP_FILES = [
  './',
  './index.html?v=12',
  './styles.css?v=12',
  './physics.js?v=12',
  './levels.js?v=12',
  './game.js?v=12',
  './pwa.js?v=12',
  './manifest.webmanifest?v=12',
  './icons/app-icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html?v=12', copy));
          return response;
        })
        .catch(() => caches.match('./index.html?v=12'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
