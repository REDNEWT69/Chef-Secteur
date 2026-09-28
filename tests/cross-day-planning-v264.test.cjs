const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'cross-day-planning-v264.json');
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const terrain = require('../terrain-planning-v1.js');
const coverage = require('../visit-coverage.js');

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAY_MS = 86400000;
const STATUS_SEQUENCE = ['never', 'late', 'soon', 'ok', 'blocked', 'veryLate'];
const INTERVALS = [7, 15, 30, 90];
const BRANDS = ['Fnac', 'Carrefour', 'Darty', 'Boulanger', 'Auchan', 'But'];

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
    calendarEvents: config.blockedDates.map((row, index) => ({ id: 'block-' + index, date: row.date, title: row.title, allDay: true, inferredAway: true })),
    manualWeekEdits: {},
    hotelReservations: Object.fromEntries(config.hotelReservations.map(row => [row.fromDate, clone(row)]))
  };
  for (const store of stores) {
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
function isBlockedDate(fixture, date) { return fixture.config.blockedDates.some(row => row.date === date); }

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

function applyLegacyGeography(fixture, built, evaluateDay) {
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
    const result = api.rebalance(week.plan, { weekKey: week.weekKey, preferNearFirst: true, frozenDays: week.frozenDays });
    if (result.ok) week.plan = result.plan;
  }
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
    plan: planObject(built)
  };
}

function runScenario(config) {
  const fixture = buildScenario(config);
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
    overnightReservations: fixture.state.hotelReservations
  };
  const start = performance.now();
  const built = terrain.buildThreeWeekSnail(options);
  if (!(built.crossDay && built.crossDay.applied)) applyLegacyGeography(fixture, built, evaluateDay);
  canonicalizeRoutes(built, evaluateDay);
  const cpuMs = performance.now() - start;
  return { fixture, built, metrics: measure(fixture, built, evaluateDay, cpuMs) };
}

const results = FIXTURE.scenarios.map(runScenario);

if (process.argv.includes('--capture')) {
  console.log(JSON.stringify(Object.fromEntries(results.map(row => [row.fixture.config.id, row.metrics])), null, 2));
  process.exit(0);
}

for (const result of results) {
  const { config } = result.fixture;
  const baseline = config.baseline;
  assert.ok(baseline && baseline.signature, config.id + ' : baseline manquante');
  assert.equal(result.metrics.violations, 0, config.id + ' : aucune contrainte dure ne peut être violée\n' + result.metrics.violationDetails.join('\n'));
  assert.ok(result.metrics.coveredStores >= baseline.coveredStores, config.id + ' : couverture totale en régression');
  assert.ok(result.metrics.dueCovered >= baseline.dueCovered, config.id + ' : couverture des magasins dus en régression');
  assert.ok(result.metrics.urgentCovered >= baseline.urgentCovered, config.id + ' : couverture urgente en régression');
  assert.ok(result.metrics.neverCovered >= baseline.neverCovered, config.id + ' : couverture des jamais visités en régression');
  assert.ok(result.metrics.kilometers <= baseline.kilometers + 0.1, config.id + ' : kilomètres supérieurs à la baseline');
  assert.ok(result.metrics.driveMinutes <= baseline.driveMinutes + 0.1, config.id + ' : minutes supérieures à la baseline');
  assert.ok(result.metrics.cpuMs < 5000, config.id + ' : le moteur doit rester borné sous 5 s sur la machine de CI');
  const reruns = Array.from({ length: 3 }, () => runScenario(config).metrics.signature);
  assert.deepEqual(reruns, [result.metrics.signature, result.metrics.signature, result.metrics.signature], config.id + ' : même entrée, même planning');
}

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
    signature: current.signature
  };
}));
console.log('cross-day-planning-v264: OK');
