const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Runner Visual System V1 — rendu et comportements dans la VRAIE application, sur appareils
// émulés. Store Runner est Android d'abord : Pixel 7 (412 px, référence) et Galaxy S8 (360 px,
// Samsung) sont validés en premier — toucher réel, geste retour, clavier à redimensionnement de
// contenu (`interactive-widget=resizes-content`), barre de gestes, barre à trois boutons,
// encoche, police agrandie. L'adaptation iPhone (iPhone 14) vient ensuite.
//
// Runner n'est branché sur aucun écran : ce spec le monte dans des emplacements réalistes de
// l'application (accueil, Planning, Assistant) pour mesurer ce qu'il donnerait. Les emplacements
// sont des conteneurs de test ; le propriétaire de chaque écran les choisira.
//   RUNNER_SHOTS_DIR=/chemin  → enregistre aussi les captures en PNG.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const SHOTS_DIR = process.env.RUNNER_SHOTS_DIR || '';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const ANDROID = [['Pixel 7', strip(devices['Pixel 7'])], ['Galaxy S8', strip(devices['Galaxy S8'])]];
const IPHONE = [['iPhone 14', strip(devices['iPhone 14'])]];

test.use({ serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function bootApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String((error && error.message) || error)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.Runner && document.querySelector('#bottomAppNav[data-v2="1"]'));
  /* Le bandeau « Store Runner est à jour » de l'application apparaît après le démarrage ; on ne mesure
     ni ne capture dessous. */
  await page.addStyleTag({ content: 'aside[role="status"]{display:none!important}' });
  return errors;
}

/* Un emplacement de test dans l'application, puis Runner monté dedans. */
async function mountAt(page, { anchor, where, id, options, margin }) {
  return page.evaluate(({ anchor, where, id, options, margin }) => {
    const ref = document.querySelector(anchor);
    if (!ref) return false;
    const slot = document.createElement('div');
    slot.id = id;
    slot.style.cssText = 'margin:' + (margin || '14px 0');
    /* Les conteneurs de l'app ordonnent leurs blocs avec `order` : le conteneur de test suit son ancre. */
    const order = getComputedStyle(ref).order;
    if (order && order !== '0') slot.style.order = order;
    if (where === 'before') ref.before(slot); else if (where === 'after') ref.after(slot); else ref.appendChild(slot);
    return !!window.Runner.mount(slot, options);
  }, { anchor, where, id, options, margin });
}

async function shot(page, testInfo, name) {
  const body = await page.screenshot();
  await testInfo.attach(name + '.png', { body, contentType: 'image/png' });
  if (SHOTS_DIR) { fs.mkdirSync(SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(SHOTS_DIR, name.replace(/[^\w-]+/g, '_') + '.png'), body); }
}

const settle = page => page.waitForTimeout(700);

/* L'application réordonne ses blocs un instant après avoir rendu un onglet (planning-ui-fixes.js, home-refresh-v2.js) :
   on ne monte Runner qu'une fois la structure stable, comme le ferait le propriétaire de l'écran dans son rendu. */
async function settleDom(page, selector) {
  let previous = '', stable = 0;
  for (let attempt = 0; attempt < 40 && stable < 3; attempt++) {
    const signature = await page.evaluate(sel => { const root = document.querySelector(sel); return root ? Array.from(root.children).map(c => c.id || c.className).join('|') + '#' + Math.round(root.getBoundingClientRect().height) : ''; }, selector);
    stable = signature && signature === previous ? stable + 1 : 0;
    previous = signature;
    await page.waitForTimeout(150);
  }
}   // laisse finir l'entrée de Runner (≈ 0,4 s)


/* Isolation du style : relève, pour chaque élément de chaque Runner de la page, les propriétés que
   Runner définit lui-même (pas celles qu'il hérite du conteneur). Exécuté dans la page. */
function collectRunnerStyles() {
  const GROUPS = {
    host: ['display', 'position', 'flexDirection', 'alignItems', 'gap', 'minWidth', 'textAlign', 'textTransform', 'whiteSpace', 'fontStyle', 'textDecorationLine'],
    figure: ['width', 'height', 'display', 'pointerEvents', 'lineHeight', 'opacity', 'transform', 'float', 'position'],
    art: ['width', 'height', 'display', 'overflow', 'opacity', 'visibility', 'position', 'float', 'verticalAlign'],
    svgChild: ['fill', 'stroke', 'strokeWidth', 'opacity', 'display', 'visibility', 'transform', 'filter'],
    bubbleish: ['display', 'position', 'flexDirection', 'alignItems', 'gap', 'flexGrow', 'flexShrink', 'minWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderTopWidth', 'borderLeftWidth', 'borderTopLeftRadius', 'borderTopColor', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'whiteSpace', 'overflowWrap', 'boxShadow', 'opacity', 'transform', 'visibility', 'float', 'content', 'textDecorationLine'],
    live: ['position', 'width', 'height', 'overflow', 'whiteSpace', 'marginTop', 'paddingTop', 'opacity']
  };
  const out = {};
  document.querySelectorAll('.isoSlot .srRunner').forEach((host, h) => {
    [host, ...host.querySelectorAll('*')].forEach((el, i) => {
      const cs = getComputedStyle(el);
      let g;
      if (el === host) g = 'host';
      else if (el.closest('.rnArt') && el.tagName !== 'svg') g = 'svgChild';
      else if (el.matches('svg.rnArt')) g = 'art';
      else if (el.matches('.srRunnerFigure')) g = 'figure';
      else if (el.matches('.srRunnerLive')) g = 'live';
      else if (el.closest('.srRunnerIcon') && el.closest('svg') && !el.matches('svg')) g = 'svgChild';
      else g = 'bubbleish';
      const row = {};
      /* flex-grow / flex-shrink ne signifient rien hors d'un conteneur flex : on ne les compare pas. */
      const inFlex = el.parentElement && /flex/.test(getComputedStyle(el.parentElement).display);
      for (const p of GROUPS[g]) { if ((p === 'flexGrow' || p === 'flexShrink') && !inFlex) continue; row[p] = cs[p]; }
      if (g === 'art' || el.matches('.srRunnerIcon svg')) { row.width = cs.width; row.height = cs.height }
      out[h + ':' + g + ':' + (el.classList.length ? el.classList[0] : el.tagName) + '#' + i] = row;
    });
  });
  return out;
}
function mountStyleSet(set) {
  for (const o of set) {
    const slot = document.createElement('div');
    slot.className = 'isoSlot';
    (document.querySelector(o.into) || document.body).appendChild(slot);
    window.Runner.mount(slot, Object.assign({ motion: 'off', title: 'Titre', message: 'Un message de test.' }, o.options));
  }
}
const STYLE_SET = [
  { options: { variant: 'bubble', state: 'neutral' } },
  { options: { variant: 'bubble', state: 'alert', side: 'left' } },
  { options: { variant: 'sheet', state: 'analyzing' } },
  { options: { variant: 'panel', state: 'alert' } },
  { options: { variant: 'panel', state: 'success' } }
];
const normalizeIds = value => String(value).replace(/rn\d+-/g, 'rn#-');

/* Un vrai glissement du doigt (événements tactiles du navigateur, comme sur Android). */
async function swipe(page, x, y, dy) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 12; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * step / 12 }] });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);
}

/* Un geste tactile réel au centre d'un élément. */
async function tapCenter(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

for (const [deviceName, device] of ANDROID) {
  test.describe(deviceName + ' (Android)', () => {
    test.use(device);
    const vw = device.viewport.width;

    test('Isolation du style — Runner est identique dans l’accueil, le Planning et l’Assistant réels', async ({ page, context }) => {
      const set = into => STYLE_SET.map(item => ({ ...item, into }));
      /* Témoin : la page d'aperçu, sans aucune règle d'application. */
      const control = await context.newPage();
      await control.goto(new URL('tests/fixtures/runner-visual-preview.html', APP_URL).href);
      await control.waitForFunction(() => window.Runner);
      await control.evaluate(() => { document.querySelectorAll('.srRunner').forEach(n => n.remove()); window.Runner.mounted(); });
      await control.evaluate(mountStyleSet, set('body'));
      const reference = await control.evaluate(collectRunnerStyles);
      await control.close();

      const errors = await bootApp(page);
      const spots = [
        ['accueil (#premiumHomeV2)', async () => { await page.evaluate(() => goTab('homePanel')); return '#premiumHomeV2' }],
        ['Planning (.applePlan)', async () => { await tapCenter(page, '#bottomAppNav [data-panel="planPanel"]'); await page.waitForSelector('#planPanel.active');
      await settleDom(page, '.applePlan'); return '.applePlan' }],
        ['Assistant (#assistantMsgs)', async () => { await page.evaluate(() => goTab('homePanel')); await tapCenter(page, '#bottomAppNav .bottomNavBtn.ia'); await page.waitForSelector('#assistantPanel.open'); return '#assistantMsgs' }]
      ];
      for (const [label, go] of spots) {
        const into = await go();
        await page.waitForTimeout(500);
        await page.evaluate(mountStyleSet, set(into));
        const actual = await page.evaluate(collectRunnerStyles);
        const diffs = [];
        for (const [key, row] of Object.entries(actual)) {
          const ref = reference[key];
          if (!ref) { diffs.push('élément absent du témoin : ' + key); continue; }
          for (const [prop, value] of Object.entries(row)) if (normalizeIds(ref[prop]) !== normalizeIds(value)) diffs.push(key + ' ' + prop + ' : témoin=' + ref[prop] + ' | application=' + value);
        }
        expect(Object.keys(actual).length, 'tous les éléments de Runner comparés à ' + label).toBe(Object.keys(reference).length);
        expect(diffs.slice(0, 8), 'aucune règle de l’application ne modifie Runner dans ' + label).toEqual([]);
        await page.evaluate(() => { document.querySelectorAll('.isoSlot').forEach(n => { window.Runner.unmount(n); n.remove(); }); });
        if (label.startsWith('Assistant')) await page.evaluate(() => { toggleAssistant(); });
      }
      expect(errors).toEqual([]);
    });

    test('Accueil — Runner s’aligne sur les cartes réelles et reste discret', async ({ page }, testInfo) => {
      const errors = await bootApp(page);
      expect(await mountAt(page, { anchor: '.phVisitCard', where: 'after', id: 'rnHome', options: { state: 'neutral', message: '3 visites prévues aujourd’hui. Premier arrêt : Carrefour Annemasse.' } })).toBe(true);
      await page.evaluate(() => document.getElementById('rnHome').scrollIntoView({ block: 'center' }));
      await settle(page);
      await shot(page, testInfo, deviceName + '-1-accueil');
      const m = await page.evaluate(() => {
        const host = document.querySelector('#rnHome .srRunner').getBoundingClientRect();
        const card = document.querySelector('.phVisitCard').getBoundingClientRect();
        const nav = document.getElementById('bottomAppNav').getBoundingClientRect();
        const bubble = document.querySelector('#rnHome .srRunnerBubble');
        const text = getComputedStyle(bubble.querySelector('.srRunnerBubbleText'));
        return { left: host.left - card.left, right: host.right - card.right, height: host.height, vh: innerHeight, clearOfNav: host.bottom <= nav.top || host.top >= nav.bottom, font: text.fontSize, figure: document.querySelector('#rnHome .srRunnerFigure').getBoundingClientRect().width, drawing: document.querySelector('#rnHome svg.rnArt').getBoundingClientRect().width, radius: getComputedStyle(bubble).borderTopLeftRadius };
      });
      expect(Math.abs(m.left), 'aligné sur le bord gauche de la carte de l’app').toBeLessThanOrEqual(1);
      expect(Math.abs(m.right), 'aligné sur le bord droit de la carte de l’app').toBeLessThanOrEqual(1);
      expect(m.height / m.vh, 'Runner discret : moins de 17 % de la hauteur d’écran').toBeLessThan(0.17);
      expect(m.clearOfNav, 'jamais sous la barre basse flottante').toBe(true);
      expect(m.font).toBe('14px');
      expect(m.figure).toBe(88);
      expect(m.drawing, 'le dessin lui-même fait 88 px (la règle `#premiumHomeV2 svg` de l’app ne le réduit pas à 24 px)').toBe(88);
      expect(m.radius, 'rayon proche des cartes de l’app (24–25 px)').toBe('22px');
      expect(await overflowX(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });

    test('Planning — conseil au-dessus des visites, alerte en fin de page, jamais sous la barre basse', async ({ page }, testInfo) => {
      const errors = await bootApp(page);
      await tapCenter(page, '#bottomAppNav [data-panel="planPanel"]');
      await page.waitForSelector('#planPanel.active');
      await settleDom(page, '.applePlan');
      expect(await mountAt(page, { anchor: '.timelineShell', where: 'before', id: 'rnTip', options: { state: 'neutral', message: '3 visites prévues aujourd’hui. Premier arrêt : Carrefour Annemasse.' } })).toBe(true);
      expect(await mountAt(page, { anchor: '.applePlan', where: 'append', id: 'rnAlert', margin: '14px 0 0', options: { variant: 'panel', state: 'alert', title: 'Attention !', message: 'Il y a un risque de retard sur un magasin P1.' } })).toBe(true);
      await page.evaluate(() => document.getElementById('rnTip').scrollIntoView({ block: 'center' }));
      await settle(page);
      await shot(page, testInfo, deviceName + '-2-planning');
      const tip = await page.evaluate(() => {
        const host = document.querySelector('#rnTip .srRunner').getBoundingClientRect();
        const cov = document.getElementById('planningCoverageV263').getBoundingClientRect();
        return { left: host.left - cov.left, right: host.right - cov.right };
      });
      expect(Math.abs(tip.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(tip.right)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await settle(page);
      await shot(page, testInfo, deviceName + '-3-planning-alerte');
      const end = await page.evaluate(() => {
        const host = document.querySelector('#rnAlert .srRunner').getBoundingClientRect();
        const nav = document.getElementById('bottomAppNav').getBoundingClientRect();
        return { hostBottom: host.bottom, navTop: nav.top, hostRight: host.right, vw: innerWidth };
      });
      expect(end.hostBottom, 'fin de page : le dernier bloc dégage la barre basse flottante').toBeLessThanOrEqual(end.navTop);
      expect(end.hostRight).toBeLessThanOrEqual(vw);
      expect(await overflowX(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });

    test('Défilement tactile — un geste commencé sur Runner fait défiler la page', async ({ page }) => {
      const errors = await bootApp(page);
      await tapCenter(page, '#bottomAppNav [data-panel="planPanel"]');
      await page.waitForSelector('#planPanel.active');
      await settleDom(page, '.applePlan');
      await mountAt(page, { anchor: '#planningToolsV2', where: 'before', id: 'rnTip', options: { state: 'neutral', message: '3 visites prévues aujourd’hui. Premier arrêt : Carrefour Annemasse.' } });
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await settle(page);
      for (const [label, selector] of [['la figure', '#rnTip .srRunnerFigure'], ['la bulle', '#rnTip .srRunnerBubble']]) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        const box = await page.locator(selector).boundingBox();
        await swipe(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), -260);
        expect(await page.evaluate(() => window.scrollY), 'glissement du doigt commencé sur ' + label).toBeGreaterThan(120);
      }
      expect(errors).toEqual([]);
    });

    test('Safe areas Android — encoche, barre de gestes, barre à trois boutons : fin de page dégagée', async ({ page }, testInfo) => {
      const errors = await bootApp(page);
      await tapCenter(page, '#bottomAppNav [data-panel="planPanel"]');
      await page.waitForSelector('#planPanel.active');
      await settleDom(page, '.applePlan');
      await mountAt(page, { anchor: '.applePlan', where: 'append', id: 'rnEnd', margin: '14px 0 0', options: { variant: 'panel', state: 'success', title: 'C’est fait !', message: 'Le planning a été recalculé.' } });
      const client = await page.context().newCDPSession(page);
      const scenarios = [
        { name: 'Android plein écran, barre d’état', insets: { top: 32, bottom: 0, left: 0, right: 0 } },
        { name: 'Android trou de caméra + barre de gestes', insets: { top: 48, bottom: 24, left: 0, right: 0 } },
        { name: 'Android navigation à trois boutons', insets: { top: 32, bottom: 48, left: 0, right: 0 } }
      ];
      let applied = 0;
      for (const scenario of scenarios) {
        try { await client.send('Emulation.setSafeAreaInsetsOverride', { insets: scenario.insets }); } catch (error) {
          testInfo.annotations.push({ type: 'safe-area-emulation-indisponible', description: String(error.message).slice(0, 120) });
          break;
        }
        applied++;
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await settle(page);
        const m = await page.evaluate(() => {
          const host = document.querySelector('#rnEnd .srRunner').getBoundingClientRect();
          const nav = document.getElementById('bottomAppNav').getBoundingClientRect();
          return { hostBottom: host.bottom, hostLeft: host.left, hostRight: host.right, navTop: nav.top, navBottom: nav.bottom, vw: innerWidth, vh: innerHeight };
        });
        testInfo.annotations.push({ type: scenario.name, description: 'nav.bottom=' + Math.round(m.navBottom) + '/' + m.vh + ' dernier bloc.bottom=' + Math.round(m.hostBottom) + ' nav.top=' + Math.round(m.navTop) });
        expect(m.hostBottom, scenario.name + ' : le dernier bloc dégage la barre basse').toBeLessThanOrEqual(m.navTop);
        expect(m.hostLeft).toBeGreaterThanOrEqual(0);
        expect(m.hostRight).toBeLessThanOrEqual(m.vw);
        expect(await overflowX(page)).toBeLessThanOrEqual(1);
        if (scenario.insets.bottom === 48) await shot(page, testInfo, deviceName + '-6-trois-boutons');
      }
      testInfo.annotations.push({ type: 'scénarios de safe area appliqués', description: applied + '/' + scenarios.length });
      await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } }).catch(() => { });
      expect(errors).toEqual([]);
    });

    test('Police système agrandie (≈ 150 %) — rien ne déborde, la zone de saisie reste atteignable', async ({ page }) => {
      const errors = await bootApp(page);
      await tapCenter(page, '#bottomAppNav .bottomNavBtn.ia');
      await page.waitForSelector('#assistantPanel.open');
      await page.waitForSelector('#srAssistantRunner .srRunner');
      await page.addStyleTag({ content: '.srRunnerBubbleText{font-size:21px!important}.srRunnerBubbleTitle{font-size:24.75px!important}' });
      await settle(page);
      const m = await page.evaluate(() => {
        const r = sel => document.querySelector(sel).getBoundingClientRect();
        const host = r('#srAssistantRunner .srRunner'), bubble = r('#srAssistantRunner .srRunnerBubble'), input = r('.ainput'), chips = r('.achips');
        return { bubbleRight: bubble.right, vw: innerWidth, chipsVisible: chips.bottom <= innerHeight, inputVisible: input.bottom <= innerHeight, hostBottom: host.bottom, chipsTop: chips.top, figure: document.querySelector('#srAssistantRunner .srRunnerFigure').getBoundingClientRect().width };
      });
      expect(m.bubbleRight).toBeLessThanOrEqual(m.vw);
      expect(m.chipsVisible && m.inputVisible).toBe(true);
      expect(m.hostBottom, 'le texte agrandi ne passe pas sous les pastilles').toBeLessThanOrEqual(m.chipsTop);
      expect(m.figure, 'le personnage ne grossit pas avec le texte').toBe(88);
      expect(await overflowX(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  });
}

/* iPhone ensuite. Safari/WebKit n'est pas installé ici : ce bloc valide le comportement CSS/JS
   sous émulation Chromium (UA, taille, DPR, safe areas). Les particularités WebKit réelles (rendu
   SVG, clavier iOS qui ne redimensionne pas le contenu) se vérifient sur un iPhone : test terrain. */
for (const [deviceName, device] of IPHONE) {
  test.describe(deviceName + ' (adaptation, émulation Chromium)', () => {
    test.use(device);

    test('Planning — Runner dans le flux, encoche et barre d’accueil respectées', async ({ page }, testInfo) => {
      const errors = await bootApp(page);
      const client = await page.context().newCDPSession(page);
      let applied = true;
      try { await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } }); } catch (error) {
        applied = false; testInfo.annotations.push({ type: 'safe-area-emulation-indisponible', description: String(error.message).slice(0, 120) });
      }
      await tapCenter(page, '#bottomAppNav [data-panel="planPanel"]');
      await page.waitForSelector('#planPanel.active');
      await settleDom(page, '.applePlan');
      await mountAt(page, { anchor: '.timelineShell', where: 'before', id: 'rnTip', options: { state: 'neutral', message: '3 visites prévues aujourd’hui. Premier arrêt : Carrefour Annemasse.' } });
      await mountAt(page, { anchor: '.applePlan', where: 'append', id: 'rnEnd', margin: '14px 0 0', options: { variant: 'panel', state: 'alert', title: 'Attention !', message: 'Il y a un risque de retard sur un magasin P1.' } });
      await page.evaluate(() => document.getElementById('rnTip').scrollIntoView({ block: 'center' }));
      await settle(page);
      await shot(page, testInfo, deviceName + '-1-planning');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await settle(page);
      const end = await page.evaluate(() => {
        const host = document.querySelector('#rnEnd .srRunner').getBoundingClientRect();
        const nav = document.getElementById('bottomAppNav').getBoundingClientRect();
        const floating = [...document.querySelectorAll('.srRunner, .srRunner *')].filter(n => ['fixed', 'sticky'].includes(getComputedStyle(n).position)).length;
        return { hostBottom: host.bottom, navTop: nav.top, floating };
      });
      expect(end.hostBottom, 'fin de page : le dernier bloc dégage la barre basse').toBeLessThanOrEqual(end.navTop);
      expect(end.floating).toBe(0);

      expect(await overflowX(page)).toBeLessThanOrEqual(1);
      await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } }).catch(() => { });
      expect(errors).toEqual([]);
    });
  });
}
