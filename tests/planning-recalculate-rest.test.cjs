require('./planning-consolidation.test.cjs');
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const source=fs.readFileSync(__dirname+'/../planning-generation-controller.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../planning-cascade-v181.js','utf8');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';
const RealDate=Date;
class FakeDate extends RealDate{
  constructor(...args){super(...(args.length?args:['2026-09-15T12:00:00']))}
  static now(){return new RealDate('2026-09-15T12:00:00').getTime()}
}
function mk(id,enseigne,ville){return{id,enseigne,ville:ville||id,adresse:'1 rue test',dept: '99',active:true,lat:43.6,lon:-0.6,priority:3}}
function emptyPlan(){return Object.fromEntries(DAYS.map(d=>[d,[]]))}
function actualCredit(s){return /boulanger|but|darty|carrefour|conforama/i.test(String(s&&s.enseigne||''))?2:1}
function planningCredit(s,active,max=4){if(/boulanger/i.test(String(s&&s.enseigne||''))&&active)return Math.max(actualCredit(s),max-1);return actualCredit(s)}
function ids(route){return JSON.stringify(Array.from(route||[],s=>String(s.id)))}
function allOccurrences(plan){return DAYS.flatMap(day=>(plan&&plan[day]||[]).map(s=>String(s.id)))}

function env(){
  const b0=mk('b0','Boulanger','Ville-Test A'),missed=mk('f0','Fnac','Ville-Test B'),b1=mk('b1','Boulanger','Ville-Test C'),b2=mk('b2','Boulanger','Ville-Test H'),but1=mk('but1','BUT','Ville-Test C'),d1=mk('d1','Darty','Ville-Test B'),f1=mk('f1','Fnac','Ville-Test E');
  const plan=emptyPlan();plan.Lundi=[b0,missed];plan.Mardi=[b1,b2];plan.Mercredi=[but1,f1];
  const state={
    settings:{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:4},
    stores:[b0,missed,b1,b2,but1,d1,f1],plan,visits:{},
    businessV2:{visits:[{id:'visit-b0',storeId:'b0',status:'completed',completedDate:'2026-09-14'}],actions:[],storeSnapshots:{}},
    locks:{b2:{day:'Vendredi',week:'2026-09-14'}},appointments:[{id:'a1',storeId:'but1',date:'2026-09-17'}],manualWeekEdits:{'2026-09-14':'2026-09-15T08:00:00.000Z'},calendarEvents:[]
  };
  const mem=new Map();
  mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',manualEdited:true,plan:JSON.parse(JSON.stringify(plan))}}));
  const storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),flush:()=>Promise.resolve()};
  const weekInput={value:'2026-09-14'};
  const doc={readyState:'complete',addEventListener(){},dispatchEvent(){},getElementById(id){return id==='weekDate'?weekInput:null},querySelector(){return null},querySelectorAll(){return[]},createElement(){return{style:{},addEventListener(){},insertAdjacentElement(){}}}};
  const proposals=[];
  const ctx={
    console,Date:FakeDate,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,Promise,setTimeout,clearTimeout,
    state,document:doc,confirm:()=>true,CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    localStorage:storage,__chefStorage:storage,addEventListener(){},dispatchEvent(){},generateWeek:async()=>({ok:true}),storeRunnerHasValidBase:()=>true,save(){},renderAll(){},calendarEventsForDate:()=>[],
    storeVisitCredit:s=>planningCredit(s,ctx.__storeRunnerPlanningGenerationActive===true,state.settings.maxVisitsPerDay||4),StoreVisitCounting:{credit:actualCredit},
    ChefReliability:{checkpoint(){},propose:async candidate=>{
      proposals.push(JSON.parse(JSON.stringify(candidate)));
      state.plan=JSON.parse(JSON.stringify(candidate.plan));
      state.settings.weekDate=candidate.weekDate;
      if(candidate.archive)mem.set(ARCHIVE_KEY,JSON.stringify(candidate.archive));
      if(candidate.range)mem.set(RANGE_KEY,JSON.stringify(candidate.range));
      return true;
    }}
  };
  ctx.window=ctx;vm.runInNewContext(source,ctx);return{ctx,state,mem,proposals,stores:{b0,missed,b1,b2,but1,d1,f1}};
}
function buildAsPlanning(t){t.ctx.__storeRunnerPlanningGenerationActive=true;try{return t.ctx.__storeRunnerBuildRemainingWeekPlan()}finally{t.ctx.__storeRunnerPlanningGenerationActive=false}}
function setFixedTuesday(t,stores,max){
  t.state.settings.maxVisitsPerDay=max;t.state.plan=emptyPlan();t.state.plan.Mardi=stores.slice();t.state.visits={};t.state.businessV2={visits:[],actions:[],storeSnapshots:{}};t.state.appointments=[];t.state.locks={};
  for(const s of stores)t.state.locks[s.id]={day:'Mardi',week:'2026-09-14'};
  t.mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(t.state.plan))}}));
}
function assertRoutesRespectRules(t,weeks){
  for(const [week,plan] of Object.entries(weeks))for(const day of DAYS){
    const route=plan[day]||[],boul=route.filter(s=>/boulanger/i.test(s.enseigne));
    assert(boul.length<=1,week+' '+day+' contient deux Boulanger');
    if(boul.length)for(const s of route)if(!/boulanger/i.test(s.enseigne))assert.equal(actualCredit(s),1,week+' '+day+' : compagnon Boulanger à plus de 1 crédit');
    const capacity=route.reduce((n,s)=>n+planningCredit(s,true,t.state.settings.maxVisitsPerDay||4),0);
    assert(capacity<=(t.state.settings.maxVisitsPerDay||4),week+' '+day+' dépasse la capacité');
  }
}

(async()=>{
  const t=env();
  assert.equal(typeof t.ctx.storeRunnerRecalculateRemainingWeek,'function');
  assert.equal(typeof t.ctx.__storeRunnerBuildRemainingWeekPlan,'function');
  const built=buildAsPlanning(t);assert.equal(built.ok,true,built.error||'recalcul possible');
  assert.equal(ids(built.plan.Lundi),'["b0"]','visite terminée lundi immobile');
  assert(!built.plan.Lundi.some(s=>s.id==='f0'),'raté lundi doit bouger');
  assert(built.plan.Jeudi.some(s=>s.id==='but1'),'rendez-vous jeudi immobile');
  assert(built.plan.Vendredi.some(s=>s.id==='b2'),'verrou vendredi immobile');
  assertRoutesRespectRules(t,built.weeks);

  const before=allOccurrences(t.state.plan).sort();
  const result=await t.ctx.storeRunnerRecalculateRemainingWeek();
  assert.equal(result.ok,true,result.error||'recalcul accepté');
  assert.equal(t.proposals.length,1,'Reliability.propose utilisé');
  const archive=JSON.parse(t.mem.get(ARCHIVE_KEY));
  const after=Object.values(result.weeks).flatMap(allOccurrences).sort();
  assert.deepEqual(after,before,'aucune occurrence perdue ou inventée');
  assert.equal(ids(t.state.plan.Lundi),'["b0"]');
  assert(t.state.manualWeekEdits['2026-09-14']&&t.state.manualWeekEdits['2026-09-14'].plan,'semaine marquée manuelle');
  assert.equal(archive['2026-09-14'].manualEdited,true);
  assert.equal(ids(archive['2026-09-14'].plan.Lundi),'["b0"]');

  // V181 : huit Boulanger initialement empilés sur mar-ven doivent déborder en cascade sur la semaine suivante.
  const cascade=env();
  cascade.state.visits={};cascade.state.businessV2={visits:[],actions:[],storeSnapshots:{}};cascade.state.locks={};cascade.state.appointments=[];cascade.state.manualWeekEdits={};
  const bs=Array.from({length:8},(_,i)=>mk('cb'+(i+1),'Boulanger','Ville '+(i+1)));
  cascade.state.stores=bs.slice();cascade.state.plan=emptyPlan();
  cascade.state.plan.Mardi=[bs[0],bs[1]];cascade.state.plan.Mercredi=[bs[2],bs[3]];cascade.state.plan.Jeudi=[bs[4],bs[5]];cascade.state.plan.Vendredi=[bs[6],bs[7]];
  cascade.mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(cascade.state.plan))}}));
  const cascadeBuilt=buildAsPlanning(cascade);
  assert.equal(cascadeBuilt.ok,true,cascadeBuilt.error||'cascade multi-semaines possible');
  assert(cascadeBuilt.weeks['2026-09-21'],'une semaine suivante doit être créée');
  assert(cascadeBuilt.lastWeekKey>cascadeBuilt.weekKey,'le recalcul doit déborder après vendredi');
  assertRoutesRespectRules(cascade,cascadeBuilt.weeks);
  assert.equal(Object.values(cascadeBuilt.weeks).flatMap(allOccurrences).length,8,'les 8 Boulanger doivent rester présents exactement une fois');
  const cascadeApplied=await cascade.ctx.storeRunnerRecalculateRemainingWeek();
  assert.equal(cascadeApplied.ok,true,cascadeApplied.error||'cascade appliquée');
  const cascadeArchive=JSON.parse(cascade.mem.get(ARCHIVE_KEY));
  assert(cascadeArchive['2026-09-21']&&Object.values(cascadeArchive['2026-09-21'].plan).some(r=>r.length),'la semaine suivante doit être persistée dans l’archive');
  assert.equal(cascadeArchive['2026-09-21'].manualEdited,true,'la semaine décalée doit être protégée');
  const range=JSON.parse(cascade.mem.get(RANGE_KEY));
  assert(range&&range.end>='2026-09-26','la bande planning doit être étendue à la semaine suivante');
  assert.equal(range.start,'2026-09-14');

  // V181 domino : une semaine suivante déjà remplie est conservée et ses visites se décalent à leur tour.
  const domino=env();domino.state.visits={};domino.state.businessV2={visits:[],actions:[],storeSnapshots:{}};domino.state.locks={};domino.state.appointments=[];domino.state.manualWeekEdits={};
  const current=Array.from({length:5},(_,i)=>mk('db'+(i+1),'Boulanger','Courant '+(i+1)));
  const future=Array.from({length:5},(_,i)=>mk('df'+(i+1),'Boulanger','Futur '+(i+1)));
  domino.state.stores=current.concat(future);domino.state.plan=emptyPlan();domino.state.plan.Mardi=[current[0],current[1]];domino.state.plan.Mercredi=[current[2],current[3]];domino.state.plan.Jeudi=[current[4]];
  const next=emptyPlan();next.Lundi=[future[0]];next.Mardi=[future[1]];next.Mercredi=[future[2]];next.Jeudi=[future[3]];next.Vendredi=[future[4]];
  domino.mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(domino.state.plan))},'2026-09-21':{weekMonday:'2026-09-21',plan:next}}));
  const dominoBuilt=buildAsPlanning(domino);assert.equal(dominoBuilt.ok,true,dominoBuilt.error||'domino possible');
  assert(dominoBuilt.lastWeekKey>='2026-09-28','le trop-plein doit pousser au-delà de la semaine future déjà pleine');
  assert.equal(Object.values(dominoBuilt.weeks).flatMap(allOccurrences).length,10,'aucune visite future ne doit disparaître');
  assertRoutesRespectRules(domino,dominoBuilt.weeks);

  // V179 : contraintes fixes restent explicites et ne sont jamais déplacées silencieusement.
  const fixedCredits=env();setFixedTuesday(fixedCredits,[fixedCredits.stores.but1,fixedCredits.stores.d1],3);const beforeFixed=JSON.stringify(fixedCredits.state.plan);const rejectedCredits=buildAsPlanning(fixedCredits);
  assert.equal(rejectedCredits.ok,false);assert.equal(JSON.stringify(fixedCredits.state.plan),beforeFixed);assert.match(rejectedCredits.error,/Mardi contient déjà 4 crédits fixes/);assert.match(rejectedCredits.error,/BUT Ville-Test C \(2\)/);assert.match(rejectedCredits.error,/Darty Ville-Test B \(2\)/);assert.match(rejectedCredits.error,/maximum est réglé sur 3/);assert.match(rejectedCredits.error,/Passe-le à 4 dans Réglages/);assert.match(rejectedCredits.error,/Rien n’a été changé/);
  const boulangerLight=env();setFixedTuesday(boulangerLight,[boulangerLight.stores.b1,boulangerLight.stores.f1],4);assert.equal(buildAsPlanning(boulangerLight).ok,true);
  const boulangerHeavy=env();setFixedTuesday(boulangerHeavy,[boulangerHeavy.stores.b1,boulangerHeavy.stores.but1],4);const rejectedHeavy=buildAsPlanning(boulangerHeavy);assert.equal(rejectedHeavy.ok,false);assert.match(rejectedHeavy.error,/règle Boulanger/i);
  const twoBoulanger=env();setFixedTuesday(twoBoulanger,[twoBoulanger.stores.b1,twoBoulanger.stores.b2],4);const rejectedTwo=buildAsPlanning(twoBoulanger);assert.equal(rejectedTwo.ok,false);assert.match(rejectedTwo.error,/règle Boulanger/i);

  console.log('PASS: V181 recalcule en cascade sur les semaines suivantes, conserve les visites/rendez-vous/verrous, respecte Boulanger/BUT, étend la période visible et ne perd aucune visite.');
})().catch(e=>{console.error(e);process.exit(1)});
