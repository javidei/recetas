(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const MAX_AI_IMAGES = 5;
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
      const message = payload?.error?.message || payload?.error || payload?.message || payload?.msg || `Error ${response.status}`;
      return { message: String(message), payload };
    } catch {
      return { message: `Error ${response.status}`, payload: null };
    }
  }

  async function request(url, options = {}, timeout = 60000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('La IA está tardando demasiado. Prueba de nuevo con menos fotos o imágenes más nítidas.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function rpc(session, name, body = {}) {
    const response = await request(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: headers(session), body: JSON.stringify(body)
    }, 12000);
    if (!response.ok) throw new Error((await responseMessage(response)).message);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function accountRole(session) {
    const response = await request(
      `${config.supabaseUrl}/rest/v1/recetario_accounts?id=eq.${encodeURIComponent(session.user.id)}&select=role&limit=1`,
      { headers: headers(session) },
      12000
    );
    if (!response.ok) return 'member';
    return (await response.json())?.[0]?.role || 'member';
  }

  function settingsRow(payload) {
    return Array.isArray(payload) ? (payload[0] || {}) : (payload && typeof payload === 'object' ? payload : {});
  }

  function setStatus(element, text = '', error = false) {
    if (!element) return;
    element.textContent = text;
    element.dataset.error = String(error);
  }

  async function setupAdminToggle(session) {
    if (!/\/admin\.html$/i.test(location.pathname) || document.querySelector('#ai-recipe-admin-card')) return;
    const firstAdminCard = document.querySelector('.admin-card');
    if (!firstAdminCard) return;

    const card = document.createElement('section');
    card.className = 'admin-card ai-admin-card';
    card.id = 'ai-recipe-admin-card';
    card.innerHTML = `
      <div class="ai-admin-heading">
        <div>
          <span class="eyebrow">Funciones experimentales</span>
          <h2>Importar recetas con IA</h2>
          <p>La cuenta administradora siempre puede usar la IA. Este control decide si también estará disponible para el resto.</p>
        </div>
        <span class="ai-badge">IA</span>
      </div>
      <label class="ai-admin-toggle">
        <input id="ai-recipe-enabled-checkbox" type="checkbox">
        <span class="ai-admin-toggle__track" aria-hidden="true"><span></span></span>
        <span class="ai-admin-toggle__copy">
          <strong>Permitir IA al resto de usuarios</strong>
          <small id="ai-recipe-enabled-help">Cargando ajuste…</small>
        </span>
      </label>
      <div class="ai-admin-note">
        <strong>Tu acceso como administrador permanece siempre activo.</strong>
        <span>La IA permite analizar hasta cinco fotos de una misma receta y completar el formulario sin guardar automáticamente.</span>
      </div>
      <p class="ai-admin-status" id="ai-recipe-admin-status" aria-live="polite"></p>`;
    firstAdminCard.before(card);

    const checkbox = card.querySelector('#ai-recipe-enabled-checkbox');
    const help = card.querySelector('#ai-recipe-enabled-help');
    const status = card.querySelector('#ai-recipe-admin-status');

    function paint(enabled) {
      checkbox.checked = Boolean(enabled);
      help.textContent = enabled ? 'Los usuarios normales también pueden importar recetas con IA.' : 'Solo la cuenta administradora puede utilizar la IA.';
    }

    try {
      const settings = settingsRow(await rpc(session, 'get_recetario_ui_settings'));
      paint(Boolean(settings.ai_recipe_photo_enabled));
    } catch (error) {
      checkbox.disabled = true;
      help.textContent = 'Falta activar la configuración de IA en Supabase.';
      setStatus(status, 'Ejecuta supabase/014_ia_recetas.sql.', true);
      return;
    }

    checkbox.addEventListener('change', async () => {
      const desired = checkbox.checked;
      checkbox.disabled = true;
      setStatus(status, 'Guardando ajuste…');
      try {
        const result = await rpc(session, 'admin_set_ai_recipe_photo_enabled', { target_enabled: desired });
        paint(Boolean(result));
        setStatus(status, desired ? 'IA disponible para todos los usuarios.' : 'IA disponible únicamente para el administrador.');
      } catch (error) {
        paint(!desired);
        setStatus(status, `No se pudo guardar: ${error.message}`, true);
      } finally {
        checkbox.disabled = false;
      }
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo leer ${file.name || 'una imagen'}.`)); };
      image.src = url;
    });
  }

  async function compressImage(file) {
    if (!file?.size) throw new Error('Una de las fotografías está vacía.');
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name || 'Una foto'} supera 20 MB.`);
    const image = await loadImage(file);
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo preparar una fotografía.')), 'image/jpeg', .8);
    });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo convertir una fotografía.'));
      reader.readAsDataURL(blob);
    });
    return {
      mimeType: 'image/jpeg',
      imageBase64: String(dataUrl).split(',')[1] || '',
      previewUrl: URL.createObjectURL(blob),
      name: file.name || 'Fotografía'
    };
  }

  function fillInput(selector, value, options = {}) {
    const input = document.querySelector(selector);
    if (!input || value === undefined || value === null || value === '') return false;
    if (options.onlyPositive && Number(value) <= 0) return false;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.classList.add('ai-filled-field');
    setTimeout(() => input.classList.remove('ai-filled-field'), 2400);
    return true;
  }

  function chooseEmoji(recipe) {
    const text = `${recipe.title || ''} ${(recipe.ingredients || []).join(' ')}`.toLowerCase();
    if (/café|coffee/.test(text)) return '☕';
    if (/té|infusión/.test(text)) return '🍵';
    if (/zumo|batido|bebida/.test(text)) return '🧃';
    if (/pollo/.test(text)) return '🍗';
    if (/pescado|merluza|salmón|atún/.test(text)) return '🐟';
    if (/gamba|langostino|marisco/.test(text)) return '🍤';
    if (/carne|ternera|cerdo/.test(text)) return '🥩';
    if (/pizza/.test(text)) return '🍕';
    if (/pasta|macarr|espagu|spaghetti/.test(text)) return '🍝';
    if (/arroz|paella/.test(text)) return '🥘';
    if (/ensalada/.test(text)) return '🥗';
    if (/sopa|crema|guiso|potaje|gazpacho/.test(text)) return '🍲';
    if (/tarta|pastel/.test(text)) return '🍰';
    if (/galleta/.test(text)) return '🍪';
    if (/huevo|tortilla/.test(text)) return '🍳';
    return recipe.category === 'postre' ? '🍰' : recipe.category === 'desayuno' ? '🥣' : recipe.category === 'entrante' ? '🥗' : '🍲';
  }

  function applyRecipeToForm(recipe) {
    const warnings = [];
    fillInput('#recipe-title', recipe.title);
    fillInput('#recipe-summary', recipe.summary);
    fillInput('#recipe-category', recipe.category);
    fillInput('#recipe-difficulty', recipe.difficulty);
    if (!fillInput('#recipe-servings', recipe.servings, { onlyPositive: true })) warnings.push('No se detectaron las raciones.');
    fillInput('#recipe-prep', Number(recipe.prepMinutes || 0));
    fillInput('#recipe-cook', Number(recipe.cookMinutes || 0));
    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) fillInput('#recipe-ingredients', recipe.ingredients.join('\n'));
    else warnings.push('No se detectaron ingredientes con claridad.');
    if (Array.isArray(recipe.steps) && recipe.steps.length) fillInput('#recipe-steps', recipe.steps.join('\n'));
    else warnings.push('No se detectaron pasos con claridad.');
    fillInput('#recipe-notes', recipe.notes);
    fillInput('#recipe-emoji', chooseEmoji(recipe));
    if (Array.isArray(recipe.warnings)) warnings.push(...recipe.warnings.filter(Boolean));
    return [...new Set(warnings)];
  }

  function renderSelectedFiles(panel, files) {
    const gallery = panel.querySelector('#ai-recipe-previews');
    gallery.innerHTML = '';
    if (!files.length) {
      gallery.hidden = true;
      return;
    }
    gallery.hidden = false;
    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const item = document.createElement('figure');
      item.className = 'ai-recipe-preview-item';
      item.innerHTML = `<img src="${url}" alt="Fotografía ${index + 1} seleccionada"><figcaption>${index + 1}</figcaption>`;
      item.querySelector('img').addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 1000), { once: true });
      gallery.appendChild(item);
    });
  }

  async function analyzePhotos(session, files, panel) {
    const button = panel.querySelector('#ai-recipe-analyze');
    const status = panel.querySelector('#ai-recipe-status');
    if (document.querySelector('#recipe-id')?.value) {
      setStatus(status, 'Esta opción está pensada para crear una receta nueva.', true);
      return;
    }
    if (!files.length || files.length > MAX_AI_IMAGES) return;

    button.disabled = true;
    button.textContent = files.length > 1 ? `Leyendo ${files.length} fotos…` : 'Leyendo foto…';
    setStatus(status, 'Preparando las imágenes y combinando ingredientes, pasos y tiempos…');
    let prepared = [];
    try {
      prepared = await Promise.all(files.map(compressImage));
      const total = prepared.reduce((sum, image) => sum + image.imageBase64.length, 0);
      if (total > 14_000_000) throw new Error('Las fotografías juntas pesan demasiado. Prueba con menos fotos.');

      const response = await request(`${config.supabaseUrl}/functions/v1/recetario-recipe-ai`, {
        method: 'POST',
        headers: headers(session),
        body: JSON.stringify({
          images: prepared.map(image => ({ mimeType: image.mimeType, imageBase64: image.imageBase64 }))
        })
      }, 90000);

      if (!response.ok) {
        const error = await responseMessage(response);
        const warnings = Array.isArray(error.payload?.warnings) ? ` ${error.payload.warnings.join(' ')}` : '';
        const detail = error.payload?.detail ? ` (${error.payload.detail})` : '';
        throw new Error(`${error.message}${warnings}${detail}`);
      }

      const payload = await response.json();
      const warnings = applyRecipeToForm(payload.recipe || {});
      setStatus(status,
        warnings.length
          ? `Formulario rellenado con ${payload.imageCount || files.length} foto(s). Revisa: ${warnings.join(' · ')}`
          : `Formulario rellenado correctamente con ${payload.imageCount || files.length} foto(s). Revisa los datos antes de guardar.`
      );
      panel.classList.add('ai-recipe-import--success');
      document.querySelector('#recipe-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      setStatus(status, error.message || 'No se pudieron analizar las fotografías.', true);
      panel.classList.remove('ai-recipe-import--success');
    } finally {
      button.disabled = false;
      button.textContent = 'Analizar y rellenar formulario';
      prepared.forEach(image => image.previewUrl && URL.revokeObjectURL(image.previewUrl));
    }
  }

  async function setupRecipeImport(session) {
    if (/\/(cuenta|admin)\.html$/i.test(location.pathname)) return;
    const form = document.querySelector('#recipe-form');
    const header = form?.querySelector('.form-header');
    if (!form || !header || form.querySelector('#ai-recipe-import')) return;

    let settings = {};
    let role = 'member';
    try {
      [settings, role] = await Promise.all([
        rpc(session, 'get_recetario_ui_settings').then(settingsRow),
        accountRole(session)
      ]);
    } catch { return; }

    const isAdmin = role === 'admin';
    const enabledForMembers = Boolean(settings.ai_recipe_photo_enabled);
    if (!isAdmin && !enabledForMembers) return;

    const panel = document.createElement('details');
    panel.className = 'ai-recipe-import';
    panel.id = 'ai-recipe-import';
    panel.innerHTML = `
      <summary class="ai-recipe-import__summary">
        <span class="ai-recipe-import__summary-copy">
          <span class="eyebrow">IA · Experimental</span>
          <strong>Rellenar desde fotografías</strong>
          <small>${isAdmin && !enabledForMembers ? 'Disponible para ti como administrador' : 'Hasta 5 fotos de una misma receta'}</small>
        </span>
        <span class="ai-recipe-import__summary-side"><span class="ai-badge">✨ IA</span><span class="ai-recipe-chevron" aria-hidden="true">⌄</span></span>
      </summary>
      <div class="ai-recipe-import__content">
        <p class="ai-recipe-import__intro">Puedes seleccionar entre 1 y 5 fotos. Útil cuando ingredientes y preparación están en páginas distintas.</p>
        <div class="ai-recipe-import__body">
          <label class="ai-photo-picker">
            <input id="ai-recipe-photo" type="file" accept="image/jpeg,image/png,image/webp" multiple>
            <span class="ai-photo-picker__icon" aria-hidden="true">📷</span>
            <span><strong>Elegir o hacer fotos</strong><small>Máximo 5. Se reducen antes de enviarse y no se guardan como portada.</small></span>
          </label>
          <div id="ai-recipe-previews" class="ai-recipe-previews" hidden></div>
          <button class="button ai-recipe-analyze" id="ai-recipe-analyze" type="button" disabled>Analizar y rellenar formulario</button>
        </div>
        <p class="ai-recipe-status" id="ai-recipe-status" aria-live="polite">Selecciona una o varias fotos nítidas de la misma receta.</p>
        <p class="ai-recipe-privacy">La IA puede equivocarse. Comprueba cantidades, tiempos y pasos antes de guardar.</p>
      </div>`;
    header.after(panel);

    const input = panel.querySelector('#ai-recipe-photo');
    const button = panel.querySelector('#ai-recipe-analyze');
    const status = panel.querySelector('#ai-recipe-status');

    input.addEventListener('change', () => {
      let files = [...(input.files || [])];
      panel.classList.remove('ai-recipe-import--success');
      if (files.length > MAX_AI_IMAGES) {
        setStatus(status, `Has elegido ${files.length} fotos. El máximo es ${MAX_AI_IMAGES}; selecciona de nuevo.`, true);
        input.value = '';
        files = [];
      } else if (files.length) {
        setStatus(status, `${files.length} ${files.length === 1 ? 'foto seleccionada' : 'fotos seleccionadas'} · Pulsa “Analizar” para completar la receta.`);
      } else {
        setStatus(status, 'Selecciona una o varias fotos nítidas de la misma receta.');
      }
      button.disabled = !files.length;
      renderSelectedFiles(panel, files);
    });

    button.addEventListener('click', () => {
      const files = [...(input.files || [])];
      if (files.length) analyzePhotos(session, files, panel);
    });
  }

  async function init() {
    const session = readSession();
    if (!session?.access_token || !session?.user?.id) return;
    await Promise.allSettled([setupAdminToggle(session), setupRecipeImport(session)]);
  }

  init();
})();
