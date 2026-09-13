import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';
import { createStoresFeature, filterStores, normalizeStoreSearch, StoresFeatureError } from '../src/stores/stores.mjs';
import { createFakeDocument } from './fake-dom.mjs';

const SAMPLE_STORES = [
  { id: 'alpha', enseigne: 'Enseigne Alpha', adresse: '10 rue Démonstration', codePostal: '00001', ville: 'Ville Alpha', active: true },
  { id: 'beta', enseigne: 'Enseigne Bêta', adresse: '20 avenue Exemple', codePostal: '00002', ville: 'Ville Bêta', active: true },
  { id: 'gamma', enseigne: 'Enseigne Gamma', adresse: '30 boulevard Fictif', codePostal: '00003', ville: 'Ville Gamma', active: false },
];

function stateWithStores(stores = SAMPLE_STORES) {
  const state = createEmptyState();
  state.stores = stores.map(row => ({ ...row }));
  return state;
}

function setup(stores = SAMPLE_STORES) {
  const document = createFakeDocument();
  const store = createStore(stateWithStores(stores));
  const feature = createStoresFeature({ document, store });
  const [searchWrap, summary, list, detail] = feature.element.children;
  const searchInput = searchWrap.children[1];
  return { document, store, feature, summary, list, detail, searchInput };
}

// Recherche accent-insensible et défensive.
assert.equal(normalizeStoreSearch('  BÊTA  '), 'beta');
assert.deepEqual(filterStores(SAMPLE_STORES, 'beta').map(row => row.id), ['beta']);
assert.deepEqual(filterStores(SAMPLE_STORES, 'boulevard fictif').map(row => row.id), ['gamma']);
assert.deepEqual(filterStores(SAMPLE_STORES, '').map(row => row.id), ['alpha', 'beta', 'gamma']);
assert.deepEqual(filterStores(null, 'alpha'), []);

// Options invalides : refus explicite, pas de dépendance implicite au global.
assert.throws(() => createStoresFeature(), StoresFeatureError);
assert.throws(() => createStoresFeature({ document: createFakeDocument() }), StoresFeatureError);

// Lecture initiale depuis le store central.
{
  const { summary, list } = setup();
  assert.equal(summary.textContent, '3 magasins');
  assert.equal(list.children.length, 3);
  assert.deepEqual(list.children.map(card => card.getAttribute('data-store-id')), ['alpha', 'beta', 'gamma']);
}

// Recherche : la liste et le résumé se mettent à jour sans muter le store.
{
  const { store, feature, summary, list, searchInput } = setup();
  const before = store.getState();
  searchInput.value = 'beta';
  searchInput.dispatch('input');
  assert.equal(feature.getQuery(), 'beta');
  assert.equal(summary.textContent, '1 magasin trouvé sur 3');
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].getAttribute('data-store-id'), 'beta');
  assert.deepEqual(store.getState(), before);
}

// Tap carte -> fiche ; Fermer -> plus aucun overlay actif.
{
  const { feature, list, detail } = setup();
  const beta = list.children[1];
  beta.dispatch('click');
  assert.equal(feature.getSelectedStoreId(), 'beta');
  assert.equal(detail.hidden, false);
  const detailPanel = detail.children[0];
  assert.equal(detailPanel.children.length, 2);
  const [head] = detailPanel.children;
  assert.equal(head.children[0].textContent, 'Enseigne Bêta');
  const close = head.children[1];
  assert.equal(close.getAttribute('aria-label'), 'Fermer la fiche magasin');
  close.dispatch('click');
  assert.equal(feature.getSelectedStoreId(), null);
  assert.equal(detail.hidden, true);
}

// Abonnement au store : ajout d'un magasin -> rendu actualisé. Suppression du
// magasin actuellement ouvert -> la fiche se ferme au lieu de garder un overlay mort.
{
  const { store, feature, summary, list, detail } = setup();
  list.children[0].dispatch('click');
  assert.equal(detail.hidden, false);
  store.update(draft => {
    draft.stores = draft.stores.filter(row => row.id !== 'alpha');
    draft.stores.push({ id: 'delta', enseigne: 'Enseigne Delta', ville: 'Ville Delta', active: true });
  });
  assert.equal(summary.textContent, '3 magasins');
  assert.deepEqual(list.children.map(card => card.getAttribute('data-store-id')), ['beta', 'gamma', 'delta']);
  assert.equal(feature.getSelectedStoreId(), null);
  assert.equal(detail.hidden, true);
}

// destroy() désabonne la feature : une mutation ultérieure du store ne
// reconstruit plus cette ancienne vue.
{
  const { store, feature, summary } = setup();
  feature.destroy();
  store.update(draft => { draft.stores.push({ id: 'epsilon', enseigne: 'Enseigne Epsilon' }); });
  assert.equal(summary.textContent, '3 magasins');
}

console.log('v2 stores: liste, recherche, fiche et abonnement store ok');
