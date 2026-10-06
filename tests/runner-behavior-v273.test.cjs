// V273 — fondation Runner Behavior : module pur, déterministe, NON chargé par l'application.
// Contrat : RUNNER_PERSONALITY_V273.md. Aucun DOM, aucun Runner, aucune donnée métier : tout passe par
// des faits primitifs et une horloge injectés. Les textes ne sont jamais figés dans les assertions
// (copy modifiable) : on vérifie des invariants, des gabarits et des appartenances aux données.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILE = 'runner-behavior.js';
const source = read(FILE);
const B = require('../runner-behavior.js');

const D = '2026-10-05';
const NOW = Date.UTC(2026, 9, 5, 8, 0, 0);
const MIN = 60000, H = 3600000;
const iso = n => '2026-10-' + String(n).padStart(2, '0');
const TOUR_DONE = { total: 3, done: 3, finished: true };
const TOUR_READY = { total: 3, done: 0, finished: false };
const TOUR_RUN = { total: 3, done: 1, finished: false };
const ATT = (key, label) => ({ kind: 'action-overdue', key, label: label || 'Darty Metz', reason: 'action échue' });
const FREE = { config: { textGapMs: 0, gestureGapMs: 0, arrivalGuardMs: 0 } }; // isole une règle à la fois
const used = new Set();
const cfg = (key, value, extra) => { used.add(key); return { config: Object.assign({ [key]: value }, extra || {}) }; };

function mk(over) {
  over = over || {};
  return { surface: over.surface || 'home', trigger: over.trigger || 'arrive', now: over.now === undefined ? NOW : over.now,
    view: over.view || { state: 'neutral' }, facts: Object.assign({ date: D }, over.facts || {}) };
}
function registry(personality, extra) {
  let r = B.normalizeRegistry(Object.assign({ v: 1 }, extra || {}));
  if (personality) r = B.setPersonality(r, personality).registry;
  return r;
}
function step(r, over, options) {
  const input = mk(over), x = B.decide(input, r, options);
  if (!x) return { x: null, r };
  const n = B.record(r, x, { now: input.now, date: input.facts.date }, options);
  return { x, r: n.registry, dirty: n.dirty };
}
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const json = v => JSON.stringify(v);
const ids = B.REACTIONS.map(r => r.id);

/* 1. Interdictions architecturales ------------------------------------------------------------ */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/.*$/gm, '$1');
const FORBIDDEN = [
  [/\bdocument\b|\bnavigator\b|\blocation\b|getElementById|querySelector|createElement|innerHTML|textContent/, 'aucun DOM'],
  [/addEventListener|removeEventListener|dispatchEvent|CustomEvent|MutationObserver|IntersectionObserver|ResizeObserver|PerformanceObserver/, 'aucun listener ni observer'],
  [/setTimeout|setInterval|setImmediate|requestAnimationFrame|requestIdleCallback|queueMicrotask|clearTimeout|clearInterval/, 'aucun timer'],
  [/\bfetch\b|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\beval\s*\(|new Function/, 'aucun réseau, aucune évaluation dynamique'],
  [/Math\.random|crypto|Date\.now|new Date\b|performance\.now|\bperformance\b/, 'aucun aléa, aucune lecture d’horloge'],
  [/localStorage|sessionStorage|__chefStorage|indexedDB|IDBFactory|caches\./, 'aucun stockage direct : le registre passe par un adaptateur injecté'],
  [/\bRunner\b|StoreRunnerRunner|window\.Runner|returnToRest|setPresence|\.moveTo\s*\(|\.mount\s*\(|\.showMessage\s*\(|\.setState\s*\(/, 'aucune référence à Runner'],
  [/window\.state|globalThis\.state|\broot\.state|\bstate\.(stores|plan|settings|visits|businessV2|appointments|profile|locks|excluded|included)\b/, 'aucun accès au state global'],
  [/\bwindow\s*\.|\bglobal\s*\.|\bprocess\b|\brequire\s*\(|\bimport\s|\bexport\s/, 'aucune dépendance runtime ni accès au global hors export'],
  [/StoreRunnerPlanning|StoreRunnerVisit|StoreRunnerHome|StoreRunnerActivity|StoreOpeningHours|StoreRunnerManualPlanning|scheduleRoute|forecastThreeWeeks|generateWeek|state\.plan\b/, 'aucun moteur, aucun propriétaire Planning ou métier']
];
for (const [pattern, why] of FORBIDDEN) assert.doesNotMatch(code, pattern, 'interdit dans runner-behavior.js : ' + why);
// Même détecteur que le pin de tests/runner-visual-v269.test.cjs (liste des fichiers qui branchent Runner) :
// le nom du global ne doit pas contenir « StoreRunnerRunner », sinon le module serait pris pour un hôte.
assert.doesNotMatch(source, /StoreRunnerRunner|\bRunner\.(setState|showMessage|mount|reset|unmount|getState)\b|window\.Runner\b/, 'le module ne ressemble pas à un hôte de Runner');
assert.ok(source.includes('root.StoreRunnerBehavior=api'), 'global public : StoreRunnerBehavior');

// Isolation : le module s'exécute dans un contexte vide (ni window, ni document, ni console).
const sandbox = {};
vm.runInNewContext(source, sandbox);
assert.equal(typeof sandbox.StoreRunnerBehavior.decide, 'function', 'aucune dépendance cachée : le module tourne dans un contexte vide');
assert.equal(typeof globalThis.document, 'undefined');

// Branché en V273 (D2 : 78e script de démarrage) : chargé avant navigation-controller.js (qui le connecte à son stockage)
// et précaché dans le shell obligatoire de sw.js, une seule fois. Aucun autre fichier servi ne le charge.
const indexHtml = read('index.html'), swJs = read('sw.js');
assert.equal(indexHtml.split("'./runner-behavior.js'").length - 1, 1, 'index.html charge le module une seule fois');
assert.match(indexHtml, /'\.\/route-polish\.js','\.\/runner-behavior\.js','\.\/navigation-controller\.js'/, 'chargé juste avant navigation-controller.js');
assert.equal(swJs.split('"./runner-behavior.js"').length - 1, 1, 'sw.js précache le module une seule fois');
assert.ok(swJs.indexOf('"./runner-behavior.js"') < swJs.indexOf('const OPTIONAL_SHELL'), 'shell obligatoire, pas facultatif');
assert.ok(!/runner-behavior\.js/.test(read('runner-visual.js')), 'Runner (présentation) ne charge ni ne connaît le module de comportement');
assert.ok(fs.readdirSync(ROOT).includes(FILE));
// V276 : la couche « métier » pure (signature, remarques, point du jour) ajoute ~6,4 Kio ; plafonds révisés de 40 à 48 Kio
// et de 12 à 14 Kio gzip (même niveau que runner-visual.js). Une décision de budget explicite, pas une dérive.
assert.ok(Buffer.byteLength(source) < 48 * 1024, 'taille du module bornée (' + Buffer.byteLength(source) + ' o)');
assert.ok(require('zlib').gzipSync(source).length < 14 * 1024, 'taille gzip bornée');

/* 2. Contrat de personnalité : des données -------------------------------------------------- */
assert.deepEqual(Object.keys(B.PERSONALITIES), ['copilote', 'complice', 'coach', 'taquin', 'discret']);
assert.equal(B.DEFAULT_PERSONALITY, 'copilote');
assert.equal(B.STORAGE_KEY, 'store-runner-runner-v1');
assert.ok(Object.isFrozen(B.PERSONALITIES) && Object.isFrozen(B.PERSONALITIES.coach.reactions['tour.finished'].copy) && Object.isFrozen(B.CONFIG) && Object.isFrozen(B.CONFIG.touchLadder) && Object.isFrozen(B.REACTIONS));
assert.throws(() => { B.PERSONALITIES.coach.label = 'x'; }, TypeError, 'données gelées');
assert.throws(() => { B.CONFIG.absenceDays = 1; }, TypeError);
for (const p of Object.values(B.PERSONALITIES)) {
  assert.equal(B.PERSONALITIES[p.id], p);
  for (const k of ['label', 'blurb', 'tone']) assert.ok(typeof p[k] === 'string' && p[k].length > 2, p.id + '.' + k);
  assert.ok([0, 1, 2].includes(p.proactivity), p.id + ' proactivité 0-2');
  assert.ok(Number.isInteger(p.textBudgetPerDay) && p.textBudgetPerDay >= 0 && typeof p.idle === 'boolean');
  for (const surface of ['planning', 'assistant']) for (const state of ['analyzing', 'alert', 'success']) {
    const t = p.titles[surface][state];
    assert.ok(typeof t === 'string' && t.length > 1 && t.length <= 60, p.id + ' titre ' + surface + '.' + state);
    assert.equal(B.title(p.id, surface, state), t);
  }
  for (const id of Object.keys(p.reactions)) assert.ok(ids.includes(id), p.id + ' : réaction inconnue ' + id);
}
// Discret : presque muet, sans idle, sans proactivité ; seules deux réactions lui sont permises.
const discret = B.PERSONALITIES.discret;
assert.deepEqual([discret.proactivity, discret.textBudgetPerDay, discret.idle], [0, 0, false]);
assert.deepEqual(Object.keys(discret.reactions).sort(), ['personality.changed', 'tour.finished']);
assert.deepEqual(discret.reactions['tour.finished'].copy, []);
// Les cinq voix diffèrent réellement (volume, proactivité, réactions permises, titres), sans dépendre des mots.
const profile = p => json([p.proactivity, p.textBudgetPerDay, p.idle, Object.keys(p.reactions).sort(), p.titles]);
assert.equal(new Set(Object.values(B.PERSONALITIES).map(profile)).size, 5);
assert.equal(new Set(Object.values(B.PERSONALITIES).map(p => p.titles.planning.success)).size, 5);
assert.ok(B.PERSONALITIES.copilote.textBudgetPerDay < B.PERSONALITIES.coach.textBudgetPerDay && B.PERSONALITIES.copilote.proactivity < B.PERSONALITIES.coach.proactivity);
// Copilote = comportement V271 : les titres du module sont exactement les titres que les hôtes gardent en repli.
const planningSrc = read('planning-ui-fixes.js'), assistantSrc = read('assistant-upgrade.js');
for (const state of ['analyzing', 'alert', 'success']) {
  assert.ok(planningSrc.includes("behaviorTitle('" + state + "','" + B.PERSONALITIES.copilote.titles.planning[state] + "')"), 'Copilote reprend le titre Planning V271 : ' + state);
  assert.ok(assistantSrc.includes("title:'" + B.PERSONALITIES.copilote.titles.assistant[state] + "'"), 'Copilote reprend le titre Assistant V271 : ' + state);
}
// Taquin : l'humour reste sur les erreurs techniques ; une contrainte métier du Planning garde un titre clair.
assert.equal(B.title('taquin', 'planning', 'alert'), B.title('copilote', 'planning', 'alert'), 'alerte métier du Planning : jamais plaisantée');
assert.notEqual(B.title('taquin', 'assistant', 'alert'), B.title('copilote', 'assistant', 'alert'), 'erreur technique de l’Assistant : pointe permise');
for (const p of Object.values(B.PERSONALITIES)) assert.equal(p.titles.planning.alert.length <= 30, true, p.id + ' : titre d’alerte métier court et clair');
assert.equal(B.title('copilote', 'planning', 'neutral'), null, 'le titre neutre appartient à l’hôte');
assert.equal(B.title('copilote', 'home', 'alert'), null);
assert.equal(B.title('inconnue', 'planning', 'alert'), B.title('copilote', 'planning', 'alert'), 'personnalité inconnue : Copilote');
assert.deepEqual(B.listPersonalities().map(p => p.id), Object.keys(B.PERSONALITIES));
assert.ok(B.listPersonalities().every(p => !('reactions' in p) && !('titles' in p)) && Object.isFrozen(B.listPersonalities()));

/* 3. Lint de copy (invariants, jamais de chaînes figées) ------------------------------------- */
const WORST = { done: 99, total: 99, days: 99, lastVisit: 99, label: 'L'.repeat(B.CONFIG.labelMaxChars), reason: 'R'.repeat(B.CONFIG.reasonMaxChars) };
const REQUIRED = { 'tour.finished': ['done', 'total'], 'attention.notice': ['label'], 'welcome.back': ['days'], 'day.ready': ['total'], 'day.empty': [], 'personality.changed': [], 'home.return': [], 'touch.runner': [] };
const BANNED = /optimal|optimis|meilleur|urgent|\bvite\b|dépêche|culpabil|enfin|retard !/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const PLACEHOLDER = /\{([A-Za-z]+)(?::([a-zà-ÿ]+))?\}/g;
for (const p of Object.values(B.PERSONALITIES)) for (const [rid, entry] of Object.entries(p.reactions)) {
  assert.ok(Array.isArray(entry.copy));
  const withText = entry.copy.length > 0;
  if (withText && p.id !== 'discret') assert.ok(entry.copy.length >= 2, p.id + '/' + rid + ' : au moins deux variantes');
  let resolvable = 0;
  for (const tpl of entry.copy) {
    const where = p.id + '/' + rid + ' « ' + tpl + ' »';
    for (const m of tpl.matchAll(PLACEHOLDER)) assert.ok(m[1] in WORST, where + ' : fait inconnu ' + m[1]);
    const text = tpl.replace(PLACEHOLDER, (m, k, w) => (w ? WORST[k] + ' ' + w + 's' : WORST[k]));
    assert.ok(text.length <= 90, where + ' : ' + text.length + ' caractères');
    assert.ok((text.match(/!/g) || []).length <= 1, where + ' : un seul « ! »');
    assert.doesNotMatch(text, EMOJI, where);
    assert.doesNotMatch(text, BANNED, where + ' : mot interdit');
    assert.doesNotMatch(text, /\bvous\b|\bvotre\b|\bvos\b/i, where + ' : tutoiement');
    assert.doesNotMatch(text, /\s{2}|^\s|\s$/, where + ' : espaces');
    assert.match(text, /[.!?…]$/, where + ' : ponctuation finale');
    if ([...tpl.matchAll(PLACEHOLDER)].every(m => REQUIRED[rid].includes(m[1]))) resolvable++;
  }
  if (withText && p.id !== 'discret') assert.ok(resolvable >= 2, p.id + '/' + rid + ' : au moins deux variantes sans fait facultatif');
}
for (const p of Object.values(B.PERSONALITIES)) for (const s of Object.values(p.titles)) for (const t of Object.values(s)) {
  assert.doesNotMatch(t, BANNED); assert.doesNotMatch(t, EMOJI); assert.ok((t.match(/!/g) || []).length <= 1);
}

/* 4. Portes d'entrée : l'état métier, les blocages et les entrées invalides ---------------- */
const FULL = { tour: TOUR_DONE, attention: ATT('s1'), workday: true, mode: 'today', lastVisitDaysAgo: 6, returnFrom: 'planPanel' };
const R0 = registry('coach', { lastActiveDate: '2026-09-20' });
assert.ok(B.decide(mk({ facts: FULL }), R0), 'témoin : cette entrée produit bien une réaction');
for (const state of ['analyzing', 'alert', 'success', 'inconnu', '', null, undefined, 3]) for (const trigger of ['arrive', 'rerender', 'touch', 'personality']) for (const surface of ['home', 'sheet']) {
  assert.equal(B.decide(mk({ surface, trigger, view: { state }, facts: FULL }), R0), null, 'jamais d’ambiant hors état neutral : ' + String(state) + '/' + trigger + '/' + surface);
}
assert.equal(B.decide(Object.assign(mk({ facts: FULL }), { view: {} }), R0), null, 'état absent = fermé');
assert.equal(B.decide({ surface: 'home', trigger: 'arrive', now: NOW, facts: { date: D } }, R0), null, 'vue absente = fermé');
// V276 : la bannière de mise à jour ne fait taire que le décoratif (la tournée terminée, fait métier, passe : voir runner-intelligence-v276)
for (const flag of ['keyboard', 'firstRun', 'updating', 'overlay']) assert.equal(B.decide(mk({ view: { state: 'neutral', [flag]: true }, facts: flag === 'updating' ? Object.assign({}, FULL, { tour: null }) : FULL }), R0), null, 'bloqué : ' + flag);
assert.ok(B.decide(mk({ surface: 'sheet', trigger: 'personality', view: { state: 'neutral', overlay: true } }), R0), 'la sheet est elle-même une surface en overlay');
assert.equal(B.decide(mk({ surface: 'sheet', trigger: 'personality', view: { state: 'neutral', keyboard: true } }), R0), null);
for (const surface of ['planning', 'assistant']) for (const trigger of ['arrive', 'rerender', 'touch', 'personality']) assert.equal(B.decide(mk({ surface, trigger, facts: FULL }), R0), null, surface + ' : aucune réaction ambiante en V273');
for (const bad of [null, undefined, 42, 'x', [], {}, { surface: 'home' }, mk({ surface: 'ailleurs' }), mk({ trigger: 'tap' }), mk({ now: NaN }), mk({ now: '12' }), mk({ now: Infinity })])
  assert.doesNotThrow(() => assert.equal(B.decide(bad, R0), null));
const NO_RETURN = Object.assign({}, FULL); delete NO_RETURN.returnFrom;
assert.equal(B.decide(mk({ facts: Object.assign({}, NO_RETURN, { date: '2026-13-01' }) }), R0), null, 'date invalide : aucun ambiant');
assert.equal(B.decide(mk({ facts: Object.assign({}, NO_RETURN, { date: '2026-02-30' }) }), R0), null);
assert.equal(B.decide(mk({ facts: Object.assign({}, FULL, { date: 'x' }) }), R0).id, 'home.return', 'le geste de retour n’a pas besoin de date');
assert.equal(B.decide({ surface: 'home', trigger: 'arrive', now: NOW, view: { state: 'neutral' }, facts: {} }, R0), null, 'sans date : aucun ambiant');
assert.equal(B.decide(mk({ facts: { tour: { total: 'x', done: 1.5, finished: true } } }), registry()), null, 'tournée invalide ignorée');
assert.equal(B.decide(mk({ facts: { attention: { kind: 'autre', key: 'a', label: 'b' } } }), registry('coach')), null, 'genre d’attention inconnu ignoré');
assert.equal(B.decide(mk({ facts: { attention: { kind: 'late', key: '', label: 'b' } } }), registry('coach')), null);
const trap = { get surface() { throw new Error('piégé'); } };
assert.doesNotThrow(() => assert.equal(B.decide(trap, R0), null), 'une entrée hostile ne lève jamais');
assert.doesNotThrow(() => B.decide(mk({ facts: FULL }), { get personality() { throw new Error('piégé'); } }));

/* 5. Priorité : une seule réaction gagnante, ordre des poids ------------------------------- */
assert.deepEqual(ids, ['personality.changed', 'tour.finished', 'attention.notice', 'welcome.back', 'day.ready', 'day.empty', 'home.return', 'touch.runner']);
assert.ok(B.REACTIONS.every(r => ['ambient', 'presence', 'social', 'user', 'business'].includes(r.kind)), 'V276 : la famille « business » (métier) s’ajoute aux réactions décoratives');
const ambientWeights = B.REACTIONS.filter(r => r.kind === 'ambient').map(r => r.weight);
assert.deepEqual(ambientWeights, ambientWeights.slice().sort((a, b) => b - a), 'poids décroissants dans l’ordre du catalogue');
{
  let r = registry('coach', { lastActiveDate: '2026-09-20' }), seq = [];
  const facts = { tour: TOUR_DONE, attention: ATT('s1'), workday: true, mode: 'today', lastVisitDaysAgo: 6 };
  for (let i = 0; i < 5; i++) { const s = step(r, { facts, now: NOW + i * H }, FREE); assert.ok(!Array.isArray(s.x)); seq.push(s.x && s.x.id); r = s.r; }
  assert.deepEqual(seq, ['tour.finished', 'attention.notice', 'welcome.back', null, null], 'un gagnant à la fois, du plus fort au plus faible, puis le budget ferme');
  // Copilote : budget de 2 textes DÉCORATIFS ; la tournée terminée (fait métier, V276) n'en consomme aucun,
  // donc attention + retour passent, et la troisième réaction décorative est refusée.
  r = registry('copilote', { lastActiveDate: '2026-09-20' }); seq = [];
  for (let i = 0; i < 4; i++) { const s = step(r, { facts, now: NOW + i * H }, FREE); seq.push(s.x && s.x.id); r = s.r; }
  assert.deepEqual(seq, ['tour.finished', 'attention.notice', 'welcome.back', null], 'budget Copilote : 2 textes décoratifs par jour, hors fait métier');
}
{ // welcome.back absorbe day.ready : un seul message, et day.ready ne revient pas le même jour.
  let r = registry('coach', { lastActiveDate: '2026-09-20' });
  const facts = { tour: TOUR_READY, workday: true, mode: 'today' };
  const a = step(r, { facts }, FREE); assert.equal(a.x.id, 'welcome.back');
  assert.ok(B.decide(mk({ facts, now: NOW + H }), a.r, FREE) === null, 'day.ready est absorbé');
  assert.equal(B.decide(mk({ facts: Object.assign({}, facts, { date: iso(6) }), now: NOW + 25 * H }), a.r, FREE).id, 'day.ready', 'le lendemain, il revient');
}
{ // home.return est le plus faible des ambiants : un texte du jour le remplace ; seul, il joue son geste.
  const r = registry('copilote');
  const empty = B.decide(mk({ facts: { workday: true, mode: 'today', returnFrom: 'planPanel' } }), r);
  assert.equal(empty.id, 'day.empty');
  const only = B.decide(mk({ facts: { tour: TOUR_RUN, returnFrom: 'planPanel' } }), r);
  assert.deepEqual([only.id, only.gesture, only.text, only.state, only.messageMs], ['home.return', 'settle', null, 'neutral', 0]);
}
{ // descripteur : forme, silence, état de réussite de la tournée
  const x = B.decide(mk({ facts: { tour: TOUR_DONE } }), registry('coach'));
  assert.deepEqual([x.id, x.kind, x.surface, x.personality, x.state, x.silent, x.messageMs], ['tour.finished', 'business', 'home', 'coach', 'success', true, B.CONFIG.messageMs]);
  assert.ok(B.PERSONALITIES.coach.reactions['tour.finished'].copy.some(t => t.replace(PLACEHOLDER, (m, k) => ({ done: 3, total: 3 })[k]) === x.text), 'texte issu des données + faits');
  assert.equal(typeof B.decide(mk({ facts: { tour: TOUR_READY, workday: true, mode: 'today' } }), registry('copilote')).text, 'string', 'Copilote : une ligne courte pour day.ready (D6)');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_READY, workday: true, mode: 'today' } }), registry('copilote')).gesture, 'lookToward');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_READY, workday: true, mode: 'today', afterHours: true } }), registry('coach')), null, 'après 20 h : pas de journée prête');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_READY, workday: false, mode: 'today' } }), registry('coach')), null, 'jour non travaillé : rien');
  assert.equal(B.decide(mk({ facts: { workday: false, mode: 'today' } }), registry('coach')), null, 'jour vide non travaillé : rien');
  assert.equal(B.decide(mk({ facts: { workday: true, mode: 'next' } }), registry('coach')), null, 'une journée suivante existe : pas de jour vide');
  assert.equal(B.decide(mk({ facts: { workday: true, mode: 'today', busy: true } }), registry('coach')), null, 'génération en cours : pas de jour vide');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_RUN, workday: true, mode: 'today' } }), registry('coach')), null, 'tournée commencée : ni prête ni vide');
}

/* 6. Déterminisme et aucune mutation -------------------------------------------------------- */
{
  const input = deepFreeze(mk({ facts: Object.assign({}, FULL) })), r = deepFreeze(registry('coach', { lastActiveDate: '2026-09-20' }));
  const before = json([input, r]);
  const first = B.decide(input, r);
  for (let i = 0; i < 25; i++) assert.equal(json(B.decide(input, r)), json(first), 'même entrée, même sortie');
  assert.equal(json([input, r]), before, 'decide ne modifie rien');
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.meta));
  assert.throws(() => { first.text = 'x'; }, TypeError);
  const shuffled = { facts: { returnFrom: 'planPanel', lastVisitDaysAgo: 6, mode: 'today', workday: true, attention: ATT('s1'), tour: TOUR_DONE, date: D }, view: { state: 'neutral' }, now: NOW, trigger: 'arrive', surface: 'home' };
  assert.equal(json(B.decide(shuffled, r)), json(first), 'indépendant de l’ordre des clés');
  for (const f of [() => B.record(r, first, { now: NOW, date: D }), () => B.touch(r, { now: NOW, date: D }), () => B.setPersonality(r, 'discret'), () => B.serializeRegistry(r), () => B.normalizeRegistry(r)])
    assert.doesNotThrow(f, 'les fonctions publiques acceptent des arguments gelés');
  // Objets ordinaires, NON gelés : un décideur qui écrirait dans ses arguments serait pris ici.
  const rawReg = { v: 1, personality: 'coach', lastActiveDate: '2026-09-20', shown: { a: { d: D, t: 1 } }, variant: {}, session: { touches: [NOW - 1000] } };
  const rawIn = mk({ facts: Object.assign({}, FULL, { tour: Object.assign({}, TOUR_DONE), attention: Object.assign({}, ATT('s1')) }) });
  const snap = json([rawReg, rawIn]);
  const rawFirst = B.decide(rawIn, rawReg);
  assert.ok(rawFirst); assert.equal(json([rawReg, rawIn]), snap, 'decide ne modifie ni l’entrée ni le registre ordinaires');
  B.record(rawReg, rawFirst, { now: NOW, date: D }); B.touch(rawReg, { now: NOW, date: D }); B.setPersonality(rawReg, 'discret'); B.serializeRegistry(rawReg, { now: NOW, date: D }); B.normalizeRegistry(rawReg, { now: NOW, date: D }); B.title('coach', 'planning', 'alert');
  assert.equal(json([rawReg, rawIn]), snap, 'aucune fonction publique ne modifie ses arguments ordinaires');
  assert.equal(json(B.decide(rawIn, rawReg)), json(rawFirst), 'et le résultat reste identique');
  const rec = B.record(r, first, { now: NOW, date: D });
  assert.notEqual(rec.registry, r); assert.ok(Object.isFrozen(rec.registry) && Object.isFrozen(rec.registry.shown) && Object.isFrozen(rec.registry.session));
  assert.equal(json([input, r]), before, 'record ne modifie pas non plus son entrée');
}

/* 7. Cooldowns, budgets, dates locales ------------------------------------------------------- */
{ // tour.finished : une fois par date locale ; minuit.
  let r = registry('coach'), s = step(r, { facts: { tour: TOUR_DONE }, now: Date.UTC(2026, 9, 5, 21, 55) }); assert.equal(s.x.id, 'tour.finished'); assert.ok(s.dirty); assert.ok(s.x.text);
  assert.equal(B.decide(mk({ facts: { tour: TOUR_DONE }, now: Date.UTC(2026, 9, 5, 21, 56) }), s.r), null, 'même date : une seule fois');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_DONE, date: iso(6) }, now: Date.UTC(2026, 9, 5, 22, 10) }), s.r).id, 'tour.finished', 'minuit passé et écart respecté : de nouveau permis');
  const early = B.decide(mk({ facts: { tour: TOUR_DONE, date: iso(6) }, now: Date.UTC(2026, 9, 5, 22, 0) }), s.r);
  // V276 : l'écart de texte est un cooldown DÉCORATIF ; un fait métier (tournée terminée) ne s'y heurte plus.
  assert.deepEqual([early.id, early.state, early.meta.textCounted], ['tour.finished', 'success', false]);
  assert.ok(early.text, 'le texte du fait métier est conservé malgré l’écart décoratif');
  const rec = B.record(s.r, early, { now: Date.UTC(2026, 9, 5, 22, 0), date: iso(6) });
  assert.deepEqual(rec.registry.textDay, { date: null, n: 0 }, 'un texte métier ne compte jamais dans le budget décoratif du jour');
  assert.equal(rec.registry.lastTextAt, s.r.lastTextAt, 'ni dans l’écart de texte décoratif');
}
{ // budget par personnalité, remise à zéro à la date suivante
  const facts = { tour: TOUR_DONE, attention: ATT('s1'), lastVisitDaysAgo: 3 };
  let r = registry('coach', { lastActiveDate: '2026-09-01' });
  for (const rid of ['tour.finished', 'attention.notice', 'welcome.back']) { const s = step(r, { facts }, FREE); assert.equal(s.x.id, rid); r = s.r; }
  assert.deepEqual([r.textDay.date, r.textDay.n], [D, 2], 'V276 : la tournée terminée (fait métier) ne compte pas dans le budget décoratif');
  const third = step(r, { facts: { attention: ATT('s2') } }, FREE); assert.equal(third.x.id, 'attention.notice'); r = third.r;
  assert.equal(r.textDay.n, 3);
  assert.equal(step(r, { facts: { workday: true, mode: 'today' } }, FREE).x, null, 'quatrième texte décoratif refusé');
  const next = step(r, { facts: { attention: ATT('s3'), date: iso(6) }, now: NOW + 24 * H }, FREE);
  assert.equal(next.x.id, 'attention.notice', 'nouveau jour, nouveau budget'); assert.equal(next.r.textDay.n, 1);
}
{ // Discret : jamais de texte ambiant, jamais de geste ambiant ; la tournée terminée reste un état sans texte
  const facts = Object.assign({}, FULL, { tour: TOUR_DONE });
  const r = registry('discret', { lastActiveDate: '2026-09-01' });
  const x = B.decide(mk({ facts }), r, FREE);
  assert.deepEqual([x.id, x.text, x.gesture, x.state], ['tour.finished', null, null, 'success']);
  const after = step(r, { facts }, FREE).r;
  assert.equal(B.decide(mk({ facts, now: NOW + H }), after, FREE), null, 'plus rien après');
  for (const f of [{ workday: true, mode: 'today' }, { tour: TOUR_READY, workday: true, mode: 'today' }, { attention: ATT('s9') }, { returnFrom: 'planPanel' }])
    assert.equal(B.decide(mk({ facts: f }), r, FREE), null, 'Discret ne réagit pas : ' + json(Object.keys(f)));
  assert.equal(B.decide(mk({ facts: { date: D }, now: NOW }), registry('discret', { lastActiveDate: '2026-08-01' }), FREE), null, 'pas de bienvenue');
  assert.equal(B.decide(mk({ trigger: 'touch' }), r, FREE), null, 'pas de toucher');
  assert.equal(B.listPersonalities().find(p => p.id === 'discret').idle, false);
}
{ // écart entre deux textes décoratifs, bornes exactes (V276 : la tournée terminée, fait métier, ne l'ouvre ni ne le subit)
  const facts = { attention: ATT('s1') };
  const a = step(registry('coach'), { facts: { workday: true, mode: 'today' } });
  assert.equal(a.x.id, 'day.empty');
  for (const [dt, expect] of [[5000, null], [10 * MIN - 1, null], [10 * MIN, 'attention.notice']]) {
    const x = B.decide(mk({ facts, now: NOW + dt }), a.r); assert.equal(x && x.id, expect, 'écart de texte ' + dt);
  }
  assert.equal(B.decide(mk({ facts, now: NOW + 5000 }), a.r, cfg('textGapMs', 0)).id, 'attention.notice', 'seuil piloté par CONFIG');
}
{ // navigation rapide : garde d'arrivée de 3 s
  const a = step(registry('coach'), { facts: { workday: true, mode: 'today' } }); assert.equal(a.x.id, 'day.empty');
  const f = { facts: { attention: ATT('s1') } };
  assert.equal(B.decide(mk(Object.assign({ now: NOW + 2999 }, f)), a.r, cfg('textGapMs', 0)), null);
  assert.equal(B.decide(mk(Object.assign({ now: NOW + 3000 }, f)), a.r, cfg('textGapMs', 0)).id, 'attention.notice');
  assert.equal(B.decide(mk(Object.assign({ now: NOW + 1000 }, f)), a.r, cfg('arrivalGuardMs', 0, { textGapMs: 0 })).id, 'attention.notice');
  assert.ok(B.decide(mk({ surface: 'sheet', trigger: 'personality', now: NOW + 1000 }), a.r), 'la garde ne concerne pas les actions de l’utilisateur');
}
{ // écart entre deux gestes ambiants : le geste cède, le texte reste
  let r = registry('coach'); const a = step(r, { facts: { attention: ATT('s1'), workday: true, mode: 'today' } }, { config: { textGapMs: 0, arrivalGuardMs: 0 } });
  assert.equal(a.x.id, 'attention.notice'); assert.equal(a.x.gesture, 'lookToward');
  const b = B.decide(mk({ facts: { attention: ATT('s1'), workday: true, mode: 'today' }, now: NOW + 5000 }), a.r, { config: { textGapMs: 0, arrivalGuardMs: 0 } });
  assert.deepEqual([b.id, b.gesture, b.look, b.gestureMs, typeof b.text], ['day.empty', null, null, 0, 'string'], 'geste supprimé, texte conservé');
  const c = B.decide(mk({ facts: { attention: ATT('s2') }, now: NOW + 20000 }), a.r, { config: { textGapMs: 0, arrivalGuardMs: 0 } });
  assert.equal(c.gesture, 'lookToward', 'après 20 s le geste revient');
  assert.equal(B.decide(mk({ facts: { attention: ATT('s2') }, now: NOW + 5000 }), a.r, cfg('gestureGapMs', 0, { textGapMs: 0, arrivalGuardMs: 0 })).gesture, 'lookToward');
}
{ // attention : un magasin tous les N jours, plafond quotidien selon la personnalité, disparition du fait
  let r = registry('copilote'), s = step(r, { facts: { attention: ATT('s1') } }, FREE); assert.equal(s.x.id, 'attention.notice'); assert.equal(s.x.meta.key, 'attention:s1');
  assert.equal(B.decide(mk({ facts: { attention: ATT('s2') }, now: NOW + H }), s.r, FREE), null, 'Copilote : une attention par jour');
  assert.equal(B.decide(mk({ facts: { attention: ATT('s1'), date: iso(7) }, now: NOW + 50 * H }), s.r, FREE), null, 'même magasin : pas avant 3 jours');
  assert.equal(B.decide(mk({ facts: { attention: ATT('s1'), date: iso(8) }, now: NOW + 72 * H }), s.r, FREE).id, 'attention.notice');
  assert.equal(B.decide(mk({ facts: { attention: ATT('s1'), date: iso(6) }, now: NOW + 24 * H }), s.r, cfg('attentionRepeatDays', 1, FREE.config)).id, 'attention.notice', 'seuil piloté par CONFIG');
  assert.equal(B.decide(mk({ facts: { date: iso(8) }, now: NOW + 72 * H }), s.r, FREE), null, 'le fait a disparu : rien');
  r = registry('coach'); let seq = [];
  for (const k of ['s1', 's2', 's3']) { const t = step(r, { facts: { attention: ATT(k) }, now: NOW + seq.length * H }, FREE); seq.push(t.x && t.x.meta.key); r = t.r; }
  assert.deepEqual(seq, ['attention:s1', 'attention:s2', null], 'Coach : deux par jour');
  assert.equal(step(registry('coach'), { facts: { attention: ATT('s2') } }, cfg('attentionMaxPerDay', 1, FREE.config)).x.id, 'attention.notice');
  const capped = step(step(registry('coach'), { facts: { attention: ATT('s1') } }, cfg('attentionMaxPerDay', 1, FREE.config)).r, { facts: { attention: ATT('s2') }, now: NOW + H }, cfg('attentionMaxPerDay', 1, FREE.config));
  assert.equal(capped.x, null, 'plafond global piloté par CONFIG');
}

/* 8. Absence et retour ---------------------------------------------------------------------- */
{
  const at = (last, date, options) => B.decide(mk({ facts: { date }, now: Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 9) }), registry('coach', { lastActiveDate: last }), options);
  assert.equal(at('2026-10-01', D), null, '4 jours : pas encore'); assert.equal(at('2026-09-30', D).id, 'welcome.back', '5 jours');
  assert.equal(at('2026-10-02', D, cfg('absenceDays', 3)).id, 'welcome.back', 'seuil piloté par CONFIG');
  assert.equal(at('2028-02-27', '2028-03-02'), null, 'année bissextile : 4 jours'); assert.equal(at('2028-02-27', '2028-03-03').id, 'welcome.back');
  assert.equal(at('2027-02-27', '2027-03-03'), null, 'année ordinaire : 4 jours'); assert.equal(at('2027-02-27', '2027-03-04').id, 'welcome.back');
  assert.equal(at('2026-12-28', '2027-01-02').id, 'welcome.back', 'passage d’année');
  assert.equal(at('2026-10-20', '2026-10-25').id, 'welcome.back', 'changement d’heure d’automne : les dates, pas les heures');
  assert.equal(at('2026-03-25', '2026-03-30').id, 'welcome.back', 'changement d’heure de printemps');
  assert.equal(at('2026-10-10', D), null, 'date de dernière activité dans le futur : jamais d’absence');
  assert.equal(B.decide(mk({ facts: { date: D } }), registry('coach')), null, 'première utilisation : pas de bienvenue');
}
{ // une fois par absence ; touch avant decide (autre écran), expiration, écriture limitée
  const r0 = registry('coach', { lastActiveDate: '2026-09-28' });
  const t1 = B.touch(r0, { now: NOW, date: D }); assert.ok(t1.dirty); assert.deepEqual(t1.registry.welcome, { date: D, days: 7 }); assert.equal(t1.registry.lastActiveDate, D);
  const x = B.decide(mk({ facts: { date: D, lastVisitDaysAgo: 6 }, now: NOW + MIN }), t1.registry); assert.equal(x.id, 'welcome.back', 'l’absence survit au passage par un autre écran');
  const t2 = B.touch(t1.registry, { now: NOW + 5 * MIN, date: D }); assert.equal(t2.dirty, false); assert.deepEqual(t2.registry.welcome, t1.registry.welcome);
  const rec = B.record(t1.registry, x, { now: NOW + MIN, date: D }); assert.equal(rec.registry.welcome, null); assert.ok(rec.dirty);
  assert.equal(B.decide(mk({ facts: { date: D }, now: NOW + 2 * H }), rec.registry), null, 'déjà saluée');
  assert.equal(B.decide(mk({ facts: { date: iso(6) }, now: NOW + 26 * H }), t1.registry), null, 'le lendemain : l’occasion est passée');
  assert.equal(B.normalizeRegistry(t1.registry, { now: NOW + 26 * H, date: iso(6) }).welcome, null);
  assert.equal(B.touch(r0, { now: NOW, date: 'pas une date' }).dirty, false); assert.equal(B.touch(r0, { now: 'x', date: D }).dirty, false);
  const same = B.touch(rec.registry, { now: NOW + 40 * MIN, date: D }); assert.equal(same.dirty, true, 'écriture après 30 minutes');
  assert.equal(B.touch(rec.registry, { now: NOW + 10 * MIN, date: D }).dirty, false);
  assert.equal(B.touch(rec.registry, { now: NOW + 10 * MIN, date: D }, cfg('activeWriteGapMs', 1000)).dirty, true, 'seuil piloté par CONFIG');
  assert.equal(B.touch(rec.registry, { now: NOW + MIN, date: iso(6) }).dirty, true, 'nouveau jour');
}

/* 9. Textes : gabarits, pluriels, rotation, répétition -------------------------------------- */
const custom = (reactions, extra) => ({ personalities: { copilote: Object.assign({ id: 'copilote', label: 'T', blurb: '', tone: 't', proactivity: 1, textBudgetPerDay: 99, idle: true, titles: {}, reactions }, extra || {}) }, config: { textGapMs: 0, arrivalGuardMs: 0, gestureGapMs: 0 } });
{
  const o = custom({ 'welcome.back': { copy: ['il y a {lastVisit:jour} ({days})'] } });
  const r = registry(null, { lastActiveDate: '2026-09-29' });
  assert.equal(B.decide(mk({ facts: { date: D, lastVisitDaysAgo: 1 } }), r, o).text, 'il y a 1 jour (6)', 'pluriel et faits');
  assert.equal(B.decide(mk({ facts: { date: D, lastVisitDaysAgo: 6 } }), r, o).text, 'il y a 6 jours (6)');
  assert.equal(B.decide(mk({ facts: { date: D, lastVisitDaysAgo: 0 } }), r, o).text, 'il y a 0 jour (6)');
  assert.equal(B.decide(mk({ facts: { date: D } }), r, o), null, 'fait manquant : variante inutilisable, aucune réaction');
  const bad = custom({ 'day.empty': { copy: ['{inconnu}'] } });
  assert.equal(B.decide(mk({ facts: { workday: true, mode: 'today' } }), registry(), bad), null, 'fait non fourni : jamais de gabarit brut affiché');
}
{ // rotation déterministe sans dépendre du contenu
  const o = custom({ 'day.empty': { copy: ['A', 'B', 'C'] } });
  const run = () => { let r = registry(), out = []; for (let d = 5; d <= 12; d++) { const s = step(r, { facts: { date: iso(d), workday: true, mode: 'today' }, now: NOW + (d - 5) * 24 * H }, o); out.push(s.x.meta.variantIndex); r = s.r; } return out; };
  const a = run(); assert.deepEqual(run(), a, 'déterministe');
  assert.ok(a[0] >= 0 && a[0] <= 2);
  for (let i = 1; i < a.length; i++) { assert.notEqual(a[i], a[i - 1], 'jamais deux fois la même d’affilée'); assert.equal(a[i], (a[i - 1] + 1) % 3, 'rotation cyclique'); }
  const two = custom({ 'day.empty': { copy: ['A', 'B'] } });
  let r = registry(), prev = null;
  for (let d = 5; d <= 12; d++) { const s = step(r, { facts: { date: iso(d), workday: true, mode: 'today' }, now: NOW + (d - 5) * 24 * H }, two); assert.notEqual(s.x.text, prev); prev = s.x.text; r = s.r; }
  const shrunk = custom({ 'day.empty': { copy: ['A'] } });
  const withHistory = B.normalizeRegistry({ v: 1, variant: { 'day.empty': { i: 7, t: 1 } } });
  assert.equal(B.decide(mk({ facts: { workday: true, mode: 'today' } }), withHistory, shrunk).text, 'A', 'index mémorisé hors liste : on repart du hachage');
}
{ // variante unique : pas réaffichée dans la fenêtre de répétition
  const o = custom({ 'day.empty': { copy: ['Seule'] } });
  const a = step(registry(), { facts: { workday: true, mode: 'today' } }, o); assert.equal(a.x.text, 'Seule');
  const f = h => mk({ facts: { date: iso(6), workday: true, mode: 'today' }, now: NOW + h * H });
  assert.equal(B.decide(f(20), a.r, o), null, 'moins de 24 h : pas deux fois le même texte');
  assert.equal(B.decide(f(25), a.r, o).text, 'Seule');
  assert.equal(B.decide(f(20), a.r, Object.assign({}, o, { config: Object.assign({}, o.config, cfg('repeatWindowMs', 0).config) })).text, 'Seule', 'seuil piloté par CONFIG');
}
{ // les noms et les textes des fournisseurs sont bornés et nettoyés
  const o = custom({ 'attention.notice': { copy: ['{label} / {reason}'] } });
  const att = (label, reason) => ({ kind: 'late', key: 'k', label, reason });
  const t = (label, reason, options) => B.decide(mk({ facts: { attention: att(label, reason) } }), registry(), options || o).text;
  assert.equal(t('Darty\n\tMetz\u0007  Nord', 'a\u0000b'), 'Darty Metz Nord / a b', 'espaces et contrôles nettoyés');
  assert.equal(Array.from(t('L'.repeat(80), 'x').split(' / ')[0]).length, B.CONFIG.labelMaxChars);
  assert.equal(Array.from(t('😀'.repeat(60), 'x').split(' / ')[0]).length, B.CONFIG.labelMaxChars, 'jamais de caractère coupé en deux');
  assert.equal(t('<img src=x onerror=alert(1)>', 'x').startsWith('<img'), true, 'texte brut : l’hôte l’affiche en textContent');
  assert.equal(t('ABCDEFGHIJ', 'x', Object.assign({}, o, cfg('labelMaxChars', 5))), 'ABCD… / x', 'limite pilotée par CONFIG');
  assert.equal(t('A', 'R'.repeat(50), Object.assign({}, o, cfg('reasonMaxChars', 6))), 'A / RRRRR…');
  assert.equal(B.decide(mk({ facts: { attention: att('A', '   ') } }), registry(), o), null, 'raison vide : variante inutilisable, aucune réaction');
}

/* 10. Toucher et retour ---------------------------------------------------------------------- */
{
  let r = registry('copilote'), g = [];
  const tap = (ms, options) => { const s = step(r, { trigger: 'touch', now: NOW + ms }, options); r = s.r; return s; };
  const a = tap(0); assert.deepEqual([a.x.id, a.x.gesture, a.x.text, a.x.messageMs, a.dirty], ['touch.runner', 'acknowledge', null, 0, false], 'le toucher n’écrit rien de persisté');
  assert.equal(tap(2000).x.gesture, 'nod'); assert.equal(tap(4000).x, null, 'échelle épuisée');
  assert.equal(tap(30000).x.gesture, 'acknowledge', 'nouvelle série'); assert.equal(tap(35000).x, null, 'silence après la dernière réaction permise');
  assert.equal(tap(55000).x, null, 'trois réactions dans la minute'); assert.equal(tap(61000).x.gesture, 'acknowledge', 'la minute passée, de nouveau permis');
  const lone = o => step(registry('copilote'), { trigger: 'touch', now: NOW }, o).x;
  assert.equal(lone(cfg('touchLadder', ['nod'])).gesture, 'nod'); assert.equal(lone(cfg('touchLadder', [])), null);
  assert.equal(lone(cfg('touchLadder', ['faux'])).gesture, 'acknowledge', 'échelle invalide ignorée');
  const twice = (ms, o) => { const s = step(registry('copilote'), { trigger: 'touch', now: NOW }, o); return B.decide(mk({ trigger: 'touch', now: NOW + ms }), s.r, o); };
  assert.equal(twice(2000).gesture, 'nod'); assert.equal(twice(2000, cfg('touchMaxReactions', 1)), null, 'plafond piloté par CONFIG');
  assert.equal(twice(2000, cfg('touchChainMs', 1000)).gesture, 'acknowledge', 'série rompue plus tôt');
  assert.equal(twice(6000, cfg('touchMaxReactions', 1, { touchLockoutMs: 0 })), null, 'un seul toucher par minute');
  assert.equal(twice(6000, cfg('touchWindowMs', 5000, { touchMaxReactions: 1, touchLockoutMs: 0 })).gesture, 'acknowledge', 'fenêtre pilotée par CONFIG : le premier toucher est oublié');
  assert.equal(twice(6000, cfg('touchLockoutMs', 30000, { touchMaxReactions: 1, touchWindowMs: 5000 })), null, 'silence piloté par CONFIG');
  assert.equal(B.decide(mk({ trigger: 'touch', view: { state: 'alert' } }), registry('copilote')), null);
  assert.ok(B.decide(mk({ surface: 'sheet', trigger: 'touch' }), registry('coach')), 'toucher possible depuis la sheet');
}
{
  let r = registry('coach');
  const back = ms => { const s = step(r, { facts: { tour: TOUR_RUN, returnFrom: 'planPanel' }, now: NOW + ms }); r = s.r; return s; };
  for (const ms of [0, 5000, 10000]) assert.equal(back(ms).x.id, 'home.return');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_RUN, returnFrom: 'planPanel' }, now: NOW + 20000 }), r), null, 'rafale : placement direct');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_RUN, returnFrom: 'planPanel' }, now: NOW + 70000 }), r).id, 'home.return', 'la minute passée, le geste revient');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_RUN, returnFrom: 'planPanel' }, now: NOW + 20000 }), r, cfg('returnBurstMax', 99)).id, 'home.return', 'seuil piloté par CONFIG');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_RUN, returnFrom: 'planPanel' }, now: NOW + 20000 }), r, cfg('returnBurstWindowMs', 1000)).id, 'home.return');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_RUN, returnFrom: 'planPanel' } }), registry('discret')), null, 'Discret : placement direct');
  assert.equal(B.decide(mk({ facts: { tour: TOUR_RUN } }), registry('coach')), null, 'pas de retour déclaré : rien');
}

/* 11. Changement de personnalité et aperçu --------------------------------------------------- */
{
  const r0 = registry(); const s = B.setPersonality(r0, 'coach');
  assert.deepEqual([s.dirty, s.registry.personality, r0.personality], [true, 'coach', 'copilote']);
  for (const bad of ['', 'inconnue', null, 3, '__proto__', 'constructor']) { const x = B.setPersonality(r0, bad); assert.deepEqual([x.dirty, x.registry.personality], [false, 'copilote'], 'refusé : ' + String(bad)); }
  assert.equal(B.setPersonality(s.registry, 'coach').dirty, false, 'même personnalité : rien à écrire');
  const prev = (r, ms, o) => B.decide(mk({ surface: 'sheet', trigger: 'personality', now: NOW + ms, facts: {} }), r, o);
  const a = prev(s.registry, 0); assert.deepEqual([a.id, a.kind, a.gesture, a.surface, a.personality], ['personality.changed', 'user', 'acknowledge', 'sheet', 'coach']);
  assert.ok(B.PERSONALITIES.coach.reactions['personality.changed'].copy.includes(a.text), 'l’aperçu parle avec la voix choisie');
  const rec = B.record(s.registry, a, { now: NOW, date: null }); assert.equal(rec.dirty, true);
  assert.equal(prev(rec.registry, 1000), null, 'un aperçu toutes les 2 s'); const b = prev(rec.registry, 2000);
  assert.notEqual(b.text, a.text, 'rotation de l’aperçu'); assert.ok(prev(rec.registry, 0, cfg('previewGapMs', 0)));
  // action de l'utilisateur : ni budget ni écart de texte ; Discret garde sa seule phrase, même répétée
  let d = B.setPersonality(registry(), 'discret').registry, texts = [];
  for (let i = 0; i < 3; i++) { const x = prev(d, i * 3000); texts.push(x.text); d = B.record(d, x, { now: NOW + i * 3000, date: D }).registry; }
  assert.deepEqual(texts, [discret.reactions['personality.changed'].copy[0], discret.reactions['personality.changed'].copy[0], discret.reactions['personality.changed'].copy[0]]);
  const spent = registry('coach', { textDay: { date: D, n: 3 }, lastTextAt: NOW });
  assert.ok(prev(spent, 1000), 'budget épuisé : l’aperçu reste permis');
  assert.equal(B.record(spent, prev(spent, 1000), { now: NOW + 1000, date: D }).registry.textDay.n, 3, 'et ne consomme rien');
}

/* 12. Registre : tolérance, corruption, bornes, sérialisation ------------------------------- */
const assertValid = (reg, label) => {
  assert.equal(reg.v, 1, label); assert.ok(Object.keys(B.PERSONALITIES).includes(reg.personality), label);
  assert.ok(Object.isFrozen(reg) && Object.isFrozen(reg.shown) && Object.isFrozen(reg.session), label);
  for (const k of Object.keys(reg.shown)) assert.match(k, /^[A-Za-z0-9._:-]{1,64}$/);
  for (const k of Object.keys(reg.shown)) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(reg.shown[k].d) && Number.isFinite(reg.shown[k].t), label);
  assert.ok(reg.textDay.n >= 0 && Number.isInteger(reg.textDay.n), label);
  assert.doesNotThrow(() => { B.decide(mk({ facts: FULL }), reg); B.record(reg, B.decide(mk({ facts: FULL }), reg), { now: NOW, date: D }); B.touch(reg, { now: NOW, date: D }); }, label);
  assert.equal(({}).d, undefined); assert.equal(({}).polluted, undefined);
};
{
  const def = B.defaultRegistry();
  assert.deepEqual(json(def), json({ v: 1, personality: 'copilote', lastActiveDate: null, lastActiveAt: null, lastTextAt: null, textDay: { date: null, n: 0 }, shown: {}, variant: {}, welcome: null, session: { lastReaction: {}, lastGestureAt: null, touches: [], touchLockUntil: null, returns: [], lastPreviewAt: null } }));
  assertValid(def, 'défaut');
  const hostile = [null, undefined, '', ' ', 'pas du json', '{"v":', '[]', '123', 'true', 'null', '"x"', [], 42, true, { v: 1, personality: 7 }, { v: 'x' }, '{"v":2,"personality":"coach","shown":{"a":{"d":"2026-10-05","t":1}}}',
    '{"v":1,"shown":[1,2],"variant":"x","textDay":5,"welcome":[]}', 'x'.repeat(20000), '{"v":1,"shown":' + '{"a":'.repeat(500) + '1' + '}'.repeat(500) + '}'];
  for (const raw of hostile) { let reg; assert.doesNotThrow(() => { reg = B.parseRegistry(raw); }, String(raw).slice(0, 30)); assertValid(reg, String(raw).slice(0, 30)); assertValid(B.normalizeRegistry(raw), 'normalize'); }
  assert.equal(B.parseRegistry('{"v":2,"personality":"coach"}').personality, 'copilote', 'version future : valeurs par défaut');
  const partial = B.parseRegistry(json({ v: 1, personality: 'coach', lastActiveDate: '2026-02-30', lastActiveAt: 'x', lastTextAt: -1 / 0, textDay: { date: D, n: -4 }, shown: { a: { d: 'x', t: 1 }, b: { d: D, t: 'x' }, 'mauvaise clé': { d: D, t: 1 }, ok: { d: D, t: 5 } }, variant: { 'day.empty': { i: 1.5, t: 1 }, 'inconnu': { i: 1, t: 1 }, 'tour.finished': { i: 1, t: 2 } }, welcome: { date: D, days: 0 } }));
  assert.deepEqual([partial.personality, partial.lastActiveDate, partial.lastActiveAt, partial.lastTextAt, partial.textDay.date, Object.keys(partial.shown), Object.keys(partial.variant), partial.welcome], ['coach', null, null, null, null, ['ok'], ['tour.finished'], null], 'tolérance champ par champ');
  const pollute = B.parseRegistry('{"v":1,"personality":"__proto__","shown":{"__proto__":{"d":"2026-10-05","t":1},"constructor":{"d":"2026-10-05","t":1},"prototype":{"d":"2026-10-05","t":1},"ok":{"d":"2026-10-05","t":1}},"variant":{"__proto__":{"i":1,"t":1}},"session":{"touches":[1]}}');
  assert.deepEqual([pollute.personality, Object.keys(pollute.shown), Object.keys(pollute.variant).length, pollute.session.touches.length], ['copilote', ['ok'], 0, 0], 'pas de pollution de prototype, session jamais lue du disque'); assertValid(pollute, 'pollution');
}
{ // TTL et bornes
  const raw = { v: 1, shown: {} };
  for (let i = 0; i < 100; i++) raw.shown['k' + i] = { d: D, t: 1000 + i };
  const n = B.normalizeRegistry(raw, { now: NOW, date: D });
  assert.deepEqual(Object.keys(n.shown).sort(), Array.from({ length: 24 }, (_, i) => 'k' + (76 + i)).sort(), '24 entrées, les plus récentes');
  assert.equal(Object.keys(B.normalizeRegistry(raw, { now: NOW, date: D }, cfg('shownMax', 2)).shown).length, 2, 'borne pilotée par CONFIG');
  const old = { v: 1, shown: { vieux: { d: '2026-09-01', t: 1 }, limite: { d: '2026-09-21', t: 2 }, recent: { d: '2026-10-04', t: 3 }, futur: { d: '2026-10-09', t: 4 } } };
  assert.deepEqual(Object.keys(B.normalizeRegistry(old, { now: NOW, date: D }).shown), ['futur', 'limite', 'recent'], 'TTL de 14 jours');
  assert.deepEqual(Object.keys(B.normalizeRegistry(old, { now: NOW, date: D }, cfg('shownTtlDays', 1)).shown), ['futur', 'recent'], 'TTL piloté par CONFIG');
  assert.deepEqual(Object.keys(B.normalizeRegistry({ v: 1, shown: { a: { d: '2026-01-01', t: 1 } } }, { now: 1 + 20 * 86400000 }).shown), [], 'TTL par horodatage quand la date manque');
  const big = { v: 1, personality: 'coach', shown: {}, variant: { 'day.empty': { i: 1, t: 1 } } };
  for (let i = 0; i < 24; i++) big.shown[('attention:' + i + 'x').padEnd(64, 'z')] = { d: D, t: 1000 + i };
  const text = B.serializeRegistry(big, { now: NOW, date: D });
  assert.ok(text.length <= 2048, 'sérialisation bornée : ' + text.length); const back = B.parseRegistry(text, { now: NOW, date: D });
  assert.equal(back.personality, 'coach'); assert.ok(Object.keys(back.shown).length < 24 && Object.keys(back.shown).length > 10, 'les plus anciennes sortent d’abord');
  assert.ok(Object.keys(back.shown).every(k => back.shown[k].t >= 1000 + (24 - Object.keys(back.shown).length)), 'ce qui reste est le plus récent');
  const small = B.serializeRegistry(big, { now: NOW, date: D }, cfg('registryMaxChars', 400)); assert.ok(small.length <= 400, 'taille pilotée par CONFIG'); assert.equal(JSON.parse(small).personality, 'coach', 'la personnalité survit à la réduction');
  const floor = B.serializeRegistry(big, { now: NOW, date: D }, cfg('registryMaxChars', 50)); assert.equal(floor, B.serializeRegistry(B.defaultRegistry()), 'sous la taille minimale du registre : valeurs par défaut');
}
{ // aller-retour, session jamais persistée, clés strictes
  let r = registry('coach', { lastActiveDate: '2026-09-20' });
  r = step(r, { facts: { tour: TOUR_DONE, attention: ATT('s1') } }, FREE).r; r = step(r, { trigger: 'touch', now: NOW + 5 * MIN }, FREE).r;
  assert.ok(r.session.touches.length === 1 && Object.keys(r.shown).length >= 1);
  const text = B.serializeRegistry(r, { now: NOW, date: D}), parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ['v', 'personality', 'lastActiveDate', 'lastActiveAt', 'lastTextAt', 'textDay', 'shown', 'variant', 'welcome'], 'aucune clé « session », aucun champ métier');
  const back = B.parseRegistry(text, { now: NOW, date: D });
  assert.equal(json(Object.assign({}, back, { session: null })), json(Object.assign({}, r, { session: null })), 'aller-retour sans perte de la partie persistée');
  assert.deepEqual(back.session, B.defaultRegistry().session);
  assert.equal(B.serializeRegistry(B.parseRegistry(text, { now: NOW, date: D }), { now: NOW, date: D }), text, 'sérialisation stable');
}
{ // adaptateur injecté : jamais d'exception, rien d'écrit pour l'état par défaut
  const mkAdapter = (over) => { const store = new Map(), calls = []; return Object.assign({ store, calls, getItem: k => (calls.push(['get', k]), store.has(k) ? store.get(k) : null), setItem: (k, v) => { calls.push(['set', k]); store.set(k, String(v)); }, removeItem: k => { calls.push(['remove', k]); store.delete(k); } }, over); };
  const a = mkAdapter();
  assert.deepEqual(json(B.loadRegistry(a)), json(B.defaultRegistry()), 'clé absente : défaut');
  assert.equal(B.saveRegistry(a, B.defaultRegistry()), true); assert.deepEqual(a.calls.filter(c => c[0] !== 'get'), [['remove', 'store-runner-runner-v1']], 'état par défaut : clé retirée, rien d’écrit');
  const set = B.setPersonality(B.defaultRegistry(), 'coach').registry;
  assert.equal(B.saveRegistry(a, set), true); assert.equal(B.loadRegistry(a).personality, 'coach', 'persistance de la personnalité'); assert.deepEqual([...a.store.keys()], ['store-runner-runner-v1']);
  assert.ok(a.store.get('store-runner-runner-v1').length <= 2048);
  a.store.set('store-runner-runner-v1', '{ corrompu'); assert.equal(B.loadRegistry(a).personality, 'copilote', 'corruption : défaut');
  for (const bad of [null, undefined, {}, { getItem: 3 }, { getItem() { throw new Error('refusé'); } }]) assert.doesNotThrow(() => assert.equal(B.loadRegistry(bad).personality, 'copilote'));
  for (const bad of [null, undefined, {}, { setItem() { throw new Error('quota'); } }, { setItem() { throw new Error('quota'); }, removeItem() { throw new Error('quota'); } }]) assert.doesNotThrow(() => assert.equal(B.saveRegistry(bad, set), false));
  assert.equal(B.saveRegistry(mkAdapter({ removeItem: undefined }), B.defaultRegistry()), true);
}
{ // une horloge qui recule ne bloque jamais définitivement
  const r = registry('coach', { lastTextAt: NOW + 30 * H, variant: { 'day.empty': { i: 0, t: NOW + 30 * H } } });
  assert.equal(B.decide(mk({ facts: { workday: true, mode: 'today' } }), r).id, 'day.empty');
}

/* 13. Configuration : aucun seuil caché ----------------------------------------------------- */
{ // V276 — seuils de la couche métier (remarques et point du jour)
  const r1 = B.remarks({ items: [{ kind: 'trend', text: 'x'.repeat(200) }] }, cfg('lineMaxChars', 20));
  assert.equal(Array.from(r1.lines[0].text).length, 20, 'longueur d’une remarque pilotée par CONFIG');
  const brief = { tour: { total: 3, done: 1, finished: false, next: { key: 'a', label: 'b' } }, mode: 'today', attention: ATT('s1'), remarks: { lines: [{ kind: 'trend', text: 't' }] } };
  assert.equal(B.brief(brief, cfg('briefMaxLines', 1)).lines.length, 1, 'nombre de lignes du point du jour piloté par CONFIG');
  assert.equal(B.brief(brief).lines.length, 3);
}
{
  assert.equal(B.decide(mk({ facts: { tour: TOUR_DONE } }), registry('coach'), cfg('messageMs', 1500)).messageMs, 1500, 'durée pilotée par CONFIG');
  const ignored = { config: { absenceDays: -1, textGapMs: NaN, gestureGapMs: '5', arrivalGuardMs: null, unknown: 9, touchLadder: 'x' } };
  const strip = o => json(B.decide(mk({ facts: FULL }), R0, o));
  assert.equal(strip(ignored), strip(), 'valeurs invalides et clés inconnues ignorées');
  assert.equal(strip({ personalities: { coach: {} } }), strip(), 'catalogue sans personnalité par défaut ignoré');
  assert.equal(strip({ personalities: null, config: 5 }), strip());
  const numeric = Object.keys(B.CONFIG);
  for (const k of numeric) assert.ok(used.has(k), 'le seuil « ' + k + ' » est exercé par un test');
  assert.ok(numeric.every(k => typeof B.CONFIG[k] === 'number' || k === 'touchLadder'), 'CONFIG : nombres et échelle de toucher seulement');
}

/* 14. Contrôleur partagé : le registre en mémoire, relié au stockage durable par son propriétaire ------------ */
{
  const mkStore = (over) => { const store = new Map(), calls = []; return Object.assign({ store, calls, getItem: k => (calls.push(['get', k]), store.has(k) ? store.get(k) : null), setItem: (k, v) => { calls.push(['set', k]); store.set(k, String(v)); }, removeItem: k => { calls.push(['remove', k]); store.delete(k); } }, over); };
  const a = mkStore(), c = B.createController(a);
  assert.equal(a.calls.length, 0, 'aucune lecture du stockage avant le premier usage');
  assert.equal(c.personality(), 'copilote'); assert.equal(a.calls.filter(x => x[0] === 'get').length, 1, 'une seule lecture, paresseuse');
  assert.equal(c.personality(), 'copilote'); assert.equal(a.calls.filter(x => x[0] === 'get').length, 1, 'registre gardé en mémoire');
  assert.equal(c.setPersonality('coach'), true); assert.equal(c.personality(), 'coach');
  assert.equal(B.loadRegistry(a).personality, 'coach', 'le choix est écrit dans le stockage durable');
  assert.equal(B.createController(a).personality(), 'coach', 'un autre contrôleur (prochaine ouverture) retrouve le choix');
  assert.equal(c.setPersonality('inconnue'), false, 'personnalité inconnue refusée'); assert.equal(c.personality(), 'coach');
  assert.equal(Object.isFrozen(c), true, 'API du contrôleur gelée');

  // décider ne persiste rien ; enregistrer écrit une fois, puis l'anti-spam retient la même réaction
  const sets = () => a.calls.filter(x => x[0] === 'set').length;
  const input = mk({ facts: { tour: TOUR_DONE } }), before = sets();
  const reaction = c.decide(input);
  assert.ok(reaction && reaction.id, 'une réaction est proposée'); assert.equal(sets(), before, 'decide ne persiste rien');
  assert.equal(c.record(reaction, input), true); assert.equal(sets(), before + 1, 'record persiste');
  assert.equal(c.decide(mk({ now: NOW + 1000, facts: { tour: TOUR_DONE } })), null, 'même réaction juste après : retenue par l’anti-spam');
  assert.equal(c.title('planning', 'alert'), B.title('coach', 'planning', 'alert'), 'titre selon la personnalité choisie');
  // Présence idle : permise partout sauf Discret, qui laisse Runner immobile (les hôtes demandent, Runner ne sait rien de la personnalité)
  assert.equal(c.idle(), true); assert.equal(B.idleAllowed('discret'), false); assert.equal(B.idleAllowed('inconnue'), true, 'inconnue : Copilote');
  for (const id of ['copilote', 'complice', 'coach', 'taquin']) assert.equal(B.idleAllowed(id), true, id);
  assert.equal(B.createController(mkStore()).idle(), true); const quiet = B.createController(mkStore()); quiet.setPersonality('discret'); assert.equal(quiet.idle(), false);

  // un hôte qui ne reconnaît pas l'état neutre n'obtient rien
  assert.equal(c.decide(mk({ view: { state: 'analyzing' }, facts: { tour: TOUR_DONE } })), null);

  // stockage indisponible, absent ou qui échoue : jamais d'exception, comportement par défaut, rien d'écrit en dehors
  for (const bad of [null, undefined, {}, { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('quota'); } }]) {
    const x = B.createController(bad);
    assert.doesNotThrow(() => { assert.equal(x.personality(), 'copilote'); x.setPersonality('discret'); x.touch({ now: NOW, date: D }); x.record(x.decide(mk({ facts: { tour: TOUR_DONE } })), mk()); });
    assert.equal(x.personality(), 'discret', 'le choix reste valable en mémoire pour la session');
  }

  // partage : connect() remplace le contrôleur partagé, controller() n'en crée jamais deux
  const shared = B.controller(); assert.equal(B.controller(), shared, 'un seul contrôleur partagé');
  const b = mkStore(); b.store.set('store-runner-runner-v1', B.serializeRegistry(B.setPersonality(B.defaultRegistry(), 'taquin').registry));
  const connected = B.connect(b); assert.equal(B.controller(), connected); assert.equal(connected.personality(), 'taquin', 'connect relit la préférence du stockage durable');
  B.connect(null);
}

/* 15. Hôtes : chacun garde sa propriété, le module reste la seule source de décision ---------------- */
{
  const home = read('home-refresh-v2.js'), nav = read('navigation-controller.js');
  const from = home.indexOf("/* V273 — voix de Runner sur l'Accueil."), apply = home.indexOf('function applyBehavior');
  const voice = home.slice(from, home.indexOf('\n  function ', apply + 20));
  assert.ok(from > 0 && apply > from, 'bloc V273 de l’Accueil repéré'); assert.ok(voice.length > 1500);
  assert.doesNotMatch(voice, /localStorage|sessionStorage|__chefStorage|indexedDB|\bsave\s*\(|generateWeek|renderAll|setTimeout|setInterval|addEventListener|MutationObserver|innerHTML|state\.[A-Za-z.]*\s*=[^=]/, 'l’Accueil lit des faits : aucune écriture, aucun timer, aucun écouteur, aucun HTML injecté');
  assert.match(voice, /textContent=homeLineText/, 'le texte de Runner passe toujours par textContent');
  assert.match(voice, /controller\.decide\(\{surface:'home',trigger:trigger\|\|'arrive'/, 'l’Accueil confie la décision au module (V276 : arrive ou rerender)');
  assert.match(voice, /controller\.record\(reaction/, 'toute réaction affichée est enregistrée (budget, écart)');
  assert.match(voice, /returnFrom:returnedFrom\|\|null/, 'le retour depuis un autre écran est un fait de l’Accueil, jamais déduit du module');
  assert.match(voice, /homeRunner\.isMoving\(\)/, 'aucun geste ambiant par-dessus la scène d’entrée');
  assert.match(home, /if\(skipBehavior\)skipBehavior=false;else applyBehavior\(panel,returnedFrom,trigger\)/, 'retour de la feuille Apparence : aucune réaction supplémentaire');
  assert.match(home, /homeRunnerLineV273/, 'ligne de l’Accueil réservée dans le flux de la page');
  assert.doesNotMatch(read('runner-visual.js'), /StoreRunnerBehavior|runner-behavior/, 'la couche visuelle ignore le module de comportement');
  assert.match(home, /setPresence\(behaviorIdle\(\)\)/, 'Accueil : Discret coupe la présence idle');
  assert.doesNotMatch(home, /setPresence\(true\)/);
  for (const f of ['planning-ui-fixes.js', 'assistant-upgrade.js']) {
    const src = read(f);
    assert.match(src, /StoreRunnerBehavior/, f + ' lit ses titres auprès du module');
    assert.match(src, /runnerInstance\.setPresence\(behaviorIdle\(\)\)/, f + ' : Discret coupe la présence idle');
    assert.doesNotMatch(src, /runnerInstance\.setPresence\(true\)/, f + ' : jamais de présence forcée');
    assert.doesNotMatch(src.slice(src.indexOf('function behaviorTitle'), src.indexOf('function behaviorTitle') + 700), /\.decide\(|\.record\(|setPersonality|localStorage|__chefStorage|setTimeout/, f + ' : titres seulement, jamais de décision ni de persistance');
  }
  // personnalité : la feuille Apparence de V272 reste la seule feuille ; le stockage est branché par son propriétaire
  assert.match(nav, /b\.connect\(db\?\{/, 'navigation-controller.js connecte le module à son stockage durable');
  assert.match(nav, /data-runner-personality/, 'la section Personnalité vit dans la feuille Apparence existante');
  assert.match(nav, /anchor\.parentNode\.insertBefore\(section,anchor\)/, 'la section s’insère dans la feuille Apparence de V272 (avant « Rétablir »), aucune seconde feuille')
  assert.ok(!/localStorage|sessionStorage/.test(nav.slice(nav.indexOf('function connectBehavior'), nav.indexOf('async function set(value)'))), 'aucun stockage direct : moteur durable seulement');
}

console.log('PASS: Runner Behavior V273 — fondation pure testée (' + ids.length + ' réactions, ' + Object.keys(B.PERSONALITIES).length + ' personnalités, ' + Object.keys(B.CONFIG).length + ' seuils), contrôleur partagé et hôtes épinglés.');
