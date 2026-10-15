const CACHE_NAME = 'cmms-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/production.html',
  '/style.css',
  '/style_dash.css',
  '/common.js',
  '/karbantartas.js',
  '/termeles.js',
  '/dashboard.html',
  '/dashboard_prod.html',
  '/dashboard.js',
  '/termeles_dash.js',
  '/Logo-Schedl (1).png',
  'https://unpkg.com/html5-qrcode'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', event => {
  // A Google Script (POST) hívásokat nem cacheljük, azt a common.js kezeli offline!
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) return;
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});