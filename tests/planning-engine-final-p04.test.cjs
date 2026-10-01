// P0.4 — audit final du moteur de planning (phase rouge : tests seuls, aucun runtime modifié).
//
// Le moteur est éprouvé comme un ensemble : les règles sont croisées dans un même état et
// chaque scénario est rejoué sur les quatre chemins qui écrivent un planning :
//   - génération V211 « semaine » ............ range-planner-v2.js (strictSingleWeek)
//   - génération V211 « période » ............ range-planner-v2.js (generateRange)
//   - génération standard 3 semaines ......... terrain-planning-v1.js (generateThreeWeekSnail, V264)
//   - « Recalculer le reste » (cascade) ...... planning-cascade-v181.js
//
// Deux couches sont exécutées, sur les VRAIS modules :
//   - « brut » : les quatre propriétaires, exactement comme P0.2a/P0.2b/P0.3 ;
//   - « chaîne » : la chaîne de production posée par-dessus — planning-generation-controller.js
//     (boutons « Générer mes 3 semaines » et generateWeek), v182-fixes.js (V185 géographie,
//     période partielle), planning-route-optimizer-v251.js (ordre de passage V251),
//     workdays-enforcer.js (jours travaillés) — reliés par un vrai bus d'événements.
// Le noyau fournit ses propres fonctions, extraites telles quelles de src/chef-secteur.html :
// rad, hav, baseObj, havBase, routeCost, nearestRoute, twoOpt, includedByFilters, localISO,
// eventDate et calendarEventsForDate. Modules chargés : calendar-oauth.js, visit-counting.js,
// visit-coverage.js, store-opening-hours.js, terrain-planning-v1.js, range-planner-v2.js,
// planning-cascade-v181.js (+ chaîne). Seuls sont remplacés : le stockage (mémoire), l'horloge,
// syncGoogleCalendar (réseau : l'Agenda est déjà dans state.calendarEvents), ChefReliability
// (persistance en mémoire, application identique à l'application automatique V189),
// storeRunnerHasValidBase (profil : départ valide dans toutes les fixtures) et le DOM minimal.
//
// Horloge figée : lundi 02/11/2026 08:00 (mercredi 04/11/2026 08:00 pour les jours passés).
// Jours bloqués : mercredi 11/11 férié (« Jours fériés en France »), congés 25–26/11
// (journée entière), « Formation Samsung » le mardi 01/12 (événement horaire bloquant).
//
// Verdicts. VERT : le contrat global est respecté. ROUGE : au moins un invariant violé, avec
// sa cause (1 perte · 2 doublon · 3 contrainte dure ignorée · 4 capacité/crédits · 5 semaine
// manuelle modifiée · 6 cascade incorrecte · 7 incohérence entre moteurs · 8 priorité métier
// incorrecte · 9 non-déterminisme · 10 mutation partielle · 11 crash · 12 autre). AMBIGU :
// deux contrats existants se contredisent ; le test décrit ce qu'il observe sans trancher.
// Chaque scénario est exécuté deux fois sur des runtimes neufs ; un écart entre les deux est
// lui-même un rouge (cause 9). Un refus volontaire est une erreur construite par le moteur
// (`Error(…)`), repérée au moment de sa construction ; une exception technique (TypeError,
// ReferenceError, RangeError…) est un crash (cause 11).
//
// Écrit en phase rouge sur r30 (main 9912ae3) : 41 cas, 20 verts, 18 rouges, 3 ambigus, aucun
// crash. Sept causes racines, chacune reproduite deux fois par exécution (R4 n'existe que dans
// la chaîne, par construction ; les autres apparaissent déjà sur la couche brute) :
//   R1 V211 ignore les horaires d'ouverture (finish/buildWeekUnique ne lisent pas
//      StoreOpeningHoursV1) : magasin libre ou contraint posé un jour de fermeture ;
//   R2 V181 garde un RDV/verrou sur un jour de fermeture et réécrit le reste au lieu de refuser ;
//   R3 V181 : le report en cascade ne lit ni le RDV ni le verrou daté de la semaine d'arrivée ;
//   R4 V185 (v182-fixes.js) réorganise une semaine manuelle affichée après « Générer la semaine » ;
//   R5 V211 régénère la semaine entamée : visite réalisée effacée, visites posées dans le passé ;
//   R6 V211 période : rotation faussée dès la 2e semaine (repeatReadinessV211) ;
//   R7 terrain et V211 période re-planifient plus tôt les magasins d'une semaine manuelle future.
const fs = require('fs'), vm = require('vm'), path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const WORK = DAYS.slice(0, 5);
const ARCHIVE_KEY = 'chef_sector_plan_archive_v1', RANGE_KEY = 'chef_sector_range_v1', MAIN_KEY = 'sector_planner_universal_v1';
const NOW = '2026-11-02T08:00:00', NOW_WED = '2026-11-04T08:00:00';
const W0 = '2026-11-02', W1 = '2026-11-09', W2 = '2026-11-16', W3 = '2026-11-23', W4 = '2026-11-30', W5 = '2026-12-07';
const HOLIDAY = '2026-11-11';
const EDITED_AT = '2026-10-30T10:00:00.000Z'; // retouche utilisateur antérieure à « aujourd'hui »
const copy = x => JSON.parse(JSON.stringify(x));
const emptyPlan = () => Object.fromEntries(DAYS.map(d => [d, []]));
const ids = route => Array.from(route || [], s => String(s && s.id));

/* ------------------------------------------------------------- vrais modules ---- */
const CORE = read('src/chef-secteur.html');
function coreLine(re, label) { const m = CORE.match(re); if (!m) throw new Error('noyau : ' + label + ' introuvable'); return m[0]; }
const CORE_LINES = [
  coreLine(/^function rad\(v\)\{.*$/m, 'rad'),
  coreLine(/^function hav\(a,b\)\{.*$/m, 'hav'),
  coreLine(/^function baseObj\(\)\{.*$/m, 'baseObj'),
  coreLine(/^function havBase\(s\)\{.*$/m, 'havBase'),
  coreLine(/^function routeCost\(r,start\)\{.*$/m, 'routeCost'),
  coreLine(/^function nearestRoute\(list,start\)\{.*$/m, 'nearestRoute'),
  coreLine(/^function twoOpt\(route\)\{.*$/m, 'twoOpt'),
  coreLine(/^function includedByFilters\(s\)\{.*$/m, 'includedByFilters'),
  coreLine(/^function localISO\(date\)\{.*$/m, 'localISO'),
  coreLine(/^function eventDate\(raw\)\{.*$/m, 'eventDate'),
  coreLine(/^window\.calendarEventsForDate=function\(date\)\{.*$/m, 'calendarEventsForDate')
].join('\n');
const RANGE_SOURCE = read('range-planner-v2.js');
const HOOK = 'window.generatePlanningRange=generateRange;';
if (!RANGE_SOURCE.includes(HOOK)) throw new Error('range-planner-v2.js : point d’accroche introuvable');
/* Exposition en lecture seule des deux points d'entrée V211, comme P0.2b et P0.3. */
const RANGE = RANGE_SOURCE.replace(HOOK, 'window.__p04Range={strictSingleWeek,generateRange};' + HOOK);
/* Ordre d'index.html : modules chargés pendant « loading », puis ceux qui s'installent quand
   le document est prêt, puis la chaîne de production qui enveloppe les générateurs. */
const EARLY = [['calendar-oauth.js', read('calendar-oauth.js')], ['visit-counting.js', read('visit-counting.js')], ['visit-coverage.js', read('visit-coverage.js')], ['store-opening-hours.js', read('store-opening-hours.js')]];
const LATE = [['terrain-planning-v1.js', read('terrain-planning-v1.js')], ['range-planner-v2.js', RANGE], ['planning-cascade-v181.js', read('planning-cascade-v181.js')]];
const CHAIN = [['planning-generation-controller.js', read('planning-generation-controller.js')], ['workdays-enforcer.js', read('workdays-enforcer.js')], ['v182-fixes.js', read('v182-fixes.js')], ['planning-route-optimizer-v251.js', read('planning-route-optimizer-v251.js')]];

/* ----------------------------------------------------------------- Agenda ---- */
/* Férié tel que syncGoogleCalendar l'écrit depuis l'agenda Google « Jours fériés en France ». */
const HOLIDAY_GOOGLE = { id: 'fr.french#holiday@group.v.calendar.google.com:20261111_armistice', title: 'Armistice 1918', location: '', calendar: 'Jours fériés en France', date: HOLIDAY, start: HOLIDAY, end: '2026-11-12', allDay: true, source: 'google' };
/* Congés posés sur deux jours (fin exclusive, convention Google pour la journée entière). */
const CONGES = { id: 'conges-novembre', title: 'Congés', location: '', calendar: 'Perso', date: '2026-11-25', start: '2026-11-25', end: '2026-11-27', allDay: true, source: 'google' };
/* Événement horaire bloquant (motif « formation » reconnu par tous les moteurs). */
const FORMATION = { id: 'formation-samsung', title: 'Formation Samsung', location: 'Lyon', calendar: 'Travail', date: '2026-12-01', start: '2026-12-01T09:00:00', end: '2026-12-01T17:00:00', allDay: false, source: 'google' };

/* ------------------------------------------------------------------ horloge ---- */
const RealDate = Date;
function clock(now) {
  const c = { now };
  c.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [c.now])); }
    static now() { return new RealDate(c.now).getTime(); }
  };
  return c;
}

/* --------------------------------------------------------------- géographie ---- */
const BASE = { lat: 45.764, lon: 4.8357 }; // Lyon
function store(id, northKm, eastKm, extra) {
  return Object.assign({ id, enseigne: 'Fnac', ville: 'Ville ' + id, adresse: '1 rue ' + id, dept: '69',
    lat: +(BASE.lat + northKm / 111).toFixed(5), lon: +(BASE.lon + eastKm / 78).toFixed(5), priority: 3, active: true, intervalDays: 30 }, extra || {});
}
/* Petit secteur nommé : 8 à 32 km au nord du départ (journées jamais limitées par l'heure). */
function named(list, extra) { return list.map((id, i) => store(id, 8 + (i % 7) * 4, ((i * 5) % 11) - 5, extra && extra[id])); }
function planOf(stores, spec) {
  const plan = emptyPlan();
  for (const [day, list] of Object.entries(spec)) plan[day] = list.map(id => { const s = stores.find(x => x.id === id); if (!s) throw new Error('fixture : magasin ' + id + ' inconnu'); return copy(s); });
  return plan;
}
const OPEN = { open: '09:00', close: '19:00' };
/* Horaires explicites (store-opening-hours.js : [] = fermé, intervalles = ouvert). */
function hours(closed) { return Object.fromEntries(DAYS.concat('Dimanche').map(d => [d, d === 'Dimanche' || closed.includes(d) ? [] : [OPEN]])); }
/* Rendez-vous tel que saveAppointment le stocke. */
const rdv = (storeId, date, time) => ({ id: 'rdv-' + storeId + '-' + date, storeId, date, time: time || '14:00', duration: 60, type: 'Visite', note: '' });
/* Visite 6P terminée (businessV2) : seule forme de « visite réalisée » avec Visité coché. */
const done = (storeId, date) => ({ id: 'visit-' + storeId + '-' + date, storeId, status: 'completed', completedDate: date, completedAt: date + 'T07:45:00' });
/* Marqueurs d'une vraie retouche, tels que planning-manual-visits.js (persist) les écrit. */
function protect(o, week, plan) {
  o.archive = o.archive || {}; o.manualWeekEdits = o.manualWeekEdits || {};
  o.archive[week] = Object.assign({}, o.archive[week] || {}, { weekMonday: week, plan: copy(plan), manualEdited: true, manualEditedAt: EDITED_AT });
  o.manualWeekEdits[week] = { at: EDITED_AT, plan: copy(plan) };
  return o;
}

/* ------------------------------------------------------------------ runtime ---- */
function makeState(o) {
  return {
    profile: { baseName: 'Lyon', baseLat: BASE.lat, baseLon: BASE.lon, overnightMode: 'never' },
    settings: Object.assign({ weekDate: o.weekDate || W0, days: (o.days || WORK).slice(), target: o.target || 8, maxVisitsPerDay: o.max || 2, startTime: '08:30', endTime: '18:00', saturdayStart: '08:00', saturdayEnd: '12:00', visitMinutes: 45 }, o.settings || {}),
    stores: copy(o.stores), visits: copy(o.visits || {}), businessV2: { visits: copy(o.v2visits || []), actions: [], storeSnapshots: {} },
    plan: copy(o.plan || emptyPlan()), included: copy(o.included || {}), excluded: {}, locks: copy(o.locks || {}), appointments: copy(o.appointments || []),
    manualWeekEdits: copy(o.manualWeekEdits || {}), hotelReservations: {}, calendarEvents: copy(o.calendarEvents || [])
  };
}
/* Bus d'événements minimal mais réel : les écouteurs posés par les modules sont appelés ;
   comme dans un navigateur, une exception d'écouteur est journalisée sans remonter. Les
   écouteurs asynchrones (V251) sont attendus par settle(). */
function eventBus(errors, pending) {
  const map = new Map();
  return {
    add(type, fn) { if (typeof fn !== 'function') return; if (!map.has(type)) map.set(type, []); map.get(type).push(fn); },
    remove(type, fn) { const l = map.get(type); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    fire(event) {
      const type = event && event.type;
      for (const fn of (map.get(type) || []).slice()) {
        try { const r = fn(event); if (r && typeof r.then === 'function') pending.push(r.catch(e => errors.push(type + ' : ' + (e && e.message || e)))); }
        catch (e) { errors.push(type + ' : ' + (e && e.message || e)); }
      }
      return true;
    }
  };
}
function runtime(o) {
  const c = clock(o.now || NOW), mem = new Map(), proposals = [], refusals = [], listenerErrors = [], pending = [];
  const db = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), flush: () => Promise.resolve() };
  if (o.archive) db.setItem(ARCHIVE_KEY, JSON.stringify(o.archive));
  const state = makeState(o);
  /* L'état est déjà enregistré, comme sur un appareil réel : un save() qui réécrit un état
     inchangé n'est pas une mutation. */
  db.setItem(MAIN_KEY, JSON.stringify(state));
  /* Toute erreur construite par le code des modules est notée : c'est la forme des refus
     volontaires. Une exception technique naît dans le moteur JavaScript et n'apparaît jamais ici. */
  function EngineError(message) { const e = new Error(message); refusals.push(e); return e; }
  EngineError.prototype = Error.prototype;
  const els = {
    weekDate: { value: state.settings.weekDate }, rangeStart: { value: o.rangeStart || '', dataset: {} }, rangeEnd: { value: o.rangeEnd || '' },
    endTime: { value: state.settings.endTime }, maxVisitsPerDay: { value: String(state.settings.maxVisitsPerDay) },
    generateRangeBtn: { disabled: false }, rangePlanStatus: { style: {}, textContent: '' }, statusText: { textContent: '' },
    planningGenerateStatus: { style: {}, textContent: '' }
  };
  const docBus = eventBus(listenerErrors, pending), winBus = eventBus(listenerErrors, pending);
  const ctx = {
    console, Date: c.Date, Map, Set, JSON, Object, Array, String, Number, Math, RegExp, Promise, Error: EngineError, Symbol,
    setTimeout: fn => { if (typeof fn === 'function') fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    state, __chefStorage: db, localStorage: db, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => fn(),
    addEventListener: (t, fn) => winBus.add(t, fn), removeEventListener: (t, fn) => winBus.remove(t, fn), dispatchEvent: e => winBus.fire(e),
    confirm: () => true, alert() {}, showError() {}, save() { db.setItem(MAIN_KEY, JSON.stringify(ctx.state)); }, renderAll() {}, initControls() {}, readPlanningControls() {},
    ChefReliability: {
      checkpoint() {},
      capture: (st, s) => { const target = s || db; return { state: copy(st || ctx.state), archive: JSON.parse(target.getItem(ARCHIVE_KEY) || '{}'), range: JSON.parse(target.getItem(RANGE_KEY) || 'null') }; },
      persist: (bundle, s) => { const target = s || db; target.setItem(ARCHIVE_KEY, JSON.stringify(bundle.archive || {})); target.setItem(RANGE_KEY, JSON.stringify(bundle.range === undefined ? null : bundle.range)); target.setItem(MAIN_KEY, JSON.stringify(bundle.state)); },
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
    addEventListener: (t, fn) => docBus.add(t, fn), removeEventListener: (t, fn) => docBus.remove(t, fn), dispatchEvent: e => docBus.fire(e),
    getElementById: id => els[id] || null, querySelector: () => null,
    querySelectorAll: sel => sel === '[data-day]' ? dayBoxes : [],
    createElement: tag => ({ tagName: String(tag).toUpperCase(), style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, insertAdjacentElement() {}, querySelector: () => null, querySelectorAll: () => [] })
  };
  ctx.window = ctx;
  vm.runInNewContext(CORE_LINES, ctx, { filename: 'src/chef-secteur.html' });
  for (const [name, source] of EARLY) vm.runInNewContext(source, ctx, { filename: name });
  ctx.chefSecteurPrepareCalendarForPlanning(); // enveloppe sémantique Agenda, comme au démarrage
  if (ctx.__calendarSemanticBlocks !== true) throw new Error('enveloppe sémantique Agenda non installée');
  ctx.document.readyState = 'complete';
  for (const [name, source] of LATE) vm.runInNewContext(source, ctx, { filename: name });
  ctx.syncGoogleCalendar = async () => ({ ok: true });
  const terrain = ctx.StoreRunnerTerrainPlanningV1, range = ctx.__p04Range;
  if (!terrain || typeof terrain.generateThreeWeekSnail !== 'function' || typeof terrain.dateBlocked !== 'function') throw new Error('moteur terrain non chargé');
  if (!range || typeof range.strictSingleWeek !== 'function' || typeof range.generateRange !== 'function') throw new Error('V211 non chargé');
  if (typeof ctx.__storeRunnerBuildRemainingWeekPlan !== 'function' || typeof ctx.storeRunnerRecalculateRemainingWeek !== 'function') throw new Error('V181 non installé');
  const chain = !!o.chain;
  if (chain) {
    /* Liaisons faites au démarrage réel par des modules hors périmètre : install() de V211
       quand le DOM « Réglages » existe, le générateur historique du noyau (jamais appelé :
       le générateur spécialisé existe) et le contrôle du point de départ du profil. */
    ctx.storeRunnerGenerateSingleWeek = range.strictSingleWeek;
    ctx.generateWeek = async () => { throw new Error('générateur historique du noyau appelé à la place de V211'); };
    ctx.storeRunnerHasValidBase = () => true;
    for (const [name, source] of CHAIN) vm.runInNewContext(source, ctx, { filename: name });
    if (!ctx.storeRunnerGenerateSingleWeek.__v185Geo || !terrain.generateThreeWeekSnail.__v185Geo) throw new Error('enveloppes V185 non posées');
    if (typeof ctx.storeRunnerGenerateThreeWeeks !== 'function' || !ctx.generateWeek.__storeRunnerPlanningGenerateOwner) throw new Error('contrôleur de génération non installé');
    if (typeof els.generateRangeBtn.onclick !== 'function') throw new Error('enveloppe période V182 non posée');
  }
  return { ctx, db, mem, els, clock: c, proposals, refusals, listenerErrors, terrain, range, chain,
    async settle() { while (pending.length) await Promise.all(pending.splice(0)); } };
}

/* ------------------------------------------------------------------ lectures ---- */
function dateOf(weekKey, day) { const d = new RealDate(weekKey + 'T12:00:00'); d.setDate(d.getDate() + DAYS.indexOf(day)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayOf(date) { return ['Dimanche'].concat(DAYS)[new RealDate(date + 'T12:00:00').getDay()]; }
function weekOf(date) { const d = new RealDate(date + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() || 7) - 1)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addWeeks(week, n) { const d = new RealDate(week + 'T12:00:00'); d.setDate(d.getDate() + 7 * n); return weekOf(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }
function ddmm(date) { return date.slice(8, 10) + '/' + date.slice(5, 7); }
function planIds(plan) { return Object.fromEntries(DAYS.map(d => [d, ids(plan && plan[d])])); }
function samePlan(a, b) { return JSON.stringify(planIds(a)) === JSON.stringify(planIds(b)); }
function show(plan) { return DAYS.filter(d => ids(plan && plan[d]).length).map(d => d.slice(0, 3) + ' ' + ids(plan[d]).join(',')).join(' · ') || 'vide'; }
function archiveOf(rt) { return JSON.parse(rt.db.getItem(ARCHIVE_KEY) || '{}'); }
function rangeOf(rt) { return JSON.parse(rt.db.getItem(RANGE_KEY) || 'null'); }
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
/* Plan d'une semaine tel qu'on le lit après l'opération : la semaine affichée vit dans
   state.plan, les autres dans l'archive (même règle que plannedDates de visit-coverage.js). */
function writtenWeeks(rt, keys) {
  const archive = archiveOf(rt), shown = weekOf(String(rt.ctx.state.settings.weekDate || W0));
  return Object.fromEntries(keys.map(k => [k, k === shown ? rt.ctx.state.plan : (archive[k] ? archive[k].plan : emptyPlan())]));
}
function credit(rt, s) { return Math.max(1, Number(rt.ctx.storeVisitCredit(s)) || 1); }
function canonical(rt, s) { return (rt.ctx.state.stores || []).find(x => String(x.id) === String(s && s.id)) || s; }

/* ------------------------------------------------------------- points d'entrée ---- */
function describeError(rt, e) { return { type: e && e.name ? String(e.name) : typeof e, message: e && e.message !== undefined ? String(e.message) : String(e), controlled: rt.refusals.includes(e) }; }
async function guarded(rt, fn) { try { return { value: await fn() }; } catch (e) { return { threw: true, error: describeError(rt, e) }; } }
/* Message d'erreur rendu par un point d'entrée qui avale ses exceptions (V211, contrôleur) :
   il est rapproché des erreurs que les modules ont eux-mêmes construites. */
function ownRefusal(rt, message) {
  const own = rt.refusals.find(e => e.message === message);
  return own ? { type: String(own.name), message, controlled: true } : { type: 'non observable (exception avalée par le point d’entrée)', message, controlled: false };
}
function buildV181(rt) { rt.ctx.__storeRunnerPlanningGenerationActive = true; try { return rt.ctx.__storeRunnerBuildRemainingWeekPlan(); } finally { rt.ctx.__storeRunnerPlanningGenerationActive = false; } }
function weeksBetween(first, last) { const out = []; for (let k = weekOf(first); k <= weekOf(last); k = addWeeks(k, 1)) out.push(k); return out; }
const ENGINES = {
  V181: { label: 'V181 recalcul', generation: false },
  terrain: { label: 'terrain 3 semaines', generation: true },
  V211s: { label: 'V211 semaine', generation: true },
  V211p: { label: 'V211 période', generation: true }
};
/* Exécute un moteur sur un runtime neuf et rend ce qu'il a calculé, refusé et écrit. */
async function runEngine(engine, o, mode) {
  const rt = runtime(Object.assign({}, o, { chain: mode === 'chaîne' }));
  const before = snapshot(rt), out = { engine, mode, rt, crash: null, refused: null, computed: null, perimeter: [], raw: null, again: null };
  if (engine === 'V181') {
    const computed = await guarded(rt, () => buildV181(rt));
    if (computed.threw) out.crash = computed.error;
    else {
      const r = out.raw = computed.value;
      if (r.ok === false) out.refused = { type: 'refus V181 {ok:false}', message: String(r.error), controlled: true };
      else { out.computed = r.weeks; out.perimeter = Object.keys(r.weeks).sort(); }
      const applied = await guarded(rt, () => rt.ctx.storeRunnerRecalculateRemainingWeek());
      await rt.settle();
      if (applied.threw) out.crash = applied.error;
      /* Stabilité : un second calcul, à la même heure, sur le planning qu'on vient d'appliquer. */
      else if (r.ok && applied.value && applied.value.ok) { const again = await guarded(rt, () => buildV181(rt)); out.again = again.threw ? { crash: again.error } : again.value; }
    }
  } else if (engine === 'terrain') {
    const start = o.start || weekOf(o.weekDate || W0);
    out.perimeter = [start, addWeeks(start, 1), addWeeks(start, 2)];
    let run, built = null;
    if (rt.chain) {
      rt.els.weekDate.value = start;
      run = await guarded(rt, () => rt.ctx.storeRunnerGenerateThreeWeeks());
      if (!run.threw && run.value && run.value.ok === false) out.refused = ownRefusal(rt, String(run.value.error));
      else if (!run.threw) built = run.value && run.value.result;
    } else {
      run = await guarded(rt, () => rt.terrain.generateThreeWeekSnail({ start }));
      if (run.threw) { if (run.error.controlled) out.refused = run.error; } else built = run.value;
    }
    if (run.threw && !run.error.controlled) out.crash = run.error;
    await rt.settle();
    if (built) { out.raw = built; out.computed = Object.fromEntries(built.weeks.map(w => [w.weekKey, copy(w.plan)])); }
  } else if (engine === 'V211s') {
    out.perimeter = [weekOf(o.weekDate || W0)];
    const run = await guarded(rt, () => rt.chain ? rt.ctx.generateWeek() : rt.range.strictSingleWeek());
    await rt.settle();
    if (run.threw) out.crash = run.error;
    else {
      out.raw = run.value;
      if (run.value && run.value.ok === false) out.refused = ownRefusal(rt, String(run.value.error));
      const p = rt.proposals[0];
      if (p && p.archive && p.archive[out.perimeter[0]]) out.computed = { [out.perimeter[0]]: copy(p.archive[out.perimeter[0]].plan) };
    }
  } else if (engine === 'V211p') {
    out.perimeter = weeksBetween(o.rangeStart, o.rangeEnd);
    const run = await guarded(rt, () => rt.chain ? rt.els.generateRangeBtn.onclick() : rt.range.generateRange());
    await rt.settle();
    if (run.threw) out.crash = run.error;
    const status = rt.els.rangePlanStatus.textContent || '', prefix = 'Erreur pendant la génération : ';
    out.raw = { status };
    if (status.startsWith(prefix)) out.refused = ownRefusal(rt, status.slice(prefix.length));
    const p = rt.proposals[0];
    if (p && p.archive) out.computed = Object.fromEntries(out.perimeter.map(k => [k, copy((p.archive[k] && p.archive[k].plan) || emptyPlan())]));
  }
  if (out.refused && !out.refused.controlled && !out.crash) out.crash = out.refused;
  out.mutated = snapshotDiff(before, snapshot(rt));
  out.written = writtenWeeks(rt, out.perimeter);
  out.archive = archiveOf(rt);
  return out;
}
/* Empreinte complète d'une exécution (calcul, refus, état et stockage écrits). L'horloge est
   figée : deux exécutions identiques doivent produire exactement les mêmes octets. */
function fingerprint(out) {
  return JSON.stringify({ crash: out.crash, refused: out.refused && out.refused.message, computed: out.computed && Object.fromEntries(Object.entries(out.computed).map(([k, p]) => [k, planIds(p)])),
    state: JSON.parse(snapshot(out.rt).state), storage: JSON.parse(snapshot(out.rt).storage), again: out.again && (out.again.weeks ? { unchanged: out.again.unchanged, moved: out.again.moved } : out.again) });
}
function firstDifference(a, b) {
  const x = JSON.parse(a), y = JSON.parse(b);
  for (const k of Object.keys(x)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return k;
  return 'aucune';
}

/* ------------------------------------------------------------------ contrat ---- */
/* Contrat d'un scénario, dérivé de sa fixture et jamais du résultat observé. */
function contractOf(o) {
  const shown = weekOf(o.weekDate || W0), original = {};
  for (const [k, snap] of Object.entries(o.archive || {})) original[k] = copy(snap.plan || emptyPlan());
  original[shown] = copy(o.plan || original[shown] || emptyPlan());
  const manual = {};
  for (const [k, snap] of Object.entries(o.archive || {})) if (snap && snap.manualEdited) manual[k] = copy(snap.plan);
  for (const [k, v] of Object.entries(o.manualWeekEdits || {})) if (!manual[k]) manual[k] = copy(v.plan);
  const completed = new Set((o.v2visits || []).filter(v => v.status === 'completed').map(v => v.storeId + '|' + v.completedDate));
  for (const [id, v] of Object.entries(o.visits || {})) for (const d of [v.lastVisit].concat(v.history || [])) if (d) completed.add(id + '|' + d);
  /* Visites réalisées qui figurent dans le planning d'origine à leur date : un fait historique. */
  const doneVisits = [];
  for (const [k, plan] of Object.entries(original)) for (const day of DAYS) for (const id of ids(plan[day])) if (completed.has(id + '|' + dateOf(k, day))) doneVisits.push({ id, date: dateOf(k, day) });
  return {
    today: (o.now || NOW).slice(0, 10), days: (o.days || WORK).slice(), max: o.max || 2, blocked: new Set(o.blocked || []),
    rdv: (o.appointments || []).map(a => ({ id: String(a.storeId), date: a.date })),
    locks: Object.entries(o.locks || {}).map(([id, v]) => typeof v === 'string' ? { id, day: v, week: '' } : { id, day: v.day, week: v.week }),
    manual, original, doneVisits, shown, start: o.rangeStart || null, end: o.rangeEnd || null
  };
}
function diffPlans(before, after) {
  const b = planIds(before), a = planIds(after), where = p => { const m = new Map(); for (const d of DAYS) p[d].forEach(id => m.set(id, d)); return m; };
  const wb = where(b), wa = where(a), out = [];
  for (const [id, d] of wa) { if (!wb.has(id)) out.push('+' + id + ' ' + d); else if (wb.get(id) !== d) out.push(id + ' ' + wb.get(id) + '→' + d); }
  for (const [id, d] of wb) if (!wa.has(id)) out.push('−' + id + ' ' + d);
  for (const d of DAYS) { const x = b[d].filter(id => wa.get(id) === d), y = a[d].filter(id => wb.get(id) === d); if (x.join() !== y.join()) out.push('ordre ' + d); }
  return out.join(', ') || 'identique';
}
const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0');
/* Invariants A→P lus sur les semaines écrites. Rend une liste de constats {inv, cause, detail}. */
function inspect(rt, weeks, k, opts) {
  const o = opts || {}, found = [], add = (inv, cause, detail) => found.push({ inv, cause, detail });
  const hoursApi = rt.ctx.StoreOpeningHoursV1, state = rt.ctx.state;
  const isDone = (id, date) => k.doneVisits.some(v => v.id === id && v.date === date);
  const inPerimeter = date => (!k.start || date >= k.start) && (!k.end || date <= k.end);
  const usable = date => k.days.includes(dayOf(date)) && !k.blocked.has(date) && date >= k.today;
  for (const week of Object.keys(weeks).sort()) {
    const plan = weeks[week] || emptyPlan();
    if (k.manual[week]) { if (!samePlan(plan, k.manual[week])) add('H', 5, 'semaine manuelle du ' + ddmm(week) + ' modifiée : ' + diffPlans(k.manual[week], plan)); continue; }
    const seen = new Map();
    for (const day of DAYS) {
      const date = dateOf(week, day), route = Array.from(plan[day] || []);
      for (const s of route) { const id = String(s.id); if (seen.has(id)) add('B', 2, id + ' deux fois dans la semaine du ' + ddmm(week) + ' (' + seen.get(id) + ' et ' + day + ')'); else seen.set(id, day); }
      if (!route.length) continue;
      if (date < k.today) {
        /* Une journée passée est de l'histoire : on peut en retirer une visite ratée pour la
           reporter, jamais y ajouter ni réordonner (ordre d'origine conservé). */
        const before = ids((k.original[week] || {})[day]), after = ids(route);
        for (const id of after) if (!before.includes(id)) add('J', 3, id + ' posé sur le ' + day.toLowerCase() + ' ' + ddmm(date) + ', jour déjà passé');
        const kept = before.filter(id => after.includes(id));
        if (after.every(id => before.includes(id)) && kept.join() !== after.join()) add('J', 3, 'journée passée du ' + ddmm(date) + ' réordonnée : ' + before.join(',') + ' → ' + after.join(','));
        continue;
      }
      for (const s of route) {
        const id = String(s.id), fact = isDone(id, date), c = canonical(rt, s);
        if (fact) continue;
        if (!k.days.includes(day)) add('F', 3, id + ' posé ' + day.toLowerCase() + ' ' + ddmm(date) + ', jour non travaillé');
        if (k.blocked.has(date)) add('G', 3, id + ' posé le ' + ddmm(date) + ', jour bloqué');
        const rows = hoursApi.intervalsFor(c, day, state);
        if (Array.isArray(rows) && !rows.length) add('E', 3, id + ' posé ' + day.toLowerCase() + ' ' + ddmm(date) + ', magasin fermé ce jour-là');
      }
      const credits = route.reduce((n, s) => n + credit(rt, s), 0);
      if (credits > k.max && !(o.tolerateToday && date === k.today)) add('C', 4, day.toLowerCase() + ' ' + ddmm(date) + ' : ' + credits + ' crédits pour un plafond de ' + k.max + ' (' + ids(route).join('+') + ')');
      const sched = hoursApi.scheduleRoute(route, day, state, { date });
      if (sched.appointmentConflicts) add('I', 3, 'RDV intenable le ' + ddmm(date) + ' dans la tournée ' + ids(route).join('→'));
      else if (!sched.closedCount && sched.estimatedEnd != null && sched.estimatedEnd > sched.endLimit + 0.001) add('C', 4, ddmm(date) + ' : fin estimée ' + hm(sched.estimatedEnd) + ' après ' + hm(sched.endLimit));
    }
  }
  const placedIn = (week, id) => DAYS.filter(d => ids((weeks[week] || {})[d]).includes(id)).map(d => dateOf(week, d));
  for (const r of k.rdv) {
    const week = weekOf(r.date); if (!weeks[week] || k.manual[week]) continue;
    const at = placedIn(week, r.id), wrong = at.filter(d => d !== r.date);
    if (wrong.length) add('I', 3, r.id + ' a un RDV le ' + dayOf(r.date).toLowerCase() + ' ' + ddmm(r.date) + ' mais est posé le ' + wrong.map(ddmm).join(', '));
    if (o.requireConstraints && inPerimeter(r.date) && usable(r.date) && !at.includes(r.date)) add('I', 1, r.id + ' (RDV ' + ddmm(r.date) + ') absent de la date de son rendez-vous');
  }
  for (const l of k.locks) for (const week of Object.keys(weeks)) {
    if (k.manual[week] || (l.week && l.week !== week)) continue;
    if (k.rdv.some(r => r.id === l.id && weekOf(r.date) === week)) continue; // RDV > verrou
    const date = dateOf(week, l.day), at = placedIn(week, l.id), wrong = at.filter(d => d !== date);
    if (wrong.length) add('I', 3, l.id + ' verrouillé ' + (l.week ? 'le ' + l.day.toLowerCase() + ' ' + ddmm(date) : 'tous les ' + l.day.toLowerCase() + 's') + ' mais posé le ' + wrong.map(ddmm).join(', '));
    if (o.requireConstraints && inPerimeter(date) && usable(date) && !at.includes(date)) add('I', 1, l.id + ' (verrou ' + l.day.toLowerCase() + ' ' + ddmm(date) + ') absent de son jour');
  }
  for (const v of k.doneVisits) {
    const week = weekOf(v.date); if (!weeks[week] || k.manual[week] || !inPerimeter(v.date)) continue;
    if (!placedIn(week, v.id).includes(v.date)) add('J', 1, v.id + ' réellement visité le ' + ddmm(v.date) + ' a disparu de cette journée' + (placedIn(week, v.id).length ? ' (reposé le ' + placedIn(week, v.id).map(ddmm).join(', ') + ')' : ''));
  }
  /* Rotation / continuité : un magasin posé à la main dans une semaine de l'horizon compte déjà
     dans l'horizon ; il n'est pas re-planifié ailleurs pendant que d'autres attendent. */
  if (o.horizonUnique) {
    const manualIds = new Set(Object.keys(weeks).filter(w => k.manual[w]).flatMap(w => DAYS.flatMap(d => ids(k.manual[w][d]))));
    for (const week of Object.keys(weeks).sort()) {
      if (k.manual[week]) continue;
      for (const day of DAYS) for (const id of ids(weeks[week][day])) if (manualIds.has(id) && !k.locks.some(l => l.id === id) && !k.rdv.some(r => r.id === id))
        add('O', 8, id + ' posé à la main dans une semaine protégée de l’horizon, re-planifié le ' + ddmm(dateOf(week, day)));
    }
  }
  return found;
}
/* « Aucune perte » pour la cascade : entrée (semaine affichée + archive postérieure) −
   retraits annoncés + ajouts annoncés = sortie, magasin par magasin. */
function accountV181(o, r) {
  const found = [], count = new Map(), bump = (m, id, n) => m.set(id, (m.get(id) || 0) + n), shown = weekOf(o.weekDate || W0);
  for (const day of DAYS) for (const id of ids((o.plan || {})[day])) bump(count, id, 1);
  for (const [key, snap] of Object.entries(o.archive || {})) if (key > shown) for (const day of DAYS) for (const id of ids(snap.plan && snap.plan[day])) bump(count, id, 1);
  const expected = new Map(count);
  for (const x of r.removed || []) bump(expected, String(x.id), -1);
  for (const x of r.added || []) bump(expected, String(x.id), 1);
  const outCount = new Map();
  for (const plan of Object.values(r.weeks || {})) for (const day of DAYS) for (const id of ids(plan[day])) bump(outCount, id, 1);
  for (const id of Array.from(new Set(Array.from(expected.keys()).concat(Array.from(outCount.keys())))).sort()) {
    const want = expected.get(id) || 0, got = outCount.get(id) || 0;
    if (got < want) found.push({ inv: 'A', cause: 1, detail: id + ' : ' + got + ' occurrence(s) écrite(s) pour ' + want + ' attendue(s)' });
    if (got > want) found.push({ inv: 'B', cause: 2, detail: id + ' : ' + got + ' occurrence(s) écrite(s) pour ' + want + ' attendue(s)' });
  }
  for (const x of r.removed || []) if (!x.reason) found.push({ inv: 'A', cause: 1, detail: x.id + ' retiré sans raison annoncée' });
  return found;
}
/* Cascade « dans l'ordre » : un magasin reporté n'a sauté aucun créneau antérieur où il
   tenait (jour travaillé, non bloqué, semaine ouverte, crédits, horaires, pas déjà dans la
   semaine). Les journées ne font que grossir pendant la cascade : si le magasin tient dans
   la journée finale, il tenait au moment de son placement. Lu sur la couche brute (sans
   réordonnancement V251). */
function firstFitV181(rt, o, r, k) {
  const found = [], shown = weekOf(o.weekDate || W0), origin = new Map();
  for (const day of DAYS) for (const id of ids((o.plan || {})[day])) origin.set(shown + '|' + id, dateOf(shown, day));
  for (const [key, snap] of Object.entries(o.archive || {})) if (key > shown) for (const day of DAYS) for (const id of ids(snap.plan && snap.plan[day])) origin.set(key + '|' + id, dateOf(key, day));
  const fixedTo = id => k.rdv.some(x => x.id === id) || k.locks.some(x => x.id === id);
  const weeks = r.weeks || {}, where = new Map();
  for (const [key, plan] of Object.entries(weeks)) for (const day of DAYS) for (const id of ids(plan[day])) { if (!where.has(id)) where.set(id, []); where.get(id).push(dateOf(key, day)); }
  const added = new Set((r.added || []).map(x => String(x.id)));
  for (const [key0, from] of origin) {
    const id = key0.split('|')[1]; if (fixedTo(id) || added.has(id)) continue;
    const dates = where.get(id) || [], start = from < k.today ? k.today : from;
    const to = dates.filter(d => d >= start).sort()[0]; if (!to || to <= start) continue;
    const s = canonical(rt, { id });
    for (let d = start; d < to; d = nextDate(d)) {
      const week = weekOf(d), day = dayOf(d);
      if (!k.days.includes(day) || k.blocked.has(d) || (k.manual[week] && week > shown)) continue;
      const route = Array.from((weeks[week] || {})[day] || []);
      if (DAYS.some(x => ids((weeks[week] || {})[x]).includes(id))) continue;
      if (route.reduce((n, x) => n + credit(rt, x), 0) + credit(rt, s) > k.max) continue;
      if (!rt.ctx.StoreOpeningHoursV1.routeFits(route.concat([s]), day, rt.ctx.state, { date: d })) continue;
      found.push({ inv: 'K', cause: 6, detail: id + ' reporté du ' + ddmm(from) + ' au ' + ddmm(to) + ' alors que le ' + day.toLowerCase() + ' ' + ddmm(d) + ' restait libre' });
      break;
    }
  }
  return found;
}
function nextDate(d) { const x = new RealDate(d + 'T12:00:00'); x.setDate(x.getDate() + 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }

/* ---------------------------------------------------------------- jugement ---- */
/* Ce que le contrat attend d'une exécution : un plan qui respecte les invariants, ou un refus
   volontaire sans aucune écriture quand le scénario pose une contrainte impossible. */
function judge(engine, out, o, k, options) {
  const found = [], gen = ENGINES[engine].generation;
  if (out.crash) return [{ inv: '—', cause: 11, detail: 'crash ' + out.crash.type + ' « ' + out.crash.message + ' »' }];
  if (options.expect === 'refus') {
    if (out.refused) { if (out.mutated) found.push({ inv: options.inv || 'I', cause: 10, detail: 'refus « ' + out.refused.message + ' » mais données modifiées : ' + out.mutated }); return found; }
    found.push({ inv: options.inv || 'I', cause: 3, detail: 'contrainte impossible acceptée sans refus' });
    for (const f of inspect(out.rt, out.written, k, {})) found.push(f);
    /* Tout le reste du planning devait rester celui d'avant : sinon mutation partielle. */
    const other = Object.keys(out.written).filter(w => k.original[w] && !samePlan(out.written[w], k.original[w]));
    for (const w of other) found.push({ inv: options.inv || 'I', cause: 10, detail: 'semaine du ' + ddmm(w) + ' réécrite malgré la contrainte impossible : ' + diffPlans(k.original[w], out.written[w]) });
    return found;
  }
  if (out.refused) return [{ inv: 'A', cause: 12, detail: 'refus inattendu sur un scénario faisable : « ' + out.refused.message + ' »' }];
  for (const f of inspect(out.rt, out.written, k, { requireConstraints: gen, tolerateToday: engine === 'V181', horizonUnique: options.horizonUnique })) found.push(f);
  /* Écriture cohérente : la semaine affichée est la même dans state.plan et dans l'archive. */
  const shown = weekOf(String(out.rt.ctx.state.settings.weekDate)), snap = out.archive[shown];
  if (snap && snap.plan && !samePlan(snap.plan, out.rt.ctx.state.plan) && out.perimeter.includes(shown)) found.push({ inv: 'A', cause: 10, detail: 'semaine affichée du ' + ddmm(shown) + ' : state.plan (' + show(out.rt.ctx.state.plan) + ') ≠ archive (' + show(snap.plan) + ')' });
  /* Aucune semaine hors du périmètre de l'opération n'est réécrite. */
  for (const [w, plan] of Object.entries(k.original)) if (!out.perimeter.includes(w) && out.archive[w] && !samePlan(out.archive[w].plan, plan)) found.push({ inv: 'A', cause: 10, detail: 'semaine du ' + ddmm(w) + ', hors périmètre, réécrite : ' + diffPlans(plan, out.archive[w].plan) });
  if (out.computed) for (const w of out.perimeter) {
    if (k.manual[w]) continue;
    const a = out.computed[w] || emptyPlan(), b = out.written[w] || emptyPlan(), members = p => DAYS.flatMap(d => ids(p[d])).sort().join();
    /* Brut : écrit = calculé. Chaîne : V185/V251 peuvent changer jour et ordre, jamais l'ensemble. */
    if (out.mode === 'brut' ? !samePlan(a, b) : members(a) !== members(b)) found.push({ inv: 'A', cause: 1, detail: 'semaine du ' + ddmm(w) + ' : calculé (' + show(a) + ') ≠ écrit (' + show(b) + ')' });
  }
  if (engine === 'V181' && out.raw && out.raw.ok) {
    for (const f of accountV181(o, out.raw)) found.push(f);
    if (out.mode === 'brut') for (const f of firstFitV181(out.rt, o, out.raw, k)) found.push(f);
    const a = out.again;
    if (a && !(a.ok && a.unchanged)) {
      const now = a.weeks ? writtenWeeks(out.rt, a.changedWeekKeys || []) : {};
      const detail = a.crash ? 'crash ' + a.crash.type + ' « ' + a.crash.message + ' »' : !a.ok ? 'refus « ' + a.error + ' »' : (a.changedWeekKeys || []).map(w => 'semaine du ' + ddmm(w) + ' ' + diffPlans(now[w], a.weeks[w])).join(' ; ');
      found.push({ inv: 'M', cause: 12, detail: 'instabilité : relancé aussitôt (même heure) sur le planning qu’il vient d’écrire, le recalcul change encore : ' + detail });
    }
  }
  return found;
}

/* ------------------------------------------------------------------- cas ---- */
const CASES = [], OUTCOMES = {};
async function scenario(id, title, engines, invariants, fn) {
  const c = { id, title, engines, invariants, findings: [], notes: [], ambiguous: null, ran: new Set(),
    fail(inv, cause, where, detail) { this.findings.push({ inv, cause, where, detail }); },
    note(text) { this.notes.push(text); },
    ambiguity(text) { this.ambiguous = text; } };
  try { await fn(c); } catch (e) { c.findings.push({ inv: '—', cause: '—', where: 'harnais', detail: 'erreur du harnais de test (pas un verdict moteur) : ' + (e && e.stack || e) }); }
  CASES.push(c);
}
/* Une précondition fausse invalide la fixture, pas le moteur : elle est signalée à part. */
function precondition(c, label, ok, detail) { if (!ok) c.findings.push({ inv: '—', cause: '—', where: 'précondition', detail: label + (detail ? ' — ' + detail : '') }); return ok; }
/* Joue un moteur deux fois par couche, sur des runtimes neufs : la première exécution est
   jugée, la seconde prouve le déterminisme (cause 9 si les deux divergent). */
async function exercise(c, engine, o, opts) {
  const options = opts || {}, k = contractOf(o), outs = {};
  for (const mode of options.modes || ['brut', 'chaîne']) {
    const where = ENGINES[engine].label + ' (' + mode + ')';
    const first = await runEngine(engine, o, mode), second = await runEngine(engine, o, mode);
    const a = fingerprint(first), b = fingerprint(second);
    if (a !== b) c.fail('M', 9, where, 'deux exécutions du même état divergent sur : ' + firstDifference(a, b));
    for (const f of judge(engine, first, o, k, options)) c.fail(f.inv, f.cause, where, f.detail);
    outs[mode] = first; c.ran.add(ENGINES[engine].label);
    if (first.refused && !first.crash) c.note(where + ' : refus « ' + first.refused.message + ' »');
    /* Preuve non vide : ce que la couche brute a réellement écrit sur son périmètre. */
    else if (mode === 'brut' && !first.crash) c.note(where + ' : ' + first.perimeter.map(w => ddmm(w) + (k.manual[w] ? ' (manuelle)' : '') + ' [' + show(first.written[w]) + ']').join(' ; '));
  }
  OUTCOMES[c.id + '|' + engine] = outs;
  return outs;
}

/* ---------------------------------------------------------------- fixtures ---- */
/* STRESS : 40 magasins, 6 enseignes (Darty, Boulanger, But = 2 crédits), plafond 3 crédits,
   samedi désactivé, férié 11/11, congés 25–26/11, formation 01/12, RDV, verrou daté, verrou
   récurrent, magasin fermé lundi/mardi, visite réalisée aujourd'hui, magasin visité il y a
   trois jours, semaine manuelle future (16/11), journées saturées, cascade sur 4 semaines. */
const STRESS = [
  ['V', 'Fnac', 10, 2], ['RV', 'Fnac', 12, -3], ['R', 'Fnac', 15, 4], ['L', 'Boulanger', 18, -6], ['Q', 'Carrefour', 9, -8], ['CL', 'Cultura', 14, 7],
  ['D1', 'Darty', 16, 0], ['D2', 'Darty', 20, 5], ['D3', 'Darty', 22, -4], ['B1', 'But', 11, 9], ['BO1', 'Boulanger', 19, 8],
  ['a', 'Fnac', 8, 1], ['b', 'Carrefour', 9, 3], ['c', 'Fnac', 13, -1], ['d', 'Cultura', 12, 2], ['e', 'Carrefour', 10, -5], ['f', 'Fnac', 17, -2], ['g', 'Carrefour', 21, 1],
  ['h', 'Fnac', 14, -7], ['i', 'Cultura', 16, 6], ['j', 'Fnac', 18, 3], ['k', 'Carrefour', 23, -1], ['l', 'Fnac', 11, -4], ['n', 'Cultura', 13, 5], ['x', 'Fnac', 24, 2],
  ['o', 'Fnac', 9, 6], ['p', 'Carrefour', 10, 8], ['q', 'Fnac', 15, -5], ['r', 'Cultura', 17, -8], ['s', 'Fnac', 19, -3], ['t', 'Carrefour', 20, 7],
  ['u', 'Fnac', 22, -6], ['v', 'Cultura', 24, 4], ['w', 'Fnac', 25, -2], ['m1', 'Fnac', 8, -2], ['m2', 'Carrefour', 12, -9], ['m3', 'Fnac', 14, 9], ['m4', 'Cultura', 16, -9], ['y', 'Fnac', 26, 0], ['z', 'Carrefour', 27, 6]
];
function stressFixture() {
  const st = STRESS.map(([id, enseigne, n, e]) => store(id, n, e, Object.assign({ enseigne }, id === 'CL' ? { openingHours: hours(['Lundi', 'Mardi']) } : {})));
  const w0 = planOf(st, { Lundi: ['V', 'a', 'b', 'D1'], Mardi: ['CL', 'c', 'd', 'e'], Mercredi: ['Q', 'f', 'g', 'B1'], Jeudi: ['h', 'i', 'j', 'k'], Vendredi: ['l', 'BO1', 'n', 'D2', 'x', 'D3'] });
  const w1 = planOf(st, { Lundi: ['R', 'o', 'p'], Mardi: ['RV', 'q', 'r'], Jeudi: ['s'], Vendredi: ['t'] });
  const w2 = planOf(st, { Lundi: ['m1'], Mardi: ['m2', 'm3'], Jeudi: ['m4'] });
  const w3 = planOf(st, { Lundi: ['L', 'u'], Mardi: ['v'], Mercredi: ['w'] });
  return protect({ stores: st, weekDate: W0, plan: copy(w0), max: 3, target: 12, start: W0, rangeStart: W0, rangeEnd: '2026-12-04',
    archive: { [W0]: { weekMonday: W0, plan: copy(w0) }, [W1]: { weekMonday: W1, plan: copy(w1) }, [W3]: { weekMonday: W3, plan: copy(w3) } },
    calendarEvents: [HOLIDAY_GOOGLE, CONGES, FORMATION], blocked: [HOLIDAY, '2026-11-25', '2026-11-26', '2026-12-01'],
    appointments: [rdv('R', '2026-11-12')], locks: { L: { day: 'Mardi', week: W3 }, Q: 'Vendredi' },
    visits: { RV: { lastVisit: '2026-10-30', history: ['2026-10-30'] } }, v2visits: [done('V', W0)] }, W2, w2);
}
/* Contrat simple et faisable, identique pour les quatre moteurs (cohérence N). */
function crossFixture() {
  const st = named(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'R', 'L', 'Q', 'M1']).concat([
    store('CL', 12, 6, { enseigne: 'Cultura', priority: 5, openingHours: hours(['Lundi', 'Mardi']) }), store('DA', 14, -6, { enseigne: 'Darty' })]);
  const w1 = planOf(st, { Lundi: ['R', 'L', 'n1'], Mardi: ['n2', 'n3'], Mercredi: ['CL', 'Q'], Jeudi: ['n4'], Vendredi: ['n5', 'DA'] });
  const w2 = planOf(st, { Lundi: ['M1'] }), w3 = planOf(st, { Lundi: ['n6'], Mardi: ['CL'], Mercredi: ['n7'] });
  return protect({ stores: st, weekDate: W1, plan: copy(w1), max: 2, target: 8, start: W1, rangeStart: W1, rangeEnd: '2026-11-27',
    archive: { [W1]: { weekMonday: W1, plan: copy(w1) }, [W3]: { weekMonday: W3, plan: copy(w3) } },
    calendarEvents: [HOLIDAY_GOOGLE], blocked: [HOLIDAY], appointments: [rdv('R', '2026-11-12')], locks: { L: { day: 'Mardi', week: W1 }, Q: 'Vendredi' } }, W2, w2);
}
/* Contrainte explicite (verrou daté ou RDV) posée sur le lundi 09/11, jour de fermeture de K. */
function closedConstraintFixture(kind) {
  const st = named(['K', 'a', 'b', 'c', 'd', 'e', 'f'], { K: { enseigne: 'Cultura', openingHours: hours(['Lundi']) } });
  const sentinel = planOf(st, { Lundi: ['K', 'a'], Mardi: ['b'], Mercredi: ['c'], Jeudi: ['d'], Vendredi: ['e'] });
  const o = { stores: st, weekDate: W1, plan: copy(sentinel), archive: { [W1]: { weekMonday: W1, plan: copy(sentinel) } }, max: 2, target: 7, start: W1, rangeStart: W1, rangeEnd: '2026-11-13' };
  if (kind === 'verrou') o.locks = { K: { day: 'Lundi', week: W1 } }; else o.appointments = [rdv('K', W1)];
  return o;
}
/* Semaine affichée saturée : K (libre cette semaine) déborde vers la semaine du 09/11, où il a
   un rendez-vous (jeudi 12/11) ou un verrou (jeudi), sans y figurer encore. */
function cascadeConstraintFixture(kind) {
  const st = named(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'K']);
  const plan = planOf(st, { Lundi: ['a', 'b'], Mardi: ['c', 'd', 'K'], Mercredi: ['e', 'f'], Jeudi: ['g', 'h'], Vendredi: ['i', 'j'] });
  const o = { stores: st, weekDate: W0, plan: copy(plan), archive: { [W0]: { weekMonday: W0, plan: copy(plan) } }, max: 2 };
  if (kind === 'rdv') o.appointments = [rdv('K', '2026-11-12')];
  if (kind === 'verrou daté') o.locks = { K: { day: 'Jeudi', week: W1 } };
  if (kind === 'verrou récurrent') o.locks = { K: 'Jeudi' };
  return o;
}
/* Secteur de 30 magasins en anneau déterministe (P0.2a/P0.2b/P0.3). */
function ring() { return Array.from({ length: 30 }, (_, i) => { const a = (i * 137.508) * Math.PI / 180, km = 8 + (i * 7) % 38; return store('s' + String(i + 1).padStart(2, '0'), km * Math.cos(a), km * Math.sin(a)); }); }
/* Visite réalisée : V visité le lundi 02/11 (prévu ce jour-là), M prévu mardi 03/11, non visité. */
function doneFixture(now) {
  const st = named(['V', 'M', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  const plan = planOf(st, { Lundi: ['V', 'a'], Mardi: ['M', 'b'], Mercredi: ['c', 'd'], Jeudi: ['e', 'f'], Vendredi: ['g', 'h'] });
  return { stores: st, weekDate: W0, plan: copy(plan), archive: { [W0]: { weekMonday: W0, plan: copy(plan) } }, max: 2, target: 10, start: W0, rangeStart: W0, rangeEnd: '2026-11-13', v2visits: [done('V', W0)], now };
}
/* Rotation : 12 magasins, 4 visites par semaine ; A (P5) et B (P4) mensuels, C (P3) bimensuels. */
function rotationStores() {
  const out = []; let i = 0;
  for (const [g, priority, intervalDays] of [['A', 5, 30], ['B', 4, 30], ['C', 3, 15]]) for (let n = 1; n <= 4; n++) { i++; out.push(store(g + n, 8 + (i % 5), ((i * 3) % 7) - 3, { priority, intervalDays })); }
  return out;
}
/* Une semaine manuelle (16/11 ou 09/11) au milieu de l'horizon généré. */
function manualHorizonFixture() {
  const st = Array.from({ length: 12 }, (_, i) => store('s' + String(i + 1).padStart(2, '0'), 6 + (i + 1) * 2, (((i + 1) * 5) % 11) - 5));
  return protect({ stores: st, weekDate: W0, target: 4, max: 2, start: W0, rangeStart: W0, rangeEnd: '2026-11-20' }, W1, planOf(st, { Lundi: ['s01'], Mardi: ['s02'] }));
}
/* Priorité contre contraintes dures : U très en retard n'ouvre que le mercredi ; les trois
   mercredis de l'horizon sont férié (11/11), semaine manuelle (18/11) et verrou de K avec un
   plafond d'un crédit (25/11). X, visité il y a trois jours, libère un créneau au recalcul. */
function priorityFixture() {
  const st = [store('U', 10, 0, { openingHours: hours(['Lundi', 'Mardi', 'Jeudi', 'Vendredi', 'Samedi']) })].concat(named(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'K', 'X']));
  const w1 = planOf(st, { Lundi: ['X'], Mardi: ['n2'], Jeudi: ['n3'], Vendredi: ['n4'] });
  return protect({ stores: st, weekDate: W1, plan: copy(w1), archive: { [W1]: { weekMonday: W1, plan: copy(w1) } }, max: 1, target: 5, start: W1, rangeStart: W1, rangeEnd: '2026-11-27',
    calendarEvents: [HOLIDAY_GOOGLE], blocked: [HOLIDAY], visits: { U: { lastVisit: '2026-08-01', history: ['2026-08-01'] }, X: { lastVisit: '2026-10-30', history: ['2026-10-30'] } },
    locks: { K: { day: 'Mercredi', week: W3 } } }, W2, planOf(st, { Lundi: ['n1'] }));
}
function forcedFixture() {
  const st = named(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'a', 'b']), sentinel = planOf(st, { Lundi: ['a'], Mardi: ['b'] });
  return { stores: st, weekDate: W1, plan: copy(sentinel), archive: { [W1]: { weekMonday: W1, plan: copy(sentinel) } }, max: 1, target: 6, start: W1, rangeStart: W1, rangeEnd: '2026-11-13',
    calendarEvents: [HOLIDAY_GOOGLE], blocked: [HOLIDAY], included: { i1: true, i2: true, i3: true, i4: true, i5: true, i6: true } };
}
/* Jours travaillés lundi, mardi, jeudi, vendredi ; samedi désactivé. La semaine future du
   23/11 garde des visites posées avant le changement de réglage (mercredi 25/11, samedi 28/11) :
   le recalcul de la semaine affichée (16/11) doit les reporter, les générations les ignorer. */
function workdaysFixture() {
  const st = named(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  const w2 = planOf(st, { Lundi: ['a'], Mardi: ['b'], Jeudi: ['e'], Vendredi: ['f'] }), w3 = planOf(st, { Lundi: ['h'], Mercredi: ['c', 'd'], Samedi: ['g'] });
  return { stores: st, weekDate: W2, plan: copy(w2), archive: { [W2]: { weekMonday: W2, plan: copy(w2) }, [W3]: { weekMonday: W3, plan: copy(w3) } }, max: 2, target: 8, start: W2, rangeStart: W2, rangeEnd: '2026-12-04', days: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'] };
}
function creditsFixture() {
  const st = [['d1', 'Darty'], ['d2', 'Darty'], ['b1', 'Boulanger'], ['b2', 'Boulanger'], ['u1', 'But'], ['c1', 'Conforama'], ['f1', 'Fnac'], ['f2', 'Fnac'], ['f3', 'Fnac'], ['f4', 'Carrefour'], ['f5', 'Carrefour'], ['f6', 'Fnac']]
    .map(([id, enseigne], i) => store(id, 8 + (i % 6) * 3, ((i * 5) % 11) - 5, { enseigne }));
  const w1 = planOf(st, { Lundi: ['d1', 'd2'], Mardi: ['b1', 'b2', 'f1'], Jeudi: ['u1', 'c1'], Vendredi: ['f2', 'f3', 'f4', 'f5'] });
  return { stores: st, weekDate: W1, plan: copy(w1), archive: { [W1]: { weekMonday: W1, plan: copy(w1) } }, max: 3, target: 10, start: W1, rangeStart: W1, rangeEnd: '2026-11-27' };
}

/* --------------------------------------------------------- lectures de rotation ---- */
/* Rotation (O) : une semaine ne reprend pas un magasin servi la semaine précédente, dont la
   cadence (> 7 j) n'est pas échue, tant qu'un magasin du vivier attend depuis plus longtemps. */
function rotationFindings(ordered, stores) {
  const found = [], last = new Map();
  ordered.forEach(([week, plan], index) => {
    const here = new Set(DAYS.flatMap(d => ids(plan[d])));
    if (index > 0) for (const id of Array.from(here).sort()) {
      const s = stores.find(x => x.id === id);
      if (last.get(id) !== index - 1 || !(Number(s && s.intervalDays) > 7)) continue;
      const waiting = stores.filter(t => !here.has(t.id) && (last.get(t.id) === undefined || last.get(t.id) < index - 1)).map(t => t.id);
      if (waiting.length) found.push({ inv: 'O', cause: 8, detail: 'semaine du ' + ddmm(week) + ' : ' + id + ' (cadence ' + s.intervalDays + ' j) repris 7 j après, alors que ' + waiting.slice(0, 4).join(', ') + (waiting.length > 4 ? '…' : '') + ' attend' + (waiting.length > 1 ? 'ent' : '') + ' depuis plus longtemps' });
    }
    for (const id of here) last.set(id, index);
  });
  return found;
}
const flatIds = plan => DAYS.flatMap(d => ids(plan && plan[d]));

/* ================================================================ scénarios ==== */
(async () => {
  /* ---------- S. STRESS ---------- */
  {
    const o = stressFixture(), rt = runtime(o), st = rt.ctx.state;
    const pre = c => {
      const credits = Object.fromEntries(['D1', 'BO1', 'B1', 'Q', 'a', 'CL'].map(id => [id, credit(rt, { id })]));
      precondition(c, 'crédits : Darty, Boulanger, But = 2 ; Carrefour, Fnac, Cultura = 1 (visit-counting.js)', credits.D1 === 2 && credits.BO1 === 2 && credits.B1 === 2 && credits.Q === 1 && credits.a === 1 && credits.CL === 1, JSON.stringify(credits));
      precondition(c, 'jours bloqués reconnus par le vrai dateBlocked terrain : 11/11, 25/11, 26/11, 01/12 (et seulement eux)', o.blocked.every(d => rt.terrain.dateBlocked(d, st)) && ['2026-11-10', '2026-11-12', '2026-11-24', '2026-11-27', '2026-12-02'].every(d => !rt.terrain.dateBlocked(d, st)));
      precondition(c, 'CL fermé lundi et mardi, ouvert les autres jours (store-opening-hours.js)', ['Lundi', 'Mardi'].every(d => rt.ctx.StoreOpeningHoursV1.intervalsFor(st.stores.find(s => s.id === 'CL'), d, st).length === 0) && rt.ctx.StoreOpeningHoursV1.intervalsFor(st.stores.find(s => s.id === 'CL'), 'Mercredi', st).length === 1);
      const need = rt.ctx.StoreRunnerVisitCoverage.needOf(st);
      precondition(c, 'RV (visité le 30/10, cadence 30 j) bloqué par la couverture ; V visité aujourd’hui', need(st.stores.find(s => s.id === 'RV'), W1).blocked === true && need(st.stores.find(s => s.id === 'V'), W0).blocked === true);
      precondition(c, '40 magasins, 6 enseignes, plafond 3 crédits, samedi désactivé', st.stores.length === 40 && new Set(st.stores.map(s => s.enseigne)).size === 6 && st.settings.maxVisitsPerDay === 3 && !st.settings.days.includes('Samedi'));
    };
    await scenario('S1', 'STRESS — « Recalculer le reste » : cascade saturée sur 4 semaines (férié, congés, formation, semaine manuelle, RDV, verrous, fermeture, visite faite, crédits mixtes)', 'V181 recalcul', 'A B C D E F G H I J K M', async c => {
      pre(c);
      const outs = await exercise(c, 'V181', o, {});
      const r = outs['brut'].raw, weeks = Object.keys((r && r.weeks) || {}).sort();
      precondition(c, 'cascade réelle sur au moins 3 semaines au-delà de la semaine affichée', r && r.ok && weeks.length >= 4 && r.latestPlaced >= W4, r && ('ok=' + r.ok + ', dernière date ' + r.latestPlaced));
      if (r && r.ok) c.note('cascade : ' + r.moved + ' visites reportées jusqu’au ' + ddmm(r.latestPlaced) + ' · retirées ' + r.removed.map(x => x.id + ' (' + x.reason + ')').join(', ') + ' · ajoutées ' + r.added.map(x => x.id + ' ' + ddmm(x.date)).join(', ') + ' · ' + weeks.map(k => ddmm(k) + ' [' + show(r.weeks[k]) + ']').join(' ; '));
    });
    await scenario('S2', 'STRESS — génération standard 3 semaines (02/11 → 20/11) sur le même état', 'terrain 3 semaines', 'A B C D E F G H I J O M', async c => {
      pre(c);
      const outs = await exercise(c, 'terrain', o, { horizonUnique: true });
      const built = outs['brut'].raw;
      if (built) c.note('brut : ' + built.weeks.map(w => ddmm(w.weekKey) + (w.manual ? ' (manuelle)' : '') + ' [' + show(w.plan) + ']').join(' ; ') + ' · non couverts annoncés : ' + (built.coverage ? built.coverage.uncoveredNever.length + built.coverage.uncoveredLate.length : '—'));
    });
    await scenario('S3', 'STRESS — génération V211 de la semaine en cours (02/11) sur le même état', 'V211 semaine', 'A B C D E F G I J M', async c => {
      pre(c);
      const outs = await exercise(c, 'V211s', o, {});
      c.note('brut : ' + show(outs['brut'].written[W0]) + ' · chaîne : ' + show(outs['chaîne'].written[W0]));
    });
    await scenario('S4', 'STRESS — génération V211 de la période 02/11 → 04/12 sur le même état', 'V211 période', 'A B C D E F G H I J O M', async c => {
      pre(c);
      const outs = await exercise(c, 'V211p', o, { horizonUnique: true });
      c.note('brut : ' + outs['brut'].perimeter.map(k => ddmm(k) + ' [' + show(outs['brut'].written[k]) + ']').join(' ; ') + ' · statut « ' + outs['brut'].raw.status + ' »');
    });
  }

  /* ---------- N. COHÉRENCE ENTRE MOTEURS ---------- */
  {
    const o = crossFixture();
    await scenario('N1', 'Contrat simple faisable (férié, samedi off, RDV, verrous daté/récurrent, fermeture, Darty, semaine manuelle) — semaine du 09/11', 'V211 semaine', 'C D E F G H I M', async c => { await exercise(c, 'V211s', o, {}); });
    await scenario('N2', 'Même contrat — période 09/11 → 27/11', 'V211 période', 'C D E F G H I M', async c => { await exercise(c, 'V211p', o, {}); });
    await scenario('N3', 'Même contrat — cycle 3 semaines 09/11 → 27/11', 'terrain 3 semaines', 'C D E F G H I M', async c => { await exercise(c, 'terrain', o, {}); });
    await scenario('N4', 'Même contrat — recalcul de la semaine affichée du 09/11 (R lundi, L lundi, Q et CL mercredi férié, Darty en surcharge)', 'V181 recalcul', 'A C D E F G H I K M', async c => { await exercise(c, 'V181', o, {}); });
    await scenario('N0', 'Cohérence : les quatre moteurs lisent-ils les contraintes de la même façon ?', 'V211 semaine · V211 période · terrain · V181', 'N', async c => {
      for (const e of ['V211s', 'V211p', 'terrain', 'V181']) c.ran.add(ENGINES[e].label);
      const k = contractOf(o), rows = [];
      for (const [id, engine] of [['N1', 'V211s'], ['N2', 'V211p'], ['N3', 'terrain'], ['N4', 'V181']]) for (const [mode, out] of Object.entries(OUTCOMES[id + '|' + engine] || {})) rows.push({ who: ENGINES[engine].label + ' (' + mode + ')', out });
      const facts = {
        'férié 11/11 laissé vide': out => !ids(out.written[W1] && out.written[W1].Mercredi).length,
        'samedi laissé vide': out => Object.values(out.written).every(p => !ids(p.Samedi).length),
        'CL jamais posé lundi ni mardi (fermé)': out => Object.entries(out.written).every(([w, p]) => k.manual[w] || (!ids(p.Lundi).includes('CL') && !ids(p.Mardi).includes('CL'))),
        'R posé le jeudi 12/11 (RDV)': out => ids(out.written[W1] && out.written[W1].Jeudi).includes('R') && DAYS.filter(d => d !== 'Jeudi').every(d => !ids(out.written[W1][d]).includes('R')),
        'L posé le mardi 10/11 (verrou daté)': out => ids(out.written[W1] && out.written[W1].Mardi).includes('L') && DAYS.filter(d => d !== 'Mardi').every(d => !ids(out.written[W1][d]).includes('L')),
        'Q seulement le vendredi (verrou récurrent)': out => Object.entries(out.written).every(([w, p]) => k.manual[w] || DAYS.filter(d => d !== 'Vendredi').every(d => !ids(p[d]).includes('Q'))),
        'semaine manuelle du 16/11 intacte': out => !out.written[W2] || samePlan(out.written[W2], k.manual[W2]),
        'plafond de 2 crédits par jour': out => Object.entries(out.written).every(([w, p]) => k.manual[w] || DAYS.every(d => Array.from(p[d] || []).reduce((n, s) => n + credit(out.rt, s), 0) <= 2))
      };
      for (const [fact, test] of Object.entries(facts)) {
        const ok = rows.filter(r => !r.out.refused && test(r.out)).map(r => r.who), ko = rows.filter(r => !r.out.refused && !test(r.out)).map(r => r.who);
        if (ok.length && ko.length) for (const who of ko) c.fail('N', 7, who, fact + ' : violé ici, respecté par ' + ok.join(', '));
        else c.note(fact + ' : ' + (ko.length ? 'violé par tous' : 'respecté par les ' + ok.length + ' exécutions'));
      }
    });
  }

  /* ---------- E. CONTRAINTE EXPLICITE SUR UN JOUR DE FERMETURE ---------- */
  for (const [n, kind, label] of [['E1', 'verrou', 'verrou daté {Lundi, 09/11}'], ['E2', 'rdv', 'RDV lundi 09/11 14:00']]) {
    const o = closedConstraintFixture(kind), opts = { expect: 'refus', inv: 'E' };
    await scenario(n + 'a', label + ' sur le jour de fermeture de K — refus atomique attendu (contrat P0.3)', 'V211 semaine · V211 période', 'E I A', async c => { await exercise(c, 'V211s', o, opts); await exercise(c, 'V211p', o, opts); });
    await scenario(n + 'b', label + ' sur le jour de fermeture de K — refus atomique attendu', 'terrain 3 semaines', 'E I A', async c => { await exercise(c, 'terrain', o, opts); });
    await scenario(n + 'c', label + ' sur le jour de fermeture de K — refus atomique attendu', 'V181 recalcul', 'E I A', async c => { await exercise(c, 'V181', o, opts); });
  }

  /* ---------- I/K. CASCADE VERS UNE SEMAINE CONTRAINTE ---------- */
  for (const [n, kind] of [['I1', 'rdv'], ['I2', 'verrou daté'], ['I3', 'verrou récurrent']]) {
    await scenario(n, 'Cascade : K déborde de la semaine du 02/11 vers celle du 09/11 où il a un ' + (kind === 'rdv' ? 'RDV jeudi 12/11' : kind === 'verrou daté' ? 'verrou daté jeudi' : 'verrou récurrent jeudi'), 'V181 recalcul', 'I K A M', async c => {
      const outs = await exercise(c, 'V181', cascadeConstraintFixture(kind), {});
      /* K, vu par la cascade : reporté dans la semaine du 09/11, il doit y prendre le jour de sa contrainte. */
      for (const [mode, out] of Object.entries(outs)) {
        const at = DAYS.filter(d => ids((out.written[W1] || {})[d]).includes('K'));
        if (at.length && !at.every(d => d === 'Jeudi')) c.fail('K', 6, ENGINES.V181.label + ' (' + mode + ')', 'la cascade pose K le ' + at.map(d => d.toLowerCase() + ' ' + ddmm(dateOf(W1, d))).join(', ') + ' : premier créneau libre de la semaine d’arrivée, sans lire son ' + (kind === 'rdv' ? 'RDV' : 'verrou') + ' du jeudi 12/11');
      }
    });
  }

  /* ---------- H. SEMAINES MANUELLES ---------- */
  {
    const st = [store('a', 10, 0), store('b', 12, 1), store('x', 5, 40), store('y', 6, 42), store('c', 11, -1)];
    const manual = planOf(st, { Lundi: ['a', 'x'], Mardi: ['y', 'b'], Mercredi: ['c'] });
    const o = protect({ stores: st, weekDate: W1, plan: copy(manual), target: 5, max: 2 }, W1, manual);
    await scenario('H1', '« Générer la semaine » (generateWeek → V185 → V211) sur la semaine affichée retouchée à la main', 'V211 semaine (+ V185)', 'H M', async c => {
      const outs = await exercise(c, 'V211s', o, {});
      for (const [mode, out] of Object.entries(outs)) {
        const edit = out.rt.ctx.state.manualWeekEdits[W1];
        if (!samePlan(edit && edit.plan, manual)) c.fail('H', 5, ENGINES.V211s.label + ' (' + mode + ')', 'state.manualWeekEdits du 09/11 réécrit');
        if (out.archive[W1] && edit && !samePlan(out.archive[W1].plan, edit.plan)) c.fail('H', 10, ENGINES.V211s.label + ' (' + mode + ')', 'archive (' + show(out.archive[W1].plan) + ') désynchronisée de state.manualWeekEdits (' + show(edit.plan) + ')');
        c.note(mode + ' : retour ' + JSON.stringify(out.raw) + ' · statut « ' + out.rt.els.rangePlanStatus.textContent + ' »');
      }
    });
    const ringStores = ring();
    const h2 = protect(protect({ stores: ringStores, weekDate: W0, plan: planOf(ringStores, { Mardi: ['s07'] }), target: 8, max: 2, start: W0 }, W0, planOf(ringStores, { Mardi: ['s07'] })), W1, planOf(ringStores, { Lundi: ['s12'], Jeudi: ['s03'] }));
    await scenario('H2', 'Cycle 3 semaines avec deux semaines manuelles (02/11 affichée et 09/11), chaîne V185 + V251 comprise', 'terrain 3 semaines', 'H M', async c => { await exercise(c, 'terrain', h2, {}); });
    const h3 = protect({ stores: ringStores, weekDate: W0, target: 8, max: 2, rangeStart: W0, rangeEnd: '2026-11-20' }, W1, planOf(ringStores, { Lundi: ['s12'], Jeudi: ['s03'] }));
    await scenario('H3', 'Période 02/11 → 20/11 avec une semaine manuelle au milieu (09/11)', 'V211 période', 'H M', async c => { await exercise(c, 'V211p', h3, {}); });
    await scenario('H4', 'Samedi désactivé et semaine manuelle future qui garde une visite le samedi (posée quand le samedi était travaillé)', 'terrain 3 semaines (+ workdays-enforcer)', 'H F', async c => {
      const sat = named(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'z']), manualSat = planOf(sat, { Lundi: ['a'], Samedi: ['z'] });
      const h4 = protect({ stores: sat, weekDate: W0, target: 6, max: 2, start: W0 }, W1, manualSat), seen = {};
      for (const mode of ['brut', 'chaîne']) {
        const out = await runEngine('terrain', h4, mode); c.ran.add(ENGINES.terrain.label);
        if (out.crash || out.refused) { c.fail('—', out.crash ? 11 : 12, ENGINES.terrain.label + ' (' + mode + ')', JSON.stringify(out.crash || out.refused)); continue; }
        seen[mode] = { archive: show(out.archive[W1].plan), edits: show(out.rt.ctx.state.manualWeekEdits[W1].plan) };
      }
      c.ambiguity('contrats H (semaine manuelle figée) et F (samedi désactivé) en conflit. Brut : la semaine du 09/11 reste [' + (seen['brut'] && seen['brut'].archive) + ']. Chaîne : workdays-enforcer.js (événement chef-range-generated) vide le samedi de l’archive protégée [' + (seen['chaîne'] && seen['chaîne'].archive) + '] sans toucher state.manualWeekEdits [' + (seen['chaîne'] && seen['chaîne'].edits) + '] : z disparaît du planning, la sauvegarde manuelle le garde. À trancher : la semaine manuelle prime-t-elle sur le réglage des jours ?');
    });
    await scenario('H5', 'RDV jeudi 12/11 d’un magasin posé à la main lundi 09/11 dans une semaine manuelle future', 'terrain · V211 période · V181', 'H I', async c => {
      const st5 = named(['K', 'a', 'b', 'c', 'd', 'e', 'f', 'g']), manualK = planOf(st5, { Lundi: ['K', 'a'] }), w0 = planOf(st5, { Lundi: ['b'], Mardi: ['c'], Mercredi: ['d'], Jeudi: ['e'], Vendredi: ['f'] });
      const h5 = protect({ stores: st5, weekDate: W0, plan: copy(w0), archive: { [W0]: { weekMonday: W0, plan: copy(w0) } }, target: 5, max: 2, start: W0, rangeStart: W0, rangeEnd: '2026-11-20', appointments: [rdv('K', '2026-11-12')] }, W1, manualK);
      const seen = [];
      for (const engine of ['terrain', 'V211p', 'V181']) {
        c.ran.add(ENGINES[engine].label);
        const out = await runEngine(engine, h5, 'brut');
        if (out.crash) { c.fail('—', 11, ENGINES[engine].label, 'crash ' + out.crash.type + ' « ' + out.crash.message + ' »'); continue; }
        const week = out.archive[W1] ? out.archive[W1].plan : (out.written[W1] || emptyPlan());
        seen.push(ENGINES[engine].label + ' : ' + (out.refused ? 'refus « ' + out.refused.message + ' »' : 'K ' + DAYS.filter(d => ids(week[d]).includes('K')).map(d => d.toLowerCase()).join(',')));
      }
      c.ambiguity('contrats H (semaine manuelle intouchable) et I (RDV exact) en conflit, aucun texte ne les ordonne. Observé, cohérent entre moteurs : ' + seen.join(' · ') + '. La semaine manuelle prime ; le RDV du 12/11 n’y est pas reporté.');
    });
  }

  /* ---------- J. VISITES RÉALISÉES ---------- */
  {
    const monday = doneFixture(NOW), wednesday = doneFixture(NOW_WED);
    await scenario('J1', 'Visite réalisée (V, lundi 02/11) : génération de la semaine en cours, lundi 08:00 puis mercredi 08:00', 'V211 semaine · V211 période', 'J A M', async c => {
      for (const o of [monday, wednesday]) { await exercise(c, 'V211s', o, {}); await exercise(c, 'V211p', o, {}); }
    });
    await scenario('J2', 'Visite réalisée (V, lundi 02/11) : cycle 3 semaines lancé lundi 08:00 puis mercredi 08:00', 'terrain 3 semaines', 'J A M', async c => {
      for (const o of [monday, wednesday]) await exercise(c, 'terrain', o, {});
    });
    await scenario('J3', 'Visite réalisée (V, lundi 02/11) : recalcul lundi 08:00 puis mercredi 08:00 (M raté mardi 03/11)', 'V181 recalcul', 'J A K M', async c => {
      for (const o of [monday, wednesday]) await exercise(c, 'V181', o, {});
    });
  }

  /* ---------- O. ROTATION ---------- */
  {
    const base = { weekDate: W2, target: 4, max: 1, days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi'] };
    await scenario('O1', 'Rotation : période de 4 semaines (16/11 → 11/12), 12 magasins, 4 visites/semaine, cadences 30 j (A, B) et 15 j (C)', 'V211 période', 'O M', async c => {
      const o = Object.assign({ stores: rotationStores(), rangeStart: W2, rangeEnd: '2026-12-11' }, base);
      const outs = await exercise(c, 'V211p', o, { modes: ['brut', 'chaîne'] });
      for (const [mode, out] of Object.entries(outs)) {
        const ordered = out.perimeter.map(k => [k, out.written[k]]);
        for (const f of rotationFindings(ordered, o.stores)) c.fail(f.inv, f.cause, ENGINES.V211p.label + ' (' + mode + ')', f.detail);
        c.note(mode + ' : ' + ordered.map(([k, p]) => ddmm(k) + ' ' + flatIds(p).join(',')).join(' | '));
      }
    });
    await scenario('O2', 'Rotation : le même vivier généré semaine par semaine (16/11, 23/11, 30/11, 07/12), archive cumulée', 'V211 semaine', 'O M', async c => {
      for (const mode of ['brut', 'chaîne']) {
        let archive = {}; const ordered = [], again = [];
        for (const week of [W2, W3, W4, W5]) {
          const o = Object.assign({ stores: rotationStores(), archive: copy(archive) }, base, { weekDate: week });
          const out = await runEngine('V211s', o, mode), twin = await runEngine('V211s', o, mode); c.ran.add(ENGINES.V211s.label);
          if (fingerprint(out) !== fingerprint(twin)) c.fail('M', 9, ENGINES.V211s.label + ' (' + mode + ')', 'semaine du ' + ddmm(week) + ' : deux exécutions divergent');
          if (out.crash || out.refused) { c.fail('—', out.crash ? 11 : 12, ENGINES.V211s.label + ' (' + mode + ')', JSON.stringify(out.crash || out.refused)); break; }
          archive = out.archive; ordered.push([week, out.written[week]]);
        }
        for (const f of rotationFindings(ordered, rotationStores())) c.fail(f.inv, f.cause, ENGINES.V211s.label + ' (' + mode + ')', f.detail);
        c.note(mode + ' : ' + ordered.map(([k, p]) => ddmm(k) + ' ' + flatIds(p).join(',')).join(' | '));
      }
    });
    await scenario('O3', 'Rotation : deux cycles 3 semaines successifs (09/11 puis 30/11), 18 magasins, 3 visites/semaine', 'terrain 3 semaines', 'O M', async c => {
      const st = Array.from({ length: 18 }, (_, i) => store('t' + String(i + 1).padStart(2, '0'), 8 + ((i + 1) % 9) * 3, (((i + 1) * 5) % 13) - 6));
      for (const mode of ['brut', 'chaîne']) {
        const first = await runEngine('terrain', { stores: st, weekDate: W1, start: W1, target: 3, max: 1, days: ['Lundi', 'Mardi', 'Mercredi'] }, mode);
        const o2 = { stores: st, weekDate: W4, start: W4, target: 3, max: 1, days: ['Lundi', 'Mardi', 'Mercredi'], archive: first.archive };
        const second = await runEngine('terrain', o2, mode), twin = await runEngine('terrain', o2, mode); c.ran.add(ENGINES.terrain.label);
        if (fingerprint(second) !== fingerprint(twin)) c.fail('M', 9, ENGINES.terrain.label + ' (' + mode + ')', 'second cycle : deux exécutions divergent');
        if (first.crash || second.crash || first.refused || second.refused) { c.fail('—', 11, ENGINES.terrain.label + ' (' + mode + ')', JSON.stringify(first.crash || second.crash || first.refused || second.refused)); continue; }
        const served1 = new Set(first.perimeter.flatMap(k => flatIds(first.written[k]))), served2 = second.perimeter.flatMap(k => flatIds(second.written[k]));
        const left = st.map(s => s.id).filter(id => !served1.has(id) && !served2.includes(id)), repeated = served2.filter(id => served1.has(id));
        if (left.length && repeated.length) c.fail('O', 8, ENGINES.terrain.label + ' (' + mode + ')', 'cycle 2 reprend ' + repeated.join(',') + ' alors que ' + left.join(',') + ' n’ont été servis dans aucun des deux cycles');
        c.note(mode + ' : cycle 1 ' + Array.from(served1).sort().join(',') + ' · cycle 2 ' + served2.slice().sort().join(','));
      }
    });
    const mh = manualHorizonFixture();
    await scenario('O4a', 'Continuité : semaine manuelle du 09/11 (s01, s02) au milieu du cycle 02/11 → 20/11', 'terrain 3 semaines', 'O H M', async c => { await exercise(c, 'terrain', mh, { horizonUnique: true }); });
    await scenario('O4b', 'Continuité : semaine manuelle du 09/11 (s01, s02) au milieu de la période 02/11 → 20/11', 'V211 période', 'O H M', async c => { await exercise(c, 'V211p', mh, { horizonUnique: true }); });
  }

  /* ---------- P. PRIORITÉ CONTRE CONTRAINTES DURES ---------- */
  {
    const o = priorityFixture(), k = contractOf(o);
    const uPlaced = out => Object.entries(out.written).filter(([w]) => !k.manual[w]).flatMap(([w, p]) => DAYS.filter(d => ids(p[d]).includes('U')).map(d => dateOf(w, d)));
    await scenario('P1', 'Priorité : U très en retard, ouvert le seul mercredi ; mercredis = férié, semaine manuelle, verrou de K (plafond 1)', 'terrain 3 semaines', 'P E G H I C M', async c => {
      const outs = await exercise(c, 'terrain', o, {});
      for (const [mode, out] of Object.entries(outs)) {
        const announced = out.raw && out.raw.coverage && out.raw.coverage.uncoveredLate.some(x => /\bU$/.test(x));
        if (!uPlaced(out).length && !announced) c.fail('A', 1, ENGINES.terrain.label + ' (' + mode + ')', 'U, très en retard, ni planifié ni annoncé comme non couvert');
        c.note(mode + ' : U ' + (uPlaced(out).map(ddmm).join(',') || 'non planifié') + (announced ? ', annoncé « en retard, hors de ces 3 semaines »' : ''));
      }
    });
    await scenario('P2', 'Priorité : même état, génération V211 semaine (09/11) et période (09/11 → 27/11)', 'V211 semaine · V211 période', 'P E G H I C M', async c => {
      for (const engine of ['V211s', 'V211p']) {
        const outs = await exercise(c, engine, o, {});
        for (const [mode, out] of Object.entries(outs)) c.note(ENGINES[engine].label + ' ' + mode + ' : U ' + (uPlaced(out).map(d => dayOf(d).toLowerCase() + ' ' + ddmm(d)).join(',') || 'non planifié') + (engine === 'V211p' ? ' · « ' + out.raw.status + ' »' : ''));
      }
    });
    await scenario('P3', 'Priorité : recalcul de la semaine du 09/11 — X (visité le 30/10) retiré, créneau libéré proposé d’abord à U', 'V181 recalcul', 'P E G H C A M', async c => {
      const outs = await exercise(c, 'V181', o, {});
      for (const [mode, out] of Object.entries(outs)) if (out.raw && out.raw.ok) c.note(mode + ' : retirés ' + out.raw.removed.map(x => x.id).join(',') + ' · ajoutés ' + out.raw.added.map(x => x.id + ' ' + ddmm(x.date)).join(',') + ' · U ' + (uPlaced(out).map(ddmm).join(',') || 'non planifié'));
    });
  }

  /* ---------- L. FIN DE FENÊTRE / DÉBORDEMENT ---------- */
  {
    const st = named(['a', 'b', 'c', 'd', 'e']).concat([store('DARTY', 12, 4, { enseigne: 'Darty' })]);
    const plan = planOf(st, { Lundi: ['a'], Mardi: ['b', 'DARTY'], Mercredi: ['c'], Jeudi: ['d'], Vendredi: ['e'] });
    await scenario('L1', 'Débordement sans issue : Darty (2 crédits) à replacer avec un plafond de 1 — aucune place sur 26 semaines', 'V181 recalcul', 'L A K', async c => {
      await exercise(c, 'V181', { stores: st, weekDate: W0, plan: copy(plan), archive: { [W0]: { weekMonday: W0, plan: copy(plan) } }, max: 1 }, { expect: 'refus', inv: 'L' });
    });
    await scenario('L2', 'Six magasins imposés pour quatre créneaux (plafond 1, férié 11/11) — refus attendu', 'V211 semaine · V211 période · terrain', 'L C A', async c => {
      const o = forcedFixture();
      for (const engine of ['V211s', 'V211p', 'terrain']) await exercise(c, engine, o, { expect: 'refus', inv: 'L' });
    });
  }

  /* ---------- F. JOURS NON TRAVAILLÉS ---------- */
  {
    const o = workdaysFixture();
    await scenario('F1', 'Mercredi non travaillé et samedi désactivé : aucune visite libre ces jours-là (visites d’avant le réglage à replacer)', 'V211 semaine · V211 période · terrain · V181', 'F C M', async c => {
      for (const engine of ['V211s', 'V211p', 'terrain', 'V181']) await exercise(c, engine, o, {});
    });
    const st = named(['K', 'a', 'b', 'c', 'd', 'e', 'f']), sentinel = planOf(st, { Lundi: ['K', 'a'], Mardi: ['b'], Mercredi: ['c'], Jeudi: ['d'], Vendredi: ['e'] });
    const f2 = { stores: st, weekDate: W1, plan: copy(sentinel), archive: { [W1]: { weekMonday: W1, plan: copy(sentinel) } }, max: 2, target: 7, start: W1, rangeStart: W1, rangeEnd: '2026-11-14', appointments: [rdv('K', '2026-11-14', '10:00')] };
    await scenario('F2', 'RDV le samedi 14/11, samedi désactivé — refus atomique attendu', 'V211 semaine · V211 période · terrain · V181', 'F I A', async c => {
      for (const engine of ['V211s', 'V211p', 'terrain', 'V181']) await exercise(c, engine, f2, { expect: 'refus', inv: 'F' });
    });
    await scenario('F3', 'Jour décoché après coup : visites déjà planifiées ce jour-là (workdays-enforcer.js, aucun moteur appelé)', 'workdays-enforcer (chaîne)', 'F A', async c => {
      const sf = named(['a', 'b', 'c', 'd', 'e', 'f']), w1 = planOf(sf, { Lundi: ['a'], Mercredi: ['c', 'd'], Jeudi: ['e'] }), w2 = planOf(sf, { Mercredi: ['f'], Vendredi: ['b'] });
      const base = { stores: sf, weekDate: W1, plan: copy(w1), archive: { [W1]: { weekMonday: W1, plan: copy(w1) }, [W2]: { weekMonday: W2, plan: copy(w2) } }, max: 2, chain: true };
      const present = (rt, id) => [rt.ctx.state.plan].concat(Object.values(archiveOf(rt)).map(s => s.plan)).some(p => DAYS.some(d => ids(p[d]).includes(id)));
      /* 1. L'utilisateur décoche le mercredi dans les réglages (événement change sur [data-day]). */
      const rt = runtime(base);
      precondition(c, 'c, d et f planifiés avant le décochage', ['c', 'd', 'f'].every(id => present(rt, id)));
      rt.ctx.state.settings.days = ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'];
      rt.ctx.document.dispatchEvent({ type: 'change', target: { matches: sel => sel === '[data-day]' } });
      await rt.settle();
      const gone = ['c', 'd', 'f'].filter(id => !present(rt, id));
      /* 2. Démarrage avec un mercredi déjà non travaillé (sauvegarde restaurée, autre appareil). */
      const boot = runtime(Object.assign({}, base, { days: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'] })), shown = boot.ctx.state.plan, stored = archiveOf(boot)[W1].plan;
      c.ambiguity('F respecté par suppression : après décochage du mercredi, ' + (gone.join(', ') || 'aucun magasin') + ' dispara' + (gone.length > 1 ? 'issent' : 'ît') + ' de state.plan et de l’archive (semaine affichée et semaine future), sans report ni message ; aucun moteur de planning n’est appelé. A (aucune perte silencieuse) et F (aucune visite un jour non travaillé) se contredisent pour les visites déjà planifiées. Au démarrage, seul state.plan est vidé [' + show(shown) + '] alors que l’archive garde [' + show(stored) + '] jusqu’à la prochaine génération. À trancher : supprimer, reporter, ou demander ?');
    });
  }

  /* ---------- C/D. CAPACITÉ ET CRÉDITS ---------- */
  {
    const o = creditsFixture();
    await scenario('D1', 'Crédits mixtes : six magasins à 2 crédits (Darty, Boulanger, But, Conforama) et six à 1, plafond impair de 3', 'V211 semaine · V211 période · terrain · V181', 'C D M', async c => {
      const rt = runtime(o), cr = Object.fromEntries(o.stores.map(s => [s.id, credit(rt, s)]));
      precondition(c, 'crédits 2 pour Darty/Boulanger/But/Conforama, 1 pour Fnac/Carrefour', ['d1', 'd2', 'b1', 'b2', 'u1', 'c1'].every(id => cr[id] === 2) && ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].every(id => cr[id] === 1), JSON.stringify(cr));
      for (const engine of ['V211s', 'V211p', 'terrain', 'V181']) await exercise(c, engine, o, {});
    });
  }

  /* ---------- M. STABILITÉ ---------- */
  await scenario('M1', 'Stabilité : régénérer aussitôt (même runtime, même heure) redonne exactement le même planning', 'terrain · V211 semaine · V211 période', 'M', async c => {
    for (const [engine, o] of [['terrain', stressFixture()], ['V211s', crossFixture()], ['V211p', crossFixture()]]) for (const mode of ['brut', 'chaîne']) {
      c.ran.add(ENGINES[engine].label);
      const rt = runtime(Object.assign({}, o, { chain: mode === 'chaîne' })), start = o.start || W0, keys = engine === 'V211s' ? [weekOf(o.weekDate)] : engine === 'V211p' ? weeksBetween(o.rangeStart, o.rangeEnd) : [start, addWeeks(start, 1), addWeeks(start, 2)];
      const go = async () => {
        if (engine === 'terrain') { if (rt.chain) { rt.els.weekDate.value = start; await rt.ctx.storeRunnerGenerateThreeWeeks(); } else await rt.terrain.generateThreeWeekSnail({ start }); }
        else if (engine === 'V211s') { await (rt.chain ? rt.ctx.generateWeek() : rt.range.strictSingleWeek()); }
        else await (rt.chain ? rt.els.generateRangeBtn.onclick() : rt.range.generateRange());
        await rt.settle(); return JSON.stringify(Object.fromEntries(Object.entries(writtenWeeks(rt, keys)).map(([k, p]) => [k, planIds(p)])));
      };
      const a = await go(), b = await go();
      if (a !== b) c.fail('M', 12, ENGINES[engine].label + ' (' + mode + ')', 'la régénération immédiate change le planning');
    }
    c.note('V181 : la stabilité (second recalcul « inchangé ») est vérifiée dans chaque cas V181 ci-dessus.');
  });

  /* ------------------------------------------------------------------- rapport ---- */
  const verdict = c => c.findings.length ? 'ROUGE' : c.ambiguous ? 'AMBIGU' : 'VERT';
  const causes = c => Array.from(new Set(c.findings.map(f => String(f.cause)))).sort((a, b) => (Number(a) || 99) - (Number(b) || 99)).join('+') || '—';
  const invs = c => Array.from(new Set(c.findings.map(f => f.inv))).join(',') || c.invariants;
  for (const c of CASES) {
    const v = verdict(c);
    console.log((v === 'VERT' ? '✓ ' : v === 'ROUGE' ? '✗ ' : '? ') + c.id + ' — ' + c.title + '  [' + v + (v === 'ROUGE' ? ' · cause ' + causes(c) : '') + ']');
    for (const f of c.findings) console.log('    ✗ [' + f.inv + ' · cause ' + f.cause + '] ' + f.where + ' : ' + f.detail);
    if (c.ambiguous) console.log('    ? ' + c.ambiguous);
    for (const n of c.notes) console.log('    · ' + n);
  }
  console.log('\n| Cas | Moteur(s) | Invariant | Résultat | Cause | Preuve |\n|---|---|---|---|---|---|');
  for (const c of CASES) {
    const v = verdict(c), proof = v === 'ROUGE' ? c.findings.slice(0, 2).map(f => f.where + ' : ' + f.detail).join(' ; ') + (c.findings.length > 2 ? ' (+' + (c.findings.length - 2) + ')' : '') : v === 'AMBIGU' ? c.ambiguous : (c.notes[0] || 'invariants ' + c.invariants + ' respectés, brut et chaîne, ×2');
    console.log('| ' + c.id + ' | ' + c.engines + ' | ' + invs(c) + ' | ' + v + ' | ' + (v === 'ROUGE' ? causes(c) : '—') + ' | ' + String(proof).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 400) + ' |');
  }
  /* Matrice invariant × moteur : ✗ violé dans au moins un cas, ✓ vérifié sans violation,
     · non vérifié pour ce moteur. Les ambiguïtés ne sont pas comptées comme des violations. */
  const LETTERS = 'ABCDEFGHIJKLMNOP'.split(''), LABELS = ['V211s', 'V211p', 'terrain', 'V181'].map(e => ENGINES[e].label);
  console.log('\nMatrice invariant × moteur (✗ violé · ✓ vérifié sans violation · · non vérifié)\n| Invariant | ' + LABELS.join(' | ') + ' |\n|---|' + LABELS.map(() => '---').join('|') + '|');
  for (const letter of LETTERS) {
    const cells = LABELS.map(label => {
      const checked = CASES.some(c => !c.ambiguous && c.ran.has(label) && c.invariants.split(/[\s,]+/).includes(letter));
      const violated = CASES.some(c => c.findings.some(f => f.inv === letter && String(f.where).startsWith(label)));
      return violated ? '✗' : checked ? '✓' : '·';
    });
    console.log('| ' + letter + ' | ' + cells.join(' | ') + ' |');
  }
  const red = CASES.filter(c => verdict(c) === 'ROUGE').length, amb = CASES.filter(c => verdict(c) === 'AMBIGU').length;
  console.log('\nP0.4 : ' + CASES.length + ' cas · ' + (CASES.length - red - amb) + ' verts · ' + red + ' rouges · ' + amb + ' ambigus');
  if (red) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
