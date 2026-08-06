(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const STORAGE_KEY = 'recetario-javi-recipes-v1';
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  const els = {
    guest: document.querySelector('#guest-section'),
    member: document.querySelector('#member-section'),
    loginTab: document.querySelector('#login-tab'),
    registerTab: document.querySelector('#register-tab'),
    loginForm: document.querySelector('#login-form'),
    registerForm: document.querySelector('#register-form'),
    authMessage: document.querySelector('#auth-message'),
    profileName: document.querySelector('#profile-name'),
    profileEmail: document.querySelector('#profile-email'),
    profileAvatar: document.querySelector('#profile-avatar'),
    profileForm: document.querySelector('#profile-form'),
    profileNameInput: document.querySelector('#profile-name-input'),
    logout: document.querySelector('#logout-button'),
    familyEmpty: document.querySelector('#family-empty'),
    familyActive: document.querySelector('#family-active'),
    familyName: document.querySelector('#family-name'),
    familyCode: document.querySelector('#family-code'),
    familyRole: document.querySelector('#family-role'),
    familyMembers: document.querySelector('#family-members'),
    familyMessage: document.querySelector('#family-message'),
    createFamilyForm: document.querySelector('#create-family-form'),
    joinFamilyForm: document.querySelector('#join-family-form'),
    copyFamilyCode: document.querySelector('#copy-family-code'),
    migrationWarning: document.querySelector('#migration-warning'),
    localDataCard: document.querySelector('#local-data-card'),
    localRecipesCopy: document.querySelector('#local-recipes-copy'),
    migrateLocal: document.querySelector('#migrate-local-button'),
    toast: document.querySelector('#toast')
  };

  let session = readSession();
  let profile = null;
  let family = null;
  let membership = null;
  let familySchemaReady = true;
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

  function headers(auth = true) {
    const value = {
      apikey: config.supabasePublishableKey,
      'Content-Type': 'application/json'
    };
    if (auth) value.Authorization = `Bearer ${session?.access_token || config.supabasePublishableKey}`;
    return value;
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
    if (!session.refresh_token) { saveSession(null); return null; }
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: headers(false), body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      saveSession(normalizeSession(await response.json()));
      return session;
    } catch {
      saveSession(null);
      return null;
    }
  }

  async function rest(path, options = {}) {
    await ensureSession();
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...headers(true), ...(options.headers || {}) }
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

  function setMessage(element, message, error = false) {
    if (!element) return;
    element.textContent = message;
    element.dataset.error = String(error);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 2500);
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function localRecipes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function updateLocalCard() {
    const count = localRecipes().length;
    els.localDataCard.hidden = !session?.user?.id || count === 0;
    if (count > 0) {
      els.localRecipesCopy.textContent = count === 1
        ? 'Hay 1 receta guardada únicamente en este navegador. Puedes subirla a tu cuenta para conservarla en la nube.'
        : `Hay ${count} recetas guardadas únicamente en este navegador. Puedes subirlas a tu cuenta para conservarlas en la nube.`;
      els.migrateLocal.textContent = count === 1 ? 'Guardar 1 receta en mi cuenta' : `Guardar ${count} recetas en mi cuenta`;
    }
  }

  function switchAuth(mode) {
    const login = mode === 'login';
    els.loginForm.hidden = !login;
    els.registerForm.hidden = login;
    els.loginTab.classList.toggle('is-active', login);
    els.registerTab.classList.toggle('is-active', !login);
    els.loginTab.setAttribute('aria-selected', String(login));
    els.registerTab.setAttribute('aria-selected', String(!login));
    setMessage(els.authMessage, '');
  }

  async function authenticate(mode) {
    if (busy) return;
    const form = mode === 'login' ? els.loginForm : els.registerForm;
    if (!form.reportValidity()) return;

    const email = document.querySelector(mode === 'login' ? '#login-email' : '#register-email').value.trim();
    const password = document.querySelector(mode === 'login' ? '#login-password' : '#register-password').value;
    let displayName = '';
    if (mode === 'signup') {
      displayName = document.querySelector('#register-name').value.trim();
      const confirmation = document.querySelector('#register-password-confirm').value;
      if (password !== confirmation) { setMessage(els.authMessage, 'Las contraseñas no coinciden.', true); return; }
    }

    busy = true;
    setMessage(els.authMessage, mode === 'signup' ? 'Creando la cuenta…' : 'Iniciando sesión…');
    try {
      const endpoint = mode === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
      const body = mode === 'signup' ? { email, password, data: { display_name: displayName } } : { email, password };
      const response = await fetch(`${config.supabaseUrl}${endpoint}`, { method: 'POST', headers: headers(false), body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json();
      const nextSession = normalizeSession(payload);
      if (!nextSession) {
        setMessage(els.authMessage, 'Cuenta creada. Revisa tu correo para confirmar el registro y después inicia sesión.');
        switchAuth('login');
        document.querySelector('#login-email').value = email;
        return;
      }
      saveSession(nextSession);
      await ensureProfile(displayName);
      await loadAccount();
      showToast(mode === 'signup' ? 'Cuenta creada correctamente' : 'Sesión iniciada');
    } catch (error) {
      setMessage(els.authMessage, error.message || 'No se pudo completar el acceso.', true);
    } finally { busy = false; }
  }

  async function ensureProfile(preferredName = '') {
    const user = session?.user;
    if (!user?.id) return false;
    const fallback = preferredName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Familiar';
    try {
      await rest('profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ id: user.id, display_name: fallback })
      });
      return true;
    } catch (error) {
      if (error.status === 404 || /profiles/i.test(error.message)) return false;
      throw error;
    }
  }

  async function loadProfile() {
    try {
      const rows = await rest(`profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,display_name&limit=1`);
      profile = rows?.[0] || { id: session.user.id, display_name: session.user.email?.split('@')[0] || 'Familiar' };
    } catch (error) {
      if (error.status !== 404 && !/profiles/i.test(error.message)) throw error;
      profile = { id: session.user.id, display_name: session.user.email?.split('@')[0] || 'Familiar' };
    }
    const name = profile.display_name || 'Familiar';
    els.profileName.textContent = name;
    els.profileEmail.textContent = session.user.email || '';
    els.profileNameInput.value = name;
    els.profileAvatar.textContent = name.charAt(0).toLocaleUpperCase('es') || 'F';
  }

  async function loadFamily() {
    familySchemaReady = true;
    els.migrationWarning.hidden = true;
    try {
      const memberships = await rest(`recipe_family_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=family_id,role,joined_at&limit=1`);
      membership = memberships?.[0] || null;
      if (!membership) {
        family = null;
        els.familyEmpty.hidden = false;
        els.familyActive.hidden = true;
        return;
      }

      const families = await rest(`recipe_families?id=eq.${encodeURIComponent(membership.family_id)}&select=id,name,invite_code,owner_id&limit=1`);
      family = families?.[0] || null;
      if (!family) throw new Error('No se encontró el grupo familiar.');
      els.familyEmpty.hidden = true;
      els.familyActive.hidden = false;
      els.familyName.textContent = family.name;
      els.familyCode.textContent = family.invite_code;
      els.familyRole.textContent = membership.role === 'owner' ? 'Administrador' : 'Miembro';

      const members = await rest(`recipe_family_members?family_id=eq.${encodeURIComponent(family.id)}&select=user_id,role,joined_at&order=joined_at.asc`);
      const ids = [...new Set((members || []).map(item => item.user_id))];
      let names = new Map();
      if (ids.length) {
        const profiles = await rest(`profiles?id=in.(${ids.join(',')})&select=id,display_name`);
        names = new Map((profiles || []).map(item => [item.id, item.display_name]));
      }
      els.familyMembers.innerHTML = (members || []).map(item => {
        const name = names.get(item.user_id) || 'Familiar';
        const self = item.user_id === session.user.id;
        return `<div class="family-member"><div class="family-member__person"><span class="family-member__avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(name)}${self ? ' · Tú' : ''}</strong><small>${item.role === 'owner' ? 'Administrador' : 'Miembro'}</small></div></div></div>`;
      }).join('');
    } catch (error) {
      if (error.status === 404 || /recipe_famil/i.test(error.message)) {
        familySchemaReady = false;
        els.migrationWarning.hidden = false;
        els.familyEmpty.hidden = true;
        els.familyActive.hidden = true;
        setMessage(els.familyMessage, 'La cuenta funciona, pero aún falta ejecutar la migración familiar.', true);
        return;
      }
      throw error;
    }
  }

  async function loadAccount() {
    const active = await ensureSession();
    const logged = Boolean(active?.user?.id);
    els.guest.hidden = logged;
    els.member.hidden = !logged;
    updateLocalCard();
    if (!logged) return;
    try {
      await ensureProfile();
      await Promise.all([loadProfile(), loadFamily()]);
    } catch (error) {
      setMessage(els.familyMessage, error.message || 'No se pudo cargar la cuenta.', true);
    }
  }

  async function createFamily(event) {
    event.preventDefault();
    if (busy || !els.createFamilyForm.reportValidity()) return;
    busy = true;
    setMessage(els.familyMessage, 'Creando la familia…');
    try {
      const name = document.querySelector('#family-name-input').value.trim();
      await rest('rpc/create_recipe_family', { method: 'POST', body: JSON.stringify({ family_name: name }) });
      els.createFamilyForm.reset();
      await loadFamily();
      setMessage(els.familyMessage, 'Familia creada. Comparte el código con las personas que quieras añadir.');
    } catch (error) { setMessage(els.familyMessage, error.message, true); }
    finally { busy = false; }
  }

  async function joinFamily(event) {
    event.preventDefault();
    if (busy || !els.joinFamilyForm.reportValidity()) return;
    busy = true;
    setMessage(els.familyMessage, 'Buscando la familia…');
    try {
      const code = document.querySelector('#family-code-input').value.trim().toUpperCase();
      await rest('rpc/join_recipe_family', { method: 'POST', body: JSON.stringify({ family_code: code }) });
      els.joinFamilyForm.reset();
      await loadFamily();
      setMessage(els.familyMessage, 'Ya formas parte del recetario familiar.');
    } catch (error) { setMessage(els.familyMessage, error.message, true); }
    finally { busy = false; }
  }

  async function updateProfile(event) {
    event.preventDefault();
    if (busy || !els.profileForm.reportValidity()) return;
    busy = true;
    try {
      const displayName = els.profileNameInput.value.trim();
      await rest(`profiles?id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ display_name: displayName })
      });
      await loadProfile();
      if (family) await loadFamily();
      showToast('Nombre actualizado');
    } catch (error) { showToast(`No se pudo guardar: ${error.message}`); }
    finally { busy = false; }
  }

  async function logout() {
    if (busy) return;
    busy = true;
    try {
      if (session?.access_token) await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: headers(true) });
    } catch { /* Se limpia la sesión local igualmente. */ }
    saveSession(null);
    profile = family = membership = null;
    busy = false;
    switchAuth('login');
    await loadAccount();
    showToast('Sesión cerrada');
  }

  function recipePayload(recipe) {
    const payload = {
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
      cover_image_path: recipe.imageUrl || null,
      notes: recipe.notes || '',
      tags: recipe.tags || [],
      is_public: false
    };
    if (familySchemaReady) {
      payload.visibility = 'private';
      payload.family_id = null;
    }
    return payload;
  }

  async function migrateLocalRecipes() {
    const recipes = localRecipes();
    if (!recipes.length || busy) return;
    busy = true;
    els.migrateLocal.disabled = true;
    const failed = [];
    try {
      for (let index = 0; index < recipes.length; index += 1) {
        els.migrateLocal.textContent = `Guardando ${index + 1}/${recipes.length}…`;
        const recipe = recipes[index];
        try {
          const rows = await rest('recipes', {
            method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(recipePayload(recipe))
          });
          const id = rows?.[0]?.id;
          if (!id) throw new Error('No se pudo crear la receta.');
          if (recipe.ingredients?.length) await rest('recipe_ingredients', {
            method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(recipe.ingredients.map((ingredient_text, position) => ({ recipe_id: id, position, ingredient_text })))
          });
          if (recipe.steps?.length) await rest('recipe_steps', {
            method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(recipe.steps.map((instruction, position) => ({ recipe_id: id, position, instruction })))
          });
        } catch (error) { console.error(error); failed.push(recipe); }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(failed));
      updateLocalCard();
      showToast(failed.length ? `${recipes.length - failed.length} guardadas; ${failed.length} no pudieron subirse` : 'Todas las recetas están guardadas en tu cuenta');
    } finally {
      busy = false;
      els.migrateLocal.disabled = false;
      updateLocalCard();
    }
  }

  els.loginTab.addEventListener('click', () => switchAuth('login'));
  els.registerTab.addEventListener('click', () => switchAuth('register'));
  els.loginForm.addEventListener('submit', event => { event.preventDefault(); authenticate('login'); });
  els.registerForm.addEventListener('submit', event => { event.preventDefault(); authenticate('signup'); });
  els.profileForm.addEventListener('submit', updateProfile);
  els.createFamilyForm.addEventListener('submit', createFamily);
  els.joinFamilyForm.addEventListener('submit', joinFamily);
  els.logout.addEventListener('click', logout);
  els.migrateLocal.addEventListener('click', migrateLocalRecipes);
  els.copyFamilyCode.addEventListener('click', async () => {
    if (!family?.invite_code) return;
    try { await navigator.clipboard.writeText(family.invite_code); showToast('Código familiar copiado'); }
    catch { showToast(`Código: ${family.invite_code}`); }
  });

  switchAuth('login');
  loadAccount();
})();
