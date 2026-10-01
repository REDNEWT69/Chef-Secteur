// P0.3 — PHASE ROUGE : protections du planning (semaine manuelle, rendez-vous, verrous, cascade).
//
// Contrat métier commun aux trois chemins de planning, figé AVANT toute correction :
//   - génération V211 semaine / période ............ range-planner-v2.js
//   - génération standard 3 semaines ............... terrain-planning-v1.js
//   - « Recalculer le reste du planning » (cascade) . planning-cascade-v181.js
//
// Aucun runtime n'est corrigé dans cette phase : les cas qui démontrent un vrai défaut r29
// restent volontairement rouges, les cas déjà conformes sont verts.
//
// Tout est rejoué sur les VRAIS modules : calendarEventsForDate du noyau (lignes extraites
// telles quelles de src/chef-secteur.html), calendar-oauth.js, visit-counting.js,
// visit-coverage.js, store-opening-hours.js, terrain-planning-v1.js, range-planner-v2.js et
// planning-cascade-v181.js. Seuls sont remplacés : syncGoogleCalendar (réseau : l'Agenda est
// déjà dans state.calendarEvents) et ChefReliability (persistance en mémoire, application
// identique à l'application automatique V189 d'auto-planning-fix.js).
//
// Horloge figée : « aujourd'hui » = lundi 02/11/2026 08:00 (Date et Date.now remplacés).
// Jour bloqué standard : mercredi 11/11/2026, agenda « Jours fériés en France », événement
// « Armistice 1918 », reconnu par le vrai StoreRunnerTerrainPlanningV1.dateBlocked.
//
// Verdict E/F/G/K/L. VERT si le moteur refuse proprement l'opération (refus volontaire, aucune
// mutation), ou renvoie un plan applicable STRICTEMENT identique au plan sentinelle sur tout
// le périmètre de l'opération. ROUGE, avec sa cause, si le plan renvoyé est applicable et :
//   1. le magasin contraint a disparu ;
//   2. le magasin contraint est placé sur un autre jour que sa contrainte ;
//   3. une autre partie du planning diffère du plan sentinelle (mutation partielle) ;
// ou 4. crash : exception technique (TypeError, ReferenceError, RangeError…), jamais un refus.
// Un refus volontaire est une erreur construite par le moteur lui-même (`Error(…)`), repérée
// ci-dessous au moment de sa construction. La forme du futur message de conflit n'est
// volontairement pas testée : elle sera décidée en phase verte.
const fs = require('fs'), vm = require('vm'), path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const WORK = DAYS.slice(0, 5);
const ARCHIVE_KEY = 'chef_sector_plan_archive_v1', RANGE_KEY = 'chef_sector_range_v1', MAIN_KEY = 'sector_planner_universal_v1';
const NOW = '2026-11-02T08:00:00';
const W0 = '2026-11-02', W1 = '2026-11-09', W2 = '2026-11-16';
const HOLIDAY = '2026-11-11';
const EDITED_AT = '2026-10-30T10:00:00.000Z'; // retouche utilisateur faite avant « aujourd'hui »
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
const RANGE_SOURCE = read('range-planner-v2.js');
const HOOK = 'window.generatePlanningRange=generateRange;';
if (!RANGE_SOURCE.includes(HOOK)) throw new Error('range-planner-v2.js : point d’accroche introuvable');
/* Exposition en lecture seule des points d'entrée V211, comme tests/range-holiday-p02b.test.cjs. */
const RANGE = RANGE_SOURCE.replace(HOOK, 'window.__p03Range={strictSingleWeek,generateRange};' + HOOK);
/* Modules chargés pendant readyState « loading » (leur boot DOM reste en attente), puis ceux
   qui s'installent immédiatement une fois le document prêt — même ordre que P0.2a/P0.2b. */
const EARLY = [['calendar-oauth.js', read('calendar-oauth.js')], ['visit-counting.js', read('visit-counting.js')], ['visit-coverage.js', read('visit-coverage.js')], ['store-opening-hours.js', read('store-opening-hours.js')]];
const LATE = [['terrain-planning-v1.js', read('terrain-planning-v1.js')], ['range-planner-v2.js', RANGE], ['planning-cascade-v181.js', read('planning-cascade-v181.js')]];

/* Férié tel que syncGoogleCalendar l'écrit depuis l'agenda Google « Jours fériés en France ». */
const HOLIDAY_GOOGLE = { id: 'fr.french#holiday@group.v.calendar.google.com:20261111_armistice', title: 'Armistice 1918', location: '', calendar: 'Jours fériés en France', date: HOLIDAY, start: HOLIDAY, end: '2026-11-12', allDay: true, source: 'google' };

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
/* Secteur de 30 magasins entre 8 et 45 km du départ, en anneau déterministe (P0.2a/P0.2b). */
function ring() {
  return Array.from({ length: 30 }, (_, i) => {
    const a = (i * 137.508) * Math.PI / 180, km = 8 + (i * 7) % 38;
    return store('s' + String(i + 1).padStart(2, '0'), km * Math.cos(a), km * Math.sin(a));
  });
}
/* Petit secteur nommé pour la cascade : 8 à 40 km au nord du départ. */
function named(list, extra) { return list.map((id, i) => store(id, 8 + (i % 7) * 4, ((i * 5) % 11) - 5, extra && extra[id])); }
function planOf(stores, spec) {
  const plan = emptyPlan();
  for (const [day, list] of Object.entries(spec)) plan[day] = list.map(id => { const s = stores.find(x => x.id === id); if (!s) throw new Error('fixture : magasin ' + id + ' inconnu'); return copy(s); });
  return plan;
}
/* Marqueurs d'une vraie retouche, tels que planning-manual-visits.js (persist) les écrit :
   state.manualWeekEdits[semaine] = {at, plan} et archive[semaine] = {…, manualEdited:true,
   manualEditedAt:at}. `form` isole l'une ou l'autre protection. */
function protect(o, week, plan, form) {
  o.archive = o.archive || {}; o.manualWeekEdits = o.manualWeekEdits || {};
  if (form !== 'state') o.archive[week] = Object.assign({}, o.archive[week] || {}, { weekMonday: week, plan: copy(plan), manualEdited: true, manualEditedAt: EDITED_AT });
  if (form !== 'archive') o.manualWeekEdits[week] = { at: EDITED_AT, plan: copy(plan) };
  return o;
}
/* Rendez-vous tel que saveAppointment le stocke. 14:00 : atteignable après un premier arrêt. */
const rdv = (storeId, date) => ({ id: 'rdv-' + storeId + '-' + date, storeId, date, time: '14:00', duration: 60, type: 'Visite', note: '' });

function makeState(o) {
  return {
    profile: { baseName: 'Lyon', baseLat: BASE.lat, baseLon: BASE.lon, overnightMode: 'never' },
    settings: { weekDate: o.weekDate || W0, days: WORK.slice(), target: o.target || 8, maxVisitsPerDay: o.max || 2, startTime: '08:30', endTime: '18:00', saturdayStart: '08:00', saturdayEnd: '12:00', visitMinutes: 45 },
    stores: o.stores, visits: {}, businessV2: { visits: [], actions: [], storeSnapshots: {} },
    plan: o.plan || emptyPlan(), included: {}, excluded: {}, locks: o.locks || {}, appointments: o.appointments || [],
    manualWeekEdits: o.manualWeekEdits || {}, hotelReservations: {}, calendarEvents: o.calendarEvents || []
  };
}

function runtime(o) {
  const c = clock(o.now || NOW), mem = new Map(), proposals = [], refusals = [];
  const db = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), flush: () => Promise.resolve() };
  if (o.archive) db.setItem(ARCHIVE_KEY, JSON.stringify(o.archive));
  const state = makeState(o);
  /* Toute erreur construite par le code des moteurs (`Error(…)` ou `new Error(…)`) est notée :
     c'est la forme de leurs refus volontaires. Une exception technique naît dans le moteur
     JavaScript lui-même et n'apparaît jamais ici. */
  function EngineError(message) { const e = new Error(message); refusals.push(e); return e; }
  EngineError.prototype = Error.prototype;
  const els = {
    weekDate: { value: state.settings.weekDate }, rangeStart: { value: o.rangeStart || '', dataset: {} }, rangeEnd: { value: o.rangeEnd || '' },
    endTime: { value: '18:00' }, maxVisitsPerDay: { value: String(state.settings.maxVisitsPerDay) },
    generateRangeBtn: { disabled: false }, rangePlanStatus: { style: {}, textContent: '' }, statusText: { textContent: '' },
    planningGenerateStatus: { style: {}, textContent: '' }
  };
  const ctx = {
    console, Date: c.Date, Map, Set, JSON, Object, Array, String, Number, Math, RegExp, Promise, Error: EngineError, Symbol,
    setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    state, __chefStorage: db, localStorage: db, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => fn(),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    confirm: () => true, save() {}, renderAll() {}, initControls() {}, readPlanningControls() {},
    baseObj: () => BASE, hav, havBase: s => hav(BASE, s),
    routeCost: route => { let km = 0, p = BASE; for (const s of route || []) { km += hav(p, s); p = s; } return (route || []).length ? km + hav(p, BASE) : 0; },
    ChefReliability: {
      checkpoint() {},
      capture: (st, s) => ({ state: copy(st), archive: JSON.parse(s.getItem(ARCHIVE_KEY) || '{}'), range: JSON.parse(s.getItem(RANGE_KEY) || 'null') }),
      persist: (bundle, s) => { s.setItem(ARCHIVE_KEY, JSON.stringify(bundle.archive || {})); s.setItem(RANGE_KEY, JSON.stringify(bundle.range === undefined ? null : bundle.range)); s.setItem(MAIN_KEY, JSON.stringify(bundle.state)); },
      /* Application automatique V189 : plan, semaine, archive et période remplacent l'existant. */
      propose: async candidate => {
        proposals.push(copy(candidate));
        const next = copy(ctx.state); next.plan = copy(candidate.plan || {}); if (candidate.weekDate) next.settings.weekDate = candidate.weekDate;
        if (candidate.archive) db.setItem(ARCHIVE_KEY, JSON.stringify(candidate.archive));
        if (candidate.range) db.setItem(RANGE_KEY, JSON.stringify(candidate.range));
        db.setItem(MAIN_KEY, JSON.stringify(next)); ctx.state = next; return true;
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
  for (const [name, source] of EARLY) vm.runInNewContext(source, ctx, { filename: name });
  ctx.chefSecteurPrepareCalendarForPlanning(); // installe l'enveloppe sémantique Agenda, comme au boot
  if (ctx.__calendarSemanticBlocks !== true) throw new Error('enveloppe sémantique Agenda non installée');
  ctx.document.readyState = 'complete';
  for (const [name, source] of LATE) vm.runInNewContext(source, ctx, { filename: name });
  ctx.syncGoogleCalendar = async () => ({ ok: true });
  const terrain = ctx.StoreRunnerTerrainPlanningV1, range = ctx.__p03Range;
  if (!terrain || typeof terrain.dateBlocked !== 'function' || typeof terrain.generateThreeWeekSnail !== 'function') throw new Error('moteur terrain non chargé');
  if (!range || typeof range.strictSingleWeek !== 'function') throw new Error('V211 non chargé');
  if (typeof ctx.__storeRunnerBuildRemainingWeekPlan !== 'function' || typeof ctx.storeRunnerRecalculateRemainingWeek !== 'function') throw new Error('V181 non installé');
  return { ctx, db, mem, els, clock: c, proposals, refusals, terrain, range };
}

/* ------------------------------------------------------------------ lectures ---- */
function dateOf(weekKey, day) { const d = new RealDate(weekKey + 'T12:00:00'); d.setDate(d.getDate() + DAYS.indexOf(day)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayOf(date) { return DAYS[(new RealDate(date + 'T12:00:00').getDay() || 7) - 1] || ''; }
function weekOf(date) { const d = new RealDate(date + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() || 7) - 1)); return dateOf(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), 'Lundi'); }
function planIds(plan) { return Object.fromEntries(DAYS.map(d => [d, ids(plan && plan[d])])); }
function sameIds(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
/* Instantané structurel déterministe d'une valeur quelconque (objet de verrous, liste de
   rendez-vous…) : clés d'objet triées, ordre des tableaux conservé. C'est une chaîne : prise
   avant l'opération, elle ne peut pas suivre une mutation en place de l'objet observé. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function structural(value) { return JSON.stringify(canonical(value === undefined ? null : value)); }
function samePlan(a, b) { return sameIds(planIds(a), planIds(b)); }
function archiveOf(rt) { return JSON.parse(rt.db.getItem(ARCHIVE_KEY) || '{}'); }
function signatureOf(plan) { return DAYS.map(day => ids(plan && plan[day]).join('|')).join('||'); }
/* Différence lisible entre deux plans exprimés en identifiants. */
function diffIds(b, a) {
  const where = p => { const m = new Map(); for (const d of DAYS) p[d].forEach(id => m.set(id, d)); return m; };
  const wb = where(b), wa = where(a), out = [];
  for (const [id, d] of wa) { if (!wb.has(id)) out.push('+' + id + ' ' + d); else if (wb.get(id) !== d) out.push(id + ' ' + wb.get(id) + '→' + d); }
  for (const [id, d] of wb) if (!wa.has(id)) out.push('−' + id + ' ' + d);
  for (const d of DAYS) { const x = b[d].filter(id => wa.get(id) === d), y = a[d].filter(id => wb.get(id) === d); if (x.join() !== y.join()) out.push('ordre ' + d); }
  return out.join(', ') || 'identique';
}
function planDiff(before, after) { return diffIds(planIds(before), planIds(after)); }
function placements(weeks, id) {
  const out = [];
  for (const [week, plan] of Object.entries(weeks || {})) for (const day of DAYS) if (ids(plan && plan[day]).includes(String(id))) out.push({ week, day, date: dateOf(week, day) });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function snapshot(rt) { return { state: JSON.stringify(rt.ctx.state), storage: JSON.stringify(Array.from(rt.mem.entries()).sort()) }; }
function snapshotDiff(before, after) {
  const out = [];
  if (before.state !== after.state) {
    const b = JSON.parse(before.state), a = JSON.parse(after.state);
    for (const k of Array.from(new Set(Object.keys(b).concat(Object.keys(a)))).sort()) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out.push('state.' + k);
  }
  if (before.storage !== after.storage) {
    const b = new Map(JSON.parse(before.storage)), a = new Map(JSON.parse(after.storage));
    for (const k of Array.from(new Set(Array.from(b.keys()).concat(Array.from(a.keys())))).sort()) if (b.get(k) !== a.get(k)) out.push('stockage ' + k);
  }
  return out.join(', ');
}
function build(rt) {
  rt.ctx.__storeRunnerPlanningGenerationActive = true;
  try { return rt.ctx.__storeRunnerBuildRemainingWeekPlan(); } finally { rt.ctx.__storeRunnerPlanningGenerationActive = false; }
}

/* --------------------------------------------------------------- exceptions ---- */
const exceptions = [];
function describe(rt, e) {
  const controlled = rt.refusals.includes(e);
  return { type: e && e.name ? String(e.name) : typeof e, message: e && e.message !== undefined ? String(e.message) : String(e), controlled };
}
/* Exécute un point d'entrée moteur : une exception qui en sort est décrite (type exact,
   message exact, refus volontaire ou crash) et notée pour le rapport. */
async function engine(rt, label, fn) {
  try { return { value: await fn() }; }
  catch (e) { const info = describe(rt, e); exceptions.push(Object.assign({ case: label }, info)); return { threw: true, error: info }; }
}
/* V211 avale ses exceptions (strictSingleWeek → {ok:false,error}, generateRange → statut) :
   le message exact est rapproché des erreurs que le moteur a lui-même construites. */
function swallowed(rt, label, message) {
  const own = rt.refusals.find(e => e.message === message);
  const info = own ? { type: String(own.name), message, controlled: true } : { type: 'non observable (exception avalée par le point d’entrée V211)', message, controlled: false };
  exceptions.push(Object.assign({ case: label }, info));
  return info;
}

/* --------------------------------------------------------------- verdict EFG ---- */
/* sentinel / weeks : plans par semaine ; id : magasin contraint ; allowed(date) : dates que la
   contrainte autorise ; constrainedWeeks : semaines où la contrainte porte sur ce magasin. */
function efg(o) {
  if (!o.applicable) {
    if (!o.refusal || !o.refusal.controlled) return { ok: false, causes: [4], detail: 'crash ' + (o.refusal ? o.refusal.type + ' « ' + o.refusal.message + ' »' : 'sans message') };
    if (o.mutated) return { ok: false, causes: [3], detail: 'refus annoncé mais données modifiées : ' + o.mutated };
    return { ok: true, detail: 'refus volontaire, aucune mutation : « ' + o.refusal.message + ' »' };
  }
  const causes = new Set(), details = [];
  const keys = Array.from(new Set(Object.keys(o.sentinel).concat(Object.keys(o.weeks)))).sort();
  for (const key of keys) {
    const s = planIds(o.sentinel[key]), w = planIds(o.weeks[key]);
    if (o.constrainedWeeks.has(key)) {
      const had = DAYS.some(d => s[d].includes(o.id)), at = DAYS.filter(d => w[d].includes(o.id));
      if (had && !at.length) { causes.add(1); details.push('[1] ' + o.id + ' absent de la semaine du ' + key); }
      for (const d of at) if (!o.allowed(dateOf(key, d))) { causes.add(2); details.push('[2] ' + o.id + ' posé ' + d + ' ' + dateOf(key, d) + ' au lieu de sa contrainte'); }
      const strip = p => Object.fromEntries(DAYS.map(d => [d, p[d].filter(x => x !== o.id)]));
      if (!sameIds(strip(s), strip(w))) { causes.add(3); details.push('[3] semaine du ' + key + ' hors ' + o.id + ' : ' + diffIds(strip(s), strip(w))); }
    } else if (!sameIds(s, w)) { causes.add(3); details.push('[3] semaine du ' + key + ' : ' + diffIds(s, w)); }
  }
  return causes.size ? { ok: false, causes: Array.from(causes).sort(), detail: details.join(' ; ') } : { ok: true, detail: 'plan applicable strictement identique au plan sentinelle' };
}

function both(a, b) {
  if (a.ok && b.ok) return a;
  return { ok: false, causes: Array.from(new Set([].concat(a.causes || [], b.causes || []))).sort(), detail: [a.ok ? '' : a.detail, b.ok ? '' : b.detail].filter(Boolean).join(' ; ') };
}
/* Ce qui a réellement été écrit : archive des semaines du périmètre + planning affiché. */
function written(rt, perimeter, sentinel, common) {
  const stored = archiveOf(rt), shownWeek = rt.ctx.state.settings.weekDate;
  const keys = Array.from(new Set(perimeter.concat(Object.keys(stored).filter(k => k >= perimeter[0])))).sort();
  const archived = efg(Object.assign({ applicable: true, sentinel: Object.fromEntries(keys.map(k => [k, sentinel[k] || emptyPlan()])), weeks: Object.fromEntries(keys.map(k => [k, stored[k] ? stored[k].plan : emptyPlan()])) }, common));
  const shown = efg(Object.assign({ applicable: true, sentinel: { [shownWeek]: sentinel[shownWeek] || emptyPlan() }, weeks: { [shownWeek]: rt.ctx.state.plan } }, common));
  const tag = (name, v) => v.ok ? v : Object.assign({}, v, { detail: name + ' ' + v.detail });
  return both(tag('archive :', archived), tag('planning affiché :', shown));
}
/* Preuve d'atomicité par instantané complet : aucune écriture, ou le détail de ce qui a changé. */
function untouched(c, label, rt, before, perimeter, sentinel, common) {
  const mutated = snapshotDiff(before, snapshot(rt)), w = mutated ? written(rt, perimeter, sentinel, common) : null;
  return c.check(label, !mutated, mutated ? mutated + ' modifiés — ' + (w.ok ? 'plans identiques au sentinelle mais données réécrites' : w.detail) : '', mutated ? (w.ok ? '3' : w.causes.join('+')) : null);
}
const verdict = (c, label, v) => c.check(label, v.ok, { ok: v.detail, ko: v.detail }, v.causes && v.causes.join('+'));

/* Le férié doit être le SEUL bloqueur de sa date, reconnu par le vrai prédicat terrain. */
function holidayIsOnlyBlocker(rt) {
  const rows = rt.ctx.calendarEventsForDate(HOLIDAY);
  const without = Object.assign({}, rt.ctx.state, { calendarEvents: rt.ctx.state.calendarEvents.filter(e => e.id !== HOLIDAY_GOOGLE.id) });
  return sameIds(Array.from(rows, r => r.title), [HOLIDAY_GOOGLE.title]) && rt.terrain.dateBlocked(HOLIDAY, rt.ctx.state) === true && rt.terrain.dateBlocked(HOLIDAY, without) === false;
}

/* ------------------------------------------------------------------- cas A→J ---- */
const cases = [];
async function scenario(letter, title, fn) {
  const c = { letter, title, checks: [],
    /* detail : texte d'échec, ou {ok, ko} quand le détail vaut aussi pour un succès. */
    check(label, ok, detail, cause) {
      const text = detail && typeof detail === 'object' ? (ok ? detail.ok : detail.ko) : (ok ? '' : detail);
      this.checks.push({ label, ok: !!ok, detail: text || '', cause: ok ? null : cause || null });
      return !!ok;
    } };
  try { await fn(c); }
  catch (e) { c.checks.push({ label: 'harness', ok: false, detail: 'erreur du harness de test : ' + (e && e.stack || e), cause: null }); }
  cases.push(c);
}

(async () => {
  /* A. Terrain 3 semaines : une vraie semaine manuelle n'est jamais « complétée ». */
  await scenario('A', 'Terrain 3 semaines : une semaine manuelle de 1 magasin reste strictement identique, même si l’objectif permettrait d’en ajouter', async c => {
    const variants = [
      { label: 'A1 1re semaine du cycle (semaine affichée), archive + state.manualWeekEdits', week: W0, form: 'both' },
      { label: 'A2 2e semaine du cycle, archive manualEdited seule', week: W1, form: 'archive' },
      { label: 'A3 2e semaine du cycle, state.manualWeekEdits seul', week: W1, form: 'state' }
    ];
    for (const v of variants) {
      const stores = ring(), sentinel = planOf(stores, { Mardi: ['s07'] });
      const rt = runtime(protect({ stores, weekDate: W0, plan: v.week === W0 ? copy(sentinel) : emptyPlan(), target: 8, max: 2 }, v.week, sentinel, v.form));
      c.check(v.label + ' — précondition : objectif 8 visites, 2 par jour, vivier de 30', rt.ctx.state.settings.target === 8 && rt.ctx.state.settings.maxVisitsPerDay === 2 && rt.ctx.state.stores.length === 30);
      const archiveBefore = JSON.stringify(archiveOf(rt)[v.week] || null), editBefore = JSON.stringify(rt.ctx.state.manualWeekEdits[v.week] || null);
      const run = await engine(rt, 'A ' + v.label, () => rt.terrain.generateThreeWeekSnail({ start: W0 }));
      if (run.threw) { c.check(v.label + ' — génération 3 semaines', false, (run.error.controlled ? 'refus ' : 'crash ') + run.error.type + ' « ' + run.error.message + ' »', run.error.controlled ? null : 4); continue; }
      const week = run.value.weeks.find(w => w.weekKey === v.week);
      c.check(v.label + ' — la génération reconnaît la semaine protégée', !!(week && week.manual));
      const stored = archiveOf(rt), range = JSON.parse(rt.db.getItem(RANGE_KEY) || 'null') || {};
      const added = week ? DAYS.flatMap(d => ids(week.plan[d]).filter(id => !ids(sentinel[d]).includes(id))) : [];
      const elsewhere = Object.entries(stored).filter(([k]) => k !== v.week).flatMap(([, s]) => DAYS.flatMap(d => ids(s.plan && s.plan[d])));
      const real = elsewhere.length + DAYS.reduce((n, d) => n + sentinel[d].length, 0);
      c.check(v.label + ' — plan calculé de la semaine manuelle', week && samePlan(week.plan, sentinel),
        week ? 'semaine complétée : ' + planDiff(sentinel, week.plan) + (v.week !== W0 ? ' — ajouts non persistés (archive inchangée), absents des semaines écrites (' + added.filter(id => elsewhere.includes(id)).length + '/' + added.length + '), mais comptés dans le compte rendu écrit : range.totalVisits = ' + range.totalVisits + ' pour ' + real + ' visites réellement écrites' : '') : 'semaine absente', 3);
      if (v.week === W0) c.check(v.label + ' — planning affiché (state.plan) après génération', samePlan(rt.ctx.state.plan, sentinel), 'state.plan complété : ' + planDiff(sentinel, rt.ctx.state.plan) + ' alors que l’archive et state.manualWeekEdits gardent 1 magasin', 3);
      c.check(v.label + ' — archive de la semaine manuelle inchangée', JSON.stringify(archiveOf(rt)[v.week] || null) === archiveBefore, 'archive réécrite', 3);
      c.check(v.label + ' — state.manualWeekEdits de la semaine inchangé', JSON.stringify(rt.ctx.state.manualWeekEdits[v.week] || null) === editBefore, 'marqueur réécrit', 3);
    }
  });

  /* B. Cascade : une vraie semaine manuelle est une zone fermée, le débordement la traverse. */
  await scenario('B', 'Cascade V181 : le débordement traverse la semaine manuelle sans la toucher et va à la semaine disponible suivante', async c => {
    const stores = named(['a', 'b', 'c', 'd', 'e', 'f', 'm1', 'm2']);
    const current = planOf(stores, { Lundi: ['a'], Mardi: ['b', 'c'], Mercredi: ['d'], Jeudi: ['e'], Vendredi: ['f'] });
    const manual = planOf(stores, { Lundi: ['m1'], Jeudi: ['m2'] });
    const rt = runtime(protect({ stores, weekDate: W0, plan: copy(current), archive: { [W0]: { weekMonday: W0, plan: copy(current) } }, max: 1 }, W1, manual));
    const run = await engine(rt, 'B', () => build(rt));
    if (run.threw) return void c.check('B — recalcul', false, 'crash ' + run.error.type + ' « ' + run.error.message + ' »', 4);
    const r = run.value;
    c.check('B — précondition : recalcul possible, une seule visite libre déborde (c, mardi 03/11, plafond 1/jour)', r.ok === true && r.moved === 1, r.error || 'moved=' + r.moved);
    c.check('B — semaine manuelle du 09/11 strictement identique (aucun ajout, retrait, déplacement ni réordonnancement)', samePlan(r.weeks[W1], manual), 'semaine manuelle modifiée : ' + planDiff(manual, r.weeks[W1]), 3);
    const where = placements(r.weeks, 'c');
    c.check('B — c placé exactement une fois, dans la semaine disponible suivante (16/11)', where.length === 1 && where[0].week === W2, 'c placé : ' + (where.map(x => x.day + ' ' + x.date).join(', ') || 'nulle part'), 3);
    const archiveBefore = JSON.stringify(archiveOf(rt)[W1]), editBefore = JSON.stringify(rt.ctx.state.manualWeekEdits[W1]);
    const applied = await engine(rt, 'B (application)', () => rt.ctx.storeRunnerRecalculateRemainingWeek());
    if (applied.threw) return void c.check('B — application du recalcul', false, 'crash ' + applied.error.type + ' « ' + applied.error.message + ' »', 4);
    const after = archiveOf(rt)[W1];
    c.check('B — après application : archive de la semaine manuelle inchangée', JSON.stringify(after) === archiveBefore, 'archive réécrite : ' + planDiff(manual, after && after.plan) + ', manualEditedAt ' + EDITED_AT + ' → ' + (after && after.manualEditedAt), 3);
    c.check('B — après application : state.manualWeekEdits de la semaine inchangé', JSON.stringify(rt.ctx.state.manualWeekEdits[W1]) === editBefore, 'marqueur réécrit : ' + planDiff(manual, rt.ctx.state.manualWeekEdits[W1] && rt.ctx.state.manualWeekEdits[W1].plan), 3);
  });

  /* C. Cascade : un rendez-vous futur valide fixe la date. */
  await scenario('C', 'Cascade V181 : un magasin avec RDV futur valide reste exactement sur la date du RDV', async c => {
    const stores = named(['K', 'K2', 'a', 'b', 'c', 'x', 'e', 'g', 'f']);
    const plan = planOf(stores, { Lundi: ['a'], Mardi: ['K', 'b'], Mercredi: ['K2', 'c', 'x'], Jeudi: ['e', 'g'], Vendredi: ['f'] });
    const rt = runtime({ stores, weekDate: W0, plan: copy(plan), archive: { [W0]: { weekMonday: W0, plan: copy(plan) } }, max: 2,
      appointments: [rdv('K', '2026-11-05'), rdv('K2', '2026-11-04')] });
    const run = await engine(rt, 'C', () => build(rt));
    if (run.threw) return void c.check('C — recalcul', false, 'crash ' + run.error.type + ' « ' + run.error.message + ' »', 4);
    const r = run.value;
    c.check('C — recalcul possible et cascade réelle (x et g débordent)', r.ok === true && r.moved === 2, r.error || 'moved=' + r.moved);
    const k = placements(r.weeks, 'K'), k2 = placements(r.weeks, 'K2');
    c.check('C — K (planifié mardi, RDV jeudi 05/11) sur la date du RDV', k.length === 1 && k[0].date === '2026-11-05', 'K placé : ' + k.map(x => x.date).join(', '), k.length ? 2 : 1);
    c.check('C — K2 (RDV mercredi 04/11, déjà sur ce jour) reste sur la date du RDV', k2.length === 1 && k2[0].date === '2026-11-04', 'K2 placé : ' + k2.map(x => x.date).join(', '), k2.length ? 2 : 1);
    for (const id of ['x', 'g']) c.check('C — la visite libre ' + id + ' est replacée exactement une fois', placements(r.weeks, id).length === 1, id + ' : ' + placements(r.weeks, id).length + ' occurrence(s)');
  });

  /* D. Cascade : un verrou daté valide fixe le jour de cette semaine. */
  await scenario('D', 'Cascade V181 : un magasin avec verrou daté valide reste exactement sur son jour verrouillé', async c => {
    const stores = named(['L', 'L2', 'a', 'b', 'c', 'x', 'e', 'g', 'f']);
    const plan = planOf(stores, { Lundi: ['a'], Mardi: ['L', 'b'], Mercredi: ['L2', 'c', 'x'], Jeudi: ['e', 'g'], Vendredi: ['f'] });
    const rt = runtime({ stores, weekDate: W0, plan: copy(plan), archive: { [W0]: { weekMonday: W0, plan: copy(plan) } }, max: 2,
      locks: { L: { day: 'Jeudi', week: W0 }, L2: { day: 'Mercredi', week: W0 } } });
    const run = await engine(rt, 'D', () => build(rt));
    if (run.threw) return void c.check('D — recalcul', false, 'crash ' + run.error.type + ' « ' + run.error.message + ' »', 4);
    const r = run.value;
    c.check('D — recalcul possible et cascade réelle (x et g débordent)', r.ok === true && r.moved === 2, r.error || 'moved=' + r.moved);
    const l = placements(r.weeks, 'L'), l2 = placements(r.weeks, 'L2');
    c.check('D — L (planifié mardi, verrou {Jeudi, 02/11}) sur jeudi 05/11', l.length === 1 && l[0].date === '2026-11-05', 'L placé : ' + l.map(x => x.date).join(', '), l.length ? 2 : 1);
    c.check('D — L2 (verrou {Mercredi, 02/11}, déjà sur ce jour) reste mercredi 04/11', l2.length === 1 && l2[0].date === '2026-11-04', 'L2 placé : ' + l2.map(x => x.date).join(', '), l2.length ? 2 : 1);
    for (const id of ['x', 'g']) c.check('D — la visite libre ' + id + ' est replacée exactement une fois', placements(r.weeks, id).length === 1, id + ' : ' + placements(r.weeks, id).length + ' occurrence(s)');
  });

  /* E/F — V211 semaine et période sur un planning précédent SENTINELLE (jamais vide). Le
     magasin contraint K = s05 est posé mercredi 11/11 dans le sentinelle. */
  const K = 's05';
  const sentinelV211 = (stores, recurring) => ({
    [W1]: planOf(stores, { Lundi: ['s01', 's02'], Mardi: ['s03', 's04'], Mercredi: ['s05', 's06'], Jeudi: ['s07', 's08'], Vendredi: ['s09', 's10'] }),
    [W2]: planOf(stores, { Lundi: ['s11', 's12'], Mardi: ['s13', 's14'], Mercredi: recurring ? ['s05', 's16'] : ['s15', 's16'], Jeudi: ['s17', 's18'], Vendredi: ['s19', 's20'] })
  });
  async function v211Blocked(c, label, mode, constraint) {
    const stores = ring(), sentinel = sentinelV211(stores, constraint.recurring);
    const rt = runtime(Object.assign({ stores, weekDate: W1, plan: copy(sentinel[W1]), target: 10, max: 2, calendarEvents: [HOLIDAY_GOOGLE], rangeStart: W1, rangeEnd: '2026-11-20',
      archive: { [W1]: { weekMonday: W1, plan: copy(sentinel[W1]) }, [W2]: { weekMonday: W2, plan: copy(sentinel[W2]) } } }, constraint.o));
    c.check(label + ' — précondition : seul l’Armistice 1918 bloque le 11/11 (vrai dateBlocked terrain)', holidayIsOnlyBlocker(rt));
    const perimeter = mode === 'semaine' ? [W1] : [W1, W2], before = snapshot(rt);
    const locks = structural(rt.ctx.state.locks), appointments = structural(rt.ctx.state.appointments);
    const run = await engine(rt, label, () => mode === 'semaine' ? rt.range.strictSingleWeek() : rt.range.generateRange());
    if (run.threw) return void c.check(label + ' — opération', false, 'crash ' + run.error.type + ' « ' + run.error.message + ' »', 4);
    const proposal = rt.proposals[rt.proposals.length - 1] || null;
    /* Sans proposition : une exception avalée par V211 est classée (refus volontaire ou crash) ;
       une issue sans exception n'est soumise qu'au contrôle d'absence de mutation. */
    let refusal = null;
    if (!proposal) {
      const status = rt.els.rangePlanStatus.textContent || '', prefix = 'Erreur pendant la génération : ';
      const message = mode === 'semaine' ? (run.value && run.value.error ? String(run.value.error) : '') : (status.startsWith(prefix) ? status.slice(prefix.length) : '');
      refusal = message ? swallowed(rt, label, message) : { controlled: true, type: 'aucune proposition, sans exception', message: mode === 'semaine' ? JSON.stringify(run.value) : status };
    }
    const common = { id: K, allowed: constraint.allowed, constrainedWeeks: new Set(constraint.recurring ? perimeter : [W1]) };
    /* Preuve principale (moteur fonctionnel) : le résultat renvoyé. */
    const weeks = proposal ? Object.fromEntries(perimeter.map(k => [k, proposal.archive && proposal.archive[k] ? proposal.archive[k].plan : emptyPlan()])) : {};
    verdict(c, label + ' — résultat renvoyé sur tout le périmètre (' + perimeter.join(', ') + ')',
      efg(Object.assign({ applicable: !!proposal, refusal, mutated: snapshotDiff(before, snapshot(rt)), sentinel: Object.fromEntries(perimeter.map(k => [k, sentinel[k]])), weeks }, common)));
    if (proposal) verdict(c, label + ' — planning affiché renvoyé (semaine du ' + proposal.weekDate + ')',
      efg(Object.assign({ applicable: true, sentinel: { [proposal.weekDate]: sentinel[proposal.weekDate] || emptyPlan() }, weeks: { [proposal.weekDate]: proposal.plan } }, common)));
    /* Contrôle des données d'entrée : planning affiché, archive et stockage intacts. */
    untouched(c, label + ' — données d’entrée intactes (instantané complet state + stockage)', rt, before, perimeter, sentinel, common);
    c.check(label + ' — verrous (state.locks) structurellement inchangés', structural(rt.ctx.state.locks) === locks, 'state.locks avant ' + locks + ' · après ' + structural(rt.ctx.state.locks), 1);
    c.check(label + ' — rendez-vous (state.appointments) structurellement inchangés', structural(rt.ctx.state.appointments) === appointments, 'state.appointments avant ' + appointments + ' · après ' + structural(rt.ctx.state.appointments), 1);
  }
  const outsideW1 = date => weekOf(date) !== W1;

  await scenario('E', 'V211 : RDV le mercredi 11/11 férié — ni placé un autre jour, ni perdu, ni mutation partielle', async c => {
    const constraint = { o: { appointments: [rdv(K, HOLIDAY)] }, allowed: date => outsideW1(date) || date === HOLIDAY };
    await v211Blocked(c, 'E1 semaine du 09/11', 'semaine', constraint);
    await v211Blocked(c, 'E2 période 09/11 → 20/11', 'période', constraint);
  });

  await scenario('F', 'V211 : verrou sur le mercredi 11/11 férié — aucun contournement vers un autre jour, aucune perte, aucune mutation partielle', async c => {
    const dated = { o: { locks: { [K]: { day: 'Mercredi', week: W1 } } }, allowed: date => outsideW1(date) || date === HOLIDAY };
    const recurring = { recurring: true, o: { locks: { [K]: 'Mercredi' } }, allowed: date => dayOf(date) === 'Mercredi' };
    await v211Blocked(c, 'F1 verrou daté {Mercredi, 09/11}, semaine', 'semaine', dated);
    await v211Blocked(c, 'F2 verrou daté {Mercredi, 09/11}, période 09/11 → 20/11', 'période', dated);
    await v211Blocked(c, 'F3 verrou récurrent "Mercredi", semaine', 'semaine', recurring);
    await v211Blocked(c, 'F4 verrou récurrent "Mercredi", période 09/11 → 20/11', 'période', recurring);
  });

  /* G. V181 : RDV / verrou sur le férié. Preuve principale = instantané complet avant/après
     l'application réelle du recalcul ; contrôle supplémentaire = résultat calculé. */
  await scenario('G', 'Cascade V181 : RDV ou verrou sur le 11/11 férié — aucune disparition, aucun déplacement, aucun état partiellement muté', async c => {
    const kinds = [
      { name: 'RDV 11/11', o: { appointments: [rdv('K', HOLIDAY)] }, allowed: date => date === HOLIDAY },
      { name: 'verrou daté {Mercredi, 09/11}', o: { locks: { K: { day: 'Mercredi', week: W1 } } }, allowed: date => date === HOLIDAY },
      { name: 'verrou récurrent "Mercredi"', o: { locks: { K: 'Mercredi' } }, allowed: date => dayOf(date) === 'Mercredi' }
    ];
    const sentinels = [
      { name: 'K seul sur le férié', spec: { Lundi: ['a', 'c'], Mardi: ['b'], Mercredi: ['K'], Jeudi: ['d'], Vendredi: ['e'] } },
      { name: 'K + visite libre c sur le férié', spec: { Lundi: ['a'], Mardi: ['b'], Mercredi: ['K', 'c'], Jeudi: ['d'], Vendredi: ['e'] } }
    ];
    let n = 0;
    for (const kind of kinds) for (const s of sentinels) {
      const label = 'G' + (++n) + ' ' + kind.name + ', ' + s.name;
      const stores = named(['K', 'a', 'b', 'c', 'd', 'e']), sentinel = planOf(stores, s.spec);
      const rt = runtime(Object.assign({ stores, weekDate: W1, plan: copy(sentinel), archive: { [W1]: { weekMonday: W1, plan: copy(sentinel) } }, max: 2, calendarEvents: [HOLIDAY_GOOGLE] }, kind.o));
      c.check(label + ' — précondition : seul l’Armistice 1918 bloque le 11/11 (vrai dateBlocked terrain)', holidayIsOnlyBlocker(rt));
      const before = snapshot(rt), sentinels = { [W1]: sentinel }, common = { id: 'K', allowed: kind.allowed, constrainedWeeks: new Set([W1]) };
      const computed = await engine(rt, label + ' (calcul)', () => build(rt));
      const applied = await engine(rt, label + ' (application)', () => rt.ctx.storeRunnerRecalculateRemainingWeek());
      if (computed.threw || applied.threw) { const e = (computed.threw ? computed : applied).error; c.check(label + ' — recalcul', false, (e.controlled ? 'refus ' : 'crash ') + e.type + ' « ' + e.message + ' »', e.controlled ? null : 4); continue; }
      /* Preuve principale : instantané complet avant/après l'application réelle. */
      untouched(c, label + ' — instantané complet avant/après application (state + stockage)', rt, before, [W1], sentinels, common);
      /* Contrôle supplémentaire obligatoire : le résultat calculé. Un {ok:false} de V181 est son refus volontaire. */
      const r = computed.value;
      verdict(c, label + ' — résultat calculé (ok=' + r.ok + (r.unchanged ? ', inchangé' : '') + ')', r.ok
        ? efg(Object.assign({ applicable: true, sentinel: sentinels, weeks: r.weeks || {} }, common))
        : efg(Object.assign({ applicable: false, refusal: { controlled: true, type: 'refus V181 {ok:false}', message: r.error }, mutated: snapshotDiff(before, snapshot(rt)) }, common)));
    }
  });

  /* H. Priorité des contraintes : RDV > verrou, sur les trois chemins. */
  await scenario('H', 'Priorité RDV > verrou : verrou mardi + RDV valide jeudi 12/11 → le magasin reste jeudi (V211, terrain, V181)', async c => {
    const locks = { 'daté {Mardi, 09/11}': { [K]: { day: 'Mardi', week: W1 } }, 'récurrent "Mardi"': { [K]: 'Mardi' } };
    const appointment = [rdv(K, '2026-11-12')];
    for (const [form, lock] of Object.entries(locks)) {
      const recurring = form.startsWith('récurrent');
      for (const mode of ['semaine', 'période']) {
        const label = 'H V211 ' + mode + ', verrou ' + form;
        const stores = ring(), sentinel = sentinelV211(stores, false);
        const rt = runtime({ stores, weekDate: W1, plan: copy(sentinel[W1]), target: 10, max: 2, rangeStart: W1, rangeEnd: '2026-11-20', locks: copy(lock), appointments: copy(appointment),
          archive: { [W1]: { weekMonday: W1, plan: copy(sentinel[W1]) }, [W2]: { weekMonday: W2, plan: copy(sentinel[W2]) } } });
        const run = await engine(rt, label, () => mode === 'semaine' ? rt.range.strictSingleWeek() : rt.range.generateRange());
        const proposal = rt.proposals[rt.proposals.length - 1];
        if (run.threw || !proposal) { c.check(label + ' — génération', false, run.threw ? 'crash ' + run.error.type + ' « ' + run.error.message + ' »' : 'aucune proposition : ' + (run.value && run.value.error || rt.els.rangePlanStatus.textContent), run.threw ? 4 : null); continue; }
        const at = placements({ [W1]: proposal.archive[W1].plan }, K);
        c.check(label + ' — K jeudi 12/11 (RDV) et nulle part ailleurs dans la semaine', at.length === 1 && at[0].date === '2026-11-12', 'K placé : ' + (at.map(x => x.day + ' ' + x.date).join(', ') || 'nulle part'), at.length ? 2 : 1);
        if (mode === 'période' && recurring) { const w2 = placements({ [W2]: proposal.archive[W2].plan }, K); c.check(label + ' — semaine du 16/11 sans RDV : K sur son verrou récurrent mardi', w2.length === 1 && w2[0].day === 'Mardi', 'K placé : ' + (w2.map(x => x.day).join(', ') || 'nulle part'), w2.length ? 2 : 1); }
      }
      {
        const label = 'H terrain 3 semaines, verrou ' + form;
        const rt = runtime({ stores: ring(), weekDate: W0, target: 8, max: 2, locks: copy(lock), appointments: copy(appointment) });
        const run = await engine(rt, label, () => rt.terrain.generateThreeWeekSnail({ start: W0 }));
        if (run.threw) { c.check(label + ' — génération', false, (run.error.controlled ? 'refus ' : 'crash ') + run.error.type + ' « ' + run.error.message + ' »', run.error.controlled ? null : 4); }
        else {
          const weeks = Object.fromEntries(run.value.weeks.map(w => [w.weekKey, w.plan])), stored = archiveOf(rt);
          const at = placements({ [W1]: weeks[W1] }, K), kept = placements({ [W1]: stored[W1] && stored[W1].plan }, K);
          c.check(label + ' — K jeudi 12/11 (RDV) dans le plan calculé et dans l’archive', at.length === 1 && at[0].date === '2026-11-12' && kept.length === 1 && kept[0].date === '2026-11-12', 'calculé : ' + (at.map(x => x.date).join(', ') || '—') + ' · archive : ' + (kept.map(x => x.date).join(', ') || '—'), at.length ? 2 : 1);
          if (recurring) for (const wk of [W0, W2]) { const p = placements({ [wk]: weeks[wk] }, K); c.check(label + ' — semaine du ' + wk + ' sans RDV : K sur son verrou récurrent mardi', p.length === 1 && p[0].day === 'Mardi', 'K placé : ' + (p.map(x => x.day).join(', ') || 'nulle part'), p.length ? 2 : 1); }
        }
      }
      {
        const label = 'H V181, verrou ' + form;
        const stores = named(['s05', 'a', 'b', 'c', 'd', 'e']), sentinel = planOf(stores, { Lundi: ['a'], Mardi: ['s05', 'b'], Mercredi: ['c'], Jeudi: ['d'], Vendredi: ['e'] });
        const rt = runtime({ stores, weekDate: W1, plan: copy(sentinel), archive: { [W1]: { weekMonday: W1, plan: copy(sentinel) } }, max: 2, locks: copy(lock), appointments: copy(appointment) });
        const run = await engine(rt, label, () => build(rt));
        if (run.threw) { c.check(label + ' — recalcul', false, 'crash ' + run.error.type + ' « ' + run.error.message + ' »', 4); continue; }
        const at = placements(run.value.weeks, K);
        c.check(label + ' — K (planifié mardi, jour du verrou) déplacé sur le RDV jeudi 12/11', run.value.ok === true && at.length === 1 && at[0].date === '2026-11-12', run.value.error || 'K placé : ' + at.map(x => x.date).join(', '), at.length ? 2 : 1);
      }
    }
  });

  /* I. recalcOnly : une semaine marquée par un recalcul précédent reste recalculable. */
  await scenario('I', 'recalcOnly : une semaine marquée manualEdited par un recalcul précédent (signature intacte) reste recalculable et n’est pas une retouche utilisateur', async c => {
    const stores = named(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const current = planOf(stores, { Lundi: ['a'], Mardi: ['b', 'c'], Mercredi: ['d'], Jeudi: ['e'], Vendredi: ['f'] });
    const next = planOf(stores, { Lundi: ['g'], Mercredi: ['h'] });
    const rt = runtime({ stores, weekDate: W0, plan: copy(current), max: 1, archive: { [W0]: { weekMonday: W0, plan: copy(current) }, [W1]: { weekMonday: W1, plan: copy(next) } } });
    /* 1. Un vrai recalcul, appliqué, écrit la semaine du 09/11 (débordement de c). */
    const first = await engine(rt, 'I (1er recalcul)', () => rt.ctx.storeRunnerRecalculateRemainingWeek());
    if (first.threw) return void c.check('I — 1er recalcul', false, 'crash ' + first.error.type + ' « ' + first.error.message + ' »', 4);
    const marked = archiveOf(rt)[W1] || {};
    c.check('I — précondition : le 1er recalcul marque la semaine du 09/11 manualEdited avec recalculated {at = manualEditedAt, signature intacte} et state.manualWeekEdits',
      first.value.ok === true && marked.manualEdited === true && !!marked.recalculated && marked.recalculated.at === marked.manualEditedAt && marked.recalculated.signature === signatureOf(marked.plan) && !!rt.ctx.state.manualWeekEdits[W1],
      'marque obtenue : ' + JSON.stringify({ ok: first.value.ok, manualEdited: marked.manualEdited, manualEditedAt: marked.manualEditedAt, recalculated: marked.recalculated }));
    /* 2. Le lendemain, a (lundi 02/11) n'a pas été visité : il doit pouvoir entrer dans la semaine recalculée. */
    rt.clock.now = '2026-11-03T08:00:00';
    const run = await engine(rt, 'I (2e recalcul)', () => build(rt));
    if (run.threw) return void c.check('I — 2e recalcul', false, 'crash ' + run.error.type + ' « ' + run.error.message + ' »', 4);
    const r = run.value, where = placements(r.weeks, 'a');
    c.check('I — la semaine recalcOnly reste recalculable : a y est replacé (jeudi 12/11)', r.ok === true && where.length === 1 && where[0].week === W1, r.error || 'a placé : ' + (where.map(x => x.day + ' ' + x.date).join(', ') || 'nulle part'));
    const entry = r.archive && r.archive[W1] || {};
    c.check('I — elle n’est pas traitée comme une retouche utilisateur : la marque recalculated est renouvelée, pas supprimée',
      !!entry.recalculated && entry.recalculated.at === entry.manualEditedAt && entry.recalculated.signature === signatureOf(r.weeks[W1]), 'entrée : ' + JSON.stringify({ manualEditedAt: entry.manualEditedAt, recalculated: entry.recalculated }));
    const applied = await engine(rt, 'I (application)', () => rt.ctx.storeRunnerRecalculateRemainingWeek());
    const stored = archiveOf(rt)[W1] || {};
    c.check('I — après application : la marque recalculated est persistée avec la signature du nouveau plan',
      !applied.threw && applied.value.ok === true && !!stored.recalculated && stored.recalculated.signature === signatureOf(stored.plan) && ids(stored.plan.Jeudi).includes('a'), applied.threw ? 'crash ' + applied.error.type : 'archive : ' + JSON.stringify({ plan: planIds(stored.plan), recalculated: stored.recalculated }));
  });

  /* J. Cascade : intégrité quand le débordement saute une vraie semaine protégée. */
  await scenario('J', 'Cascade V181 : intégrité quand la cascade saute une semaine protégée (aucune perte, aucun doublon, semaine protégée identique, report plus loin, crédits/capacité/horaires)', async c => {
    const stores = named(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm1', 'm2', 'm3']).concat([store('DARTY', 12, 6, { enseigne: 'Darty' })]);
    const current = planOf(stores, { Lundi: ['a', 'b'], Mardi: ['c', 'd', 'e'], Mercredi: ['f', 'g', 'h'], Jeudi: ['i', 'j', 'DARTY'], Vendredi: ['k', 'l'] });
    const manual = planOf(stores, { Lundi: ['m1'], Mercredi: ['m2', 'm3'] });
    const rt = runtime(protect({ stores, weekDate: W0, plan: copy(current), archive: { [W0]: { weekMonday: W0, plan: copy(current) } }, max: 2 }, W1, manual));
    const max = rt.ctx.state.settings.maxVisitsPerDay, credit = s => Math.max(1, Number(rt.ctx.storeVisitCredit(s)) || 1);
    c.check('J — précondition : Darty compte 2 crédits (visit-counting.js)', credit(stores.find(s => s.id === 'DARTY')) === 2);
    const run = await engine(rt, 'J', () => build(rt));
    if (run.threw) return void c.check('J — recalcul', false, 'crash ' + run.error.type + ' « ' + run.error.message + ' »', 4);
    const r = run.value;
    c.check('J — précondition : recalcul possible, 3 visites libres débordent (e, h, DARTY), aucune retirée par la couverture', r.ok === true && r.moved === 3 && (r.removed || []).length === 0, r.error || 'moved=' + r.moved + ', removed=' + (r.removed || []).length);
    c.check('J — semaine protégée du 09/11 strictement identique', samePlan(r.weeks[W1], manual), 'semaine protégée modifiée : ' + planDiff(manual, r.weeks[W1]), 3);
    for (const id of ['e', 'h', 'DARTY']) { const p = placements(r.weeks, id); c.check('J — ' + id + ' reporté exactement une fois, après la semaine protégée (≥ 16/11)', p.length === 1 && p[0].date >= W2, id + ' placé : ' + (p.map(x => x.day + ' ' + x.date).join(', ') || 'nulle part'), 3); }
    const before = [current, manual].flatMap(p => DAYS.flatMap(d => ids(p[d]))).sort(), after = Object.values(r.weeks || {}).flatMap(p => DAYS.flatMap(d => ids(p[d]))).sort();
    c.check('J — aucune occurrence libre perdue ni inventée (16 occurrences)', sameIds(before, after), 'avant ' + before.length + ' · après ' + after.length);
    const dup = Object.entries(r.weeks || {}).filter(([, p]) => { const x = DAYS.flatMap(d => ids(p[d])); return new Set(x).size !== x.length; }).map(([k]) => k);
    c.check('J — aucun doublon d’un magasin dans une même semaine', dup.length === 0, 'doublons : ' + dup.join(', '));
    const over = [], unfit = [];
    for (const [week, plan] of Object.entries(r.weeks || {})) for (const day of DAYS) {
      const route = plan[day] || [], date = dateOf(week, day);
      if (route.reduce((n, s) => n + credit(s), 0) > max) over.push(week + ' ' + day);
      if (route.length && !rt.ctx.StoreOpeningHoursV1.routeFits(route, day, rt.ctx.state, { date })) unfit.push(week + ' ' + day);
    }
    c.check('J — crédits et capacité : aucune journée au-delà de ' + max + ' crédits', over.length === 0, 'dépassements : ' + over.join(', '));
    c.check('J — horaires : chaque journée tient (StoreOpeningHoursV1.routeFits)', unfit.length === 0, 'journées hors horaires : ' + unfit.join(', '));
    const archiveBefore = JSON.stringify(archiveOf(rt)[W1]);
    const applied = await engine(rt, 'J (application)', () => rt.ctx.storeRunnerRecalculateRemainingWeek());
    const stored = archiveOf(rt)[W1];
    c.check('J — après application : archive de la semaine protégée inchangée', !applied.threw && JSON.stringify(stored) === archiveBefore, applied.threw ? 'crash ' + applied.error.type : 'archive réécrite : ' + planDiff(manual, stored && stored.plan), 3);
  });

  /* K/L — génération standard 3 semaines (cycle 02/11 → 20/11, semaine du 09/11 comprise) sur un
     planning précédent SENTINELLE non vide sur les trois semaines, aucune semaine protégée.
     K = s05 est posé mercredi 11/11 dans le sentinelle ; un verrou récurrent le pose aussi les
     autres mercredis. La contrainte porte sur tout le cycle : K posé un autre jour ou une autre
     semaine est un déplacement (cause 2). generateThreeWeekSnail applique sa proposition :
     preuve = résultat calculé ET état/archive réellement écrits (instantané complet). */
  const terrainSentinel = (stores, recurring) => ({
    [W0]: planOf(stores, { Lundi: ['s01', 's02'], Mardi: ['s03', 's04'], Mercredi: [recurring ? 's05' : 's06', 's07'], Jeudi: ['s08'], Vendredi: ['s09'] }),
    [W1]: planOf(stores, { Lundi: ['s10', 's11'], Mardi: ['s12', 's13'], Mercredi: ['s05', 's14'], Jeudi: ['s15'], Vendredi: ['s16'] }),
    [W2]: planOf(stores, { Lundi: ['s17', 's18'], Mardi: ['s19', 's20'], Mercredi: [recurring ? 's05' : 's21', 's22'], Jeudi: ['s23'], Vendredi: ['s24'] })
  });
  async function terrainBlocked(c, label, constraint) {
    const stores = ring(), sentinel = terrainSentinel(stores, constraint.recurring), perimeter = [W0, W1, W2];
    const archive = Object.fromEntries(perimeter.map(k => [k, { weekMonday: k, plan: copy(sentinel[k]), manualEdited: false, generatedMode: 'snail-distance-v1' }]));
    const rt = runtime(Object.assign({ stores, weekDate: W0, plan: copy(sentinel[W0]), target: 8, max: 2, calendarEvents: [HOLIDAY_GOOGLE], archive }, constraint.o));
    c.check(label + ' — précondition : seul l’Armistice 1918 bloque le 11/11 (vrai dateBlocked terrain)', holidayIsOnlyBlocker(rt));
    c.check(label + ' — précondition : sentinelle non vide sur les 3 semaines du cycle, aucune semaine protégée',
      perimeter.every(k => DAYS.some(d => sentinel[k][d].length)) && perimeter.every(k => !archive[k].manualEdited) && !Object.keys(rt.ctx.state.manualWeekEdits).length);
    const before = snapshot(rt), locks = structural(rt.ctx.state.locks), appointments = structural(rt.ctx.state.appointments);
    const common = { id: K, allowed: constraint.allowed, constrainedWeeks: new Set(perimeter) };
    const run = await engine(rt, label, () => rt.terrain.generateThreeWeekSnail({ start: W0 }));
    verdict(c, label + ' — résultat calculé sur les 3 semaines du cycle', run.threw
      ? efg(Object.assign({ applicable: false, refusal: run.error, mutated: snapshotDiff(before, snapshot(rt)) }, common))
      : efg(Object.assign({ applicable: true, sentinel, weeks: Object.fromEntries(run.value.weeks.map(w => [w.weekKey, w.plan])) }, common)));
    untouched(c, label + ' — état et archive réellement écrits (instantané complet state + stockage)', rt, before, perimeter, sentinel, common);
    c.check(label + ' — verrous (state.locks) structurellement inchangés', structural(rt.ctx.state.locks) === locks, 'state.locks avant ' + locks + ' · après ' + structural(rt.ctx.state.locks), 1);
    c.check(label + ' — rendez-vous (state.appointments) structurellement inchangés', structural(rt.ctx.state.appointments) === appointments, 'state.appointments avant ' + appointments + ' · après ' + structural(rt.ctx.state.appointments), 1);
  }

  await scenario('K', 'Terrain 3 semaines : RDV le mercredi 11/11 férié — K jamais traité comme visite libre (refus atomique ou sentinelle strictement conservé)', async c => {
    await terrainBlocked(c, 'K RDV 11/11, cycle 02/11 → 20/11', { o: { appointments: [rdv(K, HOLIDAY)] }, allowed: date => date === HOLIDAY });
  });

  await scenario('L', 'Terrain 3 semaines : verrou sur le mercredi 11/11 férié — verrou jamais oublié, contourné ni perdu (refus atomique ou sentinelle strictement conservé)', async c => {
    await terrainBlocked(c, 'L1 verrou daté {Mercredi, 09/11}, cycle 02/11 → 20/11', { o: { locks: { [K]: { day: 'Mercredi', week: W1 } } }, allowed: date => date === HOLIDAY });
    await terrainBlocked(c, 'L2 verrou récurrent "Mercredi", cycle 02/11 → 20/11', { recurring: true, o: { locks: { [K]: 'Mercredi' } }, allowed: date => dayOf(date) === 'Mercredi' });
  });

  /* ------------------------------------------------------------------- rapport ---- */
  let red = 0;
  for (const c of cases) {
    const ok = c.checks.length > 0 && c.checks.every(x => x.ok), causes = Array.from(new Set(c.checks.filter(x => !x.ok && x.cause).flatMap(x => String(x.cause).split('+')))).sort();
    if (!ok) red++;
    console.log((ok ? '✓ ' : '✗ ') + c.letter + ' — ' + c.title + (ok ? '' : '  [ROUGE' + (causes.length ? ' · cause ' + causes.join('+') : '') + ']'));
    for (const x of c.checks) console.log('    ' + (x.ok ? '✓ ' : '✗ ') + x.label + (x.ok ? (x.detail ? ' · ' + x.detail : '') : (x.cause ? ' [cause ' + x.cause + ']' : '') + (x.detail ? '\n        → ' + x.detail : '')));
  }
  if (exceptions.length) {
    console.log('\nExceptions observées :');
    for (const e of exceptions) console.log('  ' + e.case + ' — ' + e.type + (e.controlled ? ' (refus volontaire du moteur)' : ' (crash)') + ' : « ' + e.message + ' »');
  }
  console.log('\nP0.3 : ' + (cases.length - red) + '/' + cases.length + ' cas verts · ' + red + ' rouge' + (red > 1 ? 's' : '') + ' (phase rouge : aucun runtime corrigé)');
  if (red) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
