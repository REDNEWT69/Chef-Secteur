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
function forecast(state,opts={}){return Coverage.forecastThreeWeeks(state,{today:TODAY,range:opts.range||range(),archive:opts.archive||{},priorities:opts.priorities,dayBlocked:opts.dayBlocked,lockDayForWeek:opts.lockDayForWeek})}
function row(out,id){const r=out.rows.find(x=>x.id===String(id));assert(r,'forecast row '+id+' absent');return r}

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
}

// 8. La projection simule les visites déjà prévues et signale les bascules en retard non couvertes.
{
  const planned={id:'planned',enseigne:'Boulanger',ville:'Prévu',intervalDays:30};
  const slipping={id:'slip',enseigne:'Darty',ville:'Bascule',intervalDays:30};
  const state=baseState([planned,slipping]);setVisit(state,'planned','2026-09-04');setVisit(state,'slip','2026-09-05');
  const arch=archivePlan(START,'Jeudi',planned);
  const out=forecast(state,{archive:arch});
  const p=row(out,'planned'),s=row(out,'slip');
  assert.strictEqual(p.recommendedDate,'2026-10-01'.replace('10-01','10-01')); // garde une assertion littérale lisible
  assert.notStrictEqual(p.projectedStatus,'late');
  assert.strictEqual(s.willBecomeLate,true);
  assert.strictEqual(s.projectedStatus,'late');
  assert(out.counts.becomesLate>=1);
}

// 9. Même entrée = même sortie, et aucun effet de bord sur state/archive/range.
{
  const store={id:'stable',enseigne:'Conforama',ville:'Stable',intervalDays:30};
  const state=baseState([store]);setVisit(state,'stable','2026-09-01');
  const arch=archivePlan('2026-10-05','Mardi',store),rge=range();
  const beforeState=JSON.stringify(state),beforeArchive=JSON.stringify(arch),beforeRange=JSON.stringify(rge);
  const a=Coverage.forecastThreeWeeks(state,{today:TODAY,range:rge,archive:arch});
  const b=Coverage.forecastThreeWeeks(state,{today:TODAY,range:rge,archive:arch});
  assert.deepStrictEqual(a,b);
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

console.log('three-week forecast v263.6 ok');
