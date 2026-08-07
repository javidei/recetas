const CACHE_NAME = 'el-recetario-v0.8.3';
const APP_SHELL = [
  './', './index.html', './cuenta.html', './admin.html',
  './styles.css?v=0.8.3', './supabase.css?v=0.8.3', './account.css?v=0.8.3', './admin.css?v=0.8.3',
  './recipe-save.css?v=0.8.3', './layout-fixes.css?v=0.8.3', './community.css?v=0.8.3', './confirmation-ui.css?v=0.8.3', './notifications.css?v=0.8.3',
  './private-gate.js?v=0.8.3', './recetario-config.js?v=0.8.3', './app.js?v=0.8.3',
  './recipe-save.js?v=0.8.3', './supabase-sync.js?v=0.8.3', './account.js?v=0.8.3', './admin.js?v=0.8.3',
  './recipe-community.js?v=0.8.3', './recipe-metadata.js?v=0.8.3', './recipe-defaults.js?v=0.8.3',
  './family-actions.js?v=0.8.3', './admin-enhancements.js?v=0.8.3', './confirmation-ui.js?v=0.8.3',
  './account-header.js?v=0.8.3', './notifications.js?v=0.8.3',
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
  }).catch(() => caches.match(event.request).then(response => response || (event.request.mode === 'navigate' ? caches.match('./cuenta.html') : undefined))));
});
