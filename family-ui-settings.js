(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function headers(session) {
    return {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
  }

  async function responseMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload.message || payload.msg || payload.error_description || payload.error || `Error ${response.status}`;
    } catch {
      return `Error ${response.status}`;
    }
  }

  async function request(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function rpc(session, name, body = {}) {
    const response = await request(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function accountRole(session) {
    const response = await request(
      `${config.supabaseUrl}/rest/v1/recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=role&limit=1`,
      { headers: headers(session) }
    );
    if (!response.ok) throw new Error(await responseMessage(response));
    const rows = await response.json();
    return rows?.[0]?.role || 'member';
  }

  function settingValue(payload) {
    if (Array.isArray(payload)) return Boolean(payload[0]?.family_creation_visible_to_members);
    if (payload && typeof payload === 'object') return Boolean(payload.family_creation_visible_to_members);
    return true;
  }

  async function applyAccountSetting(session) {
    const createForm = document.querySelector('#create-family-form');
    const actionsGrid = createForm?.closest('.family-actions-grid');
    if (!createForm || !actionsGrid) return;

    try {
      const [settings, role] = await Promise.all([
        rpc(session, 'get_recetario_ui_settings'),
        accountRole(session)
      ]);
      const isAdmin = role === 'admin';
      const visibleToMembers = settingValue(settings);
      const hideCreate = !isAdmin && !visibleToMembers;

      createForm.hidden = hideCreate;
      actionsGrid.classList.toggle('family-actions-grid--single', hideCreate);

      let notice = actionsGrid.parentElement?.querySelector('.family-creation-admin-note');
      if (hideCreate) {
        if (!notice) {
          notice = document.createElement('div');
          notice.className = 'family-creation-admin-note';
          notice.innerHTML = '<strong>La creación de familias la gestiona el administrador.</strong><span>Si te han dado un código, puedes entrar en la familia desde el cuadro de abajo.</span>';
          actionsGrid.before(notice);
        }
        notice.hidden = false;
      } else if (notice) {
        notice.hidden = true;
      }
    } catch (error) {
      console.warn('No se pudo aplicar la visibilidad de Crear familia.', error);
      // Si todavía no se ha aplicado la migración 013, mantenemos el comportamiento anterior.
      createForm.hidden = false;
      actionsGrid.classList.remove('family-actions-grid--single');
    }
  }

  async function setupAdminSetting(session) {
    const card = document.querySelector('.families-admin-card');
    const familyList = document.querySelector('#family-list');
    if (!card || !familyList || card.querySelector('#family-create-visibility-setting')) return;

    const panel = document.createElement('section');
    panel.className = 'family-visibility-setting';
    panel.id = 'family-create-visibility-setting';
    panel.innerHTML = `
      <div class="family-visibility-setting__copy">
        <span class="eyebrow">Sencillez para los usuarios</span>
        <strong>¿Quién puede ver “Crear familia”?</strong>
        <p>Desmárcalo si prefieres crear tú los grupos. Los demás seguirán pudiendo entrar con un código y consultar sus familias.</p>
      </div>
      <label class="family-visibility-toggle">
        <input id="family-create-visible-checkbox" type="checkbox">
        <span class="family-visibility-toggle__track" aria-hidden="true"><span></span></span>
        <span class="family-visibility-toggle__text">
          <strong>Mostrar “Crear familia” a todos</strong>
          <small id="family-create-visible-help">Cargando ajuste…</small>
        </span>
      </label>
      <p class="family-visibility-setting__status" id="family-create-visible-status" aria-live="polite"></p>`;

    familyList.before(panel);

    const checkbox = panel.querySelector('#family-create-visible-checkbox');
    const help = panel.querySelector('#family-create-visible-help');
    const status = panel.querySelector('#family-create-visible-status');

    function paint(value) {
      checkbox.checked = value;
      help.textContent = value
        ? 'Los usuarios normales también verán la opción de crear familias.'
        : 'Solo la cuenta administradora verá la opción de crear familias.';
    }

    try {
      paint(settingValue(await rpc(session, 'get_recetario_ui_settings')));
    } catch (error) {
      checkbox.disabled = true;
      help.textContent = 'Falta activar este ajuste en Supabase.';
      status.textContent = 'Ejecuta supabase/013_visibilidad_crear_familia.sql.';
      status.dataset.error = 'true';
      return;
    }

    checkbox.addEventListener('change', async () => {
      const desired = checkbox.checked;
      checkbox.disabled = true;
      status.dataset.error = 'false';
      status.textContent = 'Guardando ajuste…';
      try {
        const result = await rpc(session, 'admin_set_family_creation_visibility', { target_visible: desired });
        paint(Boolean(result));
        status.textContent = desired
          ? 'Ahora todos pueden ver “Crear familia”.'
          : 'Ahora “Crear familia” solo se muestra al administrador.';
      } catch (error) {
        paint(!desired);
        status.textContent = `No se pudo guardar: ${error.message}`;
        status.dataset.error = 'true';
      } finally {
        checkbox.disabled = false;
      }
    });
  }

  async function init() {
    const session = readSession();
    if (!session?.access_token || !session?.user?.id) return;
    const path = location.pathname;
    if (/\/cuenta\.html$/i.test(path)) await applyAccountSetting(session);
    if (/\/admin\.html$/i.test(path)) await setupAdminSetting(session);
  }

  init();
})();
