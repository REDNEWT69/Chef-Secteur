const assert=require('assert');
const Coverage=require('../visit-coverage.js');

const TODAY='2026-09-28';
const START='2026-09-28';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

function baseState(stores){
  return{
    stores:stores.map(s=>({...s,active:s.active!==false})),
    visits:{},businessV2:{visits:[]},excluded:{},included:{},appointments:[],locks:{},
    settings:{weekDate:START,days:DAYS.slice(),target:20,maxVisitsPerDay:4},
    plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}
  };
}
function setVisit(state,id,date){state.visits[String(id)]={lastVisit:date,history:[date]}}
function range(extra={}){
  return{
    start:START,end:'2026-10-18',weeks:3,workDays:DAYS.slice(),
    planningDiagnostics:[],coverage:{needAware:true,uncoveredLate:[],uncoveredNever:[],recentlyVisited:[]},
    ...extra
  };
}
function emptyPlan(){return{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}
function archivePlan(weekKey,day,store){const p=emptyPlan();p[day]=[store];return{[weekKey]:{weekMonday:weekKey,plan:p,manualEdited:false}}}
function forecast(state,opts={}){return Coverage.forecastThreeWeeks(state,{today:opts.today||TODAY,firstMonday:opts.firstMonday,range:opts.range||range(),archive:opts.archive||{},priorities:opts.priorities,visitDays:opts.visitDays,dayBlocked:opts.dayBlocked,lockDayForWeek:opts.lockDayForWeek})}
function row(out,id){const r=out.rows.find(x=>x.id===String(id));assert(r,'forecast row '+id+' absent');return r}
function weekPlan(stores,offset=0){const plan=emptyPlan();DAYS.forEach((day,di)=>{plan[day]=stores.slice(offset+di*4,offset+di*4+4)});return plan}

// 1. Hiérarchie métier exacte : très en retard > jamais > retard (P1 seulement en tie-break) > bientôt > à jour.
{
  const stores=[
    {id:'urgent',enseigne:'Urgent',ville:'A',intervalDays:30},
    {id:'never',enseigne:'Never',ville:'B',intervalDays:30},
    {id:'late-p1',enseigne:'LateP1',ville:'C',intervalDays:30},
    {id:'late',enseigne:'Late',ville:'D',intervalDays:30},
    {id:'soon',enseigne:'Soon',ville:'E',intervalDays:30},
    {id:'ok',enseigne:'Ok',ville:'F',intervalDays:30}
  ];
  const state=baseState(stores);
  setVisit(state,'urgent','2026-08-01');
  setVisit(state,'late-p1','2026-08-25');
  setVisit(state,'late','2026-08-25');
  setVisit(state,'soon','2026-09-04');
  setVisit(state,'ok','2026-09-13');
  const priorities=new Map([['late-p1','P1']]);
  const out=forecast(state,{priorities});
  assert.deepStrictEqual(out.rows.map(r=>r.id).slice(0,6),['urgent','never','late-p1','late','soon','ok']);
  assert.strictEqual(row(out,'urgent').tier,4);
  assert.strictEqual(row(out,'never').tier,3.5);
  assert.strictEqual(row(out,'late-p1').tier,3.25);
}

// 2. Un magasin encore trop récent en semaine 1 devient planifiable en semaine 2.
{
  const store={id:'w2',enseigne:'Darty',ville:'W2',intervalDays:30};
  const state=baseState([store]);setVisit(state,'w2','2026-09-20');
  const out=forecast(state);
  assert.strictEqual(row(out,'w2').firstAcceptableDate,'2026-10-05');
  assert.strictEqual(row(out,'w2').firstAcceptableWeek,'2026-10-05');
}

// Intelligence Terrain V2 Lot 1 : retard actuel et bascules sur l'horizon glissant S1 / S2 / S3.
{
  const stores=[
    {id:'late-now',enseigne:'Darty',ville:'Retard',intervalDays:30},
    {id:'risk-w1',enseigne:'Fnac',ville:'S1',intervalDays:30},
    {id:'risk-w2',enseigne:'Boulanger',ville:'S2',intervalDays:30},
    {id:'risk-w3',enseigne:'Conforama',ville:'S3',intervalDays:30},
    {id:'never-v2',enseigne:'Carrefour',ville:'Jamais',intervalDays:30}
  ];
  const state=baseState(stores);
  setVisit(state,'late-now','2026-08-23'); // échéance 22/09 : 6 jours de retard
  setVisit(state,'risk-w1','2026-09-04');  // échéance 04/10 : J+6
  setVisit(state,'risk-w2','2026-09-08');  // échéance 08/10 : J+10
  setVisit(state,'risk-w3','2026-09-15');  // échéance 15/10 : J+17
  const out=forecast(state);
  assert.strictEqual(out.horizonStart,TODAY);assert.strictEqual(out.horizonEnd,'2026-10-18');
  const late=row(out,'late-now');assert.strictEqual(late.forecastKind,'late_today');assert.strictEqual(late.forecastDate,'2026-09-22');assert.strictEqual(late.lateDays,6);assert.match(late.forecastReason,/En retard depuis 6 jours/);
  const w1=row(out,'risk-w1'),w2=row(out,'risk-w2'),w3=row(out,'risk-w3');
  assert.deepStrictEqual([w1.forecastWeek,w2.forecastWeek,w3.forecastWeek],[1,2,3]);
  assert.deepStrictEqual([w1.forecastInDays,w2.forecastInDays,w3.forecastInDays],[6,10,17]);
  assert.deepStrictEqual([w1.forecastDate,w2.forecastDate,w3.forecastDate],['2026-10-04','2026-10-08','2026-10-15']);
  assert.match(w2.forecastReason,/deviendra en retard dans 10 jours/);
  const never=row(out,'never-v2');assert.strictEqual(never.forecastKind,'never');assert.strictEqual(never.forecastDate,'');assert.match(never.forecastReason,/Jamais visité/);
  assert.deepStrictEqual(out.counts.watch,{total:5,lateToday:1,never:1,week1:1,week2:1,week3:1});
}

// 2b. Les placements réels de S2 (plan live) et S3 (archive) deviennent les recommandations du forecast.
{
  const liveS2={id:'live-s2',enseigne:'Darty',ville:'Plan S2',intervalDays:15};
  const archivedS3={id:'archive-s3',enseigne:'Fnac',ville:'Archive S3',intervalDays:30};
  const state=baseState([liveS2,archivedS3]);
  state.settings.weekDate='2026-10-05';state.plan.Mardi=[liveS2];
  const archive=archivePlan('2026-10-12','Vendredi',archivedS3);
  const out=forecast(state,{archive});
  assert.deepStrictEqual(row(out,'live-s2').plannedDates,['2026-10-06']);
  assert.strictEqual(row(out,'live-s2').recommendedWeek,'2026-10-05');
  assert.deepStrictEqual(row(out,'archive-s3').plannedDates,['2026-10-16']);
  assert.strictEqual(row(out,'archive-s3').recommendedWeek,'2026-10-12');
}

// 3. Un rendez-vous explicite passe outre la garde anti-sur-visite et fait évoluer le forecast immédiatement.
{
  const store={id:'appt',enseigne:'Boulanger',ville:'RDV',intervalDays:30};
  const before=baseState([store]);setVisit(before,'appt','2026-09-20');
  const a=forecast(before),aRow=row(a,'appt');
  assert.strictEqual(aRow.recommendedDate,'');
  const after=JSON.parse(JSON.stringify(before));after.appointments=[{storeId:'appt',date:'2026-09-30'}];
  const b=forecast(after),bRow=row(b,'appt');
  assert.strictEqual(bRow.constraintType,'appointment');
  assert.strictEqual(bRow.recommendedDate,'2026-09-30');
  assert.strictEqual(bRow.recommendedWeek,'2026-09-28');
  assert.strictEqual(bRow.firstAcceptableDate,'2026-09-30');
}

// 4. Un verrou hebdomadaire est une contrainte dure et fixe la recommandation.
{
  const store={id:'lock',enseigne:'Fnac',ville:'Verrou',intervalDays:30};
  const state=baseState([store]);setVisit(state,'lock','2026-09-20');
  state.locks.lock={day:'Mardi',week:'2026-10-05'};
  const out=forecast(state),r=row(out,'lock');
  assert.strictEqual(r.constraintType,'lock');
  assert.strictEqual(r.recommendedDate,'2026-10-06');
  assert.strictEqual(r.recommendedWeek,'2026-10-05');
}

// 5. Les jours bloqués proviennent des diagnostics du vrai moteur, pas d'une règle dupliquée.
{
  const store={id:'blocked-day',enseigne:'Carrefour',ville:'Agenda',intervalDays:30};
  const state=baseState([store]);setVisit(state,'blocked-day','2026-09-13');
  const rge=range({planningDiagnostics:[{weekKey:START,days:[{day:'Lundi',date:'2026-09-28',status:'blocked',reason:'Agenda'}]}],coverage:{needAware:true,uncoveredLate:[],uncoveredNever:[],recentlyVisited:[]}});
  const out=forecast(state,{range:rge});
  assert.strictEqual(row(out,'blocked-day').firstAcceptableDate,'2026-09-29');
  assert(!out.availableWorkDates.includes('2026-09-28'));
}

// 6. Une absence de place remontée par le moteur reste explicitement une insuffisance de capacité.
{
  const store={id:'capacity',enseigne:'Fnac',ville:'Capacité',intervalDays:30};
  const state=baseState([store]);
  const rge=range({coverage:{needAware:true,uncoveredLate:[],uncoveredNever:['Fnac Capacité'],recentlyVisited:[]}});
  const out=forecast(state,{range:rge}),r=row(out,'capacity');
  assert.strictEqual(r.uncoveredCode,'capacity');
  assert.match(r.uncoveredReason,/capacité/);
  assert.strictEqual(out.engine.capacitySufficient,false);
}

// 7. Une visite réelle ajoutée aujourd'hui recalcule le besoin sans toucher au planning.
{
  const store={id:'visit',enseigne:'Darty',ville:'Visite',intervalDays:30};
  const before=baseState([store]);setVisit(before,'visit','2026-08-20');
  const first=forecast(before);assert.strictEqual(row(first,'visit').status,'late');
  const after=JSON.parse(JSON.stringify(before));setVisit(after,'visit',TODAY);
  const second=forecast(after),r=row(second,'visit');
  assert.strictEqual(r.status,'enough');
  assert.strictEqual(r.firstAcceptableDate,'2026-10-13');
  assert.strictEqual(r.forecastKind,'outside');
  assert.strictEqual(r.forecastDate,'2026-10-28','la visite réelle remet l’échéance à partir de sa vraie date');
}

// 8. La projection simule les visites déjà prévues et signale les bascules en retard non couvertes.
{
  const planned={id:'planned',enseigne:'Boulanger',ville:'Prévu',intervalDays:30};
  const slipping={id:'slip',enseigne:'Darty',ville:'Bascule',intervalDays:30};
  const state=baseState([planned,slipping]);setVisit(state,'planned','2026-09-04');setVisit(state,'slip','2026-09-05');
  state.plan.Jeudi=[planned];
  const out=forecast(state);
  const p=row(out,'planned'),s=row(out,'slip');
  assert.strictEqual(p.recommendedDate,'2026-10-01');
  assert.notStrictEqual(p.projectedStatus,'late');
  assert.strictEqual(s.willBecomeLate,true);
  assert.strictEqual(s.projectedStatus,'late');
  assert(out.counts.becomesLate>=1);
  assert.strictEqual(out.projection.realVisits,false);
  assert.strictEqual(p.lastVisit,'2026-09-04','une date planifiée ne remplace jamais la dernière visite réelle');
  assert.strictEqual(p.projectedLastVisit,'2026-10-01','la visite planifiée reste identifiée seulement dans la projection');
}

// Import performance : P1/P2 restent stables même « traités », puis suivent le nouvel import.
{
  const saved={db:globalThis.__chefStorage,perf:globalThis.StoreRunnerPerformanceV190};let version=1;
  globalThis.__chefStorage={getItem(){return null}};
  globalThis.StoreRunnerPerformanceV190={
    latestSnapshot:()=>version===1?{week:'W39',importedAt:'2026-09-21T08:00:00Z',rows:[]}:{week:'W40',importedAt:'2026-09-28T08:00:00Z',rows:[]},
    matchRows:()=>({rows:version===1?[{storeId:'perf-a',prio:'P1'},{storeId:'perf-b',prio:'P2'}]:[{storeId:'perf-b',prio:'P1'}]}),
    readStore:()=>({mapping:{}}),isTreated:()=>true
  };
  try{
    const state=baseState([{id:'perf-a',enseigne:'A',ville:'A',intervalDays:30},{id:'perf-b',enseigne:'B',ville:'B',intervalDays:30}]);
    let out=forecast(state);assert.strictEqual(row(out,'perf-a').priority,'P1');assert.strictEqual(row(out,'perf-b').priority,'P2');assert.match(row(out,'perf-a').forecastReason,/P1/);
    version=2;out=forecast(state);assert.strictEqual(row(out,'perf-a').priority,'');assert.strictEqual(row(out,'perf-b').priority,'P1');
  }finally{globalThis.__chefStorage=saved.db;globalThis.StoreRunnerPerformanceV190=saved.perf;if(saved.db===undefined)delete globalThis.__chefStorage;if(saved.perf===undefined)delete globalThis.StoreRunnerPerformanceV190}
}

// 9. Vingt exécutions donnent exactement la même sortie, sans effet de bord sur state/archive/range.
{
  const store={id:'stable',enseigne:'Conforama',ville:'Stable',intervalDays:30};
  const state=baseState([store]);setVisit(state,'stable','2026-09-01');
  const arch=archivePlan('2026-10-05','Mardi',store),rge=range();
  const beforeState=JSON.stringify(state),beforeArchive=JSON.stringify(arch),beforeRange=JSON.stringify(rge);
  const a=Coverage.forecastThreeWeeks(state,{today:TODAY,range:rge,archive:arch});
  for(let i=1;i<20;i++)assert.deepStrictEqual(Coverage.forecastThreeWeeks(state,{today:TODAY,range:rge,archive:arch}),a,'divergence à l’exécution '+(i+1));
  assert.strictEqual(JSON.stringify(state),beforeState);
  assert.strictEqual(JSON.stringify(arch),beforeArchive);
  assert.strictEqual(JSON.stringify(rge),beforeRange);
}

// 10. Une contrainte explicite sur un jour indisponible est déclarée impossible, jamais déplacée silencieusement.
{
  const store={id:'bad-appt',enseigne:'Cuisinella',ville:'Dimanche',intervalDays:30};
  const state=baseState([store]);state.appointments=[{storeId:'bad-appt',date:'2026-10-04'}];
  const out=forecast(state),r=row(out,'bad-appt');
  assert.strictEqual(r.constraintType,'appointment');
  assert.strictEqual(r.constraintCompatible,false);
  assert.strictEqual(r.recommendedDate,'');
  assert.strictEqual(r.uncoveredCode,'constraint-unavailable');
}

// 11. dayBlocked rend incompatibles les RDV et verrous explicites, même si le jour est travaillé.
{
  const appointment={id:'blocked-appt',enseigne:'Darty',ville:'RDV bloqué',intervalDays:30};
  const locked={id:'blocked-lock',enseigne:'Fnac',ville:'Verrou bloqué',intervalDays:30};
  const state=baseState([appointment,locked]);
  state.appointments=[{id:'rdv-bloque',storeId:'blocked-appt',date:'2026-10-07',time:'10:00'}];
  const blockedDates=new Set(['2026-10-06','2026-10-07']);
  const out=forecast(state,{dayBlocked:date=>blockedDates.has(date),lockDayForWeek:(id,week)=>id==='blocked-lock'&&week==='2026-10-05'?'Mardi':''});
  const appt=row(out,'blocked-appt'),lock=row(out,'blocked-lock');
  assert.deepStrictEqual(appt.incompatibleConstraintDates,['2026-10-07']);
  assert.strictEqual(appt.recommendedDate,'');
  assert.strictEqual(appt.uncoveredCode,'constraint-unavailable');
  assert.deepStrictEqual(lock.incompatibleConstraintDates,['2026-10-06']);
  assert.strictEqual(lock.recommendedDate,'');
  assert.strictEqual(lock.uncoveredCode,'constraint-unavailable');
  assert(!out.availableWorkDates.includes('2026-10-06'));
  assert(!out.availableWorkDates.includes('2026-10-07'));
}

// 12. Plusieurs RDV restent tous visibles : le premier incompatible ne masque pas les suivants valides.
{
  const store={id:'multi-rdv',enseigne:'Boulanger',ville:'Multi RDV',intervalDays:7};
  const state=baseState([store]);setVisit(state,'multi-rdv','2026-09-28');
  state.appointments=[
    {id:'c',storeId:'multi-rdv',date:'2026-10-14',time:'15:00'},
    {id:'a',storeId:'multi-rdv',date:'2026-09-30',time:'09:00'},
    {id:'b',storeId:'multi-rdv',date:'2026-10-07',time:'11:00'}
  ];
  const out=forecast(state,{dayBlocked:date=>date==='2026-09-30'}),r=row(out,'multi-rdv');
  assert.deepStrictEqual(r.appointmentDates,['2026-09-30','2026-10-07','2026-10-14']);
  assert.deepStrictEqual(r.incompatibleConstraintDates,['2026-09-30']);
  assert.deepStrictEqual(r.compatibleConstraintDates,['2026-10-07','2026-10-14']);
  assert.deepStrictEqual(r.recommendedDates,['2026-10-07','2026-10-14']);
  assert.strictEqual(r.recommendedDate,'2026-10-07');
  assert.strictEqual(r.constraintDate,'2026-10-07');
  assert.strictEqual(r.projectedLastVisit,'2026-10-14');
}

// 13. Toutes les visites du plan sur S1/S2/S3 sont projetées ; un doublon le même jour ne compte qu'une fois.
{
  const store={id:'weekly',enseigne:'Carrefour',ville:'Hebdo',intervalDays:7};
  const state=baseState([store]);setVisit(state,'weekly','2026-09-22');
  state.plan.Mardi=[store,store];
  state.appointments=[{id:'same-date',storeId:'weekly',date:'2026-09-29',time:'10:00'}];
  const archive={
    ...archivePlan('2026-10-05','Mardi',store),
    ...archivePlan('2026-10-12','Mardi',store)
  };
  const out=forecast(state,{archive}),r=row(out,'weekly');
  assert.deepStrictEqual(r.plannedDates,['2026-09-29','2026-10-06','2026-10-13']);
  assert.deepStrictEqual(r.projectedDates,['2026-09-29','2026-10-06','2026-10-13']);
  assert.deepStrictEqual(r.recommendedDates,['2026-09-29','2026-10-06','2026-10-13']);
  assert.strictEqual(r.projectedLastVisit,'2026-10-13');
  assert.strictEqual(out.counts.projectedVisits,3);
}

// 14. Les magasins inactifs et exclus restent hors forecast.
{
  const active={id:'active',enseigne:'Actif',ville:'A',intervalDays:30};
  const inactive={id:'inactive',enseigne:'Inactif',ville:'B',intervalDays:30,active:false};
  const excluded={id:'excluded',enseigne:'Exclu',ville:'C',intervalDays:30};
  const state=baseState([active,inactive,excluded]);state.excluded.excluded=true;
  const out=forecast(state);
  assert.deepStrictEqual(out.rows.map(r=>r.id),['active']);
  assert.strictEqual(out.counts.total,1);
}

// 15. En semaine entamée, les jours passés du plan ne sont pas transformés en visites ; une visite réelle passée reste la source de vérité.
{
  const past={id:'past',enseigne:'Darty',ville:'Passé',intervalDays:30};
  const todayStore={id:'today',enseigne:'Fnac',ville:'Aujourd’hui',intervalDays:30};
  const state=baseState([past,todayStore]);state.plan.Lundi=[past];state.plan.Jeudi=[todayStore];setVisit(state,'past','2026-09-28');
  const out=forecast(state,{today:'2026-10-01'});
  assert.deepStrictEqual(row(out,'past').plannedDates,[]);
  assert.strictEqual(row(out,'past').lastVisit,'2026-09-28');
  assert.deepStrictEqual(row(out,'today').plannedDates,['2026-10-01']);
  assert.strictEqual(out.availableWorkDates[0],'2026-10-01');
}

// 16. Sérialisation/restauration de state + archive + range et de la sortie sans divergence.
{
  const store={id:'roundtrip',enseigne:'Conforama',ville:'Persisté',intervalDays:15};
  const state=baseState([store]);setVisit(state,'roundtrip','2026-09-10');state.plan.Vendredi=[store];
  const archive=archivePlan('2026-10-12','Lundi',store),rge=range({planningDiagnostics:[{weekKey:'2026-10-05',days:[{day:'Jeudi',date:'2026-10-08',status:'blocked'}]}]});
  const before=Coverage.forecastThreeWeeks(state,{today:TODAY,range:rge,archive});
  const restoredState=JSON.parse(JSON.stringify(state)),restoredArchive=JSON.parse(JSON.stringify(archive)),restoredRange=JSON.parse(JSON.stringify(rge));
  const after=Coverage.forecastThreeWeeks(restoredState,{today:TODAY,range:restoredRange,archive:restoredArchive});
  assert.deepStrictEqual(after,before);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(before)),before);
}

// 17. Charge réaliste : ~80 puis ~150 magasins, sans évaluation dayBlocked par magasin.
function realisticScenario(count){
  const intervals=[7,15,30,90],stores=Array.from({length:count},(_,i)=>({id:'perf-'+i,enseigne:['Darty','Fnac','Boulanger','Carrefour'][i%4],ville:'Ville '+i,intervalDays:intervals[i%4],lat:45+(i%20)/100,lon:4+(i%25)/100,active:i%41!==0}));
  const state=baseState(stores);for(let i=0;i<count;i++){if(i%9===0)continue;setVisit(state,'perf-'+i,['2026-09-21','2026-09-13','2026-08-28','2026-07-01'][i%4])}state.excluded['perf-37']=true;
  state.plan=weekPlan(stores,0);const archive={
    '2026-10-05':{weekMonday:'2026-10-05',plan:weekPlan(stores,20),manualEdited:false},
    '2026-10-12':{weekMonday:'2026-10-12',plan:weekPlan(stores,40),manualEdited:false}
  };
  for(let i=11;i<count;i+=29){state.appointments.push({id:'perf-rdv-'+i+'-a',storeId:'perf-'+i,date:'2026-10-07',time:'09:00'},{id:'perf-rdv-'+i+'-b',storeId:'perf-'+i,date:'2026-10-14',time:'14:00'})}
  return{state,archive,rge:range()}
}
function measureForecast(count){
  const sample=realisticScenario(count);for(let i=0;i<3;i++)Coverage.forecastThreeWeeks(sample.state,{today:TODAY,range:sample.rge,archive:sample.archive,dayBlocked:()=>false});
  const loops=10,start=process.hrtime.bigint();let out;
  for(let i=0;i<loops;i++){let blockedCalls=0;out=Coverage.forecastThreeWeeks(sample.state,{today:TODAY,range:sample.rge,archive:sample.archive,dayBlocked:()=>{blockedCalls++;return false}});assert.strictEqual(blockedCalls,21,'dayBlocked doit être évalué une fois par date, pas par magasin')}
  const averageMs=Number(process.hrtime.bigint()-start)/1e6/loops;
  assert.strictEqual(out.counts.total,sample.state.stores.filter(s=>s.active!==false&&!sample.state.excluded[s.id]).length);
  assert(averageMs<750,'forecast '+count+' magasins trop lent : '+averageMs.toFixed(2)+' ms');
  return averageMs
}
const perf80=measureForecast(80),perf150=measureForecast(150);
console.log('three-week forecast perf 80='+perf80.toFixed(2)+'ms 150='+perf150.toFixed(2)+'ms');

console.log('three-week forecast v263.6 ok');
