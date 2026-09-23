const { test, expect } = require('@playwright/test');
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

test.use({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure'
});

async function demarrer(page) {
  const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerWeeklyBriefV246 && window.StoreRunnerWeeklyBriefUIV246
    && window.StoreRunnerWeeklyBriefImportV246B && window.state && window.storage && window.__chefStorage);
  return errors;
}

function briefTexte(week) {
  const short = 'W' + week.slice(6);
  return `Feuille de route ${short}
- Semaine Weekly GSA/Meublier. Merci de visiter sur Lundi, Mardi et Mercredi un max d’enseignes concernées, mais sans oublier la GSS. Benchmark à remplir entre mercredi et jeudi matin.
- Visites Mags Prio 1 : Terminez les visites et de remplir le Google Forms avant mercredi.
- Micro RGB : On ne lâche rien sur la prise d’infos sur les Micro RGB Sony vs Samsung.
- Challenge Darty : Continuez à informer les mags du Challenge. Important communiquer sur les Moniteurs !!!
- Prios Co Brun annulées cette semaine, celles du blanc maintenues semaine prochaine. En attente de confirmation de SEF.`;
}

test('V246B analyse un PDF local à 390 px puis enregistre seulement des propositions à confirmer', async ({ page }) => {
  const errors = await demarrer(page);
  const avant = await page.evaluate(() => {
    const B = window.StoreRunnerWeeklyBriefV246;
    const a = { id: 'pdf-a', enseigne: 'Boulanger', ville: 'Ville PDF A', priority: 5, products: ['Brun'], active: true };
    window.state.stores = [a];
    window.state.plan = { Lundi: [a], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    delete window.state.weeklyBriefs;
    window.save();
    return { week: B.activeWeek(), plan: JSON.stringify(window.state.plan), stores: JSON.stringify(window.state.stores) };
  });

  const source = briefTexte(avant.week);
  await page.evaluate((source) => { window.__storeRunnerPdfTextExtractor = async () => source; }, source);
  await page.evaluate(() => document.getElementById('srBriefMenuButton').click());

  const sheet = page.locator('#srBriefSheet');
  await expect(sheet).toHaveAttribute('open', '');
  await expect(page.locator('#srBriefPdfImport')).toBeVisible();
  await expect(page.locator('#srBriefPdfImport')).toContainText('rien ne s’applique avant ta confirmation');

  await page.locator('#srBriefPdfFile').setInputFiles({
    name: `Feuille de route W${avant.week.slice(6)}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 test')
  });
  await page.locator('#srBriefPdfAnalyze').click();
  await expect(page.locator('#srBriefPdfPreview')).toContainText('proposition');
  await expect(page.locator('#srBriefPdfPreview')).toContainText('Prios Co BRUN annulées');
  await expect(page.locator('#srBriefPdfPreview')).toContainText('Challenge Darty');
  await expect(page.locator('#srBriefPdfPreview')).toContainText('À confirmer');

  // Analyser n'écrit rien encore.
  expect(await page.evaluate(() => window.state.weeklyBriefs === undefined)).toBe(true);

  const box = await page.locator('#srBriefPdfImport').evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, viewport: document.documentElement.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ownOverflow: el.scrollWidth - el.clientWidth };
  });
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.viewport);
  expect(box.pageOverflow).toBeLessThanOrEqual(1);
  expect(box.ownOverflow).toBeLessThanOrEqual(1);

  await page.locator('#srBriefPdfSave').click();
  await page.waitForFunction(() => window.state.weeklyBriefs);
  const saved = await page.evaluate((week) => {
    const B = window.StoreRunnerWeeklyBriefV246, b = B.briefForWeek(window.state, week);
    return {
      kind: b.source.kind, fileName: b.source.fileName, rules: b.rules.map(r => ({ label: r.label, confidence: r.confidence, pending: r.pending })),
      active: B.rulesForWeek(window.state, week).length,
      plan: JSON.stringify(window.state.plan), stores: JSON.stringify(window.state.stores)
    };
  }, avant.week);
  expect(saved.kind).toBe('file');
  expect(saved.fileName).toContain('.pdf');
  expect(saved.rules.length).toBeGreaterThanOrEqual(5);
  expect(saved.rules.every(r => r.confidence === 'ambiguous')).toBe(true);
  expect(saved.active).toBe(0);
  expect(saved.plan).toBe(avant.plan);
  expect(saved.stores).toBe(avant.stores);

  await expect(page.locator('#srBriefRules')).toContainText('À confirmer');
  await expect(page.locator('#srBriefRules')).toContainText('Confirmation de SEF');
  await page.screenshot({ path: 'test-results/weekly-brief-v246b-pdf-390.png' });
  expect(errors).toEqual([]);
});
