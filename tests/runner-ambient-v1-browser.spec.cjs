const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { empty } = require('../store-runner-visit-model.js');
const { latestBuild } = require('../version.json');

// Runner Ambient V1 — dans la VRAIE application, sur appareils émulés (Android 390 et 360 d'abord, iPhone 14 sous Chromium).
// Couche 100 % visuelle : chaque test mesure, scène par scène, qu'elle est présente, qu'elle ne gêne rien (aucun geste capté,
// aucun focus, aucune mutation du DOM de l'écran, aucune donnée, aucun débordement), que les jambes ne sortent qu'assis et que
// l'écran retrouve exactement son état. La suite E2E éteint Ambient par défaut (tools/run-browser-tests.mjs) ; ce spec l'allume
// avec `?e2eAmbient=on`. WebKit (Safari réel) n'est pas disponible ici : à contrôler sur iPhone réel (phase de test terrain).
//   RUNNER_SHOTS_DIR=/chemin  → enregistre aussi des captures PNG des scènes.
const BASE = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const APP_URL = BASE + (BASE.includes('?') ? '&' : '?') + 'e2eAmbient=on';
const SHOTS_DIR = process.env.RUNNER_SHOTS_DIR || '';
const MAIN = 'sector_planner_universal_v1';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const ANDROID_390 = { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } };
const PROFILES = [
  ['Android 390', ANDROID_390],
  ['Android 360 (Galaxy S8)', strip(devices['Galaxy S8'])],
  ['iPhone 14 (Chromium)', strip(devices['iPhone 14'])]
];
test.use({ ...ANDROID_390, timezoneId: 'Europe/Paris', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

function fixture() {
  const mk = (id, enseigne, ville, lat, lon) => ({ id, enseigne, ville, adresse: '1 rue du Test', dept: '57', lat, lon, active: true, priority: 3, intervalDays: 30, freq: 'Mensuel', visitMinutes: 60 });
  const stores = [mk('a1', 'Darty', 'Metz Nord', 49.12, 6.17), mk('a2', 'Boulanger', 'Thionville', 49.35, 6.17), mk('a3', 'Fnac', 'Nancy', 48.69, 6.18), mk('a4', 'Darty', 'Forbach', 49.19, 6.9)];
  return {
    schemaVersion: 5,
    profile: { sectorName: 'Secteur Test', repName: 'Alex', baseName: 'Base Test', baseAddress: '3 rue du Test', baseLat: 49.1, baseLon: 6.1, overnight: 'never' },
    settings: { days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], startTime: '08:30', endTime: '18:00', weekDate: '2026-10-05', visitMinutes: 60, target: 15 },
    stores, plan: { Lundi: [], Mardi: [], Mercredi: [stores[0], stores[1]], Jeudi: [stores[2]], Vendredi: [stores[3]], Samedi: [] },
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {}, businessV2: empty()
  };
}

/* Sondes embarquées : un échantillon décrit tout ce que le contrat promet (un seul Runner visible, aucun geste capté, jambes,
   débordement, compteur de Runners). `run` joue une scène et échantillonne toutes les 100 ms jusqu'à sa fin. */
async function prepare(page, { reduced = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-07T10:00:00+02:00'));
  await page.addInitScript(({ initial, main, build }) => {
    try {
      localStorage.setItem('store-runner-onboarding-v1', JSON.stringify({ version: 1, status: 'complete', step: 3, reason: 'e2e-fixture' }));
      localStorage.setItem('store-runner-last-seen-build', build);
      localStorage.setItem('store-runner-whatsnew-last-build', build);
      if (!localStorage.getItem('ambient-fixture')) { localStorage.setItem(main, JSON.stringify(initial)); localStorage.setItem('ambient-fixture', '1'); }
    } catch (e) {}
    const audit = window.__ambientAudit = { timers: [], pending: new Set(), maxPending: 0, intervals: 0, raf: 0, listeners: [] };
    const mine = () => /runner-ambient\.js/.test(new Error().stack || '');
    const st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval, raf = window.requestAnimationFrame, add = EventTarget.prototype.addEventListener;
    window.setTimeout = function (fn, delay, ...args) {
      if (!mine()) return st.call(this, fn, delay, ...args);
      audit.timers.push(delay);
      let id;
      id = st.call(this, (...v) => { audit.pending.delete(id); if (typeof fn === 'function') fn(...v); }, delay, ...args);
      audit.pending.add(id); audit.maxPending = Math.max(audit.maxPending, audit.pending.size);
      return id;
    };
    window.clearTimeout = function (id) { audit.pending.delete(id); return ct.call(this, id); };
    window.setInterval = function (...args) { if (mine()) audit.intervals++; return si.apply(this, args); };
    window.requestAnimationFrame = function (...args) { if (mine()) audit.raf++; return raf.apply(this, args); };
    EventTarget.prototype.addEventListener = function (type, ...rest) { if (mine()) audit.listeners.push(type); return add.call(this, type, ...rest); };
    /* Audit à la source des écritures DOM : tant que `watch` est vrai, tout appel d'écriture dont la pile passe par runner-ambient.js est
       compté (`ops`) ; hors calque, <html data-sr-ambient>, <head> (feuille de style) et ajout du calque au <body>, il est « étranger ». */
    audit.watch = false; audit.ops = 0; audit.foreign = [];
    const inLayer = n => { const e = n && n.nodeType === 1 ? n : n && n.parentElement; return !!(e && e.closest && e.closest('#srAmbientLayer')); };
    const allowed = (n, key, args) => inLayer(n) || n === document.head || (n === document.documentElement && args[0] === 'data-sr-ambient')
      || (n === document.body && /Child|append/.test(key) && args[0] && args[0].id === 'srAmbientLayer');
    const guard = (proto, key) => {
      const original = proto[key];
      if (typeof original !== 'function') return;
      proto[key] = function (...args) {
        if (audit.watch && mine()) {
          audit.ops++;
          if (!allowed(this, key, args)) audit.foreign.push(key + ':' + (this.id || this.nodeName) + ':' + (typeof args[0] === 'string' ? args[0] : ''));
        }
        return original.apply(this, args);
      };
    };
    for (const key of ['setAttribute', 'removeAttribute', 'toggleAttribute', 'remove', 'append', 'prepend', 'replaceChildren', 'before', 'after', 'insertAdjacentElement']) guard(Element.prototype, key);
    for (const key of ['appendChild', 'insertBefore', 'removeChild', 'replaceChild']) guard(Node.prototype, key);

    const visibleFigure = el => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!(r.width > 0 && r.height > 0) || cs.visibility === 'hidden') return false;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return false; }
      return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const sample = () => {
      const layer = document.getElementById('srAmbientLayer'), actor = document.querySelector('#srAmbientLayer .srAmbientActor');
      const art = actor && actor.querySelector('.rnLegs'), figure = actor && actor.querySelector('.srRunnerFigure');
      const status = StoreRunnerAmbient.status();
      let hit = null;
      if (figure) { const f = figure.getBoundingClientRect(); hit = document.elementsFromPoint(f.left + f.width / 2, f.top + f.height / 2).some(e => e.closest('#srAmbientLayer')); }
      return {
        t: performance.now(), vw: innerWidth, vh: innerHeight, running: status.running, scene: status.scene, posture: status.posture, anchor: status.anchor,
        layerOn: !!layer && layer.hasAttribute('data-on'), popover: !!layer && layer.matches(':popover-open'),
        actor: actor ? rect(figure) : null, actorVisibility: actor ? getComputedStyle(actor).visibility : null,
        layerPointer: layer ? getComputedStyle(layer).pointerEvents : null, actorPointer: actor ? getComputedStyle(actor).pointerEvents : null,
        figuresVisible: [...document.querySelectorAll('.srRunnerFigure')].filter(visibleFigure).length,
        legs: art ? { opacity: getComputedStyle(art).opacity, visibility: getComputedStyle(art).visibility } : null,
        hit, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight, mounted: Runner.mounted(),
        highlights: window.CSS && CSS.highlights ? CSS.highlights.size : 0, clones: document.querySelectorAll('.srAmbientLetter').length,
        ambientAttr: document.documentElement.hasAttribute('data-sr-ambient'), active: document.activeElement && (document.activeElement.id || document.activeElement.tagName)
      };
    };
    window.__amb = {
      sample, rect,
      async run(id, every = 100) {
        const samples = []; let done = false;
        const p = StoreRunnerAmbient.play(id).then(r => { done = true; return r; });
        while (!done) { samples.push(sample()); await new Promise(r => st.call(window, r, every)); }
        return { res: await p, samples };
      }
    };
  }, { initial: fixture(), main: MAIN, build: latestBuild });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
}
const ready = page => page.waitForFunction(() => window.Runner && window.StoreRunnerAmbient && window.StoreRunnerHomeV204 && window.__chefStorage && window.__amb && document.querySelector('#homeRunnerV270 .srRunner'), null, { timeout: 60000 });
async function boot(page, options) {
  await prepare(page, options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.evaluate(() => StoreRunnerAmbient.stop());
  return errors;
}
/* Accueil prêt et calme : entrée de Runner terminée, aucune ligne de voix, aucun mouvement de l'hôte. */
async function settleHome(page) {
  await page.waitForFunction(() => { const h = document.querySelector('#homeRunnerV270 .srRunner'); return h && h.getAnimations({ subtree: true }).every(a => a.id === 'runner-idle' || a.playState !== 'running'); }, null, { timeout: 30000 });
  await page.evaluate(() => window.goTab('storesPanel'));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.goTab('homePanel'));
  await page.waitForFunction(() => { const l = document.getElementById('homeRunnerLineV273'), h = document.querySelector('#homeRunnerV270 .srRunner'); return (!l || l.hidden) && h && h.getAnimations({ subtree: true }).every(a => !/^runner-(scene|return|react)$/.test(a.id) || a.playState !== 'running'); }, null, { timeout: 30000 });
  await page.waitForFunction(() => { const b = document.getElementById('storeRunnerUpdateBanner'); return !b || b.hidden; });
}
async function openPlanning(page) {
  await page.evaluate(() => window.goTab('planPanel'));
  await page.waitForFunction(() => document.querySelector('.periodDayTab'), null, { timeout: 30000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('.periodDayTab')].find(x => /Mer/.test(x.textContent)); b && b.click(); });
  await page.waitForFunction(() => { const f = document.querySelector('#planningRunnerV269 .srRunnerFigure'); return f && f.getBoundingClientRect().width > 0; }, null, { timeout: 30000 });
  await page.waitForTimeout(600);
}
const snapshot = page => page.evaluate(main => ({ state: JSON.stringify(state), main: __chefStorage.getItem(main), archive: __chefStorage.getItem('chef_sector_plan_archive_v1'), local: JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])) }), MAIN);
const auditOn = page => page.evaluate(() => { __ambientAudit.foreign.length = 0; __ambientAudit.ops = 0; __ambientAudit.watch = true; });
const auditOff = page => page.evaluate(() => { __ambientAudit.watch = false; return { foreign: __ambientAudit.foreign.slice(), ops: __ambientAudit.ops }; });
const keyRects = (page, selectors) => page.evaluate(selectors => Object.fromEntries(selectors.map(s => { const e = document.querySelector(s); return [s, e ? __amb.rect(e) : null]; })), selectors);
const shot = async (page, name) => { if (SHOTS_DIR) { fs.mkdirSync(SHOTS_DIR, { recursive: true }); await page.screenshot({ path: path.join(SHOTS_DIR, name + '.png') }); } };

/* Contrat commun d'une scène, vérifié sur TOUS les échantillons. */
function expectScene(result, { sits = false, label, mounted }) {
  const { res, samples } = result;
  expect(res, label + ' : la scène se joue').toMatchObject({ played: true, reason: 'done' });
  const live = samples.filter(s => s.running && s.actor);
  expect(live.length, label + ' : Runner Ambient est visible pendant la scène').toBeGreaterThan(8);
  let lastSeated = -Infinity;
  for (const s of samples) {
    if (s.posture === 'seated') lastSeated = s.t;
    expect(s.mounted, label + ' : l’acteur détaché n’est jamais compté').toBe(mounted);
    expect(s.overflow, label + ' : aucun débordement horizontal').toBeLessThanOrEqual(0);
    if (s.layerOn) {
      expect(s.layerPointer, label + ' : calque en pointer-events:none').toBe('none');
      expect(s.hit, label + ' : aucun geste n’atteint l’acteur').toBe(false);
    }
    if (s.running && s.actor && s.actorVisibility !== 'hidden') {
      const inView = s.actor.right > 0 && s.actor.left < s.vw && s.actor.bottom > 0 && s.actor.top < s.vh;
      if (inView) expect(s.figuresVisible, label + ' : un seul Runner visible à l’écran').toBe(1);
      else expect(s.figuresVisible, label + ' : acteur encore hors écran, jamais deux Runners').toBeLessThanOrEqual(1);
    }
    /* Les jambes finissent de se replier pendant ≤ 450 ms après la posture assise (transition voulue) ; ensuite elles sont rentrées. */
    if (s.legs && s.posture !== 'seated' && s.t - lastSeated > 450) {
      expect(s.legs.visibility, label + ' : jambes rentrées tant que Runner flotte').toBe('hidden');
      expect(Number(s.legs.opacity), label + ' : jambes transparentes tant que Runner flotte').toBeLessThan(.1);
    }
  }
  const seated = samples.filter(s => s.posture === 'seated');
  if (sits) {
    expect(seated.length, label + ' : Runner s’assoit').toBeGreaterThan(5);
    expect(seated.some(s => s.legs && s.legs.visibility === 'visible' && Number(s.legs.opacity) > .9), label + ' : jambes visibles assis').toBe(true);
    expect(samples.filter(s => s.posture !== 'seated' && s.t < seated[0].t).every(s => !s.legs || s.legs.visibility === 'hidden'), label + ' : en vol avant de s’asseoir, jamais de jambes').toBe(true);
  } else {
    expect(seated.length, label + ' : jamais assis dans cette scène').toBe(0);
  }
  return live;
}
async function expectCalm(page, label, mounted, maxTimers = 0) {
  const end = await page.evaluate(() => { const l = document.getElementById('srAmbientLayer'); return { on: !!l && l.hasAttribute('data-on'), scenes: document.querySelectorAll('.srAmbientScene,.srAmbientActor,.srAmbientLetter,[data-sr-ambient-actor]').length, attr: document.documentElement.hasAttribute('data-sr-ambient'), hl: CSS.highlights.size, popover: !!l && l.hasAttribute('popover'), z: l ? l.style.zIndex : '', status: StoreRunnerAmbient.status(), mounted: Runner.mounted() }; });
  expect(end, label + ' : tout est rendu à l’écran après la scène').toMatchObject({ on: false, scenes: 0, attr: false, hl: 0, popover: false, z: '' });
  if (mounted !== undefined) expect(end.mounted, label + ' : aucun Runner de plus').toBe(mounted);
  expect(end.status.running).toBe(false);
  expect(end.status.pendingTimers, label + ' : au plus la prochaine cadence en attente').toBeLessThanOrEqual(maxTimers);
}

for (const [name, device] of PROFILES) {
  test.describe(name, () => {
    test.use({ ...device, timezoneId: 'Europe/Paris', serviceWorkers: 'block' });

    test('Accueil : scènes de lettres, assise et peek, un seul Runner, aucune mutation, rien de changé', async ({ page }) => {
      test.setTimeout(240000);
      const errors = await boot(page);
      await settleHome(page);
      const scenes = name === 'Android 390' ? ['letter-push', 'letter-double', 'sit-edge', 'peek-behind'] : ['letter-push', 'sit-edge'];
      const before = await snapshot(page);
      const mounted = await page.evaluate(() => Runner.mounted());
      expect(mounted).toBe(1);
      const title = await page.locator('#premiumHomeV2 .phTitle').textContent();
      const geometry = ['#premiumHomeV2 .phTitle', '#premiumHomeV2 .phVisitCard', '#premiumHomeV2 .phTerrain', '#homeRunnerV270 .srRunnerFigure'];
      const rectsBefore = await keyRects(page, geometry);
      const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight);
      await auditOn(page);
      for (const id of scenes) {
        const result = await page.evaluate(id => __amb.run(id), id);
        const edge = id === 'sit-edge' || id === 'peek-behind';
        if (edge && name !== 'Android 390' && !result.res.played) {
          /* Petit écran : pas de rebord libre = pas de scène (jamais de texte recouvert). */
          expect(result.res, id + ' : seule raison admise de ne pas jouer').toEqual({ played: false, reason: 'no-spot' });
          continue;
        }
        const live = expectScene(result, { sits: id === 'sit-edge', label: name + ' / Accueil / ' + id, mounted });
        if (id.startsWith('letter')) {
          expect(result.samples.some(s => s.clones > 0 && s.highlights === 1), id + ' : la lettre réelle est masquée par un surlignage, un clone la remplace').toBe(true);
          expect(result.samples.every(s => s.clones === 0 || s.highlights === 1), id + ' : jamais de clone sans masque').toBe(true);
        }
        expect(result.samples.every(s => s.scrollHeight === heightBefore), id + ' : aucun saut de mise en page').toBe(true);
        if (id === 'sit-edge') await shot(page, name.replace(/\W+/g, '-') + '-accueil-assis');
        expect(live[0].actor.width, 'acteur à la taille de Runner sm').toBeCloseTo(56, 0);
        await expectCalm(page, name + ' / Accueil / ' + id, mounted);
        await page.waitForTimeout(150);
      }
      const audited = await auditOff(page);
      expect(audited.ops, 'témoin : l’audit voit bien le travail DOM d’Ambient').toBeGreaterThan(20);
      expect(audited.foreign, 'Ambient n’écrit jamais dans le DOM de l’Accueil (hors son calque)').toEqual([]);
      expect(await page.locator('#premiumHomeV2 .phTitle').textContent()).toBe(title);
      expect(await keyRects(page, geometry)).toEqual(rectsBefore);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(heightBefore);
      expect(await snapshot(page), 'aucune donnée ni stockage modifié').toEqual(before);
      expect(errors).toEqual([]);
    });

    test('Planning : observation et assise près des blocs, hôte prêté puis rendu', async ({ page }) => {
      test.setTimeout(240000);
      const errors = await boot(page);
      await settleHome(page);
      await openPlanning(page);
      const before = await snapshot(page);
      const mounted = await page.evaluate(() => Runner.mounted());
      const hostFigure = '#planningRunnerV269 .srRunnerFigure';
      const bubbleBefore = await page.locator('#planningRunnerV269 .srRunnerBubble').textContent();
      const geometry = ['#planningHeroV2', '#planningTerrainBtn', '#dayTabs', '#planningRunnerV269', '#planningCoverageV263'];
      const rectsBefore = await keyRects(page, geometry);
      await auditOn(page);
      const played = [];
      for (const id of ['observe-card', 'sit-edge', 'peek-behind']) {
        const result = await page.evaluate(id => __amb.run(id), id);
        if (!result.res.played) { expect(['no-spot'], id + ' : seule raison admise de ne pas jouer').toContain(result.res.reason); continue; }
        played.push(id);
        const live = expectScene(result, { sits: id === 'sit-edge', label: name + ' / Planning / ' + id, mounted });
        expect(result.samples.some(s => s.running && s.actor && s.figuresVisible === 1), id + ' : l’hôte du Planning est prêté, jamais doublé').toBe(true);
        expect(live[0].actor.width).toBeCloseTo(56, 0);
        if (id === 'sit-edge') await shot(page, name.replace(/\W+/g, '-') + '-planning-assis');
        await expectCalm(page, name + ' / Planning / ' + id, mounted);
        expect(await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).visibility, hostFigure), 'figure de l’hôte rendue').toBe('visible');
      }
      expect(played.length, 'au moins une scène du Planning joue : ' + played.join(',')).toBeGreaterThanOrEqual(1);
      if (name === 'Android 390') expect(played, 'référence Android 390 : observe-card et sit-edge jouent').toEqual(expect.arrayContaining(['observe-card', 'sit-edge']));
      const audited = await auditOff(page);
      expect(audited.ops, 'témoin : l’audit voit bien le travail DOM d’Ambient').toBeGreaterThan(20);
      expect(audited.foreign, 'Ambient n’écrit jamais dans le DOM du Planning (hors son calque)').toEqual([]);
      expect(await page.locator('#planningRunnerV269 .srRunnerBubble').textContent(), 'la voix du Planning est intacte').toBe(bubbleBefore);
      expect(await keyRects(page, geometry)).toEqual(rectsBefore);
      expect(await snapshot(page)).toEqual(before);
      expect(errors).toEqual([]);
    });

    test('Saisie : un champ actif déclenche Runner, la frappe et le focus restent intacts, modal compris', async ({ page }) => {
      test.setTimeout(240000);
      const errors = await boot(page);
      await settleHome(page);
      await page.evaluate(() => window.goTab('profilePanel'));
      await page.waitForSelector('#pSector', { state: 'visible' });
      const original = await page.inputValue('#pSector');
      const before = await snapshot(page);
      const mounted = await page.evaluate(() => Runner.mounted());
      await page.evaluate(() => { window.__focusEvents = []; for (const t of ['focusin', 'focusout']) document.addEventListener(t, e => window.__focusEvents.push(t + ':' + (e.target.id || e.target.tagName)), true); window.__inputs = 0; document.addEventListener('input', () => window.__inputs++, true); });
      /* 1. Le focus arme une scène courte (1,2 à 2,2 s), sans aucun appel de test. */
      await page.evaluate(() => StoreRunnerAmbient.start());
      await page.focus('#pSector');
      await page.waitForFunction(() => StoreRunnerAmbient.status().scene === 'lean-field', null, { timeout: 8000 });
      const mid = await page.evaluate(() => __amb.sample());
      expect(mid).toMatchObject({ running: true, scene: 'lean-field', layerOn: true, layerPointer: 'none', hit: false, posture: 'floating', active: 'pSector' });
      expect(mid.actor.width, 'Runner réduit à 75 % près d’un champ').toBeLessThan(45);
      await shot(page, name.replace(/\W+/g, '-') + '-saisie');
      /* 2. Frapper pendant la scène : rien n'est avalé, rien n'est ajouté. */
      await page.keyboard.type('Zed');
      expect(await page.inputValue('#pSector')).toBe(original + 'Zed');
      expect(await page.evaluate(() => window.__inputs)).toBe(3);
      expect(await page.evaluate(() => document.activeElement.id), 'le focus n’a pas bougé').toBe('pSector');
      expect(await page.evaluate(() => window.__focusEvents), 'aucun focus pris ni rendu par Ambient').toEqual(['focusin:pSector']);
      const s = await page.evaluate(() => __amb.sample());
      expect(s.overflow).toBeLessThanOrEqual(0);
      /* 3. Perdre le focus : Runner repart sans attendre la fin de la scène. */
      await page.evaluate(() => document.getElementById('pSector').blur());
      await page.waitForFunction(() => !StoreRunnerAmbient.status().running, null, { timeout: 2500 });
      await expectCalm(page, name + ' / saisie / blur', mounted, 1);
      await page.evaluate(() => StoreRunnerAmbient.stop());
      await page.fill('#pSector', original);
      expect(await snapshot(page), 'aucune donnée ajoutée par Ambient').toEqual(before);
      /* 4. Dialogue modal (rendez-vous) : le calque est promu au-dessus du modal, le champ garde le focus. */
      await page.evaluate(() => document.getElementById('apptDlg').showModal());
      await page.focus('#aNote');
      await page.evaluate(() => { window.__focusEvents = []; });
      const run = await page.evaluate(() => { const p = __amb.run('lean-field'); return p; });
      expect(run.res).toMatchObject({ played: true });
      const inModal = run.samples.filter(x => x.running && x.actor);
      expect(inModal.length).toBeGreaterThan(8);
      expect(inModal.every(x => x.popover === true), 'calque promu en couche supérieure (Popover) au-dessus du dialogue').toBe(true);
      expect(inModal.every(x => x.hit === false && x.layerPointer === 'none' && x.active === 'aNote' && x.overflow <= 0)).toBe(true);
      expect(await page.evaluate(() => window.__focusEvents), 'aucun focus déplacé').toEqual([]);
      await expectCalm(page, name + ' / saisie / modal', mounted);
      expect(await page.evaluate(() => document.activeElement.id)).toBe('aNote');
      await page.evaluate(() => document.getElementById('apptDlg').close());
      expect(errors).toEqual([]);
    });
  });
}

test.describe('Cadence, timers et garde-fous (Android 390)', () => {
  test('scène autonome toutes les ~10 s, une seule temporisation, aucun intervalle ni image d’animation', async ({ page }) => {
    test.setTimeout(150000);
    const errors = await boot(page);
    await settleHome(page);
    await page.evaluate(() => { StoreRunnerAmbient.start(); window.__starts = []; let was = false; window.__poll = setInterval(() => { const r = StoreRunnerAmbient.status().running; if (r && !was) window.__starts.push(performance.now()); if (!r && was) window.__ends = (window.__ends || []).concat(performance.now()); was = r; }, 50); });
    await page.waitForFunction(() => window.__starts.length >= 2 && (window.__ends || []).length >= 1, null, { timeout: 110000 });
    const t = await page.evaluate(() => ({ starts: window.__starts, ends: window.__ends, audit: { timers: window.__ambientAudit.timers, maxPending: window.__ambientAudit.maxPending, intervals: window.__ambientAudit.intervals, raf: window.__ambientAudit.raf, listeners: [...new Set(window.__ambientAudit.listeners)].sort() } }));
    await page.evaluate(() => { clearInterval(window.__poll); StoreRunnerAmbient.stop(); });
    const calm = (t.starts[1] - t.ends[0]) / 1000;
    expect(calm, 'calme entre la fin d’une scène et la suivante : ' + calm.toFixed(2) + ' s').toBeGreaterThan(7.6);
    expect(calm).toBeLessThan(12.8);
    expect(t.audit.intervals, 'aucun setInterval').toBe(0);
    expect(t.audit.raf, 'aucune boucle requestAnimationFrame').toBe(0);
    expect(t.audit.maxPending, 'au plus la cadence et le chien de garde').toBeLessThanOrEqual(2);
    for (const d of t.audit.timers) expect((d >= 8000 && d <= 12000) || (d >= 1200 && d <= 2200) || (d >= 11000 && d <= 12000), 'délai de temporisation ' + d).toBe(true);
    expect(t.audit.listeners.filter(x => !['visibilitychange', 'pagehide', 'pageshow', 'focusin', 'focusout', 'change', 'load', 'scroll', 'resize', 'store-runner:appearance-closed'].includes(x)), 'aucune écoute d’interaction').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('garde-fous : la voix de l’Accueil, un état métier, un recouvrement, Discret ou une bannière coupent Ambient', async ({ page }) => {
    test.setTimeout(200000);
    const errors = await boot(page);
    /* La voix de l'Accueil (V273/V276) prime : tant que sa ligne est affichée, Runner reste à sa place. */
    await page.waitForFunction(() => { const h = document.querySelector('#homeRunnerV270 .srRunner'); return h && h.getAnimations({ subtree: true }).every(a => a.id === 'runner-idle' || a.playState !== 'running'); }, null, { timeout: 30000 });
    const voice = await page.evaluate(() => { const l = document.getElementById('homeRunnerLineV273'); return l && !l.hidden ? l.textContent : ''; });
    if (voice) {
      expect(await page.evaluate(() => StoreRunnerAmbient.play('sit-edge'))).toEqual({ played: false, reason: 'home-voice' });
      expect(await page.evaluate(() => document.getElementById('homeRunnerLineV273').textContent), 'la voix n’est pas modifiée').toBe(voice);
    }
    await settleHome(page);
    const reason = id => page.evaluate(id => StoreRunnerAmbient.play(id).then(r => r.reason), id);
    /* Un état métier de Runner (alerte, succès, analyse) prime sur le décor. */
    await page.evaluate(() => document.querySelector('#homeRunnerV270 .srRunner').setAttribute('data-state', 'alert'));
    expect(await reason('letter-push')).toBe('host-state');
    await page.evaluate(() => document.querySelector('#homeRunnerV270 .srRunner').setAttribute('data-state', 'neutral'));
    /* Recouvrements : assistant, premier lancement, dialogue non autorisé, bannière de mise à jour. */
    await page.evaluate(() => document.getElementById('assistantPanel').classList.add('open'));
    expect(await reason('letter-push')).toBe('overlay');
    await page.evaluate(() => document.getElementById('assistantPanel').classList.remove('open'));
    await page.evaluate(() => document.documentElement.classList.add('srFirstRunOpen'));
    expect(await reason('letter-push')).toBe('first-run');
    await page.evaluate(() => document.documentElement.classList.remove('srFirstRunOpen'));
    await page.evaluate(() => document.getElementById('storeHoursDialog').showModal());
    expect(await reason('letter-push')).toBe('dialog');
    await page.evaluate(() => document.getElementById('storeHoursDialog').close());
    await page.evaluate(() => { const a = document.createElement('aside'); a.id = 'storeRunnerUpdateBanner'; a.textContent = 'maj'; document.body.appendChild(a); });
    expect(await reason('letter-push')).toBe('update');
    await page.evaluate(() => document.getElementById('storeRunnerUpdateBanner').remove());
    /* Clavier ouvert sans champ : plus rien ; mouvement réduit : plus rien. */
    await page.evaluate(() => document.documentElement.setAttribute('data-sr-keyboard', 'open'));
    expect(await reason('sit-edge')).toBe('no-context');
    await page.evaluate(() => document.documentElement.removeAttribute('data-sr-keyboard'));
    /* Personnalité Discret (existante) : Ambient se tait. */
    const persona = await page.evaluate(() => StoreRunnerBehavior.controller().personality());
    await page.evaluate(() => StoreRunnerBehavior.controller().setPersonality('discret'));
    expect(await reason('letter-push')).toBe('quiet-personality');
    await page.evaluate(p => StoreRunnerBehavior.controller().setPersonality(p), persona);
    /* Autres écrans : V1 dort. */
    await page.evaluate(() => window.goTab('storesPanel'));
    expect(await reason('sit-edge')).toBe('no-context');
    /* Aucune scène, aucun calque pendant tout cela. */
    expect(await page.evaluate(() => { const l = document.getElementById('srAmbientLayer'); return !l || (!l.hasAttribute('data-on') && !l.children.length); })).toBe(true);
    expect(errors).toEqual([]);
  });

  test('Discret : la cadence dort, puis reprend quand la feuille Apparence se ferme', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await boot(page);
    await settleHome(page);
    const persona = await page.evaluate(() => StoreRunnerBehavior.controller().personality());
    /* Démarrage en Discret : aucune temporisation retenue. */
    await page.evaluate(() => { StoreRunnerBehavior.controller().setPersonality('discret'); StoreRunnerAmbient.start(); });
    expect(await page.evaluate(() => StoreRunnerAmbient.status().pendingTimers), 'Discret : aucune cadence').toBe(0);
    /* Retour à une autre personnalité : rien ne bouge tant que la feuille Apparence n'est pas refermée... */
    await page.evaluate(p => StoreRunnerBehavior.controller().setPersonality(p), persona);
    expect(await page.evaluate(() => StoreRunnerAmbient.status().pendingTimers)).toBe(0);
    /* ...puis sa fermeture (événement public déjà utilisé par l'Accueil) ré-arme UNE cadence, une seule fois. */
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('store-runner:appearance-closed')));
    expect(await page.evaluate(() => StoreRunnerAmbient.status().pendingTimers), 'cadence ré-armée').toBe(1);
    const delay = await page.evaluate(() => { const t = __ambientAudit.timers; return t[t.length - 1]; });
    expect(delay).toBeGreaterThanOrEqual(8000);
    expect(delay).toBeLessThanOrEqual(12000);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('store-runner:appearance-closed')));
    expect(await page.evaluate(() => __ambientAudit.timers.length), 'une cadence saine n’est pas remise à zéro').toBe(await page.evaluate(() => __ambientAudit.timers.length));
    expect(await page.evaluate(() => StoreRunnerAmbient.status().pendingTimers)).toBe(1);
    await page.evaluate(() => StoreRunnerAmbient.stop());
    expect(errors).toEqual([]);
  });

  test('focus puis blur avant le délai : la minuterie accélérée ne joue pas une scène ordinaire', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await boot(page);
    await settleHome(page);
    await openPlanning(page);
    await page.evaluate(() => { __ambientAudit.timers.length = 0; StoreRunnerAmbient.start(); });
    await page.evaluate(() => { const i = document.querySelector('#planPanel input[type=date]'); i.focus(); i.blur(); });
    /* Fenêtre de la minuterie accélérée (1,2 à 2,2 s) puis marge : aucune scène ne doit démarrer. */
    await page.waitForTimeout(3200);
    expect(await page.evaluate(() => StoreRunnerAmbient.status().running), 'aucune scène ordinaire démarrée trop tôt').toBe(false);
    const timers = await page.evaluate(() => __ambientAudit.timers.slice());
    const fast = timers.filter(d => d >= 1200 && d <= 2200), normal = timers.filter(d => d >= 8000 && d <= 12000);
    expect(fast.length, 'la minuterie accélérée a bien existé : ' + JSON.stringify(timers)).toBeGreaterThanOrEqual(1);
    expect(normal.length, 'et le rythme normal a repris : ' + JSON.stringify(timers)).toBeGreaterThanOrEqual(1);
    expect(timers[timers.length - 1], 'dernier délai armé = rythme normal').toBeGreaterThanOrEqual(8000);
    expect(await page.evaluate(() => StoreRunnerAmbient.status().pendingTimers)).toBe(1);
    await page.evaluate(() => StoreRunnerAmbient.stop());
    expect(errors).toEqual([]);
  });

  test('défilement : l’acteur ne passe jamais sous l’en-tête collant, Runner repart', async ({ page }) => {
    test.setTimeout(150000);
    const errors = await boot(page);
    await settleHome(page);
    await openPlanning(page);
    const run = page.evaluate(() => StoreRunnerAmbient.play('observe-card'));
    await page.waitForFunction(() => StoreRunnerAmbient.status().running && document.querySelector('.srAmbientActor'), null, { timeout: 5000 });
    await page.waitForTimeout(1300);
    const header = await page.evaluate(() => document.querySelector('.top').getBoundingClientRect().bottom);
    /* Un petit défilement est suivi, un grand défilement ramène l'ancre sous l'en-tête. */
    await page.evaluate(() => window.scrollBy(0, 12));
    await page.waitForTimeout(60);
    expect(await page.evaluate(() => StoreRunnerAmbient.status().running), 'petit défilement : la scène continue').toBe(true);
    /* Quelle que soit l'ancre tirée, 700 px la font sortir par le haut (le défilement est lissé : la sortie arrive en cours de route). */
    await page.evaluate(() => window.scrollBy(0, 700));
    expect(await run).toMatchObject({ played: true, reason: 'out-of-bounds' });
    await expectCalm(page, 'ancre sous l’en-tête');
    expect(header).toBeGreaterThan(40);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(errors).toEqual([]);
  });

  test('garde-fous en pleine scène : bannière, voix de l’Accueil et état de l’hôte arrêtent Runner', async ({ page }) => {
    test.setTimeout(200000);
    const errors = await boot(page);
    await settleHome(page);
    const stopWith = async (label, apply, expected, undo) => {
      const scene = page.evaluate(() => StoreRunnerAmbient.play('sit-edge'));
      await page.waitForFunction(() => StoreRunnerAmbient.status().running && document.querySelector('.srAmbientActor'), null, { timeout: 5000 });
      await page.waitForTimeout(500);
      const t0 = Date.now();
      await page.evaluate(apply);
      const r = await scene;
      expect(Date.now() - t0, label + ' : arrêt immédiat').toBeLessThan(1200);
      expect(r, label).toMatchObject({ played: true, reason: expected });
      await expectCalm(page, label);
      await page.evaluate(undo);
      await page.waitForTimeout(250);
    };
    await stopWith('bannière de mise à jour', () => { const a = document.createElement('aside'); a.id = 'storeRunnerUpdateBanner'; a.textContent = 'maj'; document.body.appendChild(a); }, 'blocked', () => document.getElementById('storeRunnerUpdateBanner').remove());
    await stopWith('voix de l’Accueil', () => { const l = document.getElementById('homeRunnerLineV273'); l.textContent = 'Bonne route.'; l.hidden = false; }, 'blocked', () => { const l = document.getElementById('homeRunnerLineV273'); l.hidden = true; l.textContent = ''; });
    await stopWith('état métier de l’hôte', () => document.querySelector('#homeRunnerV270 .srRunner').setAttribute('data-state', 'success'), 'host-state', () => document.querySelector('#homeRunnerV270 .srRunner').setAttribute('data-state', 'neutral'));
    expect(errors).toEqual([]);
  });

  test('mouvement réduit : aucune scène, aucun calque, aucune temporisation ; coupé à chaud', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await boot(page, { reduced: true });
    await page.waitForFunction(() => document.querySelector('#homeRunnerV270 .srRunner'));
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    expect(await page.evaluate(() => StoreRunnerAmbient.play('sit-edge'))).toEqual({ played: false, reason: 'reduced-motion' });
    await page.evaluate(() => StoreRunnerAmbient.start());
    expect(await page.evaluate(() => StoreRunnerAmbient.status())).toMatchObject({ running: false, pendingTimers: 0, layer: false });
    expect(await page.evaluate(() => !document.getElementById('srAmbientLayer')), 'aucun calque n’existe').toBe(true);
    /* À chaud : la préférence système change pendant une scène. */
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await settleHome(page);
    const running = page.evaluate(() => StoreRunnerAmbient.play('sit-edge'));
    const early = await Promise.race([running, page.waitForFunction(() => StoreRunnerAmbient.status().running, null, { timeout: 5000 }).then(() => 'running')]);
    expect(early, 'la scène démarre dès que le mouvement est de nouveau permis').toBe('running');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !StoreRunnerAmbient.status().running, null, { timeout: 2000 });
    expect(await running).toMatchObject({ played: true, reason: 'reduced-motion' });
    await expectCalm(page, 'mouvement réduit à chaud');
    expect(await page.evaluate(() => StoreRunnerAmbient.status().pendingTimers), 'plus aucune temporisation').toBe(0);
    expect(errors).toEqual([]);
  });

  test('navigation : un changement d’onglet ferme la scène, défilement suivi, ancre perdue, passages rapides', async ({ page }) => {
    test.setTimeout(240000);
    const errors = await boot(page);
    await settleHome(page);
    const before = await snapshot(page);
    /* Onglet changé en pleine scène : Runner repart (fondu de 180 ms), l'hôte est rendu. */
    const scene = page.evaluate(() => StoreRunnerAmbient.play('sit-edge'));
    await page.waitForFunction(() => StoreRunnerAmbient.status().running && document.querySelector('.srAmbientActor'), null, { timeout: 5000 });
    const t0 = Date.now();
    await page.evaluate(() => window.goTab('planPanel'));
    const r = await scene;
    expect(Date.now() - t0, 'fermeture rapide').toBeLessThan(900);
    expect(r).toMatchObject({ played: true, reason: 'context' });
    await expectCalm(page, 'onglet changé');
    await page.evaluate(() => window.goTab('homePanel'));
    await page.waitForFunction(() => document.querySelector('#homeRunnerV270 .srRunnerFigure')?.getBoundingClientRect().width > 0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#homeRunnerV270 .srRunnerFigure')).visibility), 'figure de l’hôte rendue').toBe('visible');
    /* Défilement : la scène suit son ancre. */
    await settleHome(page);
    const sc = page.evaluate(() => StoreRunnerAmbient.play('sit-edge'));
    await page.waitForFunction(() => StoreRunnerAmbient.status().posture === 'seated', null, { timeout: 8000 });
    await page.waitForTimeout(400); // l'écrasement à l'assise dure 240 ms
    const a0 = await page.evaluate(() => { const f = document.querySelector('.srAmbientActor .srRunnerFigure').getBoundingClientRect(); return { top: f.top, scroll: scrollY }; });
    await page.evaluate(() => window.scrollBy(0, 70));
    await page.waitForTimeout(80);
    const a1 = await page.evaluate(() => { const f = document.querySelector('.srAmbientActor .srRunnerFigure').getBoundingClientRect(); return { top: f.top, scroll: scrollY }; });
    expect(a1.scroll - a0.scroll, 'le défilement n’est pas bloqué').toBeGreaterThan(40);
    expect(Math.abs((a0.top - a1.top) - (a1.scroll - a0.scroll)), 'Runner suit la page défilée').toBeLessThanOrEqual(1.5);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect((await sc).played).toBe(true);
    await expectCalm(page, 'défilement');
    /* Ancre retirée de la page : Runner repart sans erreur. */
    const gone = page.evaluate(() => StoreRunnerAmbient.play('letter-push'));
    await page.waitForFunction(() => StoreRunnerAmbient.status().running && document.querySelector('.srAmbientActor'), null, { timeout: 5000 });
    await page.evaluate(() => document.querySelector('#premiumHomeV2 .phTitle').remove());
    expect(await gone).toMatchObject({ played: true, reason: 'anchor-lost' });
    await expectCalm(page, 'ancre perdue');
    /* Passages rapides entre onglets avec des scènes lancées : jamais d'acteur ni d'attribut orphelin. */
    for (let i = 0; i < 6; i++) {
      page.evaluate(id => StoreRunnerAmbient.play(id), ['sit-edge', 'observe-card', 'peek-behind'][i % 3]).catch(() => {});
      await page.waitForTimeout(120 + (i % 3) * 90);
      await page.evaluate(p => window.goTab(p), ['planPanel', 'storesPanel', 'homePanel'][i % 3]);
      await page.waitForTimeout(160);
    }
    await page.waitForFunction(() => !StoreRunnerAmbient.status().running, null, { timeout: 15000 });
    await expectCalm(page, 'passages rapides');
    expect(errors).toEqual([]);
    void before;
  });

  test('aucun geste intercepté : toucher et défilement traversent Runner, focus et événements inchangés', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await boot(page);
    await settleHome(page);
    await page.evaluate(() => { window.__taps = []; window.__focus = []; document.addEventListener('click', e => window.__taps.push((e.target.closest('[id]') || e.target).id || e.target.tagName + '.' + e.target.className), true); for (const t of ['focusin', 'focusout']) document.addEventListener(t, e => window.__focus.push(t), true); });
    const scene = page.evaluate(() => __amb.run('letter-push'));
    await page.waitForFunction(() => StoreRunnerAmbient.status().posture !== null && document.querySelector('.srAmbientActor .srRunnerFigure'), null, { timeout: 5000 });
    await page.waitForTimeout(500);
    const p = await page.evaluate(() => { const f = document.querySelector('.srAmbientActor .srRunnerFigure').getBoundingClientRect(); const x = f.left + f.width / 2, y = f.top + f.height / 2; const under = document.elementFromPoint(x, y); return { x, y, under: under && (under.id || under.tagName + '.' + under.className), inLayer: !!(under && under.closest('#srAmbientLayer')) }; });
    expect(p.inLayer, 'le point sous Runner appartient à l’application').toBe(false);
    await page.touchscreen.tap(p.x, p.y);
    const taps = await page.evaluate(() => window.__taps);
    expect(taps, 'le toucher atteint l’élément de l’application, pas Runner').toHaveLength(1);
    expect(taps[0]).not.toMatch(/srAmbient|srRunner/);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => scrollY), 'le défilement n’est jamais bloqué par la scène').toBeGreaterThan(y0);
    expect(await page.evaluate(() => window.__focus), 'aucun focus pris pendant la scène').toEqual([]);
    expect((await scene).res.played).toBe(true);
    expect(errors).toEqual([]);
  });

  test('API de présentation : instance détachée non comptée, posture assise, geste d’inclinaison', async ({ page }) => {
    const errors = await boot(page);
    const r = await page.evaluate(() => {
      const slot = document.createElement('div'); slot.id = 'ambientProbeSlot'; document.body.appendChild(slot);
      const before = Runner.mounted();
      const free = Runner.mount(slot, { size: 'sm', decorative: true, detached: true });
      const out = { before, after: Runner.mounted(), posture: free.getPosture(), floatingLegs: getComputedStyle(free.el.querySelector('.rnLegs')).visibility, bad: free.setPosture('flying'), still: free.getPosture() };
      free.setPosture('seated', { swing: true });
      out.seated = free.getPosture(); out.attr = free.el.getAttribute('data-posture'); out.legs = free.el.getAttribute('data-legs'); out.seatedLegs = getComputedStyle(free.el.querySelector('.rnLegs')).visibility;
      free.setPosture('floating'); out.back = free.el.getAttribute('data-posture'); out.backLegs = free.el.getAttribute('data-legs');
      out.primary = Runner.getState();
      out.tilt = free.react('tilt', { toward: slot });
      const regular = Runner.mount(slot, { size: 'sm', decorative: true });
      out.regularCounted = Runner.mounted(); out.regularPosture = regular.getPosture();
      regular.destroy(); free.destroy(); slot.remove();
      out.final = Runner.mounted();
      return out;
    });
    expect(r).toMatchObject({ before: 1, after: 1, posture: 'floating', floatingLegs: 'hidden', bad: false, still: 'floating', seated: 'seated', attr: 'seated', legs: 'swing', seatedLegs: 'visible', back: 'floating', backLegs: null, regularCounted: 2, regularPosture: 'floating', final: 1 });
    expect(await page.evaluate(() => [...document.querySelectorAll('.srRunner')].every(e => e.getAttribute('data-posture') === 'floating'))).toBe(true);
    expect(await page.evaluate(() => [...document.querySelectorAll('.srRunner .rnLegs')].every(l => getComputedStyle(l).visibility === 'hidden')), 'toutes les surfaces hôtes gardent les jambes rentrées').toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('PWA hors ligne', () => {
  test.use({ serviceWorkers: 'allow' });
  test('le module Ambient est précaché : le rechargement hors ligne le retrouve', async ({ page, context }) => {
    test.setTimeout(120000);
    const errors = await boot(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async rev => {
      const name = (await caches.keys()).find(n => n.includes(rev));
      if (!name) return false;
      return !!await (await caches.open(name)).match(new URL('./runner-ambient.js?rev=' + rev, location.href).href);
    }, latestBuild), { timeout: 40000 }).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    expect(await page.evaluate(() => typeof StoreRunnerAmbient.play)).toBe('function');
    expect(await page.evaluate(() => StoreRunnerAmbient.status().started), 'démarré hors ligne comme en ligne').toBe(true);
    await context.setOffline(false);
    expect(errors.filter(m => !/Failed to fetch|NetworkError|net::/.test(m))).toEqual([]);
  });
});
