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

async function touchDrag(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Zone tactile V2 introuvable');

  const viewport = page.viewportSize() || { width: 390, height: 844 };
  const startXRaw = deltaX > 0 ? box.x + Math.min(70, box.width * 0.25) : box.x + Math.max(box.width - 70, box.width * 0.75);
  const startYRaw = box.y + Math.min(Math.max(box.height * 0.5, 30), 420);
  const startX = Math.max(20, Math.min(viewport.width - 20, startXRaw));
  const startY = Math.max(80, Math.min(viewport.height - 150, startYRaw));
  const endX = Math.max(10, Math.min(viewport.width - 10, startX + deltaX));
  const endY = Math.max(50, Math.min(viewport.height - 80, startY + deltaY));
  const midX = startX + (endX - startX) * 0.55;
  const midY = startY + (endY - startY) * 0.55;

  const session = await page.context().newCDPSession(page);
  const point = (x, y) => ({ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 });
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point(startX, startY)],
    });
    await page.waitForTimeout(20);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(midX, midY)],
    });
    await page.waitForTimeout(20);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(endX, endY)],
    });
    await page.waitForTimeout(20);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

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

test('V2-05 Planning : swipe horizontal et scroll vertical cohabitent à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="planning"]');
  await screen.locator('.srv2-planning-generate').tap();
  const list = screen.locator('.srv2-planning-list');
  const day = name => screen.locator(`.srv2-planning-day[data-day="${name}"]`);

  await expect(day('Lundi')).toHaveAttribute('aria-selected', 'true');

  // Grand swipe gauche : exactement un jour, jamais plusieurs.
  await touchDrag(page, list, -250, 4);
  await expect(day('Mardi')).toHaveAttribute('aria-selected', 'true');
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Bêta');

  // Aucun verrou global post-swipe : un tap immédiat sur mercredi doit marcher.
  await day('Mercredi').tap();
  await expect(day('Mercredi')).toHaveAttribute('aria-selected', 'true');

  // Petit mouvement horizontal : sous le seuil, aucun changement de jour.
  await touchDrag(page, list, -28, 2);
  await expect(day('Mercredi')).toHaveAttribute('aria-selected', 'true');

  // Swipe droite : exactement le jour précédent.
  await touchDrag(page, list, 230, 3);
  await expect(day('Mardi')).toHaveAttribute('aria-selected', 'true');

  // Au bord gauche, on reste sur lundi au lieu d'inventer un dimanche.
  await day('Lundi').tap();
  await touchDrag(page, list, 230, 3);
  await expect(day('Lundi')).toHaveAttribute('aria-selected', 'true');

  // Rend la zone longue puis vérifie qu'un vrai geste vertical fait défiler
  // le conteneur principal sans changer le jour. Aucun preventDefault global.
  await page.evaluate(() => {
    const listEl = document.querySelector('.srv2-planning-list');
    const filler = document.createElement('div');
    filler.id = 'v2-planning-touch-filler';
    filler.style.cssText = 'height:1200px;pointer-events:none';
    listEl.appendChild(filler);
    document.querySelector('.srv2-main').scrollTop = 0;
  });

  await touchDrag(page, list, -4, -240);
  await page.waitForTimeout(120);
  const scrollTop = await page.locator('.srv2-main').evaluate(el => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await expect(day('Lundi')).toHaveAttribute('aria-selected', 'true');

  // Le navigateur ne doit toujours pas déborder horizontalement après les gestes.
  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(pageErrors, 'Les gestes V2 ne doivent produire aucune erreur JavaScript').toEqual([]);
});
