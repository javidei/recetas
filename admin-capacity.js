(() => {
  'use strict';

  const LIMIT = 25;
  const list = document.querySelector('#account-list');
  const activeCount = document.querySelector('#active-count');
  const availableCount = document.querySelector('#available-count');
  if (!list || !activeCount || !availableCount) return;

  function updateCapacity() {
    const cards = [...list.querySelectorAll('.admin-account')];
    if (!cards.length) return;
    const active = cards.filter(card => card.querySelector('.status-pill--active, .status-pill--admin')).length;
    activeCount.textContent = `${active}/${LIMIT}`;
    availableCount.textContent = String(Math.max(0, LIMIT - active));
  }

  const observer = new MutationObserver(() => requestAnimationFrame(updateCapacity));
  observer.observe(list, { childList: true, subtree: true });
  updateCapacity();
})();
