(() => {
  'use strict';

  const accountList = document.querySelector('#account-list');
  const familyList = document.querySelector('#family-list');
  if (!familyList || !accountList) return;

  let decorateScheduled = false;

  function firstInitial(name) {
    const clean = String(name || 'Familiar').replace(' · Tú', '').trim();
    return clean.charAt(0).toUpperCase() || 'F';
  }

  function decorateAccounts() {
    accountList.querySelectorAll('.admin-account').forEach(card => {
      const avatar = card.querySelector('.admin-account__avatar');
      if (!avatar) return;

      const name = card.querySelector('.admin-account__identity strong')?.textContent || 'Familiar';
      const initial = firstInitial(name);
      const image = avatar.querySelector('img');
      let fallback = avatar.querySelector('.admin-avatar-fallback');

      // Siempre existe una única capa de respaldo con la primera letra del nombre.
      // De esta forma un usuario sin foto nunca queda como un bloque vacío.
      if (!fallback) {
        fallback = document.createElement('span');
        fallback.className = 'admin-avatar-fallback';
        avatar.prepend(fallback);
      }
      if (fallback.textContent !== initial) fallback.textContent = initial;
      avatar.dataset.initial = initial;

      // Si admin.js había dejado una letra como nodo de texto además del fallback,
      // la eliminamos para evitar iniciales duplicadas.
      [...avatar.childNodes].forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.remove();
      });

      if (!image) {
        avatar.classList.add('admin-account__avatar--fallback');
        return;
      }

      avatar.classList.remove('admin-account__avatar--fallback');
      if (image.dataset.fallbackReady === 'true') return;
      image.dataset.fallbackReady = 'true';
      image.addEventListener('error', () => {
        image.remove();
        avatar.classList.add('admin-account__avatar--fallback');
      }, { once: true });
    });
  }

  function decorateFamilies() {
    familyList.querySelectorAll('.admin-family').forEach(form => {
      const icon = form.querySelector('.admin-family__icon');

      // Las familias usan siempre un símbolo familiar reconocible, no iniciales.
      if (icon && icon.textContent !== '👨‍👩‍👧‍👦') {
        icon.textContent = '👨‍👩‍👧‍👦';
      }
      icon?.classList.remove('admin-family__icon--initials');
      icon?.classList.add('admin-family__icon--emoji');

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