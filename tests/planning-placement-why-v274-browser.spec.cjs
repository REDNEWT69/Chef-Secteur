const { test, expect, devices } = require('@playwright/test');
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const strip = ({ defaultBrowserType, ...rest }) => rest;

// V274 — « Pourquoi ce jour » : la fiche Magasin 360, ouverte depuis une carte du Planning, dit ce qui fixe le jour et ce
// que dit le besoin de visite à cette date. Faits seulement, lecture seule : ni le planning, ni les visites, ni l'archive ne
// changent. Horloge figée au mercredi 07/10/2026 ; la semaine affichée est celle du lundi 05/10.
test.use({ ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Paris', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

const SEED = () => {
  const M = StoreRunnerVisitModel, blank = () => ({ Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] });
  const mk = (id, ville, extra) => Object.assign({ id, enseigne: 'Enseigne', ville, adresse: '1 rue Test', dept: '69', lat: 45.7, lon: 4.8, freq: 'Mensuel', active: true, priority: 3, products: ['Blanc'] }, extra || {});
  const a = mk('why-a', 'Alpha'), b = mk('why-b', 'Bravo'), c = mk('why-c', 'Charlie'), d = mk('why-d', 'Delta');
  const plan = blank(); plan.Lundi = [c]; plan.Jeudi = [a, b]; plan.Vendredi = [d];
  state.profile = Object.assign({}, state.profile || {}, { baseName: 'Base', baseAddress: 'Base', baseLat: 45.7, baseLon: 4.8 });
  state.settings = Object.assign({}, state.settings, { weekDate: '2026-10-05', days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], startTime: '08:30', endTime: '18:00', visitMinutes: 45 });
  state.stores = [a, b, c, d]; state.plan = plan; state.notes = {}; state.included = {}; state.excluded = {}; state.calendarEvents = []; state.hotelReservations = {};
  state.locks = { 'why-a': { day: 'Jeudi', week: '2026-10-05' } };
  state.visits = { 'why-b': { lastVisit: '2026-08-01', history: ['2026-08-01'] }, 'why-c': { lastVisit: '2026-09-20', history: ['2026-09-20'] } };
  state.appointments = [{ id: 'why-r1', storeId: 'why-a', date: '2026-10-08', time: '10:00', duration: 60, type: 'Formation', note: '' }];
  state.businessV2 = M.empty();
  __chefStorage.setItem('chef_sector_plan_archive_v1', JSON.stringify({ '2026-10-05': { weekMonday: '2026-10-05', plan } }));
  save(); renderAll();
};
const SNAPSHOT = () => JSON.stringify({ plan: state.plan, visits: state.visits, appointments: state.appointments, locks: state.locks, included: state.included, excluded: state.excluded, stores: state.stores.length, archive: __chefStorage.getItem('chef_sector_plan_archive_v1'), range: __chefStorage.getItem('chef_sector_range_v1') });

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String((e && e.message) || e)));
  await page.clock.setFixedTime(new Date('2026-10-07T10:00:00+02:00'));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.StoreRunnerStoreExplorer && window.StoreRunnerVisitModel && window.StoreRunnerVisitCoverage && window.__chefStorage);
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: 'aside[role="status"],#storeRunnerUpdateBanner{display:none!important}' });
  await page.evaluate(SEED);
  await page.evaluate(() => window.goTab('planPanel'));
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  return errors;
}
async function openCard(page, day, id) {
  await page.evaluate(d => window.selectPlanningDay(d), day);
  const card = page.locator('#week .timelineRow:not(.calendarEvent) .tlMain[onclick*="\'' + id + '\'"]');
  await expect(card).toHaveCount(1);
  await card.tap();
  await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
  await expect(page.locator('#srStore360')).toBeVisible();
}
const closeSheet = page => page.evaluate(() => window.closeStoreQuick());

for (const [label, size] of [['390 px', { width: 390, height: 844 }], ['360 px', { width: 360, height: 780 }]]) {
  test('Pourquoi ce jour — depuis une carte du Planning, faits seulement, lecture seule (' + label + ')', async ({ page }) => {
    await page.setViewportSize(size);
    const errors = await boot(page);
    const before = await page.evaluate(SNAPSHOT);
    const sec = page.locator('#srStore360');

    // Ce qui fixe le jour : rendez-vous et pose manuelle datée, puis le besoin de visite lu à cette date.
    await openCard(page, 'Jeudi', 'why-a');
    await expect(sec.locator('h3').first()).toHaveText('Pourquoi ce jour ?');
    await expect(sec.locator('[data-sr-x-why="fixed"]')).toHaveText('Rendez-vous ce jour-là à 10:00');
    const why = sec.locator('.srXList').first();
    await expect(why.locator('[data-kind="appointment"]')).toContainText('Formation');
    await expect(why.locator('[data-kind="lock_dated"]')).toContainText('Pose manuelle');
    await expect(why.locator('[data-kind="need"]')).toContainText('Besoin de visite : Jamais visité');
    await closeSheet(page);

    // Rien ne fixe le jour : on le dit, avec le besoin de visite (très en retard à cette date).
    await openCard(page, 'Jeudi', 'why-b');
    await expect(sec.locator('[data-sr-x-why="none"]')).toContainText('Aucune contrainte ne fixe ce jour');
    await expect(sec.locator('[data-sr-x-why="none"]')).toContainText('très en retard à cette date');
    await expect(sec.locator('.srXList').first().locator('[data-kind="need"]')).toContainText('jours de retard');
    await expect(sec.locator('.srXList').first().locator('[data-kind="need"]')).toContainText('dernière visite le 1 août');
    await closeSheet(page);

    // Vendredi : même magasin jamais visité, autre jour — la date lue est celle de la carte.
    await openCard(page, 'Vendredi', 'why-d');
    await expect(sec.locator('[data-sr-x-why="none"]')).toContainText('jamais visité');
    await closeSheet(page);

    // Jour passé (lundi 05/10, avant « aujourd'hui ») : aucun conseil sur le passé, mais la fiche reste complète.
    await openCard(page, 'Lundi', 'why-c');
    await expect(sec.locator('[data-sr-x-why]')).toHaveCount(0);
    await expect(sec).not.toContainText('Pourquoi ce jour');
    await expect(sec).toContainText('Magasin 360');
    await closeSheet(page);

    // Ouverte depuis « Mes magasins » (aucun jour) : pas de bloc non plus.
    await page.evaluate(() => { window.goTab('storesPanel'); renderStores(); });
    await page.evaluate(() => window.openStoreQuick('why-a'));
    await expect(sec).toBeVisible();
    await expect(sec.locator('[data-sr-x-why]')).toHaveCount(0);
    await closeSheet(page);

    // Lecture seule, texte sobre, mobile.
    await page.evaluate(() => window.goTab('planPanel'));
    await expect(page.locator('#planPanel')).toHaveClass(/active/);
    await openCard(page, 'Jeudi', 'why-b');
    // Attendre la donnée métier, pas seulement une section restée visible
    // depuis une ouverture précédente (la fiche est mise à jour par observateur).
    await expect(sec.locator('[data-sr-x-why="none"]')).toBeVisible();
    const read = await sec.evaluate(el => {
      const lead = el.querySelector('[data-sr-x-why]'), r = lead.getBoundingClientRect(), box = el.getBoundingClientRect();
      return { text: lead.textContent, left: r.left, right: r.right, vw: innerWidth, boxRight: box.right, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, full: el.innerText };
    });
    expect(read.left).toBeGreaterThanOrEqual(0); expect(read.right).toBeLessThanOrEqual(read.vw); expect(read.boxRight).toBeLessThanOrEqual(read.vw + 1);
    expect(read.overflow).toBeLessThanOrEqual(1);
    expect(read.full, 'aucune justification inventée').not.toMatch(/optimal|meilleur|plus court|plus rapide|idéal/i);
    expect(await page.evaluate(SNAPSHOT), 'ni le planning, ni les visites, ni l’archive ne changent').toBe(before);
    expect(errors).toEqual([]);
  });

  test('Pourquoi ce jour : changer de date sur la même fiche ouverte actualise le contexte (' + label + ')',async({page})=>{
    await page.setViewportSize(size);
    const errors=await boot(page);
    const before=await page.evaluate(SNAPSHOT);
    await openCard(page,'Jeudi','why-b');
    const lead=page.locator('#srStore360 [data-sr-x-why]');
    await expect(lead).toContainText('Aucune contrainte ne fixe ce jour');
    // Même magasin, feuille toujours ouverte : data-sr-start et .open
    // sont inchangés, seul data-sr-day est modifié.
    await page.evaluate(()=>window.openStoreQuick('why-b','Lundi'));
    await expect(lead).toHaveCount(0);
    await page.evaluate(()=>window.openStoreQuick('why-b','Jeudi'));
    await expect(lead).toHaveCount(1);
    await expect(lead).toContainText('très en retard à cette date');
    expect(await page.evaluate(SNAPSHOT),'le rafraîchissement de fiche reste en lecture seule').toBe(before);
    expect(errors).toEqual([]);
  });
}
