(() => {
  'use strict';

  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const header = document.querySelector('.account-page .site-header .header-inner');
  if (!header) return;

  const backLink = [...header.querySelectorAll('a.button')].find(link => /volver a las recetas/i.test(link.textContent || ''));
  if (!backLink) return;

  function hasSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return Boolean(session?.access_token && session?.user?.id);
    } catch {
      return false;
    }
  }

  function refresh() {
    backLink.hidden = !hasSession();
  }

  refresh();
  window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY) refresh();
  });
})();
