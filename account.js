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
    adminLink: document.querySelector('#admin-link'),
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
    localDataCard: document.querySelector('#local-data-card'),
    localRecipesCopy: document.querySelector('#local-recipes-copy'),
    migrateLocal: document.querySelector('#migrate-local-button'),
    toast: document.querySelector('#toast')
  };

  let session = readSession();
  let profile = null;
  let family = null;
  let membership = null;
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
    const result = {
      apikey: config.supabasePublishableKey,
      'Content-Type': 'application/json'
    };
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
        method: 'POST',
        headers: headers(false),
        body: JSON.stringify({ refresh_token: session.refresh_token })
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
    const result = await rest('rpc/ensure_recetario_account', {
      method: 'POST',
      body: JSON.stringify({ requested_display_name: fallback })
    });
    return result;
  }

  async function loadProfile() {
    let rows = await rest(`recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=id,display_name,email,role,is_active,created_at&limit=1`);
    if (!rows?.length) {
      await ensureAccount();
      rows = await rest(`recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=id,display_name,email,role,is_active,created_at&limit=1`);
    }

    profile = rows?.[0] || null;
    if (!profile) throw new Error('No se pudo cargar tu cuenta del recetario.');

    if (!profile.is_active) {
      saveSession(null);
      profile = null;
      els.member.hidden = true;
      els.guest.hidden = false;
      switchAuth('login', false);
      setMessage(els.authMessage, 'Esta cuenta está desactivada. Habla con el administrador del recetario.', true);
      return false;
    }

    const name = profile.display_name || 'Familiar';
    els.profileName.textContent = name;
    els.profileEmail.textContent = profile.email || session.user.email || '';
    els.profileNameInput.value = name;
    els.profileAvatar.textContent = name.charAt(0).toLocaleUpperCase('es') || 'F';
    if (els.adminLink) els.adminLink.hidden = profile.role !== 'admin';
    return true;
  }

  async function loadFamily() {
    family = null;
    membership = null;
    setMessage(els.familyMessage, '');

    const memberships = await rest(`recipe_family_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=family_id,role,joined_at&limit=1`);
    membership = memberships?.[0] || null;

    if (!membership) {
      els.familyEmpty.hidden = false;
      els.familyActive.hidden = true;
      return;
    }

    const families = await rest(`recipe_families?id=eq.${encodeURIComponent(membership.family_id)}&select=id,name,invite_code,owner_id&limit=1`);
    family = families?.[0] || null;
    if (!family) throw new Error('No se encontró el grupo familiar asociado a tu cuenta.');

    els.familyEmpty.hidden = true;
    els.familyActive.hidden = false;
    els.familyName.textContent = family.name;
    els.familyCode.textContent = family.invite_code;
    els.familyRole.textContent = membership.role === 'owner' ? 'Administrador de familia' : 'Miembro';

    const members = await rest(`recipe_family_members?family_id=eq.${encodeURIComponent(family.id)}&select=user_id,role,joined_at&order=joined_at.asc`);
    const ids = [...new Set((members || []).map(item => item.user_id))];
    let names = new Map();

    if (ids.length) {
      const accounts = await rest(`recetario_accounts?id=in.(${ids.join(',')})&select=id,display_name,is_active`);
      names = new Map((accounts || []).map(item => [item.id, item]));
    }

    els.familyMembers.innerHTML = (members || []).map(item => {
      const account = names.get(item.user_id) || { display_name: 'Familiar', is_active: true };
      const name = account.display_name || 'Familiar';
      const self = item.user_id === session.user.id;
      return `<div class="family-member">
        <div class="family-member__person">
          <span class="family-member__avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
          <div>
            <strong>${escapeHtml(name)}${self ? ' · Tú' : ''}</strong>
            <small>${item.role === 'owner' ? 'Administrador de familia' : 'Miembro'}${account.is_active === false ? ' · Desactivado' : ''}</small>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  async function loadAccount() {
    const activeSession = await ensureSession();
    const logged = Boolean(activeSession?.user?.id);
    els.guest.hidden = logged;
    els.member.hidden = !logged;
    if (els.adminLink) els.adminLink.hidden = true;
    updateLocalCard();
    if (!logged) return;

    try {
      await ensureAccount();
      const usable = await loadProfile();
      if (!usable) return;
      await loadFamily();
    } catch (error) {
      console.error(error);
      if (/ensure_recetario_account|recetario_accounts|PGRST202|PGRST205|schema cache/i.test(error.message)) {
        setMessage(els.familyMessage, 'La gestión de cuentas todavía no está activada en Supabase. Ejecuta la actualización 004 del recetario.', true);
      } else {
        setMessage(els.familyMessage, error.message || 'No se pudo cargar la cuenta.', true);
      }
    }
  }

  async function authenticate(mode) {
    if (busy) return;
    const form = mode === 'login' ? els.loginForm : els.registerForm;
    if (!form.reportValidity()) return;

    const emailInput = document.querySelector(mode === 'login' ? '#login-email' : '#register-email');
    const passwordInput = document.querySelector(mode === 'login' ? '#login-password' : '#register-password');
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    let displayName = '';

    if (mode === 'signup') {
      displayName = document.querySelector('#register-name').value.trim();
      const confirmation = document.querySelector('#register-password-confirm').value;
      if (password !== confirmation) {
        setMessage(els.authMessage, 'Las contraseñas no coinciden.', true);
        return;
      }
    }

    busy = true;
    setMessage(els.authMessage, mode === 'signup' ? 'Creando la cuenta…' : 'Iniciando sesión…');

    try {
      const endpoint = mode === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
      const body = mode === 'signup'
        ? { email, password, data: { display_name: displayName, app: 'recetario' } }
        : { email, password };

      const response = await fetch(`${config.supabaseUrl}${endpoint}`, {
        method: 'POST',
        headers: headers(false),
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json();
      const nextSession = normalizeSession(payload);

      if (!nextSession) {
        switchAuth('login', false);
        document.querySelector('#login-email').value = email;
        setMessage(els.authMessage, 'Cuenta creada. Revisa tu correo para confirmar el registro y después inicia sesión.');
        return;
      }

      saveSession(nextSession);
      await ensureAccount(displayName);
      await loadAccount();
      if (session?.user?.id) showToast(mode === 'signup' ? 'Cuenta creada correctamente' : 'Sesión iniciada');
    } catch (error) {
      setMessage(els.authMessage, error.message || 'No se pudo completar el acceso.', true);
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
      await loadFamily();
      setMessage(els.familyMessage, 'Familia creada. Ya puedes compartir el código de invitación.');
    } catch (error) {
      setMessage(els.familyMessage, error.message, true);
    } finally { busy = false; }
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
    } catch (error) {
      setMessage(els.familyMessage, error.message, true);
    } finally { busy = false; }
  }

  async function updateProfile(event) {
    event.preventDefault();
    if (busy || !els.profileForm.reportValidity()) return;
    busy = true;
    try {
      const displayName = els.profileNameInput.value.trim();
      await rest(`recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ display_name: displayName })
      });
      await loadProfile();
      if (family) await loadFamily();
      showToast('Nombre actualizado');
    } catch (error) {
      showToast(`No se pudo guardar: ${error.message}`);
    } finally { busy = false; }
  }

  async function logout() {
    if (busy) return;
    busy = true;
    try {
      if (session?.access_token) {
        await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: headers(true) });
      }
    } catch { /* Se elimina igualmente la sesión local. */ }

    saveSession(null);
    profile = family = membership = null;
    busy = false;
    els.member.hidden = true;
    els.guest.hidden = false;
    switchAuth('login');
    updateLocalCard();
    showToast('Sesión cerrada');
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
          const rows = await rest('recipes', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(recipePayload(recipe))
          });
          const id = rows?.[0]?.id;
          if (!id) throw new Error('No se pudo crear la receta.');

          if (recipe.ingredients?.length) {
            await rest('recipe_ingredients', {
              method: 'POST',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify(recipe.ingredients.map((ingredient_text, position) => ({ recipe_id: id, position, ingredient_text })))
            });
          }

          if (recipe.steps?.length) {
            await rest('recipe_steps', {
              method: 'POST',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify(recipe.steps.map((instruction, position) => ({ recipe_id: id, position, instruction })))
            });
          }
        } catch (error) {
          console.error(error);
          failed.push(recipe);
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(failed));
      updateLocalCard();
      showToast(failed.length
        ? `${recipes.length - failed.length} guardadas; ${failed.length} no pudieron subirse`
        : 'Todas las recetas están guardadas en tu cuenta');
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
  els.createFamilyForm?.addEventListener('submit', createFamily);
  els.joinFamilyForm?.addEventListener('submit', joinFamily);
  els.logout?.addEventListener('click', logout);
  els.migrateLocal?.addEventListener('click', migrateLocalRecipes);
  els.copyFamilyCode?.addEventListener('click', async () => {
    if (!family?.invite_code) return;
    try {
      await navigator.clipboard.writeText(family.invite_code);
      showToast('Código familiar copiado');
    } catch {
      showToast(`Código: ${family.invite_code}`);
    }
  });

  switchAuth('login');
  loadAccount();
})();
