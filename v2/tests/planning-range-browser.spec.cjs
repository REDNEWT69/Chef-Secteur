const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const V2_URL = new URL('v2/public/', BASE_URL).toString();

const STORAGE_KEY = 'store_runner_v2_state';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('V2-06 : trois semaines escargot sont générées, copiables et navigables à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 45.123, longitude: 4.456 } });
        },
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(text) {
          window.__copiedForTH = text;
        },
      },
    });
  });

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="planning"]');
  const range = screen.locator('.srv2-planning-range');
  await expect(range).toBeVisible();
  await expect(range.locator('.srv2-planning-origin')).toHaveText('Départ : Base Démo · GPS prêt');
  await expect(range.locator('.srv2-planning-range-reach')).toHaveText('3 planifiables sur 3 actifs · 1 désactivé');

  const usePosition = range.locator('.srv2-planning-origin-current');
  const positionBox = await usePosition.boundingBox();
  if (!positionBox) throw new Error('Bouton de point de départ introuvable');
  expect(positionBox.height).toBeGreaterThanOrEqual(44);
  await usePosition.tap();
  await expect(range.locator('.srv2-planning-origin')).toHaveText('Départ : Ma position · GPS prêt');
  await expect(range.locator('.srv2-planning-origin-status')).toContainText('Point de départ enregistré');

  const generateRange = range.locator('.srv2-planning-range-generate');
  await expect(generateRange).toBeEnabled();
  const buttonBox = await generateRange.boundingBox();
  if (!buttonBox) throw new Error('Bouton trois semaines introuvable');
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);

  await generateRange.tap();
  await expect(range.locator('.srv2-planning-range-status')).toContainText('3 semaines générées : 9 visites, 3 magasins distincts.');
  await expect(range.locator('.srv2-planning-range-status')).toContainText('Tous les magasins planifiables sont couverts');

  const exportArea = range.locator('.srv2-planning-range-export');
  await expect(exportArea).toBeVisible();
  await expect(exportArea).toHaveValue(/PLAN 3 SEMAINES · STORE RUNNER/);
  await expect(exportArea).toHaveValue(/Semaine du 14\/09\/2026/);
  await expect(exportArea).toHaveValue(/Enseigne Alpha/);

  const copy = range.locator('.srv2-planning-range-copy');
  const copyBox = await copy.boundingBox();
  if (!copyBox) throw new Error('Bouton de copie TeamHaven introuvable');
  expect(copyBox.height).toBeGreaterThanOrEqual(44);
  await copy.tap();
  await expect(range.locator('.srv2-planning-range-copy-status')).toContainText('Planning copié');
  const copiedText = await page.evaluate(() => window.__copiedForTH || '');
  expect(copiedText).toContain('Semaine du 14/09/2026');
  expect(copiedText).toContain('Enseigne Alpha');

  // Semaine 1 : le mode escargot remplit les journées dans l'ordre radial,
  // donc les deux magasins les plus proches sont ensemble le lundi.
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 14/09/2026');
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(2);
  await expect(screen.locator('.srv2-planning-card').nth(0)).toContainText('Enseigne Alpha');
  await expect(screen.locator('.srv2-planning-card').nth(1)).toContainText('Enseigne Bêta');

  await screen.locator('.srv2-planning-day[data-day="Mardi"]').tap();
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(1);
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Gamma');

  // Les semaines 2 et 3 existent déjà : naviguer ne doit pas demander de les
  // régénérer une par une. Une semaine remplie ne crée simplement aucun
  // élément `.srv2-planning-empty`.
  const next = screen.locator('.srv2-planning-week-shift[data-week-shift="1"]');
  await next.tap();
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 21/09/2026');
  await expect(screen.locator('.srv2-planning-empty')).toHaveCount(0);

  await next.tap();
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 28/09/2026');
  await expect(screen.locator('.srv2-planning-empty')).toHaveCount(0);

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    planningScrollWidth: document.querySelector('.srv2-screen[data-screen="planning"]')?.scrollWidth || 0,
    exportScrollWidth: document.querySelector('.srv2-planning-range-export')?.scrollWidth || 0,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(overflow.planningScrollWidth).toBeLessThanOrEqual(391);
  expect(overflow.exportScrollWidth).toBeLessThanOrEqual(391);

  // Aucun overlay, aucune couche bloquante : la nav basse reste immédiatement utilisable.
  await page.locator('.srv2-tab[data-tab="stores"]').tap();
  await expect(page.locator('.srv2-screen[data-screen="stores"]')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('V2-06 : exclusion et filtres passent avant la distance en mode escargot', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  const state = {
    version: 2,
    profile: { sectorName: 'Secteur Vivier', baseName: 'Maison Test', baseLat: 45, baseLon: 4 },
    stores: [
      { id: 'excluded-near', enseigne: 'Brand A', name: 'Exclu proche', ville: 'Ville 1', active: true, products: ['P'], lat: 45.01, lon: 4 },
      { id: 'eligible-near', enseigne: 'Brand A', name: 'Planifiable proche', ville: 'Ville 2', active: true, products: ['P'], lat: 45.02, lon: 4 },
      { id: 'filtered-brand', enseigne: 'Brand B', name: 'Hors filtre', ville: 'Ville 3', active: true, products: ['P'], lat: 45.03, lon: 4 },
      { id: 'inactive', enseigne: 'Brand A', name: 'Désactivé', ville: 'Ville 4', active: false, products: ['P'], lat: 45.04, lon: 4 },
      { id: 'eligible-far', enseigne: 'Brand A', name: 'Planifiable loin', ville: 'Ville 5', active: true, products: ['P'], lat: 45.05, lon: 4 },
    ],
    visits: [],
    actions: [],
    appointments: [],
    planning: { weeks: {}, excludedStoreIds: ['excluded-near'] },
    settings: {
      weekDate: '2026-09-14',
      days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
      target: 5,
      maxVisitsPerDay: 4,
      brands: ['Brand A'],
      products: ['P'],
    },
  };

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: state });

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="planning"]');
  const range = screen.locator('.srv2-planning-range');
  await expect(range.locator('.srv2-planning-range-reach')).toHaveText(
    '2 planifiables sur 4 actifs · 1 exclu · 1 filtré · 1 désactivé'
  );

  await range.locator('.srv2-planning-range-generate').tap();
  await expect(range.locator('.srv2-planning-range-status')).toContainText('6 visites, 2 magasins distincts');
  await expect(range.locator('.srv2-planning-range-status')).toContainText('Tous les magasins planifiables sont couverts');

  await expect(screen.locator('.srv2-planning-card')).toHaveCount(2);
  await expect(screen.locator('.srv2-planning-card').nth(0)).toContainText('Brand A');
  await expect(screen.locator('.srv2-planning-card').nth(0)).toContainText('Ville 2');
  await expect(screen.locator('.srv2-planning-card').nth(1)).toContainText('Ville 5');
  await expect(screen).not.toContainText('Ville 1');
  await expect(screen).not.toContainText('Ville 3');
  await expect(screen).not.toContainText('Ville 4');

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(pageErrors).toEqual([]);
});
