// V234 — démarrage Store Runner dans un vrai navigateur mobile 390 px.
//
// Le shell charge src/chef-secteur.html puis remplace le document avec document.write().
// Trois surfaces pouvaient donc se succéder à l'écran : le voile du shell, un blanc le
// temps que le document runtime télécharge ses premiers scripts, puis l'ancien accueil
// tant que home-refresh-v2.js n'avait pas monté l'interface finale.
const { test, expect } = require('@playwright/test');
const cleanupBaseline = require('./fixtures/cleanup-baseline-r20.json');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const FIRST_RUN_URL = (() => {
  const url = new URL(APP_URL);
  url.searchParams.set('e2eOnboarding', 'first-run');
  return url.toString();
})();
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

  const frames = await page.evaluate(() => window.__srBootFrames || []);
  expect(frames.length, 'l’enregistreur doit avoir survécu au document.write').toBeGreaterThan(10);

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

  const final = await etat(page);
  expect(final).toMatchObject({ voiles: 0, ancienLoader: false, drapeau: false, pret: true });
  expect(final.debordement).toBeLessThanOrEqual(1);

  // Mesure r20 lisible par machine. Une suppression legacy pourra réduire ce total,
  // mais aucun nettoyage ne doit le faire croître ni charger deux fois le même script.
  const scriptResources = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.initiatorType === 'script')
    .map(entry => new URL(entry.name).pathname.split('/').pop())
    .filter(Boolean));
  expect(scriptResources.length).toBeGreaterThan(0);
  expect(scriptResources.length).toBeLessThanOrEqual(cleanupBaseline.runtimeInventory.startupScriptResources);
  expect(new Set(scriptResources).size, 'aucun script runtime ne doit être chargé deux fois').toBe(scriptResources.length);

  // Sur une installation neuve, l'onboarding peut couvrir l'accueil. On vérifie donc
  // d'abord qu'il est bien l'unique surface interactive puis on le ferme pour tester la nav.
  const onboarding = page.locator('#storeRunnerFirstRun');
  if (await onboarding.isVisible().catch(() => false)) {
    await onboarding.getByRole('button', { name: 'Plus tard' }).click();
    await expect(onboarding).toBeHidden();
  }

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
  await page.route('**/home-refresh-v2.js*', route => route.abort());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => {
    const s = await etat(page);
    return !!(s && s.chargee && s.voiles === 0);
  }, { timeout: 20000, message: 'le voile doit rendre la main même sans accueil moderne' }).toBe(true);

  const final = await etat(page);
  expect(final.pret, 'la scène testée est bien celle où l’accueil moderne n’existe pas').toBe(false);
  expect(final.drapeau, 'le drapeau de démarrage doit être levé, sinon l’accueil resterait amputé').toBe(false);

  const onboarding = page.locator('#storeRunnerFirstRun');
  if (await onboarding.isVisible().catch(() => false)) await onboarding.getByRole('button', { name: 'Plus tard' }).click();

  const bouton = page.locator('#bottomAppNav .bottomNavBtn[data-panel="planPanel"]').first();
  await expect(bouton).toBeVisible();
  await bouton.click();
  await expect(page.locator('#planPanel')).toHaveClass(/\bactive\b/);
  expect(erreurs).toEqual([]);
});

test('Premier lancement — secteur vide, restauration accessible, ajout par V261 et redémarrage durable', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String((e && e.message) || e)));
  await page.goto(FIRST_RUN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerNavigation && window.state && document.getElementById('storeRunnerFirstRun'));

  const onboarding = page.locator('#storeRunnerFirstRun');
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole('heading', { name: 'Bienvenue dans Store Runner' })).toBeVisible();
  // V271 : Runner guide ce premier écran (parcours complet : first-run-runner-v271-browser.spec.cjs).
  await expect(onboarding.locator('.srRunner')).toHaveCount(1);
  await expect(onboarding.locator('.srRunnerBubbleTitle')).toHaveText('Je suis Runner, ton copilote terrain.');

  const initial = await page.evaluate(() => ({
    count: state.stores.length,
    demo: state.stores.filter(s => s.source === 'Secteur de démonstration' || /^Ville-Test \d{2}$/.test(String(s.ville || ''))).length,
    marker: JSON.parse(__chefStorage.getItem('store-runner-onboarding-v1') || 'null'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  expect(initial.count, 'aucun faux magasin ne doit survivre au premier rendu').toBe(0);
  expect(initial.demo).toBe(0);
  expect(initial.marker).toMatchObject({ status: 'in-progress', step: 0 });
  expect(initial.overflow).toBeLessThanOrEqual(1);

  // Le logo du premier écran est celui de l'application, servi sous la révision précachée.
  const logo = onboarding.locator('img.srfrLogo');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const logoInfo = await logo.evaluate(img => {
    const r = img.getBoundingClientRect();
    return { src: img.getAttribute('src'), first: img.closest('.srfrHead').firstElementChild === img, w: r.width, h: r.height, bg: getComputedStyle(img).backgroundColor, rev: window.__STORE_RUNNER_BUILD_REV };
  });
  expect(logoInfo.src).toBe('./app-icon.svg?rev=' + logoInfo.rev);
  expect(logoInfo.first, 'le logo reste en tête de carte').toBe(true);
  expect(logoInfo.w).toBe(logoInfo.h);
  expect(logoInfo.bg, 'aucun fond ajouté autour du logo').toBe('rgba(0, 0, 0, 0)');
  await expect(onboarding.getByText('SR', { exact: true })).toHaveCount(0);

  // Le chemin restauration doit être visible dès le premier écran. On le teste dans le
  // même contexte pour ne pas alourdir toute la suite navigateur d'un démarrage complet.
  await onboarding.getByRole('button', { name: 'J’ai déjà une sauvegarde' }).click();
  await expect(onboarding).toBeHidden();
  await expect(page.locator('#importPanel')).toHaveClass(/\bactive\b/);
  expect(await page.evaluate(() => JSON.parse(__chefStorage.getItem('store-runner-onboarding-v1') || 'null').status)).toBe('importing');

  await page.evaluate(() => StoreRunnerNavigation.openFirstRun());
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole('heading', { name: 'Bienvenue dans Store Runner' })).toBeVisible();

  // Aucun champ de saisie : ni clavier virtuel ni zoom automatique iOS dans le guide.
  await onboarding.getByRole('button', { name: 'Commencer' }).click();
  await expect(onboarding.getByRole('heading', { name: 'Ton secteur' })).toBeVisible();
  await expect(onboarding.locator('input:visible, textarea:visible, select:visible')).toHaveCount(0);

  // Le CTA du parcours réutilise bien le composant V261, pas un second formulaire bricolé.
  await onboarding.getByRole('button', { name: 'Ajouter mes magasins' }).click();
  await expect(page.locator('#storeAddDlg')).toBeVisible();
  await page.evaluate(() => StoreRunnerStoreAdd.close());
  await expect(page.locator('#storeAddDlg')).toBeHidden();

  // « Plus tard » ferme le guide pour de bon : il ne revient pas au redémarrage.
  await onboarding.getByRole('button', { name: 'Plus tard' }).click();
  await expect(onboarding).toBeHidden();
  expect(await page.evaluate(() => state.stores.length), 'fermer le guide ne crée aucune donnée').toBe(0);

  await page.evaluate(async () => { if (__chefStorage && __chefStorage.flush) await __chefStorage.flush(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerNavigation && window.state && window.__chefStorage);
  await expect(page.locator('#storeRunnerFirstRun')).toBeHidden();
  const reloaded = await page.evaluate(() => ({
    stores: state.stores.length,
    marker: JSON.parse(__chefStorage.getItem('store-runner-onboarding-v1') || 'null')
  }));
  expect(reloaded.stores).toBe(0);
  expect(reloaded.marker).toMatchObject({ status: 'dismissed' });
  expect(erreurs).toEqual([]);
});
