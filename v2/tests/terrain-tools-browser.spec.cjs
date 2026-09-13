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

test('V2 terrain : départ local -> 3 semaines -> texte TeamHaven -> reload à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const planning = page.locator('.srv2-screen[data-screen="planning"]');
  const terrain = planning.locator('.srv2-terrain-tools');
  const range = planning.locator('.srv2-planning-range');
  await expect(terrain).toBeVisible();
  await expect(terrain.locator('.srv2-terrain-privacy')).toContainText('reste sur cet appareil');

  const name = terrain.locator('.srv2-origin-name');
  const lat = terrain.locator('.srv2-origin-lat');
  const lon = terrain.locator('.srv2-origin-lon');
  await expect(name).toHaveValue('Base Démo');
  await expect(lat).toHaveValue('45');
  await expect(lon).toHaveValue('4');

  const save = terrain.locator('.srv2-origin-save');
  const saveBox = await save.boundingBox();
  if (!saveBox) throw new Error('Bouton départ introuvable');
  expect(saveBox.height).toBeGreaterThanOrEqual(44);

  await name.fill('Départ terrain');
  await lat.fill('45.005');
  await lon.fill('4');
  await save.tap();
  await expect(terrain.locator('.srv2-origin-status')).toHaveText('Départ enregistré : Départ terrain.');
  await expect(range.locator('.srv2-planning-origin')).toHaveText('Départ : Départ terrain · GPS prêt');

  const savedOrigin = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('store_runner_v2_state'));
    return {
      name: state.settings.originName,
      lat: state.settings.originLat,
      lon: state.settings.originLon,
    };
  });
  expect(savedOrigin).toEqual({ name: 'Départ terrain', lat: 45.005, lon: 4 });

  const output = terrain.locator('.srv2-teamhaven-output');
  const copy = terrain.locator('.srv2-teamhaven-copy');
  await expect(copy).toBeDisabled();

  await range.locator('.srv2-planning-range-generate').tap();
  await expect(range.locator('.srv2-planning-range-status')).toContainText('3 semaines générées');
  await expect(output).toHaveValue(/SEMAINE DU 14\/09\/2026/);
  await expect(output).toHaveValue(/Lundi 14\/09\/2026/);
  await expect(output).toHaveValue(/Enseigne Alpha · Ville Alpha · 10 rue Démonstration/);
  await expect(output).toHaveValue(/SEMAINE DU 28\/09\/2026/);
  await expect(copy).toBeEnabled();

  const copyBox = await copy.boundingBox();
  if (!copyBox) throw new Error('Bouton TeamHaven introuvable');
  expect(copyBox.height).toBeGreaterThanOrEqual(44);

  const textBeforeReload = await output.inputValue();
  expect(textBeforeReload.length).toBeGreaterThan(100);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();
  const terrainAfterReload = page.locator('.srv2-screen[data-screen="planning"] .srv2-terrain-tools');
  await expect(terrainAfterReload.locator('.srv2-origin-name')).toHaveValue('Départ terrain');
  await expect(terrainAfterReload.locator('.srv2-teamhaven-output')).toHaveValue(textBeforeReload);
  await expect(terrainAfterReload.locator('.srv2-teamhaven-copy')).toBeEnabled();

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    planningScrollWidth: document.querySelector('.srv2-screen[data-screen="planning"]')?.scrollWidth || 0,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(overflow.planningScrollWidth).toBeLessThanOrEqual(391);
  expect(pageErrors).toEqual([]);
});
