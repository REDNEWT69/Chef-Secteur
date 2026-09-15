const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const source=fs.readFileSync(__dirname+'/../planning-generation-controller.js','utf8');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RealDate=Date;
class FakeDate extends RealDate{
  constructor(...args){super(...(args.length?args:['2026-09-15T12:00:00']))}
  static now(){return new RealDate('2026-09-15T12:00:00').getTime()}
}
function mk(id,enseigne,ville){return{id,enseigne,ville:ville||id,adresse:'1 rue test',dept:'69',active:true,lat:45.7,lon:4.9,priority:3}}
function emptyPlan(){return Object.fromEntries(DAYS.map(d=>[d,[]]))}
function actualCredit(s){return /boulanger|but|darty/i.test(String(s&&s.enseigne||''))?2:1}
function planningCredit(s,active){if(/boulanger/i.test(String(s&&s.enseigne||''))&&active)return 3;return actualCredit(s)}

function env(){
  const b0=mk('b0','Boulanger','Lyon'),missed=mk('f0','Fnac','Bron'),b1=mk('b1','Boulanger','Saint-Priest'),b2=mk('b2','Boulanger','Vénissieux'),but1=mk('but1','BUT','Saint-Priest'),f1=mk('f1','Fnac','Villeurbanne');
  const plan=emptyPlan();
  plan.Lundi=[b0,missed];
  plan.Mardi=[b1,b2];
  plan.Mercredi=[but1,f1];
  const state={
    settings:{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:4},
    stores:[b0,missed,b1,b2,but1,f1],plan,
    visits:{},
    businessV2:{visits:[{id:'visit-b0',storeId:'b0',status:'completed',completedDate:'2026-09-14'}],actions:[],storeSnapshots:{}},
    locks:{b2:{day:'Vendredi',week:'2026-09-14'}},
    appointments:[{id:'a1',storeId:'but1',date:'2026-09-17'}],manualWeekEdits:{'2026-09-14':'2026-09-15T08:00:00.000Z'},calendarEvents:[]
  };
  const mem=new Map();
  mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',manualEdited:true,plan:JSON.parse(JSON.stringify(plan))}}));
  const storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),flush:()=>Promise.resolve()};
  const weekInput={value:'2026-09-14'};
  const doc={
    readyState:'loading',
    addEventListener(){},dispatchEvent(){},
    getElementById(id){return id==='weekDate'?weekInput:null},
    querySelector(){return null},querySelectorAll(){return[]},createElement(){return{style:{},addEventListener(){},insertAdjacentElement(){}}}
  };
  const proposals=[];
  const ctx={
    console,Date:FakeDate,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,Promise,setTimeout,clearTimeout,
    state,document:doc,confirm:()=>true,CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    localStorage:storage,__chefStorage:storage,
    addEventListener(){},dispatchEvent(){},
    save(){},renderAll(){},calendarEventsForDate:()=>[],
    storeVisitCredit:s=>planningCredit(s,ctx.__storeRunnerPlanningGenerationActive===true),
    StoreVisitCounting:{credit:actualCredit},
    ChefReliability:{
      checkpoint(){},
      propose:async candidate=>{proposals.push(candidate);state.plan=JSON.parse(JSON.stringify(candidate.plan));return true}
    }
  };
  ctx.window=ctx;
  vm.runInNewContext(source,ctx);
  return{ctx,state,mem,proposals,stores:{b0,missed,b1,b2,but1,f1}};
}

(async()=>{
  const t=env();
  assert.equal(typeof t.ctx.storeRunnerRecalculateRemainingWeek,'function','la commande publique de recalcul doit exister');
  assert.equal(typeof t.ctx.__storeRunnerBuildRemainingWeekPlan,'function','le constructeur du reste de semaine doit être testable');

  t.ctx.__storeRunnerPlanningGenerationActive=true;
  const built=t.ctx.__storeRunnerBuildRemainingWeekPlan();
  t.ctx.__storeRunnerPlanningGenerationActive=false;
  assert.equal(built.ok,true,built.error||'le recalcul doit être possible');

  // La visite terrain réellement terminée lundi ne bouge pas, même sans marqueur legacy state.visits.
  assert.deepEqual(built.plan.Lundi.map(s=>s.id),['b0'],'le Boulanger déjà visité lundi doit rester lundi et seul le magasin raté doit partir');
  assert(!built.plan.Lundi.some(s=>s.id==='f0'),'le magasin non visité lundi doit pouvoir être replanifié après aujourd’hui');
  assert(DAYS.slice(1,5).some(day=>built.plan[day].some(s=>s.id==='f0')),'le magasin raté doit réapparaître sur un jour restant');

  // Rendez-vous et verrou manuel sont immobiles.
  assert(built.plan.Jeudi.some(s=>s.id==='but1'),'le BUT avec rendez-vous jeudi doit rester jeudi');
  assert(built.plan.Vendredi.some(s=>s.id==='b2'),'le Boulanger verrouillé vendredi doit rester vendredi');

  // Règle V176 : jamais deux Boulanger, et un Boulanger ne partage qu’avec un magasin à 1 crédit.
  for(const day of DAYS.slice(1,5)){
    const route=built.plan[day]||[],boul=route.filter(s=>/boulanger/i.test(s.enseigne));
    assert(boul.length<=1,day+' contient deux Boulanger après recalcul');
    if(boul.length){
      for(const s of route)if(!/boulanger/i.test(s.enseigne))assert.equal(actualCredit(s),1,day+' : un Boulanger ne doit pas être accompagné d’un magasin à 2 crédits');
    }
    const capacity=route.reduce((n,s)=>n+planningCredit(s,true),0);
    assert(capacity<=4,day+' dépasse la capacité V176');
  }

  const beforeIds=DAYS.flatMap(day=>(t.state.plan[day]||[]).map(s=>s.id)).sort();
  const result=await t.ctx.storeRunnerRecalculateRemainingWeek();
  assert.equal(result.ok,true,result.error||'le recalcul complet doit être accepté');
  assert.equal(t.proposals.length,1,'le recalcul doit passer par Reliability.propose');
  const afterIds=DAYS.flatMap(day=>(t.state.plan[day]||[]).map(s=>s.id)).sort();
  assert.deepEqual(afterIds,beforeIds,'aucun magasin ne doit être perdu ou inventé');
  assert.deepEqual(t.state.plan.Lundi.map(s=>s.id),['b0'],'le passé visité doit rester intact après application');
  assert(t.state.manualWeekEdits['2026-09-14']&&t.state.manualWeekEdits['2026-09-14'].plan,'la semaine doit rester protégée manuellement après recalcul');
  const archive=JSON.parse(t.mem.get(ARCHIVE_KEY));
  assert.equal(archive['2026-09-14'].manualEdited,true,'l’archive doit rester marquée manuelle');
  assert.deepEqual(archive['2026-09-14'].plan.Lundi.map(s=>s.id),['b0'],'l’archive doit refléter le nouveau planning sans réécrire la visite faite');

  // Cas impossible : Boulanger verrouillé + BUT rendez-vous le même jour dépassent la capacité.
  const bad=env();
  bad.state.locks.b1={day:'Jeudi',week:'2026-09-14'};
  bad.ctx.__storeRunnerPlanningGenerationActive=true;
  const rejected=bad.ctx.__storeRunnerBuildRemainingWeekPlan();
  bad.ctx.__storeRunnerPlanningGenerationActive=false;
  assert.equal(rejected.ok,false,'des contraintes fixes incompatibles doivent refuser le recalcul');
  assert.match(rejected.error,/occupent|capacité|replac/i,'le refus doit expliquer la capacité ou le placement');

  console.log('PASS: V177 recalcule seulement le reste de la semaine, conserve visites terrain/rendez-vous/verrous, replace les ratés, respecte Boulanger/BUT et maintient la protection manuelle.');
})().catch(e=>{console.error(e);process.exit(1)});
