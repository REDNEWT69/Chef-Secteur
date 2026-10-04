const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Runner dans le Planning — V269, dans la VRAIE application, sur appareils émulés.
// Store Runner est Android d'abord : Android 390 px (Pixel 7 réduit à 390) et Android 360 px
// (Galaxy S8, Samsung) sont validés en premier ; l'adaptation iPhone (iPhone 14, émulation
// Chromium) vient ensuite.
//
// Planning (planning-ui-fixes.js) pose l'emplacement de Runner sous le bloc Couverture, avant la
// liste des visites, et traduit en état visuel ce que les propriétaires existants produisent
// déjà : le plan affiché, l'ordonnanceur d'ouverture, le forecast 3 semaines, les événements
// publics de génération / recalcul / commande. Runner ne décide rien et n'écrit rien.
//   RUNNER_SHOTS_DIR=/chemin  → enregistre aussi les captures en PNG.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const SHOTS_DIR = process.env.RUNNER_SHOTS_DIR || '';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const ANDROID_390 = { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } };
const PROFILES = [
  ['Android 390 px', ANDROID_390],
  ['Android 360 px (Galaxy S8)', strip(devices['Galaxy S8'])],
  ['iPhone 14', strip(devices['iPhone 14'])]
];
const SLOT = '#planningRunnerV269';

test.use({ ...ANDROID_390, serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

/* Mercredi 7 octobre 2026, 9 h : le lundi 5 est passé, le jeudi 8 est à venir, la semaine du 28/09 est de l'histoire. */
const NOW = '2026-10-07T09:00:00';

const STORES = [
  { id: 'm1', enseigne: 'Darty', ville: 'Metz Nord', lat: 49.13, lon: 6.18 },
  { id: 'm2', enseigne: 'Boulanger', ville: 'Metz Sud', lat: 49.09, lon: 6.17 },
  { id: 'm3', enseigne: 'Fnac', ville: 'Metz Est', lat: 49.11, lon: 6.22 },
  { id: 'm4', enseigne: 'Conforama', ville: 'Metz Ouest', lat: 49.11, lon: 6.12 },
  { id: 'm5', enseigne: 'Cuisinella', ville: 'Marly', lat: 49.08, lon: 6.15 },
  /* loin de la base : Nancy, Épinal, Thionville font déborder une journée de 60 min par visite */
  { id: 'f1', enseigne: 'Darty', ville: 'Nancy', lat: 48.69, lon: 6.18 },
  { id: 'f2', enseigne: 'Fnac', ville: 'Épinal', lat: 48.17, lon: 6.45 },
  { id: 'f3', enseigne: 'Conforama', ville: 'Thionville', lat: 49.36, lon: 6.16 }
];
/* m1 et m2 : dernière visite il y a 28 jours, fréquence 30 j → à surveiller (retard dans 2 jours).
   m3 à m5, f1 à f3 : visités lundi → à jour. */
const VISITS = { m1: '2026-09-09', m2: '2026-09-09', m3: '2026-10-05', m4: '2026-10-05', m5: '2026-10-05', f1: '2026-10-05', f2: '2026-10-05', f3: '2026-10-05' };

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String((error && error.message) || error)));
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await page.clock.install({ time: new Date(NOW) });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.StoreRunnerRunner && window.StoreOpeningHoursV1 && window.StoreRunnerVisitCoverage
    && window.StoreRunnerPeriodDaySlider && window.StoreRunnerTerrainPlanningV1 && window.__chefStorage && document.querySelector('#bottomAppNav[data-v2="1"]'));
  await page.clock.runFor(1500);
  /* Le bandeau « Store Runner est à jour » apparaît après le démarrage : on ne mesure ni ne capture dessous. */
  await page.addStyleTag({ content: 'aside[role="status"]{display:none!important}' });
  return errors;
}

/* Un secteur réaliste, puis le Planning ouvert sur un jour. `o.plan` : jour → identifiants ; `o.visits` : identifiant → dernière visite. */
async function seed(page, o = {}) {
  await page.evaluate(({ stores, visits, o }) => {
    const byId = Object.fromEntries(stores.map(s => [s.id, Object.assign({ adresse: '1 rue Test', active: true, priority: 3, products: ['Blanc'] }, s, (o.storeExtra || {})[s.id] || {})]));
    const blank = () => ({ Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] });
    const plan = blank();
    for (const [day, ids] of Object.entries(o.plan || {})) plan[day] = ids.map(id => byId[id]);
    const v = Object.assign({}, visits, o.visits || {});
    state.profile = Object.assign({}, state.profile || {}, { baseName: 'Base test', baseAddress: 'Metz', baseLat: 49.12, baseLon: 6.17 });
    state.settings = Object.assign({}, state.settings || {}, { weekDate: '2026-10-05', days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], startTime: '08:30', endTime: '18:00', visitMinutes: 60 });
    state.stores = stores.map(s => byId[s.id]);
    state.plan = plan;
    state.included = {}; state.excluded = {}; state.locks = o.locks || {}; state.appointments = o.appointments || []; state.calendarEvents = [];
    state.visits = Object.fromEntries(Object.entries(v).filter(([, d]) => d).map(([id, d]) => [id, { lastVisit: d, history: [d] }]));
    const archive = { '2026-10-05': { weekMonday: '2026-10-05', plan } };
    if (o.archive) Object.assign(archive, o.archive);
    __chefStorage.setItem('chef_sector_plan_archive_v1', JSON.stringify(archive));
    save();
    renderAll();
    goTab('planPanel');
    StoreRunnerPeriodDaySlider.openDate(o.date || '2026-10-07');
  }, { stores: STORES, visits: VISITS, o });
  await page.clock.runFor(1500);
}
async function openDate(page, date) {
  await page.evaluate(d => StoreRunnerPeriodDaySlider.openDate(d), date);
  await page.clock.runFor(900);
}
/* Un événement public comme celui d'un module métier, puis le temps de laisser le Planning se redessiner. */
async function emit(page, name, detail, target = 'document') {
  await page.evaluate(({ name, detail, target }) => (target === 'window' ? window : document).dispatchEvent(new CustomEvent(name, { detail })), { name, detail, target });
  await page.clock.runFor(700);
}

const read = page => page.evaluate(() => {
  const slot = document.getElementById('planningRunnerV269');
  const host = slot && slot.querySelector('.srRunner');
  const text = sel => { const el = host && host.querySelector(sel); return el ? el.textContent : ''; };
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const shown = !!slot && !slot.hidden && slot.getBoundingClientRect().height > 0;
  return {
    exists: !!slot, shown, state: host ? host.dataset.state : null,
    title: shown ? text('.srRunnerBubbleTitle') : '', text: shown ? text('.srRunnerBubbleText') : '', live: text('.srRunnerLive'),
    inSlot: slot ? slot.querySelectorAll('.srRunner').length : 0, total: document.querySelectorAll('.srRunner').length,
    slot: box(slot), figure: box(host && host.querySelector('.srRunnerFigure')), bubble: box(host && host.querySelector('.srRunnerBubble')),
    coverage: box(document.getElementById('planningCoverageV263')), timeline: box(document.querySelector('#planPanel .timelineShell')), tools: box(document.getElementById('planningToolsV2')),
    viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
const settle = page => page.clock.runFor(900);

async function shot(page, testInfo, name) {
  const body = await page.screenshot();
  await testInfo.attach(name + '.png', { body, contentType: 'image/png' });
  if (SHOTS_DIR) { fs.mkdirSync(SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(SHOTS_DIR, name.replace(/[^\w-]+/g, '_') + '.png'), body); }
}
async function scrollToRunner(page) {
  await page.evaluate(() => { const slot = document.getElementById('planningRunnerV269'); if (slot) slot.scrollIntoView({ block: 'center' }); });
  await page.clock.runFor(300);
}
/* Un vrai glissement du doigt (événements tactiles du navigateur, comme sur Android). */
async function swipe(page, x, y, dy) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 12; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * step / 12 }] });
    await page.clock.runFor(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(500);
}

const DAY_WITH_VISITS = '3 visites prévues aujourd’hui. Premier arrêt : Darty Metz Nord. 2 magasins à surveiller sur les 3 prochaines semaines.';

/* ------------------------------------------------------------------------ emplacement, jour avec visites */
for (const [label, device] of PROFILES) {
  test.describe(label, () => {
    test.use(device);

    test('jour avec visites — résumé de la journée, sous la Couverture et avant les visites, sans rien recouvrir', async ({ page }, testInfo) => {
      const errors = await boot(page);
      await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'], Lundi: ['m5'] } });
      await scrollToRunner(page);
      const r = await read(page);
      expect(r.shown).toBe(true);
      expect(r.state).toBe('neutral');
      expect(r.title).toBe('Ta journée');
      expect(r.text).toBe(DAY_WITH_VISITS);
      /* Emplacement : Couverture › Runner › liste des visites, dans le flux. */
      const order = await page.evaluate(() => {
        const ids = [...document.querySelector('#planPanel .applePlan').children].map(c => c.id || c.className.split(' ')[0]);
        return ids.filter(x => ['planningToolsV2', 'planningCoverageV263', 'planningRunnerV269', 'timelineShell'].includes(x));
      });
      expect(order).toEqual(['planningToolsV2', 'planningCoverageV263', 'planningRunnerV269', 'timelineShell']);
      expect(r.slot.top).toBeGreaterThanOrEqual(r.coverage.bottom - 0.5);
      expect(r.slot.bottom).toBeLessThanOrEqual(r.timeline.top + 0.5);
      /* Discret : 56 px de personnage, une carte basse, jamais flottant, jamais de débordement. */
      expect(r.figure.width).toBeLessThanOrEqual(60);
      expect(r.slot.height).toBeLessThanOrEqual(Math.min(170, r.viewport.height * 0.25));
      expect(r.slot.left).toBeGreaterThanOrEqual(0);
      expect(r.slot.right).toBeLessThanOrEqual(r.viewport.width + 0.5);
      expect(r.overflow).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => { const s = document.querySelector('#planningRunnerV269 .srRunner'); const p = getComputedStyle(s).position; return [p, getComputedStyle(document.getElementById('planningRunnerV269')).position]; })).toEqual(['relative', 'static']);
      await shot(page, testInfo, 'planning-v269-' + label.replace(/\W+/g, '-').toLowerCase());
      expect(errors).toEqual([]);
    });

    test('contrainte réelle — l’ordonnanceur signale, Runner relaie ses mots et passe en alerte', async ({ page }, testInfo) => {
      const errors = await boot(page);
      /* Un rendez-vous à 8 h 30 chez Metz Sud, sur une tournée qui y arrive plus tard. */
      await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] }, appointments: [{ id: 'a1', storeId: 'm2', date: '2026-10-07', time: '08:30', duration: 60, type: 'RDV', note: '' }] });
      await scrollToRunner(page);
      let r = await read(page);
      const owner = await page.evaluate(() => { const s = StoreOpeningHoursV1.scheduleRoute(state.plan.Mercredi, 'Mercredi', state); return { conflicts: s.appointmentConflicts, closed: s.closedCount }; });
      expect(owner.conflicts).toBe(1);
      expect([r.state, r.title, r.text]).toEqual(['alert', 'Contrainte détectée', 'Aujourd’hui : 1 RDV à vérifier.']);
      await shot(page, testInfo, 'planning-v269-alerte-' + label.replace(/\W+/g, '-').toLowerCase());
      /* Magasin fermé au créneau prévu : les mots de l'ordonnanceur. */
      await seed(page, { plan: { Mercredi: ['m1', 'm2'] }, storeExtra: { m2: { openingHours: { Mercredi: [] }, openingHoursSource: 'manual' } } });
      const closed = await page.evaluate(() => StoreOpeningHoursV1.scheduleRoute(state.plan.Mercredi, 'Mercredi', state).closedCount);
      r = await read(page);
      expect(closed).toBe(1);
      expect([r.state, r.text]).toEqual(['alert', 'Aujourd’hui : 1 magasin sans créneau disponible.']);
      /* Fin de journée au-delà de la limite : l'heure estimée et la limite viennent de l'ordonnanceur. */
      await seed(page, { plan: { Mercredi: ['f1', 'f2', 'f3', 'm1'] } });
      const expected = await page.evaluate(() => { const s = StoreOpeningHoursV1.scheduleRoute(state.plan.Mercredi, 'Mercredi', state); const c = v => String(Math.floor(Math.round(v) / 60) % 24).padStart(2, '0') + ':' + String(Math.round(v) % 60).padStart(2, '0'); return s.estimatedEnd > s.endLimit ? 'Aujourd’hui : fin estimée ' + c(s.estimatedEnd) + ' après ta limite de ' + c(s.endLimit) + '.' : 'pas de dépassement'; });
      r = await read(page);
      expect(expected).not.toBe('pas de dépassement');
      expect([r.state, r.text]).toEqual(['alert', expected]);
      /* La contrainte disparue, la journée reprend la main. */
      await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
      r = await read(page);
      expect([r.state, r.text]).toEqual(['neutral', DAY_WITH_VISITS]);
      expect(errors).toEqual([]);
    });
  });
}

/* ------------------------------------------------------------------------ jours vide, passé, historique */
test.describe('jour vide, jour passé, historique', () => {
  test('jour vide — message discret, ou Runner masqué quand il n’y a rien d’utile', async ({ page }) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] }, date: '2026-10-08' });
    let r = await read(page);
    expect([r.shown, r.state, r.title, r.text]).toEqual([true, 'neutral', 'Ta journée', 'Aucune visite prévue jeudi 8. 2 magasins à surveiller sur les 3 prochaines semaines.']);
    /* Tout est à jour : aucune information utile, donc aucun cadre vide. */
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] }, visits: { m1: '2026-10-05', m2: '2026-10-05' }, date: '2026-10-08' });
    r = await read(page);
    expect(r.shown).toBe(false);
    expect(r.slot ? r.slot.height : 0).toBe(0);
    expect(r.text).toBe('');
    expect(errors).toEqual([]);
  });

  test('jour passé — un rappel, jamais de conseil ni d’alerte sur l’avenir', async ({ page }, testInfo) => {
    const errors = await boot(page);
    /* Le lundi 5 est passé et porte un rendez-vous intenable : aucune alerte, aucun forecast. */
    await seed(page, { plan: { Lundi: ['m5'], Mercredi: ['m1', 'm2', 'm3'] }, date: '2026-10-05', appointments: [{ id: 'a0', storeId: 'm5', date: '2026-10-05', time: '07:00', duration: 60, type: 'RDV', note: '' }] });
    await page.evaluate(() => { window.__fc = 0; const f = StoreRunnerVisitCoverage.forecastThreeWeeks; StoreRunnerVisitCoverage.forecastThreeWeeks = function () { window.__fc++; return f.apply(this, arguments); }; });
    await emit(page, 'store-runner:planning-updated', { reason: 'test' });
    const calls = await page.evaluate(() => window.__fc);
    let r = await read(page);
    expect([r.shown, r.state, r.title, r.text]).toEqual([true, 'neutral', 'Journée passée', '1 visite était prévue lundi 5.']);
    expect(r.text).not.toMatch(/surveiller|prochaines semaines|vérifier|contrainte/i);
    expect(await page.evaluate(() => window.__fc), 'aucun forecast pour une journée passée').toBe(calls);
    await shot(page, testInfo, 'planning-v269-jour-passe');
    /* Jour passé vide : rien à dire. */
    await openDate(page, '2026-10-06');
    r = await read(page);
    expect(r.shown).toBe(false);
    /* Historique : une semaine archivée. */
    const past = { Lundi: [], Mardi: [{ id: 'm1', enseigne: 'Darty', ville: 'Metz Nord', lat: 49.13, lon: 6.18, active: true }, { id: 'm4', enseigne: 'Conforama', ville: 'Metz Ouest', lat: 49.11, lon: 6.12, active: true }], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    await page.evaluate(plan => { const a = JSON.parse(__chefStorage.getItem('chef_sector_plan_archive_v1')); a['2026-09-28'] = { weekMonday: '2026-09-28', plan }; __chefStorage.setItem('chef_sector_plan_archive_v1', JSON.stringify(a)); }, past);
    await openDate(page, '2026-09-29');
    r = await read(page);
    expect([r.shown, r.state, r.title, r.text]).toEqual([true, 'neutral', 'Journée passée', '2 visites étaient prévues mardi 29.']);
    expect(await page.evaluate(() => window.__fc)).toBe(calls);
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ forecast à surveiller */
test.describe('forecast à surveiller', () => {
  test('les comptes sont ceux du propriétaire, mémorisés d’un jour à l’autre et relus quand les données changent', async ({ page }) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'], Jeudi: ['m4'] } });
    await page.evaluate(() => { window.__fc = 0; const f = StoreRunnerVisitCoverage.forecastThreeWeeks; StoreRunnerVisitCoverage.forecastThreeWeeks = function () { window.__fc++; return f.apply(this, arguments); }; });
    await emit(page, 'store-runner:planning-updated', { reason: 'test' });
    const owner = await page.evaluate(() => { const c = StoreRunnerVisitCoverage.forecastThreeWeeks(state, { today: '2026-10-07' }).counts; return { watch: c.watch.total, constraints: c.constraintIssues }; });
    expect(owner).toEqual({ watch: 2, constraints: 0 });
    let r = await read(page);
    expect(r.text).toBe(DAY_WITH_VISITS);
    const afterFirst = await page.evaluate(() => window.__fc) - 1; /* l'appel du test ci-dessus */
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    /* Changer de jour dans la semaine ne relit pas le forecast. */
    const before = await page.evaluate(() => window.__fc);
    for (const d of ['2026-10-08', '2026-10-07', '2026-10-09', '2026-10-07']) await openDate(page, d);
    expect(await page.evaluate(() => window.__fc), 'quatre changements de jour, aucun nouveau forecast').toBe(before);
    r = await read(page);
    expect(r.text).toBe(DAY_WITH_VISITS);
    /* Une visite réelle sort le magasin des « à surveiller » : relu au prochain événement de données, au singulier. */
    await page.evaluate(() => { state.visits.m1 = { lastVisit: '2026-10-07', history: ['2026-10-07'] }; });
    await emit(page, 'store-runner:planning-updated', { reason: 'visit-completed-test' });
    r = await read(page);
    expect(await page.evaluate(() => window.__fc)).toBeGreaterThan(before);
    expect(r.text).toBe('3 visites prévues aujourd’hui. Premier arrêt : Darty Metz Nord. 1 magasin à surveiller sur les 3 prochaines semaines.');
    /* Une contrainte explicite hors des jours disponibles : un vrai constat du forecast. */
    await page.evaluate(() => { state.appointments = [{ id: 'a2', storeId: 'm3', date: '2026-10-11', time: '10:00', duration: 60, type: 'RDV', note: '' }]; });
    await emit(page, 'store-runner:planning-updated', { reason: 'appointment-test' });
    r = await read(page);
    const issues = await page.evaluate(() => StoreRunnerVisitCoverage.forecastThreeWeeks(state, { today: '2026-10-07' }).counts.constraintIssues);
    expect(issues).toBe(1);
    expect([r.state, r.title, r.text]).toEqual(['alert', 'Contrainte détectée', '1 rendez-vous ou jour posé tombe sur un jour non travaillé ou bloqué, dans les 3 prochaines semaines.']);
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ génération, recalcul, commande */
test.describe('génération et recalcul', () => {
  test('succès : un moment, puis la journée reprend la main — jamais un succès hors du Planning', async ({ page }, testInfo) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
    await page.evaluate(() => { window.__states = []; document.addEventListener('store-runner:runner-state', e => { if (e.target.closest('#planningRunnerV269')) window.__states.push(e.detail.state); }); });
    for (const [name, detail, target, text] of [
      ['chef-range-generated', { start: '2026-10-05', weeks: 3 }, 'window', 'Tes 3 semaines sont générées.'],
      ['store-runner:planning-updated', { source: 'recalculatePlanningCascade' }, 'document', 'Le planning a été recalculé.'],
      ['store-runner:planning-command-applied', { reason: 'planning-command' }, 'document', 'La commande a été appliquée au planning.']
    ]) {
      await emit(page, name, detail, target);
      let r = await read(page);
      expect([r.state, r.title, r.text], name).toEqual(['success', 'C’est fait !', text]);
      if (name === 'chef-range-generated') await shot(page, testInfo, 'planning-v269-succes');
      expect(r.live).toContain(text);
      /* Au bout de quelques secondes, la journée est de retour. */
      await page.clock.runFor(6500);
      r = await read(page);
      expect([r.state, r.text], name + ' : retour à la journée').toEqual(['neutral', DAY_WITH_VISITS]);
    }
    expect(await page.evaluate(() => window.__states)).toEqual(['success', 'neutral', 'success', 'neutral', 'success', 'neutral']);
    /* Un succès survenu pendant que le Planning est fermé n'apparaît pas à la réouverture. */
    await page.evaluate(() => goTab('homePanel'));
    await page.clock.runFor(800);
    await emit(page, 'chef-range-generated', { start: '2026-10-05' }, 'window');
    await page.evaluate(() => goTab('planPanel'));
    await page.clock.runFor(900);
    const r = await read(page);
    expect([r.state, r.text]).toEqual(['neutral', DAY_WITH_VISITS]);
    expect(errors).toEqual([]);
  });

  test('« Générer mes 3 semaines » : analyse pendant l’opération, succès à la fin, jamais de succès si elle échoue', async ({ page }, testInfo) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
    /* Le moteur réel, retenu le temps de regarder Runner. */
    await page.evaluate(() => {
      const api = StoreRunnerTerrainPlanningV1, real = api.generateThreeWeekSnail;
      window.syncGoogleCalendar = async () => ({ ok: true });
      window.__hold = null; window.__fail = false;
      api.generateThreeWeekSnail = function () {
        const args = arguments, self = this;
        return new Promise((resolve, reject) => { window.__hold = () => { if (window.__fail) reject(new Error('Échec simulé du moteur.')); else resolve(real.apply(self, args)); }; });
      };
      window.__states = [];
      document.addEventListener('store-runner:runner-state', e => { if (e.target.closest('#planningRunnerV269')) window.__states.push(e.detail.state); });
    });
    const button = page.locator('#planningToolsV2 [data-planning-generate="three-weeks"]');
    await button.click();
    await page.waitForFunction(() => typeof window.__hold === 'function');
    await page.clock.runFor(600);
    let r = await read(page);
    expect(await button.isDisabled()).toBe(true);
    expect([r.state, r.title, r.text]).toEqual(['analyzing', 'Génération en cours…', 'Je prépare tes 3 semaines.']);
    await scrollToRunner(page);
    await shot(page, testInfo, 'planning-v269-analyse');
    /* L'opération aboutit. */
    await page.evaluate(() => window.__hold());
    await page.waitForFunction(() => !document.querySelector('#planningToolsV2 [data-planning-generate][disabled]'));
    await page.clock.runFor(700);
    r = await read(page);
    expect([r.state, r.text]).toEqual(['success', 'Tes 3 semaines sont générées.']);
    await page.clock.runFor(6500);
    expect((await read(page)).state).not.toBe('success');
    /* L'opération échoue : Runner ne célèbre rien. */
    await page.evaluate(() => { window.__fail = true; window.__hold = null; window.__states.length = 0; });
    await button.click();
    await page.waitForFunction(() => typeof window.__hold === 'function');
    await page.clock.runFor(600);
    expect((await read(page)).state).toBe('analyzing');
    await page.evaluate(() => window.__hold());
    await page.waitForFunction(() => !document.querySelector('#planningToolsV2 [data-planning-generate][disabled]'));
    await page.clock.runFor(900);
    r = await read(page);
    expect(r.state).not.toBe('success');
    expect(r.state).not.toBe('analyzing');
    expect(await page.evaluate(() => window.__states)).not.toContain('success');
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ toucher, balayage, défilement */
test.describe('tactile', () => {
  test('rien n’est intercepté : toucher, balayage, défilement, jours et cartes de visite fonctionnent comme avant', async ({ page }) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'], Jeudi: ['m4'] } });
    await scrollToRunner(page);
    const geo = await page.evaluate(() => {
      const slot = document.getElementById('planningRunnerV269'), host = slot.querySelector('.srRunner'), fig = host.querySelector('.srRunnerFigure').getBoundingClientRect();
      const x = fig.left + fig.width / 2, y = fig.top + fig.height / 2, hit = document.elementFromPoint(x, y);
      return { x, y, insideRunner: !!(hit && hit.closest('#planningRunnerV269')), pe: [getComputedStyle(slot).pointerEvents, getComputedStyle(host.querySelector('.srRunnerFigure')).pointerEvents], focusable: slot.querySelectorAll('a,button,input,select,textarea,[tabindex]').length };
    });
    expect(geo.insideRunner, 'le toucher traverse Runner').toBe(false);
    expect(geo.pe[0]).toBe('none');
    expect(geo.focusable).toBe(0);
    /* Un toucher sur Runner ne change rien. */
    const before = await page.evaluate(() => JSON.stringify({ state: window.state, sheet: !!document.querySelector('#storeQuickSheet.open'), day: window.selectedPlanningDay, rn: document.querySelector('#planningRunnerV269 .srRunner').dataset.state }));
    await page.touchscreen.tap(geo.x, geo.y);
    await page.clock.runFor(500);
    expect(await page.evaluate(() => JSON.stringify({ state: window.state, sheet: !!document.querySelector('#storeQuickSheet.open'), day: window.selectedPlanningDay, rn: document.querySelector('#planningRunnerV269 .srRunner').dataset.state }))).toBe(before);
    /* Un balayage commencé sur Runner fait défiler la page. */
    await page.evaluate(() => window.scrollTo(0, 0));
    await scrollToRunner(page);
    const pos = await page.evaluate(() => { const f = document.querySelector('#planningRunnerV269 .srRunnerFigure').getBoundingClientRect(); return { x: f.left + f.width / 2, y: f.top + f.height / 2, scroll: scrollY }; });
    await swipe(page, pos.x, pos.y, -150);
    expect(await page.evaluate(() => scrollY), 'le doigt posé sur Runner fait défiler la page').toBeGreaterThan(pos.scroll + 40);
    /* Les jours se changent au doigt, et Runner suit. */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.clock.runFor(300);
    await page.locator('#dayTabs .periodDayTab[data-date="2026-10-08"]').tap();
    await page.clock.runFor(900);
    let r = await read(page);
    expect(r.text).toBe('1 visite prévue jeudi 8. Premier arrêt : Conforama Metz Ouest. 2 magasins à surveiller sur les 3 prochaines semaines.');
    await page.locator('#dayTabs .periodDayTab[data-date="2026-10-07"]').tap();
    await page.clock.runFor(900);
    expect((await read(page)).text).toBe(DAY_WITH_VISITS);
    /* Une carte de visite, sous Runner, s'ouvre au toucher comme avant. */
    await page.evaluate(() => { window.__opened = []; const o = window.openStoreQuick; if (typeof o === 'function') window.openStoreQuick = function (id) { window.__opened.push(String(id)); return o.apply(this, arguments); }; });
    const card = page.locator('#week .timelineRow:not(.calendarEvent) .tlMain').first();
    await card.scrollIntoViewIfNeeded();
    await card.tap();
    await page.clock.runFor(700);
    expect(await page.evaluate(() => window.__opened)).toEqual(['m1']);
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ aucune écriture, aucun double état */
test.describe('données et état', () => {
  test('aucune écriture métier : ni état, ni stockage, ni planning', async ({ page }) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
    /* Compteur d'écritures : l'adaptateur est exercé, puis neutralisé (Runner absent) sur la même séquence. */
    const run = async withRunner => {
      await page.evaluate(withRunner => {
        window.__writes = [];
        if (!window.__spies) {
          window.__spies = true;
          const wrap = (obj, name, tag) => { const f = obj[name]; obj[name] = function () { window.__writes.push(tag + ':' + name + ':' + String(arguments[0]).slice(0, 40)); return f.apply(this, arguments); }; };
          for (const [obj, tag] of [[window.__chefStorage, 'chef'], [window.localStorage, 'ls']]) for (const n of ['setItem', 'removeItem']) try { wrap(obj, n, tag); } catch (e) {}
          const save = window.save; window.save = function () { window.__writes.push('save'); return save.apply(this, arguments); };
        }
        window.__runner = window.StoreRunnerRunner;
        if (!withRunner) window.StoreRunnerRunner = undefined;
      }, withRunner);
      const snapshot = () => page.evaluate(() => ({ state: JSON.stringify(window.state), keys: Object.keys(localStorage).sort(), chef: JSON.stringify(Object.keys(window.__chefStorage.map || {}).sort()) }));
      const before = await snapshot();
      for (const [name, detail] of [['store-runner:planning-updated', { reason: 'test-a' }], ['store-runner:planning-user-opened'], ['store-runner:planning-updated', { reason: 'test-b' }]]) await emit(page, name, detail);
      await openDate(page, '2026-10-08'); await openDate(page, '2026-10-07');
      const after = await snapshot();
      const writes = await page.evaluate(() => window.__writes.slice());
      await page.evaluate(() => { window.StoreRunnerRunner = window.__runner; });
      return { before, after, writes };
    };
    await run(true); /* mise en route : les écritures propres à la première ouverture du Planning ne sont pas celles de Runner */
    const without = await run(false);
    const withRunner = await run(true);
    expect(withRunner.writes, 'Runner n’ajoute aucune écriture : mêmes écritures qu’avec Runner neutralisé').toEqual(without.writes);
    expect(withRunner.after.state, 'state inchangé').toBe(withRunner.before.state);
    expect(withRunner.after.keys.filter(k => /runner/i.test(k) && !/store-runner|storerunner|store_runner/i.test(k))).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(k => /^sr-?runner|runner-state|runnerv269/i.test(k))))).toBe('[]');
    expect(errors).toEqual([]);
  });

  test('aucun double état : un seul Runner dans le Planning, indépendant de celui de l’Assistant, même après des rendus répétés', async ({ page }) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
    expect((await read(page))).toMatchObject({ inSlot: 1, total: 1 });
    /* Six rendus et allers-retours d'onglets : jamais une seconde instance. */
    for (let i = 0; i < 6; i++) { await page.evaluate(i => { renderAll(); if (i % 2) { goTab('homePanel'); goTab('planPanel'); } }, i); await page.clock.runFor(500); }
    let r = await read(page);
    expect([r.inSlot, r.total, r.state, r.text]).toEqual([1, 1, 'neutral', DAY_WITH_VISITS]);
    expect(await page.evaluate(() => StoreRunnerRunner.mounted())).toBe(1);
    /* L'Assistant a le sien : deux surfaces, deux états, aucun partage. */
    await page.evaluate(() => { document.querySelector('#bottomAppNav .bottomNavBtn.ia').click(); });
    await page.waitForSelector('#assistantPanel.open');
    await page.clock.runFor(900);
    r = await read(page);
    const both = await page.evaluate(() => ({ planning: document.querySelectorAll('#planningRunnerV269 .srRunner').length, assistant: document.querySelectorAll('#srAssistantRunner .srRunner').length, all: document.querySelectorAll('.srRunner').length }));
    expect(both).toEqual({ planning: 1, assistant: 1, all: 2 });
    expect([r.state, r.text]).toEqual(['neutral', DAY_WITH_VISITS]);
    /* Une alerte du Planning ne contamine pas l'Assistant. */
    await page.evaluate(() => { document.getElementById('assistantPanel').classList.remove('open'); goTab('planPanel'); state.appointments = [{ id: 'a3', storeId: 'm2', date: '2026-10-07', time: '08:30', duration: 60, type: 'RDV', note: '' }]; });
    await emit(page, 'store-runner:planning-updated', { reason: 'test' });
    expect((await read(page)).state).toBe('alert');
    expect(await page.evaluate(() => { const a = document.querySelector('#srAssistantRunner .srRunner'); return a ? a.dataset.state : 'absent'; })).not.toBe('alert-planning');
    expect(await page.evaluate(() => document.querySelectorAll('#srAssistantRunner .srRunner').length)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('Planning intact sans Runner : l’emplacement reste muet et rien ne casse', async ({ page }) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
    await page.evaluate(() => { document.getElementById('planningRunnerV269').remove(); window.__runner = window.StoreRunnerRunner; window.StoreRunnerRunner = undefined; });
    await emit(page, 'store-runner:planning-updated', { reason: 'test' });
    expect(await page.evaluate(() => !!document.getElementById('planningRunnerV269'))).toBe(false);
    expect(await page.evaluate(() => !!document.querySelector('#planPanel .timelineShell') && !!document.getElementById('planningCoverageV263'))).toBe(true);
    await page.evaluate(() => { window.StoreRunnerRunner = window.__runner; });
    await emit(page, 'store-runner:planning-updated', { reason: 'test' });
    expect((await read(page)).text).toBe(DAY_WITH_VISITS);
    expect(errors).toEqual([]);
  });

  test('texte hostile inerte et aucune agitation du DOM au repos', async ({ page }) => {
    const errors = await boot(page);
    const hostile = '<img src=x onerror="window.__xss=1">Darty';
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] }, storeExtra: { m1: { enseigne: hostile } } });
    const r = await read(page);
    expect(r.text).toContain(hostile);
    expect(await page.evaluate(() => ({ xss: window.__xss === 1, imgs: document.querySelectorAll('#planningRunnerV269 img').length }))).toEqual({ xss: false, imgs: 0 });
    /* Au repos : aucune mutation du Planning et aucun événement de planning provoqués par Runner. */
    await page.evaluate(() => {
      window.__idle = { mutations: 0, events: 0 };
      new MutationObserver(list => { window.__idle.mutations += list.length; }).observe(document.getElementById('planPanel'), { subtree: true, childList: true, attributes: true, characterData: true });
      document.addEventListener('store-runner:planning-updated', () => { window.__idle.events++; });
    });
    await page.clock.runFor(2500);
    expect(await page.evaluate(() => window.__idle)).toEqual({ mutations: 0, events: 0 });
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ clavier, barre basse, safe areas, mouvement, accessibilité */
test.describe('coque mobile', () => {
  test('clavier ouvert, saisie d’un réglage, barre basse et safe areas', async ({ page }) => {
    const errors = await boot(page);
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
    await scrollToRunner(page);
    const nav = () => page.evaluate(() => { const r = document.getElementById('bottomAppNav').getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height), position: getComputedStyle(document.getElementById('bottomAppNav')).position }; });
    const navWith = await nav();
    /* Barre basse identique avec ou sans Runner à l'écran. */
    await page.evaluate(() => { document.getElementById('planningRunnerV269').hidden = true; });
    expect(await nav()).toEqual(navWith);
    await page.evaluate(() => { document.getElementById('planningRunnerV269').hidden = false; });
    /* Clavier ouvert (attribut public de mobile-ux-v262.js) : Runner reste à 56 px au plus. */
    await page.evaluate(() => document.documentElement.setAttribute('data-sr-keyboard', 'open'));
    await page.clock.runFor(300);
    expect((await read(page)).figure.width).toBeLessThanOrEqual(57);
    await page.evaluate(() => document.documentElement.removeAttribute('data-sr-keyboard'));
    /* Safe areas (barre de gestes, encoche) : Runner est dans le flux, jamais sous une barre. */
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 32, bottom: 48, left: 0, right: 0 } });
    await scrollToRunner(page);
    const geo = await page.evaluate(() => { const r = document.getElementById('planningRunnerV269').getBoundingClientRect(), n = document.getElementById('bottomAppNav').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, navTop: n.top }; });
    expect(geo.top).toBeGreaterThanOrEqual(32);
    expect(geo.bottom).toBeLessThanOrEqual(geo.navTop);
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
    /* Saisie d'un réglage : le Planning n'est pas redessiné sous les doigts, Runner non plus. */
    await page.evaluate(() => { document.getElementById('planningSettings').classList.add('planningSettingsSheetOpen'); document.getElementById('planningSettings').open = true; });
    await page.evaluate(() => { const i = document.querySelector('#planningSettings input[type="number"], #planningSettings input'); i.focus(); i.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await page.clock.runFor(300);
    const textBefore = (await read(page)).text;
    await page.evaluate(() => { state.appointments = [{ id: 'a4', storeId: 'm2', date: '2026-10-07', time: '08:30', duration: 60, type: 'RDV', note: '' }]; });
    await emit(page, 'store-runner:planning-updated', { reason: 'test' });
    expect((await read(page)).text, 'rien ne bouge pendant la saisie').toBe(textBefore);
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); const s = document.getElementById('planningSettings'); s.open = false; s.dispatchEvent(new Event('toggle')); });
    await page.clock.runFor(900);
    expect((await read(page)).state).toBe('alert');
    expect(errors).toEqual([]);
  });

  test('animations réduites et accessibilité', async ({ page }) => {
    const errors = await boot(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seed(page, { plan: { Mercredi: ['m1', 'm2', 'm3'] } });
    await scrollToRunner(page);
    /* Neutre : discret, jamais annoncé à voix haute. */
    let r = await read(page);
    expect(r.live).toBe('');
    expect(await page.evaluate(() => { const h = document.querySelector('#planningRunnerV269 .srRunner'); return { img: h.querySelector('.srRunnerFigure').getAttribute('role'), label: h.querySelector('.srRunnerFigure').getAttribute('aria-label'), bubbleHidden: h.querySelector('.srRunnerBubble').getAttribute('aria-hidden'), live: h.querySelector('.srRunnerLive').getAttribute('role') }; }))
      .toEqual({ img: 'img', label: 'Runner, copilote terrain : en attente', bubbleHidden: 'true', live: 'status' });
    /* Une alerte qui apparaît est annoncée en assertive ; aucune animation en mode réduit. */
    await page.evaluate(() => { state.appointments = [{ id: 'a5', storeId: 'm2', date: '2026-10-07', time: '08:30', duration: 60, type: 'RDV', note: '' }]; });
    await emit(page, 'store-runner:planning-updated', { reason: 'test' });
    await page.clock.runFor(300);
    r = await read(page);
    expect(r.state).toBe('alert');
    expect(r.live).toContain('Aujourd’hui : 1 RDV à vérifier.');
    expect(await page.evaluate(() => document.querySelector('#planningRunnerV269 .srRunnerLive').getAttribute('aria-live'))).toBe('assertive');
    expect(await page.evaluate(() => document.getElementById('planningRunnerV269').getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().duration > 1).length)).toBe(0);
    expect(await page.evaluate(() => document.querySelector('#planningRunnerV269 .srRunnerFigure').getAttribute('aria-label'))).toBe('Runner, copilote terrain : une contrainte détectée');
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ PWA : cache et hors ligne */
test.describe('PWA — cache et hors ligne', () => {
  test.use({ ...ANDROID_390, serviceWorkers: 'allow' });
  test('le Planning affiche Runner hors ligne, et le shell précache runner-visual.js', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(String((error && error.message) || error)));
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const rev = sw.match(/const BUILD_REV = "([^"]+)"/)[1];
    expect(rev).toMatch(/-269$/);
    expect(sw.match(/const CORE_SHELL = \[([\s\S]*?)\];/)[1]).toContain('"./runner-visual.js"');
    expect(sw.match(/const CORE_SHELL = \[([\s\S]*?)\];/)[1]).toContain('"./planning-ui-fixes.js"');
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.state && window.StoreRunnerRunner && window.StoreOpeningHoursV1 && window.StoreRunnerPeriodDaySlider && document.querySelector('#bottomAppNav[data-v2="1"]'));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async rev => {
      const names = await caches.keys(), name = names.find(n => n.includes(rev));
      if (!name) return 'aucun cache ' + rev;
      const cache = await caches.open(name), miss = [];
      for (const file of ['runner-visual.js', 'planning-ui-fixes.js']) if (!(await cache.match(new URL('./' + file + '?rev=' + rev, location.href).href))) miss.push(file);
      return miss.length ? 'absent : ' + miss.join(', ') : 'présent';
    }, rev), { timeout: 30000, message: 'runner-visual.js et planning-ui-fixes.js précachés dans le cache de la révision' }).toBe('présent');
    /* Un secteur réel, daté d'aujourd'hui, enregistré : il survit au rechargement hors ligne. */
    await page.evaluate(() => {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const day = new Date(); if (day.getDay() === 0) day.setDate(day.getDate() + 1);
      const mon = new Date(day); mon.setDate(mon.getDate() - ((mon.getDay() || 7) - 1));
      const name = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][(day.getDay() || 7) - 1];
      const mk = (id, enseigne, ville, lat, lon) => ({ id, enseigne, ville, adresse: '1 rue Test', lat, lon, active: true, priority: 3, products: ['Blanc'] });
      const stores = [mk('o1', 'Darty', 'Metz Nord', 49.13, 6.18), mk('o2', 'Fnac', 'Metz Est', 49.11, 6.22)];
      const plan = { Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] }; plan[name] = stores;
      state.profile = Object.assign({}, state.profile || {}, { baseName: 'Base test', baseAddress: 'Metz', baseLat: 49.12, baseLon: 6.17 });
      state.settings = Object.assign({}, state.settings || {}, { weekDate: iso(mon), days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'], startTime: '08:30', endTime: '18:00', visitMinutes: 30 });
      state.stores = stores; state.plan = plan; state.included = {}; state.excluded = {}; state.locks = {}; state.appointments = []; state.calendarEvents = [];
      state.visits = { o1: { lastVisit: iso(new Date(Date.now() - 2 * 86400000)), history: [iso(new Date(Date.now() - 2 * 86400000))] }, o2: { lastVisit: iso(new Date(Date.now() - 2 * 86400000)), history: [iso(new Date(Date.now() - 2 * 86400000))] } };
      __chefStorage.setItem('chef_sector_plan_archive_v1', JSON.stringify({ [iso(mon)]: { weekMonday: iso(mon), plan } }));
      window.__target = iso(day);
      save();
    });
    const target = await page.evaluate(() => window.__target);
    await page.evaluate(async () => { if (window.__chefStorage && typeof window.__chefStorage.flush === 'function') await window.__chefStorage.flush(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.state && window.StoreRunnerRunner && window.StoreRunnerPeriodDaySlider && document.querySelector('#bottomAppNav[data-v2="1"]'), null, { timeout: 30000 });
    await page.evaluate(d => { goTab('planPanel'); StoreRunnerPeriodDaySlider.openDate(d); }, target);
    await page.waitForSelector('#planningRunnerV269 .srRunner .srRunnerBubbleText', { timeout: 15000 });
    const r = await page.evaluate(() => { const s = document.getElementById('planningRunnerV269'); return { online: navigator.onLine, hidden: s.hidden, title: s.querySelector('.srRunnerBubbleTitle').textContent, text: s.querySelector('.srRunnerBubbleText').textContent, mounted: StoreRunnerRunner.mounted(), css: !!document.getElementById('srRunnerCss') }; });
    expect(r.online).toBe(false);
    expect(r.hidden).toBe(false);
    expect(r.title).toMatch(/^(Ta journée|Contrainte détectée)$/);
    expect(r.text).toMatch(/2 visites prévues|vérifier|fin estimée|sans créneau/);
    expect(r.mounted).toBe(1);
    expect(r.css).toBe(true);
    await context.setOffline(false);
    expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
  });
});
