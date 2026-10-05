'use strict';
// #505 — pin de structure : l'étape différée « re-décore » de src/chef-secteur.html ne doit plus être une minuterie nue
// posée pendant l'analyse du document (elle s'exécutait avant boot(), stockage non ouvert). Le comportement réel est
// prouvé par tests/boot-storage-race-505-browser.spec.cjs ; ici on fige la forme, sans heuristique de temps.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'chef-secteur.html'), 'utf8');

const BOOT_CONDITION = "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();";
assert.ok(source.includes(BOOT_CONDITION), 'boot() reste lancé au DOMContentLoaded pendant l’analyse, immédiatement sinon');

const step = 'applyAppointmentsToPlan();save();renderAll();decorateWeek()';
assert.equal(source.split(step).length - 1, 1, 'une seule étape différée « re-décore »');
assert.ok(!source.includes('setTimeout(function(){try{' + step), 'plus de minuterie à 0 ms posée telle quelle pendant l’analyse du document');

const at = source.indexOf(step);
const block = source.slice(source.lastIndexOf('(function(){var deferred', at), source.indexOf('})();', at) + 5);
assert.ok(block.startsWith('(function(){var deferred=function(){try{' + step + '}catch(e){showError(e.message||String(e))}};'), 'l’étape est une fonction nommée dont les erreurs réelles sont toujours montrées par showError');
assert.ok(block.includes("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(deferred,0)},{once:true});else setTimeout(deferred,0)"), 'même condition que boot() : attendre DOMContentLoaded (écouteur posé après celui de boot), sinon boot() a déjà tourné');
assert.ok(source.indexOf(BOOT_CONDITION) < source.indexOf(block), 'l’écouteur de l’étape est posé APRÈS celui de boot() : ordre d’exécution garanti par l’ordre d’enregistrement');
assert.ok(!/setTimeout\([^)]*,\s*[1-9]\d{2,}\)/.test(block), 'aucun délai arbitraire');
assert.ok(!/\.catch\(function\(\)\{\}\)|catch\(e\)\{\}/.test(block), 'aucune erreur avalée');

// L'exécution reste dans le noyau : aucun module ne reprend le démarrage du stockage.
for (const file of ['connection-ui.js', 'index.html']) {
  assert.ok(!fs.readFileSync(path.join(__dirname, '..', file), 'utf8').includes(step), file + ' ne duplique pas l’étape différée du noyau');
}
console.log('PASS: #505 — l’étape différée du démarrage attend boot() (même condition), sans délai arbitraire ni erreur avalée');
