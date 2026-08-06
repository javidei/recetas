(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  let lastFamilyError = null;

  function rewriteProfilesUrl(input) {
    const raw = typeof input === 'string' ? input : input?.url;
    if (!raw) return input;

    try {
      const url = new URL(raw, window.location.href);
      if (url.pathname.endsWith('/rest/v1/profiles')) {
        url.pathname = url.pathname.replace(/\/profiles$/, '/recipe_profiles');
      }

      if (typeof input === 'string') return url.toString();
      if (input instanceof Request) return new Request(url.toString(), input);
      return input;
    } catch {
      return input;
    }
  }

  function isFamilyRequest(url = '') {
    return /\/rest\/v1\/(recipe_families|recipe_family_members|rpc\/(create_recipe_family|join_recipe_family))/.test(url);
  }

  async function rememberFamilyError(response, requestUrl) {
    if (response.ok || !isFamilyRequest(requestUrl)) return;

    let payload = {};
    try { payload = await response.clone().json(); }
    catch { /* La respuesta puede no ser JSON. */ }

    lastFamilyError = {
      status: response.status,
      code: payload.code || '',
      message: payload.message || payload.msg || payload.error_description || payload.error || `Error ${response.status}`
    };
    window.RECETARIO_LAST_FAMILY_ERROR = lastFamilyError;
  }

  window.fetch = async function recetarioFetch(input, init) {
    const rewritten = rewriteProfilesUrl(input);
    const requestUrl = typeof rewritten === 'string' ? rewritten : rewritten?.url || '';
    const response = await nativeFetch(rewritten, init);
    await rememberFamilyError(response, requestUrl);
    return response;
  };

  function isSchemaMissing(error) {
    if (!error) return false;
    return error.status === 404 && /PGRST205|PGRST202|schema cache|could not find the table|could not find the function/i.test(`${error.code} ${error.message}`);
  }

  function reconcileFamilyWarning() {
    const warning = document.querySelector('#migration-warning');
    const message = document.querySelector('#family-message');
    if (!warning || warning.hidden || !lastFamilyError) return;

    if (isSchemaMissing(lastFamilyError)) {
      const detail = warning.querySelector('span');
      if (detail) detail.innerHTML = 'Ejecuta el archivo <code>supabase/003_reparar_familias.sql</code> en Supabase.';
      if (message) {
        message.textContent = 'La migración anterior chocó con una tabla de perfiles compartida. Ejecuta la reparación 003 una sola vez.';
        message.dataset.error = 'true';
      }
      return;
    }

    warning.hidden = true;
    if (message) {
      message.textContent = `Supabase ha devuelto este error: ${lastFamilyError.message}`;
      message.dataset.error = 'true';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('#family-card') || document.body;
    const observer = new MutationObserver(reconcileFamilyWarning);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true });
    reconcileFamilyWarning();
  });
})();
