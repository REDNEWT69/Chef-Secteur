const { test, expect } = require('@playwright/test');
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

test.use({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure'
});

// V237 — la carte de la fiche magasin doit tenir à 390 px sans devenir un mur de texte,
// et sans jamais perdre l'accès au détail ni au pilotage performance.
const MISSION = String.fromCharCode(0xF6A8)
  + 'ALERTE OLED: Décroissance OLED | ALERTE OLED: Poids OLED <40% | '
  + 'Reprise requise sur QLED (-58.1% vs N-1) | Reprise requise sur UHD (-53.4% vs N-1) | '
  + 'baisse 37~43 | baisse 80~85 | Capitaliser sur Neo QLED (+138.2%) | '
  + 'Poids OLED 2026=33%, Poids OLED 2025=37%';

async function poserLaFiche(page, mission) {
  return page.evaluate(({ mission }) => {
    const P = window.StoreRunnerPerformanceV190, db = window.__chefStorage;
    const store = { id: 'v237-e2e', enseigne: 'Boulanger', ville: 'Ville V237', adresse: '1 rue du Test', priority: 4, active: true };
    window.state.stores = [store];
    window.state.plan = { Lundi: [store], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [] };
    const planAvant = JSON.stringify(window.state.plan);
    P.saveSnapshot(db, {
      version: 2, week: 'W34', targetPdm: 42.5, targetSource: 'explicite', importedAt: '2026-09-22T08:00:00Z',
      rows: [{
        key: 'boulanger|ville v237', retailer: 'Boulanger', site: 'Ville V237', prio: 'P1',
        pdmYtd: 23.9, deltaYtd: -18.6, evolYtd: -28.9,
        weeks: { W32: -34.7, W33: -23.4, W34: -24.8 },
        sellOutYtd: -12400, sellOutWeeks: { W34: -900 }, comment: mission
      }]
    });
    P.rememberMatch(db, 'boulanger|ville v237', 'v237-e2e');

    // La carte se pose dans la vraie feuille magasin, à son ancre réelle.
    const sheet = document.getElementById('storeQuickSheet');
    const start = document.getElementById('srQuickStart');
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('open');
    start.dataset.srStart = 'v237-e2e';
    const pose = window.StoreRunnerPerformanceUIV190.renderStoreCard();
    return { pose, planAvant, planApres: JSON.stringify(window.state.plan) };
  }, { mission });
}

test('V237 résume la priorité en blocs courts et tient à 390 px', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerPerformanceV190 && window.StoreRunnerPerformanceUIV190 && window.state && window.__chefStorage);

  const pose = await poserLaFiche(page, MISSION);
  expect(pose.pose).toBe(true);
  expect(pose.planApres).toBe(pose.planAvant);

  const carte = page.locator('#sqPerformance');
  await expect(carte).toBeVisible();

  // 1. Le FMT lit d'abord quoi faire, pas le nom des colonnes.
  await expect(carte).toContainText('Relancer OLED / QLED');
  await expect(carte).toContainText('Situation');
  await expect(carte).toContainText('23,9 %');
  await expect(carte).toContainText('À travailler');
  await expect(carte).toContainText('Point positif');
  await expect(carte).toContainText('Neo QLED');
  await expect(carte).toContainText('Action visite');
  await expect(carte).toContainText('Tendance');

  // 2. Le détail complet existe, mais replié : la carte ne le déverse pas.
  const detail = carte.locator('.srPerfDetail237');
  await expect(detail).toHaveCount(1);
  expect(await detail.evaluate(d => d.open)).toBe(false);
  // Le contenu du détail reste dans le DOM mais n'est pas rendu : c'est ce que voit
  // le FMT qui doit être court, pas ce que contient l'arbre.
  await expect(detail.locator('.srPerfCardRow').first()).toBeHidden();

  // 3. Aucun caractère cassé ni séparateur technique n'atteint l'écran.
  const rendu = await carte.innerText();
  expect(rendu.includes('Tendance hebdo (indicative)')).toBe(false);
  expect(rendu.includes('Historique :')).toBe(false);
  for (const interdit of [String.fromCharCode(0xF6A8), String.fromCharCode(0xFFFD), '|']) {
    expect(rendu.includes(interdit)).toBe(false);
  }
  // La semaine n'est jamais annoncée comme une simple hausse tant qu'elle reste négative.
  expect(rendu).toContain('amélioration récente mais toujours en recul');
  expect(/\bhausse\b/.test(rendu)).toBe(false);

  // 4. Mesures mobiles : pas de débordement, et la synthèse tient sur un écran.
  const mesures = await carte.evaluate(el => {
    const r = el.getBoundingClientRect();
    const detail = el.querySelector('.srPerfDetail237');
    return {
      largeur: r.width,
      viewport: document.documentElement.clientWidth,
      debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hauteurSynthese: detail ? detail.getBoundingClientRect().top - r.top : r.height
    };
  });
  expect(mesures.largeur).toBeLessThanOrEqual(mesures.viewport);
  expect(mesures.debordement).toBeLessThanOrEqual(1);
  expect(mesures.hauteurSynthese).toBeLessThanOrEqual(844);

  // 5. Déplié, le détail rend bien tout ce que la carte affichait avant V237.
  await detail.locator('summary').click();
  await expect(carte).toContainText('Statut YTD');
  await expect(carte).toContainText('Tendance hebdo (indicative)');
  await expect(carte).toContainText('Évolution YTD vs N-1');
  await expect(carte).toContainText('Sell-out');
  await expect(carte).toContainText('Mission :');

  expect(errors).toEqual([]);
});

test('V237 garde le bouton « Ouvrir le pilotage performance » fonctionnel', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerPerformanceV190 && window.StoreRunnerPerformanceUIV190 && window.state && window.__chefStorage);

  await poserLaFiche(page, MISSION);

  const bouton = page.locator('#sqPerformance button', { hasText: 'Ouvrir le pilotage performance' });
  await expect(bouton).toHaveCount(1);
  await bouton.click();
  await expect(page.locator('#srPerfSheet')).toHaveAttribute('open', '');

  // Le pilotage garde son contenu complet : V237 n'allège que la carte de la fiche.
  await expect(page.locator('#srPerfSheet')).toContainText('Ville V237');
  expect(errors).toEqual([]);
});

test('V237 n’invente ni point positif ni alerte quand le classeur est muet', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerPerformanceV190 && window.StoreRunnerPerformanceUIV190 && window.state && window.__chefStorage);

  await poserLaFiche(page, '');
  const carte = page.locator('#sqPerformance');
  await expect(carte).toBeVisible();
  await expect(carte).not.toContainText('Point positif');
  await expect(carte).not.toContainText('À travailler');
  await expect(carte).toContainText('Situation');
  await expect(carte).toContainText('Ouvrir le pilotage performance');
  expect(errors).toEqual([]);
});
