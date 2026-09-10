const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8')}
function fail(message){throw new Error(message)}

const visual=read('visual-refresh-v1.js');
const planning=read('planning-ui-fixes.js');

if(/iosDayHero/.test(visual))fail('visual-refresh-v1.js ne doit plus créer ni styliser le hero planning legacy iosDayHero');
if(/function\s+renderHero\b/.test(visual))fail('visual-refresh-v1.js ne doit plus rendre un hero planning concurrent');
if(/planningHeroV2/.test(visual))fail('visual-refresh-v1.js ne doit pas prendre possession du hero planning V2');
if(/new\s+MutationObserver/.test(visual))fail('visual-refresh-v1.js doit rester passif et ne plus observer le DOM du planning');
if(!/store-runner:calendar-updated/.test(visual))fail('visual-refresh-v1.js doit réagir au contrat calendar-updated plutôt qu’aux mutations du planning');
if(!/planningHeroV2/.test(planning))fail('planning-ui-fixes.js doit rester propriétaire du hero planning V2');

console.log('Planning visual ownership guards: OK');
