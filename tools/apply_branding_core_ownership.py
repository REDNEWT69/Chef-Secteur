from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "src" / "chef-secteur.html"
INDEX = ROOT / "index.html"
SW = ROOT / "sw.js"
TEST = ROOT / "tests" / "titlesub-ownership.test.cjs"
WORKFLOW = ROOT / ".github" / "workflows" / "temp-branding-core-ownership.yml"
SELF = Path(__file__).resolve()

OLD_REV = "20260912-titlesubfix1"
NEW_REV = "20260912-brandcore1"


def replace_exact(text: str, old: str, new: str, label: str, expected: int = 1) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: attendu {expected} occurrence(s), trouvé {count}")
    return text.replace(old, new)


core = CORE.read_text(encoding="utf-8")
core = replace_exact(core, "<title>Chef Secteur SAMSUNG</title>", "<title>Store Runner</title>", "title document")
core = replace_exact(core, '<meta name="apple-mobile-web-app-title" content="Chef Secteur SAMSUNG">', '<meta name="apple-mobile-web-app-title" content="Store Runner">', "titre PWA Apple")
core = replace_exact(core, '<h1 id="appContextTitle">Chef Secteur SAMSUNG</h1><p id="titleSub">Rhône-Alpes · planning terrain</p>', '<h1 id="appContextTitle">Store Runner</h1><p id="titleSub"></p>', "fallback header")
core = replace_exact(core, '<b>Installer Chef Secteur SAMSUNG</b>', '<b>Installer Store Runner</b>', "carte installation")
old_header = "function renderHeader(){var sector=state.profile.sectorName||'Mon secteur',base=state.profile.baseName||state.profile.baseAddress||'À définir';document.getElementById('appContextTitle').textContent='Chef Secteur SAMSUNG';document.getElementById('titleSub').textContent=sector+' · planning terrain';document.getElementById('headerDeparture').textContent=base;var pd=document.getElementById('planningDeparture');if(pd)pd.textContent=state.profile.baseName?(state.profile.baseName+(state.profile.baseAddress?' · '+state.profile.baseAddress:'')):'À définir avant de générer une tournée'}"
new_header = "function renderHeader(){var base=state.profile.baseName||state.profile.baseAddress||'À définir';document.getElementById('headerDeparture').textContent=base;var pd=document.getElementById('planningDeparture');if(pd)pd.textContent=state.profile.baseName?(state.profile.baseName+(state.profile.baseAddress?' · '+state.profile.baseAddress:'')):'À définir avant de générer une tournée'}"
core = replace_exact(core, old_header, new_header, "renderHeader legacy branding")
if "SAMSUNG" in core.upper():
    raise SystemExit("Le noyau contient encore un libellé SAMSUNG après correction")
CORE.write_text(core, encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")
if OLD_REV not in index:
    raise SystemExit(f"index.html: révision attendue absente: {OLD_REV}")
index = index.replace(OLD_REV, NEW_REV)
INDEX.write_text(index, encoding="utf-8")

sw = SW.read_text(encoding="utf-8")
if OLD_REV not in sw:
    raise SystemExit(f"sw.js: révision attendue absente: {OLD_REV}")
sw = sw.replace(OLD_REV, NEW_REV)
SW.write_text(sw, encoding="utf-8")

TEST.write_text(r'''const fs=require('fs');
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
''', encoding="utf-8")

# Ces deux fichiers ne servent qu'à appliquer ce patch dans la branche. Ils ne doivent pas
# apparaître dans la PR finale.
if WORKFLOW.exists():
    WORKFLOW.unlink()
if SELF.exists():
    SELF.unlink()

print("Patch branding core ownership appliqué.")
