(() => {
  'use strict';

  const AI_ENDPOINT_FRAGMENT = '/functions/v1/recetario-recipe-ai';
  const nativeFetch = window.fetch.bind(window);

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function cleanIngredient(value = '') {
    return String(value)
      .replace(/^\s*[\d.,/¼½¾⅓⅔⅛⅜⅝⅞]+\s*/u, '')
      .replace(/\b(?:g|kg|mg|ml|cl|dl|l|litros?|cucharadas?|cucharaditas?|tazas?|unidades?|ud\.?|gr)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildQueries(recipe = {}) {
    const title = String(recipe.title || '').trim();
    const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .map(cleanIngredient)
      .filter(Boolean)
      .slice(0, 3);

    return [...new Set([
      title ? `${title} food` : '',
      title,
      title && ingredients.length ? `${title} ${ingredients.join(' ')}` : '',
      ingredients.length ? `${ingredients.join(' ')} dish food` : ''
    ].filter(Boolean))];
  }

  async function openverseSearch(query) {
    const url = new URL('https://api.openverse.org/v1/images/');
    url.searchParams.set('q', query);
    url.searchParams.set('license', 'cc0,pdm');
    url.searchParams.set('categories', 'photograph');
    url.searchParams.set('page_size', '12');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await nativeFetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store'
      });
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload?.results) ? payload.results : [];
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  function chooseCandidate(results = []) {
    return results
      .filter(item => !item?.mature && (item?.thumbnail || item?.url))
      .map(item => {
        const width = Number(item.width || 0);
        const height = Number(item.height || 0);
        const ratio = width && height ? width / height : 1.3;
        const ratioScore = Math.abs(ratio - 1.35);
        const sizeScore = width && height ? Math.min(width * height, 20_000_000) / 20_000_000 : 0;
        return { item, score: ratioScore - sizeScore * 0.15 };
      })
      .sort((a, b) => a.score - b.score)[0]?.item || null;
  }

  async function findSuggestedImage(recipe) {
    for (const query of buildQueries(recipe)) {
      const candidate = chooseCandidate(await openverseSearch(query));
      if (!candidate) continue;
      return {
        imageUrl: candidate.thumbnail || candidate.url,
        originalUrl: candidate.url || candidate.thumbnail,
        landingUrl: candidate.foreign_landing_url || candidate.detail_url || '',
        title: candidate.title || recipe.title || 'Imagen de receta',
        license: String(candidate.license || '').toUpperCase(),
        query
      };
    }
    return null;
  }

  function installStyles() {
    if (document.querySelector('#ai-image-suggestion-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-image-suggestion-styles';
    style.textContent = `
      .ai-suggested-photo{margin-top:14px;padding:12px;border:1px solid rgba(143,61,47,.2);border-radius:18px;background:rgba(255,255,255,.72);display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:center}
      .ai-suggested-photo[hidden]{display:none!important}
      .ai-suggested-photo img{width:96px;height:82px;object-fit:cover;border-radius:13px;background:#eee}
      .ai-suggested-photo strong,.ai-suggested-photo small{display:block}
      .ai-suggested-photo small{margin-top:4px;color:var(--muted,#786b64);line-height:1.35}
      .ai-suggested-photo__actions{margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .ai-suggested-photo__actions button,.ai-suggested-photo__actions a{font:inherit;font-size:.82rem;font-weight:800;color:#8f3d2f;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}
      @media(max-width:560px){.ai-suggested-photo{grid-template-columns:82px 1fr}.ai-suggested-photo img{width:82px;height:74px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePreviewHolder() {
    const panel = document.querySelector('#ai-recipe-import .ai-recipe-import__content');
    if (!panel) return null;
    let holder = panel.querySelector('#ai-suggested-photo');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'ai-suggested-photo';
      holder.className = 'ai-suggested-photo';
      holder.hidden = true;
      const privacy = panel.querySelector('.ai-recipe-privacy');
      privacy?.before(holder);
    }
    return holder;
  }

  function clearSuggestion(holder, clearInput = false) {
    if (holder) {
      holder.hidden = true;
      holder.innerHTML = '';
    }
    if (clearInput) {
      const imageInput = document.querySelector('#recipe-image');
      if (imageInput?.dataset.aiSuggested === 'true') {
        imageInput.value = '';
        delete imageInput.dataset.aiSuggested;
        imageInput.dispatchEvent(new Event('input', { bubbles: true }));
        imageInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  async function suggestImage(recipe) {
    const imageInput = document.querySelector('#recipe-image');
    const holder = ensurePreviewHolder();
    if (!imageInput || !holder || document.querySelector('#recipe-id')?.value) return;
    if (imageInput.value.trim() && imageInput.dataset.aiSuggested !== 'true') return;

    holder.hidden = false;
    holder.innerHTML = '<div></div><div><strong>Buscando una foto para la receta…</strong><small>Se buscan fotografías CC0 o de dominio público según el plato y sus ingredientes.</small></div>';

    const suggestion = await findSuggestedImage(recipe);
    if (!suggestion) {
      holder.innerHTML = '<div>🖼️</div><div><strong>No he encontrado una foto suficientemente clara.</strong><small>Puedes añadir una propia o pegar una URL manualmente.</small></div>';
      return;
    }

    imageInput.value = suggestion.imageUrl;
    imageInput.dataset.aiSuggested = 'true';
    imageInput.dispatchEvent(new Event('input', { bubbles: true }));
    imageInput.dispatchEvent(new Event('change', { bubbles: true }));

    const sourceLink = suggestion.landingUrl
      ? `<a href="${escapeHtml(suggestion.landingUrl)}" target="_blank" rel="noopener noreferrer">Ver origen</a>`
      : '';

    holder.innerHTML = `
      <img src="${escapeHtml(suggestion.imageUrl)}" alt="Foto sugerida para ${escapeHtml(recipe.title || 'la receta')}">
      <div>
        <strong>Foto sugerida añadida a la receta</strong>
        <small>Encontrada según “${escapeHtml(suggestion.query)}”. Imagen ${escapeHtml(suggestion.license || 'CC0/dominio público')} desde Openverse. Revísala antes de guardar.</small>
        <div class="ai-suggested-photo__actions">
          ${sourceLink}
          <button type="button" data-remove-ai-photo>Quitar foto sugerida</button>
        </div>
      </div>`;

    holder.querySelector('[data-remove-ai-photo]')?.addEventListener('click', () => clearSuggestion(holder, true));
    holder.querySelector('img')?.addEventListener('error', () => clearSuggestion(holder, true), { once: true });
  }

  installStyles();

  window.fetch = async function recetarioAiImageFetch(input, options) {
    const response = await nativeFetch(input, options);
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (raw && raw.includes(AI_ENDPOINT_FRAGMENT) && response.ok) {
        const payload = await response.clone().json();
        if (payload?.recipe?.isRecipe !== false) {
          setTimeout(() => suggestImage(payload.recipe || {}), 0);
        }
      }
    } catch {
      // La búsqueda de foto nunca debe impedir la importación de la receta.
    }
    return response;
  };
})();
