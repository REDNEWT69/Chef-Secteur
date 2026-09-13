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
