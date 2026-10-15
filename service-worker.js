const CACHE_NAME = 'cmms-cache-v4';
const urlsToCache = [
  './',
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
  'termeles_dash.js',
  'Logo-Schedl%20(1).png'
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
  // A Google Script és átirányításait, valamint a nem-GET kéréseket kihagyjuk
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('script.google.com') || 
    event.request.url.includes('googleusercontent.com')
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      // 1. Keresés a cache-ben (?v=... paraméterek figyelmen kívül hagyásával)
      let cachedResponse = await caches.match(event.request, { ignoreSearch: true });
      if (cachedResponse) return cachedResponse;

      // 2. Ha nincs .html a végén (pl. /maintenance/dashboard), megpróbáljuk .html-lel a cache-ből
      const url = new URL(event.request.url);
      if (!url.pathname.endsWith('/') && !url.pathname.includes('.')) {
        let htmlResponse = await caches.match(url.origin + url.pathname + '.html', { ignoreSearch: true });
        if (htmlResponse) return htmlResponse;
      }

      // 3. Ha nincs a cache-ben, letöltjük a hálózatról
      try {
        return await fetch(event.request);
      } catch (err) {
        // Offline állapotban elnyeljük a hibát, hogy ne dobjon Uncaught TypeError-t
        return new Response('Offline állapot: Az erőforrás nem érhető el.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
        });
      }
    })()
  );
});
