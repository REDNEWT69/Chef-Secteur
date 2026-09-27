const fs = require('fs');
const assert = require('assert/strict');

const optimizer = require('../planning-route-optimizer-v251.js');
const terrain = fs.readFileSync('terrain-planning-v1.js', 'utf8');
const optimizerSource = fs.readFileSync('planning-route-optimizer-v251.js', 'utf8');

// Régression V263 : le générateur 3 semaines historique publie encore `reason`.
// Ce format existe déjà en production et doit rester compris sans casser les autres
// consommateurs de store-runner:planning-updated.
assert.match(
  terrain,
  /store-runner:planning-updated'[\s\S]{0,180}reason:'three-week-snail'/,
  'le contrat historique du moteur 3 semaines doit rester identifiable'
);

assert.equal(
  typeof optimizer.planningEventSource,
  'function',
  'V251 doit exposer le normaliseur du contrat planning pour le test de régression'
);

assert.equal(
  optimizer.planningEventSource({ detail: { reason: 'three-week-snail' } }),
  'snail-geo-v185',
  'la génération principale 3 semaines doit déclencher la finalisation de période V251'
);
assert.equal(
  optimizer.planningEventSource({ detail: { source: 'snail-geo-v185' } }),
  'snail-geo-v185',
  'la source canonique V185 doit rester acceptée'
);
assert.equal(
  optimizer.planningEventSource({ detail: { source: 'generateWeek' } }),
  'generateWeek',
  'la génération une semaine doit rester acceptée'
);
assert.equal(
  optimizer.planningEventSource({ detail: { reason: 'manual-edit' } }),
  '',
  'une édition manuelle ne doit jamais être requalifiée en génération automatique'
);
assert.equal(
  optimizer.planningEventSource({ detail: { source: 'route-opt-v251', reason: 'three-week-snail' } }),
  'route-opt-v251',
  'une source explicite gagne toujours sur le fallback historique afin d’éviter les boucles'
);

assert.match(
  optimizerSource,
  /const source=planningEventSource\(event\)/,
  'le listener runtime doit utiliser le normaliseur testé, pas une lecture parallèle de detail.source'
);

console.log('V263 contrat génération 3 semaines -> optimisation V251 : OK');
