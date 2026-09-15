const fs = require('fs');
const assert = require('assert');

const index = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const version = JSON.parse(fs.readFileSync('version.json','utf8'));
const source = fs.readFileSync('terrain-planning-v1.js','utf8');
const capacity = fs.readFileSync('daily-capacity.js','utf8');

assert(index.includes("'./range-planner-v2.js','./store-opening-hours.js','./boulanger-default-hours.js','./store-photos.js','./terrain-planning-v1.js','./working-hours-end.js'"), 'les horaires enseigne et les photos doivent charger avant le module terrain');
assert(sw.includes('"./terrain-planning-v1.js"'), 'le module terrain doit être disponible hors ligne');
assert.strictEqual(version.displayVersion, '179');
assert.strictEqual(version.latestBuild, '20260915-recalccapacity179');
assert(index.includes("const BUILD_REV='20260915-recalccapacity179'"));
assert(sw.includes('const BUILD_REV = "20260915-recalccapacity179"'));
assert(sw.includes('"./store-opening-hours.js"'), 'horaires disponibles hors ligne');
assert(sw.includes('"./boulanger-default-hours.js"'), 'défauts Boulanger/Darty disponibles hors ligne');
assert(sw.includes('"./store-photos.js"'), 'mémoire photo magasin disponible hors ligne');
assert(sw.includes('"./planning-manual-visits.js"'), 'les gestes manuels du planning doivent être disponibles hors ligne');
assert(index.includes("'./period-day-slider.js','./planning-manual-visits.js','./workdays-enforcer.js'"), 'le module manuel doit charger après le slider de jours');
assert(index.includes("'./daily-capacity.js','./planning-pro-plus.js'"), 'les réglages de capacité doivent rester dans le runtime PWA existant');
assert(capacity.includes("target.addEventListener('input'"), 'l’objectif hebdomadaire doit être persisté dès la saisie');
assert(capacity.includes('state.settings.target='), 'le module capacité doit conserver la valeur hebdomadaire choisie');
assert(!source.includes('window.generateWeek='), 'le module terrain ne doit pas reprendre generateWeek');
assert(!source.includes('root.generateWeek='), 'le module terrain ne doit pas reprendre generateWeek');
assert(!source.includes('window.generatePlanningRange='), 'le générateur de période stable doit rester propriétaire');
assert(source.includes('root.StoreRunnerTerrainPlanningV1=api'));
console.log('terrain-planning-runtime: OK');
