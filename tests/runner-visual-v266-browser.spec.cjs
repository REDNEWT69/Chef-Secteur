const { test, expect } = require('@playwright/test');

// Runner Visual System V1 — vérifié dans un vrai Chromium, profil Android puis iPhone, 390 px.
// 1. dans la vraie application : Runner est présent mais dormant, il n'écrit aucune donnée et
//    sa feuille de style n'est pas altérée par celle de l'application ;
// 2. sur la page d'aperçu de test (jamais servie par l'app) : états, bulles, accessibilité,
//    mouvement borné, mode réduit d'animations, aucun défilement horizontal.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const PREVIEW_URL = new URL('tests/fixtures/runner-visual-preview.html', APP_URL).href;
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const STATES = ['neutral', 'analyzing', 'alert', 'success'];

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function bootApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String((error && error.message) || error)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.Runner && document.querySelector('#bottomAppNav[data-v2="1"]'));
  return errors;
}

/* Page d'aperçu vide de ses démonstrations : chaque test monte ce dont il a besoin. */
async function openPreview(page) {
  await page.addInitScript(() => {
    window.__timers = { interval: 0, timeout: 0 };
    const si = window.setInterval, st = window.setTimeout;
    window.setInterval = function () { window.__timers.interval++; return si.apply(this, arguments); };
    window.setTimeout = function () { window.__timers.timeout++; return st.apply(this, arguments); };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(String((error && error.message) || error)));
  await page.goto(PREVIEW_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Runner && document.querySelectorAll('.srRunner').length >= 7);
  await page.evaluate(() => {
    document.querySelectorAll('.srRunner').forEach(node => node.remove());
    window.Runner.mounted();
    window.__host = document.createElement('div');
    window.__host.id = 'testHost';
    window.__host.style.cssText = 'padding:16px';
    document.body.appendChild(window.__host);
  });
  return errors;
}

test('démarrage — Runner est présent mais dormant, il ne crée ni nœud, ni style, ni donnée', async ({ page }) => {
  const errors = await bootApp(page);
  const dormant = await page.evaluate(() => ({
    sameObject: window.Runner === window.StoreRunnerRunner,
    mounted: window.Runner.mounted(),
    nodes: document.querySelectorAll('.srRunner,[data-sr-runner]').length,
    style: !!document.getElementById('srRunnerCss'),
    states: Array.from(window.Runner.STATES),
    appliedWithoutInstance: [window.Runner.setState('alert'), window.Runner.showMessage('x'), window.Runner.reset()]
  }));
  expect(dormant).toEqual({
    sameObject: true, mounted: 0, nodes: 0, style: false,
    states: ['neutral', 'analyzing', 'alert', 'success'],
    appliedWithoutInstance: [false, false, false]
  });
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.initiatorType === 'script').map(entry => new URL(entry.name).pathname.split('/').pop()));
  expect(loaded.filter(name => name === 'runner-visual.js'), 'chargé une seule fois').toEqual(['runner-visual.js']);
  expect(errors).toEqual([]);
});

for (const [platform, userAgent] of [['Android', ANDROID_UA], ['iPhone', IPHONE_UA]]) {
  test.describe(platform, () => {
    test.use({ userAgent });

    test('dans l’application — Runner n’écrit aucune donnée et garde son style à 390 px', async ({ page }, testInfo) => {
      const errors = await bootApp(page);
      const before = await page.evaluate(() => ({
        state: JSON.stringify(window.state),
        keys: Object.keys(localStorage).sort(),
        storage: JSON.stringify(Object.keys(window.__chefStorage || {}).sort())
      }));
      await page.evaluate(() => {
        const host = document.createElement('div');
        host.id = 'runnerAppHost';
        host.style.cssText = 'position:fixed;left:16px;right:16px;bottom:96px;z-index:2147483000';
        document.body.appendChild(host);
        const inst = window.Runner.mount(host, { state: 'analyzing', size: 'md', title: 'Runner', message: 'Je vérifie les contraintes, les P1 et les temps de trajet…' });
        window.Runner.setState('alert', { message: 'Schmidt Bourgoin ne tient pas avec une arrivée stricte à 10h30.', title: 'Attention' });
        window.Runner.setState('success', { message: 'Ta tournée est optimisée.', resetAfter: 1500 });
        window.Runner.reset();
        window.Runner.setState('alert', { message: 'Schmidt Bourgoin ne tient pas avec une arrivée stricte à 10h30.', title: 'Attention' });
        window.__runnerInst = inst;
        return null;
      });
      /* L'animation d'entrée (≈ 0,4 s) joue un scale : on mesure l'état posé, pas le mouvement. */
      await page.waitForTimeout(700);
      const measures = await page.evaluate(() => {
        const inst = window.__runnerInst;
        const figure = inst.el.querySelector('.srRunnerFigure').getBoundingClientRect();
        const bubble = inst.el.querySelector('.srRunnerBubble');
        const text = getComputedStyle(inst.el.querySelector('.srRunnerBubbleText'));
        const title = getComputedStyle(inst.el.querySelector('.srRunnerBubbleTitle'));
        const box = bubble.getBoundingClientRect();
        return {
          figureWidth: Math.round(figure.width), figureHeight: Math.round(figure.height),
          bubbleRight: Math.round(box.right), bubbleLeft: Math.round(box.left),
          font: text.fontSize, titleFont: title.fontSize, titleWeight: title.fontWeight,
          accent: getComputedStyle(bubble).borderLeftColor, instance: inst.getState()
        };
      });
      await testInfo.attach('runner-dans-application-' + platform + '.png', { body: await page.screenshot(), contentType: 'image/png' });
      expect(measures.figureWidth).toBe(88);
      expect(measures.figureHeight).toBe(Math.round(88 * 280 / 240));
      expect(measures.bubbleLeft).toBeGreaterThanOrEqual(16);
      expect(measures.bubbleRight, 'la bulle reste dans l’écran 390 px').toBeLessThanOrEqual(390 - 16 + 1);
      expect(measures.font).toBe('14px');
      expect(measures.titleFont).toBe('14.5px');
      expect(Number(measures.titleWeight)).toBeGreaterThanOrEqual(700);
      expect(measures.accent, 'accent ambre en alerte').toBe('rgb(245, 163, 15)');
      expect(measures.instance).toBe('alert');
      expect(await overflowX(page)).toBeLessThanOrEqual(1);

      const after = await page.evaluate(() => {
        window.Runner.unmount(document.getElementById('runnerAppHost'));
        document.getElementById('runnerAppHost').remove();
        return {
          state: JSON.stringify(window.state),
          keys: Object.keys(localStorage).sort(),
          storage: JSON.stringify(Object.keys(window.__chefStorage || {}).sort()),
          mounted: window.Runner.mounted(),
          nodes: document.querySelectorAll('.srRunner').length
        };
      });
      expect(after.state, 'state de l’application strictement inchangé').toBe(before.state);
      expect(after.keys, 'aucune clé de stockage créée').toEqual(before.keys);
      expect(after.storage).toBe(before.storage);
      expect(after.mounted).toBe(0);
      expect(after.nodes).toBe(0);
      expect(errors).toEqual([]);
    });

    test('états — un attribut, un seul calque visible, nom accessible, événement unique', async ({ page }) => {
      const errors = await openPreview(page);
      const result = await page.evaluate(async () => {
        const R = window.Runner;
        const inst = R.mount(window.__host, { size: 'md' });
        const events = [];
        inst.el.addEventListener('store-runner:runner-state', e => events.push(e.detail.state + '<' + e.detail.previous));
        const rows = [];
        for (const state of R.STATES) {
          R.setState(state);
          await new Promise(resolve => setTimeout(resolve, 260));
          const visible = Array.from(inst.el.querySelectorAll('.rnLayer')).filter(n => getComputedStyle(n).opacity === '1').map(n => n.getAttribute('data-rn'));
          const hidden = Array.from(inst.el.querySelectorAll('.rnLayer')).filter(n => getComputedStyle(n).opacity === '0').map(n => n.getAttribute('data-rn'));
          rows.push({
            state, attr: inst.el.getAttribute('data-state'), got: inst.getState(),
            label: inst.el.querySelector('.srRunnerFigure').getAttribute('aria-label'),
            visible: Array.from(new Set(visible)), foreign: Array.from(new Set(hidden)).filter(x => x === state)
          });
        }
        const before = events.length;
        R.setState('success');
        const sameState = events.length - before;
        return { rows, events, sameState, invalid: [R.setState('thinking'), R.setState(''), R.setState(undefined)], after: R.getState() };
      });
      expect(result.rows.map(row => [row.state, row.attr, row.got])).toEqual(STATES.map(s => [s, s, s]));
      for (const row of result.rows) {
        expect(row.visible, 'seul le calque de l’état est visible : ' + row.state).toEqual([row.state]);
        expect(row.foreign).toEqual([]);
      }
      expect(result.rows.map(row => row.label)).toEqual([
        'Runner, copilote terrain : en attente',
        'Runner, copilote terrain : il réfléchit',
        'Runner, copilote terrain : une contrainte détectée',
        'Runner, copilote terrain : tout est ok'
      ]);
      expect(result.events).toEqual(['analyzing<neutral', 'alert<analyzing', 'success<alert']);
      expect(result.sameState, 'le même état ne rejoue ni événement ni animation').toBe(0);
      expect(result.invalid, 'un état inconnu est refusé sans lever').toEqual([false, false, false]);
      expect(result.after).toBe('success');
      expect(errors).toEqual([]);
    });

    test('bulles — texte inerte, annonce lecteur d’écran, durée, retour automatique', async ({ page }) => {
      const errors = await openPreview(page);
      const hostile = '<img src=x onerror="window.__xss=1"> Électro <b>Dépôt</b>';
      const one = await page.evaluate(async hostile => {
        const inst = window.Runner.mount(window.__host, { size: 'md' });
        window.Runner.showMessage({ title: '<i>Alerte</i>', text: hostile }, { state: 'alert' });
        await new Promise(resolve => setTimeout(resolve, 150));
        const bubble = inst.el.querySelector('.srRunnerBubble');
        const live = inst.el.querySelector('.srRunnerLive');
        return {
          title: inst.el.querySelector('.srRunnerBubbleTitle').textContent,
          text: inst.el.querySelector('.srRunnerBubbleText').textContent,
          injected: inst.el.querySelectorAll('.srRunnerBubbleTitle *,.srRunnerBubbleText *').length + (bubble.children.length === 2 ? 0 : 1),
          xss: window.__xss === undefined,
          bubbleHidden: bubble.hidden, ariaHidden: bubble.getAttribute('aria-hidden'),
          live: live.textContent, liveMode: live.getAttribute('aria-live'), role: live.getAttribute('role'),
          state: inst.getState()
        };
      }, hostile);
      expect(one.title).toBe('<i>Alerte</i>');
      expect(one.text).toBe(hostile);
      expect(one.injected, 'aucun balisage interprété').toBe(0);
      expect(one.xss).toBe(true);
      expect(one.bubbleHidden).toBe(false);
      expect(one.ariaHidden, 'la bulle visuelle n’est pas lue deux fois').toBe('true');
      expect(one.role).toBe('status');
      expect(one.live).toBe('<i>Alerte</i>. ' + hostile);
      expect(one.liveMode, 'une alerte est annoncée sans attendre').toBe('assertive');
      expect(one.state, 'l’état demandé par la bulle est appliqué').toBe('alert');

      const timed = await page.evaluate(async () => {
        const R = window.Runner;
        const inst = R.mount(window.__host, { size: 'sm' });
        R.setState('analyzing');
        R.showMessage('Durée courte', { duration: 1500 });
        const shown = !inst.el.querySelector('.srRunnerBubble').hidden;
        await new Promise(resolve => setTimeout(resolve, 1750));
        const hiddenAfter = inst.el.querySelector('.srRunnerBubble').hidden;
        const emptied = inst.el.querySelector('.srRunnerBubbleText').textContent === '';
        R.setState('success', { message: 'Appliqué', title: 'Parfait !', resetAfter: 1500 });
        const successNow = inst.getState();
        await new Promise(resolve => setTimeout(resolve, 1750));
        return { shown, hiddenAfter, emptied, successNow, back: inst.getState(), bubbleAfter: inst.el.querySelector('.srRunnerBubble').hidden, empty: [R.showMessage(''), R.showMessage({ title: 'seul' })], liveAfter: inst.el.querySelector('.srRunnerLive').textContent };
      });
      expect(timed).toMatchObject({ shown: true, hiddenAfter: true, emptied: true, successNow: 'success', back: 'neutral', bubbleAfter: true });
      expect(timed.empty, 'une bulle sans texte n’existe pas').toEqual([false, false]);
      expect(timed.liveAfter).toBe('');
      expect(errors).toEqual([]);
    });

    test('390 px — aucune bulle ne déborde, aucun débordement horizontal, rien de focusable', async ({ page }, testInfo) => {
      await page.goto(PREVIEW_URL, { waitUntil: 'load' });
      await page.waitForFunction(() => window.Runner && document.querySelectorAll('.srRunner').length >= 7);
      await testInfo.attach('runner-apercu-390-' + platform + '.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.srRunner')).map(host => {
        const card = host.closest('.card').getBoundingClientRect();
        const rect = host.getBoundingClientRect();
        const bubble = host.querySelector('.srRunnerBubble');
        const box = bubble && !bubble.hidden ? bubble.getBoundingClientRect() : null;
        const figure = host.querySelector('.srRunnerFigure');
        return {
          insideCard: rect.left >= card.left - 0.5 && rect.right <= card.right + 0.5,
          insideViewport: rect.right <= window.innerWidth + 0.5 && rect.left >= -0.5,
          bubbleInside: box ? box.right <= card.right + 0.5 && box.left >= card.left - 0.5 : true,
          bubbleFont: box ? parseFloat(getComputedStyle(bubble.querySelector('.srRunnerBubbleText')).fontSize) : 14,
          focusable: host.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').length,
          figurePointer: getComputedStyle(figure).pointerEvents,
          figureAria: figure.getAttribute('aria-hidden') === 'true' || figure.getAttribute('role') === 'img'
        };
      }));
      expect(rows.length).toBeGreaterThanOrEqual(7);
      for (const row of rows) {
        expect(row.insideCard).toBe(true);
        expect(row.insideViewport).toBe(true);
        expect(row.bubbleInside).toBe(true);
        expect(row.bubbleFont).toBeGreaterThanOrEqual(14);
        expect(row.focusable, 'Runner est décoratif : il ne prend jamais le focus ni un tap').toBe(0);
        expect(row.figurePointer).toBe('none');
        expect(row.figureAria).toBe(true);
      }
    });

    test('dessin — le SVG tient dans son cadre pour chaque taille et reste léger', async ({ page }) => {
      const errors = await openPreview(page);
      const result = await page.evaluate(() => {
        const R = window.Runner;
        const out = { sizes: [], bbox: null, nodes: 0, bytes: 0, gradientIds: 0, uniqueIds: true };
        const a = R.mount(window.__host, { size: 'sm' });
        const b = R.mount(window.__host, { size: 'md' });
        for (const [name, want] of [['sm', 56], ['md', 88], ['lg', 128], ['xl', 176], [200, 200], [10, 32], [9999, 320], ['inconnu', 88], [undefined, 88], [-4, 88]]) {
          const inst = R.mount(window.__host, { size: name });
          const f = inst.el.querySelector('.srRunnerFigure').getBoundingClientRect();
          out.sizes.push([String(name), want, Math.round(f.width), Math.round(f.height / f.width * 240)]);
          R.unmount(inst);
        }
        const svg = a.el.querySelector('svg');
        const box = svg.getBBox();
        out.bbox = { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
        out.nodes = svg.querySelectorAll('*').length;
        out.bytes = new TextEncoder().encode(svg.outerHTML).length;
        const ids = Array.from(document.querySelectorAll('.srRunner [id]')).map(n => n.id);
        out.gradientIds = ids.length;
        out.uniqueIds = new Set(ids).size === ids.length;
        out.twoInstances = [a.el.querySelector('[id]').id, b.el.querySelector('[id]').id];
        return out;
      });
      for (const [name, want, width, ratio] of result.sizes) {
        expect(width, 'taille ' + name).toBe(want);
        expect(ratio, 'ratio ' + name).toBe(280);
      }
      expect(result.bbox.x).toBeGreaterThanOrEqual(0);
      expect(result.bbox.y).toBeGreaterThanOrEqual(0);
      expect(result.bbox.right, 'dessin dans le cadre horizontal').toBeLessThanOrEqual(240);
      expect(result.bbox.bottom, 'dessin dans le cadre vertical').toBeLessThanOrEqual(280);
      expect(result.nodes, 'dessin léger (153 éléments mesurés)').toBeLessThan(200);
      expect(result.bytes, 'dessin sous 12 Ko par instance (11,2 Ko mesurés)').toBeLessThan(12 * 1024);
      expect(result.uniqueIds, 'identifiants de dégradés uniques entre instances').toBe(true);
      expect(result.twoInstances[0]).not.toBe(result.twoInstances[1]);
      expect(errors).toEqual([]);
    });

    test('Runner principal — dernier monté encore présent, oubli propre quand l’écran le retire', async ({ page }) => {
      const errors = await openPreview(page);
      const result = await page.evaluate(() => {
        const R = window.Runner;
        const mk = id => { const d = document.createElement('div'); d.id = id; window.__host.appendChild(d); return d };
        const c1 = mk('c1'), c2 = mk('c2');
        const a = R.mount(c1, { size: 'sm' }), b = R.mount(c2, { size: 'sm' });
        const out = { mounted: R.mounted(), bad: [R.mount('#absent'), R.mount(null), R.mount(42), R.mount('###')] };
        R.setState('alert');
        out.targets = [a.getState(), b.getState()];
        c2.remove();               // un rendu de l'écran hôte retire le conteneur
        out.afterRemoval = [R.getState(), R.mounted()];
        R.setState('success');
        out.fallback = [a.getState(), b.getState()];
        out.unmountByContainer = R.unmount(c1);
        out.afterUnmount = [R.mounted(), R.getState(), R.setState('alert'), a.setState('alert'), a.showMessage('x'), a.destroy(), c1.querySelector('.srRunner') === null];
        return out;
      });
      expect(result.mounted).toBe(2);
      expect(result.bad, 'conteneur introuvable : null, jamais d’exception').toEqual([null, null, null, null]);
      expect(result.targets, 'l’API globale vise le dernier monté').toEqual(['neutral', 'alert']);
      expect(result.afterRemoval).toEqual(['neutral', 1]);
      expect(result.fallback, 'le Runner retiré est oublié, le précédent reprend la main').toEqual(['success', 'alert']);
      expect(result.unmountByContainer).toBe(true);
      expect(result.afterUnmount).toEqual([0, null, false, false, false, false, true]);
      expect(errors).toEqual([]);
    });

    test('mouvement — rien ne bouge au repos, une seule boucle bornée, jouée seulement en analyse', async ({ page }) => {
      const errors = await openPreview(page);
      const result = await page.evaluate(async () => {
        const R = window.Runner;
        const inst = R.mount(window.__host, { size: 'md' });
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const anims = () => inst.el.getAnimations({ subtree: true }).filter(a => a.playState !== 'finished' && a.playState !== 'idle');
        const info = list => list.map(a => ({ name: a.animationName, iterations: a.effect.getComputedTiming().iterations }));
        const out = {};
        await wait(1200);
        out.restNeutral = anims().length;
        R.setState('analyzing');
        await wait(100);
        out.analyzing = info(anims()).filter(a => a.name === 'srRunnerDot');
        R.setState('neutral');
        await wait(700);
        out.afterAnalyzing = anims().length;
        R.setState('alert');
        await wait(50);
        out.alertBadge = info(anims()).filter(a => a.name === 'srRunnerBadge');
        await wait(1700);
        out.alertSettled = anims().length;
        R.setState('success');
        await wait(1200);
        out.successSettled = anims().length;
        out.timers = window.__timers;
        return out;
      });
      expect(result.restNeutral, 'au repos : aucune animation').toBe(0);
      expect(result.analyzing, 'trois points, 16 passages chacun, jamais infini').toEqual([
        { name: 'srRunnerDot', iterations: 16 }, { name: 'srRunnerDot', iterations: 16 }, { name: 'srRunnerDot', iterations: 16 }
      ]);
      expect(result.afterAnalyzing, 'quitter l’analyse arrête tout mouvement').toBe(0);
      expect(result.alertBadge).toEqual([{ name: 'srRunnerBadge', iterations: 2 }]);
      expect(result.alertSettled, 'l’alerte joue deux pulsations puis s’arrête').toBe(0);
      expect(result.successSettled, 'le succès joue une fois puis s’arrête').toBe(0);
      expect(result.timers.interval, 'aucun setInterval').toBe(0);
      expect(errors).toEqual([]);
    });

    test('mode réduit d’animations — aucun mouvement, les états restent distincts', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = await openPreview(page);
      const result = await page.evaluate(async () => {
        const R = window.Runner;
        const inst = R.mount(window.__host, { size: 'md' });
        const forced = R.mount(window.__host, { size: 'sm', motion: 'off' });
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const rows = [];
        for (const state of R.STATES) {
          inst.setState(state, { message: 'Message ' + state }); forced.setState(state, { message: 'Message ' + state });
          await wait(80);
          const figure = inst.el.querySelector('.srRunnerFigure');
          rows.push({
            state,
            animations: inst.el.getAnimations({ subtree: true }).length + forced.el.getAnimations({ subtree: true }).length,
            figureAnimation: getComputedStyle(figure).animationName,
            transition: getComputedStyle(inst.el.querySelector('.rnLayer')).transitionDuration,
            visible: Array.from(inst.el.querySelectorAll('.rnLayer')).filter(n => getComputedStyle(n).opacity === '1').map(n => n.getAttribute('data-rn'))
          });
        }
        return { rows, media: matchMedia('(prefers-reduced-motion: reduce)').matches, forcedAttr: forced.el.getAttribute('data-motion') };
      });
      expect(result.media).toBe(true);
      expect(result.forcedAttr).toBe('off');
      for (const row of result.rows) {
        expect(row.animations, 'aucune animation en mode réduit : ' + row.state).toBe(0);
        expect(row.figureAnimation).toBe('none');
        expect(row.transition).toBe('0s');
        expect(new Set(row.visible), 'l’état reste lisible sans mouvement').toEqual(new Set([row.state]));
      }
      expect(errors).toEqual([]);
    });

    test('mouvement coupé par l’écran hôte — motion:"off" sans réglage système', async ({ page }) => {
      const errors = await openPreview(page);
      const result = await page.evaluate(async () => {
        const R = window.Runner;
        const inst = R.mount(window.__host, { size: 'md', motion: 'off' });
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        let count = 0;
        for (const state of R.STATES) { inst.setState(state, { message: state }); await wait(60); count += inst.el.getAnimations({ subtree: true }).length }
        return { count, popClass: inst.el.querySelector('.srRunnerFigure').classList.contains('is-pop') };
      });
      expect(result.count).toBe(0);
      expect(result.popClass, 'aucune animation d’entrée n’est même armée').toBe(false);
      expect(errors).toEqual([]);
    });
  });
}
