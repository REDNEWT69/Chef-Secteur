const { test, expect, devices } = require('@playwright/test');
const B = require('../runner-behavior.js');
const { empty } = require('../store-runner-visit-model.js');
const { latestBuild } = require('../version.json');

// V273 — personnalité de Runner. L'application monte elle-même Runner et son module de comportement :
// ce spec ne monte rien. Données synthétiques déposées avant le démarrage, horloge figée (mercredi 23/09/2026).
// Les textes de Runner sont des données modifiables : on n'en fige aucun, on vérifie leur présence, leur
// forme, leur rareté et le fait qu'aucune donnée métier n'est écrite. iPhone émulé sous Chromium.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const MAIN = 'sector_planner_universal_v1';
const KEY = 'store-runner-runner-v1';
const LINE = '#homeRunnerLineV273';
const SHEET = '#runnerAppearanceSheet';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const PROFILES = [
  ['Android 390', { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } }],
  ['Android 360', strip(devices['Galaxy S8'])],
  ['iPhone 14 (Chromium)', strip(devices['iPhone 14'])]
];
test.use({ timezoneId: 'Europe/Paris', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

const seeded = (personality, extra) => B.serializeRegistry(Object.assign(B.setPersonality(B.defaultRegistry(), personality || 'copilote').registry, extra || {}));
function fixture() {
  const store = { id: 'v273-store', enseigne: 'Darty', ville: 'Ville Test', adresse: '1 rue du Test', dept: '69', lat: 45.75, lon: 4.85, active: true, priority: 3, intervalDays: 30, visitMinutes: 60 };
  return {
    schemaVersion: 5,
    profile: { sectorName: 'Secteur Test', baseName: 'Base Test', baseAddress: '3 rue du Test', baseLat: 45.7, baseLon: 4.8, overnight: 'never' },
    settings: { days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], startTime: '08:30', endTime: '18:00', weekDate: '2026-09-21', visitMinutes: 60, target: 15 },
    stores: [store], plan: { Lundi: [], Mardi: [], Mercredi: [store], Jeudi: [], Vendredi: [], Samedi: [] },
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {}, businessV2: empty()
  };
}

async function prepare(page, { registry, absent } = {}) {
  await page.clock.setFixedTime(new Date('2026-09-23T10:00:00+02:00'));
  await page.addInitScript(({ initial, main, key, registry }) => {
    if (!localStorage.getItem('runner-v273-fixture')) {
      localStorage.setItem('store-runner-onboarding-v1', JSON.stringify({ version: 1, status: 'complete', step: 4 }));
      localStorage.setItem(main, JSON.stringify(initial));
      if (registry !== undefined && registry !== null) localStorage.setItem(key, registry);
      localStorage.setItem('runner-v273-fixture', '1');
    }
    // Timers, intervalles et écouteurs créés depuis le module de comportement : il n'en possède aucun.
    window.__behaviorAudit = { timers: 0, intervals: 0, listeners: 0 };
    const st = window.setTimeout, si = window.setInterval, add = EventTarget.prototype.addEventListener;
    const mine = () => /runner-behavior\.js/.test(new Error().stack || '');
    window.setTimeout = function (...a) { if (mine()) __behaviorAudit.timers++; return st.apply(this, a); };
    window.setInterval = function (...a) { if (mine()) __behaviorAudit.intervals++; return si.apply(this, a); };
    EventTarget.prototype.addEventListener = function (...a) { if (mine()) __behaviorAudit.listeners++; return add.apply(this, a); };
  }, { initial: fixture(), main: MAIN, key: KEY, registry: registry === undefined ? null : registry });
}
async function ready(page) {
  await page.waitForFunction(() => window.StoreRunnerBehavior && window.StoreRunnerAppearance && window.StoreRunnerBoot?.settled() && document.querySelector('#homeRunnerV270 .srRunner'));
  await page.waitForLoadState('load');
  await page.addStyleTag({ content: 'aside[role="status"]{display:none!important}' });
}
async function boot(page, options) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, options);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await ready(page);
  return errors;
}
const lineState = page => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect(), tag = document.querySelector('#premiumHomeV2 .phTagline').getBoundingClientRect();
  return { hidden: el.hidden, text: el.textContent, left: r.left, right: r.right, top: r.top, tagBottom: tag.bottom, position: getComputedStyle(el).position,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, vw: innerWidth, children: el.children.length };
}, LINE);
const registry = page => page.evaluate(key => __chefStorage.getItem(key), KEY).then(raw => (raw ? B.parseRegistry(raw) : null));
const business = page => page.evaluate(main => JSON.stringify({ state, main: __chefStorage.getItem(main), archive: __chefStorage.getItem('chef_sector_plan_archive_v1') }), MAIN);
const settle = page => page.evaluate(() => Promise.all((document.querySelector('#homeRunnerV270 .srRunner')?.getAnimations() || []).map(a => a.finished.catch(() => 0))));
async function persist(page) {
  // Le noyau normalise la fixture au démarrage : on part de cet état persisté avant de comparer des octets métier.
  await page.evaluate(async () => { save(); await __chefStorage.flush(); });
}
async function openSheet(page) {
  await page.locator('#homeRunnerAppearanceButton').click();
  await expect(page.locator(SHEET)).toHaveAttribute('open', '');
}

for (const [label, device] of PROFILES) {
  test.describe(label, () => {
    test.use(device);

    test('Copilote par défaut : une ligne courte et utile sous le résumé, aucune donnée métier touchée', async ({ page }) => {
      const errors = await boot(page);
      await persist(page);
      const before = await business(page);
      await expect(page.locator(LINE)).toBeVisible();
      const view = await lineState(page);
      expect(view.text.length, 'texte présent et court').toBeGreaterThan(5);
      expect(view.text.length).toBeLessThan(90);
      expect(view.children, 'texte inerte : aucun balisage').toBe(0);
      expect(view.position, 'dans le flux de l’écran hôte, jamais flottant').toBe('static');
      expect(view.top).toBeGreaterThanOrEqual(view.tagBottom - 1);
      expect(view.left).toBeGreaterThanOrEqual(0);
      expect(view.right).toBeLessThanOrEqual(view.vw);
      expect(view.overflow).toBeLessThanOrEqual(1);
      await settle(page);
      const reg = await registry(page);
      expect(reg.personality).toBe('copilote');
      expect(reg.textDay.n, 'une seule ligne comptée au budget').toBe(1);
      expect(reg.lastActiveDate).toBe('2026-09-23');
      expect(await business(page), 'aucune donnée métier modifiée par la voix de Runner').toBe(before);
      expect(errors).toEqual([]);
    });

    test('Personnalité : cinq choix dans la feuille Apparence, enregistrés hors du planning', async ({ page }) => {
      const errors = await boot(page);
      await persist(page);
      const before = await business(page);
      await openSheet(page);
      const section = page.locator(SHEET + ' [aria-labelledby="runnerPersonalityTitle"]');
      await expect(section.locator('#runnerPersonalityTitle')).toHaveText('Personnalité');
      const choices = section.locator('button[data-runner-personality]');
      await expect(choices).toHaveCount(5);
      expect(await choices.evaluateAll(list => list.map(b => b.dataset.runnerPersonality))).toEqual(['copilote', 'complice', 'coach', 'taquin', 'discret']);
      await expect(section.locator('[data-runner-personality="copilote"]')).toHaveAttribute('aria-pressed', 'true');
      for (const box of await choices.evaluateAll(list => list.map(b => { const r = b.getBoundingClientRect(); return { h: r.height, w: r.width, left: r.left, right: r.right }; }))) {
        expect(box.h, 'cible tactile d’au moins 44 px').toBeGreaterThanOrEqual(44);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(device.viewport.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.locator(SHEET).evaluate(el => /Appliquer/.test(el.innerText)), 'toujours aucun bouton Appliquer : chaque choix s’applique tout de suite').toBe(false);

      await section.locator('[data-runner-personality="coach"]').click();
      await expect(section.locator('[data-runner-personality="coach"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(section.locator('[data-runner-personality="copilote"]')).toHaveAttribute('aria-pressed', 'false');
      await expect(section.locator('[data-runner-personality-preview]')).not.toBeEmpty();
      await expect(section.locator('[data-runner-personality-preview]')).toHaveAttribute('role', 'status');
      await expect.poll(async () => (await registry(page))?.personality).toBe('coach');
      await page.keyboard.press('Escape');
      await expect(page.locator(SHEET)).not.toHaveAttribute('open', '');
      expect(await business(page), 'choisir une personnalité ne touche ni le planning ni les données').toBe(before);

      // Le choix survit au rechargement et se retrouve dans la feuille.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready(page);
      await openSheet(page);
      await expect(page.locator(SHEET + ' [data-runner-personality="coach"]')).toHaveAttribute('aria-pressed', 'true');
      expect(errors).toEqual([]);
    });
  });
}

test.describe('Android 390', () => {
  test.use(PROFILES[0][1]);

  test('lisibilité : la section Personnalité reste contrastée en Clair et en Sombre avec les quatre accents, choix enfoncé compris', async ({ page }) => {
    const errors = await boot(page);
    await openSheet(page);
    for (const [mode, accent] of ['light', 'dark'].flatMap(m => ['blue', 'indigo', 'teal', 'rose'].map(a => [m, a]))) {
      await page.locator(SHEET + ' [data-appearance-mode="' + mode + '"]').click();
      await page.locator(SHEET + ' [data-appearance-accent="' + accent + '"]').click();
      await expect(page.locator('html')).toHaveAttribute('data-sr-theme', mode);
      await expect(page.locator('html')).toHaveAttribute('data-sr-accent', accent);
      await page.locator(SHEET + ' [data-runner-personality="taquin"]').click();
      const ratios = await page.locator(SHEET + ' [aria-labelledby="runnerPersonalityTitle"]').evaluate(section => {
        const rgba = v => (v.match(/[\d.]+/g) || []).map(Number);
        const mix = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)).concat(1); };
        const back = el => { const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n); return chain.reduce((c, n) => mix(rgba(getComputedStyle(n).backgroundColor), c), [255, 255, 255, 1]); };
        const lum = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
        return [...section.querySelectorAll('h3,button b,button span,p')].filter(el => el.innerText.trim() || el.matches('p')).map(el => {
          const bg = back(el), fg = mix(rgba(getComputedStyle(el).color), bg), op = parseFloat(getComputedStyle(el).opacity), a = lum(fg), b = lum(bg);
          return { text: el.innerText, opacity: op, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
      });
      expect(ratios.length).toBeGreaterThan(10);
      for (const r of ratios) { expect(r.ratio, mode + '/' + accent + ' : ' + r.text).toBeGreaterThanOrEqual(4.5); expect(r.opacity).toBe(1); }
    }
    expect(errors).toEqual([]);
  });

  test('anti-spam : changer d’écran puis revenir, ou recharger, ne répète pas la ligne', async ({ page }) => {
    const errors = await boot(page);
    await expect(page.locator(LINE)).toBeVisible();
    const first = (await lineState(page)).text;
    await page.evaluate(() => goTab('planPanel'));
    await expect(page.locator('#planPanel.active')).toBeVisible();
    await expect.poll(async () => (await lineState(page))?.hidden ?? true).toBe(true);
    await page.evaluate(() => goTab('homePanel'));
    await expect(page.locator('#homePanel.active')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('#homeRunnerV270 .srRunner'));
    await page.waitForTimeout(400);
    const back = await lineState(page);
    expect(back.hidden, 'même journée, même réaction : retenue par le registre').toBe(true);
    expect(back.text).toBe('');
    expect((await registry(page)).textDay.n, 'une seule ligne comptée').toBe(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    expect((await lineState(page)).hidden, 'après rechargement le jour est déjà dit').toBe(true);
    expect((await registry(page)).textDay.n).toBe(1);
    expect(first.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('Discret : ni ligne ni geste ambiant, mais Runner reste là', async ({ page }) => {
    const errors = await boot(page, { registry: seeded('discret') });
    await expect(page.locator('#homeRunnerV270 .srRunner')).toBeVisible();
    const view = await lineState(page);
    expect(view.hidden).toBe(true);
    expect(view.text).toBe('');
    const reg = await registry(page);
    expect(reg.personality).toBe('discret');
    expect(reg.textDay.n).toBe(0);
    expect(errors).toEqual([]);
  });

  test('Taquin et Coach : un ton différent, la même sobriété (une ligne, jamais deux)', async ({ page, browser }) => {
    const texts = {};
    for (const id of ['copilote', 'taquin', 'coach']) {
      const context = await browser.newContext({ ...PROFILES[0][1], timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
      const p = await context.newPage();
      const errors = await boot(p, { registry: seeded(id) });
      await expect(p.locator(LINE)).toBeVisible();
      texts[id] = (await lineState(p)).text;
      expect((await registry(p)).textDay.n, id).toBe(1);
      expect(errors).toEqual([]);
      await context.close();
    }
    expect(new Set(Object.values(texts)).size, 'trois personnalités, trois voix').toBe(3);
  });

  test('retour après une absence : la ligne d’accueil de retour, puis la présence est enregistrée', async ({ page }) => {
    const absence = B.serializeRegistry(B.normalizeRegistry({ v: 1, lastActiveDate: '2026-09-10', lastActiveAt: Date.UTC(2026, 8, 10, 8) }));
    const errors = await boot(page, { registry: absence });
    await expect(page.locator(LINE)).toBeVisible();
    expect((await lineState(page)).text.length).toBeGreaterThan(5);
    await expect.poll(async () => (await registry(page))?.lastActiveDate).toBe('2026-09-23');
    expect(errors).toEqual([]);
  });

  test('registre corrompu ou illisible : l’application démarre, Copilote par défaut, données intactes', async ({ page }) => {
    const errors = await boot(page, { registry: '{ pas du json' });
    await persist(page);
    await openSheet(page);
    await expect(page.locator(SHEET + ' [data-runner-personality="copilote"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await page.evaluate(() => state.stores.length))).toBe(1);
    expect(errors).toEqual([]);
  });

  test('le module de comportement ne crée aucun timer, aucun intervalle, aucun écouteur', async ({ page }) => {
    const errors = await boot(page);
    await openSheet(page);
    await page.locator(SHEET + ' [data-runner-personality="complice"]').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__behaviorAudit)).toEqual({ timers: 0, intervals: 0, listeners: 0 });
    expect(errors).toEqual([]);
  });

  test('Assistant : Taquin change le titre d’une erreur technique, jamais son texte', async ({ page }) => {
    const errors = await boot(page, { registry: seeded('taquin') });
    await page.locator('#bottomAppNav .bottomNavBtn.ia').click();
    await page.waitForSelector('#assistantPanel.open');
    await page.waitForSelector('#srAssistantRunner .srRunner');
    await page.evaluate(() => {
      window.callAIGateway = () => Promise.reject(new Error('HTTP 503'));
      aiConfig.mode = 'online'; document.getElementById('assistantInput').value = 'et maintenant ?'; assistantSend();
    });
    await page.waitForFunction(() => document.querySelector('#srAssistantRunner .srRunner')?.dataset.state === 'alert');
    const view = await page.evaluate(() => ({ title: document.querySelector('#srAssistantRunner .srRunnerBubbleTitle').textContent, text: document.querySelector('#srAssistantRunner .srRunnerBubbleText').textContent }));
    expect(view.text, 'le message technique reste exact').toBe('IA en ligne indisponible : HTTP 503');
    expect(view.title).not.toBe('Attention !');
    expect(view.title.length).toBeGreaterThan(3);
    expect(errors).toEqual([]);
  });
});

test.describe('PWA hors ligne', () => {
  test.use({ ...PROFILES[0][1], serviceWorkers: 'allow' });
  test('le module de comportement est précaché avec le shell et fonctionne hors ligne', async ({ page, context }) => {
    test.setTimeout(90000);
    const errors = await boot(page, { registry: seeded('complice') });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async rev => {
      const name = (await caches.keys()).find(n => n.includes(rev));
      if (!name) return false;
      return !!await (await caches.open(name)).match(new URL('./runner-behavior.js?rev=' + rev, location.href).href);
    }, latestBuild), { timeout: 30000 }).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await openSheet(page);
    await expect(page.locator(SHEET + ' [data-runner-personality="complice"]')).toHaveAttribute('aria-pressed', 'true');
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});
