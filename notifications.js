(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  let panel = null;
  let bell = null;
  let badge = null;
  let unavailable = false;
  let loading = false;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  const current = session();
  if (!current?.access_token || !current?.user?.id) return;

  function headers() {
    const active = session();
    return {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${active?.access_token || config.supabasePublishableKey}`,
      'Content-Type': 'application/json'
    };
  }

  async function responseMessage(response) {
    try {
      const data = await response.clone().json();
      return data.message || data.error || data.msg || `Error ${response.status}`;
    } catch { return `Error ${response.status}`; }
  }

  async function rest(path, options = {}) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) }
    });
    if (!response.ok) {
      const error = new Error(await responseMessage(response));
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function install() {
    const header = document.querySelector('.site-header .header-inner');
    if (!header || document.querySelector('#notifications-button')) return;

    bell = document.createElement('button');
    bell.id = 'notifications-button';
    bell.className = 'notifications-button';
    bell.type = 'button';
    bell.setAttribute('aria-label', 'Notificaciones');
    bell.setAttribute('aria-expanded', 'false');
    bell.innerHTML = '<span class="notifications-button__icon" aria-hidden="true">🔔</span><span class="notifications-badge" id="notifications-badge" hidden>0</span>';
    badge = bell.querySelector('#notifications-badge');

    const headerActions = header.querySelector('.header-actions, .admin-header-actions');
    if (headerActions) headerActions.prepend(bell);
    else {
      const backButton = [...header.children].find(node => node.matches?.('a.button'));
      if (backButton) header.insertBefore(bell, backButton);
      else header.appendChild(bell);
    }

    panel = document.createElement('aside');
    panel.id = 'notifications-panel';
    panel.className = 'notifications-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Notificaciones del recetario');
    panel.innerHTML = `
      <div class="notifications-panel__header">
        <div><span class="eyebrow">Actividad</span><h2>Notificaciones</h2></div>
        <button class="notifications-close" type="button" aria-label="Cerrar notificaciones">×</button>
      </div>
      <div class="notifications-toolbar">
        <span id="notifications-summary">Cargando…</span>
        <button id="notifications-mark-all" type="button">Marcar todas como leídas</button>
      </div>
      <div class="notifications-list" id="notifications-list"><p class="notifications-empty">Cargando notificaciones…</p></div>`;
    document.body.appendChild(panel);

    bell.addEventListener('click', () => togglePanel());
    panel.querySelector('.notifications-close').addEventListener('click', () => closePanel());
    panel.querySelector('#notifications-mark-all').addEventListener('click', markAllRead);
    panel.querySelector('#notifications-list').addEventListener('click', event => {
      const item = event.target.closest('[data-notification-id]');
      if (item) openNotification(item);
    });
    document.addEventListener('click', event => {
      if (panel.hidden || panel.contains(event.target) || bell.contains(event.target)) return;
      closePanel();
    });
  }

  function togglePanel() {
    if (!panel) return;
    panel.hidden ? openPanel() : closePanel();
  }

  function openPanel() {
    panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
    loadNotifications();
  }

  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    bell?.setAttribute('aria-expanded', 'false');
  }

  async function loadNotifications() {
    if (unavailable || loading) return;
    loading = true;
    try {
      const active = session();
      if (!active?.user?.id) return;
      const rows = await rest(`recipe_notifications?user_id=eq.${encodeURIComponent(active.user.id)}&select=id,actor_id,recipe_id,comment_id,notification_type,recipe_title,is_read,created_at&order=created_at.desc&limit=40`);
      const actorIds = [...new Set((rows || []).map(row => row.actor_id).filter(Boolean))];
      let actors = [];
      if (actorIds.length) {
        try { actors = await rest(`recetario_accounts?id=in.(${actorIds.join(',')})&select=id,display_name,username`); }
        catch { actors = []; }
      }
      const actorMap = new Map((actors || []).map(actor => [actor.id, actor]));
      render(rows || [], actorMap);
    } catch (error) {
      if (/recipe_notifications|schema cache|PGRST/i.test(error.message)) {
        unavailable = true;
        bell.hidden = true;
        closePanel();
      } else if (panel && !panel.hidden) {
        panel.querySelector('#notifications-list').innerHTML = `<p class="notifications-empty notifications-error">No se pudieron cargar: ${escapeHtml(error.message)}</p>`;
      }
    } finally { loading = false; }
  }

  function render(rows, actorMap) {
    if (!panel || !bell) return;
    const unread = rows.filter(row => !row.is_read).length;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread === 0;
    bell.classList.toggle('has-unread', unread > 0);

    const summary = panel.querySelector('#notifications-summary');
    summary.textContent = unread ? `${unread} ${unread === 1 ? 'sin leer' : 'sin leer'}` : 'Todo al día';
    panel.querySelector('#notifications-mark-all').disabled = unread === 0;

    const list = panel.querySelector('#notifications-list');
    if (!rows.length) {
      list.innerHTML = '<div class="notifications-empty"><span aria-hidden="true">✓</span><strong>Todo tranquilo</strong><p>Aquí aparecerán los comentarios y respuestas que te afecten.</p></div>';
      return;
    }

    list.innerHTML = rows.map(row => {
      const actor = actorMap.get(row.actor_id) || null;
      const actorName = actor?.display_name || actor?.username || 'Un familiar';
      const copy = row.notification_type === 'comment_reply'
        ? `<strong>${escapeHtml(actorName)}</strong> ha respondido a tu comentario.`
        : `<strong>${escapeHtml(actorName)}</strong> ha comentado tu receta.`;
      return `<button class="notification-item${row.is_read ? '' : ' is-unread'}" type="button" data-notification-id="${escapeHtml(row.id)}" data-recipe-id="${escapeHtml(row.recipe_id)}">
        <span class="notification-item__icon" aria-hidden="true">${row.notification_type === 'comment_reply' ? '↩' : '💬'}</span>
        <span class="notification-item__body"><span>${copy}</span><b>${escapeHtml(row.recipe_title || 'Receta')}</b><small>${escapeHtml(formatDate(row.created_at))}</small></span>
        ${row.is_read ? '' : '<span class="notification-item__dot" aria-label="Sin leer"></span>'}
      </button>`;
    }).join('');
  }

  async function markRead(id) {
    try {
      await rest(`recipe_notifications?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_read: true })
      });
    } catch { /* La navegación no se bloquea por esto. */ }
  }

  async function markAllRead() {
    const active = session();
    if (!active?.user?.id) return;
    const button = panel.querySelector('#notifications-mark-all');
    button.disabled = true;
    try {
      await rest(`recipe_notifications?user_id=eq.${encodeURIComponent(active.user.id)}&is_read=eq.false`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_read: true })
      });
      await loadNotifications();
    } catch (error) {
      panel.querySelector('#notifications-summary').textContent = `No se pudo actualizar: ${error.message}`;
    }
  }

  async function openNotification(item) {
    const notificationId = item.dataset.notificationId;
    const recipeId = item.dataset.recipeId;
    await markRead(notificationId);
    closePanel();
    if (typeof window.openRecipe === 'function' && document.querySelector('#recipe-dialog')) {
      window.openRecipe(recipeId);
      setTimeout(() => document.querySelector('#recipe-comments-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    } else {
      location.href = `./#receta=${encodeURIComponent(recipeId)}`;
    }
  }

  install();
  loadNotifications();
  window.addEventListener('recetario:notifications-refresh', () => loadNotifications());
  window.setInterval(() => loadNotifications(), 45000);
})();