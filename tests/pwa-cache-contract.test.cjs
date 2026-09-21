// V231-D2 — le cache PWA ne doit contenir que des ressources réelles et servies.
//
// Deux dérives possibles, toutes deux invisibles à l'usage en ligne :
//   - une entrée du cache qui ne correspond à aucun fichier (404 silencieux au install) ;
//   - une entrée gardée alors que plus rien ne la charge (poids mort sur mobile).
// Et la dérive inverse, elle bien visible hors ligne :
//   - un module injecté par index.html mais absent du cache.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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

// 2. Tout script/style injecté par index.html doit être dans le cache, sinon il
//    manque hors ligne.
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

// 3. store-runner-logo.jpg a été retiré en V231-D2 : il n'était chargé par aucune
//    surface (index.html, manifest.webmanifest et le noyau utilisent app-icon.svg)
//    et sa seule référence était cette liste de cache.
assert.equal(
  fs.existsSync(path.join(ROOT, 'store-runner-logo.jpg')),
  false,
  'store-runner-logo.jpg a été retiré en V231-D2 : ne pas le réintroduire sans une surface qui le charge'
);
for (const fichier of ['sw.js', 'index.html', 'manifest.webmanifest', 'src/chef-secteur.html']) {
  assert.doesNotMatch(
    fs.readFileSync(path.join(ROOT, fichier), 'utf8'),
    /store-runner-logo\.jpg/,
    `${fichier} référence encore store-runner-logo.jpg`
  );
}

console.log(`PASS: ${cache.length} entrées de cache réelles, ${injectes.length} modules injectés tous cachés.`);
