import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';
import {
  PlanningWeekError,
  generatePlanningWeek,
  getPlannedStore,
  resolvePlanningDays,
  weekMondayFromDate,
} from '../src/planning/week.mjs';
import { createPlanningFeature, PlanningFeatureError } from '../src/planning/planning.mjs';
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

function dispatchPointer(element, type, x, y, pointerId = 1) {
  element.dispatch(type, {
    pointerId,
    isPrimary: true,
    pointerType: 'touch',
    clientX: x,
    clientY: y,
  });
}

// La date sélectionnée n'a pas besoin d'être un lundi : le contrat est la
// clé canonique ISO du lundi de la semaine.
assert.equal(weekMondayFromDate('2026-09-14'), '2026-09-14');
assert.equal(weekMondayFromDate('2026-09-16'), '2026-09-14');
assert.equal(weekMondayFromDate('2026-09-20'), '2026-09-14');
assert.equal(weekMondayFromDate('2026-09-21'), '2026-09-21');
assert.throws(() => weekMondayFromDate('16/09/2026'), PlanningWeekError);
assert.throws(() => weekMondayFromDate('2026-02-31'), PlanningWeekError);

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
  assert.deepEqual(week.days.Lundi, ['alpha']);
  assert.deepEqual(week.days.Mardi, ['beta']);
  assert.deepEqual(week.days.Mercredi, ['gamma']);
  assert.deepEqual(week.days.Jeudi, []);
  assert.deepEqual(week.days.Vendredi, []);
  assert.equal(JSON.stringify(week).includes('Delta'), false);
  assert.equal(JSON.stringify(week).includes('enseigne'), false);
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

// Feature DOM : génération explicite -> persistance dans le store central,
// puis gestes horizontaux confinés à la liste du planning.
{
  const document = createFakeDocument();
  const store = createStore(makeState());
  const feature = createPlanningFeature({ document, store });

  assert.equal(feature.getWeekMonday(), '2026-09-14');
  assert.equal(feature.getSelectedDay(), 'Lundi');

  const generated = feature.generate();
  assert(generated);
  const snapshot = store.getState();
  assert.equal(snapshot.planning.currentWeek, '2026-09-14');
  assert.deepEqual(snapshot.planning.weeks['2026-09-14'].days.Lundi, ['alpha']);
  assert.deepEqual(snapshot.planning.weeks['2026-09-14'].days.Mardi, ['beta']);
  assert.equal(snapshot.settings.weekDate, '2026-09-16');

  assert.equal(feature.selectDay('Mardi'), 'Mardi');
  assert.equal(feature.getSelectedDay(), 'Mardi');
  assert.throws(() => feature.selectDay('Dimanche'), PlanningFeatureError);

  const list = feature.element.children.find(child => child.classList.contains('srv2-planning-list'));
  assert(list, 'liste planning introuvable');

  feature.selectDay('Lundi');

  // Même un très grand swipe gauche n'avance que d'un jour.
  dispatchPointer(list, 'pointerdown', 320, 120);
  dispatchPointer(list, 'pointermove', 150, 124);
  dispatchPointer(list, 'pointerup', 40, 126);
  assert.equal(feature.getSelectedDay(), 'Mardi');

  // Petit déplacement horizontal sous le seuil : aucun changement.
  dispatchPointer(list, 'pointerdown', 260, 120, 2);
  dispatchPointer(list, 'pointermove', 232, 122, 2);
  dispatchPointer(list, 'pointerup', 228, 123, 2);
  assert.equal(feature.getSelectedDay(), 'Mardi');

  // Geste vertical : abandonné comme swipe, donc le jour reste intact.
  dispatchPointer(list, 'pointerdown', 200, 100, 3);
  dispatchPointer(list, 'pointermove', 194, 170, 3);
  dispatchPointer(list, 'pointerup', 190, 230, 3);
  assert.equal(feature.getSelectedDay(), 'Mardi');

  // Swipe droite = jour précédent, puis bord gauche bloqué sur lundi.
  dispatchPointer(list, 'pointerdown', 80, 120, 4);
  dispatchPointer(list, 'pointermove', 190, 122, 4);
  dispatchPointer(list, 'pointerup', 280, 124, 4);
  assert.equal(feature.getSelectedDay(), 'Lundi');

  dispatchPointer(list, 'pointerdown', 80, 120, 5);
  dispatchPointer(list, 'pointermove', 190, 122, 5);
  dispatchPointer(list, 'pointerup', 280, 124, 5);
  assert.equal(feature.getSelectedDay(), 'Lundi');

  // Après destroy, les listeners du geste sont réellement retirés.
  feature.destroy();
  dispatchPointer(list, 'pointerdown', 320, 120, 6);
  dispatchPointer(list, 'pointermove', 150, 124, 6);
  dispatchPointer(list, 'pointerup', 40, 126, 6);
  assert.equal(feature.getSelectedDay(), 'Lundi');
}

// API stricte : document/store manquants refusés clairement.
assert.throws(() => createPlanningFeature(null), PlanningFeatureError);
assert.throws(() => createPlanningFeature({ document: createFakeDocument() }), PlanningFeatureError);

console.log('v2 planning week: ok');
