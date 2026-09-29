const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const calendarSource = fs.readFileSync(path.join(ROOT, 'calendar-oauth.js'), 'utf8');
const terrainSource = fs.readFileSync(path.join(ROOT, 'terrain-planning-v1.js'), 'utf8');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function storage() {
  const rows = new Map();
  return {
    getItem(key) { return rows.has(key) ? rows.get(key) : null; },
    setItem(key, value) { rows.set(key, String(value)); },
    removeItem(key) { rows.delete(key); }
  };
}

function runtime() {
  const document = {
    readyState: 'loading', hidden: false, head: { appendChild() {} },
    addEventListener() {}, dispatchEvent() {},
    getElementById() { return null; }, querySelector() { return null; },
    createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }
  };
  const ctx = {
    console, document, localStorage: storage(), sessionStorage: storage(),
    Date, JSON, Math, Map, Set, Promise,
    setTimeout() { return 0; }, clearTimeout() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    addEventListener() {}, dispatchEvent() {}
  };
  ctx.window = ctx;
  vm.runInNewContext(calendarSource, ctx, { filename: 'calendar-oauth.js' });
  vm.runInNewContext(terrainSource, ctx, { filename: 'terrain-planning-v1.js' });
  assert.equal(typeof ctx.chefSecteurEventCoversDate, 'function', 'Agenda doit rester propriétaire des bornes de dates');
  assert.equal(typeof ctx.StoreRunnerTerrainPlanningV1.dateBlocked, 'function');
  return ctx;
}

function addDays(iso, count) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + count);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function blockedDates(ctx, events, start, count) {
  const state = { calendarEvents: events };
  return Array.from({ length: count }, (_, index) => addDays(start, index))
    .filter(date => ctx.StoreRunnerTerrainPlanningV1.dateBlocked(date, state));
}

function allDay(id, title, start, end) {
  return { id, title, start, date: start, end, allDay: true, calendar: 'Google Agenda' };
}

const ctx = runtime();

(function mondayToFridayUsesTheAgendaOwnerBounds() {
  const leave = allDay('leave', 'Congés', '2026-10-05', '2026-10-10');
  assert.deepEqual(
    blockedDates(ctx, [leave], '2026-10-04', 8),
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
    'un congé all-day lundi → vendredi (fin exclusive samedi) doit bloquer exactement cinq jours'
  );
})();

(function oneDayAllDayEventStaysOnOneDay() {
  const leave = allDay('one-day', 'Indisponibilité', '2026-10-07', '2026-10-08');
  assert.deepEqual(
    blockedDates(ctx, [leave], '2026-10-06', 3),
    ['2026-10-07'],
    'la borne de fin exclusive Agenda ne doit pas transformer un événement d’une journée en deux jours'
  );
})();

(function overlapsFormASetAndOrderDoesNotMatter() {
  const first = allDay('first', 'Congés', '2026-10-05', '2026-10-08');
  const second = allDay('second', 'Absence', '2026-10-07', '2026-10-10');
  const expected = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  const forward = blockedDates(ctx, [first, second], '2026-10-05', 5);
  const reverse = blockedDates(ctx, [second, first], '2026-10-05', 5);
  assert.deepEqual(forward, expected, 'deux indisponibilités qui se chevauchent doivent produire cinq dates distinctes');
  assert.equal(new Set(forward).size, forward.length, 'aucun jour bloqué ne doit être dupliqué');
  assert.deepEqual(reverse, forward, 'la permutation des événements ne doit pas changer le résultat');
})();

(function outsideHorizonHasNoImpactAndExistingRulesStayStable() {
  const outside = allDay('outside', 'Vacances', '2026-11-02', '2026-11-07');
  assert.deepEqual(blockedDates(ctx, [outside], '2026-10-05', 5), [], 'un événement hors horizon ne doit bloquer aucun jour');
  assert.equal(ctx.StoreRunnerTerrainPlanningV1.dateBlocked('2026-10-08', { calendarEvents: [allDay('holiday', 'Jour férié', '2026-10-08', '2026-10-09')] }), true, 'la règle jour férié reste active');
  assert.equal(ctx.StoreRunnerTerrainPlanningV1.dateBlocked('2026-10-08', { calendarEvents: [{ id: 'meeting', title: 'Rendez-vous Darty', start: '2026-10-08T10:00:00', end: '2026-10-08T11:00:00', allDay: false }] }), false, 'un rendez-vous ordinaire ne devient pas une indisponibilité');
  assert.equal(ctx.StoreRunnerTerrainPlanningV1.dateBlocked('2026-10-08', { calendarEvents: [allDay('birthday', 'Anniversaire équipe', '2026-10-08', '2026-10-09')] }), false, 'un all-day sans règle de blocage ne change pas de sens');
})();

(function startedWeekKeepsPastDaysAndBlocksEveryRemainingLeaveDay() {
  const leave = allDay('started-week', 'Congés', '2026-10-05', '2026-10-10');
  const state = { calendarEvents: [leave], manualWeekEdits: {}, included: {} };
  const stores = Array.from({ length: 20 }, (_, index) => ({ id: 's' + index, enseigne: 'Test', ville: 'Ville ' + index, active: true, distance: index + 1 }));
  const oldMonday = { id: 'old-mon', enseigne: 'Test', ville: 'Lundi' };
  const oldTuesday = { id: 'old-tue', enseigne: 'Test', ville: 'Mardi' };
  const existing = Object.fromEntries(DAYS.map(day => [day, []]));
  existing.Lundi = [oldMonday]; existing.Mardi = [oldTuesday];
  const built = ctx.StoreRunnerTerrainPlanningV1.buildThreeWeekSnail({
    state, firstMonday: new Date(2026, 9, 5, 12), today: '2026-10-07',
    days: DAYS.slice(0, 5), target: 10, maxCreditsPerDay: 4,
    stores, archive: {}, existingPlanFor: week => week === '2026-10-05' ? existing : null,
    completedOn: () => false, distanceOf: store => store.distance, priorityOf: () => 0, creditOf: () => 1,
    lockDayForWeek: () => '', appointmentDay: () => '',
    dayBlocked: date => ctx.StoreRunnerTerrainPlanningV1.dateBlocked(date, state),
    dayFits: () => true, crossDayEnabled: false
  });
  const first = built.weeks[0];
  assert.deepEqual(Array.from(first.frozenDays), ['Lundi', 'Mardi'], 'les jours passés de la semaine entamée restent figés');
  assert.deepEqual(Array.from(first.plan.Lundi, store => store.id), ['old-mon']);
  assert.deepEqual(Array.from(first.plan.Mardi, store => store.id), ['old-tue']);
  for (const day of ['Mercredi', 'Jeudi', 'Vendredi']) {
    assert.equal(first.plan[day].length, 0, day + ' couvert par le congé doit rester vide');
    assert.equal(first.diagnostics.find(row => row.day === day).status, 'blocked', day + ' doit être diagnostiqué bloqué');
  }
})();

console.log('agenda-multiday-v264: OK — congé lundi→vendredi = 5 jours, bornes Agenda et semaine entamée protégées');
