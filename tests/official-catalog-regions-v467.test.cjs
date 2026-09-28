// #467 — le carnet officiel et ses sélecteurs ne couvrent que la France
// métropolitaine continentale : exactement 12 régions, ni Corse ni outre-mer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../official-catalog.js');
const data = require('../data/official-stores.json');

const EXPECTED = [
  ['84', 'Auvergne-Rhône-Alpes'], ['27', 'Bourgogne-Franche-Comté'], ['53', 'Bretagne'],
  ['24', 'Centre-Val de Loire'], ['44', 'Grand Est'], ['32', 'Hauts-de-France'],
  ['11', 'Île-de-France'], ['28', 'Normandie'], ['75', 'Nouvelle-Aquitaine'],
  ['76', 'Occitanie'], ['52', 'Pays de la Loire'], ['93', "Provence-Alpes-Côte d'Azur"]
];
const OUT_OF_SCOPE = /corse|guadeloupe|martinique|guyane|r[ée]union|mayotte|outre-mer|saint-pierre|polyn[ée]sie|cal[ée]donie|wallis|barth[ée]lemy|saint-martin/i;

// 1. Exactement 12 régions, dans l'ordre attendu, sans région hors périmètre.
const regions = catalog.regions();
assert.equal(regions.length, 12, 'exactement 12 régions');
assert.deepEqual(regions.map(r => [r.code, r.name]), EXPECTED, 'liste et ordre des 12 régions continentales');
for (const r of regions) assert.doesNotMatch(r.name, OUT_OF_SCOPE, 'aucune région hors périmètre : ' + r.name);
assert.ok(!regions.some(r => ['94', '01', '02', '03', '04', '06'].includes(r.code)), 'aucun code Corse / DROM');
regions[0].name = 'modifié';
assert.equal(catalog.regions()[0].name, 'Auvergne-Rhône-Alpes', 'la liste exposée est une copie');

// 2. Les 94 départements continentaux et eux seuls reçoivent une région.
const depts = [];
for (let n = 1; n <= 95; n++) if (n !== 20) depts.push(String(n).padStart(2, '0'));
assert.equal(depts.length, 94);
const codes = new Set(EXPECTED.map(([code]) => code));
for (const d of depts) {
  const code = catalog.regionCodeFor({ codePostal: d + '100' });
  assert.ok(codes.has(code), 'département ' + d + ' rattaché à une des 12 régions');
}
for (const postal of ['20000', '20090', '20200', '20600', '97100', '97200', '97300', '97400', '97600', '97500', '98000', '98800', '99999', '00100']) {
  assert.equal(catalog.regionCodeFor({ codePostal: postal }), '', 'CP ' + postal + ' hors périmètre');
  assert.equal(catalog.isContinentalPostal(postal), false, 'CP ' + postal + ' non continental');
}
for (const dept of ['2A', '2B', '20', '971', '972', '973', '974', '976'])
  assert.equal(catalog.regionCodeFor({ dept }), '', 'département ' + dept + ' hors périmètre');
// Le code postal fait foi, même face à un regionCode explicite contradictoire.
assert.equal(catalog.regionCodeFor({ codePostal: '20000', regionCode: '84' }), '');
assert.equal(catalog.regionCodeFor({ codePostal: '97400', regionCode: '04' }), '');
assert.equal(catalog.regionCodeFor({ codePostal: '69003', regionCode: '94' }), '84');
assert.equal(catalog.regionCodeFor({ regionCode: '94' }), '', 'code Corse explicite refusé');
assert.equal(catalog.regionCodeFor({ regionCode: '11' }), '11', 'sans CP, un code continental explicite reste lisible');
assert.equal(catalog.regionCodeFor({ codePostal: '75 008' }), '11', 'espaces tolérés dans le CP');

// 3. Un snapshot contenant des fiches Corse/DROM ne les fait jamais sortir du carnet.
const polluted = { generatedAt: 'x', sources: {}, stores: [
  { id: 'a', enseigne: 'Darty', codePostal: '20000', regionCode: '94', ville: 'Ajaccio' },
  { id: 'b', enseigne: 'Darty', codePostal: '97200', regionCode: '02', ville: 'Fort-de-France' },
  { id: 'c', enseigne: 'Darty', codePostal: '97400', regionCode: '84', ville: 'Saint-Denis' },
  { id: 'd', enseigne: 'Darty', codePostal: '69003', regionCode: '94', ville: 'Lyon' },
  { id: 'e', enseigne: 'Darty', dept: '2A', ville: 'Ajaccio' },
  null
] };
const clean = catalog.normalizeSnapshot(polluted);
assert.deepEqual(clean.stores.map(s => s.id), ['d'], 'seule la fiche continentale reste');
assert.equal(clean.stores[0].regionCode, '84');
assert.equal(clean.stores[0].region, 'Auvergne-Rhône-Alpes');
assert.deepEqual(catalog.filter(polluted, 'Darty', '94'), [], 'recherche Corse vide');
assert.deepEqual(catalog.filter(polluted, 'Darty', '02'), [], 'recherche Martinique vide');
assert.equal(catalog.coverage(polluted, 'Darty', '94').level, 'unavailable');

// 4. Le carnet livré : aucune fiche hors périmètre, région cohérente avec le CP.
for (const s of data.stores) {
  const postal = String(s.codePostal || '');
  assert.match(postal, /^\d{5}$/, 'CP à 5 chiffres : ' + s.id);
  assert.ok(!/^(20|97|98)/.test(postal), 'aucun CP 20/97/98 : ' + s.id);
  assert.ok(!['2A', '2B', '20'].includes(String(s.dept || '').toUpperCase()), 'aucun département 2A/2B : ' + s.id);
  assert.ok(codes.has(String(s.regionCode)), 'région continentale : ' + s.id);
  assert.equal(catalog.regionCodeFor(s), s.regionCode, 'région = région du CP : ' + s.id);
  assert.doesNotMatch(String(s.region || ''), OUT_OF_SCOPE, 'nom de région hors périmètre : ' + s.id);
}
assert.equal(catalog.normalizeSnapshot(data).stores.length, data.stores.length, 'aucune fiche livrée écartée au chargement');
for (const [brand, source] of Object.entries(data.sources || {}))
  for (const key of Object.keys(source.regions || {}))
    assert.ok(codes.has(key), brand + ' : clé de région hors périmètre dans les sources : ' + key);

// 5. Recherche enseigne + région : uniquement la paire demandée, triée, et
//    l'union des 12 régions redonne toutes les fiches de l'enseigne.
for (const brand of catalog.brands(data)) {
  let total = 0;
  for (const { code } of regions) {
    const rows = catalog.filter(data, brand, code);
    total += rows.length;
    for (const s of rows) { assert.equal(s.enseigne, brand); assert.equal(s.regionCode, code); }
    const sorted = rows.slice().sort((a, b) => (a.ville + ' ' + a.sourceName).localeCompare(b.ville + ' ' + b.sourceName, 'fr'));
    assert.deepEqual(rows.map(s => s.id), sorted.map(s => s.id), brand + ' ' + code + ' trié par ville');
  }
  assert.equal(total, data.stores.filter(s => s.enseigne === brand).length, brand + ' : aucune fiche perdue entre les 12 régions');
}

// 6. Aucune réintroduction de régions par geo.api.gouv.fr dans le runtime.
const ROOT = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const runtime = new Set(['src/chef-secteur.html']);
for (const m of indexHtml.matchAll(/['"]\.\/([\w./-]+\.js)['"]/g)) runtime.add(m[1]);
for (const file of runtime) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  assert.doesNotMatch(src, /https?:\/\/geo\.api\.gouv\.fr/, file + ' ne doit plus appeler geo.api.gouv.fr');
}
for (const file of ['official-catalog.js', 'region-stores.js', 'store-add-v261.js']) {
  assert.ok(runtime.has(file), file + ' fait partie du runtime contrôlé');
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.doesNotMatch(src, /'(?:Corse|Guadeloupe|Martinique|Guyane|La Réunion|Mayotte)'/, file + ' : aucun libellé de région hors périmètre');
}
const officialSrc = fs.readFileSync(path.join(ROOT, 'official-catalog.js'), 'utf8');
assert.doesNotMatch(officialSrc, /'2A'|'2B'|'20':|'97[1-6]'/, 'DEPT_REGION sans Corse ni DROM');
assert.match(fs.readFileSync(path.join(ROOT, 'region-stores.js'), 'utf8'), /StoreRunnerOfficialCatalog[^;]*regions\(\)/, 'ancien dialogue région : même source que le carnet');

// 7. Magasins connus : un point de vente phare par région doit être retrouvé par
//    la recherche enseigne + région (fiches officielles relevées le 28/09/2026).
const KNOWN = [
  ['Darty', '84', '/84-darty-la-part-dieu'], ['Darty', '27', '/145-darty-quetigny'], ['Darty', '53', '/156-darty-saint-malo'],
  ['Darty', '24', '/133-darty-olivet'], ['Darty', '44', '/169-darty-strasbourg-les-halles'], ['Darty', '32', '/6-darty-amiens'],
  ['Darty', '11', '/149-darty-republique'], ['Darty', '28', '/103-darty-lisieux'], ['Darty', '75', '/39-darty-brive'],
  ['Darty', '76', '/140-darty-perpignan'], ['Darty', '52', '/8-darty-angers-atoll'], ['Darty', '93', '/41-darty-plan-de-campagne']
];
for (const [brand, code, path] of KNOWN) {
  const hit = catalog.filter(data, brand, code).find(s => String(s.sourceUrl || '').endsWith(path));
  assert.ok(hit, brand + ' ' + path + ' retrouvé en ' + code);
}
assert.deepEqual([...new Set(KNOWN.map(k => k[1]))].sort(), [...codes].sort(), 'un magasin connu dans chacune des 12 régions');

console.log('Official catalog regions V467 tests: OK');
