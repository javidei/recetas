const CACHE_NAME = 'recetario-javi-v0.2.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=0.2.0',
  './supabase.css?v=0.2.0',
  './recetario-config.js?v=0.2.0',
  './app.js?v=0.2.0',
  './supabase-sync.js?v=0.2.0',
  './manifest.webmanifest',
  './assets/recetario.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html'))));
});
