(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  if (!config) return;

  let activeResolver = null;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function ensureDialog() {
    let dialog = document.querySelector('#recetario-confirm-dialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'recetario-confirm-dialog';
    dialog.className = 'recetario-confirm recetario-confirm--danger';
    dialog.setAttribute('aria-labelledby', 'recetario-confirm-title');
    dialog.setAttribute('aria-describedby', 'recetario-confirm-message');
    dialog.innerHTML = `
      <div class="recetario-confirm__card">
        <div class="recetario-confirm__icon" id="recetario-confirm-icon" aria-hidden="true">!</div>
        <p class="recetario-confirm__eyebrow" id="recetario-confirm-eyebrow">Confirmar acción</p>
        <h2 class="recetario-confirm__title" id="recetario-confirm-title">¿Quieres continuar?</h2>
        <p class="recetario-confirm__message" id="recetario-confirm-message"></p>
        <p class="recetario-confirm__warning" id="recetario-confirm-warning" hidden></p>
        <p class="recetario-confirm__status" id="recetario-confirm-status" aria-live="polite"></p>
        <div class="recetario-confirm__actions">
          <button class="recetario-confirm__button recetario-confirm__button--cancel" id="recetario-confirm-cancel" type="button">Cancelar</button>
          <button class="recetario-confirm__button recetario-confirm__button--confirm" id="recetario-confirm-accept" type="button">Confirmar</button>
        </div>
      </div>`;

    const finish = result => {
      if (!activeResolver) return;
      const resolve = activeResolver;
      activeResolver = null;
      if (dialog.open) dialog.close();
      resolve(result);
    };

    dialog.querySelector('#recetario-confirm-cancel').addEventListener('click', () => finish(false));
    dialog.querySelector('#recetario-confirm-accept').addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('has-modal');
      if (activeResolver) {
        const resolve = activeResolver;
        activeResolver = null;
        resolve(false);
      }
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  window.recetarioConfirm = function recetarioConfirm(options = {}) {
    const dialog = ensureDialog();
    if (dialog.open && activeResolver) {
      activeResolver(false);
      activeResolver = null;
      dialog.close();
    }

    const variant = options.variant === 'success' ? 'success' : 'danger';
    dialog.className = `recetario-confirm recetario-confirm--${variant}`;
    dialog.querySelector('#recetario-confirm-icon').textContent = options.icon || (variant === 'danger' ? '!' : '✓');
    dialog.querySelector('#recetario-confirm-eyebrow').textContent = options.eyebrow || (variant === 'danger' ? 'Acción sensible' : 'Confirmación');
    dialog.querySelector('#recetario-confirm-title').textContent = options.title || '¿Quieres continuar?';
    dialog.querySelector('#recetario-confirm-message').textContent = options.message || '';
    const warning = dialog.querySelector('#recetario-confirm-warning');
    warning.textContent = options.warning || '';
    warning.hidden = !options.warning;
    dialog.querySelector('#recetario-confirm-status').textContent = '';
    dialog.querySelector('#recetario-confirm-cancel').textContent = options.cancelLabel || 'Cancelar';
    dialog.querySelector('#recetario-confirm-accept').textContent = options.confirmLabel || 'Confirmar';
    dialog.querySelector('#recetario-confirm-cancel').disabled = false;
    dialog.querySelector('#recetario-confirm-accept').disabled = false;

    document.body.classList.add('has-modal');
    dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('#recetario-confirm-cancel').focus());

    return new Promise(resolve => { activeResolver = resolve; });
  };

  window.recetarioNotice = async function recetarioNotice(options = {}) {
    const accepted = await window.recetarioConfirm({
      ...options,
      variant: options.variant || 'success',
      cancelLabel: '',
      confirmLabel: options.confirmLabel || 'Aceptar'
    });
    return accepted;
  };

  function setDialogBusy(busy, status = '') {
    const dialog = ensureDialog();
    dialog.querySelector('#recetario-confirm-cancel').disabled = busy;
    dialog.querySelector('#recetario-confirm-accept').disabled = busy;
    dialog.querySelector('#recetario-confirm-status').textContent = status;
  }

  async function rpc(name, body = {}) {
    const current = session();
    if (!current?.access_token) throw new Error('Tu sesión ha caducado.');
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${current.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      let message = `Error ${response.status}`;
      try {
        const data = await response.json();
        message = data.message || data.error || data.msg || message;
      } catch {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function restDelete(path) {
    const current = session();
    if (!current?.access_token) throw new Error('Tu sesión ha caducado.');
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      method: 'DELETE',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${current.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      let message = `Error ${response.status}`;
      try {
        const data = await response.json();
        message = data.message || data.error || data.msg || message;
      } catch {}
      throw new Error(message);
    }
  }

  async function confirmDeleteFamily(button, adminView) {
    const card = button.closest('.family-group-card, .admin-family');
    const name = card?.querySelector('h3, .admin-family__info strong')?.textContent?.trim() || 'esta familia';
    const accepted = await window.recetarioConfirm({
      eyebrow: 'Eliminar familia',
      title: `¿Eliminar “${name}”?`,
      message: 'El grupo desaparecerá para todos sus miembros.',
      warning: 'Las recetas compartidas con esta familia no se borrarán: pasarán automáticamente a ser privadas.',
      confirmLabel: 'Sí, eliminar familia',
      icon: '×'
    });
    if (!accepted) return;

    setDialogBusy(true, 'Eliminando familia…');
    try {
      await rpc('delete_recipe_family', {
        target_family_id: button.dataset.deleteFamily || button.dataset.adminDeleteFamily
      });
      ensureDialog().close();
      if (adminView) document.querySelector('#refresh-button')?.click();
      else location.reload();
    } catch (error) {
      setDialogBusy(false, `No se pudo eliminar: ${error.message}`);
    }
  }

  async function confirmAccountChange(button) {
    const active = button.dataset.action === 'activate';
    const card = button.closest('.admin-account');
    const name = card?.querySelector('.admin-account__identity strong')?.textContent?.replace(' · Tú', '').trim() || 'esta cuenta';
    const accepted = await window.recetarioConfirm({
      eyebrow: active ? 'Reactivar cuenta' : 'Desactivar cuenta',
      title: active ? `¿Reactivar a ${name}?` : `¿Desactivar a ${name}?`,
      message: active
        ? 'La persona recuperará el acceso al recetario con su cuenta habitual.'
        : 'La persona dejará de poder acceder al recetario hasta que vuelvas a reactivarla.',
      warning: active ? '' : 'Sus recetas y comentarios no se eliminan; únicamente se bloquea el acceso.',
      confirmLabel: active ? 'Sí, reactivar' : 'Sí, desactivar',
      variant: active ? 'success' : 'danger',
      icon: active ? '✓' : '!'
    });
    if (!accepted) return;

    setDialogBusy(true, active ? 'Reactivando cuenta…' : 'Desactivando cuenta…');
    try {
      await rpc('admin_set_recetario_account_active', {
        target_user_id: button.dataset.userId,
        target_active: active
      });
      ensureDialog().close();
      document.querySelector('#refresh-button')?.click();
    } catch (error) {
      setDialogBusy(false, `No se pudo cambiar la cuenta: ${error.message}`);
    }
  }

  async function confirmDeleteComment(button) {
    const article = button.closest('.recipe-comment');
    const nestedCount = article ? article.querySelectorAll('.recipe-comment').length : 0;
    const accepted = await window.recetarioConfirm({
      eyebrow: 'Eliminar comentario',
      title: '¿Eliminar este comentario?',
      message: 'El comentario dejará de aparecer en esta receta.',
      warning: nestedCount
        ? `También se eliminarán ${nestedCount} ${nestedCount === 1 ? 'respuesta anidada' : 'respuestas anidadas'} que dependen de él.`
        : '',
      confirmLabel: 'Sí, eliminar comentario',
      icon: '×'
    });
    if (!accepted) return;

    setDialogBusy(true, 'Eliminando comentario…');
    try {
      await restDelete(`recipe_comments?id=eq.${encodeURIComponent(button.dataset.deleteComment)}`);
      const removed = 1 + nestedCount;
      article?.remove();
      const count = document.querySelector('#comments-count');
      if (count) count.textContent = String(Math.max(0, Number(count.textContent || 0) - removed));
      const list = document.querySelector('#comments-list');
      if (list && !list.querySelector('.recipe-comment')) {
        list.innerHTML = '<div class="comments-empty">Todavía no hay comentarios. Puedes inaugurar la conversación.</div>';
      }
      ensureDialog().close();
    } catch (error) {
      setDialogBusy(false, `No se pudo eliminar: ${error.message}`);
    }
  }

  async function confirmDeleteRecipe(button) {
    const id = button.dataset.deleteRecipe;
    let recipe = null;
    try { recipe = typeof findRecipe === 'function' ? findRecipe(id) : null; } catch {}
    const title = recipe?.title || 'esta receta';
    const accepted = await window.recetarioConfirm({
      eyebrow: 'Eliminar receta',
      title: `¿Eliminar “${title}”?`,
      message: 'La receta desaparecerá de tu recetario.',
      warning: 'También se eliminarán sus ingredientes, pasos, comentarios y la imagen almacenada. Esta acción no se puede deshacer.',
      confirmLabel: 'Sí, eliminar receta',
      icon: '×'
    });
    if (!accepted) return;

    ensureDialog().close();
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      const result = typeof deleteRecipe === 'function' ? deleteRecipe(id) : null;
      if (result && typeof result.then === 'function') result.catch(error => console.error(error));
    } finally {
      window.confirm = originalConfirm;
    }
  }

  document.addEventListener('click', event => {
    const recipeButton = event.target.closest('[data-delete-recipe]');
    if (recipeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmDeleteRecipe(recipeButton);
      return;
    }

    const commentButton = event.target.closest('[data-delete-comment]');
    if (commentButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmDeleteComment(commentButton);
      return;
    }

    const familyButton = event.target.closest('[data-delete-family]');
    if (familyButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmDeleteFamily(familyButton, false);
      return;
    }

    const adminFamilyButton = event.target.closest('[data-admin-delete-family]');
    if (adminFamilyButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmDeleteFamily(adminFamilyButton, true);
      return;
    }

    const accountButton = event.target.closest('.admin-account [data-action][data-user-id]');
    if (accountButton && !accountButton.disabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmAccountChange(accountButton);
    }
  }, true);
})();
