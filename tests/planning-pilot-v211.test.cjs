const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const source=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;',
    'window.testPilotV211={planningNeedV211,compareNeedV211,rotationWindowWeeksV211,rotationMemoryV211,repeatReadinessV211,chooseStores,storeKey};window.generatePlanningRange=generateRange;');

function store(id,opts={}){
  return Object.assign({id,enseigne:'Fnac',ville:'Ville '+id,adresse:'Adresse '+id,lat:45,lon:4,priority:3,intervalDays:30,active:true},opts);
}
function archiveWeek(ids,stores,weekMonday){
  const by=new Map(stores.map(s=>[s.id,s])),plan=Object.fromEntries(DAYS.map(d=>[d,[]]));
  plan.Lundi=ids.map(id=>Object.assign({},by.get(id)));
  return {weekMonday,plan};
}
function makeEnv(stores,archive={},perf={}){
  const visits={};
  for(const s of stores)if(s.lastVisit)visits[s.id]={lastVisit:s.lastVisit,history:[s.lastVisit]};
  const state={
    settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:20,weekDate:'2026-09-14',startTime:'08:30',endTime:'18:00',visitMinutes:60,maxVisitsPerDay:4,strategy:'balanced'},
    profile:{baseLat:45,baseLon:4},stores,visits,plan:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]
  };
  const db={getItem:key=>key==='chef_sector_plan_archive_v1'?JSON.stringify(archive):null,setItem(){},removeItem(){}};
  const api={
    planningBoost(_db,id){const p=perf[id];return p==='P1'?60:p==='P2'?25:0},
    latestSnapshot(){return {week:'2026-W37'}},
    rowForStore(_db,id){return perf[id]?{prio:perf[id]}:null},
    isTreated(){return false},
    completedVisitsFor(_state,id){const v=visits[id];return v&&v.lastVisit?{lastVisit:v.lastVisit,count:1}:null}
  };
  const ctx={
    state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,
    localStorage:db,__chefStorage:db,StoreRunnerPerformanceV190:api,
    document:{readyState:'loading',addEventListener(){},querySelectorAll(){return[]},getElementById(){return null},querySelector(){return null}},
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,confirm:()=>true,
    havBase:()=>10,hav:()=>10,baseObj:()=>({lat:45,lon:4}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    includedByFilters:()=>true,storeVisitCredit:()=>1,readPlanningControls(){},save(){},renderAll(){},
    ChefReliability:{checkpoint(){},propose:async()=>false},syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]
  };
  ctx.window=ctx;
  vm.runInNewContext(source,ctx);
  return {ctx,state};
}

{
  const s=store('future',{lastVisit:'2026-09-01',intervalDays:30,priority:3});
  const {ctx}=makeEnv([s]);
  const early=ctx.testPilotV211.planningNeedV211(s,'2026-09-07');
  const late=ctx.testPilotV211.planningNeedV211(s,'2026-10-12');
  assert(late.score>early.score,'le besoin doit augmenter quand la semaine planifiée avance');
  assert(late.overdueDays>0,'la semaine future doit constater le retard réel à cette date');
  assert(late.tier>=4,'un magasin en retard doit remonter dans les niveaux de pilotage');
}

{
  const p1=store('p1',{lastVisit:'2026-08-20'}),normal=store('normal',{lastVisit:'2026-08-20'});
  const {ctx}=makeEnv([p1,normal],{}, {p1:'P1'});
  const np1=ctx.testPilotV211.planningNeedV211(p1,'2026-09-21');
  const nn=ctx.testPilotV211.planningNeedV211(normal,'2026-09-21');
  assert.equal(np1.performancePriority,'P1');
  assert(np1.reasons.includes('P1'));
  assert(ctx.testPilotV211.compareNeedV211(p1,normal,'2026-09-21')<0,'à retard comparable, le P1 doit passer devant');
  assert(np1.score>nn.score);
}

{
  const stores=Array.from({length:56},(_,i)=>store('s'+(i+1),{lastVisit:'2026-08-25'}));
  const archive={
    '2026-08-31':archiveWeek(stores.slice(0,20).map(s=>s.id),stores,'2026-08-31'),
    '2026-09-07':archiveWeek(stores.slice(20,40).map(s=>s.id),stores,'2026-09-07')
  };
  const {ctx}=makeEnv(stores,archive);
  assert.equal(ctx.testPilotV211.rotationWindowWeeksV211(stores,20),3,'56 magasins / 20 par semaine doivent produire une fenêtre de rotation de 3 semaines');
  const memory=ctx.testPilotV211.rotationMemoryV211(stores,'2026-09-14',20);
  assert.equal(memory.usedKeys.size,40,'la mémoire doit retrouver les 40 magasins des deux semaines précédentes');
  const chosen=ctx.testPilotV211.chooseStores(stores,memory.usedKeys,memory.useCount,memory.lastUsedWeek,20,20,'2026-09-14',0);
  const ids=new Set(chosen.map(s=>s.id));
  for(let i=41;i<=56;i++)assert(ids.has('s'+i),'le magasin frais s'+i+' doit passer avant une répétition de confort');
  assert.equal([...ids].filter(id=>Number(id.slice(1))<=40).length,4,'seuls les quatre créneaux restants peuvent recycler des magasins');
}

{
  const stores=Array.from({length:10},(_,i)=>store('w'+(i+1),{intervalDays:7,lastVisit:'2026-09-01'}));
  const archive={'2026-09-07':archiveWeek(stores.slice(0,4).map(s=>s.id),stores,'2026-09-07')};
  const {ctx}=makeEnv(stores,archive,{w1:'P1'});
  const memory=ctx.testPilotV211.rotationMemoryV211(stores,'2026-09-14',4);
  const chosen=ctx.testPilotV211.chooseStores(stores,memory.usedKeys,memory.useCount,memory.lastUsedWeek,4,4,'2026-09-14',0);
  const repeated=chosen.filter(s=>['w1','w2','w3','w4'].includes(s.id));
  const fresh=chosen.filter(s=>!['w1','w2','w3','w4'].includes(s.id));
  assert.equal(repeated.length,1,'la réserve cadence doit être plafonnée à 30 % pour une cible de 4');
  assert.equal(fresh.length,3,'la majorité de la semaine doit rester disponible à la couverture du secteur');
  assert.equal(repeated[0].id,'w1','parmi les cadences dues, le P1 doit passer devant');
}

console.log('planning pilot v211 ok · mémoire inter-semaines · P1/P2 · retard futur · couverture · cadence');
