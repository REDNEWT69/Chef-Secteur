const fs=require('fs');
const assert=require('assert/strict');

const updater=fs.readFileSync('.github/workflows/update-official-stores.yml','utf8');
const legacyNative=fs.readFileSync('.github/workflows/build-native-calendar.yml','utf8');
const reliability=fs.readFileSync('.github/workflows/reliability-checks.yml','utf8');

assert.match(updater,/^\s*pull-requests:\s*write\s*$/m,'le workflow annuaires doit pouvoir ouvrir une PR');
assert.match(updater,/git switch -c "\$branch"/,'la mise à jour annuaires doit quitter main avant le commit');
assert.match(updater,/git push --set-upstream origin "\$branch"/,'la mise à jour annuaires doit pousser une branche dédiée');
assert.match(updater,/gh pr create/,'la mise à jour annuaires doit ouvrir une PR');
assert.match(updater,/gh workflow run reliability-checks\.yml --ref "\$branch"/,'la PR automatisée doit relancer Reliability explicitement');
assert.doesNotMatch(updater,/^\s*git push\s*$/m,'un push nu depuis le checkout main ne doit pas revenir');

assert.match(legacyNative,/^\s{2}workflow_dispatch:\s*$/m,'le workflow natif legacy doit rester lançable manuellement');
assert.doesNotMatch(legacyNative,/^\s{2}push:\s*$/m,'le workflow natif legacy ne doit plus se déclencher sur un push main');

assert.match(reliability,/python tests\/official_catalog_test\.py/,'Reliability doit conserver le test du catalogue officiel');
assert.match(reliability,/node tests\/ci-policy\.test\.cjs/,'Reliability doit exécuter son garde-fou CI/CD');

console.log('PASS: les automatisations restent derrière branche/PR/Reliability et le workflow v3-premium reste manuel.');
