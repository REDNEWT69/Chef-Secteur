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

async function installFixture(page) {
  await page.evaluate(() => {
    const st = window.state || (typeof state !== 'undefined' ? state : null);
    if (!st) throw new Error('État Store Runner introuvable');
    window.state = st;
    const days = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    const stores = Array.from({ length: 10 }, (_, i) => ({
      id: 'e2e-' + (i + 1),
      enseigne: i % 2 ? 'Darty' : 'Boulanger',
      ville: ['Ville-Test A','Ville-Test B','Ville-Test E','Ville-Test C','Ville-Test H'][i % 5],
      adresse: (10 + i) + ' rue Test Mobile',
      lat: 43.62 + i * 0.004,
      lon: -0.7 + i * 0.006,
      active: true,
      priority: 5 - (i % 5)
    }));
    st.profile = Object.assign({}, st.profile || {}, {
      baseName: 'Départ E2E', baseAddress: '1 place Bellecour Ville-Test A', baseLat:43.6578, baseLon:-0.668
    });
    st.settings = Object.assign({}, st.settings || {}, {
      weekDate: '2026-09-14', days, target: 10, maxVisitsPerDay: 4,
      startTime: '08:30', endTime: '18:00', visitMinutes: 60, brands: []
    });
    st.stores = stores;
    st.locks = {};
    st.included = {};
    st.excluded = {};
    st.plan = {
      Lundi: [stores[0], stores[1]],
      Mardi: [stores[2], stores[3]],
      Mercredi: [stores[4], stores[5]],
      Jeudi: [stores[6], stores[7]],
      Vendredi: [stores[8], stores[9]],
      Samedi: []
    };
    st.appointments = [];
    st.calendarEvents = [];
    const db = window.__chefStorage || window.localStorage;
    if (db && db.setItem) {
      db.setItem('chef_sector_range_v1', JSON.stringify({
        start: '2026-09-14', end: '2026-09-18', workDays: days, weeks: 1
      }));
    }
    try { if (typeof save === 'function') save(); } catch (_) {}
    try { if (typeof renderAll === 'function') renderAll(); } catch (_) {}
    try { if (typeof goTab === 'function') goTab('planPanel'); } catch (_) {
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('planPanel')?.classList.add('active');
    }
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
}

async function activeDate(page) {
  return page.locator('#dayTabs .periodDayTab.active').getAttribute('data-date');
}

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

test('Les réglages ne sont visibles que dans leur feuille à 390 px', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerNavigation&&window.state&&typeof window.renderAll==='function');
  await installFixture(page);
  const settings=page.locator('#planningSettings');
  const shortcut=page.locator('#planningSettingsShortcut');
  await expect(shortcut).toBeVisible();
  await expect(settings).not.toBeVisible();
  await settings.evaluate(el=>{el.open=true});
  await expect(settings).not.toBeVisible();
  await expect(settings).not.toHaveAttribute('role','dialog');
  await shortcut.tap();
  await expect(settings).toBeVisible();
  await expect(settings).toHaveAttribute('role','dialog');
  await expect(settings.locator(':scope > summary')).not.toBeVisible();
  const close=settings.locator('[data-planning-settings-close]');
  await expect(close).toBeVisible();
  const closeBox=await close.boundingBox();
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  const field=settings.locator('#target');
  await field.fill('17');
  const structure=await page.evaluateHandle(()=>({
    panel:document.getElementById('planningSettings'),
    inner:document.querySelector('#planningSettings .settingsInner'),
    field:document.getElementById('target'),
    parent:document.getElementById('planningSettings').parentNode
  }));
  await page.evaluate(async()=>{
    for(let i=0;i<6;i++){
      renderAll();
      document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
      await new Promise(requestAnimationFrame);
    }
  });
  expect(await structure.evaluate(s=>s.panel===document.getElementById('planningSettings')&&
    s.inner===s.panel.querySelector('.settingsInner')&&s.field===document.getElementById('target')&&
    s.panel.parentNode===s.parent)).toBe(true);
  await expect(field).toHaveValue('17');
  await expect(settings).toHaveCount(1);
  await expect(shortcut).toHaveCount(1);
  await close.tap();
  await expect(settings).not.toBeVisible();
  await page.evaluate(()=>{goTab('storesPanel');goTab('planPanel')});
  await shortcut.tap();
  await expect(field).toHaveValue('17');
  await expect(settings.locator('[data-planning-settings-close]')).toHaveCount(1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Store Runner V1 reste utilisable sur un vrai viewport mobile 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('planPanel') && typeof goTab === 'function');
  await installFixture(page);
  await page.waitForTimeout(900);

  const plan = page.locator('#planPanel');
  await expect(plan).toBeVisible();
  await expect(page.locator('#planningToolsV2')).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const tabs = page.locator('#dayTabs .periodDayTab');
  await expect(tabs).toHaveCount(5);
  const tabBoxes = await tabs.evaluateAll(nodes => nodes.map(n => {
    const r = n.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, text: n.textContent };
  }));
  for (const box of tabBoxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(391);
  }

  await tabs.nth(0).click();
  await expect(tabs.nth(0)).toHaveClass(/active/);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);

  const swipeTarget = page.locator('#planPanel .timelineRow .tlMain').first();
  await expect(swipeTarget).toBeVisible();
  const swipeBox = await swipeTarget.boundingBox();
  if (!swipeBox) throw new Error('Zone de swipe introuvable');
  await tabs.nth(0).click();
  expect(await activeDate(page)).toBe('2026-09-14');
  await touchDrag(page,
    { x: Math.min(340, swipeBox.x + swipeBox.width * 0.82), y: swipeBox.y + Math.min(36, swipeBox.height * 0.5) },
    { x: Math.max(55, swipeBox.x + swipeBox.width * 0.22), y: swipeBox.y + Math.min(36, swipeBox.height * 0.5) }
  );
  await page.waitForTimeout(220);
  expect(await activeDate(page)).toBe('2026-09-15');

  const beforeSmallMove = await activeDate(page);
  const freshBox = await page.locator('#planPanel .timelineRow .tlMain').first().boundingBox();
  if (!freshBox) throw new Error('Zone de swipe introuvable après changement de jour');
  await touchDrag(page,
    { x: freshBox.x + freshBox.width * 0.58, y: freshBox.y + Math.min(34, freshBox.height * 0.5) },
    { x: freshBox.x + freshBox.width * 0.50, y: freshBox.y + Math.min(34, freshBox.height * 0.5) },
    3
  );
  await page.waitForTimeout(120);
  expect(await activeDate(page)).toBe(beforeSmallMove);

  await page.evaluate(() => {
    window.__e2eVerticalPrevented = null;
    const shell = document.querySelector('#planPanel .timelineShell');
    shell?.addEventListener('touchmove', e => { window.__e2eVerticalPrevented = e.defaultPrevented; }, { once: true });
  });
  const verticalBox = await page.locator('#planPanel .timelineRow .tlMain').first().boundingBox();
  if (!verticalBox) throw new Error('Zone verticale introuvable');
  await touchDrag(page,
    { x: verticalBox.x + verticalBox.width * 0.5, y: verticalBox.y + Math.min(50, verticalBox.height * 0.7) },
    { x: verticalBox.x + verticalBox.width * 0.52, y: Math.max(120, verticalBox.y - 90) },
    5
  );
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__e2eVerticalPrevented)).toBe(false);

  await tabs.nth(2).click();
  expect(await activeDate(page)).toBe('2026-09-16');

  const beforeCard = await activeDate(page);
  const rowAction = page.locator('#planPanel .timelineRow button').first();
  if (await rowAction.count()) {
    await rowAction.click();
    await page.waitForTimeout(100);
    expect(await activeDate(page)).toBe(beforeCard);
    await page.keyboard.press('Escape').catch(() => {});
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(160);
  const lastRow = page.locator('#planPanel .timelineRow').last();
  await expect(lastRow).toBeVisible();
  const lastBox = await lastRow.boundingBox();
  const navBox = await page.locator('.bottomAppNav').boundingBox();
  if (lastBox && navBox) expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(navBox.y + 2);

  await page.evaluate(() => {
    const st = window.state || state;
    st.stores = [];
    try { if (typeof renderAll === 'function') renderAll(); } catch (_) {}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
  await page.waitForTimeout(120);
  // V239 : le bouton principal lance le cycle 3 semaines. Sans magasin, il doit le dire
  // au lieu de rester muet ou de vider le planning.
  await page.locator('#planningToolsV2 [data-planning-generate="three-weeks"]').click();
  await page.waitForTimeout(800);
  const statusText = await page.evaluate(() => {
    const candidates = ['planningGenerateStatus','rangePlanStatus','statusText','planStatus'];
    for (const id of candidates) {
      const el = document.getElementById(id);
      if (el && String(el.textContent || '').trim()) return String(el.textContent).trim();
    }
    return '';
  });
  expect(statusText.length).toBeGreaterThan(0);

  expect(pageErrors, 'Aucune erreur JavaScript bloquante ne doit remonter').toEqual([]);
});

test('Pose datée et verrou récurrent restent explicites dans Magasins à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('storesPanel') && typeof goTab === 'function');
  await installFixture(page);

  await page.evaluate(() => {
    const st = window.state || state;
    st.locks['e2e-1'] = { day: 'Mardi', week: '2026-09-14' };
    try { if (typeof save === 'function') save(); } catch (_) {}
    try { if (typeof renderAll === 'function') renderAll(); } catch (_) {}
    goTab('storesPanel');
  });
  await page.waitForTimeout(220);

  const storesPanel = page.locator('#storesPanel');
  await expect(storesPanel).toBeVisible();
  const line = storesPanel.locator('.storeline').filter({ hasText: 'Boulanger · Ville-Test A' }).first();
  await expect(line).toBeVisible();
  let select = line.locator('select');
  await expect(select).toBeVisible();

  let selectedText = await select.locator('option:checked').textContent();
  expect(selectedText).toContain('Posé ce mardi');
  expect(selectedText).toContain('semaine du 14/09');
  let selectBox = await select.boundingBox();
  if (!selectBox) throw new Error('Sélecteur de verrou introuvable');
  expect(selectBox.height).toBeGreaterThanOrEqual(44);
  expect(selectBox.x).toBeGreaterThanOrEqual(-1);
  expect(selectBox.x + selectBox.width).toBeLessThanOrEqual(391);
  let overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await select.selectOption('Mardi');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => (window.state || state).locks['e2e-1'])).toBe('Mardi');
  select = storesPanel.locator('.storeline').filter({ hasText: 'Boulanger · Ville-Test A' }).first().locator('select');
  selectedText = await select.locator('option:checked').textContent();
  expect(selectedText).toBe('Tous les mardis');

  await select.selectOption('');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call((window.state || state).locks, 'e2e-1'))).toBe(false);
  select = storesPanel.locator('.storeline').filter({ hasText: 'Boulanger · Ville-Test A' }).first().locator('select');
  expect(await select.locator('option:checked').textContent()).toBe('Jour libre');

  overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(pageErrors, 'Le scénario pose → récurrent → libre ne doit produire aucune erreur JS').toEqual([]);
});

test('Le filtre Enseignes affiche le vrai vivier et Tout sélectionner à 390 px', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('planPanel') && typeof goTab === 'function');

  await page.evaluate(() => {
    const st = window.state || state;
    const counts = [9,8,8,8,8,4,3,3,1,1,1];
    const stores = [];
    counts.forEach((count, brand) => {
      for (let i = 0; i < count; i++) stores.push({
        id: 'filter-' + stores.length,
        enseigne: 'Brand ' + brand,
        ville: 'Ville ' + stores.length,
        adresse: (100 + stores.length) + ' rue Filtre',
        lat: 43.6 + stores.length * 0.001,
        lon: -0.7 + stores.length * 0.001,
        active: true,
        priority: 3
      });
    });
    stores.push({id:'filter-disabled',enseigne:'Brand 0',ville:'Inactive',adresse:'1 rue Inactive',lat:43.6,lon:-0.7,active:false,priority:3});
    stores.push({id:'filter-excluded',enseigne:'Brand 0',ville:'Exclue',adresse:'2 rue Exclue',lat:43.61,lon:-0.69,active:true,priority:3});
    st.stores = stores;
    st.excluded = {'filter-excluded':true};
    st.included = {};
    st.locks = {};
    st.settings = Object.assign({}, st.settings || {}, {
      brands:['Brand 0','Brand 1','Brand 2','Brand 3','Brand 4'],
      products:[],days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],
      target:20,weekDate:'2026-09-14'
    });
    st.plan = {Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    try { if (typeof save === 'function') save(); } catch (_) {}
    try { if (typeof initControls === 'function') initControls(); } catch (_) {}
    try { if (typeof renderAll === 'function') renderAll(); } catch (_) {}
    goTab('planPanel');
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
  await page.waitForTimeout(950);
  await page.locator('#planningSettingsShortcut').tap();
  await page.evaluate(() => {
    const brands=document.getElementById('planningBrandsDetails');
    if(brands)brands.open=true;
  });
  await page.waitForTimeout(80);

  const countLine = page.locator('#planningDynamicStoreCount');
  await expect(countLine).toContainText('41 magasins disponibles pour le planning');
  await expect(countLine).toContainText('13 écartés par le filtre Enseignes');
  const brandSummary = page.locator('#planningBrandsDetails [data-choice-summary]');
  await expect(brandSummary).toHaveText('5 sur 11 · 13 magasins écartés');

  const allBrands = page.locator('#planningAllBrands');
  await expect(allBrands).toBeVisible();
  const buttonBox = await allBrands.boundingBox();
  if (!buttonBox) throw new Error('Bouton Toutes les enseignes introuvable');
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox.x).toBeGreaterThanOrEqual(-1);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(391);

  let overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await allBrands.click();
  await page.waitForTimeout(180);
  await expect(countLine).toHaveText('54 magasins disponibles pour le planning.');
  await expect(brandSummary).toHaveText('Toutes');
  await expect(page.locator('#planningAllBrands')).toHaveCount(0);
  expect(await page.evaluate(() => (window.state || state).settings.brands.length)).toBe(0);

  overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(pageErrors, 'Le compteur et le bouton Enseignes ne doivent produire aucune erreur JS').toEqual([]);
});
