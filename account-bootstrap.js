(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, options = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    let nextOptions = options;

    if (url.includes('/rest/v1/profiles?on_conflict=id') && String(options.method || 'GET').toUpperCase() === 'POST') {
      const headers = new Headers(options.headers || {});
      const prefer = headers.get('Prefer') || '';
      headers.set(
        'Prefer',
        prefer
          .replace('resolution=merge-duplicates', 'resolution=ignore-duplicates')
          .replace('return=representation', 'return=minimal')
      );
      nextOptions = { ...options, headers };
    }

    const response = await nativeFetch(input, nextOptions);

    if (url.includes('/auth/v1/signup') && response.ok) {
      response.clone().json().then(payload => {
        if (payload?.access_token) return;
        window.setTimeout(() => {
          const message = document.querySelector('#auth-message');
          if (!message) return;
          message.textContent = 'Cuenta creada. Revisa tu correo para confirmar el registro y después inicia sesión.';
          message.dataset.error = 'false';
        }, 50);
      }).catch(() => {});
    }

    return response;
  };
})();
