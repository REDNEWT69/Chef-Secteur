const { test, expect } = require('@playwright/test');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

test('Magasins distingue exclu/désactivé et actualise le vrai vivier à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('storesPanel') && typeof goTab === 'function');

  await page.evaluate(() => {
    const st = window.state || (typeof state !== 'undefined' ? state : null);
    if (!st) throw new Error('État Store Runner introuvable');
    window.state = st;
    st.stores = [
      { id:'reach-ok', enseigne:'Darty', ville:'Ville-Test A', adresse:'1 rue Test', dept: '99', active:true, priority:3, products:[] },
      { id:'reach-excluded', enseigne:'Darty', ville:'Ville-Test B', adresse:'2 rue Test', dept: '99', active:true, priority:3, products:[] },
      { id:'reach-off', enseigne:'Darty', ville:'Ville-Test E', adresse:'3 rue Test', dept: '99', active:false, priority:3, products:[] },
      { id:'reach-filtered', enseigne:'Boulanger', ville:'Ville-Test H', adresse:'4 rue Test', dept: '99', active:true, priority:3, products:[] }
    ];
    st.excluded = { 'reach-excluded': true };
    st.included = {};
    st.locks = {};
    st.notes = {};
    st.settings = Object.assign({}, st.settings || {}, {
      brands: ['Darty'],
      products: [],
      days: ['Lundi','Mardi','Mercredi','Jeudi','Vendredi']
    });
    st.plan = { Lundi:[], Mardi:[], Mercredi:[], Jeudi:[], Vendredi:[], Samedi:[] };
    try { if (typeof save === 'function') save(); } catch (_) {}
    try { if (typeof renderFilterControls === 'function') renderFilterControls(); } catch (_) {}
    try { if (typeof renderStores === 'function') renderStores(); } catch (_) {}
    goTab('storesPanel');
  });
  await page.waitForTimeout(220);

  const panel = page.locator('#storesPanel');
  await expect(panel).toBeVisible();

  const kpis = page.locator('#storeKpis');
  await expect(kpis).toContainText('1planifiables');
  await expect(kpis).toContainText('3 actifs sur 4 dans le secteur');
  await expect(kpis).toContainText('1 exclu du planning');
  await expect(kpis).toContainText('1 écarté par le filtre Enseignes');
  await expect(kpis).toContainText('1 désactivé du secteur');

  const excludedLine = panel.locator('.storeline').filter({ hasText: 'Darty · Ville-Test B' }).first();
  const disabledLine = panel.locator('.storeline').filter({ hasText: 'Darty · Ville-Test E' }).first();
  await expect(excludedLine).toHaveClass(/excluded/);
  await expect(excludedLine.locator('.storeTagExcluded')).toHaveText('⊘ Exclu du planning');
  await expect(disabledLine).toHaveClass(/inactive/);
  await expect(disabledLine.locator('.storeTagOff')).toHaveText('✕ Désactivé du secteur');

  let overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const reactivate = excludedLine.getByRole('button', { name: '↩ Réactiver' });
  await expect(reactivate).toBeVisible();
  await reactivate.click();
  await page.waitForTimeout(160);

  expect(await page.evaluate(() => Boolean((window.state || state).excluded['reach-excluded']))).toBe(false);
  const refreshedLine = panel.locator('.storeline').filter({ hasText: 'Darty · Ville-Test B' }).first();
  await expect(refreshedLine.locator('.storeTagExcluded')).toHaveCount(0);
  await expect(refreshedLine).not.toHaveClass(/excluded/);
  await expect(kpis).toContainText('2planifiables');
  await expect(kpis).not.toContainText('exclu du planning');
  await expect(kpis).toContainText('1 écarté par le filtre Enseignes');
  await expect(kpis).toContainText('1 désactivé du secteur');

  overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(pageErrors, 'Le rendu Magasins et la réactivation ne doivent produire aucune erreur JS').toEqual([]);
});
