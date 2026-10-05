// V271 — Premier lancement guidé par Runner : contrat statique et logique pure.
//
// Le comportement réel (parcours complet, reprise, GPS, génération, 390/360 px, iPhone en émulation,
// animations réduites, hors ligne) est vérifié dans un vrai Chromium par
// first-run-runner-v271-browser.spec.cjs. Ici : ce qui doit rester vrai du code et des textes, sans
// navigateur — propriétaire unique, aucun script ajouté, aucune donnée écrite par le guide, aucune
// position lue au lancement, aucune promesse inventée, reprise déduite de l'état réel.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nav = read('navigation-controller.js');
const home = read('home-refresh-v2.js');
const index = read('index.html');
const sw = read('sw.js');
const core = read('src/chef-secteur.html');
const version = JSON.parse(read('version.json'));
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Le bloc V271 : du titre de section jusqu'à install(). Tout le reste du fichier (feuille de réglages
   du planning, garde de retour de fiche magasin) n'est pas concerné et reste couvert par
   navigation-architecture.test.cjs. */
const BEGIN = nav.indexOf('Premier lancement guidé par Runner (V271)');
const END = nav.indexOf('  function install(){');
assert.ok(BEGIN > 0 && END > BEGIN, 'le bloc V271 est présent dans navigation-controller.js');
const block = nav.slice(BEGIN, END);
const code = stripComments(block);

/* 1. Un seul propriétaire, aucune ressource ajoutée. */
assert.ok(fs.existsSync(path.join(__dirname, '..', 'RUNNER_FIRST_RUN_V271.md')), 'le contrat V271 est versionné');
for (const file of fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.js')))
  assert.doesNotMatch(file, /first-?run|onboarding|guide/i, 'aucun nouveau module de démarrage : ' + file);
/* Le slug de la révision contient « first-run » : on ne cherche donc que des chemins de ressources. */
const moduleLike = /['"]\.\/[A-Za-z0-9_.\/-]*(?:first-?run|onboarding|guide)[A-Za-z0-9_.\/-]*\.(?:js|css)['"]/i;
assert.doesNotMatch(index, moduleLike, 'index.html ne charge aucun module de premier lancement');
assert.doesNotMatch(sw, moduleLike, 'sw.js ne cache aucun module de premier lancement');
assert.match(index, /'\.\/navigation-controller\.js'/, 'navigation-controller.js reste chargé au démarrage');
assert.match(sw, /"\.\/navigation-controller\.js"/, 'navigation-controller.js reste dans le shell obligatoire');
assert.match(sw, /"\.\/runner-visual\.js"/, 'Runner reste dans le shell obligatoire');
assert.equal(version.displayVersion, '273', 'version visible V273, guide V271 conservé');
assert.match(version.latestBuild, /^\d{8}-r\d+-[a-z-]+-273$/, 'BUILD_REV V273');
assert.equal(index.match(/const BUILD_REV='([^']+)'/)[1], version.latestBuild);
assert.equal(sw.match(/const BUILD_REV = "([^"]+)"/)[1], version.latestBuild);
assert.match(read('store-runner-whats-new.js'), /version:'271',\s*title:'Runner te guide au premier lancement'/, 'Quoi de neuf V271');

/* 2. Schéma `state` inchangé : le marqueur vit dans le moteur durable, hors `state` et hors sauvegarde. */
assert.match(core, /function defaultState\(\)\{return\{schemaVersion:5,/, 'schemaVersion du state inchangé');
assert.doesNotMatch(core, /store-runner-onboarding|storeRunnerFirstRun|startSkipped/, 'le noyau ne porte aucun état de guide');
assert.doesNotMatch(read('reliability-core.js'), /onboarding/i, 'le marqueur ne voyage pas dans la sauvegarde JSON');
assert.match(code, /ONBOARDING_KEY/);
assert.equal(nav.match(/ONBOARDING_KEY='([^']+)'/)[1], 'store-runner-onboarding-v1', 'même clé de préférence qu’avant V271');
assert.doesNotMatch(nav, /localStorage|sessionStorage|indexedDB/, 'aucun stockage direct : seulement le moteur durable (__chefStorage)');
assert.match(code, /window\.__chefStorage/);
assert.doesNotMatch(code, /\bstate\.[A-Za-z_$][\w$.]*(?:\[[^\]]*\])*\s*=(?!=)/, 'le guide n’écrit aucun champ de state');
assert.doesNotMatch(code, /window\.state\s*=(?!=)|\bstate\s*=(?!=)/, 'le guide ne remplace jamais state');
assert.doesNotMatch(code, /state\.[A-Za-z.]*\.(?:push|splice|unshift|pop|shift)\(/, 'aucune mutation de tableau du state');
assert.deepEqual([...code.matchAll(/\bs\.stores=\[\]/g)].length, 1, 'seule écriture : le nettoyage historique de la graine de démonstration');

/* 3. Aucun écouteur, timer ni observer permanent ; aucune position, aucun réseau. */
assert.doesNotMatch(nav, /setTimeout\s*\(/, 'navigation-controller.js : aucun setTimeout (navigation-architecture.test.cjs)');
assert.doesNotMatch(code, /setInterval|ResizeObserver|IntersectionObserver|visibilitychange|addEventListener\('focus'/, 'aucune surveillance permanente');
/* Le seul observer : borné à un renvoi vers un écran existant (Données, point de départ), sur la classe d'un seul
   élément, déconnecté à la reprise et à la fin du guide. Un observer permanent serait une régression. */
assert.equal([...code.matchAll(/new MutationObserver/g)].length, 1, 'un seul observer dans le guide');
assert.match(code, /homeWatch\.observe\(home,\{attributes:true,attributeFilter:\['class'\]\}\)/, 'il ne regarde que la classe de #homePanel');
assert.match(code, /function stopWatchingHome\(\)\{\s*if\(homeWatch\)\{homeWatch\.disconnect\(\)/, 'il se déconnecte');
assert.match(code, /function resumeFromRealState\(\)\{\s*stopWatchingHome\(\)/, 'la reprise le déconnecte');
assert.match(code, /function closeGuide\(status\)\{[\s\S]*?stopWatchingHome\(\)/, 'la fin du guide le déconnecte');
assert.match(code, /function openImportScreen\(\)\{[\s\S]*?watchHomeReturn\(\)/, 'créé au renvoi vers l’écran Données');
assert.match(code, /function openDepartureScreen\(\)\{[\s\S]*?watchHomeReturn\(\)/, 'créé au renvoi vers l’écran du point de départ');
assert.doesNotMatch(code, /geolocation|getCurrentPosition|watchPosition|navigator\./, 'aucune lecture de position dans le guide : tout passe par StoreRunnerProfile');
assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\beval\s*\(|new Function/, 'aucun réseau, aucune évaluation dynamique');
/* Les écouteurs d'événements métier ne sont posés qu'à l'ouverture du guide et retirés à sa fin. */
const armed = code.match(/const GUIDE_EVENTS=\[([\s\S]*?)\];/);
assert.ok(armed, 'liste des événements écoutés');
assert.deepEqual([...armed[1].matchAll(/'(store-runner:[a-z-]+)'/g)].map(m => m[1]).sort(),
  ['store-runner:data-restored', 'store-runner:home-rendered', 'store-runner:profile-saved', 'store-runner:store-added', 'store-runner:stores-added']);
assert.match(code, /function armGuide\(\)\{[\s\S]*?addEventListener[\s\S]*?\}/);
assert.match(code, /function disarmGuide\(\)\{[\s\S]*?removeEventListener[\s\S]*?\}/);
assert.match(code, /function closeGuide\(status\)\{[\s\S]*?disarmGuide\(\)/, 'la fin du guide retire ses écouteurs');
assert.doesNotMatch(nav.slice(END), /armGuide|GUIDE_EVENTS|watchHomeReturn|MutationObserver/, 'install() n’arme rien et n’observe rien pour un utilisateur installé');
assert.match(code, /function installFirstRunOnboarding\(\)\{\s*prepareFirstRun\(false\);\s*\}/, 'au démarrage : une décision, aucun écouteur');

/* 4. Propriétaires réutilisés, jamais contournés. */
assert.match(code, /window\.StoreRunnerStoreAdd/, 'ajout de magasins : store-add-v261.js');
assert.match(code, /api\.open\(\{\}\)/);
assert.match(code, /window\.StoreRunnerProfile/, 'point de départ et GPS : profile-controller.js');
assert.match(code, /resolvePlanningOrigin/);
assert.match(code, /applyPlanningOrigin/);
assert.match(code, /window\.openDepartureSettings/, 'saisie d’adresse : l’écran existant');
assert.match(code, /window\.storeRunnerHasValidBase/);
assert.match(code, /window\.storeRunnerGenerateThreeWeeks/, 'génération : planning-generation-controller.js');
assert.doesNotMatch(code, /generateWeek\b|saveProfile|useCurrentLocation|StoreRunnerTerrainPlanningV1|generateThreeWeekSnail|RegionStores|StoreRunnerManualPlanning|StoreRunnerPlanningCommandEngine|StoreRunnerVisitCoverage|ChefReliability|syncGoogleCalendar/,
  'aucun moteur, aucun écrivain de planning ni de magasins appelé directement');
assert.doesNotMatch(code, /\bwindow\.[A-Za-z_$][\w$]*\s*=(?!=)/, 'aucun global posé hors StoreRunnerNavigation');
assert.deepEqual(nav.match(/\bwindow\.[A-Za-z_$][\w$]*\s*=(?!=)/g).sort(), ['window.StoreRunnerAppearance=', 'window.StoreRunnerNavigation=', 'window.openStoreQuick='], 'seuls les propriétaires Navigation et Apparence sont exposés, aucune fonction globale remplacée');

/* 5. Runner : le composant existant, dans le flux, avec le mouvement V270. */
assert.match(code, /window\.StoreRunnerRunner/);
assert.match(code, /api\.mount\(stage,\{variant:'sheet',size:'md',state:'neutral',decorative:true\}\)/, 'même variante et taille que l’Assistant, décoratif (le texte voisin porte le sens)');
assert.match(code, /runner\.moveTo\(stage,\{from:logo,animate:true,entrance:'peek',duration:1180\}\)/, 'sortie de derrière le logo : mouvement V270');
assert.doesNotMatch(code, /window\.Runner\b/, 'l’alias global n’est pas utilisé : une instance, ses méthodes');
assert.doesNotMatch(block, /<svg|viewBox|<path/, 'aucun clone du dessin : le guide ne dessine pas Runner');
assert.doesNotMatch(code, /srRunner(?:Figure|Bubble|Live)|rnArt|rnLayer/, 'aucune dépendance au balisage interne de Runner');
assert.match(code, /introPlayed/, 'une seule entrée par document');
assert.match(code, /whenAppVisible/, 'l’entrée attend la levée du voile du shell');
assert.match(code, /releaseGuideRunner\(\)/, 'Runner est détruit quand le guide se ferme');
assert.doesNotMatch(code, /position:\s*fixed[^']*\.srRunner|\.srRunner[^']*position:\s*(?:fixed|sticky)/, 'Runner n’est jamais flottant');

/* Accueil : l'entrée de Runner V270 est gardée pour la fermeture du guide. */
const homeAdapter = home.slice(home.indexOf('function syncHomeRunner()'), home.indexOf('function esc('));
assert.match(homeAdapter, /classList\.contains\('srFirstRunOpen'\)\)\{releaseHomeRunner\(\);(clearHomeLine\(\);)?return\}/, 'le guide couvre l’Accueil : Runner et sa ligne V273 sont relâchés');
assert.match(home, /'store-runner:first-run-closed'\]\.forEach\(name=>document\.addEventListener\(name,\(\)=>scheduleRun\(20\)\)\)/);
assert.match(code, /classList\.add\('srFirstRunOpen'\)/);
assert.match(code, /classList\.remove\('srFirstRunOpen'\)/);
assert.match(code, /store-runner:first-run-closed/);

/* 6. Mobile, mouvement réduit, accessibilité. */
assert.match(block, /prefers-reduced-motion:reduce/);
assert.match(block, /@keyframes srfrIn\{from\{opacity:0;transform:translateY\(6px\)\}to\{opacity:1;transform:none\}\}/, 'transition de l’étape : transform et opacité seulement');
assert.doesNotMatch(block, /@keyframes[^}]*(?:width|height|top|left|margin)\s*:/, 'aucune animation de mise en page');
assert.doesNotMatch(block, /infinite/, 'aucune boucle');
assert.match(block, /role','dialog'/);
assert.match(block, /aria-modal/);
assert.match(block, /aria-labelledby','srfrTitle'/);
assert.match(code, /id="srfrTitle" tabindex="-1"/, 'le focus va au titre de l’étape');
assert.match(code, /if\(changed\|\|reopened\)focusElement/, 'le focus ne bouge qu’à un changement d’étape');
assert.match(code, /e\.key!=='Tab'/, 'tabulation bouclée dans la carte');
assert.match(block, /min-height:48px/, 'cibles tactiles ≥ 48 px');
assert.match(block, /env\(safe-area-inset-bottom\)/, 'marge basse du système respectée par l’hôte');
assert.doesNotMatch(code, /<input|<textarea|<select/, 'aucun champ de saisie : ni clavier virtuel ni zoom automatique iOS');
assert.match(block, /srFirstRunOpen \.storeRunnerToast/, 'les toasts passagers ne s’empilent pas sur le guide');
assert.match(block, /#storeRunnerUpdateBanner:not\(\[data-sticky\]\)/, 'une bannière qui attend une réponse reste visible');
assert.match(block, /touch-action:manipulation/, 'un double toucher rapide ne zoome pas la page');
assert.match(block, /@media\(max-width:600px\)\{[^\n]*\.srfrActions\{position:sticky/, 'téléphone en portrait : actions collées en bas de la carte');
assert.match(block, /@media\(max-height:480px\)\{[^\n]*\.srfrActions\{display:flex;flex-wrap:wrap;position:sticky/, 'écran court (paysage, fenêtre partagée) : actions collées en bas, côte à côte');
assert.doesNotMatch(block, /:has\(/, 'aucun :has() (absent avant iOS 15.4) : une classe de mise en page suffit');
/* Décision produit : le lien de sortie dit ce qu'il fait. Il ferme le guide pour de bon (marqueur « dismissed »). */
assert.match(code, /data-srfr-dismiss'\+dis\+'>Passer<\/button>/, 'le lien de sortie du guide s’appelle « Passer »');
assert.doesNotMatch(block, /Plus tard/, '« Plus tard » promettrait un retour que le guide ne propose pas');
assert.match(code, /function dismissOnboarding\(\)\{\s*writeOnboardingMarker\('dismissed'/, 'sortie définitive : marqueur « dismissed »');

/* 7. Textes : pas de promesse que personne ne fournit. Les commentaires sont retirés avant le test. */
const strings = [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map(m => m[1]);
for (const text of strings)
  assert.doesNotMatch(text, /optimis|meilleur|optimal|plus court|id[ée]al|parfait|le plus rapide|garanti/i, 'promesse inventée : ' + text);

/* 8. Logique pure, exécutée telle quelle dans un bac à sable. */
const fakeDocument = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, documentElement: { classList: { add() {}, remove() {} } } };
const ctx = { console, JSON, Number, String, Array, Date, Math, Object, Promise, CustomEvent: function () {}, document: fakeDocument };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(nav, ctx);
const F = ctx.StoreRunnerNavigation && ctx.StoreRunnerNavigation._firstRun;
assert.ok(F && F.deriveStep && F.establishedReason && F.stepCopy && F.hasActivityBeyondSetup, 'helpers du guide exposés pour les tests');
assert.equal(F.STEP_COUNT, 5, 'cinq étapes au plus');
assert.deepEqual(Array.from(F.STEP_TITLES), ['Bienvenue dans Store Runner', 'Ton secteur', 'Ton point de départ', 'Ton planning', 'Tout est en place']);
for (const key of ['openFirstRun', 'closeFirstRun', 'firstRunState', 'openPlanningSettings', 'closePlanningSettings'])
  assert.equal(typeof ctx.StoreRunnerNavigation[key], 'function', 'API publique conservée : ' + key);

/* 8a. L'étape se déduit de l'état réel. */
const facts = (stores, hasStart, planned = 0) => ({ stores, hasStart, planned });
const D = F.deriveStep;
assert.equal(D(facts(0, false), null), 0, 'rien : présentation');
assert.equal(D(facts(0, false), { status: 'in-progress', step: 0 }), 0, 'présentation pas dépassée');
assert.equal(D(facts(0, false), { status: 'in-progress', step: 1 }), 1, 'présentation dépassée, aucun magasin : secteur');
assert.equal(D(facts(0, true), { status: 'in-progress', step: 2 }), 1, 'un départ sans magasin ne saute pas le secteur');
assert.equal(D(facts(3, false), { status: 'in-progress', step: 1 }), 2, 'des magasins, pas de départ : départ');
assert.equal(D(facts(3, false), { status: 'importing', step: 0 }), 2, 'un import réussi saute la présentation');
assert.equal(D(facts(3, true), { status: 'in-progress', step: 2 }), 3, 'magasins et départ : planning');
assert.equal(D(facts(3, false), { status: 'in-progress', step: 3, startSkipped: true }), 3, 'départ passé : planning');
assert.equal(D(facts(3, true), { status: 'in-progress', step: 4, generated: { visits: 9, stores: 7 } }), 4, 'planning généré par le guide : fin');
assert.equal(D(facts(3, true, 0), { status: 'in-progress', step: 4, generated: { visits: 9, stores: 7 } }), 4, 'un planning vidé ensuite ne ramène pas à la génération');
assert.equal(D(facts(0, false), { status: 'in-progress', step: 3 }), 1, 'marqueur de l’ancien parcours (étape 3, aucun magasin) : secteur');
assert.equal(D(facts(2, false), { status: 'in-progress', step: 2 }), 2, 'marqueur de l’ancien parcours (étape 2) : départ');
assert.equal(D(facts(2, true), { version: 1, status: 'in-progress', step: 1 }), 3, 'marqueur de l’ancien parcours (étape 1) : planning');
for (const marker of [null, {}, { step: 'x' }, { step: -4 }, { status: 'in-progress', step: 99 }])
  assert.ok([0, 1].includes(D(facts(0, false), marker)), 'un marqueur illisible reste sûr : ' + JSON.stringify(marker));

/* 8b. Utilisateurs existants : aucun guide, jamais. */
const E = F.establishedReason;
const base = () => ({ schemaVersion: 5, profile: { sectorName: 'Mon secteur', baseLat: null, baseLon: null }, stores: [], visits: {}, notes: {}, hotelReservations: {}, included: {}, excluded: {}, locks: {}, plan: {}, settings: { target: 20, days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], brands: [], products: [], strategy: 'balanced' } });
assert.equal(E(base(), { status: 'in-progress' }, facts(0, false)), '', 'un état vide n’est pas un utilisateur installé');
assert.equal(E(base(), { status: 'in-progress' }, facts(5, true, 0)), '', 'magasins et départ créés par le guide : pas encore terminé');
for (const [label, patch] of [
  ['visite réalisée', s => { s.visits.s1 = '2026-09-01'; }],
  ['note', s => { s.notes.s1 = 'note'; }],
  ['réservation d’hôtel', s => { s.hotelReservations['2026-10-06'] = { name: 'Hôtel' }; }],
  ['magasin imposé', s => { s.included.s1 = true; }],
  ['magasin exclu', s => { s.excluded.s1 = true; }],
  ['jour posé', s => { s.locks.s1 = { day: 'Lundi' }; }],
  ['rendez-vous', s => { s.appointments = [{ id: 'a', storeId: 's1', date: '2026-10-07' }]; }],
  ['opportunité', s => { s.opportunities = [{ id: 'o' }]; }],
  ['donnée métier', s => { s.businessV2 = { visits: [{ id: 'v' }], actions: [] }; }]
]) {
  const s = base(); patch(s);
  assert.equal(F.hasActivityBeyondSetup(s), true, label + ' : activité au-delà de l’installation');
  assert.equal(E(s, { status: 'in-progress', step: 1 }, facts(0, false)), 'existing-user', label + ' : guide terminé en silence');
  assert.equal(F.hasRealUserData(s), true, label + ' : donnée réelle (protection au premier démarrage)');
}
assert.equal(F.hasActivityBeyondSetup(base()), false);
assert.equal(F.hasActivityBeyondSetup(Object.assign(base(), { businessV2: { visits: [], actions: [], storeSnapshots: {} } })), false, 'des structures métier vides ne comptent pas');
assert.equal(E(base(), { status: 'in-progress', step: 2 }, facts(8, true, 12)), 'setup-complete', 'secteur, départ et planning déjà faits ailleurs que dans le guide');
assert.equal(E(base(), { status: 'in-progress', step: 4, generated: { visits: 12, stores: 8 } }, facts(8, true, 12)), '', 'planning généré par le guide : la fin est montrée une fois');

/* 8c. Textes de Runner : exacts, bornés, états valides ; seule l'alerte se tait (sa note l'annonce). */
const C = F.stepCopy;
const exact = (view, title, text) => { assert.equal(view.title, title); assert.equal(view.text, text); };
exact(C(0, facts(0, false)), 'Je suis Runner, ton copilote terrain.', 'Je t’aide à préparer ton secteur et tes tournées.');
exact(C(3, facts(4, true)), 'Ton secteur est prêt.', 'Générons tes 3 prochaines semaines.');
exact(C(4, facts(4, true)), 'C’est prêt.', 'Je t’accompagnerai dans le Planning, l’Assistant et tes magasins.');
assert.equal(C(0, facts(0, false)).state, 'neutral');
assert.equal(C(1, facts(0, false)).state, 'neutral', 'aucun magasin : pas de succès inventé');
assert.equal(C(1, facts(1, false)).state, 'success');
assert.equal(C(1, facts(1, false)).title, '1 magasin dans ton secteur.');
assert.equal(C(1, facts(14, false)).title, '14 magasins dans ton secteur.');
assert.equal(C(2, facts(3, false), { busy: 'position' }).state, 'analyzing', 'analyse seulement pendant la recherche de position');
assert.equal(C(2, facts(3, false), { note: { kind: 'alert', text: 'Localisation refusée.' } }).state, 'alert');
assert.equal(C(2, Object.assign(facts(3, true), { startLabel: 'Domicile' })).state, 'success');
assert.equal(C(2, Object.assign(facts(3, true), { startLabel: 'Domicile' })).text, 'Domicile', 'le départ affiché est celui de l’état');
assert.equal(C(2, facts(3, false)).state, 'neutral');
assert.equal(C(3, facts(3, true), { busy: 'generate' }).state, 'analyzing');
assert.equal(C(3, facts(3, true), { busy: 'generate' }).title, 'Je prépare tes 3 semaines.', 'même formule que le Planning');
assert.equal(C(3, facts(3, true), { note: { kind: 'alert', text: 'Aucune visite ne tient dans les 3 semaines avec les réglages actuels.' } }).state, 'alert');
assert.equal(C(3, facts(3, true), { note: { kind: 'ok', text: 'x' } }).state, 'neutral', 'une note positive n’invente pas une alerte');
for (let step = 0; step < 5; step++)
  for (const view of [C(step, facts(0, false)), C(step, facts(5, true, 3)), C(step, facts(5, false), { busy: 'position' }), C(step, facts(5, false), { busy: 'generate' }), C(step, facts(5, true), { note: { kind: 'alert', text: 'e' } })]) {
    assert.ok(['neutral', 'analyzing', 'alert', 'success'].includes(view.state), 'état de Runner valide : ' + view.state);
    assert.ok(Array.from(view.title).length > 0 && Array.from(view.title).length <= 60, 'titre de bulle borné : ' + view.title);
    assert.ok(Array.from(view.text).length > 0 && Array.from(view.text).length <= 280, 'texte de bulle borné : ' + view.text);
    if (view.state !== 'alert') assert.notEqual(view.silent, true, 'la voix de Runner est le contenu du guide : annoncée aux lecteurs d’écran : ' + view.title);
    if (view.state === 'alert') assert.equal(view.silent, true, 'l’alerte est annoncée par sa note (role=alert), pas deux fois');
    assert.doesNotMatch(view.title + ' ' + view.text, /optimis|meilleur|optimal|plus court/i);
  }

/* 8d. Le premier lancement reste protégé comme avant (graine de démonstration, états vides). */
assert.equal(F.isFreshEmptyState(base()), true);
assert.equal(F.isPristineDemoState(Object.assign(base(), { stores: [{ id: 's1', source: 'Secteur de démonstration', ville: 'Ville-Test 01' }] })), true);
assert.equal(F.isPristineDemoState(Object.assign(base(), { stores: [{ id: 's1', source: 'Secteur de démonstration', ville: 'Ville-Test 01' }], visits: { s1: '2026-09-01' } })), false);

console.log('PASS: premier lancement guidé V271 — propriétaire unique, aucun script ajouté, aucune donnée écrite, aucune position au lancement, reprise déduite de l’état réel');
