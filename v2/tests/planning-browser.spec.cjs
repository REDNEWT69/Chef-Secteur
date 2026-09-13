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

test('V2-04 Planning : génération et navigation jours fonctionnent réellement à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="planning"]');
  await expect(screen).toBeVisible();
  await expect(screen.locator('.srv2-screen-placeholder')).toBeHidden();

  const date = screen.locator('.srv2-planning-date input');
  await expect(date).toHaveValue('2026-09-16');
  const dateBox = await date.boundingBox();
  if (!dateBox) throw new Error('Date planning V2 introuvable');
  expect(dateBox.height).toBeGreaterThanOrEqual(44);

  const generate = screen.locator('.srv2-planning-generate');
  const generateBox = await generate.boundingBox();
  if (!generateBox) throw new Error('Bouton génération V2 introuvable');
  expect(generateBox.height).toBeGreaterThanOrEqual(44);
  await expect(screen.locator('.srv2-planning-empty')).toContainText('Aucune semaine générée');

  await generate.tap();
  await expect(screen.locator('.srv2-planning-status')).toHaveText(
    'Semaine du 2026-09-14 générée : 3 magasins.'
  );

  const dayTabs = screen.locator('.srv2-planning-day');
  await expect(dayTabs).toHaveCount(5);
  for (let i = 0; i < await dayTabs.count(); i++) {
    const box = await dayTabs.nth(i).boundingBox();
    if (!box) throw new Error(`Jour planning V2 ${i} introuvable`);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  const monday = screen.locator('.srv2-planning-day[data-day="Lundi"]');
  await expect(monday).toHaveAttribute('aria-selected', 'true');
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(1);
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Alpha');

  await screen.locator('.srv2-planning-day[data-day="Mardi"]').tap();
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(1);
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Bêta');

  await screen.locator('.srv2-planning-day[data-day="Mercredi"]').tap();
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(1);
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Gamma');

  await screen.locator('.srv2-planning-day[data-day="Jeudi"]').tap();
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(0);
  await expect(screen.locator('.srv2-planning-empty')).toContainText('Aucun magasin prévu jeudi');
  await expect(screen).not.toContainText('Enseigne Delta');

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    planningScrollWidth: document.querySelector('.srv2-planning-feature')?.scrollWidth || 0,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(overflow.planningScrollWidth).toBeLessThanOrEqual(391);

  // Le planning ne doit pas laisser de couche bloquante : la nav reste tactile.
  await page.locator('.srv2-tab[data-tab="home"]').tap();
  await expect(page.locator('.srv2-screen[data-screen="home"]')).toBeVisible();
  expect(pageErrors, 'Le planning V2 ne doit produire aucune erreur JavaScript').toEqual([]);
});
