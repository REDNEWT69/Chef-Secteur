// V261 — ajout d'un magasin : chercher → choisir → ajouter.
// Logique pure et couche réseau du module store-add-v261.js, avec un fetch simulé :
// aucun appel réel au service de recherche.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const A = require('../store-add-v261.js');
const source = fs.readFileSync('store-add-v261.js', 'utf8');

const darty = {place_id: 1, osm_type: 'node', osm_id: 101, lat: '45.9905', lon: '4.7201', category: 'shop', type: 'electronics',
  addresstype: 'shop', name: 'Darty Villefranche', display_name: 'Darty Villefranche, 210 Route de Frans, Arnas, 69400, France',
  address: {shop: 'Darty Villefranche', house_number: '210', road: 'Route de Frans', town: 'Arnas', postcode: '69400', country_code: 'fr'},
  extratags: {brand: 'DARTY', phone: '+33 4 74 00 00 00', website: 'https://www.darty.com/nav/achat/magasins/villefranche'},
  namedetails: {name: 'Darty Villefranche', brand: 'Darty'}};
const boulanger = {place_id: 2, osm_type: 'way', osm_id: 202, lat: '45.9811', lon: '4.7302', category: 'shop', type: 'electronics',
  name: 'Boulanger', address: {road: 'Avenue de l’Europe', city: 'Villefranche-sur-Saône', postcode: '69400'}, extratags: {}, namedetails: {name: 'Boulanger'}};
const city = {place_id: 3, osm_type: 'relation', osm_id: 303, lat: '45.98', lon: '4.72', category: 'boundary', type: 'administrative',
  addresstype: 'town', name: 'Villefranche-sur-Saône', address: {town: 'Villefranche-sur-Saône', postcode: '69400'}};
const address = {place_id: 4, osm_type: 'node', osm_id: 404, lat: '45.99', lon: '4.71', category: 'place', type: 'house',
  addresstype: 'place', address: {house_number: '12', road: 'Rue Nationale', town: 'Villefranche-sur-Saône', postcode: '69400'}};
const kitchen = {place_id: 5, osm_type: 'node', osm_id: 505, lat: '45.77', lon: '4.86', category: 'shop', type: 'kitchen',
  name: 'Schmidt Lyon Est', address: {house_number: '5', road: 'Rue Test', city: 'Lyon', postcode: '69003'}, extratags: {}, namedetails: {}};

// --- résultats : plusieurs, un seul, aucun -------------------------------------------------
const existing = [{id: 's1', enseigne: 'Darty', ville: 'Lyon', adresse: '1 rue A', lat: 45.76, lon: 4.84}];
const many = A.candidatesFrom([city, address, darty, boulanger, darty], existing);
assert.equal(many.length, 3, 'ville écartée, doublon de réponse fusionné');
assert.deepEqual(many.map(c => c.kind), ['store', 'store', 'address'], 'établissements avant adresses');
const d = many[0].store;
assert.equal(d.enseigne, 'Darty', 'libellé d’enseigne du secteur réutilisé (et non « DARTY »)');
assert.equal(d.sourceName, 'Darty Villefranche');
assert.equal(d.adresse, '210 Route de Frans');
assert.equal(d.ville, 'Arnas');
assert.equal(d.codePostal, '69400');
assert.equal(d.lat, 45.9905); assert.equal(d.lon, 4.7201);
assert.equal(d.id, 'osm-node-101');
assert.equal(d.sourceUrl, 'https://www.openstreetmap.org/node/101');
assert.equal(d.phone, '+33 4 74 00 00 00');
assert.match(d.website, /^https:\/\/www\.darty\.com/);
assert.equal(many[1].store.enseigne, 'Boulanger');
assert.equal(many[2].store.adresse, '12 Rue Nationale');
assert.equal(A.candidatesFrom([darty], []).length, 1, 'résultat unique');
assert.deepEqual(A.candidatesFrom([], []), [], 'aucun résultat');
assert.deepEqual(A.candidatesFrom([city], []), [], 'une ville seule n’est pas un magasin');
assert.deepEqual(A.candidatesFrom(null, []), []);
assert.equal(A.candidatesFrom([{...darty, extratags: {website: 'javascript:alert(1)', phone: '<b>'}}], [])[0].store.website, undefined, 'site non http écarté');

// --- enseigne ------------------------------------------------------------------------------
assert.equal(A.detectBrand('Darty Villefranche', '', []), 'Darty');
assert.equal(A.detectBrand('DARTY', '', [{enseigne: 'Darty'}]), 'Darty');
assert.equal(A.detectBrand('Cuisines Martin', '', []), 'Cuisines Martin', 'commerce indépendant : son nom devient l’enseigne');
assert.equal(A.detectBrand('Boulangerie Paul', '', []), 'Boulangerie Paul', 'pas de faux positif « Boulanger »');
assert.equal(A.detectBrand('Magasin', 'Schmidt', []), 'Schmidt');

// --- doublons ------------------------------------------------------------------------------
const sector = [
  {id: 'a', enseigne: 'Darty', sourceName: 'Darty Arnas', ville: 'Arnas', adresse: '210 route de Frans', lat: 45.9906, lon: 4.7203},
  {id: 'b', enseigne: 'Boulanger', ville: 'Villefranche-sur-Saône', adresse: '1 rue Ailleurs', lat: 45.97, lon: 4.70},
  {id: 'c', enseigne: 'Fnac', ville: 'Lyon', adresse: '85 rue de la République', lat: 45.76, lon: 4.83}
];
assert.equal(A.findDuplicate(d, sector).level, 'same', 'même enseigne à quelques mètres');
assert.equal(A.findDuplicate(d, sector).store.id, 'a');
assert.equal(A.findDuplicate({...d, lat: null, lon: null}, sector).level, 'same', 'même enseigne, même adresse');
assert.equal(A.findDuplicate({...d, id: 'x', sourceUrl: ''}, [{...sector[0], id: 'x'}]).level, 'same', 'même identifiant');
assert.equal(A.findDuplicate(many[1].store, sector).level, 'probable', 'même enseigne dans la même ville, à 1,5 km');
assert.equal(A.findDuplicate({enseigne: 'Darty', ville: 'Lyon', adresse: '9 rue Z', lat: 45.75, lon: 4.85}, sector), null, 'autre ville, autre enseigne');
assert.equal(A.findDuplicate({enseigne: 'Conforama', ville: 'Lyon', adresse: '85 rue de la République', lat: 45.76, lon: 4.83}, sector).level, 'probable', 'même adresse, même bâtiment');
assert.equal(A.findDuplicate({enseigne: 'Darty', ville: 'Mâcon', adresse: 'x', lat: 46.3, lon: 4.83}, sector), null);
// Cohérence avec RegionStores.commit : tout ce que commit refuse est « same » ici.
const R = require('../region-stores.js');
for (const s of sector) for (const c of [d, many[1].store]) if (R.duplicate(c, [s])) assert.equal(A.findDuplicate(c, [s]).level, 'same');

// --- brouillons et magasin final --------------------------------------------------------------
assert.equal(A.draftQuery({enseigne: 'Schmidt', nom: 'Centre', ville: 'Lyon'}), 'Schmidt Centre Lyon');
assert.equal(A.draftQuery({enseigne: 'Boulanger', sourceName: 'BOULANGER AUBIERE / Clermont', ville: 'AUBIERE'}), 'BOULANGER AUBIERE / Clermont');
assert.equal(A.draftQuery({}), '');
const final = A.finalizeStore(A.candidatesFrom([kitchen], [])[0].store, []);
assert.deepEqual({freq: final.freq, intervalDays: final.intervalDays, priority: final.priority, active: final.active, products: final.products, channel: final.channel, dept: final.dept},
  {freq: 'Mensuel', intervalDays: 30, priority: 3, active: true, products: ['À confirmer'], channel: 'cuisiniste', dept: '69'});
assert.ok(R.complete(final), 'magasin complet pour RegionStores.commit (adresse, ville, coordonnées)');
assert.match(A.finalizeStore({enseigne: 'X', ville: 'Y', adresse: 'Z', lat: 1, lon: 2}, []).id, /^u\d+_\d+$/, 'saisie manuelle : identifiant local');

// --- requête : politique Nominatim --------------------------------------------------------------
const url = new URL(A.searchUrl('Darty Villefranche', {lat: 45.99, lon: 4.72}));
assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/search');
assert.equal(url.searchParams.get('q'), 'Darty Villefranche');
assert.equal(url.searchParams.get('countrycodes'), 'fr');
assert.equal(url.searchParams.get('bounded'), null, 'le secteur classe, il ne filtre pas');
assert.ok(url.searchParams.get('viewbox'));
assert.equal(new URL(A.searchUrl('x', null)).searchParams.get('viewbox'), null);
assert.doesNotMatch(source, /api[_-]?key|token|secret/i, 'aucune clé');
assert.doesNotMatch(source, /addEventListener\('input',[^)]*runSearch|oninput[^;]*search\(/, 'pas d’autocomplétion : une requête par validation');
assert.doesNotMatch(source, /setInterval/);
assert.doesNotMatch(source, /localStorage|__chefStorage|official-stores\.json/, 'aucune base embarquée, aucun cache persistant des résultats');
assert.match(source, /MIN_INTERVAL_MS=1100/);
assert.match(source, /openstreetmap\.org\/copyright/, 'attribution OSM');
assert.match(source, /R\.commit\(\[row\]\)/, 'enregistrement par le propriétaire historique');

// --- réseau simulé ---------------------------------------------------------------------------
(async () => {
  const calls = [];
  globalThis.navigator = {onLine: true};
  globalThis.state = {profile: {}, stores: sector};
  let reply = () => ({ok: true, status: 200, json: async () => [darty, boulanger]});
  globalThis.fetch = async (u, opts) => { calls.push({u, at: Date.now(), opts}); return reply(u, opts); };

  A._reset();
  const first = await A.search('Darty Villefranche');
  assert.equal(first.length, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.cache, 'no-store');
  assert.equal(calls[0].opts.headers, undefined, 'aucun en-tête personnalisé : pas de pré-requête CORS');
  await A.search('darty  villefranche');
  assert.equal(calls.length, 1, 'même recherche servie depuis la mémoire de session');
  await A.search('Boulanger Villefranche');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= 1000, 'une requête par seconde au plus');

  reply = () => ({ok: true, status: 200, json: async () => []});
  assert.deepEqual(await A.search('Magasin inexistant'), []);

  reply = () => ({ok: false, status: 429, json: async () => ({})});
  await assert.rejects(A.search('occupé'), e => e.code === 'BUSY' && /sollicité/.test(A.friendlyError(e)));
  reply = () => ({ok: false, status: 503, json: async () => ({})});
  await assert.rejects(A.search('panne'), e => e.code === 'HTTP' && /Impossible de joindre/.test(A.friendlyError(e)));
  reply = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(A.search('coupure'), e => e.code === 'NETWORK');

  const before = calls.length;
  globalThis.navigator.onLine = false;
  await assert.rejects(A.search('hors ligne'), e => e.code === 'OFFLINE' && A.friendlyError(e) === 'La recherche nécessite une connexion Internet.');
  assert.equal(calls.length, before, 'hors ligne : aucune requête lancée');

  console.log('PASS: store-add-v261 — résultats multiples/uniques/vides, zones écartées, enseigne du secteur, doublons certains/probables alignés sur RegionStores.commit, magasin final complet, politique Nominatim, hors ligne, 429, panne, coupure réseau.');
})().catch(e => { console.error(e); process.exit(1); });
