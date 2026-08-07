(() => {
  'use strict';

  const DEFAULT_PREFIX = 'recetario-default:';
  const DEFAULT_KEYS = new Set([
    'pollo-patatas-horno',
    'macarrones-tomate-atun',
    'tortilla-patatas',
    'ensalada-pollo-yogur',
    'tostadas-ajo-tomate',
    'bizcocho-yogur'
  ]);

  const previousAllRecipes = allRecipes;
  const previousRecipeCard = recipeCard;
  const previousDetailTemplate = detailTemplate;
  const previousOpenRecipe = openRecipe;

  function defaultKey(recipe) {
    const marker = (recipe?.tags || []).find(tag => String(tag).startsWith(DEFAULT_PREFIX));
    if (marker) return String(marker).slice(DEFAULT_PREFIX.length);
    if (DEFAULT_KEYS.has(recipe?.id)) return recipe.id;
    return recipe?.defaultKey || '';
  }

  function isDefaultRecipe(recipe) {
    return Boolean(recipe?.isDefault || defaultKey(recipe));
  }

  function decorateRemoteDefaults() {
    userRecipes.forEach(recipe => {
      const key = defaultKey(recipe);
      if (!key || recipe.storageMode !== 'remote') return;
      recipe.isDefault = true;
      recipe.defaultKey = key;
      recipe.canEdit = false;
      recipe.ownerName = 'Recetario';
    });
  }

  allRecipes = function defaultAwareAllRecipes() {
    decorateRemoteDefaults();
    const remoteDefaultKeys = new Set(
      userRecipes
        .filter(recipe => recipe.storageMode === 'remote' && isDefaultRecipe(recipe))
        .map(defaultKey)
        .filter(Boolean)
    );

    const fallbackDefaults = seedRecipes
      .filter(recipe => !remoteDefaultKeys.has(recipe.id))
      .map(recipe => ({ ...recipe, isDefault: true, defaultKey: recipe.id }));

    return [...userRecipes, ...fallbackDefaults];
  };

  recipeCard = function defaultAwareRecipeCard(recipe) {
    let html = previousRecipeCard(recipe);
    if (!isDefaultRecipe(recipe)) return html;

    html = html.replace(
      /<div class="recipe-provenance"><strong>[\s\S]*?<\/strong>/,
      '<div class="recipe-provenance"><strong class="default-recipe-label">Receta por defecto</strong>'
    );
    return html;
  };

  detailTemplate = function defaultAwareDetailTemplate(recipe) {
    let html = previousDetailTemplate(recipe);
    if (!isDefaultRecipe(recipe)) return html;

    html = html.replace(
      /<div class="detail-provenance"><strong>[\s\S]*?<\/strong>/,
      '<div class="detail-provenance"><strong class="default-recipe-label">Receta por defecto</strong>'
    );

    // Las recetas base son comunes a todo el recetario y no se editan ni borran.
    html = html.replace(/<button class="button button--soft" type="button" data-edit-recipe[\s\S]*?<\/button>/, '');
    html = html.replace(/<button class="button button--danger" type="button" data-delete-recipe[\s\S]*?<\/button>/, '');
    return html;
  };

  function fixDetailLayout() {
    const detail = document.querySelector('#recipe-detail');
    if (!detail) return;
    const stats = detail.querySelector('.detail-stats');
    const sharing = detail.querySelector('.shared-recipe-note');
    if (stats && sharing && stats.nextElementSibling !== sharing) stats.after(sharing);
  }

  openRecipe = function defaultAwareOpenRecipe(id, updateHash = true) {
    previousOpenRecipe(id, updateHash);
    requestAnimationFrame(fixDetailLayout);
    setTimeout(fixDetailLayout, 40);
  };

  // Corrige también una ficha que ya estuviera abierta mientras llegaban los
  // datos de Supabase.
  const detailObserver = new MutationObserver(() => fixDetailLayout());
  if (els?.detail) detailObserver.observe(els.detail, { childList: true, subtree: true });

  // Fuerza un render para marcar también los seis ejemplos locales como
  // "Receta por defecto" mientras todavía no se haya ejecutado el SQL 011.
  try { render(); } catch { /* La carga normal realizará el siguiente render. */ }
})();