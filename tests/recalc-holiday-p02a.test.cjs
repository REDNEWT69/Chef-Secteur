// P0.2a — « ↻ Recalculer le reste » (planning-cascade-v181.js) ne réutilise plus un jour
// férié que la génération 3 semaines a laissé vide.
//
// Sur r27, V181 décidait seul qu'une date était bloquée : calendarEventsForDate(date).some(blocks).
// L'enveloppe Agenda (calendar-oauth.js) lui donne bien la ligne du férié, mais blocks(e) ne
// connaît pas ce motif : V264 ne l'a ajouté qu'au moteur terrain et à V185. Le jour férié, vide
// donc le plus libre, recevait la première visite à replacer, puis la semaine devenait
// manuelle et une régénération la conservait.
//
// Tout est rejoué sur les VRAIS modules : calendarEventsForDate du noyau (lignes extraites
// telles quelles de src/chef-secteur.html), calendar-oauth.js, visit-coverage.js,
// store-opening-hours.js, terrain-planning-v1.js, planning-cascade-v181.js et, pour la pose
// manuelle verrouillée, planning-manual-visits.js.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const ARCHIVE_KEY = 'chef_sector_plan_archive_v1';
const WEEK = '2026-11-09', HOLIDAY = '2026-11-11';
const copy = x => JSON.parse(JSON.stringify(x));
const emptyPlan = () => Object.fromEntries(DAYS.map(d => [d, []]));
const ids = route => Array.from(route || [], s => String(s.id));

const CORE = read('src/chef-secteur.html');
function coreLine(re, label) { const m = CORE.match(re); if (!m) throw new Error('noyau : ' + label + ' introuvable'); return m[0]; }
const CORE_CALENDAR = [
  coreLine(/^function localISO\(date\)\{.*$/m, 'localISO'),
  coreLine(/^function eventDate\(raw\)\{.*$/m, 'eventDate'),
  coreLine(/^window\.calendarEventsForDate=function\(date\)\{.*$/m, 'calendarEventsForDate')
].join('\n');
const CASCADE = read('planning-cascade-v181.js');
const SOURCES = [
  ['calendar-oauth.js', read('calendar-oauth.js')],
  ['visit-coverage.js', read('visit-coverage.js')],
  ['store-opening-hours.js', read('store-opening-hours.js')]
];
const TERRAIN = read('terrain-planning-v1.js');
const ManualPlanning = require(path.join(ROOT, 'planning-manual-visits.js'));

/* Agenda : un férié tel que syncGoogleCalendar l'écrit depuis l'agenda Google « Jours fériés en
   France » (id agenda:événement, calendar = nom de l'agenda, fin all-day exclusive). */
const HOLIDAY_GOOGLE = { id: 'fr.french#holiday@group.v.calendar.google.com:20261111_armistice', title: 'Armistice 1918', location: '', calendar: 'Jours fériés en France', date: HOLIDAY, start: HOLIDAY, end: '2026-11-12', allDay: true, source: 'google' };
const HOLIDAY_TITLE = { id: 'primary:ferie-20261111', title: 'Jour férié', location: '', calendar: 'Google Agenda', date: HOLIDAY, start: HOLIDAY, end: '2026-11-12', allDay: true, source: 'google' };
const event = (id, title, start, end, allDay) => ({ id: 'primary:' + id, title, location: '', calendar: 'Google Agenda', date: start.slice(0, 10), start, end, allDay, source: 'google' });

/* Horloge déterministe, avançable entre la génération et le recalcul. */
const RealDate = Date;
function clock(now) {
  const c = { now };
  c.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [c.now])); }
    static now() { return new RealDate(c.now).getTime(); }
  };
  return c;
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
    settings: { weekDate: o.weekDate || WEEK, days: DAYS.slice(0, 5), target: 8, maxVisitsPerDay: o.max || 2, startTime: '08:30', endTime: '18:00', saturdayStart: '08:00', saturdayEnd: '12:00', visitMinutes: 45 },
    stores: o.stores, visits: o.visits || {}, businessV2: { visits: [], actions: [], storeSnapshots: {} },
    plan: o.plan || emptyPlan(), included: {}, excluded: {}, locks: o.locks || {}, appointments: o.appointments || [],
    manualWeekEdits: {}, hotelReservations: {}, calendarEvents: o.calendarEvents || []
  };
}

function runtime(state, now) {
  const c = clock(now), mem = new Map();
  const db = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), flush: () => Promise.resolve() };
  const weekInput = { value: state.settings.weekDate };
  const ctx = {
    console, Date: c.Date, Map, Set, JSON, Object, Array, String, Number, Math, RegExp, Promise, Error, Symbol,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    state, __chefStorage: db, localStorage: db, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    confirm: () => true, save() {}, renderAll() {}, initControls() {},
    baseObj: () => BASE, hav, havBase: s => hav(BASE, s),
    routeCost: route => { let km = 0, p = BASE; for (const s of route || []) { km += hav(p, s); p = s; } return (route || []).length ? km + hav(p, BASE) : 0; },
    ChefReliability: {
      checkpoint() {},
      capture: (st, s) => ({ state: copy(st), archive: JSON.parse(s.getItem(ARCHIVE_KEY) || '{}'), range: null }),
      persist: (bundle, s) => { s.setItem(ARCHIVE_KEY, JSON.stringify(bundle.archive || {})); },
      propose: async candidate => {
        ctx.state.plan = copy(candidate.plan);
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
    getElementById: id => id === 'weekDate' ? weekInput : null, querySelector: () => null,
    querySelectorAll: sel => sel === '[data-day]' ? dayBoxes : [],
    createElement: tag => ({ tagName: String(tag).toUpperCase(), style: {}, dataset: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, insertAdjacentElement() {} })
  };
  ctx.window = ctx;
  vm.runInNewContext(CORE_CALENDAR, ctx, { filename: 'src/chef-secteur.html' });
  for (const [name, source] of SOURCES) vm.runInNewContext(source, ctx, { filename: name });
  ctx.chefSecteurPrepareCalendarForPlanning(); // installe l'enveloppe sémantique Agenda, comme au boot
  ctx.document.readyState = 'complete';
  vm.runInNewContext(TERRAIN, ctx, { filename: 'terrain-planning-v1.js' });
  vm.runInNewContext(CASCADE, ctx, { filename: 'planning-cascade-v181.js' });
  if (ctx.__calendarSemanticBlocks !== true) throw new Error('enveloppe sémantique Agenda non installée');
  return { ctx, db, clock: c, weekInput, terrain: ctx.StoreRunnerTerrainPlanningV1 };
}

function build(rt) {
  rt.ctx.__storeRunnerPlanningGenerationActive = true;
  try { return rt.ctx.__storeRunnerBuildRemainingWeekPlan(); } finally { rt.ctx.__storeRunnerPlanningGenerationActive = false; }
}
function dateOf(weekKey, day) { const d = new RealDate(weekKey + 'T12:00:00'); d.setDate(d.getDate() + DAYS.indexOf(day)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function placements(result, id) {
  const out = [];
  for (const [week, plan] of Object.entries(result.weeks || {})) for (const day of DAYS) if (ids(plan[day]).includes(String(id))) out.push(dateOf(week, day));
  return out;
}
function signature(result) {
  return JSON.stringify({ ok: result.ok, error: result.error || '', moved: result.moved, removed: (result.removed || []).map(x => x.id + '@' + x.date), added: (result.added || []).map(x => x.id + '@' + x.date),
    weeks: Object.fromEntries(Object.entries(result.weeks || {}).sort().map(([k, p]) => [k, DAYS.map(d => ids(p[d]).join(','))])) });
}
/* Même état, trois lectures du module terrain : absent, présent mais sans blocage, en panne.
   Les trois doivent donner la règle historique de V181, à l'identique. Dans un contexte vm,
   `delete` ne retire pas une propriété déjà vue par le global du contexte : l'absence est
   donc simulée par une affectation à undefined. */
function historicalRuleOnly(rt) {
  const terrain = rt.ctx.StoreRunnerTerrainPlanningV1;
  try {
    rt.ctx.StoreRunnerTerrainPlanningV1 = undefined;
    const absent = build(rt);
    rt.ctx.StoreRunnerTerrainPlanningV1 = { dateBlocked: () => false };
    const neutral = build(rt);
    rt.ctx.StoreRunnerTerrainPlanningV1 = { dateBlocked() { throw new Error('terrain indisponible'); } };
    const failing = build(rt);
    return { absent, neutral, failing };
  } finally { rt.ctx.StoreRunnerTerrainPlanningV1 = terrain; }
}

/* Le férié doit être le SEUL bloqueur de sa date : une seule ligne Agenda la couvre et, sans
   cet événement, rien ne bloque la date. */
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

/* Génération 3 semaines réelle le lundi 09/11 à 08:00, puis mardi 10/11 à 09:00 : le premier
   magasin du lundi a été visité, le second raté. Mardi est plein : le premier jour libre pour
   la visite ratée est le férié du mercredi. */
async function generateThenRecalc(holiday) {
  const rt = runtime(makeState({ stores: ring(), calendarEvents: [holiday] }), WEEK + 'T08:00:00');
  assertOnlyBlocker(rt, holiday);
  const built = await rt.terrain.generateThreeWeekSnail({ start: WEEK });
  const generated = rt.ctx.state.plan, week1 = built.weeks[0];
  assert.equal(week1.weekKey, WEEK);
  assert.deepEqual(ids(generated.Mercredi), [], 'génération 3 semaines : le férié du mercredi 11/11 doit rester vide');
  assert.equal(week1.diagnostics.find(r => r.day === 'Mercredi').status, 'blocked', 'génération : mercredi 11/11 diagnostiqué bloqué');
  const monday = ids(generated.Lundi), tuesday = ids(generated.Mardi), max = rt.ctx.state.settings.maxVisitsPerDay;
  assert.equal(monday.length, 2, 'précondition : deux magasins lundi');
  assert.equal(tuesday.length, max, 'précondition : mardi plein, le mercredi férié est le premier jour libre');
  rt.clock.now = '2026-11-10T09:00:00';
  const [done, missed] = monday;
  rt.ctx.state.visits[done] = { lastVisit: WEEK, history: [WEEK] };
  rt.weekInput.value = WEEK;
  return { rt, done, missed };
}
async function assertHolidayKeptEmpty(holiday) {
  const { rt, done, missed } = await generateThenRecalc(holiday);
  const result = build(rt);
  assert.equal(result.ok, true, result.error || 'recalcul possible');
  assert.deepEqual(ids(result.weeks[WEEK].Mercredi), [], '« ' + holiday.title + ' » : le recalcul V181 a replacé ' + ids(result.weeks[WEEK].Mercredi).join(', ') + ' sur le férié du mercredi 11/11');
  const where = placements(result, missed);
  assert.equal(where.length, 1, 'la visite ratée ' + missed + ' doit être replacée exactement une fois');
  assert.ok(where[0] > '2026-11-10' && !rt.terrain.dateBlocked(where[0], rt.ctx.state), 'la visite ratée doit aller sur un jour libre, pas sur ' + where[0]);
  assert.deepEqual(ids(result.weeks[WEEK].Lundi), [done], 'la visite faite lundi reste en place');
  const applied = await rt.ctx.storeRunnerRecalculateRemainingWeek();
  assert.equal(applied.ok, true, applied.error || 'recalcul appliqué');
  assert.deepEqual(ids(rt.ctx.state.plan.Mercredi), [], 'après application, le plan affiché garde le férié vide');
  const archive = JSON.parse(rt.db.getItem(ARCHIVE_KEY) || '{}');
  assert.deepEqual(ids(archive[WEEK].plan.Mercredi), [], 'après application, l’archive garde le férié vide');
}

/* Plan construit à la main pour la semaine du 09/11, recalcul mardi 10/11 à 09:00 (sauf mention). */
function plannedRuntime(o) {
  const byId = id => o.stores.find(s => s.id === id);
  const plan = emptyPlan();
  for (const [day, list] of Object.entries(o.plan)) plan[day] = list.map(byId);
  const state = makeState(Object.assign({}, o, { plan }));
  const rt = runtime(state, o.now || '2026-11-10T09:00:00');
  rt.db.setItem(ARCHIVE_KEY, JSON.stringify({ [o.weekDate || WEEK]: { weekMonday: o.weekDate || WEEK, plan: copy(plan) } }));
  return rt;
}

(async () => {
  /* ------------------------------------------------------------ preuve rouge ---- */
  await scenario('A — férié Google « Jours fériés en France » (Armistice 1918), seul bloqueur : mercredi 11/11 reste vide après recalcul', () => assertHolidayKeptEmpty(HOLIDAY_GOOGLE));
  await scenario('B — titre explicite « Jour férié » : mercredi 11/11 reste vide après recalcul', () => assertHolidayKeptEmpty(HOLIDAY_TITLE));

  await scenario('C — fillFreedSlots ne comble jamais le férié', async () => {
    // X, visité lundi, est retiré de jeudi par la garde VisitCoverage : son créneau libéré va à
    // N (jamais visité). N est à 3 km du départ, A/B/C à 40 km : sans blocage, la journée vide la
    // plus « cohérente » pour N est le férié.
    const stores = [store('A', 40, 0), store('B', 0, 40), store('C', -40, 0), store('X', 20, 20), store('N', 0, -3)];
    const rt = plannedRuntime({ stores, calendarEvents: [HOLIDAY_GOOGLE], visits: { X: { lastVisit: WEEK, history: [WEEK] } },
      plan: { Mardi: ['A'], Jeudi: ['B', 'X'], Vendredi: ['C'] } });
    assertOnlyBlocker(rt, HOLIDAY_GOOGLE);
    const result = build(rt);
    assert.equal(result.ok, true, result.error || 'recalcul possible');
    assert.deepEqual(Array.from(result.removed, x => x.id), ['X'], 'précondition : X retiré par la garde VisitCoverage');
    assert.deepEqual(Array.from(result.added, x => x.id), ['N'], 'le créneau libéré doit être comblé par N');
    assert.notEqual(result.added[0].date, HOLIDAY, 'fillFreedSlots a comblé le férié du mercredi 11/11 avec N');
    assert.deepEqual(ids(result.weeks[WEEK].Mercredi), [], 'le férié reste vide');
  });

  await scenario('D — une visite non fixe déjà posée sur le férié est déplacée', async () => {
    const stores = [store('P', 12, 5), store('F', 15, -10), store('Q', -10, 12)];
    const rt = plannedRuntime({ stores, calendarEvents: [HOLIDAY_GOOGLE], plan: { Mardi: ['P'], Mercredi: ['F'], Jeudi: ['Q'] } });
    const result = build(rt);
    assert.equal(result.ok, true, result.error || 'recalcul possible');
    assert.deepEqual(ids(result.weeks[WEEK].Mercredi), [], 'la visite non fixe F est restée sur le férié du mercredi 11/11');
    const where = placements(result, 'F');
    assert.equal(where.length, 1, 'F replacé exactement une fois');
    assert.ok(where[0] > HOLIDAY, 'F replacé après le férié, pas sur ' + where[0]);
    assert.equal(result.moved, 1, 'une seule visite déplacée');
  });

  /* --------------------- contraintes explicites sur le férié (contrat P0.3) ---- */
  /* Un rendez-vous, un verrou ou une pose manuelle verrouillée sur le férié est une contrainte
     future impossible : le recalcul est refusé, plan et archive restent intacts. Une visite déjà
     réalisée ce jour-là est un fait : elle reste en place et la visite libre du même jour part. */
  for (const [label, kind] of [['E-A', 'rendez-vous'], ['E-B', 'verrou'], ['E-C', 'pose manuelle verrouillée']]) {
    await scenario(label + ' — ' + kind + ' sur le férié : recalcul refusé, plan et archive inchangés', async () => {
      const stores = [store('K', 10, 10), store('FREE', -12, 6), store('Z', 8, -14)];
      const o = { stores, calendarEvents: [HOLIDAY_GOOGLE], plan: { Mercredi: ['K', 'FREE'], Jeudi: ['Z'] } };
      if (kind === 'rendez-vous') o.appointments = [{ id: 'rdv-ferie', storeId: 'K', date: HOLIDAY, time: '10:00', duration: 60, type: 'Visite', note: '' }];
      if (kind === 'verrou') o.locks = { K: 'Mercredi' };
      if (kind === 'pose manuelle verrouillée') o.plan = { Mardi: ['K'], Mercredi: ['FREE'], Jeudi: ['Z'] };
      const rt = plannedRuntime(o);
      if (kind === 'pose manuelle verrouillée') {
        // Vraie pose manuelle : le propriétaire déplace K sur le férié et écrit un verrou daté.
        const posed = await ManualPlanning.addStore(rt.ctx, 'K', 'Mercredi');
        assert.equal(posed.ok, true, posed.error || 'pose manuelle acceptée');
        assert.deepEqual(rt.ctx.state.locks.K, { day: 'Mercredi', week: WEEK }, 'précondition : verrou daté écrit par la pose manuelle');
        assert.deepEqual(ids(rt.ctx.state.plan.Mercredi).sort(), ['FREE', 'K'], 'précondition : K posé sur le férié');
      }
      const plan = JSON.stringify(rt.ctx.state.plan), archive = rt.db.getItem(ARCHIVE_KEY);
      const result = build(rt);
      assert.equal(result.ok, false, kind + ' sur le férié : le recalcul doit être refusé (obtenu ok=' + result.ok + ')');
      assert.match(result.error, /n’est pas disponible/);
      assert.match(result.error, /Rien n’a été changé/);
      const applied = await rt.ctx.storeRunnerRecalculateRemainingWeek();
      assert.equal(applied.ok, false, 'l’application du recalcul est refusée elle aussi');
      assert.equal(JSON.stringify(rt.ctx.state.plan), plan, kind + ' : le plan affiché reste inchangé');
      assert.equal(rt.db.getItem(ARCHIVE_KEY), archive, kind + ' : l’archive reste inchangée');
    });
  }

  await scenario('E-D — visite déjà réalisée sur le férié : elle reste en place, la visite libre du même jour part (comportement historique, aucun faux conflit)', async () => {
    const stores = [store('K', 10, 10), store('FREE', -12, 6), store('Z', 8, -14)];
    const rt = plannedRuntime({ stores, calendarEvents: [HOLIDAY_GOOGLE], plan: { Mercredi: ['K', 'FREE'], Jeudi: ['Z'] },
      now: HOLIDAY + 'T15:00:00', visits: { K: { lastVisit: HOLIDAY, history: [HOLIDAY] } } });
    const result = build(rt);
    assert.equal(result.ok, true, result.error || 'recalcul possible : une visite réalisée n’est pas un conflit');
    assert.deepEqual(ids(result.weeks[WEEK].Mercredi), ['K'], 'seule la visite réalisée K doit rester sur le férié (obtenu : ' + ids(result.weeks[WEEK].Mercredi).join(', ') + ')');
    assert.equal(placements(result, 'FREE').length, 1, 'la visite libre est replacée exactement une fois');
    assert.notEqual(placements(result, 'FREE')[0], HOLIDAY);
  });

  /* ---------------------------------------------------------- non-régressions ---- */
  /* Chaque cas : même décision qu'avant P0.2a (règle historique seule, module terrain absent,
     neutre ou en panne) et le résultat attendu sur la date observée. */
  const regressions = [
    { name: 'congé all-day multi-jours jeudi 12 → vendredi 13 (fin exclusive samedi 14)', events: [event('conges', 'Congés', '2026-11-12', '2026-11-14', true)],
      plan: { Mardi: ['K'], Vendredi: ['FREE'] }, watch: '2026-11-13', expectFree: 'moved', terrainBlocked: true },
    { name: 'formation horaire 09:00–12:00 mercredi 11/11', events: [event('formation', 'Formation produit', HOLIDAY + 'T09:00:00', HOLIDAY + 'T12:00:00', false)],
      plan: { Mardi: ['K'], Mercredi: ['FREE'] }, watch: HOLIDAY, expectFree: 'moved', terrainBlocked: true },
    { name: 'all-day neutre « Anniversaire équipe » mercredi 11/11', events: [event('anniv', 'Anniversaire équipe', HOLIDAY, '2026-11-12', true)],
      plan: { Mardi: ['K'], Mercredi: ['FREE'] }, watch: HOLIDAY, expectFree: 'stays', terrainBlocked: false },
    { name: '« Rendez-vous avec Fériel » 10:00–11:00 mercredi 11/11 n’est pas un férié', events: [event('feriel', 'Rendez-vous avec Fériel', HOLIDAY + 'T10:00:00', HOLIDAY + 'T11:00:00', false)],
      plan: { Mardi: ['K'], Mercredi: ['FREE'] }, watch: HOLIDAY, expectFree: 'stays', terrainBlocked: false },
    { name: 'déplacement Paris déduit mardi 17/11 (inferredAway) : toujours bloqué par V181', weekDate: '2026-11-16', now: '2026-11-16T06:00:00',
      events: [event('tgv-aller', 'TGV Lyon → Paris', '2026-11-16T07:00:00', '2026-11-16T09:00:00', false), event('tgv-retour', 'TGV retour Paris → Lyon', '2026-11-18T17:00:00', '2026-11-18T19:00:00', false)],
      plan: { Mardi: ['FREE'], Jeudi: ['K'] }, watch: '2026-11-17', expectFree: 'moved', terrainBlocked: false, inferred: true }
  ];
  for (const c of regressions) {
    await scenario('F — ' + c.name, async () => {
      const stores = [store('K', 10, 10), store('FREE', -12, 6)];
      const rt = plannedRuntime({ stores, calendarEvents: c.events, plan: c.plan, weekDate: c.weekDate, now: c.now });
      if (c.weekDate) rt.weekInput.value = c.weekDate;
      assert.equal(rt.terrain.dateBlocked(c.watch, rt.ctx.state), c.terrainBlocked, 'moteur terrain inchangé pour le ' + c.watch);
      if (c.inferred) assert.ok(rt.ctx.calendarEventsForDate(c.watch).some(r => r.inferredAway), 'précondition : ligne Agenda déduite (inferredAway) le ' + c.watch);
      const result = build(rt), history = historicalRuleOnly(rt);
      assert.equal(result.ok, true, result.error || 'recalcul possible');
      for (const [label, other] of Object.entries(history)) assert.equal(signature(other), signature(result), 'sortie différente de la règle historique V181 (module terrain ' + label + ')');
      const where = placements(result, 'FREE');
      assert.equal(where.length, 1, 'FREE présent exactement une fois');
      if (c.expectFree === 'moved') assert.notEqual(where[0], c.watch, 'la date ' + c.watch + ' doit rester bloquée pour V181');
      else assert.equal(where[0], c.watch, 'la date ' + c.watch + ' ne doit pas être bloquée');
    });
  }

  await scenario('G — sans module terrain (absent, neutre ou en panne), V181 garde exactement sa règle historique', async () => {
    const { rt, missed } = await generateThenRecalc(HOLIDAY_GOOGLE);
    const { absent, neutral, failing } = historicalRuleOnly(rt);
    assert.equal(absent.ok, true, absent.error || 'recalcul possible sans module terrain');
    assert.equal(signature(neutral), signature(absent), 'module terrain neutre : même sortie que sans module');
    assert.equal(signature(failing), signature(absent), 'module terrain en panne : même sortie que sans module');
    // La règle historique ne connaît pas le férié : c'est le module terrain qui porte ce motif,
    // jamais une copie dans V181.
    assert.deepEqual(ids(absent.weeks[WEEK].Mercredi), [missed], 'sans module terrain, le comportement r27 doit rester identique');
    assert.deepEqual(ids(build(rt).weeks[WEEK].Mercredi), [], 'avec le module terrain, le férié reste vide');
  });

  await scenario('H — V181 délègue au prédicat terrain sans recopier le motif férié ni publier de nouveau global', () => {
    const blockedFn = (CASCADE.match(/^function blocked\(date\)\{.*$/m) || [''])[0];
    assert.match(blockedFn, /window\.StoreRunnerTerrainPlanningV1/, 'blocked(date) doit interroger le moteur terrain');
    assert.match(blockedFn, /\.dateBlocked\(date,state\)/, 'blocked(date) doit appeler dateBlocked(date,state)');
    assert.match(blockedFn, /calendarEventsForDate\(date\):\[\]\)\.some\(blocks\)/, 'blocked(date) doit garder la règle historique V181');
    assert.ok(blockedFn.indexOf('dateBlocked') < blockedFn.indexOf('some(blocks)'), 'le moteur terrain est consulté avant la règle historique');
    assert.doesNotMatch(CASCADE, /\\bferies\?|public holidays\?/, 'aucune copie du motif férié dans V181');
    const globals = Array.from(new Set(Array.from(CASCADE.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g), m => m[1]))).sort();
    assert.deepEqual(globals, ['__storeRunnerBuildRemainingWeekPlan', '__storeRunnerPlanningGenerationActive', 'storeRunnerRecalculateRemainingWeek'], 'V181 ne publie aucun nouveau global');
    assert.equal(typeof require(path.join(ROOT, 'terrain-planning-v1.js')).dateBlocked, 'function', 'le prédicat terrain reste une API publique');
  });

  let failed = 0;
  for (const r of results) { console.log((r.ok ? '✓ ' : '✗ ') + r.name + (r.ok ? '' : '\n    → ' + r.error)); if (!r.ok) failed++; }
  console.log('\nP0.2a : ' + (results.length - failed) + '/' + results.length + ' cas verts');
  if (failed) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
