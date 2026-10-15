const CACHE_NAME = 'cmms-cache-v2';

const urlsToCache = [
  './',
  './index.html',
  './production.html',
  './dashboard.html',
  './dashboard_prod.html',
  './style.css',
  './style_dash.css',
  './common.js',
  './karbantartas.js',
  './termeles.js',
  './dashboard.js',
  './termeles_dash.js',
  './Logo-Schedl%20(1).png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
          console.log('Gyorsítótár megnyitva, fájlok letöltése...');
          return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Azonnal érvénybe lép
  );
});

self.addEventListener('activate', event => {
  // Régi cache-ek törlése
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Régi cache törlése:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // A Google Script (POST) hívásokat nem cacheljük!
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) return;
  
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});