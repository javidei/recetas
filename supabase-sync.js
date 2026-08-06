(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const LOCAL_MODE = 'local';
  const REMOTE_MODE = 'remote';
  const SEARCH_SEPARATOR = /[,;+\n]+/;

  const accountButton = document.querySelector('#account-button');
  const storageNote = document.querySelector('#storage-note');
  const imageFileInput = document.querySelector('#recipe-image-file');
  const visibilitySelect = document.querySelector('#recipe-visibility');
  const visibilityHelp = document.querySelector('#recipe-visibility-help');
  const activeTerms = document.querySelector('#active-search-terms');
  const quickFilters = document.querySelector('.quick-filters');

  let session = readSession();
  let remoteRecipes = [];
  let currentFamily = null;
  let familySchemaReady = true;
  let busy = false;

  const originalOpenForm = openForm;
  const originalDeleteRecipe = deleteRecipe;
  const originalRecipeCard = recipeCard;
  const originalDetailTemplate = detailTemplate;
  const originalRender = render;

  userRecipes = userRecipes.map(recipe => ({ ...recipe, storageMode: recipe.storageMode || LOCAL_MODE, canEdit: true }));

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function storeSession(value) {
    session = value;
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
    updateAccountUi();
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

  function baseHeaders(withAuth = true) {
    const headers = { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' };
    if (withAuth) headers.Authorization = `Bearer ${session?.access_token || config.supabasePublishableKey}`;
    return headers;
  }

  async function responseMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload.msg || payload.message || payload.error_description || payload.error || `Error ${response.status}`;
    } catch { return `Error ${response.status}`; }
  }

  async function ensureSession() {
    if (!session?.access_token) return null;
    if (Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 90) return session;
    if (!session.refresh_token) { await clearCloudState(); return null; }
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: baseHeaders(false), body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      storeSession(normalizeSession(await response.json()));
      return session;
    } catch {
      await clearCloudState();
      return null;
    }
  }

  async function restRequest(path, options = {}) {
    await ensureSession();
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...baseHeaders(true), ...(options.headers || {}) }
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

  function localOnlyRecipes() {
    return userRecipes.filter(recipe => recipe.storageMode !== REMOTE_MODE);
  }

  function persistLocalOnly() {
    const clean = localOnlyRecipes().map(({ storageMode, remoteOwnerId, coverImagePath, familyId, visibility, ownerName, canEdit, ...recipe }) => recipe);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  }

  function splitSearchTerms(value) {
    return [...new Set(String(value || '').split(SEARCH_SEPARATOR).map(term => normalizeText(term)).filter(Boolean))];
  }

  function renderSearchTerms() {
    if (!activeTerms) return;
    const terms = splitSearchTerms(els.search.value);
    activeTerms.hidden = terms.length === 0;
    activeTerms.innerHTML = terms.map(term => `<button type="button" data-remove-search-term="${escapeHtml(term)}" aria-label="Quitar ingrediente ${escapeHtml(term)}"><span>${escapeHtml(term)}</span><b aria-hidden="true">×</b></button>`).join('');
  }

  getFilteredRecipes = function enhancedGetFilteredRecipes() {
    const terms = splitSearchTerms(els.search.value);
    const category = els.category.value;
    const sort = els.sort.value;
    const recipes = allRecipes().filter(recipe => {
      const haystack = normalizeText([recipe.title, recipe.summary, recipe.categoryLabel, ...(recipe.ingredients || []), ...(recipe.tags || [])].join(' '));
      return (terms.length === 0 || terms.every(term => haystack.includes(term))) && (category === 'all' || recipe.category === category);
    });
    const sorters = {
      rating: (a, b) => Number(b.rating) - Number(a.rating),
      time: (a, b) => totalMinutes(a) - totalMinutes(b),
      newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      featured: (a, b) => (Number(favorites.has(b.id)) - Number(favorites.has(a.id))) || (Number(b.rating) - Number(a.rating))
    };
    return recipes.sort(sorters[sort] || sorters.featured);
  };

  recipeCard = function familyRecipeCard(recipe) {
    const html = originalRecipeCard(recipe);
    if (recipe.visibility !== 'family') return html;
    return html.replace(
      `<div class="recipe-kicker"><span>${escapeHtml(recipe.categoryLabel || categoryLabel(recipe.category))}</span>`,
      `<div class="recipe-kicker"><span>${escapeHtml(recipe.categoryLabel || categoryLabel(recipe.category))} · <b class="family-label">Familia</b></span>`
    );
  };

  detailTemplate = function familyDetailTemplate(recipe) {
    let html = originalDetailTemplate(recipe);
    if (recipe.canEdit === false) {
      html = html.replace(/<button class="button button--soft" type="button" data-edit-recipe[\s\S]*?<\/button><button class="button button--danger"[\s\S]*?<\/button>/, '');
    }
    const sharing = recipe.visibility === 'family'
      ? `<div class="shared-recipe-note"><strong>Receta familiar</strong><span>${recipe.ownerName ? `Compartida por ${escapeHtml(recipe.ownerName)}` : 'Compartida con tu familia'}</span></div>`
      : '';
    return html.replace('<div class="detail-content">', `<div class="detail-content">${sharing}`);
  };

  render = function enhancedRender() {
    originalRender();
    renderSearchTerms();
  };

  function appendSearchIngredient(value) {
    const terms = splitSearchTerms(els.search.value);
    const normalized = normalizeText(value);
    if (!terms.includes(normalized)) terms.push(normalized);
    els.search.value = terms.join(', ');
    render();
    els.search.focus();
  }

  quickFilters?.addEventListener('click', event => {
    const button = event.target.closest('[data-search-chip]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    appendSearchIngredient(button.dataset.searchChip);
  }, true);

  activeTerms?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-search-term]');
    if (!button) return;
    const removed = normalizeText(button.dataset.removeSearchTerm);
    els.search.value = splitSearchTerms(els.search.value).filter(term => term !== removed).join(', ');
    render();
    els.search.focus();
  });

  function updateAccountUi() {
    const logged = Boolean(session?.user?.id);
    if (accountButton) {
      accountButton.textContent = logged ? 'Mi cuenta' : 'Acceder';
      accountButton.title = logged && session.user.email ? `Cuenta: ${session.user.email}` : '';
      accountButton.classList.toggle('is-logged-in', logged);
    }
    if (storageNote) {
      storageNote.innerHTML = logged
        ? currentFamily
          ? '<strong>Guardado en la nube.</strong> Elige si esta receta será privada o visible para tu familia.'
          : '<strong>Guardado en la nube.</strong> Crea o únete a una familia desde Mi cuenta para compartir recetas.'
        : '<strong>Guardado local.</strong> Accede a tu cuenta para sincronizar y compartir recetas.';
    }
    if (imageFileInput) imageFileInput.disabled = !logged;
    updateVisibilityControl();
  }

  function updateVisibilityControl(recipe = null) {
    if (!visibilitySelect) return;
    const familyOption = visibilitySelect.querySelector('option[value="family"]');
    const enabled = Boolean(session?.user?.id && currentFamily?.id && familySchemaReady);
    if (familyOption) familyOption.disabled = !enabled;
    if (!enabled && visibilitySelect.value === 'family') visibilitySelect.value = 'private';
    if (recipe) visibilitySelect.value = recipe.visibility === 'family' && enabled ? 'family' : 'private';
    if (visibilityHelp) visibilityHelp.textContent = enabled
      ? `Las recetas familiares serán visibles para ${currentFamily.name}.`
      : 'Crea o únete a una familia desde Mi cuenta.';
  }

  async function clearCloudState() {
    storeSession(null);
    currentFamily = null;
    remoteRecipes = [];
    userRecipes = readJson(STORAGE_KEY, []).map(recipe => ({ ...recipe, storageMode: LOCAL_MODE, canEdit: true }));
    updateAccountUi();
    render();
  }

  async function loadCurrentFamily() {
    currentFamily = null;
    familySchemaReady = true;
    if (!session?.user?.id) return;
    try {
      const memberships = await restRequest(`recipe_family_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=family_id,role&limit=1`);
      const membership = memberships?.[0];
      if (!membership) return;
      const rows = await restRequest(`recipe_families?id=eq.${encodeURIComponent(membership.family_id)}&select=id,name&limit=1`);
      if (rows?.[0]) currentFamily = { ...rows[0], role: membership.role };
    } catch (error) {
      if (error.status === 404 || /recipe_famil/i.test(error.message)) familySchemaReady = false;
      else console.warn('No se pudo leer la familia:', error);
    }
    updateAccountUi();
  }

  function encodeObjectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  async function signedImageUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    try {
      const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/recipe-images/${encodeObjectPath(path)}`, {
        method: 'POST', headers: baseHeaders(true), body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json();
      return payload.signedURL ? `${config.supabaseUrl}/storage/v1${payload.signedURL}` : '';
    } catch { return ''; }
  }

  async function mapRemoteRecipe(row, names, ingredients = row.recipe_ingredients || [], steps = row.recipe_steps || []) {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary || '',
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      difficulty: row.difficulty,
      servings: Number(row.servings || 1),
      prepMinutes: Number(row.prep_minutes || 0),
      cookMinutes: Number(row.cook_minutes || 0),
      rating: Number(row.rating || 0),
      emoji: row.emoji || '🍲',
      imageUrl: await signedImageUrl(row.cover_image_path),
      coverImagePath: row.cover_image_path || '',
      ingredients: [...ingredients].sort((a, b) => Number(a.position) - Number(b.position)).map(item => item.ingredient_text),
      steps: [...steps].sort((a, b) => Number(a.position) - Number(b.position)).map(item => item.instruction),
      notes: row.notes || '',
      tags: row.tags || [],
      color: '#dcc0a7',
      createdAt: String(row.created_at || '').slice(0, 10),
      userCreated: true,
      storageMode: REMOTE_MODE,
      remoteOwnerId: row.owner_id,
      ownerName: names.get(row.owner_id) || (row.owner_id === session.user.id ? session.user.email?.split('@')[0] : ''),
      visibility: row.visibility || (row.is_public ? 'public' : 'private'),
      familyId: row.family_id || null,
      canEdit: row.owner_id === session.user.id
    };
  }

  async function loadOwnerNames(rows) {
    const names = new Map();
    if (!familySchemaReady) return names;
    const ids = [...new Set(rows.map(row => row.owner_id).filter(Boolean))];
    if (!ids.length) return names;
    try {
      const profiles = await restRequest(`profiles?id=in.(${ids.join(',')})&select=id,display_name`);
      (profiles || []).forEach(item => names.set(item.id, item.display_name));
    } catch { /* Los nombres son opcionales. */ }
    return names;
  }

  async function loadRemoteRecipes() {
    const active = await ensureSession();
    if (!active?.user?.id) return;
    try {
      document.body.dataset.cloudLoading = 'true';
      await loadCurrentFamily();
      const select = '*,recipe_ingredients(id,position,ingredient_text),recipe_steps(id,position,instruction)';
      const filter = familySchemaReady ? '' : `owner_id=eq.${encodeURIComponent(active.user.id)}&`;
      const rows = await restRequest(`recipes?${filter}select=${select}&order=created_at.desc`);
      const names = await loadOwnerNames(rows || []);
      remoteRecipes = await Promise.all((rows || []).map(row => mapRemoteRecipe(row, names)));
      const locals = readJson(STORAGE_KEY, []).map(recipe => ({ ...recipe, storageMode: LOCAL_MODE, canEdit: true }));
      userRecipes = [...remoteRecipes, ...locals];
      render();
    } catch (error) {
      console.error(error);
      showToast(`No se pudieron cargar las recetas: ${error.message}`);
    } finally { delete document.body.dataset.cloudLoading; }
  }

  function recipePayload(recipe, coverImagePath) {
    const payload = {
      owner_id: session.user.id,
      title: recipe.title,
      summary: recipe.summary || '',
      category: recipe.category,
      difficulty: recipe.difficulty || 'Fácil',
      servings: Number(recipe.servings || 1),
      prep_minutes: Number(recipe.prepMinutes || 0),
      cook_minutes: Number(recipe.cookMinutes || 0),
      rating: Number(recipe.rating || 0),
      emoji: recipe.emoji || '🍲',
      cover_image_path: coverImagePath || null,
      notes: recipe.notes || '',
      tags: recipe.tags || [],
      is_public: false
    };
    if (familySchemaReady) {
      const share = recipe.visibility === 'family' && currentFamily?.id;
      payload.visibility = share ? 'family' : 'private';
      payload.family_id = share ? currentFamily.id : null;
    }
    return payload;
  }

  function safeFileName(name) {
    const extension = String(name).split('.').pop()?.toLowerCase() || 'jpg';
    const base = slugify(String(name).replace(/\.[^.]+$/, '')) || 'foto';
    return `${base}.${extension.replace(/[^a-z0-9]/g, '') || 'jpg'}`;
  }

  async function uploadImage(file, recipeId) {
    if (!file || !session?.user?.id) return '';
    if (file.size > 5 * 1024 * 1024) throw new Error('La foto supera el límite de 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen JPG, PNG o WEBP.');
    const path = `${session.user.id}/${recipeId}/${Date.now()}-${safeFileName(file.name)}`;
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/recipe-images/${encodeObjectPath(path)}`, {
      method: 'POST',
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': file.type, 'x-upsert': 'true' },
      body: file
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    return path;
  }

  async function removeImage(path) {
    if (!path || /^https?:\/\//i.test(path) || !session?.access_token) return;
    try {
      await fetch(`${config.supabaseUrl}/storage/v1/object/recipe-images/${encodeObjectPath(path)}`, {
        method: 'DELETE', headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` }
      });
    } catch { /* La receta puede eliminarse aunque falle la imagen. */ }
  }

  async function replaceChildren(recipeId, recipe) {
    await restRequest(`recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });
    await restRequest(`recipe_steps?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });
    if (recipe.ingredients.length) await restRequest('recipe_ingredients', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(recipe.ingredients.map((ingredient_text, position) => ({ recipe_id: recipeId, position, ingredient_text })))
    });
    if (recipe.steps.length) await restRequest('recipe_steps', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(recipe.steps.map((instruction, position) => ({ recipe_id: recipeId, position, instruction })))
    });
  }

  async function saveRemoteRecipe(recipe, existing = null, file = null) {
    if (!session?.user?.id) throw new Error('Accede a tu cuenta para guardar en Supabase.');
    let coverImagePath = existing?.coverImagePath || '';
    const externalUrl = String(recipe.imageUrl || '').trim();
    if (externalUrl && externalUrl !== existing?.imageUrl) coverImagePath = externalUrl;
    const ownerFilter = `owner_id=eq.${encodeURIComponent(session.user.id)}`;
    let rows;
    if (existing?.storageMode === REMOTE_MODE) {
      rows = await restRequest(`recipes?id=eq.${encodeURIComponent(existing.id)}&${ownerFilter}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(recipePayload(recipe, coverImagePath))
      });
    } else {
      rows = await restRequest('recipes', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(recipePayload(recipe, coverImagePath))
      });
    }
    let row = rows?.[0];
    if (!row?.id) throw new Error('Supabase no devolvió el identificador de la receta.');
    if (file?.size) {
      const previous = coverImagePath;
      coverImagePath = await uploadImage(file, row.id);
      const updated = await restRequest(`recipes?id=eq.${encodeURIComponent(row.id)}&${ownerFilter}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ cover_image_path: coverImagePath })
      });
      row = updated?.[0] || { ...row, cover_image_path: coverImagePath };
      if (previous && previous !== coverImagePath) await removeImage(previous);
    }
    await replaceChildren(row.id, recipe);
    row.cover_image_path = coverImagePath || row.cover_image_path;
    const names = new Map([[session.user.id, session.user.email?.split('@')[0] || 'Yo']]);
    return mapRemoteRecipe(row, names,
      recipe.ingredients.map((ingredient_text, position) => ({ ingredient_text, position })),
      recipe.steps.map((instruction, position) => ({ instruction, position }))
    );
  }

  openForm = function enhancedOpenForm(recipe = null) {
    originalOpenForm(recipe);
    if (imageFileInput) imageFileInput.value = '';
    updateVisibilityControl(recipe);
    if (recipe?.storageMode === REMOTE_MODE && recipe.coverImagePath && !/^https?:\/\//i.test(recipe.coverImagePath)) {
      document.querySelector('#recipe-image').value = '';
    }
  };

  els.form.addEventListener('submit', async event => {
    if (!session?.user?.id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy || !els.form.reportValidity()) return;
    busy = true;
    const submit = els.form.querySelector('[type="submit"]');
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Guardando…';
    try {
      const recipe = formToRecipe(els.form);
      recipe.visibility = visibilitySelect?.value === 'family' ? 'family' : 'private';
      const existing = userRecipes.find(item => item.id === recipe.id) || null;
      if (existing?.canEdit === false) throw new Error('Solo la persona que creó esta receta puede editarla.');
      const remote = await saveRemoteRecipe(recipe, existing, imageFileInput?.files?.[0] || null);
      userRecipes = [remote, ...userRecipes.filter(item => item.id !== recipe.id && item.id !== remote.id)];
      remoteRecipes = [remote, ...remoteRecipes.filter(item => item.id !== remote.id)];
      if (existing?.storageMode !== REMOTE_MODE) {
        const remaining = localOnlyRecipes().filter(item => item.id !== existing?.id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining.map(({ storageMode, canEdit, ...item }) => item)));
      }
      closeForm();
      render();
      showToast(existing ? 'Receta actualizada' : recipe.visibility === 'family' ? 'Receta guardada y compartida con tu familia' : 'Receta guardada en tu cuenta');
      setTimeout(() => openRecipe(remote.id), 50);
    } catch (error) {
      showToast(`No se pudo guardar: ${error.message}`);
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = label;
    }
  }, true);

  deleteRecipe = async function enhancedDeleteRecipe(id) {
    const recipe = userRecipes.find(item => item.id === id);
    if (recipe?.storageMode !== REMOTE_MODE) {
      originalDeleteRecipe(id);
      return;
    }
    if (recipe.canEdit === false) { showToast('Solo la persona que creó esta receta puede eliminarla'); return; }
    if (!confirm(`¿Eliminar la receta “${recipe.title}” de tu cuenta?`)) return;
    try {
      await restRequest(`recipes?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, { method: 'DELETE' });
      await removeImage(recipe.coverImagePath);
      userRecipes = userRecipes.filter(item => item.id !== id);
      remoteRecipes = remoteRecipes.filter(item => item.id !== id);
      favorites.delete(id);
      saveFavorites();
      closeRecipe();
      render();
      showToast('Receta eliminada');
    } catch (error) { showToast(`No se pudo eliminar: ${error.message}`); }
  };

  function exportAllRecipes() {
    const payload = {
      app: 'Recetario de Javi', version: config.version, exportedAt: new Date().toISOString(),
      recipes: userRecipes.map(({ storageMode, remoteOwnerId, coverImagePath, canEdit, ...recipe }) => recipe)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mis-recetas-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Copia exportada');
  }

  document.querySelector('#export-button')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    exportAllRecipes();
  }, true);

  window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY) {
      session = readSession();
      updateAccountUi();
      if (session?.user?.id) loadRemoteRecipes(); else clearCloudState();
    }
  });
  window.addEventListener('online', () => { if (session?.user?.id) loadRemoteRecipes(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js?v=0.3.0', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {}));
  }

  updateAccountUi();
  render();
  if (session?.user?.id) loadRemoteRecipes();
})();
