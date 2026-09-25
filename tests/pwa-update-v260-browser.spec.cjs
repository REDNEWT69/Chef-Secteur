/* V260 — cycle PWA complet dans un vrai Chromium mobile (390 px, service worker réel),
   avec un VRAI déploiement simulé : ce spec sert lui-même deux publications du dépôt
   (révision courante, puis révision suivante) et bascule de l'une à l'autre.

   Chaque publication marque trois modules (__MARKS) : une page dont le HTML et les
   scripts ne viennent pas de la même publication est détectée immédiatement.

   1. Première installation : aucun rechargement parasite ; hors ligne ; réouverture.
   2. Application ouverte pendant un déploiement, avec données et photo : proposition
      claire à 390 px (« Plus tard » / « Mettre à jour »), un seul rechargement, aucune
      boucle, aucun mélange, données et photo intactes, hors ligne sur la nouvelle version.
   3. Application fermée pendant le déploiement puis rouverte en ligne : le nouveau
      worker s'aligne dans la session, sans rechargement ; hors ligne ensuite = nouvelle
      version complète.
   4. Une fiche est ouverte quand la mise à jour est prête : aucun rechargement sous les
      doigts ; « Recharger » une fois la saisie terminée.
   5. Réseau qui ne répond pas : l'application installée s'ouvre en quelques secondes.

   V261.1 : un suffixe technique de cache peut renouveler atomiquement le shell sans
   changer le BUILD_REV visible. Le test dérive donc le vrai nom du cache depuis sw.js. */
const {test,expect,chromium}=require('@playwright/test');
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http');

const ROOT=path.join(__dirname,'..');
const SW=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
const REV=SW.match(/const BUILD_REV = "([^"]+)"/)[1];
const CACHE_SUFFIX=(SW.match(/const CACHE_NAME = "chef-secteur-stable-" \+ BUILD_REV(?: \+ "([^"]*)")?;/)||[])[1]||'';
const cacheName=rev=>'chef-secteur-stable-'+rev+CACHE_SUFFIX;
const NEXT=REV.replace(/(\d+)$/,n=>String(Number(n)+1));
const PORT=Number(process.env.STORE_RUNNER_PWA_PORT||4174);
const URL0=`http://127.0.0.1:${PORT}/`;
const DEVICE={viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'allow'};
const MARKED=['store-runner-visit-model.js','update-manager.js','store-runner-branding.js'];

function listOf(name){return Array.from(SW.match(new RegExp('const '+name+' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/"\.\/([^"]*)"/g)).map(m=>m[1]).filter(Boolean)}
function publish(dir,rev,mark){
  const files=[...new Set(['index.html','sw.js','version.json',...listOf('CORE_SHELL'),...listOf('OPTIONAL_SHELL')])];
  for(const f of files){
    let body=fs.readFileSync(path.join(ROOT,f));
    if(/\.(html|js|json)$/.test(f)&&rev!==REV)body=Buffer.from(body.toString('utf8').split(REV).join(rev));
    if(f==='version.json'){const v=JSON.parse(body.toString('utf8'));v.latestBuild=rev;v.displayVersion=rev.match(/(\d+)$/)[1];body=Buffer.from(JSON.stringify(v))}
    if(MARKED.includes(f))body=Buffer.concat([body,Buffer.from(`\n;(window.__MARKS=window.__MARKS||{})[${JSON.stringify(f)}]=${JSON.stringify(mark)};\n`)]);
    fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.writeFileSync(path.join(dir,f),body);
  }
}
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const site={current:'old',hangNavigation:false,dirs:{}};
let server=null,tmp=null;

test.beforeAll(async()=>{
  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sr-pwa-v260-'));
  site.dirs.old=path.join(tmp,'old');site.dirs.new=path.join(tmp,'new');
  publish(site.dirs.old,REV,'old');publish(site.dirs.new,NEXT,'new');
  server=http.createServer((req,res)=>{
    const u=new URL(req.url,URL0);const file=u.pathname==='/'?'/index.html':u.pathname;
    const navigation=file==='/index.html'&&!u.searchParams.has('rev');
    if(navigation&&site.hangNavigation)return;/* ne répond jamais */
    const full=path.join(site.dirs[site.current],decodeURIComponent(file));
    if(!full.startsWith(site.dirs[site.current])||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end('nf');return}
    res.writeHead(200,{'Content-Type':TYPES[path.extname(full)]||'application/octet-stream','Cache-Control':'max-age=600'});
    fs.createReadStream(full).pipe(res);
  });
  server.keepAliveTimeout=65000;
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
});
test.afterAll(async()=>{
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r))}
  if(tmp)fs.rmSync(tmp,{recursive:true,force:true});
});
test.beforeEach(()=>{site.current='old';site.hangNavigation=false});

async function launch(name,offline){
  const dir=path.join(tmp,'profile-'+name);
  const context=await chromium.launchPersistentContext(dir,{...DEVICE,offline:!!offline});
  const page=context.pages()[0]||await context.newPage();
  const nav={n:0,errors:[]};
  page.on('framenavigated',f=>{if(f===page.mainFrame())nav.n++});
  page.on('pageerror',e=>nav.errors.push(e.message));
  return {context,page,nav};
}
const ready=page=>page.waitForFunction(()=>!!document.querySelector('#premiumHomeV2 .phTop')&&window.StoreRunnerUpdates&&window.StorePhotosV1,null,{timeout:30000});
const controlled=page=>page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:30000});
async function snapshot(page){
  return page.evaluate(async()=>{
    let worker=null;const c=navigator.serviceWorker.controller;
    if(c)worker=await new Promise(r=>{const ch=new MessageChannel();ch.port1.onmessage=e=>r(e.data&&e.data.buildRev);c.postMessage({type:'GET_BUILD_REV'},[ch.port2]);setTimeout(()=>r(null),1500)});
    const reg=await navigator.serviceWorker.getRegistration();
    let waitingBuild=null;
    if(reg&&reg.waiting)waitingBuild=await new Promise(r=>{const ch=new MessageChannel();ch.port1.onmessage=e=>r(e.data&&e.data.buildRev);reg.waiting.postMessage({type:'GET_BUILD_REV'},[ch.port2]);setTimeout(()=>r('silence'),1500)});
    return {build:window.__STORE_RUNNER_BUILD_REV,marks:Object.values(window.__MARKS||{}),worker,waiting:!!(reg&&reg.waiting),waitingBuild,caches:(await caches.keys()).filter(k=>k.startsWith('chef-secteur-'))};
  });
}
function coherent(s,rev,mark){
  expect(s.build).toBe(rev);
  expect(s.marks).toEqual([mark,mark,mark]);
}
async function seed(page){
  return page.evaluate(async()=>{
    state.notes=state.notes||{};state.notes['pwa-v260']='note saisie avant la mise à jour';save();
    const blob=await new Promise(r=>{const c=document.createElement('canvas');c.width=48;c.height=48;const x=c.getContext('2d');x.fillStyle='#1428A0';x.fillRect(0,0,48,48);c.toBlob(r,'image/jpeg')});
    const sid=(state.stores&&state.stores[0]&&state.stores[0].id)||'st-pwa';
    await StorePhotosV1.addPhoto(sid,new File([blob],'v260.jpg',{type:'image/jpeg'}),'visit-pwa-v260');
    await __chefStorage.flush();
  });
}
async function data(page){
  return page.evaluate(async()=>{const all=await StorePhotosV1.listAll();return{note:state.notes&&state.notes['pwa-v260'],photos:all.filter(p=>p.visitId==='visit-pwa-v260').map(p=>({size:p.size>0,type:p.type,originalName:p.originalName})),mode:window.__chefStorageMode}});
}
const DATA={note:'note saisie avant la mise à jour',photos:[{size:true,type:'image/jpeg',originalName:'v260.jpg'}],mode:'indexedDB'};
async function install(name){
  const app=await launch(name);
  await app.page.goto(URL0,{waitUntil:'domcontentloaded'});await ready(app.page);await controlled(app.page);
  await app.page.waitForTimeout(1500);
  return app;
}

test('V260 : première installation sans rechargement parasite, hors ligne, réouverture',async()=>{
  test.setTimeout(120000);
  const {context,page,nav}=await install('first');
  await page.waitForTimeout(3000);
  expect(nav.n,'une seule navigation : plus de rechargement au clients.claim()').toBe(1);
  const first=await snapshot(page);coherent(first,REV,'old');expect(first.worker).toBe(REV);
  for(let i=0;i<3;i++){nav.n=0;await page.reload({waitUntil:'domcontentloaded'});await ready(page);expect(nav.n).toBe(1)}
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  coherent(await snapshot(page),REV,'old');
  await context.close();
  const again=await launch('first',true);
  await again.page.goto(URL0,{waitUntil:'domcontentloaded'});await ready(again.page);
  coherent(await snapshot(again.page),REV,'old');
  expect(nav.errors).toEqual([]);
  await again.context.close();
});

test('V260 : application ouverte pendant un déploiement — proposition, un seul rechargement, données et photo intactes',async()=>{
  test.setTimeout(150000);
  const {context,page,nav}=await install('open');
  await seed(page);
  site.current='new';
  await page.evaluate(()=>StoreRunnerUpdates.checkForUpdates(true));
  const banner=page.locator('#storeRunnerUpdateBanner');
  await expect(banner).toBeVisible();await expect(banner).toContainText('Nouvelle version disponible');
  const later=banner.getByRole('button',{name:'Plus tard'}),update=banner.getByRole('button',{name:'Mettre à jour'});
  await expect(later).toBeVisible();await expect(update).toBeVisible();
  const geometry=await page.evaluate(()=>{const b=document.getElementById('storeRunnerUpdateBanner').getBoundingClientRect();
    return{left:b.left,right:b.right,buttons:[...document.querySelectorAll('#storeRunnerUpdateBanner button')].filter(x=>!x.hidden).map(x=>{const r=x.getBoundingClientRect();return{right:r.right,height:r.height}}),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}});
  expect(geometry.left).toBeGreaterThanOrEqual(0);expect(geometry.right).toBeLessThanOrEqual(390);expect(geometry.overflow).toBe(false);
  for(const b of geometry.buttons){expect(b.right).toBeLessThanOrEqual(geometry.right);expect(b.height).toBeGreaterThanOrEqual(38)}
  /* « Plus tard » ferme le bandeau et il ne revient pas dans la session. */
  await later.tap();await expect(banner).toBeHidden();
  await page.evaluate(()=>StoreRunnerUpdates.checkForUpdates(true));await expect(banner).toBeHidden();
  /* Mise à jour depuis le menu. */
  nav.n=0;
  /* Le rechargement détruit le contexte d'exécution : fin normale de l'évaluation. */
  await page.evaluate(()=>StoreRunnerUpdates.installUpdate()).catch(()=>{});
  await page.waitForFunction(rev=>window.__STORE_RUNNER_BUILD_REV===rev,NEXT,{timeout:60000});await ready(page);
  await page.waitForTimeout(4000);
  expect(nav.n,'exactement un rechargement').toBe(1);
  const after=await snapshot(page);coherent(after,NEXT,'new');
  expect(after.worker).toBe(NEXT);expect(after.caches).toEqual([cacheName(NEXT)]);
  expect(await data(page)).toEqual(DATA);
  for(let i=0;i<2;i++){nav.n=0;await page.reload({waitUntil:'domcontentloaded'});await ready(page);await page.waitForTimeout(1500);expect(nav.n,'aucune boucle').toBe(1);coherent(await snapshot(page),NEXT,'new')}
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  coherent(await snapshot(page),NEXT,'new');expect(await data(page)).toEqual(DATA);
  expect(nav.errors).toEqual([]);
  await context.close();
});

test('V260 : fermée pendant le déploiement puis rouverte — alignement sans rechargement, hors ligne cohérent',async()=>{
  test.setTimeout(150000);
  const first=await install('closed');await seed(first.page);await first.context.close();
  site.current='new';
  const {context,page,nav}=await launch('closed');
  await page.goto(URL0,{waitUntil:'domcontentloaded'});await ready(page);
  /* Le nouveau worker s'installe en arrière-plan puis doit être activé (alignement) :
     plus aucun worker en attente, contrôleur sur la nouvelle révision, ancien cache purgé. */
  await expect.poll(async()=>{const x=await snapshot(page);return {worker:x.worker,waiting:x.waiting,caches:x.caches}},{timeout:60000,intervals:[500]})
    .toEqual({worker:NEXT,waiting:false,caches:[cacheName(NEXT)]});
  expect(nav.n,'alignement du worker sans rechargement').toBe(1);
  coherent(await snapshot(page),NEXT,'new');
  expect(await data(page)).toEqual(DATA);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  coherent(await snapshot(page),NEXT,'new');expect(await data(page)).toEqual(DATA);
  expect(nav.errors).toEqual([]);
  await context.close();
});

test('V260 : saisie ouverte pendant la mise à jour — aucun rechargement sous les doigts',async()=>{
  test.setTimeout(120000);
  const {context,page,nav}=await install('busy');
  site.current='new';nav.n=0;
  const pending=page.evaluate(()=>StoreRunnerUpdates.installUpdate());
  await page.evaluate(()=>document.getElementById('storeDlg').showModal());
  await pending;await page.waitForTimeout(2500);
  expect(nav.n,'la fiche ouverte n’est pas rechargée').toBe(0);
  expect(await page.evaluate(()=>document.getElementById('storeDlg').open)).toBe(true);
  await page.evaluate(()=>document.getElementById('storeDlg').close());
  const banner=page.locator('#storeRunnerUpdateBanner');
  await expect(banner).toContainText('Mise à jour prête');
  await banner.getByRole('button',{name:'Recharger'}).tap();
  await page.waitForFunction(rev=>window.__STORE_RUNNER_BUILD_REV===rev,NEXT,{timeout:30000});await ready(page);
  coherent(await snapshot(page),NEXT,'new');
  await context.close();
});

test('V260 : réseau qui ne répond pas — la version installée s’ouvre en quelques secondes',async()=>{
  test.setTimeout(90000);
  const {context,page}=await install('slow');
  site.hangNavigation=true;
  const t=Date.now();
  await page.reload({waitUntil:'commit',timeout:30000});await ready(page);
  expect(Date.now()-t).toBeLessThan(12000);
  coherent(await snapshot(page),REV,'old');
  site.hangNavigation=false;
  await context.close();
});
