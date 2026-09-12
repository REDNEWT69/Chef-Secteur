const fs=require('fs');
const assert=require('assert/strict');

const profile=fs.readFileSync('profile-controller.js','utf8');
const privacy=fs.readFileSync('privacy.html','utf8');

assert.match(profile,/const NOMINATIM_BASE='https:\/\/nominatim\.openstreetmap\.org'/,'le fournisseur Nominatim public doit rester explicite');
assert.match(profile,/const NOMINATIM_MIN_INTERVAL_MS=1000/,'les appels Nominatim doivent être espacés d’au moins une seconde');
assert.match(profile,/let nominatimQueue=Promise\.resolve\(\),nominatimLastStartedAt=0/,'recherche et reverse geocoding doivent partager la même file');
assert.match(profile,/const request=nominatimQueue\.then\(run,run\)/,'les appels Nominatim doivent être sérialisés');
assert.match(profile,/NOMINATIM_MIN_INTERVAL_MS-\(Date\.now\(\)-nominatimLastStartedAt\)/,'la cadence doit être calculée à partir du dernier départ de requête');
assert.match(profile,/referrerPolicy:'strict-origin-when-cross-origin'/,'le navigateur doit conserver un Referer d’origine identifiable');
assert.match(profile,/cache:'default'/,'les requêtes de géocodage ne doivent pas désactiver le cache navigateur');
assert.doesNotMatch(profile,/nominatim[\s\S]{0,500}cache:'no-store'/i,'Nominatim ne doit pas être appelé en no-store');
assert.equal((profile.match(/await nominatimFetch\(/g)||[]).length,2,'forward et reverse geocoding doivent tous deux passer par la file Nominatim');
assert.match(profile,/departureGeocodeAttribution/,'l’interface du départ doit afficher une attribution');
assert.match(profile,/© OpenStreetMap contributors/,'l’attribution OpenStreetMap doit être visible');
assert.match(profile,/https:\/\/www\.openstreetmap\.org\/copyright/,'l’attribution doit pointer vers les informations de licence OSM');

assert.match(privacy,/OpenStreetMap \/ Nominatim/,'la politique de confidentialité doit documenter le géocodage');
assert.match(privacy,/coordonnées GPS/,'la politique doit expliquer l’envoi possible de coordonnées GPS');
assert.match(privacy,/ville ou l’adresse saisie/,'la politique doit expliquer l’envoi possible d’une adresse saisie');
assert.match(privacy,/Les événements Google Agenda et leur contenu ne sont jamais envoyés à Nominatim/,'les données Agenda doivent rester explicitement séparées de Nominatim');
assert.match(privacy,/OpenStreetMap contributors/,'la politique doit contenir l’attribution OpenStreetMap');

console.log('PASS: Nominatim est sérialisé à 1 req/s, identifiable, attribué et documenté sans données Agenda.');
