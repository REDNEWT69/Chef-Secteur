// P0.2b — la génération V211 (range-planner-v2.js), semaine et période, ne pose plus de
// magasin sur un jour férié de l'Agenda.
//
// Sur r28, V211 décidait seul qu'une date était bloquée : dateBlocked(date) =
// calendarEventsForDate(date).some(eventBlocksPlanning). L'enveloppe Agenda (calendar-oauth.js)
// lui donne bien la ligne du férié, mais eventBlocksPlanning(e) ne connaît pas ce motif : seul
// le moteur terrain (terrain-planning-v1.js) le porte. « Planifier plusieurs semaines » posait
// donc des magasins le mercredi 11/11/2026 (Armistice 1918).
//
// Tout est rejoué sur les VRAIS modules : calendarEventsForDate du noyau (lignes extraites telles
// quelles de src/chef-secteur.html), calendar-oauth.js, visit-coverage.js, store-opening-hours.js,
// terrain-planning-v1.js et range-planner-v2.js. Seul l'appel réseau syncGoogleCalendar est
// remplacé par un succès neutre : l'Agenda est supposé déjà synchronisé dans state.calendarEvents.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const WORK = DAYS.slice(0, 5);
const ARCHIVE_KEY = 'chef_sector_plan_archive_v1';
const WEEK = '2026-11-09', HOLIDAY = '2026-11-11', RANGE_END = '2026-11-13';
const copy = x => JSON.parse(JSON.stringify(x));
const ids = route => Array.from(route || [], s => String(s.id));

const CORE = read('src/chef-secteur.html');
function coreLine(re, label) { const m = CORE.match(re); if (!m) throw new Error('noyau : ' + label + ' introuvable'); return m[0]; }
const CORE_CALENDAR = [
  coreLine(/^function localISO\(date\)\{.*$/m, 'localISO'),
  coreLine(/^function eventDate\(raw\)\{.*$/m, 'eventDate'),
  coreLine(/^window\.calendarEventsForDate=function\(date\)\{.*$/m, 'calendarEventsForDate')
].join('\n');
const RANGE_SOURCE = read('range-planner-v2.js');
const HOOK = 'window.generatePlanningRange=generateRange;';
if (!RANGE_SOURCE.includes(HOOK)) throw new Error('range-planner-v2.js : point d’accroche introuvable');
/* Exposition en lecture seule des fonctions internes, comme tests/planning-range-rotation.test.cjs. */
const RANGE = RANGE_SOURCE.replace(HOOK, 'window.__p02bRange={strictSingleWeek,generateRange,dateBlocked,activeDays,eventBlocksPlanning};' + HOOK);
const SOURCES = [
  ['calendar-oauth.js', read('calendar-oauth.js')],
  ['visit-coverage.js', read('visit-coverage.js')],
  ['store-opening-hours.js', read('store-opening-hours.js')],
  ['visit-counting.js', read('visit-counting.js')]
];
const TERRAIN = read('terrain-planning-v1.js');

/* Agenda : un férié tel que syncGoogleCalendar l'écrit depuis l'agenda Google « Jours fériés en
   France » (id agenda:événement, calendar = nom de l'agenda, fin all-day exclusive). */
const HOLIDAY_GOOGLE = { id: 'fr.french#holiday@group.v.calendar.google.com:20261111_armistice', title: 'Armistice 1918', location: '', calendar: 'Jours fériés en France', date: HOLIDAY, start: HOLIDAY, end: '2026-11-12', allDay: true, source: 'google' };
const HOLIDAY_TITLE = { id: 'primary:ferie-20261111', title: 'Jour férié', location: '', calendar: 'Google Agenda', date: HOLIDAY, start: HOLIDAY, end: '2026-11-12', allDay: true, source: 'google' };
const event = (id, title, start, end, allDay) => ({ id: 'primary:' + id, title, location: '', calendar: 'Google Agenda', date: start.slice(0, 10), start, end, allDay, source: 'google' });

/* Horloge déterministe : vendredi 06/11/2026 08:00, la semaine du 09/11 est entièrement future. */
const RealDate = Date, NOW = '2026-11-06T08:00:00';
class FixedDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [NOW])); }
  static now() { return new RealDate(NOW).getTime(); }
}

/* Géographie réelle (haversine) autour de Lyon. */
const BASE = { id: 'BASE', enseigne: 'Départ', ville: 'Lyon', lat: 45.764, lon: 4.8357 };
function hav(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
function store(id, northKm, eastKm, extra) {
  return Object.assign({ id, enseigne: 'Fnac', ville: 'Ville ' + id, adresse: '1 rue ' + id, dept: '69',
    lat: +(BASE.lat + northKm / 111).toFixed(5), lon: +(BASE.lon + eastKm / 78).toFixed(5), priority: 3, active: true, intervalDays: 30 }, extra || {});
}
/* Secteur de 30 magasins entre 8 et 45 km du départ, répartis en anneau déterministe. */
function ring() {
  return Array.from({ length: 30 }, (_, i) => {
    const a = (i * 137.508) * Math.PI / 180, km = 8 + (i * 7) % 38;
    return store('s' + String(i + 1).padStart(2, '0'), km * Math.cos(a), km * Math.sin(a));
  });
}

function makeState(o) {
  return {
    profile: { baseName: 'Lyon', baseLat: BASE.lat, baseLon: BASE.lon, overnightMode: 'never' },
    settings: { weekDate: o.weekDate || WEEK, days: WORK.slice(), target: o.target || 8, maxVisitsPerDay: o.max || 2, startTime: '08:30', endTime: '18:00', saturdayStart: '08:00', saturdayEnd: '12:00', visitMinutes: 45 },
    stores: o.stores || ring(), visits: o.visits || {}, businessV2: { visits: [], actions: [], storeSnapshots: {} },
    plan: o.plan || Object.fromEntries(DAYS.map(d => [d, []])), included: o.included || {}, excluded: {}, locks: o.locks || {}, appointments: o.appointments || [],
    manualWeekEdits: o.manualWeekEdits || {}, hotelReservations: {}, calendarEvents: o.calendarEvents || []
  };
}

/* terrain : 'real' (module chargé), 'absent', 'neutral' (présent, ne bloque rien), 'failing'.
   Dans un contexte vm, `delete` ne retire pas une propriété déjà vue par le global : l'absence
   est simulée par une affectation à undefined, comme dans tests/recalc-holiday-p02a.test.cjs. */
function runtime(o, terrain) {
  const state = makeState(o), mem = new Map(), proposals = [];
  const db = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), flush: () => Promise.resolve() };
  if (o.archive) db.setItem(ARCHIVE_KEY, JSON.stringify(o.archive));
  const els = {
    weekDate: { value: state.settings.weekDate }, rangeStart: { value: o.rangeStart || WEEK }, rangeEnd: { value: o.rangeEnd || RANGE_END },
    endTime: { value: '18:00' }, maxVisitsPerDay: { value: String(state.settings.maxVisitsPerDay) },
    generateRangeBtn: { disabled: false }, rangePlanStatus: { style: {}, textContent: '' }, statusText: { textContent: '' }
  };
  const ctx = {
    console, Date: FixedDate, Map, Set, JSON, Object, Array, String, Number, Math, RegExp, Promise, Error, Symbol,
    setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    state, __chefStorage: db, localStorage: db, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => fn(),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    confirm: () => true, save() {}, renderAll() {}, initControls() {}, readPlanningControls() {},
    baseObj: () => BASE, hav, havBase: s => hav(BASE, s),
    ChefReliability: {
      checkpoint() {},
      propose: async candidate => {
        proposals.push(copy(candidate));
        ctx.state.plan = candidate.plan;
        ctx.state.settings.weekDate = candidate.weekDate;
        if (candidate.archive) db.setItem(ARCHIVE_KEY, JSON.stringify(candidate.archive));
        return true;
      }
    }
  };
  const dayBoxes = DAYS.map(d => ({ value: d, get checked() { return (ctx.state.settings.days || []).includes(d); } }));
  ctx.document = {
    readyState: 'loading', hidden: false, head: { appendChild() {} }, body: { appendChild() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    getElementById: id => els[id] || null, querySelector: () => null,
    querySelectorAll: sel => sel === '[data-day]' ? dayBoxes : [],
    createElement: tag => ({ tagName: String(tag).toUpperCase(), style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, insertAdjacentElement() {}, querySelector: () => null, querySelectorAll: () => [] })
  };
  ctx.window = ctx;
  vm.runInNewContext(CORE_CALENDAR, ctx, { filename: 'src/chef-secteur.html' });
  for (const [name, source] of SOURCES) vm.runInNewContext(source, ctx, { filename: name });
  ctx.chefSecteurPrepareCalendarForPlanning(); // installe l'enveloppe sémantique Agenda, comme au boot
  if (ctx.__calendarSemanticBlocks !== true) throw new Error('enveloppe sémantique Agenda non installée');
  ctx.document.readyState = 'complete';
  vm.runInNewContext(TERRAIN, ctx, { filename: 'terrain-planning-v1.js' });
  vm.runInNewContext(RANGE, ctx, { filename: 'range-planner-v2.js' });
  // L'Agenda est déjà dans state.calendarEvents : la synchronisation réseau réussit sans rien changer.
  ctx.syncGoogleCalendar = async () => ({ ok: true });
  const real = ctx.StoreRunnerTerrainPlanningV1;
  if (!real || typeof real.dateBlocked !== 'function') throw new Error('moteur terrain non chargé');
  if (terrain === 'absent') ctx.StoreRunnerTerrainPlanningV1 = undefined;
  if (terrain === 'neutral') ctx.StoreRunnerTerrainPlanningV1 = { dateBlocked: () => false };
  if (terrain === 'failing') ctx.StoreRunnerTerrainPlanningV1 = { dateBlocked() { throw new Error('terrain indisponible'); } };
  return { ctx, db, els, proposals, api: ctx.__p02bRange, terrain: real };
}

const archiveOf = rt => JSON.parse(rt.db.getItem(ARCHIVE_KEY) || '{}');
async function runWeek(o, terrain) {
  const rt = runtime(o, terrain);
  const result = await rt.api.strictSingleWeek();
  return { rt, result, plan: rt.ctx.state.plan, archive: archiveOf(rt) };
}
async function runRange(o, terrain) {
  const rt = runtime(o, terrain);
  await rt.api.generateRange();
  const proposal = rt.proposals[rt.proposals.length - 1] || null;
  return { rt, proposal, status: rt.els.rangePlanStatus.textContent, archive: archiveOf(rt) };
}
function planIds(plan) { return Object.fromEntries(DAYS.map(d => [d, ids(plan && plan[d])])); }
function archiveIds(archive) {
  return Object.fromEntries(Object.entries(archive || {}).sort().map(([k, s]) => [k, { manualEdited: !!(s && s.manualEdited), plan: planIds(s && s.plan) }]));
}
function weekSignature(r) { return JSON.stringify({ result: r.result, plan: planIds(r.plan), archive: archiveIds(r.archive) }); }
function rangeSignature(r) {
  const p = r.proposal, range = p && p.range ? Object.assign({}, p.range, { updatedAt: '' }) : null;
  return JSON.stringify({ status: r.status, proposed: !!p, weekDate: p && p.weekDate, plan: p && planIds(p.plan), range, archive: archiveIds(r.archive) });
}
function dateOf(weekKey, day) { const d = new RealDate(weekKey + 'T12:00:00'); d.setDate(d.getDate() + DAYS.indexOf(day)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function placementsIn(archive, id) {
  const out = [];
  for (const [week, snap] of Object.entries(archive || {})) for (const day of DAYS) if (ids(snap.plan && snap.plan[day]).includes(String(id))) out.push(dateOf(week, day));
  return out;
}
function creditsOf(rt, route) { return (route || []).reduce((n, s) => n + (typeof rt.ctx.storeVisitCredit === 'function' ? Math.max(1, Number(rt.ctx.storeVisitCredit(s)) || 1) : 1), 0); }

/* Le férié doit être le SEUL bloqueur de sa date : une seule ligne Agenda la couvre et, sans cet
   événement, rien ne bloque la date. */
function assertOnlyBlocker(rt, holiday) {
  const rows = rt.ctx.calendarEventsForDate(HOLIDAY);
  assert.deepEqual(Array.from(rows, r => r.title), [holiday.title], 'précondition : seul l’événement férié couvre le ' + HOLIDAY);
  assert.equal(rt.terrain.dateBlocked(HOLIDAY, rt.ctx.state), true, 'précondition : le moteur terrain bloque le férié « ' + holiday.title + ' »');
  const without = Object.assign({}, rt.ctx.state, { calendarEvents: rt.ctx.state.calendarEvents.filter(e => e.id !== holiday.id) });
  assert.equal(rt.terrain.dateBlocked(HOLIDAY, without), false, 'précondition : sans le férié, rien ne bloque le ' + HOLIDAY);
}

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: e && e.message ? e.message : String(e) }); }
}

/* Génération semaine V211 : mercredi 11/11 vide, les quatre autres jours travaillés utilisés. */
async function assertWeekKeepsHoliday(holiday) {
  const r = await runWeek({ calendarEvents: [holiday] }, 'real');
  assertOnlyBlocker(r.rt, holiday);
  assert.equal(r.result.ok, true, r.result.error || 'génération semaine possible');
  assert.deepEqual(ids(r.plan.Mercredi), [], '« ' + holiday.title + ' » : la génération semaine V211 a posé ' + ids(r.plan.Mercredi).join(', ') + ' sur le férié du mercredi 11/11');
  const usable = r.rt.api.activeDays(new RealDate(WEEK + 'T12:00:00'), WORK, new RealDate(WEEK + 'T12:00:00'), new RealDate('2026-11-15T12:00:00'));
  assert.equal(r.rt.api.dateBlocked(HOLIDAY), true, '« ' + holiday.title + ' » : dateBlocked(' + HOLIDAY + ') de V211 le considère utilisable');
  assert.deepEqual(Array.from(usable), ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'], '« ' + holiday.title + ' » : jours utilisables V211 de la semaine du 09/11');
  assert.deepEqual(ids(r.archive[WEEK].plan.Mercredi), [], 'l’archive de la semaine garde le férié vide');
  for (const day of ['Lundi', 'Mardi', 'Jeudi', 'Vendredi']) assert.equal(ids(r.plan[day]).length, 2, day + ' reçoit normalement ses 2 visites');
  assert.equal(r.result.visits, 8, 'objectif de 8 visites atteint sur les 4 jours ouvrés restants');
}

/* Génération période V211 du 09/11 au 13/11 : snapshot/archive produit par V211. */
async function assertRangeKeepsHoliday(holiday) {
  const r = await runRange({ calendarEvents: [holiday] }, 'real');
  assertOnlyBlocker(r.rt, holiday);
  assert.ok(r.proposal, 'la période doit être proposée : ' + r.status);
  assert.match(r.status, /Période appliquée/);
  const snap = r.proposal.archive[WEEK];
  assert.ok(snap && snap.weekMonday === WEEK, 'snapshot V211 de la semaine du 09/11');
  assert.deepEqual(ids(snap.plan.Mercredi), [], '« ' + holiday.title + ' » : la période V211 a posé ' + ids(snap.plan.Mercredi).join(', ') + ' sur le férié du mercredi 11/11 (snapshot)');
  assert.deepEqual(ids(r.archive[WEEK].plan.Mercredi), [], 'l’archive écrite garde le férié vide');
  assert.deepEqual(ids(r.proposal.plan.Mercredi), [], 'le plan affiché garde le férié vide');
  for (const day of ['Lundi', 'Mardi', 'Jeudi', 'Vendredi']) assert.equal(ids(snap.plan[day]).length, 2, day + ' reçoit normalement ses 2 visites');
  assert.equal(r.proposal.range.totalVisits, 8, 'la période compte 8 visites');
  assert.equal(r.proposal.range.rotation, 'pilot-v211');
}

(async () => {
  /* ------------------------------------------------------------ preuve rouge ---- */
  await scenario('A1 — semaine V211, férié Google « Jours fériés en France » (Armistice 1918) : mercredi 11/11 vide', () => assertWeekKeepsHoliday(HOLIDAY_GOOGLE));
  await scenario('A2 — semaine V211, titre explicite « Jour férié » : mercredi 11/11 vide', () => assertWeekKeepsHoliday(HOLIDAY_TITLE));
  await scenario('B1 — période V211 09/11 → 13/11, Armistice 1918 : mercredi 11/11 vide dans le snapshot', () => assertRangeKeepsHoliday(HOLIDAY_GOOGLE));
  await scenario('B2 — période V211 09/11 → 13/11, « Jour férié » : mercredi 11/11 vide dans le snapshot', () => assertRangeKeepsHoliday(HOLIDAY_TITLE));

  /* ------------------------------------------------ comportement historique ---- */
  await scenario('C — sans moteur terrain (absent, neutre ou en panne), V211 garde exactement sa règle historique', async () => {
    for (const run of [runWeek, runRange]) {
      const sig = run === runWeek ? weekSignature : rangeSignature;
      const absent = await run({ calendarEvents: [HOLIDAY_GOOGLE] }, 'absent');
      const neutral = await run({ calendarEvents: [HOLIDAY_GOOGLE] }, 'neutral');
      const failing = await run({ calendarEvents: [HOLIDAY_GOOGLE] }, 'failing');
      assert.equal(sig(neutral), sig(absent), 'moteur terrain neutre : même sortie que sans moteur');
      assert.equal(sig(failing), sig(absent), 'moteur terrain en panne : même sortie que sans moteur');
      // La règle historique ne connaît pas le férié : c'est le moteur terrain qui porte ce
      // motif, jamais une copie dans V211. Sans lui, le comportement r28 reste identique.
      const plan = run === runWeek ? absent.plan : absent.proposal.archive[WEEK].plan;
      assert.equal(ids(plan.Mercredi).length, 2, 'sans moteur terrain, le mercredi férié reste utilisé comme sur r28');
      assert.equal(absent.rt.api.dateBlocked(HOLIDAY), false, 'sans moteur terrain, dateBlocked historique ne voit pas le férié');
    }
  });

  /* ---------------------------------------------------------- non-régressions ---- */
  /* Chaque cas : même sortie qu'avant P0.2b (règle historique seule, moteur terrain absent) sur
     la semaine ET sur la période, et le résultat attendu sur les dates observées. */
  const regressions = [
    { name: 'congé all-day multi-jours mercredi 11 → jeudi 12 (fin exclusive vendredi 13)', events: [event('conges', 'Congés', '2026-11-11', '2026-11-13', true)],
      blocked: ['2026-11-11', '2026-11-12'], free: ['2026-11-09', '2026-11-10', '2026-11-13'] },
    { name: 'formation horaire 09:00–12:00 mercredi 11/11', events: [event('formation', 'Formation produit', HOLIDAY + 'T09:00:00', HOLIDAY + 'T12:00:00', false)],
      blocked: [HOLIDAY], free: ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'] },
    { name: 'déplacement horaire jeudi 12/11', events: [event('deplacement', 'Déplacement Marseille', '2026-11-12T08:00:00', '2026-11-12T18:00:00', false)],
      blocked: ['2026-11-12'], free: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-13'] },
    { name: 'déplacement Paris déduit mardi 10/11 (inferredAway) : toujours bloqué par V211',
      events: [event('tgv-aller', 'TGV Lyon → Paris', '2026-11-09T07:00:00', '2026-11-09T09:00:00', false), event('tgv-retour', 'TGV retour Paris → Lyon', '2026-11-11T17:00:00', '2026-11-11T19:00:00', false)],
      blocked: ['2026-11-09', '2026-11-10', '2026-11-11'], free: ['2026-11-12', '2026-11-13'], inferred: '2026-11-10' },
    { name: 'all-day neutre « Anniversaire équipe » mercredi 11/11', events: [event('anniv', 'Anniversaire équipe', HOLIDAY, '2026-11-12', true)],
      blocked: [], free: WORK.map(d => dateOf(WEEK, d)) },
    { name: '« Rendez-vous avec Fériel » 10:00–11:00 mercredi 11/11 n’est pas un férié', events: [event('feriel', 'Rendez-vous avec Fériel', HOLIDAY + 'T10:00:00', HOLIDAY + 'T11:00:00', false)],
      blocked: [], free: WORK.map(d => dateOf(WEEK, d)) }
  ];
  for (const c of regressions) {
    await scenario('D — ' + c.name, async () => {
      const probe = runtime({ calendarEvents: c.events }, 'real');
      if (c.inferred) {
        assert.ok(probe.ctx.calendarEventsForDate(c.inferred).some(r => r.inferredAway), 'précondition : ligne Agenda déduite (inferredAway) le ' + c.inferred);
        assert.equal(probe.terrain.dateBlocked(c.inferred, probe.ctx.state), false, 'précondition : le moteur terrain ne voit pas le déplacement déduit, seule la règle historique V211 le bloque');
      }
      for (const date of c.blocked) assert.equal(probe.api.dateBlocked(date), true, date + ' doit rester bloqué pour V211');
      for (const date of c.free) assert.equal(probe.api.dateBlocked(date), false, date + ' ne doit pas être bloqué');
      const week = await runWeek({ calendarEvents: c.events }, 'real'), weekHistoric = await runWeek({ calendarEvents: c.events }, 'absent');
      assert.equal(weekSignature(week), weekSignature(weekHistoric), 'semaine : sortie différente de la règle historique V211');
      const range = await runRange({ calendarEvents: c.events }, 'real'), rangeHistoric = await runRange({ calendarEvents: c.events }, 'absent');
      assert.equal(rangeSignature(range), rangeSignature(rangeHistoric), 'période : sortie différente de la règle historique V211');
      const snap = range.proposal.archive[WEEK].plan;
      for (const date of c.blocked) { const day = DAYS[(new RealDate(date + 'T12:00:00').getDay() || 7) - 1]; assert.deepEqual(ids(snap[day]), [], 'période : ' + date + ' reste vide'); assert.deepEqual(ids(week.plan[day]), [], 'semaine : ' + date + ' reste vide'); }
      for (const date of c.free) { const day = DAYS[(new RealDate(date + 'T12:00:00').getDay() || 7) - 1]; assert.ok(ids(snap[day]).length > 0, 'période : ' + date + ' reçoit des visites'); assert.ok(ids(week.plan[day]).length > 0, 'semaine : ' + date + ' reçoit des visites'); }
    });
  }

  await scenario('E — semaine manuelle protégée : la semaine et la période la conservent telle quelle, férié compris', async () => {
    const stores = ring(), byId = id => stores.find(s => s.id === id);
    const manualPlan = Object.fromEntries(DAYS.map(d => [d, []]));
    manualPlan.Lundi = [byId('s01')]; manualPlan.Mercredi = [byId('s02')]; manualPlan.Jeudi = [byId('s03')];
    const o = () => ({ stores, calendarEvents: [HOLIDAY_GOOGLE], plan: copy(manualPlan),
      archive: { [WEEK]: { weekMonday: WEEK, plan: copy(manualPlan), manualEdited: true, manualEditedAt: '2026-11-05T10:00:00.000Z' } },
      manualWeekEdits: { [WEEK]: { at: '2026-11-05T10:00:00.000Z', plan: copy(manualPlan) } } });
    const week = await runWeek(o(), 'real');
    assert.equal(week.result.preservedManual, true, 'semaine manuelle détectée');
    assert.deepEqual(planIds(week.plan), planIds(manualPlan), 'semaine manuelle inchangée');
    assert.deepEqual(archiveIds(week.archive), archiveIds(o().archive), 'archive manuelle inchangée');
    const range = await runRange(Object.assign(o(), { rangeEnd: '2026-11-20' }), 'real'), historic = await runRange(Object.assign(o(), { rangeEnd: '2026-11-20' }), 'absent');
    assert.ok(range.proposal, range.status);
    assert.deepEqual(planIds(range.proposal.archive[WEEK].plan), planIds(manualPlan), 'période : la semaine manuelle est conservée à l’identique (la visite posée à la main le 11/11 reste)');
    assert.equal(range.proposal.archive[WEEK].manualEdited, true);
    assert.equal(rangeSignature(range), rangeSignature(historic), 'période avec semaine manuelle : même sortie que la règle historique (la semaine suivante n’a pas de férié)');
  });

  await scenario('F — RDV, verrou récurrent, pose datée et magasin imposé inchangés avec le férié', async () => {
    const o = () => ({ calendarEvents: [HOLIDAY_GOOGLE],
      appointments: [{ id: 'rdv-jeudi', storeId: 's05', date: '2026-11-12', time: '10:00', duration: 60, type: 'Visite', note: '' }],
      locks: { s07: 'Vendredi', s09: { day: 'Lundi', week: WEEK } }, included: { s11: true } });
    for (const run of [runWeek, runRange]) {
      const input = o(), r = await run(input, 'real');
      const plan = run === runWeek ? r.plan : r.proposal.archive[WEEK].plan;
      assert.deepEqual(ids(plan.Mercredi), [], 'le férié reste vide');
      assert.ok(ids(plan.Jeudi).includes('s05'), 'le rendez-vous du jeudi garde s05 le jeudi');
      assert.ok(ids(plan.Vendredi).includes('s07'), 'le verrou récurrent garde s07 le vendredi');
      assert.ok(ids(plan.Lundi).includes('s09'), 'la pose datée garde s09 le lundi');
      assert.equal(Object.values(planIds(plan)).flat().filter(id => id === 's11').length, 1, 'le magasin imposé s11 est planifié une fois');
      assert.deepEqual(copy(r.rt.ctx.state.appointments), input.appointments, 'state.appointments inchangé');
      assert.deepEqual(copy(r.rt.ctx.state.locks), input.locks, 'state.locks inchangé');
      assert.deepEqual(copy(r.rt.ctx.state.included), input.included, 'state.included inchangé');
    }
  });

  await scenario('G — rotation V211 et capacité : sans férié, sortie identique à la règle historique ; avec férié, cycle sans répétition et plafond respecté', async () => {
    const many = { rangeEnd: '2026-11-27', calendarEvents: [event('anniv', 'Anniversaire équipe', HOLIDAY, '2026-11-12', true)] };
    const plain = await runRange(copy(many), 'real'), plainHistoric = await runRange(copy(many), 'absent');
    assert.equal(rangeSignature(plain), rangeSignature(plainHistoric), 'rotation sur 3 semaines sans férié : identique à r28');
    const credit = [store('d1', 10, 0, { enseigne: 'Darty' }), store('d2', 0, 10, { enseigne: 'Boulanger' })].concat(ring().slice(0, 20));
    const r = await runRange({ stores: credit, rangeEnd: '2026-11-27', calendarEvents: [HOLIDAY_GOOGLE], max: 3, target: 10 }, 'real');
    assert.ok(r.proposal, r.status);
    const snaps = Object.values(r.proposal.archive).sort((a, b) => a.weekMonday.localeCompare(b.weekMonday));
    assert.equal(snaps.length, 3);
    assert.deepEqual(ids(snaps[0].plan.Mercredi), [], 'le férié reste vide');
    for (const snap of snaps) for (const day of DAYS) assert.ok(creditsOf(r.rt, snap.plan[day]) <= 3, snap.weekMonday + ' ' + day + ' dépasse le plafond de 3 crédits');
    const all = snaps.flatMap(s => DAYS.flatMap(d => ids(s.plan[d])));
    assert.equal(new Set(all).size, 22, 'les 22 magasins sont couverts sur la période');
    for (const id of new Set(all)) assert.ok(placementsIn(r.proposal.archive, id).every(d => d !== HOLIDAY), id + ' posé sur le férié');
  });

  await scenario('H — V211 délègue au prédicat terrain sans recopier le motif férié ni publier de nouveau global', () => {
    const fn = (RANGE_SOURCE.match(/^function dateBlocked\(date\)\{.*$/m) || [''])[0];
    assert.match(fn, /window\.StoreRunnerTerrainPlanningV1/, 'dateBlocked(date) doit interroger le moteur terrain');
    assert.match(fn, /\.dateBlocked\(date,state\)/, 'dateBlocked(date) doit appeler dateBlocked(date,state)');
    assert.match(fn, /calendarEventsForDate\(date\):\[\];return rows\.some\(eventBlocksPlanning\)/, 'dateBlocked(date) doit garder la règle historique V211');
    assert.ok(fn.indexOf('.dateBlocked(date,state)') < fn.indexOf('some(eventBlocksPlanning)'), 'le moteur terrain est consulté avant la règle historique');
    assert.doesNotMatch(RANGE_SOURCE, /ferie|public holiday/i, 'aucune copie du motif férié dans V211');
    const blocks = (RANGE_SOURCE.match(/^function eventBlocksPlanning\(e\)\{[\s\S]*?\n\}/m) || [''])[0];
    assert.equal(blocks, "function eventBlocksPlanning(e){\n  if(!e)return false;\n  if(e.inferredAway)return true;\n  const text=norm((e.title||'')+' '+(e.location||'')+' '+(e.calendar||''));\n  const hard=['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'];\n  for(const word of hard)if(text.includes(word))return true;\n  if(/\\bparis\\b/.test(text))return true;\n  return !!(e.planningBlock&&!e.allDay);\n}", 'eventBlocksPlanning(e) reste identique à r28');
    const globals = Array.from(new Set(Array.from(RANGE_SOURCE.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g), m => m[1]))).sort();
    assert.deepEqual(globals, ['StoreRunnerGeographicV249', 'StoreRunnerPlanningPilotV211', 'generatePlanningRange', 'openDayStoreReplacement', 'storeRunnerGenerateSingleWeek', 'storeRunnerLockDayForWeek', 'storeRunnerLockInfo', 'storeRunnerPinPlannedStore', 'storeRunnerPlannedStoreIsPinned', 'storeRunnerSetRecurringLock', 'storeRunnerUnpinPlannedStore'], 'V211 ne publie aucun nouveau global');
    assert.equal(typeof require(path.join(ROOT, 'terrain-planning-v1.js')).dateBlocked, 'function', 'le prédicat terrain reste une API publique');
  });

  let failed = 0;
  for (const r of results) { console.log((r.ok ? '✓ ' : '✗ ') + r.name + (r.ok ? '' : '\n    → ' + r.error)); if (!r.ok) failed++; }
  console.log('\nP0.2b : ' + (results.length - failed) + '/' + results.length + ' cas verts');
  if (failed) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
