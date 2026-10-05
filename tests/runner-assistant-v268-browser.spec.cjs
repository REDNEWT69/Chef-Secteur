const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Runner dans l'Assistant (V268) — l'application monte elle-même Runner : ce spec ne monte rien.
// Android d'abord : Android 390 px (Pixel 7, largeur forcée à 390) et Android 360 px (Galaxy S8) ;
// iPhone 14 ensuite, sous émulation Chromium (Safari/WebKit n'est pas installé ici).
// Runner reste purement visuel : état dérivé du chat, aucune donnée écrite, aucun toucher intercepté.
//   RUNNER_SHOTS_DIR=/chemin  → enregistre aussi les captures en PNG.
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const SHOTS_DIR = process.env.RUNNER_SHOTS_DIR || '';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const ANDROID = [
  ['Android 390', { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } }],
  ['Android 360', strip(devices['Galaxy S8'])]
];
const IPHONE = [['iPhone 14', strip(devices['iPhone 14'])]];
const SLOT = '#srAssistantRunner';

test.use({ serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });

const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settle = page => page.waitForTimeout(700);   // laisse finir l'entrée de Runner (≈ 0,4 s)

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String((error && error.message) || error)));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.Runner && window.StoreRunnerMobileUX && document.querySelector('#bottomAppNav[data-v2="1"]'));
  /* Le bandeau « Store Runner est à jour » de l'application apparaît après le démarrage. */
  await page.addStyleTag({ content: 'aside[role="status"]{display:none!important}' });
  return errors;
}
async function tapCenter(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
async function openAssistant(page) {
  await tapCenter(page, '#bottomAppNav .bottomNavBtn.ia');
  await page.waitForSelector('#assistantPanel.open');
  await page.waitForSelector(SLOT + ' .srRunner');
  await page.waitForTimeout(450);
}
/* Base déterministe : l'environnement de test démarre avec un statut IA « HTTP 404 » (rouge), que Runner reflète à
   juste titre ; on repasse l'Assistant en mode local (statut normal) avant de mesurer le reste. */
async function openAssistantLocal(page) {
  await openAssistant(page);
  await page.evaluate(() => setAssistantMode('local'));
  await page.waitForTimeout(350);
}
async function shot(page, testInfo, name) {
  const body = await page.screenshot();
  await testInfo.attach(name + '.png', { body, contentType: 'image/png' });
  if (SHOTS_DIR) { fs.mkdirSync(SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(SHOTS_DIR, name.replace(/[^\w-]+/g, '_') + '.png'), body); }
}
/* Ce que Runner montre, lu dans le DOM. */
const runnerView = page => page.evaluate(sel => {
  const host = document.querySelector(sel + ' .srRunner');
  if (!host) return null;
  const live = host.querySelector('.srRunnerLive'), bubble = host.querySelector('.srRunnerBubble');
  return {
    state: host.getAttribute('data-state'), label: host.querySelector('.srRunnerFigure').getAttribute('aria-label'),
    title: host.querySelector('.srRunnerBubbleTitle').textContent, text: host.querySelector('.srRunnerBubbleText').textContent,
    bubbleHidden: bubble.hidden, live: live.textContent, liveMode: live.getAttribute('aria-live'),
    figure: Math.round(host.querySelector('.srRunnerFigure').getBoundingClientRect().width)
  };
}, SLOT);
/* Passerelle IA de test : l'envoi en ligne de l'Assistant appelle `callAIGateway` (global du noyau). */
const stubGateway = (page, behaviour) => page.evaluate(b => {
  window.__gw = { release: null, calls: 0 };
  window.callAIGateway = () => { window.__gw.calls++; return b === 'hang' ? new Promise((resolve, reject) => { window.__gw.release = (ok, value) => ok ? resolve(value) : reject(new Error(value)); }) : b === 'fail' ? Promise.reject(new Error('HTTP 503')) : Promise.resolve({ text: 'Bonjour !', actions: [] }); };
}, behaviour);
const send = (page, text) => page.evaluate(t => { aiConfig.mode = 'online'; document.getElementById('assistantInput').value = t; assistantSend(); }, text);
const sendLocal = (page, text) => page.evaluate(t => { aiConfig.mode = 'local'; document.getElementById('assistantInput').value = t; assistantSend(); }, text);

for (const [name, device] of [...ANDROID, ...IPHONE]) {
  const isIphone = IPHONE.some(([n]) => n === name);
  test.describe(name + (isIphone ? ' (adaptation, émulation Chromium)' : ' (Android)'), () => {
    test.use(device);
    const vw = device.viewport.width, vh = device.viewport.height;

    test('Assistant dormant jusqu’à la première ouverture, puis monté une seule fois dans son en-tête', async ({ page }, testInfo) => {
      const errors = await boot(page);
      const before = await page.evaluate(() => ({ mounted: Runner.mounted(), css: !!document.getElementById('srRunnerCss'), slot: !!document.getElementById('srAssistantRunner'), nodes: document.querySelectorAll('.srRunner').length }));
      expect(before, 'au démarrage : Runner Accueil seul, aucun slot Assistant').toEqual({ mounted: 1, css: true, slot: false, nodes: 1 });
      await openAssistant(page);
      await settle(page);
      /* Statut de l'Assistant : Runner le reflète (l'environnement de test démarre en « IA en ligne indisponible · HTTP 404 »). */
      const status = await page.evaluate(() => { const s = document.getElementById('assistantAIStatus'); return { bad: s.classList.contains('bad'), text: s.textContent.trim() }; });
      const first = await runnerView(page);
      expect(first.state, 'état initial = statut de l’Assistant').toBe(status.bad ? 'alert' : 'neutral');
      if (status.bad) expect(first.text).toBe(status.text);
      await page.evaluate(() => setAssistantMode('local'));
      await page.waitForTimeout(350);
      expect((await runnerView(page)).state, 'statut normal : retour au calme').toBe('neutral');
      await shot(page, testInfo, name + '-assistant-ouverture');
      const open = await page.evaluate(() => {
        const slot = document.getElementById('srAssistantRunner');
        return { mounted: Runner.mounted(), css: !!document.getElementById('srRunnerCss'), inPanel: !!slot.closest('#assistantPanel'), prev: slot.previousElementSibling && slot.previousElementSibling.id, next: slot.nextElementSibling && slot.nextElementSibling.id, variant: slot.querySelector('.srRunner').getAttribute('data-variant'), size: Math.round(slot.querySelector('.srRunnerFigure').getBoundingClientRect().width) };
      });
      expect(open).toEqual({ mounted: 1, css: true, inPanel: true, prev: 'assistantAIStatus', next: 'assistantMsgs', variant: 'sheet', size: 88 });
      /* Fermer / rouvrir plusieurs fois : jamais de deuxième Runner. */
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => toggleAssistant()); await page.waitForTimeout(150);
        await page.evaluate(() => toggleAssistant()); await page.waitForTimeout(150);
      }
      expect(await page.evaluate(() => [Runner.mounted(), document.querySelectorAll('.srRunner').length, document.querySelectorAll('#srAssistantRunner .srRunner').length])).toEqual([1, 1, 1]);
      expect(await overflowX(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });

    test('états réels — neutre, analyse, alerte, succès, retour au calme', async ({ page }, testInfo) => {
      const errors = await boot(page);
      await openAssistantLocal(page);
      /* Neutre : une réponse locale sans action. */
      await sendLocal(page, 'résume ma semaine');
      await page.waitForTimeout(400);
      let view = await runnerView(page);
      expect(view).toMatchObject({ state: 'neutral', label: 'Runner, copilote terrain : en attente', title: 'Runner', text: 'Prêt quand tu l’es.', bubbleHidden: false });
      expect(view.live, 'le neutre est silencieux : l’Assistant répond déjà à voix haute').toBe('');

      /* Analyse : l'envoi en ligne attend la passerelle (bulle « ✦ Je réfléchis… » du noyau). */
      await stubGateway(page, 'hang');
      await send(page, 'bonjour');
      await page.waitForTimeout(400);
      view = await runnerView(page);
      expect(view).toMatchObject({ state: 'analyzing', label: 'Runner, copilote terrain : il réfléchit', title: 'Analyse en cours…' });
      expect(view.live).toContain('Analyse en cours');
      expect(view.liveMode).toBe('polite');
      await shot(page, testInfo, name + '-assistant-analyse');

      /* Réponse reçue : retour au neutre. */
      await page.evaluate(() => window.__gw.release(true, { text: 'Voici ta tournée.', actions: [] }));
      await page.waitForTimeout(400);
      expect((await runnerView(page)).state).toBe('neutral');

      /* Alerte : la passerelle échoue. */
      await stubGateway(page, 'fail');
      await send(page, 'et maintenant ?');
      await page.waitForTimeout(500);
      view = await runnerView(page);
      expect(view).toMatchObject({ state: 'alert', label: 'Runner, copilote terrain : une contrainte détectée', title: 'Attention !' });
      expect(view.text).toBe('IA en ligne indisponible : HTTP 503');
      expect(view.liveMode, 'une alerte est annoncée sans attendre').toBe('assertive');
      await shot(page, testInfo, name + '-assistant-alerte');

      /* Un nouveau message de l'utilisateur ramène au calme. */
      await sendLocal(page, 'résume ma semaine');
      await page.waitForTimeout(400);
      expect((await runnerView(page)).state).toBe('neutral');

      /* Succès : une action de l'Assistant est appliquée au planning (comportement existant de l'Assistant). */
      await sendLocal(page, 'mets 5 magasins');
      await page.waitForTimeout(900);
      view = await runnerView(page);
      expect(view).toMatchObject({ state: 'success', label: 'Runner, copilote terrain : tout est ok', title: 'C’est fait !' });
      expect(view.text).toBe('Semaine générée avec 5 magasins.');
      await shot(page, testInfo, name + '-assistant-succes');

      expect(errors).toEqual([]);
    });

    test('Runner n’intercepte aucun toucher : tap, pastilles et défilement des messages', async ({ page }) => {
      const errors = await boot(page);
      await openAssistantLocal(page);
      await sendLocal(page, 'résume ma semaine');
      await page.waitForTimeout(300);
      const geometry = await page.evaluate(sel => {
        const slot = document.querySelector(sel), host = slot.querySelector('.srRunner');
        const fig = host.querySelector('.srRunnerFigure').getBoundingClientRect(), bub = host.querySelector('.srRunnerBubble').getBoundingClientRect();
        const under = (x, y) => { const el = document.elementFromPoint(x, y); return { insideRunner: !!(el && el.closest('.srRunner')), tag: el && (el.id || el.className || el.tagName) }; };
        return { slotPointer: getComputedStyle(slot).pointerEvents, figure: under(fig.left + fig.width / 2, fig.top + fig.height / 2), bubble: under(bub.left + bub.width / 2, bub.top + bub.height / 2), fx: fig.left + fig.width / 2, fy: fig.top + fig.height / 2, bx: bub.left + bub.width / 2, by: bub.top + bub.height / 2, focusable: slot.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').length };
      }, SLOT);
      expect(geometry.slotPointer).toBe('none');
      expect(geometry.figure.insideRunner, 'sous le doigt, sur le personnage : jamais Runner').toBe(false);
      expect(geometry.bubble.insideRunner, 'sous le doigt, sur la bulle : jamais Runner').toBe(false);
      expect(geometry.focusable).toBe(0);

      /* Un tap sur Runner ne fait rien : ni message, ni changement d'état. */
      const before = await page.evaluate(() => ({ msgs: document.getElementById('assistantMsgs').children.length, state: document.querySelector('#srAssistantRunner .srRunner').getAttribute('data-state'), open: document.getElementById('assistantPanel').classList.contains('open') }));
      await page.touchscreen.tap(geometry.fx, geometry.fy);
      await page.touchscreen.tap(geometry.bx, geometry.by);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => ({ msgs: document.getElementById('assistantMsgs').children.length, state: document.querySelector('#srAssistantRunner .srRunner').getAttribute('data-state'), open: document.getElementById('assistantPanel').classList.contains('open') }))).toEqual(before);

      /* Une pastille de l'Assistant, touchée au doigt, exécute son gestionnaire. */
      await page.evaluate(() => { aiConfig.mode = 'local'; });
      const count = await page.evaluate(() => document.getElementById('assistantMsgs').children.length);
      await tapCenter(page, '.achips button');
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => document.getElementById('assistantMsgs').children.length)).toBeGreaterThan(count);

      /* Les messages défilent au doigt, avec Runner présent. */
      await page.evaluate(() => { for (let i = 0; i < 40; i++) assistantBot('Message de test numéro ' + i + ' — assez long pour occuper de la place dans la liste des messages.'); });
      await page.waitForTimeout(300);
      await page.evaluate(() => { document.getElementById('assistantMsgs').scrollTop = 0; });
      const box = await page.locator('#assistantMsgs').boundingBox();
      const client = await page.context().newCDPSession(page);
      const x = Math.round(box.x + box.width / 2), y0 = Math.round(box.y + box.height * 0.8);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
      for (let step = 1; step <= 12; step++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - 240 * step / 12 }] }); await page.waitForTimeout(16); }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => document.getElementById('assistantMsgs').scrollTop), 'glissement du doigt dans les messages').toBeGreaterThan(80);
      expect(await page.evaluate(() => window.scrollY), 'la page derrière ne bouge pas').toBe(0);
      expect(errors).toEqual([]);
    });

    /* Android seulement : le clavier iOS ne redimensionne pas le contenu (à contrôler sur un iPhone réel). */
    if (!isIphone) test('clavier ouvert — Runner se réduit à 56 px, la saisie reste visible', async ({ page }, testInfo) => {
      const errors = await boot(page);
      await openAssistantLocal(page);
      await sendLocal(page, 'résume ma semaine');
      await page.waitForTimeout(300);
      expect((await runnerView(page)).figure).toBe(88);
      await tapCenter(page, '#assistantInput');
      await page.setViewportSize({ width: vw, height: Math.round(vh * 0.55) });
      await expect(page.locator('html')).toHaveAttribute('data-sr-keyboard', 'open');
      await page.waitForTimeout(400);
      await shot(page, testInfo, name + '-assistant-clavier');
      const open = await page.evaluate(() => {
        const r = sel => document.querySelector(sel).getBoundingClientRect();
        const host = r('#srAssistantRunner .srRunner'), input = r('#assistantInput'), head = r('.ahead');
        const inter = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        return { figure: Math.round(r('#srAssistantRunner .srRunnerFigure').width), inputInView: input.top >= 0 && input.bottom <= innerHeight, overlap: inter(host, input), headVisible: head.top >= 0 && head.bottom <= innerHeight, hostBottom: host.bottom, inputTop: input.top };
      });
      expect(open.figure).toBe(56);
      expect(open.inputInView, 'la saisie reste visible au-dessus du clavier').toBe(true);
      expect(open.overlap).toBe(false);
      expect(open.headVisible).toBe(true);
      expect(open.hostBottom).toBeLessThanOrEqual(open.inputTop);
      await page.evaluate(() => document.activeElement.blur());
      await page.setViewportSize({ width: vw, height: vh });
      await expect(page.locator('html')).not.toHaveAttribute('data-sr-keyboard', 'open');
      await page.waitForTimeout(300);
      expect((await runnerView(page)).figure, 'clavier fermé : taille retrouvée').toBe(88);
      expect(errors).toEqual([]);
    });

    test('bouton Retour — referme l’Assistant, Runner reste intact et la page ne bouge pas', async ({ page }) => {
      const errors = await boot(page);
      await openAssistantLocal(page);
      await stubGateway(page, 'hang');
      await send(page, 'bonjour');
      await page.waitForTimeout(400);
      const before = await runnerView(page);
      expect(before.state).toBe('analyzing');
      await page.goBack();
      await expect(page.locator('#assistantPanel')).not.toHaveClass(/open/);
      const closed = await page.evaluate(() => ({ mounted: Runner.mounted(), state: document.querySelector('#srAssistantRunner .srRunner').getAttribute('data-state'), path: location.pathname }));
      expect(closed, 'le retour ferme la feuille ; Runner ne l’intercepte pas').toEqual({ mounted: 2, state: 'analyzing', path: '/' });
      await tapCenter(page, '#bottomAppNav .bottomNavBtn.ia');
      await page.waitForSelector('#assistantPanel.open');
      expect((await runnerView(page)).state, 'à la réouverture Runner reflète toujours l’attente en cours').toBe('analyzing');
      await page.evaluate(() => window.__gw.release(true, { text: 'Terminé.', actions: [] }));
      await page.waitForTimeout(400);
      expect((await runnerView(page)).state).toBe('neutral');
      expect(errors).toEqual([]);
    });

    test('safe areas — encoche, trou de caméra, barre de gestes, trois boutons : Runner reste dans la zone sûre', async ({ page }, testInfo) => {
      const errors = await boot(page);
      await openAssistantLocal(page);
      await sendLocal(page, 'résume ma semaine');
      await page.waitForTimeout(300);
      const client = await page.context().newCDPSession(page);
      const scenarios = isIphone
        ? [{ name: 'iPhone encoche + barre d’accueil', insets: { top: 47, bottom: 34, left: 0, right: 0 } }]
        : [{ name: 'Android barre d’état', insets: { top: 32, bottom: 0, left: 0, right: 0 } }, { name: 'Android trou de caméra + barre de gestes', insets: { top: 48, bottom: 24, left: 0, right: 0 } }, { name: 'Android trois boutons', insets: { top: 32, bottom: 48, left: 0, right: 0 } }];
      let applied = 0;
      for (const scenario of scenarios) {
        try { await client.send('Emulation.setSafeAreaInsetsOverride', { insets: scenario.insets }); } catch (error) {
          testInfo.annotations.push({ type: 'safe-area-emulation-indisponible', description: String(error.message).slice(0, 120) });
          break;
        }
        applied++;
        await page.waitForTimeout(200);
        const m = await page.evaluate(() => {
          const r = sel => document.querySelector(sel).getBoundingClientRect();
          const host = r('#srAssistantRunner .srRunner'), head = r('.ahead'), chips = r('.achips'), input = r('.ainput'), panel = r('#assistantPanel');
          return { hostTop: host.top, hostLeft: host.left, hostRight: host.right, hostBottom: host.bottom, headBottom: head.bottom, chipsTop: chips.top, inputBottom: input.bottom, panelTop: panel.top, vw: innerWidth, vh: innerHeight, fixed: [...document.querySelectorAll('#srAssistantRunner, #srAssistantRunner *')].filter(n => ['fixed', 'sticky'].includes(getComputedStyle(n).position)).length };
        });
        testInfo.annotations.push({ type: scenario.name, description: 'haut de la feuille de l’app = ' + Math.round(m.panelTop) + ' px pour un inset haut ' + scenario.insets.top + ' px (constat : la feuille ne lit pas env(safe-area-inset-top))' });
        expect(m.hostTop, scenario.name + ' : Runner sous l’en-tête de la feuille').toBeGreaterThanOrEqual(m.headBottom);
        expect(m.hostBottom, scenario.name + ' : Runner au-dessus des pastilles').toBeLessThanOrEqual(m.chipsTop);
        expect(m.inputBottom, scenario.name + ' : la saisie reste dans l’écran').toBeLessThanOrEqual(m.vh);
        expect(m.hostLeft).toBeGreaterThanOrEqual(0);
        expect(m.hostRight).toBeLessThanOrEqual(m.vw);
        expect(m.fixed, 'Runner reste dans le flux').toBe(0);
        expect(await overflowX(page)).toBeLessThanOrEqual(1);
      }
      testInfo.annotations.push({ type: 'scénarios de safe area appliqués', description: applied + '/' + scenarios.length });
      await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } }).catch(() => { });
      expect(errors).toEqual([]);
    });

    test('animations réduites — aucun mouvement, les états restent distincts', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = await boot(page);
      await openAssistantLocal(page);
      await stubGateway(page, 'hang');
      await send(page, 'bonjour');
      await page.waitForTimeout(500);
      const m = await page.evaluate(sel => {
        const host = document.querySelector(sel + ' .srRunner');
        return { media: matchMedia('(prefers-reduced-motion: reduce)').matches, anims: host.getAnimations({ subtree: true }).length, figure: getComputedStyle(host.querySelector('.srRunnerFigure')).animationName, transition: getComputedStyle(host.querySelector('.rnLayer')).transitionDuration, state: host.getAttribute('data-state'), visible: [...new Set([...host.querySelectorAll('.rnLayer')].filter(n => getComputedStyle(n).opacity === '1').map(n => n.getAttribute('data-rn')))] };
      }, SLOT);
      expect(m).toEqual({ media: true, anims: 0, figure: 'none', transition: '0s', state: 'analyzing', visible: ['analyzing'] });
      await page.evaluate(() => window.__gw.release(false, 'HTTP 500'));
      await page.waitForTimeout(500);
      expect(await runnerView(page)).toMatchObject({ state: 'alert' });
      expect(await page.evaluate(sel => document.querySelector(sel + ' .srRunner').getAnimations({ subtree: true }).length, SLOT)).toBe(0);
      expect(errors).toEqual([]);
    });

    test('mouvement normal — une seule boucle bornée en analyse, rien au repos', async ({ page }) => {
      const errors = await boot(page);
      await openAssistantLocal(page);
      await sendLocal(page, 'résume ma semaine');
      await page.waitForTimeout(1200);
      const running = () => page.evaluate(sel => document.querySelector(sel + ' .srRunner').getAnimations({ subtree: true }).filter(a => a.playState !== 'finished' && a.playState !== 'idle').map(a => [a.animationName, a.effect.getComputedTiming().iterations]), SLOT);
      expect((await running()).every(a=>a[1]===1), 'idle : séquences finies').toBe(true);
      await stubGateway(page, 'hang');
      await send(page, 'bonjour');
      await page.waitForTimeout(500);
      expect((await running()).filter(a => a[0] === 'srRunnerDot'), 'analyse : trois points, 16 passages chacun').toEqual([['srRunnerDot', 16], ['srRunnerDot', 16], ['srRunnerDot', 16]]);
      await page.evaluate(() => window.__gw.release(true, { text: 'Fini.', actions: [] }));
      await page.waitForTimeout(900);
      expect((await running()).every(a=>a[1]===1), 'réponse reçue : idle neutre fini, plus de points analyzing').toBe(true);
      expect((await running()).some(a=>a[0]==='srRunnerDot')).toBe(false);
      expect(errors).toEqual([]);
    });

    test('accessibilité — nom, annonces, aucun élément focusable, texte inoffensif', async ({ page }) => {
      const errors = await boot(page);
      await openAssistantLocal(page);
      await stubGateway(page, 'fail');
      await send(page, 'test');
      await page.waitForTimeout(500);
      const a = await page.evaluate(sel => {
        const slot = document.querySelector(sel), host = slot.querySelector('.srRunner');
        const fig = host.querySelector('.srRunnerFigure'), live = host.querySelector('.srRunnerLive'), bubble = host.querySelector('.srRunnerBubble');
        return { role: fig.getAttribute('role'), label: fig.getAttribute('aria-label'), liveRole: live.getAttribute('role'), liveMode: live.getAttribute('aria-live'), liveText: live.textContent, bubbleAria: bubble.getAttribute('aria-hidden'), focusable: slot.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').length, hasLandmark: !!slot.querySelector('[role="alert"],[role="dialog"],h1,h2,h3'), fontSize: parseFloat(getComputedStyle(bubble.querySelector('.srRunnerBubbleText')).fontSize) };
      }, SLOT);
      expect(a).toMatchObject({ role: 'img', label: 'Runner, copilote terrain : une contrainte détectée', liveRole: 'status', liveMode: 'assertive', bubbleAria: 'true', focusable: 0, hasLandmark: false });
      expect(a.liveText).toBe('Attention !. IA en ligne indisponible : HTTP 503');
      expect(a.fontSize).toBeGreaterThanOrEqual(14);
      /* La tabulation ne s'arrête jamais sur Runner. */
      await page.focus('#assistantInput');
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('#srAssistantRunner')))).toBe(false); }
      /* Un texte d'erreur hostile reste du texte. */
      await page.evaluate(() => { assistantBot('Erreur : <img src=x onerror="window.__xss=1"> Électro'); });
      await page.waitForTimeout(400);
      const hostile = await page.evaluate(sel => ({ text: document.querySelector(sel + ' .srRunnerBubbleText').textContent, injected: document.querySelectorAll(sel + ' img, ' + sel + ' b > *, ' + sel + ' .srRunnerBubbleText *').length, xss: window.__xss === undefined }), SLOT);
      expect(hostile).toEqual({ text: 'Erreur : <img src=x onerror="window.__xss=1"> Électro', injected: 0, xss: true });
      expect(errors).toEqual([]);
    });

    test('purement visuel — aucune donnée écrite, aucune persistance, aucun appel au planning', async ({ page }) => {
      const errors = await boot(page);
      const snapshot = () => page.evaluate(() => ({
        state: JSON.stringify(window.state),
        local: JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))
      }));
      /* Avant l'ouverture, puis un cycle complet analyse → réponse → alerte → retour, sans action d'écriture de l'Assistant. */
      await openAssistantLocal(page);
      const before = await snapshot();
      await stubGateway(page, 'hang');
      await send(page, 'bonjour');
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__gw.release(true, { text: 'Bonjour !', actions: [] }));
      await page.waitForTimeout(300);
      await stubGateway(page, 'fail');
      await send(page, 'encore');
      await page.waitForTimeout(500);
      expect((await runnerView(page)).state).toBe('alert');
      await page.evaluate(() => toggleAssistant());
      await page.waitForTimeout(200);
      const after = await snapshot();
      expect(after.state, 'state de l’application strictement inchangé').toBe(before.state);
      expect(after.local, 'aucune clé ni valeur de stockage créée par Runner').toBe(before.local);
      expect(errors).toEqual([]);
    });
  });
}

/* PWA : le shell précache runner-visual.js ; l'Assistant affiche Runner hors ligne. */
test.describe('PWA — cache et hors ligne', () => {
  test.use({ ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  test('runner-visual.js est dans le cache du shell et Runner s’affiche hors ligne', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(String((error && error.message) || error)));
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const rev = sw.match(/const BUILD_REV = "([^"]+)"/)[1];
    expect(sw.match(/const CORE_SHELL = \[([\s\S]*?)\];/)[1]).toContain('"./runner-visual.js"');
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.state && window.Runner && document.querySelector('#bottomAppNav[data-v2="1"]'));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async rev => { const names = await caches.keys(); const name = names.find(n => n.includes(rev)); if (!name) return 'aucun cache ' + rev; const hit = await (await caches.open(name)).match(new URL('./runner-visual.js?rev=' + rev, location.href).href); return hit ? 'présent' : 'absent'; }, rev), { timeout: 30000, message: 'runner-visual.js précaché dans le cache de la révision ' + rev }).toBe('présent');
    /* Rechargement sous contrôle du service worker, puis hors ligne. */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.state && window.Runner && document.querySelector('#bottomAppNav[data-v2="1"]'), null, { timeout: 30000 });
    await tapCenter(page, '#bottomAppNav .bottomNavBtn.ia');
    await page.waitForSelector('#assistantPanel.open');
    await page.waitForSelector(SLOT + ' .srRunner');
    expect(await page.evaluate(() => ({ online: navigator.onLine, mounted: Runner.mounted(), css: !!document.getElementById('srRunnerCss') }))).toEqual({ online: false, mounted: 1, css: true });
    await context.setOffline(false);
    expect(errors.filter(e => !/Failed to fetch|NetworkError|net::/.test(e))).toEqual([]);
  });
});
