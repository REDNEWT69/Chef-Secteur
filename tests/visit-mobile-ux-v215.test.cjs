const fs=require('fs'),assert=require('assert/strict');
const ux=fs.readFileSync(__dirname+'/../visit-mobile-ux-v215.js','utf8');
const index=fs.readFileSync(__dirname+'/../index.html','utf8');

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

console.log('visit mobile ux v215 ok · sticky · actions intactes · famille · performance · retour haut · lecture seule');
