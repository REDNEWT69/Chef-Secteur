import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createDataToolsFeature } from '../src/app/data-tools.mjs';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';
import { migrateV1Backup, parseAndMigrateV1Backup, V1MigrationError } from '../src/migration/v1-backup.mjs';
import { loadState, saveState, STORAGE_KEY } from '../src/storage/persistence.mjs';
import { createFakeDocument } from './fake-dom.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureText = await readFile(resolve(here, '../fixtures/v1-backup-demo.json'), 'utf8');
const fixture = JSON.parse(fixtureText);

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    raw(key) { return values.get(key); },
  };
}

// Conversion principale : uniquement secteur + paramètres utiles au planning.
{
  const { state, report } = migrateV1Backup(fixture);
  assert.equal(state.version, 2);
  assert.equal(state.profile.sectorName, 'Secteur Import Démo');
  assert.equal(state.profile.baseName, 'Départ Import Démo');
  assert.equal(state.profile.baseLat, 45);
  assert.equal(state.profile.baseLon, 4);
  assert.equal(state.stores.length, 8);
  assert.equal(state.stores.filter(store => store.active !== false).length, 7);
  assert.equal(state.stores[0].id, 'v1-01');
  assert.equal(state.stores[0].dept, '01', 'le département reste une chaîne');
  assert.deepEqual(state.stores[0].products, ['A']);
  assert.equal(state.settings.target, 6);
  assert.equal(state.settings.maxVisitsPerDay, 2);
  assert.deepEqual(state.planning, { weeks: {}, excludedStoreIds: [] });
  assert.deepEqual(state.visits, []);
  assert.deepEqual(state.actions, []);
  assert.deepEqual(state.appointments, []);
  assert.equal(report.totalStores, 8);
  assert.equal(report.activeStores, 7);
  assert.equal(report.excludedStores, 0);
  assert.equal(report.gpsStores, 8);
  assert.equal(report.missingGpsStores, 0);
  assert(report.warnings.some(warning => warning.includes('state.notes')));
}

// Une exclusion V1 est une donnée de vivier, pas un historique : elle doit
// survivre au pont local et ne plus être annoncée comme "reste uniquement V1".
{
  const source = JSON.parse(fixtureText);
  source.state.excluded = { 'v1-02': true, 'v1-04': false, 'fantome': true };
  const { state, report } = migrateV1Backup(source);
  assert.deepEqual(state.planning.excludedStoreIds, ['v1-02']);
  assert.equal(report.excludedStores, 1);
  assert.equal(report.warnings.some(warning => warning.includes('state.excluded')), false);
}

// Les deux représentations historiques tolérées (objet ou tableau d'IDs)
// aboutissent au même contrat V2.
{
  const source = JSON.parse(fixtureText);
  source.state.excluded = ['v1-03'];
  const { state } = migrateV1Backup(source);
  assert.deepEqual(state.planning.excludedStoreIds, ['v1-03']);
}

// L'entrée ne doit jamais être mutée.
{
  const source = JSON.parse(fixtureText);
  const before = JSON.stringify(source);
  migrateV1Backup(source);
  assert.equal(JSON.stringify(source), before);
}

// Coordonnées vides : jamais 0,0 par coercition.
{
  const source = JSON.parse(fixtureText);
  source.state.stores[0].lat = '';
  source.state.stores[0].lon = null;
  const { state, report } = migrateV1Backup(source);
  assert.equal('lat' in state.stores[0], false);
  assert.equal('lon' in state.stores[0], false);
  assert.equal(report.missingGpsStores, 1);
}

// Identifiants manquants ou dupliqués : refus explicite.
{
  const missing = JSON.parse(fixtureText);
  delete missing.state.stores[0].id;
  assert.throws(() => migrateV1Backup(missing), V1MigrationError);

  const duplicate = JSON.parse(fixtureText);
  duplicate.state.stores[1].id = duplicate.state.stores[0].id;
  assert.throws(() => migrateV1Backup(duplicate), /dupliqué/);
}

// Mauvais contrats de sauvegarde : aucun import approximatif.
for (const mutate of [
  source => { source.format = 'AutreBackup'; },
  source => { source.version = 2; },
  source => { source.state.schemaVersion = 6; },
  source => { source.state.stores = {}; },
]) {
  const source = JSON.parse(fixtureText);
  mutate(source);
  assert.throws(() => migrateV1Backup(source), V1MigrationError);
}
assert.throws(() => parseAndMigrateV1Backup('{pas json'), /JSON invalide/);

// UI Plus : import local remplace le store et rend le résultat visible.
{
  const document = createFakeDocument();
  const store = createStore(createEmptyState());
  const feature = createDataToolsFeature({ document, store });
  const migrated = feature.importText(fixtureText);
  assert(migrated);
  assert.equal(store.getState().stores.length, 8);
  assert.equal(store.getState().profile.baseName, 'Départ Import Démo');
  const status = feature.element.children.find(child => child.classList.contains('srv2-data-tools-status'));
  assert(status.textContent.includes('8 magasins'));
  assert(status.textContent.includes('7 actifs'));
  assert(status.textContent.includes('1 élément d’historique reste uniquement dans V1'));
}

// Intégration persistance : un import notifié par le store est récupérable au
// prochain démarrage, sans dépendre de la fixture de démonstration.
{
  const storage = memoryStorage();
  const store = createStore(createEmptyState());
  store.subscribe(state => saveState(storage, state));
  const { state } = parseAndMigrateV1Backup(fixtureText);
  store.replace(state);
  assert(storage.raw(STORAGE_KEY));
  const reloaded = loadState(storage);
  assert.equal(reloaded.stores.length, 8);
  assert.equal(reloaded.profile.sectorName, 'Secteur Import Démo');
  assert.equal(reloaded.settings.target, 6);
  assert.deepEqual(reloaded.planning.excludedStoreIds, []);
}

console.log('v2 migration V1 locale: ok');
