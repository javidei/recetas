(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const MAX_ACCOUNTS = 10;
  const REQUEST_TIMEOUT = 12000;
  const AVATAR_TIMEOUT = 5000;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  const els = {
    list: document.querySelector('#account-list'),
    familyList: document.querySelector('#family-list'),
    message: document.querySelector('#admin-message'),
    refresh: document.querySelector('#refresh-button'),
    activeCount: document.querySelector('#active-count'),
    availableCount: document.querySelector('#available-count'),
    familyCount: document.querySelector('#family-count'),
    recipeCount: document.querySelector('#recipe-count'),
    toast: document.querySelector('#toast')
  };

  let session = readSession();
  let accounts = [];
  let families = [];
  let avatarUrls = new Map();
  let actionBusy = false;
  let refreshPromise = null;
  let activeLoadController = null;
  let loadSequence = 0;

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

  async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    let externalAbort = null;

    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else {
        externalAbort = () => controller.abort(externalSignal.reason);
        externalSignal.addEventListener('abort', externalAbort, { once: true });
      }
    }

    const timer = window.setTimeout(() => controller.abort('timeout'), timeout);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store'
      });
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      if (controller.signal.aborted) {
        const timeoutError = new Error('Supabase está tardando demasiado en responder. Pulsa Actualizar para reintentar.');
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
      if (externalSignal && externalAbort) externalSignal.removeEventListener('abort', externalAbort);
    }
  }

  async function ensureSession(forceRefresh = false) {
    session = readSession();
    if (!session?.access_token) return null;
    if (!forceRefresh && Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 90) return session;
    if (!session.refresh_token) { saveSession(null); return null; }

    // Muy importante: usuarios y familias se cargan en paralelo. Ambas peticiones
    // comparten UNA sola renovación para evitar rotar el refresh token dos veces.
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const response = await fetchWithTimeout(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: headers(false),
          body: JSON.stringify({ refresh_token: session.refresh_token })
        });
        if (!response.ok) {
          const message = await responseMessage(response);
          if (response.status === 400 || response.status === 401) saveSession(null);
          throw new Error(message);
        }
        const next = normalizeSession(await response.json());
        if (!next) throw new Error('No se pudo renovar la sesión.');
        saveSession(next);
        return next;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function rpc(name, body = {}, options = {}) {
    const active = await ensureSession(Boolean(options.forceRefresh));
    if (!active?.access_token) throw new Error('Tu sesión ha caducado.');

    const makeRequest = () => fetchWithTimeout(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify(body),
      signal: options.signal
    });

    let response = await makeRequest();
    if (response.status === 401 && !options.retried) {
      await ensureSession(true);
      response = await makeRequest();
    }

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

  function encodeObjectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  async function signedAvatar(path, signal) {
    if (!path || !session?.access_token) return '';
    try {
      const response = await fetchWithTimeout(`${config.supabaseUrl}/storage/v1/object/sign/recipe-avatars/${encodeObjectPath(path)}`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ expiresIn: 3600 }),
        signal
      }, AVATAR_TIMEOUT);
      if (!response.ok) return '';
      const payload = await response.json();
      return payload.signedURL ? `${config.supabaseUrl}/storage/v1${payload.signedURL}` : '';
    } catch { return ''; }
  }

  function setMessage(message, isError = false) {
    els.message.textContent = message;
    els.message.dataset.error = String(isError);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function renderAvatar(account) {
    const url = avatarUrls.get(account.id);
    const initial = (account.display_name || account.username || account.email || 'F').charAt(0).toUpperCase();
    return url
      ? `<span class="admin-account__avatar"><img src="${escapeHtml(url)}" alt=""></span>`
      : `<span class="admin-account__avatar">${escapeHtml(initial)}</span>`;
  }

  function render() {
    const active = accounts.filter(account => account.is_active).length;
    const totalRecipes = accounts.reduce((sum, account) => sum + Number(account.recipe_count || 0), 0);
    els.activeCount.textContent = `${active}/${MAX_ACCOUNTS}`;
    els.availableCount.textContent = Math.max(0, MAX_ACCOUNTS - active);
    els.familyCount.textContent = families.length;
    els.recipeCount.textContent = totalRecipes;

    if (!accounts.length) {
      els.list.innerHTML = '<div class="empty-state"><span>👥</span><h3>No hay cuentas</h3><p>Todavía no hay familiares registrados.</p></div>';
    } else {
      els.list.innerHTML = accounts.map(account => {
        const self = account.id === session.user.id;
        const statusClass = account.is_active ? 'status-pill--active' : 'status-pill--inactive';
        const statusText = account.is_active ? 'Activa' : 'Desactivada';
        const action = account.is_active ? 'deactivate' : 'activate';
        const label = account.is_active ? 'Desactivar' : 'Reactivar';
        const familyItems = Array.isArray(account.families) ? account.families : [];
        const familyMarkup = familyItems.length
          ? familyItems.map(family => `<span class="family-chip">${escapeHtml(family.name)}<small>${family.member_role === 'owner' ? 'Propietario' : 'Miembro'}</small></span>`).join('')
          : '<span class="family-chip family-chip--empty">Sin familias</span>';

        return `<article class="admin-account" data-account-id="${escapeHtml(account.id)}">
          <div class="admin-account__identity">
            ${renderAvatar(account)}
            <div>
              <strong>${escapeHtml(account.display_name || 'Familiar')}${self ? ' · Tú' : ''}</strong>
              <span>${account.username ? `@${escapeHtml(account.username)} · ` : ''}${escapeHtml(account.email || 'Sin correo')}</span>
            </div>
          </div>
          <div class="admin-account__families">${familyMarkup}</div>
          <div class="admin-account__meta">
            <strong>${Number(account.recipe_count || 0)} ${Number(account.recipe_count || 0) === 1 ? 'receta' : 'recetas'}</strong>
            <span class="status-pill ${account.role === 'admin' ? 'status-pill--admin' : statusClass}">${account.role === 'admin' ? 'Administrador' : statusText}</span>
          </div>
          <div class="admin-account__actions">
            <button class="button" type="button" data-action="${action}" data-user-id="${escapeHtml(account.id)}" ${self ? 'disabled title="No puedes desactivar tu propia cuenta"' : ''}>${label}</button>
          </div>
        </article>`;
      }).join('');
    }

    if (!families.length) {
      els.familyList.innerHTML = '<div class="empty-state"><span>👨‍👩‍👧‍👦</span><h3>No hay familias</h3><p>Los grupos aparecerán aquí cuando se cree el primero.</p></div>';
    } else {
      els.familyList.innerHTML = families.map(family => `<form class="admin-family" data-family-id="${escapeHtml(family.id)}">
        <div class="admin-family__info">
          <span class="admin-family__icon" aria-hidden="true">👨‍👩‍👧‍👦</span>
          <div><strong>${escapeHtml(family.name)}</strong><span>${Number(family.member_count || 0)} miembros · Propietario: ${escapeHtml(family.owner_name || '—')}</span><small>Código: ${escapeHtml(family.invite_code || '—')}</small></div>
        </div>
        <label class="field admin-family__rename"><span>Cambiar nombre</span><input name="familyName" value="${escapeHtml(family.name)}" minlength="2" maxlength="70" required></label>
        <button class="button button--soft" type="submit">Guardar nombre</button>
      </form>`).join('');
    }
  }

  function setLoadingState(isLoading, manual = false) {
    els.refresh.classList.toggle('is-loading', isLoading);
    els.refresh.setAttribute('aria-busy', String(isLoading));
    els.refresh.textContent = isLoading ? (manual ? 'Actualizando…' : 'Cargando…') : 'Actualizar';
    // No se deshabilita: si algo se atasca, pulsarlo cancela la carga anterior y reintenta.
    els.refresh.disabled = false;
  }

  async function loadAvatarsInBackground(targetAccounts, sequence, signal) {
    const avatarAccounts = targetAccounts.filter(account => account.avatar_path);
    if (!avatarAccounts.length) return;
    const pairs = await Promise.allSettled(avatarAccounts.map(async account => [account.id, await signedAvatar(account.avatar_path, signal)]));
    if (signal.aborted || sequence !== loadSequence) return;

    let changed = false;
    pairs.forEach(result => {
      if (result.status !== 'fulfilled') return;
      const [id, url] = result.value;
      if (!url) return;
      avatarUrls.set(id, url);
      changed = true;
    });
    if (changed) render();
  }

  async function loadData({ manual = false } = {}) {
    const sequence = ++loadSequence;
    if (activeLoadController) activeLoadController.abort('reload');
    const controller = new AbortController();
    activeLoadController = controller;

    setLoadingState(true, manual);
    if (manual) {
      setMessage('Actualizando datos desde Supabase…');
      showToast('Actualizando administración…');
    } else {
      setMessage('Cargando cuentas y familias…');
    }

    try {
      const activeSession = await ensureSession();
      if (!activeSession?.user?.id) {
        location.replace('cuenta.html');
        return;
      }
      if (controller.signal.aborted || sequence !== loadSequence) return;

      // Las dos consultas se hacen en paralelo, pero la sesión ya está resuelta una sola vez.
      const [accountsResult, familiesResult] = await Promise.allSettled([
        rpc('admin_list_recetario_accounts', {}, { signal: controller.signal }),
        rpc('admin_list_recipe_families', {}, { signal: controller.signal })
      ]);
      if (controller.signal.aborted || sequence !== loadSequence) return;

      if (accountsResult.status === 'rejected') throw accountsResult.reason;
      accounts = Array.isArray(accountsResult.value) ? accountsResult.value : [];

      let partialError = '';
      if (familiesResult.status === 'fulfilled') {
        families = Array.isArray(familiesResult.value) ? familiesResult.value : [];
      } else {
        families = [];
        partialError = familiesResult.reason?.message || 'No se pudieron cargar las familias.';
      }

      // Pintamos inmediatamente. Las fotos no vuelven a bloquear toda la página.
      avatarUrls = new Map();
      render();
      setMessage(partialError
        ? `Cuentas cargadas. Las familias no se han podido actualizar: ${partialError}`
        : `${accounts.length} ${accounts.length === 1 ? 'cuenta registrada' : 'cuentas registradas'} · ${families.length} ${families.length === 1 ? 'familia' : 'familias'}.`,
      Boolean(partialError));

      loadAvatarsInBackground(accounts, sequence, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || sequence !== loadSequence) return;
      console.error(error);
      if (/permisos de administrador/i.test(error.message)) {
        setMessage('Esta pantalla solo está disponible para la cuenta administradora.', true);
        setTimeout(() => location.replace('cuenta.html'), 1100);
      } else if (/admin_list_recipe_families|admin_list_recetario_accounts|PGRST202|schema cache/i.test(error.message)) {
        setMessage('Supabase no encuentra las funciones de administración. Revisa las migraciones del Recetario.', true);
      } else {
        setMessage(error.message || 'No se pudieron cargar los datos. Pulsa Actualizar para reintentar.', true);
      }
      els.activeCount.textContent = '—';
      els.availableCount.textContent = '—';
      els.familyCount.textContent = '—';
      els.recipeCount.textContent = '—';
    } finally {
      if (sequence === loadSequence) {
        setLoadingState(false);
        activeLoadController = null;
      }
    }
  }

  async function setAccountActive(userId, active) {
    if (actionBusy) return;
    const account = accounts.find(item => item.id === userId);
    if (!account) return;
    const verb = active ? 'reactivar' : 'desactivar';
    if (!confirm(`¿Quieres ${verb} la cuenta de ${account.display_name || account.email || 'este familiar'}?`)) return;
    actionBusy = true;
    try {
      await rpc('admin_set_recetario_account_active', { target_user_id: userId, target_active: active });
      showToast(active ? 'Cuenta reactivada' : 'Cuenta desactivada');
      await loadData({ manual: true });
    } catch (error) {
      showToast(`No se pudo cambiar la cuenta: ${error.message}`);
    } finally { actionBusy = false; }
  }

  async function renameFamily(form) {
    if (actionBusy || !form.reportValidity()) return;
    const familyId = form.dataset.familyId;
    const name = new FormData(form).get('familyName')?.toString().trim();
    actionBusy = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await rpc('admin_rename_recipe_family', { target_family_id: familyId, new_name: name });
      showToast('Nombre de familia actualizado');
      await loadData({ manual: true });
    } catch (error) {
      showToast(`No se pudo renombrar: ${error.message}`);
    } finally {
      actionBusy = false;
      button.disabled = false;
    }
  }

  els.list.addEventListener('click', event => {
    const button = event.target.closest('[data-action][data-user-id]');
    if (!button || button.disabled) return;
    setAccountActive(button.dataset.userId, button.dataset.action === 'activate');
  });
  els.familyList.addEventListener('submit', event => {
    const form = event.target.closest('[data-family-id]');
    if (!form) return;
    event.preventDefault();
    renameFamily(form);
  });
  els.refresh.addEventListener('click', () => loadData({ manual: true }));

  // Lo usan las mejoras de administración tras borrar una familia.
  window.recetarioAdminRefresh = () => loadData({ manual: true });

  loadData();
})();