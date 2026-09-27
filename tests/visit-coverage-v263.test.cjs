// V263 — Planning piloté par les visites réellement faites.
//
// Ce fichier rejoue les cas terrain A → H sur les VRAIS moteurs (cycle 3 semaines,
// recalcul en cascade, génération V211, recentrage d'une journée), avec un historique de
// visites réelles : `state.visits` (Visité coché ou visite 6P terminée) et
// `state.businessV2.visits` au statut `completed`. Une visite planifiée ou un brouillon
// n'est jamais une visite faite.
//
// Il vérifie ensuite les statuts de couverture et leur explication courte.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const WORK=DAYS.slice(0,5);
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const copy=x=>JSON.parse(JSON.stringify(x));
const emptyPlan=()=>Object.fromEntries(DAYS.map(d=>[d,[]]));
const COVERAGE_FILE='visit-coverage.js';
const coverageSource=read(COVERAGE_FILE);

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

/* ------------------------------------------------------------------ bac à sable ---- */
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
  vm.runInNewContext(coverageSource,ctx,{filename:COVERAGE_FILE});
  return ctx;
}
function makeState(o){
  return{
    profile:{baseLat:45,baseLon:4,overnightMode:'never'},
    settings:{days:WORK.slice(),target:o.target||6,maxVisitsPerDay:o.max||4,weekDate:o.weekDate||'2026-09-28',startTime:'08:30',endTime:'18:00',visitMinutes:45},
    stores:o.stores,visits:o.visits||{},businessV2:{visits:o.businessVisits||[],actions:[],storeSnapshots:{}},
    plan:o.plan||emptyPlan(),included:o.included||{},excluded:{},locks:o.locks||{},appointments:o.appointments||[],calendarEvents:[],manualWeekEdits:o.manualWeekEdits||{}
  };
}

/* Cycle 3 semaines tel que le bouton principal l'exécute. */
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
  return{built,ctx,state,persisted,weeks:built.weeks};
}

/* Recalcul « ↻ Recalculer le reste du planning » (propriétaire : planning-cascade-v181.js). */
function cascadeEnv(o){
  const state=makeState(o),db=storage(o.archive?{[ARCHIVE_KEY]:JSON.stringify(o.archive)}:{});
  const ctx=baseContext(o.today,state,db);
  ctx.document={readyState:'complete',addEventListener(){},dispatchEvent(){},getElementById:id=>id==='weekDate'?{value:state.settings.weekDate}:null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{},addEventListener(){},insertAdjacentElement(){}})};
  const confirms=[];ctx.confirm=message=>{confirms.push(String(message));return o.confirm!==false};ctx.save=()=>{};ctx.renderAll=()=>{};
  const proposals=[];
  ctx.ChefReliability={checkpoint(){},propose:async candidate=>{proposals.push(copy(candidate));state.plan=copy(candidate.plan);if(candidate.archive)db.setItem(ARCHIVE_KEY,JSON.stringify(candidate.archive));return true}};
  vm.runInNewContext(read('planning-cascade-v181.js'),ctx,{filename:'planning-cascade-v181.js'});
  const build=()=>{ctx.__storeRunnerPlanningGenerationActive=true;try{return ctx.__storeRunnerBuildRemainingWeekPlan()}finally{ctx.__storeRunnerPlanningGenerationActive=false}};
  return{ctx,state,db,proposals,confirms,build};
}

/* Génération semaine / période V211 et remplacement d'un magasin (range-planner-v2.js). */
function rangeEnv(o){
  const state=makeState(o),db=storage(o.archive?{[ARCHIVE_KEY]:JSON.stringify(o.archive)}:{});
  const ctx=baseContext(o.today,state,db);
  ctx.document={readyState:'loading',addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null,querySelector:()=>null};
  Object.assign(ctx,{confirm:()=>true,includedByFilters:()=>true,nearestRoute:r=>r.slice().sort((a,b)=>a.distance-b.distance),twoOpt:r=>r.slice(),storeVisitCredit:()=>1,readPlanningControls(){},save(){},renderAll(){},ChefReliability:{checkpoint(){},propose:async()=>false},syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]});
  const source=read('range-planner-v2.js').replace('window.generatePlanningRange=generateRange;','window.testV263={chooseStores,buildDayReplacement,rotationMemoryV211,planningNeedV211};window.generatePlanningRange=generateRange;');
  vm.runInNewContext(source,ctx,{filename:'range-planner-v2.js'});
  return{ctx,state};
}

/* ----------------------------------------------------------------- scénarios ---- */
const results=[];
async function scenario(name,fn){
  try{await fn();results.push({name,ok:true})}
  catch(e){results.push({name,ok:false,error:e&&e.message?e.message:String(e)})}
}

// Aujourd'hui : vendredi 25 septembre 2026. Le cycle démarre lundi 28.
const FRIDAY='2026-09-25';
function mainSector(){
  const stores=[
    store('A',1),                                        // cas A : 3 visites ce mois, dernière il y a 4 j
    store('R1',2),store('R2',3),store('R3',4),store('R4',5),// à jour : une visite le 08/09
    store('D',2.5),                                      // cas D : visité avant-hier mais posé mardi
    store('E',3.5),                                      // cas E : visité il y a 3 j, rendez-vous jeudi
    store('L1',6),store('L2',7),store('L3',8),store('L4',9),store('L5',10),store('L6',11), // en retard
    store('C',12),                                       // jamais visité
    store('B',20),                                       // cas B : dernière visite il y a 45 j
    // Secteur réel plus grand que la capacité de 3 semaines : des magasins lointains jamais vus.
    store('F1',30),store('F2',31),store('F3',32),store('F4',33),store('F5',34),store('F6',35)
  ];
  const visits=history({
    A:['2026-09-03','2026-09-12','2026-09-21'],
    R1:['2026-09-08'],R2:['2026-09-08'],R3:['2026-09-08'],R4:['2026-09-08'],
    D:['2026-09-23'],
    L1:['2026-08-20'],L2:['2026-08-20'],L3:['2026-08-20'],L4:['2026-08-20'],L5:['2026-08-20'],L6:['2026-08-20'],
    B:['2026-08-11']
  });
  // E n'a qu'une visite 6P terminée : la seconde source réelle doit compter aussi.
  const businessVisits=[
    {id:'v-e',storeId:'E',status:'completed',completedDate:'2026-09-22',completedAt:'2026-09-22T11:00:00Z'},
    {id:'v-draft',storeId:'C',status:'draft',completedDate:null,completedAt:null} // brouillon : pas une visite faite
  ];
  return{stores,visits,businessVisits,locks:{D:{day:'Mardi',week:'2026-09-28'}},appointments:[{id:'rdv-e',storeId:'E',date:'2026-10-01',time:'10:00',duration:60}]};
}

(async()=>{
  await scenario('Cas A — 3 visites ce mois, dernière il y a 4 j, fréquence 30 j : jamais resélectionné automatiquement',async()=>{
    const r=await runThreeWeeks(Object.assign({today:FRIDAY,target:6},mainSector()));
    for(const w of r.weeks)assert.ok(!weekIds(w.plan).includes('A'),'A reproposé semaine du '+w.weekKey+' : '+weekIds(w.plan).join(','));
  });

  await scenario('Cas B — dernière visite il y a 45 j (fréquence 30 j) : remonte en première semaine',async()=>{
    const r=await runThreeWeeks(Object.assign({today:FRIDAY,target:6},mainSector()));
    assert.ok(weekIds(r.weeks[0].plan).includes('B'),'B absent de la première semaine : '+weekIds(r.weeks[0].plan).join(','));
  });

  await scenario('Cas C — un magasin jamais visité passe avant des voisins déjà vus deux fois',async()=>{
    const stores=[store('N1',1),store('N2',2),store('N3',3),store('N4',4),store('N5',5),store('C',9)];
    const visits=history({N1:['2026-09-10','2026-09-18'],N2:['2026-09-10','2026-09-18'],N3:['2026-09-10','2026-09-18'],N4:['2026-09-10'],N5:['2026-09-10']});
    const r=await runThreeWeeks({today:FRIDAY,target:3,stores,visits});
    const first=weekIds(r.weeks[0].plan);
    assert.ok(first.includes('C'),'C jamais visité doit être dans la première semaine : '+first.join(','));
    for(const id of ['N1','N2','N3'])assert.ok(!first.includes(id),id+' vu deux fois ce mois ne doit pas repasser en première semaine');
  });

  await scenario('Cas D — magasin visité récemment mais posé mardi : il reste mardi',async()=>{
    const r=await runThreeWeeks(Object.assign({today:FRIDAY,target:6},mainSector()));
    assert.ok(ids(r.weeks[0].plan.Mardi).includes('D'),'D posé mardi : '+ids(r.weeks[0].plan.Mardi).join(','));
  });

  await scenario('Cas E — rendez-vous jeudi : le magasin reste jeudi malgré sa visite récente',async()=>{
    const r=await runThreeWeeks(Object.assign({today:FRIDAY,target:6},mainSector()));
    assert.ok(ids(r.weeks[0].plan.Jeudi).includes('E'),'E a un rendez-vous jeudi : '+ids(r.weeks[0].plan.Jeudi).join(','));
  });

  await scenario('Cas F — génération mercredi : lundi et mardi déjà passés ne changent pas',async()=>{
    const sector=mainSector(),plan=emptyPlan(),by=id=>sector.stores.find(s=>s.id===id);
    plan.Lundi=[by('R1'),by('L1')];plan.Mardi=[by('R2'),by('R3')];plan.Mercredi=[by('L2')];plan.Jeudi=[by('E')];
    const visits=Object.assign({},sector.visits,history({R1:['2026-09-08','2026-09-28'],R2:['2026-09-08','2026-09-29'],R3:['2026-09-08','2026-09-29']}));
    const r=await runThreeWeeks(Object.assign({},sector,{today:'2026-09-30',target:6,plan,visits,weekDate:'2026-09-28'}));
    const w=r.weeks[0].plan;
    assert.deepEqual(ids(w.Mardi),['R2','R3'],'mardi terminé doit rester identique');
    assert.deepEqual(ids(w.Lundi),['R1','L1'],'lundi passé doit rester tel quel');
    for(const d of ['Mercredi','Jeudi','Vendredi'])for(const id of ['R1','R2','R3'])assert.ok(!ids(w[d]).includes(id),id+' déjà visité cette semaine ne doit pas revenir '+d);
    const later=Array.from(r.weeks).slice(1).flatMap(x=>weekIds(x.plan));
    assert.ok(later.includes('L1'),'L1 prévu lundi mais pas visité reste dû : il revient dans le cycle ('+later.join(',')+')');
    for(const id of ['R1','R2','R3'])assert.ok(!later.includes(id),id+' visité cette semaine ne revient pas dans le cycle');
  });

  await scenario('Cas G — semaine modifiée à la main : le complément ne réinjecte pas un magasin sur-visité',async()=>{
    const sector=mainSector(),by=id=>sector.stores.find(s=>s.id===id),manual=emptyPlan();
    manual.Mercredi=[by('L6')];
    const r=await runThreeWeeks(Object.assign({},sector,{today:FRIDAY,target:6,manualWeekEdits:{'2026-09-28':{at:'2026-09-25T08:00:00Z',plan:manual}}}));
    const w=r.weeks[0];
    assert.equal(w.manual,true);
    assert.ok(ids(w.plan.Mercredi).includes('L6'),'le magasin posé à la main reste');
    assert.ok(!weekIds(w.plan).includes('A'),'A sur-visité ne doit pas compléter la semaine manuelle : '+weekIds(w.plan).join(','));
  });

  await scenario('Cas G bis — « Changer ce magasin » + recentrer : aucun magasin trop visité ajouté automatiquement',async()=>{
    const stores=[store('X',10),store('Y',11),store('Z',12),store('ANCHOR',30),store('OVER',30.5),store('FAR1',33),store('FAR2',34)];
    const visits=history({OVER:['2026-09-05','2026-09-12','2026-09-19','2026-09-24'],X:['2026-08-01'],Y:['2026-08-01'],Z:['2026-08-01'],FAR1:['2026-08-01'],FAR2:['2026-08-01']});
    const plan=emptyPlan();plan.Mercredi=[stores[0],stores[1],stores[2]];
    const t=rangeEnv({today:FRIDAY,weekDate:'2026-09-28',stores,visits,plan});
    const preview=t.ctx.testV263.buildDayReplacement('X',stores[3],'Mercredi',true);
    assert.ok(ids(preview.route).includes('ANCHOR'),'le magasin choisi à la main est toujours accepté');
    assert.ok(!ids(preview.route).includes('OVER'),'OVER sur-visité ne doit pas être ajouté au recentrage : '+ids(preview.route).join(','));
  });

  await scenario('Cas H — capacité insuffisante : les plus en retard d’abord, et les non couverts sont signalés',async()=>{
    const stores=[];const map={};
    for(let i=1;i<=6;i++){stores.push(store('near'+i,i));map['near'+i]=['2026-08-22']}      // en retard (37 j)
    for(let i=1;i<=6;i++){stores.push(store('old'+i,20+i));map['old'+i]=['2026-08-01']}     // très en retard (58 j)
    const r=await runThreeWeeks({today:FRIDAY,target:2,stores,visits:history(map)});
    const placed=Array.from(r.weeks).flatMap(w=>weekIds(w.plan));
    assert.deepEqual(placed.slice().sort(),['old1','old2','old3','old4','old5','old6'],'les 6 places vont aux plus en retard : '+placed.join(','));
    const report=r.built.coverage||{};
    assert.equal((report.uncoveredLate||[]).length,6,'les magasins en retard non couverts doivent être signalés');
  });

  await scenario('Recalcul — mardi terminé intact, visites faites ailleurs retirées, trous comblés par les plus en retard',async()=>{
    const s={};
    for(const [id,d] of Object.entries({m1:1,m2:2,t1:3,t2:4,w1:5,j1:6,j2:7,j3:8,v1:9,over:10,late1:11,never1:12,okx:13}))s[id]=store(id,d);
    const plan=emptyPlan();
    plan.Lundi=[s.m1,s.m2];plan.Mardi=[s.t1,s.t2];plan.Mercredi=[s.w1];plan.Jeudi=[s.j1,s.j2,s.j3];plan.Vendredi=[s.v1,s.over];
    const visits=history({
      m1:['2026-09-01','2026-09-28'],m2:['2026-08-10'],t1:['2026-08-25','2026-09-29'],t2:['2026-08-26','2026-09-29'],
      w1:['2026-09-10'],j1:['2026-08-20','2026-09-29'],j2:['2026-09-26'],j3:['2026-09-29'],v1:['2026-09-08'],
      over:['2026-09-05','2026-09-12','2026-09-19','2026-09-25'],late1:['2026-08-15'],okx:['2026-09-20']
    });
    const archive={'2026-09-28':{weekMonday:'2026-09-28',plan:copy(plan)}};
    const t=cascadeEnv({today:'2026-09-30',weekDate:'2026-09-28',stores:Object.values(s),visits,plan,archive,
      locks:{j3:{day:'Jeudi',week:'2026-09-28'}},appointments:[{id:'rdv-j2',storeId:'j2',date:'2026-10-01',time:'09:30',duration:60}]});
    const r=t.build();
    assert.equal(r.ok,true,r.error);
    const p=r.plan;
    assert.deepEqual(ids(p.Mardi),['t1','t2'],'cas F : mardi terminé identique');
    assert.ok(ids(p.Lundi).includes('m1'),'visite faite lundi conservée');
    assert.ok(ids(p.Jeudi).includes('j2'),'cas E : rendez-vous jeudi conservé');
    assert.ok(ids(p.Jeudi).includes('j3'),'cas D : magasin posé jeudi conservé malgré sa visite d’hier');
    const all=weekIds(p);
    assert.ok(!all.includes('j1'),'j1 déjà visité mardi ne doit plus être prévu jeudi');
    assert.ok(!all.includes('over'),'cas G : magasin sur-visité retiré');
    assert.ok(all.includes('m2'),'m2 raté lundi et toujours en retard est replacé');
    assert.ok(all.includes('late1')&&all.includes('never1'),'les créneaux libérés vont aux magasins en retard ou jamais visités : '+all.join(','));
    assert.ok(!all.includes('okx'),'un magasin à jour ne comble pas un trou');
    assert.equal((r.removed||[]).length,2,'2 magasins retirés car récemment visités');
    assert.equal((r.added||[]).length,2,'2 magasins ajoutés car en retard ou manquants');
    for(const d of ['Mercredi','Jeudi','Vendredi']){const credits=(p[d]||[]).length;assert.ok(credits<=4,d+' dépasse la capacité')}
  });

  await scenario('V211 — la génération semaine/période écarte aussi les magasins trop visités',async()=>{
    const sector=mainSector();
    const t=rangeEnv(Object.assign({today:FRIDAY,weekDate:'2026-09-28'},sector));
    const pool=t.state.stores.filter(x=>['A','R1','R2','B'].includes(x.id));
    const memory=t.ctx.testV263.rotationMemoryV211(pool,'2026-09-28',4,{});
    const chosen=t.ctx.testV263.chooseStores(pool,memory.usedKeys,memory.useCount,memory.lastUsedWeek,4,16,'2026-09-28',0);
    assert.ok(!ids(chosen).includes('A'),'A ne doit pas être choisi : '+ids(chosen).join(','));
    assert.ok(ids(chosen).includes('B'),'B très en retard doit être choisi');
  });

  /* ------------------------------------------------ statuts et explications ---- */
  await scenario('Statuts relatifs à la fréquence et explication compacte',async()=>{
    const C=require(path.join(ROOT,COVERAGE_FILE));
    const stores=[
      store('darty',5,{enseigne:'Darty',ville:'Chambéry'}),
      store('boul',6,{enseigne:'Boulanger',ville:'Limonest'}),
      store('weekly',7,{intervalDays:7}),
      store('never',8),
      store('soon',9),
      store('ok',10),
      store('over',11)
    ];
    const state=makeState({stores,visits:history({
      darty:['2026-08-20'],boul:['2026-09-03','2026-09-12','2026-09-20'],weekly:['2026-09-07','2026-09-14','2026-09-21'],
      soon:['2026-08-31'],ok:['2026-09-12'],over:['2026-09-02','2026-09-09','2026-09-16','2026-09-23']
    })});
    const summary=C.compute(state,{today:FRIDAY,priorities:new Map([['darty','P1']])});
    const row=id=>summary.rows.find(r=>r.id===id);
    assert.equal(row('darty').status,'late');assert.equal(row('darty').overdueDays,6);assert.equal(row('darty').ageDays,36);assert.equal(row('darty').visitsMonth,0);assert.equal(row('darty').priority,'P1');
    assert.equal(row('darty').tier,4,'P1 en retard passe au palier le plus urgent');
    assert.match(C.explain(row('darty')),/il y a 36 j.*fréquence 30 j.*retard 6 j.*0 visite ce mois.*P1/);
    assert.equal(C.statusLabel(row('darty').status),'En retard');
    assert.equal(row('boul').status,'enough');assert.equal(row('boul').blocked,true);assert.equal(row('boul').visitsMonth,3);
    assert.equal(C.statusLabel('enough'),'Déjà suffisamment visité');
    assert.match(C.explain(row('boul')),/3 visites ce mois.*il y a 5 j.*fréquence 30 j/);
    assert.equal(row('weekly').status,'ok','3 visites ce mois restent normales pour un magasin hebdomadaire');
    assert.equal(row('weekly').blocked,false);
    assert.equal(row('never').status,'never');assert.equal(C.statusLabel('never'),'Jamais visité');
    assert.equal(row('soon').status,'soon');assert.equal(C.statusLabel('soon'),'À visiter bientôt');
    assert.equal(row('ok').status,'enough','visité il y a 13 j sur 30 : pas encore la moitié du cycle');
    assert.equal(row('over').status,'over');assert.equal(C.statusLabel('over'),'Sur-visité');
    assert.deepEqual(Object.assign({},summary.counts),{never:1,late:1,soon:1,ok:1,enough:2,over:1,total:7});
    assert.equal(summary.monthVisits,11);assert.equal(summary.monthStores,4);
    assert.deepEqual(summary.catchUp.map(r=>r.id),['darty','never','soon'],'à rattraper : le plus urgent d’abord');
    assert.deepEqual(summary.covered.map(r=>r.id),['over','boul','ok'],'déjà bien couverts : les plus visités d’abord');
    // Un brouillon n'est pas une visite faite.
    const draft=makeState({stores:[store('x',1)],businessVisits:[{id:'d',storeId:'x',status:'draft',completedDate:null}]});
    assert.equal(C.compute(draft,{today:FRIDAY}).rows[0].status,'never');
    // Même source que les compteurs d'accueil (visit-counting.js).
    const {StoreRunnerActivityMetrics:M}=require(path.join(ROOT,'visit-counting.js'));
    const mixed=makeState({stores:[store('x',1),store('y',2)],visits:history({x:['2026-09-01']}),businessVisits:[{id:'b',storeId:'y',status:'completed',completedDate:'2026-09-02'},{id:'c',storeId:'x',status:'completed',completedDate:'2026-09-01'}]});
    const shared=M.completedVisitDays(mixed),own=C.visitDays(mixed);
    for(const [id,set] of shared)assert.deepEqual(own.get(id),Array.from(set).sort(),'même lecture des visites réelles pour '+id);
  });

  await scenario('Recalcul — l’aperçu avant validation chiffre conservé / retiré / ajouté, la validation l’affiche',async()=>{
    const s={};for(const [id,d] of Object.entries({a:1,b:2,over:3,late:4}))s[id]=store(id,d);
    const plan=emptyPlan();plan.Jeudi=[s.a,s.over];plan.Vendredi=[s.b];
    const visits=history({a:['2026-09-10'],b:['2026-09-10'],over:['2026-09-05','2026-09-12','2026-09-19','2026-09-25'],late:['2026-08-10']});
    const t=cascadeEnv({today:'2026-09-30',weekDate:'2026-09-28',stores:Object.values(s),visits,plan,archive:{'2026-09-28':{weekMonday:'2026-09-28',plan:copy(plan)}}});
    const result=await t.ctx.storeRunnerRecalculateRemainingWeek();
    assert.equal(result.ok,true,result.error);
    assert.equal(t.confirms.length,1,'une seule confirmation, après le calcul');
    const text=t.confirms[0];
    assert.match(text,/Ce que le recalcul change/);
    assert.match(text,/2 visites conservées/);
    assert.match(text,/1 retiré car déjà visité récemment : Fnac Ville over/);
    assert.match(text,/1 ajouté car en retard ou jamais visité : Fnac Ville late/);
    assert.match(text,/Magasins à rattraper planifiés : 0 → 1/);
    assert.deepEqual(Array.from(t.proposals[0].previewLines),Array.from(result.previewLines),'le même aperçu accompagne la proposition');
    assert.match(read('reliability-ui.js'),/candidate\.previewLines/,'la validation manuelle (si réactivée) affiche aussi l’aperçu');
    // Refuser l'aperçu ne change rien.
    const refused=cascadeEnv({today:'2026-09-30',weekDate:'2026-09-28',stores:Object.values(s),visits,plan:copy(plan),confirm:false,archive:{'2026-09-28':{weekMonday:'2026-09-28',plan:copy(plan)}}});
    const before=JSON.stringify(refused.state.plan);
    const no=await refused.ctx.storeRunnerRecalculateRemainingWeek();
    assert.equal(no.cancelled,true);assert.equal(refused.proposals.length,0);assert.equal(JSON.stringify(refused.state.plan),before,'planning inchangé si l’aperçu est refusé');
  });

  await scenario('V185 et V251 ne réorganisent jamais une journée passée figée par le cycle',async()=>{
    const elements={premiumHomeV2:{},overnightBox:{innerHTML:''}};
    const document={readyState:'loading',hidden:false,addEventListener(){},dispatchEvent(){},getElementById:id=>elements[id]||null,querySelector:()=>null,querySelectorAll:()=>[],createElement:tag=>({tagName:String(tag).toUpperCase(),dataset:{},classList:{add(){}},setAttribute(){},remove(){}})};
    const state={profile:{overnightMode:'auto',overnightMinSaving:0},settings:{days:WORK.slice(),weekDate:'2026-09-28',maxVisitsPerDay:2},plan:emptyPlan(),stores:[],excluded:{},locks:{},visits:{},appointments:[],manualWeekEdits:{}};
    const ctx={console,state,document,confirm:()=>true,CustomEvent:function(type,o){this.type=type;this.detail=o&&o.detail},setTimeout:()=>0,addEventListener(){},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},StoreRunnerSectorPilotage:{},hav:(a,b)=>Math.abs(Number(a.x||0)-Number(b.x||0)),baseObj:()=>({x:0}),storeVisitCredit:()=>1};
    ctx.window=ctx;vm.runInNewContext(read('v182-fixes.js'),ctx);
    const far=(id,x)=>({id,x,enseigne:'Darty',ville:'V'+id});
    const input={Lundi:[far('f1',100),far('l1',10)],Mardi:[far('f2',102),far('l2',12)],Mercredi:[far('f3',104),far('l3',14)],Jeudi:[far('f4',106),far('l4',16)],Vendredi:[],Samedi:[]};
    const free=ctx.StoreRunnerGeographyV185.rebalance(copy(input),{weekKey:'2026-09-28'});
    assert.equal(free.ok,true);assert.equal(free.changed,true,'sans jour figé, V185 regroupe bien la zone éloignée');
    const frozen=ctx.StoreRunnerGeographyV185.rebalance(copy(input),{weekKey:'2026-09-28',frozenDays:['Lundi','Mardi']});
    assert.equal(frozen.ok,true,frozen.reason);
    assert.deepEqual(ids(frozen.plan.Lundi),['f1','l1'],'lundi passé intact');
    assert.deepEqual(ids(frozen.plan.Mardi),['f2','l2'],'mardi passé intact');
    const V251=require(path.join(ROOT,'planning-route-optimizer-v251.js'));
    const A={id:'A',lat:45.3,lon:4.3},B={id:'B',lat:45.1,lon:4.1},C={id:'C',lat:45.2,lon:4.2};
    const out=V251.optimizePlan({Lundi:[A,B,C],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},'2026-09-28',{profile:{baseLat:45,baseLon:4},settings:{},appointments:[],stores:[A,B,C]},{frozenDays:['Lundi']});
    assert.deepEqual(ids(out.plan.Lundi),['A','B','C'],'V251 ne réordonne pas une journée figée');
    assert.equal(out.changed,false);
    assert.match(read('planning-route-optimizer-v251.js'),/optimizePlan\(original,key,appState,\{frozenDays:snap&&snap\.frozenDays\}\)/,'la finalisation du cycle transmet les journées figées');
    assert.match(read('terrain-planning-v1.js'),/bundle\.archive\[week\.weekKey\]\.frozenDays=/,'le cycle enregistre les journées figées dans l’archive');
  });

  await scenario('La régénération d’une journée (↻ du noyau) consulte aussi la garde anti-sur-visite',async()=>{
    const core=read('src/chef-secteur.html'),line=core.split('\n').find(l=>l.startsWith('async function regenerateDay('));
    assert.ok(line&&/storeRunnerCoverageBlockedOnDay\(s,day\)/.test(line),'regenerateDay doit écarter un magasin visité trop récemment');
    const C=require(path.join(ROOT,COVERAGE_FILE));
    const prev={state:global.state,Date:global.Date};
    try{
      global.Date=clockAt(FRIDAY);
      global.state=makeState({weekDate:'2026-09-28',stores:[store('A',1),store('B',2)],visits:history({A:['2026-09-03','2026-09-12','2026-09-21'],B:['2026-08-11']})});
      assert.equal(C.blockedOnPlanningDay(global.state.stores[0],'Mardi'),true,'A trop récemment visité');
      assert.equal(C.blockedOnPlanningDay(global.state.stores[1],'Mardi'),false,'B en retard reste proposable');
    }finally{global.state=prev.state;global.Date=prev.Date}
  });

  await scenario('Le statut de génération dit ce qui reste non couvert',async()=>{
    const T=require(path.join(ROOT,'terrain-planning-v1.js'));
    const text=T.coverageSummaryText({needAware:true,recentlyVisited:['A'],uncoveredLate:['L1','L2','L3','L4'],uncoveredNever:[]},' · ');
    assert.match(text,/1 magasin visité trop récemment écarté/);
    assert.match(text,/4 magasins en retard restent hors de ces 3 semaines faute de capacité \(L1, L2, L3…\)/);
    assert.equal(T.coverageSummaryText(undefined,' · '),'','sans données de visite, aucun ajout au statut');
    assert.match(read('planning-generation-controller.js'),/coverageSummaryText/,'le bouton principal relaie ce bilan');
  });

  await scenario('Sauvegarde / restauration : journées figées et bilan de couverture font l’aller-retour, sans toucher aux visites',async()=>{
    const R=require(path.join(ROOT,'reliability-core.js'));
    class DB{constructor(){this.map=new Map()}getItem(k){return this.map.has(k)?this.map.get(k):null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}
    const prev={state:global.state,localStorage:global.localStorage};
    try{
      const st=makeState({stores:[store('x',1),store('y',2)],visits:history({x:['2026-09-01','2026-09-21'],y:['2026-09-02']})});
      st.schemaVersion=5;st.notes={};delete st.businessV2;
      const db=new DB();global.state=copy(st);global.localStorage=db;
      db.setItem(R.keys.MAIN,JSON.stringify(st));
      db.setItem(R.keys.ARCHIVE,JSON.stringify({'2026-09-28':{weekMonday:'2026-09-28',plan:{Lundi:[{id:'x'}],Mardi:[{id:'y'}]},frozenDays:['Lundi','Mardi'],manualEdited:false}}));
      db.setItem(R.keys.RANGE,JSON.stringify({start:'2026-09-28',end:'2026-10-16',weeks:3,coverage:{needAware:true,recentlyVisited:['Fnac x'],uncoveredLate:[],uncoveredNever:['Fnac y']}}));
      const bundle=R.capture(st,db),clean=new DB();
      R.persist(R.decode(JSON.stringify(bundle),{}),clean);
      const archive=JSON.parse(clean.getItem(R.keys.ARCHIVE)),range=JSON.parse(clean.getItem(R.keys.RANGE)),restored=R.load(clean);
      assert.deepEqual(archive['2026-09-28'].frozenDays,['Lundi','Mardi']);
      assert.deepEqual(range.coverage.uncoveredNever,['Fnac y']);
      assert.deepEqual(restored.visits,st.visits,'historique legacy intact');
      const C=require(path.join(ROOT,COVERAGE_FILE));
      assert.deepEqual(C.visitDays(restored).get('x'),['2026-09-01','2026-09-21'],'la couverture relit les mêmes visites après restauration');
    }finally{global.state=prev.state;global.localStorage=prev.localStorage}
  });

  await scenario('Sans aucune visite enregistrée, le cycle 3 semaines reste exactement radial',async()=>{
    const stores=Array.from({length:20},(_,i)=>store('s'+(i+1),i+1));
    const r=await runThreeWeeks({today:FRIDAY,target:5,stores});
    assert.deepEqual(Array.from(r.weeks).flatMap(w=>weekIds(w.plan)),Array.from({length:15},(_,i)=>'s'+(i+1)));
  });

  const failed=results.filter(r=>!r.ok);
  for(const r of results)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.ok?'':'\n    → '+r.error));
  if(failed.length){console.error('\nvisit-coverage-v263 : '+failed.length+' scénario(s) en échec sur '+results.length);process.exit(1)}
  console.log('visit-coverage-v263: OK · '+results.length+' scénarios');
})();
