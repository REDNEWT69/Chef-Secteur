// Runner Visual System V1 — contrat de la couche visuelle (runner-visual.js).
// Runner est une présentation pure, pensée MOBILE d'abord (Android puis iPhone) : il ne lit ni
// n'écrit aucune donnée, n'appelle aucun moteur, et ne se positionne jamais par rapport à
// l'écran (ni fixed, ni sticky). Depuis la V269 il est branché dans l'Assistant (V268) et dans le
// Planning (V269), puis sur l’Accueil (V270), par leurs propriétaires. Le comportement réel (états,
// variantes, bulles, mouvement, safe areas, 360/390 px) est vérifié dans un vrai Chromium par
// runner-visual-v268-browser.spec.cjs, runner-assistant-v268-browser.spec.cjs et
// runner-planning-v269-browser.spec.cjs.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const mod = read('runner-visual.js');
const index = read('index.html');
const sw = read('sw.js');
const version = JSON.parse(read('version.json'));
const R = require('../runner-visual.js');

/* 1. Chargé au démarrage une seule fois, mis en cache hors ligne, build cohérent. */
assert.equal(index.split("'./runner-visual.js'").length - 1, 1, 'index.html charge runner-visual.js une seule fois');
assert.match(index, /'\.\/store-explorer\.js','\.\/runner-visual\.js','\.\/weekly-brief-import-v246b\.js','\.\/mobile-ux-v262\.js'\s*\]\.map\(scriptTag\)/,
  'Runner est chargé avant les derniers modules, sans déplacer mobile-ux-v262.js en dernier');
assert.equal(sw.split('"./runner-visual.js"').length - 1, 1, 'sw.js précache runner-visual.js une seule fois (CORE_SHELL, obligatoire)');
assert.ok(sw.indexOf('"./runner-visual.js"') < sw.indexOf('const OPTIONAL_SHELL'), 'runner-visual.js est dans le shell obligatoire, pas dans le facultatif');
assert.equal(version.displayVersion, '270', 'Runner sur l’Accueil est une nouveauté visible : V270');
assert.match(version.latestBuild, /-270$/, 'le build se termine par la version visible 270');
assert.match(version.latestBuild, /^\d{8}-r\d+-[a-z-]+-270$/);
assert.equal(index.match(/const BUILD_REV='([^']+)'/)[1], version.latestBuild);
assert.equal(sw.match(/const BUILD_REV = "([^"]+)"/)[1], version.latestBuild);
assert.ok(!fs.existsSync(path.join(__dirname, '..', 'runner-visual.css')), 'aucune feuille séparée : le style est injecté au premier mount');

/* 2. Présentation pure : aucune donnée, aucun moteur, aucun propriétaire contourné. */
assert.doesNotMatch(mod, /localStorage|sessionStorage|__chefStorage|indexedDB|IDBFactory|\bstate\.|root\.state\b|window\.state\b|\bsave\s*\(/, 'Runner ne lit ni n’écrit aucune donnée');
assert.doesNotMatch(mod, /StoreRunnerPlanningCommandEngine|StoreRunnerVisitCoverage|StoreRunnerStoreExplorer|StoreRunnerActivityMetrics|StoreRunnerPeriodDaySlider|StorePhotosV1|StoreRunnerVisits|StoreRunnerOpportunities|RegionStores/, 'aucun moteur ni propriétaire de données n’est référencé');
assert.doesNotMatch(mod, /\b(renderAll|renderWeek|renderHome|generateWeek|saveProfile|syncGoogleCalendar|goTab|switchTab|openStoreQuick|toggleAssistant)\b/, 'aucune fonction métier ou de navigation n’est appelée ni remplacée');
assert.doesNotMatch(mod, /\b(?:window|root)\.(?!StoreRunnerRunner\b|Runner\b)[A-Za-z_$][\w$]*\s*=(?!=)/, 'aucun autre global n’est écrit');
assert.match(mod, /if\(root\)\{root\.StoreRunnerRunner=api;if\(!root\.Runner\)root\.Runner=api\}/, 'alias Runner posé seulement s’il est libre');

/* 3. Aucune surveillance permanente, aucun écouteur de document, aucune requête réseau. */
assert.doesNotMatch(mod, /setInterval\s*\(/, 'aucune boucle de surveillance');
assert.doesNotMatch(mod, /MutationObserver|IntersectionObserver|ResizeObserver|PerformanceObserver/, 'aucun observateur');
assert.doesNotMatch(mod, /addEventListener\s*\(/, 'Runner ne s’abonne à aucun événement du document');
assert.doesNotMatch(mod, /\b(focus|visibilitychange|resize|scroll|orientationchange)\b['"]/, 'pas de rafraîchissement global au focus ni au redimensionnement');
assert.doesNotMatch(mod, /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|importScripts|new Worker/, 'aucun accès réseau');
assert.doesNotMatch(mod, /requestAnimationFrame/, 'aucune boucle d’image : le mouvement est du CSS');
assert.doesNotMatch(mod, /\beval\s*\(|new Function\s*\(|document\.write/, 'aucune évaluation dynamique');

/* 4. Texte jamais interprété comme du HTML : la bulle est écrite en textContent. */
assert.match(mod, /titleEl\.textContent=message\.title/);
assert.match(mod, /textEl\.textContent=message\.text/);
assert.equal((mod.match(/\.innerHTML\s*=/g) || []).length, 1, 'une seule affectation innerHTML : le gabarit constant de l’instance');
assert.match(mod, /host\.innerHTML='<div class="srRunnerFigure" role="img">'\+ART\.split\('\{u\}'\)\.join\(String\(id\)\)[\s\S]*?\+ICONS\+/, 'le gabarit ne contient que du dessin et des pictogrammes constants, plus un numéro d’instance');

/* 5. Au démarrage Runner ne fait rien : le style n'est injecté qu'à la demande. */
assert.match(mod, /function ensureStyle\(doc\)\{[\s\S]*?doc\.getElementById\(STYLE_ID\)/);
assert.equal((mod.match(/ensureStyle\(/g) || []).length, 2, 'ensureStyle : définition + un seul appel (mount)');
assert.doesNotMatch(mod, /\.install\s*\(|DOMContentLoaded|readyState/, 'aucun démarrage automatique');

/* 6. Mouvement : transform/opacité seulement, une seule boucle et elle est bornée. */
const css = (mod.match(/const CSS=\[([\s\S]*?)\]\.join\(''\)/) || [])[1] || '';
assert.ok(css.length > 500, 'feuille de style trouvée');
const keyframeBlocks = css.match(/@keyframes [^']+/g) || [];
assert.equal(keyframeBlocks.length, 5, 'cinq animations déclarées : pop, bulle, points, pastille, étincelles');
for (const block of keyframeBlocks) {
  const properties = [...block.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]);
  for (const property of properties) assert.ok(['transform', 'opacity'].includes(property), 'animation limitée à transform/opacity : ' + property + ' dans ' + block.slice(0, 40));
}
assert.doesNotMatch(css, /infinite/, 'aucune animation infinie : un état oublié ne tourne jamais en continu');
assert.match(css, /animation:srRunnerDot 1\.4s ease-in-out 16/, 'la seule boucle (points « analyzing ») est bornée à 16 passages');
assert.deepEqual([...css.matchAll(/'([^'{]+)\{[^}']*!important[^}']*\}'/g)].map(m => m[1]).filter(sel => !/prefers-reduced|data-motion/.test(sel) && !/\*/.test(sel)),
  ['.srRunnerFigure .rnArt', '.srRunnerIcon svg', '.srRunner[data-state="alert"] .rnIconAlert,.srRunner[data-state="success"] .rnIconOk'],
  '!important réservé aux SVG de Runner, que les règles `#id svg` de l’application atteignent sinon');
assert.doesNotMatch(css, /will-change/, 'aucune promotion de calque permanente');
assert.doesNotMatch(css, /filter\s*:|backdrop-filter/, 'aucun filtre coûteux sur mobile');
assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.srRunner \*,\.srRunner \*::before\{animation:none!important;transition:none!important\}\}/, 'mode réduit d’animations');
assert.match(css, /\.srRunner\[data-motion="off"\] \*/, 'mouvement coupable par l’écran hôte');
assert.doesNotMatch(mod, /<(filter|feGaussianBlur|animate|animateTransform|set)\b/i, 'le SVG ne contient ni filtre ni animation SMIL');

/* 6 bis. Mobile d'abord, toujours dans le flux : aucune mise en page desktop, aucun personnage flottant. */
assert.deepEqual(css.match(/@media[^{]+/g), ['@media (prefers-reduced-motion:reduce)'], 'aucune requête de largeur : la seule requête média est le mouvement réduit');
assert.doesNotMatch(css, /min-width\s*:\s*\d{3,}|max-width\s*:\s*\d{3,}px/, 'aucune largeur fixe de type desktop');
assert.doesNotMatch(css, /position\s*:\s*(fixed|sticky)/, 'Runner ne se positionne jamais par rapport à l’écran : ni fixed, ni sticky');
const absolute = [...css.matchAll(/'([^'{]+)\{[^}']*position:absolute[^}']*\}'/g)].map(m => m[1]);
assert.deepEqual(absolute, ['.srRunner[data-variant="bubble"] .srRunnerBubble::before', '.srRunnerLive'], 'seuls la queue de bulle et la région vocale masquée sont en position absolue, dans un parent positionné');
assert.deepEqual([...css.matchAll(/position:([a-z]+)/g)].map(m => m[1]).filter((v, i, all) => all.indexOf(v) === i).sort(), ['absolute', 'relative'], 'aucune autre position que relative et absolue');
assert.doesNotMatch(css, /\binset\s*:/, 'aucun ancrage aux bords');
assert.doesNotMatch(css, /z-index|100vh|100vw|100dvh|vh\b|vw\b/, 'aucun empilement ni unité de viewport : Runner ne passe jamais au-dessus d’une action');
assert.doesNotMatch(mod, /<(button|a|input|select|textarea)\b|tabindex|onclick|\.focus\s*\(|setAttribute\('tabindex'|addEventListener/i, 'Runner ne dessine aucun bouton ni lien : les actions appartiennent à l’écran hôte');
assert.equal((css.match(/pointer-events\s*:\s*none/g) || []).length, 1, 'la figure ne capte aucun tap');
assert.match(css, /'html\[data-sr-keyboard="open"\] \.srRunner\{--rn-cap:56px\}'/, 'clavier Android ouvert : Runner se réduit à 56 px');
assert.doesNotMatch(mod, /(set|remove)Attribute\(\s*['"]data-sr-keyboard|dataset\.srKeyboard/, 'Runner lit l’état du clavier, il ne l’écrit jamais (propriétaire : mobile-ux-v262.js)');
assert.match(mod, /\.srRunnerFigure\{[^}]*width:min\(var\(--sr-runner-size\),var\(--rn-cap,999px\)\)/, 'taille effective = taille demandée plafonnée');
assert.match(css, /\.srRunnerFigure\{[^}]*pointer-events:none/);
assert.doesNotMatch(mod, /\bxl\b/, 'plus de grande taille de type desktop');

/* 7. Légèreté : un seul fichier, aucune dépendance, aucune image embarquée. */
assert.ok(Buffer.byteLength(mod) < 36 * 1024, 'runner-visual.js reste sous 36 Ko, commentaires compris (' + Buffer.byteLength(mod) + ' octets)');
assert.ok(require('zlib').gzipSync(mod).length < 12 * 1024, 'runner-visual.js reste sous 12 Ko compressé');
assert.doesNotMatch(mod, /data:image|<image\b|url\(['"]?https?:|@import|\brequire\s*\(|\bimport\s/, 'aucune image ni dépendance externe');

/* 8. API pure (sans DOM). */
assert.deepEqual(Array.from(R.STATES), ['neutral', 'analyzing', 'alert', 'success']);
assert.ok(Object.isFrozen(R.STATES) && Object.isFrozen(R.STATE_LABELS) && Object.isFrozen(R.SIZES), 'constantes publiques gelées');
assert.deepEqual({ ...R.STATE_LABELS }, { neutral: 'En attente', analyzing: 'Il réfléchit', alert: 'Une contrainte détectée', success: 'Tout est ok' });
assert.deepEqual({ ...R.SIZES }, { sm: 56, md: 88, lg: 120 }, 'tailles de téléphone : la plus grande taille nommée fait 120 px');
assert.deepEqual(Array.from(R.VARIANTS), ['bubble', 'sheet', 'panel'], 'trois variantes natives mobile');
assert.deepEqual(Array.from(R.SIDES), ['right', 'left']);
assert.ok(Object.isFrozen(R.VARIANTS) && Object.isFrozen(R.SIDES) && Object.isFrozen(R.TONES));
for (const s of R.STATES) assert.ok(R.isState(s));
for (const bad of ['', 'Neutral', 'thinking', null, undefined, 3, {}, []]) assert.equal(R.isState(bad), false, 'état refusé : ' + String(bad));
assert.equal(R.accessibleLabel('alert'), 'Runner, copilote terrain : une contrainte détectée');
assert.equal(R.accessibleLabel('inconnu'), 'Runner, copilote terrain : en attente');

/* Sans Runner monté, l'API globale ne crée rien et ne lève jamais. */
assert.equal(R.mounted(), 0);
for (const call of [() => R.setState('analyzing'), () => R.setState('inconnu'), () => R.setState(null), () => R.showMessage('Bonjour'), () => R.showMessage(null), () => R.showMessage({ text: {} }), () => R.hideMessage(), () => R.reset()])
  assert.equal(call(), false);
assert.equal(R.getState(), null);
assert.equal(R.mount('#absent'), null, 'pas de document : mount ne fait rien');
assert.equal(R.unmount(null), false);
assert.equal(R.unmount({}), false);

/* Contrastes WCAG AA (4,5:1) de toutes les paires texte / fond de la bulle, du bloc teinté et des titres. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }
assert.match(R.INK, /^#[0-9a-f]{6}$/); assert.match(R.SUBINK, /^#[0-9a-f]{6}$/);
assert.deepEqual(Object.keys(R.TONES), Array.from(R.STATES), 'un ton par état');
assert.ok(contrast(R.INK, '#ffffff') >= 4.5, 'encre sur bulle blanche');
assert.ok(contrast(R.SUBINK, '#ffffff') >= 4.5, 'texte secondaire sur bulle blanche');
for (const [state, tone] of Object.entries(R.TONES)) {
  for (const key of ['accent', 'tint', 'line', 'title']) assert.match(tone[key], /^#[0-9a-f]{6}$/, state + '.' + key);
  assert.ok(contrast(R.INK, tone.tint) >= 4.5, 'encre sur teinte ' + state + ' : ' + contrast(R.INK, tone.tint).toFixed(2));
  assert.ok(contrast(R.SUBINK, tone.tint) >= 4.5, 'texte secondaire sur teinte ' + state + ' : ' + contrast(R.SUBINK, tone.tint).toFixed(2));
  assert.ok(contrast(tone.title, tone.tint) >= 4.5, 'titre sur teinte ' + state + ' : ' + contrast(tone.title, tone.tint).toFixed(2));
}
assert.ok(contrast('#ffffff', R.TONES.alert.accent) >= 3, 'pictogramme blanc sur rouge d’alerte (graphique, 3:1)');
assert.ok(contrast('#ffffff', R.TONES.success.accent) >= 2.5, 'pictogramme blanc sur vert de succès (le texte reste dans l’encre)');

/* Normalisation des messages : texte seul, jamais du HTML, bornes dures. */
assert.equal(R.normalizeMessage(''), null);
assert.equal(R.normalizeMessage('   \n\t '), null);
assert.equal(R.normalizeMessage(null), null);
assert.equal(R.normalizeMessage({}), null);
assert.equal(R.normalizeMessage({ title: 'Titre seul' }), null, 'une bulle sans texte n’existe pas');
assert.equal(R.normalizeMessage(' Ligne\n  une \t deux ').text, 'Ligne une deux', 'espaces et retours repliés');
const hostile = R.normalizeMessage('<img src=x onerror=alert(1)> Électro <b>Dépôt</b>');
assert.equal(hostile.text, '<img src=x onerror=alert(1)> Électro <b>Dépôt</b>', 'le balisage reste du texte brut (échappé à l’écriture textContent)');
assert.equal(R.normalizeMessage('x'.repeat(500)).text.length, 280, 'texte borné à 280 caractères');
assert.ok(R.normalizeMessage('x'.repeat(500)).text.endsWith('…'));
assert.equal(R.normalizeMessage({ text: 'ok', title: 't'.repeat(200) }).title.length, 60, 'titre borné à 60 caractères');
assert.equal(Array.from(R.normalizeMessage('😀'.repeat(300)).text).length, 280, 'la coupe se fait par caractère : jamais au milieu d’un emoji');
assert.equal(R.normalizeMessage({ text: 42 }).text, '42', 'valeur non textuelle convertie');
assert.equal(R.normalizeMessage('a', { title: 'T' }).title, 'T', 'options en second argument');
assert.equal(R.normalizeMessage({ text: 'a', title: 'source' }, { title: 'option' }).title, 'source', 'la source prime sur les options');
assert.equal(R.normalizeMessage('a', { state: 'success' }).state, 'success');
assert.equal(R.normalizeMessage('a', { state: 'inconnu' }).state, null, 'état inconnu ignoré');
assert.equal(R.normalizeMessage('a', { side: 'left' }).side, 'left');
assert.equal(R.normalizeMessage('a', { side: 'right' }).side, 'right');
for (const side of ['top', 'bottom', 'diagonal']) assert.equal(R.normalizeMessage('a', { side }).side, null, 'côté refusé : ' + side);
assert.equal(R.normalizeMessage('a').duration, 0, 'sans durée, la bulle reste jusqu’à hideMessage');
assert.equal(R.normalizeMessage('a', { duration: 10 }).duration, 1500, 'durée minimale 1,5 s');
assert.equal(R.normalizeMessage('a', { duration: 99999999 }).duration, 120000, 'durée maximale 2 min');
assert.equal(R.normalizeMessage('a', { duration: -5 }).duration, 0);
assert.equal(R.normalizeMessage('a', { duration: 'abc' }).duration, 0);

/* 9. Alias : posé seulement s'il est libre ; jamais d'écrasement d'un global existant. */
const ctxFree = { Date, Array, String, Number, Math, isFinite };
vm.runInNewContext(mod, ctxFree);
assert.equal(typeof ctxFree.Runner, 'object');
assert.equal(ctxFree.Runner, ctxFree.StoreRunnerRunner, 'Runner est exactement StoreRunnerRunner');
const existing = { other: true };
const ctxTaken = { Date, Array, String, Number, Math, isFinite, Runner: existing };
vm.runInNewContext(mod, ctxTaken);
assert.equal(ctxTaken.Runner, existing, 'un global Runner déjà présent n’est jamais écrasé');
assert.equal(typeof ctxTaken.StoreRunnerRunner.setState, 'function', 'le nom canonique reste disponible');

/* 10. Surfaces branchées par leur propriétaire : Assistant, Planning, Accueil. */
const consumers = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.js') && f !== 'runner-visual.js');
const wired = consumers.filter(f => /StoreRunnerRunner|\bRunner\.(setState|showMessage|mount|reset|unmount|getState)\b|window\.Runner\b/.test(read(f)));
assert.deepEqual(wired.sort(), ['assistant-upgrade.js', 'home-refresh-v2.js', 'planning-ui-fixes.js'], 'Runner est branché par les propriétaires Assistant, Accueil et Planning : ' + wired.join(', '));
assert.doesNotMatch(read('src/chef-secteur.html'), /StoreRunnerRunner|\bRunner\.(setState|showMessage|mount|reset)\b|srRunner/, 'le noyau ne branche pas Runner');
for (const owner of ['planning-command-engine.js', 'store-explorer.js', 'visit-coverage.js', 'planning-generation-controller.js', 'sector-pilotage.js', 'terrain-planning-v1.js', 'planning-cascade-v181.js', 'range-planner-v2.js', 'store-opening-hours.js', 'planning-pro-plus.js', 'period-day-slider.js'])
  assert.doesNotMatch(read(owner), /StoreRunnerRunner|window\.Runner\b|(?<![A-Za-z])Runner\.(mount|unmount|setState|showMessage|hideMessage|reset|getState)\b|srRunner|srAssistantRunner|planningRunnerV269/, owner + ' ne connaît pas Runner (ni moteur, ni Forecast, ni Command Engine, ni Explorer Terrain)');

/* 11. Adaptateur Assistant (assistant-upgrade.js) : présentation pure, dérivée du chat, sans timer ni persistance. */
const assistant = read('assistant-upgrade.js');
const adapter = assistant.slice(assistant.indexOf('const RUNNER_SLOT_ID'), assistant.indexOf('function install(){'));
assert.ok(adapter.length > 1500, 'adaptateur trouvé');
assert.doesNotMatch(adapter, /setTimeout|setInterval|requestAnimationFrame/, 'aucun timer dans l’adaptateur');
assert.doesNotMatch(adapter, /localStorage|sessionStorage|__chefStorage|indexedDB|\bsave\s*\(|\bstate\.|window\.state|renderAll|generateWeek|storeRunnerPlanningCommand|StoreRunnerPlanningCommandUI/, 'aucune donnée, aucune écriture planning, aucun appel au Command Engine');
assert.doesNotMatch(adapter, /window\.(assistantBot|assistantAdd|assistantSend|toggleAssistant|assistantHandle)\s*=/, 'aucune fonction de l’Assistant ou du noyau remplacée');
assert.doesNotMatch(adapter, /addEventListener/, 'aucun écouteur de document : trois observateurs bornés');
assert.equal((adapter.match(/\.observe\(/g) || []).length, 3, 'trois observations : panneau (classe), messages (enfants directs), statut');
assert.match(adapter, /observer\.observe\(panel,\{attributes:true,attributeFilter:\['class'\]\}\)/, 'panneau : classe seulement, jamais son sous-arbre (Runner y vit)');
assert.match(adapter, /observer\.observe\(msgs,\{childList:true\}\)/, 'messages : enfants directs seulement');
assert.match(adapter, /pointer-events:none/, 'le conteneur de Runner ignore le toucher');
assert.match(adapter, /!panel\.classList\.contains\('open'\)\)return;/, 'rien n’est monté tant que le panneau n’a pas été ouvert');
assert.match(adapter, /variant:'sheet'/, 'en-tête de bottom sheet');
assert.doesNotMatch(adapter, /innerHTML/, 'texte du chat copié par textContent (via Runner), jamais en HTML');
assert.match(assistant, /\n\s*installRunnerPresence\(\);\n\s*\}/, 'installé une seule fois par install()');
assert.match(assistant, /window\.__assistantRunner/, 'garde d’installation unique');

/* Les marqueurs de copie qui pilotent les états existent bien dans le code propriétaire : si l’Assistant
   change un message, ce test casse au lieu de laisser Runner afficher un état faux. */
const core = read('src/chef-secteur.html'), engine = read('planning-command-engine.js');
assert.ok(core.includes("assistantBot('✦ Je réfléchis…')"), 'bulle d’attente de l’envoi en ligne');
for (const marker of ['IA en ligne indisponible', 'Erreur :', 'Actions appliquées', 'Semaine générée avec ', ' a été régénéré']) assert.ok(core.includes(marker), 'message du noyau : ' + marker);
for (const marker of ['Commande appliquée', 'Application impossible']) assert.ok(engine.includes(marker), 'message du Command Engine : ' + marker);
for (const marker of ['IA en ligne indisponible', 'Erreur :', 'Application impossible']) assert.ok(adapter.includes("'" + marker + "'"), 'alerte : ' + marker);
for (const marker of ['Actions appliquées', 'Commande appliquée', 'Semaine générée', 'a été régénéré']) assert.ok(adapter.includes("'" + marker + "'"), 'succès : ' + marker);

/* 12. Adaptateur Planning (planning-ui-fixes.js) : présentation pure, lit les propriétaires, n'écrit rien. */
const fixes = read('planning-ui-fixes.js');
const padapter = fixes.slice(fixes.indexOf('const RUNNER_SLOT_ID'), fixes.indexOf('function choiceSummary'));
assert.ok(padapter.length > 3000, 'adaptateur Planning trouvé');
assert.doesNotMatch(padapter, /setTimeout|setInterval|requestAnimationFrame/, 'aucun timer dans l’adaptateur Planning (seul `resetAfter` de Runner, une fois)');
assert.doesNotMatch(padapter, /localStorage|sessionStorage|__chefStorage|indexedDB|\bsave\s*\(/, 'aucune persistance');
assert.doesNotMatch(padapter, /\bstate\.[\w.\[\]'"]+\s*=(?!=)|window\.state\s*=(?!=)|Object\.assign\(\s*state\b|\bstate\.[\w.]+\.(push|splice|pop|shift|unshift|sort|reverse)\(/, 'aucune écriture dans state');
assert.doesNotMatch(padapter, /renderAll|renderWeek|generateWeek|regenerateDay|storeRunnerGenerateThreeWeeks|recalculatePlanningCascade\(|StoreRunnerPlanningCommandEngine|ChefReliability|\.propose\(|\.checkpoint\(/, 'aucun moteur, aucune génération, aucun recalcul, aucune commande n’est appelé');
assert.doesNotMatch(padapter, /StoreRunnerVisitCoverage\.(need|needOf|compute|evaluate|blocked|plannedDates|visitDays)\b/, 'aucun second calcul de couverture');
assert.equal((padapter.match(/forecastThreeWeeks\(/g) || []).length, 1, 'un seul appel au forecast, celui de son propriétaire');
assert.equal((padapter.match(/scheduleRoute\(/g) || []).length, 1, 'un seul appel à l’ordonnanceur, en lecture');
assert.doesNotMatch(padapter, /innerHTML/, 'texte posé par Runner en textContent, jamais en HTML');
assert.equal((padapter.match(/api\.mount\(/g) || []).length, 1, 'un seul montage de Runner, dans l’emplacement du Planning');
assert.match(padapter, /variant:'bubble',size:'sm'/, 'carte Planning discrète : variante bulle, 56 px');
assert.match(padapter, /\.observe\(tools,\{subtree:true,attributes:true,attributeFilter:\['disabled'\]\}\)/, 'unique observation ajoutée : le marqueur d’occupation du bouton de génération');
assert.match(padapter, /tools\.__runnerBusyObserver/, 'observateur posé une seule fois');
/* Ni provenance inventée, ni conseil que personne ne produit. */
const copy = padapter.match(/'[^']*[a-zàâéèêîôùç’][^']*'/gi).join(' ');
assert.doesNotMatch(copy, /plus court|meilleur|optim|idéal|recommand|conseill|parce que|car le|choisi pour/i, 'aucune justification inventée');
/* Journée passée : un rappel, jamais d’alerte ni de forecast sur l’avenir. */
const view = padapter.slice(padapter.indexOf('function runnerView'), padapter.indexOf('function ensureRunnerSlot'));
assert.match(view, /if\(localIso\(date\)<today\)return route\.length\?\{state:'neutral',title:'Journée passée'/, 'jour passé : garde explicite, état neutre');
assert.ok(view.indexOf('Journée passée') !== -1 && view.indexOf('Journée passée') < view.indexOf('runnerDayIssues(route,name)') && view.indexOf('Journée passée') < view.indexOf('runnerForecast(today)'), 'jour passé : retour avant toute alerte et tout forecast');
/* Emplacement : sous la Couverture, avant la liste des visites, dans la hiérarchie de ce module. */
assert.match(fixes, /const runnerSlot=ensureRunnerSlot\(\);\s*moveAfter\(notice\|\|tabs,tools\);observeGenerateBusy\(tools\);\s*let above=tools;if\(coverage\)\{moveAfter\(tools,coverage\);above=coverage\}\s*if\(runnerSlot\)\{moveAfter\(above,runnerSlot\);above=runnerSlot\}\s*moveAfter\(above,timeline\);/, 'Couverture › Runner › liste des visites');
assert.match(fixes, /#planningRunnerV269\{margin:0 0 12px;pointer-events:none\}#planningRunnerV269\[hidden\]\{display:none\}/, 'emplacement en flux, sans capter le toucher');
assert.match(fixes, /function run\(\)\{css\(\);syncSmartBrief\(\);if\(isEditingLocked\(\)\)return;reorderPlanning\(\);compactSettings\(\);restoreHotelStars\(\);try\{syncRunner\(\)\}catch\(e\)\{\}\}/, 'rien n’est touché pendant la saisie d’un réglage');
/* Les signaux lus existent bien chez leurs propriétaires : s’ils changent, ce test casse. */
const sources = { terrain: read('terrain-planning-v1.js'), cascade: read('planning-cascade-v181.js'), commands: read('planning-command-engine.js'), generation: read('planning-generation-controller.js'), hours: read('store-opening-hours.js'), coverage: read('visit-coverage.js'), slider: read('period-day-slider.js') };
assert.ok(sources.terrain.includes("new CustomEvent('chef-range-generated'"), 'succès de la génération 3 semaines');
assert.ok(sources.cascade.includes("source:'recalculatePlanningCascade'"), 'succès du recalcul');
assert.ok(sources.commands.includes("'store-runner:planning-command-applied'"), 'succès d’une commande planning');
assert.ok(sources.generation.includes('button.disabled=!!busy') && sources.generation.includes('data-planning-generate="three-weeks"'), 'marqueur d’occupation du bouton de génération');
for (const field of ['appointmentConflicts', 'closedCount', 'estimatedEnd', 'endLimit']) assert.ok(sources.hours.includes(field), 'ordonnanceur : ' + field);
assert.ok(sources.hours.includes("' RDV à vérifier'") && sources.hours.includes("sans créneau disponible'"), 'mots de l’ordonnanceur repris tels quels');
assert.ok(sources.coverage.includes('watch:watchCounts') && sources.coverage.includes('constraintIssues'), 'forecast : magasins à surveiller et contraintes incompatibles');
assert.ok(sources.slider.includes("reason:'period-date-loaded'"), 'changer de jour ne relit pas le forecast');
for (const [kind, text] of [['range', 'Tes 3 semaines sont générées.'], ['cascade', 'Le planning a été recalculé.'], ['command', 'La commande a été appliquée au planning.']]) assert.ok(padapter.includes(kind + ":'" + text + "'"), 'succès : ' + text);

/* Option `silent` de Runner : bulle visible, jamais annoncée deux fois. */
assert.equal(R.normalizeMessage('a', { silent: true }).silent, true);
assert.equal(R.normalizeMessage('a', { silent: 'oui' }).silent, false, 'seul true est accepté');
assert.equal(R.normalizeMessage('a').silent, false);

/* Livraison : « Quoi de neuf » V269 (et V268 conservée dessous), build cohérent. */
const whatsNew = read('store-runner-whats-new.js');
assert.match(whatsNew, /version:'269',\s*title:'Runner arrive dans ton Planning'/, 'entrée utilisateur V269 dans « Quoi de neuf »');
assert.match(whatsNew, /version:'268',\s*title:'Runner, ton copilote, dans l’Assistant'/, 'entrée V268 conservée');
assert.ok(whatsNew.indexOf("version:'269'") < whatsNew.indexOf("version:'268'") && whatsNew.indexOf("version:'268'") < whatsNew.indexOf("version:'267'"), 'versions récentes en premier');
const entry = whatsNew.slice(whatsNew.indexOf("version:'269'"), whatsNew.indexOf("version:'268'"));
assert.match(entry, /Planning/); assert.match(entry, /résume ta journée/); assert.match(entry, /ne modifie jamais ton planning/, 'dit qu’il ne modifie rien tout seul');

console.log('PASS: Runner Visual System V1 — présentation pure, Assistant, Planning et Accueil, mouvement borné, texte inerte');

/* V270 : adaptateur Accueil limité à la présence, pas à la tournée. */
const home = read('home-refresh-v2.js');
const homeAdapter = home.slice(home.indexOf('let homeRunner='), home.indexOf('function esc('));
assert.ok(homeAdapter.length > 600);
assert.doesNotMatch(homeAdapter, /localStorage|sessionStorage|__chefStorage|indexedDB|\bstate\.|\bsave\s*\(|generateWeek|renderAll|StoreRunnerVisitCoverage|StoreRunnerActivityMetrics|StoreRunnerPlanningCommandEngine|setTimeout|setInterval|addEventListener|MutationObserver/);
assert.match(homeAdapter, /homeRunnerArrived=true/);
assert.match(homeAdapter, /animate:!homeRunnerArrived/);
assert.match(homeAdapter, /homeRunner\.cancelMove\(\)/);
assert.match(homeAdapter, /homeRunner\.destroy\(\)/);
assert.match(home, /releaseHomeRunner\(\);box\.innerHTML=markup/);
assert.match(home, /#homeRunnerV270\{[^}]*pointer-events:none/);
assert.match(home, /<div id="homeRunnerOriginV270"/);
assert.match(whatsNew, /version:'270',\s*title:'Runner prend vie sur l’Accueil'/);
