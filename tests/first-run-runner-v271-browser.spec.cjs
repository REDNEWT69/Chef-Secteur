const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { empty } = require('../store-runner-visit-model.js');

// V271 — Premier lancement guidé par Runner, dans la vraie application (Chromium mobile).
//
// Le serveur de test injecte un marqueur « terminé » dans index.html pour les 130 autres specs ;
// ici on demande l'index réel (`?e2eOnboarding=first-run`) : le guide ne s'affiche que pour un vrai
// nouvel utilisateur. Android 390 (Pixel 7) puis 360 (Galaxy S8) ; l'iPhone 14 est émulé sous
// Chromium (Safari/WebKit n'est pas installé dans l'environnement : un contrôle sur iPhone réel
// reste distinct). La position est simulée comme dans les specs r38 : un `navigator.geolocation`
// de test qui enregistre chaque appel, ce qui permet de PROUVER qu'aucune position n'est lue avant
// le tap sur « Utiliser ma position » ou le clic « Générer mes 3 semaines ».
//   RUNNER_SHOTS_DIR=/chemin  → enregistre aussi les captures en PNG.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const FIRST_RUN_URL = (() => { const url = new URL(APP_URL); url.searchParams.set('e2eOnboarding', 'first-run'); return url.toString(); })();
const SHOTS = process.env.RUNNER_SHOTS_DIR || '';
const MAIN = 'sector_planner_universal_v1';
const MARKER = 'store-runner-onboarding-v1';
const GUIDE = '#storeRunnerFirstRun';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const PROFILES = [
  ['Android 390', { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } }],
  ['Android 360 (Galaxy S8)', strip(devices['Galaxy S8'])],
  ['iPhone 14 (Chromium)', strip(devices['iPhone 14'])]
];
const ANDROID = PROFILES[0][1];
test.use({ ...ANDROID, timezoneId: 'Europe/Paris', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

/* ----------------------------------------------------------------------------- données */
function existingUser(extra = {}) {
  const stores = [
    { id: 'fr-a', enseigne: 'Darty', ville: 'Ville Test A', adresse: '1 rue du Test', dept: '69', lat: 45.75, lon: 4.85, active: true, priority: 3, intervalDays: 30, freq: 'Mensuel', visitMinutes: 60 },
    { id: 'fr-b', enseigne: 'Boulanger', ville: 'Ville Test B', adresse: '2 rue du Test', dept: '69', lat: 45.85, lon: 4.85, active: true, priority: 3, intervalDays: 30, freq: 'Mensuel', visitMinutes: 60 }
  ];
  return {
    schemaVersion: 5,
    profile: { sectorName: 'Secteur Test', repName: '', baseName: 'Base Test', baseAddress: '3 rue du Test', baseLat: 45.7, baseLon: 4.8, overnight: 'never' },
    settings: { days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], startTime: '08:30', endTime: '18:00', weekDate: '2026-09-28', visitMinutes: 60, target: 15 },
    stores, plan: { Lundi: [], Mardi: [], Mercredi: [stores[0]], Jeudi: [stores[1]], Vendredi: [], Samedi: [] },
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {}, businessV2: empty(),
    ...extra
  };
}

/* La position de test : chaque appel est enregistré, le mode se change en cours de route. */
function geoScript(mode) {
  window.__geo = { calls: [], mode };
  const geo = {
    getCurrentPosition(ok, fail, options) {
      window.__geo.calls.push({ options, at: Date.now() });
      setTimeout(() => {
        if (window.__geo.mode === 'denied') fail({ code: 1, message: 'Permission refusée' });
        else if (window.__geo.mode === 'unavailable') fail({ code: 2, message: 'Position indisponible' });
        else ok({ coords: { latitude: 45.764, longitude: 4.8357, accuracy: 8 }, timestamp: Date.now() });
      }, 20);
    }
  };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
}

/* Observe, sans rien modifier : les trajets de Runner (guide et accueil). Le prototype survit au
   document.open() du shell ; un écouteur posé ici, lui, serait effacé (voir watchEvents). */
function auditScript() {
  const audit = window.__audit = { moves: [], poses: [], homeMoves: [], events: [], closedAt: null };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const animation = animate.call(this, frames, options);
    const inGuide = this.closest && this.closest('#storeRunnerFirstRun');
    const inHome = this.closest && this.closest('#homeRunnerV270,#homeRunnerOriginV270');
    if (this.matches && this.matches('.srRunner')) {
      const boot = window.StoreRunnerBoot;
      const entry = { frames, options, animation, at: performance.now(), homeBuilt: !!document.querySelector('#premiumHomeV2 .phTop'), veilGone: !boot || boot.settled() };
      if (inGuide) audit.moves.push(entry); else if (inHome) audit.homeMoves.push(entry);
    } else if (inGuide && this.matches && this.matches('.rnHead,.rnEyes')) audit.poses.push({ frames, options, animation });
    return animation;
  };
}
/* Les événements du guide, écoutés une fois l'application installée (après le document.open() du shell). */
const watchEvents = page => page.evaluate(() => {
  const audit = window.__audit;
  document.addEventListener('store-runner:first-run-closed', event => { audit.closedAt = performance.now(); audit.events.push({ name: 'first-run-closed', detail: event.detail }); });
  document.addEventListener('store-runner:profile-saved', () => audit.events.push({ name: 'profile-saved' }));
  window.addEventListener('chef-range-generated', () => audit.events.push({ name: 'chef-range-generated' }));
});
/* Démarre l'application. `seed` dépose un état et un marqueur AVANT le démarrage (une seule fois,
   pour qu'un rechargement garde ce que l'application a écrit depuis). */
async function boot(page, { geo = 'ok', seed = null, marker = null, url = FIRST_RUN_URL, wait = true, reduced = false } = {}) {
  const errors = [];
  /* Émulé par la page : l'option de contexte n'est pas appliquée par tous les Chromium headless. */
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(String((error && error.message) || error)));
  await page.addInitScript(geoScript, geo);
  await page.addInitScript(auditScript);
  await page.addInitScript(({ seed, marker, main, markerKey }) => {
    if (localStorage.getItem('__first-run-seeded')) return;
    localStorage.setItem('__first-run-seeded', '1');
    if (seed) localStorage.setItem(main, JSON.stringify(seed));
    if (marker) localStorage.setItem(markerKey, JSON.stringify(marker));
  }, { seed, marker, main: MAIN, markerKey: MARKER });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (wait) {
    await page.waitForFunction(() => window.StoreRunnerNavigation && window.state && window.__chefStorage && window.StoreRunnerRunner && window.storeRunnerGenerateThreeWeeks);
    await watchEvents(page);
  }
  return errors;
}
const guideReady = page => page.waitForSelector(GUIDE + ':not([hidden]) .srRunner', { timeout: 20000 });
const flush = page => page.evaluate(async () => { if (__chefStorage.flush) await __chefStorage.flush(); });
async function reload(page) {
  await flush(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerNavigation && window.state && window.__chefStorage && window.storeRunnerGenerateThreeWeeks);
  await watchEvents(page);
}
const marker = page => page.evaluate(key => JSON.parse(__chefStorage.getItem(key) || 'null'), MARKER);
const button = (page, name) => page.locator(GUIDE).getByRole('button', { name });
const tap = (page, name) => button(page, name).tap();
const geoCalls = page => page.evaluate(() => window.__geo.calls.length);
/* Les captures attendent la fin des brèves animations d'entrée (pop de Runner, bulle) : un état posé, pas un état en route. */
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(550); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

/* Ce que le guide montre à l'écran : étape, texte de Runner, état, faits lus dans l'état réel. */
const view = page => page.evaluate(() => {
  const root = document.getElementById('storeRunnerFirstRun'), runner = root && root.querySelector('.srRunner');
  return {
    hidden: !root || root.hidden,
    eyebrow: root && root.querySelector('.srfrEyebrow') && root.querySelector('.srfrEyebrow').textContent,
    title: root && root.querySelector('#srfrTitle') && root.querySelector('#srfrTitle').textContent,
    bubbleTitle: runner && runner.querySelector('.srRunnerBubbleTitle').textContent,
    bubbleText: runner && runner.querySelector('.srRunnerBubbleText').textContent,
    state: runner && runner.dataset.state,
    note: root && root.querySelector('.srfrNote') && { kind: root.querySelector('.srfrNote').classList.contains('alert') ? 'alert' : 'ok', text: root.querySelector('.srfrNote').textContent, role: root.querySelector('.srfrNote').getAttribute('role') },
    buttons: root ? [...root.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled })) : [],
    stores: window.state.stores.length
  };
});
const geometry = (page, label) => page.evaluate(label => {
  const root = document.getElementById('storeRunnerFirstRun'), card = root.querySelector('.srfrCard'), box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const c = box(card), runner = root.querySelector('.srRunner'), figure = runner && runner.querySelector('.srRunnerFigure'), f = figure && box(figure);
  const buttons = [...root.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), ...box(b) }));
  const hit = f && document.elementFromPoint((f.left + f.right) / 2, (f.top + f.bottom) / 2);
  return {
    label, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, vw: innerWidth, vh: innerHeight, card: c,
    buttons, primary: buttons[0], figureWidth: figure && figure.offsetWidth, figureInside: !!(f && f.left >= c.left - 1 && f.right <= c.right + 1),
    hitRunner: !!(hit && hit.closest && hit.closest('.srRunnerFigure')), runnerPointer: runner && getComputedStyle(runner).pointerEvents,
    floating: runner ? [...runner.querySelectorAll('*'), runner].filter(el => ['fixed', 'sticky'].includes(getComputedStyle(el).position)).length : 0,
    focusableInRunner: runner ? runner.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').length : 0,
    instances: root.querySelectorAll('.srRunner').length, roots: document.querySelectorAll('#storeRunnerFirstRun').length
  };
}, label);
async function expectFits(page, label) {
  /* On mesure Runner posé : pas pendant sa sortie de derrière le logo. */
  await page.waitForFunction(() => window.__audit.moves.every(m => ['finished', 'idle'].includes(m.animation.playState)), null, { timeout: 8000 });
  const g = await geometry(page, label);
  expect(g.overflow, label + ' : aucun défilement horizontal').toBeLessThanOrEqual(1);
  expect(g.card.left, label + ' : carte dans l’écran').toBeGreaterThanOrEqual(0);
  expect(g.card.right, label + ' : carte dans l’écran').toBeLessThanOrEqual(g.vw + 1);
  expect(g.card.bottom, label + ' : carte au-dessus du bord bas').toBeLessThanOrEqual(g.vh + 1);
  for (const b of g.buttons) {
    expect(b.height, label + ' : cible tactile ≥ 44 px (' + b.text + ')').toBeGreaterThanOrEqual(43.5);
    expect(b.left, label + ' : bouton dans la carte (' + b.text + ')').toBeGreaterThanOrEqual(g.card.left - 1);
    expect(b.right, label + ' : bouton dans la carte (' + b.text + ')').toBeLessThanOrEqual(g.card.right + 1);
  }
  expect(g.primary.height, label + ' : action principale ≥ 48 px').toBeGreaterThanOrEqual(47.5);
  expect(g.instances, label + ' : un seul Runner').toBe(1);
  expect(g.roots, label + ' : un seul guide').toBe(1);
  expect(g.figureWidth).toBeCloseTo(88, 0);
  expect(g.figureInside).toBe(true);
  expect(g.hitRunner, label + ' : Runner n’intercepte aucun toucher').toBe(false);
  expect(g.runnerPointer).toBe('none');
  expect(g.floating, label + ' : Runner jamais flottant').toBe(0);
  expect(g.focusableInRunner, label + ' : rien de focusable dans Runner').toBe(0);
  return g;
}

/* Ajoute des magasins par l'unique chemin d'écriture (RegionStores.commit), puis rejoue les événements
   que l'écran d'ajout émet : c'est exactement ce que fait addCatalogBatch. */
async function addStores(page, count, { brand = 'Darty', region = '84', events = true } = {}) {
  return page.evaluate(async ({ count, brand, region, events }) => {
    const catalog = StoreRunnerOfficialCatalog, data = await catalog.load();
    const rows = catalog.filter(data, brand, region).filter(row => RegionStores.complete(row)).slice(0, count).map(row => JSON.parse(JSON.stringify(row)));
    const added = RegionStores.commit(rows);
    if (typeof renderFilterControls === 'function') renderFilterControls();
    renderAll();
    if (events) {
      for (const row of rows) document.dispatchEvent(new CustomEvent('store-runner:store-added', { detail: { storeId: row.id, batch: true } }));
      document.dispatchEvent(new CustomEvent('store-runner:stores-added', { detail: { storeIds: rows.map(row => row.id) } }));
    }
    return added;
  }, { count, brand, region, events });
}
/* Retient la génération du propriétaire le temps de regarder l'état « en cours ». */
async function gateGeneration(page) {
  await page.evaluate(() => {
    const real = window.storeRunnerGenerateThreeWeeks;
    window.__gate = new Promise(resolve => { window.__release = resolve; });
    window.storeRunnerGenerateThreeWeeks = async () => { await window.__gate; return real(); };
  });
}
const guideNodes = page => page.evaluate(() => ({ roots: document.querySelectorAll('#storeRunnerFirstRun').length, guideRunners: document.querySelectorAll('#storeRunnerFirstRun .srRunner').length, homeRunners: document.querySelectorAll('#homeRunnerV270 .srRunner').length, mounted: Runner.mounted(), open: document.documentElement.classList.contains('srFirstRunOpen') }));

/* ------------------------------------------------------------------ 1. parcours complet */
for (const [name, profile] of PROFILES) {
  test.describe(name, () => {
    test.use(profile);

    test('premier lancement : présentation, secteur, départ, génération, fin, accueil', async ({ page }) => {
      test.setTimeout(120000);
      const errors = await boot(page);
      await guideReady(page);
      if (name.startsWith('iPhone')) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
      }
      const key = name.replace(/\W+/g, '').toLowerCase();

      /* 1. Présentation : Runner, le message exact, un vrai nouvel utilisateur sans faux magasin. */
      let v = await view(page);
      expect(v).toMatchObject({ hidden: false, eyebrow: 'Étape 1 sur 5', title: 'Bienvenue dans Store Runner', bubbleTitle: 'Je suis Runner, ton copilote terrain.', state: 'neutral', stores: 0 });
      expect(v.bubbleText).toBe('Je t’aide à préparer ton secteur et tes tournées.');
      expect(v.buttons.map(b => b.text)).toEqual(['Commencer', 'J’ai déjà une sauvegarde', 'Plus tard']);
      expect(await marker(page)).toMatchObject({ version: 1, status: 'in-progress', step: 0 });
      expect((await marker(page)).startedAt).toBeTruthy();
      expect(await page.evaluate(() => state.stores.filter(s => s.source === 'Secteur de démonstration' || /^Ville-Test \d{2}$/.test(String(s.ville || ''))).length)).toBe(0);
      /* Le logo est celui de l'application, servi sous la révision précachée. */
      const logo = await page.evaluate(() => { const img = document.querySelector('#storeRunnerFirstRun .srfrLogo'), r = img.getBoundingClientRect(); return { src: img.getAttribute('src'), rev: window.__STORE_RUNNER_BUILD_REV, w: r.width, h: r.height, loaded: img.complete && img.naturalWidth > 0, bg: getComputedStyle(img).backgroundColor }; });
      expect(logo.src).toBe('./app-icon.svg?rev=' + logo.rev);
      expect(logo.w).toBe(logo.h);
      expect(logo.loaded).toBe(true);
      expect(logo.bg).toBe('rgba(0, 0, 0, 0)');
      expect(await guideNodes(page)).toMatchObject({ roots: 1, guideRunners: 1, homeRunners: 0, open: true });
      expect(await geoCalls(page), 'aucune position lue au lancement').toBe(0);
      /* La sortie de derrière le logo : un seul trajet (corps, tête, yeux), après l'Accueil monté. */
      await page.waitForFunction(() => window.__audit.moves.length === 1 && ['finished', 'idle'].includes(window.__audit.moves[0].animation.playState), null, { timeout: 8000 });
      const entrance = await page.evaluate(() => ({ moves: window.__audit.moves.length, poses: window.__audit.poses.length, duration: window.__audit.moves[0].options.duration, offsets: window.__audit.moves[0].frames.map(f => f.offset ?? null), afterHome: window.__audit.moves[0].homeBuilt, opacity: window.__audit.moves[0].frames.every(f => f.opacity === 1), onlyMotion: window.__audit.moves[0].frames.every(f => Object.keys(f).every(k => ['transform', 'opacity', 'offset', 'easing'].includes(k))) }));
      expect(entrance).toMatchObject({ moves: 1, poses: 2, duration: 1180, afterHome: true, opacity: true, onlyMotion: true });
      const intro = await expectFits(page, name + ' · présentation');
      if (name.startsWith('iPhone')) expect(intro.card.bottom, 'la carte reste au-dessus de la barre d’accueil de l’iPhone (34 px)').toBeLessThanOrEqual(intro.vh - 34 + 1);
      await shot(page, `v271-${key}-1-presentation`);

      /* 2. Secteur : rien n'est inventé tant qu'aucun magasin n'existe. */
      await tap(page, 'Commencer');
      await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton secteur');
      v = await view(page);
      expect(v).toMatchObject({ eyebrow: 'Étape 2 sur 5', bubbleTitle: 'Commençons par ton secteur.', state: 'neutral', stores: 0 });
      expect(v.buttons.map(b => b.text)).toEqual(['Ajouter mes magasins', 'Importer mes données', '‹ Retour', 'Plus tard']);
      expect(await page.locator(GUIDE + ' [data-srfr-store-count]').textContent()).toBe('0');
      expect(await marker(page)).toMatchObject({ status: 'in-progress', step: 1 });
      await expectFits(page, name + ' · secteur vide');
      await shot(page, `v271-${key}-2-secteur-vide`);

      /* Sur Android 390, on passe par le vrai écran d'ajout (carnet officiel, sélection multiple). */
      if (name === 'Android 390') {
        await tap(page, 'Ajouter mes magasins');
        await expect(page.locator('#storeAddDlg')).toBeVisible();
        await page.locator('#sraCatalogBrand').selectOption('Darty');
        await page.locator('#sraCatalogRegion').selectOption('84');
        await page.locator('#storeAddDlg').getByRole('button', { name: 'Afficher les magasins' }).click();
        await page.locator('[data-sra-catalog-list] .sraCatalogItem').first().waitFor();
        const checks = page.locator('.sraCatalogCheck:not(:disabled)');
        for (let i = 0; i < 12; i++) await checks.nth(i).check();
        await page.locator('[data-sra-add-batch]').click();
        await expect(page.locator('[data-sra-batch-summary]')).toBeVisible();
        await page.locator('[data-sra-finish]').click();
        await expect(page.locator('#storeAddDlg')).toBeHidden();
      } else {
        expect(await addStores(page, 12)).toBe(12);
      }
      await expect(page.locator(GUIDE + ' [data-srfr-store-count]')).toHaveText('12');
      v = await view(page);
      expect(v).toMatchObject({ bubbleTitle: '12 magasins dans ton secteur.', bubbleText: 'Tu peux en ajouter d’autres ou continuer.', state: 'success', stores: 12 });
      expect(v.buttons.map(b => b.text)).toEqual(['Continuer', '+ Ajouter des magasins', '‹ Retour', 'Plus tard']);
      expect((await guideNodes(page)).guideRunners, 'le secteur ajouté ne remonte pas un second Runner').toBe(1);
      expect(await page.evaluate(() => window.__audit.moves.length), 'aucun rejeu de la sortie de derrière le logo').toBe(1);
      expect(await geoCalls(page)).toBe(0);
      await expectFits(page, name + ' · secteur prêt');
      await shot(page, `v271-${key}-3-secteur-pret`);

      /* 3. Point de départ : la position n'est demandée qu'au tap. */
      await tap(page, 'Continuer');
      await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton point de départ');
      v = await view(page);
      expect(v).toMatchObject({ eyebrow: 'Étape 3 sur 5', bubbleTitle: 'D’où pars-tu ?', state: 'neutral' });
      expect(v.buttons.map(b => b.text)).toEqual(['Utiliser ma position', 'Saisir une adresse', '‹ Retour', 'Passer cette étape', 'Plus tard']);
      expect(await geoCalls(page), 'pas de position avant le tap').toBe(0);
      await expectFits(page, name + ' · départ');
      await shot(page, `v271-${key}-4-depart`);
      await tap(page, 'Utiliser ma position');
      await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'success', { timeout: 15000 });
      expect(await geoCalls(page), 'une seule lecture, au tap').toBe(1);
      expect(await page.evaluate(() => window.__geo.calls[0].options.maximumAge), 'position jamais mise en cache').toBe(0);
      v = await view(page);
      expect(v).toMatchObject({ bubbleTitle: 'Point de départ enregistré.', bubbleText: 'Ma position actuelle' });
      expect(v.note).toMatchObject({ kind: 'ok', role: 'status' });
      expect(v.note.text).toMatch(/Position fraîche retenue/);
      expect(await page.evaluate(() => ({ lat: state.profile.baseLat, lon: state.profile.baseLon, name: state.profile.baseName, valid: storeRunnerHasValidBase() }))).toEqual({ lat: 45.764, lon: 4.8357, name: 'Ma position actuelle', valid: true });
      await shot(page, `v271-${key}-5-depart-enregistre`);

      /* 4. Planning : la génération est un geste explicite, appelé chez son propriétaire. */
      await tap(page, 'Continuer');
      await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton planning');
      v = await view(page);
      expect(v).toMatchObject({ eyebrow: 'Étape 4 sur 5', bubbleTitle: 'Ton secteur est prêt.', bubbleText: 'Générons tes 3 prochaines semaines.', state: 'neutral' });
      expect(v.buttons.map(b => b.text)).toEqual(['Générer mes 3 semaines', '‹ Retour', 'Plus tard']);
      expect(await page.evaluate(() => Object.values(state.plan).flat().length), 'rien n’est généré tant que l’utilisateur ne l’a pas demandé').toBe(0);
      expect(await geoCalls(page)).toBe(1);
      await expectFits(page, name + ' · planning');
      await shot(page, `v271-${key}-6-planning`);
      await gateGeneration(page);
      await tap(page, 'Générer mes 3 semaines');
      await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'analyzing');
      v = await view(page);
      expect(v).toMatchObject({ bubbleTitle: 'Je prépare tes 3 semaines.', state: 'analyzing' });
      expect(v.buttons.every(b => b.disabled), 'aucun second lancement possible pendant la génération').toBe(true);
      expect(await page.evaluate(() => window.__geo.calls.length)).toBe(1);
      await expectFits(page, name + ' · génération en cours');
      await shot(page, `v271-${key}-7-generation`);
      await page.evaluate(() => window.__release());

      /* 5. Fin : seulement après le succès du propriétaire, avec ses chiffres. */
      await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Tout est en place', { timeout: 60000 });
      v = await view(page);
      expect(v).toMatchObject({ eyebrow: 'Étape 5 sur 5', bubbleTitle: 'C’est prêt.', bubbleText: 'Je t’accompagnerai dans le Planning, l’Assistant et tes magasins.', state: 'success' });
      expect(v.buttons.map(b => b.text)).toEqual(['Ouvrir mon accueil']);
      const facts = await page.evaluate(() => ({ range: JSON.parse(__chefStorage.getItem('chef_sector_range_v1')), planned: Object.values(state.plan).flat().length, shown: document.querySelector('#storeRunnerFirstRun .srfrCount strong').textContent }));
      expect(facts.range.weeks).toBe(3);
      expect(Number(facts.shown), 'le nombre affiché est celui du propriétaire').toBe(facts.range.totalVisits);
      expect(facts.range.totalVisits).toBeGreaterThan(0);
      expect(facts.planned).toBeGreaterThan(0);
      expect((await marker(page)).generated).toMatchObject({ visits: facts.range.totalVisits });
      await expectFits(page, name + ' · fin');
      await shot(page, `v271-${key}-8-fin`);

      /* 6. Accueil normal : l'entrée de Runner V270 est jouée maintenant, pas sous le guide. */
      expect((await guideNodes(page)).homeRunners, 'l’Accueil n’a pas monté Runner sous le guide').toBe(0);
      expect(await page.evaluate(() => window.__audit.homeMoves.length)).toBe(0);
      await tap(page, 'Ouvrir mon accueil');
      await expect(page.locator(GUIDE)).toBeHidden();
      await expect(page.locator('#homePanel')).toHaveClass(/\bactive\b/);
      await page.waitForSelector('#homeRunnerV270 .srRunner');
      const after = await page.evaluate(() => ({ nodes: { guide: document.querySelectorAll('#storeRunnerFirstRun .srRunner').length, home: document.querySelectorAll('#homeRunnerV270 .srRunner').length }, mounted: Runner.mounted(), moves: window.__audit.homeMoves.length, startedAfterClose: window.__audit.homeMoves.every(m => m.at >= window.__audit.closedAt), open: document.documentElement.classList.contains('srFirstRunOpen'), events: window.__audit.events.filter(e => e.name === 'first-run-closed') }));
      expect(after).toMatchObject({ nodes: { guide: 0, home: 1 }, mounted: 1, moves: 1, startedAfterClose: true, open: false });
      expect(after.events).toEqual([{ name: 'first-run-closed', detail: { status: 'complete' } }]);
      expect(await marker(page)).toMatchObject({ status: 'complete', step: 4 });
      await page.waitForFunction(() => document.querySelector('#homeRunnerV270 .srRunner').getAnimations({ subtree: true }).every(a => ['finished', 'idle'].includes(a.playState)), null, { timeout: 8000 });
      await shot(page, `v271-${key}-9-accueil`);

      /* 7. Il ne revient plus : ni au rechargement, ni après avoir vidé ou régénéré son planning. */
      await page.evaluate(() => { state.plan = {}; save(); });
      await reload(page);
      await page.waitForSelector('#premiumHomeV2 .phTop');
      expect(await page.evaluate(() => ({ root: !!document.getElementById('storeRunnerFirstRun'), open: document.documentElement.classList.contains('srFirstRunOpen') }))).toEqual({ root: false, open: false });
      expect(await marker(page)).toMatchObject({ status: 'complete' });
      expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
    });
  });
}

/* --------------------------------------------------------------- 2. interruption puis reprise */
test('reprise : l’étape se déduit de l’état réel à chaque interruption', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await guideReady(page);
  const step = async () => (await view(page)).eyebrow;

  /* a. Fermée sur la présentation. */
  const started = (await marker(page)).startedAt;
  await reload(page); await guideReady(page);
  expect(await step()).toBe('Étape 1 sur 5');
  expect((await marker(page)).startedAt, 'le même parcours continue').toBe(started);

  /* b. Présentation passée, aucun magasin : le secteur. */
  await tap(page, 'Commencer');
  await reload(page); await guideReady(page);
  expect(await step()).toBe('Étape 2 sur 5');
  expect((await view(page)).bubbleTitle).toBe('Commençons par ton secteur.');

  /* c. Des magasins arrivés, application fermée : le point de départ. */
  await addStores(page, 8);
  await reload(page); await guideReady(page);
  expect(await step()).toBe('Étape 3 sur 5');
  expect((await view(page)).title).toBe('Ton point de départ');

  /* d. Départ enregistré, application fermée : le planning. */
  await tap(page, 'Utiliser ma position');
  await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'success', { timeout: 15000 });
  await reload(page); await guideReady(page);
  expect(await step()).toBe('Étape 4 sur 5');
  expect(await geoCalls(page), 'le rechargement ne relit pas la position').toBe(0);
  expect((await view(page)).bubbleTitle).toBe('Ton secteur est prêt.');

  /* e. Génération faite par le guide, application fermée avant « Ouvrir mon accueil » : la fin. */
  await tap(page, 'Générer mes 3 semaines');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Tout est en place', { timeout: 60000 });
  const generated = (await marker(page)).generated;
  await reload(page); await guideReady(page);
  expect(await step()).toBe('Étape 5 sur 5');
  expect((await view(page)).bubbleTitle).toBe('C’est prêt.');
  expect(Number(await page.locator(GUIDE + ' .srfrCount strong').textContent())).toBe(generated.visits);
  expect(await page.evaluate(() => Object.values(state.plan).flat().length), 'rien n’est regénéré au rechargement').toBeGreaterThan(0);

  /* f. Même une fois le planning vidé avant d'avoir validé la fin, le guide ne ressuscite pas la génération. */
  await page.evaluate(() => { state.plan = {}; save(); });
  await reload(page); await guideReady(page);
  expect(await step()).toBe('Étape 5 sur 5');
  await tap(page, 'Ouvrir mon accueil');
  await expect(page.locator(GUIDE)).toBeHidden();
  expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
});

test('reprise : « Passer cette étape » est mémorisé, un ancien marqueur se relit par l’état réel', async ({ page }) => {
  await boot(page);
  await guideReady(page);
  await tap(page, 'Commencer');
  await addStores(page, 5);
  await tap(page, 'Continuer');
  await tap(page, 'Passer cette étape');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton planning');
  expect(await marker(page)).toMatchObject({ status: 'in-progress', step: 3, startSkipped: true });
  expect((await view(page)).buttons.map(b => b.text)).toEqual(['Générer mes 3 semaines', '‹ Retour', 'Plus tard']);
  await expect(page.locator(GUIDE + ' .srfrHint')).toHaveText('Ta position te sera demandée au moment de générer.');
  await reload(page); await guideReady(page);
  expect((await view(page)).eyebrow, 'le départ passé n’est pas redemandé').toBe('Étape 4 sur 5');
  expect(await marker(page)).toMatchObject({ startSkipped: true });
});

test('reprise : le marqueur de l’ancien parcours en quatre écrans est relu par l’état réel', async ({ page }) => {
  /* Un utilisateur arrêté à l'ancien écran 3 (« Ajoute tes magasins ») sans aucun magasin. */
  await boot(page, { marker: { version: 1, status: 'in-progress', step: 2, at: '2026-10-01T08:00:00.000Z', startedAt: '2026-10-01T08:00:00.000Z' }, seed: { schemaVersion: 5 } });
  await guideReady(page);
  expect(await view(page)).toMatchObject({ eyebrow: 'Étape 2 sur 5', title: 'Ton secteur', state: 'neutral', stores: 0 });
  expect((await marker(page)).startedAt).toBe('2026-10-01T08:00:00.000Z');
});

/* ------------------------------------------------------------ 3. utilisateurs existants */
test.describe('utilisateurs existants protégés', () => {
  test('secteur et planning déjà présents, aucun marqueur : aucun guide, Runner de l’Accueil intact', async ({ page }) => {
    const errors = await boot(page, { seed: existingUser(), wait: true });
    await page.waitForSelector('#homeRunnerV270 .srRunner');
    expect(await page.evaluate(() => ({ root: !!document.getElementById('storeRunnerFirstRun'), open: document.documentElement.classList.contains('srFirstRunOpen'), stores: state.stores.length, homeMoves: window.__audit.homeMoves.length }))).toEqual({ root: false, open: false, stores: 2, homeMoves: 1 });
    expect(await marker(page)).toMatchObject({ status: 'complete', reason: 'existing-user' });
    expect(await page.evaluate(() => state.profile.baseName), 'le profil n’a pas bougé').toBe('Base Test');
    expect(errors).toEqual([]);
  });
  test('marqueur « terminé » puis tout vidé : le guide ne revient pas', async ({ page }) => {
    await boot(page, { seed: { schemaVersion: 5, stores: [], profile: {}, settings: {}, plan: {} }, marker: { version: 1, status: 'complete', step: 4, at: '2026-10-01T08:00:00.000Z' } });
    await page.waitForSelector('#premiumHomeV2 .phTop');
    expect(await page.evaluate(() => !!document.getElementById('storeRunnerFirstRun'))).toBe(false);
    expect(await marker(page)).toMatchObject({ status: 'complete', step: 4 });
  });
  test('marqueur « plus tard » : le guide ne revient pas tout seul', async ({ page }) => {
    await boot(page, { marker: { version: 1, status: 'dismissed', step: 0, at: '2026-10-01T08:00:00.000Z' } });
    await page.waitForSelector('#premiumHomeV2 .phTop');
    expect(await page.evaluate(() => !!document.getElementById('storeRunnerFirstRun'))).toBe(false);
  });
  test('guide « en cours » mais activité réelle (rendez-vous, visites) : terminé en silence', async ({ page }) => {
    await boot(page, { seed: existingUser({ appointments: [{ id: 'a1', storeId: 'fr-a', date: '2026-10-08', time: '10:00' }] }), marker: { version: 1, status: 'in-progress', step: 1, at: '2026-10-01T08:00:00.000Z' } });
    await page.waitForSelector('#premiumHomeV2 .phTop');
    expect(await page.evaluate(() => !!document.getElementById('storeRunnerFirstRun'))).toBe(false);
    expect(await marker(page)).toMatchObject({ status: 'complete', reason: 'existing-user' });
  });
  test('guide « en cours » mais secteur, départ et planning déjà faits ailleurs : terminé en silence', async ({ page }) => {
    await boot(page, { seed: existingUser(), marker: { version: 1, status: 'in-progress', step: 2, at: '2026-10-01T08:00:00.000Z' } });
    await page.waitForSelector('#premiumHomeV2 .phTop');
    expect(await page.evaluate(() => !!document.getElementById('storeRunnerFirstRun'))).toBe(false);
    expect(await marker(page)).toMatchObject({ status: 'complete', reason: 'setup-complete' });
  });
});

test('« Plus tard » ferme le guide pour de bon, sans donnée, et rend l’entrée de Runner à l’Accueil', async ({ page }) => {
  const errors = await boot(page);
  await guideReady(page);
  expect((await guideNodes(page)).homeRunners, 'l’Accueil attend la fermeture du guide').toBe(0);
  const before = await page.evaluate(() => JSON.stringify(state));
  await tap(page, 'Plus tard');
  await expect(page.locator(GUIDE)).toBeHidden();
  expect(await marker(page)).toMatchObject({ status: 'dismissed', step: 0 });
  await page.waitForSelector('#homeRunnerV270 .srRunner');
  expect(await page.evaluate(() => ({ open: document.documentElement.classList.contains('srFirstRunOpen'), guideRunners: document.querySelectorAll('#storeRunnerFirstRun .srRunner').length, homeMoves: window.__audit.homeMoves.length, closed: window.__audit.events.filter(e => e.name === 'first-run-closed') })))
    .toEqual({ open: false, guideRunners: 0, homeMoves: 1, closed: [{ name: 'first-run-closed', detail: { status: 'dismissed' } }] });
  expect(await page.evaluate(() => JSON.stringify(state)), 'fermer le guide n’écrit aucune donnée').toBe(before);
  expect(await geoCalls(page)).toBe(0);
  await reload(page);
  await page.waitForSelector('#premiumHomeV2 .phTop');
  expect(await page.evaluate(() => !!document.getElementById('storeRunnerFirstRun'))).toBe(false);
  expect(await marker(page)).toMatchObject({ status: 'dismissed' });
  expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
});

/* ---------------------------------------------- 4. refus GPS, indisponibilité, échec contrôlé */
test('position refusée puis indisponible, départ passé, génération refusée puis réussie', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page, { geo: 'denied' });
  await guideReady(page);
  await tap(page, 'Commencer');
  await addStores(page, 10);
  await tap(page, 'Continuer');
  expect(await geoCalls(page)).toBe(0);

  /* Refus : l'alerte vient du propriétaire, rien n'est écrit, d'autres chemins restent offerts. */
  const before = await page.evaluate(() => JSON.stringify(state));
  await tap(page, 'Utiliser ma position');
  await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'alert', { timeout: 15000 });
  let v = await view(page);
  expect(v).toMatchObject({ bubbleTitle: 'Position indisponible.', bubbleText: 'Tu peux réessayer ou saisir une adresse.' });
  expect(v.note).toMatchObject({ kind: 'alert', role: 'alert' });
  expect(v.note.text).toMatch(/Localisation refusée/);
  expect(v.buttons.map(b => b.text)).toEqual(['Utiliser ma position', 'Saisir une adresse', '‹ Retour', 'Passer cette étape', 'Plus tard']);
  expect(await geoCalls(page)).toBe(1);
  expect(await page.evaluate(() => JSON.stringify(state)), 'un refus n’écrit rien').toBe(before);
  expect(await page.evaluate(() => storeRunnerHasValidBase())).toBe(false);
  await expectFits(page, 'départ refusé');
  await shot(page, 'v271-android390-5b-position-refusee');

  /* Indisponible : un autre message du propriétaire, même chemin. */
  await page.evaluate(() => { window.__geo.mode = 'unavailable'; });
  await tap(page, 'Utiliser ma position');
  await expect(page.locator(GUIDE + ' .srfrNote')).toContainText('Position indisponible');
  expect(await geoCalls(page)).toBe(2);

  /* Passer l'étape : le guide le dit, et la génération ne lit la position qu'à son clic explicite. */
  await tap(page, 'Passer cette étape');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton planning');
  await expect(page.locator(GUIDE + ' .srfrHint')).toHaveText('Ta position te sera demandée au moment de générer.');
  expect(await geoCalls(page), 'passer l’étape ne lit pas la position').toBe(2);
  const planBefore = await page.evaluate(() => JSON.stringify({ plan: state.plan, range: __chefStorage.getItem('chef_sector_range_v1'), archive: __chefStorage.getItem('chef_sector_plan_archive_v1') }));
  await page.evaluate(() => { window.__geo.mode = 'denied'; });
  await tap(page, 'Générer mes 3 semaines');
  await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'alert', { timeout: 30000 });
  v = await view(page);
  expect(v).toMatchObject({ bubbleTitle: 'La génération n’a pas abouti.', bubbleText: 'Tu peux réessayer ou modifier ton point de départ.' });
  expect(v.note).toMatchObject({ kind: 'alert', role: 'alert' });
  expect(v.note.text, 'le message est celui du propriétaire de la génération').toMatch(/localisation/i);
  expect(v.buttons.map(b => b.text)).toEqual(['Réessayer', 'Modifier mon point de départ', '‹ Retour', 'Plus tard']);
  expect(await geoCalls(page), 'la position n’a été demandée qu’au clic de génération').toBe(3);
  expect(await page.evaluate(() => JSON.stringify({ plan: state.plan, range: __chefStorage.getItem('chef_sector_range_v1'), archive: __chefStorage.getItem('chef_sector_plan_archive_v1') })), 'un échec n’écrit aucun planning').toBe(planBefore);
  expect((await marker(page)).generated, 'le guide ne se croit pas terminé').toBeUndefined();
  await expectFits(page, 'génération en échec');
  await shot(page, 'v271-android390-7b-generation-echec');

  /* Le guide ne se bloque pas : « Modifier » ramène au départ, « Réessayer » relance proprement. */
  await tap(page, 'Modifier mon point de départ');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton point de départ');
  expect((await view(page)).note, 'l’échec de la génération ne reste pas affiché sur une autre étape').toBeNull();
  await tap(page, 'Passer cette étape');
  await page.evaluate(() => { window.__geo.mode = 'ok'; });
  await tap(page, 'Générer mes 3 semaines');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Tout est en place', { timeout: 60000 });
  expect(await geoCalls(page)).toBe(4);
  expect(await page.evaluate(() => storeRunnerHasValidBase()), 'la position du clic de génération sert de départ').toBe(true);
  expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
});

/* -------------------------------------------- 5. import, départ par adresse, restauration */
test('import de secteur et départ par adresse : les écrans existants, puis la reprise par l’état réel', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await guideReady(page);

  /* « J'ai déjà une sauvegarde » : l'écran Données existant. */
  await tap(page, 'J’ai déjà une sauvegarde');
  await expect(page.locator(GUIDE)).toBeHidden();
  await expect(page.locator('#importPanel')).toHaveClass(/\bactive\b/);
  expect(await marker(page)).toMatchObject({ status: 'importing' });
  expect(await guideNodes(page)).toMatchObject({ guideRunners: 0, open: false });

  /* Un import sans événement dédié (outils avancés) : le guide le voit au retour de l'état réel. */
  expect(await addStores(page, 9, { events: false })).toBe(9);
  await page.waitForSelector(GUIDE + ':not([hidden]) .srRunner', { timeout: 10000 });
  let v = await view(page);
  expect(v).toMatchObject({ eyebrow: 'Étape 3 sur 5', title: 'Ton point de départ', stores: 9 });
  expect(await marker(page)).toMatchObject({ status: 'in-progress', step: 2 });

  /* « Saisir une adresse » : l'écran du point de départ existant ; le guide attend l'enregistrement. */
  await tap(page, 'Saisir une adresse');
  await expect(page.locator(GUIDE)).toBeHidden();
  await expect(page.locator('#profilePanel')).toHaveClass(/\bactive\b/);
  expect(await geoCalls(page)).toBe(0);
  await page.evaluate(() => {
    document.getElementById('pBaseName').value = 'Domicile de test';
    document.getElementById('pBaseAddress').value = '1 place Bellecour, Lyon';
    document.getElementById('pBaseLat').value = '45.7578';
    document.getElementById('pBaseLon').value = '4.8320';
    return window.saveProfile();
  });
  await page.waitForSelector(GUIDE + ':not([hidden]) .srRunner', { timeout: 10000 });
  v = await view(page);
  expect(v).toMatchObject({ eyebrow: 'Étape 4 sur 5', title: 'Ton planning', bubbleTitle: 'Ton secteur est prêt.' });
  await expect(page.locator(GUIDE + ' .srfrGrid')).toContainText('Domicile de test');
  expect(await marker(page)).toMatchObject({ status: 'in-progress', step: 3 });
  expect(await geoCalls(page), 'saisir une adresse ne lit jamais la position').toBe(0);
  expect((await guideNodes(page)).guideRunners).toBe(1);
  expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
});

test('restauration d’une sauvegarde : le guide se termine, la sauvegarde ne contient aucun état du guide', async ({ page, browser }) => {
  test.setTimeout(90000);
  /* Une sauvegarde faite par un utilisateur qui vient de finir le guide. */
  await boot(page, { seed: existingUser() });
  await page.waitForSelector('#premiumHomeV2 .phTop');
  const backup = await page.evaluate(() => JSON.stringify(ChefReliability.seal(ChefReliability.capture())));
  expect(backup).not.toMatch(/onboarding|storeRunnerFirstRun|startSkipped|first-run/i);
  expect(JSON.parse(backup).state.stores).toHaveLength(2);

  /* Un nouvel appareil : guide ouvert, puis restauration comme le fait l'écran Données. */
  const context = await browser.newContext({ ...ANDROID, timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  const fresh = await context.newPage();
  await boot(fresh);
  await guideReady(fresh);
  expect(await geoCalls(fresh)).toBe(0);
  await fresh.evaluate(async raw => {
    const restored = ChefReliability.restore(JSON.parse(raw));
    await __chefStorage.flush();
    window.state = restored;
    document.dispatchEvent(new CustomEvent('store-runner:data-restored'));
  }, backup);
  await expect(fresh.locator(GUIDE)).toBeHidden();
  expect(await marker(fresh)).toMatchObject({ status: 'complete', reason: 'restored-data' });
  expect(await fresh.evaluate(() => ({ stores: state.stores.map(s => s.id), name: state.profile.baseName, plan: Object.values(state.plan).flat().length, open: document.documentElement.classList.contains('srFirstRunOpen') }))).toEqual({ stores: ['fr-a', 'fr-b'], name: 'Base Test', plan: 2, open: false });
  await context.close();
});

/* ----------------------------------------------------------- 6. animations réduites */
test.describe('animations réduites', () => {
  test('aucun mouvement : Runner est posé directement, les états restent distincts', async ({ page }) => {
    await boot(page, { reduced: true });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await guideReady(page);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => ({ moves: window.__audit.moves.length, poses: window.__audit.poses.length, running: document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.target && document.getElementById('storeRunnerFirstRun').contains(a.effect.target)).length }))).toEqual({ moves: 0, poses: 0, running: 0 });
    const style = await page.evaluate(() => { const main = document.querySelector('#storeRunnerFirstRun .srfrMain'), dot = document.querySelector('#storeRunnerFirstRun .srfrProgress i'), figure = document.querySelector('#storeRunnerFirstRun .srRunnerFigure'); return { main: getComputedStyle(main).animationName, dot: getComputedStyle(dot).transitionDuration, figure: getComputedStyle(figure).animationName, transform: getComputedStyle(document.querySelector('#storeRunnerFirstRun .srRunner')).transform, visibility: getComputedStyle(document.querySelector('#storeRunnerFirstRun .srfrStage')).visibility }; });
    expect(style).toEqual({ main: 'none', dot: '0s', figure: 'none', transform: 'none', visibility: 'visible' });
    await tap(page, 'Commencer');
    await addStores(page, 6);
    await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'success');
    expect(await page.evaluate(() => ({ moves: window.__audit.moves.length, running: document.getAnimations().filter(a => a.playState === 'running').length }))).toEqual({ moves: 0, running: 0 });
    await tap(page, 'Continuer');
    await tap(page, 'Utiliser ma position');
    await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton point de départ');
    await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'success', { timeout: 15000 });
    await tap(page, 'Continuer');
    await tap(page, 'Générer mes 3 semaines');
    await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Tout est en place', { timeout: 60000 });
    await tap(page, 'Ouvrir mon accueil');
    await page.waitForSelector('#homeRunnerV270 .srRunner');
    expect(await page.evaluate(() => ({ guide: window.__audit.moves.length, home: window.__audit.homeMoves.length })), 'ni le guide ni l’Accueil ne jouent de trajet').toEqual({ guide: 0, home: 0 });
  });
});

/* ------------------------------------- 7. retour navigation, nouveaux rendus, aucune écriture */
test('rendus répétés, navigation et historique : même étape, même Runner, aucun rejeu', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await guideReady(page);
  await page.waitForFunction(() => window.__audit.moves.length === 1 && ['finished', 'idle'].includes(window.__audit.moves[0].animation.playState), null, { timeout: 8000 });
  await tap(page, 'Commencer');
  await addStores(page, 7);
  await tap(page, 'Continuer');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton point de départ');
  const startedAt = (await marker(page)).startedAt;
  await page.evaluate(() => { window.__runnerNode = document.querySelector('#storeRunnerFirstRun .srRunner'); window.__cardNode = document.querySelector('#storeRunnerFirstRun .srfrCard'); });

  /* Rendus de l'application et navigation derrière le guide. */
  await page.evaluate(() => {
    renderAll(); if (typeof renderFilterControls === 'function') renderFilterControls();
    goTab('planPanel'); goTab('storesPanel'); goTab('homePanel');
    document.dispatchEvent(new CustomEvent('store-runner:home-rendered'));
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated', { detail: { source: 'test' } }));
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  /* Historique : un aller-retour ne redémarre rien. */
  await page.evaluate(() => { history.pushState({ x: 1 }, '', location.href); });
  await page.goBack();
  await page.waitForTimeout(150);
  await page.goForward();
  await page.waitForTimeout(150);
  const same = await page.evaluate(() => ({ sameRunner: window.__runnerNode === document.querySelector('#storeRunnerFirstRun .srRunner'), sameCard: window.__cardNode === document.querySelector('#storeRunnerFirstRun .srfrCard'), nodes: { roots: document.querySelectorAll('#storeRunnerFirstRun').length, runners: document.querySelectorAll('#storeRunnerFirstRun .srRunner').length }, moves: window.__audit.moves.length, eyebrow: document.querySelector('#storeRunnerFirstRun .srfrEyebrow').textContent, hidden: document.getElementById('storeRunnerFirstRun').hidden, open: document.documentElement.classList.contains('srFirstRunOpen') }));
  expect(same).toEqual({ sameRunner: true, sameCard: true, nodes: { roots: 1, runners: 1 }, moves: 1, eyebrow: 'Étape 3 sur 5', hidden: false, open: true });
  expect((await marker(page)).startedAt).toBe(startedAt);
  expect(await geoCalls(page)).toBe(0);

  /* Retour interne puis nouvelle avancée : même instance, aucune entrée rejouée, aucune fin émise. */
  await tap(page, 'Retour');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton secteur');
  await tap(page, 'Continuer');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton point de départ');
  expect(await page.evaluate(() => ({ same: window.__runnerNode === document.querySelector('#storeRunnerFirstRun .srRunner'), moves: window.__audit.moves.length, closed: window.__audit.events.filter(e => e.name === 'first-run-closed').length }))).toEqual({ same: true, moves: 1, closed: 0 });
  expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
});

test('aucune écriture métier depuis le guide ni Runner : naviguer dans les étapes ne touche à rien', async ({ page }) => {
  await boot(page);
  await guideReady(page);
  const snap = () => page.evaluate(() => ({ state: JSON.stringify(state), main: __chefStorage.getItem('sector_planner_universal_v1'), archive: __chefStorage.getItem('chef_sector_plan_archive_v1'), range: __chefStorage.getItem('chef_sector_range_v1'), keys: [...Array(__chefStorage.length).keys()].map(i => __chefStorage.key(i)).sort(), local: JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])) }));
  await page.waitForFunction(() => window.__audit.moves.length === 1);
  const before = await snap();
  await tap(page, 'Commencer');
  await tap(page, 'Retour');
  await tap(page, 'Commencer');
  await tap(page, 'Retour');
  const after = await snap();
  expect(after.state).toBe(before.state);
  expect(after.main).toBe(before.main);
  expect(after.archive).toBe(before.archive);
  expect(after.range).toBe(before.range);
  expect(after.keys, 'seule la préférence du guide a pu changer, pas les clés métier').toEqual(before.keys);
  expect(after.local, 'rien n’est écrit dans localStorage').toBe(before.local);
  expect(await geoCalls(page)).toBe(0);
  /* Le contenu de Runner reste du texte : un nom hostile ne devient jamais du HTML. */
  await tap(page, 'Commencer');
  await addStores(page, 4);
  await tap(page, 'Continuer');
  await page.evaluate(() => { state.profile.baseName = '<img src=x onerror="window.__pwn=1">'; state.profile.baseAddress = 'x'; state.profile.baseLat = 45.7; state.profile.baseLon = 4.8; save(); });
  await tap(page, 'Retour'); await tap(page, 'Continuer');
  await expect(page.locator(GUIDE + ' .srRunnerBubbleText')).toHaveText('<img src=x onerror="window.__pwn=1">');
  await tap(page, 'Continuer');
  await expect(page.locator(GUIDE + ' .srfrGrid')).toContainText('<img src=x onerror="window.__pwn=1">');
  expect(await page.evaluate(() => ({ pwn: window.__pwn === undefined, imgs: document.querySelectorAll('#storeRunnerFirstRun img:not(.srfrLogo)').length }))).toEqual({ pwn: true, imgs: 0 });
});

/* ------------------------------------------------------------ 8. accessibilité et clavier */
test('accessibilité : dialogue nommé, focus sur le titre, tabulation bouclée, voix de Runner annoncée sans doublon', async ({ page }) => {
  await boot(page);
  await guideReady(page);
  const a11y = await page.evaluate(() => { const root = document.getElementById('storeRunnerFirstRun'); return { role: root.getAttribute('role'), modal: root.getAttribute('aria-modal'), labelledby: root.getAttribute('aria-labelledby'), name: document.getElementById(root.getAttribute('aria-labelledby')).textContent, focus: document.activeElement && document.activeElement.id, progressHidden: root.querySelector('.srfrProgress').getAttribute('aria-hidden'), figureHidden: root.querySelector('.srRunnerFigure').getAttribute('aria-hidden'), logoAlt: root.querySelector('.srfrLogo').getAttribute('alt'), liveMode: root.querySelector('.srRunnerLive').getAttribute('aria-live'), liveRole: root.querySelector('.srRunnerLive').getAttribute('role') }; });
  expect(a11y).toEqual({ role: 'dialog', modal: 'true', labelledby: 'srfrTitle', name: 'Bienvenue dans Store Runner', focus: 'srfrTitle', progressHidden: 'true', figureHidden: 'true', logoAlt: '', liveMode: 'polite', liveRole: 'status' });
  /* La voix de Runner est le contenu du guide : un lecteur d'écran l'entend (sa bulle visuelle est masquée). */
  const live = () => page.evaluate(() => document.querySelector('#storeRunnerFirstRun .srRunnerLive').textContent);
  await expect.poll(live).toMatch(/^Je suis Runner, ton copilote terrain\.+ Je t’aide à préparer ton secteur et tes tournées\.$/);
  /* Tabulation : Commencer, J'ai déjà une sauvegarde, Plus tard, puis retour au début. */
  const order = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement.textContent.trim())); }
  expect(order).toEqual(['Commencer', 'J’ai déjà une sauvegarde', 'Plus tard', 'Commencer']);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement.textContent.trim())).toBe('Plus tard');
  /* Entrée sur le bouton actif : l'étape change, le focus suit le titre. */
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Ton secteur');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('srfrTitle');
  /* Chaque étape annonce sa propre phrase ; un état qui change (ici des magasins ajoutés) l'annonce une fois. */
  await expect.poll(live).toMatch(/^Commençons par ton secteur\.+ Ajoute tes magasins ou importe tes données\.$/);
  await addStores(page, 3);
  await expect.poll(live).toMatch(/^3 magasins dans ton secteur\.+ Tu peux en ajouter d’autres ou continuer\.$/);
  /* Un échec est annoncé par sa note (role=alert), pas une seconde fois par Runner. */
  await page.evaluate(() => { window.__geo.mode = 'denied'; });
  await tap(page, 'Continuer');
  await tap(page, 'Utiliser ma position');
  await expect(page.locator(GUIDE + ' .srfrNote.alert')).toHaveAttribute('role', 'alert');
  await expect.poll(live).toBe('');
});

/* ---------------------------------------------------------------- 9. PWA et hors ligne */
test.describe('PWA — le guide fonctionne hors ligne, du premier écran à la génération', () => {
  test.use({ serviceWorkers: 'allow' });
  test('shell précaché, reprise et parcours complet sans réseau', async ({ page, context }) => {
    test.setTimeout(150000);
    const errors = await boot(page);
    await guideReady(page);
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const rev = sw.match(/const BUILD_REV = "([^"]+)"/)[1];
    const shell = sw.match(/const CORE_SHELL = \[([\s\S]*?)\];/)[1];
    for (const file of ['navigation-controller.js', 'runner-visual.js', 'home-refresh-v2.js', 'profile-controller.js', 'planning-generation-controller.js', 'store-add-v261.js', 'app-icon.svg']) expect(shell, file + ' dans le shell obligatoire').toContain('"./' + file + '"');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async rev => { const name = (await caches.keys()).find(n => n.includes(rev)); if (!name) return 'aucun cache'; const cache = await caches.open(name); const hits = await Promise.all(['navigation-controller.js', 'runner-visual.js', 'app-icon.svg'].map(f => cache.match(new URL('./' + f + '?rev=' + rev, location.href).href))); return hits.every(Boolean) ? 'présent' : 'absent'; }, rev), { timeout: 40000 }).toBe('présent');
    await tap(page, 'Commencer');
    await addStores(page, 8);
    await flush(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.StoreRunnerNavigation && window.state && window.__chefStorage && window.storeRunnerGenerateThreeWeeks, null, { timeout: 30000 });
    await guideReady(page);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(await view(page)).toMatchObject({ eyebrow: 'Étape 3 sur 5', title: 'Ton point de départ', stores: 8 });
    const logo = await page.evaluate(() => { const img = document.querySelector('#storeRunnerFirstRun .srfrLogo'); return img.complete && img.naturalWidth > 0; });
    expect(logo, 'le logo du premier écran est servi hors ligne').toBe(true);
    await tap(page, 'Utiliser ma position');
    await expect(page.locator(GUIDE + ' .srRunner')).toHaveAttribute('data-state', 'success', { timeout: 15000 });
    await tap(page, 'Continuer');
    await tap(page, 'Générer mes 3 semaines');
    await expect(page.locator(GUIDE + ' #srfrTitle')).toHaveText('Tout est en place', { timeout: 60000 });
    await tap(page, 'Ouvrir mon accueil');
    await expect(page.locator(GUIDE)).toBeHidden();
    expect(await marker(page)).toMatchObject({ status: 'complete' });
    await context.setOffline(false);
    expect(errors.filter(e => !/Failed to fetch|NetworkError|net::|Service Worker/.test(e))).toEqual([]);
  });
});

/* ------------------------------------------------ 10. captures de la sortie de derrière le logo */
test('captures : Runner sort de derrière le logo (images figées du trajet V270)', async ({ page }) => {
  test.skip(!SHOTS, 'RUNNER_SHOTS_DIR non défini : captures non demandées');
  await boot(page);
  await page.waitForFunction(() => window.__audit.moves.length === 1);
  await page.evaluate(() => { for (const a of [...window.__audit.moves, ...window.__audit.poses]) a.animation.pause(); });
  const clip = await page.evaluate(() => { const r = document.querySelector('#storeRunnerFirstRun .srfrCard').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 10), width: innerWidth, height: Math.min(innerHeight - Math.max(0, r.top - 10), 330) }; });
  for (const [label, t] of [['cache', 0], ['tete', 300], ['sortie', 620], ['arrivee', 1180]]) {
    await page.evaluate(t => { for (const a of [...window.__audit.moves, ...window.__audit.poses]) a.animation.currentTime = t; }, t);
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(SHOTS, `v271-presentation-${label}-390.png`), clip });
  }
});
