const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// V244 — Sur Android, « Mettre à jour » finissait par « Ferme et rouvre Store Runner ».
// Le module n'attendait la prise de contrôle du nouveau worker que 3,5 s ; or install()
// précharge ~75 fichiers, souvent plus long sur réseau mobile. L'écouteur était retiré et
// la page restait sur l'ancienne version. Ce test pilote le vrai module avec un faux
// service worker : le rechargement ne doit partir qu'au controllerchange, une seule fois,
// sans boucle, sans rien effacer des données locales.

const SOURCE=fs.readFileSync(__dirname+'/../update-manager.js','utf8');
const INDEX=fs.readFileSync(__dirname+'/../index.html','utf8');
const SW=fs.readFileSync(__dirname+'/../sw.js','utf8');
const CODE=SOURCE.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');

// --- Contrats statiques ------------------------------------------------------------------
// V260 : le bootloader ne recharge plus jamais seul (rechargement parasite à la première
// installation). La prise de contrôle appartient au gestionnaire de mise à jour.
assert.doesNotMatch(INDEX,/addEventListener\('controllerchange'/,'le bootloader n’écoute plus controllerchange');
assert.doesNotMatch(INDEX,/location\.reload\(/,'le bootloader ne recharge jamais la page de lui-même');
assert.match(CODE,/function watchController\(\)/,'le gestionnaire possède la prise de contrôle');
assert.match(CODE,/function alignWaitingWorker\(\)/,'le gestionnaire aligne le worker en attente sur la page');
assert.doesNotMatch(CODE,/store-runner-sw-reload/,'le gestionnaire ne partage pas la clé du bootloader');
assert.doesNotMatch(CODE,/Ferme et rouvre/,'plus aucune consigne « fermer puis rouvrir »');
assert.doesNotMatch(CODE,/\.clear\(|deleteDatabase|caches\.delete|removeItem\((?!APPLY_MARKER_KEY)/,
  'la mise à jour ne vide ni stockage, ni IndexedDB, ni cache ; elle ne retire que son propre marqueur');
assert.match(SW,/event\.data\.type === 'GET_BUILD_REV'/,'le worker sait dire quelle révision il sert');
const installBlock=SW.slice(SW.indexOf("self.addEventListener('install'"),SW.indexOf("self.addEventListener('activate'"));
assert.ok(!installBlock.includes('skipWaiting()'),'le worker ne s’active toujours pas seul avant le clic');


// --- Harnais ----------------------------------------------------------------------------
function makeStore(init){
  const m=new Map(Object.entries(init||{}));const calls={clear:0,removed:[]};
  return {calls,map:m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},
          removeItem:k=>{calls.removed.push(k);m.delete(k)},clear:()=>{calls.clear++;m.clear()}};
}
function makeDom(){
  const byId={};
  function el(tag){
    const kids={};
    return {tagName:tag,id:'',hidden:false,textContent:'',dataset:{},onclick:null,
      classList:{add(){},remove(){},toggle(){}},
      setAttribute(){},addEventListener(){},appendChild(c){if(c.id)byId[c.id]=c;return c},
      querySelector(sel){return kids[sel]||null},
      set innerHTML(html){for(const m of String(html).match(/data-sru-[a-z-]+/g)||[])kids['['+m+']']=el('stub')},
      get innerHTML(){return ''}};
  }
  const doc={busy:false,readyState:'complete',head:el('head'),body:el('body'),createElement:el,
    getElementById:id=>byId[id]||null,querySelector:sel=>sel==='dialog[open]'&&doc.busy?{}:null,addEventListener(){}};
  return {byId,document:doc};
}
function makeClock(){
  let seq=0;const pending=[];
  return {
    setTimeout(fn,d){const id=++seq;pending.push({id,fn,delay:Number(d)||0});return id},
    clearTimeout(id){const i=pending.findIndex(t=>t.id===id);if(i>=0)pending.splice(i,1)},
    flushUpTo(max){const due=pending.filter(t=>t.delay<=max);for(const t of due)pending.splice(pending.indexOf(t),1);for(const t of due)t.fn();return due.length}
  };
}
function emitter(target){
  const ls={};
  target.addEventListener=(t,fn)=>{(ls[t]=ls[t]||[]).push(fn)};
  target.removeEventListener=(t,fn)=>{const a=ls[t]||[];const i=a.indexOf(fn);if(i>=0)a.splice(i,1)};
  target.emit=t=>{for(const fn of (ls[t]||[]).slice())fn({type:t})};
  target.count=t=>(ls[t]||[]).length;
  return target;
}
function makeWorker(state,answersBuild){
  const w=emitter({state,messages:[]});
  w.postMessage=(m,ports)=>{w.messages.push(m&&m.type);if(m&&m.type==='GET_BUILD_REV'&&answersBuild&&ports&&ports[0])ports[0].postMessage({type:'BUILD_REV',buildRev:answersBuild})};
  return w;
}
// Le gestionnaire interroge aussi les workers (GET_BUILD_REV) : seules les activations comptent ici.
const acts=w=>w.messages.filter(m=>m!=='GET_BUILD_REV');
const tick=async(n=6)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r))};
// update() sans nouveau worker : délai de grâce (2,5 s) puis question au worker actif (1,5 s).
const settleNoWorker=async app=>{await tick();app.clock.flushUpTo(2500);await tick();app.clock.flushUpTo(1500);await tick()};

function makeApp(o){
  o=o||{};
  const dom=makeDom(),clock=makeClock();
  const local=o.local||makeStore({'store-runner-visits':'[{"id":"v1"}]','chef-secteur-state':'{"plan":{}}'});
  const session=o.session||makeStore();
  let reloads=0,idbDeletes=0,cacheDeletes=0,updates=0;
  const registration=emitter({waiting:o.waiting||null,installing:o.installing||null,active:null,
    async update(){updates++;if(o.onUpdate)o.onUpdate(registration)}});
  const serviceWorker=emitter({controller:o.controller===undefined?makeWorker('activated',o.controllerBuild):o.controller,
    async getRegistration(){return o.noRegistration?null:registration}});
  const location={href:'https://store-runner.test/',reload(){if(o.reloadThrows)throw new Error('refusé');reloads++}};
  const ctx={console,JSON,Date,Math,String,Number,Boolean,Object,Array,Set,Map,RegExp,Error,Promise,
    document:dom.document,navigator:{serviceWorker},location,localStorage:local,sessionStorage:session,
    indexedDB:{deleteDatabase(){idbDeletes++}},caches:{delete(){cacheDeletes++}},
    __STORE_RUNNER_BUILD_REV:o.current||'20260922-old243',
    MessageChannel:function(){const ch=this;ch.port1={onmessage:null};ch.port2={postMessage(d){if(ch.port1.onmessage)ch.port1.onmessage({data:d})}}},
    setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,
    fetch:async()=>({ok:true,async json(){return{latestBuild:o.latest||'20260922-terrain-activity-metrics245',displayVersion:'245'}}})};
  ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
  if(o.noServiceWorker)delete ctx.navigator.serviceWorker;
  if(o.storage)ctx.__chefStorage=o.storage;
  vm.runInNewContext(SOURCE,ctx);
  return {ctx,clock,local,session,registration,serviceWorker,dom,
    api:ctx.StoreRunnerUpdates,
    reloads:()=>reloads,updates:()=>updates,idbDeletes:()=>idbDeletes,cacheDeletes:()=>cacheDeletes,
    marker:()=>{const v=session.getItem('store-runner-update-apply');return v?JSON.parse(v):null},
    banner(){const b=dom.byId['storeRunnerUpdateBanner'];if(!b)return null;
      const later=b.querySelector('[data-sru-banner-dismiss]');
      return {titre:b.querySelector('[data-sru-banner-title]').textContent,detail:b.querySelector('[data-sru-banner-detail]').textContent,
              action:b.querySelector('[data-sru-banner-action]').hidden?null:b.querySelector('[data-sru-banner-action]').textContent,
              visible:!b.hidden,plusTard:later&&!later.hidden?later:null,clic:()=>b.querySelector('[data-sru-banner-action]').onclick()}}};
}
function takeControl(app,worker){if(app.registration.waiting===worker)app.registration.waiting=null;app.registration.active=worker;app.serviceWorker.controller=worker;worker.state='activated';worker.emit('statechange');app.serviceWorker.emit('controllerchange')}

let finished=false,step='début';
process.on('beforeExit',()=>{if(!finished){console.error('FAIL: test bloqué (promesse jamais résolue) à : '+step);process.exit(1)}});

(async function(){
  const OLD='20260922-old243',NEW='20260922-terrain-activity-metrics245';

  // 1-5. Nouvelle version détectée, worker en attente, activation, controllerchange → 1 rechargement
  step='1-5. Nouvelle version détectée, worker en attente, activatio';
  {
    const W=makeWorker('installed');
    const app=makeApp({waiting:W});
    const localBefore=JSON.stringify([...app.local.map].filter(([k])=>k!=='store-runner-last-seen-build'));
    const p=app.api.installUpdate();
    await tick();
    assert.deepEqual(acts(W),['SKIP_WAITING'],'le worker en attente reçoit SKIP_WAITING');
    assert.equal(app.updates(),1,'update() réellement appelé');
    assert.equal(app.ctx.__storeRunnerUpdateApplying,true,'le gestionnaire prend la main sur le rechargement');
    assert.equal(app.banner().titre,'Mise à jour en cours…');
    app.clock.flushUpTo(400);
    assert.equal(app.reloads(),0,'aucun rechargement avant que le nouveau worker contrôle la page');
    takeControl(app,W);
    assert.equal(app.reloads(),0,'aucun rechargement en parallèle du gestionnaire');
    assert.equal(await p,true);
    assert.equal(app.banner().detail,'Store Runner recharge la nouvelle version…');
    app.clock.flushUpTo(400);
    assert.equal(app.reloads(),1,'exactement un rechargement après controllerchange');
    app.serviceWorker.emit('controllerchange');app.clock.flushUpTo(400);
    await app.api.installUpdate();app.clock.flushUpTo(400);
    assert.equal(app.reloads(),1,'ni un second controllerchange ni un second clic ne rechargent à nouveau');
    assert.deepEqual({from:app.marker().from,to:app.marker().to},{from:OLD,to:NEW},'marqueur de session {from,to} posé');
    // 9. données locales intactes
    assert.equal(JSON.stringify([...app.local.map].filter(([k])=>k!=='store-runner-last-seen-build')),localBefore,'localStorage métier inchangé');
    assert.equal(app.local.calls.clear+app.session.calls.clear,0,'aucun clear()');
    assert.equal(app.idbDeletes()+app.cacheDeletes(),0,'ni IndexedDB ni caches supprimés par la page');
  }

  // Installation lente (> 3,5 s, cas Android) : on attend, on ne renonce pas
  step='Installation lente (> 3,5 s, cas Android) : on attend, on ne';
  {
    const W=makeWorker('installing');
    const app=makeApp({installing:W});
    const p=app.api.installUpdate();
    await tick();
    app.clock.flushUpTo(3500);app.clock.flushUpTo(15000);await tick();
    assert.equal(app.reloads(),0);
    assert.deepEqual(acts(W),[],'pas de SKIP_WAITING avant la fin de l’installation');
    assert.equal(app.banner().titre,'Mise à jour en cours…','toujours en cours, pas d’abandon à 3,5 s');
    assert.equal(app.serviceWorker.count('controllerchange'),2,'écouteur d’installation toujours présent (plus l’écouteur permanent)');
    W.state='installed';app.registration.waiting=W;app.registration.installing=null;W.emit('statechange');
    await tick();
    assert.deepEqual(acts(W),['SKIP_WAITING'],'activation dès que l’installation se termine');
    takeControl(app,W);
    assert.equal(await p,true);app.clock.flushUpTo(400);
    assert.equal(app.reloads(),1,'rechargement unique une fois le worker aux commandes');
    assert.equal(app.serviceWorker.count('controllerchange'),1,'écouteur d’installation retiré après usage');
  }

  // Worker découvert par update() (updatefound)
  step='Worker découvert par update() (updatefound)';
  {
    const W=makeWorker('installing');
    const app=makeApp({onUpdate(reg){reg.installing=W;reg.emit('updatefound')}});
    const p=app.api.installUpdate();await tick();
    W.state='installed';app.registration.waiting=W;app.registration.installing=null;W.emit('statechange');await tick();
    assert.deepEqual(acts(W),['SKIP_WAITING']);
    takeControl(app,W);assert.equal(await p,true);app.clock.flushUpTo(400);
    assert.equal(app.reloads(),1);
  }

  // 7. BUILD_REV identique → aucun rechargement
  step='7. BUILD_REV identique → aucun rechargement';
  {
    const W=makeWorker('installed');
    const app=makeApp({waiting:W,latest:OLD});
    assert.equal(await app.api.installUpdate(),false);
    app.clock.flushUpTo(400);
    assert.equal(app.reloads(),0,'même BUILD_REV : aucun rechargement inutile');
    assert.deepEqual(acts(W),[],'et aucun worker activé');
    assert.equal(app.banner().titre,'Store Runner est à jour');
    assert.equal(app.marker(),null);
  }

  // 6/11. Après rechargement : succès → marqueur nettoyé ; retour sur l'ancienne version → pas de boucle
  step='6/11. Après rechargement : succès → marqueur nettoyé ; retou';
  {
    const session=makeStore({'store-runner-update-apply':JSON.stringify({from:OLD,to:NEW,at:Date.now()})});
    const ok=makeApp({current:NEW,latest:NEW,session});
    assert.equal(ok.marker(),null,'nouvelle version chargée : marqueur retiré au démarrage');
    assert.equal(await ok.api.installUpdate(),false);ok.clock.flushUpTo(400);
    assert.equal(ok.reloads(),0,'après rechargement réussi, aucun second rechargement');

    const stale=makeStore({'store-runner-update-apply':JSON.stringify({from:OLD,to:NEW,at:Date.now()})});
    const back=makeApp({current:OLD,session:stale,controllerBuild:NEW});
    assert.ok(back.marker(),'retour sur l’ancienne version : le marqueur reste pour bloquer la boucle');
    const pb=back.api.installUpdate();await settleNoWorker(back);
    assert.equal(await pb,false);back.clock.flushUpTo(400);
    assert.equal(back.reloads(),0,'8. pas de deuxième rechargement automatique pour le même couple de versions');
    assert.equal(back.banner().titre,'Nouvelle version pas encore servie');
    assert.equal(back.ctx.__storeRunnerUpdateApplying,false,'le bootloader retrouve sa garde normale');

    const old=makeStore({'store-runner-update-apply':JSON.stringify({from:OLD,to:NEW,at:Date.now()-10*60*1000}),'autre':'x'});
    const expired=makeApp({current:OLD,session:old});
    assert.equal(expired.marker(),null,'marqueur périmé nettoyé automatiquement');
    assert.equal(old.getItem('autre'),'x','les autres clés de session ne sont pas touchées');

    // 8. changement de BUILD_REV suivant dans la même session → rechargement autorisé
    const next=makeStore({'store-runner-update-apply':JSON.stringify({from:OLD,to:NEW,at:Date.now()})});
    const W=makeWorker('installed');
    const second=makeApp({current:NEW,latest:'20260923-next245',session:next,waiting:W});
    const p=second.api.installUpdate();await tick();takeControl(second,W);
    assert.equal(await p,true);second.clock.flushUpTo(400);
    assert.equal(second.reloads(),1,'nouvelle révision dans la même session : rechargement autorisé');
  }

  // Worker actif déjà à jour, page restée ancienne → simple rechargement
  step='Worker actif déjà à jour, page restée ancienne → simple rech';
  {
    const app=makeApp({controllerBuild:NEW});
    const p=app.api.installUpdate();await settleNoWorker(app);
    assert.equal(await p,true);app.clock.flushUpTo(400);
    assert.equal(app.reloads(),1);
  }

  // Worker V243 (ne répond pas), aucune nouvelle version côté serveur → pas de rechargement aveugle
  step='Worker V243 (ne répond pas), aucune nouvelle version côté se';
  {
    const app=makeApp({});
    const p=app.api.installUpdate();await settleNoWorker(app);
    assert.equal(await p,false);app.clock.flushUpTo(400);
    assert.equal(app.reloads(),0);
    assert.equal(app.banner().titre,'Nouvelle version pas encore prête');
    assert.equal(app.banner().action,'Réessayer');
  }

  // Activation qui n'aboutit pas : pas de rechargement vers l'ancien worker, écouteur retiré
  step="Activation qui n'aboutit pas : pas de rechargement vers l'an";
  {
    const W=makeWorker('installed');
    const app=makeApp({waiting:W});
    const p=app.api.installUpdate();await tick();
    app.clock.flushUpTo(15000);
    assert.equal(await p,false);app.clock.flushUpTo(400);
    assert.equal(app.reloads(),0,'pas de rechargement trop tôt sur l’ancien worker');
    assert.equal(app.banner().titre,'Mise à jour presque prête');
    assert.equal(app.serviceWorker.count('controllerchange'),1,'seul l’écouteur permanent du gestionnaire reste');
    assert.equal(app.ctx.__storeRunnerUpdateApplying,false);
  }

  // Double clic pendant l'installation → un seul processus
  step="Double clic pendant l'installation → un seul processus";
  {
    const W=makeWorker('installed');
    const app=makeApp({waiting:W});
    const a=app.api.installUpdate(),b=app.api.installUpdate();
    assert.equal(a,b,'le second clic réutilise l’installation en cours');
    await tick();takeControl(app,W);await a;app.clock.flushUpTo(400);
    assert.deepEqual(acts(W),['SKIP_WAITING']);assert.equal(app.reloads(),1);
  }

  // 10. Sans service worker / sans enregistrement : la page n'est servie par aucune copie → un rechargement
  step="10. Sans service worker / sans enregistrement : la page n'es";
  {
    const noSw=makeApp({noServiceWorker:true});
    assert.equal(await noSw.api.installUpdate(),true);noSw.clock.flushUpTo(400);
    assert.equal(noSw.reloads(),1,'sans service worker : un rechargement réseau');
    const same=makeApp({noServiceWorker:true,latest:OLD});
    assert.equal(await same.api.installUpdate(),false);same.clock.flushUpTo(400);
    assert.equal(same.reloads(),0,'sans service worker et même version : rien');
    const noReg=makeApp({noRegistration:true,controller:null});
    assert.equal(await noReg.api.installUpdate(),true);noReg.clock.flushUpTo(400);
    assert.equal(noReg.reloads(),1);
  }

  // Rechargement refusé par la plateforme : bouton Recharger, jamais « fermer et rouvrir »
  step='Rechargement refusé par la plateforme : bouton Recharger, ja';
  {
    const W=makeWorker('installed');
    const app=makeApp({waiting:W,reloadThrows:true});
    const p=app.api.installUpdate();await tick();takeControl(app,W);await p;app.clock.flushUpTo(400);
    assert.equal(app.banner().action,'Recharger');
    assert.doesNotMatch(app.banner().detail,/ferme|rouvre/i);
    assert.equal(app.marker(),null,'un rechargement qui n’a pas eu lieu ne laisse pas de marqueur');
  }

  // Hors ligne : échec propre, aucun rechargement
  step='Hors ligne : échec propre, aucun rechargement';
  {
    const app=makeApp({});
    app.ctx.fetch=async()=>{throw new Error('offline')};
    assert.equal(await app.api.installUpdate(),false);app.clock.flushUpTo(400);
    assert.equal(app.reloads(),0);assert.equal(app.banner().titre,'Mise à jour impossible');
  }

  // V260 — première installation : clients.claim() change le contrôleur, même révision → rien
  step='V260 première installation';
  {
    const app=makeApp({controller:null,latest:OLD});
    const W=makeWorker('activated',OLD);
    app.serviceWorker.controller=W;app.serviceWorker.emit('controllerchange');await settleNoWorker(app);app.clock.flushUpTo(400);
    assert.equal(app.reloads(),0,'plus aucun rechargement parasite à la première installation');
    assert.notEqual((app.banner()||{}).titre,'Nouvelle version prête','ni proposition de rechargement');
  }

  // V260 — une autre fenêtre active une autre révision : proposition, jamais de rechargement sauvage
  step='V260 autre fenêtre';
  {
    const app=makeApp({latest:NEW});
    app.clock.flushUpTo(20000);await tick();
    const W=makeWorker('activated',NEW);
    app.serviceWorker.controller=W;app.serviceWorker.emit('controllerchange');await tick();
    app.clock.flushUpTo(20000);await tick();
    assert.equal(app.reloads(),0,'aucun rechargement automatique');
    assert.equal(app.banner().titre,'Nouvelle version prête');
    assert.equal(app.banner().action,'Recharger');
    assert.ok(app.banner().plusTard,'« Plus tard » disponible');
    app.banner().clic();app.clock.flushUpTo(400);
    assert.equal(app.reloads(),1,'rechargement seulement sur demande');
  }

  // V260 — alignement : le worker en attente sert la révision de la page → activé, sans rechargement
  step='V260 alignement';
  {
    const W=makeWorker('installed',OLD);
    const app=makeApp({waiting:W,latest:OLD});await tick();
    assert.deepEqual(acts(W),['SKIP_WAITING'],'worker de la même révision activé tout de suite');
    takeControl(app,W);await tick();app.clock.flushUpTo(20000);await tick();
    assert.equal(app.reloads(),0,'aucun rechargement : la page est déjà cette révision');
    assert.notEqual((app.banner()||{}).titre,'Nouvelle version prête');
    const X=makeWorker('installed',NEW);
    const other=makeApp({waiting:X,latest:NEW});await tick();
    assert.deepEqual(acts(X),[],'un worker d’une AUTRE révision attend le choix de l’utilisateur');
    const Y=makeWorker('installing');
    const later=makeApp({latest:OLD});await tick();
    later.registration.installing=Y;later.registration.emit('updatefound');
    Y.answers=OLD;Y.postMessage=(m,ports)=>{Y.messages.push(m&&m.type);if(m&&m.type==='GET_BUILD_REV'&&ports&&ports[0])ports[0].postMessage({type:'BUILD_REV',buildRev:OLD})};
    Y.state='installed';later.registration.waiting=Y;later.registration.installing=null;Y.emit('statechange');await tick();
    assert.deepEqual(acts(Y),['SKIP_WAITING'],'worker installé pendant la session : aligné dès la fin de l’installation');
  }

  // V260 — saisie en cours (visite, fiche ouverte) : la mise à jour attend, rien n'est rechargé
  step='V260 saisie en cours';
  {
    const W=makeWorker('installed');
    const app=makeApp({waiting:W});
    const p=app.api.installUpdate();await tick();
    app.dom.document.busy=true;
    takeControl(app,W);assert.equal(await p,true);app.clock.flushUpTo(20000);await tick();
    assert.equal(app.reloads(),0,'aucun rechargement pendant une saisie');
    assert.equal(app.banner().titre,'Mise à jour prête');
    assert.equal(app.banner().action,'Recharger');
    app.dom.document.busy=false;app.banner().clic();app.clock.flushUpTo(400);
    assert.equal(app.reloads(),1,'rechargement quand l’utilisateur le demande, saisie terminée');
  }

  // V260 — le stockage est vidé sur le disque AVANT de recharger ; un échec bloque le rechargement
  step='V260 flush avant rechargement';
  {
    let flushes=0,release=null;
    const storage={flush(){flushes++;return new Promise(r=>{release=r})}};
    const W=makeWorker('installed');
    const app=makeApp({waiting:W,storage});
    const p=app.api.installUpdate();await tick();takeControl(app,W);await p;
    app.clock.flushUpTo(400);await tick();
    assert.equal(flushes,1,'flush demandé avant de quitter la page');
    assert.equal(app.reloads(),0,'pas de rechargement tant que les écritures ne sont pas sur le disque');
    release(true);await tick();
    assert.equal(app.reloads(),1,'rechargement une fois les données écrites');

    const failing={flush(){return Promise.reject(new Error('QuotaExceededError'))}};
    const V=makeWorker('installed');
    const bad=makeApp({waiting:V,storage:failing});
    const q=bad.api.installUpdate();await tick();takeControl(bad,V);await q;
    bad.clock.flushUpTo(400);await tick();
    assert.equal(bad.reloads(),0,'écriture refusée : on ne quitte pas la page');
    assert.equal(bad.banner().titre,'Mise à jour en attente');
    assert.equal(bad.marker(),null,'aucun marqueur laissé');
    assert.equal(bad.local.calls.clear+bad.session.calls.clear+bad.idbDeletes()+bad.cacheDeletes(),0,'rien n’est effacé');
  }

  // V260 — « Plus tard » : le bandeau se ferme et ne revient pas pour cette révision dans la session
  step='V260 plus tard';
  {
    const app=makeApp({});
    const r=await app.api.checkForUpdates(true);
    assert.equal(r.available,true);
    assert.equal(app.banner().titre,'Nouvelle version disponible');
    assert.ok(app.banner().plusTard,'« Plus tard » proposé');
    app.banner().plusTard.onclick();
    assert.equal(app.banner().visible,false,'bandeau fermé');
    await app.api.checkForUpdates(true);
    assert.equal(app.banner().visible,false,'pas de retour du bandeau pour la même révision');
    assert.equal(app.api.getState().latest,NEW,'la mise à jour reste connue (point du menu)');
  }

  finished=true;
  console.log('PASS: V244/V260 — activation au controllerchange, un seul rechargement, pas de boucle, aucun rechargement parasite, saisie protégée, stockage écrit avant rechargement, données locales intactes.');
})().catch(e=>{console.error(e);process.exit(1)});
