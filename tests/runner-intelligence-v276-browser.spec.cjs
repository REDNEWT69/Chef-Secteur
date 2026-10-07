const { test, expect, devices } = require('@playwright/test');
const M = require('../store-runner-visit-model.js');
const B = require('../runner-behavior.js');

// V276 — Intelligence Runner, sur le vrai runtime mobile (Android d'abord : Pixel 7 à 390 px, Galaxy S8 à 360 px ; iPhone émulé
// sous Chromium). Aucune doublure : l'application monte Runner, son comportement et le moteur de lecture croisée ; le spec ne
// fait que déposer des données inventées avant le démarrage, figer l'horloge (mercredi 23/09/2026) et conduire les gestes réels
// (clôture d'une visite par son dialogue, réouverture, tap sur Runner). Il prouve :
//   1. une ligne de Runner n'est jamais plus vieille que les faits dont elle est née (clôture, réouverture) ;
//   2. un événement métier parle malgré le budget décoratif épuisé et la bannière de mise à jour ;
//   3. le rapport clôturé reçoit au plus deux remarques croisées, ou aucune quand rien n'est utile ;
//   4. le tap ouvre le point du jour (jamais les réglages), qui se recalcule ; « Personnaliser Runner » ouvre la feuille ;
//   5. aucune écriture métier, aucun débordement, cibles tactiles d'au moins 44 px.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const MAIN = 'sector_planner_universal_v1';
const KEY = 'store-runner-runner-v1';
const TODAY = '2026-09-23';
const STORE_ID = 'v276-store';
const LINE = '#homeRunnerLineV273';
const TAP = '#homeRunnerTapV276';
const BRIEF = '#homeRunnerBriefV276';
const SHEET = '#runnerAppearanceSheet';
const DIALOG = '#srVisitDialog';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const PROFILES = [
  ['Android 390', { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } }],
  ['Android 360', strip(devices['Galaxy S8'])],
  ['iPhone 14 (Chromium)', strip(devices['iPhone 14'])]
];
test.use({ timezoneId: 'Europe/Paris', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

/* Secteur inventé : un magasin, programmé aujourd'hui (mercredi). Avec `history`, trois passages déjà clôturés où « Stocks » était à
   corriger (le premier avec une action notée) : le passage d'aujourd'hui sera donc le quatrième de suite. */
function fixture(history) {
  const store = { id: STORE_ID, enseigne: 'Darty', ville: 'Ville Test', adresse: '1 rue du Test', dept: '69', lat: 45.75, lon: 4.85, active: true, priority: 3, intervalDays: 30, visitMinutes: 60 };
  const state = {
    schemaVersion: 5,
    profile: { sectorName: 'Secteur Test', baseName: 'Base Test', baseAddress: '3 rue du Test', baseLat: 45.7, baseLon: 4.8, overnight: 'never' },
    settings: { days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], startTime: '08:30', endTime: '18:00', weekDate: '2026-09-21', visitMinutes: 60, target: 15 },
    stores: [store], plan: { Lundi: [], Mardi: [], Mercredi: [store], Jeudi: [], Vendredi: [], Samedi: [] },
    visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {}, businessV2: M.empty()
  };
  if (history) {
    [['2026-08-05', 'Refaire le facing'], ['2026-09-02', ''], ['2026-09-16', '']].forEach(([day, action]) => {
      const id = M.start(state, STORE_ID);
      M.edit6P(state, id, 'produit', 1, 'status', 'correct');
      if (action) M.edit6P(state, id, 'produit', 1, 'action', action);
      M.editVisit(state, id, 'conclusion', null, 'Passage terminé');
      M.complete(state, id, day);
      // Cette fixture reste dédiée aux constats 6P V276. Les actions ouvertes et la priorité
      // mémoire sur le décor sont couvertes par runner-report-memory-v277-browser.
      for (const a of state.businessV2.actions.filter(a => a.visitId === id)) M.editAction(state, a.id, 'status', 'done');
    });
  }
  return state;
}

async function prepare(page, history, registryRaw) {
  await page.clock.setFixedTime(new Date(TODAY + 'T10:00:00+02:00'));
  await page.addInitScript(({ initial, main, key, registryRaw }) => {
    if (!localStorage.getItem('runner-v276-fixture')) {
      localStorage.setItem('store-runner-onboarding-v1', JSON.stringify({ version: 1, status: 'complete', step: 4 }));
      localStorage.setItem(main, JSON.stringify(initial));
      if (registryRaw) localStorage.setItem(key, registryRaw);
      localStorage.setItem('runner-v276-fixture', '1');
    }
  }, { initial: fixture(history), main: MAIN, key: KEY, registryRaw: registryRaw || null });
}
/* Un texte décoratif a déjà été dit à 09:55 (écart de 10 min non écoulé à 10:00, écoulé à 10:30) : à 10:00 le décor se tait. */
const RECENT_TEXT = () => B.serializeRegistry(Object.assign({}, B.setPersonality(B.defaultRegistry(), 'copilote').registry, {
  lastTextAt: Date.parse(TODAY + 'T09:55:00+02:00'), textDay: { date: TODAY, n: 1 }, lastActiveDate: TODAY, lastActiveAt: Date.parse(TODAY + 'T09:55:00+02:00')
}));
async function ready(page) {
  await page.waitForFunction(() => window.StoreRunnerBehavior && window.StoreRunnerAppearance && window.StoreRunnerVisits && window.StoreRunnerBoot?.settled() && document.querySelector('#homeRunnerV270 .srRunner'));
  await page.waitForLoadState('load');
  await page.addStyleTag({ content: 'aside[role="status"]{display:none!important}' });
}
async function boot(page, history) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, history);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await ready(page);
  return errors;
}
const line = page => page.evaluate(sel => { const el = document.querySelector(sel); return el ? { hidden: el.hidden, text: el.textContent } : null; }, LINE);
const registry = page => page.evaluate(key => __chefStorage.getItem(key), KEY).then(raw => (raw ? B.parseRegistry(raw) : null));
const business = page => page.evaluate(async main => { await __chefStorage.flush(); return JSON.stringify({ state, main: __chefStorage.getItem(main), archive: __chefStorage.getItem('chef_sector_plan_archive_v1') }); }, MAIN);
async function persist(page) { await page.evaluate(async () => { save(); await __chefStorage.flush(); }); }

/* Le passage du jour : un brouillon avec « Stocks » à corriger, clôturé par le dialogue de visite (le geste réel). */
async function startDraft(page, rows) {
  return page.evaluate(rows => {
    const id = StoreRunnerVisitModel.start(window.state, 'v276-store');
    for (const [p, i, status] of rows) StoreRunnerVisitModel.edit6P(window.state, id, p, i, 'status', status);
    save();
    return id;
  }, rows);
}
async function openVisit(page, id) {
  await page.evaluate(id => StoreRunnerVisits.openVisit(id), id);
  await expect(page.locator(DIALOG)).toBeVisible();
}
async function completeFromDialog(page) {
  page.once('dialog', dialog => dialog.accept());
  await page.locator(DIALOG + ' [data-sr-complete-visit]').tap();
  await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée');
}
async function closeDialog(page) {
  await page.locator(DIALOG + ' .sr-head').getByRole('button', { name: 'Fermer', exact: true }).tap();
  await expect(page.locator(DIALOG)).not.toBeVisible();
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [label, device] of PROFILES) {
  test.describe(label, () => {
    test.use(device);

    test('clôture : plus de ligne périmée, l’événement métier parle malgré budget décoratif et bannière, la réouverture retire le constat', async ({ page }) => {
      const errors = await boot(page, true);
      await persist(page);

      // 1. À l'arrivée, Runner dit une ligne décorative : le budget du jour est consommé.
      await expect(page.locator(LINE)).toBeVisible();
      const before = (await line(page)).text;
      expect(before.length).toBeGreaterThan(0);
      expect(before).not.toMatch(/Tournée terminée/);
      expect((await registry(page)).textDay.n, 'le budget décoratif du jour est consommé').toBe(1);

      // 2. Le point du jour est ouvert, une mise à jour de l'application est en attente : le décor est bloqué, pas le métier.
      await page.locator(TAP).tap();
      await expect(page.locator(BRIEF + ' li').first()).toContainText('1 visite restante aujourd’hui');
      await page.evaluate(() => document.body.append(Object.assign(document.createElement('div'), { id: 'storeRunnerUpdateBanner' })));

      // 3. Clôture réelle de la visite du jour par son dialogue.
      const visitId = await startDraft(page, [['produit', 1, 'correct']]);
      await openVisit(page, visitId);
      await completeFromDialog(page);

      // Le rapport clôturé : au plus deux remarques croisées avec les trois passages précédents, dans le flux, jamais flottantes.
      const remark = page.locator(DIALOG + ' .sr-runnerRemark');
      await expect(remark).toBeVisible();
      const lines = await remark.locator('.sr-runnerLines p').allTextContents();
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines[0]).toMatch(/Stocks \(Produit\) : à corriger pour la 4ᵉ visite de suite\./);
      await expect(remark.locator('.srRunner')).toHaveCount(1);
      expect(await remark.evaluate(el => { const r = el.getBoundingClientRect(); return { position: getComputedStyle(el).position, left: r.left, right: r.right, vw: innerWidth }; }))
        .toMatchObject({ position: 'static' });
      const box = await remark.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(device.viewport.width);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await closeDialog(page);

      // 4. La ligne périmée a disparu ; l'événement métier a parlé malgré le cooldown et la bannière ; le point du jour a suivi.
      await expect(page.locator(LINE)).toBeVisible();
      await expect(page.locator(LINE)).toHaveText(/Tournée terminée/);
      expect((await line(page)).text).not.toBe(before);
      await expect(page.locator(BRIEF + ' li').first()).toContainText('Tournée terminée : 1 sur 1.');
      await expect(page.locator(BRIEF)).not.toContainText('visite restante');
      const afterClose = await registry(page);
      expect(afterClose.shown['tour.finished'].d, 'dite une fois pour cette journée').toBe(TODAY);
      expect(afterClose.textDay.n, 'le métier ne consomme jamais le budget décoratif').toBe(1);

      // La mise à jour n'est plus en attente : le décor n'est plus bloqué par elle, seul le déclencheur « rerender » le tient désormais muet.
      await page.evaluate(() => document.getElementById('storeRunnerUpdateBanner').remove());

      // 5. Lire le point du jour n'écrit rien.
      const snapshot = await business(page);
      await expect(page.locator(BRIEF + ' li')).toHaveCount(3);
      await expect(page.locator(BRIEF)).toContainText('Stocks (Produit)');
      await page.locator(BRIEF + ' [data-home-brief-close]').tap();
      await expect(page.locator(BRIEF)).toBeHidden();
      await page.locator(TAP).tap();
      await expect(page.locator(BRIEF)).toBeVisible();
      expect(await business(page), 'ouvrir et fermer le point du jour ne touche aucune donnée métier').toBe(snapshot);

      // 6. Réouverture, une demi-heure plus tard (l'écart de 10 min entre deux textes décoratifs est écoulé) : « Tournée terminée » n'est
      //    plus vrai et ne reste pas affiché ; le rendu qui suit est un « rerender » : aucun décor ne le remplace.
      await page.clock.setFixedTime(new Date(TODAY + 'T10:30:00+02:00'));
      await expect(page.locator('#homeRunnerV270 .srRunner'), 'le succès de la clôture est retombé : Runner est de nouveau au repos').toHaveAttribute('data-state', 'neutral', { timeout: B.CONFIG.messageMs + 4000 });
      await openVisit(page, visitId);
      page.once('dialog', dialog => dialog.accept());
      await page.locator(DIALOG + ' [data-sr-reopen-visit]').tap();
      await expect(page.locator('#srVisitTitle')).toContainText('Visite en cours');
      await closeDialog(page);
      await expect.poll(async () => { const l = await line(page); return !l || l.hidden; }).toBe(true);
      await expect(page.locator(BRIEF + ' li').first()).toContainText('1 visite restante aujourd’hui');
      await expect(page.locator(BRIEF)).not.toContainText('Tournée terminée');
      expect((await registry(page)).textDay.n, 'la réouverture ne fait pas parler le décor').toBe(1);

      // 7. Nouvelle clôture : le constat revient dans le rapport et dans le point du jour, jamais deux fois en bulle le même jour.
      await openVisit(page, visitId);
      await completeFromDialog(page);
      await expect(page.locator(DIALOG + ' .sr-runnerRemark')).toBeVisible();
      await closeDialog(page);
      await expect(page.locator(BRIEF + ' li').first()).toContainText('Tournée terminée : 1 sur 1.');
      await expect.poll(async () => { const l = await line(page); return !l || l.hidden; }).toBe(true);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });

    test('rerender : un changement de données ne fait jamais parler le décor, une vraie arrivée oui', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await prepare(page, false, RECENT_TEXT());
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await ready(page);
      // À 10:00 l'écart entre deux textes décoratifs n'est pas écoulé : Runner se tait, rien n'est compté de plus.
      expect((await line(page)).hidden).toBe(true);
      expect((await registry(page)).textDay.n).toBe(1);

      // 10:30 : l'écart est écoulé. Un changement de données reconstruit l'Accueil (même écran) : un « rerender », le décor reste muet.
      await page.clock.setFixedTime(new Date(TODAY + 'T10:30:00+02:00'));
      await page.evaluate(() => {
        // Un second magasin rejoint la tournée du jour : le rendu de l'Accueil change, Runner est remonté sur le même écran.
        const extra = Object.assign({}, state.stores[0], { id: 'v276-store-2', ville: 'Autre Ville' });
        state.stores.push(extra); state.plan.Mercredi.push(extra); save();
        window.__homeSlot = document.querySelector('#homeRunnerV270');
        document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
      });
      await page.waitForFunction(() => { const slot = document.querySelector('#homeRunnerV270'); return slot && slot !== window.__homeSlot && slot.querySelector('.srRunner'); });
      await page.waitForTimeout(400);
      expect((await line(page)).hidden, 'un rerender n’est pas une arrivée').toBe(true);
      expect((await registry(page)).textDay.n, 'rien n’a été dit, rien n’est compté').toBe(1);

      // Témoin : une vraie arrivée (retour d'un autre écran), mêmes faits, même heure : Runner parle.
      await page.evaluate(() => goTab('planPanel'));
      await expect(page.locator('#planPanel.active')).toBeVisible();
      await page.evaluate(() => goTab('homePanel'));
      await expect(page.locator(LINE)).toBeVisible();
      expect((await line(page)).text.length).toBeGreaterThan(0);
      expect((await registry(page)).textDay.n).toBe(2);
      expect(errors).toEqual([]);
    });

    test('rien d’utile à dire : ni remarque dans le rapport, ni constat dans le point du jour', async ({ page }) => {
      const errors = await boot(page, false);
      const visitId = await startDraft(page, [['produit', 1, 'ok']]);
      await openVisit(page, visitId);
      await completeFromDialog(page);
      await expect(page.locator(DIALOG + ' .sr-completed')).toBeVisible();
      await expect(page.locator(DIALOG + ' .sr-runnerRemark'), 'première visite, tout est bon : Runner se tait').toHaveCount(0);
      await closeDialog(page);
      await page.locator(TAP).tap();
      await expect(page.locator(BRIEF + ' li')).toHaveCount(1);
      await expect(page.locator(BRIEF + ' li').first()).toHaveText('Tournée terminée : 1 sur 1.');
      expect(errors).toEqual([]);
    });

    test('tap sur Runner : le point du jour, jamais les réglages ; « Personnaliser Runner » ouvre la feuille', async ({ page }) => {
      const errors = await boot(page, true);
      await persist(page);
      const before = await business(page);
      await expect(page.locator(TAP)).toHaveAccessibleName(/Runner/);
      await expect(page.locator(TAP)).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator(BRIEF)).toBeHidden();

      await page.locator(TAP).tap();
      await expect(page.locator(BRIEF)).toBeVisible();
      await expect(page.locator(TAP)).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator(SHEET + '[open]'), 'le tap n’ouvre plus la feuille Apparence').toHaveCount(0);
      await expect(page.locator(BRIEF + ' li').first()).toContainText('1 visite restante aujourd’hui · prochaine : Darty');
      expect(await page.locator(BRIEF).evaluate(el => { const r = el.getBoundingClientRect(); return { position: getComputedStyle(el).position, left: r.left, right: r.right, vw: innerWidth }; }))
        .toMatchObject({ position: 'static' });
      const geometry = await page.locator(BRIEF).boundingBox();
      expect(geometry.x).toBeGreaterThanOrEqual(0);
      expect(geometry.x + geometry.width).toBeLessThanOrEqual(device.viewport.width);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      for (const target of [TAP, BRIEF + ' [data-home-brief-close]', BRIEF + ' [data-home-brief-settings]', BRIEF + ' [data-home-brief-store]']) {
        const size = await page.locator(target).first().boundingBox();
        expect(size.height, target + ' : cible tactile d’au moins 44 px').toBeGreaterThanOrEqual(44);
        expect(size.width, target + ' : cible tactile d’au moins 44 px').toBeGreaterThanOrEqual(44);
      }

      // Fermer, rouvrir, puis la fiche du magasin annoncé (le propriétaire de la fiche l'ouvre).
      await page.locator(BRIEF + ' [data-home-brief-close]').tap();
      await expect(page.locator(BRIEF)).toBeHidden();
      await expect(page.locator(TAP)).toHaveAttribute('aria-expanded', 'false');
      await page.locator(TAP).tap();
      await expect(page.locator(BRIEF)).toBeVisible();
      await page.locator(BRIEF + ' [data-home-brief-store]').tap();
      await expect(page.locator('#storeQuickSheet')).toBeVisible();
      await expect(page.locator(BRIEF)).toBeHidden();
      await page.evaluate(() => { const sheet = document.querySelector('#storeQuickSheet'); if (typeof closeStoreQuick === 'function') closeStoreQuick(); else sheet.classList.remove('open'); });

      // Le geste explicite « Personnaliser Runner » ouvre la feuille Apparence + Personnalité, une seule fois.
      await page.locator(TAP).tap();
      await expect(page.locator(BRIEF)).toBeVisible();
      await page.locator(BRIEF + ' [data-home-brief-settings]').tap();
      await expect(page.locator(SHEET)).toHaveAttribute('open', '');
      await expect(page.locator(SHEET + ' #runnerPersonalityTitle')).toHaveText('Personnalité');
      await expect(page.locator(BRIEF), 'la feuille ouverte referme le point du jour').toBeHidden();
      await page.keyboard.press('Escape');
      await expect(page.locator(SHEET + '[open]')).toHaveCount(0);
      await expect(page.locator(BRIEF)).toBeHidden();
      expect(await business(page), 'ni le point du jour, ni la fiche, ni la feuille n’écrivent dans les données').toBe(before);
      expect(errors).toEqual([]);
    });
  });
}
