const fs=require('fs');
const path=require('path');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

// Garde-fous transversaux demandés après la découverte de plusieurs reliques de l'ancienne
// marque du produit : aucun module ne doit réinjecter "Samsung"/"Chef Secteur SAMSUNG" dans
// une surface d'auto-branding de l'app (titre, en-tête, carte d'installation), et aucun
// compteur de magasins codé en dur ne doit réapparaître à sa place.

const chef=read('src/chef-secteur.html');
const brandingSurfaces=[
  [/<title>([^<]*)<\/title>/,'titre de la page'],
  [/<meta name="apple-mobile-web-app-title" content="([^"]*)">/,'meta apple-mobile-web-app-title'],
  [/<h1 id="appContextTitle">([^<]*)<\/h1>/,'#appContextTitle (placeholder statique)'],
  [/<b>Installer ([^<]*)<\/b>/,'carte d\'installation'],
];
for(const [re,label] of brandingSurfaces){
  const m=chef.match(re);
  if(!m)throw new Error(`Branding: surface introuvable pour vérification : ${label}`);
  if(/samsung/i.test(m[1]))throw new Error(`Branding: "${label}" contient encore Samsung en dur : ${JSON.stringify(m[1])}`);
}

// #titleSub ne doit plus être écrit par renderHeader() ni par le placeholder statique.
const renderHeaderMatch=chef.match(/function renderHeader\(\)\{[^}]*\}/);
if(!renderHeaderMatch)throw new Error('Branding: renderHeader() introuvable dans src/chef-secteur.html');
if(/titleSub|appContextTitle/.test(renderHeaderMatch[0]))throw new Error('Branding: renderHeader() ne doit plus écrire #titleSub ni #appContextTitle (propriété exclusive de store-runner-branding.js)');

// L'encart magasins du panneau Secteur est ciblé par id, plus par un texte figé.
if(!/id="departureStoreNotice"/.test(chef))throw new Error('Branding: l\'encart magasins du panneau Secteur doit garder un id stable (departureStoreNotice)');
if(/\b83\s+magasins\b/i.test(chef))throw new Error('Branding: un compteur de magasins codé en dur (83) traîne encore dans src/chef-secteur.html');

const planningUiFixes=read('planning-ui-fixes.js');
if(/\\b83\\s\+magasins\\b/.test(planningUiFixes))throw new Error('planning-ui-fixes.js: l\'ancienne regex de rattrapage "83 magasins" doit être retirée');
if(!/getElementById\('departureStoreNotice'\)/.test(planningUiFixes))throw new Error('planning-ui-fixes.js: le compteur dynamique doit cibler #departureStoreNotice par id');

const calendarEnhancements=read('calendar-enhancements.js');
if(/return 83\b/.test(calendarEnhancements))throw new Error('calendar-enhancements.js: le repli codé en dur "return 83" doit être retiré');
if(/Samsung/i.test(calendarEnhancements))throw new Error('calendar-enhancements.js: ne doit plus contenir de texte de marque en dur');

console.log('PASS: plus aucune relique Samsung/compteur figé dans le branding et le header.');
