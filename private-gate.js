(() => {
  'use strict';

  const SESSION_KEY = 'recetario-javi-supabase-session-v1';

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function hasSession() {
    const session = readSession();
    return Boolean(session?.access_token && session?.user?.id);
  }

  if (!hasSession()) {
    const target = `cuenta.html?return=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
    location.replace(target);
    return;
  }

  // Si otra parte de la aplicación invalida o cierra la sesión, el catálogo
  // deja de estar accesible inmediatamente.
  window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY && !hasSession()) location.replace('cuenta.html');
  });

  window.setInterval(() => {
    if (!hasSession()) location.replace('cuenta.html');
  }, 1000);
})();
