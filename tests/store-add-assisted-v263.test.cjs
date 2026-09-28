// V263 — sélection multiple depuis le carnet officiel existant.
const assert = require('node:assert/strict');
const catalog = require('../official-catalog.js');
const data = require('../data/official-stores.json');
const storeAdd = require('../store-add-v261.js');
const regions = require('../region-stores.js');

const audit = Object.fromEntries(catalog.audit(data).map(row => [row.brand, row]));
assert.deepEqual(audit.Boulanger, {brand:'Boulanger', count:98, regions:12, source:'partial', rawStatus:'partial'});
assert.deepEqual(audit.Darty, {brand:'Darty', count:398, regions:12, source:'partial', rawStatus:'partial'});
assert.deepEqual(audit.Fnac, {brand:'Fnac', count:0, regions:0, source:'unavailable', rawStatus:'no high-confidence store parsed'});
assert.deepEqual(audit.Conforama, {brand:'Conforama', count:133, regions:12, source:'partial', rawStatus:'partial'});
assert.deepEqual(audit.Cuisinella, {brand:'Cuisinella', count:250, regions:12, source:'partial', rawStatus:'ok'});
assert.deepEqual(audit.Carrefour, {brand:'Carrefour', count:0, regions:0, source:'unavailable', rawStatus:'no high-confidence store parsed'});

assert.equal(catalog.filter(data, 'Darty', '84').length, 63, 'enseigne + région filtre le carnet officiel');
assert.equal(catalog.coverage(data, 'Darty', '84').level, 'complete', 'région collectée signalée complète');
assert.equal(catalog.coverage(data, 'Darty', '94').level, 'unavailable', 'Corse Darty explicitement indisponible');
assert.equal(catalog.filter(data, 'Cuisinella', '84').length, 31, 'région Cuisinella déduite du code postal');
assert.equal(catalog.coverage(data, 'Cuisinella', '84').level, 'partial', 'déduction régionale jamais présentée comme exhaustive');
assert.equal(catalog.coverage(data, 'Fnac', '84').level, 'unavailable');

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
