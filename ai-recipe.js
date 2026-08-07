(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
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

  async function request(url, options = {}, timeout = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('La IA está tardando demasiado. Prueba de nuevo con una foto más nítida o más pequeña.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function rpc(session, name, body = {}) {
    const response = await request(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify(body)
    }, 12000);
    if (!response.ok) {
      const error = await responseMessage(response);
      throw new Error(error.message);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function settingsRow(payload) {
    if (Array.isArray(payload)) return payload[0] || {};
    return payload && typeof payload === 'object' ? payload : {};
  }

  function setStatus(element, text = '', error = false) {
    if (!element) return;
    element.textContent = text;
    element.dataset.error = String(error);
  }

  async function setupAdminToggle(session) {
    if (!/\/admin\.html$/i.test(location.pathname)) return;
    if (document.querySelector('#ai-recipe-admin-card')) return;

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
          <p>Permite subir una fotografía de una receta para extraer sus datos y rellenar automáticamente el formulario. La receta nunca se guarda sin revisión.</p>
        </div>
        <span class="ai-badge">IA</span>
      </div>
      <label class="ai-admin-toggle">
        <input id="ai-recipe-enabled-checkbox" type="checkbox">
        <span class="ai-admin-toggle__track" aria-hidden="true"><span></span></span>
        <span class="ai-admin-toggle__copy">
          <strong>Activar “Rellenar desde foto con IA”</strong>
          <small id="ai-recipe-enabled-help">Cargando ajuste…</small>
        </span>
      </label>
      <div class="ai-admin-note">
        <strong>Controlado desde Administración.</strong>
        <span>Cuando esté desactivado, ningún usuario verá ni podrá utilizar la importación con IA. La clave de Gemini permanece protegida dentro de Supabase.</span>
      </div>
      <p class="ai-admin-status" id="ai-recipe-admin-status" aria-live="polite"></p>`;

    firstAdminCard.before(card);

    const checkbox = card.querySelector('#ai-recipe-enabled-checkbox');
    const help = card.querySelector('#ai-recipe-enabled-help');
    const status = card.querySelector('#ai-recipe-admin-status');

    function paint(enabled) {
      checkbox.checked = Boolean(enabled);
      help.textContent = enabled
        ? 'Los usuarios pueden usar una foto para rellenar una receta nueva.'
        : 'La función de IA está oculta y bloqueada para todos los usuarios.';
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
        setStatus(status, desired
          ? 'IA activada. Ya puede aparecer en el formulario de nueva receta.'
          : 'IA desactivada para todos los usuarios.');
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
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se ha podido leer esa imagen. Prueba con JPG, PNG o una foto tomada desde el móvil.'));
      };
      image.src = url;
    });
  }

  async function compressImage(file) {
    if (!file?.size) throw new Error('Selecciona una fotografía.');
    if (file.size > 20 * 1024 * 1024) throw new Error('La fotografía original es demasiado grande. Máximo 20 MB.');

    const image = await loadImage(file);
    const maxSide = 1800;
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
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se ha podido preparar la foto.')), 'image/jpeg', .84);
    });

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se ha podido convertir la foto.'));
      reader.readAsDataURL(blob);
    });

    return {
      mimeType: 'image/jpeg',
      imageBase64: String(dataUrl).split(',')[1] || '',
      previewUrl: URL.createObjectURL(blob)
    };
  }

  function fillInput(selector, value, options = {}) {
    const input = document.querySelector(selector);
    if (!input) return false;
    if (options.onlyPositive && Number(value) <= 0) return false;
    if (value === undefined || value === null || value === '') return false;
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
    if (/sopa|crema|guiso|potaje/.test(text)) return '🍲';
    if (/tarta|pastel/.test(text)) return '🍰';
    if (/galleta/.test(text)) return '🍪';
    if (/huevo|tortilla/.test(text)) return '🍳';
    if (recipe.category === 'postre') return '🍰';
    if (recipe.category === 'desayuno') return '🥣';
    if (recipe.category === 'entrante') return '🥗';
    return '🍲';
  }

  function applyRecipeToForm(recipe) {
    const warnings = [];
    fillInput('#recipe-title', recipe.title);
    fillInput('#recipe-summary', recipe.summary);
    fillInput('#recipe-category', recipe.category);
    fillInput('#recipe-difficulty', recipe.difficulty);
    if (!fillInput('#recipe-servings', recipe.servings, { onlyPositive: true })) warnings.push('No se han detectado las raciones.');
    fillInput('#recipe-prep', Number(recipe.prepMinutes || 0));
    fillInput('#recipe-cook', Number(recipe.cookMinutes || 0));
    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) fillInput('#recipe-ingredients', recipe.ingredients.join('\n'));
    else warnings.push('No se han detectado ingredientes con claridad.');
    if (Array.isArray(recipe.steps) && recipe.steps.length) fillInput('#recipe-steps', recipe.steps.join('\n'));
    else warnings.push('No se han detectado pasos con claridad.');
    fillInput('#recipe-notes', recipe.notes);
    fillInput('#recipe-emoji', chooseEmoji(recipe));

    if (Array.isArray(recipe.warnings)) warnings.push(...recipe.warnings.filter(Boolean));
    return [...new Set(warnings)];
  }

  async function analyzePhoto(session, file, panel) {
    const button = panel.querySelector('#ai-recipe-analyze');
    const status = panel.querySelector('#ai-recipe-status');
    const preview = panel.querySelector('#ai-recipe-preview');
    const recipeId = document.querySelector('#recipe-id')?.value;
    if (recipeId) {
      setStatus(status, 'Esta opción está pensada para crear una receta nueva, no para sustituir una ya existente.', true);
      return;
    }

    button.disabled = true;
    button.textContent = 'Leyendo receta…';
    setStatus(status, 'Preparando la foto y extrayendo ingredientes, pasos y tiempos…');
    let prepared = null;

    try {
      prepared = await compressImage(file);
      preview.src = prepared.previewUrl;
      preview.hidden = false;

      const response = await request(`${config.supabaseUrl}/functions/v1/recetario-recipe-ai`, {
        method: 'POST',
        headers: headers(session),
        body: JSON.stringify({ mimeType: prepared.mimeType, imageBase64: prepared.imageBase64 })
      }, 60000);

      if (!response.ok) {
        const error = await responseMessage(response);
        const warnings = Array.isArray(error.payload?.warnings) && error.payload.warnings.length
          ? ` ${error.payload.warnings.join(' ')}`
          : '';
        throw new Error(`${error.message}${warnings}`);
      }

      const payload = await response.json();
      const warnings = applyRecipeToForm(payload.recipe || {});
      setStatus(status,
        warnings.length
          ? `Formulario rellenado. Revisa los datos antes de guardar. Avisos: ${warnings.join(' · ')}`
          : 'Formulario rellenado correctamente. Revisa los datos y guarda la receta cuando estés conforme.'
      );
      panel.classList.add('ai-recipe-import--success');
      document.querySelector('#recipe-title')?.focus({ preventScroll: true });
      document.querySelector('#recipe-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      setStatus(status, error.message || 'No se ha podido analizar la fotografía.', true);
      panel.classList.remove('ai-recipe-import--success');
    } finally {
      button.disabled = false;
      button.textContent = 'Analizar y rellenar formulario';
      if (prepared?.previewUrl) setTimeout(() => URL.revokeObjectURL(prepared.previewUrl), 120000);
    }
  }

  async function setupRecipeImport(session) {
    if (/\/(cuenta|admin)\.html$/i.test(location.pathname)) return;
    const form = document.querySelector('#recipe-form');
    const header = form?.querySelector('.form-header');
    if (!form || !header || form.querySelector('#ai-recipe-import')) return;

    let settings;
    try {
      settings = settingsRow(await rpc(session, 'get_recetario_ui_settings'));
    } catch {
      return; // Compatibilidad mientras no se haya ejecutado 014.
    }
    if (!settings.ai_recipe_photo_enabled) return;

    const panel = document.createElement('section');
    panel.className = 'ai-recipe-import';
    panel.id = 'ai-recipe-import';
    panel.innerHTML = `
      <div class="ai-recipe-import__heading">
        <div>
          <span class="eyebrow">IA · Experimental</span>
          <strong>Rellenar desde una fotografía</strong>
          <p>Fotografía una receta de un libro, revista o papel y la IA intentará completar este formulario por ti.</p>
        </div>
        <span class="ai-badge">✨ IA</span>
      </div>
      <div class="ai-recipe-import__body">
        <label class="ai-photo-picker">
          <input id="ai-recipe-photo" type="file" accept="image/*">
          <span class="ai-photo-picker__icon" aria-hidden="true">📷</span>
          <span><strong>Elegir o hacer una foto</strong><small>La imagen se reduce antes de enviarse y no se guarda como portada.</small></span>
        </label>
        <img id="ai-recipe-preview" class="ai-recipe-preview" alt="Vista previa de la receta fotografiada" hidden>
        <button class="button ai-recipe-analyze" id="ai-recipe-analyze" type="button" disabled>Analizar y rellenar formulario</button>
      </div>
      <p class="ai-recipe-status" id="ai-recipe-status" aria-live="polite">Selecciona una imagen nítida en la que se lean título, ingredientes y preparación.</p>
      <p class="ai-recipe-privacy">La IA puede equivocarse. Comprueba cantidades, tiempos y pasos antes de guardar.</p>`;

    header.after(panel);

    const input = panel.querySelector('#ai-recipe-photo');
    const button = panel.querySelector('#ai-recipe-analyze');
    const status = panel.querySelector('#ai-recipe-status');
    const preview = panel.querySelector('#ai-recipe-preview');

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      button.disabled = !file;
      panel.classList.remove('ai-recipe-import--success');
      if (!file) {
        preview.hidden = true;
        setStatus(status, 'Selecciona una imagen nítida en la que se lean título, ingredientes y preparación.');
        return;
      }
      setStatus(status, `${file.name || 'Foto seleccionada'} · Pulsa “Analizar” para rellenar la receta.`);
    });

    button.addEventListener('click', () => {
      const file = input.files?.[0];
      if (file) analyzePhoto(session, file, panel);
    });
  }

  async function init() {
    const session = readSession();
    if (!session?.access_token || !session?.user?.id) return;
    await Promise.allSettled([
      setupAdminToggle(session),
      setupRecipeImport(session)
    ]);
  }

  init();
})();
