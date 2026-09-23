const { test, expect } = require('@playwright/test');
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

test.use({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure'
});

// V246 — le brief de la semaine se saisit à 390 px, survit au rechargement, et la fiche
// magasin explique la priorité sans remplacer le badge P1 ni toucher au planning.

async function demarrer(page) {
  const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerWeeklyBriefV246 && window.StoreRunnerWeeklyBriefUIV246
    && window.StoreRunnerPerformanceV190 && window.StoreRunnerPerformanceUIV190 && window.state && window.storage && window.__chefStorage);
  return errors;
}
// Deux magasins fabriqués : un P1 BRUN (priorité 5/5) et un Darty non P1.
async function poserLeSecteur(page) {
  return page.evaluate(() => {
    const B = window.StoreRunnerWeeklyBriefV246, P = window.StoreRunnerPerformanceV190, db = window.__chefStorage;
    const semaine = B.activeWeek(), numero = 'W' + semaine.slice(6);
    const a = { id: 'v246-a', enseigne: 'Boulanger', ville: 'Ville V246 A', adresse: '1 rue du Test', priority: 5, products: ['Brun'], active: true };
    const b = { id: 'v246-b', enseigne: 'Darty', ville: 'Ville V246 B', adresse: '2 rue du Test', priority: 3, products: ['Brun'], active: true };
    window.state.stores = [a, b];
    window.state.plan = { Lundi: [a], Mardi: [b], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    delete window.state.weeklyBriefs;
    window.save();
    P.saveSnapshot(db, {
      week: numero, targetPdm: 40, targetSource: 'explicite', importedAt: new Date().toISOString(),
      rows: [{ key: 'boulanger|ville v246 a', retailer: 'Boulanger', site: 'Ville V246 A', prio: 'P1', pdmYtd: 30, deltaYtd: -10, evolYtd: null, weeks: {}, deltaWeeks: {}, sellOutWeeks: {}, comment: '' }]
    });
    P.rememberMatch(db, 'boulanger|ville v246 a', 'v246-a');
    return { semaine, plan: JSON.stringify(window.state.plan), magasins: JSON.stringify(window.state.stores), perf: db.getItem(P.STORE_KEY) };
  });
}
async function ouvrirLaFiche(page, id) {
  await page.evaluate((id) => {
    const sheet = document.getElementById('storeQuickSheet'), start = document.getElementById('srQuickStart');
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('open');
    start.dataset.srStart = id;
    window.StoreRunnerPerformanceUIV190.renderStoreCard();
    window.StoreRunnerWeeklyBriefUIV246.renderStoreCard();
  }, id);
}
async function mesurer(locator) {
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { gauche: r.left, droite: r.right, viewport: document.documentElement.clientWidth,
      debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      interne: el.scrollWidth - el.clientWidth };
  });
}

test('V246 saisit le brief W de la semaine à 390 px et le conserve au rechargement', async ({ page }) => {
  const errors = await demarrer(page);
  const avant = await poserLeSecteur(page);

  await expect(page.locator('#srBriefMenuButton')).toHaveCount(1);
  await page.evaluate(() => document.getElementById('srBriefMenuButton').click());
  const feuille = page.locator('#srBriefSheet');
  await expect(feuille).toHaveAttribute('open', '');
  await expect(page.locator('#srBriefSubtitle')).toContainText('semaine en cours');
  await expect(feuille).toContainText('Aucun brief pour');

  await page.locator('#srBriefCreate').click();
  await page.locator('#srBriefExcerpt').fill('Prios Co BRUN annulées cette semaine. Challenge Darty : communication moniteurs.');
  await page.locator('#srBriefFileInput').fill('Feuille de route.pdf');
  await page.locator('#srBriefSave').click();
  await expect(page.locator('#srBriefStatus')).toContainText('enregistrée');

  // Règle 1 : neutraliser la priorité performance BRUN.
  await page.locator('#srBriefAddRule summary').click();
  await page.locator('#srBriefRuleType').selectOption('suspend');
  await page.locator('#srBriefRuleLabel').fill('Prios Co BRUN annulées');
  await page.locator('#srBriefRuleFamily').selectOption('brun');
  await page.locator('#srBriefRuleAdd').click();
  await expect(page.locator('#srBriefRules')).toContainText('Prios Co BRUN annulées');

  // Règle 2 : renforcer Darty.
  await page.locator('#srBriefAddRule summary').click();
  await page.locator('#srBriefRuleType').selectOption('boost');
  await page.locator('#srBriefRuleLabel').fill('Challenge Darty');
  await page.locator('#srBriefRuleBrands').fill('Darty');
  await page.locator('#srBriefRuleBoost').fill('30');
  await page.locator('#srBriefRuleAdd').click();
  await expect(page.locator('#srBriefRules')).toContainText('Challenge Darty');
  await expect(feuille).toContainText('Magasins concernés');
  await expect(feuille).toContainText('Ville V246 B');

  // 390 px : rien ne déborde, ni la page ni la feuille.
  const m = await mesurer(feuille);
  expect(m.gauche).toBeGreaterThanOrEqual(0);
  expect(m.droite).toBeLessThanOrEqual(m.viewport);
  expect(m.debordement).toBeLessThanOrEqual(1);
  expect(m.interne).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/weekly-brief-v246-sheet-390.png' });

  // Aucune donnée source n'a bougé.
  const apres = await page.evaluate(() => ({
    plan: JSON.stringify(window.state.plan), magasins: JSON.stringify(window.state.stores),
    perf: window.__chefStorage.getItem(window.StoreRunnerPerformanceV190.STORE_KEY)
  }));
  expect(apres).toEqual({ plan: avant.plan, magasins: avant.magasins, perf: avant.perf });

  // Le brief est écrit dans l'état sauvegardé et relu après rechargement.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerWeeklyBriefV246 && window.storage && window.state && window.state.weeklyBriefs);
  const relu = await page.evaluate((semaine) => {
    const b = window.StoreRunnerWeeklyBriefV246.briefForWeek(window.state, semaine);
    return b && { regles: b.rules.map(r => r.label), fichier: b.source.fileName, revision: b.revision };
  }, avant.semaine);
  expect(relu).toEqual({ regles: ['Prios Co BRUN annulées', 'Challenge Darty'], fichier: 'Feuille de route.pdf', revision: 4 });
  expect(errors).toEqual([]);
});

test('V246 explique la priorité de la semaine dans la fiche sans remplacer le P1', async ({ page }) => {
  const errors = await demarrer(page);
  const avant = await poserLeSecteur(page);
  await page.evaluate((semaine) => {
    const B = window.StoreRunnerWeeklyBriefV246;
    B.addRule(window.state, semaine, { type: 'suspend', target: 'performance', label: 'Prios Co BRUN annulées', scope: { family: 'brun' }, confidence: 'confirmed' });
    window.save();
  }, avant.semaine);

  await ouvrirLaFiche(page, 'v246-a');
  const carte = page.locator('#sqWeeklyBrief');
  await expect(carte).toBeVisible();
  const court = 'W' + avant.semaine.slice(6);
  await expect(carte).toContainText('Priorité ' + court);
  await expect(carte).toContainText('P1 · neutralisée ' + court);
  await expect(carte).toContainText(court + ' : Prios Co BRUN annulées');
  await expect(carte).toContainText('Priorité structurelle 5/5');
  await expect(carte).toContainText('la donnée source reste Prio 1');
  // La carte Performance garde son badge Prio 1 : le brief ne le remplace pas.
  await expect(page.locator('#sqPerformance')).toContainText('Prio 1');

  const m = await mesurer(carte);
  expect(m.droite).toBeLessThanOrEqual(m.viewport);
  expect(m.debordement).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/weekly-brief-v246-card-390.png' });

  // Le bouton ouvre le brief de la semaine.
  await carte.locator('button', { hasText: 'Voir le brief' }).click();
  await expect(page.locator('#srBriefSheet')).toHaveAttribute('open', '');
  await expect(page.locator('#srBriefRules')).toContainText('Prios Co BRUN annulées');
  await page.locator('#srBriefClose').click();

  // Un magasin qu'aucune règle ne touche n'affiche pas de bloc.
  await page.evaluate((semaine) => {
    window.StoreRunnerWeeklyBriefV246.saveBrief(window.state, semaine, { rules: [] });
    window.save();
    window.StoreRunnerWeeklyBriefUIV246.renderStoreCard();
  }, avant.semaine);
  await expect(page.locator('#sqWeeklyBrief')).toHaveCount(0);

  expect(await page.evaluate(() => JSON.stringify(window.state.plan))).toBe(avant.plan);
  expect(errors).toEqual([]);
});
