// V210 : cette garde valide aussi le build final routequality210 après le bump de version.
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const source=fs.readFileSync('route-polish.js','utf8');
assert(source.includes('StoreRunnerPlanningQualityV210'),'API qualité V210 absente');
assert(source.includes('__v210RoundTrip'),'garde routeCost V210 absente');

const document={
  readyState:'loading',hidden:false,
  addEventListener(){},
  querySelector(){return null},
  querySelectorAll(){return[]},
  getElementById(){return null},
  createElement(){return{style:{},addEventListener(){},setAttribute(){}}},
  head:{appendChild(){}}
};
const context={
  console,
  document,
  MutationObserver:function(){this.observe=function(){}},
  setTimeout(){return 0},clearTimeout(){},
  fetch:async()=>{throw new Error('network disabled in test')},
  addEventListener(){},
  open(){},
  state:{
    profile:{baseName:'Base',baseLat:0,baseLon:0},
    settings:{days:['Lundi'],startTime:'08:30',endTime:'18:00',saturdayStart:'08:00',saturdayEnd:'12:00',visitMinutes:60},
    stores:[],visits:{},plan:{}
  }
};
context.window=context;
context.localStorage={getItem(){return null},setItem(){}};
context.baseObj=()=>({id:'BASE',x:0,lat:0,lon:0});
context.hav=(a,b)=>Math.abs(Number(a.x||0)-Number(b.x||0));
context.routeCost=(route,start)=>{
  if(!route||!route.length)return 0;
  let p=start||context.baseObj(),km=0;
  for(const s of route){km+=context.hav(p,s);p=s}
  return km;
};

vm.runInNewContext(source,context,{filename:'route-polish.js'});
const api=context.StoreRunnerPlanningQualityV210;
assert(api,'API V210 non installée');
assert.strictEqual(context.routeCost.__v210RoundTrip,true,'routeCost n’est pas patché');

const route=[{id:'A',x:1,intervalDays:7},{id:'B',x:2,intervalDays:7}];
assert.strictEqual(context.routeCost(route),4,'le retour dernier magasin → base doit être compté');
assert.strictEqual(api.roundTripRouteKm(route),4,'l’API doit partager la même métrique');
assert.strictEqual(context.routeCost([{x:4},{x:3}],{x:5}),4,'un départ explicite doit aussi former une boucle complète');

context.state.stores=route.slice();
context.state.plan={Lundi:route.slice()};
context.state.visits={A:{lastVisit:'2026-09-01'},B:{lastVisit:'2026-09-15'}};
const metrics=api.measure(context.state.plan,{today:'2026-09-17'});
assert.strictEqual(metrics.totalKm,4,'kilométrage semaine incorrect');
assert.strictEqual(metrics.plannedStores,2,'nombre de magasins incorrect');
assert.strictEqual(metrics.infeasibleDayCount,0,'la petite journée doit rester faisable');
assert.strictEqual(metrics.plannedLateness.maxDays,9,'retard max incorrect');
assert(metrics.driveMinutes>0&&metrics.workMinutes>metrics.driveMinutes,'les temps doivent être mesurés séparément');

context.state.plan={Lundi:[{id:'FAR',x:300,intervalDays:30}]};
const hard=api.measure(context.state.plan,{today:'2026-09-17'});
assert.strictEqual(hard.infeasibleDayCount,1,'une journée trop longue doit être signalée');

const cmp=api.compare({Lundi:[{x:1},{x:5}]},{Lundi:[{x:1},{x:2}]},{today:'2026-09-17'});
assert(cmp.delta.km<0,'compare() doit voir le gain kilométrique');

const core=fs.readFileSync('src/chef-secteur.html','utf8');
assert(/function twoOpt\(route\)[\s\S]*?routeCost\(r\)[\s\S]*?routeCost\(cand\)/.test(core),'twoOpt ne consomme plus routeCost : revoir le patch V210');
const range=fs.readFileSync('range-planner-v2.js','utf8');
assert(range.includes("typeof nearestRoute==='function'&&typeof twoOpt==='function'"),'le moteur V2 doit toujours utiliser les helpers d’ordonnancement');

console.log('planning route quality v210 ok');
