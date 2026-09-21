// V231-B — garde-fou d'hygiène du dépôt.
// Les fragments compressés historiques (payload/, applepayload/, applepayload2/)
// ne sont plus chargés : index.html récupère directement src/chef-secteur.html.
// Ce test empêche leur réintroduction silencieuse et vérifie que le propriétaire
// du chargement du noyau reste bien index.html.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const SELF = path.relative(ROOT, __filename).split(path.sep).join('/');

const RETIRES = [
  'payload',
  'applepayload',
  'applepayload2',
  'tools/build_payload.py'
];

for (const cible of RETIRES) {
  assert.equal(
    fs.existsSync(path.join(ROOT, cible)),
    false,
    `${cible} a été retiré en V231-B : ne pas le réintroduire sans propriétaire runtime`
  );
}

// Le noyau est chargé directement, sans passer par des fragments base64.
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(
  index,
  /fetch\(withRev\('\.\/src\/chef-secteur\.html'\)/,
  'index.html doit charger src/chef-secteur.html directement'
);

// Aucun fichier suivi ne doit encore pointer vers les fragments retirés.
function fichiersSuivis(dir) {
  const out = [];
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entree.name === '.git' || entree.name === 'node_modules' || entree.name === '__pycache__') continue;
    const complet = path.join(dir, entree.name);
    if (entree.isDirectory()) out.push(...fichiersSuivis(complet));
    else if (entree.isFile()) out.push(complet);
  }
  return out;
}

const MOTIFS = [/\bpayload\/part\d/, /\bapplepayload2?\//, /build_payload\.py/];
const coupables = [];
for (const fichier of fichiersSuivis(ROOT)) {
  const relatif = path.relative(ROOT, fichier).split(path.sep).join('/');
  if (relatif === SELF) continue;
  let contenu;
  try { contenu = fs.readFileSync(fichier, 'utf8'); } catch { continue; }
  if (MOTIFS.some(motif => motif.test(contenu))) coupables.push(relatif);
}
assert.deepEqual(
  coupables,
  [],
  `ces fichiers référencent encore les fragments retirés : ${coupables.join(', ')}`
);

console.log('PASS: fragments payload historiques retirés, noyau chargé directement par index.html.');
