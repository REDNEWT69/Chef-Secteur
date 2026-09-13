const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const V2_URL = new URL('v2/public/', BASE_URL).toString();

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('V2-06 : trois semaines escargot sont générées et navigables à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="planning"]');
  const range = screen.locator('.srv2-planning-range');
  await expect(range).toBeVisible();
  await expect(range.locator('.srv2-planning-origin')).toHaveText('Départ : Base Démo · GPS prêt');

  const generateRange = range.locator('.srv2-planning-range-generate');
  await expect(generateRange).toBeEnabled();
  const buttonBox = await generateRange.boundingBox();
  if (!buttonBox) throw new Error('Bouton trois semaines introuvable');
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);

  await generateRange.tap();
  await expect(range.locator('.srv2-planning-range-status')).toContainText('3 semaines générées : 9 visites, 3 magasins distincts.');
  await expect(range.locator('.srv2-planning-range-status')).toContainText('Tous les magasins actifs sont couverts');

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
  // régénérer une par une.
  const next = screen.locator('.srv2-planning-week-shift[data-week-shift="1"]');
  await next.tap();
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 21/09/2026');
  await expect(screen.locator('.srv2-planning-empty')).not.toContainText('Aucune semaine générée');

  await next.tap();
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 28/09/2026');
  await expect(screen.locator('.srv2-planning-empty')).not.toContainText('Aucune semaine générée');

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    planningScrollWidth: document.querySelector('.srv2-screen[data-screen="planning"]')?.scrollWidth || 0,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(overflow.planningScrollWidth).toBeLessThanOrEqual(391);

  // Aucun overlay, aucune couche bloquante : la nav basse reste immédiatement utilisable.
  await page.locator('.srv2-tab[data-tab="stores"]').tap();
  await expect(page.locator('.srv2-screen[data-screen="stores"]')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
