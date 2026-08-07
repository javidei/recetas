(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const list = document.querySelector('#families-list');
  const createForm = document.querySelector('#create-family-form');
  const joinForm = document.querySelector('#join-family-form');
  const adminLink = document.querySelector('#admin-link');
  const message = document.querySelector('#family-message');
  if (!config || !list) return;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  async function rpc(name, body) {
    const current = session();
    if (!current?.access_token) throw new Error('Tu sesión ha caducado.');
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${current.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    if (!response.ok) {
      let text = `Error ${response.status}`;
      try { const data = await response.json(); text = data.message || data.error || text; } catch {}
      throw new Error(text);
    }
  }

  function isAdmin() {
    return Boolean(adminLink && !adminLink.hidden);
  }

  function setFormsDisabled(disabled) {
    [createForm, joinForm].forEach(form => {
      form?.querySelectorAll('input,button').forEach(control => { control.disabled = disabled; });
    });
  }

  function decorate() {
    const cards = [...list.querySelectorAll('.family-group-card')];
    const admin = isAdmin();
    const reached = !admin && cards.length >= 3;
    setFormsDisabled(reached);

    let limitNote = document.querySelector('#family-limit-note');
    if (reached) {
      if (!limitNote) {
        limitNote = document.createElement('p');
        limitNote.id = 'family-limit-note';
        limitNote.className = 'family-limit-note';
        document.querySelector('.family-actions-grid')?.after(limitNote);
      }
      limitNote.textContent = 'Has alcanzado el límite de 3 familias. Para entrar o crear otra tendrás que eliminar primero una de las tuyas.';
    } else {
      limitNote?.remove();
    }

    cards.forEach(card => {
      if (card.querySelector('[data-delete-family]')) return;
      const role = card.querySelector('.role-badge')?.textContent?.trim();
      if (!admin && role !== 'Propietario') return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button danger-text family-delete-button';
      button.dataset.deleteFamily = card.dataset.familyId;
      button.textContent = 'Eliminar familia';
      card.appendChild(button);
    });
  }

  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-family]');
    if (!button) return;
    const card = button.closest('.family-group-card');
    const name = card?.querySelector('h3')?.textContent?.trim() || 'esta familia';
    if (!confirm(`¿Eliminar “${name}”? Las recetas compartidas con este grupo pasarán a ser privadas.`)) return;
    button.disabled = true;
    try {
      await rpc('delete_recipe_family', { target_family_id: button.dataset.deleteFamily });
      location.reload();
    } catch (error) {
      button.disabled = false;
      if (message) {
        message.textContent = error.message;
        message.dataset.error = 'true';
      }
    }
  });

  const observer = new MutationObserver(decorate);
  observer.observe(list, { childList: true, subtree: true });
  if (adminLink) observer.observe(adminLink, { attributes: true, attributeFilter: ['hidden'] });
  decorate();
})();