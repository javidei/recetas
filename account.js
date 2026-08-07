(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const STORAGE_KEY = 'recetario-javi-recipes-v1';
  const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;

  const els = {
    guest: document.querySelector('#guest-section'),
    member: document.querySelector('#member-section'),
    hero: document.querySelector('#account-hero'),
    loginTab: document.querySelector('#login-tab'),
    registerTab: document.querySelector('#register-tab'),
    loginForm: document.querySelector('#login-form'),
    registerForm: document.querySelector('#register-form'),
    authMessage: document.querySelector('#auth-message'),
    profileName: document.querySelector('#profile-name'),
    profileUsername: document.querySelector('#profile-username'),
    profileEmail: document.querySelector('#profile-email'),
    profileAvatar: document.querySelector('#profile-avatar'),
    profileForm: document.querySelector('#profile-form'),
    profileNameInput: document.querySelector('#profile-name-input'),
    profileUsernameInput: document.querySelector('#profile-username-input'),
    avatarInput: document.querySelector('#profile-avatar-input'),
    avatarMessage: document.querySelector('#avatar-message'),
    logout: document.querySelector('#logout-button'),
    adminLink: document.querySelector('#admin-link'),
    familiesList: document.querySelector('#families-list'),
    familiesEmpty: document.querySelector('#families-empty'),
    familyMessage: document.querySelector('#family-message'),
    createFamilyForm: document.querySelector('#create-family-form'),
    joinFamilyForm: document.querySelector('#join-family-form'),
    localDataCard: document.querySelector('#local-data-card'),
    localRecipesCopy: document.querySelector('#local-recipes-copy'),
    migrateLocal: document.querySelector('#migrate-local-button'),
    toast: document.querySelector('#toast')
  };

  let session = readSession();
  let profile = null;
  let families = [];
  let memberships = [];
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

  function headers(auth = true, json = true) {
    const result = { apikey: config.supabasePublishableKey };
    if (json) result['Content-Type'] = 'application/json';
    if (auth) result.Authorization = `Bearer ${session?.access_token || config.supabasePublishableKey}`;
    return result;
  }

  async function responseMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload.message || payload.msg || payload.error_description || payload.error || `Error ${response.status}`;
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
    const active = await ensureSession();
    if (!active?.access_token) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
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

  function setMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.dataset.error = String(isError);
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function encodeObjectPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  async function signedAvatar(path) {
    if (!path || !session?.access_token) return '';
    try {
      const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/recipe-avatars/${encodeObjectPath(path)}`, {
        method: 'POST', headers: headers(true), body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!response.ok) return '';
      const payload = await response.json();
      return payload.signedURL ? `${config.supabaseUrl}/storage/v1${payload.signedURL}` : '';
    } catch { return ''; }
  }

  function avatarHtml(name, url, className = 'family-member__avatar') {
    if (url) return `<span class="${className}"><img src="${escapeHtml(url)}" alt="" loading="lazy"></span>`;
    return `<span class="${className}">${escapeHtml((name || 'F').charAt(0).toUpperCase())}</span>`;
  }

  function localRecipes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function updateLocalCard() {
    if (!els.localDataCard) return;
    const count = localRecipes().length;
    els.localDataCard.hidden = !session?.user?.id || count === 0;
    if (!count) return;
    els.localRecipesCopy.textContent = count === 1
      ? 'Hay 1 receta guardada únicamente en este navegador. Puedes guardarla en tu cuenta.'
      : `Hay ${count} recetas guardadas únicamente en este navegador. Puedes guardarlas en tu cuenta.`;
    els.migrateLocal.textContent = count === 1 ? 'Guardar 1 receta en mi cuenta' : `Guardar ${count} recetas en mi cuenta`;
  }

  function switchAuth(mode, clearMessage = true) {
    const login = mode === 'login';
    els.loginForm.hidden = !login;
    els.registerForm.hidden = login;
    els.loginTab.classList.toggle('is-active', login);
    els.registerTab.classList.toggle('is-active', !login);
    els.loginTab.setAttribute('aria-selected', String(login));
    els.registerTab.setAttribute('aria-selected', String(!login));
    if (clearMessage) setMessage(els.authMessage, '');
  }

  async function ensureAccount(preferredName = '') {
    const fallback = preferredName || session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || 'Familiar';
    return rest('rpc/ensure_recetario_account', {
      method: 'POST', body: JSON.stringify({ requested_display_name: fallback })
    });
  }

  async function loadProfile() {
    let rows = await rest(`recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=id,display_name,username,email,avatar_path,role,is_active,created_at&limit=1`);
    if (!rows?.length) {
      await ensureAccount();
      rows = await rest(`recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=id,display_name,username,email,avatar_path,role,is_active,created_at&limit=1`);
    }
    profile = rows?.[0] || null;
    if (!profile) throw new Error('No se pudo cargar tu cuenta del recetario.');
    if (!profile.is_active) {
      saveSession(null);
      throw new Error('Esta cuenta está desactivada. Habla con el administrador del recetario.');
    }

    const name = profile.display_name || profile.username || 'Familiar';
    els.profileName.textContent = name;
    els.profileUsername.textContent = profile.username ? `@${profile.username}` : 'Sin nombre de usuario';
    els.profileEmail.textContent = profile.email || session.user.email || '';
    els.profileNameInput.value = profile.display_name || '';
    els.profileUsernameInput.value = profile.username || '';
    if (els.adminLink) els.adminLink.hidden = profile.role !== 'admin';

    const avatarUrl = await signedAvatar(profile.avatar_path);
    els.profileAvatar.innerHTML = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="Foto de perfil de ${escapeHtml(name)}">`
      : escapeHtml(name.charAt(0).toUpperCase() || 'F');
    return true;
  }

  async function loadFamilies() {
    setMessage(els.familyMessage, '');
    memberships = await rest(`recipe_family_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=family_id,role,joined_at&order=joined_at.asc`);
    const ids = [...new Set((memberships || []).map(item => item.family_id))];
    families = [];

    if (!ids.length) {
      els.familiesList.innerHTML = '';
      els.familiesEmpty.hidden = false;
      return;
    }

    const familyRows = await rest(`recipe_families?id=in.(${ids.join(',')})&select=id,name,invite_code,owner_id,created_at&order=name.asc`);
    const memberRows = await rest(`recipe_family_members?family_id=in.(${ids.join(',')})&select=family_id,user_id,role,joined_at&order=joined_at.asc`);
    const userIds = [...new Set((memberRows || []).map(item => item.user_id))];
    const accountRows = userIds.length
      ? await rest(`recetario_accounts?id=in.(${userIds.join(',')})&select=id,display_name,username,avatar_path,is_active`)
      : [];

    const avatarEntries = await Promise.all((accountRows || []).map(async account => [account.id, await signedAvatar(account.avatar_path)]));
    const avatarMap = new Map(avatarEntries);
    const accountMap = new Map((accountRows || []).map(account => [account.id, account]));
    const membershipMap = new Map((memberships || []).map(item => [item.family_id, item]));

    families = (familyRows || []).map(family => ({ ...family, membership: membershipMap.get(family.id) || null }));
    els.familiesEmpty.hidden = families.length > 0;
    els.familiesList.innerHTML = families.map(family => {
      const mine = family.membership;
      const members = (memberRows || []).filter(item => item.family_id === family.id);
      return `<section class="family-group-card" data-family-id="${escapeHtml(family.id)}">
        <div class="family-title-row">
          <div><span class="eyebrow">Familia</span><h3>${escapeHtml(family.name)}</h3></div>
          <span class="role-badge">${mine?.role === 'owner' ? 'Propietario' : 'Miembro'}</span>
        </div>
        <div class="invite-box">
          <div><span>Código para invitar</span><strong>${escapeHtml(family.invite_code)}</strong></div>
          <button class="button button--soft" type="button" data-copy-family-code="${escapeHtml(family.invite_code)}">Copiar código</button>
        </div>
        <div class="family-members">
          ${members.map(member => {
            const account = accountMap.get(member.user_id) || { display_name: 'Familiar', username: '', is_active: true };
            const memberName = account.display_name || account.username || 'Familiar';
            const self = member.user_id === session.user.id;
            return `<div class="family-member">
              <div class="family-member__person">
                ${avatarHtml(memberName, avatarMap.get(member.user_id))}
                <div><strong>${escapeHtml(memberName)}${self ? ' · Tú' : ''}</strong><small>${account.username ? `@${escapeHtml(account.username)} · ` : ''}${member.role === 'owner' ? 'Propietario' : 'Miembro'}${account.is_active === false ? ' · Desactivado' : ''}</small></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>`;
    }).join('');
  }

  async function loadAccount() {
    const activeSession = await ensureSession();
    const logged = Boolean(activeSession?.user?.id);
    els.guest.hidden = logged;
    els.member.hidden = !logged;
    els.hero.hidden = logged;
    if (els.adminLink) els.adminLink.hidden = true;
    updateLocalCard();
    if (!logged) return;

    try {
      await ensureAccount();
      await loadProfile();
      await loadFamilies();
    } catch (error) {
      console.error(error);
      if (/username|avatar_path|PGRST204|PGRST202|schema cache/i.test(error.message)) {
        setMessage(els.familyMessage, 'Falta ejecutar la actualización 006 del Recetario en Supabase.', true);
      } else {
        setMessage(els.familyMessage, error.message || 'No se pudo cargar la cuenta.', true);
      }
    }
  }

  async function signInWithUsername(identifier, password) {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/recetario-username-login`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier, password })
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    return response.json();
  }

  async function authenticate(mode) {
    if (busy) return;
    const form = mode === 'login' ? els.loginForm : els.registerForm;
    if (!form.reportValidity()) return;

    busy = true;
    setMessage(els.authMessage, mode === 'signup' ? 'Creando la cuenta…' : 'Iniciando sesión…');
    try {
      if (mode === 'login') {
        const identifier = document.querySelector('#login-identifier').value.trim().toLowerCase();
        const password = document.querySelector('#login-password').value;
        let payload;
        if (identifier.includes('@')) {
          const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST', headers: headers(false), body: JSON.stringify({ email: identifier, password })
          });
          if (!response.ok) throw new Error(await responseMessage(response));
          payload = await response.json();
        } else {
          if (!USERNAME_PATTERN.test(identifier)) throw new Error('El nombre de usuario no es válido.');
          payload = await signInWithUsername(identifier, password);
        }
        const nextSession = normalizeSession(payload);
        if (!nextSession) throw new Error('No se pudo iniciar sesión.');
        saveSession(nextSession);
        await ensureAccount();
        await loadAccount();
        location.replace('./');
        return;
      }

      const displayName = document.querySelector('#register-name').value.trim();
      const username = document.querySelector('#register-username').value.trim().toLowerCase();
      const email = document.querySelector('#register-email').value.trim().toLowerCase();
      const password = document.querySelector('#register-password').value;
      const confirmation = document.querySelector('#register-password-confirm').value;
      if (!USERNAME_PATTERN.test(username)) throw new Error('El usuario debe tener entre 3 y 24 caracteres: letras minúsculas, números o guion bajo.');
      if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');

      const response = await fetch(`${config.supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: headers(false),
        body: JSON.stringify({ email, password, data: { display_name: displayName, username, app: 'recetario' } })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json();
      const nextSession = normalizeSession(payload);
      if (!nextSession) {
        switchAuth('login', false);
        document.querySelector('#login-identifier').value = username;
        setMessage(els.authMessage, 'Cuenta creada. Revisa tu correo para confirmar el registro y después podrás entrar con tu usuario.');
        return;
      }
      saveSession(nextSession);
      await loadAccount();
      location.replace('./');
    } catch (error) {
      const raw = String(error.message || 'No se pudo completar el acceso.');
      const duplicate = /duplicate|unique|already registered|database error saving new user/i.test(raw);
      setMessage(els.authMessage, duplicate ? 'Ese correo o nombre de usuario ya está registrado.' : raw, true);
    } finally {
      busy = false;
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
      await loadFamilies();
      setMessage(els.familyMessage, 'Familia creada. Ya puedes compartir su código.');
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
      await loadFamilies();
      setMessage(els.familyMessage, 'Familia añadida a tu cuenta.');
    } catch (error) { setMessage(els.familyMessage, error.message, true); }
    finally { busy = false; }
  }

  async function updateProfile(event) {
    event.preventDefault();
    if (busy || !els.profileForm.reportValidity()) return;
    const displayName = els.profileNameInput.value.trim();
    const username = els.profileUsernameInput.value.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      showToast('El nombre de usuario no es válido');
      return;
    }
    busy = true;
    try {
      await rest(`recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ display_name: displayName, username })
      });
      await loadProfile();
      await loadFamilies();
      showToast('Perfil actualizado');
    } catch (error) {
      const duplicate = /duplicate|unique|23505/i.test(String(error.message));
      showToast(duplicate ? 'Ese nombre de usuario ya está en uso' : `No se pudo guardar: ${error.message}`);
    } finally { busy = false; }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
      image.src = url;
    });
  }

  async function prepareAvatar(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Usa una foto JPG, PNG o WEBP.');
    if (file.size > 8 * 1024 * 1024) throw new Error('La foto original no puede superar 8 MB.');
    const image = await loadImage(file);
    const source = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = Math.max(0, (image.naturalWidth - source) / 2);
    const sy = Math.max(0, (image.naturalHeight - source) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    context.drawImage(image, sx, sy, source, source, 0, 0, 512, 512);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.')), 'image/webp', .86);
    });
  }

  async function removeAvatar(path) {
    if (!path || !session?.access_token) return;
    try {
      await fetch(`${config.supabaseUrl}/storage/v1/object/recipe-avatars/${encodeObjectPath(path)}`, {
        method: 'DELETE', headers: headers(true, false)
      });
    } catch { /* No bloquea el nuevo avatar. */ }
  }

  async function uploadAvatar(file) {
    if (!file || busy) return;
    busy = true;
    setMessage(els.avatarMessage, 'Preparando y centrando la foto…');
    try {
      const blob = await prepareAvatar(file);
      const path = `${session.user.id}/avatar-${Date.now()}.webp`;
      const response = await fetch(`${config.supabaseUrl}/storage/v1/object/recipe-avatars/${encodeObjectPath(path)}`, {
        method: 'POST',
        headers: {
          ...headers(true, false),
          'Content-Type': 'image/webp',
          'x-upsert': 'true'
        },
        body: blob
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const previous = profile?.avatar_path || '';
      await rest(`recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ avatar_path: path })
      });
      if (previous && previous !== path) await removeAvatar(previous);
      await loadProfile();
      await loadFamilies();
      setMessage(els.avatarMessage, 'Foto de perfil actualizada.');
    } catch (error) {
      setMessage(els.avatarMessage, error.message || 'No se pudo subir la foto.', true);
    } finally {
      busy = false;
      els.avatarInput.value = '';
    }
  }

  async function logout() {
    if (busy) return;
    busy = true;
    try {
      if (session?.access_token) await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: headers(true) });
    } catch { /* La sesión local se elimina igualmente. */ }
    saveSession(null);
    location.replace('cuenta.html');
  }

  function recipePayload(recipe) {
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
      cover_image_path: recipe.imageUrl || null,
      notes: recipe.notes || '',
      tags: recipe.tags || [],
      is_public: false,
      visibility: 'private',
      family_id: null
    };
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
          const rows = await rest('recipes', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(recipePayload(recipe)) });
          const id = rows?.[0]?.id;
          if (!id) throw new Error('No se pudo crear la receta.');
          if (recipe.ingredients?.length) await rest('recipe_ingredients', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(recipe.ingredients.map((ingredient_text, position) => ({ recipe_id: id, position, ingredient_text })))
          });
          if (recipe.steps?.length) await rest('recipe_steps', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(recipe.steps.map((instruction, position) => ({ recipe_id: id, position, instruction })))
          });
        } catch (error) { console.error(error); failed.push(recipe); }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(failed));
      updateLocalCard();
      showToast(failed.length ? `${recipes.length - failed.length} guardadas; ${failed.length} fallaron` : 'Todas las recetas están guardadas en tu cuenta');
    } finally {
      busy = false;
      els.migrateLocal.disabled = false;
      updateLocalCard();
    }
  }

  els.loginTab?.addEventListener('click', () => switchAuth('login'));
  els.registerTab?.addEventListener('click', () => switchAuth('register'));
  els.loginForm?.addEventListener('submit', event => { event.preventDefault(); authenticate('login'); });
  els.registerForm?.addEventListener('submit', event => { event.preventDefault(); authenticate('signup'); });
  els.profileForm?.addEventListener('submit', updateProfile);
  els.avatarInput?.addEventListener('change', () => uploadAvatar(els.avatarInput.files?.[0]));
  els.createFamilyForm?.addEventListener('submit', createFamily);
  els.joinFamilyForm?.addEventListener('submit', joinFamily);
  els.logout?.addEventListener('click', logout);
  els.migrateLocal?.addEventListener('click', migrateLocalRecipes);
  els.familiesList?.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-family-code]');
    if (!button) return;
    const code = button.dataset.copyFamilyCode;
    try { await navigator.clipboard.writeText(code); showToast('Código familiar copiado'); }
    catch { showToast(`Código: ${code}`); }
  });

  switchAuth('login');
  loadAccount();
})();