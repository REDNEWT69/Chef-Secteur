const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const { empty } = require('../store-runner-visit-model.js');
const { latestBuild } = require('../version.json');

// V270 : c'est l'Accueil réel qui monte Runner. Les données sont synthétiques,
// déposées avant le démarrage, sans appeler ni modifier un moteur de planning.
// L'iPhone est émulé sous Chromium ; un contrôle Safari sur appareil reste distinct.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const SLOT = '#homeRunnerV270';
const MAIN = 'sector_planner_universal_v1';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const PROFILES = [
  ['Android 390', { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } }],
  ['Android 360', strip(devices['Galaxy S8'])],
  ['iPhone 14 (Chromium)', strip(devices['iPhone 14'])]
];
test.use({ timezoneId: 'Europe/Paris', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

function fixture() {
  const stores = [
    { id: 'runner-today', enseigne: 'Darty', ville: 'Ville Test Aujourd’hui', adresse: '1 rue du Test', dept: '69', lat: 45.75, lon: 4.85, active: true, priority: 3, intervalDays: 30, freq: 'Mensuel', visitMinutes: 60 },
    { id: 'runner-next', enseigne: 'Boulanger', ville: 'Ville Test Demain', adresse: '2 rue du Test', dept: '69', lat: 45.85, lon: 4.85, active: true, priority: 3, intervalDays: 30, freq: 'Mensuel', visitMinutes: 60 }
  ];
  return {
    schemaVersion: 5,
    profile: { sectorName: 'Secteur Test', repName: '', baseName: 'Base Test', baseAddress: '3 rue du Test', baseLat: 45.7, baseLon: 4.8, overnight: 'never' },
    settings: { days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], startTime: '08:30', endTime: '18:00', weekDate: '2026-09-21', visitMinutes: 60, target: 15 },
    stores, plan: { Lundi: [], Mardi: [], Mercredi: [stores[0]], Jeudi: [stores[1]], Vendredi: [], Samedi: [] },
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {}, businessV2: empty()
  };
}

async function prepare(page, { tomorrow = false, absent = false } = {}) {
  await page.clock.setFixedTime(new Date(tomorrow ? '2026-09-23T21:15:00+02:00' : '2026-09-23T10:00:00+02:00'));
  await page.addInitScript(({ initial, main, absent }) => {
    if (!localStorage.getItem('runner-v270-fixture')) {
      localStorage.setItem(main, JSON.stringify(initial));
      localStorage.setItem('runner-v270-fixture', '1');
    }
    window.__runnerHomeAudit = { moves: [], poses: [], timers: new Set(), intervals: 0 };
    const audit = window.__runnerHomeAudit, animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const home = this.closest('#homeRunnerV270,#homeRunnerOriginV270');
      const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; };
      const source = home && r(document.getElementById('homeRunnerOriginV270')), figure = home && r(this.querySelector('.srRunnerFigure'));
      const animation = animate.call(this, frames, options);
      if (options?.id === 'runner-idle' || options?.id === 'runner-return') return animation;
      if (home && this.matches('.srRunner')) {
        audit.moves.push({ frames, options, animation, el: this, source, figure });
      } else if (home && this.matches('.rnHead,.rnEyes')) {
        audit.poses.push({ kind: this.classList.contains('rnEyes') ? 'eyes' : 'head', frames, options, animation, el: this });
      }
      return animation;
    };
    // Ne compter que les timers appartenant à Runner : l'Accueil possède déjà
    // son changement de journée et l'application ses autres timers indépendants.
    const st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval;
    window.setTimeout = function (fn, delay, ...args) {
      if (!/runner-visual\.js/.test(new Error().stack || '')) return st.call(this, fn, delay, ...args);
      let id;
      id = st.call(this, (...values) => { audit.timers.delete(id); if (typeof fn === 'function') fn(...values); }, delay, ...args);
      audit.timers.add(id);
      return id;
    };
    window.clearTimeout = function (id) { audit.timers.delete(id); return ct.call(this, id); };
    window.setInterval = function (...args) { if (/runner-visual\.js/.test(new Error().stack || '')) audit.intervals++; return si.apply(this, args); };
    if (absent) {
      const html = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(Element.prototype, 'innerHTML', { ...html, set(value) {
        html.set.call(this, value);
        if (this.id === 'premiumHomeV2') this.querySelectorAll('.phNextDay,.phTerrain,.phVisitCard').forEach(el => el.remove());
      } });
    }
  }, { initial: fixture(), main: MAIN, absent });
}

async function boot(page, options) {
  await prepare(page, options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.addStyleTag({ content: 'aside[role="status"]{display:none!important}' });
  return errors;
}
const ready = page => page.waitForFunction(() => window.Runner && window.StoreRunnerHomeV204 && window.__chefStorage && document.querySelector('#homeRunnerV270 .srRunner'));
const settle = page => page.waitForFunction(() => document.querySelector('#homeRunnerV270 .srRunner')?.getAnimations().every(a => a.playState === 'finished' || a.playState === 'idle'));
async function mobileBack(page) {
  // La coque pose sa sentinelle dans une tâche après le changement de classe.
  // Attendre son état observable évite de quitter le document entre ces deux tâches.
  await expect.poll(() => page.evaluate(() => history.state?.srBack)).toBe(1);
  await page.goBack();
}
const snapshot = page => page.evaluate(main => ({ state: JSON.stringify(state), main: __chefStorage.getItem(main), archive: __chefStorage.getItem('chef_sector_plan_archive_v1'), local: JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])) }), MAIN);
const audit = page => page.evaluate(() => ({ moves: __runnerHomeAudit.moves.length, poses: __runnerHomeAudit.poses.length, active: [...__runnerHomeAudit.moves, ...__runnerHomeAudit.poses].filter(m => !['finished', 'idle'].includes(m.animation.playState)).length, timers: __runnerHomeAudit.timers.size, intervals: __runnerHomeAudit.intervals, mounted: Runner.mounted(), nodes: document.querySelectorAll('#homeRunnerV270 .srRunner').length }));

async function settledGeometry(page, target) {
  await settle(page);
  const view = await page.evaluate(({ slot, target }) => {
    const host = document.querySelector(slot), runner = host.querySelector('.srRunner'), figure = runner.querySelector('.srRunnerFigure');
    const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
    const f = box(figure), card = document.querySelector(target), hit = document.elementFromPoint((f.left + f.right) / 2, (f.top + f.bottom) / 2);
    return {
      figure: f, card: box(card), preparation: box(document.querySelector('#premiumHomeV2 .phVisitCard')), title: box(document.querySelector('#premiumHomeV2 .phTitle')),
      pointer: getComputedStyle(host).pointerEvents, runnerPointer: getComputedStyle(runner).pointerEvents,
      hitRunner: !!hit?.closest('.srRunner'), transform: getComputedStyle(runner).transform,
      state: runner.dataset.state, hiddenBubble: runner.querySelector('.srRunnerBubble').hidden,
      focusable: host.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').length,
      ariaHidden: host.getAttribute('aria-hidden'), figureHidden: figure.getAttribute('aria-hidden'),
      floating: [...host.querySelectorAll('*')].filter(el => ['fixed', 'sticky'].includes(getComputedStyle(el).position)).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, vw: innerWidth
    };
  }, { slot: SLOT, target });
  expect(view).toMatchObject({ pointer: 'none', runnerPointer: 'none', hitRunner: false, state: 'neutral', hiddenBubble: true, focusable: 0, ariaHidden: 'true', figureHidden: 'true', floating: 0, transform: 'none' });
  expect(view.figure.width).toBeCloseTo(56, 0);
  expect(view.figure.left).toBeGreaterThanOrEqual(0);
  expect(view.figure.right).toBeLessThanOrEqual(view.vw);
  expect(view.figure.top).toBeLessThan(view.card.top);
  expect(view.preparation.top - view.figure.bottom, 'Runner posé près de la carte de préparation de tournée').toBeLessThan(100);
  expect(Math.abs(view.figure.top - view.title.top)).toBeLessThan(36);
  expect(view.overflow).toBeLessThanOrEqual(1);
  return view;
}

async function expectOneJourney(page) {
  const moves = await page.evaluate(() => __runnerHomeAudit.moves.map(m => ({ frames: m.frames, options: m.options, source: m.source, figure: m.figure })));
  expect(moves, 'un seul trajet créé par l’Accueil à la première entrée').toHaveLength(1);
  const move = moves[0];
  expect(move.options).toMatchObject({ duration: 8000, iterations: 1 });
  expect(move.options.easing).toBe('linear');
  expect(move.frames[1]).toMatchObject({ offset: .1875, easing: 'cubic-bezier(.4,0,.35,1)' });
  expect(move.frames[3]).toMatchObject({ offset: .75, easing: 'cubic-bezier(.42,0,.28,1)' });
  expect(move.frames[2].transform).toBe(move.frames[3].transform);
  expect(move.frames.every(frame => frame.opacity === 1), 'aucun fade ne délave Runner pendant la sortie').toBe(true);
  for (const frame of move.frames) {
    expect(Object.keys(frame).filter(k => !['transform', 'opacity', 'offset', 'easing', 'composite'].includes(k))).toEqual([]);
    expect(String(frame.transform)).not.toMatch(/NaN|Infinity/);
  }
  expect(move.frames.at(-1)).toMatchObject({ transform: 'none', opacity: 1 });
  const shift = move.frames[0].transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\)/);
  expect(shift).toBeTruthy();
  // L'ancre de départ et la figure ont le même centre lors de la première frame.
  expect(move.figure.left + move.figure.width / 2 + Number(shift[1])).toBeCloseTo(move.source.left + move.source.width / 2, 0);
  expect(move.figure.top + (56 * 280 / 240) / 2 + Number(shift[2])).toBeCloseTo(move.source.top + move.source.height / 2, 0);
  const logo = await page.locator('#premiumHomeV2 .srBrandLogo').boundingBox();
  expect(move.source.left, 'origine partiellement derrière le logo Store Runner').toBeGreaterThan(logo.x);
  expect(move.source.left).toBeLessThan(logo.x + logo.width);
  expect(move.source.left + move.source.width).toBeGreaterThan(logo.x + logo.width);
  const poses = await page.evaluate(() => __runnerHomeAudit.poses.map(p => ({ kind: p.kind, frames: p.frames, options: p.options })));
  expect(poses.map(p => p.kind).sort()).toEqual(['eyes', 'head']);
  expect(poses.every(p => p.options.duration === 8000 && p.options.iterations === 1)).toBe(true);
  const eyes = poses.find(p => p.kind === 'eyes');
  expect(eyes.frames.filter(frame => frame.transform === 'scaleY(.08)' || frame.transform === 'scaleY(.12)')).toHaveLength(2);
  expect(eyes.frames.some(frame => /^translateX\((-?5)px\)$/.test(frame.transform))).toBe(true);
  const head = poses.find(p => p.kind === 'head');
  expect(head.frames.some(frame => frame.transform.includes('rotate(-5deg)'))).toBe(true);
}

for (const [name, device] of PROFILES) test.describe(name, () => {
  test.use(device);
  for (const tomorrow of [false, true]) test(tomorrow ? 'Demain : trajet vers la préparation réellement affichée' : 'Aujourd’hui : trajet fluide du logo à la carte du jour', async ({ page }, testInfo) => {
    const errors = await boot(page, { tomorrow });
    await expect(page.locator('#premiumHomeV2 .phTitle')).toHaveText(tomorrow ? 'Demain.' : 'Aujourd’hui.');
    await expect(page.locator(SLOT)).toHaveAttribute('data-home-runner-target', tomorrow ? 'next' : 'today');
    const target = tomorrow ? '.phNextDay' : '.phTerrain';
    await expect(page.locator('#premiumHomeV2 ' + target)).toBeVisible();
    await settle(page);
    const shot = testInfo.outputPath(name.replace(/[^\w-]/g, '_') + (tomorrow ? '-demain.png' : '-aujourdhui.png'));
    await page.screenshot({ path: shot });
    await testInfo.attach('accueil.png', { path: shot, contentType: 'image/png' });
    const geometry = testInfo.outputPath('geometry.json');
    fs.writeFileSync(geometry, JSON.stringify(await page.evaluate(() => Object.fromEntries(['.srBrandLogo','#homeRunnerOriginV270','.phHeaderContext','.phBase','.phDayHeading','#homeRunnerV270','.phVisitCard'].map(selector => { const el = document.querySelector('#premiumHomeV2 ' + selector); const r = el.getBoundingClientRect(); return [selector, { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }]; }))), null, 2));
    await testInfo.attach('geometry.json', { path: geometry, contentType: 'application/json' });
    await expectOneJourney(page);
    await settledGeometry(page, '#premiumHomeV2 ' + target);
    const before = await snapshot(page);
    await page.waitForTimeout(1100);
    expect(await audit(page)).toEqual({ moves: 1, poses: 2, active: 0, timers: 0, intervals: 0, mounted: 1, nodes: 1 });
    expect(await snapshot(page), 'la présence visuelle n’écrit aucune donnée métier ni stockage').toEqual(before);
    expect(errors).toEqual([]);
  });

  test('reduced motion : apparition directe à destination', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = await boot(page, { tomorrow: true });
    await settledGeometry(page, '#premiumHomeV2 .phNextDay');
    expect(await audit(page)).toEqual({ moves: 0, poses: 0, active: 0, timers: 0, intervals: 0, mounted: 1, nodes: 1 });
    expect(await page.locator(SLOT).evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('rerenders et retour navigation : aucun replay ni fuite de nœud ou timer', async ({ page }) => {
    const errors = await boot(page);
    await settle(page);
    const before = await snapshot(page);
    for (let i = 0; i < 5; i++) {
      // Le même signal public rafraîchit l'Accueil après une donnée restaurée ;
      // aucune donnée ne change ici. Forcer un rendu vérifie le nettoyage du DOM remplacé.
      await page.evaluate(() => { document.getElementById('premiumHomeV2').__lastMarkup = null; document.dispatchEvent(new CustomEvent('store-runner:opportunities-updated')); });
      await page.waitForTimeout(120);
      await ready(page);
      await page.evaluate(() => goTab('storesPanel'));
      await expect(page.locator('#storesPanel')).toHaveClass(/active/);
      await mobileBack(page);
      await expect(page.locator('#homePanel')).toHaveClass(/active/);
      await ready(page);
    }
    await settle(page);
    expect(await audit(page)).toEqual({ moves: 1, poses: 2, active: 0, timers: 0, intervals: 0, mounted: 1, nodes: 1 });
    expect(await page.evaluate(() => document.querySelectorAll('#homeRunnerV270,#homeRunnerOriginV270,#srRunnerCss').length)).toBe(3);
    expect(await snapshot(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('scroll et toucher : Runner laisse passer les gestes et les actions', async ({ page }) => {
    const errors = await boot(page);
    const geometry = await settledGeometry(page, '#premiumHomeV2 .phTerrain');
    const before = await snapshot(page);
    const client = await page.context().newCDPSession(page);
    const x = Math.round((geometry.figure.left + geometry.figure.right) / 2), y = Math.round((geometry.figure.top + geometry.figure.bottom) / 2);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 160 * i / 10 }] });
      await page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
    // Attendre la fin de l'inertie avant le second geste : sinon son toucher
    // peut être consommé par le navigateur pour arrêter le défilement.
    let previousScroll = -1, stableScrollSamples = 0;
    await expect.poll(async () => {
      const current = await page.evaluate(() => scrollY);
      stableScrollSamples = current === previousScroll ? stableScrollSamples + 1 : 0;
      previousScroll = current;
      return stableScrollSamples;
    }, { intervals: [100] }).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.locator('#premiumHomeV2 .phAssistant').tap();
    await expect(page.locator('#assistantPanel')).toHaveClass(/open/);
    await mobileBack(page);
    await expect(page.locator('#assistantPanel')).not.toHaveClass(/open/);
    expect(await snapshot(page)).toEqual(before);
    expect((await audit(page)).moves).toBe(1);
    expect(errors).toEqual([]);
  });
});

test.describe('Replis et cycle de vie mobile', () => {
  test.use({ ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } });
  test('bascule Aujourd’hui vers Demain : placement direct, sans nouvelle animation ni mutation', async ({ page }) => {
    const errors = await boot(page);
    await settle(page);
    const before = await snapshot(page);
    await expect(page.locator(SLOT)).toHaveAttribute('data-home-runner-target', 'today');
    await page.clock.setFixedTime(new Date('2026-09-23T21:15:00+02:00'));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('store-runner:opportunities-updated')));
    await expect(page.locator('#premiumHomeV2 .phTitle')).toHaveText('Demain.');
    await expect(page.locator(SLOT)).toHaveAttribute('data-home-runner-target', 'next');
    await ready(page);
    await settledGeometry(page, '#premiumHomeV2 .phNextDay');
    expect(await audit(page)).toEqual({ moves: 1, poses: 2, active: 0, timers: 0, intervals: 0, mounted: 1, nodes: 1 });
    expect(await snapshot(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('cible absente : Runner reste visible sans translation cassée', async ({ page }) => {
    const errors = await boot(page, { absent: true });
    await settle(page);
    await expect(page.locator(SLOT + ' .srRunnerFigure')).toBeVisible();
    expect(await audit(page)).toEqual({ moves: 0, poses: 0, active: 0, timers: 0, intervals: 0, mounted: 1, nodes: 1 });
    expect(await page.locator(SLOT + ' .srRunner').evaluate(el => getComputedStyle(el).transform)).toBe('none');
    expect(errors).toEqual([]);
  });

  test('API générique : destinations retirées, annulations et destructions restent bornées', async ({ page }) => {
    const errors = await boot(page);
    await settle(page);
    const before = await snapshot(page);
    const lifecycle = await page.evaluate(() => {
      const one = document.createElement('div'), two = document.createElement('div');
      one.style.cssText = 'min-height:80px'; two.style.cssText = 'min-height:80px;margin-top:100px';
      document.getElementById('homePanel').append(one, two);
      const stale = document.createElement('div');
      one.append(stale); stale.remove();
      const safe = Runner.mount(one, { size: 'sm', decorative: true });
      const rejected = safe.moveTo(stale);
      const keptOrigin = safe.el.parentNode === one && safe.el.isConnected;
      const usedFallback = safe.moveTo(stale, { fallback: two, animate: false }) && safe.el.parentNode === two && safe.el.isConnected;
      safe.destroy();
      const counts = [];
      for (let i = 0; i < 30; i++) {
        const inst = Runner.mount(one, { size: 'sm', decorative: true });
        inst.moveTo(two, { from: one, duration: 680 });
        inst.cancelMove(); inst.destroy(); counts.push(Runner.mounted());
      }
      const removed = Runner.mount(one, { size: 'sm', decorative: true });
      removed.moveTo(two, { from: one });
      const wasMoving = removed.isMoving();
      two.remove(); const afterRemoval = Runner.mounted();
      const noLongerMoving = !removed.isMoving();
      one.remove();
      return { rejected, keptOrigin, usedFallback, counts, wasMoving, afterRemoval, noLongerMoving };
    });
    expect(lifecycle).toEqual({ rejected: false, keptOrigin: true, usedFallback: true, counts: Array(30).fill(1), wasMoving: true, afterRemoval: 1, noLongerMoving: true });
    expect(await audit(page)).toEqual({ moves: 1, poses: 2, active: 0, timers: 0, intervals: 0, mounted: 1, nodes: 1 });
    expect(await snapshot(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
});

test.describe('PWA Accueil hors ligne', () => {
  test.use({ ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  test('shell cohérent, Runner et données conservés au rechargement hors ligne', async ({ page, context }) => {
    test.setTimeout(90000);
    const errors = await boot(page, { tomorrow: true });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async rev => {
      const names = await caches.keys(), name = names.find(n => n.includes(rev));
      if (!name) return [];
      const cache = await caches.open(name);
      return Promise.all(['runner-visual.js', 'home-refresh-v2.js'].map(async file => !!await cache.match(new URL('./' + file + '?rev=' + rev, location.href).href)));
    }, latestBuild), { timeout: 30000 }).toEqual([true, true]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    // Les migrations de démarrage normalisent puis sauvegardent la fixture.
    // Le témoin hors ligne part de cet état persisté, avant tout rechargement.
    await expect.poll(() => page.evaluate(main => __chefStorage.getItem(main) === JSON.stringify(state), MAIN)).toBe(true);
    await page.evaluate(() => __chefStorage.flush());
    await settle(page);
    const before = await snapshot(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await settledGeometry(page, '#premiumHomeV2 .phNextDay');
    await expect(page.locator('#premiumHomeV2 .phTitle')).toHaveText('Demain.');
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(await snapshot(page)).toEqual(before);
    expect(await audit(page)).toEqual({ moves: 1, poses: 2, active: 0, timers: 0, intervals: 0, mounted: 1, nodes: 1 });
    await context.setOffline(false);
    expect(errors.filter(message => !/Failed to fetch|NetworkError|net::/.test(message))).toEqual([]);
  });
});
