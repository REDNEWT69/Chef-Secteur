// V231-D1 — aucun test ne doit exister sans être exécuté.
//
// Reliability exécute une partie des tests indirectement : un test enregistré dans
// .github/workflows/reliability-checks.yml en tire d'autres par `require(...)` ou
// `import(...)`. C'est volontaire, mais invisible depuis le workflow — lire la liste
// du YAML donne l'impression que ces tests-là sont orphelins alors qu'ils tournent.
//
// Ce garde-fou rend la couverture réelle vérifiable : chaque fichier de test du dépôt
// doit être soit cité dans le workflow, soit tiré (directement ou en cascade) par un
// fichier qui l'est. Un test ajouté sans être branché ni chaîné fait échouer Reliability.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/reliability-checks.yml'), 'utf8');

function lister(dossier, ...suffixes) {
  const complet = path.join(ROOT, dossier);
  if (!fs.existsSync(complet)) return [];
  return fs.readdirSync(complet)
    .filter(nom => suffixes.some(suffixe => nom.endsWith(suffixe)))
    .map(nom => `${dossier}/${nom}`)
    .sort();
}

const tousLesTests = [
  ...lister('tests', '.test.cjs', '.spec.cjs'),
  ...lister('v2/tests', '.test.mjs', '.spec.cjs')
];

assert.ok(tousLesTests.length > 100, 'la découverte des tests a échoué : trop peu de fichiers trouvés');

// Les fichiers que le workflow nomme explicitement.
const couverts = new Set(tousLesTests.filter(chemin => workflow.includes(chemin)));
assert.ok(couverts.size > 100, 'le workflow Reliability ne nomme presque aucun test : lecture cassée');

// Puis, en cascade, ceux que les fichiers couverts tirent eux-mêmes.
const MOTIF_CHAINE = /(?:require|import)\(\s*['"](\.\/[A-Za-z0-9_.-]+\.(?:test\.(?:cjs|mjs)|spec\.cjs))['"]\s*\)/g;
let progresse = true;
while (progresse) {
  progresse = false;
  for (const chemin of Array.from(couverts)) {
    let source;
    try { source = fs.readFileSync(path.join(ROOT, chemin), 'utf8'); } catch { continue; }
    const dossier = path.posix.dirname(chemin);
    for (const trouve of source.matchAll(MOTIF_CHAINE)) {
      const tire = path.posix.join(dossier, trouve[1].replace(/^\.\//, ''));
      if (tousLesTests.includes(tire) && !couverts.has(tire)) {
        couverts.add(tire);
        progresse = true;
      }
    }
  }
}

const orphelins = tousLesTests.filter(chemin => !couverts.has(chemin));
assert.deepEqual(
  orphelins,
  [],
  `ces tests existent mais ne sont exécutés par rien : ${orphelins.join(', ')}. ` +
  'Les ajouter à .github/workflows/reliability-checks.yml, ou les faire tirer par un test qui y figure.'
);

const chaines = tousLesTests.filter(chemin => !workflow.includes(chemin));
console.log(
  `PASS: ${tousLesTests.length} fichiers de test, tous exécutés ` +
  `(${tousLesTests.length - chaines.length} nommés dans Reliability, ${chaines.length} tirés par chaînage).`
);
