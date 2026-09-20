const fs=require('fs');
const vm=require('vm');
const assert=require('assert/strict');

const SOURCE=fs.readFileSync(__dirname+'/../store-runner-whats-new.js','utf8');
const INDEX=fs.readFileSync(__dirname+'/../index.html','utf8');
const SW=fs.readFileSync(__dirname+'/../sw.js','utf8');
const MODULE=require('../store-runner-whats-new.js');

// --- Le module est vraiment branché dans le shell V1 et dans le cache hors ligne -------
assert(INDEX.includes("'./store-runner-whats-new.js'"),'le shell V1 doit charger store-runner-whats-new.js');
assert(SW.includes('"./store-runner-whats-new.js"'),'le module doit rester disponible hors ligne');

// --- 100 % local : aucune requête, aucune dépendance réseau ---------------------------
const CODE=SOURCE.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
assert.doesNotMatch(CODE,/\bfetch\s*\(/,'les nouveautés ne doivent jamais être téléchargées');
assert.doesNotMatch(CODE,/XMLHttpRequest|navigator\.onLine|version\.json/,'aucune dépendance réseau ou manifeste distant');
assert.doesNotMatch(CODE,/\bsetInterval\s*\(/,'aucune boucle de surveillance permanente');
assert.doesNotMatch(CODE,/new MutationObserver/,'aucun observer global pour réparer le DOM');
// Le module ne possède que son écran : il ne reprend aucune fonction d'un autre module.
for(const owned of ['renderAll','renderWeek','renderHome','save','generateWeek','saveProfile'])
  assert.doesNotMatch(CODE,new RegExp('window\\.'+owned+'\\s*=(?!=)'),'propriétaire runtime contourné: '+owned);

// --- La table de versions reste du texte utilisateur ----------------------------------
assert(Array.isArray(MODULE.RELEASES)&&MODULE.RELEASES.length>=1,'au moins une version doit être décrite');
const vus=new Set();
for(const release of MODULE.RELEASES){
  assert.match(String(release.version),/^\d+$/,'la version doit être un numéro lisible: '+release.version);
  assert(!vus.has(release.version),'version en double dans la table: '+release.version);
  vus.add(release.version);
  assert(typeof release.title==='string'&&release.title.trim().length>0,'V'+release.version+' doit avoir un titre');
  assert(Array.isArray(release.items),'V'+release.version+' doit lister ses nouveautés');
  assert(release.items.length>=3&&release.items.length<=6,'V'+release.version+' doit tenir en 3 à 6 éléments, vu '+release.items.length);
  for(const item of release.items){
    assert(typeof item==='string'&&item.trim().length>0,'élément vide dans V'+release.version);
    assert.doesNotMatch(item,/\b(commit|refactor|merge|rebase|branch|pull request|changelog|SHA)\b/i,'texte technique interdit: '+item);
    assert.doesNotMatch(item,/#\d+|\b[0-9a-f]{7,40}\b/,'référence technique interdite: '+item);
  }
}
assert(MODULE.releaseFor('226'),'la V226 doit être décrite');
assert.equal(MODULE.releaseFor('999'),null,'une version inconnue ne doit rien inventer');
assert.equal(MODULE.displayVersion('20260919-fixture226'),'226','la version lisible se déduit du build');

// --- DOM de fortune : uniquement ce dont le module se sert ----------------------------
function makeEl(tag,doc){
  const classes=new Set(),handlers={};
  let hooks={},kids=[];
  const el={
    tagName:tag,id:'',type:'',hidden:false,textContent:'',dataset:{},parentNode:null,
    classList:{
      add(c){classes.add(c)},remove(c){classes.delete(c)},contains(c){return classes.has(c)},
      toggle(c,on){if(on===undefined){classes.has(c)?classes.delete(c):classes.add(c)}else if(on)classes.add(c);else classes.delete(c)}
    },
    get children(){return kids},
    get firstChild(){return kids.length?kids[0]:null},
    setAttribute(k,v){el.dataset['attr_'+k]=String(v)},
    addEventListener(type,fn){(handlers[type]=handlers[type]||[]).push(fn)},
    dispatch(type,extra){
      const event=Object.assign({type,target:el,preventDefault(){},stopPropagation(){}},extra||{});
      for(const fn of (handlers[type]||[]).slice())fn(event);
    },
    appendChild(child){kids.push(child);child.parentNode=el;if(child.id)doc._byId[child.id]=child;return child},
    removeChild(child){const i=kids.indexOf(child);if(i>=0)kids.splice(i,1);if(child.id)delete doc._byId[child.id];return child},
    querySelector(sel){
      if(hooks[sel])return hooks[sel];
      for(const child of kids){const found=child.querySelector&&child.querySelector(sel);if(found)return found}
      return null;
    },
    set innerHTML(html){
      kids=[];hooks={};
      for(const attr of String(html).match(/data-srwn-[a-z-]+/g)||[])hooks['['+attr+']']=makeEl('stub',doc);
    },
    get innerHTML(){return ''}
  };
  return el;
}

function makeDocument(){
  const doc={readyState:'complete',_byId:{},_handlers:{},_query:{}};
  doc.createElement=tag=>makeEl(tag,doc);
  doc.head=makeEl('head',doc);
  doc.body=makeEl('body',doc);
  doc.getElementById=id=>doc._byId[id]||null;
  doc.querySelector=sel=>doc._query[sel]||null;
  doc.addEventListener=(type,fn)=>{(doc._handlers[type]=doc._handlers[type]||[]).push(fn)};
  doc.dispatch=(type)=>{for(const fn of (doc._handlers[type]||[]).slice())fn({type})};
  return doc;
}

const BUILD='20260919-fixture226';
const BUILD_PRECEDENT='20260918-fixture225';

function makeStorage(seed){
  const map=new Map(Object.entries(seed||{}));
  return {map,
    getItem(k){k=String(k);return map.has(k)?map.get(k):null},
    setItem(k,v){map.set(String(k),String(v))},
    removeItem(k){map.delete(String(k))}};
}

function makeClock(){
  let seq=0;const pending=[];
  return {
    setTimeout(fn,delay){const id=++seq;pending.push({id,fn,delay:Number(delay)||0});return id},
    clearTimeout(id){const i=pending.findIndex(t=>t.id===id);if(i>=0)pending.splice(i,1)},
    flush(){const due=pending.splice(0,pending.length);for(const t of due)t.fn();return due.length}
  };
}

function boot(opts){
  const o=opts||{};
  const doc=makeDocument(),clock=makeClock();
  const grid=makeEl('div',doc);
  const sheet=makeEl('div',doc);sheet.id='moreSheetV2';sheet.classList.add('open');
  doc._byId['moreSheetV2']=sheet;
  doc._query['#moreSheetV2 .moreSheetGrid']=o.noMenu?null:grid;
  const ctx={console,JSON,Date,Math,String,Number,Boolean,Object,Array,Set,Map,RegExp,Error,Promise,
             document:doc,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout};
  ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
  ctx.__STORE_RUNNER_BUILD_REV=('build' in o)?o.build:BUILD;
  if(o.storage!==null)ctx.__chefStorage=o.storage||makeStorage(o.seed||{});
  vm.runInNewContext(SOURCE,ctx);
  const api=ctx.window.StoreRunnerWhatsNew;
  const view=()=>{
    const dialog=doc.getElementById('storeRunnerWhatsNew');
    if(!dialog)return null;
    const list=dialog.querySelector('[data-srwn-list]');
    return {
      dialog,
      ouvert:api.isOpen(),
      titre:dialog.querySelector('[data-srwn-title]').textContent,
      sous_titre:dialog.querySelector('[data-srwn-sub]').textContent,
      items:list?list.children.map(li=>li.textContent):[],
      compris:dialog.querySelector('[data-srwn-ok]')
    };
  };
  const read=key=>{try{return ctx.__chefStorage?ctx.__chefStorage.getItem(key):null}catch(e){return null}};
  return {ctx,doc,clock,api,grid,sheet,view,
          menu:()=>doc.getElementById('storeRunnerWhatsNewMenuButton'),
          stored:()=>read(api.SEEN_KEY),
          dernierBuild:()=>read(api.LAST_BUILD_KEY),
          annonce:()=>read(api.PENDING_KEY)};
}

// --- 1. Première installation : rien à annoncer, mais la suivante le sera -------------
const premiere=boot();
premiere.clock.flush();
assert.equal(premiere.api.launchState(),'premiere-installation','un stockage vierge est une première installation');
assert.equal(premiere.view(),null,'une première installation n’a aucune nouveauté à annoncer');
assert.equal(premiere.stored(),'226','sa version est enregistrée en silence');
assert.equal(premiere.dernierBuild(),BUILD,'le build du lancement est noté pour la comparaison suivante');
assert.equal(premiere.annonce(),null,'aucune annonce n’est armée par une première installation');

// --- 2. LE SCÉNARIO DE LA CI : recharger la page dans la même version n’ouvre rien -----
// store-photos-browser charge l'application, écrit ses données, puis recharge. La modale
// s'interposait alors sur #srReportQuickBtn. Un rechargement n'est pas une mise à jour.
const sessionCi=makeStorage();
const ciLancement1=boot({storage:sessionCi});
ciLancement1.clock.flush();
assert.equal(ciLancement1.view(),null,'premier chargement du test métier : aucun écran');
sessionCi.setItem('sector_planner_universal_v1','{"stores":[{"id":"photo-store"}]}');   // l'application sauvegarde
sessionCi.setItem('store-runner-last-seen-build',BUILD);                                // le centre de mise à jour note le build
const ciRechargement=boot({storage:sessionCi});
ciRechargement.clock.flush();
assert.equal(ciRechargement.api.launchState(),'meme-build','un rechargement reste le même build');
assert.equal(ciRechargement.view(),null,'un rechargement ne doit jamais ouvrir l’écran, même avec des données présentes');
assert.equal(ciRechargement.annonce(),null,'et n’arme aucune annonce');

// Même en supposant que l'enregistrement « vue » ait échoué au premier chargement :
// seule une annonce armée par un changement de build peut ouvrir l'écran.
const sansEcritureVue=makeStorage();
const refuseSeen={
  getItem:k=>sansEcritureVue.getItem(k),
  setItem:(k,v)=>{if(k==='store-runner-whatsnew-last-seen')throw new Error('quota');sansEcritureVue.setItem(k,v)},
  removeItem:k=>sansEcritureVue.removeItem(k)
};
const fragile1=boot({storage:refuseSeen});
fragile1.clock.flush();
assert.equal(fragile1.stored(),null,'la version vue n’a pas pu être écrite');
const fragile2=boot({storage:refuseSeen});
fragile2.clock.flush();
assert.equal(fragile2.view(),null,'sans annonce armée, un rechargement n’ouvre rien même si « vue » manque');

// --- 3. Une vraie mise à jour utilisateur ouvre l'écran --------------------------------
const maj=boot({seed:{[BUILD_PRECEDENT]:'',  'store-runner-whatsnew-last-build':BUILD_PRECEDENT}});
assert.equal(maj.api.launchState(),'mise-a-jour','un build différent du lancement précédent est une mise à jour');
assert.equal(maj.annonce(),'226','la mise à jour arme l’annonce dès l’évaluation du script');
assert.equal(maj.view(),null,'rien ne s’affiche avant le délai d’ouverture');
maj.clock.flush();
let vue=maj.view();
assert.equal(vue.ouvert,true,'une vraie mise à jour doit ouvrir l’écran Nouveautés');
assert.equal(vue.titre,'Nouveautés V226','le titre doit nommer la version');
assert.equal(vue.sous_titre,MODULE.releaseFor('226').title,'le sous-titre reprend le titre de la version');
assert.deepEqual(vue.items,MODULE.releaseFor('226').items,'les éléments affichés sont ceux de la table');
assert.equal(maj.stored(),null,'rien n’est enregistré tant que l’utilisateur n’a pas fermé');

// --- 4. « Compris » ferme, enregistre la version et désarme l'annonce ------------------
vue.compris.dispatch('click');
assert.equal(maj.api.isOpen(),false,'Compris doit fermer la fenêtre');
assert.equal(maj.stored(),'226','Compris doit enregistrer la version comme vue');
assert.equal(maj.annonce(),null,'Compris doit désarmer l’annonce');

// --- 5. Relancement : plus jamais d'ouverture automatique pour cette version -----------
const relance=boot({storage:maj.ctx.__chefStorage});
relance.clock.flush();
assert.equal(relance.api.launchState(),'meme-build');
assert.equal(relance.api.hasUnseenRelease(),false,'la version vue ne doit plus être considérée comme neuve');
assert.equal(relance.view(),null,'l’écran ne doit pas se rouvrir tout seul pour une version déjà vue');

// --- 6. L'entrée du menu ⋮ rouvre le changelog à la demande ---------------------------
const bouton=relance.menu();
assert(bouton,'le menu Plus doit exposer une entrée Nouveautés');
assert.equal(bouton.textContent,'✦ Nouveautés','l’entrée doit être lisible dans le menu');
assert.equal(relance.grid.children.length,1,'l’entrée ne doit être ajoutée qu’une fois');
relance.api.ensureMenuEntry();relance.clock.flush();
assert.equal(relance.grid.children.length,1,'les réinstallations ne doivent pas dupliquer l’entrée');
bouton.dispatch('click');
assert.equal(relance.api.isOpen(),true,'l’entrée du menu doit rouvrir le changelog même après lecture');
assert.equal(relance.view().titre,'Nouveautés V226');
assert.equal(relance.sheet.classList.contains('open'),false,'ouvrir les nouveautés referme le menu Plus');
// L'accès manuel reste disponible même sur une première installation silencieuse.
premiere.menu().dispatch('click');
assert.equal(premiere.view().titre,'Nouveautés V226','le menu ⋮ reste accessible après une installation neuve');

// --- 7. Fermer par le fond vaut aussi « vu » ------------------------------------------
const fond=boot({seed:{'store-runner-whatsnew-last-build':BUILD_PRECEDENT}});
fond.clock.flush();
assert.equal(fond.api.isOpen(),true);
fond.view().dialog.dispatch('click');
assert.equal(fond.api.isOpen(),false,'un appui sur le fond doit fermer');
assert.equal(fond.stored(),'226','une fermeture par le fond doit aussi enregistrer la version');
assert.equal(fond.annonce(),null,'et désarmer l’annonce');

// --- 8. Installation antérieure à ce module : le centre de mise à jour fait foi --------
const avantModule=boot({seed:{'store-runner-last-seen-build':BUILD_PRECEDENT,'sector_planner_universal_v1':'{}'}});
avantModule.clock.flush();
assert.equal(avantModule.api.launchState(),'mise-a-jour','un utilisateur déjà installé qui reçoit ce build est en mise à jour');
assert.equal(avantModule.view().titre,'Nouveautés V226','il doit bien voir les nouveautés de la version reçue');

// --- 9. Mise à jour quittée sans lecture : l'annonce survit ----------------------------
const quittee=boot({seed:{'store-runner-whatsnew-last-build':BUILD_PRECEDENT}});
quittee.clock.flush();
assert.equal(quittee.api.isOpen(),true);
assert.equal(quittee.annonce(),'226','l’annonce reste armée tant qu’elle n’a pas été lue');
const reprise=boot({storage:quittee.ctx.__chefStorage});
reprise.clock.flush();
assert.equal(reprise.api.launchState(),'meme-build');
assert.equal(reprise.view().ouvert,true,'une mise à jour jamais lue est réannoncée au lancement suivant');
reprise.view().compris.dispatch('click');
const apresLecture=boot({storage:quittee.ctx.__chefStorage});
apresLecture.clock.flush();
assert.equal(apresLecture.view(),null,'une fois lue, elle ne revient plus');

// --- 10. Sans persistance : jamais d'ouverture automatique, menu toujours utilisable ---
const sansStockage=boot({storage:null});
sansStockage.clock.flush();
assert.equal(sansStockage.api.launchState(),'inconnu','sans stockage, aucun « avant » ne peut être établi');
assert.equal(sansStockage.view(),null,'mieux vaut ne rien ouvrir que rouvrir à chaque lancement');
assert.equal(sansStockage.api.open('226'),true,'l’ouverture manuelle doit rester possible');
assert.equal(sansStockage.api.isOpen(),true);
sansStockage.api.close();

const stockageCasse=boot({storage:{getItem(){throw new Error('quota')},setItem(){throw new Error('quota')}}});
stockageCasse.clock.flush();
assert.equal(stockageCasse.api.launchState(),'inconnu','un stockage qui lève est traité comme absent');
assert.equal(stockageCasse.view(),null,'et ne doit pas rouvrir l’écran à chaque lancement');

// --- 11. Une version sans nouveautés décrites n'invente rien --------------------------
const inconnue=boot({build:'20260920-planning999',seed:{'store-runner-whatsnew-last-build':BUILD}});
inconnue.clock.flush();
assert.equal(inconnue.api.currentVersion(),'999');
assert.equal(inconnue.api.launchState(),'mise-a-jour');
assert.equal(inconnue.annonce(),null,'une version non décrite n’arme aucune annonce');
assert.equal(inconnue.view(),null,'aucun écran fantôme pour une version non décrite');
assert.equal(inconnue.stored(),null,'et rien n’est enregistré');
inconnue.menu().dispatch('click');
assert.equal(inconnue.view().titre,'Nouveautés V'+MODULE.latestRelease().version,'le menu retombe sur la dernière version décrite');

// --- 12. Le bandeau de mise à jour : seul le toast passager est masqué -----------------
function bandeau(app,sticky){
  const b=makeEl('aside',app.doc);b.id='storeRunnerUpdateBanner';b.hidden=false;
  if(sticky)b.dataset.sticky='1';
  app.doc._byId['storeRunnerUpdateBanner']=b;
  return b;
}
const passager=boot({seed:{'store-runner-whatsnew-last-build':BUILD_PRECEDENT}});
const toast=bandeau(passager,false);
passager.clock.flush();
assert.equal(passager.api.isOpen(),true);
assert.equal(toast.hidden,true,'le toast « Mise à jour installée » ne doit pas rester sous le fond flouté');
const collant=boot({seed:{'store-runner-whatsnew-last-build':BUILD_PRECEDENT}});
const sticky=bandeau(collant,true);
collant.clock.flush();
assert.equal(collant.api.isOpen(),true);
assert.equal(sticky.hidden,false,'un bandeau collant porte une information à garder et ne doit pas être masqué');

console.log('quoi de neuf: ouverture sur vraie mise à jour seulement, rechargement inerte, menu ⋮ et cas dégradés ok · V'+MODULE.latestRelease().version);
