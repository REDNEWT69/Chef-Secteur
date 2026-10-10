/* Runner 3D Lab : sert la page du Lab sur une origine fictive (https://lab.test/) avec EXACTEMENT les
   fichiers que l'artefact publiera (lab/runner-3d/manifest.json), enveloppés comme le fait la publication
   (doctype, charset, viewport-fit=cover). Utilisé par les tests ; ne touche ni l'application ni son cache. */
const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const MANIFEST=JSON.parse(fs.readFileSync(path.join(ROOT,'lab/runner-3d/manifest.json'),'utf8'));
const ORIGIN='https://lab.test';
const TYPES={'.js':'text/javascript','.webp':'image/webp','.html':'text/html'};
function wrap(fragment){
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
   +'<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+fragment+'</body></html>';
}
async function install(page){
  const requests=[];
  await page.route(ORIGIN+'/**',route=>{
    const u=new URL(route.request().url());requests.push(u.pathname);
    if(u.pathname==='/'||u.pathname==='/index.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:wrap(fs.readFileSync(path.join(ROOT,MANIFEST.page),'utf8'))});
    const rel=MANIFEST.files[u.pathname.slice(1)];
    if(!rel)return route.fulfill({status:404,body:''});
    return route.fulfill({path:path.join(ROOT,rel),contentType:TYPES[path.extname(rel)]||'application/octet-stream'});
  });
  /* Toute requête qui sortirait du Lab est un défaut : on la bloque et on la signale. */
  const outside=[];
  await page.route(u=>!u.href.startsWith(ORIGIN)&&!u.href.startsWith('data:')&&!u.href.startsWith('blob:'),route=>{outside.push(route.request().url());route.abort()});
  return{requests,outside,url:ORIGIN+'/'};
}
module.exports={install,wrap,MANIFEST,ORIGIN,ROOT};
