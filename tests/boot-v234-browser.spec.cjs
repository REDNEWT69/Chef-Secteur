// V234 — démarrage Store Runner dans un vrai navigateur mobile 390 px.
//
// Le shell charge src/chef-secteur.html puis remplace le document avec document.write().
// Trois surfaces pouvaient donc se succéder à l'écran : le voile du shell, un blanc le
// temps que le document runtime télécharge ses premiers scripts, puis l'ancien accueil
// tant que home-refresh-v2.js n'avait pas monté l'interface finale.
//
// Sonder depuis Node ne prouverait rien : entre deux sondages, une phase entière peut
// passer inaperçue. Ce test installe donc un enregistreur `requestAnimationFrame` AVANT
// le premier script de la page. Comme `document.open()` conserve l'objet `window`, cette
// boucle survit au document.write et échantillonne CHAQUE frame du démarrage. Les
// garanties sont ensuite vérifiées sur la totalité des frames.
//
// Aucun ralentissement n'est simulé : le montage réel dure déjà des dizaines de frames,
// et intercepter des requêtes rendrait le test plus lent et plus fragile qu'utile.
// L'attente de `goto` n'a aucune incidence sur la mesure — l'enregistreur est posé avant
// le premier script — donc on garde `domcontentloaded`, comme le reste de la suite.
const { test, expect } = require('@playwright/test');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

// Éléments de l'accueil historique : aucun ne doit être visible une seule frame.
const ANCIEN_ACCUEIL = ['#homePanel .homeHero', '#homeKpis', '#homePriority', '#homeNext', '#homePanel>.sectionTitle'];

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'block'
});

function enregistreurDeFrames(selecteursAnciens) {
  window.__srBootFrames = [];
  const visible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0;
  };
  const frame = () => {
    try {
      const voiles = document.querySelectorAll('[data-store-runner-boot]');
      const node = voiles[0] || null;
      let couvre = false;
      if (node) {
        const r = node.getBoundingClientRect();
        const cible = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        couvre = r.width >= innerWidth && r.height >= innerHeight &&
          Number(getComputedStyle(node).opacity) > 0 &&
          !!(cible && cible.closest && cible.closest('[data-store-runner-boot]'));
      }
      window.__srBootFrames.push({
        corps: !!document.body,
        voiles: voiles.length,
        couvre,
        ancienLoader: !!document.getElementById('srRuntimeBoot'),
        pret: !!(document.querySelector('#premiumHomeV2 .phTop') && document.querySelector('#bottomAppNav[data-v2="1"]')),
        ancien: selecteursAnciens.filter(sel => visible(document.querySelector(sel)))
      });
    } catch (e) { /* frame prise pendant une transition de document */ }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// `page.evaluate` ouvre un contexte neuf à chaque appel : contrairement à
// `page.waitForFunction`, il survit au remplacement de document par document.write().
function etat(page) {
  return page.evaluate(() => ({
    voiles: document.querySelectorAll('[data-store-runner-boot]').length,
    ancienLoader: !!document.getElementById('srRuntimeBoot'),
    drapeau: document.documentElement.hasAttribute('data-store-runner-booting'),
    pret: !!(document.querySelector('#premiumHomeV2 .phTop') && document.querySelector('#bottomAppNav[data-v2="1"]')),
    chargee: document.readyState === 'complete',
    debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth
  })).catch(() => null);
}

test('V234 — un seul voile de démarrage couvre tout le montage, sans flash de l’ancien accueil', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String((e && e.message) || e)));

  await page.addInitScript(enregistreurDeFrames, ANCIEN_ACCUEIL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => {
    const s = await etat(page);
    return !!(s && s.pret && s.voiles === 0);
  }, { timeout: 20000, message: 'l’accueil final doit finir par remplacer le voile' }).toBe(true);

  // --- Ce que chaque frame du démarrage a réellement affiché --------------------------
  const frames = await page.evaluate(() => window.__srBootFrames || []);
  expect(frames.length, 'l’enregistreur doit avoir survécu au document.write').toBeGreaterThan(10);

  // Le voile apparaît dès que la page a un corps, et plus jamais l'écran ne se retrouve
  // sans lui : c'est la frontière entre « la page charge » et « Store Runner démarre ».
  const debut = frames.findIndex(f => f.voiles > 0);
  expect(debut, 'le voile doit exister dès les premières frames').toBeGreaterThanOrEqual(0);
  expect(frames.slice(0, debut).filter(f => f.corps),
    'aucune frame avec un <body> ne doit précéder le voile').toEqual([]);

  const demarrage = frames.slice(debut);
  const montage = demarrage.filter(f => !f.pret);
  expect(montage.length, 'la phase de montage doit durer plusieurs frames observables').toBeGreaterThanOrEqual(3);

  expect(Math.max(...demarrage.map(f => f.voiles)), 'jamais deux écrans de chargement à la fois').toBe(1);
  expect(demarrage.filter(f => f.ancienLoader).length, 'l’ancien loader srRuntimeBoot ne doit jamais exister').toBe(0);
  expect(demarrage.filter(f => f.ancien.length).map(f => f.ancien),
    'aucune frame ne doit montrer l’accueil historique').toEqual([]);
  expect(montage.filter(f => !(f.voiles === 1 && f.couvre)).length,
    'tant que l’accueil final n’est pas prêt, le voile doit couvrir l’écran à chaque frame').toBe(0);

  const derniere = frames[frames.length - 1];
  expect(derniere).toMatchObject({ voiles: 0, pret: true });

  // --- État final ---------------------------------------------------------------------
  const final = await etat(page);
  expect(final).toMatchObject({ voiles: 0, ancienLoader: false, drapeau: false, pret: true });
  expect(final.debordement).toBeLessThanOrEqual(1);

  // --- Le premier bouton réel de l'application répond ---------------------------------
  const premierBouton = page.locator('#bottomAppNav .bottomNavBtn').first();
  await expect(premierBouton).toBeVisible();
  const capte = await premierBouton.evaluate(el => {
    const r = el.getBoundingClientRect();
    const cible = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(cible && el.contains(cible));
  });
  expect(capte, 'plus rien ne doit s’interposer devant la navigation').toBe(true);

  await page.locator('#bottomAppNav .bottomNavBtn[data-panel="planPanel"]').click();
  await expect(page.locator('#planPanel')).toHaveClass(/\bactive\b/);

  expect(erreurs).toEqual([]);
});

test('V234 — si l’accueil moderne ne monte jamais, le voile ne séquestre pas l’application', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String((e && e.message) || e)));

  // home-refresh-v2.js n'arrive jamais : `store-runner:home-rendered` ne sera donc jamais
  // émis et #premiumHomeV2 n'existera pas. Le voile doit malgré tout rendre la main, au
  // plus tard à l'événement load — c'est ce filet qui évite qu'il capture tous les clics.
  await page.route('**/home-refresh-v2.js*', route => route.abort());

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => {
    const s = await etat(page);
    return !!(s && s.chargee && s.voiles === 0);
  }, { timeout: 20000, message: 'le voile doit rendre la main même sans accueil moderne' }).toBe(true);

  const final = await etat(page);
  expect(final.pret, 'la scène testée est bien celle où l’accueil moderne n’existe pas').toBe(false);
  expect(final.drapeau, 'le drapeau de démarrage doit être levé, sinon l’accueil resterait amputé').toBe(false);

  const bouton = page.locator('#bottomAppNav .bottomNavBtn[data-panel="planPanel"]').first();
  await expect(bouton).toBeVisible();
  await bouton.click();
  await expect(page.locator('#planPanel')).toHaveClass(/\bactive\b/);

  expect(erreurs).toEqual([]);
});
