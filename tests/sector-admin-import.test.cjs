const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../reliability-core.js');
const copy = value => JSON.parse(JSON.stringify(value));
const source = fs.readFileSync(path.join(__dirname, '../sector-admin.js'), 'utf8');

// Minimal DOM adapter: execute the real install, file.onchange and save handlers.
class Element {
  constructor() { this.value = ''; this.style = {}; this.children = []; this.nodes = new Map(); }
  append(child) { this.children.push(child); }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector);
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  showModal() {}
  close() {}
}
function fixture() {
  const old = {id: 'old', enseigne: 'Darty', sourceName: 'Fiche synthétique ancienne',
    adresse: '1 rue Fictive', codePostal: '99001', ville: 'Ville-Test A', dept: '99', lat: 42.9, lon: -1.5,
    freq: 3, intervalDays: 21, priority: 4, active: false, products: ['Produit synthétique'], type:'Gros', channel:'cuisiniste'};
  const state = {schemaVersion: 5, stores: [old], profile: {}, settings: {},
    visits: {old: {history: ['2026-09-01']}}, notes: {old: 'Note synthétique'},
    included: {old: true}, excluded: {old: false}, locks: {old: 'Lundi'},
    plan: {Lundi: [{id: 'old'}]}, appointments: [
      {id: 'appointment', storeId: 'old', date: '2026-09-14', time: '09:00'}]};
  const other = {...old, id: 'catalog-only', adresse: '9 rue Catalogue', sourceName: 'Catalogue synthétique'};
  const host = new Element(), body = new Element(), data = new Map();
  const db = {getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key)};
  db.setItem(R.keys.MAIN, JSON.stringify(state));
  const calls = {capture: 0, checkpoint: 0, persist: 0};
  const root = {state, localStorage: db, ChefNationalSectors: {loadCatalog: async () => [other]},
    ChefReliability: Object.fromEntries(['capture', 'checkpoint', 'persist'].map(key =>
      [key, (...args) => { calls[key]++; return R[key](...args); }]))};
  const document = {readyState: 'complete', body, querySelector: () => host,
    getElementById: () => null, createElement: () => new Element()};
  vm.runInNewContext(source, {window: root, document, setTimeout: () => 0});
  const dialog = body.children[0];
  return {root, old, other, calls, db, data, open: () => host.children[0].onclick(),
    q: selector => dialog.querySelector(selector)};
}
async function importFile(f, row) {
  f.q('#saFile').files = [{text: async () => JSON.stringify({
    format: 'ChefSecteurSector', version: 1, name: 'Secteur synthétique', stores: [row]})}];
  await f.q('#saFile').onchange();
  assert.match(f.q('#saStats').textContent, /^Secteur importé\./);
}
function assertBusiness(f, id, before) {
  const row = f.root.state.stores.find(s => s.id === id);
  for (const key of ['freq', 'intervalDays', 'priority', 'active', 'products', 'type', 'channel'])
    assert.deepEqual(copy(row[key]), f.old[key], key);
  for (const key of ['visits', 'notes', 'included', 'excluded', 'locks'])
    assert.deepEqual(copy(f.root.state[key][id]), before[key].old, key);
}
async function scenario(byFingerprint) {
  const f = fixture(), before = copy(f.root.state), original = f.root.state;
  const storedBefore = [...f.data];
  const imported = {...f.old, id: byFingerprint ? 'imported' : 'old', lat: 44.4, lon: 0,
    sourceName: 'Fiche synthétique corrigée', freq: 1, intervalDays: 7, priority: 1,
    active: true, products: ['Autre produit'], type:'Petit', channel:'retail'};
  if (byFingerprint) {
    // Accents, case and punctuation normalize to the same current fp().
    imported.adresse = '1 RUE Fictive!'; imported.ville = 'VILLE-TEST A';
  } else {
    imported.adresse = '2 rue Corrigée'; imported.codePostal = '38000'; imported.ville = 'Ville-Test F';
  }
  await f.open();
  const payload = JSON.stringify({format: 'ChefSecteurSector', version: 1, stores: [imported]});
  assert.deepEqual(copy(f.root.ChefSectorAdmin.parseImport(payload).stores), [imported]);
  assert.throws(() => f.root.ChefSectorAdmin.parseImport('{"format":"invalid"}'));
  await importFile(f, imported);
  assert.strictEqual(f.root.state, original);
  assert.deepEqual(f.root.state, before, 'loading must preserve stores, business data and planning');
  assert.deepEqual([...f.data], storedBefore, 'loading must not persist');
  assert.deepEqual(f.calls, {capture: 0, checkpoint: 0, persist: 0});
  const cards = f.q('#saList').children;
  assert.equal(cards.length, 2, 'catalogue only completes absent stores');
  assert(cards.some(card => card.html.includes(imported.sourceName)), 'imported card wins before saving');
  assert(cards.some(card => card.html.includes(f.other.sourceName)), 'unmatched catalogue row retained');
  f.q('#saSave').onclick();
  assert.match(f.q('#saStats').textContent, /^1 magasins enregistrés/);
  assert.deepEqual(f.calls, {capture: 1, checkpoint: 1, persist: 1});
  assert.equal(f.root.state.stores.length, 1, 'only imported selection is applied');
  const saved = f.root.state.stores[0];
  for (const key of ['id', 'lat', 'lon', 'adresse', 'codePostal', 'ville', 'sourceName'])
    assert.equal(saved[key], imported[key], key);
  assertBusiness(f, imported.id, before);
  assert.deepEqual(copy(f.root.state.plan), {}, 'applyExact clears the plan');
  assert.deepEqual(original, before, 'captured state is not mutated in place');
  assert.deepEqual(R.load(f.db), copy(f.root.state), 'saved data round-trips through reliability');
  assert.equal(R.backups(f.db).length, 1);
  if (byFingerprint) assert.equal(f.root.state.appointments[0].storeId, 'imported');
  else assert.deepEqual(copy(f.root.state.appointments), before.appointments);
}
(async () => {
  await scenario(false);
  console.log('PASS: same-ID import priority and business preservation.');
  await scenario(true);
  console.log('PASS: fingerprint import priority and business/appointment ID migration.');
  console.log('PASS: parsing/file loading has no state or storage side effects; save alone applies the sector and resets planning.');
})().catch(error => { console.error(error); process.exitCode = 1; });
