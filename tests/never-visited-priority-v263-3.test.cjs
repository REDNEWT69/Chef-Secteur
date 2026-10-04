// V263.3 — priorité des magasins jamais visités.
//
// Ordre métier décidé : très en retard (ratio ≥ 1,5) › jamais visité › en retard ›
// bientôt dû › à jour. `visit-coverage.js` reste la seule source du besoin ; P1 départage
// à l'intérieur d'un palier sans jamais en changer ; un magasin visité trop récemment
// (`blocked`) n'est jamais reproposé automatiquement.
//
// Les scénarios rejouent les VRAIS moteurs : cycle 3 semaines (terrain-planning-v1.js),
// semaine/période V211 (range-planner-v2.js) et recalcul (planning-cascade-v181.js).
// Les distances sont volontairement l'inverse de l'ordre de besoin : si la géographie
// départageait encore « jamais visité » et « en retard », les tests échoueraient.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const WORK=DAYS.slice(0,5);
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const copy=x=>JSON.parse(JSON.stringify(x));
const emptyPlan=()=>Object.fromEntries(DAYS.map(d=>[d,[]]));
const coverageSource=read('visit-coverage.js');

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
const sorted=a=>Array.from(a).slice().sort();

/* Fichier performance simulé : même API publique que StoreRunnerPerformanceV190, lue par
   la couverture (palier P1), par le cycle (boost de rang) et par V211 (tier/score P1). */
function performanceApi(perf){
  const rows=Object.entries(perf||{}).map(([storeId,prio])=>({storeId,prio}));
  return{
    latestSnapshot:()=>rows.length?{week:'2026-W39',rows}:null,
    matchRows:r=>({rows:r}),
    readStore:()=>({mapping:{}}),
    isTreated:()=>false,
    rowForStore:(_db,id)=>perf&&perf[id]?{prio:perf[id]}:null,
    planningBoost:(_db,id)=>perf&&perf[id]==='P1'?60:perf&&perf[id]==='P2'?25:0
  };
}
function baseContext(nowIso,state,db,perf){
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
  if(perf)ctx.StoreRunnerPerformanceV190=performanceApi(perf);
  ctx.window=ctx;
  vm.runInNewContext(coverageSource,ctx,{filename:'visit-coverage.js'});
  return ctx;
}
function makeState(o){
  return{
    profile:{baseLat:45,baseLon:4,overnightMode:'never'},
    settings:{days:WORK.slice(),target:o.target||6,maxVisitsPerDay:o.max||4,weekDate:o.weekDate||'2026-09-28',startTime:'08:30',endTime:'18:00',visitMinutes:45,strategy:'balanced'},
    stores:o.stores,visits:o.visits||{},businessV2:{visits:[],actions:[],storeSnapshots:{}},
    plan:o.plan||emptyPlan(),included:{},excluded:{},locks:o.locks||{},appointments:[],calendarEvents:[],manualWeekEdits:{}
  };
}
async function runThreeWeeks(o){
  const state=makeState(o),db=storage(o.archive?{[ARCHIVE_KEY]:JSON.stringify(o.archive)}:{});
  const ctx=baseContext(o.today,state,db,o.perf);
  ctx.ChefReliability={
    checkpoint(){},
    capture:(st,s)=>({state:copy(st),archive:JSON.parse(s.getItem(ARCHIVE_KEY)||'{}'),range:null}),
    persist:(bundle,s)=>{s.setItem(ARCHIVE_KEY,JSON.stringify(bundle.archive||{}))}
  };
  vm.runInNewContext(read('terrain-planning-v1.js'),ctx,{filename:'terrain-planning-v1.js'});
  const built=await ctx.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail({start:o.start||'2026-09-28'});
  return{built,ctx,state,weeks:Array.from(built.weeks)};
}
function terrainEnv(o){
  const state=makeState(o),db=storage({});
  const ctx=baseContext(o.today,state,db,o.perf);
  vm.runInNewContext(read('terrain-planning-v1.js'),ctx,{filename:'terrain-planning-v1.js'});
  return{ctx,state};
}
function cascadeEnv(o){
  const state=makeState(o),db=storage(o.archive?{[ARCHIVE_KEY]:JSON.stringify(o.archive)}:{});
  const ctx=baseContext(o.today,state,db,o.perf);
  ctx.document={readyState:'complete',addEventListener(){},dispatchEvent(){},getElementById:id=>id==='weekDate'?{value:state.settings.weekDate}:null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{},addEventListener(){},insertAdjacentElement(){}})};
  ctx.confirm=()=>true;ctx.save=()=>{};ctx.renderAll=()=>{};
  ctx.ChefReliability={checkpoint(){},propose:async candidate=>{state.plan=copy(candidate.plan);return true}};
  vm.runInNewContext(read('planning-cascade-v181.js'),ctx,{filename:'planning-cascade-v181.js'});
  const build=()=>{ctx.__storeRunnerPlanningGenerationActive=true;try{return ctx.__storeRunnerBuildRemainingWeekPlan()}finally{ctx.__storeRunnerPlanningGenerationActive=false}};
  return{ctx,state,build};
}
function rangeEnv(o){
  const state=makeState(o),db=storage({});
  const ctx=baseContext(o.today,state,db,o.perf);
  ctx.document={readyState:'loading',addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null,querySelector:()=>null};
  Object.assign(ctx,{confirm:()=>true,includedByFilters:()=>true,nearestRoute:r=>r.slice().sort((a,b)=>a.distance-b.distance),twoOpt:r=>r.slice(),storeVisitCredit:()=>1,readPlanningControls(){},save(){},renderAll(){},ChefReliability:{checkpoint(){},propose:async()=>false},syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]});
  const source=read('range-planner-v2.js').replace('window.generatePlanningRange=generateRange;','window.testV2633={chooseStores,rotationMemoryV211,planningNeedV211,compareNeedV211};window.generatePlanningRange=generateRange;');
  vm.runInNewContext(source,ctx,{filename:'range-planner-v2.js'});
  const choose=(pool,target)=>{const t=ctx.testV2633,m=t.rotationMemoryV211(pool,'2026-09-28',target,{});return ids(t.chooseStores(pool,m.usedKeys,m.useCount,m.lastUsedWeek,target,target*4,'2026-09-28',0))};
  return{ctx,state,choose};
}

/* Aujourd'hui : vendredi 25 septembre 2026 ; le cycle démarre lundi 28 (référence du besoin).
   Fréquence 30 j partout. Au lundi 28 :
   VL très en retard (58 j, ratio 1,93) · N jamais visité · L en retard (34 j, ratio 1,13)
   · S bientôt dû (25 j, ratio 0,83) · O à jour (18 j, ratio 0,6) · B visité il y a 6 j (garde). */
const FRIDAY='2026-09-25',MONDAY='2026-09-28';
const VISITS={VL:['2026-08-01'],L:['2026-08-25'],S:['2026-09-03'],O:['2026-09-10'],B:['2026-09-22']};
/* Distances inversées : le plus proche est le moins prioritaire. */
function sector(){return[store('B',0.5),store('S',1),store('L',2),store('N',3),store('VL',4),store('O',5)]}
const ORDER=['VL','N','L','S','O'];

const results=[];
async function scenario(name,fn){
  try{await fn();results.push({name,ok:true})}
  catch(e){results.push({name,ok:false,error:e&&e.message?e.message:String(e)})}
}

(async()=>{
  /* ----------------------------------------------------- source commune (A B C) ---- */
  await scenario('Couverture — A très en retard › jamais visité, B jamais visité › retard normal, C retard › bientôt dû › à jour',async()=>{
    const state=makeState({stores:sector(),visits:history(VISITS)}),ctx=baseContext(FRIDAY,state,storage({}));
    const C=ctx.StoreRunnerVisitCoverage,need=C.needOf(state),row=id=>need(state.stores.find(s=>s.id===id),MONDAY);
    assert.deepEqual(ORDER.map(id=>row(id).status),['late','never','late','soon','ok']);
    assert.ok(row('VL').ratio>=1.5&&row('L').ratio<1.5,'VL très en retard, L retard normal');
    const tiers=ORDER.map(id=>row(id).tier);
    for(let i=1;i<tiers.length;i++)assert.ok(tiers[i-1]>tiers[i],'paliers strictement décroissants : '+ORDER.join(' › ')+' = '+tiers.join(' › '));
    assert.equal(row('B').blocked,true);assert.equal(row('B').tier,0);
    const catchUp=C.compute(state,{today:MONDAY}).catchUp.map(r=>r.id);
    assert.deepEqual(catchUp,['VL','N','L','S'],'À rattraper dans l’ordre métier : '+catchUp.join(','));
  });

  await scenario('Couverture — D P1 départage dans son palier sans en changer ; la garde ne cède qu’à un P1 sous 2 visites',async()=>{
    const stores=sector().concat([store('NP1',9),store('LP1',9),store('SP1',9),store('VLP1',9),store('BP1',9),store('B2P1',9)]);
    const visits=history(Object.assign({},VISITS,{LP1:VISITS.L,SP1:VISITS.S,VLP1:VISITS.VL,BP1:VISITS.B,B2P1:['2026-09-15','2026-09-22']}));
    const perf={NP1:'P1',LP1:'P1',SP1:'P1',VLP1:'P1',BP1:'P1',B2P1:'P1'};
    const state=makeState({stores,visits}),ctx=baseContext(FRIDAY,state,storage({}),perf);
    const need=ctx.StoreRunnerVisitCoverage.needOf(state),t=id=>need(state.stores.find(s=>s.id===id),MONDAY);
    assert.equal(t('NP1').priority,'P1','le P1 est bien lu par la couverture');
    const chain=['VL','NP1','N','LP1','L','SP1','S','O'];
    for(let i=1;i<chain.length;i++)assert.ok(t(chain[i-1]).tier>t(chain[i]).tier,chain[i-1]+' ('+t(chain[i-1]).tier+') doit rester devant '+chain[i]+' ('+t(chain[i]).tier+')');
    assert.equal(t('VLP1').tier,t('VL').tier,'très en retard P1 reste au palier le plus urgent');
    assert.equal(t('BP1').blocked,false,'P1 à une seule visite : la garde cède pour le 2e passage (SEF, revue #496)');assert.equal(t('BP1').secondVisit,true);
    assert.equal(t('B2P1').blocked,true,'P1 déjà passé 2 fois : la garde reprend');assert.equal(t('B2P1').tier,0);
    assert.equal(t('B').blocked,true,'un magasin non P1 reste gardé');
  });

  /* ------------------------------------------------------- F : cycle 3 semaines ---- */
  await scenario('F — cycle 3 semaines : très en retard puis jamais visité avant le retard normal plus proche',async()=>{
    const r=await runThreeWeeks({today:FRIDAY,target:2,stores:sector(),visits:history(VISITS)});
    assert.deepEqual(sorted(weekIds(r.weeks[0].plan)),['N','VL'],'semaine 1 à 2 places : '+weekIds(r.weeks[0].plan).join(','));
    const r4=await runThreeWeeks({today:FRIDAY,target:4,stores:sector(),visits:history(VISITS)});
    assert.deepEqual(sorted(weekIds(r4.weeks[0].plan)),['L','N','S','VL'],'semaine 1 à 4 places : le magasin à jour reste dehors : '+weekIds(r4.weeks[0].plan).join(','));
  });

  await scenario('F/D — cycle 3 semaines avec P1 : P1 jamais visité et P1 en retard gardent leur palier',async()=>{
    const stores=[store('LP1',1),store('N',2),store('VL',3),store('L',4)];
    const r=await runThreeWeeks({today:FRIDAY,target:2,stores,visits:history({LP1:VISITS.L,L:VISITS.L,VL:VISITS.VL}),perf:{LP1:'P1'}});
    assert.deepEqual(sorted(weekIds(r.weeks[0].plan)),['N','VL'],'LP1 en retard, même P1 et plus proche, reste derrière un jamais visité : '+weekIds(r.weeks[0].plan).join(','));
  });

  await scenario('F/E — tous jamais visités : ordre historique du cycle inchangé (distance, P1 d’abord)',async()=>{
    const stores=Array.from({length:12},(_,i)=>store('s'+(i+1),i+1));
    const r=await runThreeWeeks({today:FRIDAY,target:3,stores});
    assert.deepEqual(r.weeks.flatMap(w=>weekIds(w.plan)),['s1','s2','s3','s4','s5','s6','s7','s8','s9'],'radial comme avant');
    const p=await runThreeWeeks({today:FRIDAY,target:3,stores,perf:{s8:'P1'}});
    assert.deepEqual(p.weeks.flatMap(w=>weekIds(w.plan)),['s8','s1','s2','s3','s4','s5','s6','s7','s9'],'P1 d’abord, puis radial comme avant');
    // Moteur nu : avec ou sans le besoin de visite, un secteur sans historique donne le même cycle.
    const t=terrainEnv({today:FRIDAY,stores}),T=t.ctx.StoreRunnerTerrainPlanningV1,need=t.ctx.StoreRunnerVisitCoverage.needOf(t.state);
    const opts=extra=>Object.assign({state:t.state,firstMonday:new t.ctx.Date(MONDAY+'T12:00:00'),days:WORK,target:4,maxCreditsPerDay:4,archive:{},stores,distanceOf:s=>s.distance,priorityOf:s=>s.id==='s5'?60:0},extra);
    const withNeed=T.buildThreeWeekSnail(opts({needOf:need,today:FRIDAY})),without=T.buildThreeWeekSnail(opts({}));
    assert.deepEqual(Array.from(withNeed.weeks).map(w=>weekIds(w.plan)),Array.from(without.weeks).map(w=>weekIds(w.plan)),'besoin sans effet quand tout est jamais visité');
  });

  /* ------------------------------------------------------ G : semaine / période ---- */
  await scenario('G — semaine/période V211 : très en retard › jamais visité › retard › bientôt dû › à jour',async()=>{
    const t=rangeEnv({today:FRIDAY,stores:sector(),visits:history(VISITS)});
    const pool=t.state.stores.filter(s=>s.id!=='B');
    assert.deepEqual(t.choose(pool,5),ORDER,'ordre de choix V211');
    assert.deepEqual(t.choose(pool,1),['VL'],'une seule place : le très en retard');
    assert.deepEqual(t.choose(pool,2),['VL','N'],'deux places : puis le jamais visité');
    const n=t.ctx.testV2633.planningNeedV211(t.state.stores.find(s=>s.id==='N'),'2026-09-28');
    assert.ok(n.reasons.includes('jamais visité')&&!n.reasons.includes('très en retard'),'un jamais visité n’est plus annoncé « très en retard » : '+n.reasons.join(','));
  });

  await scenario('G/D — V211 avec P1 : P1 jamais visité reste sous le très en retard, P1 en retard sous le jamais visité',async()=>{
    const stores=[store('LP1',1),store('NP1',2),store('N',3),store('VL',4),store('L',5)];
    const t=rangeEnv({today:FRIDAY,stores,visits:history({LP1:VISITS.L,L:VISITS.L,VL:VISITS.VL}),perf:{LP1:'P1',NP1:'P1'}});
    assert.deepEqual(t.choose(t.state.stores,5),['VL','NP1','N','LP1','L']);
  });

  await scenario('G/D — V211 : P1 ne départage qu’à statut identique (late › P1 soon, soon › P1 ok, P1 › non-P1)',async()=>{
    const V={VL:VISITS.VL,L:VISITS.L,LP1:VISITS.L,S:VISITS.S,SP1:VISITS.S,O:VISITS.O,OP1:VISITS.O};
    // Distances inversées : le P1 et le moins urgent sont toujours les plus proches.
    const stores=[store('OP1',1),store('O',2),store('SP1',3),store('S',4),store('LP1',5),store('L',6),store('NP1',7),store('N',8),store('VL',9)];
    const perf={OP1:'P1',SP1:'P1',LP1:'P1',NP1:'P1'};
    const t=rangeEnv({today:FRIDAY,stores,visits:history(V),perf}),by=id=>t.state.stores.filter(s=>s.id===id).concat();
    const pick=list=>t.choose(list.flatMap(by),list.length);
    assert.deepEqual(pick(['SP1','L']),['L','SP1'],'1. retard normal › P1 bientôt dû');
    assert.deepEqual(pick(['OP1','S']),['S','OP1'],'2. bientôt dû › P1 à jour');
    for(const [p1,plain] of [['NP1','N'],['LP1','L'],['SP1','S'],['OP1','O']])
      assert.deepEqual(pick([plain,p1]),[p1,plain],'3. à statut identique, P1 › non-P1 ('+p1+')');
    const n=t.ctx.testV2633.planningNeedV211(t.state.stores.find(s=>s.id==='SP1'),'2026-09-28');
    assert.ok(n.reasons.includes('P1')&&n.performancePriority==='P1','la raison « P1 » est conservée');
    assert.ok(n.score>t.ctx.testV2633.planningNeedV211(t.state.stores.find(s=>s.id==='S'),'2026-09-28').score,'le bonus de score P1 est conservé');
    assert.deepEqual(t.choose(t.state.stores,9),['VL','NP1','N','LP1','L','SP1','S','OP1','O'],'4. chaîne complète V211');
  });

  await scenario('D — chaîne complète identique dans la couverture et le recalcul',async()=>{
    const V={VL:VISITS.VL,L:VISITS.L,LP1:VISITS.L,S:VISITS.S,SP1:VISITS.S,O:VISITS.O,OP1:VISITS.O};
    const chain=['VL','NP1','N','LP1','L','SP1','S','OP1','O'];
    const stores=chain.map((id,i)=>store(id,9-i)),perf={OP1:'P1',SP1:'P1',LP1:'P1',NP1:'P1'};
    const state=makeState({stores,visits:history(V)}),ctx=baseContext(FRIDAY,state,storage({}),perf);
    const need=ctx.StoreRunnerVisitCoverage.needOf(state),t=id=>need(state.stores.find(s=>s.id===id),MONDAY).tier;
    for(let i=1;i<chain.length;i++)assert.ok(t(chain[i-1])>t(chain[i]),'couverture : '+chain[i-1]+' ('+t(chain[i-1])+') › '+chain[i]+' ('+t(chain[i])+')');
    const s=Object.fromEntries(stores.concat([store('R1',20),store('R2',21),store('R3',22)]).map(x=>[x.id,x]));
    const plan=emptyPlan();plan.Mercredi=[s.R1,s.R2];plan.Jeudi=[s.R3];
    const c=cascadeEnv({today:MONDAY,weekDate:'2026-09-28',stores:Object.values(s),visits:history(Object.assign({},V,{R1:['2026-09-26'],R2:['2026-09-26'],R3:['2026-09-27']})),plan,archive:{'2026-09-28':{weekMonday:'2026-09-28',plan:copy(plan)}},perf});
    const r=c.build();
    assert.equal(r.ok,true,r.error);
    assert.deepEqual(Array.from(r.added||[],x=>x.id),['VL','NP1','N'],'recalcul, 3 créneaux : dans l’ordre de la chaîne');
  });

  await scenario('G/E — V211 tous jamais visités : ordre historique inchangé (score seul)',async()=>{
    const stores=Array.from({length:8},(_,i)=>store('s'+(i+1),i+1,{priority:1+(i*3)%5}));
    const t=rangeEnv({today:FRIDAY,stores,perf:{s6:'P1',s2:'P2'}});
    const byScore=stores.map(s=>({id:s.id,n:t.ctx.testV2633.planningNeedV211(s,'2026-09-28')})).sort((a,b)=>b.n.score-a.n.score||a.id.localeCompare(b.id)).map(x=>x.id);
    assert.deepEqual(t.choose(t.state.stores,8),byScore,'même palier pour tous, le score V211 décide comme avant');
  });

  /* -------------------------------------------------------------- H : recalcul ---- */
  await scenario('H — recalcul : les créneaux libérés vont au très en retard puis au jamais visité',async()=>{
    const s=Object.fromEntries(sector().concat([store('R1',6),store('R2',7),store('K',8)]).map(x=>[x.id,x]));
    const plan=emptyPlan();plan.Mercredi=[s.R1,s.K];plan.Jeudi=[s.R2];
    const visits=history(Object.assign({},VISITS,{R1:['2026-09-26'],R2:['2026-09-27'],K:['2026-08-20']}));
    const archive={'2026-09-28':{weekMonday:'2026-09-28',plan:copy(plan)}};
    const t=cascadeEnv({today:MONDAY,weekDate:'2026-09-28',stores:Object.values(s),visits,plan,archive});
    const r=t.build();
    assert.equal(r.ok,true,r.error);
    assert.deepEqual(sorted((r.removed||[]).map(x=>x.id)),['R1','R2'],'R1 et R2 visités ce week-end sont retirés');
    assert.deepEqual(Array.from(r.added||[],x=>x.id),['VL','N'],'2 créneaux : très en retard puis jamais visité, avant L plus proche');
    assert.ok(!weekIds(r.plan).includes('B'),'B (garde) jamais ajouté');
  });

  await scenario('H/D — recalcul avec P1 : P1 en retard ne passe pas devant un jamais visité',async()=>{
    const s=Object.fromEntries([store('R1',6),store('LP1',1),store('N',3),store('L',2)].map(x=>[x.id,x]));
    const plan=emptyPlan();plan.Mercredi=[s.R1];
    const visits=history({R1:['2026-09-26'],LP1:VISITS.L,L:VISITS.L});
    const t=cascadeEnv({today:MONDAY,weekDate:'2026-09-28',stores:Object.values(s),visits,plan,archive:{'2026-09-28':{weekMonday:'2026-09-28',plan:copy(plan)}},perf:{LP1:'P1'}});
    const r=t.build();
    assert.equal(r.ok,true,r.error);
    assert.deepEqual(Array.from(r.added||[],x=>x.id),['N']);
  });

  /* ------------------------------------------------------ I : garde anti-sur-visite ---- */
  await scenario('I — aucun magasin bloqué reproposé automatiquement par aucun moteur ; un P1 passé 2 fois reste gardé',async()=>{
    const stores=sector().concat([store('BP1',0.2)]),visits=history(Object.assign({},VISITS,{BP1:['2026-09-15','2026-09-22']})),perf={BP1:'P1'};
    const r=await runThreeWeeks({today:FRIDAY,target:6,stores,visits,perf});
    const first=weekIds(r.weeks[0].plan);
    for(const id of ['B','BP1'])assert.ok(!first.includes(id),id+' visité il y a 6 j reproposé en semaine 1 : '+first.join(','));
    const v=rangeEnv({today:FRIDAY,stores,visits,perf}).choose(stores,7);
    for(const id of ['B','BP1'])assert.ok(!v.includes(id),id+' choisi par V211 : '+v.join(','));
  });

  const failed=results.filter(r=>!r.ok);
  for(const r of results)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.ok?'':'\n    → '+r.error));
  if(failed.length){console.error('\nnever-visited-priority-v263-3 : '+failed.length+' scénario(s) en échec sur '+results.length);process.exit(1)}
  console.log('never-visited-priority-v263-3: OK · '+results.length+' scénarios');
})();
