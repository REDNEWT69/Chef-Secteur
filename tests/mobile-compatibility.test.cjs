const fs=require('fs'),assert=require('assert/strict');
const planning=fs.readFileSync(__dirname+'/../planning-ui-fixes.js','utf8');
const profile=fs.readFileSync(__dirname+'/../profile-controller.js','utf8');

assert.match(planning,/#planningDaysDetails \.planningChoiceBody #daysBox\{max-height:none!important;overflow:visible!important/,'les six jours travaillés doivent rester visibles sans scroll interne fragile');
assert.match(planning,/#planPanel #dayTabs\{[^}]*display:flex!important;[^}]*overflow-x:auto!important;[^}]*touch-action:pan-x/,'le bandeau des jours doit autoriser explicitement le swipe horizontal Android');
assert.match(planning,/#planPanel #dayTabs \.dayTab\{[^}]*flex:1 1 0!important;[^}]*touch-action:pan-x/,'les boutons de jour ne doivent pas absorber le geste horizontal');
assert.match(planning,/#planPanel #dayTabs \.dayTab\{[^}]*min-width:56px!important;[^}]*max-width:96px!important/,'les jours doivent se répartir sur la largeur disponible pour éviter qu’un jour soit tronqué à 390px');

assert.match(profile,/function acquireBestPosition\(/,'la localisation doit passer par une phase d’affinage');
assert.match(profile,/watchPosition\(/,'la localisation doit pouvoir recevoir plusieurs fixes GPS');
assert.match(profile,/clearWatch\(/,'le suivi GPS doit être arrêté après sélection du meilleur fix');
assert.match(profile,/positionAccuracy\(pos\)<positionAccuracy\(best\)/,'le fix le plus précis doit remplacer les fixes moins bons');
assert.match(profile,/positionAccuracy\(best\)<=10/,'un très bon fix peut terminer l’affinage plus tôt');
assert.match(profile,/setTimeout\(function\(\)\{finish\([^)]*\)\},4500\)/,'l’affinage doit rester borné dans le temps');
assert.match(profile,/await acquireBestPosition/,'le géocodage ne doit commencer qu’après choix du meilleur fix');
assert.doesNotMatch(profile,/getCurrentPosition\(async function\(pos\)/,'le flux principal ne doit plus géocoder le premier fix reçu');
assert.match(profile,/NOMINATIM_BASE='https:\/\/nominatim\.openstreetmap\.org'/,'le fournisseur de géocodage doit rester explicite');
assert.match(profile,/\/search\?format=jsonv2&limit=1&countrycodes=fr/,'un PC sans GPS doit pouvoir rechercher manuellement le départ en France');
assert.match(profile,/countrycodes=fr/,'la recherche manuelle doit rester bornée à la France');
assert.match(profile,/lookupDepartureAddress/,'le profil doit exposer une action explicite de recherche du départ');

console.log('PASS: Android garde les jours accessibles au toucher et la localisation retient le meilleur fix GPS avant géocodage.');
