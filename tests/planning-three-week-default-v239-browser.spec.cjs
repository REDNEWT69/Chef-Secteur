const { test, expect } = require('@playwright/test');

// V239 — dans un vrai navigateur mobile, la génération du planning est le cycle 3 semaines.
// Un seul bouton, pas de popup, pas d'action concurrente dans le menu, et les protections
// métier du moteur escargot restent celles d'avant.
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

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

test('V239 : « Générer mes 3 semaines » lance le cycle escargot depuis la semaine affichée à 390 px', async ({ page }) => {
  const pageErrors = [];
  const dialogs = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}) });
  await page.addInitScript(() => {
    const RealDate = Date;
    const fixed = RealDate.parse('2026-09-13T12:00:00Z');
    class FixedDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixed])) }
      static now() { return fixed }
    }
    window.Date = FixedDate;
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerTerrainPlanningV1 && window.state && document.getElementById('planPanel'));

  // Semaine affichée = S du 21/09. Une semaine du milieu est déjà posée à la main et un
  // magasin est épinglé sur le vendredi de la première semaine : rien de tout cela ne
  // doit bouger.
  await page.evaluate(() => {
    const st = window.state;
    const stores = Array.from({ length: 60 }, (_, i) => ({
      id: 'v239-' + String(i + 1).padStart(2, '0'), enseigne: 'Magasin Test', ville: 'Ville ' + (i + 1),
      adresse: (i + 1) + ' rue Escargot', dept: '99', lat: 43.658 + (i + 1) * 0.002, lon: -0.668,
      active: true, priority: 3, intervalDays: 30, products: []
    }));
    st.profile = Object.assign({}, st.profile || {}, {
      baseName: 'Domicile test', baseAddress: 'Ville-Test A', baseLat: 43.658, baseLon: -0.668,
      overnightMode: 'auto', overnightMinSaving: 80
    });
    st.settings = Object.assign({}, st.settings || {}, {
      weekDate: '2026-09-21', days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
      target: 10, maxVisitsPerDay: 3, startTime: '08:30', endTime: '18:00', visitMinutes: 45, brands: [], products: []
    });
    st.stores = stores;
    st.plan = { Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    st.included = {}; st.excluded = {}; st.appointments = []; st.calendarEvents = []; st.manualWeekEdits = {};
    st.locks = { 'v239-05': { day: 'Vendredi', week: '2026-09-21' } };
    window.syncGoogleCalendar = async () => ({ ok: true });
    const db = window.__chefStorage || localStorage;
    db.removeItem('chef_sector_range_v1');
    const manual = { Lundi: [], Mardi: [], Mercredi: [], Jeudi: [stores[59]], Vendredi: [], Samedi: [] };
    db.setItem('chef_sector_plan_archive_v1', JSON.stringify({
      '2026-09-28': { weekMonday: '2026-09-28', plan: manual, manualEdited: true, manualEditedAt: '2026-09-12T08:00:00.000Z' }
    }));
    const week = document.getElementById('weekDate'); if (week) week.value = '2026-09-21';
    try { if (typeof save === 'function') save() } catch (_) {}
    try { if (typeof renderAll === 'function') renderAll() } catch (_) {}
    try { if (typeof goTab === 'function') goTab('planPanel') } catch (_) {}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });

  // --- Le bouton principal : un seul, lisible, tactile, sans débordement --------------
  const generate = page.locator('#planningToolsV2 [data-planning-generate="three-weeks"]');
  await expect(generate).toBeVisible();
  await expect(generate).toHaveText('✦ Générer mes 3 semaines');
  await expect(page.locator('#planPanel button:visible', { hasText: 'Générer ma semaine' })).toHaveCount(0);

  const layout = await generate.evaluate(el => {
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    return {
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
      right: el.getBoundingClientRect().right,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      lines: Math.round((el.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / lineHeight)
    };
  });
  expect(layout.height).toBeGreaterThanOrEqual(44);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.right).toBeLessThanOrEqual(390);
  expect(layout.lines).toBeLessThanOrEqual(2);

  // --- Un clic direct : aucune popup, aucun choix intermédiaire ----------------------
  // Le verrou du bouton est observé sur le vrai bouton plutôt que sondé : la génération
  // peut se terminer plus vite qu'un aller-retour de test.
  await page.evaluate(() => {
    const btn = document.querySelector('#planningToolsV2 [data-planning-generate="three-weeks"]');
    window.__v239Busy = [];
    new MutationObserver(records => records.forEach(r => window.__v239Busy.push(r.oldValue === null ? 'verrouillé' : 'libéré')))
      .observe(btn, { attributes: true, attributeFilter: ['disabled'], attributeOldValue: true });
  });
  await generate.tap();
  await page.waitForFunction(() => {
    const db = window.__chefStorage || localStorage;
    const a = JSON.parse(db.getItem('chef_sector_plan_archive_v1') || '{}');
    return !!(a['2026-09-21'] && a['2026-09-28'] && a['2026-10-05']);
  }, undefined, { timeout: 20000 });
  await expect(generate).toBeEnabled();
  expect(await page.evaluate(() => window.__v239Busy), 'le bouton doit se verrouiller pendant la génération puis se libérer')
    .toEqual(['verrouillé', 'libéré']);
  expect(dialogs, 'la génération doit être directe, sans confirmation').toEqual([]);

  const status = await page.evaluate(() => {
    const el = document.getElementById('planningGenerateStatus');
    return el ? String(el.textContent || '') : '';
  });
  expect(status).toContain('Planning généré sur 3 semaines.');

  // --- Trois semaines consécutives à partir de la semaine affichée -------------------
  const result = await page.evaluate(days => {
    const db = window.__chefStorage || localStorage;
    const a = JSON.parse(db.getItem('chef_sector_plan_archive_v1') || '{}');
    const range = JSON.parse(db.getItem('chef_sector_range_v1') || '{}');
    const flat = key => days.flatMap(d => (a[key] && a[key].plan && a[key].plan[d] || []).map(s => s.id));
    const counts = key => days.map(d => (a[key] && a[key].plan && a[key].plan[d] || []).length);
    return {
      keys: Object.keys(a).sort(),
      weeks: ['2026-09-21', '2026-09-28', '2026-10-05'].map(flat),
      counts: ['2026-09-21', '2026-09-28', '2026-10-05'].map(counts),
      manualFlag: a['2026-09-28'] && a['2026-09-28'].manualEdited,
      rangeStart: range.start, rangeEnd: range.end, weeks3: range.weeks,
      weekDate: window.state.settings.weekDate,
      locks: JSON.parse(JSON.stringify(window.state.locks || {}))
    };
  }, DAYS);

  expect(result.keys).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
  expect(result.rangeStart).toBe('2026-09-21');
  expect(result.rangeEnd).toBe('2026-10-11');
  expect(result.weeks3).toBe(3);
  expect(result.weekDate).toBe('2026-09-21');

  // --- Protections : semaine posée à la main, magasin épinglé, capacité quotidienne ---
  expect(result.manualFlag).toBe(true);
  expect(result.weeks[1]).toEqual(['v239-60']);
  expect(result.locks['v239-05']).toEqual({ day: 'Vendredi', week: '2026-09-21' });
  const friday = await page.evaluate(() => {
    const db = window.__chefStorage || localStorage;
    const a = JSON.parse(db.getItem('chef_sector_plan_archive_v1') || '{}');
    return (a['2026-09-21'].plan.Vendredi || []).map(s => s.id);
  });
  expect(friday).toContain('v239-05');
  for (const week of result.counts) for (const count of week) expect(count).toBeLessThanOrEqual(3);
  const noDuplicate = result.weeks.flat();
  expect(new Set(noDuplicate).size).toBe(noDuplicate.length);

  // --- Le menu : l'action redondante a disparu, les autres restent, sans vide ---------
  await page.locator('#planningSettingsShortcut').tap();
  await expect(page.locator('#planningSettings')).toHaveAttribute('role', 'dialog');
  await page.locator('#rangePlannerCard').evaluate(el => { el.open = true });
  await expect(page.locator('#terrainSnailBtn')).toHaveCount(0);
  await expect(page.locator('#generateRangeBtn')).toBeVisible();
  await expect(page.locator('#generateRangeBtn')).toHaveText('Générer la période');
  await expect(page.locator('#rangeStart')).toBeVisible();
  await expect(page.locator('#rangeEnd')).toBeVisible();
  await expect(page.locator('#recalculateRemainingWeekBtn')).toHaveCount(1);

  const menu = await page.evaluate(() => {
    const body = document.querySelector('#rangePlannerCard .planningChoiceBody');
    const nodes = Array.from(body.children).map(el => ({
      tag: el.tagName, id: el.id, hidden: el.hidden,
      empty: !String(el.textContent || '').trim() && !el.querySelector('input,button,select')
    }));
    return { nodes, separators: body.querySelectorAll('hr').length };
  });
  expect(menu.separators, 'aucun séparateur orphelin ne doit rester').toBe(0);
  expect(menu.nodes.filter(n => n.empty && !n.hidden), 'aucun bloc vide visible ne doit rester').toEqual([]);

  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(overflow.sw).toBeLessThanOrEqual(overflow.cw + 1);
  expect(pageErrors).toEqual([]);
});
