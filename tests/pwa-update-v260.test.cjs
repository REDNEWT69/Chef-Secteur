/* V260 — le vrai sw.js, exécuté dans un bac à sable avec un faux réseau et un faux
   Cache Storage. Chaque cas reproduit un défaut mesuré sur un vrai Chromium avant V260 :

   1. install() précache l'URL versionnée (?rev=BUILD_REV), jamais une copie CDN périmée,
      et refuse de s'installer si index.html publié n'est pas celui de sa révision ;
   2. un seul fichier runtime manquant → pas d'activation d'une version incomplète ;
   3. un asset d'une AUTRE révision n'est jamais remplacé par la copie d'une autre version
      (mélange ancien/nouveau constaté : update-manager.js V259 servi à une page V260) ;
   4. un cache.put() refusé (quota plein) ne transforme plus une réponse réseau en 503 ;
   5. les « ?ts=Date.now() » ne font plus grossir le cache à chaque ouverture du catalogue ;
   6. navigation : réseau qui traîne → version installée après le délai ; réseau plus
      ancien que la version installée → version installée ; hors ligne → version installée ;
   7. activate() ne remplace que les caches de fichiers de l'application ;
   8. aucune donnée utilisateur (IndexedDB, localStorage) n'est lue ni écrite par le worker.

   V261.1 : le namespace de cache peut aussi porter un suffixe technique de hotfix tout en
   gardant le même BUILD_REV visible. Cela permet de renouveler atomiquement un module du
   shell sans prétendre à une nouvelle version utilisateur. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const SOURCE=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
const INDEX=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const REV=SOURCE.match(/const BUILD_REV = "([^"]+)"/)[1];
const CACHE_SUFFIX=(SOURCE.match(/const CACHE_NAME = "chef-secteur-stable-" \+ BUILD_REV(?: \+ "([^"]*)")?;/)||[])[1]||'';
const cacheName=rev=>'chef-secteur-stable-'+rev+CACHE_SUFFIX;
const SCOPE='https://store-runner.test/';

const CODE=SOURCE.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
assert.doesNotMatch(CODE,/indexedDB|localStorage|sessionStorage|deleteDatabase/,'le worker ne touche jamais aux données utilisateur');
assert.doesNotMatch(SOURCE.slice(SOURCE.indexOf("self.addEventListener('install'"),SOURCE.indexOf("self.addEventListener('activate'")),/skipWaiting\(\)/,
  'une nouvelle version ne s’active jamais seule : l’utilisateur (ou l’alignement de révision) décide');

function list(name){return Array.from(SOURCE.match(new RegExp('const '+name+' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/"(\.\/[^"]*)"/g)).map(m=>m[1])}
const CORE=list('CORE_SHELL'),OPTIONAL=list('OPTIONAL_SHELL');
/* Tout ce qu'index.html injecte au démarrage est obligatoire (plus d'« optionnel » qui
   laissait une version cassée hors ligne). */
const injected=[...new Set(Array.from(INDEX.matchAll(/'(\.\/[A-Za-z0-9_.-]+\.(?:js|css))'/g)).map(m=>m[1]))];
const optionalButInjected=injected.filter(a=>a!=='./sw.js'&&!CORE.includes(a));
assert.deepEqual(optionalButInjected,[],'modules chargés au démarrage mais non obligatoires : '+optionalButInjected.join(', '));
for(const a of ['./','./index.html','./src/chef-secteur.html','./manifest.webmanifest','./app-icon.svg'])assert.ok(CORE.includes(a),a+' doit être obligatoire');

function key(input){return typeof input==='string'?input:input.url}
function strip(u){const x=new URL(u);return x.origin+x.pathname}
function makeCaches(o={}){
  const stores=new Map();
  function open(name){
    if(!stores.has(name))stores.set(name,new Map());
    const m=stores.get(name);
    return {
      async match(req,opts){const k=key(req);if(m.has(k))return m.get(k).clone();if(opts&&opts.ignoreSearch){for(const [kk,v] of m)if(strip(kk)===strip(k))return v.clone()}return undefined},
      async put(req,res){if(o.putFails)throw Object.assign(new Error('QuotaExceededError'),{name:'QuotaExceededError'});m.set(key(req),res.clone())},
      async keys(){return [...m.keys()]}
    };
  }
  return {stores,api:{async open(n){return open(n)},async keys(){return [...stores.keys()]},async delete(n){return stores.delete(n)},async match(){return undefined}}};
}
function page(rev,marker){return `<!doctype html><script>const BUILD_REV='${rev}';</script>${marker||''}`.padEnd(1200,' ')}
/* Réseau simulé : une table URL → fonction. `offline` coupe tout. */
function makeNet(routes,o={}){
  const calls=[];
  const fetch=async(input,init)=>{
    const url=key(input);calls.push(url);
    if(o.offline)throw new TypeError('Failed to fetch');
    for(const [test,fn] of routes)if(test(url))return fn(url,init);
    return new Response('nf',{status:404});
  };
  return {fetch,calls};
}
const byPath=(p)=>u=>new URL(u).pathname===new URL(p,SCOPE).pathname;
function defaultRoutes(indexRev,extra){
  return [
    ...(extra||[]),
    [byPath('./index.html'),()=>new Response(page(indexRev),{headers:{'Content-Type':'text/html'}})],
    [u=>new URL(u).pathname==='/',()=>new Response(page(indexRev),{headers:{'Content-Type':'text/html'}})],
    [()=>true,u=>new Response('/*'+new URL(u).pathname+'@'+(new URL(u).searchParams.get('rev')||'none')+'*/',{headers:{'Content-Type':'text/javascript'}})]
  ];
}
function boot(o={}){
  const handlers={};const cs=makeCaches(o);const net=o.net||makeNet(defaultRoutes(REV));
  let claimed=0,skipped=0;
  const self={registration:{scope:SCOPE},addEventListener:(t,f)=>{handlers[t]=f},skipWaiting(){skipped++},clients:{async claim(){claimed++}}};
  const ctx={self,caches:cs.api,fetch:(...a)=>net.fetch(...a),URL,Request,Response,Headers,Promise,Error,TypeError,String,Number,Object,Array,Math,console,
    setTimeout:(fn,ms)=>setTimeout(fn,Math.ceil((ms||0)/(o.timeScale||1))),clearTimeout};
  vm.runInNewContext(SOURCE,ctx);
  async function run(type,extra){let p=null;const ev=Object.assign({waitUntil(x){p=x},respondWith(x){p=x}},extra||{});handlers[type](ev);return p?await p:undefined}
  return {cs,net,handlers,run,claimed:()=>claimed,skipped:()=>skipped,
    fetch:async(url,mode)=>{const request=mode==='navigate'?{url:new URL(url,SCOPE).href,method:'GET',mode:'navigate'}:new Request(new URL(url,SCOPE).href);
      let p=null;handlers.fetch({request,respondWith(x){p=x},waitUntil(){}});return p?await p:'passthrough'}};
}
const NAME=cacheName(REV);
const OTHER='20200101-ancienne100';

let finished=false,step='début';
process.on('beforeExit',()=>{if(!finished){console.error('FAIL: bloqué à : '+step);process.exit(1)}});
(async()=>{
  step='1. install versionnée et vérifiée';
  {
    const w=boot();await w.run('install');
    const cache=w.cs.stores.get(NAME);assert.ok(cache,'cache de la révision créé');
    for(const a of CORE.filter(a=>a!=='./'&&a!=='./index.html'))assert.ok(cache.has(new URL(a,SCOPE).href+'?rev='+REV),'précaché sous son URL versionnée : '+a);
    assert.ok(w.net.calls.every(u=>new URL(u).searchParams.get('rev')===REV),'install ne demande QUE des URL versionnées (jamais une copie CDN périmée)');
    assert.equal(await (await cache.get(SCOPE)).clone().text(),page(REV),'shell de la révision rangé sous ./');
    assert.ok(cache.has(SCOPE+'index.html'),'et sous ./index.html');
    assert.ok(cache.has(SCOPE+'data/official-stores.json'),'données optionnelles rangées sans paramètre');
  }
  step='1b. index.html publié d’une autre révision → installation refusée';
  {
    const w=boot({net:makeNet(defaultRoutes(OTHER))});
    await assert.rejects(()=>w.run('install'),/ne correspond pas/,'pas d’installation sur un index.html d’une autre révision');
    assert.equal(w.skipped(),0);
  }
  step='2. un fichier obligatoire manquant → aucune activation d’une version incomplète';
  {
    let tries=0;
    const net=makeNet(defaultRoutes(REV,[[byPath('./update-manager.js'),()=>{tries++;return new Response('x',{status:500})}]]));
    const w=boot({net,timeScale:100});
    await assert.rejects(()=>w.run('install'),/update-manager\.js/);
    assert.equal(tries,3,'trois essais avant de renoncer (réseau mobile)');
    let flaky=0;
    const net2=makeNet(defaultRoutes(REV,[[byPath('./store-photos.js'),()=>(++flaky<2?Promise.reject(new TypeError('coupure')):new Response('ok'))]]));
    const w2=boot({net:net2,timeScale:100});await w2.run('install');
    assert.equal(flaky,2,'une coupure passagère est rattrapée par un nouvel essai');
    const w3=boot({net:makeNet(defaultRoutes(REV,[[byPath('./data/official-stores.json'),()=>new Response('x',{status:500})]])),timeScale:100});
    await w3.run('install');
    assert.ok(w3.cs.stores.get(NAME).has(SCOPE+'store-photos.js?rev='+REV),'une donnée optionnelle absente ne bloque pas la mise à jour');
  }
  step='3. assets : révision courante depuis le cache, autre révision jamais mélangée';
  {
    const w=boot();await w.run('install');
    const before=w.net.calls.length;
    const own=await w.fetch('./store-photos.js?rev='+REV);
    assert.equal(await own.text(),'/*/store-photos.js@'+REV+'*/');
    assert.equal(w.net.calls.length,before,'asset de la révision courante servi sans réseau');
    const offline=boot({net:makeNet(defaultRoutes(REV),{offline:true})});
    for(const [k,v] of w.cs.stores)offline.cs.stores.set(k,v);
    const foreign=await offline.fetch('./update-manager.js?rev='+OTHER);
    assert.equal(foreign.status,503,'fichier d’une autre révision hors ligne : 503, jamais la copie d’une autre version');
    const netFail=boot({net:makeNet(defaultRoutes(REV,[[byPath('./update-manager.js'),()=>new Response('boom',{status:500})]]))});
    for(const [k,v] of w.cs.stores)netFail.cs.stores.set(k,v);
    const r=await netFail.fetch('./update-manager.js?rev='+OTHER);
    assert.notEqual(await r.text(),'/*/update-manager.js@'+REV+'*/','échec réseau d’un asset étranger : pas de substitution par la version installée');
    await w.fetch('./update-manager.js?rev='+OTHER);
    assert.ok(![...w.cs.stores.get(NAME).keys()].some(k=>k.includes('rev='+OTHER)),'aucune copie d’une autre révision n’entre dans ce cache');
  }
  step='4. cache.put refusé (quota) → la réponse réseau est quand même servie';
  {
    const w=boot({putFails:true});
    const a=await w.fetch('./store-photos.js?rev='+REV);
    assert.equal(a.status,200,'asset versionné servi malgré un cache plein');
    const b=await w.fetch('./data/official-stores.json?ts=1');
    assert.equal(b.status,200,'donnée servie malgré un cache plein');
  }
  step='5. paramètres anti-cache : une seule entrée par fichier';
  {
    const w=boot();await w.run('install');
    for(let i=0;i<6;i++)await w.fetch('./data/official-stores.json?catalog='+Date.now()+i);
    const keys=[...w.cs.stores.get(NAME).keys()].filter(k=>k.includes('official-stores.json'));
    assert.deepEqual(keys,[SCOPE+'data/official-stores.json'],'six ouvertures du catalogue = une seule copie');
    const off=boot({net:makeNet(defaultRoutes(REV),{offline:true})});
    for(const [k,v] of w.cs.stores)off.cs.stores.set(k,v);
    assert.equal((await off.fetch('./data/official-stores.json?ts=99')).status,200,'et relue hors ligne');
    assert.equal((await off.fetch('./app-icon.svg')).status,200,'asset non versionné relu hors ligne depuis le précache');
  }
  step='6. navigation';
  {
    const installed=boot();await installed.run('install');
    const clone=(net,o)=>{const w=boot(Object.assign({net},o||{}));for(const [k,v] of installed.cs.stores)w.cs.stores.set(k,v);return w};
    const newer='20990101-future999';
    const online=clone(makeNet(defaultRoutes(newer)));
    assert.equal(await (await online.fetch('./?source=home-screen','navigate')).text(),page(newer),'en ligne : la page publiée la plus récente');
    assert.equal(await (await online.cs.stores.get(NAME).get(SCOPE)).clone().text(),page(REV),'la page réseau n’écrase jamais le shell vérifié de la révision');
    const off=clone(makeNet(defaultRoutes(newer),{offline:true}));
    assert.equal(await (await off.fetch('./','navigate')).text(),page(REV),'hors ligne : la version installée');
    const older=clone(makeNet(defaultRoutes(OTHER)));
    assert.equal(await (await older.fetch('./','navigate')).text(),page(REV),'page réseau plus ancienne (CDN en retard) : la version installée passe devant');
    const sameVisibleOlder=clone(makeNet(defaultRoutes('20260924-hotfix261')));
    assert.equal(await (await sameVisibleOlder.fetch('./','navigate')).text(),page(REV),'hotfix daté plus ancien avec le même suffixe 261 : le shell installé passe devant');
    const error=clone(makeNet(defaultRoutes(REV,[[u=>new URL(u).pathname==='/',()=>new Response('err',{status:502})]])));
    assert.equal(await (await error.fetch('./','navigate')).text(),page(REV),'erreur serveur : la version installée');
    const hang=clone(makeNet(defaultRoutes(REV,[[u=>new URL(u).pathname==='/',()=>new Promise(()=>{})]])),{timeScale:40});
    const t=Date.now();const res=await hang.fetch('./','navigate');
    assert.equal(await res.text(),page(REV),'réseau qui ne répond pas : la version installée');
    assert.ok(Date.now()-t<1000,'sans attendre le réseau indéfiniment');
    assert.match(SOURCE,/const NAVIGATION_TIMEOUT_MS = [1-5]\d{3};/,'délai de navigation borné (≤ 5 s)');
    const other=clone(makeNet(defaultRoutes(REV,[[byPath('./privacy.html'),()=>new Response('privacy')]])));
    assert.equal(await (await other.fetch('./privacy.html','navigate')).text(),'privacy','les autres pages restent servies normalement');
    const v2=clone(makeNet(defaultRoutes(REV)));
    assert.equal(await v2.fetch('./v2/index.html','navigate'),'passthrough','/v2/ n’est jamais intercepté');
  }
  step='7. activate : seuls les anciens caches de fichiers sont remplacés';
  {
    const w=boot();
    for(const n of ['chef-secteur-stable-'+OTHER,cacheName(OTHER),NAME,'store-runner-autre','photos-utilisateur'])await w.cs.api.open(n);
    await w.run('activate');
    assert.deepEqual((await w.cs.api.keys()).sort(),[NAME,'photos-utilisateur','store-runner-autre'].sort());
    assert.equal(w.claimed(),1);
  }
  step='8. messages';
  {
    const w=boot();let answer=null;
    w.handlers.message({data:{type:'GET_BUILD_REV'},ports:[{postMessage(m){answer=m}}]});
    assert.deepEqual(JSON.parse(JSON.stringify(answer)),{type:'BUILD_REV',buildRev:REV});
    w.handlers.message({data:{type:'SKIP_WAITING'}});assert.equal(w.skipped(),1);
  }
  finished=true;
  console.log('PASS: V260/V261.1 — service worker : précache versionné et vérifié, cache hotfix atomique accepté, version complète ou rien, aucun mélange de révisions, quota plein toléré, cache borné, navigation bornée dans le temps, données jamais touchées.');
})().catch(e=>{console.error(e);process.exit(1)});
