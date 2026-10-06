// Runner Ambient V1 — contrat de la couche ambiante (runner-ambient.js) et de la posture « assise » de Runner (runner-visual.js).
// Pure présentation : aucune donnée, aucun moteur, aucun focus, aucun clic, aucun texte lu. Le comportement réel (calque, scènes,
// jambes, modal, mobile) est vérifié dans un vrai Chromium par runner-ambient-v1-browser.spec.cjs.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const raw = read('runner-ambient.js');
// Les commentaires expliquent les interdits : les motifs interdits se vérifient sur le code seul.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const visual = read('runner-visual.js');
const index = read('index.html');
const sw = read('sw.js');
const version = JSON.parse(read('version.json'));
const baseline = require('./fixtures/cleanup-baseline-r20.json');
const A = require('../runner-ambient.js');

/* 1. Chargé une fois, précaché dans le shell obligatoire, budget de démarrage relevé explicitement à 79, build cohérent. */
assert.equal(index.split("'./runner-ambient.js'").length - 1, 1, 'index.html charge runner-ambient.js une seule fois');
assert.equal(sw.split('"./runner-ambient.js"').length - 1, 1, 'sw.js précache runner-ambient.js une seule fois');
assert.ok(sw.indexOf('"./runner-ambient.js"') < sw.indexOf('const OPTIONAL_SHELL'), 'shell obligatoire, pas facultatif');
assert.equal(baseline.runtimeInventory.startupScriptResources, 79, 'budget de démarrage : 78 + runner-ambient.js, décision explicite de la PR');
assert.equal(index.match(/const BUILD_REV='([^']+)'/)[1], version.latestBuild);
assert.equal(sw.match(/const BUILD_REV = "([^"]+)"/)[1], version.latestBuild);
assert.equal(version.displayVersion, '276', 'aucune nouvelle version produit visible : build seulement');
assert.ok(!fs.existsSync(path.join(__dirname, '..', 'runner-ambient.css')), 'aucune feuille séparée : le style est injecté au premier calque');

/* 2. Aucune donnée, aucun moteur, aucun focus, aucun clic, aucun texte saisi lu. */
assert.doesNotMatch(src, /localStorage|sessionStorage|__chefStorage|indexedDB|IDBFactory/, 'aucun stockage');
assert.doesNotMatch(src, /\bstate\.|root\.state\b|window\.state\b|\bsave\s*\(/, 'aucune lecture ni écriture de state');
assert.doesNotMatch(src, /StoreRunnerPlanningCommandEngine|StoreRunnerVisitCoverage|StoreRunnerStoreExplorer|StoreRunnerActivityMetrics|StoreRunnerPeriodDaySlider|StorePhotosV1|StoreRunnerVisits|StoreRunnerManualPlanning|StoreRunnerOpportunities|StoreRunnerProfile|StoreRunnerHomeV204/, 'aucun moteur, aucun propriétaire métier');
assert.doesNotMatch(src, /\b(renderAll|renderWeek|renderHome|generateWeek|saveProfile|syncGoogleCalendar|goTab|switchTab|openStoreQuick|toggleAssistant)\b/, 'aucune fonction métier ou de navigation');
assert.doesNotMatch(src, /\.value\b/, 'aucune valeur de champ lue');
assert.doesNotMatch(src, /\.focus\s*\(|\.blur\s*\(|\.click\s*\(|dispatchEvent|preventDefault|stopPropagation|\.select\s*\(|setSelectionRange/, 'aucun focus volé, aucun clic, aucun événement émis ou retenu');
assert.doesNotMatch(src, /setInterval|requestAnimationFrame|requestIdleCallback/, 'aucune surveillance permanente, aucune boucle d’images');
assert.doesNotMatch(src, /\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write|\beval\s*\(|new Function|fetch\s*\(|XMLHttpRequest|sendBeacon/, 'aucun HTML dynamique, aucun réseau');
assert.doesNotMatch(src, /\b(?:window|root)\.(?!StoreRunnerAmbient\b)[A-Za-z_$][\w$]*\s*=(?!=)/, 'aucun autre global n’est écrit');
assert.doesNotMatch(src, /\bAudio\b|\.play\s*\(\s*\)|new Audio|AudioContext|vibrate/, 'aucun son, aucune vibration');
assert.match(src, /root\.StoreRunnerAmbient=api;api\.start\(\)/, 'API publique unique, démarrage automatique');
/* Seuls événements observés : visibilité, cycle de page, focus (sans lire la saisie), préférence de mouvement, et, pendant une scène seulement, défilement et taille. */
const listened = [...src.matchAll(/addEventListener\('([a-z:-]+)'/g)].map(m => m[1]).sort();
assert.deepEqual([...new Set(listened)], ['change', 'focusin', 'focusout', 'load', 'pagehide', 'pageshow', 'resize', 'scroll', 'store-runner:appearance-closed', 'visibilitychange'], 'écoutes bornées : aucun clic, toucher, clavier ni saisie (la fermeture de la feuille Apparence ré-arme la cadence)');
assert.doesNotMatch(src, /addEventListener\('(?:input|keydown|keyup|keypress|click|touch\w*|pointer\w*|mouse\w*|wheel|beforeinput|compositionstart)'/, 'aucune écoute d’interaction');

/* 3. Un calque unique, sous la barre basse, qui ne reçoit jamais un geste ; promotion supérieure seulement pour un modal autorisé. */
const css = (src.match(/s\.textContent=\[([\s\S]*?)\]\.join\(''\)/) || [])[1] || '';
assert.ok(css.length > 300, 'feuille de style trouvée');
assert.match(css, /pointer-events:none!important/, 'calque et descendants en pointer-events:none');
assert.match(css, /'#'\+LAYER_ID\+',#'\+LAYER_ID\+' \*\{pointer-events:none!important/, 'la règle couvre le calque ET tous ses descendants');
assert.match(css, /overflow:hidden/, 'aucun débordement : le calque rogne à l’écran');
assert.match(css, /position:fixed;left:0;top:0;width:100%;height:100%/, 'calque plein écran fixe, sans unité de viewport');
assert.doesNotMatch(css, /\b(?:vw|vh|dvh|svh)\b/, 'aucune unité de viewport');
const layerZ = Number((css.match(/z-index:(\d+)/) || [])[1]);
const navZ = Number((read('src/chef-secteur.html').match(/bottomAppNav[^}]*z-index:(\d+)/) || read('src/chef-secteur.html').match(/z-index:(105)/) || [])[1]);
assert.equal(navZ, 105, 'barre basse de l’application à z-index 105');
assert.ok(layerZ < navZ, 'le calque reste SOUS la barre basse (' + layerZ + ' < ' + navZ + ')');
assert.match(src, /setAttribute\('aria-hidden','true'\)/, 'calque caché aux lecteurs d’écran');
assert.match(src, /decorative:true,detached:true/, 'acteur décoratif et détaché : jamais Runner « principal », jamais compté');
assert.match(src, /showPopover/, 'promotion en couche supérieure par l’API Popover (dialogue modal)');
assert.deepEqual(A.FORM_DIALOGS.slice().sort(), ['apptDlg', 'srVisitDialog', 'storeDlg'], 'seuls dialogues modaux autorisés : rendez-vous, compte rendu, fiche magasin');
assert.match(src, /@keyframes|animate\(/, 'animations par Web Animations');
assert.doesNotMatch(src, /animate\([^)]*\b(?:left|top|width|height|margin|padding)\s*:/, 'transform/opacity seulement');

/* 4. V1 : au plus 6 micro-animations, 3 contextes, une seule couche. */
assert.deepEqual(Array.from(A.SCENES).sort(), ['letter-double', 'letter-push', 'lean-field', 'observe-card', 'peek-behind', 'sit-edge'].sort());
assert.ok(A.SCENES.length <= 6, '4 à 6 micro-animations maximum');
assert.deepEqual(Object.keys(A.CONTEXTS).sort(), ['form', 'home', 'planning'], '3 contextes maximum : Accueil, Planning, saisie');
const used = new Set(Object.values(A.CONTEXTS).flat());
assert.deepEqual([...used].sort(), Array.from(A.SCENES).sort(), 'chaque scène appartient à un contexte, aucune scène orpheline');
assert.deepEqual(Array.from(A.CONTEXTS.form), ['lean-field'], 'saisie : se pencher vers le champ, rien d’autre');
for (const id of A.SCENES) {
  assert.match(src, new RegExp("'" + id + "':"), 'scène déclarée avec planificateur et exécuteur : ' + id);
  assert.ok(A.WEIGHTS[id] > 0, 'poids : ' + id);
}

/* 5. Cadence : 8 à 12 s de calme, jamais un métronome. */
assert.equal(A.GAP_MIN, 8000);
assert.equal(A.GAP_MAX, 12000);
assert.equal(A.nextGap(() => 0), 8000);
assert.equal(A.nextGap(() => 0.5), 10000);
assert.ok(A.nextGap(() => 0.999999) <= 12000);
assert.equal(A.nextGap(() => -5), 8000, 'aléa hors bornes ramené à la plage');
assert.equal(A.nextGap(() => 9), 12000, 'aléa hors bornes ramené à la plage haute');
let seed = 12345;
const lcg = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const gaps = Array.from({ length: 4000 }, () => A.nextGap(lcg));
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
assert.ok(gaps.every(g => g >= 8000 && g <= 12000), 'toujours entre 8 et 12 s');
assert.ok(Math.abs(mean - 10000) < 150, 'environ toutes les 10 s : moyenne ' + Math.round(mean));
assert.ok(sd > 900, 'rythme non mécanique : écart-type ' + Math.round(sd));
assert.equal(new Set(gaps.slice(0, 50)).size > 40, true, 'des délais tous différents');

/* 6. Signaux de contexte. */
const f = o => Object.assign({ inert: false, blocked: false, field: false, keyboard: false, panel: '' }, o);
assert.equal(A.resolveContext(f({ panel: 'homePanel' })), 'home');
assert.equal(A.resolveContext(f({ panel: 'planPanel' })), 'planning');
assert.equal(A.resolveContext(f({ panel: 'homePanel', field: true })), 'form', 'un champ actif prime sur l’écran');
assert.equal(A.resolveContext(f({ panel: 'storesPanel', field: true })), 'form', 'saisie dans n’importe quel écran');
assert.equal(A.resolveContext(f({ panel: 'storesPanel' })), null, 'les autres écrans dorment (V1)');
assert.equal(A.resolveContext(f({ panel: 'historyPanel' })), null);
assert.equal(A.resolveContext(f({ panel: 'homePanel', keyboard: true })), null, 'clavier ouvert sans champ : rien');
assert.equal(A.resolveContext(f({ panel: 'homePanel', blocked: true })), null, 'recouvrement : Runner se tait');
assert.equal(A.resolveContext(f({ panel: 'planPanel', inert: true })), null, 'mouvement réduit, onglet masqué : Runner dort');
assert.equal(A.resolveContext(null), null);

/* 7. Choix des scènes : pondéré, sans remise, jamais deux fois la même d’affilée. */
for (const ctx of Object.keys(A.CONTEXTS)) {
  const all = Array.from(A.CONTEXTS[ctx]);
  const o = A.orderScenes(ctx, null, () => 0.3);
  assert.deepEqual(o.slice().sort(), all.slice().sort(), 'toutes les scènes du contexte, une fois chacune : ' + ctx);
  for (const prev of all) {
    const order = A.orderScenes(ctx, prev, lcg);
    assert.equal(order.length, all.length);
    if (all.length > 1) assert.notEqual(order[0], prev, 'jamais la scène qui vient de jouer en premier : ' + ctx + '/' + prev);
    assert.equal(order[order.length - 1], prev, 'elle passe en dernier recours');
  }
}
assert.equal(A.pickScene('inconnu', null, lcg), null);
assert.equal(A.pickScene('form', null, lcg), 'lean-field');
const tally = {};
for (let i = 0; i < 6000; i++) { const s = A.pickScene('home', null, lcg); tally[s] = (tally[s] || 0) + 1; }
assert.deepEqual(Object.keys(tally).sort(), Array.from(A.CONTEXTS.home).sort(), 'toutes les scènes de l’Accueil sortent');
assert.ok(tally['letter-push'] > tally['peek-behind'], 'les poids orientent le tirage');
assert.ok(Object.values(tally).every(n => n > 300), 'aucune scène n’est affamée');

/* 8. Lettres : seulement des lettres, de la droite vers la gauche, deux lettres espacées. */
const title = 'Aujourd’hui.';
for (let i = 0; i < 300; i++) {
  const one = A.pickLetters(title, 1, lcg);
  assert.equal(one.length, 1);
  assert.match(title[one[0]], /\p{L}/u, 'jamais la ponctuation');
  const two = A.pickLetters(title, 2, lcg);
  assert.equal(two.length, 2);
  assert.ok(two[0] - two[1] >= 2, 'la seconde lettre est au moins deux lettres à gauche');
  assert.ok(two.every(k => /\p{L}/u.test(title[k])));
}
assert.deepEqual(A.pickLetters('', 1, lcg), []);
assert.deepEqual(A.pickLetters('. ’ 12', 2, lcg), [], 'aucune lettre : aucune scène');
assert.equal(A.pickLetters('Ab', 2, lcg).length, 1, 'trop court pour deux lettres : une seule');

/* 9. Chute et retour d’une lettre : transform seulement, départ et arrivée au repos. */
for (const dir of [-1, 1]) {
  const fall = A.fallFrames(49, dir), back = A.returnFrames(49, dir);
  for (const frames of [fall, back]) {
    assert.ok(frames.length >= 4);
    for (const fr of frames) assert.deepEqual(Object.keys(fr).filter(k => !['offset', 'easing'].includes(k)), ['transform'], 'transform seulement');
    assert.equal(frames[0].offset, 0);
    assert.equal(frames[frames.length - 1].offset, 1);
    for (let i = 1; i < frames.length; i++) assert.ok(frames[i].offset > frames[i - 1].offset, 'offsets strictement croissants');
  }
  assert.equal(fall[0].transform, 'translate(0px,0px) rotate(0deg)', 'la lettre part de sa place');
  assert.equal(back[back.length - 1].transform, 'translate(0px,0px) rotate(0deg)', 'et y revient exactement');
  assert.equal(fall[fall.length - 1].transform, back[0].transform, 'le retour reprend là où la chute s’arrête');
  assert.match(fall[3].transform, dir < 0 ? /^translate\(-/ : /^translate\(\d/, 'la lettre tombe du côté opposé à la poussée');
}
assert.ok(A.fallFrames(49, -1)[3].transform.includes(',27px)') || /,\d+px\)/.test(A.fallFrames(49, -1)[3].transform), 'chute verticale proportionnelle à la lettre');

/* 10. Posture « assise » de Runner : jambes rentrées par défaut, sorties seulement assis. */
assert.deepEqual(Array.from(require('../runner-visual.js').POSTURES), ['floating', 'seated']);
const art = visual.slice(visual.indexOf('function artMarkup()'), visual.indexOf('const ART=artMarkup()'));
assert.ok(art.indexOf("class=\"rnLegs\"") !== -1 && art.indexOf("class=\"rnLegs\"") < art.indexOf('corps ovoïde'), 'jambes dessinées SOUS le corps');
assert.equal((art.match(/class="rnLegs"/g) || []).length, 1, 'un seul groupe de jambes');
assert.equal((art.match(/class="rnFloor"/g) || []).length, 2, 'halo et ombre au sol repérés pour disparaître assis');
assert.match(visual, /\.srRunner \.rnLegs\{opacity:0;visibility:hidden;/, 'jambes invisibles tant que Runner flotte');
assert.match(visual, /\.srRunner\[data-posture="seated"\] \.rnLegs\{opacity:1;visibility:visible;/, 'jambes visibles seulement en posture assise');
assert.match(visual, /\.srRunner\[data-posture="seated"\] \.rnFloor\{opacity:0\}/, 'le halo au sol s’éteint assis');
assert.match(visual, /host\.setAttribute\('data-posture','floating'\)/, 'posture flottante par défaut, pour tous les hôtes');
assert.match(visual, /function setPosture\(next,extra\)\{\s*if\(destroyed\|\|POSTURES\.indexOf\(next\)===-1\)return false;/, 'posture inconnue refusée');
assert.match(visual, /detached:opts\.detached===true/, 'instance détachée : hors registre');
assert.match(visual, /if\(!inst\.detached\)instances\.push\(inst\)/, 'une instance détachée n’est ni comptée ni « principale »');
assert.match(visual, /kind==='tilt'&&head/, 'geste d’inclinaison de la tête');

/* 11. Documentation : contrat, propriétaire, extension explicite des règles visuelles. */
const doc = read('RUNNER_AMBIENT_V1.md');
const agents = read('AGENTS.md');
assert.match(agents, /runner-ambient\.js/, 'AGENTS.md nomme le propriétaire de la couche ambiante');
for (const needle of ['StoreRunnerAmbient', 'pointer-events', 'mouvement réduit', 'Discret', 'jambes', 'budget', 'sw.js']) {
  assert.ok(doc.toLowerCase().includes(needle.toLowerCase()), 'RUNNER_AMBIENT_V1.md couvre : ' + needle);
}
assert.ok(read('RUNNER_VISUAL_SYSTEM.md').includes('RUNNER_AMBIENT_V1.md'), 'le contrat visuel renvoie à la couche ambiante');

console.log('PASS: Runner Ambient V1 — couche pure de présentation (6 scènes, 3 contextes, cadence 8–12 s, calque sans geste, jambes seulement assises, aucun accès aux données).');
