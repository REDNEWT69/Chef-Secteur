import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';
import {
  PLANNING_ALGORITHM,
  PlanningWeekError,
  generatePlanningWeek,
  getPlannedStore,
  rankActiveStoreIdsForWeek,
  resolvePlanningDays,
  shiftWeekDate,
  weekMondayFromDate,
} from '../src/planning/week.mjs';
import { createPlanningFeature, PlanningFeatureError } from '../src/planning/planning.mjs';
import { reorderPlanningIds } from '../src/planning/reorder-ui.mjs';
import { createFakeDocument } from './fake-dom.mjs';

function makeState() {
  const state = createEmptyState();
  state.stores = [
    { id: 'alpha', enseigne: 'Alpha', ville: 'Ville A', active: true },
    { id: 'beta', enseigne: 'Bêta', ville: 'Ville B', active: true },
    { id: 'gamma', enseigne: 'Gamma', ville: 'Ville C', active: true },
    { id: 'delta', enseigne: 'Delta', ville: 'Ville D', active: false },
  ];
  state.planning = { weeks: {} };
  state.settings = {
    weekDate: '2026-09-16',
    days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    target: 3,
    maxVisitsPerDay: 2,
  };
  return state;
}

function makeRotationState() {
  const state = createEmptyState();
  state.stores = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map(id => ({
    id,
    enseigne: id,
    active: true,
  }));
  state.planning = { weeks: {} };
  state.settings = {
    weekDate: '2026-09-14',
    days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    target: 3,
    maxVisitsPerDay: 2,
  };
  return state;
}

function plannedIds(week) {
  return Object.values(week.days).flat();
}

// Réordonnancement manuel pur : même ensemble, aucun doublon, position finale
// explicite. Une cible inconnue ne doit jamais mutiler la journée.
{
  const source = ['alpha', 'beta', 'gamma'];
  assert.deepEqual(reorderPlanningIds(source, 'gamma', 0), ['gamma', 'alpha', 'beta']);
  assert.deepEqual(reorderPlanningIds(source, 'alpha', 2), ['beta', 'gamma', 'alpha']);
  assert.deepEqual(reorderPlanningIds(source, 'beta', 1), source);
  assert.deepEqual(reorderPlanningIds(source, 'inconnu', 0), source);
  assert.deepEqual(source, ['alpha', 'beta', 'gamma'], 'la fonction ne doit pas muter la source');
}

// La date sélectionnée n'a pas besoin d'être un lundi : le contrat est la
// clé canonique ISO du lundi de la semaine.
assert.equal(weekMondayFromDate('2026-09-14'), '2026-09-14');
assert.equal(weekMondayFromDate('2026-09-16'), '2026-09-14');
assert.equal(weekMondayFromDate('2026-09-20'), '2026-09-14');
assert.equal(weekMondayFromDate('2026-09-21'), '2026-09-21');
assert.throws(() => weekMondayFromDate('16/09/2026'), PlanningWeekError);
assert.throws(() => weekMondayFromDate('2026-02-31'), PlanningWeekError);

// Navigation hebdomadaire pure : toujours de lundi à lundi, sans dépendre du DOM.
assert.equal(shiftWeekDate('2026-09-16', 0), '2026-09-14');
assert.equal(shiftWeekDate('2026-09-16', 1), '2026-09-21');
assert.equal(shiftWeekDate('2026-09-16', -1), '2026-09-07');
assert.equal(shiftWeekDate('2026-12-30', 1), '2027-01-04');
assert.throws(() => shiftWeekDate('2026-09-16', 1.5), PlanningWeekError);

// Les jours sont filtrés, dédupliqués, et reviennent à Lun→Ven si la config
// ne fournit rien d'exploitable.
assert.deepEqual(
  resolvePlanningDays({ days: ['Lundi', 'Lundi', 'Dimanche', 'Samedi'] }),
  ['Lundi', 'Samedi']
);
assert.deepEqual(resolvePlanningDays({ days: [] }), ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']);

// Génération déterministe : magasins actifs uniquement, IDs uniquement,
// répartition circulaire sur les jours configurés.
{
  const state = makeState();
  const week = generatePlanningWeek(state);
  assert.equal(week.weekMonday, '2026-09-14');
  assert.equal(week.algorithm, PLANNING_ALGORITHM);
  assert.deepEqual(week.days.Lundi, ['alpha']);
  assert.deepEqual(week.days.Mardi, ['beta']);
  assert.deepEqual(week.days.Mercredi, ['gamma']);
  assert.deepEqual(week.days.Jeudi, []);
  assert.deepEqual(week.days.Vendredi, []);
  assert.equal(JSON.stringify(week).includes('Delta'), false);
  assert.equal(JSON.stringify(week).includes('enseigne'), false);
}

// Rotation balanced-LRU : un vivier deux fois plus grand que la cible doit
// couvrir les six magasins avant de recommencer. À égalité, l'ordre catalogue
// reste le dernier départage déterministe.
{
  const state = makeRotationState();
  const week1 = generatePlanningWeek(state, { weekDate: '2026-09-14' });
  assert.deepEqual(plannedIds(week1), ['alpha', 'beta', 'gamma']);
  state.planning.weeks[week1.weekMonday] = week1;

  assert.deepEqual(
    rankActiveStoreIdsForWeek(state, '2026-09-21'),
    ['delta', 'epsilon', 'zeta', 'alpha', 'beta', 'gamma']
  );
  const week2 = generatePlanningWeek(state, { weekDate: '2026-09-21' });
  assert.deepEqual(plannedIds(week2), ['delta', 'epsilon', 'zeta']);
  state.planning.weeks[week2.weekMonday] = week2;

  const week3 = generatePlanningWeek(state, { weekDate: '2026-09-28' });
  assert.deepEqual(plannedIds(week3), ['alpha', 'beta', 'gamma']);

  // Régénérer la semaine 2 ignore sa propre ancienne version : résultat stable.
  assert.deepEqual(
    plannedIds(generatePlanningWeek(state, { weekDate: '2026-09-21' })),
    ['delta', 'epsilon', 'zeta']
  );
}

// Le passé seul influence la rotation. Une semaine future et une clé non
// canonique/malformée doivent être ignorées.
{
  const state = makeRotationState();
  state.planning.weeks['2026-09-28'] = {
    weekMonday: '2026-09-28',
    days: { Lundi: ['delta', 'epsilon', 'zeta'] },
  };
  state.planning.weeks['2026-09-15'] = {
    weekMonday: '2026-09-15',
    days: { Lundi: ['alpha', 'beta', 'gamma'] },
  };
  state.planning.weeks['pas-une-date'] = {
    days: { Lundi: ['alpha'] },
  };
  assert.deepEqual(
    rankActiveStoreIdsForWeek(state, '2026-09-21'),
    ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
  );
}

// La capacité est une vraie limite, pas une suggestion décorative.
{
  const state = makeState();
  state.stores[3].active = true;
  state.settings.days = ['Lundi', 'Mardi'];
  state.settings.target = 10;
  state.settings.maxVisitsPerDay = 1;
  const week = generatePlanningWeek(state);
  assert.deepEqual(week.days, { Lundi: ['alpha'], Mardi: ['beta'] });
}

// IDs dupliqués dans le catalogue : un magasin ne peut être planifié qu'une fois.
{
  const state = makeState();
  state.stores.push({ id: 'alpha', enseigne: 'Alpha bis', active: true });
  state.settings.target = 4;
  const week = generatePlanningWeek(state);
  const ids = Object.values(week.days).flat();
  assert.equal(ids.filter(id => id === 'alpha').length, 1);
  assert.equal(ids.length, 3);
}

// Résolution canonique : le planning garde l'ID, la fiche courante vient du
// catalogue actuel. Une adresse modifiée n'exige donc pas de réécrire le plan.
{
  const state = makeState();
  const week = generatePlanningWeek(state);
  state.planning.weeks[week.weekMonday] = week;
  state.stores[0].adresse = 'Nouvelle adresse canonique';
  assert.equal(getPlannedStore(state, 'alpha').adresse, 'Nouvelle adresse canonique');
  assert.equal(state.planning.weeks[week.weekMonday].days.Lundi[0], 'alpha');
}

// Feature DOM : génération explicite, navigation semaine par semaine et
// conservation de plusieurs semaines dans le store central.
{
  const document = createFakeDocument();
  const store = createStore(makeState());
  const feature = createPlanningFeature({ document, store });

  assert.equal(feature.getWeekMonday(), '2026-09-14');
  assert.equal(feature.getSelectedDay(), 'Lundi');

  const generatedFirst = feature.generate();
  assert(generatedFirst);
  let snapshot = store.getState();
  assert.equal(snapshot.planning.currentWeek, '2026-09-14');
  assert.deepEqual(snapshot.planning.weeks['2026-09-14'].days.Lundi, ['alpha']);
  assert.deepEqual(snapshot.planning.weeks['2026-09-14'].days.Mardi, ['beta']);
  assert.equal(snapshot.settings.weekDate, '2026-09-14');

  assert.equal(feature.shiftWeek(1), '2026-09-21');
  snapshot = store.getState();
  assert.equal(feature.getWeekMonday(), '2026-09-21');
  assert.equal(snapshot.planning.currentWeek, '2026-09-21');
  assert.equal(snapshot.settings.weekDate, '2026-09-21');
  assert(snapshot.planning.weeks['2026-09-14'], 'la première semaine doit rester enregistrée');
  assert.equal(snapshot.planning.weeks['2026-09-21'], undefined, 'naviguer ne doit pas générer en douce');

  const generatedSecond = feature.generate();
  assert(generatedSecond);
  snapshot = store.getState();
  assert.deepEqual(Object.keys(snapshot.planning.weeks).sort(), ['2026-09-14', '2026-09-21']);
  // Le petit fixture public n'a que trois magasins actifs : tous restent dus
  // chaque semaine, ce qui vérifie aussi que la rotation ne fabrique aucun trou.
  assert.deepEqual(snapshot.planning.weeks['2026-09-21'].days.Lundi, ['alpha']);

  assert.equal(feature.shiftWeek(-1), '2026-09-14');
  snapshot = store.getState();
  assert.equal(snapshot.planning.currentWeek, '2026-09-14');
  assert.deepEqual(snapshot.planning.weeks['2026-09-14'].days.Lundi, ['alpha']);
  assert.deepEqual(snapshot.planning.weeks['2026-09-21'].days.Lundi, ['alpha']);

  assert.equal(feature.selectDay('Mardi'), 'Mardi');
  assert.equal(feature.getSelectedDay(), 'Mardi');
  assert.throws(() => feature.selectDay('Dimanche'), PlanningFeatureError);

  feature.destroy();
}

// API stricte : document/store manquants refusés clairement.
assert.throws(() => createPlanningFeature(null), PlanningFeatureError);
assert.throws(() => createPlanningFeature({ document: createFakeDocument() }), PlanningFeatureError);

console.log('v2 planning week: ok');
