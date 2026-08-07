(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
  const form = document.querySelector('#register-form');
  const message = document.querySelector('#auth-message');
  if (!config || !form) return;

  let busy = false;

  function setMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text;
    message.dataset.error = String(isError);
  }

  async function responseMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload.error || payload.message || payload.msg || payload.error_description || `Error ${response.status}`;
    } catch {
      return `Error ${response.status}`;
    }
  }

  function normalizeSession(payload) {
    if (!payload?.access_token || !payload?.user) return null;
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_type: payload.token_type || 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
      user: payload.user
    };
  }

  async function register() {
    if (busy || !form.reportValidity()) return;

    const displayName = document.querySelector('#register-name')?.value.trim() || '';
    const username = document.querySelector('#register-username')?.value.trim().toLowerCase() || '';
    const email = document.querySelector('#register-email')?.value.trim().toLowerCase() || '';
    const password = document.querySelector('#register-password')?.value || '';
    const confirmation = document.querySelector('#register-password-confirm')?.value || '';

    if (!USERNAME_PATTERN.test(username)) {
      setMessage('El usuario debe tener entre 3 y 24 caracteres: letras minúsculas, números o guion bajo.', true);
      return;
    }
    if (password !== confirmation) {
      setMessage('Las contraseñas no coinciden.', true);
      return;
    }

    busy = true;
    const submit = form.querySelector('[type="submit"]');
    const previousLabel = submit?.textContent || 'Crear mi cuenta';
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Creando cuenta…';
    }
    setMessage('Creando la cuenta sin enviar correo de confirmación…');

    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(`${config.supabaseUrl}/functions/v1/recetario-username-login`, {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            apikey: config.supabasePublishableKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'register',
            displayName,
            username,
            email,
            password
          })
        });
      } finally {
        window.clearTimeout(timer);
      }

      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json();
      const session = normalizeSession(payload);
      if (!session) throw new Error('La cuenta se creó, pero no se pudo iniciar sesión automáticamente.');

      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setMessage('Cuenta creada correctamente. Entrando en El Recetario…');
      window.setTimeout(() => location.replace('./'), 250);
    } catch (error) {
      const text = error?.name === 'AbortError'
        ? 'Supabase está tardando demasiado. Vuelve a intentarlo.'
        : String(error?.message || 'No se pudo crear la cuenta.');
      setMessage(text, true);
    } finally {
      busy = false;
      if (submit) {
        submit.disabled = false;
        submit.textContent = previousLabel;
      }
    }
  }

  // Captura el submit antes que account.js para sustituir el signup público,
  // que consume el límite de emails de confirmación de Supabase.
  document.addEventListener('submit', event => {
    if (event.target !== form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    register();
  }, true);
})();
