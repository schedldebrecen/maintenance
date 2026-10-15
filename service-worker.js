const CACHE_NAME = 'cmms-cache-v3';
const urlsToCache = [
  'index.html',
  'production.html',
  'dashboard.html',
  'dashboard_prod.html',
  'style.css',
  'style_dash.css',
  'common.js',
  'karbantartas.js',
  'termeles.js',
  'dashboard.js',
  'termeles_dash.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('Nem sikerült cache-elni:', url);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Sem a Google Scriptet, sem a Google átirányításokat (googleusercontent) nem fogjuk meg!
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('script.google.com') || 
    event.request.url.includes('googleusercontent.com')
  ) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
