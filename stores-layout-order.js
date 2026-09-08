(function () {
  'use strict';

  function ensureStyle() {
    if (document.getElementById('stores-layout-order-style')) return;
    var style = document.createElement('style');
    style.id = 'stores-layout-order-style';
    style.textContent = [
      '#storesSearchTop{margin:0 0 18px!important;padding:16px!important}',
      '#storesSearchTop .toolbar{margin:0!important}',
      '#storesPanel>#storeKpis{margin:22px 0 0!important}',
      '#storesPanel>.storesListCard{margin-bottom:0!important}',
      '@media(max-width:700px){#storesSearchTop{margin-bottom:14px!important;padding:14px!important}#storesPanel>#storeKpis{margin-top:18px!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  function arrangeStoresPanel() {
    var panel = document.getElementById('storesPanel');
    var search = document.getElementById('storeSearch');
    var toolbar = search && search.closest ? search.closest('.toolbar') : null;
    var storeList = document.getElementById('storeList');
    var listCard = storeList && storeList.closest ? storeList.closest('.card') : null;
    var kpis = document.getElementById('storeKpis');
    if (!panel || !toolbar || !storeList || !listCard || !kpis) return false;

    ensureStyle();

    var searchTop = document.getElementById('storesSearchTop');
    if (!searchTop) {
      searchTop = document.createElement('div');
      searchTop.id = 'storesSearchTop';
      searchTop.className = 'card';
    }

    /* Recherche + actions seules dans leur propre zone, tout en haut. */
    if (toolbar.parentNode !== searchTop) searchTop.appendChild(toolbar);
    if (panel.firstElementChild !== searchTop) panel.insertBefore(searchTop, panel.firstElementChild || null);

    /* La liste des magasins reste dans sa carte, séparée de la recherche. */
    listCard.classList.add('storesListCard');
    if (listCard.parentNode !== panel || listCard.previousElementSibling !== searchTop) {
      panel.insertBefore(listCard, searchTop.nextSibling);
    }

    /* Les 4 tuiles passent réellement tout en bas, après la liste. */
    if (kpis.parentNode !== panel || panel.lastElementChild !== kpis) {
      panel.appendChild(kpis);
    }

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

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
