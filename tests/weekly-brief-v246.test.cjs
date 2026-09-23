// V246 — brief hebdomadaire et priorité effective.
//
// Ce test fixe les règles qui gouvernent la couche : trois sources séparées
// (`store.priority`, le snapshot performance de la semaine, le brief Wxx), des briefs
// conservés semaine par semaine, une neutralisation qui ne touche jamais la donnée
// source, un `weekBoost` identique à `planningBoost` tant qu'aucun brief n'existe et une
// `planningPriority` qui réunit explicitement structurelle + performance + brief.
//
// Toutes les données sont fabriquées : aucun magasin réel n'est écrit dans le dépôt.
const assert = require('assert/strict');

const P = require('../performance-data-v190.js');
const B = require('../weekly-brief-v246.js');
const R = require('../reliability-core.js');

function memoire() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => JSON.stringify([...m]) };
}
const AUJOURDHUI = '2026-09-23'; // mercredi de la W39

function secteur() {
  return {
    schemaVersion: 5, profile: {}, settings: {}, visits: {}, notes: {}, plan: {},
    stores: [
      { id: 'a', enseigne: 'Boulanger', ville: 'Ville A', priority: 5, products: ['Brun'], active: true },
      { id: 'b', enseigne: 'Darty', ville: 'Ville B', priority: 3, products: ['Brun', 'Blanc'], active: true },
      { id: 'c', enseigne: 'Boulanger', ville: 'Ville C', priority: 2, products: ['Blanc'], active: true },
      { id: 'd', enseigne: 'Darty', ville: 'Ville D', priority: 4, products: ['À confirmer'], active: true },
      { id: 'e', enseigne: 'Boulanger', ville: 'Ville E', priority: 3, products: ['Brun'], active: true }
    ]
  };
}
function snapshot(week, importedAt, prios) {
  return {
    week, targetPdm: 40, targetSource: 'explicite', importedAt,
    rows: Object.entries(prios).map(([ville, prio]) => ({
      key: 'x|' + ville, retailer: ville.startsWith('Ville B') || ville.startsWith('Ville D') ? 'Darty' : 'Boulanger',
      site: ville, prio, pdmYtd: 30, deltaYtd: -10, evolYtd: null, weeks: {}, deltaWeeks: {}, sellOutWeeks: {}, comment: ''
    }))
  };
}
function base() {
  const state = secteur(), db = memoire();
  P.saveSnapshot(db, snapshot('W39', '2026-09-21T08:00:00Z', { 'Ville A': 'P1', 'Ville B': 'P2', 'Ville C': 'P1', 'Ville E': 'P1' }));
  P.markTreated(db, 'W39', 'e', '2026-09-22');
  return { state, db, opts: { state, db, perf: P, today: AUJOURDHUI } };
}

// --- 1. Semaines ISO ------------------------------------------------------------------
{
  assert.equal(B.isoWeek('2026-09-23'), '2026-W39');
  assert.equal(B.weekMonday('2026-W39'), '2026-09-21');
  assert.equal(B.weekSunday('2026-W39'), '2026-09-27');
  assert.equal(B.isoWeek('2026-01-01'), '2026-W01', 'le 1er janvier 2026 (jeudi) ouvre la W01');
  assert.equal(B.isoWeek('2027-01-03'), '2026-W53', '2026 a 53 semaines ISO');
  assert.equal(B.isoWeek('2021-01-03'), '2020-W53');
  assert.equal(B.shiftWeek('2026-W53', 1), '2027-W01');
  assert.equal(B.shiftWeek('2026-W01', -1), '2025-W52');
  assert.equal(B.validWeek('2026-W53'), true);
  assert.equal(B.validWeek('2025-W53'), false);
  assert.equal(B.validWeek('W39'), false, 'une clé de brief porte toujours son année');
  assert.equal(B.shortWeek('2026-W09'), 'W09');
}

// --- 2. Sans brief, la priorité effective est exactement la lecture actuelle -------------
{
  const { state, db, opts } = base();
  const lot = B.effectivePriorities('2026-W39', opts);
  assert.equal(lot.performance.week, 'W39');
  assert.equal(lot.performance.source, 'exact');
  for (const s of state.stores) {
    const r = B.effectivePriority(s, '2026-W39', opts);
    assert.equal(r.weekBoost, P.planningBoost(db, s.id, state.stores), 'weekBoost = planningBoost pour ' + s.id);
    assert.equal(B.planningPriority(s, '2026-W39', opts), r.contributions.structural + r.weekBoost, 'planningPriority = structurelle + semaine pour ' + s.id);
    assert.equal(B.planningPriority(s, '2026-W39', opts), r.score, 'planningPriority expose le score complet pour ' + s.id);
    assert.equal(r.contributions.brief, 0);
    assert.equal(r.touchedByBrief, false);
  }
  const e = B.effectivePriority('e', '2026-W39', opts);
  assert.equal(e.base.performance, 'P1');
  assert.equal(e.base.treated, true, 'un P1 marqué traité ne reçoit plus de coup de pouce');
  assert.equal(e.weekBoost, 0);
  assert.equal(B.weekBoost('a', '2026-W39', opts), 60);
  assert.equal(B.planningPriority('a', '2026-W39', opts), 5 * B.STRUCTURAL_WEIGHT + 60);
  // Aucune écriture : ni l'état, ni le stockage.
  assert.equal(state.weeklyBriefs, undefined);
}

// --- 3. W39 : « Prios Co BRUN annulées » neutralise sans rien modifier ----------------
{
  const { state, db, opts } = base();
  const avantMagasins = JSON.stringify(state.stores), avantPerf = db.dump();
  B.addRule(state, '2026-W39', {
    type: 'suspend', target: 'performance', label: 'Prios Co BRUN annulées',
    scope: { family: 'brun' }, confidence: 'confirmed'
  }, { now: '2026-09-21T07:00:00Z' });

  const a = B.effectivePriority('a', '2026-W39', opts);
  assert.equal(a.base.performance, 'P1', 'la donnée source reste P1');
  assert.equal(a.base.structural, 5, 'la priorité structurelle reste 5/5');
  assert.equal(a.suspended.performance, true);
  assert.equal(a.contributions.performance, 0);
  assert.equal(a.contributions.structural, 5 * B.STRUCTURAL_WEIGHT);
  assert.equal(a.weekBoost, 0);
  assert.equal(B.planningPriority('a', '2026-W39', opts), 5 * B.STRUCTURAL_WEIGHT, 'la structurelle reste dans la priorité planning');
  assert.ok(a.badges.some(x => x.text === 'P1 · neutralisée W39'), 'le badge P1 reste, marqué neutralisé');
  assert.ok(a.badges.some(x => x.text === 'W39 : Prios Co BRUN annulées'));
  assert.ok(a.explain.some(l => /neutralisée en W39 par « Prios Co BRUN annulées » \(la donnée source reste Prio 1\)/.test(l)));

  // Magasin BLANC seulement : la neutralisation BRUN ne le concerne pas.
  const c = B.effectivePriority('c', '2026-W39', opts);
  assert.equal(c.suspended.performance, false);
  assert.equal(c.weekBoost, 60);

  // Magasin sans famille renseignée : il peut porter le BRUN, il est concerné.
  assert.equal(B.storeFamilies(state.stores[3]).join(','), 'brun,blanc');
  // … mais sans P1/P2 dans le fichier, il n'y a rien à neutraliser : aucun affichage.
  const d = B.effectivePriority('d', '2026-W39', opts);
  assert.equal(d.touchedByBrief, false);
  assert.equal(d.badges.some(x => /BRUN annulées/.test(x.text)), false);

  // Rien n'a été écrit dans les magasins ni dans le fichier performance.
  assert.equal(JSON.stringify(state.stores), avantMagasins);
  assert.equal(db.dump(), avantPerf);

  // La semaine suivante, sans règle, la contribution redevient active toute seule.
  const a40 = B.effectivePriority('a', '2026-W40', opts);
  assert.equal(a40.suspended.performance, false);
  assert.equal(a40.weekBoost, 60);
  assert.equal(a40.base.performanceWeek, 'W39', 'W40 à venir : dernier snapshot connu, comme planningBoost');
}

// --- 4. Boost temporaire d'un magasin non P1 (Challenge Darty) ---------------------------
{
  const { state, opts } = base();
  B.addRule(state, '2026-W39', {
    type: 'boost', label: 'Challenge Darty — moniteurs', boost: 30,
    scope: { family: 'brun', brands: ['Darty'] }, confidence: 'confirmed'
  });
  const b = B.effectivePriority('b', '2026-W39', opts);
  assert.equal(b.base.performance, 'P2');
  assert.equal(b.contributions.performance, 25);
  assert.equal(b.contributions.brief, 30);
  assert.equal(b.weekBoost, 55);
  assert.equal(B.planningPriority('b', '2026-W39', opts), 3 * B.STRUCTURAL_WEIGHT + 55);
  assert.ok(b.badges.some(x => x.text === 'W39 : Challenge Darty — moniteurs'));
  assert.ok(b.explain.some(l => l === 'Brief W39 : Challenge Darty — moniteurs (+30) · cette semaine seulement.'));
  const layer = b.layers.find(l => l.source === 'brief');
  assert.equal(layer.temporary, true);
  assert.equal(layer.until, '2026-W39');
  // Une enseigne non visée n'est pas touchée.
  assert.equal(B.effectivePriority('a', '2026-W39', opts).contributions.brief, 0);
  // Les boosts se cumulent mais restent bornés.
  B.addRule(state, '2026-W39', { type: 'boost', label: 'Gros coup de pouce', boost: 90, scope: { brands: ['Darty'] }, confidence: 'confirmed' });
  assert.equal(B.effectivePriority('b', '2026-W39', opts).contributions.brief, B.BOOST_LIMIT);
  assert.equal(B.briefForWeek(state, '2026-W39').rules[1].boost, 90);
  B.addRule(state, '2026-W39', { type: 'boost', label: 'Hors borne', boost: 999, confidence: 'confirmed' });
  assert.equal(B.briefForWeek(state, '2026-W39').rules[2].boost, 100, 'un boost stocké reste dans ±100');
}

// --- 5. Historique : une semaine n'efface jamais l'autre, une révision garde l'ancienne --
{
  const { state } = base();
  B.saveBrief(state, '2026-W39', { title: 'Feuille de route W39', source: { kind: 'text', excerpt: 'Texte W39' } }, { now: '2026-09-21T07:00:00Z' });
  B.saveBrief(state, '2026-W40', { title: 'Feuille de route W40', source: { kind: 'text', excerpt: 'Texte W40' } }, { now: '2026-09-28T07:00:00Z' });
  assert.equal(B.briefForWeek(state, '2026-W39').source.excerpt, 'Texte W39', 'W40 ne remplace pas W39');
  assert.deepEqual(B.listBriefs(state).map(x => x.week), ['2026-W40', '2026-W39']);

  const r1 = B.briefForWeek(state, '2026-W39');
  const same = B.saveBrief(state, '2026-W39', { title: 'Feuille de route W39' }, { now: '2026-09-22T07:00:00Z' });
  assert.equal(same.revision, r1.revision, 'un enregistrement identique ne crée pas de révision');

  B.addRule(state, '2026-W39', { type: 'note', label: 'Benchmark mercredi–jeudi', confidence: 'confirmed' }, { now: '2026-09-22T08:00:00Z' });
  const r2 = B.saveBrief(state, '2026-W39', { source: { excerpt: 'Texte W39 corrigé' } }, { now: '2026-09-22T09:00:00Z' });
  assert.equal(r2.revision, 3);
  assert.equal(r2.history.length, 2);
  assert.equal(r2.history[0].excerpt, 'Texte W39', 'le texte remplacé est conservé dans la révision précédente');
  assert.equal(r2.history[1].rules.length, 0);
  assert.equal(r2.createdAt, '2026-09-21T07:00:00Z');
  B.removeRule(state, '2026-W39', r2.rules[0].id);
  const r3 = B.briefForWeek(state, '2026-W39');
  assert.equal(r3.rules.length, 0);
  assert.equal(r3.history[0].rules.length, 1, 'une règle retirée reste lisible dans l’historique');
  assert.throws(() => B.saveBrief(state, 'W39', {}), /Semaine invalide/);
}

// --- 6. Une règle ambiguë n'agit qu'une fois confirmée ------------------------------------
{
  const { state, opts } = base();
  B.addRule(state, '2026-W39', { type: 'boost', label: 'À vérifier', boost: 40, scope: { brands: ['Darty'] } });
  assert.equal(B.briefForWeek(state, '2026-W39').rules[0].confidence, 'ambiguous', 'par défaut, une règle attend validation');
  assert.equal(B.effectivePriority('b', '2026-W39', opts).contributions.brief, 0);
  assert.equal(B.rulesForWeek(state, '2026-W39', { includeAmbiguous: true }).length, 1);
  B.confirmRule(state, '2026-W39', 'r1');
  assert.equal(B.effectivePriority('b', '2026-W39', opts).contributions.brief, 40);
}

// --- 7. Fenêtre de validité : « BLANC maintenu semaine suivante » + attente SEF ----------
{
  const { state, opts } = base();
  B.addRule(state, '2026-W39', {
    type: 'boost', label: 'Prios Co BLANC maintenues', boost: 20, scope: { family: 'blanc' },
    validTo: '2026-W40', pending: 'Confirmation SEF', confidence: 'confirmed'
  });
  B.saveBrief(state, '2026-W40', { title: 'Feuille de route W40' });

  // Même une ancienne donnée marquée confirmed reste inactive tant qu'un pending existe.
  let c40 = B.effectivePriority('c', '2026-W40', opts);
  assert.equal(c40.contributions.brief, 0, 'une règle en attente SEF ne devient pas une vérité dure');
  assert.equal(c40.touchedByBrief, false);
  assert.equal(B.listBriefs(state).find(x => x.week === '2026-W39').ambiguous, 1, 'le pending apparaît comme à confirmer');
  assert.equal(B.rulesForWeek(state, '2026-W40', { includeAmbiguous: true }).length, 1, 'la règle reste consultable avant confirmation');

  B.confirmRule(state, '2026-W39', 'r1');
  const confirmed = B.briefForWeek(state, '2026-W39').rules[0];
  assert.equal(confirmed.confidence, 'confirmed');
  assert.equal(confirmed.pending, null, 'confirmer lève explicitement le motif d’attente');

  c40 = B.effectivePriority('c', '2026-W40', opts);
  assert.equal(c40.contributions.brief, 20, 'après confirmation, la règle W39 couvre W40');
  const layer = c40.layers.find(l => l.source === 'brief');
  assert.equal(layer.inherited, true);
  assert.equal(layer.briefWeek, '2026-W39');
  assert.ok(c40.explain.some(l => /valable jusqu’à W40/.test(l)));
  assert.equal(B.effectivePriority('c', '2026-W41', opts).contributions.brief, 0);
  assert.equal(B.effectivePriority('c', '2026-W38', opts).contributions.brief, 0, 'une règle ne remonte pas dans le passé');
  assert.equal(B.effectivePriority('a', '2026-W40', opts).contributions.brief, 0, 'un magasin BRUN seul n’est pas visé');
}

// --- 8. Échéance : visites P1 avant mercredi --------------------------------------------
{
  const { state, opts } = base();
  B.addRule(state, '2026-W39', {
    type: 'deadline', label: 'Visites P1 + Google Forms', dueDate: '2026-09-23',
    scope: { basePrio: 'P1' }, confidence: 'confirmed'
  });
  state.businessV2 = { version: 2, revision: 1, storeSnapshots: {}, actions: [], visits: [{ storeId: 'a', status: 'completed', completedDate: '2026-09-22' }, { storeId: 'c', status: 'draft' }] };
  const a = B.effectivePriority('a', '2026-W39', opts);
  assert.equal(a.deadline.dueDate, '2026-09-23');
  assert.equal(a.deadline.doneDate, '2026-09-22');
  assert.equal(a.deadline.overdue, false);
  const c = B.effectivePriority('c', '2026-W39', Object.assign({}, opts, { today: '2026-09-24' }));
  assert.equal(c.deadline.doneDate, null, 'un brouillon n’est pas une visite faite');
  assert.equal(c.deadline.overdue, true);
  assert.equal(B.effectivePriority('b', '2026-W39', opts).deadline, null, 'un P2 n’est pas visé par une règle P1');
}

// --- 9. Neutraliser la priorité structurelle, sans toucher à la fiche -------------------
{
  const { state, opts } = base();
  B.addRule(state, '2026-W39', { type: 'suspend', target: 'structural', label: 'Fermeture travaux', scope: { brands: ['Darty'] }, confidence: 'confirmed' });
  const d = B.effectivePriority('d', '2026-W39', opts);
  assert.equal(d.contributions.structural, 0);
  assert.equal(d.base.structural, 4);
  assert.equal(state.stores[3].priority, 4);
  assert.equal(d.weekBoost, 0, 'weekBoost n’inclut jamais la part structurelle');
  assert.equal(B.planningPriority('d', '2026-W39', opts), 0, 'planningPriority respecte la neutralisation structurelle');
}

// --- 10. Snapshot correspondant à la semaine ------------------------------------------
{
  const state = secteur(), db = memoire();
  P.saveSnapshot(db, snapshot('W37', '2026-09-08T08:00:00Z', { 'Ville A': 'P2' }));
  P.saveSnapshot(db, snapshot('W38', '2026-09-15T08:00:00Z', { 'Ville A': 'P1' }));
  P.saveSnapshot(db, snapshot('W39', '2025-09-22T08:00:00Z', { 'Ville A': 'P2' })); // l'an dernier
  const opts = { state, db, perf: P, today: AUJOURDHUI };
  assert.equal(B.effectivePriority('a', '2026-W37', opts).base.performance, 'P2');
  assert.equal(B.effectivePriority('a', '2026-W38', opts).base.performanceWeek, 'W38');
  const w39 = B.effectivePriority('a', '2026-W39', opts);
  assert.notEqual(w39.base.performanceSource, 'exact', 'une W39 importée il y a un an n’est pas la W39 de cette année');
  assert.equal(w39.base.performanceSource, 'latest');
  const passee = B.effectivePriority('a', '2026-W36', opts);
  assert.equal(passee.base.performance, null, 'aucun fichier connu avant la fin de W36');
  const trou = B.performanceForWeek('2026-W38', { state, db, perf: P, today: AUJOURDHUI });
  assert.equal(trou.source, 'exact');
  // Sans module performance, le calcul reste possible.
  const nu = B.effectivePriority('a', '2026-W39', { state, db: null, perf: null, today: AUJOURDHUI });
  assert.equal(nu.weekBoost, 0);
  assert.equal(nu.base.structural, 5);
  assert.equal(B.planningPriority('a', '2026-W39', { state, db: null, perf: null, today: AUJOURDHUI }), 5 * B.STRUCTURAL_WEIGHT);
}

// --- 11. Déterminisme et ordre du lot -------------------------------------------------
{
  const { state, opts } = base();
  B.addRule(state, '2026-W39', { type: 'boost', label: 'Challenge Darty', boost: 30, scope: { brands: ['Darty'] }, confidence: 'confirmed' });
  const x = B.effectivePriorities('2026-W39', opts), y = B.effectivePriorities('2026-W39', opts);
  assert.equal(JSON.stringify(x), JSON.stringify(y));
  const scores = x.rows.map(r => r.score);
  assert.deepEqual(scores, scores.slice().sort((p, q) => q - p));
  state.stores[4].active = false;
  assert.equal(B.effectivePriorities('2026-W39', opts).rows.length, 4, 'un magasin inactif n’entre pas dans le lot');
}

// --- 12. Validation et sauvegarde/restauration ----------------------------------------
{
  const { state } = base();
  B.addRule(state, '2026-W39', { type: 'suspend', label: 'Prios Co BRUN annulées', scope: { family: 'brun' }, confidence: 'confirmed' });
  assert.equal(B.validate(state.weeklyBriefs), state.weeklyBriefs);
  assert.equal(R.validateState(state), state, 'un état avec briefs passe la validation de sauvegarde');
  assert.throws(() => R.validateState(Object.assign({}, state, { weeklyBriefs: [] })), /Briefs hebdomadaires invalides/);
  assert.throws(() => B.validate({ schema: 1, briefs: { W39: { week: 'W39', rules: [] } } }), /illisible/);
  assert.throws(() => B.validate({ schema: 1, briefs: { '2026-W39': { week: '2026-W40', rules: [] } } }), /incohérente/);
  assert.throws(() => B.validate({ schema: 1, briefs: { '2026-W39': { week: '2026-W39', rules: [{ type: 'magie' }] } } }), /règle/);
  assert.throws(() => B.validate({ schema: 2, briefs: {} }), /version/);
  assert.equal(R.validateState(secteur()).weeklyBriefs, undefined, 'un état V245 sans briefs reste valide');

  // Aller-retour sauvegarde → restauration sur un autre appareil.
  const source = memoire();
  const bundle = R.capture(state, source);
  assert.deepEqual(bundle.state.weeklyBriefs, state.weeklyBriefs);
  const cible = memoire();
  global.state = secteur(); // l'appareil cible a déjà un état V245, sauvegardé avant restauration
  const restaure = R.restore(JSON.parse(JSON.stringify(bundle)), cible);
  assert.deepEqual(restaure.weeklyBriefs, state.weeklyBriefs);
  assert.deepEqual(JSON.parse(cible.getItem(R.keys.MAIN)).weeklyBriefs, state.weeklyBriefs);
}

// --- 13. Budget de stockage : une année chargée reste bornée ---------------------------
{
  const state = secteur();
  let semaine = '2026-W01';
  for (let i = 0; i < 52; i++) {
    for (let rev = 0; rev < 8; rev++) {
      B.saveBrief(state, semaine, {
        title: 'Feuille de route ' + semaine,
        source: { kind: 'text', excerpt: ('Consigne ' + rev + ' ').repeat(500) },
        rules: Array.from({ length: 8 }, (_, k) => ({ type: 'boost', label: 'Règle ' + k + ' rev ' + rev, boost: 10, scope: { brands: ['Darty'], family: 'brun' }, confidence: 'confirmed' }))
      }, { now: '2026-01-01T00:00:0' + rev + 'Z' });
    }
    semaine = B.shiftWeek(semaine, 1);
  }
  const taille = JSON.stringify(state.weeklyBriefs).length;
  assert.equal(Object.keys(state.weeklyBriefs.briefs).length, 52, 'aucune semaine n’est perdue');
  assert.ok(taille < 700 * 1024, 'une année de briefs pèse ' + Math.round(taille / 1024) + ' Ko');
  const recent = B.briefForWeek(state, '2026-W52'), ancien = B.briefForWeek(state, '2026-W01');
  assert.equal(recent.history.length, 7);
  assert.equal(typeof recent.history[0].excerpt, 'string');
  assert.equal(recent.history[1].excerpt, undefined);
  assert.equal(ancien.history.length, 0, 'au-delà des 6 semaines récentes, seules les versions courantes restent');
  assert.equal(ancien.rules.length, 8);
  assert.ok(B.briefForWeek(state, '2026-W01').source.excerpt.length <= B.EXCERPT_MAX);
}

console.log('PASS: V246 brief hebdomadaire et priorité effective');
