const fs=require('fs');
const path=require('path');

const root=process.cwd();
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const core=fs.readFileSync(path.join(root,'src/chef-secteur.html'),'utf8');
const runtimeFiles=[...new Set([...index.matchAll(/['"](\.\/[A-Za-z0-9_./-]+\.js)['"]/g)].map(m=>m[1].slice(2)))];

function stripComments(src){return src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'')}
function runtimeReferences(id){
  const found=[];
  for(const name of runtimeFiles){
    const file=path.join(root,name);
    if(!fs.existsSync(file))continue;
    if(new RegExp(id).test(stripComments(fs.readFileSync(file,'utf8'))))found.push(name);
  }
  return found;
}

const BRAND_OWNER='store-runner-branding.js';
for(const id of ['titleSub','appContextTitle']){
  const owners=runtimeReferences(id);
  if(!owners.includes(BRAND_OWNER))throw new Error(`${id}: propriétaire attendu absent (${BRAND_OWNER})`);
  const others=owners.filter(name=>name!==BRAND_OWNER);
  if(others.length)throw new Error(`${id}: propriété violée par ${others.join(', ')} (seul ${BRAND_OWNER} doit le modifier)`);
}

// Le noyau peut déclarer les éléments dans le HTML, mais son JavaScript ne doit plus
// réécrire le branding derrière store-runner-branding.js.
for(const id of ['titleSub','appContextTitle']){
  const write=new RegExp(`getElementById\\(['"]${id}['"]\\)\\.textContent\\s*=`);
  if(write.test(core))throw new Error(`${id}: le noyau contient encore une écriture runtime interdite`);
}

// #homeSub est une information métier de l'accueil : renderHome() dans le noyau est son
// propriétaire. Aucun module runtime séparé ne doit le réécrire.
const homeWriters=runtimeReferences('homeSub');
if(homeWriters.length)throw new Error(`homeSub: propriété violée par ${homeWriters.join(', ')} (renderHome() dans le noyau est propriétaire)`);
const renderHome=core.match(/function renderHome\(\)\{[\s\S]*?\nfunction terrainCurrent\(/);
if(!renderHome||!/getElementById\(['"]homeSub['"]\)\.textContent\s*=/.test(renderHome[0]))throw new Error('homeSub: écriture attendue dans renderHome() absente');

// Les libellés de branding visibles du noyau sont génériques. Les référentiels et données
// métier externes ne sont volontairement pas scannés par ce garde-fou.
if(/Chef Secteur SAMSUNG|>[^<]*Samsung[^<]*</i.test(core))throw new Error('Branding noyau: ancien libellé Samsung visible détecté');
if(!/<title>Store Runner<\/title>/.test(core))throw new Error('Branding noyau: titre Store Runner absent');
if(!/<h1 id="appContextTitle">Store Runner<\/h1><p id="titleSub"><\/p>/.test(core))throw new Error('Branding noyau: fallback header générique absent');

console.log('PASS: ownership branding verrouillé dans les modules et le noyau HTML.');
