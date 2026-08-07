(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  const originalRecipeCard = recipeCard;
  const originalDetailTemplate = detailTemplate;
  const originalOpenRecipe = openRecipe;
  let currentRecipeId = null;
  let replyParentId = null;
  let currentAccount = null;
  let metadataLoaded = false;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function headers() {
    const current = session();
    return {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${current?.access_token || config.supabasePublishableKey}`,
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
    if (!response.ok) throw new Error(await responseMessage(response));
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function dateValue(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  function formatDate(value, withTime = false) {
    const date = dateValue(value);
    if (!date) return 'Fecha desconocida';
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric', month: 'short', year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    }).format(date);
  }

  function wasModified(recipe) {
    const created = dateValue(recipe.createdAt);
    const updated = dateValue(recipe.updatedAt);
    return Boolean(created && updated && updated.getTime() - created.getTime() > 60000);
  }

  function ownerLabel(recipe) {
    return recipe.ownerName || (recipe.storageMode === 'remote' ? 'Familiar' : 'Javi');
  }

  recipeCard = function communityRecipeCard(recipe) {
    const html = originalRecipeCard(recipe);
    const updated = recipe.updatedAt || recipe.createdAt;
    const meta = `<div class="recipe-provenance"><strong>Receta de ${escapeHtml(ownerLabel(recipe))}</strong><span>Actualizada ${escapeHtml(formatDate(updated))}</span></div>`;
    return html.replace('<div class="recipe-meta">', `${meta}<div class="recipe-meta">`);
  };

  detailTemplate = function communityDetailTemplate(recipe) {
    let html = originalDetailTemplate(recipe);
    const modified = wasModified(recipe)
      ? `<span>Modificada ${escapeHtml(formatDate(recipe.updatedAt, true))}</span>`
      : '<span>Sin modificaciones posteriores</span>';
    const provenance = `<div class="detail-provenance"><strong>Receta de ${escapeHtml(ownerLabel(recipe))}</strong><span>Creada ${escapeHtml(formatDate(recipe.createdAt, true))}</span>${modified}</div>`;
    html = html.replace('<div class="detail-content">', `<div class="detail-content">${provenance}`);

    if (recipe.storageMode === 'remote') {
      const comments = `<section class="comments-section" id="recipe-comments-section" data-comments-recipe="${escapeHtml(recipe.id)}">
        <div class="comments-heading"><div><span class="eyebrow">Conversación</span><h3>Comentarios</h3></div><span id="comments-count">—</span></div>
        <div class="comments-list" id="comments-list"><p class="comments-loading">Cargando comentarios…</p></div>
        <form class="comment-form" id="comment-form">
          <div class="comment-replying" id="comment-replying" hidden></div>
          <label class="field"><span>Escribe un comentario</span><textarea id="comment-body" rows="3" maxlength="1500" required placeholder="Comenta esta receta o responde a alguien…"></textarea></label>
          <div class="comment-form-actions"><button class="text-button" id="cancel-comment-reply" type="button" hidden>Cancelar respuesta</button><button class="button" type="submit">Publicar comentario</button></div>
          <p class="comment-status" id="comment-status" aria-live="polite"></p>
        </form>
      </section>`;
      html = html.replace('<div class="detail-actions">', `${comments}<div class="detail-actions">`);
    }
    return html;
  };

  openRecipe = function communityOpenRecipe(id, updateHash = true) {
    originalOpenRecipe(id, updateHash);
    currentRecipeId = id;
    replyParentId = null;
    const recipe = findRecipe(id);
    if (recipe?.storageMode === 'remote') setTimeout(() => loadComments(id), 0);
  };

  async function signedAvatar(path) {
    if (!path) return '';
    try {
      const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/recipe-avatars/${String(path).split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!response.ok) return '';
      const payload = await response.json();
      return payload.signedURL ? `${config.supabaseUrl}/storage/v1${payload.signedURL}` : '';
    } catch { return ''; }
  }

  async function loadCurrentAccount() {
    if (currentAccount) return currentAccount;
    const current = session();
    if (!current?.user?.id) return null;
    const rows = await rest(`recetario_accounts?id=eq.${encodeURIComponent(current.user.id)}&select=id,display_name,username,role&limit=1`);
    currentAccount = rows?.[0] || null;
    return currentAccount;
  }

  async function loadComments(recipeId) {
    const list = document.querySelector('#comments-list');
    const count = document.querySelector('#comments-count');
    if (!list || currentRecipeId !== recipeId) return;
    list.innerHTML = '<p class="comments-loading">Cargando comentarios…</p>';

    try {
      const comments = await rest(`recipe_comments?recipe_id=eq.${encodeURIComponent(recipeId)}&select=id,recipe_id,author_id,parent_id,body,created_at,updated_at&order=created_at.asc`);
      const authorIds = [...new Set((comments || []).map(comment => comment.author_id))];
      let accounts = [];
      if (authorIds.length) accounts = await rest(`recetario_accounts?id=in.(${authorIds.join(',')})&select=id,display_name,username,avatar_path`);
      const avatarPairs = await Promise.all((accounts || []).map(async account => [account.id, await signedAvatar(account.avatar_path)]));
      const avatarMap = new Map(avatarPairs);
      const accountMap = new Map((accounts || []).map(account => [account.id, account]));
      const me = await loadCurrentAccount();

      const children = new Map();
      (comments || []).forEach(comment => {
        const key = comment.parent_id || 'root';
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(comment);
      });

      function renderBranch(parentId = 'root', depth = 0) {
        return (children.get(parentId) || []).map(comment => {
          const account = accountMap.get(comment.author_id) || { display_name: 'Familiar', username: '' };
          const name = account.display_name || account.username || 'Familiar';
          const avatar = avatarMap.get(comment.author_id);
          const initial = escapeHtml(name.charAt(0).toUpperCase() || 'F');
          const canDelete = me && (me.role === 'admin' || me.id === comment.author_id);
          const edited = new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 60000;
          return `<article class="recipe-comment" data-comment-id="${escapeHtml(comment.id)}" style="--comment-depth:${Math.min(depth, 5)}">
            <div class="comment-avatar"><span>${initial}</span>${avatar ? `<img src="${escapeHtml(avatar)}" alt="" onerror="this.remove()">` : ''}</div>
            <div class="comment-content">
              <div class="comment-meta"><strong>${escapeHtml(name)}</strong>${account.username ? `<span>@${escapeHtml(account.username)}</span>` : ''}<time>${escapeHtml(formatDate(comment.created_at, true))}${edited ? ' · editado' : ''}</time></div>
              <p>${escapeHtml(comment.body).replace(/\n/g, '<br>')}</p>
              <div class="comment-actions"><button type="button" data-reply-comment="${escapeHtml(comment.id)}" data-reply-name="${escapeHtml(name)}">Responder</button>${canDelete ? `<button type="button" class="danger-text" data-delete-comment="${escapeHtml(comment.id)}">Eliminar</button>` : ''}</div>
              ${renderBranch(comment.id, depth + 1)}
            </div>
          </article>`;
        }).join('');
      }

      count.textContent = `${comments?.length || 0}`;
      list.innerHTML = comments?.length ? renderBranch() : '<div class="comments-empty">Todavía no hay comentarios. Puedes inaugurar la conversación.</div>';
    } catch (error) {
      list.innerHTML = `<div class="comments-empty comments-error">No se pudieron cargar los comentarios: ${escapeHtml(error.message)}</div>`;
      if (/recipe_comments|schema cache|PGRST/i.test(error.message)) list.innerHTML = '<div class="comments-empty comments-error">Falta ejecutar la actualización 007 del Recetario en Supabase.</div>';
    }
  }

  function setReply(commentId, name) {
    replyParentId = commentId;
    const box = document.querySelector('#comment-replying');
    const cancel = document.querySelector('#cancel-comment-reply');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = `Respondiendo a <strong>${escapeHtml(name)}</strong>`;
    if (cancel) cancel.hidden = false;
    document.querySelector('#comment-body')?.focus();
  }

  function clearReply() {
    replyParentId = null;
    const box = document.querySelector('#comment-replying');
    const cancel = document.querySelector('#cancel-comment-reply');
    if (box) box.hidden = true;
    if (cancel) cancel.hidden = true;
  }

  async function submitComment(form) {
    const current = session();
    if (!current?.user?.id || !currentRecipeId) return;
    const textarea = form.querySelector('#comment-body');
    const status = form.querySelector('#comment-status');
    const button = form.querySelector('[type="submit"]');
    const body = textarea.value.trim();
    if (!body) return;
    button.disabled = true;
    status.textContent = 'Publicando…';
    try {
      await rest('recipe_comments', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ recipe_id: currentRecipeId, author_id: current.user.id, parent_id: replyParentId || null, body })
      });
      textarea.value = '';
      clearReply();
      status.textContent = 'Comentario publicado.';
      await loadComments(currentRecipeId);
    } catch (error) {
      status.textContent = `No se pudo publicar: ${error.message}`;
    } finally { button.disabled = false; }
  }

  async function deleteComment(commentId) {
    if (!confirm('¿Eliminar este comentario y sus respuestas anidadas?')) return;
    try {
      await rest(`recipe_comments?id=eq.${encodeURIComponent(commentId)}`, { method: 'DELETE' });
      await loadComments(currentRecipeId);
    } catch (error) { showToast(`No se pudo eliminar el comentario: ${error.message}`); }
  }

  els.detail.addEventListener('submit', event => {
    const form = event.target.closest('#comment-form');
    if (!form) return;
    event.preventDefault();
    submitComment(form);
  });

  els.detail.addEventListener('click', event => {
    const reply = event.target.closest('[data-reply-comment]');
    if (reply) { setReply(reply.dataset.replyComment, reply.dataset.replyName); return; }
    const cancel = event.target.closest('#cancel-comment-reply');
    if (cancel) { clearReply(); return; }
    const remove = event.target.closest('[data-delete-comment]');
    if (remove) deleteComment(remove.dataset.deleteComment);
  });

  async function refreshMetadata() {
    if (metadataLoaded) return;
    const current = session();
    if (!current?.user?.id) return;
    try {
      const rows = await rest('recipes?select=id,owner_id,created_at,updated_at');
      const ids = [...new Set((rows || []).map(row => row.owner_id))];
      let accounts = [];
      if (ids.length) accounts = await rest(`recetario_accounts?id=in.(${ids.join(',')})&select=id,display_name,username`);
      const names = new Map((accounts || []).map(account => [account.id, account.display_name || account.username || 'Familiar']));
      const meta = new Map((rows || []).map(row => [row.id, row]));
      userRecipes = userRecipes.map(recipe => {
        const row = meta.get(recipe.id);
        if (!row) return recipe;
        return {
          ...recipe,
          ownerName: names.get(row.owner_id) || recipe.ownerName || 'Familiar',
          createdAt: row.created_at || recipe.createdAt,
          updatedAt: row.updated_at || row.created_at || recipe.createdAt
        };
      });
      seedRecipes.forEach(recipe => {
        recipe.ownerName ||= 'Javi';
        recipe.updatedAt ||= recipe.createdAt;
      });
      metadataLoaded = true;
      render();
    } catch { /* La UI conserva los datos ya disponibles. */ }
  }

  window.addEventListener('load', () => {
    setTimeout(refreshMetadata, 800);
    setTimeout(refreshMetadata, 2200);
  });
})();