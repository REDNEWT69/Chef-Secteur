const fs=require('fs'),assert=require('assert/strict');
const planning=fs.readFileSync(__dirname+'/../planning-ui-fixes.js','utf8');
const profile=fs.readFileSync(__dirname+'/../profile-controller.js','utf8');
const visits=fs.readFileSync(__dirname+'/../store-runner-visits.css','utf8');

assert.match(planning,/#planningDaysDetails \.planningChoiceBody #daysBox\{max-height:none!important;overflow:visible!important/,'les six jours travaillés doivent rester visibles sans scroll interne fragile');
assert.match(planning,/#planPanel #dayTabs\{[^}]*display:flex!important;[^}]*overflow-x:auto!important;[^}]*touch-action:pan-x/,'le bandeau des jours doit autoriser explicitement le swipe horizontal Android');
assert.match(planning,/#planPanel #dayTabs \.dayTab\{[^}]*flex:1 1 0!important;[^}]*touch-action:pan-x/,'les boutons de jour ne doivent pas absorber le geste horizontal');
assert.match(planning,/#planPanel #dayTabs \.dayTab\{[^}]*min-width:56px!important;[^}]*max-width:96px!important/,'les jours doivent se répartir sur la largeur disponible pour éviter qu’un jour soit tronqué à 390px');

/* V262 — fiche magasin : Démarrer seul en tête, puis Itinéraire | Note | Photos, puis
   Opportunités | Plus d'actions ; tout autre bouton (présent ou futur) est replié. */
const core=fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8');
assert.match(visits,/#storeQuickSheet \.sheetActions\[data-sr-more\]\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/,'la fiche magasin doit rester une grille compacte');
assert.match(visits,/\[data-sr-more\]>#srQuickStart\{order:10;grid-column:1\/-1!important/,'Démarrer la visite doit rester la seule action pleine largeur en tête');
assert.match(visits,/\[data-sr-more\]>button\[onclick\*="mapsFromQuick"\]\{order:20;grid-column:span 2!important\}/,'Itinéraire doit ouvrir la rangée du quotidien');
assert.match(visits,/\[data-sr-more\]>button\[onclick\*="focusQuickNote"\]\{order:21;grid-column:span 2!important\}/,'Note doit suivre Itinéraire');
assert.match(visits,/\[data-sr-more\]>#storePhotosQuickBtn\{order:22;grid-column:span 2!important\}/,'Photos doit fermer la rangée du quotidien');
assert.match(visits,/\[data-sr-more="closed"\]>:not\(#srQuickStart\):not\(\[onclick\*="mapsFromQuick"\]\):not\(\[onclick\*="focusQuickNote"\]\):not\(#storePhotosQuickBtn\):not\(#srOpportunityQuickBtn\):not\(#sqMoreBtn\)\{display:none!important\}/,'les actions rares doivent être repliées par défaut, y compris celles ajoutées plus tard');
assert.match(core,/<div class="sheetActions" data-sr-more="closed">/,'la fiche doit s’ouvrir repliée');
assert.match(core,/id="sqMoreBtn" aria-expanded="false"[^>]*onclick="toggleQuickMore\(\)"/,'« Plus d’actions » doit être un vrai bouton de dépliage accessible');
assert.match(core,/<div class="sheetNoteSave"><button type="button" class="primary" onclick="saveQuickNote\(\)">Enregistrer la note<\/button><\/div>/,'Enregistrer la note doit suivre directement la note');
assert.doesNotMatch(core,/class="sheetBottom"/,'plus de rangée du bas séparée de la note');
assert.match(core,/window\.closeStoreQuick=[^\n]*window\.toggleQuickMore\(false\)/,'la fiche doit se rouvrir repliée');

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

console.log('PASS: mobile garde les jours accessibles, la fiche magasin compacte et le meilleur fix GPS avant géocodage.');
