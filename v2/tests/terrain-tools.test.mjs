import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';
import {
  formatPlanningForTeamHaven,
  hasCompletePlanningRange,
} from '../src/planning/teamhaven.mjs';
import { createTerrainToolsFeature } from '../src/planning/terrain-tools.mjs';
import { createFakeDocument } from './fake-dom.mjs';

function terrainState() {
  const state = createEmptyState();
  state.profile = {
    baseName: 'Départ importé',
    baseLat: 45.75,
    baseLon: 4.85,
  };
  state.stores = [
    { id: 'a', enseigne: 'Alpha', ville: 'Lyon', adresse: '1 rue A', active: true },
    { id: 'b', enseigne: 'Bêta', ville: 'Bron', adresse: '2 rue B', active: true },
    { id: 'c', enseigne: 'Gamma', ville: 'Vienne', adresse: '3 rue C', active: true },
  ];
  state.settings = {
    weekDate: '2026-09-14',
    days: ['Lundi', 'Mardi'],
  };
  state.planning = {
    currentWeek: '2026-09-14',
    lastRange: {
      startWeek: '2026-09-14',
      endWeek: '2026-09-28',
      algorithm: 'snail-distance-v1',
    },
    weeks: {
      '2026-09-14': {
        weekMonday: '2026-09-14',
        algorithm: 'snail-distance-v1',
        days: { Lundi: ['a', 'b'], Mardi: ['c'] },
      },
      '2026-09-21': {
        weekMonday: '2026-09-21',
        algorithm: 'snail-distance-v1',
        days: { Lundi: ['b'], Mardi: ['a'] },
      },
      '2026-09-28': {
        weekMonday: '2026-09-28',
        algorithm: 'snail-distance-v1',
        days: { Lundi: ['c'], Mardi: [] },
      },
    },
  };
  return state;
}

// La synthèse reste une transformation pure de l'état local et fournit les
// dates/jours/magasins nécessaires à une recopie manuelle dans TeamHaven.
{
  const state = terrainState();
  const before = JSON.stringify(state);
  assert.equal(hasCompletePlanningRange(state), true);
  const text = formatPlanningForTeamHaven(state);
  assert(text.includes('SEMAINE DU 14/09/2026'));
  assert(text.includes('Lundi 14/09/2026'));
  assert(text.includes('Mardi 15/09/2026'));
  assert(text.includes('1. Alpha · Lyon · 1 rue A'));
  assert(text.includes('2. Bêta · Bron · 2 rue B'));
  assert(text.includes('SEMAINE DU 28/09/2026'));
  assert(text.includes('Aucun magasin'));
  assert.equal(JSON.stringify(state), before, 'le formatage ne doit pas muter l’état');
}

// Une période incomplète n'est jamais présentée comme prête à copier.
{
  const state = terrainState();
  delete state.planning.weeks['2026-09-28'];
  assert.equal(hasCompletePlanningRange(state), false);
}

// Feature locale : le départ importé est visible, un départ explicite peut le
// remplacer, et aucune coordonnée invalide ne doit entrer dans le store.
{
  const document = createFakeDocument();
  const store = createStore(terrainState());
  let copied = '';
  const clipboard = { writeText: async text => { copied = text; } };
  const feature = createTerrainToolsFeature({ document, store, clipboard });

  assert.equal(feature.inputs.name.value, 'Départ importé');
  assert.equal(feature.inputs.lat.value, '45.75');
  assert.equal(feature.inputs.lon.value, '4.85');
  assert(feature.output.value.includes('SEMAINE DU 14/09/2026'));

  feature.inputs.name.value = 'Agence locale';
  feature.inputs.lat.value = '46.123456';
  feature.inputs.lon.value = '5.654321';
  assert.equal(feature.saveOrigin(), true);
  let snapshot = store.getState();
  assert.equal(snapshot.settings.originName, 'Agence locale');
  assert.equal(snapshot.settings.originLat, 46.123456);
  assert.equal(snapshot.settings.originLon, 5.654321);

  feature.inputs.lat.value = '999';
  assert.equal(feature.saveOrigin(), false);
  snapshot = store.getState();
  assert.equal(snapshot.settings.originLat, 46.123456);

  assert.equal(await feature.copyTeamHaven(), true);
  assert.equal(copied, feature.output.value);
  assert(copied.includes('Alpha · Lyon · 1 rue A'));
  feature.destroy();
}

console.log('v2 terrain tools: ok');
