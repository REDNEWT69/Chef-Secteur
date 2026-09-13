const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// La mise à jour manuelle ne s'appliquait jamais après la première : le rechargement était
// gardé par index.html sur la clé `store-runner-sw-reload:<BUILD_REV>`, où BUILD_REV est
// celui de la page *déjà chargée*. Le clients.claim() initial posait la clé ; l'activation
// du worker suivant retombait sur la même clé, déjà posée, et ne rechargeait pas. Le
// bandeau annonçait quand même « recharge la nouvelle version… ».

const SOURCE=fs.readFileSync(__dirname+'/../update-manager.js','utf8');
const INDEX=fs.readFileSync(__dirname+'/../index.html','utf8');

// --- Le garde-fou du bootloader reste intact -------------------------------------------
// Il garde son rôle — empêcher la boucle de rechargement au premier démarrage — et n'est
// pas celui qui applique une mise à jour demandée en cours de session.
assert.match(INDEX,/const reloadKey='store-runner-sw-reload:'\+BUILD_REV;/,'la clé de garde du bootloader doit rester telle quelle');
assert.match(INDEX,/if\(sessionStorage\.getItem\(reloadKey\)\)return;sessionStorage\.setItem\(reloadKey,'1'\)/,'sa logique une-fois-par-session doit rester telle quelle');
assert.equal((INDEX.match(/store-runner-sw-reload/g)||[]).length,1,'une seule garde, au même endroit');
assert.doesNotMatch(SOURCE,/store-runner-sw-reload/,'le gestionnaire ne doit pas partager la clé du bootloader');

// --- Un DOM de fortune, juste ce dont le module se sert --------------------------------
function makeDom(){
  const byId={};
  function el(tag){
    const kids={};
    const node={
      tagName:tag,id:'',hidden:false,textContent:'',dataset:{},
      classList:{add(){},remove(){},toggle(){}},
      setAttribute(){},addEventListener(){},appendChild(c){if(c.id)byId[c.id]=c;return c},
      querySelector(sel){return kids[sel]||null},
      set innerHTML(html){
        for(const m of String(html).match(/data-sru-[a-z-]+/g)||[])kids['['+m+']']=el('stub');
      },
      get innerHTML(){return ''}
    };
    return node;
  }
  const head=el('head'),body=el('body');
  return {byId,el,document:{
    readyState:'loading',                       // start() attend un DOMContentLoaded qui ne viendra pas
    head,body,
    createElement:el,
    getElementById:id=>byId[id]||null,
    querySelector:()=>null,
    addEventListener(){}
  }};
}

function makeApp(opts){
  const o=opts||{};
  const dom=makeDom();
  const swListeners={};
  let reloads=0,skipWaiting=0,updates=0;
  const registration={
    async update(){updates++},
    waiting:{postMessage(m){if(m&&m.type==='SKIP_WAITING')skipWaiting++}},
    installing:null
  };
  const serviceWorker={
    addEventListener(t,fn,op){(swListeners[t]=swListeners[t]||[]).push({fn,once:!!(op&&op.once)})},
    removeEventListener(){},
    async getRegistration(){return registration}
  };
  const location={href:'https://store-runner.test/',reload(){
    if(o.reloadThrows)throw new Error('rechargement refusé');
    reloads++;
  }};
  const ctx={console,JSON,Date,Math,String,Number,Boolean,Object,Array,Set,Map,RegExp,Error,Promise,
             document:dom.document,navigator:{serviceWorker},location,
             setTimeout:()=>0,clearTimeout:()=>{},
             fetch:async()=>({ok:true,async json(){return{latestBuild:'b2',displayVersion:'161'}}})};
  ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
  if(o.noServiceWorker)delete ctx.navigator.serviceWorker;
  vm.runInNewContext(SOURCE,ctx);
  return {
    ctx,
    reloads:()=>reloads,skipWaiting:()=>skipWaiting,updates:()=>updates,
    controllerChange(){
      const l=swListeners['controllerchange']||[];
      swListeners['controllerchange']=l.filter(x=>!x.once);
      for(const x of l)x.fn({type:'controllerchange'});
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

// --- Trois mises à jour successives dans la même session -------------------------------
(async function(){
  const app=makeApp();
  const versions=[];
  for(let i=1;i<=3;i++){
    assert.equal(await app.ctx.window.StoreRunnerUpdates.installUpdate(),true,'installUpdate n°'+i+' doit aboutir');
    app.controllerChange();
    versions.push(app.reloads());
    assert.equal(app.reloads(),i,'la mise à jour n°'+i+' doit recharger la page');
    assert.equal(app.skipWaiting(),i,'et activer explicitement le worker en attente');
    assert.deepEqual(app.banner(),{titre:'Mise à jour installée',detail:'Store Runner recharge la nouvelle version…',sticky:null},
      'le bandeau n°'+i+' annonce un rechargement, qui vient réellement de partir');
  }
  assert.deepEqual(versions,[1,2,3],'aucune garde ne doit avaler la deuxième ni la troisième');
  assert.equal(app.updates(),3,'chaque installation interroge réellement le service worker');

  // --- Pas de rechargement possible : le bandeau dit quoi faire à la main ---------------
  const bloque=makeApp({reloadThrows:true});
  assert.equal(await bloque.ctx.window.StoreRunnerUpdates.installUpdate(),true);
  bloque.controllerChange();
  assert.equal(bloque.reloads(),0,'aucun rechargement n’est parti');
  assert.deepEqual(bloque.banner(),{titre:'Mise à jour installée',detail:'Ferme et rouvre l’application pour l’appliquer.',sticky:'1'},
    'le bandeau ne doit pas promettre un rechargement qui n’a pas eu lieu');

  // --- Sans service worker, rien ne se passe et rien ne casse ---------------------------
  const sansSW=makeApp({noServiceWorker:true});
  assert.equal(await sansSW.ctx.window.StoreRunnerUpdates.installUpdate(),false);
  assert.equal(sansSW.reloads(),0);

  console.error('  AVANT (module d’origine, même scénario) : 0 rechargement sur 3 — le module n’en déclenchait aucun,');
  console.error('          et la garde d’index.html, déjà consommée par le clients.claim() initial, n’en déclenchait plus.');
  console.error('  APRÈS : cumul des rechargements après chaque installation = '+versions.join(', ')+' → 3 sur 3');
  console.log('PASS: chaque installation recharge, et le bandeau n’annonce un rechargement que s’il est parti.');
})().catch(e=>{console.error(e);process.exit(1)});
