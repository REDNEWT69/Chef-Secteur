(function () {
  'use strict';

  function moveStoreSearchAboveKpis() {
    var panel = document.getElementById('storesPanel');
    if (!panel) return false;

    var kpis = document.getElementById('storeKpis');
    if (!kpis) return false;

    var search = document.getElementById('storeSearch');
    var searchCard = search && search.closest ? search.closest('.card') : null;
    if (!searchCard) return false;

    if (searchCard.nextElementSibling === kpis) return true;

    panel.insertBefore(searchCard, kpis);
    return true;
  }

  function apply() {
    moveStoreSearchAboveKpis();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }

  window.addEventListener('load', apply, { once: true });

  var observer = new MutationObserver(function () {
    apply();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  setTimeout(function () {
    apply();
    observer.disconnect();
  }, 5000);
})();
