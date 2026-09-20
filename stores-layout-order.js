(function () {
  'use strict';

  var retryTimer = null;
  var retryCount = 0;
  var MAX_RETRIES = 30;
  var regionResultsObserver = null;
  var observedRegionResults = null;
  var storeListObserver = null;
  var observedStoreList = null;
  var storeDialogObserver = null;
  var observedStoreDialog = null;

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
      '#storeDlg .srStoreTabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0 14px;padding:4px;border-radius:14px;background:#eef1f5}',
      '#storeDlg .srStoreTab{min-height:42px;border:0;border-radius:11px;background:transparent;color:#697386;font-weight:850}',
      '#storeDlg .srStoreTab[aria-selected="true"]{background:#fff;color:#0a6dd9;box-shadow:0 3px 12px rgba(30,55,95,.10)}',
      '#storeDlg .srStoreContactsPane[hidden],#storeDlg .srStoreDetailsPane[hidden]{display:none!important}',
      '#storeDlg .srStoreContactsIntro{margin:2px 0 12px;color:#667085;font-size:12px;line-height:1.4}',
      '#storeDlg .srStoreContactList{display:grid;gap:10px}',
      '#storeDlg .srStoreContactRow{position:relative;padding:12px;border:1px solid #e2e6ed;border-radius:16px;background:#f8fafc}',
      '#storeDlg .srStoreContactGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '#storeDlg .srStoreContactGrid label{margin:0;font-size:11px}',
      '#storeDlg .srStoreContactGrid .srStoreContactEmailField{grid-column:1/-1}',
      '#storeDlg .srStoreContactGrid input{margin-top:5px;min-height:42px}',
      '#storeDlg .srStoreContactActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}',
      '#storeDlg .srStoreContactMail{font-size:12px;font-weight:800;color:#0a6dd9;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '#storeDlg .srStoreContactCopy,#storeDlg .srStoreContactRemove{min-height:36px;padding:7px 10px;font-size:11px}',
      '#storeDlg .srStoreContactRemove{margin-left:auto}',
      '#storeDlg .srStoreContactBottom{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:12px}',
      '#storeDlg .srStoreContactStatus{min-height:18px;color:#246544;font-size:11px;font-weight:700}',
      '@media(max-width:700px){#storesSearchTop{margin-bottom:14px!important;padding:14px!important}#storesPanel>#storeKpis{margin-top:18px!important}#regionStoreChooser .regionChooserRow>*{width:100%}#storeDlg .srStoreContactGrid{grid-template-columns:1fr}#storeDlg .srStoreContactGrid .srStoreContactEmailField{grid-column:auto}}'
    ].join('');
    document.head.appendChild(style);
  }

  function normalizeLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function ensureContactsState() {
    if (!window.state) return null;
    if (!window.state.storeContacts || typeof window.state.storeContacts !== 'object' || Array.isArray(window.state.storeContacts)) {
      window.state.storeContacts = {};
    }
    return window.state.storeContacts;
  }

  function currentStoreId() {
    return window.currentEditId == null ? '' : String(window.currentEditId);
  }

  function contactRowsForStore(storeId) {
    var contacts = ensureContactsState();
    var rows = contacts && Array.isArray(contacts[storeId]) ? contacts[storeId] : [];
    return rows.map(function (row) {
      return {
        name: String(row && row.name || '').trim(),
        role: String(row && row.role || '').trim(),
        email: String(row && row.email || '').trim()
      };
    });
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function removeRedundantStoreActions(toolbar) {
    if (!toolbar) return;
    Array.prototype.slice.call(toolbar.querySelectorAll('button')).forEach(function (button) {
      if (button.id === 'addStoreBtn') return;
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
    var labels = new Map();
    document.querySelectorAll('.regionDialog .regionResult').forEach(function(card) {
      var label = String(card.dataset.brand || '').trim().replace(/\s+/g, ' ');
      var key = normalizeLabel(label);
      if (key && !labels.has(key)) labels.set(key, key === 'schmidt' ? 'Schmidt' : label);
    });
    return Array.from(labels.values()).sort(function(a,b){return a.localeCompare(b,'fr')});
  }

  function cardBrand(card) { return normalizeLabel(card && card.dataset.brand); }

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
    var previous = select ? select.value : 'all';
    var brands = regionBrands();
    if (select && select.dataset.brands !== JSON.stringify(brands)) {
      select.replaceChildren(new Option('Toutes les enseignes', 'all'));
      brands.forEach(function(brand){select.add(new Option(brand, normalizeLabel(brand)))});
      select.dataset.brands = JSON.stringify(brands);
      select.value = brands.some(function(b){return normalizeLabel(b) === previous}) ? previous : 'all';
    }
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

  function setStoreTab(name) {
    var details = document.getElementById('srStoreDetailsPane');
    var contacts = document.getElementById('srStoreContactsPane');
    var detailsButton = document.querySelector('#storeDlg [data-sr-store-tab="details"]');
    var contactsButton = document.querySelector('#storeDlg [data-sr-store-tab="contacts"]');
    var showContacts = name === 'contacts';
    if (details) details.hidden = showContacts;
    if (contacts) contacts.hidden = !showContacts;
    if (detailsButton) detailsButton.setAttribute('aria-selected', showContacts ? 'false' : 'true');
    if (contactsButton) contactsButton.setAttribute('aria-selected', showContacts ? 'true' : 'false');
    if (showContacts) renderStoreContacts();
  }

  function updateContactMailAction(row) {
    if (!row) return;
    var emailInput = row.querySelector('[data-sr-contact-email]');
    var link = row.querySelector('[data-sr-contact-mail]');
    var copy = row.querySelector('[data-sr-contact-copy]');
    var email = emailInput ? emailInput.value.trim() : '';
    var okay = validEmail(email);
    if (link) {
      link.hidden = !okay;
      link.textContent = okay ? '✉ ' + email : '';
      link.href = okay ? 'mailto:' + email : '#';
    }
    if (copy) copy.hidden = !okay;
  }

  function addContactRow(contact) {
    var list = document.getElementById('srStoreContactList');
    if (!list) return null;
    var row = document.createElement('div');
    row.className = 'srStoreContactRow';
    row.innerHTML = '<div class="srStoreContactGrid"><label>Nom<input type="text" data-sr-contact-name placeholder="Ex. Amandine"></label><label>Fonction<input type="text" data-sr-contact-role placeholder="Ex. RU Brun, vendeur TV, SAV"></label><label class="srStoreContactEmailField">Email<input type="email" inputmode="email" autocomplete="email" autocapitalize="none" data-sr-contact-email placeholder="prenom.nom@enseigne.fr"></label></div><div class="srStoreContactActions"><a class="srStoreContactMail" data-sr-contact-mail hidden></a><button type="button" class="secondary srStoreContactCopy" data-sr-contact-copy hidden>Copier</button><button type="button" class="danger srStoreContactRemove" data-sr-contact-remove>Supprimer</button></div>';
    row.querySelector('[data-sr-contact-name]').value = contact && contact.name || '';
    row.querySelector('[data-sr-contact-role]').value = contact && contact.role || '';
    row.querySelector('[data-sr-contact-email]').value = contact && contact.email || '';
    row.querySelector('[data-sr-contact-email]').addEventListener('input', function () { updateContactMailAction(row); });
    row.querySelector('[data-sr-contact-remove]').addEventListener('click', function () { row.remove(); });
    row.querySelector('[data-sr-contact-copy]').addEventListener('click', function () {
      var value = row.querySelector('[data-sr-contact-email]').value.trim();
      if (!validEmail(value)) return;
      var status = document.getElementById('srStoreContactStatus');
      var done = function () { if (status) status.textContent = 'Email copié.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done).catch(function () {});
      else {
        var input = row.querySelector('[data-sr-contact-email]');
        input.focus(); input.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
      }
    });
    list.appendChild(row);
    updateContactMailAction(row);
    return row;
  }

  function renderStoreContacts() {
    var list = document.getElementById('srStoreContactList');
    var empty = document.getElementById('srStoreContactsEmpty');
    var addButton = document.getElementById('srStoreContactAdd');
    var saveButton = document.getElementById('srStoreContactSave');
    var status = document.getElementById('srStoreContactStatus');
    if (!list) return;
    list.replaceChildren();
    if (status) status.textContent = '';
    var storeId = currentStoreId();
    var editable = !!storeId;
    if (addButton) addButton.disabled = !editable;
    if (saveButton) saveButton.disabled = !editable;
    if (!editable) {
      if (empty) { empty.hidden = false; empty.textContent = 'Enregistre d’abord le magasin pour ajouter ses contacts.'; }
      return;
    }
    var rows = contactRowsForStore(storeId);
    if (empty) { empty.hidden = rows.length > 0; empty.textContent = 'Aucun contact enregistré pour ce magasin.'; }
    rows.forEach(addContactRow);
  }

  function saveStoreContacts() {
    var storeId = currentStoreId();
    if (!storeId || !window.state) return false;
    var contacts = ensureContactsState();
    var rows = Array.prototype.slice.call(document.querySelectorAll('#srStoreContactList .srStoreContactRow'));
    var clean = [];
    for (var i = 0; i < rows.length; i += 1) {
      var name = rows[i].querySelector('[data-sr-contact-name]').value.trim();
      var role = rows[i].querySelector('[data-sr-contact-role]').value.trim();
      var email = rows[i].querySelector('[data-sr-contact-email]').value.trim().toLowerCase();
      if (!name && !role && !email) continue;
      if (!validEmail(email)) {
        var status = document.getElementById('srStoreContactStatus');
        if (status) status.textContent = 'Vérifie l’adresse email avant d’enregistrer.';
        rows[i].querySelector('[data-sr-contact-email]').focus();
        return false;
      }
      clean.push({ name: name, role: role, email: email });
    }
    contacts[storeId] = clean;
    try { if (typeof window.save === 'function') window.save(); else if (typeof save === 'function') save(); }
    catch (e) {
      var errorStatus = document.getElementById('srStoreContactStatus');
      if (errorStatus) errorStatus.textContent = 'Sauvegarde impossible : ' + (e && e.message ? e.message : e);
      return false;
    }
    renderStoreContacts();
    var savedStatus = document.getElementById('srStoreContactStatus');
    if (savedStatus) savedStatus.textContent = clean.length ? 'Contacts enregistrés.' : 'Carnet de contacts vidé.';
    return true;
  }

  function pruneOrphanContacts() {
    var contacts = ensureContactsState();
    if (!contacts || !window.state || !Array.isArray(window.state.stores)) return;
    var ids = new Set(window.state.stores.map(function (store) { return String(store.id); }));
    var changed = false;
    Object.keys(contacts).forEach(function (id) {
      if (!ids.has(String(id))) { delete contacts[id]; changed = true; }
    });
    if (changed) {
      try { if (typeof window.save === 'function') window.save(); else if (typeof save === 'function') save(); } catch (e) {}
    }
  }

  function ensureStoreContactsUi() {
    var dialog = document.getElementById('storeDlg');
    if (!dialog) return false;
    ensureStyle();
    if (!dialog.dataset.srContactsReady) {
      var title = document.getElementById('storeDlgTitle');
      var start = document.getElementById('srStoreStart');
      var details = document.createElement('div');
      details.id = 'srStoreDetailsPane';
      details.className = 'srStoreDetailsPane';
      var nodes = Array.prototype.slice.call(dialog.children).filter(function (node) { return node !== title && node !== start; });
      nodes.forEach(function (node) { details.appendChild(node); });

      var tabs = document.createElement('div');
      tabs.className = 'srStoreTabs';
      tabs.setAttribute('role', 'tablist');
      tabs.innerHTML = '<button type="button" class="srStoreTab" data-sr-store-tab="details" role="tab" aria-selected="true">Fiche</button><button type="button" class="srStoreTab" data-sr-store-tab="contacts" role="tab" aria-selected="false">Contacts</button>';

      var contactsPane = document.createElement('section');
      contactsPane.id = 'srStoreContactsPane';
      contactsPane.className = 'srStoreContactsPane';
      contactsPane.hidden = true;
      contactsPane.innerHTML = '<p class="srStoreContactsIntro">Les emails restent dans les données locales de Store Runner et suivent tes sauvegardes.</p><div id="srStoreContactsEmpty" class="tiny">Aucun contact enregistré pour ce magasin.</div><div id="srStoreContactList" class="srStoreContactList"></div><div class="srStoreContactBottom"><button type="button" class="secondary" id="srStoreContactAdd">＋ Ajouter un contact</button><button type="button" class="primary" id="srStoreContactSave">Enregistrer les contacts</button></div><div id="srStoreContactStatus" class="srStoreContactStatus" aria-live="polite"></div>';

      if (start && start.parentNode === dialog) start.insertAdjacentElement('afterend', tabs);
      else if (title && title.parentNode === dialog) title.insertAdjacentElement('afterend', tabs);
      else dialog.insertBefore(tabs, dialog.firstChild);
      tabs.insertAdjacentElement('afterend', details);
      details.insertAdjacentElement('afterend', contactsPane);

      tabs.querySelector('[data-sr-store-tab="details"]').addEventListener('click', function () { setStoreTab('details'); });
      tabs.querySelector('[data-sr-store-tab="contacts"]').addEventListener('click', function () { setStoreTab('contacts'); });
      contactsPane.querySelector('#srStoreContactAdd').addEventListener('click', function () {
        var row = addContactRow({});
        var empty = document.getElementById('srStoreContactsEmpty');
        if (empty) empty.hidden = true;
        if (row) row.querySelector('[data-sr-contact-name]').focus();
      });
      contactsPane.querySelector('#srStoreContactSave').addEventListener('click', saveStoreContacts);
      dialog.dataset.srContactsReady = '1';
    }

    if (observedStoreDialog !== dialog) {
      if (storeDialogObserver) storeDialogObserver.disconnect();
      storeDialogObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type !== 'attributes' || mutation.attributeName !== 'open') return;
          if (dialog.open) {
            ensureContactsState();
            setStoreTab('details');
            renderStoreContacts();
          } else {
            pruneOrphanContacts();
          }
        });
      });
      storeDialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
      observedStoreDialog = dialog;
    }
    return true;
  }

  function observeStoreList() {
    var list = document.getElementById('storeList');
    if (!list) return false;
    if (observedStoreList === list && storeListObserver) return true;
    if (storeListObserver) storeListObserver.disconnect();
    storeListObserver = new MutationObserver(function () { scheduleApply(); });
    storeListObserver.observe(list, { childList: true, subtree: false });
    observedStoreList = list;
    return true;
  }

  function apply() {
    ensureRegionStoreChooser();
    ensureStoreContactsUi();
    var arranged = arrangeStoresPanel();
    observeStoreList();
    return arranged;
  }

  function scheduleApply() {
    requestAnimationFrame(function () {
      apply();
      setTimeout(apply, 40);
      setTimeout(apply, 160);
    });
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

  window.StoreRunnerStoreContacts = {
    ensure: ensureStoreContactsUi,
    render: renderStoreContacts,
    save: saveStoreContacts,
    add: addContactRow,
    openTab: setStoreTab,
    rowsForStore: contactRowsForStore
  };

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
