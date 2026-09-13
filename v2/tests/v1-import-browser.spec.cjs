const { test, expect } = require('@playwright/test');
const path = require('node:path');

const BASE_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const V2_URL = new URL('v2/public/', BASE_URL).toString();
const FIXTURE = path.resolve(__dirname, '../fixtures/v1-backup-demo.json');

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('V2-07 : backup V1 local -> 3 semaines -> reload sans perte à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');

  // Le contexte Playwright est neuf : aucun état V2 persistant au départ.
  const storageBefore = await page.evaluate(() => localStorage.getItem('store_runner_v2_state'));
  expect(storageBefore).toBeNull();

  await page.locator('.srv2-tab[data-tab="more"]').tap();
  const more = page.locator('.srv2-screen[data-screen="more"]');
  await expect(more).toBeVisible();
  await expect(more.locator('.srv2-data-tools-privacy')).toContainText('n’est envoyé à aucun serveur');

  const input = more.locator('.srv2-data-import-input');
  const inputBox = await input.boundingBox();
  if (!inputBox) throw new Error('Import V1 introuvable');
  expect(inputBox.height).toBeGreaterThanOrEqual(44);

  await input.setInputFiles(FIXTURE);
  const importStatus = more.locator('.srv2-data-tools-status');
  await expect(importStatus).toContainText('Secteur importé : 8 magasins, 7 actifs.');
  await expect(importStatus).toContainText('GPS prêts pour tous les magasins.');
  await expect(importStatus).toContainText('1 élément d’historique reste uniquement dans V1.');

  // Les données importées ont remplacé la démo dans le store central.
  await page.locator('.srv2-tab[data-tab="stores"]').tap();
  const stores = page.locator('.srv2-screen[data-screen="stores"]');
  await expect(stores.locator('.srv2-store-card')).toHaveCount(8);
  await expect(stores.locator('.srv2-store-card').first()).toContainText('Import Alpha');
  await expect(stores).not.toContainText('Enseigne Alpha');

  // Le point de départ importé rend le mode escargot immédiatement utilisable.
  // Le filtre Enseignes du backup ne sélectionne qu'Alpha + Bêta : les cinq
  // autres magasins actifs restent visibles dans Magasins mais hors vivier.
  await page.locator('.srv2-tab[data-tab="planning"]').tap();
  const planning = page.locator('.srv2-screen[data-screen="planning"]');
  const range = planning.locator('.srv2-planning-range');
  await expect(range.locator('.srv2-planning-origin')).toHaveText('Départ : Départ Import Démo · GPS prêt');
  await expect(range.locator('.srv2-planning-range-reach')).toHaveText(
    '2 planifiables sur 7 actifs · 5 filtrés · 1 désactivé'
  );

  await range.locator('.srv2-planning-range-generate').tap();
  await expect(range.locator('.srv2-planning-range-status')).toContainText('3 semaines générées : 6 visites, 2 magasins distincts.');
  await expect(range.locator('.srv2-planning-range-status')).toContainText('Tous les magasins planifiables sont couverts');
  await expect(planning.locator('.srv2-planning-card')).toHaveCount(2);
  await expect(planning.locator('.srv2-planning-card').nth(0)).toContainText('Import Alpha');
  await expect(planning.locator('.srv2-planning-card').nth(1)).toContainText('Import Bêta');

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('store_runner_v2_state')));
  expect(persisted.stores).toHaveLength(8);
  expect(Object.keys(persisted.planning.weeks).sort()).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);

  // Cas terrain : fermeture/réouverture simulée par un vrai reload. L'app doit
  // charger localStorage avant la fixture démo et retrouver le planning.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();
  const planningAfterReload = page.locator('.srv2-screen[data-screen="planning"]');
  await expect(planningAfterReload.locator('.srv2-planning-origin')).toHaveText('Départ : Départ Import Démo · GPS prêt');
  await expect(planningAfterReload.locator('.srv2-planning-range-reach')).toHaveText(
    '2 planifiables sur 7 actifs · 5 filtrés · 1 désactivé'
  );
  await expect(planningAfterReload.locator('.srv2-planning-week-current')).toHaveText('Semaine du 14/09/2026');
  await expect(planningAfterReload.locator('.srv2-planning-card')).toHaveCount(2);
  await expect(planningAfterReload.locator('.srv2-planning-card').first()).toContainText('Import Alpha');

  await page.locator('.srv2-tab[data-tab="stores"]').tap();
  await expect(page.locator('.srv2-screen[data-screen="stores"] .srv2-store-card')).toHaveCount(8);

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    appScrollWidth: document.getElementById('app')?.scrollWidth || 0,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(overflow.appScrollWidth).toBeLessThanOrEqual(391);
  expect(pageErrors).toEqual([]);
});
