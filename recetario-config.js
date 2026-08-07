// Configuración pública de El Recetario.
// La URL y la clave publicable pueden usarse en el navegador con RLS activado.
// Nunca incluyas aquí la clave service_role.
window.RECETARIO_CONFIG = Object.freeze({
  supabaseUrl: 'https://avboupigkstzprrgvlhr.supabase.co',
  supabasePublishableKey: 'sb_publishable_eyFLhKFk9HXAab4q1cxG4A_-_la1-OI',
  version: '0.10.2',
  releaseDate: '07/08/2026'
});

(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const nativeFetch = window.fetch.bind(window);

  function addStyle(href, key) {
    if (document.querySelector(`link[data-recetario-style="${key}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.recetarioStyle = key;
    document.head.appendChild(link);
  }

  function addScript(src, key) {
    if (document.querySelector(`script[data-recetario-script="${key}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.recetarioScript = key;
    document.body.appendChild(script);
  }

  addStyle('layout-fixes.css?v=0.10.2', 'layout');
  addStyle('community.css?v=0.10.2', 'community');
  addStyle('confirmation-ui.css?v=0.10.2', 'confirmation-ui');
  addStyle('notifications.css?v=0.10.2', 'notifications');
  addStyle('family-ui-settings.css?v=0.10.2', 'family-ui-settings');
  addStyle('ai-recipe.css?v=0.10.2', 'ai-recipe');

  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.version-block strong').forEach(node => { node.textContent = config.version; });
    addScript('confirmation-ui.js?v=0.10.2', 'confirmation-ui');
  });

  window.addEventListener('load', () => {
    const path = window.location.pathname;
    if (/\/cuenta\.html$/i.test(path)) {
      addScript('registration-patch.js?v=0.10.2', 'registration-patch');
      addScript('account-header.js?v=0.10.2', 'account-header');
      addScript('family-actions.js?v=0.10.2', 'family-actions');
      addScript('family-ui-settings.js?v=0.10.2', 'family-ui-settings');
    } else if (/\/admin\.html$/i.test(path)) {
      addScript('admin-enhancements.js?v=0.10.2', 'admin-enhancements');
      addScript('admin-capacity.js?v=0.10.2', 'admin-capacity');
      addScript('family-ui-settings.js?v=0.10.2', 'family-ui-settings');
      addScript('ai-recipe.js?v=0.10.2', 'ai-recipe');
    } else {
      addScript('recipe-community.js?v=0.10.2', 'recipe-community');
      addScript('recipe-metadata.js?v=0.10.2', 'recipe-metadata');
      addScript('recipe-defaults.js?v=0.10.2', 'recipe-defaults');
      addScript('ai-recipe.js?v=0.10.2', 'ai-recipe');
    }
    addScript('notifications.js?v=0.10.2', 'notifications');
  });

  window.fetch = function recetarioFetch(input, options) {
    const raw = typeof input === 'string' ? input : input?.url;
    if (!raw) return nativeFetch(input, options);
    try {
      const url = new URL(raw, window.location.href);
      if (url.pathname.endsWith('/rest/v1/profiles')) url.pathname = url.pathname.replace(/\/profiles$/, '/recetario_accounts');
      if (typeof input === 'string') return nativeFetch(url.toString(), options);
      if (input instanceof Request) return nativeFetch(new Request(url.toString(), input), options);
    } catch { /* Se deja pasar sin cambios. */ }
    return nativeFetch(input, options);
  };

  const path = window.location.pathname;
  const isPublicAccessPage = /\/(cuenta|admin)\.html$/i.test(path);
  if (isPublicAccessPage) return;

  document.documentElement.dataset.recetarioAuth = 'checking';
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { session = null; }
  if (!session?.access_token || !session?.user?.id) {
    window.location.replace('cuenta.html');
    return;
  }

  const url = `${config.supabaseUrl}/rest/v1/recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=id,is_active&limit=1`;
  nativeFetch(url, {
    cache: 'no-store',
    headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` }
  }).then(async response => {
    if (!response.ok) throw new Error('No se pudo validar la cuenta de El Recetario.');
    const account = (await response.json())?.[0];
    if (!account?.is_active) {
      localStorage.removeItem(SESSION_KEY);
      window.location.replace('cuenta.html');
      return;
    }
    document.documentElement.dataset.recetarioAuth = 'ready';
  }).catch(() => window.location.replace('cuenta.html'));
})();
