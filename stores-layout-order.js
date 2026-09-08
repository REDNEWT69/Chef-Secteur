(function () {
  'use strict';

  var retryTimer = null;
  var retryCount = 0;
  var MAX_RETRIES = 30;

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
      loadScript('sector-admin-script', './sector-admin.js?rev=20260909-5', function () {
        scheduleApply();
      });
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

  function normalizeLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function removeRedundantStoreActions(toolbar) {
    if (!toolbar) return;
    Array.prototype.slice.call(toolbar.querySelectorAll('button')).forEach(function (button) {
      var label = normalizeLabel(button.textContent);
      var isRegionButton = button.id === 'regionDiscover' || label === '+ ajouter une région' || label === '＋ ajouter une région' || label === 'ajouter une région';
      var isLegacyAddButton = label === '+ ajouter' || label === '＋ ajouter' || label === 'ajouter';
      if (isRegionButton || isLegacyAddButton) button.remove();
    });
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
    removeRedundantStoreActions(toolbar);

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
    hookRenderStores();
    return arrangeStoresPanel();
  }

  function scheduleApply() {
    requestAnimationFrame(function () {
      apply();
      setTimeout(apply, 40);
      setTimeout(apply, 160);
    });
  }

  function hookRenderStores() {
    if (window.__storeLayoutOrderHooked) return true;
    if (typeof window.renderStores !== 'function') return false;
    var base = window.renderStores;
    window.renderStores = function () {
      var out = base.apply(this, arguments);
      scheduleApply();
      return out;
    };
    window.__storeLayoutOrderHooked = true;
    return true;
  }

  function retryUntilReady() {
    if (apply()) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      return;
    }
    retryCount += 1;
    if (retryCount >= MAX_RETRIES) return;
    retryTimer = setTimeout(retryUntilReady, 100);
  }

  function boot() {
    retryCount = 0;
    retryUntilReady();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.addEventListener('load', scheduleApply, { once: true });

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('button') : null;
    if (button && /magasins/i.test(button.textContent || '')) scheduleApply();
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) scheduleApply();
  });
})();
