// Runner Visual System V1 — contrat de la couche visuelle (runner-visual.js).
// Runner est une présentation pure, pensée MOBILE d'abord (Android puis iPhone) : il ne lit ni
// n'écrit aucune donnée, n'appelle aucun moteur, n'est branché sur aucun écran, et ne se
// positionne jamais par rapport à l'écran (ni fixed, ni sticky). Le comportement réel (états,
// variantes, bulles, mouvement, safe areas, 360/390 px) est vérifié dans un vrai Chromium par
// runner-visual-v266-browser.spec.cjs.
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
assert.equal(version.displayVersion, '266', 'la version visible n’augmente pas');
assert.match(version.latestBuild, /-266$/, 'le build garde la version visible 266');
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

/* 10. Rien n'est branché : aucun module d'écran ne connaît Runner. */
const consumers = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.js') && f !== 'runner-visual.js');
const wired = consumers.filter(f => /StoreRunnerRunner|\bRunner\.(setState|showMessage|mount|reset)\b/.test(read(f)));
assert.deepEqual(wired, [], 'aucun module ne branche Runner dans cette PR : ' + wired.join(', '));
assert.doesNotMatch(read('src/chef-secteur.html'), /StoreRunnerRunner|\bRunner\.(setState|showMessage|mount|reset)\b|srRunner/, 'le noyau ne branche pas Runner');

console.log('PASS: Runner Visual System V1 — présentation pure, rien de branché, mouvement borné, texte inerte');
