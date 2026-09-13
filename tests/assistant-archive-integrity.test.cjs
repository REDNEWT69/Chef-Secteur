const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// L'archive de la semaine courante revenait avec des magasins à 4 champs, alors que les
// semaines suivantes en avaient 11 : assistant-store-lookup.js repassait derrière le
// planificateur et remplaçait l'entrée au lieu de la compléter, 80 ms après n'importe quel
// rendu du planning. Ce test fige l'inverse : le module lit l'archive, il ne l'écrit plus.

const SOURCE=fs.readFileSync(__dirname+'/../assistant-store-lookup.js','utf8');
const CHAMPS=['id','enseigne','ville','adresse','dept','lat','lon','freq','priority','lastVisit','intervalDays'];
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const LUNDI='2026-09-14';

function magasin(n,ville){
  return {id:'s'+n,enseigne:'Boulanger',ville:ville,adresse:n+' rue des Tilleuls',dept:'80',
          lat:49.89+n/1000,lon:2.3+n/1000,freq:'Mensuel',priority:3,lastVisit:'2026-08-12',intervalDays:30};
}
// Ce qu'écrit le planificateur : cloneStore, onze champs, coordonnées comprises.
function archiveDuPlanificateur(){
  return {
    '2026-09-14':{weekMonday:'2026-09-14',plan:{Lundi:[magasin(1,'Amiens'),magasin(2,'Abbeville')],Mardi:[magasin(3,'Albert')],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}},
    '2026-09-21':{weekMonday:'2026-09-21',plan:{Lundi:[magasin(4,'Doullens')],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}},
    '2026-09-28':{weekMonday:'2026-09-28',plan:{Lundi:[magasin(5,'Péronne')],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}
  };
}
function champsParMagasin(archive){
  const tailles=[],sansCoord=[];
  for(const k of Object.keys(archive))
    for(const d of DAYS)
      for(const s of ((archive[k]&&archive[k].plan&&archive[k].plan[d])||[])){
        tailles.push(Object.keys(s).length);
        if(s.lat===undefined||s.lon===undefined)sansCoord.push(k+'/'+d);
      }
  return {min:Math.min.apply(null,tailles),max:Math.max.apply(null,tailles),total:tailles.length,sansCoord};
}

// --- AVANT : la ligne telle qu'elle était livrée ---------------------------------------
// Reproduite ici à l'identique, comme référence historique : c'est la seule façon de
// mesurer l'état d'avant sans ressusciter le fichier.
function snapshotLegacy(archive,plan,mon){
  const out={weekMonday:mon,plan:{}};
  for(const day of DAYS)out.plan[day]=((plan&&plan[day])||[]).map(s=>({id:s.id||'',enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||''}));
  archive[mon]=out;                       // remplace au lieu de compléter
  return archive;
}
const planCourant=archiveDuPlanificateur()[LUNDI].plan;
const avant=champsParMagasin(snapshotLegacy(archiveDuPlanificateur(),planCourant,LUNDI));
assert.equal(avant.min,4,'AVANT : la semaine courante tombait à 4 champs par magasin');
assert.equal(avant.sansCoord.length,3,'AVANT : ses trois magasins perdaient lat/lon');

// --- Le module d'aujourd'hui, exécuté pour de vrai -------------------------------------
function lancerModule(){
  const store={};
  const mem={
    getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v)},
    removeItem:k=>{delete store[k]}
  };
  mem.setItem('chef_sector_plan_archive_v1',JSON.stringify(archiveDuPlanificateur()));
  const state={
    stores:[magasin(1,'Amiens'),magasin(2,'Abbeville'),magasin(3,'Albert'),magasin(4,'Doullens'),magasin(5,'Péronne')],
    plan:archiveDuPlanificateur()[LUNDI].plan,
    settings:{weekDate:LUNDI}
  };
  const rendus=[];
  const document={
    addEventListener:(t,fn)=>{(ecouteurs[t]=ecouteurs[t]||[]).push(fn)},
    dispatchEvent:e=>{for(const fn of (ecouteurs[e.type]||[]))fn(e)},
    getElementById:()=>null,
    querySelector:()=>null,
    querySelectorAll:()=>[],
    readyState:'complete'
  };
  const ecouteurs={};
  class ObservateurInterdit{constructor(){throw new Error('MutationObserver construit par assistant-store-lookup.js')}}
  const ctx={console,JSON,Date,Math,String,Number,Boolean,Object,Array,Set,Map,RegExp,Error,
             setTimeout,clearTimeout,state,document,MutationObserver:ObservateurInterdit,
             CustomEvent:class{constructor(t,o){this.type=t;Object.assign(this,o||{})}}};
  ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
  ctx.window.__chefStorage=mem;
  vm.runInNewContext(SOURCE,ctx);
  return {ctx,mem,state,rendus,
          archive:()=>JSON.parse(mem.getItem('chef_sector_plan_archive_v1')||'{}'),
          emettre:t=>document.dispatchEvent(new ctx.CustomEvent(t,{detail:{}}))};
}

const app=lancerModule();
const apres=champsParMagasin(app.archive());
assert.equal(apres.min,11,'APRÈS : toutes les semaines archivées gardent onze champs');
assert.equal(apres.max,11);
assert.equal(apres.total,5,'les cinq magasins archivés sont toujours là');
assert.deepEqual(apres.sansCoord,[],'aucun magasin archivé ne doit être sans lat/lon');
for(const s of app.archive()[LUNDI].plan.Lundi)
  assert.deepEqual(Object.keys(s).sort(),CHAMPS.slice().sort(),'les onze champs du planificateur sont intacts');

// --- L'archive survit à dix rendus successifs -----------------------------------------
const temoin=JSON.stringify(app.archive());
for(let i=0;i<10;i++){app.emettre('store-runner:planning-updated');app.emettre('store-runner:data-restored')}
assert.equal(JSON.stringify(app.archive()),temoin,'dix rendus du planning ne doivent rien changer à l’archive');

// --- L'API publique existe toujours et n'écrit pas -------------------------------------
assert.equal(typeof app.ctx.window.chefSecteurSnapshotCurrentWeek,'function','window.chefSecteurSnapshotCurrentWeek doit rester exposé');
const vue=app.ctx.window.chefSecteurSnapshotCurrentWeek();
assert.equal(vue.weekMonday,LUNDI);
assert.deepEqual(Object.keys(vue.plan.Lundi[0]).sort(),CHAMPS.slice().sort(),'la vue rendue porte des magasins complets');
assert.equal(JSON.stringify(app.archive()),temoin,'et son appel n’écrit rien');
vue.plan.Lundi.push(magasin(9,'Intrus'));
assert.equal(app.state.plan.Lundi.length,2,'la vue rendue ne doit pas être la liste vivante de state.plan');

// --- Les réponses de l'assistant ne changent pas --------------------------------------
const reponse=app.ctx.window.chefSecteurStoreScheduleAnswer('quand je passe chez Boulanger Albert ce mois');
assert.ok(reponse&&reponse.includes('est planifié ce mois'),'l’assistant doit toujours répondre sur l’historique du mois');
assert.ok(/mardi 15 septembre 2026/i.test(reponse),'et dater la visite depuis la semaine courante lue dans state.plan');
const lointain=app.ctx.window.chefSecteurStoreScheduleAnswer('quand je passe chez Boulanger Péronne ce mois');
assert.ok(lointain&&/lundi 28 septembre 2026/i.test(lointain),'les semaines suivantes restent lues dans l’archive');
assert.equal(JSON.stringify(app.archive()),temoin,'répondre à une question n’écrit pas dans l’archive');

// --- Garde-fous statiques -------------------------------------------------------------
assert.doesNotMatch(SOURCE,/MutationObserver/,'aucun MutationObserver dans ce module');
assert.doesNotMatch(SOURCE,/setItem\s*\(/,'ce module n’écrit dans aucun stockage');
assert.match(SOURCE,/chef_sector_plan_archive_v1/,'il continue de lire l’archive');

console.error('  AVANT, semaine courante archivée : '+avant.min+' champs par magasin, '+avant.sansCoord.length+' sans lat/lon');
console.error('  APRÈS, semaine courante archivée : '+apres.min+' champs par magasin, '+apres.sansCoord.length+' sans lat/lon');
console.log('PASS: l’archive du planificateur garde ses onze champs, survit à dix rendus, et l’assistant répond sans rien écrire.');
