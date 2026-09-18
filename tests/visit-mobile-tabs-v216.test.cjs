const fs=require('fs'),assert=require('assert/strict');
const ux=fs.readFileSync(__dirname+'/../visit-mobile-tabs-v216.js','utf8');
const index=fs.readFileSync(__dirname+'/../index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../sw.js','utf8');

assert(ux.includes("const DIALOG_ID='srVisitDialog'"),'V216 doit viser le vrai écran de visite');
assert(ux.includes("['view','Vue'],['action','Action'],['history','Historique']"),'les trois onglets doivent exister');
assert(ux.includes("activeTab='action'"),'Action doit être la vue terrain par défaut');
assert(ux.includes("if(id!==lastVisitId){lastVisitId=id;activeTab='action'}"),'une nouvelle visite doit revenir sur Action');
assert(ux.includes('srVisitOverviewV216'),'Vue doit posséder un résumé propre');
assert(ux.includes('srVisitHistoryV216'),'Historique doit avoir un panneau dédié');
assert(ux.includes('StoreRunnerVisits.memoryFor'),'Historique doit réutiliser la mémoire métier existante en lecture seule');
assert(!/touchstart|touchmove|pointermove/.test(ux),'V216 ne doit ajouter aucun geste vertical métier');
assert(!/session\.|localStorage\.setItem|\.complete\(|status\s*=\s*["']completed|save\(/.test(ux),'V216 doit rester strictement en lecture seule');
assert(index.includes("'./visit-mobile-ux-v215.js','./visit-mobile-tabs-v216.js','./update-manager.js'"),'V216 doit charger après V215 et avant update-manager');
assert(sw.includes('"./visit-mobile-tabs-v216.js"'),'V216 doit être disponible hors ligne');

console.log('visit mobile tabs v216 ok · Vue Action Historique · lecture seule · ordre runtime · offline');
