const APP_VERSION = '0.1.0';
const STORAGE_KEY = 'recetario-javi-recipes-v1';
const FAVORITES_KEY = 'recetario-javi-favorites-v1';

const seedRecipes = [
  {
    id: 'pollo-patatas-horno',
    title: 'Pollo al horno con patatas',
    summary: 'Un plato sencillo de casa, jugoso y con las patatas bien impregnadas en el asado.',
    category: 'principal',
    categoryLabel: 'Plato principal',
    emoji: '🍗',
    color: '#e8c08f',
    rating: 4.8,
    difficulty: 'Fácil',
    prepMinutes: 15,
    cookMinutes: 55,
    servings: 4,
    ingredients: ['4 muslos de pollo', '4 patatas medianas', '1 cebolla', '3 dientes de ajo', '150 ml de vino blanco', 'Aceite de oliva, sal, pimienta y tomillo'],
    steps: ['Precalienta el horno a 200 °C.', 'Corta las patatas y la cebolla en rodajas y colócalas en la bandeja.', 'Añade el pollo salpimentado, los ajos, el vino y un chorrito de aceite.', 'Hornea durante 50–55 minutos, girando el pollo a mitad del cocinado.', 'Deja reposar 5 minutos antes de servir.'],
    notes: 'Si las patatas son gruesas, hornéalas 10 minutos antes de añadir el pollo.',
    tags: ['pollo', 'patata', 'horno', 'cebolla'],
    createdAt: '2026-08-06'
  },
  {
    id: 'macarrones-tomate-atun',
    title: 'Macarrones con tomate y atún',
    summary: 'La receta rápida para esos días en los que apetece comer bien sin complicarse.',
    category: 'principal',
    categoryLabel: 'Plato principal',
    emoji: '🍝',
    color: '#ed9b7b',
    rating: 4.4,
    difficulty: 'Fácil',
    prepMinutes: 5,
    cookMinutes: 18,
    servings: 2,
    ingredients: ['180 g de macarrones', '200 g de tomate triturado', '2 latas de atún', 'Media cebolla', 'Orégano', 'Sal y aceite de oliva'],
    steps: ['Cuece la pasta según el tiempo del fabricante.', 'Pocha la cebolla picada con un poco de aceite.', 'Añade el tomate, sal y orégano y cocina 10 minutos.', 'Incorpora el atún escurrido y mezcla.', 'Añade los macarrones y remueve durante un minuto.'],
    notes: 'Con un poco de queso rallado por encima gana bastante.',
    tags: ['pasta', 'macarrones', 'tomate', 'atún'],
    createdAt: '2026-08-05'
  },
  {
    id: 'tortilla-patatas',
    title: 'Tortilla de patatas',
    summary: 'Clásica, jugosa por dentro y con la cebolla bien pochada.',
    category: 'principal',
    categoryLabel: 'Plato principal',
    emoji: '🥔',
    color: '#efd17c',
    rating: 4.9,
    difficulty: 'Media',
    prepMinutes: 15,
    cookMinutes: 28,
    servings: 4,
    ingredients: ['600 g de patatas', '5 huevos', '1 cebolla', 'Aceite de oliva', 'Sal'],
    steps: ['Pela y corta las patatas en láminas finas.', 'Fríe lentamente las patatas y la cebolla hasta que estén tiernas.', 'Bate los huevos con sal y mezcla con las patatas escurridas.', 'Cuaja la tortilla por un lado, dale la vuelta y termina el otro lado.'],
    notes: 'Dejar reposar la mezcla dos minutos antes de cuajar ayuda a que quede más ligada.',
    tags: ['patata', 'huevo', 'cebolla', 'tortilla'],
    createdAt: '2026-08-04'
  },
  {
    id: 'ensalada-pollo-yogur',
    title: 'Ensalada de pollo y yogur',
    summary: 'Fresca, completa y ligera, con una salsa rápida de yogur y limón.',
    category: 'entrante',
    categoryLabel: 'Entrante',
    emoji: '🥗',
    color: '#b8cf9f',
    rating: 4.3,
    difficulty: 'Fácil',
    prepMinutes: 15,
    cookMinutes: 10,
    servings: 2,
    ingredients: ['250 g de pechuga de pollo', 'Mezcla de hojas verdes', '1 tomate', '1 yogur natural', 'Zumo de medio limón', 'Sal, pimienta y ajo en polvo'],
    steps: ['Cocina el pollo a la plancha y córtalo en tiras.', 'Mezcla el yogur con limón, sal, pimienta y ajo en polvo.', 'Coloca las hojas y el tomate en una fuente.', 'Añade el pollo templado y termina con la salsa.'],
    notes: 'También queda bien con manzana cortada fina o unas nueces.',
    tags: ['pollo', 'ensalada', 'yogur', 'tomate'],
    createdAt: '2026-08-03'
  },
  {
    id: 'tostadas-ajo-tomate',
    title: 'Tostadas de ajo y tomate',
    summary: 'Un desayuno salado, crujiente y con mucho sabor en menos de diez minutos.',
    category: 'desayuno',
    categoryLabel: 'Desayuno',
    emoji: '🍞',
    color: '#d8a477',
    rating: 4.5,
    difficulty: 'Fácil',
    prepMinutes: 4,
    cookMinutes: 4,
    servings: 1,
    ingredients: ['2 rebanadas de pan', '1 tomate maduro', 'Medio diente de ajo', 'Aceite de oliva', 'Sal'],
    steps: ['Tuesta el pan hasta que quede crujiente.', 'Frota ligeramente el ajo sobre las tostadas.', 'Ralla o aplasta el tomate.', 'Reparte el tomate y termina con aceite y una pizca de sal.'],
    notes: 'Usa poco ajo si lo vas a tomar a primera hora.',
    tags: ['pan', 'tomate', 'ajo', 'desayuno'],
    createdAt: '2026-08-02'
  },
  {
    id: 'bizcocho-yogur',
    title: 'Bizcocho de yogur',
    summary: 'El bizcocho de siempre usando el vasito de yogur como medida.',
    category: 'postre',
    categoryLabel: 'Postre',
    emoji: '🍰',
    color: '#efc6c1',
    rating: 4.7,
    difficulty: 'Fácil',
    prepMinutes: 15,
    cookMinutes: 35,
    servings: 8,
    ingredients: ['1 yogur natural', '3 huevos', '2 medidas de azúcar', '3 medidas de harina', '1 medida de aceite suave', '1 sobre de levadura', 'Ralladura de limón'],
    steps: ['Precalienta el horno a 180 °C.', 'Bate huevos y azúcar hasta que espumen.', 'Añade yogur, aceite y ralladura.', 'Incorpora harina y levadura tamizadas.', 'Vierte en un molde y hornea 30–35 minutos.'],
    notes: 'No abras el horno durante los primeros 25 minutos.',
    tags: ['bizcocho', 'yogur', 'huevo', 'postre'],
    createdAt: '2026-08-01'
  }
];

const els = {
  grid: document.querySelector('#recipe-grid'),
  search: document.querySelector('#recipe-search'),
  searchForm: document.querySelector('#search-form'),
  category: document.querySelector('#category-filter'),
  sort: document.querySelector('#sort-filter'),
  empty: document.querySelector('#empty-state'),
  summary: document.querySelector('#results-summary'),
  statRecipes: document.querySelector('#stat-recipes'),
  statFavorites: document.querySelector('#stat-favorites'),
  statQuick: document.querySelector('#stat-quick'),
  detailDialog: document.querySelector('#recipe-dialog'),
  detail: document.querySelector('#recipe-detail'),
  formDialog: document.querySelector('#form-dialog'),
  form: document.querySelector('#recipe-form'),
  formTitle: document.querySelector('#form-dialog-title'),
  toast: document.querySelector('#toast')
};

let userRecipes = readJson(STORAGE_KEY, []);
let favorites = new Set(readJson(FAVORITES_KEY, []));
let lastFocusedElement = null;

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveUserRecipes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userRecipes));
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
}

function normalizeText(value = '') {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function allRecipes() {
  return [...userRecipes, ...seedRecipes];
}

function getFilteredRecipes() {
  const term = normalizeText(els.search.value);
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
    return (!term || haystack.includes(term)) && (category === 'all' || recipe.category === category);
  });

  const sorters = {
    rating: (a, b) => Number(b.rating) - Number(a.rating),
    time: (a, b) => totalMinutes(a) - totalMinutes(b),
    newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    featured: (a, b) => (Number(favorites.has(b.id)) - Number(favorites.has(a.id))) || (Number(b.rating) - Number(a.rating))
  };
  return recipes.sort(sorters[sort] || sorters.featured);
}

function totalMinutes(recipe) {
  return Number(recipe.prepMinutes || 0) + Number(recipe.cookMinutes || 0);
}

function categoryLabel(value) {
  return ({ principal: 'Plato principal', entrante: 'Entrante', postre: 'Postre', desayuno: 'Desayuno' })[value] || 'Receta';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function recipeCard(recipe) {
  const favorite = favorites.has(recipe.id);
  const visual = recipe.imageUrl
    ? `<img src="${escapeHtml(recipe.imageUrl)}" alt="Foto de ${escapeHtml(recipe.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), {className:'recipe-emoji', textContent:'${escapeHtml(recipe.emoji || '🍲')}' }))">`
    : `<span class="recipe-emoji" aria-hidden="true">${escapeHtml(recipe.emoji || '🍲')}</span>`;

  return `
    <article class="recipe-card" tabindex="0" data-recipe-id="${escapeHtml(recipe.id)}" aria-label="Ver receta ${escapeHtml(recipe.title)}" style="--recipe-color:${escapeHtml(recipe.color || '#e8c08f')}">
      <div class="recipe-visual">
        ${visual}
        <button class="favorite-button" type="button" data-favorite-id="${escapeHtml(recipe.id)}" aria-label="${favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button>
      </div>
      <div class="recipe-body">
        <div class="recipe-kicker"><span>${escapeHtml(recipe.categoryLabel || categoryLabel(recipe.category))}</span><span>★ ${Number(recipe.rating || 0).toFixed(1)}</span></div>
        <h3>${escapeHtml(recipe.title)}</h3>
        <p>${escapeHtml(recipe.summary)}</p>
        <div class="recipe-meta">
          <span>${totalMinutes(recipe)} min</span>
          <span>${escapeHtml(recipe.difficulty || 'Fácil')}</span>
          <span>${Number(recipe.servings || 1)} raciones</span>
        </div>
      </div>
    </article>`;
}

function render() {
  const recipes = getFilteredRecipes();
  els.grid.innerHTML = recipes.map(recipeCard).join('');
  els.empty.hidden = recipes.length > 0;
  els.grid.hidden = recipes.length === 0;
  els.summary.textContent = `${recipes.length} ${recipes.length === 1 ? 'receta encontrada' : 'recetas encontradas'}`;

  const all = allRecipes();
  els.statRecipes.textContent = all.length;
  els.statFavorites.textContent = all.filter(recipe => favorites.has(recipe.id)).length;
  els.statQuick.textContent = all.filter(recipe => totalMinutes(recipe) <= 30).length;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 2400);
}

function findRecipe(id) {
  return allRecipes().find(recipe => recipe.id === id);
}

function openRecipe(id, updateHash = true) {
  const recipe = findRecipe(id);
  if (!recipe) return;
  lastFocusedElement = document.activeElement;
  els.detail.innerHTML = detailTemplate(recipe);
  els.detailDialog.showModal();
  if (updateHash) history.pushState({ recipeId: id }, '', `#receta=${encodeURIComponent(id)}`);
}

function closeRecipe(updateHash = true) {
  if (els.detailDialog.open) els.detailDialog.close();
  if (updateHash && location.hash.startsWith('#receta=')) history.pushState({}, '', location.pathname + location.search);
  lastFocusedElement?.focus?.();
}

function detailTemplate(recipe) {
  const isCustom = userRecipes.some(item => item.id === recipe.id);
  const heroVisual = recipe.imageUrl
    ? `<img class="detail-photo" src="${escapeHtml(recipe.imageUrl)}" alt="Foto de ${escapeHtml(recipe.title)}">`
    : `<div class="detail-emoji" aria-hidden="true">${escapeHtml(recipe.emoji || '🍲')}</div>`;

  return `
    <section class="detail-hero" style="--recipe-color:${escapeHtml(recipe.color || '#e8c08f')}">
      <div>
        <span class="eyebrow">${escapeHtml(recipe.categoryLabel || categoryLabel(recipe.category))}</span>
        <h2 id="recipe-dialog-title">${escapeHtml(recipe.title)}</h2>
        <p>${escapeHtml(recipe.summary)}</p>
      </div>
      ${heroVisual}
    </section>
    <div class="detail-content">
      <div class="detail-stats">
        <div><strong>★ ${Number(recipe.rating || 0).toFixed(1)}</strong><span>Nota</span></div>
        <div><strong>${Number(recipe.prepMinutes || 0)} min</strong><span>Preparación</span></div>
        <div><strong>${Number(recipe.cookMinutes || 0)} min</strong><span>Cocinado</span></div>
        <div><strong>${escapeHtml(recipe.difficulty || 'Fácil')}</strong><span>Dificultad</span></div>
        <div><strong>${Number(recipe.servings || 1)}</strong><span>Raciones</span></div>
      </div>
      <div class="detail-columns">
        <section class="detail-block">
          <h3>Ingredientes</h3>
          <ul class="ingredient-list">${(recipe.ingredients || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </section>
        <section class="detail-block">
          <h3>Preparación</h3>
          <ol class="step-list">${(recipe.steps || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
        </section>
      </div>
      ${recipe.notes ? `<div class="notes-box"><strong>Nota personal</strong><p>${escapeHtml(recipe.notes)}</p></div>` : ''}
      <div class="detail-actions">
        <button class="button button--soft" type="button" data-toggle-favorite="${escapeHtml(recipe.id)}">${favorites.has(recipe.id) ? 'Quitar de favoritas' : 'Añadir a favoritas'}</button>
        ${isCustom ? `<button class="button button--soft" type="button" data-edit-recipe="${escapeHtml(recipe.id)}">Editar</button><button class="button button--danger" type="button" data-delete-recipe="${escapeHtml(recipe.id)}">Eliminar</button>` : ''}
      </div>
    </div>`;
}

function openForm(recipe = null) {
  lastFocusedElement = document.activeElement;
  els.form.reset();
  els.formTitle.textContent = recipe ? 'Editar receta' : 'Nueva receta';
  document.querySelector('#recipe-id').value = recipe?.id || '';
  document.querySelector('#recipe-title').value = recipe?.title || '';
  document.querySelector('#recipe-summary').value = recipe?.summary || '';
  document.querySelector('#recipe-category').value = recipe?.category || 'principal';
  document.querySelector('#recipe-difficulty').value = recipe?.difficulty || 'Fácil';
  document.querySelector('#recipe-servings').value = recipe?.servings || 2;
  document.querySelector('#recipe-prep').value = recipe?.prepMinutes ?? 10;
  document.querySelector('#recipe-cook').value = recipe?.cookMinutes ?? 20;
  document.querySelector('#recipe-rating').value = recipe?.rating ?? 4;
  document.querySelector('#recipe-emoji').value = recipe?.emoji || '🍲';
  document.querySelector('#recipe-image').value = recipe?.imageUrl || '';
  document.querySelector('#recipe-ingredients').value = (recipe?.ingredients || []).join('\n');
  document.querySelector('#recipe-steps').value = (recipe?.steps || []).join('\n');
  document.querySelector('#recipe-notes').value = recipe?.notes || '';
  els.formDialog.showModal();
  setTimeout(() => document.querySelector('#recipe-title').focus(), 30);
}

function closeForm() {
  if (els.formDialog.open) els.formDialog.close();
  lastFocusedElement?.focus?.();
}

function slugify(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'receta';
}

function formToRecipe(form) {
  const data = new FormData(form);
  const existingId = data.get('recipeId');
  const uniqueId = existingId || `${slugify(data.get('title'))}-${Date.now().toString(36)}`;
  return {
    id: uniqueId,
    title: String(data.get('title')).trim(),
    summary: String(data.get('summary')).trim(),
    category: String(data.get('category')),
    categoryLabel: categoryLabel(String(data.get('category'))),
    difficulty: String(data.get('difficulty')),
    servings: Number(data.get('servings')) || 1,
    prepMinutes: Number(data.get('prepMinutes')) || 0,
    cookMinutes: Number(data.get('cookMinutes')) || 0,
    rating: Number(data.get('rating')) || 0,
    emoji: String(data.get('emoji')).trim() || '🍲',
    imageUrl: String(data.get('imageUrl')).trim(),
    ingredients: String(data.get('ingredients')).split('\n').map(value => value.trim()).filter(Boolean),
    steps: String(data.get('steps')).split('\n').map(value => value.trim()).filter(Boolean),
    notes: String(data.get('notes')).trim(),
    tags: String(data.get('ingredients')).split(/[\n,]/).map(value => normalizeText(value)).filter(Boolean),
    color: '#dcc0a7',
    createdAt: new Date().toISOString().slice(0, 10),
    userCreated: true
  };
}

function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveFavorites();
  render();
  if (els.detailDialog.open && findRecipe(id)) els.detail.innerHTML = detailTemplate(findRecipe(id));
}

function deleteRecipe(id) {
  const recipe = userRecipes.find(item => item.id === id);
  if (!recipe || !confirm(`¿Eliminar la receta “${recipe.title}”?`)) return;
  userRecipes = userRecipes.filter(item => item.id !== id);
  favorites.delete(id);
  saveUserRecipes();
  saveFavorites();
  closeRecipe();
  render();
  showToast('Receta eliminada');
}

function exportRecipes() {
  const payload = {
    app: 'Recetario de Javi',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    recipes: userRecipes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mis-recetas-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(userRecipes.length ? 'Recetas exportadas' : 'No hay recetas propias; se exportó una copia vacía');
}

els.searchForm.addEventListener('submit', event => { event.preventDefault(); render(); });
els.search.addEventListener('input', render);
els.category.addEventListener('change', render);
els.sort.addEventListener('change', render);
document.querySelectorAll('[data-search-chip]').forEach(button => button.addEventListener('click', () => { els.search.value = button.dataset.searchChip; render(); els.search.focus(); }));
document.querySelector('#clear-filters-button').addEventListener('click', () => { els.search.value = ''; els.category.value = 'all'; els.sort.value = 'featured'; render(); });
document.querySelector('#new-recipe-button').addEventListener('click', () => openForm());
document.querySelector('#export-button').addEventListener('click', exportRecipes);
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeRecipe()));
document.querySelectorAll('[data-close-form]').forEach(button => button.addEventListener('click', closeForm));

els.grid.addEventListener('click', event => {
  const favoriteButton = event.target.closest('[data-favorite-id]');
  if (favoriteButton) { event.stopPropagation(); toggleFavorite(favoriteButton.dataset.favoriteId); return; }
  const card = event.target.closest('[data-recipe-id]');
  if (card) openRecipe(card.dataset.recipeId);
});
els.grid.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-recipe-id]')) { event.preventDefault(); openRecipe(event.target.dataset.recipeId); }
});

els.detail.addEventListener('click', event => {
  const favorite = event.target.closest('[data-toggle-favorite]');
  if (favorite) toggleFavorite(favorite.dataset.toggleFavorite);
  const edit = event.target.closest('[data-edit-recipe]');
  if (edit) { const recipe = findRecipe(edit.dataset.editRecipe); closeRecipe(false); openForm(recipe); }
  const remove = event.target.closest('[data-delete-recipe]');
  if (remove) deleteRecipe(remove.dataset.deleteRecipe);
});

els.form.addEventListener('submit', event => {
  event.preventDefault();
  if (!els.form.reportValidity()) return;
  const recipe = formToRecipe(els.form);
  const index = userRecipes.findIndex(item => item.id === recipe.id);
  if (index >= 0) userRecipes[index] = recipe; else userRecipes.unshift(recipe);
  saveUserRecipes();
  closeForm();
  render();
  showToast(index >= 0 ? 'Receta actualizada' : 'Receta guardada en este navegador');
  setTimeout(() => openRecipe(recipe.id), 50);
});

els.detailDialog.addEventListener('click', event => { if (event.target === els.detailDialog) closeRecipe(); });
els.formDialog.addEventListener('click', event => { if (event.target === els.formDialog) closeForm(); });
els.detailDialog.addEventListener('cancel', event => { event.preventDefault(); closeRecipe(); });
els.formDialog.addEventListener('cancel', event => { event.preventDefault(); closeForm(); });

window.addEventListener('popstate', () => {
  const match = location.hash.match(/^#receta=(.+)$/);
  if (match) openRecipe(decodeURIComponent(match[1]), false); else if (els.detailDialog.open) closeRecipe(false);
});

render();
const initialRecipe = location.hash.match(/^#receta=(.+)$/);
if (initialRecipe) openRecipe(decodeURIComponent(initialRecipe[1]), false);

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js?v=0.1.0').catch(() => {}));
