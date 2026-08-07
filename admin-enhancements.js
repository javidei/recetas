(() => {
  'use strict';

  const accountList = document.querySelector('#account-list');
  const familyList = document.querySelector('#family-list');
  if (!familyList || !accountList) return;

  let decorateScheduled = false;

  function initials(name) {
    return String(name || 'Familia')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('') || 'F';
  }

  function decorateAccounts() {
    accountList.querySelectorAll('.admin-account').forEach(card => {
      const avatar = card.querySelector('.admin-account__avatar');
      const image = avatar?.querySelector('img');
      const name = card.querySelector('.admin-account__identity strong')?.textContent?.replace(' · Tú', '').trim() || 'F';
      if (!avatar) return;

      // Cuando no hay foto, admin.js ya pinta una única inicial dentro del avatar.
      // No añadimos un segundo fallback porque era lo que producía S/S, B/B, etc.
      if (!image) return;

      // Si hay foto, dejamos una inicial detrás de la imagen. Solo se verá si
      // la fotografía falla, igual que en el resto de pantallas del Recetario.
      if (!avatar.querySelector('.admin-avatar-fallback')) {
        const fallback = document.createElement('span');
        fallback.className = 'admin-avatar-fallback';
        fallback.textContent = initials(name);
        avatar.prepend(fallback);
      }

      if (image.dataset.fallbackReady === 'true') return;
      image.dataset.fallbackReady = 'true';
      image.addEventListener('error', () => image.remove(), { once: true });
    });
  }

  function decorateFamilies() {
    familyList.querySelectorAll('.admin-family').forEach(form => {
      const name = form.querySelector('.admin-family__info strong')?.textContent?.trim() || 'Familia';
      const icon = form.querySelector('.admin-family__icon');

      if (icon && !icon.classList.contains('admin-family__icon--initials')) {
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

  function scheduleDecorate() {
    if (decorateScheduled) return;
    decorateScheduled = true;
    requestAnimationFrame(() => {
      decorateScheduled = false;
      decorate();
    });
  }

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(accountList, { childList: true, subtree: true });
  observer.observe(familyList, { childList: true, subtree: true });
  scheduleDecorate();
})();