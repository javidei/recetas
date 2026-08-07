(() => {
  'use strict';

  function configureRatingField() {
    const input = document.querySelector('#recipe-rating');
    if (!input) return;

    input.min = '0';
    input.max = '5';
    input.step = '0.1';
    input.inputMode = 'decimal';
    input.placeholder = 'Ej.: 4.3';
    input.defaultValue = '';

    let help = document.querySelector('#recipe-rating-help');
    if (!help) {
      help = document.createElement('small');
      help.id = 'recipe-rating-help';
      help.textContent = 'De 0 a 5. Puedes usar cualquier decimal, por ejemplo 4.3 o 4.8.';
      input.insertAdjacentElement('afterend', help);
    }
    input.setAttribute('aria-describedby', help.id);
  }

  function wrapOpenForm() {
    if (typeof window.openForm !== 'function' || window.openForm.__ratingEnhanced) return;
    const previous = window.openForm;
    const enhanced = function ratingOpenForm(recipe = null) {
      previous(recipe);
      const input = document.querySelector('#recipe-rating');
      if (input && !recipe) input.value = '';
    };
    enhanced.__ratingEnhanced = true;
    window.openForm = enhanced;
  }

  function normalizeRatingBeforeSubmit() {
    const form = document.querySelector('#recipe-form');
    if (!form || form.dataset.ratingEnhanced === 'true') return;
    form.dataset.ratingEnhanced = 'true';
    form.addEventListener('submit', () => {
      const input = document.querySelector('#recipe-rating');
      if (!input || !input.value) return;
      const value = Number(String(input.value).replace(',', '.'));
      if (Number.isFinite(value)) input.value = String(Math.min(5, Math.max(0, Math.round(value * 10) / 10)));
    }, true);
  }

  configureRatingField();
  wrapOpenForm();
  normalizeRatingBeforeSubmit();

  window.addEventListener('load', () => {
    configureRatingField();
    wrapOpenForm();
    normalizeRatingBeforeSubmit();
  });
})();
