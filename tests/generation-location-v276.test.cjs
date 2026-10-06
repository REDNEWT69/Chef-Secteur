/* V276 — « Générer mes 3 semaines » : la position est demandée AVANT toute génération.
 * Contrainte non négociable : jamais d'ancienne position silencieuse, jamais Paris par défaut ; géolocalisation
 * indisponible = uniquement une base explicitement enregistrée, sinon blocage avec un message clair qui nomme
 * le VRAI écran (« Mon secteur »). Ce test garde le contrat côté contrôleur de génération ; l'acquisition et les
 * replis de la position appartiennent à profile-controller.js et sont couverts par planning-fresh-location-r38.
 * Les messages renvoyaient auparavant vers « Mon activité », un écran qui n'existe pas. */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const read = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const WORK = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const results = [];
async function test(name, fn) { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }

function clock(now) { const Real = Date; return class extends Real { constructor(...a) { super(...(a.length ? a : [now + 'T12:00:00'])); } static now() { return new Real(now + 'T12:00:00').getTime(); } }; }
// Le contrôleur réel de génération, dans un contexte isolé : la position, la validité de la base et le moteur sont des doublures ordonnées.
function controller({ origin, validBase = () => true, withOwner = true }) {
  const trace = [], status = { textContent: '', style: {}, dataset: {} };
  const button = { disabled: false, insertAdjacentElement() {} };
  const fields = { weekDate: { value: '2026-09-28' }, rangeStart: { value: '2026-09-28', dataset: {} }, rangeEnd: { value: '' }, planningGenerateStatus: status };
  const doc = { readyState: 'loading', addEventListener() {}, getElementById: id => fields[id] || null, querySelector: () => button, querySelectorAll: () => [button] };
  const state = { profile: { baseName: 'Ancienne position', baseLat: 48.8566, baseLon: 2.3522 }, settings: { weekDate: '2026-09-28', days: WORK }, plan: {}, calendarEvents: [] };
  const terrain = require('../terrain-planning-v1.js');
  const ctx = {
    console, Date: clock('2026-10-03'), JSON, Math, Object, Array, String, Number, Set, Map, RegExp, Promise, document: doc, state,
    addEventListener() {}, setTimeout() {}, CustomEvent: class {},
    storeRunnerHasValidBase: () => { trace.push('base-check'); return validBase(); },
    StoreRunnerTerrainPlanningV1: {
      resolveSnailStart: (...a) => { trace.push('time'); return terrain.resolveSnailStart(...a); },
      generateThreeWeekSnail: async () => { trace.push('engine'); return { totalVisits: 1, uniqueStores: 1 }; }
    }
  };
  if (withOwner) ctx.storeRunnerPreparePlanningOrigin = async () => { trace.push('position'); return origin(state); };
  ctx.window = ctx;
  vm.runInNewContext(read('planning-generation-controller.js'), ctx);
  return { ctx, trace, status, button };
}

(async () => {
  await test('la position est demandée avant le moteur, puis la base est contrôlée', async () => {
    const t = controller({ origin: async () => ({ ok: true, source: 'gps' }) });
    const out = await t.ctx.storeRunnerGenerateThreeWeeks();
    assert.equal(out.ok, true);
    assert.deepEqual(t.trace, ['time', 'position', 'base-check', 'engine']);
  });

  await test('position indisponible sans base enregistrée : blocage, moteur jamais lancé, message du propriétaire relayé tel quel', async () => {
    const message = 'Localisation refusée. Une localisation fraîche est requise : autorise la localisation ou enregistre une adresse de base fiable dans Mon secteur.';
    const t = controller({ origin: async () => ({ ok: false, source: 'none', error: message }) });
    const out = await t.ctx.storeRunnerGenerateThreeWeeks();
    assert.equal(out.ok, false);
    assert.equal(out.error, message);
    assert.ok(!t.trace.includes('engine'), 'aucune génération sans position');
    assert.ok(!t.trace.includes('base-check'), 'l’ancienne base du profil n’est même pas consultée tant que la position est refusée');
    assert.equal(t.status.textContent, message);
    assert.equal(t.button.disabled, false, 'le bouton est libéré');
  });

  await test('refus sans message : texte clair qui nomme « Mon secteur »', async () => {
    const t = controller({ origin: async () => ({ ok: false }) });
    const out = await t.ctx.storeRunnerGenerateThreeWeeks();
    assert.equal(out.ok, false);
    assert.match(out.error, /Mon secteur/);
    assert.doesNotMatch(out.error, /Mon activité/);
    assert.ok(!t.trace.includes('engine'));
  });

  await test('position obtenue mais base invalide : blocage nommant « Mon secteur », jamais de repli silencieux', async () => {
    const t = controller({ origin: async () => ({ ok: true, source: 'gps' }), validBase: () => false });
    const out = await t.ctx.storeRunnerGenerateThreeWeeks();
    assert.equal(out.ok, false);
    assert.match(out.error, /Point de départ incomplet/);
    assert.match(out.error, /Mon secteur/);
    assert.ok(!t.trace.includes('engine'));
  });

  await test('base enregistrée explicitement : utilisée, et le repli est annoncé à l’utilisateur', async () => {
    const t = controller({ origin: async () => ({ ok: true, source: 'saved_base', message: 'Localisation indisponible : utilisation de ta base enregistrée.' }) });
    const out = await t.ctx.storeRunnerGenerateThreeWeeks();
    assert.equal(out.ok, true);
    assert.equal(out.origin, 'saved_base');
    assert.match(t.status.textContent, /Localisation indisponible : utilisation de ta base enregistrée\./);
  });

  await test('propriétaire de la position absent : blocage, aucun repli sur l’ancienne position du profil', async () => {
    const t = controller({ origin: async () => ({ ok: true }), withOwner: false });
    const out = await t.ctx.storeRunnerGenerateThreeWeeks();
    assert.equal(out.ok, false);
    assert.match(out.error, /localisation n’est pas encore chargée/);
    assert.ok(!t.trace.includes('engine'));
  });

  await test('ordre dans le source : la position est attendue AVANT le moteur et avant tout contrôle de base', () => {
    const src = read('planning-generation-controller.js');
    const body = src.slice(src.indexOf('async function generateThreeWeeks'), src.indexOf('function install'));
    const position = body.indexOf('await window.storeRunnerPreparePlanningOrigin()');
    const check = body.indexOf('hasValidBase()');
    const engine = body.indexOf('api.generateThreeWeekSnail(');
    assert.ok(position > 0 && check > position && engine > check, 'position, puis base, puis moteur');
  });

  await test('une seule porte : le moteur 3 semaines n’est lancé que par le contrôleur (les autres fichiers l’enveloppent sans l’appeler)', () => {
    const callers = fs.readdirSync(__dirname + '/..').filter(f => /\.js$/.test(f))
      .filter(f => /\.generateThreeWeekSnail\s*\(/.test(read(f)) && f !== 'terrain-planning-v1.js');
    assert.deepEqual(callers, ['planning-generation-controller.js']);
    // Le guide du premier lancement passe par la même porte, il ne lit jamais la position lui-même.
    assert.match(read('navigation-controller.js'), /window\.storeRunnerGenerateThreeWeeks/);
  });

  await test('jamais Paris par défaut : le profil neuf et le secteur vide n’ont aucune base', () => {
    const html = read('src/chef-secteur.html');
    const fresh = html.slice(html.indexOf('function defaultState()'), html.indexOf('function defaultState()') + 600);
    assert.match(fresh, /baseName:'',baseAddress:'',baseLat:null,baseLon:null/);
    const empty = html.slice(html.indexOf('function loadEmptySector()'), html.indexOf('function loadEmptySector()') + 700);
    assert.match(empty, /baseLat:null/);
    for (const f of ['profile-controller.js', 'planning-generation-controller.js', 'terrain-planning-v1.js']) {
      assert.doesNotMatch(read(f), /48\.85(66)?\b|2\.35(22)?\b/, f + ' ne code aucune coordonnée de Paris');
    }
  });

  await test('les messages nomment un écran qui existe : « Mon secteur » (carte Départ) et jamais « Mon activité »', () => {
    const html = read('src/chef-secteur.html');
    assert.match(html, /<div class="card" id="departureSettings"><h2>Mon secteur<\/h2>/);
    for (const f of ['planning-generation-controller.js', 'profile-controller.js', 'src/chef-secteur.html']) {
      assert.doesNotMatch(read(f), /Mon activité/, f);
    }
    assert.match(read('profile-controller.js'), /adresse de base fiable dans Mon secteur/);
    assert.match(read('src/chef-secteur.html'), /point de départ dans Mon secteur/);
  });

  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' — ' + r.error));
  const failed = results.filter(r => !r.ok);
  console.log(results.length + ' scénarios · ' + failed.length + ' échec(s)');
  if (failed.length) process.exitCode = 1;
})();
