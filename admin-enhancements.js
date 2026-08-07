(() => {
  'use strict';

  const config = window.RECETARIO_CONFIG;
  const SESSION_KEY = 'recetario-javi-supabase-session-v1';
  const accountList = document.querySelector('#account-list');
  const familyList = document.querySelector('#family-list');
  const refresh = document.querySelector('#refresh-button');
  if (!config || !familyList || !accountList) return;

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
      let message = `Error ${response.status}`;
      try { const data = await response.json(); message = data.message || data.error || message; } catch {}
      throw new Error(message);
    }
  }

  function initials(name) {
    return String(name || 'Familia').trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'F';
  }

  function decorateAccounts() {
    accountList.querySelectorAll('.admin-account').forEach(card => {
      const avatar = card.querySelector('.admin-account__avatar');
      const name = card.querySelector('.admin-account__identity strong')?.textContent?.replace(' · Tú', '').trim() || 'F';
      if (!avatar || avatar.querySelector('.admin-avatar-fallback')) return;
      const fallback = document.createElement('span');
      fallback.className = 'admin-avatar-fallback';
      fallback.textContent = initials(name);
      avatar.prepend(fallback);
      const image = avatar.querySelector('img');
      if (image) image.addEventListener('error', () => image.remove(), { once: true });
    });
  }

  function decorateFamilies() {
    familyList.querySelectorAll('.admin-family').forEach(form => {
      const name = form.querySelector('.admin-family__info strong')?.textContent?.trim() || 'Familia';
      const icon = form.querySelector('.admin-family__icon');
      if (icon) {
        icon.textContent = initials(name);
        icon.classList.add('admin-family__icon--initials');
      }
      if (form.querySelector('[data-admin-delete-family]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button admin-family__delete';
      button.dataset.adminDeleteFamily = form.dataset.familyId;
      button.textContent = 'Eliminar familia';
      form.appendChild(button);
    });
  }

  function decorate() {
    decorateAccounts();
    decorateFamilies();
  }

  familyList.addEventListener('click', async event => {
    const button = event.target.closest('[data-admin-delete-family]');
    if (!button) return;
    const form = button.closest('.admin-family');
    const name = form?.querySelector('.admin-family__info strong')?.textContent?.trim() || 'esta familia';
    if (!confirm(`¿Eliminar “${name}”? Las recetas compartidas con este grupo pasarán a ser privadas.`)) return;
    button.disabled = true;
    try {
      await rpc('delete_recipe_family', { target_family_id: button.dataset.adminDeleteFamily });
      refresh?.click();
    } catch (error) {
      button.disabled = false;
      alert(`No se pudo eliminar la familia: ${error.message}`);
    }
  });

  const observer = new MutationObserver(decorate);
  observer.observe(accountList, { childList: true, subtree: true });
  observer.observe(familyList, { childList: true, subtree: true });
  decorate();
})();