(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
    console.warn('Recetario: falta la configuración pública de Supabase.');
    return;
  }

  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const LOCAL_MODE = 'local';
  const REMOTE_MODE = 'remote';
  const SEARCH_SEPARATOR = /[,;+\n]+/;

  const authDialog = document.querySelector('#auth-dialog');
  const authForm = document.querySelector('#auth-form');
  const authEmail = document.querySelector('#auth-email');
  const authPassword = document.querySelector('#auth-password');
  const authMessage = document.querySelector('#auth-message');
  const authButton = document.querySelector('#auth-button');
  const logoutButton = document.querySelector('#logout-button');
  const registerButton = document.querySelector('#auth-register-button');
  const syncLocalButton = document.querySelector('#sync-local-button');
  const storageNote = document.querySelector('#storage-note');
  const imageFileInput = document.querySelector('#recipe-image-file');
  const activeTerms = document.querySelector('#active-search-terms');
  const quickFilters = document.querySelector('.quick-filters');

  let session = readSession();
  let remoteRecipes = [];
  let busy = false;

  const originalOpenForm = openForm;
  const originalDeleteRecipe = deleteRecipe;

  userRecipes = userRecipes.map(recipe => ({ ...recipe, storageMode: recipe.storageMode || LOCAL_MODE }));

  function readSession() {
    try {
      const value = localStorage.getItem(SESSION_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function storeSession(nextSession) {
    session = nextSession;
    if (nextSession) localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    else localStorage.removeItem(SESSION_KEY);
    updateAuthUi();
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
    const stillValid = Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 90;
    if (stillValid) return session;
    if (!session.refresh_token) {
      await clearCloudState();
      return null;
    }

    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: baseHeaders(false),
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const refreshed = normalizeSession(await response.json());
      storeSession(refreshed);
      return refreshed;
    } catch (error) {
      console.warn('No se pudo renovar la sesión:', error);
      await clearCloudState();
      return null;
    }
  }

  function baseHeaders(withAuth = true) {
    const headers = {
      apikey: config.supabasePublishableKey,
      'Content-Type': 'application/json'
    };
    if (withAuth) headers.Authorization = `Bearer ${session?.access_token || config.supabasePublishableKey}`;
    return headers;
  }

  async function responseMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload.msg || payload.message || payload.error_description || payload.error || `Error ${response.status}`;
    } catch {
      return `Error ${response.status}`;
    }
  }

  async function restRequest(path, options = {}) {
    await ensureSession();
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        ...baseHeaders(true),
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function localOnlyRecipes() {
    return userRecipes.filter(recipe => recipe.storageMode !== REMOTE_MODE);
  }

  function persistLocalOnly() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localOnlyRecipes().map(({ storageMode, remoteOwnerId, coverImagePath, ...recipe }) => recipe)));
  }

  function splitSearchTerms(value) {
    return [...new Set(String(value || '')
      .split(SEARCH_SEPARATOR)
      .map(term => normalizeText(term))
      .filter(Boolean))];
  }

  function renderSearchTerms() {
    if (!activeTerms) return;
    const terms = splitSearchTerms(els.search.value);
    activeTerms.hidden = terms.length === 0;
    activeTerms.innerHTML = terms.map(term => `
      <button type="button" data-remove-search-term="${escapeHtml(term)}" aria-label="Quitar ingrediente ${escapeHtml(term)}">
        <span>${escapeHtml(term)}</span><b aria-hidden="true">×</b>
      </button>`).join('');
  }

  getFilteredRecipes = function enhancedGetFilteredRecipes() {
    const terms = splitSearchTerms(els.search.value);
    const category = els.category.value;
    const sort = els.sort.value;

    const recipes = allRecipes().filter(recipe => {
      const haystack = normalizeText([
        recipe.title,
        recipe.summary,
        recipe.categoryLabel,
        ...(recipe.ingredients || []),
        ...(recipe.tags || [])
      ].join(' '));
      const matchesEveryTerm = terms.length === 0 || terms.every(term => haystack.includes(term));
      return matchesEveryTerm && (category === 'all' || recipe.category === category);
    });

    const sorters = {
      rating: (a, b) => Number(b.rating) - Number(a.rating),
      time: (a, b) => totalMinutes(a) - totalMinutes(b),
      newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      featured: (a, b) => (Number(favorites.has(b.id)) - Number(favorites.has(a.id))) || (Number(b.rating) - Number(a.rating))
    };
    return recipes.sort(sorters[sort] || sorters.featured);
  };

  const originalRender = render;
  render = function enhancedRender() {
    originalRender();
    renderSearchTerms();
    updateSyncButton();
  };

  function appendSearchIngredient(ingredient) {
    const terms = splitSearchTerms(els.search.value);
    const normalized = normalizeText(ingredient);
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

  els.search.addEventListener('input', renderSearchTerms);
  document.querySelector('#clear-filters-button')?.addEventListener('click', renderSearchTerms);

  activeTerms?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-search-term]');
    if (!button) return;
    const removed = normalizeText(button.dataset.removeSearchTerm);
    els.search.value = splitSearchTerms(els.search.value).filter(term => term !== removed).join(', ');
    render();
    els.search.focus();
  });

  function updateAuthUi() {
    const loggedIn = Boolean(session?.user?.id);
    const email = session?.user?.email || '';
    if (authButton) {
      authButton.hidden = loggedIn;
      authButton.textContent = 'Acceder';
    }
    if (logoutButton) {
      logoutButton.hidden = !loggedIn;
      logoutButton.textContent = email ? `Salir · ${email.split('@')[0]}` : 'Cerrar sesión';
      logoutButton.title = email ? `Sesión iniciada como ${email}` : '';
    }
    if (storageNote) {
      storageNote.innerHTML = loggedIn
        ? '<strong>Guardado en la nube activo.</strong> Las nuevas recetas y cambios se sincronizan con Supabase. Las fotos se almacenan de forma privada.'
        : '<strong>Guardado local.</strong> Inicia sesión para guardar recetas y fotos en Supabase y tenerlas disponibles en otros dispositivos.';
    }
    if (imageFileInput) imageFileInput.disabled = !loggedIn;
    updateSyncButton();
  }

  function updateSyncButton() {
    if (!syncLocalButton) return;
    const count = localOnlyRecipes().length;
    syncLocalButton.hidden = !session?.user?.id || count === 0;
    syncLocalButton.textContent = count === 1 ? 'Subir 1 receta local' : `Subir ${count} recetas locales`;
  }

  function setAuthMessage(message, isError = false) {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.dataset.error = String(isError);
  }

  async function authenticate(mode) {
    if (busy || !authForm?.reportValidity()) return;
    busy = true;
    setAuthMessage(mode === 'signup' ? 'Creando cuenta…' : 'Iniciando sesión…');
    const endpoint = mode === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';

    try {
      const response = await fetch(`${config.supabaseUrl}${endpoint}`, {
        method: 'POST',
        headers: baseHeaders(false),
        body: JSON.stringify({ email: authEmail.value.trim(), password: authPassword.value })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json();
      const nextSession = normalizeSession(payload);
      if (!nextSession) {
        setAuthMessage('Cuenta creada. Revisa tu correo para confirmar el acceso antes de iniciar sesión.');
        return;
      }
      storeSession(nextSession);
      authDialog.close();
      authForm.reset();
      showToast('Sesión iniciada. Cargando tus recetas…');
      await loadRemoteRecipes();
    } catch (error) {
      setAuthMessage(error.message || 'No se pudo completar el acceso.', true);
    } finally {
      busy = false;
    }
  }

  async function logout() {
    if (busy) return;
    busy = true;
    try {
      if (session?.access_token) {
        await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: baseHeaders(true)
        });
      }
    } catch {
      // La sesión local se elimina aunque Supabase no responda.
    } finally {
      await clearCloudState();
      busy = false;
      showToast('Sesión cerrada. Se muestran las recetas guardadas en este navegador.');
    }
  }

  async function clearCloudState() {
    storeSession(null);
    remoteRecipes = [];
    const locals = readJson(STORAGE_KEY, []).map(recipe => ({ ...recipe, storageMode: LOCAL_MODE }));
    userRecipes = locals;
    render();
  }

  function encodeObjectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  async function signedImageUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    try {
      await ensureSession();
      const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/recipe-images/${encodeObjectPath(path)}`, {
        method: 'POST',
        headers: baseHeaders(true),
        body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json();
      if (!payload.signedURL) return '';
      return `${config.supabaseUrl}/storage/v1${payload.signedURL}`;
    } catch (error) {
      console.warn('No se pudo firmar la imagen:', error);
      return '';
    }
  }

  async function mapRemoteRecipe(row, ingredients = row.recipe_ingredients || [], steps = row.recipe_steps || []) {
    const imageUrl = await signedImageUrl(row.cover_image_path);
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
      imageUrl,
      coverImagePath: row.cover_image_path || '',
      ingredients: [...ingredients].sort((a, b) => Number(a.position) - Number(b.position)).map(item => item.ingredient_text),
      steps: [...steps].sort((a, b) => Number(a.position) - Number(b.position)).map(item => item.instruction),
      notes: row.notes || '',
      tags: row.tags || [],
      color: '#dcc0a7',
      createdAt: String(row.created_at || '').slice(0, 10),
      userCreated: true,
      storageMode: REMOTE_MODE,
      remoteOwnerId: row.owner_id
    };
  }

  async function loadRemoteRecipes() {
    const activeSession = await ensureSession();
    if (!activeSession?.user?.id) return;

    try {
      document.body.dataset.cloudLoading = 'true';
      const owner = encodeURIComponent(activeSession.user.id);
      const rows = await restRequest(`recipes?owner_id=eq.${owner}&select=*,recipe_ingredients(id,position,ingredient_text),recipe_steps(id,position,instruction)&order=created_at.desc`);
      remoteRecipes = await Promise.all((rows || []).map(row => mapRemoteRecipe(row)));
      const locals = readJson(STORAGE_KEY, []).map(recipe => ({ ...recipe, storageMode: LOCAL_MODE }));
      userRecipes = [...remoteRecipes, ...locals];
      render();
      showToast(remoteRecipes.length ? `${remoteRecipes.length} recetas cargadas desde Supabase` : 'Supabase conectado. Aún no tienes recetas guardadas en la nube.');
    } catch (error) {
      console.error(error);
      showToast(`No se pudieron cargar las recetas: ${error.message}`);
    } finally {
      delete document.body.dataset.cloudLoading;
    }
  }

  function recipePayload(recipe, coverImagePath) {
    return {
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
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': file.type,
        'x-upsert': 'true'
      },
      body: file
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    return path;
  }

  async function removeImage(path) {
    if (!path || /^https?:\/\//i.test(path) || !session?.access_token) return;
    try {
      await fetch(`${config.supabaseUrl}/storage/v1/object/recipe-images/${encodeObjectPath(path)}`, {
        method: 'DELETE',
        headers: {
          apikey: config.supabasePublishableKey,
          Authorization: `Bearer ${session.access_token}`
        }
      });
    } catch {
      // La receta puede eliminarse aunque falle la limpieza del archivo.
    }
  }

  async function replaceRecipeChildren(recipeId, recipe) {
    await restRequest(`recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });
    await restRequest(`recipe_steps?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });

    if (recipe.ingredients.length) {
      await restRequest('recipe_ingredients', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(recipe.ingredients.map((ingredient, position) => ({
          recipe_id: recipeId,
          position,
          ingredient_text: ingredient
        })))
      });
    }

    if (recipe.steps.length) {
      await restRequest('recipe_steps', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(recipe.steps.map((instruction, position) => ({
          recipe_id: recipeId,
          position,
          instruction
        })))
      });
    }
  }

  async function saveRemoteRecipe(recipe, existing = null, file = null) {
    await ensureSession();
    if (!session?.user?.id) throw new Error('Inicia sesión para guardar en Supabase.');

    let row;
    let coverImagePath = existing?.coverImagePath || '';
    const externalUrl = String(recipe.imageUrl || '').trim();
    if (externalUrl && (!existing?.imageUrl || externalUrl !== existing.imageUrl)) coverImagePath = externalUrl;

    if (existing?.storageMode === REMOTE_MODE) {
      const [updated] = await restRequest(`recipes?id=eq.${encodeURIComponent(existing.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(recipePayload(recipe, coverImagePath))
      });
      row = updated;
    } else {
      const [inserted] = await restRequest('recipes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(recipePayload(recipe, coverImagePath))
      });
      row = inserted;
    }

    if (!row?.id) throw new Error('Supabase no devolvió el identificador de la receta.');

    if (file?.size) {
      const previousPath = coverImagePath;
      coverImagePath = await uploadImage(file, row.id);
      const [updatedWithImage] = await restRequest(`recipes?id=eq.${encodeURIComponent(row.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cover_image_path: coverImagePath })
      });
      row = updatedWithImage || { ...row, cover_image_path: coverImagePath };
      if (previousPath && previousPath !== coverImagePath) await removeImage(previousPath);
    }

    await replaceRecipeChildren(row.id, recipe);
    row.cover_image_path = coverImagePath || row.cover_image_path;
    return mapRemoteRecipe(
      row,
      recipe.ingredients.map((ingredient_text, position) => ({ ingredient_text, position })),
      recipe.steps.map((instruction, position) => ({ instruction, position }))
    );
  }

  openForm = function enhancedOpenForm(recipe = null) {
    originalOpenForm(recipe);
    if (imageFileInput) imageFileInput.value = '';
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
    const submitButton = els.form.querySelector('[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Guardando…';

    try {
      const recipe = formToRecipe(els.form);
      const existing = userRecipes.find(item => item.id === recipe.id) || null;
      const remote = await saveRemoteRecipe(recipe, existing, imageFileInput?.files?.[0] || null);
      userRecipes = [remote, ...userRecipes.filter(item => item.id !== recipe.id && item.id !== remote.id)];
      remoteRecipes = [remote, ...remoteRecipes.filter(item => item.id !== remote.id)];
      if (existing?.storageMode !== REMOTE_MODE) {
        const remainingLocals = localOnlyRecipes().filter(item => item.id !== existing?.id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingLocals.map(({ storageMode, ...item }) => item)));
      }
      closeForm();
      render();
      showToast(existing ? 'Receta actualizada en Supabase' : 'Receta guardada en Supabase');
      setTimeout(() => openRecipe(remote.id), 50);
    } catch (error) {
      console.error(error);
      showToast(`No se pudo guardar: ${error.message}`);
    } finally {
      busy = false;
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }, true);

  deleteRecipe = async function enhancedDeleteRecipe(id) {
    const recipe = userRecipes.find(item => item.id === id);
    if (recipe?.storageMode !== REMOTE_MODE) {
      if (!session?.user?.id) {
        originalDeleteRecipe(id);
        return;
      }
      if (!recipe || !confirm(`¿Eliminar la receta local “${recipe.title}”?`)) return;
      userRecipes = userRecipes.filter(item => item.id !== id);
      favorites.delete(id);
      persistLocalOnly();
      saveFavorites();
      closeRecipe();
      render();
      showToast('Receta local eliminada');
      return;
    }
    if (!confirm(`¿Eliminar la receta “${recipe.title}” de Supabase?`)) return;

    try {
      await restRequest(`recipes?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, { method: 'DELETE' });
      await removeImage(recipe.coverImagePath);
      userRecipes = userRecipes.filter(item => item.id !== id);
      remoteRecipes = remoteRecipes.filter(item => item.id !== id);
      favorites.delete(id);
      saveFavorites();
      closeRecipe();
      render();
      showToast('Receta eliminada de Supabase');
    } catch (error) {
      showToast(`No se pudo eliminar: ${error.message}`);
    }
  };

  function exportAllRecipes() {
    const payload = {
      app: 'Recetario de Javi',
      version: config.version,
      exportedAt: new Date().toISOString(),
      authenticatedUser: session?.user?.email || null,
      recipes: userRecipes.map(({ storageMode, remoteOwnerId, coverImagePath, ...recipe }) => recipe)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mis-recetas-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(userRecipes.length ? 'Recetas exportadas' : 'Se exportó una copia vacía');
  }

  document.querySelector('#export-button')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    exportAllRecipes();
  }, true);

  async function syncLocalRecipes() {
    const locals = localOnlyRecipes();
    if (!locals.length || busy) return;
    if (!confirm(`Se subirán ${locals.length} recetas locales a Supabase. ¿Continuar?`)) return;

    busy = true;
    syncLocalButton.disabled = true;
    const failed = [];
    try {
      for (let index = 0; index < locals.length; index += 1) {
        syncLocalButton.textContent = `Subiendo ${index + 1}/${locals.length}…`;
        try {
          await saveRemoteRecipe(locals[index]);
        } catch (error) {
          console.error(error);
          failed.push(locals[index]);
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(failed.map(({ storageMode, ...recipe }) => recipe)));
      await loadRemoteRecipes();
      showToast(failed.length ? `${locals.length - failed.length} recetas subidas; ${failed.length} no pudieron migrarse` : 'Todas las recetas locales están ya en Supabase');
    } finally {
      busy = false;
      syncLocalButton.disabled = false;
      updateSyncButton();
    }
  }

  authButton?.addEventListener('click', () => {
    setAuthMessage('Usa la cuenta de tu proyecto Supabase.');
    authDialog.showModal();
    setTimeout(() => authEmail.focus(), 30);
  });
  logoutButton?.addEventListener('click', logout);
  syncLocalButton?.addEventListener('click', syncLocalRecipes);
  authForm?.addEventListener('submit', event => { event.preventDefault(); authenticate('login'); });
  registerButton?.addEventListener('click', () => authenticate('signup'));
  document.querySelectorAll('[data-close-auth]').forEach(button => button.addEventListener('click', () => authDialog.close()));
  authDialog?.addEventListener('click', event => { if (event.target === authDialog) authDialog.close(); });
  authDialog?.addEventListener('cancel', event => { event.preventDefault(); authDialog.close(); });

  window.addEventListener('online', () => {
    if (session?.user?.id) loadRemoteRecipes();
  });

  updateAuthUi();
  render();
  if (session?.user?.id) loadRemoteRecipes();
})();
