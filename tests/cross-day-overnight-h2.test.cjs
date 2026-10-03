/* H2 — preuve rouge r34, puis contrat overnight appliqué au voisinage V264.
   Trois visites utiles et de besoin strictement identique, chacune à 100 km de la base :
   A = lundi est / mardi ouest / jeudi est ; B = lundi est / mardi est / jeudi ouest.
   A et B font exactement les mêmes kilomètres/minutes bruts (600 km / 360 min), la même
   charge et le même délai individuel de service (0). V251 ordonne chaque journée. V189 refuse A
   (saving 0 sous le seuil 80), retient B (saving 200, remote 100). r34 refuse l'échange
   mardi ↔ jeudi parce que raw km, raw minutes et charge sont égaux : l'assertion H2 rouge
   attend B. Aucun hôtel hypothétique n'entre dans les endpoints des métriques brutes.
   La géométrie plane injectée en kilomètres utilise lat/lon, préservés par DayOrigin.
   CROSS_DAY_ENGINE_PATH permet de rejouer cette preuve contre un snapshot du moteur.
   H2.1 : projection +1/-1, délai +1/-1 et brief -10/+10 sont tous rouges sur
   b2b9882 (échange accepté à raw identique et saving 0 → 200), puis verts lorsque
   chaque magasin doit rester individuellement équivalent. Rejeu : --case suivi des
   trois fonctions *CompensationIsNotEquivalent. Le stress 60 visites compare aussi
   le vrai HEAD de revue via H2_REVIEW_BASELINE_PATH : même planning/diagnostic métier,
   4509 → 3152 analyses V189 ; les temps sont informatifs, les compteurs bornés. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const WEEK = '2026-10-05';
const TODAY = '2026-10-03';
const clone = value => JSON.parse(JSON.stringify(value));
const emptyPlan = () => Object.fromEntries(DAYS.map(day => [day, []]));
const plan = rows => Object.assign(emptyPlan(), rows);
const BASE = { id: 'BASE', lat: 45, lon: 5 };
const distance = (a, b) => Math.hypot((Number(a.lat) - Number(b.lat)) * 1000, (Number(a.lon) - Number(b.lon)) * 1000);
const at = (id, x, y = 0) => ({ id, enseigne: 'Fnac', ville: id, adresse: '1 rue Fixture', lat: BASE.lat + x / 1000, lon: BASE.lon + y / 1000, intervalDays: 30, visitMinutes: 15, active: true });
const close = (actual, expected, label) => assert(Math.abs(actual - expected) < 0.00001, label + ' : ' + actual + ' ≈ ' + expected);
function dateFor(week, day) { const date = new Date(week + 'T12:00:00'); date.setDate(date.getDate() + DAYS.indexOf(day)); return date.toISOString().slice(0, 10); }
function signature(weeks) { return weeks.map(week => week.weekKey + '|' + DAYS.map(day => day + ':' + (week.plan[day] || []).map(store => store.id).join(',')).join('|')).join('\n'); }

function load(options = {}) {
  const clock = { now: Date.parse((options.today || TODAY) + 'T09:00:00') };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  const state = {
    profile: { baseLat: BASE.lat, baseLon: BASE.lon, overnightMode: options.mode || 'auto', overnightMinSaving: options.threshold === undefined ? 80 : options.threshold },
    settings: { weekDate: WEEK, days: options.days || ['Lundi', 'Mardi', 'Jeudi'], target: 3, maxVisitsPerDay: 1, startTime: '08:00', endTime: '23:00', visitMinutes: 15 },
    stores: [], visits: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], hotelReservations: {}
  };
  const memory = new Map();
  const document = { readyState: 'loading', head: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { style: {}, dataset: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }; } };
  const ctx = {
    console, Date: FixedDate, Map, Set, state, document, setTimeout() { return 0; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) },
    baseObj: () => BASE, hav: distance, havBase: store => distance(BASE, store), storeVisitCredit: () => 1, storeVisitDuration: store => store.visitMinutes || 15,
    StoreRunnerRoadMatrixV248: { distanceKm: distance, durationMinutes: (a, b) => distance(a, b) * 0.6 }
  };
  ctx.window = ctx;
  const files = ['visit-coverage.js', 'planning-day-origin.js', 'store-opening-hours.js', 'weekly-brief-v246.js', 'terrain-planning-v1.js', 'v182-fixes.js', 'auto-planning-fix.js', 'planning-route-optimizer-v251.js'];
  for (const file of files) {
    const enginePath = options.enginePath || process.env.CROSS_DAY_ENGINE_PATH;
    const absolute = file === 'terrain-planning-v1.js' && enginePath ? path.resolve(enginePath) : path.join(ROOT, file);
    vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), ctx, { filename: file });
  }
  ctx.StoreRunnerStoreControlsV189.repair();
  assert.equal(ctx.StoreRunnerOvernightV182.analyze, ctx.StoreRunnerStoreControlsV189.futureOvernightAnalysis, 'V189 reste propriétaire');
  if (options.fallback) delete ctx.StoreRunnerOvernightV182;
  if (options.fastHours) {
    // Benchmark de la recherche : horaires synthétiques uniformes, V251 réel garde tout l'ordre.
    // Les tests métier précédents gardent StoreOpeningHoursV1 réel et ses endpoints DayOrigin.
    ctx.StoreOpeningHoursV1 = { scheduleRoute(route) {
      let previous = BASE, estimatedEnd = 8 * 60;
      const rows = route.map(store => { const travel = distance(previous, store) * 0.6; previous = store; estimatedEnd += travel + 15; return { store, travel, duration: 15, wait: 0 }; });
      const returnTravel = route.length ? distance(previous, BASE) * 0.6 : 0;
      return { rows, start: 8 * 60, endLimit: 23 * 60, estimatedEnd: estimatedEnd + returnTravel, returnTravel, closedCount: 0, appointmentConflicts: 0 };
    } };
  }
  return { ctx, state, terrain: ctx.StoreRunnerTerrainPlanningV1, today(day) { clock.now = Date.parse(day + 'T09:00:00'); } };
}

function fixture(options = {}) {
  const env = load(options), radius = options.radius === undefined ? 100 : options.radius;
  const a = at('a-east', radius), b = at('b-west', -radius), c = at('c-east', radius);
  // Chaque date du cas positif précède la prochaine échéance : délai individuel nul.
  // La compensation de délai ci-dessous garde volontairement la fréquence de 30 jours.
  if (!options.serviceCompensation) for (const store of [a, b, c]) store.intervalDays = 365;
  env.state.stores = [a, b, c];
  for (const store of env.state.stores) env.state.visits[store.id] = { lastVisit: '2026-04-01', history: ['2026-04-01'] };
  const weeks = [
    { weekKey: WEEK, plan: plan({ Lundi: [a], Mardi: [b], Jeudi: [c] }), manual: false, frozenDays: [] },
    { weekKey: '2026-10-12', plan: emptyPlan(), manual: true, frozenDays: [] },
    { weekKey: '2026-10-19', plan: emptyPlan(), manual: true, frozenDays: [] }
  ];
  const desired = clone(weeks);
  desired[0].plan.Mardi = [clone(c)]; desired[0].plan.Jeudi = [clone(b)];
  const needOf = env.ctx.StoreRunnerVisitCoverage.needOf(env.state, { today: TODAY });
  const needAt = (store, date) => needOf(store, date);
  const evaluate = (route, day, week) => env.terrain.evaluateDayRouteV264(route, day, week, env.state);
  const settings = {
    state: env.state, days: env.state.settings.days, target: 3, maxCreditsPerDay: 1, ranked: env.state.stores,
    today: options.today || TODAY, needAt, evaluateDayRoute: evaluate, dayFits: () => true, dayBlocked: () => false,
    creditOf: () => 1, lockDayForWeek: () => '', appointmentDay: () => '', overnightReservations: env.state.hotelReservations,
    businessBaselineWeeks: clone(weeks), memory: { usedKeys: new Set(), useCount: new Map() }, distanceBetween: distance, basePoint: BASE
  };
  return { ...env, weeks, desired, settings, evaluate, a, b, c };
}

function metrics(f, weeks) {
  let kilometers = 0, driveMinutes = 0;
  for (const week of weeks) for (const day of DAYS) { const row = f.evaluate(week.plan[day], day, week.weekKey); assert(row.feasible, 'V251 : route faisable'); kilometers += row.kilometers; driveMinutes += row.driveMinutes; }
  return { kilometers, driveMinutes };
}
function analyze(f, weeks = f.weeks) { return f.terrain.analyzeOvernightWeeks(weeks)[0]; }
function optimize(f) { return f.terrain.optimizeThreeWeekCrossDay(f.weeks, f.settings); }

function autoValidRedOnR34() {
  const f = fixture(), before = metrics(f, f.weeks), alternative = metrics(f, f.desired);
  close(before.kilometers, 600, 'raw initial km'); close(before.driveMinutes, 360, 'raw initial minutes');
  close(alternative.kilometers, before.kilometers, 'raw alternatif km identique'); close(alternative.driveMinutes, before.driveMinutes, 'raw alternatif minutes identiques');
  const need = f.settings.needAt;
  for (const date of ['2026-10-05', '2026-10-06', '2026-10-08']) assert.equal(need(f.b, date).tier, need(f.c, date).tier, 'même besoin réel aux deux créneaux');
  assert.equal(analyze(f).selected, false, 'A : aucun découché admissible');
  const better = analyze(f, f.desired); assert.equal(better.selected, true, 'B : découché V189 admissible');
  close(better.best.saving, 200, 'saving alternatif V189'); close(better.best.remoteKm, 100, 'remote alternatif V189');
  const stateBefore = JSON.stringify(f.state), report = optimize(f);
  assert.equal(signature(f.weeks), signature(f.desired), 'H2 choisit mardi est / jeudi ouest à raw km/min et métier égaux (rouge sur r34)');
  assert.equal(JSON.stringify(f.state), stateBefore, 'optimisation/analyse H2 ne mutent pas state ni hotelReservations');
  close(report.after.kilometers, report.before.kilometers, 'raw km conservés'); close(report.after.driveMinutes, report.before.driveMinutes, 'raw minutes conservées');
  close(analyze(f).best.saving, 200, 'saving final');
  assert.equal(report.overnight.influenced, true, 'diagnostics : H2 a influencé le choix');
  close(report.overnight.before.savingKm, 0, 'diagnostics saving avant'); close(report.overnight.after.savingKm, 200, 'diagnostics saving après');
  close(report.overnight.before.effectiveKm, 600, 'diagnostics coût net avant'); close(report.overnight.after.effectiveKm, 400, 'diagnostics coût net après');
  assert.equal(report.overnight.reason, 'overnight-preference'); assert.equal(report.overnight.pairs.length, 1);
  assert.equal(report.overnight.pairs[0].weekKey, WEEK); assert.equal(report.overnight.pairs[0].fromDay, 'Lundi'); assert.equal(report.overnight.pairs[0].toDay, 'Mardi');
  assert.equal(report.overnight.pairs[0].fromDate, '2026-10-05'); assert.equal(report.overnight.pairs[0].toDate, '2026-10-06');
  assert(report.overnight.decisions.length > 0, 'diagnostics décision retenue');
  console.log('H2 rouge r34 → vert : 600 km / 360 min inchangés ; saving 0 → 200 km ; coût net 600 → 400 km ; mardi ↔ jeudi.');
}

function staysUnchanged(options, configure, label) {
  const f = fixture(options);
  if (configure) configure(f);
  const before = signature(f.weeks), state = JSON.stringify(f.state), report = optimize(f);
  assert.equal(signature(f.weeks), before, label);
  assert.equal(JSON.stringify(f.state), state, label + ' : state / réservations conservés');
  return { f, report };
}

function autoTooClose() { staysUnchanged({ radius: 40 }, f => { assert.equal(analyze(f, f.desired).analysisReason, 'too-close'); }, 'AUTO remote < 55 : aucun bonus'); }
function autoBelowProfileThreshold() { staysUnchanged({ threshold: 250 }, f => { assert.equal(analyze(f, f.desired).analysisReason, 'threshold'); }, 'AUTO sous seuil profil : aucun bonus'); }
function autoExplicitZero() {
  const f = fixture({ radius: 60, threshold: 0 });
  Object.assign(f.c, at(f.c.id, -30, Math.sqrt(2700)), { intervalDays: 365 });
  f.desired[0].plan.Mardi = [clone(f.c)];
  f.settings.businessBaselineWeeks = clone(f.weeks);
  const candidate = analyze(f, f.desired);
  assert.equal(candidate.threshold, 0, 'seuil explicite 0 reste 0'); assert(candidate.selected && candidate.best.saving > 0 && candidate.best.saving < 80, 'gain autorisé seulement par le seuil explicite 0');
  const before = signature(f.weeks), report = optimize(f), chosen = analyze(f);
  assert.notEqual(signature(f.weeks), before, 'AUTO 0 : meilleure allocation retenue');
  assert(chosen.selected && chosen.best.saving > 0 && chosen.best.saving < 80, 'AUTO 0 : gain positif sous 80 retenu');
  close(report.after.kilometers, report.before.kilometers, 'AUTO 0 raw km conservés'); close(report.after.driveMinutes, report.before.driveMinutes, 'AUTO 0 raw minutes conservées');
}
function mandatoryCloseUseful() { const f = fixture({ mode: 'mandatory', radius: 40 }); const candidate = analyze(f, f.desired); assert(candidate.selected && candidate.best.remoteKm < 55 && candidate.best.saving >= 20); optimize(f); assert.equal(signature(f.weeks), signature(f.desired), 'MANDATORY : gain utile à moins de 55 km autorisé'); }
function mandatoryUnder20() { staysUnchanged({ mode: 'mandatory', radius: 9 }, f => assert.equal(analyze(f, f.desired).analysisReason, 'mandatory-no-useful'), 'MANDATORY saving < 20 : aucun bonus'); }
function neverIsV264() {
  const { f: normal, report } = staysUnchanged({ mode: 'never' }, null, 'NEVER : résultat initial V264 identique');
  assert.equal(analyze(normal).analysisReason, 'disabled');
  assert.equal(report.overnight.enabled, false); assert.equal(report.overnight.influenced, false); assert.equal(report.overnight.reason, 'disabled'); assert.equal(report.overnight.evaluations, 0);
  // Un snapshot r34 peut être fourni pour comparaison bit-à-bit, sans dépendance Git au test CI.
  if (process.env.H2_V264_BASELINE_PATH) {
    const original = fixture({ mode: 'never', enginePath: process.env.H2_V264_BASELINE_PATH });
    const oldReport = optimize(original);
    assert.equal(signature(normal.weeks), signature(original.weeks), 'NEVER planning bit-à-bit identique au vrai r34');
    assert.equal(JSON.stringify(report.before), JSON.stringify(oldReport.before)); assert.equal(JSON.stringify(report.after), JSON.stringify(oldReport.after));
  }
}
function nonConsecutiveDays() {
  staysUnchanged({ days: ['Mardi', 'Jeudi', 'Samedi'] }, f => {
    f.weeks[0].plan = plan({ Mardi: [f.a], Jeudi: [f.b], Samedi: [f.c] });
    f.settings.businessBaselineWeeks = clone(f.weeks);
    assert.equal(analyze(f).analysisReason, 'no-future-pair', 'mercredi off : mardi→jeudi ne devient jamais une nuit');
  }, 'Aucune paire réellement consécutive : aucun bonus de zone');
}
function pastNightIgnored() {
  staysUnchanged({ today: '2026-09-30' }, f => {
    f.weeks[0].weekKey = '2026-09-28'; f.weeks[0].frozenDays = ['Lundi', 'Mardi'];
    f.state.settings.weekDate = '2026-09-28'; f.settings.businessBaselineWeeks = clone(f.weeks);
    const past = clone(f.desired); past[0].weekKey = '2026-09-28';
    assert.equal(analyze(f, past).selected, false, 'nuit lundi→mardi passée ignorée');
  }, 'Semaine entamée : jours passés conservés');
}
function appointmentFixed() {
  const { report } = staysUnchanged({}, f => {
    f.state.appointments = [{ id: 'rdv-b', storeId: f.b.id, date: '2026-10-06', time: '10:00', duration: 15 }];
    f.settings.appointmentDay = (id, mon) => f.state.appointments.some(row => row.storeId === id && row.date === dateFor(mon.toISOString().slice(0, 10), 'Mardi')) ? 'Mardi' : '';
  }, 'RDV : b reste fixé mardi malgré le gain overnight');
  assert.equal(report.refused.appointments, 1);
}
function confirmedDeadlineFixed() {
  const { report } = staysUnchanged({}, f => { f.settings.deadlineFixed = new Map([[f.b.id + '|2026-10-06', { confirmed: true }]]); }, 'Deadline V246 confirmée : b reste exactement mardi');
  assert.equal(report.refused.deadlines, 1);
}
function confirmedV246DeadlineThroughFullBuild() {
  const f = fixture(), brief = f.ctx.StoreRunnerWeeklyBriefV246;
  brief.addRule(f.state, brief.isoWeek(WEEK), { id: 'deadline-b', type: 'deadline', label: 'Échéance confirmée', dueDate: '2026-10-06', scope: { storeIds: [f.b.id] }, confidence: 'confirmed', origin: 'manual' });
  const row = brief.effectivePriority(f.b, brief.isoWeek(WEEK), { state: f.state });
  assert.equal(row.deadline.dueDate, '2026-10-06'); assert.equal(row.deadline.doneDate, null, 'deadline réelle V246 non tenue avant génération');
  f.state.manualWeekEdits = { '2026-10-12': { plan: emptyPlan() }, '2026-10-19': { plan: emptyPlan() } };
  const stateBefore = JSON.stringify(f.state), needOf = f.ctx.StoreRunnerVisitCoverage.needOf(f.state, { today: TODAY });
  const built = f.terrain.buildThreeWeekSnail({ ...f.settings, firstMonday: new f.ctx.Date(WEEK + 'T12:00:00'), stores: f.state.stores, archive: {}, needOf, weeklyBrief: brief, distanceOf: store => distance(BASE, store), dayFits: (route, day, mon) => f.evaluate(route, day, mon.toISOString().slice(0, 10)).feasible });
  assert.equal(built.deadlines.length, 1); assert.equal(built.deadlines[0].storeId, f.b.id); assert.equal(built.deadlines[0].date, '2026-10-05', 'premier créneau compatible choisi par contrat V246');
  assert.equal(built.weeks[0].plan.Lundi[0].id, f.b.id, 'deadlineFixed propagé à H2 : b demeure lundi');
  assert.equal(built.crossDay.refused.deadlines, 1, 'deadline confirmée du vrai brief protégée dans le voisinage');
  assert.equal(JSON.stringify(f.state), stateBefore, 'construction et analyse du vrai brief lisent state');
}
function lockedAndImposed() {
  for (const kind of ['lock', 'imposed']) {
    const { report } = staysUnchanged({}, f => { if (kind === 'lock') f.settings.lockDayForWeek = id => id === f.b.id ? 'Mardi' : ''; else f.state.included[f.b.id] = true; }, kind + ' : b reste mardi');
    assert.equal(report.refused[kind === 'lock' ? 'locks' : 'imposed'], 1);
  }
}
function manualWeekFixed() { const { report } = staysUnchanged({}, f => { f.weeks[0].manual = true; }, 'Semaine manuelle : planning intégral conservé'); assert.equal(report.refused.manualWeeks, 3); }
function unavailableAndHolidayFixed() {
  for (const title of ['Indisponible', 'Jour férié']) staysUnchanged({}, f => {
    f.state.calendarEvents = [{ id: 'off', date: '2026-10-06', title, allDay: true }];
    f.settings.dayBlocked = date => f.terrain.dateBlocked(date, f.state);
  }, title + ' : journée mardi protégée');
}
function capacityNeverExceeded() {
  const f = fixture(), extra = at('d-too-costly', 100);
  f.state.stores.push(extra); f.state.visits[extra.id] = { lastVisit: '2026-04-01', history: ['2026-04-01'] };
  f.settings.target = 4; f.settings.creditOf = store => store.id === extra.id ? 2 : 1;
  const report = optimize(f);
  assert.equal(report.insertions, 0, 'visite 2 crédits refusée sous max 1');
  for (const week of f.weeks) for (const day of DAYS) assert(week.plan[day].reduce((sum, store) => sum + f.settings.creditOf(store), 0) <= 1, 'capacité quotidienne jamais dépassée');
  assert(!signature(f.weeks).includes(extra.id), 'magasin incompatible non injecté');
}
function existingReservationAndEndpoints() {
  for (const mode of ['auto', 'never']) {
    const { f, report } = staysUnchanged({ mode }, f => {
      const hotel = at('hotel-existing', 100);
      f.state.hotelReservations['2026-10-05'] = { fromDate: '2026-10-05', toDate: '2026-10-06', hotelName: 'Hôtel saisi', reference: 'USER-ONLY', lat: hotel.lat, lon: hotel.lon };
      close(f.evaluate([f.a], 'Lundi', WEEK).kilometers, 100, 'endpoint lundi : hôtel utilisateur');
      close(f.evaluate([f.b], 'Mardi', WEEK).kilometers, 300, 'endpoint mardi : départ hôtel utilisateur');
      const origin = f.ctx.StoreRunnerDayOrigin.baseFor('2026-10-06', f.state);
      assert.equal(origin.lat, hotel.lat); assert.equal(origin.lon, hotel.lon);
    }, mode + ' : réservation existante / dates protégées');
    assert.equal(report.refused.overnightDays, 2);
    close(f.evaluate([f.a], 'Lundi', WEEK).kilometers, 100, 'endpoint hôtel conservé après H2');
    close(f.evaluate([f.b], 'Mardi', WEEK).kilometers, 300, 'origine hôtel conservée après H2');
  }
}
function analysisAndStateReadOnly() {
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const row of Object.values(value)) freeze(row); } return value; };
  const f = fixture(), before = JSON.stringify(f.state), reservations = f.state.hotelReservations;
  freeze(f.state);
  const planBefore = signature(f.weeks); analyze(f); analyze(f, f.desired);
  assert.equal(signature(f.weeks), planBefore, 'analyse pure : planning non muté');
  optimize(f);
  assert.equal(JSON.stringify(f.state), before, 'state gelé et inchangé malgré amélioration H2');
  assert.equal(f.state.hotelReservations, reservations, 'même objet hotelReservations');
  assert.equal(Object.keys(reservations).length, 0, 'aucun hôtel créé');
}
function rawSafetyGuardsBothMetrics() {
  for (const metric of ['kilometers', 'driveMinutes']) for (const penalty of [1, 0.01]) {
    const { f, report } = staysUnchanged({ radius: 500 }, f => {
      const evaluator = f.settings.evaluateDayRoute;
      f.settings.evaluateDayRoute = (route, day, week) => {
        const row = evaluator(route, day, week);
        return day === 'Mardi' && route.some(store => store.id === f.c.id) ? { ...row, [metric]: row[metric] + penalty } : row;
      };
      assert(analyze(f, f.desired).best.saving > 999, 'très gros bénéfice overnight réel V189');
    }, metric + ' brut augmente de ' + penalty + ' : échange refusé malgré saving 1000 km');
    assert.equal(report.swaps, 0); close(report.after[metric], report.before[metric], metric + ' brut inchangé');
    assert.equal(analyze(f).selected, false);
  }
}

function noOvernightKeepsLegacyEpsilonChoice() {
  const configure = f => {
    const evaluator = f.settings.evaluateDayRoute;
    f.settings.evaluateDayRoute = (route, day, week) => {
      const row = evaluator(route, day, week);
      return day === 'Mardi' && route.some(store => store.id === f.c.id) ? { ...row, kilometers: row.kilometers - 1, driveMinutes: row.driveMinutes + 0.02 } : row;
    };
  };
  const f = fixture({ threshold: 1e9 }); configure(f); const report = optimize(f);
  const original = fixture({ mode: 'never', threshold: 1e9, enginePath: process.env.H2_V264_BASELINE_PATH }); configure(original); optimize(original);
  assert.equal(signature(f.weeks), signature(original.weeks), 'sans nuit admissible : tolérance historique V264 conservée');
  assert.equal(signature(f.weeks), signature(f.desired), 'gain raw km de 1, +.02 min toléré par V264 sans bonus H2');
  assert.equal(report.overnight.influenced, false); assert.equal(report.overnight.reason, 'no-admissible-overnight');
}

function briefImprovementBeatsOvernightEquivalent() {
  const configure = f => {
    f.settings.briefAt = (store, date) => store.id === f.a.id && date === '2026-10-06' ? 1 : 0;
    const evaluator = f.settings.evaluateDayRoute;
    f.settings.evaluateDayRoute = (route, day, week) => {
      const row = evaluator(route, day, week);
      const kilometers = route.length ? day === 'Mardi' && route[0].id === f.a.id ? 199 : day === 'Lundi' && route[0].id === f.c.id ? 201 : 200 : 0;
      return { ...row, kilometers, driveMinutes: kilometers * 0.6 };
    };
  };
  const f = fixture(); configure(f); const report = optimize(f);
  const original = fixture({ mode: 'never', enginePath: process.env.H2_V264_BASELINE_PATH }); configure(original); optimize(original);
  assert.equal(signature(f.weeks), signature(original.weeks), 'une amélioration brief V264 ne peut être sacrifiée pour un autre candidat overnight');
  assert.equal(f.weeks[0].plan.Mardi[0].id, f.a.id, 'brief 1 conservé à sa date');
  const quality = f.weeks.reduce((sum, week) => sum + DAYS.reduce((value, day) => value + week.plan[day].reduce((n, store) => n + f.settings.briefAt(store, dateFor(week.weekKey, day)), 0), 0), 0);
  assert(quality >= 1, 'qualité métier supérieure au candidat overnight brief 0');
  assert.equal(report.overnight.influenced, false);
}

function retainedOvernightIsObservable() {
  const configure = f => {
    f.weeks = clone(f.desired); f.settings.businessBaselineWeeks = clone(f.weeks);
    const evaluator = f.settings.evaluateDayRoute;
    f.settings.evaluateDayRoute = (route, day, week) => {
      const row = evaluator(route, day, week), kilometers = route.length ? day === 'Lundi' && route[0].id === f.b.id ? 199 : 200 : 0;
      return { ...row, kilometers, driveMinutes: kilometers * 0.6 };
    };
  };
  const f = fixture(); configure(f); const before = signature(f.weeks), report = optimize(f);
  const original = fixture({ mode: 'never', enginePath: process.env.H2_V264_BASELINE_PATH }); configure(original); optimize(original);
  assert.notEqual(signature(original.weeks), before, 'V264 aurait retenu raw -1 km en perdant la nuit');
  assert.equal(signature(f.weeks), before, 'H2 garde le meilleur coût net existant');
  assert.equal(report.overnight.influenced, true, 'conservation d’une nuit : choix H2 observable');
  const retained = report.overnight.decisions.find(row => row.kind === 'retained');
  assert(retained, 'diagnostic retained présent');
  assert(retained.alternative.effectiveKm > retained.before.effectiveKm, 'alternative rejetée : coût net dégradé');
}

function reservationNeverDiscountedTwice() {
  const f = fixture(); f.weeks = clone(f.desired); f.settings.businessBaselineWeeks = clone(f.weeks);
  const hotel = at('hotel', 100);
  f.state.hotelReservations['2026-10-05'] = { fromDate: '2026-10-05', toDate: '2026-10-06', hotelName: 'Hôtel saisi', lat: hotel.lat, lon: hotel.lon };
  assert.equal(analyze(f).selected, true, 'V189 : nuit admissible déjà réservée');
  const before = signature(f.weeks), state = JSON.stringify(f.state), report = optimize(f);
  assert.equal(signature(f.weeks), before); assert.equal(JSON.stringify(f.state), state);
  close(report.overnight.before.savingKm, 0, 'hôtel existant déjà dans les endpoints : aucun bonus supplémentaire');
  close(report.overnight.after.savingKm, 0, 'hôtel existant jamais soustrait deux fois');
  close(report.overnight.after.effectiveKm, report.after.kilometers, 'coût net = raw déjà adapté à l’hôtel');
}
function repeatedDeterminism() {
  const results = [];
  for (let pass = 0; pass < 8; pass++) { const f = fixture(); const report = optimize(f); results.push(JSON.stringify({ signature: signature(f.weeks), report })); }
  for (const result of results) assert.equal(result, results[0], 'mêmes données/état → planning et diagnostics bit-à-bit identiques');
}

function boundedPerformance80And150() {
  const results = [];
  for (const count of [80, 150]) {
    const f = fixture({ days: DAYS.slice(0, 5), fastHours: true });
    f.state.stores = Array.from({ length: count }, (_, index) => at('perf-' + String(index).padStart(3, '0'), index % 3 === 1 ? -100 : index % 3 === 2 ? 0 : 100, index % 3 === 2 ? 100 : 0));
    f.state.visits = Object.fromEntries(f.state.stores.map(store => [store.id, { lastVisit: '2026-04-01', history: ['2026-04-01'] }]));
    Object.assign(f.state.settings, { days: DAYS.slice(0, 5), target: 5, maxVisitsPerDay: 1 });
    let index = 0;
    for (const week of f.weeks) { week.manual = false; week.plan = emptyPlan(); for (const day of DAYS.slice(0, 5)) week.plan[day] = f.state.stores.slice(index, index += 1); }
    const needOf = f.ctx.StoreRunnerVisitCoverage.needOf(f.state, { today: TODAY });
    Object.assign(f.settings, { days: DAYS.slice(0, 5), target: 5, maxCreditsPerDay: 1, ranked: f.state.stores, needAt: (store, date) => needOf(store, date), businessBaselineWeeks: clone(f.weeks) });
    const stateBefore = JSON.stringify(f.state), start = performance.now(), report = optimize(f), cpuMs = performance.now() - start;
    assert(report.overnight.enabled && report.overnight.evaluations > 0, count + ' : H2 réellement évalué');
    assert(report.iterations <= report.bounds.maxPasses && report.bounds.maxPasses === 6 && report.bounds.candidateLimit === 160, count + ' : mêmes bornes V264');
    assert(report.evaluations <= 600 && report.overnight.evaluations <= 250, count + ' : évaluations bornées, temps seulement informatif');
    assert(report.after.kilometers <= report.before.kilometers + 0.0001 && report.after.driveMinutes <= report.before.driveMinutes + 0.0001, count + ' : géographie brute non dégradée');
    assert.equal(JSON.stringify(f.state), stateBefore, count + ' : state lecture seule');
    for (const week of f.weeks) for (const day of DAYS) assert(week.plan[day].length <= 1, count + ' : capacité');
    results.push({ stores: count, cpuMs: Math.round(cpuMs * 10) / 10, evaluations: report.evaluations, overnightEvaluations: report.overnight.evaluations, iterations: report.iterations, rawKmBefore: report.before.kilometers, rawKmAfter: report.after.kilometers });
  }
  console.log('H2 performance80/150 : ' + JSON.stringify(results));
}

function fallbackMatchesOwner() {
  const owner = fixture(), fallback = fixture({ fallback: true });
  optimize(owner); optimize(fallback);
  assert.equal(signature(fallback.weeks), signature(owner.weeks), 'repli H1 unique : même résultat H2 que propriétaire V189');
}

function individualCompensationFixture(kind) {
  const f = fixture({ serviceCompensation: kind === 'delay', days: ['Lundi', 'Mardi', 'Mercredi'] });
  f.weeks[0].plan = plan({ Lundi: [f.a], Mardi: [f.b], Mercredi: [f.c] });
  f.desired = clone(f.weeks); f.desired[0].plan.Mardi = [clone(f.c)]; f.desired[0].plan.Mercredi = [clone(f.b)];
  f.settings.lockDayForWeek = id => id === f.a.id ? 'Lundi' : '';
  // La référence métier autorise le compromis au niveau V264. C'est seulement le
  // bonus H2 qui doit le refuser : aucune amélioration brute ne motive l'échange.
  f.settings.businessBaselineWeeks = clone(f.desired);
  if (kind === 'projection') f.settings.projectedNeedAt = (store, date) => ({ tier: 2, status: 'soon', priority: (store.id === f.b.id && date === '2026-10-07' || store.id === f.c.id && date !== '2026-10-06') ? 'P1' : '' });
  if (kind === 'brief') f.settings.briefAt = (store, date) => store.id === f.b.id && date === '2026-10-06' || store.id === f.c.id && date === '2026-10-06' ? 10 : 0;
  const before = metrics(f, f.weeks), after = metrics(f, f.desired);
  close(before.kilometers, after.kilometers, kind + ' : mêmes km bruts');
  close(before.driveMinutes, after.driveMinutes, kind + ' : mêmes minutes brutes');
  assert.equal(analyze(f).selected, false); assert.equal(analyze(f, f.desired).selected, true, kind + ' : bonus overnight tentant');
  return f;
}
function projectionCompensationIsNotEquivalent() {
  const f = individualCompensationFixture('projection'), projection = f.settings.projectedNeedAt;
  const rank = (store, date) => 200 + (projection(store, date).priority === 'P1' ? 1 : 0);
  assert.equal(rank(f.b, '2026-10-07') - rank(f.b, '2026-10-06'), 1, 'A : projection +1');
  assert.equal(rank(f.c, '2026-10-06') - rank(f.c, '2026-10-07'), -1, 'B : projection -1');
  const initial = signature(f.weeks), report = optimize(f);
  assert.equal(signature(f.weeks), initial, 'H2.1 ROUGE : projection +1/-1 ne rend pas chaque magasin équivalent');
  assert.equal(report.overnight.influenced, false);
  assert.equal(report.overnight.candidates.businessEquivalent, 0, 'projection : aucun candidat équivalent H2');
}
function serviceDelayCompensationIsNotEquivalent() {
  const f = individualCompensationFixture('delay'), need = f.settings.needAt;
  const delay = (store, date) => Math.max(0, (Date.parse(date) - Date.parse(need(store, TODAY).nextDue)) / 86400000);
  assert.equal(delay(f.b, '2026-10-07') - delay(f.b, '2026-10-06'), 1, 'A : délai +1');
  assert.equal(delay(f.c, '2026-10-06') - delay(f.c, '2026-10-07'), -1, 'B : délai -1');
  const initial = signature(f.weeks), report = optimize(f);
  assert.equal(signature(f.weeks), initial, 'H2.1 ROUGE : délai +1/-1 ne rend pas chaque magasin équivalent');
  assert.equal(report.overnight.influenced, false);
  assert.equal(report.overnight.candidates.businessEquivalent, 0, 'délai : aucun candidat équivalent H2');
}
function briefCompensationIsNotEquivalent() {
  const f = individualCompensationFixture('brief'), brief = f.settings.briefAt;
  assert.equal(brief(f.b, '2026-10-07') - brief(f.b, '2026-10-06'), -10, 'A : brief -10');
  assert.equal(brief(f.c, '2026-10-06') - brief(f.c, '2026-10-07'), 10, 'B : brief +10');
  const initial = signature(f.weeks), report = optimize(f);
  assert.equal(signature(f.weeks), initial, 'H2.1 ROUGE : brief -10/+10 ne rend pas chaque magasin équivalent');
  assert.equal(report.overnight.influenced, false);
  assert.equal(report.overnight.candidates.businessEquivalent, 0, 'brief : aucun candidat équivalent H2');
}

function stressFixture60(options = {}) {
  const f = fixture({ days: DAYS.slice(0, 5), fastHours: true, ...options });
  // Même charge de 60 visites que le stress de revue : 80 magasins, 3 zones,
  // 3 semaines × 5 jours × 4 visites. La fréquence longue rend chaque changement
  // de date individuellement équivalent (délai 0), afin d'exercer réellement H2.1.
  f.state.stores = Array.from({ length: 80 }, (_, index) => ({ ...at('perf-' + String(index).padStart(3, '0'), index % 3 === 1 ? -100 : index % 3 === 2 ? 0 : 100, index % 3 === 2 ? 100 : 0), intervalDays: options.intervalDays || 365 }));
  f.state.visits = Object.fromEntries(f.state.stores.map(store => [store.id, { lastVisit: '2026-04-01', history: ['2026-04-01'] }]));
  Object.assign(f.state.settings, { days: DAYS.slice(0, 5), target: 20, maxVisitsPerDay: 4 });
  let index = 0;
  for (const week of f.weeks) { week.manual = false; week.plan = emptyPlan(); for (const day of DAYS.slice(0, 5)) week.plan[day] = f.state.stores.slice(index, index += 4); }
  const needOf = f.ctx.StoreRunnerVisitCoverage.needOf(f.state, { today: TODAY });
  Object.assign(f.settings, { days: DAYS.slice(0, 5), target: 20, maxCreditsPerDay: 4, ranked: f.state.stores, needAt: (store, date) => needOf(store, date), businessBaselineWeeks: clone(f.weeks) });
  return f;
}
function essentialReport(report) {
  const result = clone(report);
  // Seuls les compteurs de coût d'évaluation changent avec le cache H2.1.
  for (const key of ['evaluations', 'cache', 'candidates']) delete result.overnight[key];
  return result;
}
function realistic60VisitsAndDeterminism() {
  const results = [], timings = [];
  for (let pass = 0; pass < 2; pass++) {
    const f = stressFixture60(), stateBefore = JSON.stringify(f.state), start = performance.now(), report = optimize(f), cpuMs = performance.now() - start;
    assert.equal(JSON.stringify(f.state), stateBefore, '60 visites : state / hotelReservations jamais mutés');
    assert.equal(report.bounds.maxPasses, 6); assert.equal(report.bounds.candidateLimit, 160); assert.equal(report.iterations, 6);
    assert(report.evaluations <= 8000, '60 visites : voisinage V251 borné');
    assert(report.overnight.evaluations <= 3300, '60 visites : cache overnight <= 3300 analyses (4509 avant H2.1)');
    assert.equal(report.overnight.cache.misses, report.overnight.evaluations);
    assert(report.overnight.cache.currentHits > 0 && report.overnight.cache.hits > report.overnight.cache.misses, 'cache réellement réutilisé');
    const candidates = report.overnight.candidates;
    assert(candidates.businessEquivalent <= 20000 && candidates.businessEquivalent >= candidates.rawSafe && candidates.rawSafe > candidates.endpointsChanged, 'candidats inchangés aux endpoints non réanalysés');
    assert(report.overnight.influenced && report.overnight.pairs.length === 3, 'H2 actif à 60 visites');
    assert.equal(report.businessFinalDelay, report.businessBaselineDelay, 'délai métier conservé');
    assert(report.after.kilometers <= report.before.kilometers && report.after.driveMinutes <= report.before.driveMinutes, 'raw km/min strictement non dégradés');
    for (const week of f.weeks) {
      assert.equal(DAYS.reduce((sum, day) => sum + week.plan[day].length, 0), 20, '20 visites par semaine conservées');
      for (const day of DAYS) assert(week.plan[day].length <= 4, 'capacité de 4 crédits conservée');
      const owner = f.ctx.StoreRunnerOvernightV182.analyze(week.plan, week.weekKey), pair = report.overnight.pairs.find(row => row.weekKey === week.weekKey);
      assert.equal(pair.lastId, owner.candidate.last.id); assert.equal(pair.firstId, owner.candidate.first.id); close(pair.savingKm, owner.candidate.saving, 'décision cache = propriétaire V189 réel');
    }
    results.push(JSON.stringify({ signature: signature(f.weeks), report }));
    timings.push({ cpuMs: Math.round(cpuMs), evaluations: report.evaluations, overnightEvaluations: report.overnight.evaluations, cache: report.overnight.cache, candidates });
    // Oracle local optionnel : le vrai HEAD de revue, sans snapshot runtime en CI.
    if (pass === 0 && process.env.H2_REVIEW_BASELINE_PATH) {
      const baseline = stressFixture60({ enginePath: process.env.H2_REVIEW_BASELINE_PATH }), oldReport = optimize(baseline);
      assert.equal(signature(f.weeks), signature(baseline.weeks), '60 visites : planning H2 bit-à-bit identique au HEAD de revue');
      assert.deepEqual(essentialReport(report), essentialReport(oldReport), '60 visites : mêmes diagnostics métier et décisions overnight');
    }
  }
  assert.equal(results[1], results[0], '60 visites : planning ET diagnostics déterministes');
  console.log('H2.1 stress 60 visites / 80 magasins (temps informatif) : ' + JSON.stringify(timings));
}

const allTests = [autoValidRedOnR34, autoTooClose, autoBelowProfileThreshold, autoExplicitZero, mandatoryCloseUseful, mandatoryUnder20, neverIsV264, nonConsecutiveDays, pastNightIgnored, appointmentFixed, confirmedDeadlineFixed, confirmedV246DeadlineThroughFullBuild, lockedAndImposed, manualWeekFixed, unavailableAndHolidayFixed, capacityNeverExceeded, existingReservationAndEndpoints, analysisAndStateReadOnly, rawSafetyGuardsBothMetrics, noOvernightKeepsLegacyEpsilonChoice, briefImprovementBeatsOvernightEquivalent, retainedOvernightIsObservable, reservationNeverDiscountedTwice, repeatedDeterminism, boundedPerformance80And150, fallbackMatchesOwner, projectionCompensationIsNotEquivalent, serviceDelayCompensationIsNotEquivalent, briefCompensationIsNotEquivalent, realistic60VisitsAndDeterminism];
const filter = (process.argv.find(value => value.startsWith('--case=')) || '').slice(7).split(',');
const tests = filter[0] ? allTests.filter(test => filter.includes(test.name)) : allTests;
const failures = [];
for (const test of tests) { try { test(); } catch (error) { failures.push(test.name + ' — ' + error.stack); } }
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('cross-day-overnight-h2: ' + tests.length + '/' + tests.length + ' OK');
