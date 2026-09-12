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

// Garde-fou transversal : aucun libellé d'interface d'un module runtime ne doit mentionner
// « Samsung ». Les commentaires de code (retirés avant lecture), les données métier
// (persona envoyée à l'assistant IA, copie sur la distribution produit) et les
// référentiels magasins ne sont pas concernés - seule la marque du produit lui-même.
const root=process.cwd();
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const runtimeFiles=[...new Set([...index.matchAll(/['"](\.\/[A-Za-z0-9_./-]+\.js)['"]/g)].map(m=>m[1].slice(2)))];
function stripComments(source){return source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'')}
// La graphie en minuscule ("samsung") n'apparaît que dans du code de détection/nettoyage
// (store-runner-branding.js, home-refresh-v2.js) qui retire activement l'ancienne marque -
// jamais comme texte affiché. Seule la graphie capitalisée ("Samsung") signale un vrai
// libellé de prose destiné à l'utilisateur.
const BUSINESS_CONTENT_EXEMPT=['assistant-upgrade.js','region-stores.js'];
for(const name of runtimeFiles){
  if(BUSINESS_CONTENT_EXEMPT.includes(name))continue;
  const file=path.join(root,name);
  if(!fs.existsSync(file))continue;
  const source=stripComments(fs.readFileSync(file,'utf8'));
  if(source.includes('Samsung'))throw new Error(`${name}: un libellé d'interface mentionne encore Samsung en dur`);
}

// samsung-wordmark.svg a été retiré (fichier + cache sw.js), mais le nettoyage qui protège
// les installations déjà en cache doit rester en place.
if(fs.existsSync(path.join(root,'samsung-wordmark.svg')))throw new Error('samsung-wordmark.svg doit être supprimé du dépôt');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
if(/samsung-wordmark/i.test(sw))throw new Error('sw.js ne doit plus mettre samsung-wordmark.svg en cache');
const branding=fs.readFileSync(path.join(root,'store-runner-branding.js'),'utf8');
if(!/img\[src\*="samsung-wordmark"\]/.test(branding))throw new Error('store-runner-branding.js doit garder le nettoyage de l\'ancien wordmark pour les installations déjà en cache');

console.log('PASS: le compteur de magasins du panneau Secteur est ciblé par id, sans regex ni valeur figée, et plus aucun libellé d\'interface ne mentionne Samsung.');
