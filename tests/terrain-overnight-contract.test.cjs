/* H1 — le rapport découché de « Générer mes 3 semaines » suit le contrat V189.
   Référence métier : tests/mandatory-overnight-v263-4.test.cjs.
   1. Au runtime, StoreRunnerTerrainPlanningV1.analyzeOvernightWeeks délègue au propriétaire,
      StoreRunnerOvernightV182.analyze(plan, weekKey) — futureOvernightAnalysis depuis le démarrage
      de V189 —, relu au moment de l'analyse (terrain-planning-v1.js est chargé avant v182-fixes.js
      et auto-planning-fix.js) et appelé avec la weekKey de chaque semaine.
   2. Sans propriétaire, le repli overnightForPlan applique le même contrat : même nuit, même refus,
      même mode, même seuil, mêmes nuits futures — cas par cas, puis contre V189 sur des semaines
      pseudo-aléatoires (géométrie plane, puis vraies distances du noyau).
   3. L'analyse n'écrit rien : planning, state et réservations d'hôtel restent identiques.
   4. H1.1 — après le cycle, l'enveloppe V185 (patchThreeWeekGeography → persistSnailGeography →
      terrainOvernightRow) garde cette décision dans result.overnightReport et dans le
      range.overnightReport persisté puis affiché ; sa copie locale ne sert que sans moteur terrain.
      Un seuil explicite à 0 s'affiche 0 km (voir aussi overnight-range-weekdate-v267 pour V251).
   Géométrie plane injectée (km) : le domicile est l'origine (x = 0, y = 0) des deux moteurs ;
   baseLat/baseLon ne servent qu'à déclarer le domicile localisé. Horloge figée dans chaque contexte.
   Les objets créés dans une VM n'ont pas les prototypes de ce fichier : on compare donc des
   décisions reconstruites ici, jamais les objets VM eux-mêmes. */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],FIVE=DAYS.slice(0,5);
const W40='2026-09-28',W41='2026-10-05',W42='2026-10-12',FUTURE='2099-01-05';
const TODAY='2026-09-30';                          // mercredi de W40 : lundi et mardi sont passés
const RUNTIME=['planning-day-origin.js','terrain-planning-v1.js','v182-fixes.js','auto-planning-fix.js'];   // ordre de index.html
const flat=(a,b)=>Math.hypot(Number(a.x||0)-Number(b.x||0),Number(a.y||0)-Number(b.y||0));
const at=(id,x,y)=>({id,enseigne:'Enseigne '+id,ville:'Ville-Test '+id,adresse:'1 rue Test',x,y:y||0});
const emptyPlan=()=>Object.fromEntries(DAYS.map(d=>[d,[]]));
const plan=rows=>Object.assign(emptyPlan(),rows);
const pad=n=>String(n).padStart(2,'0');
const isoAfter=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};

/* Les vraies fonctions de distance du noyau, extraites de src/chef-secteur.html. */
const CORE=read('src/chef-secteur.html');
const coreLine=re=>{const m=CORE.match(re);if(!m)throw new Error('noyau : '+re+' introuvable');return m[0]};
const CORE_DISTANCES=[/^function rad\(v\)\{.*$/m,/^function hav\(a,b\)\{.*$/m,/^function baseObj\(\)\{.*$/m].map(coreLine).join('\n');

function load(files,options){
  const clock={now:Date.parse(TODAY+'T09:00:00')};
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}}
  const state={
    profile:{baseName:'Domicile',baseLat:45.764,baseLon:4.8357,overnightMode:'auto',overnightMinSaving:80},
    settings:{days:FIVE.slice(),weekDate:W40},
    plan:emptyPlan(),stores:[],excluded:{},included:{},locks:{},visits:{},appointments:[],manualWeekEdits:{},calendarEvents:[],hotelReservations:{}
  };
  /* DOM minimal : un élément ajouté au document se retrouve par son id (bandeau V189, compte rendu
     du cycle dans « Planifier plusieurs semaines »). */
  const byId=new Map(),memory=new Map();
  const element=tag=>{const el={tagName:String(tag).toUpperCase(),id:'',className:'',textContent:'',innerHTML:'',hidden:false,dataset:{},style:{},parentNode:null,
    classList:{add(){},remove(){}},setAttribute(){},remove(){},addEventListener(){},
    appendChild(child){child.parentNode=el;if(child.id)byId.set(child.id,child);return child},
    insertAdjacentElement(where,child){child.parentNode=el.parentNode;if(child.id)byId.set(child.id,child);return child}};return el};
  const reportHost=element('div');byId.set('overnightBox',element('div'));
  const document={readyState:'loading',hidden:false,head:element('head'),addEventListener(){},removeEventListener(){},dispatchEvent(){},
    getElementById:id=>byId.get(id)||null,querySelector:selector=>selector==='#rangePlannerCard .planningChoiceBody'?reportHost:null,querySelectorAll:()=>[],createElement:element};
  const ctx={console,Date:FixedDate,state,document,
    localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},
    CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail},
    setTimeout:()=>0,addEventListener(){},removeEventListener(){},dispatchEvent(){},
    StoreRunnerSectorPilotage:{},storeVisitCredit:()=>1};
  ctx.window=ctx;
  if(options&&options.coreDistances)vm.runInNewContext(CORE_DISTANCES,ctx,{filename:'src/chef-secteur.html'});
  else{ctx.hav=flat;ctx.baseObj=()=>({x:0,y:0})}
  for(const file of files)vm.runInNewContext(read(file),ctx,{filename:file});
  return{ctx,get state(){return ctx.state},terrain:ctx.StoreRunnerTerrainPlanningV1,v189:ctx.StoreRunnerStoreControlsV189,storage:memory,
    today(day){clock.now=Date.parse(day+'T09:00:00')},
    /* Compte rendu « Découchés sur 3 semaines » rendu par terrain depuis la période stockée. */
    insights(){ctx.StoreRunnerTerrainPlanningV1.install();const box=byId.get('terrainSnailInsights');return box&&!box.hidden?box.innerHTML:''}};
}
function configure(env,o){
  const s=env.state;
  s.profile.overnightMode=o.mode;s.profile.overnightMinSaving=o.threshold;
  s.settings.days=Array.from(o.days||FIVE);s.settings.weekDate=o.weekDate||W40;
  env.today(o.today||TODAY);
}
/* Décision comparable : mode, seuil, motif du contrat et nuit montrée (retenue, ou meilleure
   paire éloignée sous le seuil Automatique). */
function decisionOf(a){
  const shown=a.candidate||(a.reason==='threshold'?a.bestRemote:null);
  return{mode:a.mode,threshold:a.threshold,selected:!!a.candidate,reason:a.reason,night:shown?shown.night:null,fromDate:shown?shown.fromDate:null,toDate:shown?shown.toDate:null,saving:shown?shown.saving:null,remoteKm:shown?shown.remoteKm:null};
}
function decisionOfRow(r){
  const b=r.best;
  return{mode:r.mode,threshold:r.threshold,selected:r.selected,reason:r.analysisReason,night:b?b.night:null,fromDate:b?b.fromDate:null,toDate:b?b.toDate:null,saving:b?b.saving:null,remoteKm:b?b.remoteKm:null};
}
const REPORT_REASON=r=>r==='candidate'?'selected':r==='threshold'?'below-threshold':r==='disabled'?'disabled':'no-candidate';

/* Runtime : terrain chargé avant V182 et V189, puis démarrage de V189 qui prend
   StoreRunnerOvernightV182.analyze. Repli : V189 sans V182, donc aucun propriétaire exposé ;
   V189 y reste la référence, sur le même state. */
const R=load(RUNTIME);
R.v189.repair();
assert.equal(R.ctx.StoreRunnerOvernightV182.analyze,R.v189.futureOvernightAnalysis,'V189 possède StoreRunnerOvernightV182.analyze');
const F=load(['planning-day-origin.js','terrain-planning-v1.js','auto-planning-fix.js']);
assert.equal(F.ctx.StoreRunnerOvernightV182,undefined,'repli : aucun propriétaire exposé');

/* Une semaine, quatre lectures : V189 (référence, dans les deux contextes), terrain au runtime
   (propriétaire), terrain en repli (analyzeOvernightWeeks puis overnightForPlan direct). */
function decide(label,rows,options){
  const o=Object.assign({mode:'auto',threshold:80,weekKey:FUTURE},options);
  configure(R,o);configure(F,o);
  const analysis=F.v189.futureOvernightAnalysis(plan(rows),o.weekKey),reference=decisionOf(analysis);
  assert.deepEqual(decisionOf(R.v189.futureOvernightAnalysis(plan(rows),o.weekKey)),reference,label+' : même référence V189 dans les deux contextes');
  const rows3=[
    ['runtime',R.terrain.analyzeOvernightWeeks([{weekKey:o.weekKey,plan:plan(rows)}])[0]],
    ['repli',F.terrain.analyzeOvernightWeeks([{weekKey:o.weekKey,plan:plan(rows)}])[0]],
    ['overnightForPlan',Object.assign({weekKey:o.weekKey},F.terrain.overnightForPlan(plan(rows),F.state,undefined,o.weekKey))]
  ];
  for(const [name,row] of rows3){
    assert.equal(row.weekKey,o.weekKey,label+' / '+name+' : weekKey');
    assert.deepEqual(decisionOfRow(row),reference,label+' / '+name+' : même décision que V189');
    assert.equal(row.reason,REPORT_REASON(reference.reason),label+' / '+name+' : motif du rapport');
  }
  return Object.assign(reference,{bestSaving:analysis.best&&analysis.best.saving,bestRemoteKm:analysis.best&&analysis.best.remoteKm});
}

/* Paires de référence (km), celles de V263.4.
   CLOSE : 40 et 50 km, 10 km entre les deux → économie 80, remoteKm 40.
   FAR_SMALL : 60 et ~61 km de part et d'autre → économie ~29, remoteKm 60.
   FAR_BIG : 90 et 100 km dans le même axe → économie 180, remoteKm 90.
   LOCAL : 8 et 12 km → économie 16. OPPOSITE : 60 et 70 km opposés → économie 0.
   EDGE_199 : économie 19,9 km. EDGE_20 : économie 20 km exactement. */
const CLOSE=[at('close-a',40),at('close-b',50)];
const FAR_SMALL=[at('far-s-a',60),at('far-s-b',-10,60)];
const FAR_BIG=[at('far-b-a',90),at('far-b-b',100)];
const LOCAL=[at('local-a',8),at('local-b',12)];
const OPPOSITE=[at('opp-a',60),at('opp-b',-70)];
const EDGE_199=[at('edge-a',9.95),at('edge-b',30)];
const EDGE_20=[at('edge-c',10),at('edge-d',30)];

/* ── 1. Automatique, zone proche (< 55 km) mais grosse économie → refus, même seuil à 0 ── */
for(const threshold of [80,0]){
  const d=decide('auto proche / seuil '+threshold,{Lundi:[CLOSE[0]],Mardi:[CLOSE[1]]},{threshold});
  assert(d.bestRemoteKm<55&&d.bestSaving>=80,'prémisse : zone proche, grosse économie');
  assert.equal(d.selected,false,'Automatique ne retient pas une nuit à moins de 55 km');
  assert.equal(d.reason,'too-close');
  assert.equal(d.threshold,threshold,'un seuil explicite à 0 reste 0');
}

/* ── 2. Automatique, zone éloignée (≥ 55 km) mais économie sous le seuil → même refus ───── */
for(const [label,pair] of [['peu de gain',FAR_SMALL],['opposée',OPPOSITE]]){
  const d=decide('auto éloignée '+label,{Lundi:[pair[0]],Mardi:[pair[1]]});
  assert(d.remoteKm>=55&&d.saving<80,'prémisse : zone éloignée sous le seuil');
  assert.equal(d.selected,false);
  assert.equal(d.reason,'threshold');
  assert.equal(d.night,'Nuit Lundi → Mardi','le rapport montre la meilleure paire éloignée restée sous le seuil');
}

/* ── 3. Automatique valide : même nuit, même raison ─────────────────────────────────────── */
{
  const d=decide('auto valide',{Lundi:[at('l0',5),FAR_BIG[0]],Mardi:[FAR_BIG[1],at('m1',6)]});
  assert.equal(d.reason,'candidate');
  assert.equal(d.night,'Nuit Lundi → Mardi');
  assert.equal(d.fromDate,FUTURE);assert.equal(d.toDate,'2099-01-06');
  assert.equal(d.saving,180);assert.equal(d.remoteKm,90);
  // Automatique garde sa préférence pour la zone éloignée, même face à une paire proche plus rentable.
  assert.equal(decide('auto éloignée préférée',{Lundi:[CLOSE[0]],Mardi:[CLOSE[1]],Jeudi:[FAR_SMALL[0]],Vendredi:[FAR_SMALL[1]]},{threshold:20}).night,'Nuit Jeudi → Vendredi');
  assert.equal(decide('auto défaut 80 km',{Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]},{threshold:undefined}).threshold,80,'sans réglage, le seuil Automatique vaut 80 km');
}

/* ── 4. Obligatoire, zone proche (< 55 km) mais économie ≥ 20 → même nuit retenue ───────── */
{
  const d=decide('obligatoire proche',{Lundi:[at('l0',5),CLOSE[0]],Mardi:[CLOSE[1],at('m1',6)]},{mode:'mandatory'});
  assert.equal(d.reason,'candidate','Obligatoire : la demande explicite passe outre les 55 km');
  assert.equal(d.night,'Nuit Lundi → Mardi');
  assert.equal(d.saving,80);assert(d.remoteKm<55);
  // La meilleure paire réellement utile gagne.
  assert.equal(decide('obligatoire meilleure paire',{Lundi:[LOCAL[0]],Mardi:[LOCAL[1]],Mercredi:[at('w0',3),CLOSE[0]],Jeudi:[CLOSE[1]],Vendredi:[FAR_SMALL[1]]},{mode:'mandatory'}).night,'Nuit Mercredi → Jeudi');
}

/* ── 5. Obligatoire, économie < 20 → même refus mandatory-no-useful ─────────────────────── */
for(const [label,pair] of [['locale',LOCAL],['opposée',OPPOSITE]]){
  const d=decide('obligatoire inutile '+label,{Lundi:[pair[0]],Mardi:[pair[1]]},{mode:'mandatory'});
  assert(d.bestSaving<20,'prémisse : moins de 20 km économisés');
  assert.equal(d.selected,false);
  assert.equal(d.reason,'mandatory-no-useful');
}

/* ── 6. Obligatoire, 19,9 km refusé, 20 km exactement admis ────────────────────────────── */
{
  const low=decide('obligatoire 19,9 km',{Lundi:[EDGE_199[0]],Mardi:[EDGE_199[1]]},{mode:'mandatory'});
  assert(low.bestSaving<20&&low.bestSaving>19.89,'prémisse : 19,9 km');
  assert.equal(low.reason,'mandatory-no-useful');
  const edge=decide('obligatoire 20 km',{Lundi:[EDGE_20[0]],Mardi:[EDGE_20[1]]},{mode:'mandatory'});
  assert.equal(edge.saving,20);
  assert.equal(edge.reason,'candidate','20 km économisés suffisent');
}

/* ── 7. Jamais → aucune nuit, nulle part ───────────────────────────────────────────────── */
for(const pair of [FAR_BIG,CLOSE]){
  const d=decide('jamais',{Lundi:[pair[0]],Mardi:[pair[1]]},{mode:'never'});
  assert.equal(d.selected,false);assert.equal(d.reason,'disabled');assert.equal(d.night,null);
}

/* ── 8. Mercredi off : mardi → jeudi n'est jamais une nuit ─────────────────────────────── */
for(const mode of ['auto','mandatory']){
  const days=['Lundi','Mardi','Jeudi','Vendredi'];
  const only=decide('mercredi off seul / '+mode,{Mardi:[FAR_BIG[0]],Jeudi:[FAR_BIG[1]]},{mode,days});
  assert.equal(only.selected,false);assert.equal(only.reason,'no-future-pair','deux jours séparés par un jour off ne font pas une paire');
  const mixed=decide('mercredi off entouré / '+mode,{Lundi:[LOCAL[0]],Mardi:[FAR_BIG[0]],Jeudi:[FAR_BIG[1]],Vendredi:[at('v0',-80)]},{mode,days});
  assert.equal(mixed.selected,false);assert.notEqual(mixed.night,'Nuit Mardi → Jeudi');
  assert.equal(mixed.reason,mode==='auto'?'threshold':'mandatory-no-useful');
}

/* ── 9. Première semaine entamée : une nuit passée est ignorée ─────────────────────────── */
for(const mode of ['auto','mandatory']){
  const past=decide('W40 entamée / '+mode,{Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]},{mode,weekKey:W40});
  assert.equal(past.selected,false,'la nuit du lundi 28/09 est passée le mercredi 30/09');
  assert.equal(past.reason,'no-future-pair');
  assert.equal(decide('même plan en W41 / '+mode,{Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]},{mode,weekKey:W41}).fromDate,W41);
  const tonight=decide('W40 nuit du jour / '+mode,{Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]],Mercredi:[at('w40-c',95)],Jeudi:[at('w40-d',105)]},{mode,weekKey:W40});
  assert.equal(tonight.night,'Nuit Mercredi → Jeudi','la nuit de ce soir reste une nuit future');
  assert.equal(tonight.fromDate,TODAY);
}
{
  configure(F,{mode:'auto',threshold:80});
  const p=plan({Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]});
  assert.equal(F.terrain.overnightForPlan(p,F.state,undefined,W40,W40).analysisReason,'candidate','overnightForPlan accepte une date du jour explicite');
  assert.equal(F.terrain.overnightForPlan(p,F.state,undefined,W40,TODAY).analysisReason,'no-future-pair');
}

/* ── 10. W40 / W41 / W42 : chaque semaine est analysée avec sa propre weekKey ──────────── */
{
  configure(R,{mode:'auto',threshold:80,weekDate:W40});
  const weeks=[W40,W41,W42].map((weekKey,i)=>({weekKey,plan:plan({Lundi:[at('s'+i+'-a',90+i)],Mardi:[at('s'+i+'-b',100+i)]})}));
  const api=R.ctx.StoreRunnerOvernightV182,owner=api.analyze,calls=[];
  // Posé après le chargement de terrain : l'API est relue au moment de l'analyse.
  api.analyze=function(p,weekKey){calls.push({plan:p,weekKey,argCount:arguments.length});return owner.apply(this,arguments)};
  let report;try{report=R.terrain.analyzeOvernightWeeks(weeks)}finally{api.analyze=owner}
  assert.deepEqual(calls.map(c=>c.weekKey),[W40,W41,W42],'analyze(plan, weekKey) pour chaque semaine');
  assert.deepEqual(calls.map(c=>c.argCount),[2,2,2]);
  calls.forEach((c,i)=>assert.equal(c.plan,weeks[i].plan,'chaque semaine transmet son propre plan'));
  assert.deepEqual(Array.from(report,r=>r.weekKey),[W40,W41,W42]);
  assert.equal(report[0].selected,false,'W40 : la nuit du lundi est passée');
  assert.equal(report[0].analysisReason,'no-future-pair');
  assert.deepEqual(Array.from(report.slice(1),r=>[r.selected,r.best.fromDate,r.best.toDate]),[[true,W41,'2026-10-06'],[true,W42,'2026-10-13']],'W41 et W42 gardent leurs propres dates');
  // Sans sa weekKey, W41 serait lue comme la semaine affichée (W40), donc comme passée.
  assert.equal(owner(weeks[1].plan).reason,'no-future-pair');
}

/* ── 11–12. Sans V182 ni V189 : repli, aucune exception ────────────────────────────────── */
{
  const T=load(['terrain-planning-v1.js']);
  assert.equal(T.ctx.StoreRunnerOvernightV182,undefined);assert.equal(T.ctx.StoreRunnerStoreControlsV189,undefined);
  configure(T,{mode:'mandatory',threshold:80});
  const weeks=[{weekKey:W40,plan:plan({Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]})},{weekKey:W41,plan:plan({Lundi:[CLOSE[0]],Mardi:[CLOSE[1]]})},{weekKey:W42},{plan:plan({Jeudi:[LOCAL[0]],Vendredi:[LOCAL[1]]})},null];
  const expected=['no-future-pair','candidate','no-future-pair','mandatory-no-useful','no-future-pair'];
  assert.deepEqual(Array.from(T.terrain.analyzeOvernightWeeks(weeks),r=>r.analysisReason),expected);
  // Propriétaire présent mais inutilisable : le repli prend le relais, sans exception.
  for(const broken of [{},{analyze(){throw new Error('panne')}},{analyze(){return null}}]){
    T.ctx.StoreRunnerOvernightV182=broken;
    assert.deepEqual(Array.from(T.terrain.analyzeOvernightWeeks(weeks),r=>r.analysisReason),expected);
  }
  delete T.ctx.StoreRunnerOvernightV182;
  const state=T.ctx.state;T.ctx.state=undefined;
  assert.deepEqual(Array.from(T.terrain.analyzeOvernightWeeks(weeks),r=>r.analysisReason),expected.map(()=>'no-future-pair'),'sans state ni domicile : aucune nuit, aucune exception');
  T.ctx.state=state;
}

/* ── 13–14. Lecture seule : planning, state et réservations d'hôtel inchangés ──────────── */
for(const env of [R,F]){
  for(const mode of ['auto','mandatory','never']){
    configure(env,{mode,threshold:80});
    const reservation={fromDate:FUTURE,toDate:'2099-01-06',hotelName:'Hôtel Test',reference:'R-1',address:'',lat:null,lon:null,zone:'Ville-Test far-b-a'};
    env.state.hotelReservations={[FUTURE]:reservation};
    const reservations=env.state.hotelReservations;
    const weeks=[W40,W41,FUTURE].map((weekKey,i)=>({weekKey,plan:plan({Lundi:[at('n'+i,7),FAR_BIG[0]],Mardi:[FAR_BIG[1],CLOSE[0]],Mercredi:[CLOSE[1]]})}));
    const refs=weeks.map(w=>DAYS.map(d=>w.plan[d].slice())),before={weeks:JSON.stringify(weeks),state:JSON.stringify(env.state),reservation:JSON.stringify(reservation)};
    assert.equal(env.terrain.analyzeOvernightWeeks(weeks).length,3);
    assert.equal(JSON.stringify(weeks),before.weeks,mode+' : plans identiques octet pour octet');
    weeks.forEach((w,i)=>DAYS.forEach((d,j)=>{assert.equal(w.plan[d].length,refs[i][j].length);w.plan[d].forEach((s,k)=>assert.equal(s,refs[i][j][k],'mêmes magasins, même ordre'))}));
    assert.equal(JSON.stringify(env.state),before.state,mode+' : state inchangé');
    assert.equal(env.state.hotelReservations,reservations,'registre des réservations conservé');
    assert.deepEqual(Object.keys(reservations),[FUTURE],'aucune réservation créée ni supprimée');
    assert.equal(reservations[FUTURE],reservation);assert.equal(JSON.stringify(reservation),before.reservation,'réservation inchangée');
  }
  delete env.state.hotelReservations;
  env.terrain.analyzeOvernightWeeks([{weekKey:FUTURE,plan:plan({Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]})}]);
  assert.equal(Object.prototype.hasOwnProperty.call(env.state,'hotelReservations'),false,'aucun registre de réservations créé');
  env.state.hotelReservations={};
}

/* ── Oracle : semaines pseudo-aléatoires, V189 contre le repli terrain et le runtime ───── */
function oracle(envs,count,seed,storeAt){
  const [ref,fallback]=envs;let s=seed;
  const rnd=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648},pick=list=>list[Math.floor(rnd()*list.length)];
  const seen=new Map();
  for(let t=0;t<count;t++){
    // Une semaine sur trois reste près du domicile : refus « trop proche » et « gain inutile ».
    const days=rnd()<0.08?[]:DAYS.filter(d=>rnd()<(d==='Samedi'?0.3:0.82)),p=emptyPlan(),scale=pick([1,1,0.25]);
    for(const d of DAYS)if(rnd()<0.8){const n=1+Math.floor(rnd()*3);for(let k=0;k<n;k++)p[d].push(storeAt('o'+t+'-'+d+k,(rnd()-0.5)*scale,(rnd()-0.5)*scale))}
    const o={mode:pick(['auto','auto','mandatory','mandatory','never',undefined]),threshold:pick([undefined,null,'',0,10,20,40,80,120,-5,'abc']),days,weekDate:pick([W40,W41,W42]),today:isoAfter(W40,Math.floor(rnd()*21))};
    const weekKey=pick([W40,W41,W42,FUTURE,undefined]);
    for(const env of envs)configure(env,o);
    const want=decisionOf(ref.v189.futureOvernightAnalysis(p,weekKey)),label='cas '+t+' '+JSON.stringify(o)+' '+weekKey;
    assert.deepEqual(decisionOfRow(fallback.terrain.overnightForPlan(p,fallback.state,undefined,weekKey)),want,label+' : overnightForPlan');
    for(const env of envs)assert.deepEqual(decisionOfRow(env.terrain.analyzeOvernightWeeks([{weekKey,plan:p}])[0]),decisionOf(env.v189.futureOvernightAnalysis(p,weekKey)),label+' : analyzeOvernightWeeks');
    seen.set(want.reason,(seen.get(want.reason)||0)+1);
  }
  return seen;
}
{
  const seen=oracle([R,F],600,20261002,(id,u,v)=>at(id,u*260,v*260));
  for(const reason of ['candidate','disabled','no-future-pair','too-close','threshold','mandatory-no-useful'])assert((seen.get(reason)||0)>=10,'l’oracle plan doit couvrir le motif '+reason+' ('+(seen.get(reason)||0)+')');
}
/* Vraies distances (hav et baseObj du noyau), domicile type Lyon. */
{
  const HR=load(RUNTIME,{coreDistances:true});HR.v189.repair();
  const HF=load(['planning-day-origin.js','terrain-planning-v1.js','auto-planning-fix.js'],{coreDistances:true});
  const near=(id,lat,lon)=>({id,enseigne:'Enseigne '+id,ville:'Ville-Test '+id,adresse:'1 rue Test',lat,lon});
  // Cas terrain V263.4 : fin à ~39 km, reprise à ~52 km, 13 km entre les deux.
  const rows=plan({Lundi:[near('t1',45.5860,5.2740)],Mardi:[near('t2',45.5660,5.4440)]});
  for(const [mode,reason] of [['auto','too-close'],['mandatory','candidate']]){
    for(const env of [HR,HF])configure(env,{mode,threshold:80});
    const want=decisionOf(HF.v189.futureOvernightAnalysis(rows,FUTURE));
    assert.equal(want.reason,reason);
    assert.deepEqual(decisionOfRow(HF.terrain.overnightForPlan(rows,HF.state,undefined,FUTURE)),want,'vraies distances / '+mode+' : repli');
    assert.deepEqual(decisionOfRow(HR.terrain.analyzeOvernightWeeks([{weekKey:FUTURE,plan:rows}])[0]),want,'vraies distances / '+mode+' : runtime');
  }
  const seen=oracle([HR,HF],300,451,(id,u,v)=>near(id,45.764+u*2.6,4.8357+v*3.6));
  assert((seen.get('candidate')||0)>=10&&(seen.get('too-close')||0)>=5,'l’oracle haversine doit proposer et refuser');
}

/* ── 10 bis. Point d'entrée réel : generateThreeWeekSnail({start: W40}) ───────────────── */
async function threeWeekEntryPoint(){
  const G=load(RUNTIME);G.v189.repair();
  const persisted=[];
  G.ctx.ChefReliability={checkpoint(){},capture:st=>({state:JSON.parse(JSON.stringify(st)),archive:{},range:null}),persist:bundle=>persisted.push(bundle)};
  G.ctx.havBase=s=>flat({x:0,y:0},s);
  const stores=Array.from({length:18},(_,i)=>Object.assign(at('far-'+pad(i+1),100+i*2,(i%3)*4),{lat:45+i/100,lon:5,active:true}));
  configure(G,{mode:'auto',threshold:80});
  Object.assign(G.state.settings,{target:5,maxVisitsPerDay:2,startTime:'08:30',endTime:'23:00',visitMinutes:30});
  G.state.stores=stores;
  G.state.hotelReservations={[W41]:{fromDate:W41,toDate:'2026-10-06',hotelName:'Hôtel Test',reference:'R-2',address:'',lat:null,lon:null,zone:'Ville-Test'}};
  const original=G.state,reservations=JSON.stringify(original.hotelReservations);
  const api=G.ctx.StoreRunnerOvernightV182,owner=api.analyze,calls=[];
  api.analyze=function(p,weekKey){const before=JSON.stringify(p),out=owner.apply(this,arguments);calls.push({plan:p,weekKey,argCount:arguments.length,unchanged:JSON.stringify(p)===before});return out};
  let built;try{built=await G.terrain.generateThreeWeekSnail({start:W40})}finally{api.analyze=owner}
  assert.deepEqual(Array.from(built.weeks,w=>w.weekKey),[W40,W41,W42]);
  assert.deepEqual(calls.map(c=>c.weekKey),[W40,W41,W42],'le cycle analyse W40, W41 et W42 avec leur propre weekKey');
  assert.deepEqual(calls.map(c=>c.argCount),[2,2,2]);
  assert(calls.every(c=>c.unchanged),'l’analyse ne modifie aucun plan');
  calls.forEach((c,i)=>assert.equal(c.plan,built.weeks[i].plan));
  assert.equal(persisted.length,1);
  const report=persisted[0].range.overnightReport;
  assert.equal(report,built.overnightReport,'le rapport persisté est celui du cycle');
  report.forEach((row,i)=>{
    assert.equal(row.weekKey,built.weeks[i].weekKey);
    assert.deepEqual(decisionOfRow(row),decisionOf(owner(built.weeks[i].plan,built.weeks[i].weekKey)),row.weekKey+' : décision du propriétaire');
  });
  assert(!report[0].selected||report[0].best.fromDate>=TODAY,'W40 : aucune nuit passée');
  for(const [i,week] of [[1,W41],[2,W42]]){
    assert.equal(report[i].selected,true,week+' : nuit éloignée retenue');
    assert(report[i].best.fromDate>=week&&report[i].best.toDate<=isoAfter(week,4),week+' : dates de sa propre semaine');
  }
  assert.equal(JSON.stringify(original.hotelReservations),reservations,'réservation existante intacte');
  assert.equal(JSON.stringify(persisted[0].state.hotelReservations),reservations,'aucune réservation créée, supprimée ni modifiée');
}

/* ══ H1.1 — le rapport persisté et affiché garde la décision du propriétaire ═══════════════ */
const RANGE_KEY='chef_sector_range_v1';
/* Chaîne de production autour d'un cycle imposé : le générateur intérieur rend des semaines fixes,
   déjà optimisées cross-day (donc sans rééquilibrage V185), après avoir écrit sa période ; la vraie
   enveloppe V185 (patchThreeWeekGeography → persistSnailGeography → terrainOvernightRow) suit. */
function v185Chain(files,weeks,options){
  const env=load(files),legacy=env.ctx.StoreRunnerOvernightV182.analyze;   // copie locale V185, avant le démarrage de V189
  if(env.v189)env.v189.repair();
  configure(env,Object.assign({mode:'auto',threshold:80,days:['Lundi','Mardi','Jeudi','Vendredi']},options));
  env.terrain.generateThreeWeekSnail=async()=>{env.storage.set(RANGE_KEY,JSON.stringify({start:W40,weeks:3,overnightReport:'rapport du moteur terrain'}));return{weeks,crossDay:{applied:true}}};
  assert.equal(env.ctx.StoreRunnerGeographyV185.patchThreeWeeks(),true,'enveloppe V185 posée sur le cycle');
  return Object.assign(env,{legacy});
}
/* Mercredi off sur les trois semaines ; aujourd'hui mercredi 30/09. */
const H11_WEEKS=()=>[
  {weekKey:W40,manual:false,frozenDays:['Lundi','Mardi'],plan:plan({Lundi:[at('w40-a',90)],Mardi:[at('w40-b',100)]})},  // nuit du lundi 28/09, passée
  {weekKey:W41,manual:false,frozenDays:[],plan:plan({Mardi:[at('w41-a',90)],Jeudi:[at('w41-b',100)]})},               // Mardi → Jeudi n'est pas une nuit
  {weekKey:W42,manual:false,frozenDays:[],plan:plan({Lundi:[at('w42-a',90)],Mardi:[at('w42-b',100)]})}                // nuit valide
];
/* Lecture historique V185 d'une semaine (son repli) et vue comparable d'une ligne de rapport. */
function legacyView(analyze,week){
  const a=analyze(week.plan),best=a.candidate||(a.reason==='threshold'?a.bestRemote:(a.mode==='never'?a.bestRemote||a.best:null))||null;
  return{weekKey:week.weekKey,mode:a.mode,threshold:a.threshold,selected:!!a.candidate,reason:REPORT_REASON(a.reason),night:best?best.night:null};
}
const rowView=r=>({weekKey:r.weekKey,mode:r.mode,threshold:r.threshold,selected:r.selected,reason:r.reason,night:r.best?r.best.night:null});

/* ── A. Vraie enveloppe V185 : W40 passée, W41 mercredi off, W42 valide ──────────────────── */
async function v185KeepsTheOwnerDecision(){
  const weeks=H11_WEEKS(),env=v185Chain(RUNTIME,weeks),owner=env.ctx.StoreRunnerOvernightV182.analyze;
  assert.equal(owner,env.v189.futureOvernightAnalysis,'V189 possède la décision');
  env.state.hotelReservations={[W42]:{fromDate:W42,toDate:'2026-10-13',hotelName:'Hôtel Test',reference:'R-3',address:'',lat:null,lon:null,zone:'Ville-Test w42-a'}};
  const reservations=JSON.stringify(env.state.hotelReservations),plans=JSON.stringify(weeks.map(week=>week.plan));
  const result=await env.terrain.generateThreeWeekSnail({start:W40});
  const persisted=JSON.parse(env.storage.get(RANGE_KEY)).overnightReport,[w40,w41,w42]=Array.from(result.overnightReport);
  const problems=[];
  if(w40.selected||(w40.best&&w40.best.night==='Nuit Lundi → Mardi'))problems.push('W40 : V185 ressuscite la nuit passée Lundi → Mardi');
  if(w41.selected||(w41.best&&w41.best.night==='Nuit Mardi → Jeudi'))problems.push('W41 : V185 prend Mardi → Jeudi alors que mercredi est off');
  if(!w42.selected)problems.push('W42 : la nuit valide doit rester retenue');
  assert.deepEqual(problems,[],problems.join(' ; '));
  assert.deepEqual([w42.best.night,w42.best.fromDate,w42.best.toDate,w42.best.saving],['Nuit Lundi → Mardi',W42,'2026-10-13',180]);
  // Trois endroits, une décision : result.overnightReport, range.overnightReport persisté, propriétaire.
  assert.equal(JSON.stringify(persisted),JSON.stringify(result.overnightReport),'le rapport persisté est celui du résultat');
  weeks.forEach((week,i)=>{
    const want=decisionOf(owner(week.plan,week.weekKey));
    for(const [where,row] of [['result.overnightReport',result.overnightReport[i]],['range.overnightReport',persisted[i]]]){
      assert.equal(row.weekKey,week.weekKey,where+' : weekKey');
      assert.deepEqual(decisionOfRow(row),want,week.weekKey+' / '+where+' : décision du propriétaire');
      assert.equal(row.reason,REPORT_REASON(want.reason),week.weekKey+' / '+where+' : motif du rapport');
    }
  });
  // Affiché : le compte rendu est rendu depuis la période persistée (section découchés seule).
  const blocks=env.insights().split(/🕘 Horaires|📅 Répartition|🎯 Couverture/)[0].split('Semaine du ').slice(1);
  assert.equal(blocks.length,3);
  assert(blocks[0].startsWith('28/09')&&blocks[0].includes('Retour domicile'),'W40 affichée sans nuit');
  assert(blocks[1].startsWith('05/10')&&blocks[1].includes('Retour domicile')&&!blocks[1].includes('Mardi → Jeudi'),'W41 affichée sans Mardi → Jeudi');
  assert(blocks[2].startsWith('12/10')&&blocks[2].includes('🌙 Lundi → Mardi · ~180 km'),'W42 affichée avec sa nuit');
  assert.equal(JSON.stringify(weeks.map(week=>week.plan)),plans,'aucun magasin déplacé');
  assert.equal(JSON.stringify(env.state.hotelReservations),reservations,'aucune réservation créée, supprimée ni modifiée');
}

/* ── B. Repli V185 : moteur terrain absent ou inutilisable → chemin historique, sans exception ── */
async function v185FallbackWithoutTerrain(){
  for(const [label,breakApi] of [
    ['API absente',api=>{delete api.analyzeOvernightWeeks}],
    ['API en échec',api=>{api.analyzeOvernightWeeks=()=>{throw new Error('panne')}}],
    ['aucune ligne',api=>{api.analyzeOvernightWeeks=()=>[]}],
    ['ligne inexploitable',api=>{api.analyzeOvernightWeeks=()=>[{weekKey:W40}]}]
  ]){
    const weeks=H11_WEEKS(),env=v185Chain(RUNTIME,weeks);breakApi(env.terrain);
    const result=await env.terrain.generateThreeWeekSnail({start:W40}),want=weeks.map(week=>legacyView(env.legacy,week));
    assert.deepEqual(Array.from(result.overnightReport,rowView),want,label+' : repli historique V185');
    assert.deepEqual(Array.from(JSON.parse(env.storage.get(RANGE_KEY)).overnightReport,rowView),want,label+' : repli historique persisté');
  }
  /* Sans V189, le propriétaire exposé est la copie V185 elle-même : la délégation passe par lui une
     fois par semaine, avec sa weekKey, et s'arrête là (aucune récursion). */
  const weeks=H11_WEEKS(),env=v185Chain(['terrain-planning-v1.js','v182-fixes.js'],weeks),api=env.ctx.StoreRunnerOvernightV182,own=api.analyze,calls=[];
  assert.equal(env.v189,undefined);
  api.analyze=function(p,weekKey){calls.push(weekKey);return own.apply(this,arguments)};
  const result=await env.terrain.generateThreeWeekSnail({start:W40});
  assert.deepEqual(calls,[W40,W41,W42],'une analyse par semaine, avec sa weekKey');
  assert.deepEqual(Array.from(result.overnightReport,rowView),weeks.map(week=>legacyView(own,week)),'décision de la copie V185 mise en forme par le rapport terrain');
  assert(Array.from(result.overnightReport).every(row=>typeof row.analysisReason==='string'),'ligne du rapport terrain');
}

/* ── A bis. Cycle réel : moteur terrain puis enveloppe V185 de production ─────────────────── */
async function realCycleThroughV185(){
  /* Rééquilibrage V185 compris (aucun historique de visite). La semaine affichée W40 est entamée :
     lundi et mardi, passés, gardent une paire très éloignée que l'ancienne copie V185 reprenait. */
  const G=load(RUNTIME);G.v189.repair();
  G.ctx.ChefReliability={checkpoint(){},capture:(st,s)=>({state:JSON.parse(JSON.stringify(st)),archive:JSON.parse(s.getItem('chef_sector_plan_archive_v1')||'{}'),range:null}),
    persist:(bundle,s)=>{s.setItem('chef_sector_plan_archive_v1',JSON.stringify(bundle.archive||{}));s.setItem(RANGE_KEY,JSON.stringify(bundle.range))}};
  G.ctx.havBase=s=>flat({x:0,y:0},s);
  configure(G,{mode:'auto',threshold:0});
  Object.assign(G.state.settings,{target:5,maxVisitsPerDay:2,startTime:'08:30',endTime:'23:00',visitMinutes:30});
  G.state.stores=Array.from({length:18},(_,i)=>Object.assign(at('far-'+pad(i+1),100+i*2,(i%3)*4),{lat:45+i/100,lon:5,active:true}));
  G.state.plan=plan({Lundi:[at('past-a',200)],Mardi:[at('past-b',210)]});
  assert.equal(G.ctx.StoreRunnerGeographyV185.patchThreeWeeks(),true,'enveloppe V185 posée sur le cycle');
  const owner=G.ctx.StoreRunnerOvernightV182.analyze,built=await G.terrain.generateThreeWeekSnail({start:W40});
  const report=JSON.parse(G.storage.get(RANGE_KEY)).overnightReport;
  assert.deepEqual(Array.from(built.weeks,w=>w.weekKey),[W40,W41,W42]);
  assert.deepEqual(Array.from(built.weeks[0].plan.Lundi,s=>s.id),['past-a'],'W40 : la journée passée est conservée');
  assert.equal(JSON.stringify(report),JSON.stringify(built.overnightReport),'rapport persisté = rapport du résultat');
  assert.notEqual(report[0].best&&report[0].best.night,'Nuit Lundi → Mardi','W40 : jamais la nuit passée');
  assert(report[0].selected&&report[0].best.fromDate>=TODAY,'W40 : une nuit future');
  built.weeks.forEach((week,i)=>assert.deepEqual(decisionOfRow(report[i]),decisionOf(owner(week.plan,week.weekKey)),week.weekKey+' : rapport persisté = décision du propriétaire'));
  assert.match(G.insights(),/Mode Automatique · seuil 0 km</,'seuil 0 affiché tel quel');
}

/* ── D. En-tête du compte rendu terrain : le seuil réel ──────────────────────────────────── */
function terrainHeaderShowsTheRealThreshold(){
  const U=load(['terrain-planning-v1.js']);
  const header=(mode,threshold)=>{U.storage.set(RANGE_KEY,JSON.stringify({overnightReport:[{weekKey:FUTURE,mode,threshold,selected:false,reason:'no-candidate',analysisReason:'too-close',best:null}]}));return (U.insights().match(/Mode [^<]*/)||[''])[0]};
  assert.equal(header('auto',0),'Mode Automatique · seuil 0 km','un seuil explicite à 0 s’affiche 0 km, jamais 80');
  assert.equal(header('auto',40),'Mode Automatique · seuil 40 km');
  for(const invalid of [undefined,-5,'abc'])assert.equal(header('auto',invalid),'Mode Automatique · seuil 80 km','seuil illisible : 80 km par défaut');
  assert.equal(header('mandatory',0),'Mode Obligatoire');
  assert.equal(header('never',0),'Mode Jamais');
}

(async()=>{
  const failures=[];
  for(const test of [threeWeekEntryPoint,v185KeepsTheOwnerDecision,v185FallbackWithoutTerrain,realCycleThroughV185,terrainHeaderShowsTheRealThreshold]){
    try{await test()}catch(e){failures.push(test.name+' — '+(e&&e.message||e))}
  }
  if(failures.length){console.error(failures.join('\n'));process.exit(1)}
  console.log('terrain overnight contract H1 + H1.1 : parité V189 (auto, obligatoire, jamais), W40/W41/W42, lecture seule, rapport V185 persisté et affiché, seuil 0 OK');
})().catch(e=>{console.error(e);process.exit(1)});
