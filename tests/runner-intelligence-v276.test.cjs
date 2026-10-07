/* V276 — Intelligence Runner : la couche MÉTIER pure de StoreRunnerBehavior.
   1. Décoratif ≠ métier : un fait métier n'est jamais bloqué par un cooldown décoratif ni ne le consomme.
   2. signature : l'empreinte des faits d'une ligne ambiante ; elle change dès qu'un fait change.
   3. remarks : au plus 1 ou 2 remarques utiles, la plus grave d'abord, rien si rien d'utile.
   4. brief : le « point du jour » du tap sur Runner, trois lignes au plus, des actions de lecture seulement. */
const assert = require('node:assert/strict');
const path = require('node:path');
const B = require(path.join(__dirname, '..', 'runner-behavior.js'));

const MIN = 60000, H = 3600000, NOW = Date.UTC(2026, 9, 7, 8, 0), D = '2026-10-07';
const view = { state: 'neutral', keyboard: false, overlay: false, firstRun: false, updating: false };
const mk = o => Object.assign({ surface: 'home', trigger: 'arrive', now: NOW, view, facts: { date: D } }, o);
const registry = (personality, extra) => B.normalizeRegistry(Object.assign({ v: 1, personality }, extra || {}), { now: NOW, date: D });
const step = (r, input) => { const x = B.decide(mk(input), r); if (!x) return { x, r }; return { x, r: B.record(r, x, { now: input.now || NOW, date: D }).registry }; };
const TOUR_READY = { total: 3, done: 0, finished: false }, TOUR_DONE = { total: 3, done: 3, finished: true };
const json = x => JSON.stringify(x);

/* 1. Décoratif ≠ métier ---------------------------------------------------------------------------------------- */
{
  const kinds = B.REACTIONS.reduce((m, r) => (m[r.id] = r.kind, m), {});
  assert.equal(kinds['tour.finished'], 'business', 'la tournée terminée est un fait métier');
  for (const id of ['attention.notice', 'welcome.back', 'day.ready', 'day.empty']) assert.equal(kinds[id], 'ambient', id + ' reste décoratif');
  assert.equal(kinds['home.return'], 'presence'); assert.equal(kinds['touch.runner'], 'social');
}
for (const id of ['copilote', 'complice', 'coach', 'taquin']) { // même juste après un texte décoratif, avec le budget épuisé
  let r = registry(id);
  const first = step(r, { facts: { date: D, tour: TOUR_READY, workday: true, mode: 'today' } });
  assert.equal(first.x.id, 'day.ready', id);
  r = first.r;
  assert.ok(r.lastTextAt !== null, 'un texte décoratif ferme l’écart de texte');
  const done = B.decide(mk({ facts: { date: D, tour: TOUR_DONE }, now: NOW + 5000, trigger: 'rerender' }), r);
  assert.equal(done && done.id, 'tour.finished', id + ' : la tournée terminée n’attend ni l’écart ni la garde d’arrivée');
  assert.equal(done.kind, 'business');
  if (id !== 'discret') assert.ok(done.text, id + ' : le texte du fait métier est affiché');
  assert.equal(done.meta.textCounted, false, 'un texte métier ne compte pas dans le budget décoratif');
}
{ // Quand Runner se tait : le clavier, le guide, un recouvrement, un état en cours valent pour le métier aussi ; la bannière de mise à jour, non
  const done = { date: D, tour: TOUR_DONE };
  for (const flag of ['keyboard', 'firstRun', 'overlay']) assert.equal(B.decide(mk({ view: Object.assign({}, view, { [flag]: true }), facts: done }), registry('coach')), null, 'le métier se tait aussi : ' + flag);
  assert.equal(B.decide(mk({ view: Object.assign({}, view, { state: 'alert' }), facts: done }), registry('coach')), null, 'Runner déjà occupé');
  assert.equal(B.decide(mk({ view: Object.assign({}, view, { updating: true }), facts: done }), registry('coach')).id, 'tour.finished', 'une mise à jour proposée ne fait pas taire un fait métier');
  const att = { kind: 'late', key: 's1', label: 'Darty Metz', reason: 'en retard' };
  assert.equal(B.decide(mk({ view: Object.assign({}, view, { updating: true }), facts: { date: D, attention: att } }), registry('coach')), null, 'mais elle fait taire le décoratif');
}
{ // le métier n'ouvre pas non plus de cooldown décoratif : le texte ambiant suivant reste possible
  const r0 = registry('coach', { lastActiveDate: '2026-09-01' });
  const a = step(r0, { facts: { date: D, tour: TOUR_DONE } });
  assert.equal(a.x.id, 'tour.finished');
  assert.equal(a.r.lastTextAt, null, 'aucun écart de texte ouvert');
  assert.deepEqual(a.r.textDay, { date: null, n: 0 }, 'aucun budget consommé');
  assert.deepEqual(a.r.session.lastReaction, {}, 'aucune garde d’arrivée ouverte');
  assert.equal(a.r.session.lastGestureAt, null, 'aucun écart de geste ouvert');
  assert.equal(a.r.shown['tour.finished'].d, D, 'seule la mémoire « déjà montré aujourd’hui » est écrite');
  const b = B.decide(mk({ facts: { date: D, attention: { kind: 'late', key: 's1', label: 'Darty Metz', reason: 'en retard' } }, now: NOW + 1000 }), a.r);
  assert.equal(b && b.id, 'attention.notice', 'le décoratif suivant n’est pas retardé par le métier');
}
{ // une fois par date locale, et jamais sans date valide
  const a = step(registry('coach'), { facts: { date: D, tour: TOUR_DONE } });
  assert.equal(B.decide(mk({ facts: { date: D, tour: TOUR_DONE }, now: NOW + H }), a.r), null, 'une seule fois par jour');
  assert.equal(B.decide(mk({ facts: { date: '2026-10-08', tour: TOUR_DONE }, now: NOW + 24 * H }), a.r).id, 'tour.finished', 'le lendemain, il revient');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_DONE } }), registry('coach')), null, 'sans date valide : rien');
  assert.equal(B.decide(mk({ facts: { date: 'x', tour: TOUR_DONE } }), registry('coach')), null);
}
{ // Discret : l'état de réussite seul, sans texte, comme avant
  const x = B.decide(mk({ facts: { date: D, tour: TOUR_DONE } }), registry('discret'));
  assert.deepEqual([x.id, x.text, x.state, x.kind], ['tour.finished', null, 'success', 'business']);
}
{ // le décoratif reste soumis à tous ses garde-fous
  let r = registry('coach'); const a = step(r, { facts: { date: D, workday: true, mode: 'today' } }); assert.equal(a.x.id, 'day.empty');
  const att = { kind: 'late', key: 's1', label: 'Darty Metz', reason: 'en retard' };
  assert.equal(B.decide(mk({ facts: { date: D, attention: att }, now: NOW + 5000 }), a.r), null, 'écart de texte décoratif : toujours appliqué');
  assert.equal(B.decide(mk({ facts: { date: D, attention: att }, now: NOW + 10 * MIN }), a.r).id, 'attention.notice');
  assert.equal(B.decide(mk({ trigger: 'rerender', facts: { date: D, attention: att }, now: NOW + 10 * MIN }), a.r), null, 'le décoratif ne parle pas à chaque rendu');
}

/* 2. signature ------------------------------------------------------------------------------------------------- */
{
  const base = { date: D, workday: true, afterHours: false, mode: 'today', tour: { total: 3, done: 0, finished: false }, attention: { kind: 'late', key: 's1', label: 'Darty Metz' }, lastVisitDaysAgo: 4 };
  const sig = B.signature(base);
  assert.equal(typeof sig, 'string'); assert.ok(sig.length > 0);
  assert.equal(B.signature(JSON.parse(json(base))), sig, 'déterministe');
  assert.equal(B.signature(Object.assign({}, base, { returnFrom: 'planPanel', attention: { kind: 'late', key: 's1', label: 'Autre libellé', reason: 'x' } })), sig, 'le retour et les libellés ne changent pas les faits');
  for (const [name, change] of [
    ['une visite faite', { tour: { total: 3, done: 1, finished: false } }],
    ['tournée terminée', { tour: { total: 3, done: 3, finished: true } }],
    ['tournée supprimée', { tour: null }],
    ['autre point d’attention', { attention: { kind: 'late', key: 's2', label: 'Darty Metz' } }],
    ['plus de point d’attention', { attention: null }],
    ['autre nature d’attention', { attention: { kind: 'action-overdue', key: 's1', label: 'Darty Metz' } }],
    ['dernière visite aujourd’hui', { lastVisitDaysAgo: 0 }],
    ['autre jour', { date: '2026-10-08' }],
    ['hors horaires', { afterHours: true }],
    ['autre mode', { mode: 'next' }]
  ]) assert.notEqual(B.signature(Object.assign({}, base, change)), sig, 'la signature change : ' + name);
  for (const bad of [null, undefined, 42, 'x', [], {}]) assert.doesNotThrow(() => assert.equal(typeof B.signature(bad), 'string'));
  const trap = { get tour() { throw new Error('piégé'); } };
  assert.doesNotThrow(() => B.signature(trap));
  const c = B.createController(null);
  assert.equal(c.signature(base), sig, 'le contrôleur expose la même empreinte');
}

/* 3. remarks --------------------------------------------------------------------------------------------------- */
{
  const item = (kind, severity, tone, text) => ({ id: kind + '1', kind, severity, tone, text });
  const none = B.remarks({ items: [] });
  assert.deepEqual(json(none), json({ lines: [], tone: 'neutral', state: 'neutral' }), 'rien d’utile : aucune ligne');
  for (const bad of [null, undefined, 42, 'x', [], {}, { items: 'x' }, { items: [null, 3, 'x', {}, { kind: 'inconnu', text: 't' }, { kind: 'trend', text: '' }, { kind: 'trend', text: '   ' }] }])
    assert.doesNotThrow(() => assert.deepEqual(B.remarks(bad).lines, []), 'entrée hostile : aucune ligne');

  const all = [item('open-actions', 1, 'neutral', 'a'), item('trend', 1, 'positive', 'b'), item('recurring', 3, 'attention', 'c'), item('improved', 1, 'positive', 'd'), item('overdue-action', 3, 'attention', 'e')];
  const r = B.remarks({ items: all });
  assert.deepEqual(r.lines.map(l => l.text), ['c', 'e'], 'les deux plus graves, dans l’ordre de gravité puis de saisie');
  assert.equal(r.state, 'alert'); assert.equal(r.tone, 'attention');
  assert.deepEqual(B.remarks({ items: all, max: 1 }).lines.map(l => l.text), ['c'], 'max abaisse le plafond');
  assert.equal(B.remarks({ items: all, max: 9 }).lines.length, 2, 'jamais plus de deux remarques');
  assert.equal(B.remarks({ items: all, personality: 'discret' }).lines.length, 1, 'Discret : une seule remarque');
  for (const p of ['copilote', 'complice', 'coach', 'taquin']) assert.equal(B.remarks({ items: all, personality: p }).lines.length, 2, p);
  assert.equal(B.remarks({ items: all, personality: 'inconnu' }).lines.length, 2, 'personnalité inconnue : celle par défaut');

  const dup = B.remarks({ items: [item('recurring', 3, 'attention', 'premier'), item('recurring', 3, 'attention', 'second'), item('trend', 1, 'neutral', 'tendance')] });
  assert.deepEqual(dup.lines.map(l => l.text), ['premier', 'tendance'], 'une remarque par nature');
  assert.equal(B.remarks({ items: [item('improved', 1, 'positive', 'mieux')] }).state, 'success', 'une évolution positive donne l’état de réussite');
  assert.equal(B.remarks({ items: [item('revisit', 1, 'neutral', 'à revoir')] }).state, 'neutral');
  assert.equal(B.remarks({ items: [item('regression', 1, 'attention', 'léger')] }).state, 'neutral', 'une alerte demande une vraie gravité');
  assert.equal(B.remarks({ items: [item('regression', 2, 'attention', 'net')] }).state, 'alert');
  const sane = B.remarks({ items: [{ kind: 'trend', text: ' a\n\tb  ' + 'z'.repeat(400), severity: 99, tone: 'bruyant', id: '../../x y' }] });
  assert.equal(sane.lines.length, 1);
  assert.ok(Array.from(sane.lines[0].text).length <= B.CONFIG.lineMaxChars); assert.doesNotMatch(sane.lines[0].text, /[\n\t]/);
  assert.equal(sane.tone, 'neutral', 'ton inconnu ignoré'); assert.match(sane.lines[0].id, /^[A-Za-z0-9._:-]+$/);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.lines) && Object.isFrozen(r.lines[0]));
  const input = { items: all }, before = json(input); B.remarks(input); assert.equal(json(input), before, 'ne modifie pas son entrée');
  assert.equal(json(B.remarks({ items: all })), json(B.remarks({ items: all.slice() })), 'déterministe');
  assert.deepEqual(B.REMARK_KINDS.slice().sort(), ['improved', 'inconsistency', 'open-actions', 'overdue-action', 'recurring', 'regression', 'report-memory', 'revisit', 'trend']);
  const ctl = B.createController(null);
  assert.equal(ctl.remarks({ items: all }).lines.length, 2, 'Copilote par défaut');
  ctl.setPersonality('discret'); assert.equal(ctl.remarks({ items: all }).lines.length, 1, 'le contrôleur injecte la personnalité choisie');
}

/* 4. brief ----------------------------------------------------------------------------------------------------- */
{
  const next = { key: 's-b', label: 'Darty Bravo' };
  const left = B.brief({ tour: { total: 3, done: 1, finished: false, next }, mode: 'today', workday: true });
  assert.deepEqual(left.lines.map(l => l.text), ['2 visites restantes aujourd’hui · prochaine : Darty Bravo.']);
  assert.deepEqual(left.lines[0].action, { type: 'open-store', storeId: 's-b' });
  assert.equal(B.brief({ tour: { total: 3, done: 2, finished: false, next }, mode: 'today' }).lines[0].text, '1 visite restante aujourd’hui · prochaine : Darty Bravo.');
  assert.equal(B.brief({ tour: { total: 3, done: 3, finished: true }, mode: 'today' }).lines[0].text, 'Tournée terminée : 3 sur 3.');
  assert.equal(B.brief({ tour: { total: 3, done: 3, finished: true }, mode: 'today' }).lines[0].action, null);
  assert.equal(B.brief({ tour: { total: 1, done: 0, finished: false }, mode: 'next' }).lines[0].text, 'Prochaine tournée : 1 visite.');
  assert.equal(B.brief({ workday: true, mode: 'today', afterHours: false }).lines[0].text, 'Rien de prévu aujourd’hui.');
  assert.deepEqual(B.brief({ workday: true, mode: 'today', afterHours: true }).lines, [], 'hors horaires : rien à dire');
  assert.deepEqual(B.brief({ workday: false, mode: 'today' }).lines, []); assert.equal(B.brief({}).empty, true);
  for (const bad of [null, undefined, 42, 'x', []]) assert.doesNotThrow(() => assert.equal(B.brief(bad).empty, true));

  const att = { kind: 'action-overdue', key: 's-c', label: 'Darty Metz', reason: 'action échue' };
  const rem = { lines: [{ kind: 'recurring', text: 'Stocks : à corriger pour la 3ᵉ visite de suite.' }, { kind: 'trend', text: 'Moins de points qu’au dernier passage.' }] };
  const full = B.brief({ tour: { total: 3, done: 1, finished: false, next }, mode: 'today', attention: att, remarks: rem });
  assert.equal(full.lines.length, B.CONFIG.briefMaxLines, 'trois lignes au plus');
  assert.equal(full.lines[0].id, 'day.left'); assert.deepEqual(full.lines.slice(1).map(l => l.text), rem.lines.map(l => l.text), 'jour, puis lecture du dernier passage ; le point d’attention passe après');
  const noRem = B.brief({ tour: { total: 3, done: 1, finished: false, next }, mode: 'today', attention: att });
  assert.deepEqual(noRem.lines.map(l => l.id), ['day.left', 'attention']);
  assert.equal(noRem.lines[1].text, 'À regarder : Darty Metz, action échue.'); assert.deepEqual(noRem.lines[1].action, { type: 'open-store', storeId: 's-c' });
  // Le point d'attention porte sur le magasin de la prochaine visite : un seul bouton « fiche », celui de la première ligne.
  const same = B.brief({ tour: { total: 3, done: 1, finished: false, next }, mode: 'today', attention: { kind: 'late', key: 's-b', label: 'Darty Bravo', reason: '40 jours sans passage' } });
  assert.deepEqual(same.lines.map(l => l.id), ['day.left', 'attention']);
  assert.deepEqual(same.lines[0].action, { type: 'open-store', storeId: 's-b' });
  assert.equal(same.lines[1].action, null, 'pas de second bouton pour le même magasin');
  assert.equal(same.lines[1].text, 'À regarder : Darty Bravo, 40 jours sans passage.', 'mais le constat reste dit');
  assert.deepEqual(B.brief({ mode: 'today', attention: { kind: 'late', key: 's-b', label: 'Darty Bravo', reason: 'retard' } }).lines[0].action, { type: 'open-store', storeId: 's-b' }, 'sans prochaine visite le bouton revient au constat');
  const named = B.brief({ tour: { total: 3, done: 1, finished: false, next }, mode: 'today', remarks: { store: 'Darty Metz', lines: rem.lines } });
  assert.equal(named.lines[1].text, 'Darty Metz · ' + rem.lines[0].text, 'la première remarque nomme le magasin concerné');
  assert.equal(named.lines[2].text, rem.lines[1].text, 'les suivantes ne répètent pas son nom');
  assert.ok(Array.from(B.brief({ mode: 'today', remarks: { store: 'M'.repeat(90), lines: [{ kind: 'trend', text: 'x'.repeat(200) }] } }).lines[0].text).length <= B.CONFIG.lineMaxChars, 'borné');
  const overdue = B.brief({ tour: { total: 3, done: 1, finished: false, next }, mode: 'today', attention: att, remarks: { lines: [{ kind: 'overdue-action', text: '1 action en retard.' }] } });
  assert.ok(!overdue.lines.some(l => l.id === 'attention'), 'pas de doublon avec la remarque d’action en retard');
  for (const l of full.lines.concat(noRem.lines)) { assert.ok(l.action === null || l.action.type === 'open-store'); assert.doesNotMatch(l.text, /\{|\}|undefined|null|NaN/); }
  const hostile = B.brief({ tour: { total: 3, done: 1, finished: false, next: { key: '../x y', label: '<b>' + 'L'.repeat(80) } }, mode: 'today', attention: { kind: 'inconnu', key: 'a', label: 'b' } });
  assert.equal(hostile.lines.length, 1); assert.match(hostile.lines[0].action.storeId, /^[A-Za-z0-9._:-]+$/); assert.ok(Array.from(hostile.lines[0].text).length <= 80);
  assert.ok(Object.isFrozen(full) && Object.isFrozen(full.lines) && Object.isFrozen(full.lines[0]));
  const input = { tour: { total: 3, done: 1, finished: false, next }, mode: 'today', remarks: rem }, before = json(input); B.brief(input); assert.equal(json(input), before);
  assert.equal(B.createController(null).brief(input).lines.length, 3);
}

/* 5. Pureté : la couche métier ne dépend ni de l'horloge ni du hasard ni de l'environnement -------------------- */
{
  const real = Object.getOwnPropertyDescriptor(globalThis, 'Date'); let calls = 0;
  globalThis.Date = new Proxy(real.value, { construct(t, a) { calls++; return new t(...a); }, get(t, k) { if (k === 'now') calls++; return t[k]; } });
  try {
    B.signature({ date: D, tour: TOUR_DONE }); B.remarks({ items: [{ kind: 'trend', text: 't' }] }); B.brief({ tour: TOUR_DONE, mode: 'today' });
  } finally { Object.defineProperty(globalThis, 'Date', real); }
  assert.equal(calls, 0, 'aucune lecture d’horloge');
}

console.log('PASS: Runner Intelligence V276 — couche métier pure (décoratif ≠ métier, signature, remarques, point du jour).');
