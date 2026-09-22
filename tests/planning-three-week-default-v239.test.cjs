// V239 — la génération du planning est directement le cycle 3 semaines ESCARGOT.
//
// Ce que ce test protège :
//   * le bouton principal s'appelle « Générer mes 3 semaines » et déclenche le moteur
//     3 semaines déjà existant, pas une génération d'une seule semaine ;
//   * la semaine sélectionnée est la première semaine du cycle, et le cycle couvre
//     exactement trois semaines consécutives ;
//   * l'ancienne action séparée « Générer 3 semaines · escargot » a disparu du menu
//     « Planifier plusieurs semaines », sans laisser de séparateur ni de vide ;
//   * les autres actions de ce menu restent en place ;
//   * les protections métier du moteur — visites manuelles, magasins posés, capacité et
//     horaires — sont inchangées, et le recalcul du reste n'est pas touché.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');

const read = name => fs.readFileSync(__dirname + '/../' + name, 'utf8');
const CONTROLLER = read('planning-generation-controller.js');
const UI_FIXES = read('planning-ui-fixes.js');
const SHELL = read('src/chef-secteur.html');
const TERRAIN_SOURCE = read('terrain-planning-v1.js');
const RANGE = read('range-planner-v2.js');
const terrain = require('../terrain-planning-v1.js');

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const LABEL = '✦ Générer mes 3 semaines';

// --- 1. Libellés : une seule action principale, et elle annonce les 3 semaines --------
assert.match(UI_FIXES, /✦ Générer mes 3 semaines/, 'la barre d’outils du planning doit porter le nouveau libellé');
assert.doesNotMatch(UI_FIXES, /Générer ma semaine/, 'l’ancien libellé hebdomadaire ne doit plus exister');
assert.match(SHELL, /data-planning-generate="three-weeks"[^>]*>✦ Générer mes 3 semaines</,
  'le bouton du shell doit porter l’action 3 semaines et son libellé');
assert.doesNotMatch(SHELL.split('\n').filter(l => l.includes('data-planning-generate')).join('\n'),
  /onclick="generateWeek\(\)"/, 'le bouton principal ne doit plus appeler la génération d’une seule semaine');

// --- 2. Le câblage appartient au contrôleur, pas à un onclick inline ------------------
assert.match(CONTROLLER, /data-planning-generate="three-weeks"/,
  'le contrôleur doit reconnaître les boutons de l’action principale');
assert.match(CONTROLLER, /generateThreeWeekSnail/,
  'le contrôleur doit réutiliser le moteur 3 semaines existant au lieu de dupliquer sa logique');
assert.equal((CONTROLLER.match(/window\.generateWeek\s*=(?!=)/g) || []).length, 1,
  'la génération d’une seule semaine garde un propriétaire unique et inchangé');
assert.match(CONTROLLER, /window\.storeRunnerGenerateThreeWeeks\s*=/,
  'l’action 3 semaines doit être publique pour que le planning puisse la rappeler');

// --- 3. L'action séparée a disparu du menu, les autres actions restent ---------------
assert.doesNotMatch(TERRAIN_SOURCE, /Générer 3 semaines · escargot/,
  'l’ancienne action escargot ne doit plus être proposée');
assert.doesNotMatch(TERRAIN_SOURCE, /createElement\('button'\);btn\.id='terrainSnailBtn'/,
  'le module terrain ne doit plus créer de bouton de génération concurrent');
assert.doesNotMatch(CONTROLLER, /terrainSnailBtn/,
  'le contrôleur n’a plus de bouton escargot à requalifier');
assert.match(TERRAIN_SOURCE, /getElementById\('terrainSnailBtn'\)[\s\S]{0,120}removeChild/,
  'un shell encore en cache doit voir son ancien bouton retiré, pas coexister avec le nouveau');
assert.match(TERRAIN_SOURCE, /id='terrainSnailStatus'/,
  'le compte rendu du dernier cycle 3 semaines doit rester lisible');
for (const kept of ['generateRangeBtn', 'Générer la période', 'rangeStart', 'rangeEnd', 'Planifier plusieurs semaines']) {
  assert.ok(RANGE.includes(kept), 'le menu doit garder son action utile : ' + kept);
}
const rangeBody = RANGE.slice(RANGE.indexOf('<summary><span>Planifier plusieurs semaines'), RANGE.indexOf('</div></div>\';') + 14);
assert.doesNotMatch(rangeBody, /<hr|<div><\/div>|<div\s*><\/div>/,
  'aucun séparateur ni bloc vide ne doit rester après la suppression de l’action');

// --- 4. Le bouton principal déclenche le moteur 3 semaines, jamais une seule semaine --
function el(tag) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(), id: '', type: '', className: '', textContent: '',
    disabled: false, hidden: false, tabIndex: 0, style: {}, dataset: {}, attrs: {},
    parentNode: null, children: [], listeners: {},
    setAttribute(k, v) { node.attrs[k] = String(v) },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null },
    appendChild(child) { child.parentNode = node; node.children.push(child); return child },
    insertAdjacentElement(_where, child) { child.parentNode = node.parentNode || node; node.children.push(child); return child },
    addEventListener(type, fn) { (node.listeners[type] = node.listeners[type] || []).push(fn) },
    removeEventListener() {},
    closest(selector) { return (node.matchesList || []).includes(selector) ? node : (node.ancestors || {})[selector] || null },
    scrollIntoView() {}
  };
  return node;
}

function boot(options) {
  const opts = options || {};
  const panel = el('section'); panel.id = 'planPanel';
  const main = el('button');
  main.className = 'primary'; main.textContent = LABEL;
  main.matchesList = ['[data-planning-generate="three-weeks"]'];
  main.ancestors = { '#planPanel': panel };
  const shellButton = el('button');
  shellButton.className = 'primary full'; shellButton.textContent = LABEL;
  shellButton.matchesList = ['[data-planning-generate="three-weeks"]'];
  shellButton.ancestors = { '#planPanel': panel };
  const weekInput = { value: opts.weekDate || '2026-10-08' };
  const byId = { weekDate: weekInput };
  const created = [];
  const docListeners = {};
  const document = {
    readyState: 'complete',
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn) },
    removeEventListener() {},
    dispatchEvent() { return true },
    createElement(tag) { const node = el(tag); created.push(node); return node },
    getElementById(id) { return byId[id] || created.find(node => node.id === id) || null },
    querySelector(selector) {
      if (selector === '#planPanel button.primary.full[data-planning-generate="three-weeks"]') return shellButton;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '#planPanel [data-planning-generate="three-weeks"]') return [main, shellButton];
      return [];
    },
    click(target) {
      (docListeners.click || []).forEach(fn => fn({ target, preventDefault() {} }));
    }
  };
  const calls = { single: 0, three: [], disabledDuringRun: null };
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, Set, Map, RegExp, Promise, setTimeout, clearTimeout,
    document, state: { settings: { weekDate: opts.weekDate || '2026-10-08', days: DAYS.slice(0, 5) }, plan: {}, stores: [] },
    addEventListener() {}, removeEventListener() {},
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init) } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    storeRunnerHasValidBase: () => opts.validBase !== false,
    save() {}, renderAll() {}, confirm: () => true,
    generateWeek: async () => { calls.single++; return { ok: true } },
    storeRunnerGenerateSingleWeek: async () => { calls.single++; return { ok: true } },
    StoreRunnerTerrainPlanningV1: {
      generateThreeWeekSnail: async requested => {
        calls.three.push(requested);
        calls.disabledDuringRun = main.disabled && shellButton.disabled;
        if (opts.engineError) throw new Error(opts.engineError);
        return { totalVisits: 36, uniqueStores: 36, weeks: [{}, {}, {}] };
      }
    }
  };
  ctx.window = ctx;
  vm.runInNewContext(CONTROLLER, ctx);
  return {
    ctx, document, main, shellButton, calls,
    status: () => (document.getElementById('planningGenerateStatus') || {}).textContent || ''
  };
}

async function mainButtonRunsTheExistingThreeWeekEngine() {
  const t = boot();
  t.document.click(t.main);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(t.calls.three.length, 1, 'un clic doit lancer exactement une génération 3 semaines');
  assert.equal(t.calls.single, 0, 'le bouton principal ne doit plus générer une seule semaine');
  // Pas de popup : aucune confirmation ni question semaine/3 semaines avant de lancer.
  assert.equal(t.calls.three[0].start, '2026-10-05',
    'la semaine sélectionnée (lundi de la semaine affichée) doit être le départ du cycle');
  assert.equal(t.calls.disabledDuringRun, true, 'le bouton doit être désactivé pendant la génération');
  assert.equal(t.main.disabled, false, 'le bouton doit être rendu à l’utilisateur après la génération');
  assert.equal(t.shellButton.disabled, false, 'tous les boutons de l’action doivent être libérés');
  assert.match(t.status(), /^Planning généré sur 3 semaines\./, 'le succès doit être annoncé en une phrase courte');
}

async function aFailureKeepsTheExistingErrorMechanism() {
  const t = boot({ engineError: 'Aucun magasin actif ne correspond aux filtres.' });
  t.document.click(t.main);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(t.calls.single, 0, 'un échec ne doit pas retomber sur la génération d’une seule semaine');
  assert.equal(t.status(), 'Aucun magasin actif ne correspond aux filtres.',
    'le message d’erreur du moteur doit être affiché tel quel, sans nouvelle UX');
  assert.equal(t.main.disabled, false, 'le bouton doit être libéré même après un échec');
}

async function anIncompleteBaseStopsBeforeTheEngine() {
  const t = boot({ validBase: false });
  t.document.click(t.main);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(t.calls.three.length, 0, 'sans point de départ, rien ne doit être généré');
  assert.match(t.status(), /Point de départ incomplet/, 'le garde-fou du point de départ reste identique');
}

function recalculationIsUntouched() {
  const t = boot();
  assert.equal(typeof t.ctx.storeRunnerRecalculateRemainingWeek, 'function',
    'le recalcul d’un planning existant doit rester disponible');
  assert.equal(typeof t.ctx.__storeRunnerBuildRemainingWeekPlan, 'function',
    'le moteur de recalcul doit rester exposé pour ses propres tests');
  assert.equal(typeof t.ctx.generateWeek, 'function',
    'generateWeek reste disponible pour ses autres appelants (assistant, régénération d’une journée)');
}

// --- 5. Le moteur : la semaine demandée gagne, et le cycle fait 3 semaines pleines ----
(function theRequestedWeekWinsOverEveryLegacyRule() {
  const fields = { rangeStart: { value: '2026-09-21', dataset: { snailUserEdited: '1' } }, weekDate: { value: '2026-09-21' } };
  const doc = { getElementById: id => fields[id] || null };
  const chosen = terrain.resolveSnailStart({ settings: { weekDate: '2026-09-21' } }, doc, new Date(2026, 8, 13, 12), { start: '2026-10-08' });
  assert.equal(chosen.getFullYear(), 2026);
  assert.equal(chosen.getMonth(), 9);
  assert.equal(chosen.getDate(), 5, 'la semaine transmise par le bouton doit ramener au lundi de cette semaine');
  // Sans semaine imposée, les deux règles historiques restent celles de V1.
  const legacy = terrain.resolveSnailStart({ settings: { weekDate: '2026-09-21' } }, doc, new Date(2026, 8, 13, 12));
  assert.equal(legacy.getDate(), 21, 'une date de début saisie à la main reste prioritaire sans semaine imposée');
})();

function store(i, extra) {
  return Object.assign({ id: 's' + i, enseigne: 'Test', ville: 'Ville ' + i, distance: i, active: true }, extra || {});
}
function flatten(plan) { return DAYS.flatMap(d => plan[d] || []) }
function build(options) {
  return terrain.buildThreeWeekSnail(Object.assign({
    state: { manualWeekEdits: {} }, firstMonday: new Date(2026, 9, 5, 12),
    days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    target: 20, maxCreditsPerDay: 4, stores: Array.from({ length: 83 }, (_, i) => store(i + 1)), archive: {},
    distanceOf: s => s.distance, creditOf: () => 1, lockDayForWeek: () => '', appointmentDay: () => '',
    dayBlocked: () => false, dayFits: () => true
  }, options || {}));
}

(function theCycleCoversExactlyThreeConsecutiveWeeks() {
  const built = build();
  assert.equal(built.weeks.length, 3, 'le cycle doit couvrir exactement trois semaines');
  assert.deepEqual(built.weeks.map(w => w.weekKey), ['2026-10-05', '2026-10-12', '2026-10-19'],
    'les trois semaines doivent être consécutives à partir de la semaine sélectionnée');
  const all = flatten(built.weeks[0].plan).concat(flatten(built.weeks[1].plan), flatten(built.weeks[2].plan)).map(s => s.id);
  assert.equal(new Set(all).size, all.length, 'aucun magasin ne doit être planifié deux fois dans le cycle');
})();

(function manualWeeksAndPinnedStoresStayProtected() {
  // V242 : une semaine modifiée à la main garde ses visites posées sur leur jour, mais
  // n'est plus condamnée à rester avec des jours vides — la capacité encore libre se
  // complète avec le vivier normal (cf. terrain-planning-v1.js, completeProtectedWeek).
  const manualPlan = Object.fromEntries(DAYS.map(d => [d, []]));
  manualPlan.Jeudi = [store(99)];
  const built = build({
    state: { manualWeekEdits: { '2026-10-12': { plan: manualPlan } } },
    lockDayForWeek: (id, weekKey) => (String(id) === 's1' && weekKey === '2026-10-05' ? 'Vendredi' : '')
  });
  assert.equal(built.weeks[1].manual, true, 'une semaine modifiée à la main doit rester intacte');
  assert.ok(built.weeks[1].plan.Jeudi.some(s => s.id === 's99'),
    'la visite posée à la main ne doit jamais être déplacée de son jour');
  assert.equal(flatten(built.weeks[1].plan).length, 20,
    'les jours restés vides doivent maintenant se compléter jusqu’à l’objectif hebdomadaire');
  const all = flatten(built.weeks[0].plan).concat(flatten(built.weeks[1].plan), flatten(built.weeks[2].plan)).map(s => s.id);
  assert.equal(new Set(all).size, all.length,
    'le complètement de la semaine protégée ne doit pas dupliquer un magasin déjà pris ailleurs dans le cycle');
  assert.ok((built.weeks[0].plan.Vendredi || []).some(s => s.id === 's1'),
    'un magasin posé/verrouillé doit rester sur son jour');
  assert.ok(!flatten(built.weeks[1].plan).some(s => s.id === 's1'),
    's1, déjà pris par la semaine 1 via son verrou, ne doit pas être réutilisé pour compléter la semaine protégée');
})();

(function capacityAndOpeningHoursStillDecide() {
  const seen = [];
  const built = build({
    maxCreditsPerDay: 3, creditOf: () => 1,
    dayFits: (route, day) => { seen.push(day); return day !== 'Mercredi' }
  });
  assert.ok(seen.length, 'le moteur doit continuer à demander si la journée tient dans les horaires');
  for (const week of built.weeks) {
    assert.deepEqual(week.plan.Mercredi, [], 'une journée refusée par les horaires doit rester vide');
    for (const day of DAYS) assert.ok((week.plan[day] || []).length <= 3, day + ' dépasse la capacité quotidienne');
  }
})();

(async function run() {
  await mainButtonRunsTheExistingThreeWeekEngine();
  await aFailureKeepsTheExistingErrorMechanism();
  await anIncompleteBaseStopsBeforeTheEngine();
  recalculationIsUntouched();
  console.log('V239 : bouton principal branché sur le cycle 3 semaines ESCARGOT, action redondante retirée, protections intactes.');
})();
