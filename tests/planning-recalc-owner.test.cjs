const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');

const read = name => fs.readFileSync(__dirname + '/../' + name, 'utf8');
const CONTROLLER = read('planning-generation-controller.js');
const CASCADE = read('planning-cascade-v181.js');

assert.doesNotMatch(CONTROLLER, /function\s+buildRemainingWeekPlan|async\s+function\s+recalculateRemainingWeek|function\s+persistManualWeek|function\s+insertRecalculateButton/,
  'le vieux propriétaire de recalcul ne doit plus exister dans le contrôleur');
assert.doesNotMatch(CONTROLLER, /window\.storeRunnerRecalculateRemainingWeek\s*=|window\.__storeRunnerBuildRemainingWeekPlan\s*=/,
  'le contrôleur ne doit plus publier de propriétaire temporaire du recalcul');

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/* Horloge figée : le scénario est celui de la semaine du lundi 2026-10-05 (plan du lundi, « le reste de la semaine »).
   Avec l'horloge réelle, le test échouait dès que ce lundi était passé (le cascade ignore les jours antérieurs à aujourd'hui) :
   tout `verify` lancé après le 05/10/2026 était rouge, y compris celui qui précède un déploiement. Le code testé n'est pas modifié. */
const FIXED_NOW = new Date('2026-10-05T10:00:00').getTime();
class FixedDate extends Date {
  constructor(...args) { if (args.length === 0) super(FIXED_NOW); else super(...args); }
  static now() { return FIXED_NOW; }
}

function node(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    className: '',
    type: '',
    textContent: '',
    hidden: false,
    checked: false,
    value: '',
    tabIndex: 0,
    style: {},
    attrs: {},
    parentNode: null,
    children: [],
    listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child },
    insertAdjacentElement(_where, child) { child.parentNode = this.parentNode || this; this.children.push(child); return child },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn) },
    closest(selector) { return selector === '#planPanel' && this.inPlanPanel ? this.planPanel : null }
  };
}

function boot() {
  const documentListeners = {};
  const windowListeners = {};
  const planPanel = node('section'); planPanel.id = 'planPanel';
  const generate = node('button'); generate.className = 'primary full'; generate.inPlanPanel = true; generate.planPanel = planPanel; generate.parentNode = planPanel;
  const settings = node('details'); settings.id = 'planningSettings';
  const weekDate = { value: '2026-10-05' };
  const byId = { planningSettings: settings, weekDate };
  const emitted = [];
  const workInputs = DAYS.map(day => ({ value: day, checked: day !== 'Samedi' }));

  const document = {
    readyState: 'complete',
    hidden: false,
    addEventListener(type, fn) { (documentListeners[type] = documentListeners[type] || []).push(fn) },
    removeEventListener() {},
    dispatchEvent(event) {
      emitted.push(event);
      (documentListeners[event.type] || []).forEach(fn => fn(event));
      return true;
    },
    createElement(tag) { return node(tag) },
    getElementById(id) {
      const found = byId[id] || null;
      if (found) return found;
      const stack = [settings, planPanel];
      while (stack.length) {
        const item = stack.pop();
        if (item.id === id) return item;
        stack.push(...(item.children || []));
      }
      return null;
    },
    querySelector(selector) {
      if (selector === '#planPanel button.primary.full[data-planning-generate="three-weeks"]') return generate;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '#planPanel [data-planning-generate="three-weeks"]') return [generate];
      if (selector === '#planPanel .applePlanTools button[onclick="generateWeek()"]') return [];
      if (selector === '[data-day]') return workInputs;
      return [];
    }
  };

  const storage = {
    data: Object.create(null),
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null },
    setItem(key, value) { this.data[key] = String(value) },
    removeItem(key) { delete this.data[key] }
  };
  const mk = id => ({ id, enseigne: 'Fnac', ville: id, active: true, lat: 45, lon: 4 });
  const stores = [mk('a'), mk('b')];
  const ctx = {
    console, Date: FixedDate, Math, JSON, Object, Array, String, Number, Set, Map, RegExp, Promise,
    setTimeout, clearTimeout, document,
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}) } },
    localStorage: storage,
    __chefStorage: storage,
    state: {
      stores,
      plan: { Lundi: stores.slice(), Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] },
      settings: { weekDate: '2026-10-05', days: DAYS.slice(0, 5), maxVisitsPerDay: 1 },
      visits: {}, businessV2: { visits: [] }, locks: {}, appointments: [], manualWeekEdits: {}, profile: {}
    },
    addEventListener(type, fn) { (windowListeners[type] = windowListeners[type] || []).push(fn) },
    removeEventListener() {},
    dispatchWindow(type) { (windowListeners[type] || []).forEach(fn => fn({ type })) },
    generateWeek: async () => ({ ok: true }),
    storeRunnerHasValidBase: () => true,
    readPlanningControls() {},
    calendarEventsForDate: () => [],
    StoreOpeningHoursV1: { routeFits: () => true },
    StoreVisitCounting: { credit: () => 1 },
    ChefReliability: {
      checkpoint() {},
      propose: async candidate => { ctx.state.plan = candidate.plan; return true }
    },
    confirm: () => true,
    save() {},
    renderAll() {}
  };
  ctx.window = ctx;

  vm.runInNewContext(CONTROLLER, ctx);
  assert.equal(typeof ctx.storeRunnerRecalculateRemainingWeek, 'undefined',
    'apres le contrôleur seul, aucun recalcul mort ne doit etre publie');
  assert.equal(typeof ctx.__storeRunnerBuildRemainingWeekPlan, 'undefined',
    'apres le contrôleur seul, aucun build de recalcul mort ne doit etre publie');

  vm.runInNewContext(CASCADE, ctx);
  return { ctx, document, emitted };
}

function assertCascadeOwner(ctx, label) {
  assert.equal(typeof ctx.storeRunnerRecalculateRemainingWeek, 'function', label + ' : recalcul public manquant');
  assert.equal(typeof ctx.__storeRunnerBuildRemainingWeekPlan, 'function', label + ' : build public manquant');
  assert.match(String(ctx.storeRunnerRecalculateRemainingWeek), /recalculatePlanningCascade|Recalcul stable du planning/,
    label + ' : le recalcul public doit appartenir a la cascade');
  assert.match(String(ctx.__storeRunnerBuildRemainingWeekPlan), /cascade-credit-v181|MAX_WEEKS/,
    label + ' : le build public doit appartenir a la cascade');
  assert.doesNotMatch(String(ctx.storeRunnerRecalculateRemainingWeek), /Recalculer seulement ce qu.il reste|recalculateRemainingWeek/,
    label + ' : le vieux propriétaire du contrôleur ne doit pas rester expose');
}

(async function run() {
  const t = boot();
  assertCascadeOwner(t.ctx, 'boot');

  t.ctx.storeRunnerRecalculateRemainingWeek = function deadControllerOwner() {};
  t.ctx.__storeRunnerBuildRemainingWeekPlan = function deadControllerBuilder() {};
  t.document.dispatchEvent(new t.ctx.CustomEvent('store-runner:data-restored'));
  assertCascadeOwner(t.ctx, 'restauration');

  t.ctx.storeRunnerRecalculateRemainingWeek = function deadControllerOwner() {};
  t.ctx.__storeRunnerBuildRemainingWeekPlan = function deadControllerBuilder() {};
  t.ctx.document.hidden = false;
  t.document.dispatchEvent(new t.ctx.CustomEvent('visibilitychange'));
  assertCascadeOwner(t.ctx, 'visibilite');

  const result = await t.ctx.storeRunnerRecalculateRemainingWeek();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(JSON.stringify(t.ctx.state.plan.Lundi.map(s => s.id)), JSON.stringify(['a']));
  assert.equal(JSON.stringify(t.ctx.state.plan.Mardi.map(s => s.id)), JSON.stringify(['b']));
  assert.ok(t.emitted.some(event => event.type === 'store-runner:planning-updated' && event.detail && event.detail.source === 'recalculatePlanningCascade'),
    'un recalcul reel doit emettre recalculatePlanningCascade');

  console.log('B1 : le recalcul public appartient a planning-cascade-v181 apres boot, restauration et retour de visibilite.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
