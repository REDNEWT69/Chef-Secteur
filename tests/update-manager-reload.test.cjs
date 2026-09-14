const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// La mise à jour manuelle ne s'appliquait pas. Le rechargement venait du bootloader,
// derrière `store-runner-sw-reload:<BUILD_REV>` — BUILD_REV étant celui de la page *déjà
// chargée*. Le clients.claim() initial posait la clé ; l'activation du worker demandée
// ensuite par l'utilisateur retombait sur la même clé, déjà posée, et ne rechargeait pas.
// Le bandeau annonçait pourtant « recharge la nouvelle version… ».

const SOURCE=fs.readFileSync(__dirname+'/../update-manager.js','utf8');
const INDEX=fs.readFileSync(__dirname+'/../index.html','utf8');

// --- Le garde-fou du bootloader reste intact, et ne couvre plus que le claim initial ---
assert.match(INDEX,/const reloadKey='store-runner-sw-reload:'\+BUILD_REV;/,'la clé de garde du bootloader doit rester telle quelle');
assert.match(INDEX,/if\(sessionStorage\.getItem\(reloadKey\)\)return;sessionStorage\.setItem\(reloadKey,'1'\)/,'sa logique une-fois-par-session doit rester telle quelle');
assert.equal((INDEX.match(/store-runner-sw-reload/g)||[]).length,1,'une seule garde, au même endroit');
// Commentaires retirés : le correctif cite la clé du bootloader dans son explication, ce
// qui est voulu. Ce qui est interdit, c'est de la relire ou de la réécrire.
const CODE=SOURCE.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
assert.doesNotMatch(CODE,/store-runner-sw-reload/,'le gestionnaire ne doit pas partager la clé du bootloader');
assert.doesNotMatch(CODE,/sessionStorage/,'et ne doit borner le rechargement par aucune clé de session');

// --- Un DOM de fortune, juste ce dont le module se sert --------------------------------
function makeDom(){
  const byId={};
  function el(tag){
    const kids={};
    return {
      tagName:tag,id:'',hidden:false,textContent:'',dataset:{},
      classList:{add(){},remove(){},toggle(){}},
      setAttribute(){},addEventListener(){},appendChild(c){if(c.id)byId[c.id]=c;return c},
      querySelector(sel){return kids[sel]||null},
      set innerHTML(html){for(const m of String(html).match(/data-sru-[a-z-]+/g)||[])kids['['+m+']']=el('stub')},
      get innerHTML(){return ''}
    };
  }
  return {byId,document:{
    readyState:'loading',                       // start() attend un DOMContentLoaded qui ne viendra pas
    head:el('head'),body:el('body'),
    createElement:el,getElementById:id=>byId[id]||null,
    querySelector:()=>null,addEventListener(){}
  }};
}

// Minuteur pilotable : le rechargement du correctif part à 350 ms, la branche « rien ne
// s'est passé » à 3500 ms. On veut déclencher l'un sans l'autre.
function makeClock(){
  let seq=0;const pending=[];
  return {
    setTimeout(fn,delay){const id=++seq;pending.push({id,fn,delay:Number(delay)||0});return id},
    clearTimeout(id){const i=pending.findIndex(t=>t.id===id);if(i>=0)pending.splice(i,1)},
    flushUpTo(maxDelay){
      const due=pending.filter(t=>t.delay<=maxDelay);
      for(const t of due)pending.splice(pending.indexOf(t),1);
      for(const t of due)t.fn();
      return due.length;
    },
    pendingCount(){return pending.length}
  };
}

function makeApp(opts){
  const o=opts||{};
  const dom=makeDom(),clock=makeClock();
  const swListeners=[];
  let reloads=0,skipWaiting=0,updates=0;
  const registration={
    async update(){updates++},
    waiting:{postMessage(m){if(m&&m.type==='SKIP_WAITING')skipWaiting++}},
    installing:null
  };
  const serviceWorker={
    addEventListener(t,fn,op){if(t==='controllerchange')swListeners.push({fn,once:!!(op&&op.once)})},
    removeEventListener(t,fn){const i=swListeners.findIndex(x=>x.fn===fn);if(i>=0)swListeners.splice(i,1)},
    async getRegistration(){return o.noRegistration?null:registration}
  };
  const location={href:'https://store-runner.test/',reload(){
    if(o.reloadThrows)throw new Error('rechargement refusé');
    reloads++;
  }};
  const ctx={console,JSON,Date,Math,String,Number,Boolean,Object,Array,Set,Map,RegExp,Error,Promise,
             document:dom.document,navigator:{serviceWorker},location,
             setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,
             fetch:async()=>({ok:true,async json(){return{latestBuild:'b2',displayVersion:'166'}}})};
  ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
  if(o.noServiceWorker)delete ctx.navigator.serviceWorker;
  vm.runInNewContext(SOURCE,ctx);
  return {
    ctx,clock,
    reloads:()=>reloads,skipWaiting:()=>skipWaiting,updates:()=>updates,
    listeners:()=>swListeners.length,
    controllerChange(){
      const fired=swListeners.slice();
      for(const x of fired)if(x.once)swListeners.splice(swListeners.indexOf(x),1);
      for(const x of fired)x.fn({type:'controllerchange'});
    },
    banner(){
      const b=dom.byId['storeRunnerUpdateBanner'];
      if(!b)return null;
      return {titre:b.querySelector('[data-sru-banner-title]').textContent,
              detail:b.querySelector('[data-sru-banner-detail]').textContent,
              sticky:b.dataset.sticky||null};
    }
  };
}

(async function(){
  // --- Deux mises à jour successives dans la même session -----------------------------
  const app=makeApp();
  const cumul=[];
  for(let i=1;i<=2;i++){
    assert.equal(await app.ctx.window.StoreRunnerUpdates.installUpdate(),true,'installUpdate n°'+i+' doit aboutir');
    app.controllerChange();
    assert.deepEqual(app.banner(),{titre:'Mise à jour installée',detail:'Store Runner recharge la nouvelle version…',sticky:'1'},
      'le bandeau n°'+i+' annonce le rechargement et reste affiché jusqu’à ce qu’il arrive');
    assert.equal(app.reloads(),i-1,'le rechargement n°'+i+' ne part pas avant son minuteur');
    assert.equal(app.clock.flushUpTo(400),1,'un seul minuteur court est en attente');
    assert.equal(app.reloads(),i,'la mise à jour n°'+i+' doit recharger la page');
    assert.equal(app.skipWaiting(),i,'et activer explicitement le worker en attente');
    assert.equal(app.updates(),i,'chaque installation interroge réellement le service worker');
    cumul.push(app.reloads());
  }
  assert.deepEqual(cumul,[1,2],'aucune garde ne doit avaler la deuxième');

  // --- Sans prise de contrôle : pas de rechargement, pas d'écouteur qui traîne ---------
  const muet=makeApp();
  assert.equal(await muet.ctx.window.StoreRunnerUpdates.installUpdate(),true);
  assert.equal(muet.listeners(),1,'l’écouteur est posé pendant l’attente');
  muet.clock.flushUpTo(3500);                    // la branche « rien ne s'est passé »
  assert.equal(muet.listeners(),0,'l’écouteur doit être retiré, sinon il s’accumule d’un essai à l’autre');
  assert.deepEqual(muet.banner(),{titre:'Mise à jour prête',detail:'Ferme et rouvre Store Runner pour l’appliquer.',sticky:null},
    'le bandeau doit dire quoi faire, pas promettre un rechargement');
  muet.controllerChange();
  muet.clock.flushUpTo(400);
  assert.equal(muet.reloads(),0,'un controllerchange tardif ne doit plus rien déclencher');

  // --- Un rechargement refusé ne fait pas tomber le module ----------------------------
  const bloque=makeApp({reloadThrows:true});
  assert.equal(await bloque.ctx.window.StoreRunnerUpdates.installUpdate(),true);
  bloque.controllerChange();
  bloque.clock.flushUpTo(400);
  assert.equal(bloque.reloads(),0);
  assert.deepEqual(bloque.banner(),{titre:'Mise à jour installée',detail:'Ferme et rouvre Store Runner pour l’appliquer.',sticky:'1'},
    'un rechargement refusé doit laisser une consigne manuelle persistante');
  bloque.clock.flushUpTo(3500);
  assert.doesNotMatch(bloque.banner().detail,/recharge la nouvelle version/,'le message manuel ne doit pas être écrasé par le délai d’attente');

  const sansReload=makeApp();
  delete sansReload.ctx.location.reload;
  assert.equal(await sansReload.ctx.window.StoreRunnerUpdates.installUpdate(),true);
  sansReload.controllerChange();
  sansReload.clock.flushUpTo(400);
  assert.deepEqual(sansReload.banner(),{titre:'Mise à jour installée',detail:'Ferme et rouvre Store Runner pour l’appliquer.',sticky:'1'},
    'une API reload absente doit aussi afficher la consigne manuelle');

  // --- Cas dégradés --------------------------------------------------------------------
  const sansSW=makeApp({noServiceWorker:true});
  assert.equal(await sansSW.ctx.window.StoreRunnerUpdates.installUpdate(),false,'sans service worker, l’installation échoue proprement');
  assert.equal(sansSW.reloads(),0);
  const sansReg=makeApp({noRegistration:true});
  assert.equal(await sansReg.ctx.window.StoreRunnerUpdates.installUpdate(),false,'sans enregistrement, l’installation échoue proprement');
  assert.deepEqual(sansReg.banner().titre,'Mise à jour impossible');

  console.error('  AVANT (module de main, même scénario) : 0 rechargement sur 2 — le module n’en déclenchait aucun,');
  console.error('          et la garde d’index.html, déjà consommée par le clients.claim() initial, n’en déclenchait plus.');
  console.error('  APRÈS : cumul des rechargements après chaque installation = '+cumul.join(', ')+' → 2 sur 2');
  console.log('PASS: deux mises à jour dans la même session rechargent deux fois, et l’écouteur ne s’accumule pas.');
})().catch(e=>{console.error(e);process.exit(1)});
