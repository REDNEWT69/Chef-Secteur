const fs=require('fs');
const assert=require('assert/strict');

const updater=fs.readFileSync('.github/workflows/update-official-stores.yml','utf8');
const deploy=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
const legacyNative=fs.readFileSync('.github/workflows/build-native-calendar.yml','utf8');
const reliability=fs.readFileSync('.github/workflows/reliability-checks.yml','utf8');

// Le scan planifié est en lecture seule sur le dépôt : il génère un candidat, jamais un commit.
assert.match(updater,/^\s*contents:\s*read\s*$/m,'le workflow annuaires doit rester en lecture seule sur le dépôt');
assert.doesNotMatch(updater,/^\s*contents:\s*write\s*$/m,'le workflow annuaires ne doit pas récupérer de droit d’écriture Git');
assert.doesNotMatch(updater,/\bgit\s+push\b/,'le workflow annuaires ne doit pousser aucune branche');
assert.doesNotMatch(updater,/\bgh\s+pr\s+create\b/,'le workflow annuaires ne doit pas dépendre de la création de PR par GITHUB_TOKEN');
assert.match(updater,/actions\/upload-artifact@v4/,'un snapshot modifié doit être publié comme artefact');
assert.match(updater,/official-stores-candidate-\$\{\{ github\.run_id \}\}/,'l’artefact candidat doit être identifiable par le run');
assert.match(updater,/git diff --quiet -- data\/official-stores\.json/,'le workflow doit distinguer un vrai changement de snapshot');

// Un simple scan des annuaires ne publie plus le site : seul un vrai changement fusionné dans main le fait.
assert.doesNotMatch(deploy,/^\s{2}workflow_run:\s*$/m,'Pages ne doit pas se redéployer après un simple run annuaires');
assert.match(deploy,/^\s{2}push:\s*$/m,'Pages doit rester déclenché par les pushes main');

// Le générateur historique v3-premium reste disponible uniquement à la demande.
assert.match(legacyNative,/^\s{2}workflow_dispatch:\s*$/m,'le workflow natif legacy doit rester lançable manuellement');
assert.doesNotMatch(legacyNative,/^\s{2}push:\s*$/m,'le workflow natif legacy ne doit plus se déclencher sur un push main');

assert.match(reliability,/python tests\/official_catalog_test\.py/,'Reliability doit conserver le test du catalogue officiel');
assert.match(reliability,/node tests\/ci-policy\.test\.cjs/,'Reliability doit exécuter son garde-fou CI/CD');

console.log('PASS: scans annuaires en lecture seule, candidats en artefact, Pages/main et workflow legacy protégés.');
