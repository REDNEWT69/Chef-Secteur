/* Lot B — contrats des propriétaires prolongés pour le Planning Command Engine.
   Chaque extension est facultative : sans elle, le comportement historique est identique.
     terrain-planning-v1.js : weekCount, requiredVisits, simulateCommandWindow (pur),
       generatedArchiveEntry, routeMetrics ;
     profile-controller.js : resolvePlanningOrigin (lecture seule) / applyPlanningOrigin ;
     planning-cascade-v181.js : build({readControls:false}) et applyResult, sans nouveau global ;
     noyau : l'assistant confie une commande planning au moteur de commandes avant l'IA en ligne. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const H = require('./helpers/planning-command-runtime.cjs');
const ROOT = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* Copies JSON : les objets du contexte vm n’ont pas les prototypes de Node (deepStrictEqual). */
const DAYS = H.DAYS, ids = plan => H.copy(Object.fromEntries(DAYS.map(d => [d, ((plan || {})[d] || []).map(s => String(s.id))])));
let passed = 0; const ok = name => { passed++; console.log('✓ ' + name); };

(async () => {
  /* ---------------------------------------------------------------- terrain */
  {
    const rt = H.runtime({ now: '2026-10-03T10:00:00', weekDate: '2026-09-28', visits: { fly: { lastVisit: '2026-09-15', history: ['2026-09-15'] } }, target: 10 });
    const T = rt.ctx.StoreRunnerTerrainPlanningV1, state = rt.ctx.state;
    const options = extra => Object.assign({ state, firstMonday: new rt.clock.Date('2026-10-05T12:00:00'), days: DAYS.slice(0, 5), target: 10, maxCreditsPerDay: 4, stores: state.stores, archive: {}, today: '2026-10-03', distanceOf: s => H.hav(H.BASE, s), distanceBetween: (a, b) => H.hav(a, b) * 1.22, crossDayEnabled: false }, extra || {});
    const base = T.buildThreeWeekSnail(options()), explicit = T.buildThreeWeekSnail(options({ weekCount: 3 }));
    assert.equal(JSON.stringify(explicit), JSON.stringify(base), 'weekCount 3 explicite = cycle historique, octet pour octet');
    assert.deepEqual(H.copy(T.buildThreeWeekSnail(options({ weekCount: 1 })).weeks.map(w => w.weekKey)), ['2026-10-05']);
    assert.deepEqual(T.buildThreeWeekSnail(options({ weekCount: 9 })).weeks.length, 3, 'valeur hors bornes ignorée');
    ok('terrain : weekCount facultatif, cycle de 3 semaines inchangé sans l’option');

    const blockedEverywhere = T.buildThreeWeekSnail(options({ weekCount: 1, dayBlocked: () => true, requiredVisits: [{ storeId: 'da', from: '2026-10-05', notBefore: '2026-10-05', dueDate: '2026-10-11' }] }));
    assert.equal(blockedEverywhere.commandVisits[0].state, 'lost', 'visite demandée impossible : rendue, pas de refus global');
    assert.match(blockedEverywhere.commandVisits[0].why, /aucune journée disponible/);
    const placed = T.buildThreeWeekSnail(options({ weekCount: 1, requiredVisits: [{ storeId: 'dmo', from: '2026-10-07', notBefore: '2026-10-07', dueDate: '2026-10-11', pin: true }] }));
    const row = placed.commandVisits[0];
    assert.equal(row.state, 'placed'); assert(row.date >= '2026-10-07' && row.date <= '2026-10-11', 'posée dans sa fenêtre : ' + row.date);
    assert.equal(placed.deadlines, undefined, 'une visite de commande n’est pas une échéance du brief');
    assert.equal(T.buildThreeWeekSnail(options({ weekCount: 1, requiredVisits: [{ storeId: 'inconnu', dueDate: '2026-10-11' }] })).commandVisits[0].state, 'lost');
    ok('terrain : requiredVisits — posée dans sa fenêtre ou rendue « lost » avec sa raison');

    const before = JSON.stringify(state);
    const sim = T.simulateCommandWindow({ state, archive: {}, today: '2026-10-03', start: '2026-10-05', end: '2026-10-11', shownWeekKey: '2026-09-28', shownPlan: state.plan, exactDays: [{ storeId: 'bc', date: '2026-10-06' }], forbidden: [{ date: '2026-10-08', storeIds: ['bl', 'dl', 'fly'] }, { date: '2026-10-09', storeIds: [] }] });
    assert.equal(JSON.stringify(state), before, 'simulation pure : aucune écriture dans l’état reçu');
    assert.equal(sim.ok, true, sim.error);
    const week = sim.built.weeks[0];
    assert(ids(week.plan).Mardi.includes('bc'), 'jour exigé lu comme un verrou de la seule semaine');
    assert(!ids(week.plan).Jeudi.some(id => ['bl', 'dl', 'fly'].includes(id)), 'magasins interdits jeudi');
    assert.deepEqual(ids(week.plan).Vendredi, [], 'journée interdite vide');
    assert.throws(() => T.simulateCommandWindow({ state, today: '2026-10-03', start: '2026-10-05', end: '2026-12-31' }), /1 et 6 semaines/);
    const late = T.simulateCommandWindow({ state, archive: {}, today: '2026-10-03', start: '2026-10-07', end: '2026-10-11', shownWeekKey: '2026-10-05', shownPlan: H.planOf({ Lundi: ['bl'], Mardi: ['dl'] }) });
    assert.deepEqual(ids(late.built.weeks[0].plan).Lundi, ['bl'], 'avant le début de période : journée laissée telle quelle');
    assert.deepEqual(ids(late.built.weeks[0].plan).Mardi, ['dl']);
    ok('terrain : simulateCommandWindow — pure, contraintes par les points d’extension du moteur, période respectée');

    const entry = T.generatedArchiveEntry({ weekKey: '2026-10-05', plan: H.planOf({ Lundi: ['bl'] }), frozenDays: ['Lundi', 'Mardi', 'Mercredi'] }, { crossDay: { applied: true } }, state, {}, '2026-10-03T08:00:00.000Z', '2026-10-07');
    assert.deepEqual(H.copy(entry.frozenDays), ['Lundi', 'Mardi'], 'commande : seules les journées réellement passées sont marquées');
    assert.equal(entry.crossDayOptimized, 'v264');
    assert.equal(T.generatedArchiveEntry({ weekKey: '2026-10-05', plan: H.planOf({}), frozenDays: ['Lundi'] }, {}, state, {}, 'x').frozenDays, undefined, 'génération : le repère reste posé par generateThreeWeekSnail lui-même');
    assert(/bundle\.archive\[week\.weekKey\]\.frozenDays=/.test(read('terrain-planning-v1.js')));
    const m = T.routeMetrics(H.planOf({ Lundi: ['dv', 'bv'] }).Lundi, 'Lundi', '2026-10-05', state);
    assert(m.kilometers > 150 && m.kilometers < 300, 'aller-retour Lyon–Valence : ' + m.kilometers);
    ok('terrain : entrée d’archive partagée et mesure d’une tournée dans son ordre');
  }

  /* ---------------------------------------------------------------- profil (r38) */
  {
    const source = read('profile-controller.js'), NOW = Date.parse('2026-10-03T10:00:00.000Z');
    const make = (profile, geolocation) => {
      class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
      const c = { state: { profile: structuredClone(profile) }, navigator: { geolocation, onLine: false }, Date: Clock, document: { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, dispatchEvent() {} }, addEventListener() {}, setTimeout, clearTimeout, queueMicrotask, console, hav: (a, b) => Math.abs(a.lat - b.lat) + Math.abs(a.lon - b.lon), renderHeader() {} };
      c.window = c; vm.runInNewContext(source, c, { filename: 'profile-controller.js' }); return c;
    };
    const home = { baseName: 'Domicile', baseAddress: '1 rue de Test, Chambéry', baseLat: 45.5646, baseLon: 5.9178 };
    const gps = { getCurrentPosition(success) { success({ timestamp: NOW, coords: { latitude: 45.9, longitude: 6.1, accuracy: 9 } }); } };
    const c = make(home, gps), before = JSON.stringify(c.state.profile);
    const origin = await c.StoreRunnerProfile.resolvePlanningOrigin();
    assert.equal(origin.ok, true); assert.equal(origin.source, 'gps'); assert.equal(origin.lat, 45.9);
    assert.equal(JSON.stringify(c.state.profile), before, 'lecture seule : le profil n’est pas modifié');
    assert.equal(c.StoreRunnerProfile.applyPlanningOrigin(origin), true);
    assert.equal(c.state.profile.baseLat, 45.9); assert.equal(c.state.profile.baseName, 'Ma position actuelle');
    const denied = make(home, { getCurrentPosition(_, fail) { fail({ code: 1 }); } });
    const fallback = await denied.StoreRunnerProfile.resolvePlanningOrigin();
    assert.equal(fallback.source, 'saved_base'); assert.match(fallback.message, /Domicile/);
    const nothing = make({ baseName: 'Ma position actuelle', baseAddress: 'Position GPS · 48.85660, 2.35220', baseLat: 48.8566, baseLon: 2.3522 }, { getCurrentPosition(_, fail) { fail({ code: 1 }); } });
    const none = await nothing.StoreRunnerProfile.resolvePlanningOrigin();
    assert.equal(none.ok, false); assert.match(none.error, /localisation fraîche est requise/);
    assert.equal(typeof c.StoreRunnerProfile.preparePlanningOrigin, 'function');
    ok('profil : position fraîche lue sans écrire, publiée seulement par applyPlanningOrigin (r38 inchangé)');
  }

  /* ---------------------------------------------------------------- recalcul V181 */
  {
    const rt = H.runtime({ now: '2026-10-07T09:00:00', weekDate: '2026-10-05', plan: H.planOf({ Lundi: ['bl'], Jeudi: ['bvi'] }) });
    let reads = 0; rt.ctx.readPlanningControls = () => { reads++; };
    const recalc = rt.ctx.storeRunnerRecalculateRemainingWeek;
    assert.equal(typeof recalc.build, 'function'); assert.equal(typeof recalc.applyResult, 'function');
    recalc.build({ readControls: false }); assert.equal(reads, 0, 'calcul pur : les réglages affichés ne sont pas relus dans state');
    recalc.build(); assert.equal(reads, 1, 'le bouton garde sa lecture des réglages');
    assert.equal(await recalc.applyResult({ ok: true, unchanged: true }), false, 'rien à appliquer');
    const globals = [...new Set([...read('planning-cascade-v181.js').matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => m[1]))].sort();
    assert.deepEqual(globals, ['__storeRunnerBuildRemainingWeekPlan', '__storeRunnerPlanningGenerationActive', 'storeRunnerRecalculateRemainingWeek']);
    ok('recalcul V181 : build pur sur demande, applyResult partagé avec le bouton, aucun nouveau global');
  }

  /* ---------------------------------------------------------------- noyau, interface, cache */
  {
    const core = read('src/chef-secteur.html'), send = core.match(/function assistantSend\(\)\{.*$/m)[0];
    assert(send.indexOf('storeRunnerPlanningCommand') > 0 && send.indexOf('storeRunnerPlanningCommand') < send.indexOf("aiConfig.mode==='online'"), 'commande planning interceptée avant l’IA en ligne');
    const engine = read('planning-command-engine.js'), ui = engine.slice(engine.indexOf('interface mobile'));
    assert(ui.length > 1000, 'la feuille d’aperçu vit dans le même module (une seule ressource au démarrage)');
    assert.doesNotMatch(ui, /innerHTML|insertAdjacentHTML|outerHTML/, 'aucun HTML construit à partir du texte');
    assert.doesNotMatch(engine, /\beval\s*\(|new Function\s*\(|localStorage\.(?:get|set|remove)Item/, 'ni eval, ni stockage direct');
    /* Seule écriture directe admise : le paquet ChefReliability (bundle.state…) persisté d’un bloc,
       comme le fait le cycle terrain. L’état vivant n’est jamais modifié en place. */
    assert.doesNotMatch(engine, /\b(?:ctx|win|root|window)\.state\.(?:plan|locks|profile|appointments|visits|manualWeekEdits|excluded|included|settings)\b(?:\.[\w$]+|\[[^\]]+\])*\s*=(?![=>])/, 'le moteur de commandes n’écrit aucune structure d’un autre propriétaire');
    assert.match('ctx.state.locks[id]={day}', /\b(?:ctx|win|root|window)\.state\.(?:plan|locks|profile|appointments|visits|manualWeekEdits|excluded|included|settings)\b(?:\.[\w$]+|\[[^\]]+\])*\s*=(?![=>])/, 'garde-fou du contrôle lui-même');
    const sw = read('sw.js'), index = read('index.html');
    assert(!require('node:fs').existsSync(path.join(ROOT, 'planning-command-ui.js')), 'pas de second module au démarrage');
    for (const f of ['planning-command-engine.js']) { assert(sw.includes('"./' + f + '"'), f + ' en cache hors ligne'); assert(index.includes("'./" + f + "'"), f + ' chargé par index.html'); }
    const rev = /const BUILD_REV = "([^"]+)"/.exec(sw)[1];
    /* Le module voyage avec une révision publiée : même BUILD_REV pour le cache et version.json
       (aucun littéral figé ici, pour ne pas ajouter un emplacement à chaque montée). */
    assert.equal(rev, JSON.parse(read('version.json')).latestBuild, 'le cache publie la révision annoncée par version.json');
    assert.notEqual(rev, '20261003-r38-temporal-geographic-coherence-264', 'le lot B ne peut pas être servi sous la révision r38');
    ok('noyau, interface et cache : point d’entrée unique, texte jamais interprété, révision publiée cohérente');
  }

  console.log('planning-command-owners: ' + passed + ' groupes OK');
})().catch(error => { console.error(error); process.exit(1); });
