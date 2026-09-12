const fs=require('fs');
const path=require('path');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

// Garde-fou complémentaire à tests/titlesub-ownership.test.cjs (qui verrouille #titleSub,
// #appContextTitle et #homeSub). Celui-ci couvre un angle différent découvert au passage :
// l'encart "N magasins" du panneau Secteur était maintenu par une regex qui cherchait le
// texte affiché ("83 magasins" ou une formulation proche) pour le remplacer après coup -
// un correctif-du-correctif fragile qui se désynchronise dès que le libellé change, et qui
// avait laissé passer un compteur figé sans que rien ne le détecte.

const chef=read('src/chef-secteur.html');
const planningUiFixes=read('planning-ui-fixes.js');
const calendarEnhancements=read('calendar-enhancements.js');

if(!/id="departureStoreNotice"/.test(chef))throw new Error('L\'encart magasins du panneau Secteur doit garder un id stable (#departureStoreNotice)');
if(/\b83\s+magasins\b/i.test(chef))throw new Error('Un compteur de magasins codé en dur (83) traîne encore dans src/chef-secteur.html');
if(/samsung/i.test(chef.match(/id="departureStoreNotice"[^<]*/i)?.[0]||''))throw new Error('L\'encart magasins ne doit pas mentionner Samsung en dur');

if(/\\b83\\s\+magasins\\b|magasins\\s\+rh/.test(planningUiFixes))throw new Error('planning-ui-fixes.js: l\'ancienne regex de rattrapage sur le texte affiché ("83 magasins") doit être retirée');
if(!/getElementById\('departureStoreNotice'\)/.test(planningUiFixes))throw new Error('planning-ui-fixes.js: le compteur dynamique doit cibler #departureStoreNotice par id, pas par correspondance de texte');
if(/querySelectorAll\('#profilePanel \.notice'\)/.test(planningUiFixes))throw new Error('planning-ui-fixes.js: ne doit plus scanner tous les .notice du panneau Secteur par correspondance de texte');

// Relique déjà retirée par #105 (calendar-enhancements.js n'a plus de fonction activeCount) ;
// on verrouille son absence ici aussi, au même endroit que le reste de cette logique.
if(/return 83\b/.test(calendarEnhancements))throw new Error('calendar-enhancements.js: un repli codé en dur "return 83" est réapparu');

console.log('PASS: le compteur de magasins du panneau Secteur est ciblé par id, sans regex ni valeur figée.');
