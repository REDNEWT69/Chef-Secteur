const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'cross-day-planning-v264.json');
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const CLEANUP_BASELINE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cleanup-baseline-r20.json'), 'utf8'));
const TERRAIN_PATH = process.env.CROSS_DAY_ENGINE_PATH ? path.resolve(process.env.CROSS_DAY_ENGINE_PATH) : path.join(ROOT, 'terrain-planning-v1.js');
const terrain = require(TERRAIN_PATH);
const coverage = require('../visit-coverage.js');

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAY_MS = 86400000;
const STATUS_SEQUENCE = ['never', 'late', 'soon', 'ok', 'blocked', 'veryLate'];
const INTERVALS = [7, 15, 30, 90];
const BRANDS = ['Fnac', 'Carrefour', 'Darty', 'Boulanger', 'Auchan', 'But'];
const PRIORITY_CASE = ((process.argv.find(value => value.startsWith('--priority-case=')) || '').split('=')[1] || '');
const STORE_ORDER = ((process.argv.find(value => value.startsWith('--store-order=')) || '').split('=')[1] || 'natural');

function loadAgendaDateOwner() {
  const source = fs.readFileSync(path.join(ROOT, 'calendar-oauth.js'), 'utf8');
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const document = {
    readyState: 'loading', hidden: false, head: { appendChild() {} },
    addEventListener() {}, dispatchEvent() {}, getElementById() { return null; },
    querySelector() { return null; }, createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }
  };
  const context = {
    console, document, localStorage: storage, sessionStorage: storage,
    Date, JSON, Math, Map, Set, Promise,
    setTimeout() { return 0; }, clearTimeout() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    addEventListener() {}, dispatchEvent() {}
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'calendar-oauth.js' });
  assert.equal(typeof context.chefSecteurEventCoversDate, 'function', 'Agenda doit rester propriétaire des bornes de dates');
  return context.chefSecteurEventCoversDate;
}

globalThis.chefSecteurEventCoversDate = loadAgendaDateOwner();

function pad(value) { return String(value).padStart(2, '0'); }
function parseIso(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(+match[1], +match[2] - 1, +match[3], 12) : null;
}
function iso(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
function addDays(value, count) { const date = new Date(value); date.setDate(date.getDate() + count); return date; }
function dateFor(weekKey, day) { return iso(addDays(parseIso(weekKey), DAYS.indexOf(day))); }
function dateDiff(from, to) { return Math.round((parseIso(to) - parseIso(from)) / DAY_MS); }
function emptyPlan() { return Object.fromEntries(DAYS.map(day => [day, []])); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function storeNumber(id) { return Number(String(id).replace(/^s/, '')) || 0; }
function byStoreId(a, b) { return storeNumber(a.id) - storeNumber(b.id) || String(a.id).localeCompare(String(b.id)); }

function hav(a, b) {
  const radius = 6371;
  const dLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
  const dLon = (Number(b.lon) - Number(a.lon)) * Math.PI / 180;
  const lat1 = Number(a.lat) * Math.PI / 180;
  const lat2 = Number(b.lat) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
function roadKm(a, b) { return hav(a, b) * 1.22; }
function roadMinutes(a, b) { return roadKm(a, b) / 55 * 60; }
function pointFrom(base, distanceKm, bearing) {
  const angle = bearing * Math.PI / 180;
  return {
    lat: base.lat + distanceKm / 111 * Math.cos(angle),
    lon: base.lon + distanceKm / (111 * Math.cos(base.lat * Math.PI / 180)) * Math.sin(angle)
  };
}

function lastVisit(today, interval, status) {
  if (status === 'never') return '';
  const ages = {
    veryLate: Math.ceil(interval * 1.8),
    late: interval + 3,
    soon: Math.ceil(interval * 0.8),
    ok: Math.ceil(interval * 0.6),
    blocked: Math.max(1, Math.floor(interval * 0.25))
  };
  return iso(addDays(parseIso(today), -ages[status]));
}

function buildStores(config) {
  const stores = [];
  let number = 1;
  for (let zoneIndex = 0; zoneIndex < config.zones.length; zoneIndex++) {
    const zone = config.zones[zoneIndex];
    for (let local = 0; local < zone.count; local++) {
      const id = 's' + number;
      const intervalDays = INTERVALS[(number - 1) % INTERVALS.length];
      let statusClass = STATUS_SEQUENCE[(number - 1) % STATUS_SEQUENCE.length];
      if (id === config.urgentIsolated || config.urgentCluster.includes(id)) statusClass = 'veryLate';
      if ((config.manualWeek && Object.values(config.manualWeek.placements).flat().includes(id))) statusClass = 'blocked';
      const radius = zone.radiusKm + ((local % 5) - 2) * 0.65;
      const bearing = zone.bearing + (((local * 17) % 9) - 4) * 0.55;
      const point = pointFrom(FIXTURE.base, radius, bearing);
      stores.push({
        id,
        enseigne: BRANDS[(number - 1) % BRANDS.length],
        ville: 'Zone ' + (zoneIndex + 1) + ' · ' + pad(local + 1),
        adresse: number + ' rue Fixture',
        lat: point.lat,
        lon: point.lon,
        intervalDays,
        visitMinutes: number % 13 === 0 ? 60 : 45,
        priority: 1 + number % 5,
        statusClass,
        active: !config.inactive.includes(id)
      });
      number++;
    }
  }
  assert.equal(stores.length, config.storeCount, config.id + ' : nombre de magasins de la fixture');
  const isolated = stores.find(store => store.id === config.urgentIsolated);
  Object.assign(isolated, pointFrom(FIXTURE.base, 165, 315), { ville: 'Urgent isolé', statusClass: 'veryLate' });
  config.urgentCluster.forEach((id, index) => {
    const store = stores.find(row => row.id === id);
    Object.assign(store, pointFrom(FIXTURE.base, 88 + index * 0.45, 43 + index * 0.35), { ville: 'Urgents groupés', statusClass: 'veryLate' });
  });
  if (config.tieIds.length) {
    const tie = pointFrom(FIXTURE.base, 76, 121);
    config.tieIds.forEach(id => {
      const store = stores.find(row => row.id === id);
      Object.assign(store, tie, { statusClass: 'never', intervalDays: 30, priority: 3, ville: 'Égalité parfaite' });
    });
  }
  return stores;
}

function buildScenario(config) {
  const stores = buildStores(config);
  const state = {
    profile: { baseLat: FIXTURE.base.lat, baseLon: FIXTURE.base.lon, overnightMode: 'auto', overnightMinSaving: 80 },
    settings: {
      weekDate: FIXTURE.firstMonday,
      days: config.days.slice(),
      target: config.target,
      maxVisitsPerDay: config.maxCreditsPerDay,
      startTime: '08:30',
      endTime: '18:00',
      saturdayStart: '08:00',
      saturdayEnd: '13:00',
      visitMinutes: 45
    },
    stores,
    visits: {},
    included: Object.fromEntries(config.included.map(id => [id, true])),
    excluded: Object.fromEntries(config.excluded.map(id => [id, true])),
    locks: {},
    appointments: clone(config.appointments),
    calendarEvents: clone(config.calendarEvents || config.blockedDates.map((row, index) => ({ id: 'block-' + index, date: row.date, title: row.title, allDay: true, inferredAway: true }))),
    manualWeekEdits: {},
    hotelReservations: Object.fromEntries(config.hotelReservations.map(row => [row.fromDate, clone(row)]))
  };
  if (!config.withoutHistory) for (const store of stores) {
    const day = lastVisit(FIXTURE.today, store.intervalDays, store.statusClass);
    if (day) state.visits[store.id] = { lastVisit: day, history: [day] };
  }
  const existing = emptyPlan();
  for (const row of config.pastVisits) {
    const store = stores.find(candidate => candidate.id === row.storeId);
    const history = state.visits[row.storeId] || (state.visits[row.storeId] = { history: [] });
    history.history = Array.from(new Set((history.history || []).concat(row.date))).sort();
    history.lastVisit = history.history[history.history.length - 1];
    existing[DAYS[parseIso(row.date).getDay() === 0 ? 6 : parseIso(row.date).getDay() - 1]].push(store);
  }
  for (const row of config.locks) state.locks[row.storeId] = { day: row.day, week: row.week };
  const archive = {};
  if (config.manualWeek) {
    const plan = emptyPlan();
    for (const [day, ids] of Object.entries(config.manualWeek.placements)) {
      plan[day] = ids.map(id => stores.find(store => store.id === id));
    }
    state.manualWeekEdits[config.manualWeek.week] = { at: '2026-09-28T08:00:00.000Z', plan: clone(plan) };
    archive[config.manualWeek.week] = { weekMonday: config.manualWeek.week, plan: clone(plan), manualEdited: true };
  }
  const priorities = new Map(stores.filter(store => storeNumber(store.id) % 11 === 0).map(store => [store.id, 'P1']));
  const needOf = coverage.needOf(state, { today: FIXTURE.today, priorities });
  const visitDays = coverage.visitDays(state);
  return { config, state, stores, archive, existing, priorities, needOf, visitDays };
}

function credit(store) { return /^(Darty|Boulanger)$/i.test(String(store && store.enseigne || '')) ? 2 : 1; }
function weekKeyOf(date) {
  const value = parseIso(date);
  const day = value.getDay() || 7;
  return iso(addDays(value, 1 - day));
}
function lockDay(fixture, id, weekKey) {
  const lock = fixture.state.locks[String(id)];
  if (typeof lock === 'string') return lock;
  return lock && (!lock.week || lock.week === weekKey) ? lock.day : '';
}
function appointmentDay(fixture, id, monday) {
  const key = iso(monday);
  const row = fixture.state.appointments.find(item => String(item.storeId) === String(id) && weekKeyOf(item.date) === key);
  return row ? DAYS[(parseIso(row.date).getDay() || 7) - 1] || '' : '';
}
function isBlockedDate(fixture, date) { return terrain.dateBlocked(date, fixture.state); }

function permuteStores(stores, order) {
  const rows = stores.slice();
  if (order === 'natural') return rows;
  if (order === 'reverse') return rows.reverse();
  if (order === 'rotate') return rows.slice(17).concat(rows.slice(0, 17));
  if (order === 'stable-hash') return rows.sort((a, b) => fnv1a('cleanup-r20|' + a.id).localeCompare(fnv1a('cleanup-r20|' + b.id)) || byStoreId(a, b));
  throw new Error('Permutation de magasins inconnue : ' + order);
}

function permutations(rows) {
  if (rows.length < 2) return [rows.slice()];
  const out = [];
  const source = rows.slice().sort(byStoreId);
  const used = Array(source.length).fill(false);
  const current = [];
  function visit() {
    if (current.length === source.length) { out.push(current.slice()); return; }
    for (let index = 0; index < source.length; index++) {
      if (used[index]) continue;
      used[index] = true;
      current.push(source[index]);
      visit();
      current.pop();
      used[index] = false;
    }
  }
  visit();
  return out;
}

function routeEndpoints(fixture, date) {
  const reservation = fixture.state.hotelReservations[date];
  const previous = Object.values(fixture.state.hotelReservations).find(row => row && row.toDate === date);
  const origin = previous && Number.isFinite(Number(previous.lat)) && Number.isFinite(Number(previous.lon)) ? previous : FIXTURE.base;
  const destination = reservation && Number.isFinite(Number(reservation.lat)) && Number.isFinite(Number(reservation.lon)) ? reservation : FIXTURE.base;
  return { origin, destination };
}

function evaluateOrder(fixture, route, day, weekKey) {
  const date = dateFor(weekKey, day);
  const settings = fixture.state.settings;
  const start = day === 'Samedi' ? 8 * 60 : 8 * 60 + 30;
  const endLimit = day === 'Samedi' ? 13 * 60 : 18 * 60;
  const endpoints = routeEndpoints(fixture, date);
  let time = start;
  let driveMinutes = 0;
  let kilometers = 0;
  let waitMinutes = 0;
  let previous = endpoints.origin;
  let appointmentConflicts = 0;
  for (const store of route) {
    const km = roadKm(previous, store);
    const travel = roadMinutes(previous, store);
    kilometers += km;
    driveMinutes += travel;
    time += travel;
    const appointment = fixture.state.appointments.find(row => row.storeId === store.id && row.date === date);
    const opening = day === 'Samedi' ? 9 * 60 : (/^(Darty|Boulanger)$/i.test(store.enseigne) ? 9 * 60 + 30 : 9 * 60);
    if (time < opening) { waitMinutes += opening - time; time = opening; }
    if (appointment) {
      const parts = appointment.time.split(':').map(Number);
      const fixed = parts[0] * 60 + parts[1];
      if (time > fixed + 0.001) appointmentConflicts++;
      else { waitMinutes += fixed - time; time = fixed; }
    }
    time += appointment ? Number(appointment.duration) || store.visitMinutes : store.visitMinutes;
    previous = store;
  }
  if (route.length) {
    kilometers += roadKm(previous, endpoints.destination);
    const back = roadMinutes(previous, endpoints.destination);
    driveMinutes += back;
    time += back;
  }
  const credits = route.reduce((total, store) => total + credit(store), 0);
  const feasible = !isBlockedDate(fixture, date) && credits <= fixture.config.maxCreditsPerDay && appointmentConflicts === 0 && time <= endLimit + 0.001;
  return { route: route.slice(), feasible, kilometers, driveMinutes, estimatedEnd: time, waitMinutes, appointmentConflicts, credits, start, endLimit };
}

function createDayEvaluator(fixture) {
  const cache = new Map();
  return function evaluate(route, day, weekKey) {
    const members = route.map(store => store.id).sort((a, b) => storeNumber(a) - storeNumber(b)).join(',');
    const key = weekKey + '|' + day + '|' + members;
    if (cache.has(key)) return cache.get(key);
    let best = null;
    for (const order of permutations(route)) {
      const row = evaluateOrder(fixture, order, day, weekKey);
      const signature = order.map(store => store.id).join(',');
      if (!best || (row.feasible && !best.feasible) || row.feasible === best.feasible && (
        row.driveMinutes < best.driveMinutes - 0.0001 ||
        Math.abs(row.driveMinutes - best.driveMinutes) <= 0.0001 && (row.estimatedEnd < best.estimatedEnd - 0.0001 ||
          Math.abs(row.estimatedEnd - best.estimatedEnd) <= 0.0001 && signature < best.signature)
      )) best = { ...row, signature };
    }
    cache.set(key, best);
    return best;
  };
}

function nearestRoute(route) {
  const remaining = route.slice().sort(byStoreId);
  const out = [];
  let previous = FIXTURE.base;
  while (remaining.length) {
    let bestIndex = 0;
    for (let index = 1; index < remaining.length; index++) {
      const a = roadKm(previous, remaining[index]);
      const b = roadKm(previous, remaining[bestIndex]);
      if (a < b - 0.0001 || Math.abs(a - b) <= 0.0001 && byStoreId(remaining[index], remaining[bestIndex]) < 0) bestIndex = index;
    }
    previous = remaining[bestIndex];
    out.push(remaining.splice(bestIndex, 1)[0]);
  }
  return out;
}

function applyLegacyGeography(fixture, built, evaluateDay, options) {
  options = options || {};
  const source = fs.readFileSync(path.join(ROOT, 'v182-fixes.js'), 'utf8');
  const document = {
    readyState: 'loading', hidden: false,
    addEventListener() {}, querySelector() { return null; }, getElementById() { return null; },
    querySelectorAll(selector) {
      return selector === '[data-day]' ? fixture.config.days.map(value => ({ checked: true, value })) : [];
    }
  };
  const context = {
    console, Date, Math, Number, String, Array, Object, JSON, Map, Set, RegExp,
    state: fixture.state,
    document,
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    addEventListener() {}, dispatchEvent() {}, setTimeout() { return 0; }, clearTimeout() {},
    confirm: () => true,
    baseObj: () => FIXTURE.base,
    hav,
    nearestRoute,
    twoOpt: route => route.slice(),
    storeVisitCredit: credit,
    routeWorkMinutes: route => route.reduce((total, store) => total + store.visitMinutes, 0),
    storeRunnerLockDayForWeek: (id, weekKey) => lockDay(fixture, id, weekKey),
    calendarEventsForDate: date => fixture.state.calendarEvents.filter(row => row.date === date),
    StoreRunnerVisitCoverage: coverage,
    StoreOpeningHoursV1: {
      routeFits(route, day, state, options) { return evaluateDay(route, day, iso(options.weekMonday)).feasible; }
    },
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'v182-fixes.js' });
  const api = context.StoreRunnerGeographyV185;
  assert.ok(api && typeof api.rebalance === 'function', 'la baseline doit charger la géographie V185 réelle');
  for (const week of built.weeks) {
    if (week.manual) continue;
    const frozenDays = (week.frozenDays || []).slice();
    if (options.freezeOvernight) for (const reservation of fixture.config.hotelReservations) for (const date of [reservation.fromDate, reservation.toDate]) {
      if (weekKeyOf(date) === week.weekKey) frozenDays.push(DAYS[(parseIso(date).getDay() || 7) - 1]);
    }
    const result = api.rebalance(week.plan, { weekKey: week.weekKey, preferNearFirst: true, frozenDays: Array.from(new Set(frozenDays)), preserveImposed: options.preserveImposed !== false });
    if (result.ok) week.plan = result.plan;
  }
  return api;
}

function canonicalizeRoutes(built, evaluateDay) {
  for (const week of built.weeks) {
    for (const day of DAYS) {
      const route = week.plan[day] || [];
      if (week.manual || (week.frozenDays || []).includes(day) || route.length < 2) continue;
      const evaluated = evaluateDay(route, day, week.weekKey);
      if (evaluated.feasible) week.plan[day] = evaluated.route.slice();
    }
  }
}

function planSignature(built) {
  return built.weeks.map(week => week.weekKey + '|' + DAYS.map(day => day + ':' + (week.plan[day] || []).map(store => store.id).join(',')).join('|')).join('\n');
}
function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function planObject(built) {
  return Object.fromEntries(built.weeks.map(week => [week.weekKey, Object.fromEntries(DAYS.map(day => [day, (week.plan[day] || []).map(store => store.id)]))]));
}

function cleanupMetricSnapshot(actual) {
  return {
    visits: actual.visits,
    coveredStores: actual.coveredStores,
    dueCovered: actual.dueCovered,
    dueTotal: actual.dueTotal,
    urgentCovered: actual.urgentCovered,
    urgentTotal: actual.urgentTotal,
    neverCovered: actual.neverCovered,
    neverTotal: actual.neverTotal,
    kilometers: actual.kilometers,
    driveMinutes: actual.driveMinutes,
    violations: actual.violations,
    crossDayApplied: !!(actual.crossDay && actual.crossDay.applied),
    signature: actual.signature
  };
}

function constraintViolations(fixture, built, evaluateDay) {
  const violations = [];
  const occurrences = new Map();
  const byWeek = new Map(built.weeks.map(week => [week.weekKey, week]));
  const constrained = (id, date, week) => fixture.state.included[id] || lockDay(fixture, id, week.weekKey) || appointmentDay(fixture, id, parseIso(week.weekKey)) || (fixture.visitDays.get(String(id)) || []).includes(date) || (week.manual || (week.frozenDays || []).includes(DAYS[(parseIso(date).getDay() || 7) - 1]));
  for (const week of built.weeks) {
    for (const day of DAYS) {
      const route = week.plan[day] || [];
      const date = dateFor(week.weekKey, day);
      if (route.length && isBlockedDate(fixture, date)) violations.push(date + ': visite sur jour bloqué');
      const evaluation = evaluateDay(route, day, week.weekKey);
      if (route.length && !evaluation.feasible) violations.push(date + ': journée infaisable');
      if (evaluation.credits > fixture.config.maxCreditsPerDay) violations.push(date + ': capacité dépassée');
      for (const store of route) {
        if (store.active === false) violations.push(store.id + ': magasin inactif planifié');
        if (fixture.state.excluded[store.id]) violations.push(store.id + ': magasin exclu planifié');
        if (!occurrences.has(store.id)) occurrences.set(store.id, []);
        occurrences.get(store.id).push({ date, week: week.weekKey, day });
        if (!constrained(store.id, date, week) && fixture.needOf(store, date).blocked) violations.push(store.id + ': garde VisitCoverage violée le ' + date);
      }
    }
  }
  for (const row of fixture.config.locks) {
    const found = (byWeek.get(row.week).plan[row.day] || []).some(store => store.id === row.storeId);
    if (!found) violations.push(row.storeId + ': verrou absent de ' + row.week + ' ' + row.day);
  }
  for (const row of fixture.config.appointments) {
    const week = byWeek.get(weekKeyOf(row.date));
    const day = DAYS[(parseIso(row.date).getDay() || 7) - 1];
    if (!week || !(week.plan[day] || []).some(store => store.id === row.storeId)) violations.push(row.storeId + ': rendez-vous absent le ' + row.date);
  }
  for (const id of fixture.config.included) {
    for (const week of built.weeks) if (!DAYS.some(day => (week.plan[day] || []).some(store => store.id === id))) violations.push(id + ': magasin imposé absent de ' + week.weekKey);
  }
  for (const row of fixture.config.pastVisits) {
    const week = byWeek.get(weekKeyOf(row.date));
    const day = DAYS[(parseIso(row.date).getDay() || 7) - 1];
    if (!week || !(week.plan[day] || []).some(store => store.id === row.storeId)) violations.push(row.storeId + ': visite réalisée déplacée du ' + row.date);
  }
  if (fixture.config.manualWeek) {
    const week = byWeek.get(fixture.config.manualWeek.week);
    for (const [day, ids] of Object.entries(fixture.config.manualWeek.placements)) {
      for (const id of ids) if (!week || !(week.plan[day] || []).some(store => store.id === id)) violations.push(id + ': pose manuelle déplacée de ' + day);
    }
  }
  for (const [id, rows] of occurrences) {
    const allowed = fixture.state.included[id] || fixture.config.locks.some(row => row.storeId === id) || fixture.config.appointments.some(row => row.storeId === id);
    if (rows.length > 1 && !allowed) violations.push(id + ': doublon libre sur horizon');
  }
  return violations;
}

function measure(fixture, built, evaluateDay, cpuMs) {
  const ids = new Set();
  let kilometers = 0;
  let driveMinutes = 0;
  const dailyLoads = [];
  for (const week of built.weeks) {
    for (const day of fixture.config.days) {
      const route = week.plan[day] || [];
      route.forEach(store => ids.add(store.id));
      const evaluation = evaluateDay(route, day, week.weekKey);
      kilometers += evaluation.kilometers;
      driveMinutes += evaluation.driveMinutes;
      dailyLoads.push({ date: dateFor(week.weekKey, day), visits: route.length, credits: evaluation.credits });
    }
  }
  const eligible = fixture.stores.filter(store => store.active !== false && !fixture.state.excluded[store.id]);
  const due = eligible.filter(store => {
    const row = fixture.needOf(store, iso(addDays(parseIso(FIXTURE.firstMonday), 20)));
    return row.status === 'late' || row.status === 'never' || row.status === 'soon';
  });
  const urgent = eligible.filter(store => fixture.needOf(store, FIXTURE.today).tier >= coverage.RULES.tiers.veryLate);
  const never = eligible.filter(store => fixture.needOf(store, FIXTURE.today).status === 'never');
  const violations = constraintViolations(fixture, built, evaluateDay);
  const loads = dailyLoads.map(row => row.credits);
  return {
    stores: fixture.config.storeCount,
    planifiableStores: eligible.length,
    visits: built.weeks.reduce((total, week) => total + DAYS.reduce((sum, day) => sum + (week.plan[day] || []).length, 0), 0),
    coveredStores: ids.size,
    dueCovered: due.filter(store => ids.has(store.id)).length,
    dueTotal: due.length,
    urgentCovered: urgent.filter(store => ids.has(store.id)).length,
    urgentTotal: urgent.length,
    neverCovered: never.filter(store => ids.has(store.id)).length,
    neverTotal: never.length,
    kilometers: Math.round(kilometers * 10) / 10,
    driveMinutes: Math.round(driveMinutes * 10) / 10,
    minDayCredits: Math.min(...loads),
    maxDayCredits: Math.max(...loads),
    loadSpread: Math.max(...loads) - Math.min(...loads),
    dailyLoads,
    violations: violations.length,
    violationDetails: violations,
    cpuMs: Math.round(cpuMs * 10) / 10,
    signature: fnv1a(planSignature(built)),
    crossDay: built.crossDay ? {
      applied: !!built.crossDay.applied,
      insertions: built.crossDay.insertions || 0,
      moves: built.crossDay.moves || 0,
      swaps: built.crossDay.swaps || 0,
      replacements: built.crossDay.replacements || 0,
      iterations: built.crossDay.iterations || 0,
      evaluations: built.crossDay.evaluations || 0,
      needEvaluations: built.crossDay.needEvaluations || 0,
      businessBaselineDelay: built.crossDay.businessBaselineDelay,
      businessFinalDelay: built.crossDay.businessFinalDelay,
      fixedDays: built.crossDay.fixedDays || 0,
      fixedVisits: built.crossDay.fixedVisits || 0,
      refused: built.crossDay.refused || {}
    } : null,
    plan: planObject(built)
  };
}

function runScenario(config, runOptions) {
  runOptions = runOptions || {};
  const fixture = buildScenario(config);
  fixture.stores = permuteStores(fixture.stores, runOptions.storeOrder || 'natural');
  fixture.state.stores = fixture.stores;
  const evaluateDay = createDayEvaluator(fixture);
  const options = {
    state: fixture.state,
    firstMonday: parseIso(FIXTURE.firstMonday),
    today: FIXTURE.today,
    existingPlanFor: key => key === FIXTURE.firstMonday ? fixture.existing : ((fixture.archive[key] && fixture.archive[key].plan) || null),
    completedOn: (id, date) => (fixture.visitDays.get(String(id)) || []).includes(date),
    days: config.days,
    target: config.target,
    maxCreditsPerDay: config.maxCreditsPerDay,
    stores: fixture.stores.filter(store => store.active !== false && !fixture.state.excluded[store.id]),
    archive: fixture.archive,
    distanceOf: store => hav(FIXTURE.base, store),
    distanceBetween: hav,
    priorityOf: store => fixture.priorities.has(store.id) ? 1 : 0,
    creditOf: credit,
    lockDayForWeek: (id, weekKey) => lockDay(fixture, id, weekKey),
    appointmentDay: (id, monday) => appointmentDay(fixture, id, monday),
    dayBlocked: date => isBlockedDate(fixture, date),
    dayFits: (route, day, monday) => evaluateDay(route, day, iso(monday)).feasible,
    evaluateDayRoute: (route, day, weekKey) => evaluateDay(route, day, weekKey),
    needOf: fixture.needOf,
    overnightReservations: fixture.state.hotelReservations,
    crossDayEnabled: runOptions.crossDayEnabled,
    prepareCrossDayWeeks: weeks => {
      const reference = weeks.map(week => ({ ...week, plan: clone(week.plan), frozenDays: (week.frozenDays || []).slice() }));
      applyLegacyGeography(fixture, { weeks: reference }, evaluateDay, { freezeOvernight: true, preserveImposed: false });
      for (let index = 0; index < weeks.length; index++) weeks[index].plan = clone(reference[index].plan);
      return { businessBaselineWeeks: reference };
    }
  };
  const start = performance.now();
  const built = terrain.buildThreeWeekSnail(options);
  if (!(built.crossDay && built.crossDay.applied) && runOptions.applyLegacy !== false) applyLegacyGeography(fixture, built, evaluateDay);
  if (runOptions.canonicalize !== false) canonicalizeRoutes(built, evaluateDay);
  const cpuMs = performance.now() - start;
  return { fixture, built, metrics: measure(fixture, built, evaluateDay, cpuMs) };
}

function inflatePlan(fixture, plan) {
  const byId = new Map(fixture.stores.map(store => [String(store.id), store]));
  return Object.fromEntries(DAYS.map(day => [day, ((plan && plan[day]) || []).map(raw => byId.get(String(raw && raw.id || raw))).filter(Boolean)]));
}

function forecastPlan(fixture, planByWeek) {
  const state = clone(fixture.state);
  state.settings.weekDate = FIXTURE.firstMonday;
  state.plan = inflatePlan(fixture, planByWeek[FIXTURE.firstMonday]);
  const archive = {};
  for (const [weekKey, plan] of Object.entries(planByWeek)) archive[weekKey] = { weekMonday: weekKey, plan: inflatePlan(fixture, plan) };
  const planningDiagnostics = Object.keys(planByWeek).sort().map(weekKey => ({
    weekKey,
    days: DAYS.map(day => {
      const date = dateFor(weekKey, day);
      return { date, day, status: isBlockedDate(fixture, date) ? 'blocked' : (((planByWeek[weekKey] && planByWeek[weekKey][day]) || []).length ? 'planned' : 'empty') };
    })
  }));
  return coverage.forecastThreeWeeks(state, {
    today: FIXTURE.today,
    firstMonday: FIXTURE.firstMonday,
    archive,
    range: { start: FIXTURE.firstMonday, workDays: fixture.config.days, planningDiagnostics, coverage: { needAware: true, uncoveredLate: [], uncoveredNever: [], recentlyVisited: [] } },
    workDays: fixture.config.days,
    visitDays: fixture.visitDays,
    priorities: fixture.priorities,
    dayBlocked: date => isBlockedDate(fixture, date),
    lockDayForWeek: (id, weekKey) => lockDay(fixture, id, weekKey)
  });
}

function oracleNeedRank(row) {
  const tier = Number(row && row.tier), status = String(row && row.status || ''), blocked = !!(row && row.blocked);
  let rank = 0;
  if (!blocked && tier >= 4) rank = 5;
  else if (!blocked && status === 'never') rank = 4;
  else if (!blocked && status === 'late') rank = 3;
  else if (!blocked && status === 'soon') rank = 2;
  else if (!blocked && status === 'ok') rank = 1;
  return rank * 100 + (String(row && row.priority || '') === 'P1' ? 1 : 0);
}

function projectedRank(row) {
  return oracleNeedRank({ status: row.projectedStatus, tier: row.projectedTier, priority: row.priority, blocked: row.projectedTier === 0 });
}

function cumulativeOverdueDays(forecast) {
  return forecast.rows.reduce((total, row) => {
    if (row.status === 'never') return total + (row.plannedDate ? Math.max(0, dateDiff(forecast.today, row.plannedDate)) : dateDiff(forecast.today, forecast.end) + 1);
    if (!row.dueDate) return total;
    return total + Math.max(0, dateDiff(row.dueDate, row.plannedDate || forecast.end));
  }, 0);
}

function planOccurrences(planByWeek, id) {
  const rows = [];
  for (const weekKey of Object.keys(planByWeek).sort()) for (const day of DAYS) {
    const date = dateFor(weekKey, day);
    ((planByWeek[weekKey] && planByWeek[weekKey][day]) || []).forEach(storeId => {
      if (String(storeId) === String(id)) rows.push({ weekKey, day, date });
    });
  }
  return rows;
}

function routeIdsOn(planByWeek, date) {
  const weekKey = weekKeyOf(date), day = DAYS[(parseIso(date).getDay() || 7) - 1];
  return ((planByWeek[weekKey] && planByWeek[weekKey][day]) || []).slice();
}

function assertHardConstraintIdentity(result) {
  const config = result.fixture.config;
  const before = runScenario(config, { crossDayEnabled: false, applyLegacy: false, canonicalize: false }).metrics.plan;
  const after = result.metrics.plan;
  const samePlacement = (id, label) => assert.deepEqual(planOccurrences(after, id), planOccurrences(before, id), config.id + ' : identité avant/après altérée pour ' + label + ' ' + id);

  if (config.manualWeek) assert.deepEqual(after[config.manualWeek.week], before[config.manualWeek.week], config.id + ' : identité complète de la semaine manuelle altérée');
  for (const day of DAYS) {
    const date = dateFor(FIXTURE.firstMonday, day);
    if (date < FIXTURE.today) assert.deepEqual(routeIdsOn(after, date), routeIdsOn(before, date), config.id + ' : identité complète du jour passé ' + date + ' altérée');
  }
  for (const row of config.appointments) samePlacement(row.storeId, 'rendez-vous');
  for (const row of config.locks) samePlacement(row.storeId, 'verrou');
  for (const id of config.included) assert.deepEqual(planOccurrences(after, id), planOccurrences(config.baseline.plan, id), config.id + ' : identité complète du magasin imposé ' + id + ' altérée après la construction initiale');
  for (const row of config.pastVisits) samePlacement(row.storeId, 'visite réalisée');
  for (const reservation of config.hotelReservations) for (const date of [reservation.fromDate, reservation.toDate]) {
    if (date >= FIXTURE.firstMonday && date <= iso(addDays(parseIso(FIXTURE.firstMonday), 20))) assert.deepEqual(routeIdsOn(after, date).sort(), routeIdsOn(before, date).sort(), config.id + ' : affectation complète du découché ' + date + ' altérée');
  }
  for (const blocked of config.blockedDates) {
    assert.ok(blocked.date >= FIXTURE.firstMonday && blocked.date <= iso(addDays(parseIso(FIXTURE.firstMonday), 20)), config.id + ' : le jour bloqué de fixture doit être dans l’horizon : ' + blocked.date);
    assert.deepEqual(routeIdsOn(after, blocked.date), routeIdsOn(before, blocked.date), config.id + ' : identité complète du jour indisponible/férié ' + blocked.date + ' altérée');
  }
}

function assertForecastOracle(result) {
  const fixture = result.fixture, baseline = forecastPlan(fixture, fixture.config.baseline.plan), current = forecastPlan(fixture, result.metrics.plan);
  assert.ok(current.counts.projected.late <= baseline.counts.projected.late, fixture.config.id + ' : forecast avec un magasin late supplémentaire (' + baseline.counts.projected.late + ' → ' + current.counts.projected.late + ')');
  assert.ok(current.counts.projected.never <= baseline.counts.projected.never, fixture.config.id + ' : forecast avec un magasin never supplémentaire');
  const baselineRows = new Map(baseline.rows.map(row => [row.id, row]));
  for (const row of current.rows) {
    const previous = baselineRows.get(row.id);
    assert.ok(previous && projectedRank(row) <= projectedRank(previous), fixture.config.id + ' : statut forecast individuel dégradé pour ' + row.id + ' (' + previous.projectedStatus + ' → ' + row.projectedStatus + ')');
  }
  const baselineDelay = cumulativeOverdueDays(baseline), currentDelay = cumulativeOverdueDays(current);
  assert.ok(currentDelay <= baselineDelay, fixture.config.id + ' : retard cumulé forecast aggravé (' + baselineDelay + ' → ' + currentDelay + ')');

  /* À chaque coupure de date, la liste triée des besoins déjà servis par V264 doit être
     lexicographiquement au moins aussi prioritaire que celle de la baseline. */
  const dates = Array.from(new Set(baseline.availableWorkDates.concat(current.availableWorkDates))).sort();
  const stores = new Map(fixture.stores.map(store => [String(store.id), store]));
  const servedRanks = (plan, cutoff) => {
    const ids = [];
    for (const [weekKey, weekPlan] of Object.entries(plan)) for (const day of DAYS) {
      const date = dateFor(weekKey, day);
      if (date > cutoff || date < FIXTURE.today) continue;
      for (const id of (weekPlan[day] || [])) if (stores.has(String(id))) ids.push(String(id));
    }
    return ids.map(id => oracleNeedRank(fixture.needOf(stores.get(id), cutoff))).sort((a, b) => b - a);
  };
  for (const date of dates) {
    const beforeRanks = servedRanks(fixture.config.baseline.plan, date), afterRanks = servedRanks(result.metrics.plan, date);
    const count = Math.max(beforeRanks.length, afterRanks.length);
    for (let index = 0; index < count; index++) {
      const beforeRank = beforeRanks[index] || 0, afterRank = afterRanks[index] || 0;
      if (afterRank === beforeRank) continue;
      assert.ok(afterRank > beforeRank, fixture.config.id + ' : un besoin plus urgent est repoussé avant le ' + date);
      break;
    }
  }
  result.forecast = {
    baseline: { late: baseline.counts.projected.late, never: baseline.counts.projected.never, overdueDays: baselineDelay },
    current: { late: current.counts.projected.late, never: current.counts.projected.never, overdueDays: currentDelay }
  };
}

const results = PRIORITY_CASE ? [] : FIXTURE.scenarios.map(config => runScenario(config, {
  storeOrder: STORE_ORDER,
  crossDayEnabled: config.withoutHistory ? false : undefined
}));

if (process.argv.includes('--capture')) {
  for (const row of results) assertForecastOracle(row);
  console.log(JSON.stringify(Object.fromEntries(results.map(row => [row.fixture.config.id, {
    ...row.metrics,
    forecast: row.forecast.current
  }])), null, 2));
  process.exit(0);
}

for (const result of results) {
  const { config } = result.fixture;
  const baseline = config.baseline;
  assert.ok(baseline && baseline.signature, config.id + ' : baseline manquante');
  assertHardConstraintIdentity(result);
  assertForecastOracle(result);
  const cleanup = CLEANUP_BASELINE.planning.scenarios[config.id];
  assert.ok(cleanup, config.id + ' : baseline ménage r20 manquante');
  assert.deepEqual(cleanupMetricSnapshot(result.metrics), cleanup.metrics, config.id + '/' + STORE_ORDER + ' : métriques r20 modifiées');
  assert.deepEqual(result.forecast.current, cleanup.forecast, config.id + '/' + STORE_ORDER + ' : forecast r20 modifié');
  assert.deepEqual(result.metrics.plan, cleanup.plan, config.id + '/' + STORE_ORDER + ' : magasin → semaine/jour/ordre r20 modifié');
  assert.deepEqual(Object.keys(result.metrics.plan).sort(), cleanup.archive.weekKeys, config.id + ' : semaines archivées modifiées');
  assert.deepEqual(config.manualWeek ? [config.manualWeek.week] : [], cleanup.archive.manualWeeks, config.id + ' : propriété manuelle des archives modifiée');
  assert.deepEqual(config.days, cleanup.range.workDays, config.id + ' : jours travaillés de la plage modifiés');
  const lastWeek = cleanup.archive.weekKeys[cleanup.archive.weekKeys.length - 1];
  assert.equal(dateFor(lastWeek, cleanup.range.workDays[cleanup.range.workDays.length - 1]), cleanup.range.end, config.id + ' : borne de plage modifiée');
  assert.equal(result.metrics.violations, 0, config.id + ' : aucune contrainte dure ne peut être violée\n' + result.metrics.violationDetails.join('\n'));
  assert.ok(result.metrics.coveredStores >= baseline.coveredStores, config.id + ' : couverture totale en régression');
  assert.ok(result.metrics.dueCovered >= baseline.dueCovered, config.id + ' : couverture des magasins dus en régression');
  assert.ok(result.metrics.urgentCovered >= baseline.urgentCovered, config.id + ' : couverture urgente en régression');
  assert.ok(result.metrics.neverCovered >= baseline.neverCovered, config.id + ' : couverture des jamais visités en régression');
  assert.ok(result.metrics.kilometers <= baseline.kilometers + 0.1, config.id + ' : kilomètres supérieurs à la baseline');
  assert.ok(result.metrics.driveMinutes <= baseline.driveMinutes + 0.1, config.id + ' : minutes supérieures à la baseline');
  assert.ok(result.metrics.cpuMs < 5000, config.id + ' : le moteur doit rester borné sous 5 s sur la machine de CI');
  if (config.withoutHistory) {
    assert.equal(result.metrics.crossDay && result.metrics.crossDay.applied, false, config.id + ' : sans historique, la baseline doit conserver le chemin historique sans passe cross-day');
  } else {
    assert.equal(result.metrics.crossDay && result.metrics.crossDay.applied, true, config.id + ' : la passe cross-day doit être propriétaire de l’affectation');
    assert.ok(result.metrics.crossDay.swaps + result.metrics.crossDay.moves + result.metrics.crossDay.replacements > 0, config.id + ' : la fixture doit exercer une amélioration locale réelle');
    assert.ok(Object.values(result.metrics.plan).some(plan => DAYS.some(day => plan[day].includes(config.urgentIsolated))), config.id + ' : le magasin urgent isolé ne doit jamais être sacrifié aux kilomètres');
  }
  assert.deepEqual(new Set(result.fixture.stores.map(store => store.intervalDays)), new Set([7, 15, 30, 90]), config.id + ' : hebdomadaire, 15 jours, mensuel et trimestriel doivent être représentés');
  assert.ok(result.metrics.dailyLoads.some(row => row.credits === config.maxCreditsPerDay), config.id + ' : la capacité saturée doit être exercée');
  for (const blocked of config.blockedDates) {
    const load = result.metrics.dailyLoads.find(row => row.date === blocked.date);
    if (load) assert.equal(load.visits, 0, config.id + ' : le jour indisponible/férié ' + blocked.date + ' doit rester vide');
  }
  for (const id of config.excluded.concat(config.inactive)) assert.ok(!Object.values(result.metrics.plan).some(plan => DAYS.some(day => plan[day].includes(id))), config.id + ' : ' + id + ' exclu/inactif ne doit pas être planifié');
  const appointment = config.appointments[0];
  if (appointment) {
    const appointmentPlan = result.metrics.plan[weekKeyOf(appointment.date)], appointmentDayName = DAYS[(parseIso(appointment.date).getDay() || 7) - 1];
    assert.ok(appointmentPlan[appointmentDayName].includes(appointment.storeId), config.id + ' : le rendez-vous de milieu de journée doit rester sur sa date');
  }
  if (config.days.includes('Samedi')) assert.ok(result.metrics.dailyLoads.filter(row => parseIso(row.date).getDay() === 6).some(row => row.visits > 0), config.id + ' : samedi activé doit être utilisable');
  else assert.ok(Object.values(result.metrics.plan).every(plan => plan.Samedi.length === 0), config.id + ' : samedi désactivé doit rester vide');
  if (config.manualWeek) {
    assert.ok(result.metrics.crossDay.refused.manualWeeks >= 1, config.id + ' : la semaine manuelle doit sortir du voisinage de recherche');
    for (const [day, ids] of Object.entries(config.manualWeek.placements)) for (const id of ids) assert.ok(result.metrics.plan[config.manualWeek.week][day].includes(id), config.id + ' : pose manuelle ' + id + ' déplacée');
  }
  if (!config.withoutHistory && config.hotelReservations.length && !config.manualWeek) assert.ok(result.metrics.crossDay.refused.overnightDays >= 2, config.id + ' : les deux jours du découché existant doivent être figés');
  if (!config.withoutHistory) assert.ok(result.metrics.crossDay.refused.pastDays >= 2, config.id + ' : les jours passés de la semaine entamée doivent être figés');
  const reruns = Array.from({ length: 3 }, () => runScenario(config, {
    storeOrder: STORE_ORDER,
    crossDayEnabled: config.withoutHistory ? false : undefined
  }).metrics.signature);
  assert.deepEqual(reruns, [result.metrics.signature, result.metrics.signature, result.metrics.signature], config.id + ' : même entrée, même planning');
}

/* Sélection pure : la géographie ne départage qu'après StoreRunnerVisitCoverage.
   - un très-en-retard isolé bat un jamais-visité proche ;
   - un jamais-visité bat un P1 seulement en retard ;
   - entre deux jamais-visités strictement égaux, le magasin cohérent avec la journée gagne. */
function runSelectionCase(candidates, needs) {
  const anchor = { id: 'anchor', x: 100, lat: 45, lon: 4, active: true };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [anchor] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const needAt = store => needs[store.id] || { status: 'late', tier: 3, priority: '', blocked: false };
  const evaluate = route => {
    const orders = permutations(route), score = order => {
      let distance = 0, previous = 0;
      for (const store of order) { distance += Math.abs(store.x - previous); previous = store.x; }
      return distance + Math.abs(previous);
    };
    const ordered = orders.sort((a, b) => score(a) - score(b) || a.map(row => row.id).join(',').localeCompare(b.map(row => row.id).join(',')))[0];
    const distance = score(ordered);
    return { route: ordered, feasible: true, kilometers: distance, driveMinutes: distance, credits: route.length };
  };
  const state = { included: { anchor: true }, hotelReservations: {}, settings: {} };
  const report = terrain.optimizeThreeWeekCrossDay(weeks, {
    state, days: ['Lundi'], target: 2, maxCreditsPerDay: 4,
    ranked: [anchor].concat(candidates), memory: { usedKeys: new Set(), useCount: new Map() },
    needAt, creditOf: () => 1, lockDayForWeek: () => '', appointmentDay: () => '', completedOn: () => false,
    dayBlocked: () => false, dayFits: () => true, evaluateDayRoute: evaluate, distanceBetween: (a, b) => Math.abs(a.x - b.x), overnightReservations: {}
  });
  return { report, ids: weeks[0].plan.Lundi.map(store => store.id) };
}

(function businessBeforeGeographyAndGeographyInsideTies() {
  const urgentFar = { id: 'z-urgent-far', x: -180, lat: 45, lon: 4, active: true };
  const neverNear = { id: 'a-never-near', x: 102, lat: 45, lon: 4, active: true };
  let result = runSelectionCase([neverNear, urgentFar], {
    'z-urgent-far': { status: 'late', tier: 4, priority: '', blocked: false },
    'a-never-near': { status: 'never', tier: 3.5, priority: '', blocked: false }
  });
  assert.ok(result.ids.includes('z-urgent-far') && !result.ids.includes('a-never-near'), 'un urgent isolé doit gagner même quand il coûte plus de route');
  const lateP1 = { id: 'a-late-p1', x: 101, lat: 45, lon: 4, active: true };
  const neverFar = { id: 'z-never-far', x: -120, lat: 45, lon: 4, active: true };
  result = runSelectionCase([lateP1, neverFar], {
    'a-late-p1': { status: 'late', tier: 3.25, priority: 'P1', blocked: false },
    'z-never-far': { status: 'never', tier: 3.5, priority: '', blocked: false }
  });
  assert.ok(result.ids.includes('z-never-far') && !result.ids.includes('a-late-p1'), 'P1 reste un avantage interne : jamais visité doit battre P1 en retard');
  const tieFar = { id: 'a-tie-far', x: -100, lat: 45, lon: 4, active: true };
  const tieNear = { id: 'z-tie-near', x: 101, lat: 45, lon: 4, active: true };
  result = runSelectionCase([tieFar, tieNear], {
    'a-tie-far': { status: 'never', tier: 3.5, priority: '', blocked: false },
    'z-tie-near': { status: 'never', tier: 3.5, priority: '', blocked: false }
  });
  assert.ok(result.ids.includes('z-tie-near') && !result.ids.includes('a-tie-far'), 'à besoin strictement égal, la cohérence géographique doit choisir le magasin');
  assert.equal(result.report.insertions, 1, 'la construction cross-day doit sélectionner et affecter le magasin en une seule étape');
})();

/* Un magasin posé librement en semaine 1 et contraint (verrou ou rendez-vous) le lundi de
   la semaine 2 : un échange inter-semaines ne doit jamais l'ajouter une seconde fois dans
   la journée contrainte. */
if (!PRIORITY_CASE) (function constrainedStoreNeverDuplicatedInItsDay() {
  for (const kind of ['lock', 'appointment']) {
    const A = { id: 'A', x: 100 }, X = { id: 'X', x: 101 }, L = { id: 'L', x: -100 }, B = { id: 'B', x: -101 };
    const weeks = [
      { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [A, L] }), manual: false, frozenDays: [] },
      { weekKey: '2026-10-05', plan: Object.assign(emptyPlan(), { Lundi: [L, B, X] }), manual: false, frozenDays: [] },
      { weekKey: '2026-10-12', plan: emptyPlan(), manual: false, frozenDays: [] }
    ];
    const score = order => { let distance = 0, previous = 0; for (const store of order) { distance += Math.abs(store.x - previous); previous = store.x; } return distance + Math.abs(previous); };
    const evaluate = route => {
      const ordered = permutations(route).sort((a, b) => score(a) - score(b) || a.map(row => row.id).join(',').localeCompare(b.map(row => row.id).join(',')))[0] || [];
      return { route: ordered, feasible: true, kilometers: score(ordered), driveMinutes: score(ordered) };
    };
    const constrained = (id, weekKey) => id === 'L' && weekKey === '2026-10-05' ? 'Lundi' : '';
    terrain.optimizeThreeWeekCrossDay(weeks, {
      state: { included: {}, hotelReservations: {} }, days: DAYS.slice(0, 5), target: 3, maxCreditsPerDay: 4,
      ranked: [A, X, L, B], memory: { usedKeys: new Set(), useCount: new Map() },
      needAt: () => ({ status: 'late', tier: 3, priority: '', blocked: false }), creditOf: () => 1,
      lockDayForWeek: kind === 'lock' ? constrained : () => '',
      appointmentDay: kind === 'appointment' ? (id, monday) => constrained(id, iso(monday)) : () => '',
      completedOn: () => false, dayBlocked: () => false, dayFits: () => true, evaluateDayRoute: evaluate,
      distanceBetween: (a, b) => Math.abs(a.x - b.x), overnightReservations: {}
    });
    const constrainedDay = weeks[1].plan.Lundi.map(store => store.id);
    assert.equal(constrainedDay.filter(id => id === 'L').length, 1, kind + ' : le magasin contraint ne doit apparaître qu’une fois dans sa journée (' + constrainedDay.join(',') + ')');
    for (const week of weeks) for (const day of DAYS) {
      const ids = week.plan[day].map(store => store.id);
      assert.equal(new Set(ids).size, ids.length, kind + ' : doublon dans ' + week.weekKey + ' ' + day);
    }
  }
})();

function rangeEvaluator(route) {
  const ordered = route.slice().sort((a, b) => Number(a.x) - Number(b.x) || String(a.id).localeCompare(String(b.id)));
  const distance = ordered.length < 2 ? 0 : Number(ordered[ordered.length - 1].x) - Number(ordered[0].x);
  return { route: ordered, feasible: true, kilometers: distance, driveMinutes: distance, credits: route.length };
}

function runPriorityGuardCase(options) {
  const report = terrain.optimizeThreeWeekCrossDay(options.weeks, {
    state: { included: options.included || {}, hotelReservations: {} },
    days: ['Lundi'], target: 2, maxCreditsPerDay: 4,
    ranked: options.ranked, memory: { usedKeys: new Set(), useCount: new Map() },
    needAt: options.needAt, creditOf: () => 1,
    lockDayForWeek: () => '', appointmentDay: () => '', completedOn: () => false,
    dayBlocked: () => false, dayFits: () => true, evaluateDayRoute: rangeEvaluator,
    distanceBetween: (a, b) => Math.abs(Number(a.x) - Number(b.x)), overnightReservations: {}
  });
  return report;
}

/* Régression Claude : à J+20 les deux magasins deviennent très en retard, mais le
   magasin déjà très en retard aujourd'hui ne peut pas être repoussé de deux semaines
   au profit d'un magasin seulement en retard à la date du premier créneau. */
if (PRIORITY_CASE !== 'replacement') (function interWeekSwapUsesActualDates() {
  const west = { id: 'west-anchor', x: -100 }, urgent = { id: 'urgent-now', x: 100 };
  const east = { id: 'east-anchor', x: 100 }, later = { id: 'less-urgent-now', x: -100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [west, urgent] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-12', plan: Object.assign(emptyPlan(), { Lundi: [east, later] }), manual: false, frozenDays: [] }
  ];
  const report = runPriorityGuardCase({
    weeks, ranked: [west, urgent, east, later], included: { 'west-anchor': true, 'east-anchor': true },
    needAt(store, date) {
      if (store.id === 'urgent-now') return { status: 'late', tier: 4, priority: '', blocked: false };
      if (store.id === 'less-urgent-now') return date >= '2026-10-12'
        ? { status: 'late', tier: 4, priority: '', blocked: false }
        : { status: 'late', tier: 3, priority: '', blocked: false };
      return { status: 'ok', tier: 1, priority: '', blocked: false };
    }
  });
  assert.ok(weeks[0].plan.Lundi.some(store => store.id === 'urgent-now'), 'swap inter-semaines : le très-en-retard doit rester au premier créneau');
  assert.ok(weeks[2].plan.Lundi.some(store => store.id === 'less-urgent-now'), 'swap inter-semaines : le moins urgent ne doit pas prendre le premier créneau');
  assert.equal(report.swaps, 0, 'swap inter-semaines : la géographie ne peut pas écraser la priorité à la date réelle');
})();

/* Régression Claude : deux magasins égaux en fin d'horizon ne sont pas des
   remplacements équivalents si l'un est en retard et l'autre seulement bientôt dû
   à la date du créneau. */
if (PRIORITY_CASE !== 'swap') (function replacementUsesSlotAndHorizonNeed() {
  const anchor = { id: 'replacement-anchor', x: 100 };
  const current = { id: 'late-current', x: -100 };
  const candidate = { id: 'soon-candidate', x: 100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [anchor, current] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const report = runPriorityGuardCase({
    weeks, ranked: [anchor, current, candidate], included: { 'replacement-anchor': true },
    needAt(store, date) {
      if (store.id === 'late-current') return { status: 'late', tier: 3, priority: '', blocked: false };
      if (store.id === 'soon-candidate') return date >= '2026-10-12'
        ? { status: 'late', tier: 3, priority: '', blocked: false }
        : { status: 'soon', tier: 2, priority: '', blocked: false };
      return { status: 'ok', tier: 1, priority: '', blocked: false };
    }
  });
  assert.ok(weeks[0].plan.Lundi.some(store => store.id === 'late-current'), 'replacement : le magasin en retard ne peut pas être retiré pour un bientôt dû');
  assert.ok(!weeks[0].plan.Lundi.some(store => store.id === 'soon-candidate'), 'replacement : le candidat non équivalent ne doit pas gagner sur les kilomètres');
  assert.equal(report.replacements, 0, "replacement : l'équivalence en fin d'horizon seule est insuffisante");
})();

/* Le voisinage replacement reste réellement exercé quand les besoins sont égaux
   à la date du créneau et à la fin de l'horizon. */
if (!PRIORITY_CASE) (function equivalentReplacementIsExercised() {
  const anchor = { id: 'safe-anchor', x: 100 };
  const current = { id: 'safe-current', x: -100 };
  const candidate = { id: 'safe-candidate', x: 100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [anchor, current] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const report = runPriorityGuardCase({
    weeks, ranked: [anchor, current, candidate], included: { 'safe-anchor': true },
    needAt: () => ({ status: 'ok', tier: 1, priority: '', blocked: false })
  });
  assert.ok(!weeks[0].plan.Lundi.some(store => store.id === 'safe-current'), 'replacement équivalent : le magasin géographiquement incohérent doit pouvoir sortir');
  assert.ok(weeks[0].plan.Lundi.some(store => store.id === 'safe-candidate'), 'replacement équivalent : le candidat cohérent doit pouvoir entrer');
  assert.equal(report.replacements, 1, 'replacement équivalent : le voisinage replacement doit être effectivement exercé');
})();

if (!PRIORITY_CASE) (function holidayWordMustBeExact() {
  const eventState = title => ({ calendarEvents: [{ date: '2026-10-01', title, allDay: true }] });
  assert.equal(terrain.dateBlocked('2026-10-01', eventState('Jour férié')), true, 'le mot férié doit bloquer la journée');
  assert.equal(terrain.dateBlocked('2026-10-01', eventState('Jours fériés régionaux')), true, 'le pluriel fériés doit bloquer la journée');
  assert.equal(terrain.dateBlocked('2026-10-01', eventState('Rendez-vous avec Fériel')), false, 'un nom contenant la sous-chaîne ferie ne doit pas bloquer la journée');
  const fixture = buildScenario(FIXTURE.scenarios[0]), legacy = applyLegacyGeography(fixture, { weeks: [] }, createDayEvaluator(fixture));
  assert.equal(legacy.eventBlocksPlanning({ title: 'Jour férié', allDay: true }), true, 'V185 doit reconnaître le mot férié');
  assert.equal(legacy.eventBlocksPlanning({ title: 'Rendez-vous avec Fériel', allDay: true }), false, 'V185 ne doit pas bloquer le faux positif Fériel');
})();

/* Lot 3A — brief hebdomadaire V246 (option briefAt : contribution d'un magasin à une date, celle
   de sa semaine). L'optimiseur ne peut pas l'effacer : aucune modification acceptée ne fait baisser
   le total brief des visites touchées, et l'insertion le fait passer avant la géographie. */
function runBriefCase(weeks, ranked, briefAt, extra = {}) {
  return terrain.optimizeThreeWeekCrossDay(weeks, Object.assign({
    state: { included: extra.included || {}, hotelReservations: {} },
    days: extra.days || ['Lundi'], target: extra.target || 2, maxCreditsPerDay: 4,
    ranked, memory: { usedKeys: new Set(), useCount: new Map() },
    needAt: extra.needAt || (() => ({ status: 'ok', tier: 1, priority: '', blocked: false })), projectedNeedAt: extra.projectedNeedAt, creditOf: () => 1,
    lockDayForWeek: () => '', appointmentDay: () => '', completedOn: () => false,
    dayBlocked: () => false, dayFits: () => true, evaluateDayRoute: rangeEvaluator,
    distanceBetween: (a, b) => Math.abs(Number(a.x) - Number(b.x)), overnightReservations: {}
  }, briefAt ? { briefAt } : {}));
}
const briefOn = (id, weekKey, value) => (store, date) => store.id === id && weekKeyOf(date) === weekKey ? value : 0;
const idsIn = (week, day) => week.plan[day].map(store => store.id).sort().join('+');

if (!PRIORITY_CASE) (function briefMoveNeverLeavesItsWeek() {
  // A (+50 en W41 seulement) serait mieux placé en W40, qui a de la place. Les déplacements V264
  // restent dans leur semaine, et la garde brief tient l'invariant si cela change un jour.
  const w1 = { id: 'w1-anchor', x: 100 }, w2 = { id: 'w2-anchor', x: -100 }, A = { id: 'A', x: 100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [w1] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: Object.assign(emptyPlan(), { Lundi: [w2, A] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const report = runBriefCase(weeks, [w1, w2, A], briefOn('A', '2026-10-05', 50), { included: { 'w1-anchor': true, 'w2-anchor': true } });
  assert.equal(idsIn(weeks[1], 'Lundi'), 'A+w2-anchor', 'brief : A ne quitte pas la semaine où il vaut +50');
  assert.equal(report.moves + report.swaps, 0, 'brief : aucun déplacement ni échange ne fait perdre le bonus');
})();

if (!PRIORITY_CASE) (function briefMoveInsideItsWeekStaysPossible() {
  const left = { id: 'left-anchor', x: -100 }, right = { id: 'right-anchor', x: 100 }, A = { id: 'A', x: -100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [left], Mardi: [right, A] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const report = runBriefCase(weeks, [left, right, A], briefOn('A', '2026-09-28', 50), { days: ['Lundi', 'Mardi'], target: 3, included: { 'left-anchor': true, 'right-anchor': true } });
  assert.equal(idsIn(weeks[0], 'Lundi'), 'A+left-anchor', 'brief : même semaine, même contribution, le déplacement géographique reste permis');
  assert.ok(report.moves >= 1, 'brief : le voisinage move reste exercé');
})();

function briefSwapCase(briefAt) {
  const w1 = { id: 'w1-anchor', x: 100 }, B = { id: 'B', x: -100 }, w2 = { id: 'w2-anchor', x: -100 }, A = { id: 'A', x: 100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [w1, B] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: Object.assign(emptyPlan(), { Lundi: [w2, A] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const report = runBriefCase(weeks, [w1, B, w2, A], briefAt, { included: { 'w1-anchor': true, 'w2-anchor': true } });
  return { report, w1: idsIn(weeks[0], 'Lundi'), w2: idsIn(weeks[1], 'Lundi') };
}
if (!PRIORITY_CASE) (function briefSwapNeverLowersTheTotal() {
  const lost = briefSwapCase(briefOn('A', '2026-10-05', 50));
  assert.equal(lost.w2, 'A+w2-anchor', 'brief : un échange qui ferait perdre le +50 de A est refusé, même 400 km plus court');
  assert.equal(lost.report.swaps, 0, 'brief : swap refusé');
  for (const [label, briefAt] of [['sans brief', null], ['brief neutre', store => store.id === 'A' ? 50 : 0], ['brief meilleur', briefOn('A', '2026-09-28', 50)]]) {
    const kept = briefSwapCase(briefAt);
    assert.equal(kept.w1, 'A+w1-anchor', label + ' : l’échange géographique reste permis');
    assert.equal(kept.report.swaps, 1, label + ' : swap accepté');
  }
})();

function briefReplacementCase(briefAt) {
  const anchor = { id: 'anchor', x: 100 }, current = { id: 'current', x: -100 }, candidate = { id: 'candidate', x: 100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [anchor, current] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const report = runBriefCase(weeks, [anchor, current, candidate], briefAt, { included: { anchor: true } });
  return { report, ids: idsIn(weeks[0], 'Lundi') };
}
if (!PRIORITY_CASE) (function briefReplacementNeverDropsABoostedStore() {
  const kept = briefReplacementCase(briefOn('current', '2026-09-28', 50));
  assert.equal(kept.ids, 'anchor+current', 'brief : un magasin +50 n’est pas remplacé par un magasin à 0');
  assert.equal(kept.report.replacements, 0, 'brief : remplacement refusé');
  const better = briefReplacementCase(briefOn('candidate', '2026-09-28', 50));
  assert.equal(better.ids, 'anchor+candidate', 'brief : 0 → +50 reste admissible quand métier, rotation et géographie le permettent');
  assert.equal(better.report.replacements, 1, 'brief : remplacement accepté');
})();

if (!PRIORITY_CASE) (function briefWinsInsertionBeforeGeography() {
  const run = briefAt => {
    const anchor = { id: 'anchor', x: 100 }, near = { id: 'a-near', x: 101 }, far = { id: 'z-far', x: -100 };
    const weeks = [
      { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [anchor] }), manual: false, frozenDays: [] },
      { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
      { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
    ];
    const report = runBriefCase(weeks, [anchor, near, far], briefAt, { included: { anchor: true }, needAt: () => ({ status: 'never', tier: 3.5, priority: '', blocked: false }) });
    return { report, ids: idsIn(weeks[0], 'Lundi') };
  };
  assert.equal(run(null).ids, 'a-near+anchor', 'sans brief, à besoin et rotation égaux, la géographie choisit');
  const boosted = run(briefOn('z-far', '2026-09-28', 50));
  assert.equal(boosted.ids, 'anchor+z-far', 'brief : à palier et rotation identiques, le brief gagne avant la distance');
  assert.equal(boosted.report.insertions, 1, 'brief : une seule insertion');
  // Au-delà de la limite de 160 candidats, le magasin poussé n'est pas coupé par le tri par identifiant.
  const anchor = { id: 'anchor', x: 100 }, crowd = Array.from({ length: 170 }, (_, i) => ({ id: 'c' + String(i).padStart(3, '0'), x: 101 })), late = { id: 'zz-brief', x: -100 };
  const weeks = [
    { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [anchor] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-05', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  runBriefCase(weeks, [anchor].concat(crowd, [late]), briefOn('zz-brief', '2026-09-28', 50), { included: { anchor: true }, needAt: () => ({ status: 'never', tier: 3.5, priority: '', blocked: false }) });
  assert.equal(idsIn(weeks[0], 'Lundi'), 'anchor+zz-brief', 'brief : un magasin poussé reste candidat au-delà de 160 candidats équivalents');
})();

if (!PRIORITY_CASE) (function briefProjectionSwapNeverLowersTheTotal() {
  // L'échange guidé par la projection de couverture (sans gain de route) suit la même garde.
  const run = briefAt => {
    const A = { id: 'A', x: 0 }, B = { id: 'B', x: 0 };
    const weeks = [
      { weekKey: '2026-09-28', plan: Object.assign(emptyPlan(), { Lundi: [B] }), manual: false, frozenDays: [] },
      { weekKey: '2026-10-05', plan: Object.assign(emptyPlan(), { Lundi: [A] }), manual: false, frozenDays: [] },
      { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] }
    ];
    const report = runBriefCase(weeks, [A, B], briefAt, {
      target: 1,
      projectedNeedAt: (store, visitDate) => store.id === 'A' && visitDate >= '2026-10-05' ? { status: 'soon', tier: 2, priority: '', blocked: false } : { status: 'ok', tier: 1, priority: '', blocked: false }
    });
    return { report, w2: idsIn(weeks[1], 'Lundi') };
  };
  const control = run(null);
  assert.equal(control.w2, 'B', 'sans brief, la projection avance A en W40');
  assert.equal(control.report.swaps, 1);
  const kept = run(briefOn('A', '2026-10-05', 50));
  assert.equal(kept.w2, 'A', 'brief : la projection ne fait pas perdre le +50 de A en W41');
  assert.equal(kept.report.swaps, 0);
})();

console.log('=== V264 benchmark allocation cross-day ===');
console.table(results.map(result => {
  const baseline = result.fixture.config.baseline;
  const current = result.metrics;
  return {
    fixture: result.fixture.config.id,
    stores: current.stores,
    covered: current.coveredStores + '/' + baseline.coveredStores,
    urgent: current.urgentCovered + '/' + baseline.urgentCovered,
    never: current.neverCovered + '/' + baseline.neverCovered,
    km: current.kilometers + '/' + baseline.kilometers,
    minutes: current.driveMinutes + '/' + baseline.driveMinutes,
    load: current.minDayCredits + '-' + current.maxDayCredits,
    violations: current.violations,
    cpuMs: current.cpuMs,
    evaluations: current.crossDay ? current.crossDay.evaluations + '+' + current.crossDay.needEvaluations : 'legacy',
    search: current.crossDay ? [current.crossDay.insertions, current.crossDay.moves, current.crossDay.swaps, current.crossDay.replacements].join('/') : 'legacy',
    forecast: result.forecast ? [result.forecast.current.late, result.forecast.current.never, result.forecast.current.overdueDays].join('/') + ' ≤ ' + [result.forecast.baseline.late, result.forecast.baseline.never, result.forecast.baseline.overdueDays].join('/') : '',
    signature: current.signature
  };
}));
console.log('cross-day-planning-v264: OK');
