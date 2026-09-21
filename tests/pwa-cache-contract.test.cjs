// V231-D2 — contrat du cache PWA.
//
// Trois dérives possibles, aucune visible à l'usage en ligne :
//   1. une entrée du cache qui ne correspond à aucun fichier — le service worker
//      échoue silencieusement à l'installation ;
//   2. un module injecté par index.html absent du cache — il manque hors ligne ;
//   3. un fichier gardé dans le cache alors que plus aucune surface ne le charge —
//      poids mort téléchargé et conservé sur chaque appareil terrain.
//
// Les deux premières sont des erreurs : le test échoue.
// La troisième est de la dette : le test la SIGNALE sans exiger de suppression.
// Retirer un asset du cache change `sw.js` au-delà de `BUILD_REV`, donc impose un
// bump de révision et une mise à jour de tous les appareils installés. Ça ne se
// déclenche pas pour du ménage : ça voyage avec une vraie mise à jour runtime/PWA.
// D'ici là, la liste ci-dessous est figée — un asset mort connu ne fait pas échouer
// Reliability, mais un NOUVEL asset mort, si.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Assets morts déjà constatés, tolérés jusqu'à la prochaine vraie mise à jour
// runtime/PWA qui bumpera BUILD_REV pour une autre raison. Cette liste ne doit que
// rétrécir. Y ajouter une entrée est une décision, pas un réflexe.
const MORTS_CONNUS = [
  // Aucune surface ne le charge : index.html, manifest.webmanifest et
  // src/chef-secteur.html utilisent tous app-icon.svg.
  'store-runner-logo.jpg'
];

function shell(nom) {
  const bloc = sw.match(new RegExp('const ' + nom + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  assert.ok(bloc, `${nom} introuvable dans sw.js`);
  return Array.from(bloc[1].matchAll(/"\.\/([^"]*)"/g)).map(m => m[1]);
}

const cache = [...shell('CORE_SHELL'), ...shell('OPTIONAL_SHELL')];
assert.ok(cache.length > 40, 'lecture du cache de sw.js cassée');

// 1. Tout ce que le cache promet doit exister sur le disque.
const fantomes = cache.filter(entree => entree !== '' && !fs.existsSync(path.join(ROOT, entree)));
assert.deepEqual(fantomes, [], `le cache PWA référence des fichiers absents : ${fantomes.join(', ')}`);

// 2. Tout script/style injecté par index.html doit être dans le cache.
const injectes = Array.from(index.matchAll(/'\.\/([A-Za-z0-9_.-]+\.(?:js|css))'/g))
  .map(m => m[1])
  .filter(nom => nom !== 'sw.js');
assert.ok(injectes.length > 50, 'lecture des modules injectés par index.html cassée');
const horsCache = [...new Set(injectes.filter(nom => !cache.includes(nom)))];
assert.deepEqual(
  horsCache,
  [],
  `ces modules sont chargés par index.html mais absents du cache de sw.js : ${horsCache.join(', ')}`
);

// 3. Assets morts : signalés, pas exigés. Une entrée du cache est justifiée si une
//    surface réellement servie la nomme — index.html, le manifeste, le noyau, ou
//    n'importe quel module racine chargé au runtime.
const SURFACES = ['index.html', 'manifest.webmanifest', 'src/chef-secteur.html']
  .concat(fs.readdirSync(ROOT).filter(nom => /\.(js|css)$/.test(nom) && nom !== 'sw.js'));
const texteDesSurfaces = SURFACES
  .map(nom => { try { return fs.readFileSync(path.join(ROOT, nom), 'utf8'); } catch { return ''; } })
  .join('\n');

// La page elle-même et sa racine ne sont nommées par personne, par construction.
const STRUCTURELS = ['', 'index.html'];
const morts = cache
  .filter(entree => !STRUCTURELS.includes(entree))
  .filter(entree => !texteDesSurfaces.includes(entree))
  .sort();

const inattendus = morts.filter(entree => !MORTS_CONNUS.includes(entree));
assert.deepEqual(
  inattendus,
  [],
  'ces fichiers sont gardés dans le cache PWA alors qu’aucune surface ne les charge : ' +
  `${inattendus.join(', ')}. Soit une surface doit les charger, soit ils sortent du cache ` +
  'lors de la prochaine mise à jour runtime/PWA — auquel cas ajoute-les à MORTS_CONNUS en connaissance de cause.'
);

// La liste ne doit que rétrécir : une entrée guérie doit sortir de MORTS_CONNUS.
const gueris = MORTS_CONNUS.filter(entree => !morts.includes(entree));
assert.deepEqual(
  gueris,
  [],
  `ces entrées ne sont plus des assets morts : ${gueris.join(', ')}. Retire-les de MORTS_CONNUS.`
);

console.log(
  `PASS: ${cache.length} entrées de cache réelles, ${injectes.length} modules injectés tous cachés. ` +
  `Assets morts tolérés (à retirer lors d'une prochaine mise à jour runtime/PWA) : ${morts.join(', ') || 'aucun'}.`
);
