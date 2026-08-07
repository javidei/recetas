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

      // Importante: solo tocamos el DOM una vez. Antes se asignaba textContent en
      // cada pasada del MutationObserver, generando otra mutación y pudiendo entrar
      // en un bucle que terminaba congelando el navegador.
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