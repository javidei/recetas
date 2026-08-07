const CACHE_NAME = 'el-recetario-v0.9.0';
const APP_SHELL = [
  './', './index.html', './cuenta.html', './admin.html',
  './styles.css?v=0.9.0', './supabase.css?v=0.9.0', './account.css?v=0.9.0', './admin.css?v=0.9.0',
  './recipe-save.css?v=0.9.0', './layout-fixes.css?v=0.9.0', './community.css?v=0.9.0', './confirmation-ui.css?v=0.9.0', './notifications.css?v=0.9.0',
  './private-gate.js?v=0.9.0', './recetario-config.js?v=0.9.0', './app.js?v=0.9.0',
  './recipe-save.js?v=0.9.0', './supabase-sync.js?v=0.9.0', './account.js?v=0.9.0', './admin.js?v=0.9.0',
  './recipe-community.js?v=0.9.0', './recipe-metadata.js?v=0.9.0', './recipe-defaults.js?v=0.9.0',
  './family-actions.js?v=0.9.0', './admin-enhancements.js?v=0.9.0', './admin-capacity.js?v=0.9.0',
  './confirmation-ui.js?v=0.9.0', './registration-patch.js?v=0.9.0',
  './account-header.js?v=0.9.0', './notifications.js?v=0.9.0',
  './manifest.webmanifest', './assets/recetario.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
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

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return (await caches.match('./cuenta.html')) || (await caches.match('./index.html'));
      }
      return Response.error();
    }
  })());
});
