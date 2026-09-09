(function () {
  'use strict';

  var retryTimer = null;
  var retryCount = 0;
  var MAX_RETRIES = 30;
  var regionResultsObserver = null;
  var observedRegionResults = null;
  var moduleRevision = '';

  try {
    var currentScript = document.currentScript;
    if (currentScript && currentScript.src) {
      moduleRevision = new URL(currentScript.src, window.location.href).searchParams.get('rev') || '';
    }
  } catch (e) {}

  function withModuleRev(path) {
    if (!moduleRevision) return path;
    return path + (path.indexOf('?') === -1 ? '?' : '&') + 'rev=' + encodeURIComponent(moduleRevision);
  }

  function loadScript(id, src, onload) {
    if (document.getElementById(id)) { if (onload) onload(); return; }
    var script = document.createElement('script');
    script.id = id;
    script.src = withModuleRev(src);
    if (onload) script.onload = onload;
    document.head.appendChild(script);
  }

  loadScript('store-runner-branding-script', './store-runner-branding.js');

  if (!document.getElementById('planning-autofix-script')) {
    var hotfix = document.createElement('script');
    hotfix.id = 'planning-autofix-script';
    hotfix.src = withModuleRev('./planning-autofix.js');
    document.head.appendChild(hotfix);
  }

  loadScript('boulanger-national-script', './boulanger-national.js', function () {
    loadScript('national-sectors-script', './national-sectors.js', function () {
      loadScript('sector-admin-script', './sector-admin.js', function () {
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
      '#regionStoreChooser{margin:14px 0;padding:14px;border:1px solid rgba(120,125,140,.16);border-radius:18px;background:rgba(255,255,255,.72)}',
      '#regionStoreChooser .regionChooserTitle{font-weight:800;font-size:14px;margin-bottom:9px}',
      '#regionStoreChooser .regionChooserRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '#regionStoreChooser select{min-width:180px;flex:1}',
      '#regionStoreChooser .regionChooserCount{font-size:11px;color:#747981;margin-top:8px}',
      '@media(max-width:700px){#storesSearchTop{margin-bottom:14px!important;padding:14px!important}#storesPanel>#storeKpis{margin-top:18px!important}#regionStoreChooser .regionChooserRow>*{width:100%}}'
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

  function regionBrands() {
    if (window.RegionStores && Array.isArray(window.RegionStores.BRANDS)) return window.RegionStores.BRANDS.slice();
    return ['Boulanger', 'Darty', 'Fnac', 'Conforama', 'Cuisinella', 'Carrefour'];
  }

  function cardBrand(card) {
    var text = normalizeLabel(card && card.textContent);
    var brands = regionBrands();
    for (var i = 0; i < brands.length; i += 1) {
      if (text.indexOf(normalizeLabel(brands[i])) !== -1) return brands[i];
    }
    return '';
  }

  function dispatchSelectionChange(input) {
    if (!input) return;
    try { input.dispatchEvent(new Event('change', { bubbles: true })); }
    catch (e) { var evt = document.createEvent('Event'); evt.initEvent('change', true, false); input.dispatchEvent(evt); }
  }

  function applyRegionStoreFilter() {
    var chooser = document.getElementById('regionStoreChooser');
    var results = document.querySelector('.regionDialog .regionResults');
    if (!chooser || !results) return;
    var select = chooser.querySelector('#regionResultBrandFilter');
    var wanted = select ? select.value : 'all';
    var cards = Array.prototype.slice.call(results.querySelectorAll('.regionResult'));
    var visible = 0;
    cards.forEach(function (card) {
      var brand = cardBrand(card);
      var show = wanted === 'all' || brand === wanted;
      card.hidden = !show;
      card.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });
    var count = chooser.querySelector('.regionChooserCount');
    if (count) count.textContent = visible + ' magasin' + (visible > 1 ? 's' : '') + ' affiché' + (visible > 1 ? 's' : '');
  }

  function ensureRegionStoreChooser() {
    var dialog = document.querySelector('.regionDialog');
    var results = dialog && dialog.querySelector('.regionResults');
    if (!dialog || !results) {
      if (regionResultsObserver && observedRegionResults && !observedRegionResults.isConnected) {
        regionResultsObserver.disconnect();
        regionResultsObserver = null;
        observedRegionResults = null;
      }
      return false;
    }
    ensureStyle();

    var chooser = document.getElementById('regionStoreChooser');
    if (!chooser) {
      chooser = document.createElement('section');
      chooser.id = 'regionStoreChooser';
      chooser.innerHTML = '<div class="regionChooserTitle">Choisir mes magasins</div><div class="regionChooserRow"><select id="regionResultBrandFilter" aria-label="Filtrer les résultats par enseigne"><option value="all">Toutes les enseignes</option></select><button type="button" class="secondary" id="regionSelectVisible">Sélectionner les visibles</button><button type="button" class="secondary" id="regionClearSelection">Tout désélectionner</button></div><div class="regionChooserCount">0 magasin affiché</div>';
      results.parentNode.insertBefore(chooser, results);
      var select = chooser.querySelector('#regionResultBrandFilter');
      regionBrands().forEach(function (brand) {
        var option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        select.appendChild(option);
      });
      select.addEventListener('change', applyRegionStoreFilter);
      chooser.querySelector('#regionSelectVisible').addEventListener('click', function () {
        Array.prototype.slice.call(results.querySelectorAll('.regionResult')).forEach(function (card) {
          if (card.hidden || card.style.display === 'none') return;
          var input = card.querySelector('input[data-select]');
          if (input && !input.disabled && !input.checked) { input.checked = true; dispatchSelectionChange(input); }
        });
        applyRegionStoreFilter();
      });
      chooser.querySelector('#regionClearSelection').addEventListener('click', function () {
        Array.prototype.slice.call(results.querySelectorAll('input[data-select]:checked')).forEach(function (input) {
          input.checked = false;
          dispatchSelectionChange(input);
        });
        applyRegionStoreFilter();
      });
    }

    if (observedRegionResults !== results) {
      if (regionResultsObserver) regionResultsObserver.disconnect();
      regionResultsObserver = new MutationObserver(function () { requestAnimationFrame(applyRegionStoreFilter); });
      regionResultsObserver.observe(results, { childList: true, subtree: false });
      observedRegionResults = results;
    }
    applyRegionStoreFilter();
    return true;
  }

  function apply() {
    hookRenderStores();
    ensureRegionStoreChooser();
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
    if (button && /magasins|région/i.test(button.textContent || '')) scheduleApply();
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) scheduleApply();
  });
})();
