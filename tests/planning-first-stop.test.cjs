const assert = require('node:assert/strict');
const fs = require('node:fs');

const manual = require('../planning-manual-hours.js');
const hours = require('../store-opening-hours.js');
const mins = manual.minutes;
const DATE = '2026-09-14';

// Francheville -> Chambéry : le premier arrêt part de la base, pas d'une visite précédente.
const BASE_TRAVEL = 119, NEXT_TRAVEL = 30, DAY_START = '08:30', WANTED = '09:30';
const OPEN_WIDE = { Lundi: [{ open: '07:00', close: '20:00' }] };

function state(overrides = {}) {
  return Object.assign({
    schemaVersion: 5,
    profile: { sectorName: 'Test' },
    settings: { days: ['Lundi'], startTime: DAY_START, endTime: '19:00', visitMinutes: 90, weekDate: DATE },
    stores: [
      { id: 'chambery', enseigne: 'Boulanger', ville: 'Chambéry', openingHoursSource: 'manual', openingHours: OPEN_WIDE },
      { id: 'suivant', enseigne: 'Carrefour', ville: 'Annecy', openingHoursSource: 'manual', openingHours: OPEN_WIDE },
    ],
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {},
    plan: { Lundi: [{ id: 'chambery' }, { id: 'suivant' }] },
    appointments: [],
  }, overrides);
}

function schedule(appointments, options = {}) {
  const s = state(options.state);
  s.appointments = appointments;
  return hours.scheduleRoute(s.plan.Lundi, 'Lundi', s, {
    base: {}, date: DATE, blocks: options.blocks || [],
    travelMinutes: (from, to) => (to && String(to.id) === 'suivant' ? NEXT_TRAVEL : BASE_TRAVEL),
    appointmentFor: (storeId, date) => appointments.find(a => String(a.storeId) === String(storeId) && a.date === date) || null,
  });
}
const manualAt = (storeId, time) => manual.buildEntry({ storeId, date: DATE, time, endTime: null, duration: 90 });

// --- Cas 1 : premier magasin, départ anticipé depuis la base --------------------------
// 08:30 + 119 min = 10:29. Vouloir être à 09:30 ne rend pas l'horaire impossible : cela
// veut dire partir à 07:31. Partir avant le début habituel n'est pas un trajet infaisable.
const early = schedule([manualAt('chambery', WANTED)]);
const first = early.rows[0];
assert.equal(first.nominalArrival, mins('10:29'), 'le calcul « début de journée + trajet » reste exposé');
assert.notEqual(first.status, 'appointment-conflict',
  'partir avant le début de journée n’est pas une impossibilité de trajet');
assert.equal(early.appointmentConflicts, 0);
assert.equal(first.arrival, mins(WANTED), 'l’heure imposée est réellement tenue');
assert.equal(early.recommendedDeparture, mins('07:31'),
  'le départ conseillé remonte avant le début de journée : 09:30 - 119 min');
assert.equal(mins(WANTED) - BASE_TRAVEL, mins('07:31'), 'contrôle arithmétique de l’exemple');

// La tournée repart de l'heure imposée, pas de l'ancien 10:29.
assert.equal(early.rows[1].travel, NEXT_TRAVEL, 'le trajet suivant reste compté');
assert.equal(early.rows[1].arrival, mins('11:30'), '09:30 + 90 min de visite + 30 min de trajet');
assert.notEqual(early.rows[1].arrival, mins('10:29') + 90 + NEXT_TRAVEL, 'et surtout pas depuis 10:29');

// --- Cas 2 : premier magasin réellement impossible ------------------------------------
const closed = schedule([manualAt('chambery', WANTED)], {
  state: { stores: [
    { id: 'chambery', enseigne: 'Boulanger', ville: 'Chambéry', openingHoursSource: 'manual', openingHours: { Lundi: [{ open: '14:00', close: '19:00' }] } },
    { id: 'suivant', enseigne: 'Carrefour', ville: 'Annecy', openingHoursSource: 'manual', openingHours: OPEN_WIDE },
  ] },
});
assert.equal(closed.rows[0].status, 'appointment-conflict',
  'un magasin fermé à l’heure demandée reste un vrai conflit');
assert.equal(closed.appointmentConflicts, 1);

const blocked = schedule([manualAt('chambery', WANTED)], {
  blocks: [{ allDay: false, startMin: mins('09:00'), endMin: mins('11:00'), title: 'Réunion' }],
});
assert.equal(blocked.rows[0].status, 'appointment-conflict',
  'un blocage Agenda incompatible reste un vrai conflit');

// --- Cas 3 : deuxième magasin, la protection ne bouge pas -----------------------------
// Premier magasin terminé à 11:59 (10:29 + 90), trajet 30 min : 12:29 au plus tôt.
const second = schedule([manualAt('suivant', '12:15')]);
assert.equal(second.rows[1].status, 'appointment-conflict',
  'pour un magasin suivant, une arrivée avant visite + trajet reste impossible');
assert.equal(second.rows[1].nominalArrival, mins('12:29'));
assert.equal(second.rows[1].arrival, mins('12:29'),
  'et la tournée repart de l’heure atteignable, comme depuis #367');
assert.equal(second.rows[0].arrival, mins('10:29'), 'le premier magasin reste automatique');

// --- Cas 4 : vrais rendez-vous, comportement historique -------------------------------
const realFirst = schedule([{ id: 'rdv1', storeId: 'chambery', date: DATE, time: WANTED, duration: 90, type: 'Formation vendeur' }]);
assert.equal(realFirst.rows[0].status, 'appointment-conflict',
  'un vrai rendez-vous trop tôt reste signalé, exactement comme avant');
assert.equal(realFirst.rows[0].arrival, mins(WANTED), 'et garde l’heure convenue');
assert.equal(realFirst.recommendedDeparture, null,
  'aucun départ conseillé n’est proposé quand le premier arrêt est en conflit');

// Un planning sans contrainte garde son plancher au début de journée.
const auto = schedule([]);
assert.equal(auto.rows[0].arrival, mins('10:29'));
assert.equal(auto.recommendedDeparture, mins(DAY_START),
  'sans horaire manuel, le départ conseillé reste borné au début de journée');

// --- La condition modifiée est bien spécialisée, pas supprimée -----------------------
const ENGINE = fs.readFileSync(__dirname + '/../store-opening-hours.js', 'utf8');
assert(ENGINE.includes('const canLeaveBaseEarlier=i===0&&a.manualHours===true;'),
  'l’assouplissement doit être limité au premier arrêt portant un horaire manuel');
assert(ENGINE.includes('(nominal>fixed&&!canLeaveBaseEarlier)'),
  'nominal>fixed doit être spécialisé, jamais supprimé');
for (const kept of ['overlapsBlock(fixed,duration,b)', 'atFixed.closed', 'atFixed.arrival!==fixed']) {
  assert(ENGINE.includes(kept), 'les contraintes réelles restent actives : ' + kept);
}
assert(ENGINE.includes('firstIsManual?first.arrival-first.travel:Math.max(start,first.arrival-first.travel)'),
  'le plancher au début de journée ne doit tomber que pour un premier arrêt manuel');
assert(ENGINE.includes('arrival=unreachable&&a.manualHours===true?fitted.arrival:fixed;'),
  'la règle de propagation de #367 reste telle quelle');

// --- Le point d'entrée redondant de la fiche magasin a disparu -----------------------
const EDITOR = fs.readFileSync(__dirname + '/../planning-manual-hours.js', 'utf8');
assert(!/manualHoursQuickBtn/.test(EDITOR), 'le bouton de la fiche magasin doit être retiré');
assert(!/sheetActions/.test(EDITOR), 'l’éditeur ne doit plus s’injecter dans la fiche magasin');
assert(!/installQuickButton/.test(EDITOR), 'et sa pose ne doit plus exister');
// Mais l'éditeur lui-même et son API publique restent en place.
assert(/root\.StoreRunnerManualHours = Object\.assign\(\{\}, api, \{ open, close \}\)/.test(EDITOR),
  'StoreRunnerManualHours.open reste public');
assert(/function open\(storeId, day\)/.test(EDITOR), 'l’éditeur reste ouvrable par son API');
const TIMELINE = fs.readFileSync(__dirname + '/../timeline-end-times.js', 'utf8');
assert(/api\.open\(time\.dataset\.tlStore,\s*time\.dataset\.tlDay\)/.test(TIMELINE),
  'le bloc ARRIVÉE reste le point d’entrée principal');
// Le libellé « impossible » suit désormais le statut du moteur, plus une redéduction.
assert(/row\.status==='appointment-conflict'/.test(TIMELINE),
  'la timeline doit lire le statut de l’ordonnanceur pour annoncer une impossibilité');

console.log('premier arrêt: départ anticipé autorisé, conflits réels conservés, magasins suivants et rendez-vous intacts');
