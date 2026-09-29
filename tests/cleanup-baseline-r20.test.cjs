/* Baseline de ménage r20.
   Ce test ne redéfinit aucune règle métier : il photographie les sorties des
   propriétaires r20 et relie les protections spécialisées déjà exécutées par CI. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Reliability = require('../reliability-core.js');

const ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'fixtures', 'cleanup-baseline-r20.json');
const PLANNING_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'cross-day-planning-v264.json');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'reliability-checks.yml');
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const planningFixture = JSON.parse(fs.readFileSync(PLANNING_FIXTURE_PATH, 'utf8'));
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function read(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function planSignature(plan) {
  return fnv1a(Object.keys(plan).sort().map(weekKey => weekKey + '|' + DAYS.map(day => day + ':' + (plan[weekKey][day] || []).join(',')).join('|')).join('\n'));
}
/* 1. La photographie reste r20 ; les surfaces servies suivent ensemble la révision
      courante afin que la même baseline protège les lots de suppression suivants. */
const currentBuildRev = JSON.parse(read('version.json')).latestBuild;
assert.equal(baseline.reference.buildRev, '20260929-r20-runtime-stabilization-264');
assert.match(read('index.html'), new RegExp("const BUILD_REV='" + currentBuildRev + "'"));
assert.match(read('sw.js'), new RegExp('const BUILD_REV = "' + currentBuildRev + '"'));
assert.equal(baseline.reference.mainSha, 'b4a8137628098279532565b7da5be9d4c612cf1a');

/* 2. Trois semaines : le fichier machine contient la sortie complète et cohérente.
      Le test cross-day la rejoue pour chaque permutation, via les quatre commandes CI. */
assert.ok(baseline.planning.storeOrders.length >= baseline.planning.minimumReplays);
for (const [scenarioId, expected] of Object.entries(baseline.planning.scenarios)) {
  const config = planningFixture.scenarios.find(row => row.id === scenarioId);
  assert.ok(config, scenarioId + ' absent de la fixture Planning');
  assert.equal(config.storeCount, expected.storeCount);
  assert.equal(!!config.withoutHistory, expected.history === 'none', scenarioId + ' : contrat historique modifié');
  if (expected.history === 'none') assert.deepEqual(config.pastVisits, [], scenarioId + ' : la fixture sans historique contient une visite');
  assert.equal(planSignature(expected.plan), expected.metrics.signature, scenarioId + ' : signature machine divergente');
  assert.deepEqual(Object.keys(expected.plan).sort(), expected.archive.weekKeys, scenarioId + ' : semaines d’archive divergentes');

  let visits = 0;
  for (const [weekKey, weekPlan] of Object.entries(expected.plan)) {
    for (const day of DAYS) {
      const route = weekPlan[day] || [];
      visits += route.length;
      assert.equal(new Set(route).size, route.length, scenarioId + ' : doublon dans ' + weekKey + '/' + day);
      if (!expected.saturday && day === 'Samedi') assert.deepEqual(route, [], scenarioId + ' : samedi désactivé non vide');
    }
  }
  assert.equal(visits, expected.metrics.visits, scenarioId + ' : total de visites différent du plan figé');
  if (expected.saturday) assert.ok(Object.values(expected.plan).some(plan => plan.Samedi.length), scenarioId + ' : samedi activé non exercé');
  for (const order of baseline.planning.storeOrders) {
    const suffix = order === 'natural' ? '' : ' --store-order=' + order;
    assert.ok(workflow.includes('node tests/cross-day-planning-v264.test.cjs' + suffix), 'replay Planning absent de Reliability : ' + order);
  }
}

/* 3. Fixture combinée : les contraintes sont présentes simultanément et leur
      identité avant/après est vérifiée par le test Planning propriétaire. */
const combined = planningFixture.scenarios.find(row => row.id === baseline.hardConstraints.combinedFixture);
const companion = planningFixture.scenarios.find(row => row.id === baseline.hardConstraints.companionFixture);
assert.ok(combined && companion);
assert.deepEqual(combined.appointments[0], { id: 'appt-80', storeId: 's9', date: '2026-10-13', time: '11:30', duration: 60 });
assert.deepEqual(combined.locks[0], { storeId: 's8', week: '2026-10-12', day: 'Mercredi' });
assert.ok(combined.included.includes(baseline.hardConstraints.expected.imposedStore));
assert.equal(combined.manualWeek.week, baseline.hardConstraints.expected.manualWeek);
assert.deepEqual(combined.blockedDates.map(row => row.date), baseline.hardConstraints.expected.blockedDates);
assert.deepEqual(combined.pastVisits.map(row => row.date), baseline.hardConstraints.expected.completedDates);
assert.ok(combined.excluded.includes(baseline.hardConstraints.expected.excludedStore));
assert.ok(combined.inactive.includes(baseline.hardConstraints.expected.inactiveStore));
assert.deepEqual(
  { fromDate: combined.hotelReservations[0].fromDate, toDate: combined.hotelReservations[0].toDate },
  baseline.hardConstraints.expected.overnight
);
const multiday = combined.calendarEvents.find(row => row.id === 'leave-80');
assert.deepEqual({ start: multiday.start, end: multiday.end, allDay: multiday.allDay }, { start: '2026-10-15', end: '2026-10-17', allDay: true });
assert.ok(combined.calendarEvents.some(row => /férié/i.test(row.title)), 'interaction jour férié absente');
assert.equal(baseline.planning.scenarios[combined.id].metrics.violations, 0);
assert.equal(baseline.planning.scenarios[companion.id].metrics.violations, 0);
assert.match(read('tests/cross-day-planning-v264.test.cjs'), /function assertHardConstraintIdentity\(result\)/);

/* 4. Les propriétaires spécialisés et leurs cas non décoratifs restent dans la même
      Reliability. Le présent fichier les référence sans recopier leur logique. */
function referencedTests(value, out = new Set()) {
  if (typeof value === 'string' && value.startsWith('tests/')) out.add(value);
  else if (Array.isArray(value)) value.forEach(item => referencedTests(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => referencedTests(item, out));
  return out;
}
for (const testPath of referencedTests(baseline)) {
  assert.ok(fs.existsSync(path.join(ROOT, testPath)), 'protection référencée introuvable : ' + testPath);
  assert.ok(workflow.includes(testPath), 'protection absente de Reliability : ' + testPath);
}
assert.ok(workflow.includes('node tests/cleanup-baseline-r20.test.cjs'), 'la baseline r20 doit être exécutée par Reliability');

const v251 = read(baseline.v251.test);
assert.match(v251, /volontairement mauvaise[\s\S]*explainOptimization\(\[A,C,B\]/);
assert.match(v251, /\['A','B','C'\]/);
assert.match(v251, /ne change jamais l'affectation entre jours/);
assert.match(v251, /new Set\(planned\.plan\.Lundi/);

const coverage = read('tests/three-week-forecast-v263-6.test.cjs');
assert.match(coverage, /très en retard > jamais > retard \(P1 seulement en tie-break\) > bientôt > à jour/);
assert.match(coverage, /\['urgent','never','late-p1','late','soon','ok'\]/);
assert.match(coverage, /Vingt exécutions donnent exactement la même sortie/);

const saveProfile = read(baseline.saveProfile.test);
assert.match(saveProfile, /saveProfile garde une seule couche V184\/V182 après 30 événements/);
for (const eventName of Object.keys(baseline.saveProfile.events)) assert.ok(saveProfile.includes(eventName), 'événement saveProfile absent : ' + eventName);
assert.match(saveProfile, /afterEvents.*toEqual\(initial\)/s);
assert.match(saveProfile, /overnightRenders.*toBe\(1\)/s);
assert.match(saveProfile, /planAfter\)\.toBe\(saved\.planBefore\)/);

const agenda = read(baseline.agenda.test);
assert.ok(agenda.includes("allDay('leave', 'Congés', '2026-10-05', '2026-10-10')"));
for (const date of baseline.agenda.blockedDates) assert.ok(agenda.includes("'" + date + "'"), 'date Agenda non figée : ' + date);
assert.match(agenda, /borne de fin exclusive Agenda/);
assert.match(agenda, /permutation des événements/);
assert.match(agenda, /semaine entamée/);

const overnight = read('tests/mandatory-overnight-v263-4.test.cjs');
for (const mode of baseline.overnight.modes) assert.ok(overnight.includes("'" + mode + "'"), 'mode découché non figé : ' + mode);
assert.match(overnight, /la réservation porte le lendemain/);

/* 5. Sauvegarde, archive, plage, restauration et retour applicatif : trois cycles
      sans modification du plan, de l’ordre, ni des jours travaillés. */
class MemoryDB {
  constructor() { this.rows = new Map(); this.atomic = true; }
  getItem(key) { return this.rows.has(key) ? this.rows.get(key) : null; }
  setItem(key, value) { this.rows.set(String(key), String(value)); }
  removeItem(key) { this.rows.delete(String(key)); }
}
function persistenceBundle(expected) {
  const stores = Array.from({ length: expected.storeCount }, (_, index) => ({
    id: 's' + (index + 1), enseigne: 'Fixture', ville: 'Ville ' + (index + 1), active: true
  }));
  const byId = new Map(stores.map(store => [store.id, store]));
  const inflate = plan => Object.fromEntries(DAYS.map(day => [day, (plan[day] || []).map(id => copy(byId.get(id)))]));
  const archive = Object.fromEntries(expected.archive.weekKeys.map(weekKey => [weekKey, {
    weekMonday: weekKey,
    plan: inflate(expected.plan[weekKey]),
    manualEdited: expected.archive.manualWeeks.includes(weekKey)
  }]));
  const state = {
    schemaVersion: 5,
    profile: { baseName: 'Lyon', baseLat: 45.75, baseLon: 4.85, overnightMode: 'auto', overnightMinSaving: 80 },
    settings: { weekDate: expected.range.start, days: expected.range.workDays.slice(), target: expected.metrics.visits, maxVisitsPerDay: expected.maxCreditsPerDay },
    stores,
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {},
    plan: inflate(expected.plan[expected.range.start])
  };
  const range = {
    start: expected.range.start,
    end: expected.range.end,
    workDays: expected.range.workDays.slice(),
    weekKeys: expected.archive.weekKeys.slice(),
    planningSignature: expected.metrics.signature
  };
  return { format: 'ChefSecteurBackup', version: 1, createdAt: '2026-09-29T12:00:00.000Z', state, archive, range, catalog: [] };
}

const persistenceExpected = baseline.planning.scenarios[baseline.hardConstraints.combinedFixture];
const originalBundle = persistenceBundle(persistenceExpected);
const stable = value => {
  const out = copy(value);
  delete out.createdAt;
  delete out.integrity;
  return out;
};
const originalStable = stable(originalBundle);
let database = new MemoryDB();
Reliability.persist(originalBundle, database);
let state = Reliability.load(database);
const firstFingerprint = Reliability.seal(Reliability.capture(state, database)).integrity;

try {
  for (let cycle = 0; cycle < baseline.persistence.roundTrips; cycle++) {
    global.state = state;
    const captured = Reliability.capture(state, database);
    assert.deepEqual(stable(captured), originalStable, 'cycle ' + cycle + ' : capture state/archive/range mutée');
    state = Reliability.restore(captured, database);
    assert.deepEqual(state.plan, originalBundle.state.plan, 'cycle ' + cycle + ' : plan muté à la restauration');
    assert.deepEqual(state.settings.days, persistenceExpected.range.workDays, 'cycle ' + cycle + ' : workdays mutés');
    const loaded = Reliability.load(database);
    assert.deepEqual(loaded, state, 'cycle ' + cycle + ' : retour applicatif divergent');
    const sealed = Reliability.seal(Reliability.capture(loaded, database));
    assert.deepEqual(sealed.integrity, firstFingerprint, 'cycle ' + cycle + ' : empreinte persistée divergente');
    state = loaded;
  }
} finally {
  delete global.state;
}

console.log('cleanup-baseline-r20: OK — signatures ' + Object.values(baseline.planning.scenarios).map(row => row.metrics.signature).join(', ') + ' · 4 ordres · 3 restaurations');
