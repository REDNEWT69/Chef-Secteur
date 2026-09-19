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
assert.equal(MODULE.displayVersion('20260919-whatsnew226'),'226','la version lisible se déduit du build');

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
  ctx.__STORE_RUNNER_BUILD_REV=('build' in o)?o.build:'20260919-whatsnew226';
  // Par défaut on simule une installation existante : « quoi de neuf » suppose un avant.
  if(o.storage!==null)ctx.__chefStorage=o.storage||makeStorage(o.fresh?{}:{sector_planner_universal_v1:'{}'});
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
  return {ctx,doc,clock,api,grid,sheet,view,
          menu:()=>doc.getElementById('storeRunnerWhatsNewMenuButton'),
          stored:()=>ctx.__chefStorage?ctx.__chefStorage.getItem(api.SEEN_KEY):null};
}

// --- 1. Première ouverture d'une version jamais vue ------------------------------------
const neuf=boot();
assert.equal(neuf.view(),null,'rien ne doit s’afficher avant le délai d’ouverture');
neuf.clock.flush();
let vue=neuf.view();
assert.equal(vue.ouvert,true,'une version jamais vue doit ouvrir l’écran Nouveautés');
assert.equal(vue.titre,'Nouveautés V226','le titre doit nommer la version');
assert.equal(vue.sous_titre,MODULE.releaseFor('226').title,'le sous-titre reprend le titre de la version');
assert.deepEqual(vue.items,MODULE.releaseFor('226').items,'les éléments affichés sont ceux de la table');
assert.equal(neuf.stored(),null,'rien n’est enregistré tant que l’utilisateur n’a pas fermé');

// --- 2. « Compris » ferme et enregistre la version ------------------------------------
vue.compris.dispatch('click');
assert.equal(neuf.api.isOpen(),false,'Compris doit fermer la fenêtre');
assert.equal(neuf.stored(),'226','Compris doit enregistrer la version comme vue');

// --- 3. Relancement : plus jamais d'ouverture automatique pour cette version -----------
const relance=boot({storage:neuf.ctx.__chefStorage});
relance.clock.flush();
assert.equal(relance.api.hasUnseenRelease(),false,'la version vue ne doit plus être considérée comme neuve');
assert.equal(relance.view(),null,'l’écran ne doit pas se rouvrir tout seul pour une version déjà vue');

// --- 4. L'entrée du menu ⋮ rouvre le changelog à la demande ---------------------------
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

// --- 5. Fermer par le fond vaut aussi « vu » ------------------------------------------
const fond=boot();
fond.clock.flush();
assert.equal(fond.api.isOpen(),true);
fond.view().dialog.dispatch('click');
assert.equal(fond.api.isOpen(),false,'un appui sur le fond doit fermer');
assert.equal(fond.stored(),'226','une fermeture par le fond doit aussi enregistrer la version');

// --- 6. Sans persistance : jamais d'ouverture automatique, menu toujours utilisable ----
const sansStockage=boot({storage:null});
sansStockage.clock.flush();
assert.equal(sansStockage.api.hasUnseenRelease(),false,'sans stockage, « une seule fois » ne peut pas être tenu');
assert.equal(sansStockage.view(),null,'mieux vaut ne rien ouvrir que rouvrir à chaque lancement');
assert.equal(sansStockage.api.open('226'),true,'l’ouverture manuelle doit rester possible');
assert.equal(sansStockage.api.isOpen(),true);
sansStockage.api.close();

const stockageCasse=boot({storage:{getItem(){throw new Error('quota')},setItem(){throw new Error('quota')}}});
stockageCasse.clock.flush();
assert.equal(stockageCasse.view(),null,'un stockage qui lève ne doit pas rouvrir l’écran à chaque lancement');

// --- 7. Une version sans nouveautés décrites n'invente rien ---------------------------
const inconnue=boot({build:'20260920-planning999'});
inconnue.clock.flush();
assert.equal(inconnue.api.currentVersion(),'999');
assert.equal(inconnue.api.hasUnseenRelease(),false,'une version non décrite ne doit rien annoncer automatiquement');
assert.equal(inconnue.view(),null,'aucun écran fantôme pour une version non décrite');
assert.equal(inconnue.stored(),null,'et rien n’est enregistré');
inconnue.menu().dispatch('click');
assert.equal(inconnue.view().titre,'Nouveautés V'+MODULE.latestRelease().version,'le menu retombe sur la dernière version décrite');

// --- 8. Première installation : rien à annoncer, mais la prochaine le sera -------------
const premiere=boot({fresh:true});
premiere.clock.flush();
assert.equal(premiere.api.hadPriorInstall(),false,'un stockage vierge est une première installation');
assert.equal(premiere.view(),null,'une première installation n’a aucune nouveauté à annoncer');
assert.equal(premiere.stored(),'226','sa version est enregistrée en silence');
const apresMaj=boot({storage:premiere.ctx.__chefStorage,build:'20261005-planning227'});
apresMaj.clock.flush();
assert.equal(apresMaj.api.hadPriorInstall(),true,'après un premier lancement, l’installation est connue');
assert.equal(apresMaj.api.currentVersion(),'227');
assert.equal(apresMaj.view(),null,'la V227 n’étant pas décrite, rien ne s’invente');
premiere.ctx.__chefStorage.setItem('store-runner-whatsnew-last-seen','225');
const annonce=boot({storage:premiere.ctx.__chefStorage});
annonce.clock.flush();
assert.equal(annonce.view().titre,'Nouveautés V226','une mise à jour depuis une version déjà vue doit être annoncée');

// --- 9. Le bandeau de mise à jour : seul le toast passager est masqué ------------------
function bandeau(app,sticky){
  const b=makeEl('aside',app.doc);b.id='storeRunnerUpdateBanner';b.hidden=false;
  if(sticky)b.dataset.sticky='1';
  app.doc._byId['storeRunnerUpdateBanner']=b;
  return b;
}
const passager=boot();
const toast=bandeau(passager,false);
passager.clock.flush();
assert.equal(toast.hidden,true,'le toast « Mise à jour installée » ne doit pas rester sous le fond flouté');
const collant=boot();
const sticky=bandeau(collant,true);
collant.clock.flush();
assert.equal(sticky.hidden,false,'un bandeau collant porte une information à garder et ne doit pas être masqué');

console.log('quoi de neuf: ouverture unique, Compris persistant, menu ⋮ et cas dégradés ok · V'+MODULE.latestRelease().version);
