const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const source=fs.readFileSync('route-polish.js','utf8');
assert(source.includes('StoreRunnerRoadMatrixV248'),'API V248 absente');
assert(source.includes('store_runner_road_matrix_v248'),'clé de cache V248 absente');
assert(source.includes('/table/v1/driving/'),'service Table OSRM absent');
assert(!source.includes("schedulePrime('home'"),'le cache ne doit plus se préchauffer en arrière-plan à l’accueil');
assert(!source.includes("schedulePrime('load'"),'le cache ne doit plus se préchauffer au simple chargement');
assert(source.includes("'three-weeks'"),'la génération 3 semaines doit déclencher le préchauffage explicite');

const opening=fs.readFileSync('store-opening-hours.js','utf8');
assert(opening.includes("typeof root.roadMinutes==='function'"),'les horaires doivent consommer roadMinutes quand disponible');
const terrain=fs.readFileSync('terrain-planning-v1.js','utf8');
assert(terrain.includes("typeof hours.routeFits==='function'"),'le moteur 3 semaines doit déléguer sa faisabilité aux horaires');

const memory=new Map();
let fetchCount=0,lastUrl='';
const document={
  readyState:'loading',hidden:false,
  addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},getElementById(){return null},
  createElement(){return{style:{},addEventListener(){},setAttribute(){}}},head:{appendChild(){}},dispatchEvent(){}
};
const context={
  console,document,
  CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail},
  MutationObserver:function(){this.observe=function(){}},
  setTimeout(){return 1},clearTimeout(){},addEventListener(){},open(){},
  navigator:{onLine:true},location:{hostname:'localhost'},
  state:{
    profile:{baseLat:45.00000,baseLon:4.00000},
    stores:[
      {id:'A',lat:45.10000,lon:4.10000,active:true},
      {id:'B',lat:45.20000,lon:4.20000,active:true}
    ],excluded:{},settings:{days:['Lundi'],startTime:'08:30',endTime:'18:00',visitMinutes:60},visits:{},plan:{}
  },
  fetch:async(url)=>{
    fetchCount++;lastUrl=String(url);
    return {ok:true,json:async()=>({
      code:'Ok',
      distances:[[0,10000,20000],[11000,0,12000],[21000,13000,0]],
      durations:[[0,600,1200],[660,0,720],[1260,780,0]]
    })};
  }
};
context.window=context;
context.__chefStorage={
  getItem(k){return memory.has(k)?memory.get(k):null},
  setItem(k,v){memory.set(k,String(v))},
  removeItem(k){memory.delete(k)}
};
context.localStorage=context.__chefStorage;
context.baseObj=()=>({id:'BASE',lat:45,lon:4});
context.hav=(a,b)=>{
  const ax=Number(a&&a.lat),ay=Number(a&&a.lon),bx=Number(b&&b.lat),by=Number(b&&b.lon);
  return Math.hypot(ax-bx,ay-by)*80;
};
context.routeCost=()=>0;

vm.runInNewContext(source,context,{filename:'route-polish.js'});
const api=context.StoreRunnerRoadMatrixV248;
assert(api,'V248 non installée');
assert.strictEqual(typeof context.roadMinutes,'function','roadMinutes doit être exposé pour le moteur horaires');

(async()=>{
  const first=await api.prime({force:true});
  assert.strictEqual(first.ok,true,'le premier préchauffage forcé doit réussir');
  assert.strictEqual(fetchCount,1,'un seul appel OSRM attendu');
  assert(lastUrl.includes('/table/v1/driving/'),'endpoint Table attendu');
  assert(lastUrl.includes('annotations=distance,duration'),'distances + durées attendues');
  assert(memory.has('store_runner_road_matrix_v248'),'la matrice doit être persistée hors state');
  assert.strictEqual(context.state.roadMatrix,undefined,'aucun nouveau schéma state ne doit être créé');

  const base=context.baseObj(),a=context.state.stores[0],b=context.state.stores[1];
  const ab=api.cachedLeg(a,b);
  assert(ab,'A → B doit être dans le cache');
  assert.strictEqual(ab.distanceKm,12,'distance routière A → B incorrecte');
  assert.strictEqual(ab.durationMinutes,12,'durée routière A → B incorrecte');
  assert.strictEqual(context.roadMinutes(a,b),12,'roadMinutes doit consommer le cache réel');

  const metrics=api.routeMetrics([a,b],base);
  assert.strictEqual(metrics.distanceKm,43,'boucle base → A → B → base incorrecte');
  assert.strictEqual(metrics.durationMinutes,43,'durée de boucle incorrecte');
  assert.strictEqual(metrics.roadLegs,3,'les trois jambes doivent être routières');
  assert.strictEqual(metrics.estimatedLegs,0,'aucune estimation avec matrice complète');
  assert.strictEqual(metrics.completeRoad,true,'la boucle doit être 100 % routière');

  const second=await api.prime();
  assert.strictEqual(second.ok,true);
  assert.strictEqual(second.cached,true,'la seconde demande doit réutiliser le cache frais');
  assert.strictEqual(fetchCount,1,'aucun second appel réseau avec cache frais');

  const unknown={id:'C',lat:45.3,lon:4.3};
  const fallback=api.leg(b,unknown);
  assert.strictEqual(fallback.source,'estimate','un couple absent doit retomber sur l’estimation');
  assert(Number.isFinite(fallback.distanceKm)&&fallback.distanceKm>0,'distance de repli invalide');
  assert(Number.isFinite(fallback.durationMinutes)&&fallback.durationMinutes>0,'durée de repli invalide');

  let generated=0;
  context.StoreRunnerTerrainPlanningV1={generateThreeWeekSnail:async()=>{generated++;return{ok:true}}};
  assert.strictEqual(api.installGenerationHooks(),true,'le préchauffage doit se brancher sur une génération explicite');
  const wrapped=context.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail;
  assert.strictEqual(api.installGenerationHooks(),false,'réinstaller les hooks ne doit pas créer un second wrapper');
  assert.strictEqual(context.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail,wrapped,'le wrapper planning doit rester stable');
  await context.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail();
  assert.strictEqual(generated,1,'le moteur planning doit être appelé une seule fois');
  assert.strictEqual(fetchCount,1,'un cache frais ne doit pas redemander OSRM avant la génération');

  const status=api.status();
  assert.strictEqual(status.ready,true);
  assert.strictEqual(status.points,3);

  api.clear();fetchCount=0;
  const local=await api.prime();
  assert.strictEqual(local.ok,false);
  assert.strictEqual(local.local,true,'localhost doit rester indépendant du service OSRM public');
  assert.strictEqual(fetchCount,0,'aucun appel réseau en environnement local sans force');

  console.log('road matrix v248 ok');
})().catch(err=>{console.error(err);process.exitCode=1});