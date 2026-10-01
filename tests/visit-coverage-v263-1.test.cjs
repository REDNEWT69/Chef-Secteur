// V263.1 — fiabilisation de la couverture réelle (aucune fonctionnalité nouvelle).
//
// Un cas = un test, rejoué sur les VRAIS moteurs chargés en bac à sable : cycle 3 semaines
// (terrain-planning-v1.js), génération semaine/période V211 (range-planner-v2.js),
// regroupement géographique V185 (v182-fixes.js), ordre de passage V251, besoin de visite
// (visit-coverage.js) et Pilotage (sector-pilotage.js).
//
// Les cas « a » (contrat d'événement génération → finalisation V251) et « g » (Pilotage
// ouvert rafraîchi en direct) demandent le runtime complet : ils sont dans
// tests/visit-coverage-v263-1-browser.spec.cjs.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const WORK=DAYS.slice(0,5);
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const copy=x=>JSON.parse(JSON.stringify(x));
const emptyPlan=()=>Object.fromEntries(DAYS.map(d=>[d,[]]));
const coverageSource=read('visit-coverage.js');
const C=require(path.join(ROOT,'visit-coverage.js'));

function clockAt(nowIso){
  const Real=Date;
  return class extends Real{
    constructor(...args){super(...(args.length?args:[nowIso+'T10:00:00']))}
    static now(){return new Real(nowIso+'T10:00:00').getTime()}
  };
}
function store(id,distance,extra={}){
  return Object.assign({id,enseigne:'Fnac',ville:'Ville '+id,adresse:id+' rue du Test',dept:'69',lat:45+distance*0.01,lon:4,distance,intervalDays:30,priority:3,active:true},extra);
}
function history(map){
  const out={};
  for(const [id,days] of Object.entries(map)){const h=days.slice().sort();out[id]={lastVisit:h[h.length-1]||'',history:h}}
  return out;
}
function storage(seed){
  const mem=new Map(Object.entries(seed||{}));
  return{mem,getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),flush:()=>Promise.resolve()};
}
function ids(route){return Array.from(route||[],s=>String(s.id))}
function weekIds(plan){return DAYS.flatMap(d=>ids(plan&&plan[d]))}
function dateOf(weekKey,day){const d=new Date(weekKey+'T12:00:00');d.setDate(d.getDate()+DAYS.indexOf(day));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

function baseContext(nowIso,state,db){
  const ctx={
    console,Date:clockAt(nowIso),Map,Set,JSON,Object,Array,String,Number,Math,RegExp,Promise,Error,setTimeout,clearTimeout,
    state,__chefStorage:db,localStorage:db,
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    dispatchEvent(){},addEventListener(){},removeEventListener(){},
    havBase:s=>Number(s&&s.distance)||0,
    hav:(a,b)=>Math.abs((Number(a&&a.distance)||0)-(Number(b&&b.distance)||0)),
    baseObj:()=>({id:'BASE',distance:0,lat:45,lon:4}),
    storeRunnerLockDayForWeek:(id,week)=>{const raw=state.locks&&state.locks[String(id)];if(typeof raw==='string')return raw;if(raw&&raw.day&&raw.week===week)return raw.day;return''}
  };
  ctx.window=ctx;
  vm.runInNewContext(coverageSource,ctx,{filename:'visit-coverage.js'});
  return ctx;
}
function makeState(o){
  return{
    profile:{baseLat:45,baseLon:4,overnightMode:'never'},
    settings:{days:WORK.slice(),target:o.target||6,maxVisitsPerDay:o.max||4,weekDate:o.weekDate||'2026-09-28',startTime:'08:30',endTime:'18:00',visitMinutes:45},
    stores:o.stores,visits:o.visits||{},businessV2:{visits:o.businessVisits||[],actions:[],storeSnapshots:{}},
    plan:o.plan||emptyPlan(),included:o.included||{},excluded:o.excluded||{},locks:o.locks||{},appointments:o.appointments||[],calendarEvents:o.calendarEvents||[],manualWeekEdits:o.manualWeekEdits||{}
  };
}

/* Cycle 3 semaines tel que le bouton principal l'exécute (sans V185 ni V251). */
async function runThreeWeeks(o){
  const state=makeState(o),db=storage(o.archive?{[ARCHIVE_KEY]:JSON.stringify(o.archive)}:{});
  const ctx=baseContext(o.today,state,db);let persisted=null;
  ctx.ChefReliability={
    checkpoint(){},
    capture:(st,s)=>({state:copy(st),archive:JSON.parse(s.getItem(ARCHIVE_KEY)||'{}'),range:null}),
    persist:(bundle,s)=>{persisted=bundle;s.setItem(ARCHIVE_KEY,JSON.stringify(bundle.archive||{}))}
  };
  vm.runInNewContext(read('terrain-planning-v1.js'),ctx,{filename:'terrain-planning-v1.js'});
  const built=await ctx.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail({start:o.start||'2026-09-28'});
  return{built,ctx,state,db,persisted,weeks:Array.from(built.weeks)};
}

/* V185 (regroupement géographique entre jours) chargé avec le même état et la même
   couverture que le runtime. */
function geographyEnv(o,state){
  const document={readyState:'loading',hidden:false,addEventListener(){},dispatchEvent(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:tag=>({tagName:String(tag).toUpperCase(),dataset:{},classList:{add(){}},setAttribute(){},remove(){}})};
  const ctx=baseContext(o.today,state,storage());
  Object.assign(ctx,{document,confirm:()=>true,setTimeout:()=>0,StoreRunnerSectorPilotage:{},storeVisitCredit:()=>1,nearestRoute:r=>r.slice().sort((a,b)=>a.distance-b.distance)});
  vm.runInNewContext(read('v182-fixes.js'),ctx,{filename:'v182-fixes.js'});
  return ctx;
}

/* Génération semaine / période V211 (range-planner-v2.js). */
function rangeEnv(o){
  const state=makeState(o),db=storage(o.archive?{[ARCHIVE_KEY]:JSON.stringify(o.archive)}:{});
  const ctx=baseContext(o.today,state,db);
  const elements={rangeStart:{value:o.rangeStart||''},rangeEnd:{value:o.rangeEnd||''}};
  const dayBoxes=(o.days||WORK).map(d=>({checked:true,value:d}));
  ctx.document={readyState:'loading',addEventListener(){},querySelectorAll:sel=>sel==='[data-day]'?dayBoxes:[],getElementById:id=>elements[id]||null,querySelector:()=>null};
  const proposals=[];
  Object.assign(ctx,{confirm:()=>true,includedByFilters:()=>true,nearestRoute:r=>r.slice().sort((a,b)=>a.distance-b.distance),twoOpt:r=>r.slice(),storeVisitCredit:()=>1,readPlanningControls(){},save(){},renderAll(){},
    ChefReliability:{checkpoint(){},propose:async candidate=>{proposals.push(copy(candidate));return true}},syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]});
  const source=read('range-planner-v2.js').replace('window.generatePlanningRange=generateRange;','window.testV2631={strictSingleWeek,generateRange};window.generatePlanningRange=generateRange;');
  vm.runInNewContext(source,ctx,{filename:'range-planner-v2.js'});
  return{ctx,state,proposals};
}

/* Tout magasin placé automatiquement l'est un jour où il n'est pas bloqué. Seules les
   contraintes explicites (rendez-vous, verrou, imposé) et les journées passées figées
   échappent à la règle. */
function blockedPlacements(weeks,state,today){
  const need=C.needOf(state,{today}),out=[];
  const apptOn=(id,date)=>(state.appointments||[]).some(a=>String(a.storeId)===String(id)&&a.date===date);
  for(const w of weeks){
    const frozen=new Set(w.frozenDays||[]);
    for(const day of DAYS){
      if(frozen.has(day))continue;
      const date=dateOf(w.weekKey,day);if(date<today)continue;
      for(const s of ((w.plan&&w.plan[day])||[])){
        const lock=state.locks&&state.locks[String(s.id)];
        if(apptOn(s.id,date)||(lock&&lock.day===day)||(state.included&&state.included[s.id]))continue;
        const full=(state.stores||[]).find(x=>String(x.id)===String(s.id))||s;
        if(need(full,date).blocked)out.push(s.id+'@'+date);
      }
    }
  }
  return out;
}

/* ----------------------------------------------------------------- scénarios ---- */
const results=[];
async function scenario(name,fn){
  try{await fn();results.push({name,ok:true})}
  catch(e){results.push({name,ok:false,error:e&&e.message?e.message:String(e)})}
}

// Aujourd'hui : vendredi 25 septembre 2026. Le cycle démarre lundi 28.
const FRIDAY='2026-09-25';

/* Cas b : E visité il y a 3 j (fréquence 30 j), rendez-vous jeudi 01/10. */
function appointmentSector(onlyE){
  const stores=[store('E',3)].concat(onlyE?[]:[store('L1',1),store('L2',2),store('L3',4)]);
  return{stores,visits:history(onlyE?{E:['2026-09-22']}:{E:['2026-09-22'],L1:['2026-08-10'],L2:['2026-08-10'],L3:['2026-08-10']}),
    appointments:[{id:'rdv-e',storeId:'E',date:'2026-10-01',time:'10:00',duration:60,type:'visite',note:''}]};
}
/* Cas c/d : W hebdomadaire visité vendredi 25 → bloqué lundi 28, redevient dû ensuite. */
function weeklySector(){
  const stores=[store('W',1,{intervalDays:7}),store('L1',2),store('L2',3),store('L3',4)];
  return{stores,visits:history({W:['2026-09-25'],L1:['2026-08-10'],L2:['2026-08-10'],L3:['2026-08-10']})};
}

(async()=>{
  await scenario('b1 — V211 semaine : rendez-vous jeudi malgré une visite il y a 3 j → présent jeudi',async()=>{
    const t=rangeEnv(Object.assign({today:FRIDAY,weekDate:'2026-09-28',target:4},appointmentSector(false)));
    const r=await t.ctx.testV2631.strictSingleWeek();
    assert.equal(r.ok,true,r.error);
    const plan=t.proposals[0].plan;
    assert.ok(ids(plan.Jeudi).includes('E'),'E a un rendez-vous jeudi : '+DAYS.map(d=>d+'='+ids(plan[d]).join(',')).join(' '));
  });

  await scenario('b2 — V211 période : rendez-vous jeudi → présent jeudi de la bonne semaine',async()=>{
    const t=rangeEnv(Object.assign({today:FRIDAY,weekDate:'2026-09-28',target:4,rangeStart:'2026-09-28',rangeEnd:'2026-10-09'},appointmentSector(false)));
    await t.ctx.testV2631.generateRange();
    assert.equal(t.proposals.length,1,'la période doit être proposée');
    const week=t.proposals[0].archive['2026-09-28'];
    assert.ok(week&&ids(week.plan.Jeudi).includes('E'),'E a un rendez-vous jeudi 01/10 : '+(week?DAYS.map(d=>d+'='+ids(week.plan[d]).join(',')).join(' '):'semaine absente'));
  });

  await scenario('b3 — V211 : vivier d’un seul magasin avec rendez-vous → 1 visite, pas 0',async()=>{
    const t=rangeEnv(Object.assign({today:FRIDAY,weekDate:'2026-09-28',target:4},appointmentSector(true)));
    const r=await t.ctx.testV2631.strictSingleWeek();
    assert.equal(r.ok,true,'génération refusée : '+r.error);
    assert.equal(r.visits,1);
    assert.deepEqual(ids(t.proposals[0].plan.Jeudi),['E']);
  });

  /* Revue Codex #456 : conflits de contraintes autour d'un rendez-vous V211. */
  await scenario('b4 — V211 : verrou mardi + rendez-vous jeudi → le rendez-vous fixe le jour',async()=>{
    const sector=appointmentSector(false);sector.locks={E:{day:'Mardi',week:'2026-09-28'}};
    const t=rangeEnv(Object.assign({today:FRIDAY,weekDate:'2026-09-28',target:4},sector));
    const r=await t.ctx.testV2631.strictSingleWeek();
    assert.equal(r.ok,true,r.error);
    const plan=t.proposals[0].plan;
    assert.ok(ids(plan.Jeudi).includes('E'),'le rendez-vous prime sur le verrou : '+DAYS.map(d=>d+'='+ids(plan[d]).join(',')).join(' '));
  });

  await scenario('b5 — V211 : deux rendez-vous pour un objectif de 1 → les deux sont planifiés',async()=>{
    const stores=[store('E',3),store('F',4),store('L1',1)];
    const t=rangeEnv({today:FRIDAY,weekDate:'2026-09-28',target:1,stores,visits:history({E:['2026-09-22'],F:['2026-09-22'],L1:['2026-08-10']}),
      appointments:[{id:'r1',storeId:'E',date:'2026-10-01',time:'10:00',duration:60},{id:'r2',storeId:'F',date:'2026-09-29',time:'10:00',duration:60}]});
    const r=await t.ctx.testV2631.strictSingleWeek();
    assert.equal(r.ok,true,r.error);
    const plan=t.proposals[0].plan;
    assert.ok(ids(plan.Jeudi).includes('E')&&ids(plan.Mardi).includes('F'),'chaque rendez-vous sur son jour : '+DAYS.map(d=>d+'='+ids(plan[d]).join(',')).join(' '));
  });

  /* Contrat P0.3 : un rendez-vous dont le jour n'est pas travaillé n'est jamais rendu au vivier
     libre — la génération est refusée avant toute proposition, le planning d'entrée reste intact. */
  await scenario('b6 — V211 : rendez-vous un jour non travaillé → génération refusée, E jamais placé un autre jour, planning d’entrée inchangé',async()=>{
    const sector=appointmentSector(false),by=id=>sector.stores.find(s=>s.id===id);
    const plan=Object.assign(emptyPlan(),{Lundi:[by('L1')],Mardi:[by('L2')],Vendredi:[by('L3')]});
    const t=rangeEnv(Object.assign({today:FRIDAY,weekDate:'2026-09-28',target:4,days:['Lundi','Mardi','Mercredi','Vendredi'],plan:copy(plan),archive:{'2026-09-28':{weekMonday:'2026-09-28',plan:copy(plan)}}},sector));
    const planBefore=JSON.stringify(t.state.plan),archiveBefore=t.ctx.__chefStorage.getItem(ARCHIVE_KEY);
    const r=await t.ctx.testV2631.strictSingleWeek();
    assert.equal(r.ok,false,'E a un rendez-vous un jeudi non travaillé : la génération doit être refusée ('+JSON.stringify(r)+')');
    assert.match(String(r.error||''),/rendez-vous/,'le refus nomme le rendez-vous : '+r.error);
    assert.match(String(r.error||''),/n’est pas disponible/,'le refus dit que ce jour est indisponible : '+r.error);
    assert.equal(t.proposals.length,0,'aucune proposition ChefReliability.propose');
    assert.ok(!weekIds(t.state.plan).includes('E'),'E n’est placé sur aucun autre jour');
    assert.equal(JSON.stringify(t.state.plan),planBefore,'le planning d’entrée reste inchangé');
    assert.equal(t.ctx.__chefStorage.getItem(ARCHIVE_KEY),archiveBefore,'l’archive d’entrée reste inchangée');
  });

  await scenario('c — cycle : hebdo visité vendredi, bloqué lundi mais proposé plus tard dans la même semaine, jamais un jour bloqué',async()=>{
    const r=await runThreeWeeks(Object.assign({today:FRIDAY,target:4,max:2},weeklySector()));
    const first=r.weeks[0].plan;
    assert.ok(!ids(first.Lundi).includes('W'),'W ne peut pas être lundi (visité il y a 3 j pour une fréquence de 7 j)');
    assert.ok(weekIds(first).includes('W'),'W hebdomadaire redevient dû dans la semaine : il doit y être proposé ('+DAYS.map(d=>d+'='+ids(first[d]).join(',')).join(' ')+')');
    assert.deepEqual(blockedPlacements(r.weeks,r.state,FRIDAY),[],'aucun magasin placé un jour où il est bloqué');
  });

  await scenario('c bis — propriété : sans nouvelle visite, « bloqué » ne repasse jamais de faux à vrai quand la date avance',async()=>{
    let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n};
    const today='2026-09-25';
    for(let k=0;k<400;k++){
      const interval=[7,15,30,90][rnd(4)],n=rnd(5),days=[];
      for(let i=0;i<n;i++){const d=new Date('2026-09-25T12:00:00');d.setDate(d.getDate()-rnd(Math.max(2,interval*2)));days.push(d.toISOString().slice(0,10))}
      const s=store('p'+k,1,{intervalDays:interval}),state=makeState({stores:[s],visits:days.length?history({['p'+k]:days}):{}});
      const need=C.needOf(state,{today});let wasFree=false;
      for(let i=0;i<120;i++){
        const d=new Date(today+'T12:00:00');d.setDate(d.getDate()+i);const ref=d.toISOString().slice(0,10),b=need(s,ref).blocked;
        assert.ok(!(wasFree&&b),'redevenu bloqué le '+ref+' (fréquence '+interval+' j, visites '+days.join(',')+')');
        if(!b)wasFree=true;
      }
    }
  });

  await scenario('d — croisé : cycle puis V185 puis V251 → aucun magasin sur un jour bloqué ; figé, RDV et posé intacts',async()=>{
    // Mercredi 30/09 : lundi et mardi sont passés (figés). W hebdo visité lundi 28 hors planning.
    // W est loin, juste à côté de D posé mercredi : V185 a tout intérêt à les regrouper.
    const s={};for(const [id,d] of Object.entries({W:20,R1:2,R2:3,D:20.5,E:5,L1:6,L2:7,L3:8,L4:9}))s[id]=store(id,d,id==='W'?{intervalDays:7}:{});
    const plan=emptyPlan();plan.Lundi=[s.R1,s.L1];plan.Mardi=[s.R2];
    const o={today:'2026-09-30',weekDate:'2026-09-28',target:9,max:3,stores:Object.values(s),plan,
      visits:history({W:['2026-09-28'],R1:['2026-09-01','2026-09-28'],R2:['2026-09-01','2026-09-29'],D:['2026-09-24'],E:['2026-09-24'],L1:['2026-08-10'],L2:['2026-08-10'],L3:['2026-08-10'],L4:['2026-08-10']}),
      locks:{D:{day:'Mercredi',week:'2026-09-28'}},appointments:[{id:'rdv-e',storeId:'E',date:'2026-10-01',time:'10:00',duration:60}]};
    const r=await runThreeWeeks(o);
    assert.ok(weekIds(r.weeks[0].plan).includes('W'),'précondition (cas c) : W redevient dû vendredi et doit être proposé');
    const geo=geographyEnv(o,r.state),V251=require(path.join(ROOT,'planning-route-optimizer-v251.js'));
    const finals=r.weeks.map(w=>{
      if(w.manual)return w;
      const g=geo.StoreRunnerGeographyV185.rebalance(copy(w.plan),{weekKey:w.weekKey,preferNearFirst:true,frozenDays:w.frozenDays});
      const after=g.ok?g.plan:w.plan,ordered=V251.optimizePlan(after,w.weekKey,r.state,{frozenDays:w.frozenDays}).plan;
      return{weekKey:w.weekKey,frozenDays:w.frozenDays,plan:ordered};
    });
    const f=finals[0].plan;
    assert.deepEqual(ids(f.Lundi),['R1','L1'],'lundi passé intact');
    assert.deepEqual(ids(f.Mardi),['R2'],'mardi passé intact');
    assert.ok(ids(f.Mercredi).includes('D'),'D posé mercredi reste mercredi');
    assert.ok(ids(f.Jeudi).includes('E'),'E a un rendez-vous jeudi');
    assert.deepEqual(blockedPlacements(finals,r.state,o.today),[],'après V185 + V251, aucun magasin sur un jour où il est bloqué');
  });

  await scenario('e — régénération un lundi : la visite terminée aujourd’hui reste sur aujourd’hui',async()=>{
    const s={X:store('X',5),L1:store('L1',1),L2:store('L2',2),L3:store('L3',3)};
    const plan=emptyPlan();plan.Lundi=[s.X];
    const r=await runThreeWeeks({today:'2026-09-28',weekDate:'2026-09-28',start:'2026-09-28',target:4,stores:Object.values(s),plan,
      visits:history({X:['2026-08-01','2026-09-28'],L1:['2026-08-10'],L2:['2026-08-10'],L3:['2026-08-10']})});
    assert.ok(ids(r.weeks[0].plan.Lundi).includes('X'),'X visité ce lundi doit rester lundi : '+DAYS.map(d=>d+'='+ids(r.weeks[0].plan[d]).join(',')).join(' '));
    const later=r.weeks.slice(1).flatMap(w=>weekIds(w.plan));
    assert.ok(!later.includes('X'),'X vient d’être visité : il ne revient pas dans le cycle');
  });

  await scenario('e2 — visite faite aujourd’hui un jour bloqué par l’agenda : comptée dans l’objectif, pas en plus',async()=>{
    // Lundi 28/09 bloqué (congé) mais X y a été visité : il reste, et l'objectif de 4 n'est pas dépassé.
    const s={X:store('X',5),L1:store('L1',1),L2:store('L2',2),L3:store('L3',3),L4:store('L4',4)};
    const plan=emptyPlan();plan.Lundi=[s.X];
    const r=await runThreeWeeks({today:'2026-09-28',weekDate:'2026-09-28',start:'2026-09-28',target:4,stores:Object.values(s),plan,
      calendarEvents:[{id:'c1',date:'2026-09-28',title:'Congé',allDay:true}],
      visits:history({X:['2026-08-01','2026-09-28'],L1:['2026-08-10'],L2:['2026-08-10'],L3:['2026-08-10'],L4:['2026-08-10']})});
    const w=r.weeks[0].plan;
    assert.ok(ids(w.Lundi).includes('X'),'X visité aujourd’hui reste sur aujourd’hui');
    assert.ok(weekIds(w).length<=4,'objectif 4 dépassé : '+DAYS.map(d=>d+'='+ids(w[d]).join(',')).join(' '));
  });

  await scenario('f — Pilotage : un magasin exclu sort du total, de l’anneau, des restants et des filtres',async()=>{
    const P=require(path.join(ROOT,'sector-pilotage.js'));
    const stores=[store('late',1),store('never',2),store('ok',3),store('gone',4)];
    const st=makeState({stores,excluded:{gone:true},visits:history({late:['2026-08-01'],ok:['2026-09-20']})});
    const data=P.compute(st,{now:new Date(2026,8,25,12),coverageApi:C,activityMetrics:{}});
    const planning=C.compute(st,{today:FRIDAY});
    assert.ok(!data.rows.some(r=>r.store.id==='gone'),'le magasin exclu ne doit pas apparaître');
    assert.equal(data.total,planning.counts.total,'même population que la couverture du planning');
    const ring=Object.values(data.coverageCounts).reduce((a,b)=>a+b,0);
    assert.equal(ring,planning.counts.total,'l’anneau compte la même population');
    assert.equal(data.remaining,planning.counts.late+planning.counts.never,'restants : même population');
    assert.deepEqual(data.rows.filter(r=>P.matchesCoverage(r,'todo')).map(r=>r.store.id).sort(),['late','never']);
  });

  await scenario('h — plannedDates : le plan live de la semaine affichée prime sur son archive',async()=>{
    const A=store('A',1),B=store('B',2);
    const st=makeState({weekDate:'2026-09-28',stores:[A,B]});
    st.plan.Mercredi=[B];
    const archive={'2026-09-28':{weekMonday:'2026-09-28',plan:{Lundi:[],Mardi:[],Mercredi:[A],Jeudi:[],Vendredi:[],Samedi:[]}},
      '2026-10-05':{weekMonday:'2026-10-05',plan:{Lundi:[],Mardi:[B],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}};
    const out=C.plannedDates(st,archive,FRIDAY);
    assert.equal(out.get('B'),'2026-09-30','B prévu mercredi (plan live)');
    assert.equal(out.has('A'),false,'A retiré du plan live ne doit plus être « prévu » : '+out.get('A'));
    const later=C.plannedDates(makeState({weekDate:'2026-09-28',stores:[A,B]}),{'2026-10-05':archive['2026-10-05']},FRIDAY);
    assert.equal(later.get('B'),'2026-10-06','les autres semaines archivées restent lues');
  });

  await scenario('Non-régression — sans aucune visite, le cycle est identique à 083179c',async()=>{
    const fixture=JSON.parse(read('tests/fixtures/v263-1-no-visit-cycle.json'));
    for(const c of fixture.cases){
      const stores=Array.from({length:c.count},(_,i)=>store('s'+(i+1),i+1,i%5===0?{intervalDays:7}:{}));
      const r=await runThreeWeeks({today:c.today,weekDate:c.weekDate,start:c.start,target:c.target,max:c.max,stores,plan:c.plan?Object.fromEntries(DAYS.map(d=>[d,(c.plan[d]||[]).map(id=>stores.find(s=>s.id===id))])):undefined,
        locks:c.locks,appointments:c.appointments,included:c.included});
      assert.deepEqual(r.weeks.map(w=>({weekKey:w.weekKey,days:DAYS.map(d=>ids(w.plan[d]))})),c.expected,'cycle différent de 083179c pour '+c.name);
    }
  });

  let failed=0;
  for(const r of results){console.log((r.ok?'✓ ':'✗ ')+r.name+(r.ok?'':'\n    → '+r.error));if(!r.ok)failed++}
  console.log('\nV263.1 : '+(results.length-failed)+'/'+results.length+' cas verts');
  if(failed)process.exit(1);
})();
