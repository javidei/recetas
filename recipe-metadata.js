(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  if (!config) return;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  async function rest(path) {
    const current = session();
    if (!current?.access_token) return [];
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${current.access_token}`
      }
    });
    if (!response.ok) return [];
    return response.json();
  }

  async function refresh() {
    if (typeof userRecipes === 'undefined' || typeof render !== 'function') return;
    const rows = await rest('recipes?select=id,owner_id,created_at,updated_at');
    if (!rows.length) return;
    const ownerIds = [...new Set(rows.map(row => row.owner_id).filter(Boolean))];
    const accounts = ownerIds.length
      ? await rest(`recetario_accounts?id=in.(${ownerIds.join(',')})&select=id,display_name,username`)
      : [];
    const names = new Map(accounts.map(account => [account.id, account.display_name || account.username || 'Familiar']));
    const meta = new Map(rows.map(row => [row.id, row]));

    userRecipes = userRecipes.map(recipe => {
      const row = meta.get(recipe.id);
      if (!row) return recipe;
      return {
        ...recipe,
        ownerName: names.get(row.owner_id) || recipe.ownerName || 'Familiar',
        createdAt: row.created_at || recipe.createdAt,
        updatedAt: row.updated_at || row.created_at || recipe.createdAt
      };
    });

    if (typeof seedRecipes !== 'undefined') {
      seedRecipes.forEach(recipe => {
        recipe.ownerName ||= 'Javi';
        recipe.updatedAt ||= recipe.createdAt;
      });
    }
    render();
  }

  setTimeout(refresh, 700);
  setTimeout(refresh, 2200);
  setTimeout(refresh, 5000);
})();