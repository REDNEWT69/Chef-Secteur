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
function actualCredit(s){return /boulanger|but|darty|carrefour|conforama/i.test(String(s&&s.enseigne||''))?2:1}
function planningCredit(s,active){if(/boulanger/i.test(String(s&&s.enseigne||''))&&active)return 3;return actualCredit(s)}
function ids(route){return JSON.stringify(Array.from(route||[],s=>String(s.id)))}

function env(){
  const b0=mk('b0','Boulanger','Lyon'),missed=mk('f0','Fnac','Bron'),b1=mk('b1','Boulanger','Saint-Priest'),b2=mk('b2','Boulanger','Vénissieux'),but1=mk('but1','BUT','Saint-Priest'),d1=mk('d1','Darty','Bron'),f1=mk('f1','Fnac','Villeurbanne');
  const plan=emptyPlan();
  plan.Lundi=[b0,missed];
  plan.Mardi=[b1,b2];
  plan.Mercredi=[but1,f1];
  const state={
    settings:{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:4},
    stores:[b0,missed,b1,b2,but1,d1,f1],plan,
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
  return{ctx,state,mem,proposals,stores:{b0,missed,b1,b2,but1,d1,f1}};
}
function buildAsPlanning(t){
  t.ctx.__storeRunnerPlanningGenerationActive=true;
  try{return t.ctx.__storeRunnerBuildRemainingWeekPlan()}finally{t.ctx.__storeRunnerPlanningGenerationActive=false}
}
function setFixedTuesday(t,stores,max){
  t.state.settings.maxVisitsPerDay=max;
  t.state.plan=emptyPlan();
  t.state.plan.Mardi=stores.slice();
  t.state.visits={};
  t.state.businessV2={visits:[],actions:[],storeSnapshots:{}};
  t.state.appointments=[];
  t.state.locks={};
  for(const s of stores)t.state.locks[s.id]={day:'Mardi',week:'2026-09-14'};
}

(async()=>{
  const t=env();
  assert.equal(typeof t.ctx.storeRunnerRecalculateRemainingWeek,'function','la commande publique de recalcul doit exister');
  assert.equal(typeof t.ctx.__storeRunnerBuildRemainingWeekPlan,'function','le constructeur du reste de semaine doit être testable');

  const built=buildAsPlanning(t);
  assert.equal(built.ok,true,built.error||'le recalcul doit être possible');

  // La visite terrain réellement terminée lundi ne bouge pas, même sans marqueur legacy state.visits.
  assert.equal(ids(built.plan.Lundi),'["b0"]','le Boulanger déjà visité lundi doit rester lundi et seul le magasin raté doit partir');
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
  assert.equal(JSON.stringify(afterIds),JSON.stringify(beforeIds),'aucun magasin ne doit être perdu ou inventé');
  assert.equal(ids(t.state.plan.Lundi),'["b0"]','le passé visité doit rester intact après application');
  assert(t.state.manualWeekEdits['2026-09-14']&&t.state.manualWeekEdits['2026-09-14'].plan,'la semaine doit rester protégée manuellement après recalcul');
  const archive=JSON.parse(t.mem.get(ARCHIVE_KEY));
  assert.equal(archive['2026-09-14'].manualEdited,true,'l’archive doit rester marquée manuelle');
  assert.equal(ids(archive['2026-09-14'].plan.Lundi),'["b0"]','l’archive doit refléter le nouveau planning sans réécrire la visite faite');

  // V179 : 4 crédits fixes avec un maximum explicite à 3 doivent produire une explication
  // factuelle, sans toucher au planning ni inventer de poids de capacité.
  const fixedCredits=env();
  setFixedTuesday(fixedCredits,[fixedCredits.stores.but1,fixedCredits.stores.d1],3);
  const beforeFixed=JSON.stringify(fixedCredits.state.plan);
  const rejectedCredits=buildAsPlanning(fixedCredits);
  assert.equal(rejectedCredits.ok,false,'BUT + Darty fixes doivent dépasser un maximum de 3');
  assert.equal(JSON.stringify(fixedCredits.state.plan),beforeFixed,'un refus de capacité ne doit jamais modifier le planning existant');
  assert.match(rejectedCredits.error,/Mardi contient déjà 4 crédits fixes/,'le message doit donner les vrais crédits fixes');
  assert.match(rejectedCredits.error,/BUT Saint-Priest \(2\)/,'le message doit nommer le BUT réel et son crédit');
  assert.match(rejectedCredits.error,/Darty Bron \(2\)/,'le message doit nommer le Darty réel et son crédit');
  assert.match(rejectedCredits.error,/maximum est réglé sur 3/,'le message doit rappeler le réglage utilisateur');
  assert.match(rejectedCredits.error,/Passe-le à 4 dans Réglages/,'le message doit indiquer la correction la plus petite');
  assert.match(rejectedCredits.error,/Rien n’a été changé/,'le message doit confirmer la protection du planning');

  // Boulanger reste à 2 crédits métier mais réserve 3 unités uniquement pendant le calcul.
  const boulangerLight=env();
  setFixedTuesday(boulangerLight,[boulangerLight.stores.b1,boulangerLight.stores.f1],4);
  const allowed=buildAsPlanning(boulangerLight);
  assert.equal(allowed.ok,true,allowed.error||'Boulanger + magasin à 1 crédit doit être autorisé avec max 4');

  const boulangerHeavy=env();
  setFixedTuesday(boulangerHeavy,[boulangerHeavy.stores.b1,boulangerHeavy.stores.but1],4);
  const rejectedHeavy=buildAsPlanning(boulangerHeavy);
  assert.equal(rejectedHeavy.ok,false,'Boulanger + magasin à 2 crédits doit être refusé');
  assert.match(rejectedHeavy.error,/Mardi contient déjà 4 crédits fixes/,'les statistiques du message doivent rester en crédits métier réels');
  assert.match(rejectedHeavy.error,/Boulanger Saint-Priest \(2\)/);
  assert.match(rejectedHeavy.error,/BUT Saint-Priest \(2\)/);
  assert.match(rejectedHeavy.error,/règle Boulanger/i,'le refus doit expliquer la règle spéciale sans exposer le poids artificiel');

  const twoBoulanger=env();
  setFixedTuesday(twoBoulanger,[twoBoulanger.stores.b1,twoBoulanger.stores.b2],4);
  const rejectedTwo=buildAsPlanning(twoBoulanger);
  assert.equal(rejectedTwo.ok,false,'deux Boulanger fixes le même jour doivent être refusés');
  assert.match(rejectedTwo.error,/Mardi contient déjà 4 crédits fixes/);
  assert.match(rejectedTwo.error,/règle Boulanger/i);

  console.log('PASS: recalcul du reste de semaine conserve visites/rendez-vous/verrous, respecte Boulanger/BUT, explique les vrais crédits fixes et ne modifie jamais le planning en cas de refus.');
})().catch(e=>{console.error(e);process.exit(1)});
