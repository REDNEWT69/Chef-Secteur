// V234 — contrat du démarrage Store Runner : un seul écran de chargement.
//
// Le shell (index.html) charge src/chef-secteur.html puis le réécrit avec
// document.write(). Trois surfaces pouvaient donc se succéder à l'écran : le voile du
// shell, un second voile injecté dans le document runtime, puis l'ancien accueil tant
// que home-refresh-v2.js n'avait pas reconstruit l'interface. Ce test fige la règle
// inverse : une seule définition de loader, un seul propriétaire, aucune disparition
// pilotée par un délai fixe.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const homeRefresh = fs.readFileSync(path.join(ROOT, 'home-refresh-v2.js'), 'utf8');
const v182 = fs.readFileSync(path.join(ROOT, 'v182-fixes.js'), 'utf8');

// --- 1. Une seule définition du loader, réutilisée telle quelle -----------------------
assert.equal(
  (index.match(/data-store-runner-boot\b/g) || []).length, 1,
  'le loader ne doit être décrit qu’une fois dans index.html : le document runtime relit ce nœud'
);
assert.match(
  index, /const runtimeBootMarkup=shellBootNode\?shellBootNode\.outerHTML:''/,
  'le balisage runtime doit être le nœud du shell relu dans le DOM, pas une copie écrite à la main'
);
assert.match(
  index, /const runtimeBootStyle='<style id="srBootStyle">'\+\(bootStyleNode\?bootStyleNode\.textContent:''\)/,
  'le style runtime doit être le bloc #srBootStyle du shell, pas un second jeu de règles'
);
assert.match(index, /<style id="srBootStyle">/, 'le shell doit exposer son bloc de style de démarrage');
assert.doesNotMatch(index, /srRuntimeBoot/, 'l’ancien second loader ne doit plus exister');
assert.doesNotMatch(v182, /srRuntimeBoot/, 'v182-fixes.js ne doit plus retirer le voile de démarrage');

// --- 2. Un seul propriétaire, sans fichier supplémentaire à charger -------------------
// Le contrôleur vit dans le shell : `document.open()` conserve l'objet `window`, donc la
// closure survit au document.write(). Aucun script externe n'est requis — donc rien qui
// puisse manquer hors ligne et bloquer le voile au-dessus de l'application.
assert.match(index, /function armBootController\(\)/, 'le shell doit posséder le pilotage du loader');
assert.match(index, /document\.close\(\);\s*\n\s*\/\*[\s\S]*?\*\/\s*\n\s*try\{armBootController\(\)\}/,
  'le contrôleur doit être armé immédiatement après document.close(), avant toute peinture');
assert.doesNotMatch(index, /boot-v234\.js/, 'le pilotage du loader ne doit dépendre d’aucun fichier externe');
assert.equal(fs.existsSync(path.join(ROOT, 'boot-v234.js')), false,
  'boot-v234.js a été absorbé par le shell : ne pas le réintroduire comme second propriétaire');

// --- 3. Le voile part quand l'application est réellement utilisable -------------------
assert.match(
  index,
  /function appReady\(\)\{\s*return !!\(document\.querySelector\('#premiumHomeV2 \.phTop'\)&&document\.querySelector\('#bottomAppNav\[data-v2="1"\]'\)\);/,
  'la disparition doit être conditionnée à l’accueil final monté ET à la navigation reconstruite'
);
assert.match(homeRefresh, /document\.dispatchEvent\(new CustomEvent\('store-runner:home-rendered'\)\)/,
  'home-refresh-v2.js doit rester la source de l’événement d’accueil rendu');
assert.match(homeRefresh, /box\.id='premiumHomeV2'/, 'l’accueil final reste identifié par #premiumHomeV2');
assert.match(homeRefresh, /nav\.dataset\.v2='1'/, 'la navigation reconstruite reste marquée data-v2="1"');
assert.match(index, /requestAnimationFrame\(function\(\)\{window\.requestAnimationFrame\(function\(\)\{reveal\(reason\)\}\)\}\)/,
  'le voile ne doit s’effacer qu’après la peinture réelle de l’accueil final');

// --- 4. Robustesse : l'événement peut être manqué, jamais le résultat -----------------
// Le sondage par frame ne dépend d'aucun événement ; `load` sert de filet final.
assert.match(index, /frame=window\.requestAnimationFrame\(tick\)/,
  'un sondage par frame doit rendre le loader indépendant de store-runner:home-rendered');
assert.match(index, /window\.addEventListener\('load',onLoad\)/,
  'le retour à une application utilisable doit être garanti au plus tard à l’événement load');
assert.match(index, /reveal\(appReady\(\)\?'home-rendered':'app-loaded'\)/,
  'si l’accueil moderne ne monte jamais, l’application de base doit redevenir accessible');

// --- 5. Aucun délai arbitraire ne pilote la disparition -------------------------------
const controller = index.slice(index.indexOf('function armBootController()'), index.indexOf('function showBootError'));
const delais = Array.from(controller.matchAll(/setTimeout\([^)]*?,\s*(\d+)\)/g)).map(m => Number(m[1]));
assert.deepEqual(delais, [400],
  'le seul délai toléré est le nettoyage du nœud après le fondu ; aucun compte à rebours ne révèle l’application');
assert.match(controller, /node\.classList\.add\('srBootOut'\);/,
  'le fondu doit passer par srBootOut, qui coupe les pointer-events avant même le retrait du nœud');
assert.doesNotMatch(index, /4500/, 'plus aucun compte à rebours de 4,5 s ne doit exister dans le chargeur');

// --- 6. Plus un seul clic intercepté, et aucun flash de l'ancien accueil --------------
assert.match(index, /#storeRunnerBoot\.srBootOut\{opacity:0;pointer-events:none\}/,
  'dès le début du fondu, le voile doit laisser passer tous les clics');
assert.match(index, /html\[data-store-runner-booting\] \.homeHero,html\[data-store-runner-booting\] #homeKpis,html\[data-store-runner-booting\] #homePriority,html\[data-store-runner-booting\] #homeNext,html\[data-store-runner-booting\] #homePanel>\.sectionTitle\{display:none!important\}/,
  'l’ancien accueil doit être neutralisé dès la première peinture, pas seulement caché par le voile');
assert.match(index, /html\.replace\(\/<html\\b\/i,'<html data-store-runner-booting'\)/,
  'le document runtime doit porter le drapeau de démarrage dès son premier octet');
assert.match(index, /root\.removeAttribute\('data-store-runner-booting'\)/,
  'le drapeau doit être levé en même temps que le voile, sinon l’application resterait amputée');

// --- 7. Démarrages suivants : le build courant est servi depuis le cache --------------
assert.match(index, /fetch\(withRev\('\.\/src\/chef-secteur\.html'\)\)/,
  'le HTML principal versionné doit pouvoir profiter du cache navigateur/PWA');
assert.doesNotMatch(index, /fetch\(withRev\('\.\/src\/chef-secteur\.html'\),\{cache:'no-store'\}\)/,
  'le bootstrap ne doit plus forcer un aller-retour réseau pour le HTML versionné');

// V260 : le précache est rangé sous l'URL versionnée elle-même (?rev=BUILD_REV) ; un
// asset de la révision courante est donc retrouvé par correspondance exacte, avant le
// réseau. La recherche « ignoreSearch » n'est plus utilisée pour un asset versionné :
// elle pouvait servir la copie d'une autre version (tests/pwa-update-v260.test.cjs).
assert.ok(sw.indexOf("url.searchParams.get('rev') === BUILD_REV") >= 0, 'le service worker doit reconnaître les assets du BUILD_REV courant');
const ownStart = sw.indexOf('async function ownRevisionAsset(request)');
assert.ok(ownStart >= 0, 'stratégie des assets versionnés introuvable');
const versionedBlock = sw.slice(ownStart, sw.indexOf('\n}\n', ownStart));
assert.ok(versionedBlock.indexOf('cache.match(request)') >= 0 && versionedBlock.indexOf('cache.match(request)') < versionedBlock.indexOf('fetch(request'),
  'le cache doit être consulté avant le réseau pour un asset versionné');
assert.match(versionedBlock, /if \(cached\) return cached/, 'un hit cache doit court-circuiter le réseau au démarrage');
assert.doesNotMatch(versionedBlock, /ignoreSearch/, 'un asset versionné ne doit jamais être remplacé par une copie d’une autre version');
// Le cache est nominatif par build et les anciens sont purgés à l'activation : un asset
// repris sans query-string ne peut donc appartenir qu'à la version en cours.
assert.match(sw, /const CACHE_NAME = "chef-secteur-stable-" \+ BUILD_REV/,
  'le cache doit rester nominatif par build, sinon ignoreSearch pourrait servir une version périmée');
assert.match(sw, /keys\.filter\(k => k\.startsWith\('chef-secteur-'\) && k !== CACHE_NAME\)\.map\(k => caches\.delete\(k\)\)/,
  'les caches des builds précédents doivent être purgés à l’activation');

console.log('PASS: V234 — un seul loader, un seul propriétaire, disparition au rendu réel et build courant servi depuis le cache.');
