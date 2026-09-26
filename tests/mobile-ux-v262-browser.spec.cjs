const { test, expect } = require('@playwright/test');

// V262 — confort mobile vérifié dans un vrai Chromium, profil Android puis iPhone, 390 px.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

async function boot(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.StoreRunnerMobileUX && window.StoreRunnerVisits && window.StorePhotosV1 && window.StoreRunnerOpportunities && document.querySelector('#bottomAppNav[data-v2="1"]') && document.getElementById('storePhotosQuickBtn') && document.getElementById('openingHoursQuickBtn'));
  await page.evaluate(() => {
    const st = window.state, M = window.StoreRunnerVisitModel;
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    st.stores = Array.from({ length: 10 }, (_, i) => ({ id: 'm' + i, enseigne: i % 2 ? 'Darty' : 'Boulanger', ville: 'Ville-Test ' + i, adresse: (10 + i) + ' avenue du Test, Zone commerciale des Portes', dept: '99', lat: 45.7 + i * 0.01, lon: 4.8 + i * 0.01, active: true, priority: 3, products: ['Blanc', 'Brun'] }));
    st.plan = { Lundi: st.stores.slice(0, 3), Mardi: st.stores.slice(3, 6), Mercredi: st.stores.slice(6, 9), Jeudi: [], Vendredi: [], Samedi: [] };
    st.settings = Object.assign({}, st.settings || {}, { days, target: 9, maxVisitsPerDay: 4, startTime: '08:30', endTime: '18:00', visitMinutes: 60 });
    st.notes = { m0: 'Responsable Julien. PLV mural à revoir, former deux vendeurs sur la gamme encastrable.' };
    st.locks = {}; st.included = {}; st.excluded = {}; st.appointments = []; st.calendarEvents = []; st.visits = {};
    st.businessV2 = M.empty();
    for (let n = 0; n < 6; n++) { const id = M.start(st, 'm0'); M.editVisit(st, id, 'conclusion', null, 'Visite ' + n); M.complete(st, id, '2026-09-' + String(10 + n).padStart(2, '0')) }
    try { save() } catch (e) { }
    try { renderAll() } catch (e) { }
  });
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [platform, userAgent] of [['Android', ANDROID_UA], ['iPhone', IPHONE_UA]]) {
  test.describe(platform, () => {
    test.use({ userAgent });

    test(`V262 ${platform} — fiche magasin : l’essentiel d’abord, le reste replié`, async ({ page }) => {
      const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
      await boot(page);
      await page.evaluate(() => { goTab('planPanel'); openStoreQuick('m1', 'Lundi', '09:30') });
      const sheet = page.locator('#storeQuickSheet'); await expect(sheet).toHaveClass(/open/);
      await page.waitForTimeout(350);

      const start = page.locator('#srQuickStart'), maps = sheet.locator('button[onclick*="mapsFromQuick"]'), note = sheet.locator('.sheetActions button[onclick*="focusQuickNote"]');
      const photos = page.locator('#storePhotosQuickBtn'), opps = page.locator('#srOpportunityQuickBtn'), more = page.locator('#sqMoreBtn');
      for (const b of [start, maps, note, photos, opps, more]) { await expect(b).toBeVisible(); await expect(b).toBeInViewport(); expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44) }
      const [bs, bm, bn, bp, bo, bmore] = await Promise.all([start, maps, note, photos, opps, more].map(b => b.boundingBox()));
      expect(bs.width).toBeGreaterThan(300);
      expect(Math.abs(bm.y - bn.y)).toBeLessThanOrEqual(1); expect(Math.abs(bn.y - bp.y)).toBeLessThanOrEqual(1);
      expect(bm.y).toBeGreaterThan(bs.y); expect(bo.y).toBeGreaterThan(bm.y); expect(Math.abs(bo.y - bmore.y)).toBeLessThanOrEqual(1);

      // Les actions rares sont repliées… et accessibles d'un geste.
      const rare = ['#pinQuickStoreBtn', '#changeQuickStoreBtn', '#startQuickStoreFirstBtn', '#openingHoursQuickBtn', '#srReportQuickBtn', '#storeQuickSheet button[onclick*="fullStoreFromQuick"]', '#storeQuickSheet button[onclick*="appointmentFromQuick"]'];
      for (const sel of rare) await expect(page.locator(sel)).toBeHidden();
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await more.tap();
      await expect(more).toHaveAttribute('aria-expanded', 'true'); await expect(more).toHaveText('Moins d’actions');
      for (const sel of rare) { const b = page.locator(sel); await expect(b).toBeVisible(); expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44) }

      // Enregistrer la note suit directement la note, et fonctionne.
      const area = page.locator('#sqNote'), save = page.locator('#storeQuickSheet .sheetNoteSave button');
      const [ba, bsave] = [await area.boundingBox(), await save.boundingBox()];
      expect(bsave.y - (ba.y + ba.height)).toBeLessThanOrEqual(16);
      await area.fill('Note V262');
      await save.tap();
      await expect.poll(() => page.evaluate(() => state.notes.m1)).toBe('Note V262');
      expect(await noOverflow(page)).toBeLessThanOrEqual(1);

      // Refermée puis rouverte : de nouveau repliée.
      await page.locator('#storeQuickSheet .sheetClose').tap();
      await expect(sheet).not.toHaveClass(/open/);
      await page.evaluate(() => openStoreQuick('m1', 'Lundi', '09:30'));
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#pinQuickStoreBtn')).toBeHidden();
      expect(errors).toEqual([]);
    });

    test(`V262 ${platform} — clavier : le champ reste visible, la barre du bas s’efface`, async ({ page }) => {
      const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
      await boot(page);
      const nav = page.locator('#bottomAppNav');
      await page.evaluate(() => openStoreQuick('m0'));
      await page.waitForTimeout(350);
      await page.locator('#sqNote').tap();
      // Clavier ouvert : Android (resizes-content) réduit la zone d'affichage.
      await page.setViewportSize({ width: 390, height: 500 });
      await expect(page.locator('html')).toHaveAttribute('data-sr-keyboard', 'open');
      await expect(nav).toBeHidden();
      await expect(page.locator('#sqNote')).toBeInViewport();
      await page.evaluate(() => document.activeElement.blur());
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('html')).not.toHaveAttribute('data-sr-keyboard', 'open');
      await page.evaluate(() => closeStoreQuick());
      await expect(nav).toBeVisible();

      await page.evaluate(() => goTab('storesPanel'));
      await page.locator('#storeSearch').tap();
      await page.setViewportSize({ width: 390, height: 500 });
      await expect(page.locator('html')).toHaveAttribute('data-sr-keyboard', 'open');
      await expect(page.locator('#storeSearch')).toBeInViewport();
      await page.evaluate(() => document.activeElement.blur());
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(nav).toBeVisible();

      // Rangée magasin : ✎ reste une vraie cible, sur la même ligne qu'Imposer / Exclure.
      const flags = page.locator('#storesPanel .storeline .flags').first();
      const edit = flags.locator('button[onclick^="openStore"]'), include = flags.locator('button[onclick^="toggleInclude"]');
      const [be, bi] = [await edit.boundingBox(), await include.boundingBox()];
      expect(be.width).toBeGreaterThanOrEqual(44); expect(be.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(be.y - bi.y)).toBeLessThanOrEqual(1);
      expect(await noOverflow(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  });
}

test('V262 Android — le bouton retour referme avant de quitter, sans recharger', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ANDROID_UA, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await boot(page);
  await page.evaluate(() => { window.__v262NoReload = true });
  const now = () => page.evaluate(() => ({ panel: document.querySelector('.panel.active').id, sheet: document.getElementById('storeQuickSheet').classList.contains('open'), more: document.getElementById('moreSheetV2').classList.contains('open'), ai: document.getElementById('assistantPanel').classList.contains('open'), sentinel: !!(history.state && history.state.srBack), alive: window.__v262NoReload === true }));
  const back = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(200) };

  await page.locator('#bottomAppNav [data-panel="planPanel"]').tap();
  await expect.poll(now).toMatchObject({ panel: 'planPanel', sentinel: true });
  const length = await page.evaluate(() => history.length);
  await page.evaluate(() => openStoreQuick('m1', 'Lundi', '09:30'));
  await back();
  expect(await now()).toMatchObject({ panel: 'planPanel', sheet: false, sentinel: true, alive: true });
  await back();
  expect(await now()).toMatchObject({ panel: 'homePanel', sentinel: false, alive: true });
  await expect(page.locator('#bottomAppNav .bottomNavBtn.active')).toHaveAttribute('data-panel', 'homePanel');

  await page.locator('#bottomAppNav [data-more]').tap();
  await expect.poll(now).toMatchObject({ more: true, sentinel: true });
  await back();
  expect(await now()).toMatchObject({ more: false, panel: 'homePanel', alive: true });

  await page.locator('#bottomAppNav [data-ai]').tap();
  await expect.poll(now).toMatchObject({ ai: true, sentinel: true });
  await back();
  expect(await now()).toMatchObject({ ai: false, alive: true });

  // Refermée depuis l'interface : la sentinelle est consommée, aucun retour « mort ».
  await page.evaluate(() => openStoreQuick('m2'));
  await expect.poll(now).toMatchObject({ sheet: true, sentinel: true });
  await page.locator('#storeQuickSheet .sheetClose').tap();
  await expect.poll(now).toMatchObject({ sheet: false, sentinel: false, alive: true });
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(length);
  expect(errors).toEqual([]);
  await context.close();
});

test('V262 — visite ouverte depuis une page défilée : en-tête à l’écran, « Réessayer » seulement en cas d’échec', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await boot(page);
  await page.evaluate(() => { goTab('planPanel'); window.scrollTo(0, 900) });
  await page.evaluate(() => StoreRunnerVisits.start('m3'));
  const dialog = page.locator('#srVisitDialog'); await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(844);
  await expect(dialog.locator('.sr-head')).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeInViewport();
  const retry = dialog.getByRole('button', { name: 'Réessayer l’enregistrement' });
  await expect(retry).toBeHidden();
  await page.evaluate(() => { const s = document.querySelector('#srVisitDialog>.sr-status'); s.classList.add('sr-error'); s.textContent = 'Échec test' });
  await expect(retry).toBeVisible();
  expect(errors).toEqual([]);
});
