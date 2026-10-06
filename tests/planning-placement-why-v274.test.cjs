const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
/* V274 — « Pourquoi ce jour » (Planning intelligent, incrément 1) : `placementFor` de store-explorer.js explique le
   placement d'un magasin à une date avec des FAITS déjà produits par leurs propriétaires. Lecture seule : aucun moteur
   rejoué, aucune écriture, aucune raison déduite de l'optimisation (jamais « le plus court » ni « le meilleur »). */
globalThis.StoreRunnerVisitCoverage = require('../visit-coverage.js');
globalThis.StoreRunnerManualHours = require('../planning-manual-hours.js');
const X = require('../store-explorer.js');
const C = globalThis.StoreRunnerVisitCoverage;

const TODAY = '2026-10-07'; // mercredi
const store = (id, extra) => Object.assign({ id, enseigne: 'Darty', ville: 'Ville ' + id, freq: 'Mensuel', active: true, priority: 3 }, extra || {});
const make = (over) => Object.assign({ stores: [store('s')], visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], businessV2: { visits: [], actions: [], opportunities: [] } }, over || {});
const visited = (last) => ({ visits: { s: { lastVisit: last, history: [last] } } });
const opt = (extra) => Object.assign({ today: TODAY, archive: {}, priorities: new Map() }, extra || {});
const at = (state, date, extra, id) => X.placementFor(state, id || 's', Object.assign({ date }, opt(extra)));
const facts = pl => pl.facts.map(f => f.kind);
const text = pl => [pl.headline].concat(pl.facts.map(f => f.title + ' ' + f.detail)).join(' | ');

// 1. Ce qui fixe le jour : rendez-vous, arrivée imposée, pose datée, verrou récurrent, « Imposé » --------------------
{
  const rdv = make({ appointments: [{ id: 'r1', storeId: 's', date: '2026-10-13', time: '14:00', duration: 60, type: 'Formation' }] });
  const pl = at(rdv, '2026-10-13');
  assert.equal(pl.kind, 'fixed'); assert.equal(pl.headline, 'Rendez-vous ce jour-là à 14:00'); assert.equal(pl.facts[0].kind, 'appointment');
  assert.match(pl.facts[0].detail, /Formation/);
  assert.equal(at(rdv, '2026-10-14').kind, 'none', 'un rendez-vous d’un autre jour ne fixe pas celui-ci');

  const arrival = make({ appointments: [{ id: 'h1', storeId: 's', date: '2026-10-08', time: '09:30', duration: 45, type: 'Horaire manuel', manualHours: true }], locks: { s: { day: 'Jeudi', week: '2026-10-05' } } });
  const a = at(arrival, '2026-10-08');
  assert.equal(a.headline, 'Arrivée imposée à 09:30', 'l’arrivée imposée passe avant la pose manuelle');
  assert.deepEqual(facts(a).slice(0, 2), ['arrival', 'lock_dated']);

  const dated = make({ locks: { s: { day: 'Jeudi', week: '2026-10-05' } } });
  assert.equal(at(dated, '2026-10-08').headline, 'Posé à la main sur ce jour');
  assert.equal(at(dated, '2026-10-09').kind, 'none', 'une pose datée ne vaut que pour sa date');

  const recurring = make({ locks: { s: 'Jeudi' } });
  assert.equal(at(recurring, '2026-10-08').headline, 'Posé tous les jeudis');
  assert.equal(at(recurring, '2026-10-15').headline, 'Posé tous les jeudis', 'chaque semaine');
  assert.equal(at(recurring, '2026-10-09').kind, 'none');

  const imposed = make({ included: { s: true } });
  assert.match(at(imposed, '2026-10-09').headline, /^Imposé/);

  const multiple = make({ included: { s: true }, appointments: [{ id: 'r', storeId: 's', date: '2026-10-09', time: '11:00', duration: 30, type: 'Point' }], locks: { s: 'Vendredi' } });
  const m = at(multiple, '2026-10-09');
  assert.deepEqual(facts(m).filter(k => k !== 'need' && k !== 'guard'), ['appointment', 'lock_recurring', 'included'], 'toutes les contraintes du jour sont citées, la plus forte en tête');
  assert.equal(m.headline, 'Rendez-vous ce jour-là à 11:00');
}

// 2. Sans contrainte : on le dit, puis le besoin de visite LU à la date ---------------------------------------------
{
  const nothing = at(make(), '2026-10-09');
  assert.equal(nothing.kind, 'none'); assert.match(nothing.headline, /^Aucune contrainte ne fixe ce jour/);
  const never = nothing.facts.find(f => f.kind === 'need');
  assert.equal(never.title, 'Besoin de visite : Jamais visité'); assert.match(never.detail, /fréquence 30 j/);

  const need = (last, date) => C.need(make(visited(last)), store('s'), { ref: date, today: TODAY });
  const veryLate = at(make(visited('2026-08-01')), '2026-10-09');
  const nl = need('2026-08-01', '2026-10-09');
  assert.equal(veryLate.facts.find(f => f.kind === 'need').title, 'Besoin de visite : Très en retard à cette date');
  assert.match(veryLate.facts.find(f => f.kind === 'need').detail, new RegExp(nl.overdueDays + ' jours de retard'));
  assert.match(veryLate.headline, /très en retard à cette date$/);

  const late = at(make(visited('2026-09-01')), '2026-10-09');
  assert.equal(late.facts.find(f => f.kind === 'need').title, 'Besoin de visite : En retard à cette date');
  assert.match(late.facts.find(f => f.kind === 'need').detail, new RegExp(need('2026-09-01', '2026-10-09').overdueDays + ' jours de retard'));

  const soon = at(make(visited('2026-09-15')), '2026-10-09');
  assert.equal(soon.facts.find(f => f.kind === 'need').title, 'Besoin de visite : À visiter bientôt');
  assert.match(soon.facts.find(f => f.kind === 'need').detail, /échéance le 15 oct\./);

  const ok = at(make(visited('2026-09-20')), '2026-10-09');
  assert.equal(ok.facts.find(f => f.kind === 'need').title, 'Besoin de visite : À jour à cette date');
  assert.match(ok.facts.find(f => f.kind === 'need').detail, /échéance le 20 oct\./);

  // La date lue est celle de la carte : le même magasin devient « en retard » plus tard.
  const early = at(make(visited('2026-09-15')), '2026-10-08'), later = at(make(visited('2026-09-15')), '2026-10-20');
  assert.equal(early.facts.find(f => f.kind === 'need').status, 'soon'); assert.equal(later.facts.find(f => f.kind === 'need').status, 'late');

  // Priorité du parc : P1 et 2e passage.
  const p1 = at(make(visited('2026-09-20')), '2026-10-09', { priorities: new Map([['s', 'P1']]) });
  assert.match(p1.facts.find(f => f.kind === 'need').detail, /P1$/, 'la priorité du parc est citée');
  assert.doesNotMatch(p1.facts.find(f => f.kind === 'need').detail, /2e passage/, 'pas de 2e passage tant que la garde n’a pas été levée');
  const second = at(make(visited('2026-10-05')), '2026-10-09', { priorities: new Map([['s', 'P1']]) });
  assert.match(second.facts.find(f => f.kind === 'need').detail, /P1 · 2e passage attendu/, 'P1 sous 2 visites depuis l’import : la garde cède et le 2e passage est attendu');
  assert.ok(!second.facts.some(f => f.kind === 'guard'), 'la garde est levée : elle n’est pas citée comme active');
}

// 3. La garde « visité récemment » : citée, et dite « passée outre » quand une contrainte explicite fixe le jour -------
{
  const guarded = at(make(visited('2026-10-05')), '2026-10-09');
  assert.equal(guarded.kind, 'none');
  const g = guarded.facts.find(f => f.kind === 'guard');
  assert.ok(g, 'visité trop récemment et rien ne fixe le jour : le fait est dit tel quel');
  assert.match(g.detail, /^Non reproposé automatiquement avant le /); assert.doesNotMatch(g.detail, /passe outre/);
  const forced = at(make(Object.assign(visited('2026-10-05'), { appointments: [{ id: 'r', storeId: 's', date: '2026-10-09', time: '09:00', duration: 30, type: 'Point' }] })), '2026-10-09');
  assert.match(forced.facts.find(f => f.kind === 'guard').detail, /qui passe outre\.$/);
  assert.equal(forced.kind, 'fixed');
}

// 4. Quand il n'y a rien d'honnête à dire : null --------------------------------------------------------------------
{
  const state = make();
  assert.equal(at(state, '2026-10-06'), null, 'jour passé : pas de conseil sur le passé');
  assert.equal(at(state, '2026-10-07').kind, 'none', 'aujourd’hui est expliqué');
  assert.equal(at(state, 'pas une date'), null);
  assert.equal(at(state, ''), null);
  assert.equal(X.placementFor(state, 'inconnu', Object.assign({ date: '2026-10-09' }, opt())), null);
  assert.equal(X.placementFor(null, 's', Object.assign({ date: '2026-10-09' }, opt())), null);
  assert.equal(X.placementFor(state, 's', undefined), null);
  assert.equal(X.placementHtml(null), '');
  assert.equal(at(make({ locks: { s: 'Vendredi' } }), '2026-10-09', { day: 'Vendredi' }).kind, 'fixed', 'le nom du jour peut être fourni…');
  assert.equal(at(make({ locks: { s: 'Vendredi' } }), '2026-10-09').kind, 'fixed', '… ou déduit de la date');
}

// 5. Lecture seule, déterminisme -------------------------------------------------------------------------------------
{
  const state = make(Object.assign(visited('2026-09-01'), { included: { s: true }, locks: { s: 'Vendredi' }, appointments: [{ id: 'r', storeId: 's', date: '2026-10-09', time: '08:30', duration: 30, type: 'Point' }] }));
  const frozen = JSON.stringify(state);
  (function freeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(freeze); } })(state);
  const one = JSON.stringify(at(state, '2026-10-09')), two = JSON.stringify(at(state, '2026-10-09'));
  assert.equal(one, two, 'même entrée, même sortie');
  assert.equal(JSON.stringify(state), frozen, 'aucune mutation du state (objet gelé : toute écriture aurait levé)');
  assert.equal(Object.keys(state).sort().join(), Object.keys(JSON.parse(frozen)).sort().join(), 'aucune clé ajoutée');
}

// 6. Aucune justification inventée : vocabulaire interdit sur tous les cas --------------------------------------------
{
  const samples = [
    make(), make(visited('2026-08-01')), make(visited('2026-09-01')), make(visited('2026-09-15')), make(visited('2026-09-20')), make(visited('2026-10-05')),
    make({ included: { s: true } }), make({ locks: { s: 'Vendredi' } }), make({ locks: { s: { day: 'Vendredi', week: '2026-10-05' } } }),
    make({ appointments: [{ id: 'r', storeId: 's', date: '2026-10-09', time: '08:30', duration: 30, type: 'Point' }] }),
    make({ appointments: [{ id: 'h', storeId: 's', date: '2026-10-09', time: '08:30', duration: 30, type: 'Horaire manuel', manualHours: true, arrivalMode: 'flexible' }] })
  ];
  const BANNED = /optimal|optimis(é|ée|és|ation)|meilleur|plus court|plus rapide|idéal|ideal|le mieux|recommand|économi|astucieu|intelligen|trajet|kilom|km\b/i;
  for (const state of samples) for (const date of ['2026-10-07', '2026-10-09', '2026-10-20']) {
    const pl = at(state, date);
    assert.ok(pl, 'cas couvert'); assert.doesNotMatch(text(pl), BANNED, 'aucune justification inventée : ' + text(pl));
  }
}

// 7. Texte inerte ----------------------------------------------------------------------------------------------------
{
  const hostile = make({ appointments: [{ id: 'r', storeId: 's', date: '2026-10-09', time: '08:30', duration: 30, type: '<img src=x onerror="window.__xss=1">Point' }] });
  const html = X.placementHtml(at(hostile, '2026-10-09'));
  assert.doesNotMatch(html, /<img/i, 'le type de rendez-vous saisi par l’utilisateur est échappé'); assert.match(html, /&lt;img/);
  assert.match(html, /^<h3>Pourquoi ce jour \?<\/h3><p class="srXLead" data-sr-x-why="fixed">/);
}

// 8. Pins de structure : le bloc ne lit que des faits, n'écrit rien, ne connaît ni Runner ni moteurs -------------------
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'store-explorer.js'), 'utf8');
  const block = src.slice(src.indexOf('/* --- Pourquoi ce jour'), src.indexOf('/* --- Frise du magasin'));
  assert.ok(block.length > 3000, 'bloc repéré');
  assert.doesNotMatch(block, /\bstate\s*\.\s*[A-Za-z_.\[\]'"]+\s*=[^=]|localStorage|sessionStorage|__chefStorage|indexedDB|fetch\(|XMLHttpRequest|Math\.random|Date\.now|setTimeout|setInterval|MutationObserver|addEventListener|innerHTML|\.save\(|generateWeek|renderAll|StoreRunnerRunner|StoreRunnerBehavior|Runner\b|scheduleRoute|forecastThreeWeeks/, 'lecture seule, aucun moteur rejoué, aucune écriture');
  assert.doesNotMatch(block, /optimal|meilleur|plus court|idéal/i, 'aucune promesse d’optimalité dans le code non plus');
  const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'chef-secteur.html'), 'utf8');
  assert.equal(core.split("safeEl('srQuickStart').dataset.srDay=String(day||'');").length - 1, 1, 'le noyau publie le jour de la carte à côté de l’identifiant du magasin (une ligne, aucune fonction enveloppée)');
  assert.match(src, /anchor\.dataset\.srDay/, 'l’Explorer lit ce jour publié, pas une variable privée du noyau');
  assert.match(src, /placement:placementFromQuick\(win,win\.state,id\)/, 'rendu de la fiche : le bloc ne vient que de la carte du planning (quickDay)');
  assert.match(src, /return placementHtml\(o\.placement\)\+'<h3>Magasin 360<\/h3>'/, 'le bloc précède Magasin 360, rien d’autre n’est déplacé');
}
console.log('planning-placement-why-v274: OK — faits seulement, lecture seule, aucun moteur touché');
