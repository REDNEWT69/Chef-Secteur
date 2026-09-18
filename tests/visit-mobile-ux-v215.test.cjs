const fs=require('fs'),assert=require('assert/strict');
const ux=fs.readFileSync(__dirname+'/../visit-mobile-ux-v215.js','utf8');
const tabs=fs.readFileSync(__dirname+'/../visit-mobile-tabs-v216.js','utf8');
const index=fs.readFileSync(__dirname+'/../index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../sw.js','utf8');

assert(ux.includes("const DIALOG_ID='srVisitDialog'"),'V215 doit viser le vrai écran de visite');
assert(ux.includes('srVisitHeadV215'),'le header de visite doit recevoir une propriété visuelle dédiée');
assert(ux.includes('.sr-head>button'),'les actions existantes doivent être stylées comme enfants directs du header');
assert(!ux.includes('actions.appendChild'),'V215 ne doit jamais déplacer les boutons Opportunités / Sortie / Fermer');
assert(ux.includes("notes & photos classées ici"),'le message BLANC/BRUN doit être compact');
assert(ux.includes('srVisitPerfFoldV215'),'le brief performance doit devenir repliable');
assert(ux.includes('srVisitTopV215'),'un retour haut doit rester disponible après un long scroll');
assert(ux.includes('scrollTop>280'),'le retour haut ne doit apparaître qu’après défilement');
assert(!/complete\(|\.complete\(|status\s*=\s*['\"]completed/.test(ux),'la couche UX ne doit jamais terminer une visite');
assert(!/save\(|session\.|localStorage\.setItem/.test(ux),'la couche UX ne doit pas écrire de données métier');
assert(index.includes("'./visit-mobile-ux-v215.js'"),'le runtime doit charger V215');

assert(tabs.includes("const DIALOG_ID='srVisitDialog'"),'V216 doit rester propriétaire visuel du vrai écran de visite');
assert(tabs.includes("['view','Vue'],['action','Action'],['history','Historique']"),'V216 doit exposer Vue / Action / Historique');
assert(tabs.includes("activeTab='action'"),'Action doit être la vue terrain par défaut');
assert(tabs.includes("if(id!==lastVisitId){lastVisitId=id;activeTab='action'}"),'une nouvelle visite doit revenir sur Action');
assert(tabs.includes('srVisitOverviewV216'),'Vue doit posséder un résumé propre');
assert(tabs.includes('srVisitHistoryV216'),'Historique doit avoir son panneau dédié');
assert(tabs.includes('memoryFor(v.storeId)'),'Historique doit relire la mémoire métier existante');
assert(!/touchstart|touchmove|pointermove/.test(tabs),'V216 ne doit ajouter aucun geste vertical métier');
assert(!/session\.|localStorage\.setItem|\.complete\(|status\s*=\s*["']completed|save\(/.test(tabs),'V216 doit rester strictement en lecture seule');
assert(index.includes("'./visit-mobile-ux-v215.js','./visit-mobile-tabs-v216.js','./update-manager.js'"),'V216 doit charger après V215 et avant update-manager');
assert(sw.includes('"./visit-mobile-tabs-v216.js"'),'V216 doit être disponible hors ligne');

console.log('visit mobile ux v215/v216 ok · sticky · Vue Action Historique · lecture seule · offline');
