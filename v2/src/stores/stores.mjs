import { createVisitsService } from '../visits/visits.mjs';
import { appendStoreVisits } from '../visits/visits-ui.mjs';

// Store Runner V2 — feature Magasins.
// Propriétaire unique de la liste, de la recherche et de la fiche magasin.
// Le shell reste propriétaire de la structure globale et reçoit simplement
// l'élément racine de cette feature via shell.mountScreen('stores', ...).

export class StoresFeatureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoresFeatureError';
  }
}

export function normalizeStoreSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim();
}

function displayName(store) {
  return String(store?.enseigne || store?.name || store?.sourceName || 'Magasin sans nom').trim();
}

function displayLocation(store) {
  return [store?.codePostal, store?.ville].filter(Boolean).map(String).join(' · ');
}

function searchableText(store) {
  return [
    store?.enseigne,
    store?.name,
    store?.sourceName,
    store?.adresse,
    store?.codePostal,
    store?.ville,
  ].filter(Boolean).join(' ');
}

export function filterStores(stores, query = '') {
  if (!Array.isArray(stores)) return [];
  const needle = normalizeStoreSearch(query);
  if (!needle) return stores.slice();
  return stores.filter(store => normalizeStoreSearch(searchableText(store)).includes(needle));
}

function requireOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new StoresFeatureError('createStoresFeature attend un objet { document, store }.');
  }
  const { document, store } = options;
  if (!document || typeof document.createElement !== 'function') {
    throw new StoresFeatureError('Un document valide est requis pour la feature Magasins.');
  }
  if (!store || typeof store.getState !== 'function' || typeof store.subscribe !== 'function') {
    throw new StoresFeatureError('Un store V2 avec getState() et subscribe() est requis.');
  }
  return { document, store };
}

function appendTextElement(doc, parent, tagName, className, text) {
  const el = doc.createElement(tagName);
  if (className) el.classList.add(className);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

export function createStoresFeature(options) {
  const { document: doc, store } = requireOptions(options);
  const service = typeof options.persist === 'function' ? createVisitsService({ store, persist: options.persist }) : null;
  const guard = options.guard && typeof options.guard.run === 'function' ? options.guard : null;
  // Chaque mutation Visites traverse la garde : verrou partagé puis refus si un
  // autre onglet a écrit depuis la lecture de celui-ci.
  const visits = service && guard
    ? Object.freeze({
      start: storeId => guard.run(() => service.start(storeId)),
      finish: id => guard.run(() => service.finish(id)),
      cancel: id => guard.run(() => service.cancel(id)),
      history: id => service.history(id),
    })
    : service;
  let query = '';
  let selectedId = null;
  let latestState = store.getState();

  const root = doc.createElement('div');
  root.classList.add('srv2-stores-feature');

  const searchWrap = doc.createElement('label');
  searchWrap.classList.add('srv2-store-search');
  appendTextElement(doc, searchWrap, 'span', 'srv2-field-label', 'Rechercher un magasin');

  const searchInput = doc.createElement('input');
  searchInput.setAttribute('type', 'search');
  searchInput.setAttribute('inputmode', 'search');
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('placeholder', 'Enseigne, ville, adresse…');
  searchInput.setAttribute('aria-label', 'Rechercher un magasin');
  searchWrap.appendChild(searchInput);

  const summary = doc.createElement('p');
  summary.classList.add('srv2-store-summary');
  summary.setAttribute('aria-live', 'polite');

  const list = doc.createElement('div');
  list.classList.add('srv2-store-list');

  const detail = doc.createElement('section');
  detail.classList.add('srv2-store-detail');
  detail.setAttribute('role', 'dialog');
  detail.setAttribute('aria-modal', 'true');
  detail.setAttribute('aria-label', 'Fiche magasin');
  detail.hidden = true;

  const detailPanel = doc.createElement('div');
  detailPanel.classList.add('srv2-store-detail-panel');
  detail.appendChild(detailPanel);

  root.appendChild(searchWrap);
  root.appendChild(summary);
  root.appendChild(list);
  root.appendChild(detail);

  function currentStores(state = latestState) {
    return Array.isArray(state?.stores) ? state.stores : [];
  }

  function findSelected(state = latestState) {
    if (selectedId === null) return null;
    return currentStores(state).find(storeRow => String(storeRow?.id) === selectedId) || null;
  }

  function closeDetail() {
    selectedId = null;
    detail.hidden = true;
    detailPanel.replaceChildren();
  }

  function renderDetail(state = latestState) {
    const selected = findSelected(state);
    if (!selected) {
      closeDetail();
      return;
    }

    const close = doc.createElement('button');
    close.setAttribute('type', 'button');
    close.classList.add('srv2-store-detail-close');
    close.setAttribute('aria-label', 'Fermer la fiche magasin');
    close.textContent = 'Fermer';
    close.addEventListener('click', closeDetail);

    const head = doc.createElement('div');
    head.classList.add('srv2-store-detail-head');
    const heading = appendTextElement(doc, head, 'h2', 'srv2-store-detail-title', displayName(selected));
    heading.setAttribute('tabindex', '-1');
    head.appendChild(close);

    const body = doc.createElement('div');
    body.classList.add('srv2-store-detail-body');
    const location = displayLocation(selected);
    if (location) appendTextElement(doc, body, 'p', 'srv2-store-detail-location', location);
    if (selected.adresse) appendTextElement(doc, body, 'p', 'srv2-store-detail-address', String(selected.adresse));
    if (selected.active === false) appendTextElement(doc, body, 'p', 'srv2-store-detail-status', 'Magasin inactif');

    appendStoreVisits(doc, body, state, selected.id, visits);
    detailPanel.replaceChildren(head, body);
    detail.hidden = false;
  }

  function openDetail(storeRow) {
    if (!storeRow || storeRow.id === undefined || storeRow.id === null) return;
    selectedId = String(storeRow.id);
    renderDetail();
  }

  function createCard(storeRow) {
    const button = doc.createElement('button');
    button.setAttribute('type', 'button');
    button.classList.add('srv2-store-card');
    if (storeRow?.id !== undefined && storeRow?.id !== null) {
      button.setAttribute('data-store-id', String(storeRow.id));
    }

    appendTextElement(doc, button, 'strong', 'srv2-store-name', displayName(storeRow));
    const location = displayLocation(storeRow);
    if (location) appendTextElement(doc, button, 'span', 'srv2-store-location', location);
    if (storeRow?.adresse) appendTextElement(doc, button, 'span', 'srv2-store-address', String(storeRow.adresse));
    if (storeRow?.active === false) appendTextElement(doc, button, 'span', 'srv2-store-inactive', 'Inactif');

    button.addEventListener('click', () => openDetail(storeRow));
    return button;
  }

  function renderList(state = latestState) {
    const all = currentStores(state);
    const filtered = filterStores(all, query);
    const total = all.length;
    summary.textContent = query
      ? `${filtered.length} magasin${filtered.length > 1 ? 's' : ''} trouvé${filtered.length > 1 ? 's' : ''} sur ${total}`
      : `${total} magasin${total > 1 ? 's' : ''}`;

    if (!filtered.length) {
      const empty = doc.createElement('p');
      empty.classList.add('srv2-store-empty');
      empty.textContent = total ? 'Aucun magasin ne correspond à cette recherche.' : 'Aucun magasin dans ce secteur.';
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...filtered.map(createCard));
  }

  function render(state) {
    latestState = state || store.getState();
    renderList(latestState);
    if (selectedId !== null) renderDetail(latestState);
  }

  searchInput.addEventListener('input', () => {
    query = String(searchInput.value || '');
    renderList();
  });

  const unsubscribe = store.subscribe(render);
  render(latestState);

  function destroy() {
    unsubscribe();
    closeDetail();
  }

  return Object.freeze({
    element: root,
    destroy,
    getQuery: () => query,
    getSelectedStoreId: () => selectedId,
  });
}
