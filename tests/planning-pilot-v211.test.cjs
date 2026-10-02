const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const source=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;',
    'window.testPilotV211={planningNeedV211,compareNeedV211,rotationWindowWeeksV211,rotationMemoryV211,repeatReadinessV211,chooseStores,storeKey,strictSingleWeek};window.generatePlanningRange=generateRange;');

const reliabilityUi=fs.readFileSync(__dirname+'/../reliability-ui.js','utf8');
assert(source.includes('archive:nextArchive'),'une semaine générée doit enregistrer son snapshot de rotation avec le planning');
assert(reliabilityUi.includes('candidate.archive&&candidate.range')&&reliabilityUi.includes('else if(candidate.archive)'),'Reliability doit accepter une archive single-week sans faux range');
function store(id,opts={}){
  return Object.assign({id,enseigne:'Fnac',ville:'Ville '+id,adresse:'Adresse '+id,lat:45,lon:4,priority:3,intervalDays:30,active:true},opts);
}
function archiveWeek(ids,stores,weekMonday){
  const by=new Map(stores.map(s=>[s.id,s])),plan=Object.fromEntries(DAYS.map(d=>[d,[]]));
  plan.Lundi=ids.map(id=>Object.assign({},by.get(id)));
  return {weekMonday,plan};
}
function makeEnv(stores,archive={},perf={}){
  const visits={};
  for(const s of stores)if(s.lastVisit)visits[s.id]={lastVisit:s.lastVisit,history:[s.lastVisit]};
  const state={
    settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:20,weekDate:'2026-09-14',startTime:'08:30',endTime:'18:00',visitMinutes:60,maxVisitsPerDay:4,strategy:'balanced'},
    profile:{baseLat:45,baseLon:4},stores,visits,plan:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]
  };
  const db={getItem:key=>key==='chef_sector_plan_archive_v1'?JSON.stringify(archive):null,setItem(){},removeItem(){}};
  const api={
    planningBoost(_db,id){const p=perf[id];return p==='P1'?60:p==='P2'?25:0},
    latestSnapshot(){return {week:'2026-W37'}},
    rowForStore(_db,id){return perf[id]?{prio:perf[id]}:null},
    isTreated(){return false},
    completedVisitsFor(_state,id){const v=visits[id];return v&&v.lastVisit?{lastVisit:v.lastVisit,count:1}:null}
  };
  const ctx={
    state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,
    localStorage:db,__chefStorage:db,StoreRunnerPerformanceV190:api,
    document:{readyState:'loading',addEventListener(){},querySelectorAll(){return[]},getElementById(){return null},querySelector(){return null}},
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,confirm:()=>true,
    havBase:()=>10,hav:()=>10,baseObj:()=>({lat:45,lon:4}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    includedByFilters:()=>true,storeVisitCredit:()=>1,readPlanningControls(){},save(){},renderAll(){},
    ChefReliability:{checkpoint(){},propose:async()=>false},syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]
  };
  ctx.window=ctx;
  vm.runInNewContext(source,ctx);
  return {ctx,state};
}

{
  const s=store('future',{lastVisit:'2026-09-01',intervalDays:30,priority:3});
  const {ctx}=makeEnv([s]);
  const early=ctx.testPilotV211.planningNeedV211(s,'2026-09-07');
  const late=ctx.testPilotV211.planningNeedV211(s,'2026-10-12');
  assert(late.score>early.score,'le besoin doit augmenter quand la semaine planifiée avance');
  assert(late.overdueDays>0,'la semaine future doit constater le retard réel à cette date');
  assert(late.tier>=4,'un magasin en retard doit remonter dans les niveaux de pilotage');
}

{
  const p1=store('p1',{lastVisit:'2026-08-20'}),normal=store('normal',{lastVisit:'2026-08-20'});
  const {ctx}=makeEnv([p1,normal],{}, {p1:'P1'});
  const np1=ctx.testPilotV211.planningNeedV211(p1,'2026-09-21');
  const nn=ctx.testPilotV211.planningNeedV211(normal,'2026-09-21');
  assert.equal(np1.performancePriority,'P1');
  assert(np1.reasons.includes('P1'));
  assert(ctx.testPilotV211.compareNeedV211(p1,normal,'2026-09-21')<0,'à retard comparable, le P1 doit passer devant');
  assert(np1.score>nn.score);
}

{
  const stores=Array.from({length:56},(_,i)=>store('s'+(i+1),{lastVisit:'2026-08-25'}));
  const archive={
    '2026-08-31':archiveWeek(stores.slice(0,20).map(s=>s.id),stores,'2026-08-31'),
    '2026-09-07':archiveWeek(stores.slice(20,40).map(s=>s.id),stores,'2026-09-07')
  };
  const {ctx}=makeEnv(stores,archive);
  assert.equal(ctx.testPilotV211.rotationWindowWeeksV211(stores,20),3,'56 magasins / 20 par semaine doivent produire une fenêtre de rotation de 3 semaines');
  const memory=ctx.testPilotV211.rotationMemoryV211(stores,'2026-09-14',20);
  assert.equal(memory.usedKeys.size,40,'la mémoire doit retrouver les 40 magasins des deux semaines précédentes');
  const chosen=ctx.testPilotV211.chooseStores(stores,memory.usedKeys,memory.useCount,memory.lastUsedWeek,20,20,'2026-09-14',0);
  const ids=new Set(chosen.map(s=>s.id));
  for(let i=41;i<=56;i++)assert(ids.has('s'+i),'le magasin frais s'+i+' doit passer avant une répétition de confort');
  assert.equal([...ids].filter(id=>Number(id.slice(1))<=40).length,4,'seuls les quatre créneaux restants peuvent recycler des magasins');
}

{
  const stores=Array.from({length:10},(_,i)=>store('w'+(i+1),{intervalDays:7,lastVisit:'2026-09-01'}));
  const archive={'2026-09-07':archiveWeek(stores.slice(0,4).map(s=>s.id),stores,'2026-09-07')};
  const {ctx}=makeEnv(stores,archive,{w1:'P1'});
  const memory=ctx.testPilotV211.rotationMemoryV211(stores,'2026-09-14',4);
  const chosen=ctx.testPilotV211.chooseStores(stores,memory.usedKeys,memory.useCount,memory.lastUsedWeek,4,4,'2026-09-14',0);
  const repeated=chosen.filter(s=>['w1','w2','w3','w4'].includes(s.id));
  const fresh=chosen.filter(s=>!['w1','w2','w3','w4'].includes(s.id));
  assert.equal(repeated.length,1,'la réserve cadence doit être plafonnée à 30 % pour une cible de 4');
  assert.equal(fresh.length,3,'la majorité de la semaine doit rester disponible à la couverture du secteur');
  assert.equal(repeated[0].id,'w1','parmi les cadences dues, le P1 doit passer devant');
}

/* Brief hebdomadaire V246 dans le besoin V211 : vrais modules performance V190 et brief V246
   dans le même window que le planificateur, horloge figée au jeudi de la W37 pour que W38 → W41
   restent à venir quel que soit le jour d'exécution. Seule la contribution `brief` d'une règle
   confirmée, sans attente et valable sur la semaine calculée doit peser. */
const perfSource=fs.readFileSync(__dirname+'/../performance-data-v190.js','utf8');
const briefSource=fs.readFileSync(__dirname+'/../weekly-brief-v246.js','utf8');
const NOW=new Date('2026-09-10T08:00:00');
class FixedDate extends Date{constructor(...a){super(...(a.length?a:[NOW.getTime()]))}static now(){return NOW.getTime()}}
/* Par défaut : lundi seul, 1 visite, objectif 1, semaine W39, période W38 → W39. */
function makeBriefEnv(stores,perf={},o={}){
  const mem=new Map(),db={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
  if(o.archive)mem.set('chef_sector_plan_archive_v1',JSON.stringify(o.archive));
  const workDays=o.days||['Lundi'],range=o.range||['2026-09-14','2026-09-27'];
  const visits={},proposals=[],els={rangeStart:{value:range[0]},rangeEnd:{value:range[1]},rangePlanStatus:{style:{},textContent:''}};
  for(const s of stores)if(s.lastVisit)visits[s.id]={lastVisit:s.lastVisit,history:[s.lastVisit]};
  const state=Object.assign({
    settings:{days:workDays.slice(),target:o.target||1,weekDate:o.weekDate||'2026-09-21',startTime:'08:30',endTime:'18:00',visitMinutes:60,maxVisitsPerDay:o.max||1,strategy:'balanced'},
    profile:{baseLat:45,baseLon:4},stores,visits,plan:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]
  },o.state);
  const ctx=vm.createContext({
    state,console,Date:FixedDate,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,localStorage:db,__chefStorage:db,
    document:{readyState:'loading',addEventListener(){},querySelectorAll:q=>q==='[data-day]'?workDays.map(value=>({value,checked:true})):[],getElementById:id=>els[id]||null,querySelector(){return null}},
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,confirm:()=>true,
    havBase:()=>10,hav:()=>10,baseObj:()=>({lat:45,lon:4}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    includedByFilters:()=>true,storeVisitCredit:()=>1,readPlanningControls(){},save(){},renderAll(){},
    ChefReliability:{checkpoint(){},propose:async c=>{proposals.push(c);return false}},syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]
  });
  ctx.window=ctx;
  for(const code of [perfSource,briefSource,source])vm.runInContext(code,ctx);
  const P=ctx.StoreRunnerPerformanceV190,B=ctx.StoreRunnerWeeklyBriefV246;
  if(Object.keys(perf).length)P.saveSnapshot(db,{week:'W37',importedAt:'2026-09-08T08:00:00Z',rows:Object.entries(perf).map(([id,prio])=>({key:'perf|'+id,retailer:'Fnac',site:'Ville '+id,prio}))});
  /* Compte les évaluations V246 demandées par le planificateur, sans en changer le résultat. */
  const calls={lot:0,one:0},lot=B.effectivePriorities,one=B.effectivePriority;
  B.effectivePriorities=(...a)=>{calls.lot++;return lot(...a)};B.effectivePriority=(...a)=>{calls.one++;return one(...a)};
  return {ctx,state,db,P,B,proposals,els,calls};
}
const gap=(a,b)=>Math.round((a.score-b.score)*10)/10;
/* Échéances (P1.2) : règle deadline confirmée par défaut, lecture des semaines proposées. */
const dline=(g,week,ids,dueDate,extra)=>g.B.addRule(g.state,week,Object.assign({type:'deadline',label:'Échéance '+[].concat(ids).join('+'),dueDate,scope:{storeIds:[].concat(ids)},confidence:'confirmed'},extra||{}));
const dayOf=(plan,id)=>DAYS.find(d=>Array.from((plan||{})[d]||[]).some(s=>s.id===id))||'';
const flat=plan=>plan?DAYS.flatMap(d=>Array.from(plan[d]||[],s=>s.id)).join(','):'(aucune proposition)';
const weeksOf=p=>p?['2026-09-14','2026-09-21'].map(k=>flat(p.archive[k].plan)).join(' | '):'(aucune proposition)';
const frozen=g=>JSON.stringify([g.state.plan,g.state.stores,g.state.weeklyBriefs,g.db.getItem('chef_sector_plan_archive_v1'),g.db.getItem(g.P.STORE_KEY)]);
const onDay=(day,...ids)=>Object.assign(Object.fromEntries(DAYS.map(d=>[d,[]])),{[day]:ids.map(id=>({id,enseigne:'Fnac',ville:'Ville '+id,adresse:'Adresse '+id}))});
const appt=(storeId,date)=>({id:'rdv-'+storeId,storeId,date,time:'10:00',duration:60,type:'visite',note:''});
const FIVE=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

{
  // Règle confirmée et active : seul l'apport brief s'ajoute au score, rien n'est écrit.
  const p1=store('p1',{priority:5,lastVisit:'2026-08-20'}),voisin=store('voisin',{priority:5,lastVisit:'2026-08-20'});
  const {ctx,state,db,P,B}=makeBriefEnv([p1,voisin],{p1:'P1'}),t=ctx.testPilotV211,opts={state,db};
  const avant=t.planningNeedV211(p1,'2026-09-21');
  assert.equal(avant.performancePriority,'P1','V211 lit le P1 du fichier performance');
  assert.equal(avant.briefContribution,0,'sans brief, aucun apport');
  const stores=JSON.stringify(state.stores),perfData=db.getItem(P.STORE_KEY);
  B.addRule(state,'2026-W39',{type:'boost',label:'Challenge Fnac',boost:30,scope:{storeIds:['p1']},confidence:'confirmed'});
  const briefs=JSON.stringify(state.weeklyBriefs),eff=B.effectivePriority(p1,'2026-W39',opts),apres=t.planningNeedV211(p1,'2026-09-21');
  assert.deepEqual([eff.contributions.brief,eff.weekBoost,B.planningPriority(p1,'2026-W39',opts)],[30,90,5*B.STRUCTURAL_WEIGHT+90],'V246 : brief 30, semaine P1 60 + 30, priorité complète avec la structurelle');
  assert.equal(apres.briefContribution,30);
  assert.equal(gap(apres,avant),30,'seul l’apport brief s’ajoute : ni weekBoost ni planningPriority, donc ni structurelle ni P1 recomptés');
  assert.equal(apres.tier,avant.tier,'le brief départage au score, il ne change pas de palier');
  assert(apres.reasons.includes('brief +30'));
  assert.equal(t.planningNeedV211(voisin,'2026-09-21').briefContribution,0,'un magasin hors périmètre n’est pas touché');
  assert.equal(JSON.stringify(state.stores),stores,'store.priority et les fiches restent intacts');
  assert.equal(db.getItem(P.STORE_KEY),perfData,'le fichier performance n’est pas modifié');
  assert.equal(JSON.stringify(state.weeklyBriefs),briefs,'weeklyBriefs n’est pas modifié par le classement');
}

{
  // Ambiguë, en attente, hors validFrom/validTo : aucun effet sur la semaine calculée.
  const s=store('cible',{lastVisit:'2026-08-20'});
  const {ctx,state,B}=makeBriefEnv([s]),need=w=>ctx.testPilotV211.planningNeedV211(s,w);
  const weeks=['2026-09-14','2026-09-21','2026-09-28','2026-10-05'],base=weeks.map(need);   // W38 → W41
  B.addRule(state,'2026-W39',{type:'boost',label:'À vérifier',boost:40,scope:{storeIds:['cible']}});
  B.addRule(state,'2026-W39',{type:'boost',label:'En attente SEF',boost:40,scope:{storeIds:['cible']},confidence:'confirmed',pending:'Confirmation SEF'});
  B.addRule(state,'2026-W39',{type:'boost',label:'Relance W40',boost:25,scope:{storeIds:['cible']},validFrom:'2026-W40',validTo:'2026-W40',confidence:'confirmed'});
  assert.deepEqual(weeks.map(w=>need(w).briefContribution),[0,0,25,0],'ambiguë ou en attente : inerte ; confirmée : seulement de validFrom à validTo');
  assert.deepEqual(weeks.map((w,i)=>gap(need(w),base[i])),[0,0,25,0],'le score ne bouge que sur la semaine couverte');
  B.confirmRule(state,'2026-W39','r1');
  assert.equal(need('2026-09-21').briefContribution,40,'une fois confirmée, la règle agit sur sa semaine');
}

{
  // Les contraintes du moteur passent avant le brief : garde anti-sur-visite, verrou, rendez-vous, palier.
  const stores=['bloque','libre','pose','rdv','star'].map(id=>store(id,{lastVisit:'2026-08-01'})).concat([store('retard',{lastVisit:'2026-08-21'}),store('ajour',{lastVisit:'2026-09-10'})]);
  const {ctx,state,B}=makeBriefEnv(stores),t=ctx.testPilotV211,by=id=>stores.find(s=>s.id===id);
  B.addRule(state,'2026-W39',{type:'boost',label:'Coup de pouce maximal',boost:100,scope:{storeIds:['bloque','star','ajour']},confidence:'confirmed'});
  const pick=ids=>{const pool=ids.map(by),m=t.rotationMemoryV211(pool,'2026-09-21',1,{});return t.chooseStores(pool,m.usedKeys,m.useCount,m.lastUsedWeek,1,1,'2026-09-21',0,['Lundi']).map(s=>s.id).join(',')};
  assert.equal(pick(['bloque','libre']),'bloque','à besoin égal, le brief départage');
  ctx.StoreRunnerVisitCoverage={needOf:()=>s=>({blocked:String(s.id)==='bloque'})};
  assert.equal(pick(['bloque','libre']),'libre','garde anti-sur-visite : le brief ne fait pas repasser un magasin bloqué');
  assert.equal(pick(['pose','star']),'star');
  state.locks={pose:'Lundi'};
  assert.equal(pick(['pose','star']),'pose','un magasin verrouillé passe avant un magasin poussé par le brief');
  state.locks={};
  assert.equal(pick(['rdv','star']),'star');
  state.appointments=[{id:'a1',storeId:'rdv',date:'2026-09-21',time:'10:00',duration:60,type:'visite',note:''}];
  assert.equal(pick(['rdv','star']),'rdv','un rendez-vous de la semaine passe avant un magasin poussé par le brief');
  const nRetard=t.planningNeedV211(by('retard'),'2026-09-21'),nAjour=t.planningNeedV211(by('ajour'),'2026-09-21');
  assert(nAjour.briefContribution===100&&nAjour.score>nRetard.score,'le brief porte le score du magasin à jour au-dessus du magasin en retard');
  assert(nRetard.tier>nAjour.tier&&t.compareNeedV211(by('retard'),by('ajour'),'2026-09-21')<0,'mais le palier de besoin (en retard › à jour) reste prioritaire');
}

(async()=>{
  // Génération semaine (générateur réel du bouton) : le brief de la semaine affichée, lu en un lot.
  {
    const stores=['a','b','c'].map(id=>store(id,{lastVisit:'2026-08-01'}));
    const {ctx,state,B,proposals,els,calls}=makeBriefEnv(stores);
    B.addRule(state,'2026-W39',{type:'boost',label:'Semaine 39',boost:50,scope:{storeIds:['c']},confidence:'confirmed'});
    const res=await ctx.testPilotV211.strictSingleWeek();
    assert.equal(res.cancelled,true,els.rangePlanStatus.textContent);
    assert.equal(proposals[0].plan.Lundi.map(s=>s.id).join(','),'c','la semaine générée suit le brief de sa semaine');
    assert.deepEqual([calls.lot,calls.one],[1,0],'une seule évaluation en lot pour la semaine générée');
    B.updateRule(state,'2026-W39','r1',{confidence:'ambiguous'});
    assert.equal(ctx.testPilotV211.planningNeedV211(stores[2],'2026-09-21').briefContribution,0,'le lot ne survit pas à la génération');
  }
  // Génération période : chaque semaine lit son propre brief ; rien ne survit à la génération.
  {
    const stores=['a','b','c'].map(id=>store(id,{lastVisit:'2026-08-01'}));
    const {ctx,state,B,proposals,els,calls}=makeBriefEnv(stores);
    B.addRule(state,'2026-W38',{type:'boost',label:'Semaine 38',boost:50,scope:{storeIds:['c']},confidence:'confirmed'});
    B.addRule(state,'2026-W39',{type:'boost',label:'Semaine 39',boost:50,scope:{storeIds:['b']},confidence:'confirmed'});
    const weeks=p=>['2026-09-14','2026-09-21'].map(k=>p.archive[k].plan.Lundi.map(s=>s.id).join(',')).join(' | ');
    await ctx.generatePlanningRange();
    assert.equal(proposals.length,1,els.rangePlanStatus.textContent);
    assert.equal(weeks(proposals[0]),'c | b','W38 suit le brief W38, W39 le brief W39');
    assert.deepEqual([calls.lot,calls.one],[2,0],'une évaluation en lot par semaine générée, aucune magasin par magasin');
    B.updateRule(state,'2026-W39','r1',{confidence:'ambiguous'});
    await ctx.generatePlanningRange();
    assert.equal(weeks(proposals[1]),'c | a','règle W39 redevenue ambiguë : W39 retombe sur l’ordre V211, sans reprendre le lot précédent');
    B.confirmRule(state,'2026-W39','r1');
    assert.equal(ctx.testPilotV211.planningNeedV211(stores[1],'2026-09-21').briefContribution,50,'hors génération, une confirmation compte aussitôt');
  }

  /* P1.2 — échéances confirmées (deadline V246) : obligations réelles dans l'horizon généré. */
  const week=async g=>{const res=await g.ctx.testPilotV211.strictSingleWeek();return {res,plan:g.proposals[0]&&g.proposals[0].plan}};
  {
    // 1. Échéance confirmée : posé à une date ≤ échéance (sans elle, la journée la moins chargée est jeudi).
    const run=async confirmed=>{
      const g=makeBriefEnv(['l1','l2','l3','cible','o1','o2'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{days:FIVE,max:2,target:6,state:{locks:{l1:'Lundi',l2:'Mardi',l3:'Mercredi'}}});
      dline(g,'2026-W39','cible','2026-09-23',confirmed?{}:{confidence:'ambiguous'});
      const {res,plan}=await week(g);assert.equal(res.cancelled,true,g.els.rangePlanStatus.textContent);return dayOf(plan,'cible');
    };
    assert.equal(await run(false),'Jeudi');
    assert.equal(await run(true),'Lundi','obligation : posé au plus tard le mercredi 23/09');
  }
  {
    // 1b. L'obligation choisit sa journée avant un magasin imposé sans jour : les deux tiennent.
    const g=makeBriefEnv(['imp','cible'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{days:['Lundi','Mardi'],target:2,state:{included:{imp:true}}});
    dline(g,'2026-W39','cible','2026-09-21');
    const {plan}=await week(g);
    assert.equal(dayOf(plan,'cible')+','+dayOf(plan,'imp'),'Lundi,Mardi');
  }
  {
    // 2. Moins prioritaire et bloqué par la garde anti-sur-visite : l'obligation gagne quand même.
    const g=makeBriefEnv([store('urgent',{priority:5,lastVisit:'2026-07-01'}),store('cible',{lastVisit:'2026-09-08'})]),t=g.ctx.testPilotV211;
    g.ctx.StoreRunnerVisitCoverage={needOf:()=>s=>({blocked:String(s.id)==='cible'})};
    assert(t.planningNeedV211(g.state.stores[0],'2026-09-21').tier>t.planningNeedV211(g.state.stores[1],'2026-09-21').tier);
    dline(g,'2026-W39','cible','2026-09-21');
    assert.equal(flat((await week(g)).plan),'cible','l’obligation passe devant un magasin très en retard, malgré la garde');
  }
  {
    // 3. + 13. Règle P1 jugée par V246 : tous les P1 avant l'échéance ; aucune écriture.
    const p1=['p1a','p1b','p1c'].map(id=>store(id,{lastVisit:'2026-09-01'})),late=['r1','r2','r3'].map(id=>store(id,{lastVisit:'2026-07-01'}));
    const g=makeBriefEnv(p1.concat(late),{p1a:'P1',p1b:'P1',p1c:'P1'},{days:['Lundi','Mardi','Mercredi'],max:2,target:2});
    g.B.addRule(g.state,'2026-W39',{type:'deadline',label:'Tous les P1 avant mercredi',dueDate:'2026-09-22',scope:{basePrio:'P1'},confidence:'confirmed'});
    assert.equal(g.B.effectivePriority(late[0],'2026-W39',{state:g.state,db:g.db}).deadline,null,'le périmètre P1 reste jugé par V246');
    const before=frozen(g),{plan}=await week(g);
    assert.equal(p1.map(s=>dayOf(plan,s.id)).join(','),'Lundi,Mardi,Lundi','les trois P1 au plus tard le mardi 22/09');
    assert.equal(late.filter(s=>dayOf(plan,s.id)).length,0,'avant les candidats libres très en retard');
    assert.equal(frozen(g),before,'ni weeklyBriefs, ni performance, ni fiches, ni planning, ni archive modifiés');
  }
  {
    // 4. Visite faite (doneDate V246) : aucune nouvelle visite.
    const g=makeBriefEnv([store('urgent',{priority:5,lastVisit:'2026-07-01'}),store('cible',{lastVisit:'2026-09-08'})]);
    dline(g,'2026-W37','cible','2026-09-21',{validTo:'2026-W39'});
    assert.equal(g.B.effectivePriority(g.state.stores[1],'2026-W39',{state:g.state,db:g.db}).deadline.doneDate,'2026-09-08');
    assert.equal(flat((await week(g)).plan),'urgent');
  }
  {
    // 5. Déjà posé avant l'échéance dans une semaine retouchée : tenue, aucune duplication.
    const g=makeBriefEnv(['a','cible'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{archive:{'2026-09-14':{weekMonday:'2026-09-14',plan:onDay('Lundi','cible'),manualEdited:true}}});
    dline(g,'2026-W38','cible','2026-09-21',{validTo:'2026-W39'});
    await g.ctx.generatePlanningRange();
    assert.equal(weeksOf(g.proposals[0]),'cible | a',g.els.rangePlanStatus.textContent);
  }
  {
    // 6. Semaine retouchée qui place le magasin après l'échéance : refus atomique (période et semaine).
    const archive={'2026-09-21':{weekMonday:'2026-09-21',plan:onDay('Mardi','cible'),manualEdited:true}};
    const g=makeBriefEnv(['a','cible'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{archive,state:{plan:onDay('Vendredi','a')}});
    dline(g,'2026-W38','cible','2026-09-18',{validTo:'2026-W39'});
    const before=frozen(g);await g.ctx.generatePlanningRange();
    assert.equal(g.proposals.length,0,'aucune proposition');
    assert.equal(g.els.rangePlanStatus.textContent,'Erreur pendant la génération : 1 obligation d’échéance du brief impossible à tenir — « Échéance cible » (échéance le 18/09) : Fnac Ville cible (semaine modifiée à la main : posé le 22/09, après l’échéance). Le planning précédent est conservé.');
    assert.equal(frozen(g),before,'planning, archive, briefs, performance et fiches intacts');
    const h=makeBriefEnv(['a','cible'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{archive,state:{plan:onDay('Mardi','cible')}});
    dline(h,'2026-W39','cible','2026-09-21');
    const {res}=await week(h);
    assert(res.ok===false&&/Fnac Ville cible \(semaine modifiée à la main : posé le 22\/09, après l’échéance\)/.test(res.error),res.error);
    assert.equal(h.proposals.length,0);
  }
  {
    // 7. Rendez-vous après l'échéance : refus atomique, sans visite de contournement.
    const g=makeBriefEnv(['a','cible'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{days:FIVE,max:2,target:2,state:{plan:onDay('Vendredi','a'),appointments:[appt('cible','2026-09-24')]}});
    dline(g,'2026-W39','cible','2026-09-22');
    const before=frozen(g),{res}=await week(g);
    assert.equal(res.error,'1 obligation d’échéance du brief impossible à tenir — « Échéance cible » (échéance le 22/09) : Fnac Ville cible (rendez-vous le 24/09, après l’échéance). Le planning précédent est conservé.');
    assert.equal(g.proposals.length,0);assert.equal(frozen(g),before);
  }
  {
    // 8. Rendez-vous avant l'échéance : obligation tenue par le rendez-vous, aucune visite en plus.
    const g=makeBriefEnv(['a','cible'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{state:{appointments:[appt('cible','2026-09-21')]}});
    dline(g,'2026-W38','cible','2026-09-23',{validTo:'2026-W39'});
    await g.ctx.generatePlanningRange();
    assert.equal(weeksOf(g.proposals[0]),'a | cible',g.els.rangePlanStatus.textContent);
  }
  {
    // 9. Capacité insuffisante : refus atomique, planning précédent inchangé.
    const g=makeBriefEnv(['c1','c2'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{state:{plan:onDay('Vendredi','c1')}});
    dline(g,'2026-W39',['c1','c2'],'2026-09-21',{label:'Les deux lundi'});
    const before=frozen(g),{res}=await week(g);
    assert.equal(res.error,'1 obligation d’échéance du brief impossible à tenir — « Les deux lundi » (échéance le 21/09) : Fnac Ville c2 (plus de créneau avant l’échéance : capacité ou horaires). Le planning précédent est conservé.');
    assert.equal(g.proposals.length,0);assert.equal(frozen(g),before);
  }
  {
    // 10. Ambiguë ou en attente : aucune obligation.
    const g=makeBriefEnv([store('urgent',{priority:5,lastVisit:'2026-07-01'}),store('cible',{lastVisit:'2026-09-08'})]);
    dline(g,'2026-W39','cible','2026-09-21',{confidence:'ambiguous'});
    dline(g,'2026-W39','cible','2026-09-21',{pending:'Confirmation SEF'});
    assert.equal(flat((await week(g)).plan),'urgent');
  }
  {
    // 11. Échéance après la fin de la période : aucun forçage, aucun refus anticipé.
    const g=makeBriefEnv([store('u1',{priority:5,lastVisit:'2026-07-01'}),store('u2',{priority:5,lastVisit:'2026-07-01'}),store('cible',{lastVisit:'2026-09-08'})]);
    dline(g,'2026-W38','cible','2026-10-02',{validTo:'2026-W40'});
    await g.ctx.generatePlanningRange();
    assert.equal(weeksOf(g.proposals[0]),'u1 | u2',g.els.rangePlanStatus.textContent);
  }
  {
    // 12. Période à plusieurs échéances : la plus proche d'abord, dans le lot V246 déjà mémorisé.
    const g=makeBriefEnv([store('a-tardif',{lastVisit:'2026-08-20'}),store('b-proche',{lastVisit:'2026-08-20'}),store('urgent',{priority:5,lastVisit:'2026-07-01'})]);
    dline(g,'2026-W38','a-tardif','2026-09-21',{validTo:'2026-W39',label:'Tardive'});
    dline(g,'2026-W38','b-proche','2026-09-14',{validTo:'2026-W39',label:'Proche'});
    await g.ctx.generatePlanningRange();
    assert.equal(weeksOf(g.proposals[0]),'b-proche | a-tardif',g.els.rangePlanStatus.textContent);
    assert.deepEqual([g.calls.lot,g.calls.one],[2,0],'une évaluation en lot par semaine, aucune magasin par magasin');
  }
  {
    // 14. Échéance déjà passée dans la semaine entamée : jamais rétroactif ; une journée passée qui
    //     contient le magasin la tient.
    const g=makeBriefEnv(['passe','tenu','libre'].map(id=>store(id,{lastVisit:'2026-08-01'})),{},{days:FIVE,max:2,target:2,weekDate:'2026-09-07',state:{plan:onDay('Lundi','tenu')}});
    dline(g,'2026-W37',['passe','tenu'],'2026-09-08',{label:'Avant mardi'});
    const {res}=await week(g);
    assert.equal(res.error,'1 obligation d’échéance du brief impossible à tenir — « Avant mardi » (échéance le 08/09) : Fnac Ville passe (échéance déjà dépassée). Le planning précédent est conservé.');
  }
  console.log('planning pilot v211 ok · mémoire inter-semaines · P1/P2 · retard futur · couverture · cadence · brief V246 · échéances');
})().catch(e=>{console.error(e);process.exitCode=1});
