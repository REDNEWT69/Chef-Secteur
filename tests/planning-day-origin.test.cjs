const assert = require('node:assert/strict');
const fs = require('node:fs');

const origin = require('../planning-day-origin.js');
const hours = require('../store-opening-hours.js');
const manual = require('../planning-manual-hours.js');
const reliability = require('../reliability-core.js');
const mins = manual.minutes;

const LUNDI = '2026-09-14', MARDI = '2026-09-15', MARDI_SUIVANT = '2026-09-22';
const BASE = { lat: 45.75, lon: 4.75 };            // Francheville
const HOTEL = { lat: 45.56, lon: 5.92 };           // Chambéry
const FAR = 119, NEAR = 24;                        // minutes de trajet injectées

function state(extra = {}) {
  return Object.assign({
    schemaVersion: 5,
    profile: { sectorName: 'Test', baseName: 'Francheville', baseAddress: 'Base', baseLat: BASE.lat, baseLon: BASE.lon },
    settings: { days: ['Lundi', 'Mardi'], startTime: '08:30', endTime: '20:00', visitMinutes: 90, weekDate: LUNDI },
    stores: [
      { id: 'annemasse', enseigne: 'Boulanger', ville: 'Annemasse', openingHoursSource: 'manual', openingHours: { Mardi: [{ open: '06:00', close: '21:00' }] } },
      { id: 'thonon', enseigne: 'Carrefour', ville: 'Thonon', openingHoursSource: 'manual', openingHours: { Mardi: [{ open: '06:00', close: '21:00' }] } },
    ],
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {},
    plan: { Mardi: [{ id: 'annemasse' }, { id: 'thonon' }] },
    appointments: [], hotelReservations: {},
  }, extra);
}
const night = extra => Object.assign({ fromDate: LUNDI, toDate: MARDI, hotelName: 'Hôtel Mercure Chambéry', reference: 'ABC', zone: 'Chambéry' }, extra);

// L'origine réelle change le premier trajet : depuis la base il est long, depuis
// Chambéry il est court. C'est ce que le test observe, sans géocoder quoi que ce soit.
function schedule(s, appointments = []) {
  s.appointments = appointments;
  return hours.scheduleRoute(s.plan.Mardi, 'Mardi', s, {
    date: MARDI, blocks: [],
    travelMinutes: (from, to) => {
      if (to && String(to.id) === 'thonon') return NEAR;
      return from && Math.abs(Number(from.lat) - HOTEL.lat) < 0.1 ? NEAR : FAR;
    },
    appointmentFor: (storeId, date) => appointments.find(a => String(a.storeId) === String(storeId) && a.date === date) || null,
  });
}

// --- 1. Journée normale sans découché : la base ne bouge pas --------------------------
const plain = state();
const plainOrigin = origin.originFor(MARDI, plain);
assert.equal(plainOrigin.type, 'base');
assert.equal(plainOrigin.pending, false, 'sans découché, aucune question à poser');
assert.equal(origin.label(plainOrigin), 'la base');
const plainRun = schedule(plain);
assert.equal(plainRun.rows[0].travel, FAR, 'le premier trajet part bien de la base');
assert.equal(plainRun.origin.type, 'base');

// --- 2. Découché + hôtel localisé : on part de l'hôtel --------------------------------
const hotel = state({ hotelReservations: { [LUNDI]: night({ address: '12 rue de la Gare, Chambéry', lat: HOTEL.lat, lon: HOTEL.lon }) } });
const hotelOrigin = origin.originFor(MARDI, hotel);
assert.equal(hotelOrigin.type, 'hotel');
assert.equal(hotelOrigin.pending, false);
assert.equal(origin.label(hotelOrigin), 'Hôtel Mercure Chambéry');
const hotelRun = schedule(hotel);
assert.equal(hotelRun.rows[0].travel, NEAR, 'le premier trajet part de l’hôtel, pas de Francheville');
assert.equal(hotelRun.origin.type, 'hotel');
assert.notEqual(hotelRun.rows[0].arrival, plainRun.rows[0].arrival, 'la journée ne démarre plus à la même heure');

// Le retour doit viser la base habituelle, même si le matin part de l'hôtel.
// Des durées distinctes dans les deux sens rendent la régression observable.
const previousBaseObj = globalThis.baseObj;
const usualBase = { id: 'BASE', ...BASE };
globalThis.baseObj = () => usualBase;
try {
  const legs = [];
  const travelMinutes = (from, to) => {
    legs.push([from, to]);
    if (to === usualBase) return FAR;
    if (to && to.id === 'ORIGIN') return 7;
    return from && from.id === 'ORIGIN' ? NEAR : 31;
  };
  const returned = hours.scheduleRoute(hotel.plan.Mardi, 'Mardi', hotel, {
    date: MARDI, blocks: [], travelMinutes,
  });
  assert.equal(legs[0][0].lat, HOTEL.lat);
  assert.equal(legs[0][0].lon, HOTEL.lon);
  assert.equal(returned.rows[0].travel, NEAR, 'premier trajet depuis l’hôtel');
  assert.strictEqual(legs[1][0], hotel.stores[0], 'deuxième trajet depuis le premier magasin');
  assert.strictEqual(legs[1][1], hotel.stores[1]);
  assert.equal(returned.rows[1].travel, 31);
  assert.strictEqual(legs[2][1], usualBase, 'le retour vise la base habituelle');
  assert.equal(returned.returnTravel, FAR, 'le retour ne vise pas l’hôtel (7 minutes)');
  const last = returned.rows.at(-1);
  assert.equal(returned.estimatedEnd, last.arrival + last.duration + FAR);

  // Une base explicitement fournie conserve sa priorité historique aux deux bouts.
  legs.length = 0;
  hours.scheduleRoute(hotel.plan.Mardi, 'Mardi', hotel, {
    date: MARDI, blocks: [], base: usualBase, travelMinutes,
  });
  assert.strictEqual(legs[0][0], usualBase);
  assert.strictEqual(legs.at(-1)[1], usualBase);
} finally {
  if (previousBaseObj === undefined) delete globalThis.baseObj;
  else globalThis.baseObj = previousBaseObj;
}

// --- 3. Découché sans position exacte : on demande, jamais de repli muet --------------
const vague = state({ hotelReservations: { [LUNDI]: night() } });
const vagueOrigin = origin.originFor(MARDI, vague);
assert.equal(vagueOrigin.pending, true, 'sans hôtel localisé, l’origine doit être demandée');
assert.equal(vagueOrigin.suggestion, 'Chambéry', 'la zone du découché est proposée, pas imposée');
assert.equal(vagueOrigin.nightDate, LUNDI);
assert.equal(schedule(vague).origin.pending, true, 'l’ordonnanceur signale que l’origine est en attente');
// Un hôtel sans adresse, ou avec des coordonnées nulles, reste une approximation.
assert.equal(origin.located({ lat: 0, lon: 0 }), false);
assert.equal(origin.located({ lat: null, lon: null }), false);
assert.equal(origin.located(HOTEL), true);

// --- 4. Découché + zone confirmée : on part de cette zone -----------------------------
const confirmed = state({ hotelReservations: { [LUNDI]: night() } });
origin.confirmOrigin(confirmed, MARDI, { type: 'zone', label: 'Chambéry', ville: 'Chambéry', adresse: 'Chambéry', lat: HOTEL.lat, lon: HOTEL.lon });
const zone = origin.originFor(MARDI, confirmed);
assert.equal(zone.type, 'zone');
assert.equal(zone.pending, false);
assert.equal(origin.label(zone), 'Chambéry');
assert.equal(schedule(confirmed).rows[0].travel, NEAR, 'le premier trajet part de la zone confirmée');
assert.throws(() => origin.confirmOrigin(confirmed, MARDI, { type: 'zone', ville: 'X' }), /position/,
  'un point de départ sans position n’est pas enregistrable');

// --- 5. Arrivée manuelle 09:30 depuis l'origine du découché ---------------------------
const withHotel = state({ hotelReservations: { [LUNDI]: night({ lat: HOTEL.lat, lon: HOTEL.lon, address: 'Chambéry' }) } });
const imposed = [manual.buildEntry({ storeId: 'annemasse', date: MARDI, time: '09:30', endTime: null, duration: 90 })];
const run = schedule(withHotel, imposed);
assert.equal(run.rows[0].arrival, mins('09:30'), 'l’heure imposée est tenue');
assert.equal(run.recommendedDeparture, mins('09:30') - NEAR, 'le départ conseillé part de l’hôtel');
assert.notEqual(run.recommendedDeparture, mins('09:30') - FAR, 'et surtout pas de Francheville');
assert.equal(run.rows[1].arrival, mins('09:30') + 90 + NEAR, 'la suite de la journée découle de l’origine réelle');

// --- 6. Le comportement de #369 reste valide -----------------------------------------
// Depuis la base, 08:30 + 119 min = 10:29 ; vouloir 09:30 reste un départ anticipé.
const early = schedule(state(), [manual.buildEntry({ storeId: 'annemasse', date: MARDI, time: '09:30', endTime: null, duration: 90 })]);
assert.notEqual(early.rows[0].status, 'appointment-conflict', 'partir avant le début de journée reste permis');
assert.equal(early.rows[0].arrival, mins('09:30'));
assert.equal(early.recommendedDeparture, mins('09:30') - FAR, 'départ conseillé antérieur au début de journée');
assert(early.recommendedDeparture < early.start);

// --- 7 & 8. Fermeture magasin et Agenda : conflits toujours détectés ------------------
const closedState = state({ hotelReservations: { [LUNDI]: night({ lat: HOTEL.lat, lon: HOTEL.lon }) },
  stores: [
    { id: 'annemasse', enseigne: 'Boulanger', ville: 'Annemasse', openingHoursSource: 'manual', openingHours: { Mardi: [{ open: '14:00', close: '19:00' }] } },
    { id: 'thonon', enseigne: 'Carrefour', ville: 'Thonon', openingHoursSource: 'manual', openingHours: { Mardi: [{ open: '06:00', close: '21:00' }] } },
  ] });
assert.equal(schedule(closedState, imposed).rows[0].status, 'appointment-conflict', 'magasin fermé : conflit conservé');

const blockedState = state({ hotelReservations: { [LUNDI]: night({ lat: HOTEL.lat, lon: HOTEL.lon }) } });
blockedState.appointments = imposed;
const blocked = hours.scheduleRoute(blockedState.plan.Mardi, 'Mardi', blockedState, {
  date: MARDI, blocks: [{ allDay: false, startMin: mins('09:00'), endMin: mins('11:00'), title: 'Réunion' }],
  travelMinutes: () => NEAR,
  appointmentFor: (storeId, date) => imposed.find(a => String(a.storeId) === String(storeId) && a.date === date) || null,
});
assert.equal(blocked.rows[0].status, 'appointment-conflict', 'blocage Agenda : conflit conservé');

// --- 9. Deuxième arrêt impossible : comportement historique ---------------------------
const secondState = state({ hotelReservations: { [LUNDI]: night({ lat: HOTEL.lat, lon: HOTEL.lon }) } });
const secondRun = schedule(secondState, [manual.buildEntry({ storeId: 'thonon', date: MARDI, time: '08:00', endTime: null, duration: 90 })]);
assert.equal(secondRun.rows[1].status, 'appointment-conflict', 'un deuxième arrêt trop tôt reste impossible');
assert.equal(secondRun.rows[1].arrival, secondRun.rows[1].nominalArrival, 'et repart de l’heure atteignable');

// --- 10. Vrai rendez-vous : comportement historique -----------------------------------
const realState = state({ hotelReservations: { [LUNDI]: night({ lat: HOTEL.lat, lon: HOTEL.lon }) } });
const real = [{ id: 'rdv', storeId: 'annemasse', date: MARDI, time: '06:30', duration: 90, type: 'Formation vendeur' }];
const realRun = schedule(realState, real);
assert.equal(realRun.rows[0].status, 'appointment-conflict', 'un vrai rendez-vous trop tôt reste signalé');
assert.equal(realRun.rows[0].arrival, mins('06:30'), 'et garde l’heure convenue');

// --- 11. Hôtel supprimé ou déplacé : l'origine dérivée est nettoyée -------------------
const pruned = state({ hotelReservations: { [LUNDI]: night() } });
origin.confirmOrigin(pruned, MARDI, { type: 'zone', label: 'Chambéry', ville: 'Chambéry', lat: HOTEL.lat, lon: HOTEL.lon });
assert.equal(origin.originFor(MARDI, pruned).type, 'zone');
delete pruned.hotelReservations[LUNDI];
assert.equal(origin.pruneOrigins(pruned), 1, 'la nuit disparue emporte l’origine qu’elle justifiait');
assert.deepEqual(pruned.dayOrigins, {});
assert.equal(origin.originFor(MARDI, pruned).type, 'base', 'et la journée redevient une journée normale');

const moved = state({ hotelReservations: { [LUNDI]: night() } });
origin.confirmOrigin(moved, MARDI, { type: 'zone', label: 'Chambéry', ville: 'Chambéry', lat: HOTEL.lat, lon: HOTEL.lon });
moved.hotelReservations = { '2026-09-16': night({ fromDate: '2026-09-16', toDate: '2026-09-17' }) };
assert.equal(origin.pruneOrigins(moved), 1, 'une nuit déplacée invalide l’origine dérivée');

// --- 12. Persistance : l'état étendu reste une sauvegarde valide ----------------------
const stored = state({ hotelReservations: { [LUNDI]: night({ lat: HOTEL.lat, lon: HOTEL.lon, address: 'Chambéry' }) } });
origin.confirmOrigin(stored, MARDI, { type: 'custom', label: 'Aix-les-Bains', ville: 'Aix-les-Bains', lat: 45.69, lon: 5.91 });
assert.doesNotThrow(() => reliability.validateState(stored), 'un point de départ doit rester enregistrable');
const reloaded = JSON.parse(JSON.stringify(stored));
assert.doesNotThrow(() => reliability.validateState(reloaded));
assert.equal(origin.originFor(MARDI, reloaded).type, 'hotel', 'l’hôtel localisé prime après rechargement');
delete reloaded.hotelReservations[LUNDI].lat;
delete reloaded.hotelReservations[LUNDI].lon;
assert.equal(origin.originFor(MARDI, reloaded).label, 'Aix-les-Bains', 'et le choix confirmé survit au rechargement');

// --- 13. Semaine suivante : aucune origine reprise par erreur -------------------------
const nextWeek = state({ hotelReservations: { [LUNDI]: night({ lat: HOTEL.lat, lon: HOTEL.lon }) } });
origin.confirmOrigin(nextWeek, MARDI, { type: 'zone', label: 'Chambéry', ville: 'Chambéry', lat: HOTEL.lat, lon: HOTEL.lon });
assert.equal(origin.originFor(MARDI_SUIVANT, nextWeek).type, 'base',
  'le mardi de la semaine suivante repart de la base');
assert.equal(origin.originFor(MARDI_SUIVANT, nextWeek).pending, false);
assert.equal(origin.nightBefore(MARDI_SUIVANT, nextWeek), null, 'aucune nuit ne précède ce mardi-là');

// --- Contrats de code ------------------------------------------------------------------
const ENGINE = fs.readFileSync(__dirname + '/../store-opening-hours.js', 'utf8');
assert(ENGINE.includes('const canLeaveBaseEarlier=i===0&&a.manualHours===true;'), 'la règle de #369 reste en place');
assert(ENGINE.includes('StoreRunnerDayOrigin'), 'l’ordonnanceur lit le point de départ du jour');
assert(!/nominatim/i.test(fs.readFileSync(__dirname + '/../planning-day-origin.js', 'utf8')),
  'aucun second fournisseur de géocodage');
const TIMELINE = fs.readFileSync(__dirname + '/../timeline-end-times.js', 'utf8');
assert(/StoreRunnerGeocode/.test(TIMELINE), 'le géocodage réutilise celui du profil');
for (const forbidden of ['latitude', 'longitude']) {
  assert(!new RegExp(forbidden, 'i').test(TIMELINE.replace(/\/\*[\s\S]*?\*\//g, '')),
    'aucune donnée GPS technique montrée à l’utilisateur : ' + forbidden);
}

console.log('point de départ du jour: base, hôtel, zone confirmée, question posée, nettoyage et #369 intacts');
