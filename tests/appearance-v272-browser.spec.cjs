const { test, expect, devices } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { empty } = require('../store-runner-visit-model.js');
const URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const PREF = 'store-runner-appearance-v1', MIRROR = 'store-runner-appearance-boot-v1';
const SHEET = '#runnerAppearanceSheet';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const profiles = [
  ['Android390', { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } }],
  ['Android360', strip(devices['Galaxy S8'])],
  ['iPhone14', strip(devices['iPhone 14'])]
];
test.use({ timezoneId: 'Europe/Paris', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

async function prepare(page, pref) {
  await page.clock.setFixedTime(new Date('2026-09-23T10:00:00+02:00'));
  await page.addInitScript(({ business, pref, keys }) => {
    if (!localStorage.getItem('appearance-v272-fixture')) {
      const store = { id: 'appearance-store', enseigne: 'Darty', ville: 'Ville Test', adresse: '1 rue Test', dept: '69', lat: 45.75, lon: 4.85, active: true, priority: 3, intervalDays: 30, visitMinutes: 60 };
      localStorage.setItem('store-runner-onboarding-v1', JSON.stringify({ version: 1, status: 'complete', step: 4 }));
      localStorage.setItem('sector_planner_universal_v1', JSON.stringify({ schemaVersion: 5,
        profile: { sectorName: 'Secteur Test', baseName: 'Base Test', baseLat: 45.7, baseLon: 4.8, overnight: 'never' },
        settings: { days: ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'], startTime: '08:30', endTime: '18:00', weekDate: '2026-09-21', target: 15, visitMinutes: 60 },
        stores: [store], plan: { Lundi: [], Mardi: [], Mercredi: [store], Jeudi: [], Vendredi: [], Samedi: [] },
        visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {}, businessV2: business
      }));
      if (pref) for (const key of keys) localStorage.setItem(key, JSON.stringify(pref));
      localStorage.setItem('appearance-v272-fixture', '1');
    }
    window.__appearanceEffects = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      const animation = animate.call(this, frames, options);
      if (options?.id?.startsWith('runner-')) __appearanceEffects.push({ animation, frames, options, target: this });
      return animation;
    };
  }, { business: empty(), pref, keys: [PREF, MIRROR] });
}
async function ready(page) {
  await page.waitForFunction(() => window.StoreRunnerAppearance && window.StoreRunnerBoot?.settled() && document.querySelector('#homeRunnerV270 .srRunner'));
  await page.waitForLoadState('load');
  // The old core enriches an imported fixture at boot (hours, capacities). Persist that
  // normalization through its owner before comparing business bytes across reloads.
  await page.evaluate(async () => { save(); await __chefStorage.flush(); });
  await page.locator('#homeRunnerV270 .srRunner').evaluate(el => el.getAnimations().forEach(a => a.finish()));
}
async function boot(page, pref) {
  await prepare(page, pref);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await ready(page);
}
const business = page => page.evaluate(() => JSON.stringify({ state, main: __chefStorage.getItem('sector_planner_universal_v1'), archive: __chefStorage.getItem('chef_sector_plan_archive_v1') }));
async function attrs(page, mode, accent, theme = mode) {
  await expect(page.locator('html')).toHaveAttribute('data-sr-mode', mode);
  await expect(page.locator('html')).toHaveAttribute('data-sr-accent', accent);
  await expect(page.locator('html')).toHaveAttribute('data-sr-theme', theme);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', theme === 'dark' ? '#151e2c' : '#f2f5fa');
}
async function shot(page, name) {
  if (!process.env.APPEARANCE_SHOTS_DIR) return;
  fs.mkdirSync(process.env.APPEARANCE_SHOTS_DIR, { recursive: true });
  // Screenshots show the stable screen; transient install toasts remain unchanged in the app.
  await page.addStyleTag({content:'#storeRunnerUpdateBanner:not([data-sticky]){display:none!important}aside[role="status"]{display:none!important}'});
  await page.screenshot({ path: path.join(process.env.APPEARANCE_SHOTS_DIR, name + '.png') });
}
async function contrast(page, selector = SHEET) {
  return page.locator(selector).evaluate(sheet => {
    const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
    const mix = (fg, bg) => { const a = fg[3] ?? 1; return [0,1,2].map(i => fg[i] * a + bg[i] * (1-a)).concat(1); };
    const background = el => {
      const chain = []; for (let node = el; node; node = node.parentElement) chain.unshift(node);
      return chain.reduce((color, node) => mix(rgba(getComputedStyle(node).backgroundColor), color), [255,255,255,1]);
    };
    const luminance = rgb => rgb.slice(0,3).map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((s,v,i) => s+v*[.2126,.7152,.0722][i], 0);
    const nodes = [sheet,...sheet.querySelectorAll('h2,h3,p,button,label,.srAppearancePreviewCopy b,.srAppearancePreviewCopy span,.srRunnerBubbleTitle,.srRunnerBubbleText')].filter(el => el.innerText.trim() && el.getBoundingClientRect().height && !el.disabled);
    return nodes.map(el => { const bg = background(el), fg = mix(rgba(getComputedStyle(el).color), bg), a = luminance(fg), b = luminance(bg); return { text: el.innerText, ratio: (Math.max(a,b)+.05)/(Math.min(a,b)+.05) }; });
  });
}

for (const [name, profile] of profiles) test.describe(name, () => {
  test.use(profile);
  test('tap Runner : réaction courte puis une seule sheet, accès Plus identique, fermeture propre', async ({ page }) => {
    await boot(page);
    const original = await business(page);
    if (name === 'Android390') await shot(page, 'android390-light-blue-home');
    await expect(page.locator('#homeRunnerAppearanceButton')).toHaveAccessibleName(/Runner/);
    await page.locator('#homeRunnerAppearanceButton').tap();
    await expect(page.locator(SHEET)).toBeVisible();
    const reaction = await page.evaluate(() => __appearanceEffects.filter(e => e.options.id === 'runner-react').map(e => ({ duration: e.options.duration, iterations: e.options.iterations, state: e.target.closest('.srRunner')?.dataset.state })));
    expect(reaction).toEqual([{ duration: 240, iterations: 1, state: 'neutral' }]);
    await expect(page.locator('#runnerAppearanceTitle')).toHaveText('Runner');
    await expect(page.locator('#runnerAppearancePreview .srRunner')).toHaveCount(1);
    expect(await page.locator(SHEET).evaluate(el => ({ width: el.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth-innerWidth, apply: /Appliquer|Personnalité/.test(el.innerText) }))).toMatchObject({ overflow: 0, apply: false });
    for (const button of await page.locator(SHEET + ' button').all()) {
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('[data-appearance-close]').tap();
    await expect(page.locator(SHEET)).not.toBeVisible();
    await expect(page.locator('#runnerAppearancePreview .srRunner')).toHaveCount(0);
    await page.locator('[data-more]').tap();
    await page.locator('[data-runner-appearance]').tap();
    await expect(page.locator(SHEET)).toBeVisible();
    await expect(page.locator(SHEET)).toHaveCount(1);
    await page.evaluate(() => StoreRunnerAppearance.close());
    expect(await business(page)).toBe(original);
    if (name === 'Android390') { await page.evaluate(() => StoreRunnerAppearance.open()); await shot(page, 'android390-light-blue-sheet'); }
  });

  test('clair/sombre/système et tous les accents : immédiat, AA, durable après reload, réinitialisation', async ({ page, browserName }) => {
    test.setTimeout(browserName === 'webkit' ? 120000 : 60000); // 16 real taps and three complete reloads; Windows WebKit renders more slowly.
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await boot(page);
    const original = await business(page);
    await page.locator('#homeRunnerAppearanceButton').tap();
    const colors = new Set();
    for (const mode of ['light','dark']) for (const accent of ['blue','indigo','teal','rose']) {
      await page.locator(`[data-appearance-mode="${mode}"]`).tap();
      await page.locator(`[data-appearance-accent="${accent}"]`).tap();
      await attrs(page, mode, accent);
      await expect(page.locator(`[data-appearance-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`[data-appearance-accent="${accent}"]`)).toHaveAttribute('aria-pressed', 'true');
      const ratios = await contrast(page);
      expect(ratios.length).toBeGreaterThanOrEqual(10);
      for (const value of ratios) expect(value.ratio, `${mode}/${accent}: ${value.text}`).toBeGreaterThanOrEqual(4.5);
      colors.add(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--sr-accent-fill').trim()));
      await page.evaluate(() => __chefStorage.flush());
      const persisted = await page.evaluate(({ pref, mirror }) => ({ durable: JSON.parse(__chefStorage.getItem(pref)), mirror: JSON.parse(localStorage.getItem(mirror)) }), { pref: PREF, mirror: MIRROR });
      expect(persisted).toEqual({ durable: { mode, accent }, mirror: { mode, accent } });
    }
    expect(colors.size).toBeGreaterThanOrEqual(4);
    if (name === 'Android360') await shot(page, 'android360-dark-rose-sheet');
    if (name === 'iPhone14') await shot(page, 'iphone14-dark-rose-sheet');
    await page.locator('[data-appearance-mode="system"]').tap();
    await attrs(page, 'system', 'rose', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await attrs(page, 'system', 'rose', 'dark');
    await page.evaluate(() => __chefStorage.flush());
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
    await attrs(page, 'system', 'rose', 'dark');
    await page.locator('#homeRunnerAppearanceButton').tap();
    await page.locator('[data-appearance-reset]').tap();
    await attrs(page, 'light', 'blue');
    expect(await page.evaluate(() => StoreRunnerAppearance.get())).toEqual({ mode: 'light', accent: 'blue' });
    await page.evaluate(() => __chefStorage.flush());
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
    await attrs(page, 'light', 'blue');
    expect(await business(page)).toBe(original);
  });

  test('navigation et Runner : couleurs sémantiques prioritaires, réduction des animations', async ({ page }) => {
    await boot(page);
    const original = await business(page);
    const result = await page.evaluate(async () => {
      const slot = document.createElement('div'); document.body.append(slot);
      const runner = Runner.mount(slot, { decorative: true, motion: 'off' });
      const svg = runner.el.querySelector('.rnArt'), colors = {}, reactions = [];
      const sample = () => ['--rn-accent','--rn-tint','--rn-line','--rn-title'].map(key => getComputedStyle(runner.el).getPropertyValue(key).trim());
      for (const state of ['analyzing','alert','success']) {
        runner.setState(state); colors[state] = sample();
        for (const accent of ['blue','indigo','teal','rose']) {
          await StoreRunnerAppearance.set({ mode: 'dark', accent });
          if (JSON.stringify(sample()) !== JSON.stringify(colors[state])) throw Error('semantic color changed: '+state+'/'+accent);
          reactions.push(await runner.react());
          if (runner.getState() !== state) throw Error('reaction superseded '+state);
        }
      }
      const sameSvg = svg === runner.el.querySelector('.rnArt'); runner.destroy(); slot.remove();
      return { colors, reactions, sameSvg };
    });
    expect(result.sameSvg).toBe(true);
    expect(result.reactions.every(value => value === false)).toBe(true);
    expect(new Set(Object.values(result.colors).map(JSON.stringify)).size).toBe(3);
    for (const panel of ['planPanel','storesPanel','homePanel']) {
      await page.evaluate(panel => goTab(panel), panel);
      await expect(page.locator('#'+panel)).toBeVisible();
      await attrs(page, 'dark', 'rose');
      expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      if (panel === 'storesPanel') expect(await page.evaluate(() => {
        const probe=document.createElement('span');probe.style.cssText='color:var(--brand);background:var(--brandSoft)';document.body.append(probe);
        const expected=getComputedStyle(probe), selected=getComputedStyle(document.querySelector('#storeChannelTabs [aria-pressed="true"]'));
        const matches=selected.color===expected.color&&selected.backgroundColor===expected.backgroundColor;probe.remove();return matches;
      }), 'the selected store channel follows the active theme and accent').toBe(true);
      if (name === 'Android390') await shot(page, 'android390-dark-rose-'+{planPanel:'planning',storesPanel:'stores',homePanel:'home'}[panel]);
    }
    await page.evaluate(() => toggleAssistant());
    await expect(page.locator('#srAssistantRunner .srRunner')).toBeVisible();
    await attrs(page, 'dark', 'rose');
    if (name === 'Android390') await shot(page, 'android390-dark-rose-assistant');
    await page.evaluate(() => toggleAssistant());
    await page.locator('[data-more]').tap();
    await attrs(page, 'dark', 'rose');
    if (name === 'Android390') await shot(page, 'android390-dark-rose-plus');
    await page.locator('.moreClose').tap();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const count = await page.evaluate(() => __appearanceEffects.filter(e => e.options.id === 'runner-react').length);
    await page.locator('#homeRunnerAppearanceButton').tap();
    await expect(page.locator(SHEET)).toBeVisible();
    expect(await page.evaluate(() => __appearanceEffects.filter(e => e.options.id === 'runner-react').length)).toBe(count);
    expect(await page.locator('#runnerAppearancePreview .srRunner').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await business(page)).toBe(original);
  });

  test('réaction interrompue : états, destruction, cycle de page et navigation terminent les promesses', async ({ page }) => {
    await boot(page);
    const checks = await page.evaluate(async () => {
      const results = [];
      for (const action of ['analyzing','alert','success','destroy','pagehide']) {
        const slot = document.createElement('div'); document.body.append(slot);
        const runner = Runner.mount(slot, { decorative:true });
        const promise = runner.react();
        if (action === 'destroy') runner.destroy();
        else if (action === 'pagehide') dispatchEvent(new PageTransitionEvent('pagehide'));
        else runner.setState(action);
        const resolved = await promise;
        results.push({ action, resolved, effects: runner.el.getAnimations({subtree:true}).filter(a => a.id === 'runner-react').length });
        runner.destroy(); slot.remove();
        if (action === 'pagehide') dispatchEvent(new PageTransitionEvent('pageshow'));
      }
      return results;
    });
    expect(checks).toEqual(['analyzing','alert','success','destroy','pagehide'].map(action => ({action,resolved:false,effects:0})));
    expect(await page.evaluate(async () => {
      const slot = document.createElement('div'); document.body.append(slot);
      const runner = Runner.mount(slot,{decorative:true});
      const interrupted = runner.react(); dispatchEvent(new PageTransitionEvent('pagehide'));
      await interrupted; dispatchEvent(new PageTransitionEvent('pageshow'));
      const resumed = await runner.react(); runner.destroy(); slot.remove(); return resumed;
    })).toBe(true);
    // The same event task leaves Home before its reaction completes: a stale callback must not open the sheet.
    await page.evaluate(() => { document.querySelector('#homeRunnerAppearanceButton').click(); goTab('storesPanel'); });
    await expect(page.locator('#storesPanel')).toBeVisible();
    await page.waitForTimeout(350);
    await expect(page.locator(SHEET)).not.toBeVisible();
    expect(await page.evaluate(() => __appearanceEffects.filter(e => e.options.id === 'runner-react' && !['idle','finished'].includes(e.animation.playState)).length)).toBe(0);
    await page.emulateMedia({reducedMotion:'reduce'});
    for (const overlay of ['assistant','more']) {
      await page.evaluate(() => goTab('homePanel'));
      await expect(page.locator('#homeRunnerAppearanceButton')).toBeVisible();
      await page.evaluate(overlay => {
        document.querySelector('#homeRunnerAppearanceButton').click();
        if(overlay==='assistant')toggleAssistant();else document.querySelector('[data-more]').click();
      },overlay);
      await page.waitForTimeout(100);
      await expect(page.locator(SHEET)).not.toBeVisible();
      if(overlay==='assistant')await page.evaluate(() => toggleAssistant());else await page.locator('.moreClose').tap();
    }
  });
});

test.describe('boot et PWA', () => {
  test.use({ ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  test('aucun flash : shell puis premier HTML runtime sombre, miroir périmé réconcilié par IndexedDB', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepare(page, { mode: 'dark', accent: 'teal' });
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; }), entry = new Promise(resolve => { entered = resolve; });
    await page.route('**/src/chef-secteur.html?*', async route => { entered(); await gate; await route.continue(); });
    const navigation = page.goto(URL, { waitUntil: 'domcontentloaded' });
    await entry;
    await attrs(page, 'dark', 'teal');
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe('dark');
    release(); await navigation; await ready(page);
    await attrs(page, 'dark', 'teal');
    await page.unroute('**/src/chef-secteur.html?*');
    await page.evaluate(async ({ pref, mirror }) => { __chefStorage.setItem(pref, JSON.stringify({ mode:'dark', accent:'indigo' })); await __chefStorage.flush(); localStorage.setItem(mirror, JSON.stringify({mode:'light',accent:'blue'})); }, {pref:PREF,mirror:MIRROR});
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
    await attrs(page, 'dark', 'indigo');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), MIRROR)).toEqual({mode:'dark',accent:'indigo'});
  });
  test('préférence invalide bornée sans bloquer la sheet', async ({ page }) => {
    await page.emulateMedia({ reducedMotion:'reduce' });
    await boot(page, { mode: 'night', accent: '#f00', personality:'loud' });
    await attrs(page, 'light', 'blue');
    await page.evaluate(() => StoreRunnerAppearance.open());
    await expect(page.locator(SHEET)).toBeVisible();
    expect(await page.evaluate(() => StoreRunnerAppearance.get())).toEqual({ mode:'light',accent:'blue' });
    // Refused durable writes are explicitly announced; appearance remains immediately usable.
    const result = await page.evaluate(async () => {
      const flush = __chefStorage.flush;
      __chefStorage.flush = () => Promise.reject(new Error('quota test'));
      const result = await StoreRunnerAppearance.set({mode:'dark',accent:'teal'});
      __chefStorage.flush = flush;
      return result;
    });
    expect(result).toBe(false);
    await attrs(page, 'dark','teal');
    await expect(page.locator('[data-appearance-status]')).toHaveText(/enregistrement a échoué/);
  });
  test('Runner et Assistant : texte AA pour chaque état, mode et accent', async ({page, browserName}) => {
    test.setTimeout(browserName === 'webkit' ? 120000 : 60000);
    await page.emulateMedia({reducedMotion:'reduce'}); await boot(page);
    const original = await business(page);
    await page.evaluate(() => toggleAssistant());
    for(const mode of ['light','dark']) for(const accent of ['blue','indigo','teal','rose']) {
      await page.evaluate(pref => StoreRunnerAppearance.set(pref),{mode,accent});
      for(const variant of ['bubble','panel']) for(const state of ['neutral','analyzing','alert','success']) {
        await page.evaluate(({variant,state}) => {
          const slot=document.createElement('div');slot.id='appearanceContrastProbe';document.querySelector('#assistantMsgs').append(slot);
          window.__contrastRunner=Runner.mount(slot,{variant,state,motion:'off',decorative:true});
          __contrastRunner.showMessage('Signal essentiel',{title:'État Runner',silent:true});
        },{variant,state});
        for(const value of await contrast(page,'#appearanceContrastProbe .srRunnerBubble')) expect(value.ratio,`${mode}/${accent}/${variant}/${state}: ${value.text}`).toBeGreaterThanOrEqual(4.5);
        await page.evaluate(() => {const slot=__contrastRunner.el.parentNode;__contrastRunner.destroy();slot.remove()});
      }
      for(const semantic of ['ok','bad']) {
        await page.locator('#assistantAIStatus').evaluate((el, semantic) => {el.className='ai-status '+semantic;el.textContent=semantic==='ok'?'Connexion prête':'Erreur de connexion'},semantic);
        for(const value of await contrast(page,'#assistantAIStatus')) expect(value.ratio,`${mode}/${accent}/Assistant ${semantic}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(await business(page)).toBe(original);
  });
  test('PWA réelle : apparition hors ligne, préférence conservée, modification hors ligne et reload', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'service worker du harnais validé dans Chromium ; WebKit couvre interface et stockage');
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion:'reduce' });
    await boot(page);
    await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(() => StoreRunnerAppearance.set({ mode:'dark',accent:'indigo' }));
    await context.setOffline(true);
    await page.reload({ waitUntil:'domcontentloaded' }); await ready(page);
    await attrs(page,'dark','indigo');
    await page.locator('#homeRunnerAppearanceButton').tap();
    await expect(page.locator(SHEET)).toBeVisible();
    await page.locator('[data-appearance-accent="teal"]').tap();
    await page.evaluate(() => __chefStorage.flush());
    await page.reload({waitUntil:'domcontentloaded'}); await ready(page);
    await attrs(page,'dark','teal');
    await context.setOffline(false);
  });
});
