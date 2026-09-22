// V241 — Benchmark et qualité du moteur planning.
//
// Instrumentation pure : ce fichier ne modifie et ne remplace aucune fonction de
// production. Il charge les moteurs existants (terrain-planning-v1.js en require()
// direct, range-planner-v2.js et route-polish.js via un contexte vm, exactement comme
// tests/planning-range-rotation.test.cjs et tests/planning-route-quality-v210.test.cjs
// le font déjà) et les fait tourner sur une fixture synthétique de 58 magasins,
// représentative du secteur de référence réel.
//
// Portée volontairement limitée à V241 :
//   - aucun changement d'algorithme de sélection, de rotation ou de géographie ;
//   - le réétalement géographique V185 (rebalancePlanByGeography) n'est PAS appliqué
//     ici : les deux moteurs sont mesurés sur leur sortie native (sélection +
//     affectation jour + ordre nearestRoute/twoOpt intra-jour), pour isoler
//     précisément ce qui est comparé — sélection et rotation — du polissage
//     géographique commun aux deux, qui reste un chantier V242 ;
//   - pas d'import de fichier performance (StoreRunnerPerformanceV190) : le boost
//     P1/P2 reste à 0 pour les deux moteurs, terrain neutre ;
//   - pas de modèle d'horaires magasin par enseigne (StoreOpeningHoursV1) : les deux
//     moteurs utilisent leur repli interne identique (km×1.22/55 + durée de visite),
//     déjà couvert séparément par tests/opening-hours-schedule.test.cjs.
//
// Les résultats chiffrés de cette exécution sont documentés dans le rapport d'audit
// (section V241) et n'engagent aucune assertion sur des valeurs exactes de distance ou
// de temps CPU, qui varieraient avec l'environnement — seules des propriétés
// structurelles (couverture, absence de crash, cohérence des métriques) sont figées.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const WORK_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const ALL_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const TARGET_PER_WEEK = 15;
const MAX_CREDITS_PER_DAY = 4;
const CYCLES_ESCARGOT = 3; // 3 cycles de 3 semaines = 9 semaines
const WEEKS_TOTAL = CYCLES_ESCARGOT * 3;
const START_MONDAY_ISO = '2026-09-07';
const SETTINGS = {
  startTime: '08:30', endTime: '18:00',
  saturdayStart: '08:00', saturdayEnd: '12:00',
  visitMinutes: 45
};
const LOCKS = { s5: 'Mardi', s25: 'Jeudi', s45: 'Lundi' }; // contraintes fortes récurrentes, testées sur les deux moteurs

// ---------------------------------------------------------------- dates utilitaires --
function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseISO(v) { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
function monday(d) { const x = new Date(d), w = x.getDay() || 7; x.setDate(x.getDate() - w + 1); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// -------------------------------------------------------- géographie (fidèle au coeur) --
function hav(a, b) {
  const R = 6371, dla = (b.lat - a.lat) * Math.PI / 180, dlo = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function bearingDeg(a, b) {
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180, dlo = (b.lon - a.lon) * Math.PI / 180;
  const y = Math.sin(dlo) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function octant(deg) { return Math.floor(((deg + 22.5) % 360) / 45); }
function zoneChangesForRoute(base, route) {
  if (!route || route.length < 2) return 0;
  let prev = octant(bearingDeg(base, route[0])), changes = 0;
  for (let i = 1; i < route.length; i++) {
    const oct = octant(bearingDeg(base, route[i]));
    if (oct !== prev) changes++;
    prev = oct;
  }
  return changes;
}
// routeCost/nearestRoute/twoOpt : copie fidèle de src/chef-secteur.html (y compris le
// défaut connu — pas de retour à la base dans le coût interne, cf. section 3 de l'audit).
// Volontairement non corrigé ici : V241 mesure l'existant, ne le change pas.
function routeCost(route, start, base) {
  if (!route || !route.length) return 0;
  let p = start || base, km = 0;
  for (const s of route) { km += hav(p, s); p = s; }
  return km;
}
function nearestRoute(list, start, base) {
  const rem = list.slice(), out = []; let p = start || base;
  while (rem.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rem.length; i++) { const d = hav(p, rem[i]); if (d < bd) { bd = d; bi = i; } }
    p = rem[bi]; out.push(p); rem.splice(bi, 1);
  }
  return out;
}
function twoOpt(route, base) {
  let r = route.slice(), improved = true, loops = 0;
  while (improved && loops < 12) {
    improved = false; loops++;
    for (let i = 0; i < r.length - 2; i++) for (let j = i + 2; j < r.length; j++) {
      const before = routeCost(r, null, base);
      const cand = r.slice(); const rev = cand.slice(i, j + 1).reverse();
      cand.splice(i, j - i + 1, ...rev);
      const after = routeCost(cand, null, base);
      if (after + 0.05 < before) { r = cand; improved = true; }
    }
  }
  return r;
}
function orderDay(route, base) { return route.length < 2 ? route.slice() : twoOpt(nearestRoute(route, base, base), base); }
function roundTripKm(base, route) {
  if (!route || !route.length) return 0;
  let km = hav(base, route[0]);
  for (let i = 1; i < route.length; i++) km += hav(route[i - 1], route[i]);
  km += hav(route[route.length - 1], base);
  return km;
}
function routeMinutes(base, route) {
  if (!route || !route.length) return 0;
  // Aller-retour complet : c'est la formule réellement utilisée par le repli dayFits de
  // terrain-planning-v1.js (routeMinutes) ET par finish() dans range-planner-v2.js. La
  // fermeture interne de twoOpt, elle, ne compte pas ce retour (cf. audit section 3) —
  // mais ce n'est pas la fonction qui décide de la faisabilité horaire d'un jour.
  const km = roundTripKm(base, route);
  const visits = route.reduce((n, s) => n + Math.max(15, Number(s.visitMinutes) || SETTINGS.visitMinutes), 0);
  return km * 1.22 / 55 * 60 + visits;
}
function clockMin(v) { const p = String(v || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
function dayFitsFn(base) {
  return function (route, day) {
    const start = clockMin(day === 'Samedi' ? SETTINGS.saturdayStart : SETTINGS.startTime);
    const end = clockMin(day === 'Samedi' ? SETTINGS.saturdayEnd : SETTINGS.endTime);
    return start + routeMinutes(base, route) <= end + 0.001;
  };
}

// ---------------------------------------------------- fixture synthétique, 58 magasins --
function buildFixture() {
  const base = { lat: 45.75, lon: 4.85 };
  const lobes = [
    { bearingDeg: 15, count: 20 },
    { bearingDeg: 140, count: 20 },
    { bearingDeg: 250, count: 18 }
  ];
  // Répartition des enseignes : 2/5 à 2 crédits (Darty, Boulanger — visite 1h30-2h,
  // cf. visit-counting.js DEFAULT_RULES), 3/5 à 1 crédit (Fnac, Carrefour — Carrefour est
  // forcé à 1 crédit depuis V189, contrairement au défaut générique de la marque).
  const enseignes = ['Fnac', 'Carrefour', 'Darty', 'Fnac', 'Boulanger'];
  const CREDIT_BY_BRAND = { Darty: 2, Boulanger: 2, Carrefour: 1, Fnac: 1 };
  const stores = [];
  let id = 1;
  for (const lobe of lobes) {
    for (let k = 0; k < lobe.count; k++) {
      const frac = k / Math.max(1, lobe.count - 1);
      const distanceKm = 4 + frac * 66;
      const jitter = ((id * 37) % 25) - 12;
      const rad = (lobe.bearingDeg + jitter) * Math.PI / 180;
      const dLat = (distanceKm / 111) * Math.cos(rad);
      const dLon = (distanceKm / (111 * Math.cos(base.lat * Math.PI / 180))) * Math.sin(rad);
      const enseigne = enseignes[id % enseignes.length];
      stores.push({
        id: 's' + id, enseigne, ville: 'Ville ' + id, adresse: id + ' rue Test', dept: '69',
        lat: base.lat + dLat, lon: base.lon + dLon,
        priority: 1 + (id % 5),
        intervalDays: [7, 15, 30, 30, 30, 90][id % 6],
        visitMinutes: SETTINGS.visitMinutes,
        credit: CREDIT_BY_BRAND[enseigne] || 1,
        active: true
      });
      id++;
    }
  }
  return { base, stores };
}
assert.equal(buildFixture().stores.length, 58, 'la fixture doit rester à 58 magasins, taille du secteur de référence réel');

// ------------------------------------------------------------------------ moteur ESCARGOT --
const terrain = require(path.join(ROOT, 'terrain-planning-v1.js'));

function runEscargot(fixture) {
  const weeks = [];
  let firstMonday = parseISO(START_MONDAY_ISO);
  let cpuMs = 0, unplacedTotal = 0, forcedFailures = 0;
  for (let c = 0; c < CYCLES_ESCARGOT; c++) {
    const t0 = process.hrtime.bigint();
    let built;
    try {
      built = terrain.buildThreeWeekSnail({
        state: { manualWeekEdits: {} },
        firstMonday,
        days: WORK_DAYS,
        target: TARGET_PER_WEEK,
        maxCreditsPerDay: MAX_CREDITS_PER_DAY,
        stores: fixture.stores,
        archive: {},
        distanceOf: s => hav(fixture.base, s),
        priorityOf: () => 0,
        creditOf: s => s.credit,
        lockDayForWeek: id => LOCKS[id] || '',
        appointmentDay: () => '',
        dayBlocked: () => false,
        dayFits: dayFitsFn(fixture.base)
      });
    } catch (e) {
      forcedFailures++;
      firstMonday = addDays(firstMonday, 21);
      continue;
    }
    // Le chrono couvre buildThreeWeekSnail ET l'ordonnancement intra-jour (orderDay),
    // pour être comparable à V211 dont buildWeekUnique fait les deux dans le même appel.
    for (const week of built.weeks) {
      const plan = {};
      for (const day of ALL_DAYS) plan[day] = orderDay(week.plan[day] || [], fixture.base);
      unplacedTotal += (week.unplaced || []).length;
      weeks.push({ weekKey: week.weekKey, plan });
    }
    const t1 = process.hrtime.bigint();
    cpuMs += Number(t1 - t0) / 1e6;
    firstMonday = addDays(firstMonday, 21);
  }
  return { engine: 'ESCARGOT (terrain-planning-v1.js)', weeks, cpuMs, unplacedTotal, forcedFailures };
}

// --------------------------------------------------------------------------- moteur V211 --
function runV211(fixture) {
  const source = fs.readFileSync(path.join(ROOT, 'range-planner-v2.js'), 'utf8')
    .replace(
      'window.generatePlanningRange=generateRange;',
      'window.__v241Internals={chooseStores,buildWeekUnique,rotationMemoryV211,visitCredit,routeCredits,storeKey};window.generatePlanningRange=generateRange;'
    );
  const stores = fixture.stores.map(s => Object.assign({}, s));
  const els = {
    weekDate: { value: START_MONDAY_ISO }, rangeStart: { value: START_MONDAY_ISO },
    rangeEnd: { value: START_MONDAY_ISO }, endTime: { value: SETTINGS.endTime },
    maxVisitsPerDay: { value: String(MAX_CREDITS_PER_DAY) },
    generateRangeBtn: { disabled: false }, rangePlanStatus: { style: {} }, statusText: { textContent: '' }
  };
  const state = {
    settings: {
      days: WORK_DAYS.slice(), target: TARGET_PER_WEEK, weekDate: START_MONDAY_ISO,
      startTime: SETTINGS.startTime, endTime: SETTINGS.endTime,
      saturdayStart: SETTINGS.saturdayStart, saturdayEnd: SETTINGS.saturdayEnd,
      visitMinutes: SETTINGS.visitMinutes, maxVisitsPerDay: MAX_CREDITS_PER_DAY
    },
    profile: {}, stores, plan: { Lundi: [] },
    included: {}, excluded: {}, locks: Object.assign({}, LOCKS), appointments: [], calendarEvents: []
  };
  const proposals = [];
  const ctx = {
    state, console, Date, Map, Set, JSON, Object, Array, String, Number, Math, RegExp,
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      readyState: 'loading', hidden: false, head: { appendChild() {} }, body: { appendChild() {} },
      addEventListener() {}, removeEventListener() {},
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, dataset: {}, appendChild() {}, addEventListener() {}, insertAdjacentElement() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] }),
      getElementById: id => els[id] || null,
      querySelector: () => null,
      querySelectorAll: selector => selector === '[data-brand]' ? [] : WORK_DAYS.map(value => ({ value, checked: true }))
    },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setTimeout, clearTimeout,
    confirm: () => true, readPlanningControls() {}, save() {}, renderAll() {}, initControls() {}, includedByFilters: () => true,
    havBase: s => hav(fixture.base, s), hav, baseObj: () => fixture.base,
    nearestRoute: r => nearestRoute(r, fixture.base, fixture.base), twoOpt: r => twoOpt(r, fixture.base),
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => fn(),
    ChefReliability: { checkpoint() {}, propose: async candidate => { proposals.push(candidate); return false; } },
    syncGoogleCalendar: async () => ({ ok: true }),
    calendarEventsForDate: () => [],
    storeVisitCredit: s => s.credit || 1
  };
  ctx.window = ctx;
  const tLoad0 = process.hrtime.bigint();
  vm.runInNewContext(source, ctx, { filename: 'range-planner-v2.js' });
  const tLoad1 = process.hrtime.bigint();
  const vmLoadMs = Number(tLoad1 - tLoad0) / 1e6;
  const internals = ctx.__v241Internals;

  const pool = stores;
  const weeks = [];
  let first = monday(parseISO(START_MONDAY_ISO));
  const memory = internals.rotationMemoryV211(pool, iso(first), TARGET_PER_WEEK);
  const usedKeys = memory.usedKeys, useCount = memory.useCount, lastUsedWeek = memory.lastUsedWeek;
  const capacityCredits = MAX_CREDITS_PER_DAY * WORK_DAYS.length;
  let unplacedTotal = 0;
  const t0 = process.hrtime.bigint();
  for (let weekIndex = 0; weekIndex < WEEKS_TOTAL; weekIndex++) {
    const weekKey = iso(first);
    const chosen = internals.chooseStores(pool, usedKeys, useCount, lastUsedWeek, TARGET_PER_WEEK, capacityCredits, weekKey, weekIndex);
    const built = internals.buildWeekUnique(chosen, WORK_DAYS, weekKey);
    unplacedTotal += built.unplaced.length;
    const seen = new Set();
    for (const day of WORK_DAYS) for (const s of (built.plan[day] || [])) { const k = internals.storeKey(s); if (!seen.has(k)) { seen.add(k); usedKeys.add(k); useCount.set(k, (useCount.get(k) || 0) + 1); lastUsedWeek.set(k, weekIndex); } }
    const plan = {};
    for (const day of ALL_DAYS) plan[day] = built.plan[day] || [];
    weeks.push({ weekKey, plan });
    first = addDays(first, 7);
  }
  const t1 = process.hrtime.bigint();
  return { engine: 'V211 (range-planner-v2.js, generateRange)', weeks, cpuMs: Number(t1 - t0) / 1e6, vmLoadMs, unplacedTotal, forcedFailures: 0 };
}

// ----------------------------------------------------------------------- mesure V210 ------
function makeV210Context(fixture) {
  const source = fs.readFileSync(path.join(ROOT, 'route-polish.js'), 'utf8');
  const document = {
    readyState: 'loading', hidden: false, addEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { style: {}, addEventListener() {}, setAttribute() {} }; }, head: { appendChild() {} }
  };
  const context = {
    console, document, MutationObserver: function () { this.observe = function () {}; },
    setTimeout() { return 0; }, clearTimeout() {}, fetch: async () => { throw new Error('réseau désactivé dans le benchmark'); },
    addEventListener() {}, open() {},
    // V210 (routeKmV185/roundTripRouteKm) lit window.hav et window.baseObj : sans eux,
    // finiteDistance()/basePoint() retombent silencieusement sur Infinity/null et toute
    // mesure de distance devient Infinity — c'est le bug qui a produit 0 km au premier essai.
    hav, baseObj: () => fixture.base,
    state: { profile: { baseName: 'Base', baseLat: fixture.base.lat, baseLon: fixture.base.lon }, settings: { days: WORK_DAYS.slice(), startTime: SETTINGS.startTime, endTime: SETTINGS.endTime, saturdayStart: SETTINGS.saturdayStart, saturdayEnd: SETTINGS.saturdayEnd, visitMinutes: SETTINGS.visitMinutes }, stores: [], visits: {}, plan: {} }
  };
  context.window = context;
  context.localStorage = { getItem() { return null; }, setItem() {} };
  vm.runInNewContext(source, context, { filename: 'route-polish.js' });
  return context;
}

function measureEngine(result, fixture, v210) {
  v210.state.stores = fixture.stores;
  v210.state.visits = {};
  const api = v210.StoreRunnerPlanningQualityV210;
  let totalKm = 0, driveMinutes = 0, workMinutes = 0, infeasibleDays = 0, zoneChanges = 0;
  const dayCredits = [], weekCredits = [];
  const seenOverall = new Map();
  for (const week of result.weeks) {
    const m = api.measure(week.plan, { days: WORK_DAYS, today: week.weekKey });
    if (Number.isFinite(m.totalKm)) totalKm += m.totalKm;
    if (Number.isFinite(m.driveMinutes)) driveMinutes += m.driveMinutes;
    if (Number.isFinite(m.workMinutes)) workMinutes += m.workMinutes;
    infeasibleDays += m.infeasibleDayCount || 0;
    let weekCredit = 0;
    for (const day of WORK_DAYS) {
      const route = week.plan[day] || [];
      zoneChanges += zoneChangesForRoute(fixture.base, route);
      const credit = route.reduce((n, s) => n + (Number(s.credit) || 1), 0);
      dayCredits.push(credit); weekCredit += credit;
      for (const s of route) seenOverall.set(s.id, (seenOverall.get(s.id) || 0) + 1);
    }
    weekCredits.push(weekCredit);
  }
  const allCounts = fixture.stores.map(s => seenOverall.get(s.id) || 0);
  const uniqueCoverage = allCounts.filter(n => n > 0).length;
  return {
    engine: result.engine,
    cpuMs: Math.round(result.cpuMs * 10) / 10,
    vmLoadMs: Number.isFinite(result.vmLoadMs) ? Math.round(result.vmLoadMs * 10) / 10 : null,
    weeksRun: result.weeks.length,
    totalPlacements: allCounts.reduce((a, b) => a + b, 0),
    uniqueCoverage,
    coverageRatio: Math.round(uniqueCoverage / fixture.stores.length * 1000) / 10,
    repeats: allCounts.reduce((a, b) => a + b, 0) - uniqueCoverage,
    neverVisited: allCounts.filter(n => n === 0).length,
    rotationSpread: Math.max(...allCounts) - Math.min(...allCounts),
    totalKm: Math.round(totalKm),
    driveMinutes: Math.round(driveMinutes),
    workMinutes: Math.round(workMinutes),
    infeasibleDays,
    unplacedTotal: result.unplacedTotal,
    forcedFailures: result.forcedFailures,
    zoneChanges,
    avgDayCredits: Math.round(dayCredits.reduce((a, b) => a + b, 0) / dayCredits.length * 10) / 10,
    maxDayCredits: Math.max(...dayCredits),
    avgWeekCredits: Math.round(weekCredits.reduce((a, b) => a + b, 0) / weekCredits.length * 10) / 10
  };
}

function checkLocksHonoured(result) {
  // Une pose récurrente doit apparaître sur le bon jour à chaque semaine où le magasin
  // est planifié, et jamais sur un autre jour.
  const violations = [];
  for (const [id, day] of Object.entries(LOCKS)) {
    for (const week of result.weeks) {
      for (const d of ALL_DAYS) {
        const present = (week.plan[d] || []).some(s => s.id === id);
        if (present && d !== day) violations.push(result.engine + ' : ' + id + ' placé ' + d + ' au lieu de ' + day + ' (' + week.weekKey + ')');
      }
    }
  }
  return violations;
}

// ------------------------------------------------------------------------------- exécution --
const fixture = buildFixture();
const v210 = makeV210Context(fixture);

const escargotRaw = runEscargot(fixture);
const v211Raw = runV211(fixture);

const escargot = measureEngine(escargotRaw, fixture, v210);
const v211 = measureEngine(v211Raw, fixture, v210);

const lockViolationsEscargot = checkLocksHonoured(escargotRaw);
const lockViolationsV211 = checkLocksHonoured(v211Raw);

console.log('');
console.log('=== V241 — benchmark ESCARGOT vs V211 · fixture 58 magasins · ' + WEEKS_TOTAL + ' semaines ===');
console.table([escargot, v211].map(r => ({
  moteur: r.engine.split(' ')[0],
  'CPU algo (ms)': r.cpuMs,
  'CPU chargement vm (ms)': r.vmLoadMs == null ? 'n/a (require direct)' : r.vmLoadMs,
  semaines: r.weeksRun,
  'couverture unique': r.uniqueCoverage + '/' + fixture.stores.length,
  'couverture %': r.coverageRatio,
  'jamais visités': r.neverVisited,
  répétitions: r.repeats,
  'écart rotation (max-min)': r.rotationSpread,
  'km théoriques': r.totalKm,
  'min conduite': r.driveMinutes,
  'min travail': r.workMinutes,
  'jours infaisables': r.infeasibleDays,
  'non placés': r.unplacedTotal,
  'changements de zone': r.zoneChanges,
  'crédits/jour (moy.)': r.avgDayCredits,
  'crédits/jour (max)': r.maxDayCredits,
  'crédits/semaine (moy.)': r.avgWeekCredits
})));
if (lockViolationsEscargot.length) console.log('Verrous non respectés (ESCARGOT) :', lockViolationsEscargot);
if (lockViolationsV211.length) console.log('Verrous non respectés (V211) :', lockViolationsV211);
console.log('');

// ------------------------------------------------------------------------------- assertions --
// Propriétés structurelles uniquement : ce lot n'assert aucune valeur exacte de distance,
// de temps CPU ou de comptes précis, qui dépendent de l'environnement d'exécution.

assert.equal(escargotRaw.forcedFailures, 0, 'ESCARGOT ne doit pas échouer sur la fixture de référence');
assert.ok(escargot.weeksRun === WEEKS_TOTAL, 'ESCARGOT doit produire ' + WEEKS_TOTAL + ' semaines');
assert.ok(v211.weeksRun === WEEKS_TOTAL, 'V211 doit produire ' + WEEKS_TOTAL + ' semaines');
assert.ok(Number.isFinite(escargot.totalKm) && escargot.totalKm > 0, 'ESCARGOT doit produire un kilométrage mesurable');
assert.ok(Number.isFinite(v211.totalKm) && v211.totalKm > 0, 'V211 doit produire un kilométrage mesurable');
assert.equal(lockViolationsEscargot.length, 0, 'ESCARGOT doit respecter les verrous récurrents');
assert.equal(lockViolationsV211.length, 0, 'V211 doit respecter les verrous récurrents');

// Garde-fou central de cet audit (section 6) : sur ' + WEEKS_TOTAL + ' semaines avec une
// cible × 3 semaines < taille du secteur, V211 (mémoire de rotation) doit couvrir
// strictement plus de magasins distincts qu'ESCARGOT (balayage radial sans mémoire
// inter-cycles). Cette assertion documente l'écart mesuré ; elle est censée changer de
// sens le jour où V243 branche la rotation dans le moteur principal — pas avant.
assert.ok(
  v211.uniqueCoverage > escargot.uniqueCoverage,
  'attendu : V211 (mémoire de rotation) couvre plus de magasins distincts qu’ESCARGOT sur ' + WEEKS_TOTAL + ' semaines — v211=' + v211.uniqueCoverage + ' escargot=' + escargot.uniqueCoverage
);

console.log('planning-engine-benchmark-v241: OK —', JSON.stringify({ escargot, v211 }));
