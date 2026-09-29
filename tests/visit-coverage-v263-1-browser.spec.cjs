const { test, expect } = require('@playwright/test');

// V263.1 — cas qui demandent le runtime complet, sur un vrai téléphone 390 px.
//  a. V185 exécute le vrai moteur 3 semaines avec le drapeau de génération actif,
//     laisse Agenda en lecture du cache, puis V251 finalise une fois. L'appel direct de
//     la couche V185 contourne volontairement V184 : la protection ne dépend donc pas
//     de l'enveloppe legacy destinée à être retirée par le lot B2.
//  g. Pilotage ouvert : suppression d'une visite ou planning modifié → anneau et tuiles
//     à jour sans rouvrir le panneau.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });

/* Couches d'enveloppes autour d'une fonction, en suivant tous les liens connus. */
function layersOf(fn) {
  const out = []; let cur = fn, guard = 0;
  while (typeof cur === 'function' && guard++ < 200) {
    out.push(cur.__v185Geo ? 'v185' : cur.__v248RoadPrime ? 'v248' : cur.__v184PlanningCapacity ? 'v184' : 'moteur');
    cur = cur.__v185Original || cur.__v248Original || cur.__v184Original || cur.__original || null;
  }
  return out;
}

function profileLayersOf(fn) {
  const out = []; let cur = fn, guard = 0;
  while (typeof cur === 'function' && guard++ < 200) {
    out.push(cur.__v184PlanNeutral ? 'v184' : cur.__v182Wrapped ? 'v182' : 'owner');
    cur = cur.__v184Original || cur.__v182Original || cur.__original || null;
  }
  return out;
}

test('B2 : V185 garde Agenda en cache pendant le vrai moteur 3 semaines puis déclenche V251', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.addInitScript(() => {
    const RealDate = Date, fixed = RealDate.parse('2026-09-13T12:00:00Z');
    class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])) } static now() { return fixed } }
    window.Date = FixedDate;
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerTerrainPlanningV1 && window.StoreRunnerRoadMatrixV248 && window.StoreRunnerRouteOptimizerV251 && typeof window.syncGoogleCalendar === 'function' && window.state && document.getElementById('planPanel'));
  await page.waitForFunction(() => { try { save(); return true } catch (e) { return false } });
  await page.evaluate(() => {
    const st = window.state;
    const stores = Array.from({ length: 30 }, (_, i) => ({ id: 'a-' + i, enseigne: 'Magasin', ville: 'Ville ' + i, adresse: i + ' rue du Test', dept: '99',
      lat: 43.658 + (i % 7) * 0.03, lon: -0.668 + Math.floor(i / 7) * 0.04, active: true, priority: 3, intervalDays: 30, products: [] }));
    st.profile = Object.assign({}, st.profile || {}, { baseName: 'Base', baseLat: 43.658, baseLon: -0.668, overnightMode: 'never' });
    st.settings = Object.assign({}, st.settings || {}, { weekDate: '2026-09-14', days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], target: 10, maxVisitsPerDay: 3, startTime: '08:30', endTime: '18:00', visitMinutes: 45, brands: [], products: [] });
    st.stores = stores; st.plan = { Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    st.included = {}; st.excluded = {}; st.appointments = []; st.calendarEvents = []; st.manualWeekEdits = {}; st.locks = {}; st.visits = {};
    const calendarOwner = window.syncGoogleCalendar;
    window.__v2631CalendarTrace = [];
    window.syncGoogleCalendar = async function() {
      const active = window.__storeRunnerPlanningGenerationActive;
      const result = await calendarOwner.apply(this, arguments);
      window.__v2631CalendarTrace.push({ active, ok: !!(result && result.ok), cached: !!(result && result.cached), reason: String(result && result.reason || '') });
      return result;
    };
    const db = window.__chefStorage || localStorage; db.removeItem('chef_sector_range_v1'); db.removeItem('chef_sector_plan_archive_v1');
    const week = document.getElementById('weekDate'); if (week) week.value = '2026-09-14';
    if (typeof save === 'function') save(); if (typeof renderAll === 'function') renderAll(); if (typeof goTab === 'function') goTab('planPanel');
    // Une session réelle publie ces événements en continu (rendus, modifications, restaurations).
    for (let i = 0; i < 4; i++) document.dispatchEvent(new CustomEvent('store-runner:planning-updated', { detail: { reason: 'test-v263-1' } }));
  });
  await page.waitForTimeout(3200);
  const before = await page.evaluate(`(${layersOf.toString()})(window.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail)`);
  expect(before, 'chaîne B2 après retrait de V184').toEqual(['v185', 'v248', 'moteur']);

  await page.evaluate(() => {
    window.__v2631 = [];
    document.addEventListener('store-runner:planning-updated', e => window.__v2631.push(String(e.detail && e.detail.source || '') + '/' + String(e.detail && e.detail.reason || '')));
  });
  const generation = await page.evaluate(async () => {
    const api = window.StoreRunnerTerrainPlanningV1;
    let current = api.generateThreeWeekSnail, v185 = null, guard = 0;
    while (typeof current === 'function' && guard++ < 32) {
      if (current.__v185Geo) { v185 = current; break; }
      current = current.__v184Original || current.__v185Original || current.__v248Original || current.__original || null;
    }
    if (!v185) throw new Error('Enveloppe V185 introuvable');
    const previous = window.__storeRunnerPlanningGenerationActive;
    window.__storeRunnerPlanningGenerationActive = 'before-v185';
    try {
      const built = await v185.call(api, { start: '2026-09-14' });
      return {
        totalVisits: Number(built && built.totalVisits) || 0,
        weeks: Array.isArray(built && built.weeks) ? built.weeks.length : 0,
        restored: window.__storeRunnerPlanningGenerationActive,
        calendar: window.__v2631CalendarTrace.slice()
      };
    } finally {
      window.__storeRunnerPlanningGenerationActive = previous;
    }
  });
  expect(generation.totalVisits, 'la génération réelle doit réussir').toBeGreaterThan(0);
  expect(generation.weeks).toBe(3);
  expect(generation.restored, 'V185 doit restaurer la valeur précédente du drapeau').toBe('before-v185');
  expect(generation.calendar, 'Agenda doit être consulté une fois par semaine sous le drapeau V185').toHaveLength(3);
  for (const call of generation.calendar) {
    expect(call.active, 'le vrai moteur doit appeler Agenda avec le drapeau strictement true').toBe(true);
    expect(call).toMatchObject({ ok: true, cached: true, reason: 'planning-cache' });
  }
  await page.waitForFunction(() => { const r = JSON.parse((window.__chefStorage || localStorage).getItem('chef_sector_range_v1') || 'null'); return r && r.routeOptimized === 'v251' }, undefined, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const trace = await page.evaluate(() => window.__v2631.slice());
  expect(trace.filter(x => x.startsWith('snail-geo-v185/')), 'V185 doit regrouper une seule fois : ' + trace.join(' | ')).toHaveLength(1);
  expect(trace.filter(x => x.startsWith('route-opt-v251/')), 'V251 doit finaliser une seule fois : ' + trace.join(' | ')).toHaveLength(1);
  const order = trace.map(x => x.split('/')[0]);
  expect(order.indexOf('route-opt-v251')).toBeGreaterThan(order.indexOf('snail-geo-v185'));
  expect(trace.filter(x => x.endsWith('/three-week-snail')), 'le contrat historique reason:three-week-snail reste publié').toHaveLength(1);
  const after = await page.evaluate(`(${layersOf.toString()})(window.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail)`);
  expect(after, 'la chaîne ne doit pas croître pendant la génération').toEqual(before);
  expect(errors).toEqual([]);
});

test('V263.1 g : Pilotage ouvert — visite supprimée ou planning modifié → anneau et tuiles à jour sans rouvrir', async ({ page }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.StoreRunnerVisitCoverage && window.StoreRunnerSectorPilotage && window.StoreRunnerManualPlanning && window.StoreRunnerVisits && document.readyState !== 'loading');
  const seeded = await page.evaluate(() => {
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) };
    const now = new Date(), mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const week = iso(mon), today = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Lundi'][(now.getDay() + 6) % 7];
    const mk = (id, v) => ({ id, enseigne: 'Fnac', ville: v, adresse: '1 rue', dept: '69', active: true, lat: 45.75, lon: 4.85, priority: 3, intervalDays: 30, products: [] });
    const stores = [mk('g-ok1', 'Bron'), mk('g-ok2', 'Lyon'), mk('g-late', 'Vienne'), mk('g-never', 'Givors')];
    state.stores = stores; state.excluded = {}; state.included = {}; state.locks = {}; state.appointments = []; state.manualWeekEdits = {}; state.calendarEvents = [];
    state.visits = { 'g-ok1': { lastVisit: ago(5), history: [ago(5)] }, 'g-ok2': { lastVisit: ago(20), history: [ago(20)] }, 'g-late': { lastVisit: ago(45), history: [ago(45)] } };
    state.businessV2 = window.StoreRunnerVisitModel && typeof StoreRunnerVisitModel.empty === 'function' ? StoreRunnerVisitModel.empty() : { version: 2, revision: 0, visits: [], actions: [], storeSnapshots: {} };
    state.profile = Object.assign({}, state.profile, { baseLat: 45.75, baseLon: 4.85, baseName: 'Lyon' });
    state.settings = Object.assign({}, state.settings, { weekDate: week, days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'], maxVisitsPerDay: 4, brands: [], products: [] });
    state.plan = { Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    try { (window.__chefStorage || localStorage).removeItem('chef_sector_plan_archive_v1') } catch (e) {}
    const input = document.getElementById('weekDate'); if (input) input.value = week;
    if (typeof save === 'function') save(); if (typeof renderAll === 'function') renderAll();
    StoreRunnerSectorPilotage.open(window, {});
    return { deleted: ago(20), today };
  });
  const panel = page.locator('#pilotagePanel');
  await expect(panel).toHaveClass(/active/);
  await expect(panel.locator('.spRingCenter')).toContainText('2/4 à jour');
  await expect(panel.locator('.spKpi').nth(2)).toContainText('0 prévue cette semaine');

  // Suppression réelle d'une entrée d'historique : g-ok2 redevient « jamais visité ».
  await page.evaluate(date => window.deleteRecordedVisit('g-ok2', date), seeded.deleted);
  await expect(panel.locator('.spRingCenter')).toContainText('1/4 à jour');
  await expect(panel.locator('.spKpi').nth(1)).toContainText('3');

  // Modification manuelle du planning, par son propriétaire : la tuile de la semaine suit.
  await page.evaluate(day => StoreRunnerManualPlanning.addStore(window, 'g-late', day), seeded.today);
  await expect(panel.locator('.spKpi').nth(2)).toContainText('1 prévue cette semaine');
  await expect(panel).toHaveClass(/active/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('stabilisation : saveProfile garde une seule couche V184/V182 après 30 événements', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error && error.message || error)));
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.saveProfile === 'function' && window.StoreRunnerOvernightV182 && typeof StoreRunnerOvernightV182.render === 'function' && document.getElementById('pSaving'));
  // Les derniers rappels d'installation historiques partent à 1 400 ms / 1 200 ms.
  await page.waitForTimeout(1800);
  const initial = await page.evaluate(`(${profileLayersOf.toString()})(window.saveProfile)`);
  expect(initial, 'ordre propriétaire saveProfile r20').toEqual(['v184', 'v182', 'owner']);

  await page.evaluate(() => {
    for (let index = 0; index < 10; index++) {
      document.dispatchEvent(new CustomEvent('store-runner:planning-updated', { detail: { reason: 'save-profile-stability' } }));
      document.dispatchEvent(new CustomEvent('store-runner:home-rendered', { detail: { reason: 'save-profile-stability' } }));
      document.dispatchEvent(new CustomEvent('store-runner:data-restored', { detail: { reason: 'save-profile-stability' } }));
    }
  });
  await page.waitForTimeout(300);
  const afterEvents = await page.evaluate(`(${profileLayersOf.toString()})(window.saveProfile)`);

  expect(afterEvents, 'chaîne initiale=' + initial.join('>') + ' ; après 30 événements=' + afterEvents.join('>')).toEqual(initial);
  expect(afterEvents.filter(layer => layer === 'v184'), afterEvents.join('>')).toHaveLength(1);
  expect(afterEvents.filter(layer => layer === 'v182'), afterEvents.join('>')).toHaveLength(1);
  expect(afterEvents.length, afterEvents.join('>')).toBeLessThanOrEqual(3);

  const saved = await page.evaluate(async profileLayersSource => {
    state.profile = Object.assign({}, state.profile || {}, { sectorName: 'Avant', baseLat: 45.75, baseLon: 4.85, overnightMode: 'auto', overnightMinSaving: 80 });
    const keptStore = { id: 'kept', enseigne: 'Test', ville: 'Lyon', adresse: '1 rue du Test', active: true, lat: 45.75, lon: 4.85 };
    state.stores = [keptStore];
    state.plan = { Lundi: [keptStore], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    const values = {
      pSector: 'Secteur stable', pRep: 'Leia', pBaseName: 'Lyon', pBaseAddress: '1 rue du Test',
      pBaseLat: '45.75', pBaseLon: '4.85', pOvernight: 'never', pSaving: '0'
    };
    for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value;
    const planBefore = JSON.stringify(state.plan);
    const owner = StoreRunnerOvernightV182.render;
    let overnightRenders = 0;
    StoreRunnerOvernightV182.render = function() { overnightRenders++; return owner.apply(this, arguments); };
    const renderAllOwner = window.renderAll;
    const showErrorOwner = window.showError;
    const profileErrors = [];
    window.showError = message => profileErrors.push(String(message || ''));
    window.renderAll = function() { state.plan.Lundi.push({ id: 'profile-side-effect' }); };
    try {
      const result = await window.saveProfile();
      return {
        result, overnightRenders, profileErrors, planBefore, planAfter: JSON.stringify(state.plan),
        sectorName: state.profile.sectorName, repName: state.profile.repName,
        overnightMode: state.profile.overnightMode, overnightMinSaving: state.profile.overnightMinSaving,
        overnightText: String((document.getElementById('overnightBox') || {}).textContent || ''),
        layers: (0, eval)('(' + profileLayersSource + ')(window.saveProfile)')
      };
    } finally {
      window.renderAll = renderAllOwner;
      window.showError = showErrorOwner;
      StoreRunnerOvernightV182.render = owner;
    }
  }, profileLayersOf.toString());

  expect(saved.result, 'erreur saveProfile : ' + saved.profileErrors.join(' | ')).toBe(true);
  expect(saved.sectorName).toBe('Secteur stable');
  expect(saved.repName).toBe('Leia');
  expect(saved.overnightMode).toBe('never');
  expect(saved.overnightMinSaving).toBe(0);
  expect(saved.planAfter).toBe(saved.planBefore);
  expect(saved.overnightRenders, 'un saveProfile ne doit plus multiplier les rendus découché').toBe(1);
  expect(saved.overnightText).toContain('Découché désactivé');
  expect(saved.layers).toEqual(afterEvents);
  expect(errors).toEqual([]);
});
