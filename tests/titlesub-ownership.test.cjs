const fs=require('fs');
const path=require('path');

// #titleSub (secteur · départ · adresse) appartient exclusivement à
// store-runner-branding.js depuis la PR #101. Un second module qui y écrit (même pour un
// libellé différent) écrase silencieusement ce propriétaire à chaque rendu de l'en-tête -
// c'est exactement le bug remonté par Red sur connection-ui.js (et retrouvé aussi dans
// calendar-enhancements.js). Ce garde-fou scanne tous les modules runtime chargés par
// index.html et échoue si plus d'un seul mentionne #titleSub.

const root=process.cwd();
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const runtimeFiles=[...new Set([...index.matchAll(/['"](\.\/[A-Za-z0-9_./-]+\.js)['"]/g)].map(m=>m[1].slice(2)))];

// Un commentaire expliquant "ne pas écrire ici, ça appartient à X" est une documentation
// utile, pas une violation : on l'ignore pour ne chercher que du code qui référence l'id.
function stripComments(src){return src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'')}

const OWNER='store-runner-branding.js';
const owners=[];
for(const name of runtimeFiles){
  const file=path.join(root,name);
  if(!fs.existsSync(file))continue;
  const src=stripComments(fs.readFileSync(file,'utf8'));
  if(/titleSub/.test(src))owners.push(name);
}

if(!owners.includes(OWNER))throw new Error(`titleSub: le propriétaire attendu (${OWNER}) ne référence plus #titleSub`);
const others=owners.filter(name=>name!==OWNER);
if(others.length)throw new Error(`titleSub: propriété violée par ${others.join(', ')} (seul ${OWNER} doit écrire #titleSub)`);

console.log('PASS: #titleSub reste la propriété exclusive de '+OWNER+'.');
