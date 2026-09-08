(function () {
  'use strict';

  function loadScript(id, src, onload) {
    if (document.getElementById(id)) { if (onload) onload(); return; }
    var script = document.createElement('script');
    script.id = id;
    script.src = src;
    if (onload) script.onload = onload;
    document.head.appendChild(script);
  }

  if (!document.getElementById('planning-autofix-script')) {
    var hotfix = document.createElement('script');
    hotfix.id = 'planning-autofix-script';
    hotfix.src = './planning-autofix.js?rev=20260908-1';
    document.head.appendChild(hotfix);
  }

  loadScript('boulanger-national-script', './boulanger-national.js?rev=20260908-1', function () {
    loadScript('national-sectors-script', './national-sectors.js?rev=20260908-1', function () {
      loadScript('sector-admin-script', './sector-admin.js?rev=20260909-2');
    });
  });

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

    if (toolbar.parentNode !== searchTop) searchTop.appendChild(toolbar);
    if (panel.firstElementChild !== searchTop) panel.insertBefore(searchTop, panel.firstElementChild || null);

    listCard.classList.add('storesListCard');
    if (listCard.parentNode !== panel || listCard.previousElementSibling !== searchTop) {
      panel.insertBefore(listCard, searchTop.nextSibling);
    }

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
