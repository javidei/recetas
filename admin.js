(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const MAX_ACCOUNTS = 10;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  const els = {
    list: document.querySelector('#account-list'),
    message: document.querySelector('#admin-message'),
    refresh: document.querySelector('#refresh-button'),
    activeCount: document.querySelector('#active-count'),
    availableCount: document.querySelector('#available-count'),
    recipeCount: document.querySelector('#recipe-count'),
    toast: document.querySelector('#toast')
  };

  let session = readSession();
  let accounts = [];
  let busy = false;

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  }

  function headers(auth = true) {
    const result = { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' };
    if (auth) result.Authorization = `Bearer ${session?.access_token || config.supabasePublishableKey}`;
    return result;
  }

  async function responseMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload.message || payload.msg || payload.error_description || payload.error || `Error ${response.status}`;
    } catch { return `Error ${response.status}`; }
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

  async function ensureSession() {
    if (!session?.access_token) return null;
    if (Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 90) return session;
    if (!session.refresh_token) { saveSession(null); return null; }

    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: headers(false),
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      saveSession(normalizeSession(await response.json()));
      return session;
    } catch {
      saveSession(null);
      return null;
    }
  }

  async function rpc(name, body = {}) {
    await ensureSession();
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = new Error(await responseMessage(response));
      error.status = response.status;
      throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function setMessage(message, isError = false) {
    els.message.textContent = message;
    els.message.dataset.error = String(isError);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 2400);
  }

  function render() {
    const active = accounts.filter(account => account.is_active).length;
    const totalRecipes = accounts.reduce((sum, account) => sum + Number(account.recipe_count || 0), 0);
    els.activeCount.textContent = `${active}/${MAX_ACCOUNTS}`;
    els.availableCount.textContent = Math.max(0, MAX_ACCOUNTS - active);
    els.recipeCount.textContent = totalRecipes;

    if (!accounts.length) {
      els.list.innerHTML = '<div class="empty-state"><span>👥</span><h3>No hay cuentas</h3><p>Todavía no hay familiares registrados.</p></div>';
      return;
    }

    els.list.innerHTML = accounts.map(account => {
      const self = account.id === session.user.id;
      const statusClass = account.is_active ? 'status-pill--active' : 'status-pill--inactive';
      const statusText = account.is_active ? 'Activa' : 'Desactivada';
      const family = account.family_name || 'Sin familia';
      const action = account.is_active ? 'deactivate' : 'activate';
      const label = account.is_active ? 'Desactivar' : 'Reactivar';
      const initial = (account.display_name || account.email || 'F').charAt(0).toUpperCase();

      return `<article class="admin-account" data-account-id="${escapeHtml(account.id)}">
        <div class="admin-account__identity">
          <span class="admin-account__avatar">${escapeHtml(initial)}</span>
          <div>
            <strong>${escapeHtml(account.display_name || 'Familiar')}${self ? ' · Tú' : ''}</strong>
            <span>${escapeHtml(account.email || 'Sin correo')}</span>
          </div>
        </div>
        <div class="admin-account__meta">
          <strong>${escapeHtml(family)}</strong>
          <span>${Number(account.recipe_count || 0)} ${Number(account.recipe_count || 0) === 1 ? 'receta' : 'recetas'}</span>
        </div>
        <div class="admin-account__meta">
          <span class="status-pill ${account.role === 'admin' ? 'status-pill--admin' : statusClass}">${account.role === 'admin' ? 'Administrador' : statusText}</span>
          <span>${account.role === 'admin' ? statusText : 'Cuenta familiar'}</span>
        </div>
        <div class="admin-account__actions">
          <button class="button" type="button" data-action="${action}" data-user-id="${escapeHtml(account.id)}" ${self ? 'disabled title="No puedes desactivar tu propia cuenta"' : ''}>${label}</button>
        </div>
      </article>`;
    }).join('');
  }

  async function loadAccounts() {
    const activeSession = await ensureSession();
    if (!activeSession?.user?.id) {
      location.replace('cuenta.html');
      return;
    }

    busy = true;
    els.refresh.disabled = true;
    setMessage('Cargando cuentas…');

    try {
      const rows = await rpc('admin_list_recetario_accounts');
      accounts = Array.isArray(rows) ? rows : [];
      render();
      setMessage(`${accounts.length} ${accounts.length === 1 ? 'cuenta registrada' : 'cuentas registradas'}.`);
    } catch (error) {
      console.error(error);
      if (/permisos de administrador/i.test(error.message)) {
        setMessage('Esta pantalla solo está disponible para la cuenta administradora.', true);
        setTimeout(() => location.replace('cuenta.html'), 1000);
      } else if (/admin_list_recetario_accounts|PGRST202|schema cache/i.test(error.message)) {
        setMessage('Falta activar la administración de cuentas. Ejecuta el SQL 004 del recetario en Supabase.', true);
      } else {
        setMessage(error.message || 'No se pudieron cargar las cuentas.', true);
      }
    } finally {
      busy = false;
      els.refresh.disabled = false;
    }
  }

  async function setAccountActive(userId, active) {
    if (busy) return;
    const account = accounts.find(item => item.id === userId);
    if (!account) return;

    const verb = active ? 'reactivar' : 'desactivar';
    if (!confirm(`¿Quieres ${verb} la cuenta de ${account.display_name || account.email || 'este familiar'}?`)) return;

    busy = true;
    try {
      await rpc('admin_set_recetario_account_active', {
        target_user_id: userId,
        target_active: active
      });
      showToast(active ? 'Cuenta reactivada' : 'Cuenta desactivada');
      await loadAccounts();
    } catch (error) {
      showToast(`No se pudo cambiar la cuenta: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  els.list.addEventListener('click', event => {
    const button = event.target.closest('[data-action][data-user-id]');
    if (!button || button.disabled) return;
    setAccountActive(button.dataset.userId, button.dataset.action === 'activate');
  });

  els.refresh.addEventListener('click', loadAccounts);
  loadAccounts();
})();
