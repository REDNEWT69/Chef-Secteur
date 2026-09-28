// V263 — sélection multiple depuis le carnet officiel existant.
const assert = require('node:assert/strict');
const catalog = require('../official-catalog.js');
const data = require('../data/official-stores.json');
const storeAdd = require('../store-add-v261.js');
const regions = require('../region-stores.js');

// #467 — l'audit suit le snapshot livré : plus de comptes figés, mais des invariants.
const audit = Object.fromEntries(catalog.audit(data).map(row => [row.brand, row]));
for (const brand of ['Boulanger', 'Darty', 'Fnac', 'Conforama', 'Cuisinella', 'Carrefour']) {
  const rows = data.stores.filter(s => s.enseigne === brand), source = data.sources[brand] || {};
  assert.equal(audit[brand].count, rows.length, brand + ' : compte de l’audit = fiches du carnet');
  assert.equal(audit[brand].regions, new Set(rows.map(s => s.regionCode)).size, brand + ' : régions couvertes');
  assert.equal(audit[brand].rawStatus, source.status || 'unavailable');
  const proven = source.status === 'complete' && Object.values(source.regions || {}).length === 12 && Object.values(source.regions).every(r => r.status === 'collected');
  assert.equal(audit[brand].source, !rows.length ? 'unavailable' : proven ? 'complete' : 'partial', brand + ' : « complet » seulement avec preuve');
}

const darty84 = data.stores.filter(s => s.enseigne === 'Darty' && s.regionCode === '84');
assert.equal(catalog.filter(data, 'Darty', '84').length, darty84.length, 'enseigne + région filtre le carnet officiel');
assert.ok(darty84.length > 2);
assert.equal(catalog.coverage(data, 'Darty', '84').level, data.sources.Darty.status === 'complete' ? 'complete' : 'partial', 'couverture Darty alignée sur la preuve');
assert.equal(catalog.coverage(data, 'Darty', '94').level, 'unavailable', 'Corse Darty explicitement indisponible');
const cuis84 = data.stores.filter(s => s.enseigne === 'Cuisinella' && s.regionCode === '84');
assert.equal(catalog.filter(data, 'Cuisinella', '84').length, cuis84.length, 'région Cuisinella déduite du code postal');
for (const brand of ['Fnac', 'Carrefour']) {
  const cov = catalog.coverage(data, brand, '84'), n = data.stores.filter(s => s.enseigne === brand && s.regionCode === '84').length;
  assert.equal(cov.level, n ? 'partial' : 'unavailable', brand + ' : jamais « complet » sans annuaire de l’enseigne');
  if (n) assert.match(cov.message, /Sirene/, brand + ' : la source Sirene est annoncée');
}
// Une région « collected » dans une enseigne sans preuve n'est jamais présentée comme complète.
const forged = JSON.parse(JSON.stringify(data));
forged.sources.Darty.status = 'partial';
forged.sources.Darty.regions['84'] = { status: 'collected', count: darty84.length };
assert.equal(catalog.coverage(forged, 'Darty', '84').level, 'partial');

const darty = catalog.filter(data, 'Darty', '84').slice(0, 2);
const classified = storeAdd.catalogRows(darty, [darty[0]], regions.duplicate);
assert.equal(classified[0].exists, true, 'magasin existant détecté avec RegionStores');
assert.equal(classified[0].selectable, false, 'magasin existant non sélectionnable comme nouveau');
assert.equal(classified[1].selectable, true);
const incomplete = storeAdd.catalogRows([{id:'x', enseigne:'Darty', ville:'Lyon', adresse:'', lat:null, lon:null}], [], regions.duplicate)[0];
assert.equal(incomplete.complete, false);
assert.equal(incomplete.selectable, false, 'fiche incomplète ignorée');

let persisted = null, checkpoints = 0;
globalThis.ChefReliability = {
  capture(){return {state:{stores:[JSON.parse(JSON.stringify(darty[0]))]}}},
  validate(){return true},
  checkpoint(){checkpoints++},
  persist(bundle){persisted = bundle.state}
};
assert.equal(regions.commit([darty[0], darty[1]]), 1, 'lot mixte : le doublon est ignoré, le nouveau est conservé');
assert.equal(persisted.stores.length, 2);
assert.equal(checkpoints, 1, 'une seule sauvegarde préalable pour l’opération utilisateur');
delete globalThis.ChefReliability;

console.log('Store add assisted V263 tests: OK');
