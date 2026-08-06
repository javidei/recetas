const CACHE_NAME = 'recetario-javi-v0.3.1';
const APP_SHELL = [
  './', './index.html', './cuenta.html',
  './styles.css?v=0.3.1', './supabase.css?v=0.3.1', './account.css?v=0.3.1',
  './recetario-config.js?v=0.3.1', './app.js?v=0.3.1', './supabase-sync.js?v=0.3.1',
  './account-bootstrap.js?v=0.3.1', './account-compat.js?v=0.3.1', './account.js?v=0.3.1',
  './manifest.webmanifest', './assets/recetario.svg'
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
  }).catch(() => caches.match(event.request).then(response => response || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
