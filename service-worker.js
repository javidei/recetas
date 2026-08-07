const CACHE_NAME = 'el-recetario-v0.10.5';
const APP_SHELL = [
  './', './index.html', './cuenta.html', './admin.html',
  './styles.css?v=0.10.5', './supabase.css?v=0.10.5', './account.css?v=0.10.5', './admin.css?v=0.10.5',
  './recipe-save.css?v=0.10.5', './layout-fixes.css?v=0.10.5', './community.css?v=0.10.5', './confirmation-ui.css?v=0.10.5', './notifications.css?v=0.10.5', './family-ui-settings.css?v=0.10.5', './ai-recipe.css?v=0.10.5',
  './private-gate.js?v=0.10.5', './recetario-config.js?v=0.10.5', './app.js?v=0.10.5',
  './recipe-save.js?v=0.10.5', './supabase-sync.js?v=0.10.5', './account.js?v=0.10.5', './admin.js?v=0.10.5',
  './recipe-community.js?v=0.10.5', './recipe-metadata.js?v=0.10.5', './recipe-defaults.js?v=0.10.5',
  './family-actions.js?v=0.10.5', './family-ui-settings.js?v=0.10.5', './admin-enhancements.js?v=0.10.5', './admin-capacity.js?v=0.10.5',
  './confirmation-ui.js?v=0.10.5', './registration-patch.js?v=0.10.5', './ai-recipe.js?v=0.10.5',
  './account-header.js?v=0.10.5', './notifications.js?v=0.10.5',
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
      if (event.request.mode === 'navigate') return (await caches.match('./cuenta.html')) || (await caches.match('./index.html'));
      return Response.error();
    }
  })());
});