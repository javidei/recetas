(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const LOCAL_STORAGE_KEY = 'recetario-javi-recipes-v1';
  const REMOTE_MODE = 'remote';
  const form = document.querySelector('#recipe-form');
  const formDialog = document.querySelector('#form-dialog');
  const imageFileInput = document.querySelector('#recipe-image-file');
  const visibilitySelect = document.querySelector('#recipe-visibility');

  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !form || !formDialog) return;

  let busy = false;
  let lastSavedRecipe = null;
  let lastFamily = null;

  const emojiGroups = [
    ['Platos y cocina', [
      ['🍲','Guiso / sopa'], ['🥘','Paella / sartén'], ['🍛','Arroz con salsa'], ['🍝','Pasta'], ['🍜','Fideos / ramen'],
      ['🍚','Arroz'], ['🍳','Sartén / huevo'], ['🥗','Ensalada'], ['🥙','Pita'], ['🌮','Taco'], ['🌯','Burrito'],
      ['🥪','Sándwich'], ['🍕','Pizza'], ['🍔','Hamburguesa'], ['🌭','Perrito caliente'], ['🥟','Empanadilla']
    ]],
    ['Carnes y pescado', [
      ['🍗','Pollo'], ['🥩','Carne'], ['🍖','Carne asada'], ['🥓','Bacon'], ['🐟','Pescado'], ['🍤','Gamba / frito'],
      ['🦐','Marisco'], ['🦑','Calamar'], ['🦀','Cangrejo'], ['🦪','Marisco']
    ]],
    ['Verduras e ingredientes', [
      ['🥔','Patata'], ['🥕','Zanahoria'], ['🌽','Maíz'], ['🥦','Brócoli'], ['🥬','Verdura de hoja'], ['🥒','Pepino'],
      ['🍅','Tomate'], ['🧅','Cebolla'], ['🧄','Ajo'], ['🫘','Legumbres'], ['🍄','Setas'], ['🫑','Pimiento'], ['🌶️','Picante'],
      ['🥑','Aguacate'], ['🫒','Aceituna'], ['🧀','Queso'], ['🥚','Huevo'], ['🧂','Condimento'], ['🍯','Miel']
    ]],
    ['Pan y desayuno', [
      ['🍞','Pan'], ['🥖','Barra de pan'], ['🥐','Croissant'], ['🥯','Bagel'], ['🧇','Gofre'], ['🥞','Tortitas'],
      ['🥣','Bol / desayuno'], ['🥛','Leche']
    ]],
    ['Postres y dulces', [
      ['🍰','Tarta'], ['🎂','Tarta de celebración'], ['🧁','Cupcake'], ['🥧','Pastel'], ['🍪','Galleta'], ['🍩','Donut'],
      ['🍫','Chocolate'], ['🍮','Flan'], ['🍨','Helado'], ['🍦','Cono de helado'], ['🍡','Dulce'], ['🍬','Caramelo']
    ]],
    ['Frutas', [
      ['🍎','Manzana'], ['🍐','Pera'], ['🍊','Naranja'], ['🍋','Limón'], ['🍌','Plátano'], ['🍉','Sandía'], ['🍇','Uvas'],
      ['🍓','Fresa'], ['🫐','Arándanos'], ['🍒','Cerezas'], ['🍑','Melocotón'], ['🍍','Piña'], ['🥭','Mango'], ['🥝','Kiwi']
    ]],
    ['Bebidas', [
      ['☕','Café'], ['🍵','Té'], ['🫖','Tetera'], ['🧃','Zumo'], ['🥤','Refresco'], ['🧋','Bebida fría'], ['🧉','Infusión'],
      ['🍹','Cóctel / bebida'], ['🍷','Vino'], ['🍺','Cerveza'], ['💧','Agua']
    ]]
  ];

  function installEmojiSelect() {
    const input = document.querySelector('#recipe-emoji');
    if (!input || input.tagName === 'SELECT') return;

    const select = document.createElement('select');
    select.id = input.id;
    select.name = input.name;
    select.setAttribute('aria-describedby', input.getAttribute('aria-describedby') || 'emoji-help');

    emojiGroups.forEach(([label, options]) => {
      const group = document.createElement('optgroup');
      group.label = label;
      options.forEach(([emoji, name]) => {
        const option = document.createElement('option');
        option.value = emoji;
        option.textContent = `${emoji} ${name}`;
        if (emoji === (input.value || '🍲')) option.selected = true;
        group.appendChild(option);
      });
      select.appendChild(group);
    });

    input.replaceWith(select);
    const help = document.querySelector('#emoji-help');
    if (help) help.textContent = 'Elige un icono relacionado con la receta.';
  }

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function storeSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  function headers(session, json = true) {
    const result = {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`
    };
    if (json) result['Content-Type'] = 'application/json';
    return result;
  }

  async function responseMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload.message || payload.msg || payload.error_description || payload.error || `Error ${response.status}`;
    } catch {
      return `Error ${response.status}`;
    }
  }

  async function activeSession() {
    let session = readSession();
    if (!session?.access_token || !session?.user?.id) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');

    if (Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 90) return session;
    if (!session.refresh_token) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');

    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) {
      storeSession(null);
      throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    }

    const payload = await response.json();
    session = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_type: payload.token_type || 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
      user: payload.user
    };
    storeSession(session);
    return session;
  }

  async function rest(session, path, options = {}) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...headers(session), ...(options.headers || {}) }
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

  async function ensureRecetarioAccount(session) {
    try {
      await rest(session, 'rpc/ensure_recetario_account', {
        method: 'POST',
        body: JSON.stringify({
          requested_display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Familiar'
        })
      });
    } catch (error) {
      if (error.status === 404 || /ensure_recetario_account|schema cache|function/i.test(error.message)) {
        throw new Error('La cuenta del recetario no está activada en Supabase. Comprueba que se ejecutó 004_cuentas_admin.sql.');
      }
      throw error;
    }

    const rows = await rest(session, `recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=id,is_active,role&limit=1`);
    if (!rows?.[0]) throw new Error('No se ha podido registrar tu cuenta en el Recetario.');
    if (!rows[0].is_active) throw new Error('Tu cuenta del Recetario está desactivada.');
    return rows[0];
  }

  async function getFamily(session) {
    const memberships = await rest(session, `recipe_family_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=family_id,role&limit=1`);
    const membership = memberships?.[0];
    if (!membership) return null;
    const rows = await rest(session, `recipe_families?id=eq.${encodeURIComponent(membership.family_id)}&select=id,name&limit=1`);
    return rows?.[0] ? { ...rows[0], role: membership.role } : null;
  }

  function recipePayload(session, recipe, family, coverImagePath) {
    const share = recipe.visibility === 'family' && family?.id;
    return {
      owner_id: session.user.id,
      title: recipe.title,
      summary: recipe.summary || '',
      category: recipe.category || 'principal',
      difficulty: recipe.difficulty || 'Fácil',
      servings: Number(recipe.servings || 1),
      prep_minutes: Number(recipe.prepMinutes || 0),
      cook_minutes: Number(recipe.cookMinutes || 0),
      rating: Number(recipe.rating || 0),
      emoji: recipe.emoji || '🍲',
      cover_image_path: coverImagePath || null,
      notes: recipe.notes || '',
      tags: recipe.tags || [],
      is_public: false,
      visibility: share ? 'family' : 'private',
      family_id: share ? family.id : null
    };
  }

  function encodeObjectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  function safeFileName(name) {
    const extension = String(name).split('.').pop()?.toLowerCase() || 'jpg';
    const base = slugify(String(name).replace(/\.[^.]+$/, '')) || 'foto';
    return `${base}.${extension.replace(/[^a-z0-9]/g, '') || 'jpg'}`;
  }

  async function uploadImage(session, file, recipeId) {
    if (!file?.size) return '';
    if (file.size > 5 * 1024 * 1024) throw new Error('La foto supera el límite de 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('La foto debe ser JPG, PNG o WEBP.');

    const path = `${session.user.id}/${recipeId}/${Date.now()}-${safeFileName(file.name)}`;
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/recipe-images/${encodeObjectPath(path)}`, {
      method: 'POST',
      headers: {
        ...headers(session, false),
        'Content-Type': file.type,
        'x-upsert': 'true'
      },
      body: file
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    return path;
  }

  async function signedImageUrl(session, path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/recipe-images/${encodeObjectPath(path)}`, {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify({ expiresIn: 3600 })
    });
    if (!response.ok) return '';
    const payload = await response.json();
    return payload.signedURL ? `${config.supabaseUrl}/storage/v1${payload.signedURL}` : '';
  }

  async function readChildren(session, recipeId) {
    const [ingredients, steps] = await Promise.all([
      rest(session, `recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}&select=position,ingredient_text&order=position.asc`),
      rest(session, `recipe_steps?recipe_id=eq.${encodeURIComponent(recipeId)}&select=position,instruction&order=position.asc`)
    ]);
    return { ingredients: ingredients || [], steps: steps || [] };
  }

  async function writeChildren(session, recipeId, recipe, backup = null) {
    await rest(session, `recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });
    await rest(session, `recipe_steps?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });

    try {
      if (recipe.ingredients.length) {
        await rest(session, 'recipe_ingredients', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(recipe.ingredients.map((ingredient_text, position) => ({ recipe_id: recipeId, position, ingredient_text })))
        });
      }
      if (recipe.steps.length) {
        await rest(session, 'recipe_steps', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(recipe.steps.map((instruction, position) => ({ recipe_id: recipeId, position, instruction })))
        });
      }
    } catch (error) {
      if (backup) {
        try {
          await rest(session, `recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });
          await rest(session, `recipe_steps?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: 'DELETE' });
          if (backup.ingredients.length) await rest(session, 'recipe_ingredients', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(backup.ingredients.map(item => ({ recipe_id: recipeId, position: item.position, ingredient_text: item.ingredient_text })))
          });
          if (backup.steps.length) await rest(session, 'recipe_steps', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(backup.steps.map(item => ({ recipe_id: recipeId, position: item.position, instruction: item.instruction })))
          });
        } catch { /* Se conserva el error original. */ }
      }
      throw error;
    }
  }

  async function verifyRecipe(session, recipeId, expected) {
    const rows = await rest(session, `recipes?id=eq.${encodeURIComponent(recipeId)}&owner_id=eq.${encodeURIComponent(session.user.id)}&select=id,title,visibility,family_id,cover_image_path&limit=1`);
    const row = rows?.[0];
    if (!row) throw new Error('Supabase no ha confirmado la receta después del guardado.');

    const children = await readChildren(session, recipeId);
    if (children.ingredients.length !== expected.ingredients.length || children.steps.length !== expected.steps.length) {
      throw new Error('La receta se creó, pero Supabase no confirmó todos los ingredientes y pasos.');
    }
    return row;
  }

  function clearLocalCopy(id) {
    try {
      const locals = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(locals.filter(item => item.id !== id)));
    } catch { /* No impide el guardado remoto. */ }
  }

  function setFormError(message = '') {
    let box = form.querySelector('.save-error-box');
    if (!message) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'save-error-box';
      box.setAttribute('role', 'alert');
      form.querySelector('.form-actions')?.before(box);
    }
    box.innerHTML = `<strong>No se ha guardado la receta.</strong><span>${escapeHtml(message)}</span>`;
  }

  function ensureConfirmationDialog() {
    let dialog = document.querySelector('#save-confirmation-dialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'save-confirmation-dialog';
    dialog.className = 'save-confirmation-dialog';
    dialog.innerHTML = `
      <div class="save-confirmation-card">
        <div class="save-confirmation-icon" aria-hidden="true">✓</div>
        <span class="eyebrow">Guardado confirmado</span>
        <h2 id="save-confirmation-title">Receta guardada</h2>
        <p id="save-confirmation-copy"></p>
        <label class="share-confirmation-toggle" id="share-confirmation-row">
          <input id="share-confirmation-checkbox" type="checkbox">
          <span><strong>Compartir con mi familia</strong><small id="share-confirmation-help"></small></span>
        </label>
        <p class="save-confirmation-status" id="save-confirmation-status" aria-live="polite"></p>
        <div class="save-confirmation-actions">
          <button class="button button--soft" id="save-confirmation-close" type="button">Cerrar</button>
          <button class="button" id="save-confirmation-view" type="button">Ver receta</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    dialog.addEventListener('click', event => {
      if (event.target === dialog) event.stopPropagation();
    });
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.querySelector('#save-confirmation-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('#save-confirmation-view').addEventListener('click', () => {
      const id = lastSavedRecipe?.id;
      dialog.close();
      if (id) openRecipe(id);
    });
    dialog.querySelector('#share-confirmation-checkbox').addEventListener('change', updateVisibilityFromConfirmation);
    return dialog;
  }

  async function updateVisibilityFromConfirmation(event) {
    if (!lastSavedRecipe) return;
    const checkbox = event.currentTarget;
    const status = document.querySelector('#save-confirmation-status');
    const wantsFamily = checkbox.checked;
    const previous = lastSavedRecipe.visibility === 'family';

    if (wantsFamily && !lastFamily?.id) {
      checkbox.checked = false;
      status.textContent = 'Primero tienes que crear una familia o unirte a una desde Mi cuenta.';
      return;
    }

    checkbox.disabled = true;
    status.textContent = 'Actualizando visibilidad…';
    try {
      const session = await activeSession();
      await rest(session, `recipes?id=eq.${encodeURIComponent(lastSavedRecipe.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          visibility: wantsFamily ? 'family' : 'private',
          family_id: wantsFamily ? lastFamily.id : null,
          is_public: false
        })
      });

      const check = await rest(session, `recipes?id=eq.${encodeURIComponent(lastSavedRecipe.id)}&select=id,visibility,family_id&limit=1`);
      if (!check?.[0] || check[0].visibility !== (wantsFamily ? 'family' : 'private')) {
        throw new Error('Supabase no confirmó el cambio de visibilidad.');
      }

      lastSavedRecipe.visibility = wantsFamily ? 'family' : 'private';
      lastSavedRecipe.familyId = wantsFamily ? lastFamily.id : null;
      const index = userRecipes.findIndex(item => item.id === lastSavedRecipe.id);
      if (index >= 0) userRecipes[index] = { ...userRecipes[index], ...lastSavedRecipe };
      render();
      updateConfirmationCopy();
      status.textContent = wantsFamily ? 'Ahora la receta es visible para tu familia.' : 'Ahora la receta es solo para ti.';
    } catch (error) {
      checkbox.checked = previous;
      status.textContent = `No se pudo cambiar: ${error.message}`;
    } finally {
      checkbox.disabled = false;
    }
  }

  function updateConfirmationCopy() {
    const dialog = ensureConfirmationDialog();
    const title = dialog.querySelector('#save-confirmation-title');
    const copy = dialog.querySelector('#save-confirmation-copy');
    const checkbox = dialog.querySelector('#share-confirmation-checkbox');
    const help = dialog.querySelector('#share-confirmation-help');
    const isFamily = lastSavedRecipe?.visibility === 'family';

    title.textContent = `“${lastSavedRecipe?.title || 'Tu receta'}” se ha guardado`;
    copy.innerHTML = isFamily
      ? `<strong>Visible para tu familia.</strong> Está almacenada en Supabase y los miembros de ${escapeHtml(lastFamily?.name || 'tu familia')} pueden verla.`
      : '<strong>Solo visible para ti.</strong> Está almacenada en Supabase y no se comparte con tu familia.';
    checkbox.checked = isFamily;
    checkbox.disabled = !lastFamily?.id;
    help.textContent = lastFamily?.id
      ? `Puedes cambiarlo ahora. Familia: ${lastFamily.name}.`
      : 'No perteneces todavía a ningún grupo familiar.';
  }

  function showConfirmation(recipe, family) {
    lastSavedRecipe = recipe;
    lastFamily = family;
    const dialog = ensureConfirmationDialog();
    dialog.querySelector('#save-confirmation-status').textContent = '';
    updateConfirmationCopy();
    dialog.showModal();
  }

  async function saveRecipe(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy || !form.reportValidity()) return;

    busy = true;
    setFormError('');
    const submit = form.querySelector('[type="submit"]');
    const originalLabel = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Guardando en Supabase…';

    let createdNewRow = false;
    let createdId = null;

    try {
      const session = await activeSession();
      await ensureRecetarioAccount(session);
      const family = await getFamily(session);
      const recipe = formToRecipe(form);
      recipe.visibility = visibilitySelect?.value === 'family' && family?.id ? 'family' : 'private';

      const existing = userRecipes.find(item => item.id === recipe.id) || null;
      if (existing?.canEdit === false) throw new Error('Solo la persona que creó esta receta puede editarla.');

      let coverImagePath = existing?.coverImagePath || '';
      const externalUrl = String(recipe.imageUrl || '').trim();
      if (externalUrl && externalUrl !== existing?.imageUrl) coverImagePath = externalUrl;

      let row;
      let backup = null;
      if (existing?.storageMode === REMOTE_MODE) {
        backup = await readChildren(session, existing.id);
        const rows = await rest(session, `recipes?id=eq.${encodeURIComponent(existing.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(recipePayload(session, recipe, family, coverImagePath))
        });
        row = rows?.[0];
      } else {
        const rows = await rest(session, 'recipes', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(recipePayload(session, recipe, family, coverImagePath))
        });
        row = rows?.[0];
        createdNewRow = true;
      }

      if (!row?.id) throw new Error('Supabase no devolvió el identificador de la receta.');
      createdId = row.id;

      const file = imageFileInput?.files?.[0];
      if (file?.size) {
        coverImagePath = await uploadImage(session, file, row.id);
        const updated = await rest(session, `recipes?id=eq.${encodeURIComponent(row.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ cover_image_path: coverImagePath })
        });
        row = updated?.[0] || { ...row, cover_image_path: coverImagePath };
      }

      await writeChildren(session, row.id, recipe, backup);
      const verified = await verifyRecipe(session, row.id, recipe);
      const imageUrl = await signedImageUrl(session, verified.cover_image_path || coverImagePath);

      const remote = {
        ...recipe,
        id: row.id,
        imageUrl: imageUrl || (/^https?:\/\//i.test(coverImagePath) ? coverImagePath : ''),
        coverImagePath: verified.cover_image_path || coverImagePath || '',
        storageMode: REMOTE_MODE,
        remoteOwnerId: session.user.id,
        ownerName: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Yo',
        visibility: verified.visibility || recipe.visibility,
        familyId: verified.family_id || null,
        canEdit: true
      };

      userRecipes = [remote, ...userRecipes.filter(item => item.id !== recipe.id && item.id !== remote.id)];
      if (existing?.storageMode !== REMOTE_MODE) clearLocalCopy(existing?.id || recipe.id);
      closeForm();
      render();
      showConfirmation(remote, family);
    } catch (error) {
      if (createdNewRow && createdId) {
        try {
          const session = await activeSession();
          await rest(session, `recipes?id=eq.${encodeURIComponent(createdId)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, { method: 'DELETE' });
        } catch { /* Evita dejar un alta incompleta cuando sea posible. */ }
      }
      setFormError(error.message || 'Se ha producido un error desconocido.');
      showToast(`No se ha guardado: ${error.message}`);
      if (/sesión ha caducado/i.test(error.message)) setTimeout(() => location.replace('cuenta.html'), 1200);
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = originalLabel;
    }
  }

  // Evita que un clic accidental en el fondo cierre el formulario y haga perder datos.
  formDialog.addEventListener('click', event => {
    if (event.target === formDialog) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  installEmojiSelect();
  form.addEventListener('submit', saveRecipe, true);
})();
