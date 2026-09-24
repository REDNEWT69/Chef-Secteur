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

async function touchDrag(page, from, to, steps = 6) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }]
    });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: Math.round(from.x + (to.x - from.x) * t),
          y: Math.round(from.y + (to.y - from.y) * t)
        }]
      });
      await page.waitForTimeout(18);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function activeDay(screen) {
  return screen.locator('.srv2-planning-day[aria-selected="true"]').getAttribute('data-day');
}

test('V2-05a Planning : génération, semaines et vrais gestes tactiles restent sûrs à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="planning"]');
  await expect(screen).toBeVisible();
  await expect(screen.locator('.srv2-screen-placeholder')).toBeHidden();

  const date = screen.locator('.srv2-planning-date input');
  await expect(date).toHaveValue('2026-09-14');
  const dateBox = await date.boundingBox();
  if (!dateBox) throw new Error('Date planning V2 introuvable');
  expect(dateBox.height).toBeGreaterThanOrEqual(44);

  const previous = screen.locator('.srv2-planning-week-shift[data-week-shift="-1"]');
  const next = screen.locator('.srv2-planning-week-shift[data-week-shift="1"]');
  for (const [name, button] of [['précédente', previous], ['suivante', next]]) {
    const box = await button.boundingBox();
    if (!box) throw new Error(`Navigation semaine ${name} introuvable`);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 14/09/2026');

  const generate = screen.locator('.srv2-planning-generate');
  const generateBox = await generate.boundingBox();
  if (!generateBox) throw new Error('Bouton génération V2 introuvable');
  expect(generateBox.height).toBeGreaterThanOrEqual(44);
  await expect(screen.locator('.srv2-planning-empty')).toContainText('Aucune semaine générée');

  // Première semaine.
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

  // --- Vrais gestes tactiles -------------------------------------------------
  const swipeZone = screen.locator('.srv2-planning-swipe-zone');
  await expect(swipeZone).toBeVisible();
  await page.evaluate(() => {
    window.__v2GhostClicks = 0;
    document.querySelector('.srv2-planning-swipe-zone')?.addEventListener('click', () => {
      window.__v2GhostClicks += 1;
    });
  });

  // Swipe gauche sur la carte du lundi -> mardi, exactement un jour.
  let cardBox = await screen.locator('.srv2-planning-card').first().boundingBox();
  if (!cardBox) throw new Error('Carte planning V2 introuvable pour le swipe');
  await touchDrag(page,
    { x: Math.min(345, cardBox.x + cardBox.width * 0.82), y: cardBox.y + Math.min(30, cardBox.height * 0.5) },
    { x: Math.max(45, cardBox.x + cardBox.width * 0.18), y: cardBox.y + Math.min(30, cardBox.height * 0.5) }
  );
  await page.waitForTimeout(140);
  expect(await activeDay(screen)).toBe('Mardi');
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Bêta');
  expect(await page.evaluate(() => window.__v2GhostClicks)).toBe(0);

  // Petit mouvement horizontal : aucun changement de jour.
  cardBox = await screen.locator('.srv2-planning-card').first().boundingBox();
  if (!cardBox) throw new Error('Carte mardi introuvable');
  await touchDrag(page,
    { x: cardBox.x + cardBox.width * 0.58, y: cardBox.y + Math.min(28, cardBox.height * 0.5) },
    { x: cardBox.x + cardBox.width * 0.50, y: cardBox.y + Math.min(28, cardBox.height * 0.5) },
    3
  );
  await page.waitForTimeout(100);
  expect(await activeDay(screen)).toBe('Mardi');

  // Mouvement vertical : le navigateur garde le scroll, aucun preventDefault,
  // et le jour actif ne bouge pas.
  await page.evaluate(() => {
    window.__v2VerticalPrevented = null;
    document.querySelector('.srv2-planning-swipe-zone')?.addEventListener('touchmove', event => {
      window.__v2VerticalPrevented = event.defaultPrevented;
    }, { once: true, passive: true });
  });
  cardBox = await screen.locator('.srv2-planning-card').first().boundingBox();
  if (!cardBox) throw new Error('Carte mardi introuvable pour le scroll vertical');
  await touchDrag(page,
    { x: cardBox.x + cardBox.width * 0.50, y: cardBox.y + Math.min(24, cardBox.height * 0.45) },
    { x: cardBox.x + cardBox.width * 0.52, y: cardBox.y + 125 },
    5
  );
  await page.waitForTimeout(100);
  expect(await activeDay(screen)).toBe('Mardi');
  expect(await page.evaluate(() => window.__v2VerticalPrevented)).toBe(false);

  // Swipe droite -> lundi.
  cardBox = await screen.locator('.srv2-planning-card').first().boundingBox();
  if (!cardBox) throw new Error('Carte mardi introuvable pour le retour');
  await touchDrag(page,
    { x: cardBox.x + cardBox.width * 0.18, y: cardBox.y + Math.min(28, cardBox.height * 0.5) },
    { x: cardBox.x + cardBox.width * 0.82, y: cardBox.y + Math.min(28, cardBox.height * 0.5) }
  );
  await page.waitForTimeout(120);
  expect(await activeDay(screen)).toBe('Lundi');

  // Bord gauche : un swipe droite supplémentaire reste sur lundi.
  cardBox = await screen.locator('.srv2-planning-card').first().boundingBox();
  if (!cardBox) throw new Error('Carte lundi introuvable pour la borne');
  await touchDrag(page,
    { x: cardBox.x + cardBox.width * 0.18, y: cardBox.y + Math.min(28, cardBox.height * 0.5) },
    { x: cardBox.x + cardBox.width * 0.82, y: cardBox.y + Math.min(28, cardBox.height * 0.5) }
  );
  await page.waitForTimeout(100);
  expect(await activeDay(screen)).toBe('Lundi');

  // Les taps directs restent fonctionnels après les swipes.
  await screen.locator('.srv2-planning-day[data-day="Mardi"]').tap();
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Bêta');
  await screen.locator('.srv2-planning-day[data-day="Mercredi"]').tap();
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Gamma');
  await screen.locator('.srv2-planning-day[data-day="Jeudi"]').tap();
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(0);
  await expect(screen.locator('.srv2-planning-empty')).toContainText('Aucun magasin prévu jeudi');
  await expect(screen).not.toContainText('Enseigne Delta');

  // Bord droit : vendredi + swipe gauche reste vendredi.
  await screen.locator('.srv2-planning-day[data-day="Vendredi"]').tap();
  expect(await activeDay(screen)).toBe('Vendredi');
  const zoneBox = await swipeZone.boundingBox();
  if (!zoneBox) throw new Error('Zone tactile planning V2 introuvable');
  await touchDrag(page,
    { x: Math.min(345, zoneBox.x + zoneBox.width * 0.82), y: zoneBox.y + Math.min(35, zoneBox.height * 0.3) },
    { x: Math.max(45, zoneBox.x + zoneBox.width * 0.18), y: zoneBox.y + Math.min(35, zoneBox.height * 0.3) }
  );
  await page.waitForTimeout(100);
  expect(await activeDay(screen)).toBe('Vendredi');

  // Naviguer ne génère rien en douce : la semaine suivante est vide jusqu'au tap explicite.
  await next.tap();
  await expect(date).toHaveValue('2026-09-21');
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 21/09/2026');
  await expect(screen.locator('.srv2-planning-status')).toHaveText('');
  await expect(screen.locator('.srv2-planning-empty')).toContainText('Aucune semaine générée');

  // Deuxième semaine : elle est stockée sans effacer la première.
  await generate.tap();
  await expect(screen.locator('.srv2-planning-status')).toHaveText(
    'Semaine du 2026-09-21 générée : 3 magasins.'
  );
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(1);
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Alpha');

  // Retour arrière sans régénération : la première semaine doit réapparaître telle quelle.
  await previous.tap();
  await expect(date).toHaveValue('2026-09-14');
  await expect(screen.locator('.srv2-planning-week-current')).toHaveText('Semaine du 14/09/2026');
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(1);
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Alpha');

  // Et la seconde existe toujours lorsqu'on repart vers l'avant.
  await next.tap();
  await expect(date).toHaveValue('2026-09-21');
  await expect(screen.locator('.srv2-planning-card')).toHaveCount(1);
  await expect(screen.locator('.srv2-planning-card')).toContainText('Enseigne Alpha');

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

test('V2 Planning : un magasin se déplace au doigt dans sa journée et l’ordre persiste', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(V2_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const screen = page.locator('.srv2-screen[data-screen="planning"]');
  const generate = screen.locator('.srv2-planning-generate');
  await generate.tap();

  // Prépare une journée à trois magasins à partir de l'état V2 réellement
  // sauvegardé. On ne change ni le magasin, ni la semaine : seulement leur ordre.
  await page.evaluate(() => {
    const key = 'store_runner_v2_state';
    const state = JSON.parse(localStorage.getItem(key));
    const week = state.planning.weeks['2026-09-14'];
    state.settings.maxVisitsPerDay = 4;
    week.days.Lundi = ['demo-alpha', 'demo-beta', 'demo-gamma'];
    week.days.Mardi = [];
    week.days.Mercredi = [];
    week.days.Jeudi = [];
    week.days.Vendredi = [];
    state.planning.currentWeek = '2026-09-14';
    state.settings.weekDate = '2026-09-14';
    localStorage.setItem(key, JSON.stringify(state));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();

  const planning = page.locator('.srv2-screen[data-screen="planning"]');
  const cards = planning.locator('.srv2-planning-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Enseigne Alpha');
  await expect(cards.nth(1)).toContainText('Enseigne Bêta');
  await expect(cards.nth(2)).toContainText('Enseigne Gamma');
  expect(await activeDay(planning)).toBe('Lundi');

  const handles = planning.locator('.srv2-planning-drag-handle');
  await expect(handles).toHaveCount(3);
  const firstHandleBox = await handles.nth(0).boundingBox();
  const thirdHandleBox = await handles.nth(2).boundingBox();
  if (!firstHandleBox || !thirdHandleBox) throw new Error('Poignée tactile V2 introuvable');
  expect(firstHandleBox.width).toBeGreaterThanOrEqual(44);
  expect(firstHandleBox.height).toBeGreaterThanOrEqual(44);

  // Gamma passe de la troisième à la première place par un vrai geste tactile.
  await touchDrag(page,
    { x: thirdHandleBox.x + thirdHandleBox.width / 2, y: thirdHandleBox.y + thirdHandleBox.height / 2 },
    { x: firstHandleBox.x + firstHandleBox.width / 2, y: Math.max(4, firstHandleBox.y - 6) },
    8
  );
  await page.waitForTimeout(180);

  await expect(cards.nth(0)).toContainText('Enseigne Gamma');
  await expect(cards.nth(1)).toContainText('Enseigne Alpha');
  await expect(cards.nth(2)).toContainText('Enseigne Bêta');
  expect(await activeDay(planning)).toBe('Lundi');
  await expect(planning.locator('.srv2-planning-status')).toHaveText('Ordre de la journée enregistré.');

  const persisted = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('store_runner_v2_state'));
    return state.planning.weeks['2026-09-14'].days.Lundi;
  });
  expect(persisted).toEqual(['demo-gamma', 'demo-alpha', 'demo-beta']);
  expect(new Set(persisted).size).toBe(3);

  // Après fermeture/rechargement, l'ordre manuel doit être intact.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.srv2-nav');
  await page.locator('.srv2-tab[data-tab="planning"]').tap();
  const afterReload = page.locator('.srv2-screen[data-screen="planning"]');
  const reloadedCards = afterReload.locator('.srv2-planning-card');
  await expect(reloadedCards).toHaveCount(3);
  await expect(reloadedCards.nth(0)).toContainText('Enseigne Gamma');
  await expect(reloadedCards.nth(1)).toContainText('Enseigne Alpha');
  await expect(reloadedCards.nth(2)).toContainText('Enseigne Bêta');

  // Le geste horizontal reste disponible hors de la poignée.
  const firstCardBox = await reloadedCards.nth(0).boundingBox();
  if (!firstCardBox) throw new Error('Carte V2 introuvable après reload');
  await touchDrag(page,
    { x: firstCardBox.x + Math.min(170, firstCardBox.width * 0.55), y: firstCardBox.y + 24 },
    { x: firstCardBox.x + 28, y: firstCardBox.y + 24 },
    6
  );
  await page.waitForTimeout(120);
  expect(await activeDay(afterReload)).toBe('Mardi');

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    planningScrollWidth: document.querySelector('.srv2-planning-feature')?.scrollWidth || 0,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(overflow.planningScrollWidth).toBeLessThanOrEqual(391);
  expect(pageErrors, 'Le réordonnancement tactile ne doit produire aucune erreur JavaScript').toEqual([]);
});
