const assert=require('assert/strict');

const BASE={id:'BASE',lat:45,lon:4};
const A={id:'A',lat:45.1,lon:4.1};
const B={id:'B',lat:45.2,lon:4.2};
const C={id:'C',lat:45.3,lon:4.3};
const state={profile:{baseLat:45,baseLon:4},settings:{weekDate:'2026-09-21',startTime:'08:30',endTime:'18:00',visitMinutes:60},appointments:[],stores:[A,B,C],manualWeekEdits:{}};

global.baseObj=()=>BASE;
const durations=new Map();
function set(a,b,n){durations.set(String(a)+'>'+String(b),n)}
function get(a,b){return durations.get(String(a&&a.id)+'>'+String(b&&b.id))??120}
set('BASE','A',10);set('BASE','B',20);set('BASE','C',25);
set('A','B',8);set('B','C',8);set('C','BASE',10);
set('A','C',70);set('C','B',70);set('B','BASE',20);
set('B','A',8);set('C','A',70);set('BASE','BASE',0);
global.StoreRunnerRoadMatrixV248={durationMinutes:get};

global.StoreOpeningHoursV1={
  dateForDay:()=> '2026-09-24',
  originBase:()=>null,
  scheduleRoute(route,day,s,options){
    let current=510,prev=BASE,drive=0;const rows=[];
    for(const store of route){const travel=options.travelMinutes(prev,store);drive+=travel;current+=travel;rows.push({store,travel,duration:60,wait:0});current+=60;prev=store}
    const back=route.length?options.travelMinutes(prev,BASE):0;drive+=back;current+=back;
    return{day,start:510,endLimit:1080,estimatedEnd:current,closedCount:0,appointmentConflicts:0,rows,returnTravel:back,driveMinutes:drive};
  }
};

const optimizer=require('../planning-route-optimizer-v251.js');

// La route historique A → C → B est volontairement mauvaise. La V251 doit garder
// exactement les mêmes magasins mais choisir l'ordre routier plus court A → B → C.
let result=optimizer.explainOptimization([A,C,B],'Jeudi',state,{weekMonday:new Date('2026-09-21T12:00:00')});
assert.equal(result.changed,true);
assert.deepEqual(result.route.map(s=>s.id),['A','B','C']);
assert.deepEqual(new Set(result.route.map(s=>s.id)),new Set(['A','B','C']));
assert.ok(result.after.driveMinutes<result.before.driveMinutes);
assert.equal(result.after.feasible,true);

// Une contrainte horaire/rendez-vous gagne sur la distance : si B avant A est déclaré
// incompatible, l'optimiseur doit conserver une proposition faisable.
const normalSchedule=global.StoreOpeningHoursV1.scheduleRoute;
global.StoreOpeningHoursV1.scheduleRoute=(route,day,s,options)=>{
  const out=normalSchedule(route,day,s,options);
  if(route.findIndex(x=>x.id==='B')<route.findIndex(x=>x.id==='A'))out.appointmentConflicts=1;
  return out;
};
result=optimizer.explainOptimization([A,C,B],'Jeudi',state,{});
assert.equal(result.after.feasible,true);
assert.ok(result.route.findIndex(x=>x.id==='A')<result.route.findIndex(x=>x.id==='B'));

// Si aucune permutation n'est réellement faisable, une route plus courte ne suffit pas
// à autoriser un changement automatique : l'ordre existant reste intact.
global.StoreOpeningHoursV1.scheduleRoute=(route,day,s,options)=>{
  const out=normalSchedule(route,day,s,options);out.appointmentConflicts=1;return out;
};
result=optimizer.explainOptimization([A,C,B],'Jeudi',state,{});
assert.equal(result.changed,false);
assert.deepEqual(result.route.map(s=>s.id),['A','C','B']);

// « Commencer par ici » reste prioritaire : un premier arrêt explicitement fixé ne peut
// pas être déplacé par l'optimisation du reste de la tournée.
global.StoreOpeningHoursV1.scheduleRoute=normalSchedule;
result=optimizer.explainOptimization([C,A,B],'Jeudi',state,{fixedFirstId:'C'});
assert.equal(result.route[0].id,'C');
assert.deepEqual(new Set(result.route.map(s=>s.id)),new Set(['A','B','C']));

// Aucun gain démontré = aucun changement silencieux.
const flat=()=>10;
global.StoreRunnerRoadMatrixV248={durationMinutes:flat};
result=optimizer.explainOptimization([A,B,C],'Jeudi',state,{});
assert.equal(result.changed,false);
assert.deepEqual(result.route.map(s=>s.id),['A','B','C']);

// Le niveau plan ne change jamais l'affectation entre jours : seul l'ordre interne peut
// varier. C'est le garde-fou principal entre V249 (groupes/jours) et V251 (ordre).
global.StoreRunnerRoadMatrixV248={durationMinutes:get};
const plan={Lundi:[A,C,B],Mardi:[C,A],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
const planned=optimizer.optimizePlan(plan,'2026-09-21',state,{});
assert.deepEqual(new Set(planned.plan.Lundi.map(s=>s.id)),new Set(['A','B','C']));
assert.deepEqual(new Set(planned.plan.Mardi.map(s=>s.id)),new Set(['A','C']));
assert.equal(planned.plan.Lundi.length,3);
assert.equal(planned.plan.Mardi.length,2);

(async()=>{
  // Une semaine marquée manuelle/protégée n'est jamais réordonnée par le finaliseur.
  const memory=new Map();
  global.__chefStorage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),flush:async()=>{}};
  const manualState={...state,plan:{Lundi:[A,C,B],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},manualWeekEdits:{'2026-09-21':{at:'2026-09-21T00:00:00Z'}}};
  memory.set('chef_sector_plan_archive_v1',JSON.stringify({'2026-09-21':{weekMonday:'2026-09-21',plan:manualState.plan,manualEdited:true}}));
  const manual=await optimizer.finalizeSingleWeek(manualState,{weekKey:'2026-09-21'});
  assert.equal(manual.changed,false);
  assert.equal(manual.skipped,'manual');
  assert.deepEqual(manualState.plan.Lundi.map(s=>s.id),['A','C','B']);

  // Sur une semaine automatique, la nouvelle route est persistée dans l'archive sans
  // créer, retirer ni déplacer de magasin entre les jours.
  const autoState={...state,plan:{Lundi:[A,C,B],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},manualWeekEdits:{}};
  memory.set('chef_sector_plan_archive_v1',JSON.stringify({'2026-09-21':{weekMonday:'2026-09-21',plan:autoState.plan,manualEdited:false}}));
  const automatic=await optimizer.finalizeSingleWeek(autoState,{weekKey:'2026-09-21'});
  assert.equal(automatic.changed,true);
  assert.deepEqual(autoState.plan.Lundi.map(s=>s.id),['A','B','C']);
  const saved=JSON.parse(memory.get('chef_sector_plan_archive_v1'));
  assert.deepEqual(saved['2026-09-21'].plan.Lundi.map(s=>s.id),['A','B','C']);
  assert.equal(saved['2026-09-21'].routeOptimized,'v251');

  console.log('V251 optimisation intra-journée : OK');
})().catch(error=>{console.error(error);process.exitCode=1});
