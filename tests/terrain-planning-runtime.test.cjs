const fs = require('fs');
const assert = require('assert');

const index = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const version = JSON.parse(fs.readFileSync('version.json','utf8'));
const source = fs.readFileSync('terrain-planning-v1.js','utf8');

assert(index.includes("'./range-planner-v2.js','./store-opening-hours.js','./boulanger-default-hours.js','./store-photos.js','./terrain-planning-v1.js','./working-hours-end.js'"), 'les horaires enseigne et les photos doivent charger avant le module terrain');
assert(sw.includes('"./terrain-planning-v1.js"'), 'le module terrain doit être disponible hors ligne');
assert.strictEqual(version.displayVersion, '173');
assert.strictEqual(version.latestBuild, '20260915-pilotage173');
assert(index.includes("const BUILD_REV='20260915-pilotage173'"));
assert(sw.includes('const BUILD_REV = "20260915-pilotage173"'));
assert(sw.includes('"./store-opening-hours.js"'), 'horaires disponibles hors ligne');
assert(sw.includes('"./boulanger-default-hours.js"'), 'défauts Boulanger/Darty disponibles hors ligne');
assert(sw.includes('"./store-photos.js"'), 'mémoire photo magasin disponible hors ligne');
assert(!source.includes('window.generateWeek='), 'le module terrain ne doit pas reprendre generateWeek');
assert(!source.includes('root.generateWeek='), 'le module terrain ne doit pas reprendre generateWeek');
assert(!source.includes('window.generatePlanningRange='), 'le générateur de période stable doit rester propriétaire');
assert(source.includes('root.StoreRunnerTerrainPlanningV1=api'));
console.log('terrain-planning-runtime: OK');
