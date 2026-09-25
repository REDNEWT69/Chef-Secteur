const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('src/chef-secteur.html', 'utf8');
const channel = vm.runInNewContext('(' + html.match(/function storeChannel\(store\)\{[^\n]+/)[0] + ')');
const old = {enseigne:'Darty', type:'Gros'};
assert.equal(channel(old), 'retail');
assert.equal(old.type, 'Gros');
for (const enseigne of ['Schmidt', ' SCHMIDT ', 'Cuisinella']) assert.equal(channel({enseigne}), 'cuisiniste');
assert.equal(channel({enseigne:'Schmidt',channel:'retail'}), 'retail');
assert.equal(channel({enseigne:'Darty',channel:'cuisiniste'}), 'cuisiniste');
assert.equal(channel({enseigne:'Schmidt',channel:'unknown'}), 'cuisiniste');
const ai = html.match(/function addAIParsedStores\(\)\{[^\n]+/)[0];
assert.doesNotMatch(ai, /state\.stores|\.push\(|save\(/);
assert.match(ai, /openStoreCreation\(aiParsedStores\)/);
assert.match(html, /if\(!id\)\{openStoreCreation\(\);return\}/);
// V261 : une seule porte d'entrée. Le noyau délègue l'ajout à store-add-v261.js.
assert.match(html, /function openStoreCreation\(drafts\)\{if\(window\.StoreRunnerStoreAdd&&typeof StoreRunnerStoreAdd\.open==='function'\)return StoreRunnerStoreAdd\.open\(\{drafts:/);
assert.doesNotMatch(html, /createStoreDlg|locateStoreDraft|confirmStoreCreation|RegionStores\.enrich\(draft\)/, 'ancien formulaire d’ajout retiré');
assert.match(html, /id="fLat" type="hidden"/);
assert.match(html, /id="fLon" type="hidden"/);
// Outils d'import en nombre rangés dans Données › Outils avancés, hors de l'écran Magasins.
const stores=html.match(/<section id="storesPanel"[\s\S]*?<\/section>/)[0];
assert.doesNotMatch(stores, /csv|aiParseStores|import|Carnet officiel|Gérer mon secteur/i);
const advanced=html.match(/<details id="storeToolsAdvanced"[\s\S]*?<\/details>/)[0];
for (const needle of ['id="storeToolsHost"', 'aiParseStores()', 'importCSVText()', 'id="csvFile"']) assert.ok(advanced.includes(needle), needle);
for (const file of ['official-catalog.js', 'sector-admin.js']) {
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /getElementById\('storeToolsHost'\)/, file);
  assert.doesNotMatch(src, /querySelector\('#storesPanel \.toolbar'\)/, file);
}
console.log('PASS: historical type preserved, channel precedence/fallback, single add entry delegated to store-add-v261, AI drafts routed through it, advanced tools moved to Données.');
