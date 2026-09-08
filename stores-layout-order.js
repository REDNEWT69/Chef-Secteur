(function () {
  'use strict';

  function arrangeStoresPanel() {
    var panel = document.getElementById('storesPanel');
    if (!panel) return false;

    var search = document.getElementById('storeSearch');
    var searchCard = search && search.closest ? search.closest('.card') : null;
    var toolbar = search && search.closest ? search.closest('.toolbar') : null;
    var storeList = document.getElementById('storeList');
    var kpis = document.getElementById('storeKpis');
    if (!searchCard || !toolbar || !storeList || !kpis) return false;

    /* La carte Magasins doit commencer tout en haut de l'onglet. */
    if (panel.firstElementChild !== searchCard) {
      panel.insertBefore(searchCard, panel.firstElementChild || null);
    }

    /* Ordre voulu dans la carte : recherche/actions, tuiles, liste. */
    if (kpis.parentNode !== searchCard || kpis.previousElementSibling !== toolbar) {
      searchCard.insertBefore(kpis, storeList);
    }

    kpis.style.marginTop = '18px';
    kpis.style.marginBottom = '18px';
    return true;
  }

  function apply() {
    arrangeStoresPanel();
  }

  function hookRenderStores() {
    if (window.__storeLayoutOrderHooked) return;
    if (typeof window.renderStores !== 'function') return;
    var base = window.renderStores;
    window.renderStores = function () {
      var out = base.apply(this, arguments);
      requestAnimationFrame(apply);
      setTimeout(apply, 40);
      setTimeout(apply, 160);
      return out;
    };
    window.__storeLayoutOrderHooked = true;
  }

  function boot() {
    hookRenderStores();
    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('load', boot);
  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('button') : null;
    if (button && /magasins/i.test(button.textContent || '')) {
      setTimeout(apply, 20);
      setTimeout(apply, 120);
      setTimeout(apply, 350);
    }
  }, true);

  var observer = new MutationObserver(function () {
    hookRenderStores();
    apply();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(function () {
    hookRenderStores();
    apply();
  }, 1000);
})();
