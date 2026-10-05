const { test, expect, devices } = require('@playwright/test');

// #505 — la minuterie à 0 ms de src/chef-secteur.html (« re-décore » : rendez-vous sur le plan, sauvegarde,
// rendu) s'exécutait pendant l'analyse du document, AVANT boot() : le stockage n'était pas encore ouvert,
// save() levait « Stockage du navigateur indisponible », le rendu était sauté et #errorBox s'affichait.
// Ce spec observe le moment exact où cette étape tourne ; il échoue sur le comportement d'origine.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const MAIN = 'sector_planner_universal_v1';
const strip = ({ defaultBrowserType, ...rest }) => rest;
test.use({ ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Paris', serviceWorkers: 'block' });

async function arm(page, { failSave = false } = {}) {
  await page.addInitScript(({ failSave }) => {
    window.__bootRace = { runs: [] };
    const st = window.setTimeout;
    window.setTimeout = function (fn, delay, ...rest) {
      if (typeof fn === 'function' && delay === 0 && /applyAppointmentsToPlan\(\);save\(\)/.test(Function.prototype.toString.call(fn))) {
        const wrapped = function () {
          // Vrai échec d'écriture au moment de l'étape : save() du moteur de fiabilité lève.
          if (failSave && window.ChefReliability) window.ChefReliability.save = () => { throw new Error('quota simulé'); };
          const box = document.getElementById('errorBox');
          const before = { readyState: document.readyState, storageOpen: window.storage != null, errorShown: !!box && box.style.display === 'block' };
          const result = fn.apply(this, arguments);
          const after = document.getElementById('errorBox');
          window.__bootRace.runs.push({ ...before, errorAfter: !!after && after.style.display === 'block', errorText: after ? after.textContent : '' });
          return result;
        };
        return st.call(this, wrapped, delay, ...rest);
      }
      return st.call(this, fn, delay, ...rest);
    };
  }, { failSave });
}
async function boot(page, options) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await arm(page, options);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerBoot?.settled?.() && window.__bootRace.runs.length > 0, null, { timeout: 30000 });
  return errors;
}

test('l’étape différée du démarrage ne s’exécute qu’après l’ouverture du stockage, sans faux message d’erreur', async ({ page }) => {
  const errors = await boot(page);
  const race = await page.evaluate(() => window.__bootRace.runs);
  expect(race, 'l’étape différée s’exécute une seule fois').toHaveLength(1);
  expect(race[0].storageOpen, 'le stockage est ouvert (boot() a déjà tourné) quand l’étape sauvegarde').toBe(true);
  expect(race[0].errorAfter, 'aucun faux « Stockage du navigateur indisponible » au lancement').toBe(false);
  expect(race[0].errorText).toBe('');
  expect(errors).toEqual([]);
});

test('la première sauvegarde du démarrage aboutit : l’état en mémoire et le stockage durable concordent', async ({ page }) => {
  const errors = await boot(page);
  await page.waitForTimeout(500);
  // Aucune action utilisateur : la seule sauvegarde possible est celle du démarrage.
  const same = await page.evaluate(async main => { await __chefStorage.flush(); return __chefStorage.getItem(main) === JSON.stringify(state); }, MAIN);
  expect(same, 'la normalisation du démarrage est persistée sans attendre une action utilisateur').toBe(true);
  expect(errors).toEqual([]);
});

test('une vraie erreur de sauvegarde reste signalée : l’étape différée ne masque rien', async ({ page }) => {
  const errors = await boot(page, { failSave: true });
  const race = await page.evaluate(() => window.__bootRace.runs);
  expect(race).toHaveLength(1);
  expect(race[0].storageOpen).toBe(true);
  expect(race[0].errorAfter, 'save() qui échoue réellement est montré à l’utilisateur').toBe(true);
  expect(race[0].errorText).toContain('quota simulé');
  expect(errors).toEqual([]);
});
