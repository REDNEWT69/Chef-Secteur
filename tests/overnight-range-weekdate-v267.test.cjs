const assert=require('assert/strict');

const BASE={id:'BASE',lat:47,lon:1};
const WEEK_KEYS=['2026-09-28','2026-10-05','2026-10-12'];
const TODAY='2026-09-30';
const memory=new Map();
const calls=[];

function suffix(store){
  const id=String(store&&store.id||'BASE');
  return id==='BASE'?'BASE':id.slice(-1);
}
const durations=new Map([
  ['BASE>A',10],['BASE>B',20],['BASE>C',25],
  ['A>B',8],['B>C',8],['C>BASE',10],
  ['A>C',70],['C>B',70],['B>BASE',20],
  ['B>A',8],['C>A',70],['BASE>BASE',0]
]);
function travel(a,b){return durations.get(suffix(a)+'>'+suffix(b))??120}
function addDay(iso){
  const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function weekPlan(prefix){
  const make=letter=>({id:prefix+letter,lat:49+letter.charCodeAt(0)/10000,lon:1});
  return{Lundi:[make('A'),make('C'),make('B')],Mardi:[make('D')],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
}
const plans=Object.fromEntries(WEEK_KEYS.map((key,index)=>[key,weekPlan('S'+(index+1))]));
const appState={
  profile:{baseLat:47,baseLon:1,overnightMode:'auto',overnightMinSaving:20},
  settings:{weekDate:WEEK_KEYS[0],days:['Lundi','Mardi'],startTime:'08:30',endTime:'18:00',visitMinutes:60},
  plan:plans[WEEK_KEYS[0]],
  stores:Object.values(plans).flatMap(plan=>plan.Lundi.concat(plan.Mardi)),
  manualWeekEdits:{}
};

global.state=appState;
global.baseObj=()=>BASE;
global.__chefStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value)),
  removeItem:key=>memory.delete(key),
  flush:async()=>{}
};
global.StoreRunnerRoadMatrixV248={durationMinutes:travel};
global.StoreOpeningHoursV1={
  dateForDay:()=>TODAY,
  originBase:()=>BASE,
  scheduleRoute(route,day,state,options){
    let current=510,previous=BASE,drive=0;const rows=[];
    for(const store of route){
      const minutes=options.travelMinutes(previous,store);
      drive+=minutes;current+=minutes;rows.push({store,travel:minutes,duration:30,wait:0});
      current+=30;previous=store;
    }
    const back=route.length?options.travelMinutes(previous,BASE):0;
    return{start:510,endLimit:1440,estimatedEnd:current+back,closedCount:0,appointmentConflicts:0,rows,returnTravel:back,driveMinutes:drive+back};
  }
};
global.StoreRunnerTerrainPlanningV1={};
global.document={addEventListener(){},dispatchEvent(){}};
global.CustomEvent=function(type,init){this.type=type;this.detail=init&&init.detail};
global.save=()=>{};
global.renderAll=()=>{};

/* Signature volontairement V182 (un seul paramètre). JavaScript ignore sans danger
   l'argument weekKey ajouté par V251, tandis que V189 peut le lire via arguments[1]. */
function analyze(plan){
  const weekKey=arguments[1],effectiveWeek=weekKey||appState.settings.weekDate;
  calls.push({plan,weekKey,argCount:arguments.length,firstId:String(plan&&plan.Lundi&&plan.Lundi[0]&&plan.Lundi[0].id||'')});
  const fromDate=effectiveWeek,toDate=addDay(effectiveWeek);
  const candidate=fromDate>=TODAY&&plan&&plan.Lundi&&plan.Lundi.length&&plan.Mardi&&plan.Mardi.length
    ?{night:'Nuit Lundi → Mardi',fromDay:'Lundi',toDay:'Mardi',fromDate,toDate,saving:200,remoteKm:200}
    :null;
  return{mode:'auto',threshold:20,candidate,reason:candidate?'candidate':'no-future-pair',best:candidate,bestRemote:candidate};
}
assert.equal(analyze.length,1,'la compatibilité avec la signature V182 à un paramètre est exercée');
global.StoreRunnerOvernightV182={analyze};

memory.set('chef_sector_plan_archive_v1',JSON.stringify(Object.fromEntries(WEEK_KEYS.map(key=>[key,{
  weekMonday:key,plan:plans[key],manualEdited:false
}]))));
memory.set('chef_sector_range_v1',JSON.stringify({start:WEEK_KEYS[0],weeks:3,workDays:['Lundi','Mardi']}));

const optimizer=require('../planning-route-optimizer-v251.js');

(async()=>{
  const result=await optimizer.finalizeRange(appState);
  assert.equal(result.changed,true,'la fixture doit réellement déclencher le recalcul des rapports V251');

  assert.deepEqual(
    calls.map(call=>call.weekKey),
    WEEK_KEYS,
    'ROUGE r26 : V251 doit appeler analyze(plan, week.weekKey), pas analyze(plan) avec repli sur state.settings.weekDate'
  );
  assert.deepEqual(calls.map(call=>call.firstId.slice(0,2)),['S1','S2','S3'],'chaque row transmet son propre plan');
  assert.deepEqual(calls.map(call=>call.argCount),[2,2,2],'le contrat V251 transmet exactement plan + weekKey');

  const range=JSON.parse(memory.get('chef_sector_range_v1'));
  assert.equal(range.overnightReport.length,3);
  assert.equal(range.overnightReport[0].weekKey,WEEK_KEYS[0]);
  assert.equal(range.overnightReport[0].selected,false,'la nuit passée de S1 ne doit pas être ressuscitée');
  assert.equal(range.overnightReport[0].best,null);

  const s2=range.overnightReport[1],s3=range.overnightReport[2];
  assert.equal(s2.weekKey,'2026-10-05');
  assert.equal(s2.selected,true);
  assert.equal(s2.best.fromDate,'2026-10-05');
  assert.equal(s2.best.toDate,'2026-10-06');
  assert.equal(s3.weekKey,'2026-10-12');
  assert.equal(s3.selected,true);
  assert.equal(s3.best.fromDate,'2026-10-12');
  assert.equal(s3.best.toDate,'2026-10-13');

  console.log('overnight range weekDate : S2 2026-10-05 → 2026-10-06 ; S3 2026-10-12 → 2026-10-13 : OK');
})().catch(error=>{console.error(error);process.exitCode=1});
