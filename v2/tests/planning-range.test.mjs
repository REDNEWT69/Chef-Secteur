import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';
import {
  DEFAULT_RANGE_WEEKS,
  PlanningRangeError,
  SNAIL_RANGE_ALGORITHM,
  distanceKm,
  flattenRangeChronologically,
  generatePlanningRange,
  isPlanningEligibleStore,
  planningReach,
  resolvePlanningOrigin,
  sortStoresByDistance,
} from '../src/planning/range.mjs';
import { createPlanningRangeFeature } from '../src/planning/range-ui.mjs';
import { createFakeDocument } from './fake-dom.mjs';

function sectorState(count = 83) {
  const state = createEmptyState();
  state.profile = {
    sectorName: 'Secteur Test',
    baseName: 'Maison Test',
    baseLat: 45,
    baseLon: 4,
  };
  state.stores = Array.from({ length: count }, (_, index) => ({
    id: `s${index + 1}`,
    enseigne: `Magasin ${index + 1}`,
    active: true,
    // Tous les magasins sont sur le même méridien, de plus en plus loin :
    // l'ordre radial attendu est donc strictement s1, s2, ...
    lat: 45 + (index + 1) * 0.01,
    lon: 4,
  }));
  state.planning = { weeks: {} };
  state.settings = {
    weekDate: '2026-09-14',
    days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    target: 20,
    maxVisitsPerDay: 4,
  };
  return state;
}

assert.equal(DEFAULT_RANGE_WEEKS, 3);
assert.equal(SNAIL_RANGE_ALGORITHM, 'snail-distance-v1');

// Le point de départ vient du profil historique par défaut, mais une origine
// explicite dans settings doit pouvoir la remplacer plus tard sans migration.
{
  const state = sectorState();
  assert.deepEqual(resolvePlanningOrigin(state), { lat: 45, lon: 4, label: 'Maison Test' });
  state.settings.originLat = 46;
  state.settings.originLon = 5;
  state.settings.originName = 'Agence';
  assert.deepEqual(resolvePlanningOrigin(state), { lat: 46, lon: 5, label: 'Agence' });
}

// Distance : zéro au départ, positive plus loin, coordonnées invalides -> null.
{
  const origin = { lat: 45, lon: 4 };
  assert.equal(distanceKm(origin, { lat: 45, lon: 4 }), 0);
  assert(distanceKm(origin, { lat: 45.1, lon: 4 }) > 10);
  assert.equal(distanceKm(origin, { lat: '', lon: 4 }), null);
}

// Tri stable : GPS valides du plus proche au plus loin, puis magasins sans GPS.
{
  const origin = { lat: 45, lon: 4 };
  const rows = [
    { id: 'far', lat: 45.3, lon: 4 },
    { id: 'missing' },
    { id: 'near', lat: 45.01, lon: 4 },
    { id: 'mid', lat: 45.1, lon: 4 },
  ];
  assert.deepEqual(sortStoresByDistance(rows, origin).map(row => row.id), ['near', 'mid', 'far', 'missing']);
}

// Le mode escargot doit consommer le même vivier métier que la V1 : actif,
// non exclu, compatible filtre Enseignes et compatible filtre Produits.
{
  const state = sectorState(8);
  for (let index = 0; index < state.stores.length; index += 1) {
    state.stores[index].enseigne = index < 5 ? 'Brand A' : 'Brand B';
    state.stores[index].products = ['P'];
  }
  state.stores[1].active = false;          // s2 désactivé
  state.stores[2].products = ['Autre'];    // s3 filtré Produit
  state.planning.excludedStoreIds = ['s1'];
  state.settings.brands = ['Brand A'];     // s6-s8 filtrés Enseigne
  state.settings.products = ['P'];
  state.settings.target = 8;

  assert.deepEqual(planningReach(state), {
    totalStores: 8,
    activeStores: 7,
    inactiveStores: 1,
    excludedStores: 1,
    filteredStores: 4,
    eligibleStores: 2,
  });
  assert.equal(isPlanningEligibleStore(state, state.stores[0]), false);
  assert.equal(isPlanningEligibleStore(state, state.stores[3]), true);
  assert.equal(isPlanningEligibleStore(state, state.stores[5]), false);

  const range = generatePlanningRange(state, { weeks: 1 });
  assert.deepEqual(flattenRangeChronologically(range), ['s4', 's5']);
  assert.equal(range.eligibleStores, 2);
  assert.equal(range.excludedStores, 1);
  assert.equal(range.filteredStores, 4);
  assert.equal(range.inactiveStores, 1);
  assert.equal(range.remainingStores, 0);
}

// Si les filtres/exclusions vident entièrement le vivier, on refuse de créer
// trois semaines qui auraient l'air valides mais seraient vides.
{
  const state = sectorState(2);
  state.settings.brands = ['Enseigne inexistante'];
  assert.throws(() => generatePlanningRange(state), /Aucun magasin planifiable/);
}

// Contrat opérationnel demandé : 83 magasins, 20 visites/semaine, 3 semaines.
// Les 60 premiers magasins les plus proches doivent être couverts une seule
// fois avant d'envisager une répétition, dans un ordre chronologique radial.
{
  const state = sectorState(83);
  const before = JSON.stringify(state);
  const range = generatePlanningRange(state, { weekDate: '2026-09-16' });

  assert.equal(range.startWeek, '2026-09-14');
  assert.equal(range.endWeek, '2026-09-28');
  assert.equal(range.weeks.length, 3);
  assert.equal(range.totalVisits, 60);
  assert.equal(range.distinctStores, 60);
  assert.equal(range.eligibleStores, 83);
  assert.equal(range.remainingStores, 23);
  assert.equal(range.missingCoordinates, 0);
  assert.equal(JSON.stringify(state), before, 'generatePlanningRange ne doit jamais muter l’état source');

  const chronological = flattenRangeChronologically(range);
  assert.deepEqual(chronological, Array.from({ length: 60 }, (_, i) => `s${i + 1}`));
  assert.equal(new Set(chronological).size, 60, 'aucun doublon sur les 3 semaines tant que le vivier suffit');

  for (const week of range.weeks) {
    assert.equal(week.algorithm, SNAIL_RANGE_ALGORITHM);
    assert.equal(Object.values(week.days).flat().length, 20);
    for (const ids of Object.values(week.days)) assert(ids.length <= 4);
  }

  assert.deepEqual(range.weeks[0].days.Lundi, ['s1', 's2', 's3', 's4']);
  assert.deepEqual(range.weeks[0].days.Vendredi, ['s17', 's18', 's19', 's20']);
  assert.deepEqual(range.weeks[1].days.Lundi, ['s21', 's22', 's23', 's24']);
  assert.deepEqual(range.weeks[2].days.Vendredi, ['s57', 's58', 's59', 's60']);
}

// Si le secteur est plus petit que la période, on recommence seulement après
// avoir couvert tout le vivier. Le nombre de magasins distincts reste exact.
{
  const state = sectorState(6);
  state.settings.target = 3;
  state.settings.maxVisitsPerDay = 2;
  const range = generatePlanningRange(state);
  const chronological = flattenRangeChronologically(range);
  assert.deepEqual(chronological.slice(0, 6), ['s1', 's2', 's3', 's4', 's5', 's6']);
  assert.equal(range.distinctStores, 6);
  assert.equal(range.remainingStores, 0);
}

// Un magasin sans GPS est explicitement compté et repoussé après les magasins
// géolocalisés, jamais silencieusement transformé en coordonnées 0,0.
{
  const state = sectorState(4);
  state.stores[1].lat = '';
  state.stores[1].lon = '';
  state.settings.target = 4;
  const range = generatePlanningRange(state, { weeks: 1 });
  assert.equal(range.missingCoordinates, 1);
  assert.deepEqual(flattenRangeChronologically(range), ['s1', 's3', 's4', 's2']);
}

// Un magasin sans GPS mais hors vivier ne doit pas polluer l'alerte GPS.
{
  const state = sectorState(3);
  state.stores[0].lat = '';
  state.stores[0].lon = '';
  state.planning.excludedStoreIds = ['s1'];
  const range = generatePlanningRange(state, { weeks: 1 });
  assert.equal(range.missingCoordinates, 0);
}

// Sans point de départ, le mode escargot refuse clairement de fabriquer un
// ordre arbitraire qui aurait l'air crédible.
{
  const state = sectorState();
  delete state.profile.baseLat;
  delete state.profile.baseLon;
  assert.throws(() => generatePlanningRange(state), PlanningRangeError);
}

// Feature UI : les trois semaines sont persistées d'un coup dans le store,
// la première devient la semaine affichée et un résumé exploitable est visible.
{
  const document = createFakeDocument();
  const store = createStore(sectorState(83));
  const feature = createPlanningRangeFeature({ document, store });
  const range = feature.generate();
  assert(range);
  const snapshot = store.getState();
  assert.deepEqual(
    Object.keys(snapshot.planning.weeks).sort(),
    ['2026-09-14', '2026-09-21', '2026-09-28']
  );
  assert.equal(snapshot.planning.currentWeek, '2026-09-14');
  assert.equal(snapshot.settings.weekDate, '2026-09-14');
  assert.equal(snapshot.planning.lastRange.algorithm, SNAIL_RANGE_ALGORITHM);
  assert.equal(snapshot.planning.lastRange.distinctStores, 60);
  assert.equal(snapshot.planning.lastRange.eligibleStores, 83);

  const reach = feature.element.children.find(child => child.classList.contains('srv2-planning-range-reach'));
  assert.equal(reach.textContent, '83 magasins planifiables');
  const status = feature.element.children.find(child => child.classList.contains('srv2-planning-range-status'));
  assert(status.textContent.includes('60 visites'));
  assert(status.textContent.includes('23 magasins planifiables restent'));
  feature.destroy();
}

console.log('v2 planning range: ok');
