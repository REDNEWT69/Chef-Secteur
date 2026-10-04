const { test, expect } = require('@playwright/test');

// Runner Visual System V1 — vérifié dans un vrai Chromium, MOBILE uniquement : Android 390 px
// (référence), Android 360 px (le plus petit téléphone courant) puis iPhone 390 px.
// 1. dans la vraie application : Runner est présent mais dormant, il n'écrit aucune donnée et
//    sa feuille de style n'est pas altérée par celle de l'application ;
// 2. sur la page d'aperçu de test (jamais servie par l'app) : états, variantes natives
//    (bulle, en-tête de bottom sheet, carte teintée), Runner toujours dans le flux, actions de
//    l'hôte jamais recouvertes, safe areas émulées, accessibilité, mouvement borné, mode réduit.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const PREVIEW_URL = new URL('tests/fixtures/runner-visual-preview.html', APP_URL).href;
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const STATES = ['neutral', 'analyzing', 'alert', 'success'];
const PROFILES = [
  { name: 'Android 390', userAgent: ANDROID_UA, viewport: { width: 390, height: 844 } },
  { name: 'Android 360', userAgent: ANDROID_UA, viewport: { width: 360, height: 800 } },
  { name: 'iPhone 390', userAgent: IPHONE_UA, viewport: { width: 390, height: 844 } }
];
const PREVIEW_RUNNERS = 10;

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

/* Page d'aperçu vidée de ses démonstrations : chaque test monte ce dont il a besoin. */
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
  await page.waitForFunction(count => window.Runner && document.querySelectorAll('.srRunner').length >= count, PREVIEW_RUNNERS);
  await page.evaluate(() => {
    document.querySelectorAll('.srRunner').forEach(node => node.remove());
    window.Runner.mounted();
    window.__host = document.createElement('div');
    window.__host.id = 'testHost';
    window.__host.style.cssText = 'padding:16px 0';
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
    variants: Array.from(window.Runner.VARIANTS),
    appliedWithoutInstance: [window.Runner.setState('alert'), window.Runner.showMessage('x'), window.Runner.reset()]
  }));
  expect(dormant).toEqual({
    sameObject: true, mounted: 0, nodes: 0, style: false,
    states: ['neutral', 'analyzing', 'alert', 'success'],
    variants: ['bubble', 'sheet', 'panel'],
    appliedWithoutInstance: [false, false, false]
  });
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.initiatorType === 'script').map(entry => new URL(entry.name).pathname.split('/').pop()));
  expect(loaded.filter(name => name === 'runner-visual.js'), 'chargé une seule fois').toEqual(['runner-visual.js']);
  expect(errors).toEqual([]);
});

for (const profile of PROFILES) {
  test.describe(profile.name, () => {
    test.use({ userAgent: profile.userAgent, viewport: profile.viewport });
    const vw = profile.viewport.width;

    test('dans l’application — Runner n’écrit aucune donnée et garde son style', async ({ page }, testInfo) => {
      const errors = await bootApp(page);
      const before = await page.evaluate(() => ({
        state: JSON.stringify(window.state),
        keys: Object.keys(localStorage).sort(),
        storage: JSON.stringify(Object.keys(window.__chefStorage || {}).sort())
      }));
      await page.evaluate(() => {
        const host = document.createElement('div');
        host.id = 'runnerAppHost';
        host.style.cssText = 'padding:16px;background:#f2f5fa';
        document.body.appendChild(host);
        const row = id => { const d = document.createElement('div'); d.id = id; d.style.marginBottom = '12px'; host.appendChild(d); return d };
        const inst = window.Runner.mount(row('rb'), { state: 'analyzing', title: 'Runner', message: 'Je vérifie les contraintes, les P1 et les temps de trajet…' });
        window.Runner.setState('alert', { message: 'Schmidt Bourgoin ne tient pas avec une arrivée stricte à 10h30.', title: 'Attention' });
        window.Runner.setState('success', { message: 'Ta tournée est optimisée.', resetAfter: 1500 });
        window.Runner.reset();
        window.Runner.setState('alert', { message: 'Schmidt Bourgoin ne tient pas avec une arrivée stricte à 10h30.', title: 'Attention' });
        window.Runner.mount(row('rp'), { variant: 'panel', state: 'alert', title: 'Attention !', message: 'Il y a un risque de retard sur un magasin P1.' });
        window.Runner.mount(row('rs'), { variant: 'sheet', state: 'analyzing', title: 'Analyse en cours…', message: 'Je vérifie les contraintes.' });
        window.__runnerInst = inst;
        host.scrollIntoView();
      });
      /* Les animations d'entrée (≈ 0,4 s) jouent un scale : on mesure l'état posé, pas le mouvement. */
      await page.waitForTimeout(700);
      const measures = await page.evaluate(() => {
        const inst = window.__runnerInst;
        const figure = inst.el.querySelector('.srRunnerFigure').getBoundingClientRect();
        const bubble = inst.el.querySelector('.srRunnerBubble');
        const text = getComputedStyle(inst.el.querySelector('.srRunnerBubbleText'));
        const title = getComputedStyle(inst.el.querySelector('.srRunnerBubbleTitle'));
        const box = bubble.getBoundingClientRect();
        const panel = document.querySelector('#rp .srRunnerBubble');
        const sheet = document.querySelector('#rs .srRunnerBubble');
        return {
          figureWidth: Math.round(figure.width), figureHeight: Math.round(figure.height),
          bubbleRight: Math.round(box.right), bubbleLeft: Math.round(box.left),
          font: text.fontSize, titleFont: title.fontSize, titleWeight: title.fontWeight,
          family: text.fontFamily === getComputedStyle(document.body).fontFamily,
          accent: getComputedStyle(bubble).borderLeftColor, instance: inst.getState(),
          panelBg: getComputedStyle(panel).backgroundColor, sheetShadow: getComputedStyle(sheet).boxShadow,
          fixed: Array.from(document.querySelectorAll('#runnerAppHost, #runnerAppHost *')).filter(n => ['fixed', 'sticky'].includes(getComputedStyle(n).position)).length
        };
      });
      await testInfo.attach('runner-dans-application-' + profile.name + '.png', { body: await page.screenshot(), contentType: 'image/png' });
      expect(measures.figureWidth).toBe(88);
      expect(measures.figureHeight).toBe(Math.round(88 * 280 / 240));
      expect(measures.bubbleLeft).toBeGreaterThanOrEqual(16);
      expect(measures.bubbleRight, 'la bulle reste dans l’écran').toBeLessThanOrEqual(vw - 16 + 1);
      expect(measures.font).toBe('14px');
      expect(measures.titleFont).toBe('14.5px');
      expect(Number(measures.titleWeight)).toBeGreaterThanOrEqual(700);
      expect(measures.family, 'Runner hérite la police de l’application').toBe(true);
      expect(measures.accent, 'accent rouge en alerte').toBe('rgb(229, 57, 43)');
      expect(measures.instance).toBe('alert');
      expect(measures.panelBg, 'teinte du bloc d’alerte').toBe('rgb(253, 236, 234)');
      expect(measures.sheetShadow, 'en-tête de sheet sans cadre').toBe('none');
      expect(measures.fixed, 'aucun élément de Runner fixe ou collant dans l’application').toBe(0);
      expect(await overflowX(page)).toBeLessThanOrEqual(1);

      const after = await page.evaluate(() => {
        window.Runner.unmount(document.getElementById('rb'));
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
          const layers = Array.from(inst.el.querySelectorAll('.rnLayer'));
          rows.push({
            state, attr: inst.el.getAttribute('data-state'), got: inst.getState(),
            label: inst.el.querySelector('.srRunnerFigure').getAttribute('aria-label'),
            visible: Array.from(new Set(layers.filter(n => getComputedStyle(n).opacity === '1').map(n => n.getAttribute('data-rn')))),
            foreign: layers.filter(n => getComputedStyle(n).opacity === '0' && n.getAttribute('data-rn') === state).length
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
        expect(row.foreign).toBe(0);
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

    test('variantes — bulle, en-tête de sheet et carte teintée se composent comme prévu', async ({ page }) => {
      const errors = await openPreview(page);
      const result = await page.evaluate(async () => {
        const R = window.Runner;
        const cell = () => { const d = document.createElement('div'); d.style.cssText = 'margin:0 16px 12px'; window.__host.appendChild(d); return d };
        const rect = el => el.getBoundingClientRect();
        const css = (el, p) => getComputedStyle(el)[p];
        const build = (variant, extra) => { const c = cell(); const inst = R.mount(c, Object.assign({ variant, motion: 'off', title: 'Titre', message: 'Un message assez long pour passer sur plusieurs lignes dans la largeur d’un téléphone.' }, extra)); return { c, inst, fig: inst.el.querySelector('.srRunnerFigure'), bub: inst.el.querySelector('.srRunnerBubble'), icon: inst.el.querySelector('.srRunnerIcon') } };
        const out = {};
        const bubble = build('bubble', { state: 'neutral' });
        out.bubble = { dir: css(bubble.inst.el, 'flexDirection'), figureLeft: rect(bubble.fig).right <= rect(bubble.bub).left + 1, tail: getComputedStyle(bubble.bub, '::before').content, size: Math.round(rect(bubble.fig).width), icon: css(bubble.icon, 'display'), variant: bubble.inst.el.getAttribute('data-variant') };
        const left = build('bubble', { state: 'neutral', side: 'left' });
        out.left = { figureRight: rect(left.fig).left >= rect(left.bub).right - 1, dir: css(left.inst.el, 'flexDirection') };
        const sheet = build('sheet', { state: 'analyzing' });
        out.sheet = { size: Math.round(rect(sheet.fig).width), border: css(sheet.bub, 'borderTopWidth') + '/' + css(sheet.bub, 'borderLeftWidth'), shadow: css(sheet.bub, 'boxShadow'), bg: css(sheet.bub, 'backgroundColor'), tail: getComputedStyle(sheet.bub, '::before').content, titleFont: css(sheet.inst.el.querySelector('.srRunnerBubbleTitle'), 'fontSize'), icon: css(sheet.icon, 'display') };
        const panels = {};
        for (const state of ['neutral', 'analyzing', 'alert', 'success']) {
          const p = build('panel', { state });
          const host = rect(p.inst.el), bub = rect(p.bub), fig = rect(p.fig);
          panels[state] = { dir: css(p.inst.el, 'flexDirection'), full: Math.abs(bub.width - host.width) < 1.5, centered: Math.abs((fig.left + fig.width / 2) - (host.left + host.width / 2)) < 1.5, above: fig.top < bub.top, bg: css(p.bub, 'backgroundColor'), titleColor: css(p.inst.el.querySelector('.srRunnerBubbleTitle'), 'color'), icon: css(p.icon, 'display'), tail: getComputedStyle(p.bub, '::before').content, size: Math.round(fig.width) };
        }
        out.panels = panels;
        const iconShapes = {};
        for (const state of ['alert', 'success']) { const p = build('panel', { state }); iconShapes[state] = Array.from(p.icon.querySelectorAll('svg')).filter(s => getComputedStyle(s).display === 'block').map(s => s.getAttribute('class')) }
        out.iconShapes = iconShapes;
        out.fallback = build('inconnu', { state: 'neutral' }).inst.el.getAttribute('data-variant');
        return out;
      });
      expect(result.bubble).toMatchObject({ dir: 'row', figureLeft: true, size: 88, icon: 'none', variant: 'bubble' });
      expect(result.bubble.tail, 'la queue de bulle existe en variante bulle').not.toBe('none');
      expect(result.left).toEqual({ figureRight: true, dir: 'row-reverse' });
      expect(result.sheet).toMatchObject({ size: 120, border: '0px/0px', shadow: 'none', bg: 'rgba(0, 0, 0, 0)', tail: 'none', titleFont: '16.5px', icon: 'none' });
      for (const [state, tintBg] of [['neutral', 'rgb(241, 246, 255)'], ['analyzing', 'rgb(238, 246, 255)'], ['alert', 'rgb(253, 236, 234)'], ['success', 'rgb(232, 247, 239)']]) {
        const panel = result.panels[state];
        expect(panel, 'carte teintée ' + state).toMatchObject({ dir: 'column', full: true, centered: true, above: true, bg: tintBg, tail: 'none', size: 88 });
      }
      expect(result.panels.alert.titleColor).toBe('rgb(183, 42, 27)');
      expect(result.panels.success.titleColor).toBe('rgb(22, 112, 74)');
      expect([result.panels.neutral.icon, result.panels.analyzing.icon, result.panels.alert.icon, result.panels.success.icon], 'pictogramme seulement pour alerte et succès').toEqual(['none', 'none', 'block', 'block']);
      expect(result.iconShapes, 'un seul pictogramme visible par état').toEqual({ alert: ['rnIconAlert'], success: ['rnIconOk'] });
      expect(result.fallback, 'variante inconnue : bulle').toBe('bubble');
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
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

    test('dans le flux — jamais fixe, jamais flottant, aucune action de l’hôte recouverte', async ({ page }, testInfo) => {
      await page.goto(PREVIEW_URL, { waitUntil: 'load' });
      await page.waitForFunction(count => window.Runner && document.querySelectorAll('.srRunner').length >= count, PREVIEW_RUNNERS);
      await testInfo.attach('runner-apercu-' + profile.name + '.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      expect(await overflowX(page)).toBeLessThanOrEqual(0);

      const positions = await page.evaluate(() => Array.from(document.querySelectorAll('.srRunner')).map(host => ({
        host: getComputedStyle(host).position,
        floating: [host, ...host.querySelectorAll('*')].filter(n => ['fixed', 'sticky'].includes(getComputedStyle(n).position)).length,
        zIndex: [host, ...host.querySelectorAll('*')].filter(n => getComputedStyle(n).zIndex !== 'auto').length,
        focusable: host.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').length,
        figurePointer: getComputedStyle(host.querySelector('.srRunnerFigure')).pointerEvents
      })));
      expect(positions.length).toBeGreaterThanOrEqual(PREVIEW_RUNNERS);
      for (const row of positions) {
        expect(row.host, 'conteneur dans le flux, jamais fixe').toBe('relative');
        expect(row.floating, 'aucun élément fixe ou collant dans Runner').toBe(0);
        expect(row.zIndex, 'aucun empilement : Runner ne passe jamais au-dessus d’une action').toBe(0);
        expect(row.focusable, 'Runner ne prend jamais le focus et ne dessine aucun bouton').toBe(0);
        expect(row.figurePointer, 'la figure ne capte aucun tap').toBe('none');
      }

      /* Chaque action de l'hôte reste atteignable : le point central de son bouton lui appartient. */
      const buttons = await page.evaluate(async () => {
        const out = [];
        for (const btn of document.querySelectorAll('.btn')) {
          btn.scrollIntoView({ block: 'center' });
          await new Promise(resolve => requestAnimationFrame(resolve));
          const r = btn.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          out.push({ id: btn.id, own: hit === btn || btn.contains(hit), height: Math.round(r.height), inRunner: !!(hit && hit.closest('.srRunner')) });
        }
        return out;
      });
      expect(buttons.map(b => b.id)).toEqual(['assistantCancel', 'alertDetails', 'alertFix', 'successGo']);
      for (const b of buttons) {
        expect(b.own, 'bouton ' + b.id + ' atteignable').toBe(true);
        expect(b.inRunner).toBe(false);
        expect(b.height, 'cible tactile ≥ 48 px (Material)').toBeGreaterThanOrEqual(48);
      }

      /* En bas de page, le dernier Runner reste au-dessus de la barre fixe de l'hôte. */
      const bottom = await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const nav = document.getElementById('hostNav').getBoundingClientRect();
        const last = Array.from(document.querySelectorAll('.srRunner')).pop().closest('.card').getBoundingClientRect();
        return { navTop: nav.top, lastBottom: last.bottom };
      });
      expect(bottom.lastBottom, 'le contenu de l’hôte dégage la barre basse').toBeLessThanOrEqual(bottom.navTop);

      /* Dans le cadre : aucune bulle ne déborde de sa carte ni de l'écran, texte ≥ 14 px. */
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.srRunner')).map(host => {
        const card = host.closest('.card,.sheet').getBoundingClientRect();
        const rect = host.getBoundingClientRect();
        const bubble = host.querySelector('.srRunnerBubble');
        const box = bubble && !bubble.hidden ? bubble.getBoundingClientRect() : null;
        return {
          insideCard: rect.left >= card.left - 0.5 && rect.right <= card.right + 0.5,
          insideViewport: rect.right <= window.innerWidth + 0.5 && rect.left >= -0.5,
          bubbleInside: box ? box.right <= card.right + 0.5 && box.left >= card.left - 0.5 : true,
          bubbleFont: box ? parseFloat(getComputedStyle(bubble.querySelector('.srRunnerBubbleText')).fontSize) : 14
        };
      }));
      for (const row of rows) {
        expect(row.insideCard).toBe(true);
        expect(row.insideViewport).toBe(true);
        expect(row.bubbleInside).toBe(true);
        expect(row.bubbleFont).toBeGreaterThanOrEqual(14);
      }

      /* Plus petit encore (320 px, très vieux Android) : toujours aucun défilement horizontal. */
      await page.setViewportSize({ width: 320, height: 640 });
      expect(await overflowX(page), 'aucun défilement horizontal à 320 px').toBeLessThanOrEqual(0);
    });

    test('safe areas — encoche, barre de gestes et mode paysage : Runner reste dans la zone sûre', async ({ page }, testInfo) => {
      await page.goto(PREVIEW_URL, { waitUntil: 'load' });
      await page.waitForFunction(count => window.Runner && document.querySelectorAll('.srRunner').length >= count, PREVIEW_RUNNERS);
      const client = await page.context().newCDPSession(page);
      const scenarios = [
        { name: 'iPhone encoche + barre d’accueil', insets: { top: 47, bottom: 34, left: 0, right: 0 } },
        { name: 'Android barre de gestes', insets: { top: 0, bottom: 24, left: 0, right: 0 } },
        { name: 'paysage avec encoche', insets: { top: 0, bottom: 21, left: 47, right: 47 } }
      ];
      let applied = 0;
      for (const scenario of scenarios) {
        try { await client.send('Emulation.setSafeAreaInsetsOverride', { insets: scenario.insets }); } catch (error) {
          testInfo.annotations.push({ type: 'safe-area-emulation-indisponible', description: String(error.message).slice(0, 120) });
          break;
        }
        applied++;
        const { top, bottom, left, right } = scenario.insets;
        const result = await page.evaluate(async () => {
          window.scrollTo(0, 0);
          await new Promise(resolve => requestAnimationFrame(resolve));
          const first = document.querySelector('.srRunner').getBoundingClientRect();
          const hosts = Array.from(document.querySelectorAll('.srRunner')).map(h => h.getBoundingClientRect());
          const nav = document.getElementById('hostNav');
          const cancel = document.getElementById('assistantCancel');
          cancel.scrollIntoView({ block: 'center' });
          await new Promise(resolve => requestAnimationFrame(resolve));
          const sheet = document.getElementById('assistant').getBoundingClientRect();
          const c = cancel.getBoundingClientRect();
          return {
            firstTop: first.top,
            minLeft: Math.min(...hosts.map(r => r.left)), maxRight: Math.max(...hosts.map(r => r.right)),
            navPad: parseFloat(getComputedStyle(nav).paddingBottom),
            sheetPad: parseFloat(getComputedStyle(document.getElementById('assistant')).paddingBottom),
            cancelClear: sheet.bottom - c.bottom,
            width: window.innerWidth
          };
        });
        expect(result.firstTop, scenario.name + ' : Runner démarre sous la zone supérieure').toBeGreaterThanOrEqual(top);
        expect(result.minLeft, scenario.name + ' : à droite de la zone gauche').toBeGreaterThanOrEqual(left);
        expect(result.maxRight, scenario.name + ' : à gauche de la zone droite').toBeLessThanOrEqual(result.width - right + 0.5);
        expect(result.navPad, scenario.name + ' : la barre de l’hôte applique la marge basse').toBe(bottom);
        expect(result.sheetPad, scenario.name + ' : le sheet de l’hôte applique la marge basse').toBeGreaterThanOrEqual(bottom + 16);
        expect(result.cancelClear, scenario.name + ' : l’action du sheet reste au-dessus de la barre de gestes').toBeGreaterThanOrEqual(bottom);
        expect(await overflowX(page)).toBeLessThanOrEqual(0);
      }
      testInfo.annotations.push({ type: 'scénarios de safe area appliqués', description: applied + '/' + scenarios.length });
      await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } }).catch(() => { });
    });

    test('dessin — le SVG tient dans son cadre pour chaque taille et reste léger', async ({ page }) => {
      const errors = await openPreview(page);
      const result = await page.evaluate(() => {
        const R = window.Runner;
        const out = { sizes: [], defaults: [], bbox: null, nodes: 0, bytes: 0, gradientIds: 0, uniqueIds: true };
        const a = R.mount(window.__host, { size: 'sm' });
        const b = R.mount(window.__host, { size: 'md' });
        for (const [name, want] of [['sm', 56], ['md', 88], ['lg', 120], [144, 144], [100, 100], [10, 32], [9999, 144], ['xl', 88], ['inconnu', 88], [undefined, 88], [-4, 88]]) {
          const inst = R.mount(window.__host, { size: name });
          const f = inst.el.querySelector('.srRunnerFigure').getBoundingClientRect();
          out.sizes.push([String(name), want, Math.round(f.width), Math.round(f.height / f.width * 240)]);
          R.unmount(inst);
        }
        for (const [variant, want] of [['bubble', 88], ['panel', 88], ['sheet', 120]]) {
          const inst = R.mount(window.__host, { variant });
          out.defaults.push([variant, want, Math.round(inst.el.querySelector('.srRunnerFigure').getBoundingClientRect().width)]);
          R.unmount(inst);
        }
        const svg = a.el.querySelector('svg.rnArt');
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
      for (const [variant, want, width] of result.defaults) expect(width, 'taille par défaut de ' + variant).toBe(want);
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
        /* Un écran qui se redessine à chaque rendu : une seule instance vivante, jamais d'orphelin. */
        const screen = mk('screen');
        const counts = [];
        for (let render = 0; render < 6; render++) {
          screen.innerHTML = '<div id="slot' + render + '"></div>';
          R.mount(screen.firstChild, { variant: render % 2 ? 'panel' : 'bubble', message: 'Rendu ' + render });
          counts.push(R.mounted());
        }
        out.redraw = counts;
        out.redrawText = document.querySelector('#screen .srRunnerBubbleText').textContent;
        /* Monté dans un nœud pas encore attaché : il reste vivant jusqu'à son insertion, puis suit le document. */
        const detached = document.createElement('div');
        const pending = R.mount(detached, { size: 'sm' });
        out.pendingAlive = [R.mounted(), pending.isConnected()];
        window.__host.appendChild(detached);
        out.pendingAttached = pending.isConnected();
        detached.remove();
        out.pendingRemoved = pending.isConnected();
        return out;
      });
      expect(result.mounted).toBe(2);
      expect(result.bad, 'conteneur introuvable : null, jamais d’exception').toEqual([null, null, null, null]);
      expect(result.targets, 'l’API globale vise le dernier monté').toEqual(['neutral', 'alert']);
      expect(result.afterRemoval).toEqual(['neutral', 1]);
      expect(result.fallback, 'le Runner retiré est oublié, le précédent reprend la main').toEqual(['success', 'alert']);
      expect(result.unmountByContainer).toBe(true);
      expect(result.afterUnmount).toEqual([0, null, false, false, false, false, true]);
      expect(result.redraw, 'aucune instance orpheline après des rendus répétés').toEqual([1, 1, 1, 1, 1, 1]);
      expect(result.redrawText).toBe('Rendu 5');
      expect(result.pendingAlive).toEqual([2, true]);
      expect(result.pendingAttached).toBe(true);
      expect(result.pendingRemoved).toBe(false);
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
