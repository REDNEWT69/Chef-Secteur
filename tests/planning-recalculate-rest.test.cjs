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
function actualCredit(s){return /boulanger|but|darty|conforama/i.test(String(s&&s.enseigne||''))?2:1}
function planningCredit(s){return actualCredit(s)}
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
    storeVisitCredit:actualCredit,StoreVisitCounting:{credit:actualCredit,planningCredit:actualCredit},
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
function setFixedDay(t,day,stores,max){
  t.state.settings.maxVisitsPerDay=max;t.state.plan=emptyPlan();t.state.plan[day]=stores.slice();t.state.visits={};t.state.businessV2={visits:[],actions:[],storeSnapshots:{}};t.state.appointments=[];t.state.locks={};
  for(const s of stores)t.state.locks[s.id]={day,week:'2026-09-14'};
  t.mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(t.state.plan))}}));
}
function assertRoutesRespectRules(t,weeks){
  for(const [week,plan] of Object.entries(weeks))for(const day of DAYS){
    const route=plan[day]||[],capacity=route.reduce((n,s)=>n+planningCredit(s),0);
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

  // V261.4 : le débordement vient uniquement du plafond réel de crédits, pas d'une règle d'enseigne.
  const cascade=env();
  cascade.state.visits={};cascade.state.businessV2={visits:[],actions:[],storeSnapshots:{}};cascade.state.locks={};cascade.state.appointments=[];cascade.state.manualWeekEdits={};
  const bs=Array.from({length:10},(_,i)=>mk('cb'+(i+1),'Boulanger','Ville '+(i+1)));
  cascade.state.stores=bs.slice();cascade.state.plan=emptyPlan();
  cascade.state.plan.Mardi=[bs[0],bs[1],bs[2]];cascade.state.plan.Mercredi=[bs[3],bs[4],bs[5]];cascade.state.plan.Jeudi=[bs[6],bs[7]];cascade.state.plan.Vendredi=[bs[8],bs[9]];
  cascade.mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(cascade.state.plan))}}));
  const cascadeBuilt=buildAsPlanning(cascade);
  assert.equal(cascadeBuilt.ok,true,cascadeBuilt.error||'cascade multi-semaines possible');
  assert(cascadeBuilt.weeks['2026-09-21'],'une semaine suivante doit être créée quand les crédits réels dépassent les places restantes');
  assert(cascadeBuilt.lastWeekKey>cascadeBuilt.weekKey,'le recalcul doit déborder après vendredi');
  assertRoutesRespectRules(cascade,cascadeBuilt.weeks);
  assert.equal(Object.values(cascadeBuilt.weeks).flatMap(allOccurrences).length,10,'les 10 Boulanger doivent rester présents exactement une fois');
  const cascadeApplied=await cascade.ctx.storeRunnerRecalculateRemainingWeek();
  assert.equal(cascadeApplied.ok,true,cascadeApplied.error||'cascade appliquée');
  const cascadeArchive=JSON.parse(cascade.mem.get(ARCHIVE_KEY));
  assert(cascadeArchive['2026-09-21']&&Object.values(cascadeArchive['2026-09-21'].plan).some(r=>r.length),'la semaine suivante doit être persistée dans l’archive');
  assert.equal(cascadeArchive['2026-09-21'].manualEdited,true,'la semaine décalée doit être protégée');
  const range=JSON.parse(cascade.mem.get(RANGE_KEY));
  assert(range&&range.end>='2026-09-26','la bande planning doit être étendue à la semaine suivante');
  assert.equal(range.start,'2026-09-14');

  // V181 domino : une semaine suivante déjà pleine selon le même plafond repousse seulement le trop-plein.
  const domino=env();domino.state.visits={};domino.state.businessV2={visits:[],actions:[],storeSnapshots:{}};domino.state.locks={};domino.state.appointments=[];domino.state.manualWeekEdits={};domino.state.settings.maxVisitsPerDay=1;
  const current=Array.from({length:5},(_,i)=>mk('db'+(i+1),'Fnac','Courant '+(i+1)));
  const future=Array.from({length:5},(_,i)=>mk('df'+(i+1),'Fnac','Futur '+(i+1)));
  domino.state.stores=current.concat(future);domino.state.plan=emptyPlan();domino.state.plan.Mardi=[current[0],current[1]];domino.state.plan.Mercredi=[current[2]];domino.state.plan.Jeudi=[current[3]];domino.state.plan.Vendredi=[current[4]];
  const next=emptyPlan();next.Lundi=[future[0]];next.Mardi=[future[1]];next.Mercredi=[future[2]];next.Jeudi=[future[3]];next.Vendredi=[future[4]];
  domino.mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(domino.state.plan))},'2026-09-21':{weekMonday:'2026-09-21',plan:next}}));
  const dominoBuilt=buildAsPlanning(domino);assert.equal(dominoBuilt.ok,true,dominoBuilt.error||'domino possible');
  assert(dominoBuilt.lastWeekKey>='2026-09-28','le trop-plein doit pousser au-delà de la semaine future déjà pleine');
  assert.equal(Object.values(dominoBuilt.weeks).flatMap(allOccurrences).length,10,'aucune visite future ne doit disparaître');
  assertRoutesRespectRules(domino,dominoBuilt.weeks);

  // V252 : une visite ratée ne doit plus pousser en domino des journées futures déjà valides.
  const stable=env();
  stable.state.visits={};stable.state.businessV2={visits:[],actions:[],storeSnapshots:{}};stable.state.locks={};stable.state.appointments=[];stable.state.manualWeekEdits={};stable.state.settings.maxVisitsPerDay=2;
  const sm=mk('sm','Fnac','Ratée'),sa=mk('sa','Fnac','Mardi A'),sb=mk('sb','Fnac','Mardi B'),sc=mk('sc','Fnac','Mercredi A'),sd=mk('sd','Fnac','Mercredi B'),se=mk('se','Fnac','Jeudi'),sn1=mk('sn1','Fnac','Semaine suivante A'),sn2=mk('sn2','Fnac','Semaine suivante B');
  stable.state.stores=[sm,sa,sb,sc,sd,se,sn1,sn2];stable.state.plan=emptyPlan();stable.state.plan.Lundi=[sm];stable.state.plan.Mardi=[sa,sb];stable.state.plan.Mercredi=[sc,sd];stable.state.plan.Jeudi=[se];
  const stableNext=emptyPlan();stableNext.Lundi=[sn1,sn2];
  stable.mem.set(ARCHIVE_KEY,JSON.stringify({
    '2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(stable.state.plan))},
    '2026-09-21':{weekMonday:'2026-09-21',plan:JSON.parse(JSON.stringify(stableNext)),manualEdited:true,manualEditedAt:'sentinel-next-week'}
  }));
  const stableBuilt=buildAsPlanning(stable);assert.equal(stableBuilt.ok,true,stableBuilt.error||'recalcul stable possible');
  assert.equal(ids(stableBuilt.weeks['2026-09-14'].Mardi),'["sa","sb"]','mardi futur reste strictement identique');
  assert.equal(ids(stableBuilt.weeks['2026-09-14'].Mercredi),'["sc","sd"]','mercredi futur reste strictement identique');
  assert.equal(ids(stableBuilt.weeks['2026-09-14'].Jeudi),'["se","sm"]','seule la visite ratée prend la première place libre');
  assert.equal(ids(stableBuilt.weeks['2026-09-21'].Lundi),'["sn1","sn2"]','la semaine suivante ne doit pas bouger');
  assert.equal(stableBuilt.moved,1,'une seule visite doit réellement bouger');
  assert.equal(stableBuilt.weeksTouched,1,'une seule semaine doit être marquée modifiée');
  assert.equal(JSON.stringify(Array.from(stableBuilt.changedWeekKeys)),JSON.stringify(['2026-09-14']));
  assert.equal(stableBuilt.archive['2026-09-21'].manualEditedAt,'sentinel-next-week','métadonnée future inchangée');
  const stableApplied=await stable.ctx.storeRunnerRecalculateRemainingWeek();assert.equal(stableApplied.ok,true,stableApplied.error||'recalcul stable appliqué');
  assert.equal(stable.proposals.length,1,'un vrai déplacement passe toujours par Reliability.propose');
  assert(stable.state.manualWeekEdits['2026-09-14']&&stable.state.manualWeekEdits['2026-09-14'].plan,'semaine réellement modifiée protégée');
  assert.equal(stable.state.manualWeekEdits['2026-09-21'],undefined,'semaine future intacte non remarquée manuelle');
  assert.equal(JSON.parse(stable.mem.get(ARCHIVE_KEY))['2026-09-21'].manualEditedAt,'sentinel-next-week','archive future intacte après application');

  // V252 : si tout tient déjà, le recalcul devient un no-op sans proposition ni écriture manuelle.
  const noop=env();noop.state.visits={};noop.state.businessV2={visits:[],actions:[],storeSnapshots:{}};noop.state.locks={};noop.state.appointments=[];noop.state.manualWeekEdits={};noop.state.settings.maxVisitsPerDay=2;
  const na=mk('na','Fnac','Stable A'),nb=mk('nb','Fnac','Stable B');noop.state.stores=[na,nb];noop.state.plan=emptyPlan();noop.state.plan.Mardi=[na];noop.state.plan.Mercredi=[nb];
  noop.mem.set(ARCHIVE_KEY,JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:JSON.parse(JSON.stringify(noop.state.plan)),manualEditedAt:'sentinel-current'}}));
  const noopBuilt=buildAsPlanning(noop);assert.equal(noopBuilt.ok,true);assert.equal(noopBuilt.unchanged,true);assert.equal(noopBuilt.moved,0);assert.equal(noopBuilt.weeksTouched,0);
  const noopApplied=await noop.ctx.storeRunnerRecalculateRemainingWeek();assert.equal(noopApplied.ok,true);assert.equal(noopApplied.unchanged,true);assert.equal(noop.proposals.length,0,'aucune proposition Reliability pour un planning identique');assert.equal(Object.keys(noop.state.manualWeekEdits).length,0,'aucune semaine ne doit être remarquée manuelle');assert.equal(JSON.parse(noop.mem.get(ARCHIVE_KEY))['2026-09-14'].manualEditedAt,'sentinel-current');

  // V261.4 : seules les sommes réelles de crédits peuvent bloquer une journée fixe.
  const fixedCredits=env();setFixedDay(fixedCredits,'Mercredi',[fixedCredits.stores.but1,fixedCredits.stores.d1],3);const beforeFixed=JSON.stringify(fixedCredits.state.plan);const rejectedCredits=buildAsPlanning(fixedCredits);
  assert.equal(rejectedCredits.ok,false);assert.equal(JSON.stringify(fixedCredits.state.plan),beforeFixed);assert.match(rejectedCredits.error,/Mercredi contient déjà 4 crédits fixes/);assert.match(rejectedCredits.error,/BUT Ville-Test C \(2\)/);assert.match(rejectedCredits.error,/Darty Ville-Test B \(2\)/);assert.match(rejectedCredits.error,/maximum est réglé sur 3/);assert.match(rejectedCredits.error,/Passe-le à 4 dans Réglages/);assert.match(rejectedCredits.error,/Rien n’a été changé/);
  const boulangerLight=env();setFixedDay(boulangerLight,'Mardi',[boulangerLight.stores.b1,boulangerLight.stores.f1],4);assert.equal(buildAsPlanning(boulangerLight).ok,true);
  const boulangerHeavy=env();setFixedDay(boulangerHeavy,'Mardi',[boulangerHeavy.stores.b1,boulangerHeavy.stores.but1],4);assert.equal(buildAsPlanning(boulangerHeavy).ok,true,'Boulanger 2 + BUT 2 tient exactement dans un plafond à 4');
  const twoBoulanger=env();setFixedDay(twoBoulanger,'Mardi',[twoBoulanger.stores.b1,twoBoulanger.stores.b2],4);assert.equal(buildAsPlanning(twoBoulanger).ok,true,'deux Boulanger à 2 crédits chacun tiennent dans un plafond à 4');
  const realCase=env(),carrefour=mk('carrefour','Carrefour','Vénissieux');realCase.state.stores.push(carrefour);setFixedDay(realCase,'Mardi',[realCase.stores.b1,carrefour,realCase.stores.d1],6);const realBuilt=buildAsPlanning(realCase);assert.equal(realBuilt.ok,true,realBuilt.error||'Boulanger 2 + Carrefour 1 + Darty 2 = 5 doit tenir dans 6');

  console.log('PASS: V261.4 recalcule avec maxVisitsPerDay comme seul plafond, conserve les crédits métier et ne garde aucune règle cachée Boulanger.');
})().catch(e=>{console.error(e);process.exit(1)});
