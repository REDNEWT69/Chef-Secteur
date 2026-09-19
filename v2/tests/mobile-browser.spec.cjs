const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const V2_URL = new URL('v2/public/', BASE_URL).toString();

const SCREENS = [
  ['home', 'Accueil'],
  ['planning', 'Planning'],
  ['stores', 'Magasins'],
  ['more', 'Plus'],
];

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('Store Runner V2 garde un shell mobile unique et réellement utilisable à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');

  // Le shell global appartient à un seul propriétaire et ne doit jamais se dupliquer.
  await expect(page.locator('.srv2-header')).toHaveCount(1);
  await expect(page.locator('.srv2-main')).toHaveCount(1);
  await expect(page.locator('.srv2-nav')).toHaveCount(1);
  await expect(page.locator('.srv2-screen')).toHaveCount(4);
  await expect(page.locator('.srv2-tab')).toHaveCount(4);

  // Aucun débordement horizontal global à la largeur iPhone de référence.
  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    appScrollWidth: document.getElementById('app')?.scrollWidth || 0,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(391);
  expect(overflow.appScrollWidth).toBeLessThanOrEqual(391);

  // La nav basse doit réellement être fixée au bas du viewport et réserver l'espace contenu.
  const layout = await page.evaluate(() => {
    const nav = document.querySelector('.srv2-nav');
    const main = document.querySelector('.srv2-main');
    const navStyle = getComputedStyle(nav);
    const mainStyle = getComputedStyle(main);
    const navRect = nav.getBoundingClientRect();
    return {
      navPosition: navStyle.position,
      navBottom: navRect.bottom,
      viewportHeight: innerHeight,
      mainPaddingBottom: parseFloat(mainStyle.paddingBottom) || 0,
    };
  });
  expect(layout.navPosition).toBe('fixed');
  expect(Math.abs(layout.navBottom - layout.viewportHeight)).toBeLessThanOrEqual(1);
  expect(layout.mainPaddingBottom).toBeGreaterThanOrEqual(76);

  // Chaque onglet est une vraie cible tactile >= 44px et change uniquement l'écran actif.
  for (const [screenId, label] of SCREENS) {
    const tab = page.locator(`.srv2-tab[data-tab="${screenId}"]`);
    const box = await tab.boundingBox();
    if (!box) throw new Error(`Onglet ${label} introuvable`);
    expect(box.height, `${label} doit faire au moins 44px de haut`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${label} doit faire au moins 44px de large`).toBeGreaterThanOrEqual(44);

    await tab.tap();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).toHaveClass(/is-active/);

    const activeScreen = page.locator(`.srv2-screen[data-screen="${screenId}"]`);
    await expect(activeScreen).toBeVisible();
    await expect(activeScreen).toHaveAttribute('aria-hidden', 'false');
    await expect(activeScreen.locator('h1')).toHaveText(label);

    for (const [otherId] of SCREENS.filter(([id]) => id !== screenId)) {
      await expect(page.locator(`.srv2-screen[data-screen="${otherId}"]`)).toHaveAttribute('aria-hidden', 'true');
    }
  }

  // Plusieurs allers-retours ne doivent jamais reconstruire/dupliquer le shell.
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const [screenId] of SCREENS) await page.locator(`.srv2-tab[data-tab="${screenId}"]`).tap();
  }
  await expect(page.locator('.srv2-header')).toHaveCount(1);
  await expect(page.locator('.srv2-main')).toHaveCount(1);
  await expect(page.locator('.srv2-nav')).toHaveCount(1);
  await expect(page.locator('.srv2-tab')).toHaveCount(4);

  // Contrat réel : un contenu long doit rester atteignable au-dessus de la nav basse.
  await page.locator('.srv2-tab[data-tab="home"]').tap();
  await page.evaluate(() => {
    const home = document.querySelector('.srv2-screen[data-screen="home"]');
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.id = 'v2-e2e-bottom-marker';
    marker.textContent = 'Dernière action';
    marker.style.cssText = 'display:block;min-height:44px;margin-top:1200px;width:100%';
    home.appendChild(marker);
  });
  await page.locator('#v2-e2e-bottom-marker').scrollIntoViewIfNeeded();
  const markerBox = await page.locator('#v2-e2e-bottom-marker').boundingBox();
  const navBox = await page.locator('.srv2-nav').boundingBox();
  if (!markerBox || !navBox) throw new Error('Mesure nav/contenu V2 impossible');
  expect(markerBox.y + markerBox.height).toBeLessThanOrEqual(navBox.y + 1);

  // Le shell ne doit déclencher aucune erreur JS bloquante au chargement ou à la navigation.
  expect(pageErrors, 'Aucune erreur JavaScript bloquante ne doit remonter dans V2').toEqual([]);
});

test('V2-03 Magasins : liste, recherche et fiche restent tactiles à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="stores"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="stores"]');
  await expect(screen).toBeVisible();
  await expect(screen.locator('.srv2-screen-placeholder')).toBeHidden();

  const search = screen.locator('.srv2-store-search input');
  await expect(search).toBeVisible();
  const searchBox = await search.boundingBox();
  if (!searchBox) throw new Error('Recherche magasins V2 introuvable');
  expect(searchBox.height).toBeGreaterThanOrEqual(44);
  expect(searchBox.x).toBeGreaterThanOrEqual(-1);
  expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(391);

  const cards = screen.locator('.srv2-store-card');
  await expect(cards).toHaveCount(4);
  for (let i = 0; i < await cards.count(); i++) {
    const box = await cards.nth(i).boundingBox();
    if (!box) throw new Error(`Carte magasin V2 ${i} introuvable`);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  }

  // Recherche sans accent : "beta" doit trouver la donnée fictive "Bêta".
  await search.fill('beta');
  await expect(screen.locator('.srv2-store-summary')).toHaveText('1 magasin trouvé sur 4');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Enseigne Bêta');

  // Tap carte -> vraie fiche ; le bouton Fermer reste une cible tactile sûre.
  await cards.first().tap();
  const detail = page.locator('.srv2-store-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.srv2-store-detail-title')).toHaveText('Enseigne Bêta');
  await expect(detail).toContainText('20 avenue Exemple');
  const close = detail.locator('.srv2-store-detail-close');
  const closeBox = await close.boundingBox();
  if (!closeBox) throw new Error('Fermeture fiche magasin V2 introuvable');
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  await close.tap();
  await expect(detail).toBeHidden();

  // Une fiche fermée ne doit pas laisser d'overlay invisible devant la nav.
  await page.locator('.srv2-tab[data-tab="home"]').tap();
  await expect(page.locator('.srv2-screen[data-screen="home"]')).toBeVisible();

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(pageErrors, 'La feature Magasins V2 ne doit produire aucune erreur JS').toEqual([]);
});

// V2-08A stays in the mobile entry point already selected by the full CI.
const visitsFixture = require('../fixtures/v1-backup-demo.json');
const visitsStorageKey = 'store_runner_v2_state';
async function importVisitsFixture(page, visits = {}) {
  await page.locator('.srv2-tab[data-tab="more"]').tap();
  const backup = JSON.parse(JSON.stringify(visitsFixture)); backup.state.visits = visits;
  await page.locator('.srv2-data-import-input').setInputFiles({
    name: 'synthetic-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('.srv2-data-tools-status')).toContainText('Secteur importé');
}
async function openVisitsStore(page) {
  await page.locator('.srv2-tab[data-tab="stores"]').tap();
  await page.locator('.srv2-store-card').first().tap();
  await expect(page.locator('.srv2-store-detail')).toBeVisible();
}
async function readVisitsState(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), visitsStorageKey);
}

test('V2-08A : démarrer, recharger, terminer et rouvrir une visite à 390×844', async ({ page, context }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(V2_URL);
  await importVisitsFixture(page);
  const initial = await readVisitsState(page);
  await openVisitsStore(page);
  const start = page.locator('.srv2-visit-start');
  const box = await start.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await start.tap();
  await expect(page.locator('.srv2-visit-status')).toHaveText('Visite en cours');
  const started = await readVisitsState(page);
  expect(started.visits).toHaveLength(1);
  expect(started.visits[0].status).toBe('in_progress');

  await page.reload(); await openVisitsStore(page);
  await expect(page.locator('.srv2-visit-status')).toHaveText('Visite en cours');
  await expect(page.locator('.srv2-visit-start')).toHaveCount(0);
  await page.locator('.srv2-visit-finish').tap();
  await expect(page.locator('.srv2-visit-history li')).toHaveCount(1);
  const finished = await readVisitsState(page);
  expect(finished.visits).toHaveLength(1);
  expect(finished.visits[0].id).toBe(started.visits[0].id);
  expect(finished.visits[0].status).toBe('completed');
  expect(finished.planning).toEqual(initial.planning);
  expect(finished.actions).toEqual(initial.actions);
  expect(finished.appointments).toEqual(initial.appointments);
  const date = finished.visits[0].completedDate.split('-').reverse().join('/');
  await expect(page.locator('.srv2-last-visit')).toHaveText('Dernière visite : ' + date);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  expect(errors).toEqual([]);

  // Real tab closure/reopening in the same browser storage, then repeated import.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(V2_URL); await openVisitsStore(reopened);
  await expect(reopened.locator('.srv2-visit-history li')).toHaveCount(1);
  await expect(reopened.locator('.srv2-last-visit')).toHaveText('Dernière visite : ' + date);
  await reopened.locator('.srv2-store-detail-close').tap();
  for (let repeat = 0; repeat < 2; repeat++) {
    await importVisitsFixture(reopened);
    expect((await readVisitsState(reopened)).visits).toEqual(finished.visits);
  }
  await importVisitsFixture(reopened, { 'v1-01': { lastVisit: '2026-09-18', history: ['2026-09-18'] } });
  await expect(reopened.locator('.srv2-data-tools-status')).toContainText('Visites V1 : non migrées');
  await expect(reopened.locator('.srv2-migration-report')).toContainText('state.visits non migré');
  expect((await readVisitsState(reopened)).visits).toEqual(finished.visits);
  await reopened.reload(); await openVisitsStore(reopened);
  await expect(reopened.locator('.srv2-visit-history li')).toHaveCount(1);
});

test('V2-08A : stockage indisponible, aucun faux succès ni perte après reload', async ({ page }) => {
  await page.goto(V2_URL); await importVisitsFixture(page); await openVisitsStore(page);
  const before = await readVisitsState(page);
  async function failWrites() {
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) {
        if (name === key) throw new DOMException('Stockage plein', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    }, visitsStorageKey);
  }
  await failWrites();
  await page.locator('.srv2-visit-start').tap();
  await expect(page.locator('.srv2-visit-status')).toContainText('Visite non enregistrée');
  await expect(page.locator('.srv2-visit-finish')).toHaveCount(0);
  expect(await readVisitsState(page)).toEqual(before);
  await page.reload(); await openVisitsStore(page);
  await page.locator('.srv2-visit-start').tap();
  const inProgress = await readVisitsState(page);
  await failWrites();
  await page.locator('.srv2-visit-finish').tap();
  await expect(page.locator('.srv2-visit-status')).toContainText('Visite non enregistrée');
  await expect(page.locator('.srv2-visit-history li')).toHaveCount(0);
  expect(await readVisitsState(page)).toEqual(inProgress);
  await page.reload(); await openVisitsStore(page);
  await expect(page.locator('.srv2-visit-status')).toHaveText('Visite en cours');
  await page.locator('.srv2-visit-cancel').tap();
  expect((await readVisitsState(page)).visits[0].status).toBe('cancelled');
  await page.reload(); await openVisitsStore(page);
  await expect(page.locator('.srv2-visit-history li')).toHaveCount(0);
  await expect(page.locator('.srv2-last-visit')).toHaveText('Aucune visite terminée.');
  await expect(page.locator('.srv2-visit-start')).toBeVisible();
});
