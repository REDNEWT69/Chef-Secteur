/* Lot B — Planning Command Engine : interprétation, schéma strict et résolution (pur).
   Cas couverts ici : A (P1 avant W42, lecture), B (magasin précis à un jour), C (jour
   interdit), G (semaine passée refusée), H (ambiguïté → clarification, aucune
   intention applicable), I (JSON invalide ou hors schéma refusé), plus la séparation
   « interpréter / valider / résoudre » et la frontière avec l'assistant historique. */
const assert = require('node:assert/strict');
const E = require('../planning-command-engine.js');

const SAT = { today: '2026-10-03', startDate: '2026-10-05', brands: ['Darty', 'Boulanger', 'Fnac'] };
const WED = { today: '2026-10-07', startDate: '2026-10-07', brands: ['Darty', 'Boulanger', 'Fnac'] };
const parse = (text, ctx = SAT) => E.parse(text, ctx);
const intentOf = (text, ctx) => { const r = parse(text, ctx); assert.equal(r && r.kind, 'intent', text + ' → ' + JSON.stringify(r)); return r.intent; };
let passed = 0; const check = (name, fn) => { fn(); passed++; console.log('✓ ' + name); };

check('les 8 exemples cibles V1 produisent une intention, une information ou une demande précise', () => {
  const p1 = intentOf('Programme-moi tous mes P1 avant la W42');
  assert.equal(p1.action, 'plan_visits');
  assert.deepEqual(p1.scope, { start: '2026-10-05', end: '2026-10-11' }, 'samedi 03/10 non travaillé : départ réel lundi 05/10, fin dimanche avant W42');
  assert.deepEqual(p1.filters.priorities, ['P1']);
  const place = intentOf('Mets Valence mardi et garde Chambéry mercredi');
  assert.equal(place.action, 'place_stores');
  assert.deepEqual(place.constraints.exactDays, [{ stores: [{ query: 'valence' }], date: '2026-10-06' }]);
  assert.deepEqual(place.constraints.keepDays, [{ stores: [{ query: 'chambery' }], date: '2026-10-07' }]);
  const spread = intentOf('Répartis mes Prio 1 sur les trois prochaines semaines');
  assert.equal(spread.constraints.distribution, 'spread');
  assert.deepEqual(spread.scope, { start: '2026-10-05', end: '2026-10-25' }, 'mêmes trois semaines que le contrat r38');
  const avoid = intentOf('Évite Lyon jeudi');
  assert.deepEqual(avoid.constraints.forbidden, [{ stores: [{ query: 'lyon' }], date: '2026-10-08' }]);
  assert.deepEqual(intentOf('Ajoute Darty Annemasse vendredi').constraints.exactDays, [{ stores: [{ query: 'darty annemasse' }], date: '2026-10-09' }]);
  const recalc = intentOf('Recalcule seulement le reste de ma semaine', WED);
  assert.equal(recalc.action, 'recalculate_rest_of_week');
  assert.deepEqual(recalc.scope, { start: '2026-10-07', end: '2026-10-11' });
  assert.equal(parse('Ne touche pas à mes rendez-vous').kind, 'info');
  const around = intentOf('Fais-moi une semaine autour de Chambéry mardi et mercredi');
  assert.deepEqual(around.constraints.windowDays, [{ stores: [{ query: 'chambery' }], dates: ['2026-10-06', '2026-10-07'] }]);
});

check('variantes de formulation : même intention', () => {
  const base = intentOf('Programme mes P1 avant la W42');
  for (const text of ['programme moi tous mes p1 avant w42', 'PROGRAMME MES P1 AVANT LA S42', 'Peux-tu programmer mes prio 1 avant la semaine 42 ?', 'Programme mes P1 avant W42 sans toucher à mes RDV', 'Programme mes P1 avant W42 en limitant les kilomètres', 'Programme mes P1 avant la W42 et optimise les découchés', 'Ne touche pas à mes rendez-vous et programme mes P1 avant W42'])
    assert.deepEqual(intentOf(text), base, text);
});

check('frontière avec l’assistant historique : ses commandes ne sont pas captées', () => {
  for (const text of ['mets 25 magasins', 'ajoute un magasin', 'exclue Darty Grenoble', 'verrouille Fnac Valence jeudi', 'impose Darty Grenoble', 'refais jeudi', 'résume ma semaine', 'quel magasin est le plus en retard ?', 'où dormir ?', 'bonjour'])
    assert.equal(parse(text), null, text);
});

check('commandes volontairement non prises en charge : refus explicite, jamais une application', () => {
  for (const text of ['Programme mes P1 W42 et déplace mes RDV', 'Supprime mes visites de jeudi et programme mes P1', 'Mets Valence mardi à 10h', 'Mets Valence tous les mardis', 'Mets Valence dimanche', 'Programme mes P3 avant W42', 'Ne programme pas mes P1', 'Programme mes P1 W42 sans limiter les kilomètres', 'Mets une formation mardi'])
    assert.equal(parse(text).kind, 'unsupported', text);
});

check('G — passé refusé, date réelle seule référence (r38)', () => {
  assert.equal(parse('Programme mes P1 W40', WED).kind, 'clarify', 'W40 (28/09–04/10) est passée le 07/10');
  assert.match(parse('Programme mes P1 W40', WED).question, /pass/);
  assert.equal(parse('Mets Valence le 01/10', WED).kind, 'unsupported');
  assert.equal(parse('Programme mes P1 avant la W41', SAT).kind, 'clarify', 'plus aucun jour travaillé avant la W41 un samedi');
  /* Mercredi : « mardi » désigne le mardi suivant, et deux jours nommés restent dans une même semaine. */
  assert.equal(intentOf('Mets Valence mardi', WED).constraints.exactDays[0].date, '2026-10-13');
  const pair = intentOf('Mets Valence mardi et garde Chambéry mercredi', WED);
  assert.deepEqual([pair.constraints.exactDays[0].date, pair.constraints.keepDays[0].date], ['2026-10-13', '2026-10-14']);
  assert.equal(intentOf('Mets Valence jeudi', WED).constraints.exactDays[0].date, '2026-10-08');
  assert.equal(intentOf('Mets Valence aujourd’hui', WED).constraints.exactDays[0].date, '2026-10-07');
  assert.throws(() => E.validate({ ...intentOf('Évite Lyon jeudi', WED), scope: { start: '2026-10-05', end: '2026-10-11' } }, { today: '2026-10-07' }), /passé/);
});

check('semaines ISO : année implicite, fin d’année, semaine inexistante', () => {
  assert.equal(intentOf('Programme mes P1 W1', { today: '2026-12-30', startDate: '2026-12-30', brands: [] }).scope.start, '2027-01-04');
  assert.equal(parse('Programme mes P1 W53 2027').kind, 'clarify', '2027 n’a pas de semaine 53');
  assert.equal(intentOf('Programme mes P1 W53 2026').scope.start, '2026-12-28', '2026 commence un jeudi : W53 existe');
  assert.equal(intentOf('Programme mes P1 W42 2027').scope.start, '2027-10-18');
  assert.equal(parse('Programme mes P1 sur les dix prochaines semaines').kind, 'clarify');
});

check('ambiguïté de formulation → question courte, jamais une supposition', () => {
  assert.equal(parse('Programme mes P1').kind, 'clarify');
  assert.equal(parse('Mets Valence').kind, 'clarify');
  assert.equal(parse('Mets Valence mardi et Romans mercredi et Chambéry').kind, 'clarify');
  assert.equal(parse('Mets Valence mardi 14').kind, 'clarify', 'le 14 octobre 2026 est un mercredi');
});

check('I — schéma strict : champ inconnu, type, protection levée, action inconnue → refus', () => {
  const ok = intentOf('Programme mes P1 avant la W42');
  assert.deepEqual(E.validate(ok, { today: '2026-10-03' }), ok);
  const bad = [
    { ...ok, extra: 1 },
    { ...ok, version: 2 },
    { ...ok, action: 'delete_week' },
    { ...ok, action: 'plan_visits', scope: { start: '2026-10-05', end: '2026-10-09' } },
    { ...ok, filters: { ...ok.filters, priorities: ['P3'] } },
    { ...ok, filters: { ...ok.filters, stores: [{ query: '<img src=x onerror=alert(1)>' }] } },
    { ...ok, filters: { ...ok.filters, stores: [{ id: 'bv' }] } },
    { ...ok, constraints: { ...ok.constraints, preserveAppointments: false } },
    { ...ok, constraints: { ...ok.constraints, distribution: 'random' } },
    { ...ok, constraints: { ...ok.constraints, forbidden: [{ stores: [], date: '2026-10-11' }] } },
    { ...ok, constraints: { ...ok.constraints, exactDays: [{ stores: [{ query: 'valence' }], date: '2026-10-20' }] } },
    { ...ok, scope: { start: '2026-10-05', end: '2026-12-27' } }
  ];
  for (const intent of bad) assert.throws(() => E.validate(intent, { today: '2026-10-03' }), Error, JSON.stringify(intent).slice(0, 120));
});

check('I — un modèle ne peut fournir qu’un JSON d’intention : code, JSON cassé ou hors schéma refusés', () => {
  const ok = JSON.stringify(intentOf('Évite Lyon jeudi'));
  assert.equal(E.acceptModelIntent(ok, { today: '2026-10-03' }).action, 'plan_visits');
  for (const text of ['', '{', 'state.plan={}', 'function(){return 1}', '{"version":1,"action":"plan_visits"}', ok.replace('"plan_visits"', '"eval"'), ok.replace('"preserveAppointments":true', '"preserveAppointments":"true"'), JSON.stringify({ __proto__: null, ...JSON.parse(ok), code: 'alert(1)' }), 'x'.repeat(5000)])
    assert.throws(() => E.acceptModelIntent(text, { today: '2026-10-03' }), Error, text.slice(0, 60));
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'planning-command-engine.js'), 'utf8');
  assert.doesNotMatch(src, /\beval\s*\(|new Function|setTimeout\s*\(\s*['"]/, 'aucun texte exécuté');
});

/* ---------------------------------------------------------------- résolution */
const STORES = [
  { id: 'bv', enseigne: 'Boulanger', ville: 'Valence', adresse: '1 av. de Romans' },
  { id: 'dv', enseigne: 'Darty', ville: 'Valence', adresse: 'ZC Briffaut' },
  { id: 'fbv', enseigne: 'Fnac', ville: 'Bourg-lès-Valence', adresse: 'Rue du Pont' },
  { id: 'bc', enseigne: 'Boulanger', ville: 'Chambéry', adresse: 'Bissy' },
  { id: 'da', enseigne: 'Darty', ville: 'Annemasse', adresse: 'Rue de Genève' },
  { id: 'dl', enseigne: 'Darty', ville: 'Lyon', adresse: 'Part-Dieu' },
  { id: 'bl', enseigne: 'Boulanger', ville: 'Lyon', adresse: 'Confluence' },
  { id: 'old', enseigne: 'Darty', ville: 'Vienne', adresse: '', active: false },
  { id: 'dse', enseigne: 'Darty', ville: 'Saint-Étienne', adresse: 'Centre deux' }
];
const P1 = new Set(['bv', 'da', 'bc']);
const rctx = extra => Object.assign({ stores: STORES, priorityOf: s => P1.has(String(s.id)) ? 'P1' : '', today: '2026-10-03' }, extra || {});

check('H — plusieurs magasins : choix proposé, aucune intention résolue', () => {
  const raw = intentOf('Mets Valence mardi');
  const r = E.resolve(raw, rctx());
  assert.equal(r.kind, 'clarify');
  assert.match(r.question, /Valence.*3 magasins/, 'Valence couvre aussi Bourg-lès-Valence : jamais deviné');
  assert.deepEqual(r.choices.map(c => c.label.split(' · ')[0]), ['Boulanger Valence', 'Darty Valence', 'Fnac Bourg-lès-Valence', 'Les 3 magasins']);
  const chosen = E.resolve(raw, rctx({ selections: r.choices[0].selections }));
  assert.equal(chosen.kind, 'resolved');
  assert.deepEqual(chosen.intent.constraints.exactDays, [{ stores: [{ id: 'bv' }], date: '2026-10-06' }], 'IDs magasin dans l’intention finale');
  assert.deepEqual(E.resolve(intentOf('Mets Boulanger Valence mardi'), rctx()).intent.constraints.exactDays[0].stores, [{ id: 'bv' }]);
  assert.deepEqual(E.resolve(intentOf('Mets St Étienne mardi'), rctx()).intent.constraints.exactDays[0].stores, [{ id: 'dse' }], 'St → Saint');
  assert.equal(E.resolve(intentOf('Mets Darty Vienne mardi'), rctx()).kind, 'clarify', 'magasin désactivé : jamais planifié en silence');
  assert.match(E.resolve(intentOf('Mets Darty Vienne mardi'), rctx()).question, /désactivé/);
  assert.match(E.resolve(intentOf('Mets Castorama Paris mardi'), rctx()).question, /ne trouve pas/);
});

check('filtres P1/enseigne développés en IDs ; absence de données performance → clarification', () => {
  const r = E.resolve(intentOf('Programme mes P1 avant la W42'), rctx());
  assert.deepEqual(r.intent.filters.stores, [{ id: 'bc' }, { id: 'bv' }, { id: 'da' }]);
  assert.deepEqual(E.resolve(intentOf('Programme mes P1 Darty avant la W42'), rctx()).intent.filters.stores, [{ id: 'da' }]);
  assert.equal(E.resolve(intentOf('Programme mes P1 avant la W42'), rctx({ priorityOf: () => '' })).kind, 'clarify');
  assert.equal(E.resolve(intentOf('Programme mes P1 avant la W42'), rctx({ priorityOf: null })).kind, 'clarify');
});

check('contradictions résolues : même magasin exigé deux jours, ou exigé et interdit', () => {
  const twice = E.resolve(intentOf('Mets Boulanger Valence mardi et mercredi'), rctx());
  assert.equal(twice.kind, 'clarify');
  const both = intentOf('Programme mes P1 avant la W42 et mets Boulanger Valence mardi et évite Boulanger Valence mardi');
  assert.equal(E.resolve(both, rctx()).kind, 'clarify');
});

check('déterminisme : même texte, même date → même intention, octet pour octet', () => {
  for (const text of ['Programme-moi tous mes P1 avant la W42', 'Fais-moi une semaine autour de Chambéry mardi et mercredi', 'Évite Lyon jeudi'])
    assert.equal(E.stableStringify(parse(text)), E.stableStringify(parse(text)));
});

console.log('planning-command-engine: ' + passed + ' groupes OK');
