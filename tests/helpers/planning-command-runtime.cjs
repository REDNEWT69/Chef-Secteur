/* Lot B — environnement d'essai du Planning Command Engine avec les VRAIS propriétaires :
   couverture V263, horaires, cycle terrain (V264/H2/M1), verrous V211, recalcul V181,
   planning manuel, V185, V189, V251, ChefReliability (sauvegarde journalisée réelle) et le
   moteur de commandes lui-même, chargés dans un même contexte comme dans index.html.
   Horloge figée, stockage en mémoire, bus d'événements réel (les écouteurs des modules
   réagissent vraiment aux événements émis). Aucun réseau. */
const fs = require('fs'), vm = require('vm'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const KEYS = { MAIN: 'sector_planner_universal_v1', ARCHIVE: 'chef_sector_plan_archive_v1', RANGE: 'chef_sector_range_v1' };
const copy = x => JSON.parse(JSON.stringify(x));
const emptyPlan = () => Object.fromEntries(DAYS.map(d => [d, []]));

const CORE = read('src/chef-secteur.html');
function coreLine(re, label) { const m = CORE.match(re); if (!m) throw new Error('noyau : ' + label + ' introuvable'); return m[0]; }
const CORE_CALENDAR = [
  coreLine(/^function localISO\(date\)\{.*$/m, 'localISO'),
  coreLine(/^function eventDate\(raw\)\{.*$/m, 'eventDate'),
  coreLine(/^window\.calendarEventsForDate=function\(date\)\{.*$/m, 'calendarEventsForDate')
].join('\n');
const SOURCES = {};
for (const f of ['calendar-oauth.js', 'visit-counting.js', 'visit-coverage.js', 'store-opening-hours.js', 'performance-data-v190.js', 'terrain-planning-v1.js', 'range-planner-v2.js', 'planning-cascade-v181.js', 'v182-fixes.js', 'auto-planning-fix.js', 'planning-route-optimizer-v251.js', 'reliability-core.js', 'planning-command-engine.js']) SOURCES[f] = read(f);
const MANUAL_SOURCE = read('planning-manual-visits.js');

/* Géographie réelle (haversine), départ à Lyon. */
const BASE = { id: 'BASE', enseigne: 'Départ', ville: 'Lyon', lat: 45.764, lon: 4.8357 };
function hav(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
/* Secteur Rhône-Alpes : villes à plusieurs magasins (Valence, Lyon, Chambéry, Grenoble) pour
   les ambiguïtés, et Bourg-lès-Valence pour vérifier qu'aucune ville voisine n'est devinée. */
const STORES = [
  ['bv', 'Boulanger', 'Valence', 44.9330, 4.8920], ['dv', 'Darty', 'Valence', 44.9250, 4.9050],
  ['fbv', 'Fnac', 'Bourg-lès-Valence', 44.9470, 4.8940], ['bc', 'Boulanger', 'Chambéry', 45.5660, 5.9200],
  ['dc', 'Darty', 'Chambéry', 45.5730, 5.9110], ['bl', 'Boulanger', 'Lyon', 45.7500, 4.8500],
  ['dl', 'Darty', 'Lyon', 45.7600, 4.8600], ['da', 'Darty', 'Annemasse', 46.1930, 6.2340],
  ['bg', 'Boulanger', 'Grenoble', 45.1880, 5.7240], ['dg', 'Darty', 'Grenoble', 45.1700, 5.7300],
  ['fvi', 'Fnac', 'Villefranche-sur-Saône', 45.9890, 4.7180], ['bvi', 'Boulanger', 'Vienne', 45.5250, 4.8740],
  ['dse', 'Darty', 'Saint-Étienne', 45.4390, 4.3870], ['bse', 'Boulanger', 'Saint-Étienne', 45.4300, 4.4000],
  ['dbo', 'Darty', 'Bourgoin-Jallieu', 45.5870, 5.2790], ['bma', 'Boulanger', 'Mâcon', 46.3060, 4.8280],
  ['dan', 'Darty', 'Annecy', 45.8990, 6.1290], ['bro', 'Boulanger', 'Romans-sur-Isère', 45.0430, 5.0510],
  ['dmo', 'Darty', 'Montélimar', 44.5580, 4.7510], ['fly', 'Fnac', 'Lyon', 45.7610, 4.8570]
].map(([id, enseigne, ville, lat, lon]) => ({ id, enseigne, ville, adresse: '1 rue ' + id, dept: '', lat, lon, priority: 3, active: true, intervalDays: 30, visitMinutes: 45, products: ['Brun'] }));

function makeState(o) {
  return {
    schemaVersion: 5,
    profile: { baseName: 'Domicile', baseAddress: 'Lyon', baseLat: BASE.lat, baseLon: BASE.lon, overnightMode: o.overnightMode || 'auto', overnightMinSaving: 80 },
    settings: { weekDate: o.weekDate, days: (o.days || DAYS.slice(0, 5)).slice(), target: o.target || 12, maxVisitsPerDay: o.max || 4, startTime: '08:00', endTime: '19:00', saturdayStart: '08:00', saturdayEnd: '12:00', visitMinutes: 45, brands: [], products: [] },
    stores: copy(o.stores || STORES), visits: copy(o.visits || {}), notes: {},
    plan: o.plan || emptyPlan(), included: {}, excluded: copy(o.excluded || {}), locks: copy(o.locks || {}), appointments: copy(o.appointments || []),
    manualWeekEdits: copy(o.manualWeekEdits || {}), hotelReservations: {}, calendarEvents: copy(o.calendarEvents || [])
  };
}
function planOf(spec) {
  const plan = emptyPlan();
  for (const [day, list] of Object.entries(spec || {})) plan[day] = list.map(id => { const s = STORES.find(x => x.id === id); if (!s) throw new Error('fixture : ' + id); return copy(s); });
  return plan;
}

const RealDate = Date;
function clock(now) {
  const c = { now };
  c.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [c.now])); }
    static now() { return new RealDate(c.now).getTime(); }
  };
  return c;
}

/* o : {now, weekDate, plan, archive, visits, locks, appointments, calendarEvents, p1, origin,
   failPersistAfter, max, target, days, excluded, manualWeekEdits} */
function runtime(o) {
  const c = clock(o.now), mem = new Map(), listeners = new Map(), events = [];
  let persistCalls = 0;
  const db = {
    getItem: k => mem.has(k) ? mem.get(k) : null,
    setItem: (k, v) => { if (o.failWrite && o.failWrite(k, persistCalls)) throw new Error('quota simulé'); mem.set(k, String(v)); },
    removeItem: k => mem.delete(k), flush: () => Promise.resolve()
  };
  /* Archive toujours présente, comme sur un appareil en service (ChefReliability normalise une
     archive absente en {} : l’égalité octet pour octet des retours arrière le suppose). */
  db.setItem(KEYS.ARCHIVE, JSON.stringify(o.archive || {}));
  const state = makeState(o);
  db.setItem(KEYS.MAIN, JSON.stringify(state));
  const document = {
    readyState: 'loading', hidden: false, head: { appendChild() {} }, body: { appendChild() {} },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { const l = listeners.get(type) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    dispatchEvent(event) { events.push({ type: event.type, detail: event.detail }); for (const fn of (listeners.get(event.type) || []).slice()) { try { fn(event); } catch (e) { /* un écouteur d'affichage sans DOM */ } } return true; },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: tag => ({ tagName: String(tag).toUpperCase(), style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, appendChild() {}, append() {}, addEventListener() {}, insertAdjacentElement() {}, querySelector: () => null, querySelectorAll: () => [], remove() {} })
  };
  const ctx = {
    console, Date: c.Date, Map, Set, JSON, Object, Array, String, Number, Math, RegExp, Promise, Error, Symbol, Intl,
    setTimeout: fn => { try { fn(); } catch (e) {} return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    state, __chefStorage: db, localStorage: db, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => fn(),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    confirm: () => true, renderAll() {}, initControls() {}, readPlanningControls() {}, renderWeek() {}, showError() {},
    save() { db.setItem(KEYS.MAIN, JSON.stringify(ctx.state)); },
    baseObj: () => ({ id: 'BASE', enseigne: 'Départ', ville: ctx.state.profile.baseName, lat: Number(ctx.state.profile.baseLat), lon: Number(ctx.state.profile.baseLon) }),
    hav, havBase: s => hav(ctx.baseObj(), s),
    routeCost: route => { let km = 0, p = ctx.baseObj(); for (const s of route || []) { km += hav(p, s); p = s; } return km; },
    document, navigator: {}
  };
  ctx.window = ctx;
  vm.runInNewContext(CORE_CALENDAR, ctx, { filename: 'src/chef-secteur.html' });
  for (const f of ['calendar-oauth.js', 'visit-counting.js', 'visit-coverage.js', 'store-opening-hours.js', 'performance-data-v190.js']) vm.runInNewContext(SOURCES[f], ctx, { filename: f });
  ctx.chefSecteurPrepareCalendarForPlanning();
  document.readyState = 'complete';
  for (const f of ['terrain-planning-v1.js', 'range-planner-v2.js', 'planning-cascade-v181.js', 'v182-fixes.js', 'auto-planning-fix.js', 'planning-route-optimizer-v251.js', 'reliability-core.js']) vm.runInNewContext(SOURCES[f], ctx, { filename: f });
  /* Le planning manuel est un module UMD : chargé sans document, il reçoit `win` en paramètre. */
  const manualContext = { module: { exports: {} }, Date: c.Date };
  vm.runInNewContext(MANUAL_SOURCE, manualContext, { filename: 'planning-manual-visits.js' });
  ctx.StoreRunnerManualPlanning = manualContext.module.exports;
  ctx.syncGoogleCalendar = async () => ({ ok: true });
  /* V189 : décision découché et application automatique de ChefReliability.propose. */
  ctx.StoreRunnerStoreControlsV189.repair();
  /* r38 : position fraîche contrôlée (par défaut : au départ enregistré). */
  const origin = o.origin || { lat: BASE.lat, lon: BASE.lon };
  ctx.StoreRunnerProfile = {
    resolveCalls: 0,
    async resolvePlanningOrigin() { this.resolveCalls++; return origin.fail ? { ok: false, source: 'none', error: 'Localisation refusée.' } : { ok: true, source: 'gps', lat: origin.lat, lon: origin.lon, accuracy: 12, baseName: 'Ma position actuelle', baseAddress: 'Position GPS', message: 'Position fraîche retenue à ±12 m.' }; },
    applyPlanningOrigin(x) { ctx.state.profile.baseLat = x.lat; ctx.state.profile.baseLon = x.lon; ctx.state.profile.baseName = x.baseName; ctx.state.profile.baseAddress = x.baseAddress; return true; }
  };
  if (o.p1) {
    const P = ctx.StoreRunnerPerformanceV190;
    P.saveSnapshot(db, { week: o.p1Week || 'W41', importedAt: '2026-10-01T09:00:00Z', rows: o.p1.map(id => { const s = STORES.find(x => x.id === id); return { key: 'fixture|' + id, retailer: s.enseigne, site: s.ville, prio: 'P1', pdmYtd: 30, deltaYtd: -5, weeks: {}, deltaWeeks: {}, sellOutWeeks: {}, comment: '' }; }) });
  }
  vm.runInNewContext(SOURCES['planning-command-engine.js'], ctx, { filename: 'planning-command-engine.js' });
  const E = ctx.StoreRunnerPlanningCommandEngine;
  if (!E || !ctx.StoreRunnerTerrainPlanningV1 || !ctx.ChefReliability || !ctx.StoreRunnerManualPlanning.addStore) throw new Error('runtime incomplet');
  const api = {
    ctx, db, mem, events, clock: c, E,
    context: () => E.runtimeContext(new c.Date()),
    snapshot: () => JSON.stringify({ state: ctx.state, main: db.getItem(KEYS.MAIN), archive: db.getItem(KEYS.ARCHIVE), range: db.getItem(KEYS.RANGE) }),
    archive: () => JSON.parse(db.getItem(KEYS.ARCHIVE) || '{}'),
    /* Copies JSON : les objets du contexte vm n'ont pas les prototypes de Node (deepStrictEqual). */
    async run(text, options) { return copy(await E.run(text, api.context(), copy(options || {}))); },
    async apply(session, text) { return copy(await E.apply(copy(session.simulation), api.context(), { createdAt: session.createdAt, text })); },
    planIds(weekKey) { const shown = E.dates.mondayOf(String(ctx.state.settings.weekDate).slice(0, 10)); const p = weekKey === shown ? ctx.state.plan : (api.archive()[weekKey] || {}).plan; return copy(Object.fromEntries(DAYS.map(d => [d, ((p || {})[d] || []).map(s => String(s.id))]))); }
  };
  return api;
}

module.exports = { runtime, planOf, emptyPlan, STORES, BASE, DAYS, KEYS, copy, hav };
