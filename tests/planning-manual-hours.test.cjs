const assert = require('node:assert/strict');
const fs = require('node:fs');

const manual = require('../planning-manual-hours.js');
const hours = require('../store-opening-hours.js');
const reliability = require('../reliability-core.js');

const INDEX = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const SW = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
const SOURCE = fs.readFileSync(__dirname + '/../planning-manual-hours.js', 'utf8');

// --- Branchement et périmètre ---------------------------------------------------------
assert(INDEX.includes("'./planning-manual-hours.js'"), 'le shell V1 doit charger le module');
assert(SW.includes('"./planning-manual-hours.js"'), 'le module doit rester disponible hors ligne');

const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// Aucun second ordonnanceur : le module écrit la contrainte, il ne recalcule pas la tournée.
for (const forbidden of ['hav(', 'roadMinutes(', 'optimize(', 'nearestRoute(', 'twoOpt(', 'daySchedule(']) {
  assert(!CODE.includes(forbidden), 'la contrainte ne doit pas recalculer la tournée : ' + forbidden);
}
assert(/scheduleRoute/.test(CODE), 'le calcul doit rester celui de StoreOpeningHoursV1.scheduleRoute');
assert(/state\.appointments/.test(CODE), 'la contrainte doit vivre dans le registre existant state.appointments');
for (const owned of ['renderWeek', 'renderAll', 'generateWeek', 'saveProfile']) {
  assert(!new RegExp('window\\.' + owned + '\\s*=(?!=)').test(CODE), 'propriétaire runtime contourné: ' + owned);
}
assert(!/\bsetInterval\s*\(/.test(CODE), 'aucune boucle de surveillance permanente');

// --- Un horaire imposé ne réordonne pas la tournée -----------------------------------
// applyAppointmentsToPlan retire le magasin de tous les jours et le repousse en FIN de la
// journée du rendez-vous. C'est voulu pour un vrai rendez-vous, qui impose la présence ce
// jour-là ; ce serait faux pour un horaire manuel, qui ne fait que contraindre une visite
// déjà placée. Sans cette garde, un rechargement déplaçait le magasin en fin de journée.
const RUNTIME = fs.readFileSync(__dirname + '/../src/chef-secteur.html', 'utf8');
const applyFn = RUNTIME.slice(RUNTIME.indexOf('window.applyAppointmentsToPlan='), RUNTIME.indexOf('window.generateWeek='));
assert(/manualHours\s*!==\s*true/.test(applyFn),
  'applyAppointmentsToPlan doit ignorer les horaires manuels pour ne pas réordonner la tournée');

// --- Durée déduite --------------------------------------------------------------------
assert.deepEqual(manual.deriveDuration('10:30', '12:00', 60), { ok: true, duration: 90, derived: true },
  'arrivée + départ doivent donner la durée sur place');
assert.deepEqual(manual.deriveDuration('10:30', '', 75), { ok: true, duration: 75, derived: false },
  'arrivée seule : la durée prévue est conservée, jamais réinventée');
assert.deepEqual(manual.deriveDuration('10:30', null, 75), { ok: true, duration: 75, derived: false });
assert.equal(manual.deriveDuration('10:30', '10:30', 60).ok, false, 'un départ égal à l’arrivée est refusé');
assert.equal(manual.deriveDuration('10:30', '09:00', 60).ok, false, 'un départ avant l’arrivée est refusé');
assert.equal(manual.deriveDuration('10:30', '10:40', 60).ok, false, 'une visite plus courte que le minimum est refusée');
assert.equal(manual.deriveDuration('', '12:00', 60).ok, false, 'une arrivée absente est refusée');
assert.equal(manual.deriveDuration('25:00', '', 60).ok, false, 'une arrivée hors bornes est refusée');
assert.equal(manual.deriveDuration('10:30', 'midi', 60).ok, false, 'un départ illisible est refusé');

// --- Modèle de données ----------------------------------------------------------------
function baseState() {
  return {
    schemaVersion: 5,
    profile: { sectorName: 'Test' },
    settings: { days: ['Lundi', 'Mardi'], startTime: '08:30', endTime: '19:00', visitMinutes: 60, weekDate: '2026-09-14' },
    stores: [
      { id: 'boulanger', enseigne: 'Boulanger', ville: 'Chalon' },
      { id: 'carrefour', enseigne: 'Carrefour', ville: 'Chalon' },
    ],
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {},
    plan: { Lundi: [{ id: 'boulanger' }, { id: 'carrefour' }] },
    appointments: [],
  };
}

const state = baseState();
const entry = manual.applyManual(state, { storeId: 'boulanger', date: '2026-09-14', time: '10:30', endTime: '12:00', duration: 90 });
assert.equal(state.appointments.length, 1);
assert.equal(entry.manualHours, true, 'l’entrée doit être reconnaissable comme un horaire manuel');
assert.equal(entry.date, '2026-09-14', 'la contrainte est liée à la date, pas au magasin');
assert.equal(entry.time, '10:30');
assert.equal(entry.endTime, '12:00');
assert.equal(entry.duration, 90);
assert.equal(manual.isManual(entry), true);

// Rejouer la même édition remplace au lieu d'empiler.
manual.applyManual(state, { storeId: 'boulanger', date: '2026-09-14', time: '11:00', endTime: null, duration: 60 });
assert.equal(state.appointments.length, 1, 'une seconde édition ne doit pas créer de doublon');
assert.equal(state.appointments[0].time, '11:00');
assert.equal(state.appointments[0].endTime, null);
assert.equal(state.appointments[0].id, entry.id, 'l’entrée garde son identité');

// La même contrainte sur une autre date est une autre entrée : rien n'est figé sur le magasin.
manual.applyManual(state, { storeId: 'boulanger', date: '2026-09-15', time: '09:00', endTime: null, duration: 60 });
assert.equal(state.appointments.length, 2, 'chaque date porte sa propre contrainte');
assert.equal(manual.findManual(state, 'boulanger', '2026-09-15').time, '09:00');

// Un vrai rendez-vous partage le registre sans jamais être touché.
state.appointments.push({ id: 'rdv1', storeId: 'carrefour', date: '2026-09-14', time: '15:00', duration: 45, type: 'Formation vendeur' });
assert.equal(manual.findManual(state, 'carrefour', '2026-09-14'), null, 'un vrai rendez-vous n’est pas un horaire manuel');
assert.equal(manual.realAppointment(state, 'carrefour', '2026-09-14').id, 'rdv1');
manual.clearManual(state, 'boulanger', '2026-09-14');
assert.equal(manual.findManual(state, 'boulanger', '2026-09-14'), null, 'le retour en automatique supprime la contrainte');
assert.equal(state.appointments.some(row => row.id === 'rdv1'), true, 'le vrai rendez-vous survit au retour en automatique');
assert.equal(manual.findManual(state, 'boulanger', '2026-09-15').time, '09:00', 'les autres dates ne sont pas touchées');

// Persistance : l'état étendu reste une sauvegarde valide.
assert.doesNotThrow(() => reliability.validateState(state), 'un horaire manuel doit rester enregistrable');
const restored = JSON.parse(JSON.stringify(state));
assert.doesNotThrow(() => reliability.validateState(restored));
assert.equal(manual.findManual(restored, 'boulanger', '2026-09-15').endTime, null,
  'la contrainte survit à une sérialisation/relecture');

// --- Calcul : une seule source, StoreOpeningHoursV1.scheduleRoute ---------------------
const DATE = '2026-09-14';
function schedule(appointments, travel = () => 18) {
  const s = baseState();
  s.appointments = appointments;
  return hours.scheduleRoute(s.plan.Lundi, 'Lundi', s, {
    base: {}, date: DATE, blocks: [], travelMinutes: travel,
    appointmentFor: (storeId, date) => appointments.find(a => String(a.storeId) === String(storeId) && a.date === date) || null,
  });
}
const mins = manual.minutes;

// Référence automatique : départ 08:30, 18 min de trajet, 60 min sur place.
const auto = schedule([]);
assert.equal(auto.rows[0].arrival, mins('08:48'), 'automatique : arrivée = début de journée + trajet');
assert.equal(auto.rows[0].duration, 60);
assert.equal(auto.rows[1].arrival, mins('10:06'), 'automatique : 08:48 + 60 min + 18 min de trajet');

// L'exemple attendu du lot.
const imposed = [manual.buildEntry({ storeId: 'boulanger', date: DATE, time: '10:30', endTime: '12:00', duration: 90 })];
const forced = schedule(imposed);
assert.equal(forced.rows[0].arrival, mins('10:30'), 'l’arrivée imposée doit être respectée');
assert.equal(forced.rows[0].duration, 90, 'la durée sur place doit venir du départ imposé');
// Le statut « unknown » dit seulement que l'horaire d'ouverture n'est pas renseigné ;
// ce qui compte ici est qu'aucun conflit d'horaire imposé ne soit levé.
assert.notEqual(forced.rows[0].status, 'appointment-conflict', 'une contrainte tenable ne doit pas être signalée en conflit');
assert.equal(forced.appointmentConflicts, 0, 'aucun conflit sur une contrainte tenable');
assert.equal(forced.rows[1].travel, 18, 'le trajet inter-magasin reste compté');
assert.equal(forced.rows[1].arrival, mins('12:18'), 'la suite de la journée est recalculée : 12:00 + 18 min');
assert.equal(forced.rows[1].duration, 60, 'le magasin suivant garde sa durée prévue');

// Arrivée seule : la durée prévue est conservée et la propagation suit.
const arrivalOnly = schedule([manual.buildEntry({ storeId: 'boulanger', date: DATE, time: '10:30', endTime: null, duration: 60 })]);
assert.equal(arrivalOnly.rows[0].arrival, mins('10:30'));
assert.equal(arrivalOnly.rows[0].duration, 60, 'sans départ imposé, la durée prévue est conservée');
assert.equal(arrivalOnly.rows[1].arrival, mins('11:48'), '10:30 + 60 min + 18 min de trajet');

// Une arrivée imposée plus tôt que le trajet ne permet est signalée, avec l'heure au plus tôt.
const impossible = schedule([manual.buildEntry({ storeId: 'carrefour', date: DATE, time: '09:00', endTime: null, duration: 60 })]);
const flagged = impossible.rows[1];
assert.equal(flagged.status, 'appointment-conflict', 'un horaire intenable doit être signalé');
assert.equal(impossible.appointmentConflicts, 1);
assert.equal(flagged.nominalArrival, mins('10:06'), 'l’heure au plus tôt reste disponible pour l’annoncer');
assert(mins('09:00') < flagged.nominalArrival, 'le cas testé est bien une arrivée plus tôt que le trajet ne permet');

// Le trajet reste compté quelle que soit la contrainte.
for (const rows of [auto.rows, forced.rows, arrivalOnly.rows, impossible.rows]) {
  assert.equal(rows[1].travel, 18, 'le trajet inter-magasin est toujours compté');
  assert(Number.isFinite(rows[0].travel), 'le trajet depuis le départ est toujours compté');
}

// Retour en automatique : on retrouve exactement la référence.
const cleared = baseState();
cleared.appointments = imposed.slice();
manual.clearManual(cleared, 'boulanger', DATE);
assert.deepEqual(cleared.appointments, [], 'le retour en automatique vide la contrainte');
const back = schedule(cleared.appointments);
assert.equal(back.rows[0].arrival, auto.rows[0].arrival, 'le retour en automatique restaure l’arrivée calculée');
assert.equal(back.rows[1].arrival, auto.rows[1].arrival, 'et la propagation d’origine');

// --- Une arrivée manuelle impossible ne fait jamais avancer la suite de la journée ----
// scheduleRoute forçait arrival = heure demandée et repartait de là : les magasins
// suivants étaient calculés depuis un instant qui n'existe pas. Pour une contrainte
// posée à la main, la tournée repart désormais de l'heure réellement atteignable.
function threeStopState() {
  const s = baseState();
  s.stores = s.stores.concat([{ id: 'troisieme', enseigne: 'Darty', ville: 'Chalon' }]);
  s.plan = { Lundi: [{ id: 'boulanger' }, { id: 'carrefour' }, { id: 'troisieme' }] };
  return s;
}
function threeStopSchedule(appointments) {
  const s = threeStopState();
  s.appointments = appointments;
  return hours.scheduleRoute(s.plan.Lundi, 'Lundi', s, {
    base: {}, date: DATE, blocks: [], travelMinutes: () => 18,
    appointmentFor: (storeId, date) => appointments.find(a => String(a.storeId) === String(storeId) && a.date === date) || null,
  });
}

const chain = threeStopSchedule([]);
assert.equal(chain.rows[1].arrival, mins('10:06'), 'référence automatique du deuxième magasin');
assert.equal(chain.rows[2].arrival, mins('11:24'), 'référence automatique du troisième magasin');

const WANTED = '09:00';
const tooEarly = threeStopSchedule([manual.buildEntry({ storeId: 'carrefour', date: DATE, time: WANTED, endTime: null, duration: 60 })]);
const constrained = tooEarly.rows[1];
assert.equal(constrained.status, 'appointment-conflict', 'le signalement de conflit est conservé');
assert.equal(tooEarly.appointmentConflicts, 1);
assert.equal(constrained.requestedArrival, mins(WANTED), 'l’heure demandée reste lisible pour l’annoncer');
assert.equal(constrained.arrival, mins('10:06'), 'la visite est planifiée à l’heure réellement atteignable');
assert(constrained.arrival >= constrained.nominalArrival, 'jamais avant ce que le trajet permet');
assert.equal(tooEarly.rows[2].arrival, chain.rows[2].arrival,
  'le magasin suivant n’avance pas : il repart de l’heure tenable, pas de l’heure demandée');
assert.equal(tooEarly.rows[2].arrival, mins('11:24'));
assert.notEqual(tooEarly.rows[2].arrival, mins(WANTED) + 60 + 18,
  'le magasin suivant ne doit surtout pas être calculé depuis 09:00');
assert.equal(tooEarly.rows[2].travel, 18, 'le trajet reste compté');

// Une contrainte manuelle tenable, elle, fait toujours foi.
const reachable = threeStopSchedule([manual.buildEntry({ storeId: 'carrefour', date: DATE, time: '11:00', endTime: '12:00', duration: 60 })]);
assert.equal(reachable.rows[1].arrival, mins('11:00'), 'une heure manuelle tenable est respectée telle quelle');
assert.notEqual(reachable.rows[1].status, 'appointment-conflict');
assert.equal(reachable.rows[2].arrival, mins('12:18'), '12:00 + 18 min de trajet');

// --- Le comportement historique des vrais rendez-vous n'est pas touché ----------------
const realTooEarly = threeStopSchedule([{ id: 'rdv-tot', storeId: 'carrefour', date: DATE, time: WANTED, duration: 60, type: 'Formation vendeur' }]);
assert.equal(realTooEarly.rows[1].status, 'appointment-conflict', 'un vrai rendez-vous intenable reste signalé');
assert.equal(realTooEarly.rows[1].arrival, mins(WANTED),
  'un vrai rendez-vous garde l’heure convenue : c’est au chef de secteur d’arbitrer');
assert.equal(realTooEarly.rows[2].arrival, mins(WANTED) + 60 + 18,
  'et la suite continue d’en découler, exactement comme avant ce lot');

console.log('horaires manuels: arrivée imposée, durée déduite, propagation tenable, conflit, rendez-vous intacts et retour auto ok');
