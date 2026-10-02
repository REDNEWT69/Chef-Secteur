const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync(path.join(process.cwd(),'v182-fixes.js'),'utf8');
const index=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
const sw=fs.readFileSync(path.join(process.cwd(),'sw.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(process.cwd(),'version.json'),'utf8'));

assert.match(String(version.displayVersion||''),/^\d+$/,'la version publiée doit rester numérique');
assert.match(String(version.latestBuild||''),/^\d{8}-[a-z0-9-]+$/i,'le build publié doit conserver son format');
assert(index.includes("const BUILD_REV='"+version.latestBuild+"'"),'index doit publier le build déclaré par version.json');
assert(sw.includes('const BUILD_REV = "'+version.latestBuild+'"'),'sw doit publier le même build que version.json');
assert(index.includes("'./v182-fixes.js'"),'le runtime de fiabilisation doit rester chargé');
assert(!index.includes("'./priority-campaign-v187.js'"),'la campagne échue V187 ne doit plus être chargée');
assert(index.includes('id="storeRunnerBoot" data-store-runner-boot'),'V234 doit garder un loader unique devant le rendu moderne');
assert(!index.includes('id="srRuntimeBoot"'),'l’ancien loader srRuntimeBoot ne doit plus être injecté');
assert(index.includes('<img src="./app-icon.svg?rev='+version.latestBuild+'" alt="S-RUNNER">'),'le loader doit afficher le vrai logo S-RUNNER avec le build courant');
assert(sw.includes('"./v182-fixes.js"'),'les correctifs terrain doivent fonctionner hors ligne après installation');
assert(!sw.includes('"./priority-campaign-v187.js"'),'la campagne échue V187 ne doit plus être précachée');
assert(source.includes('removeHomePilotageShortcut'),'Pilotage doit rester retiré de l’accueil');
assert(!source.includes('srRuntimeBoot'),'V234 : le voile de démarrage n’appartient plus à ce module');

/* B2 : V184 reste seulement propriétaire de la neutralité profil et du masquage GPS.
   Le drapeau de génération 3 semaines appartient désormais à V185. */
assert(!index.includes('__v184PlanningCapacity'),'V184 ne doit plus envelopper le générateur 3 semaines');
assert(!index.includes('function patchThreeWeeks()'),'le patch legacy 3 semaines V184 doit être supprimé');
assert(source.includes('window.__storeRunnerPlanningGenerationActive=true'),'V185 doit conserver le drapeau lu par Agenda');
assert(source.includes('patchThreeWeekGeography'),'V185 doit rester autour du moteur 3 semaines');
assert(!index.includes('terrainSnailBtn'),'V184 ne doit plus réparer le bouton terrain retiré');
assert(!index.includes('window.StoreRunnerV184='),'V184 ne doit plus exposer une API de diagnostic sans consommateur');
assert(index.includes('pBaseLat')&&index.includes('pBaseLon'),'V184 doit repérer les coordonnées internes');
assert(index.includes('grid.hidden=true')&&index.includes('grid.style.display'),'Latitude et Longitude doivent être masquées sans supprimer les valeurs GPS');
assert(index.includes('var before=clonePlan(window.state&&state.plan)'),'la sauvegarde Secteur doit capturer le planning courant');
assert(index.includes('state.plan=before'),'la sauvegarde Secteur doit restaurer le planning si un rendu annexe tente de le modifier');

const pilotageButtons=[];
const grid={
  querySelector(sel){return sel==='[data-pilotage]'?pilotageButtons[0]||null:null},
  insertBefore(node){pilotageButtons.unshift(node)}
};
const homeShortcut={removed:false,remove(){this.removed=true}};
const elements={
  premiumHomeV2:{},
  overnightBox:{innerHTML:''}
};
const document={
  readyState:'loading',hidden:false,
  addEventListener(){},dispatchEvent(){},
  getElementById(id){return elements[id]||null},
  querySelector(sel){return sel==='#moreSheetV2 .moreSheetGrid'?grid:null},
  querySelectorAll(sel){return sel==='#premiumHomeV2 .phPilotageShortcut'?[homeShortcut]:[]},
  createElement(tag){return{tagName:String(tag).toUpperCase(),dataset:{},classList:{add(){}},setAttribute(){},remove(){}}}
};
const state={
  profile:{overnightMode:'auto',overnightMinSaving:0},
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',maxVisitsPerDay:2},
  plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
  stores:[],excluded:{},locks:{},visits:{},appointments:[],manualWeekEdits:{}
};
const ctx={
  console,state,document,confirm(){return true},CustomEvent:function(type,opts){this.type=type;this.detail=opts&&opts.detail},
  setTimeout(){return 0},addEventListener(){},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  StoreRunnerSectorPilotage:{},
  hav(a,b){return Math.abs(Number(a.x||0)-Number(b.x||0))},
  baseObj(){return{x:0}},
  storeVisitCredit(){return 1}
};
ctx.window=ctx;
vm.runInNewContext(source,ctx);

assert.equal(typeof ctx.storeRunnerRepairMobileRuntime,'function');
ctx.storeRunnerRepairMobileRuntime();
assert.equal(pilotageButtons.length,1,'Pilotage doit être ajouté même si le menu Plus apparaît après son module');
assert.equal(pilotageButtons[0].dataset.pilotage,'1');
assert.equal(homeShortcut.removed,true,'Pilotage ne doit plus rester affiché sur l’accueil');
ctx.storeRunnerRepairMobileRuntime();
assert.equal(pilotageButtons.length,1,'la réparation Android ne doit pas dupliquer Pilotage');

assert.equal(typeof ctx.StoreRunnerOvernightV182.analyze,'function');
state.plan.Lundi=[{id:'a',x:100,enseigne:'A',ville:'Annecy'}];
state.plan.Mardi=[{id:'b',x:90,enseigne:'B',ville:'Annecy'}];
let overnight=ctx.StoreRunnerOvernightV182.analyze();
assert.equal(overnight.threshold,0,'un seuil explicite à 0 km doit rester 0');
assert.equal(overnight.reason,'candidate','deux journées éloignées et proches entre elles doivent proposer un découché');
assert.equal(Math.round(overnight.candidate.saving),180);
assert.equal(Math.round(overnight.candidate.remoteKm),90);

state.profile.overnightMode='mandatory';
state.plan.Lundi=[{id:'local-a',x:8,enseigne:'A',ville:'Ville-Test L'}];
state.plan.Mardi=[{id:'local-b',x:12,enseigne:'B',ville:'Lyon'}];
overnight=ctx.StoreRunnerOvernightV182.analyze();
assert.equal(overnight.reason,'mandatory-no-useful','le mode obligatoire ne doit pas forcer un hôtel près du domicile');
assert.equal(overnight.candidate,null);

state.profile.overnightMode='never';
overnight=ctx.StoreRunnerOvernightV182.analyze();
assert.equal(overnight.reason,'disabled');
state.profile.overnightMode='auto';state.profile.overnightMinSaving=200;
state.plan.Lundi=[{id:'a',x:100,enseigne:'A',ville:'Annecy'}];
state.plan.Mardi=[{id:'b',x:90,enseigne:'B',ville:'Annecy'}];
overnight=ctx.StoreRunnerOvernightV182.analyze();
assert.equal(overnight.reason,'threshold','le diagnostic doit distinguer un seuil non atteint');

/* V185 : les magasins d'une même zone éloignée doivent se regrouper avant de remplir
   les journées locales. Quand la zone déborde sur deux jours, ces jours sont consécutifs. */
assert.equal(typeof ctx.StoreRunnerGeographyV185.rebalance,'function');
state.profile.overnightMode='auto';state.profile.overnightMinSaving=0;state.settings.maxVisitsPerDay=2;
const geoInput={
  Lundi:[{id:'f1',x:100,enseigne:'Darty',ville:'Annecy'},{id:'l1',x:10,enseigne:'Darty',ville:'Lyon'}],
  Mardi:[{id:'f2',x:102,enseigne:'Darty',ville:'Annecy'},{id:'l2',x:12,enseigne:'Darty',ville:'Lyon'}],
  Mercredi:[{id:'f3',x:104,enseigne:'Darty',ville:'Annecy'},{id:'l3',x:14,enseigne:'Darty',ville:'Lyon'}],
  Jeudi:[{id:'f4',x:106,enseigne:'Darty',ville:'Annecy'},{id:'l4',x:16,enseigne:'Darty',ville:'Lyon'}],
  Vendredi:[],Samedi:[]
};
let geo=ctx.StoreRunnerGeographyV185.rebalance(geoInput,{weekKey:'2026-09-14'});
assert.equal(geo.ok,true,'le regroupement géographique doit conserver une solution valide');
const workDays=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const farDays=workDays.filter(day=>(geo.plan[day]||[]).some(s=>String(s.id).startsWith('f')));
assert.equal(farDays.length,2,'quatre magasins Annecy avec capacité 2 doivent tenir sur deux journées');
assert.equal(Math.abs(workDays.indexOf(farDays[0])-workDays.indexOf(farDays[1])),1,'les deux journées Annecy doivent être consécutives pour rendre le découché exploitable');
for(const day of farDays)assert.equal((geo.plan[day]||[]).filter(s=>String(s.id).startsWith('f')).length,2,'chaque journée éloignée doit être remplie avec le même cluster');

/* La capacité planning Boulanger reste prioritaire sur l'optimisation géographique. */
state.settings.maxVisitsPerDay=4;ctx.__storeRunnerPlanningGenerationActive=true;
ctx.storeVisitCredit=function(store){return store&&store.enseigne==='Boulanger'?3:store&&store.enseigne==='BUT'?2:1};
const boulInput={
  Lundi:[{id:'b1',x:100,enseigne:'Boulanger',ville:'Annecy'},{id:'x1',x:101,enseigne:'Darty',ville:'Annecy'}],
  Mardi:[{id:'b2',x:102,enseigne:'Boulanger',ville:'Annecy'},{id:'x2',x:103,enseigne:'Darty',ville:'Annecy'}],
  Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]
};
geo=ctx.StoreRunnerGeographyV185.rebalance(boulInput,{weekKey:'2026-09-14'});
assert.equal(geo.ok,true);
for(const day of workDays){
  const route=geo.plan[day]||[];
  assert.ok(route.filter(s=>s.enseigne==='Boulanger').length<=1,'V185 ne doit jamais regrouper deux Boulanger sur la même journée');
  const credits=route.reduce((n,s)=>n+ctx.storeVisitCredit(s),0);assert.ok(credits<=4,'V185 doit respecter la capacité planning Boulanger');
}

/* V220 : l'optimisation géographique ne doit plus recompacter une semaine équilibrée
   au point de recréer les jeudi/vendredi vides que l'escargot vient de corriger. */
state.settings.maxVisitsPerDay=4;ctx.storeVisitCredit=()=>1;
const coverageStores=Array.from({length:12},(_,i)=>({id:'cov-'+(i+1),x:100,enseigne:'Test',ville:'Zone'}));
const coverageInput={
  Lundi:coverageStores.slice(0,3),Mardi:coverageStores.slice(3,6),Mercredi:coverageStores.slice(6,8),
  Jeudi:coverageStores.slice(8,10),Vendredi:coverageStores.slice(10,12),Samedi:[]
};
geo=ctx.StoreRunnerGeographyV185.rebalance(coverageInput,{weekKey:'2026-09-14',preferNearFirst:true});
assert.equal(geo.ok,true,'V185 doit conserver une solution quand les cinq jours sont couvrables');
for(const day of workDays)assert.ok((geo.plan[day]||[]).length>0,'V185 ne doit pas vider '+day+' si ce jour était couvert en entrée');
const coverageIds=workDays.flatMap(day=>(geo.plan[day]||[]).map(s=>s.id));
assert.equal(coverageIds.length,12,'V185 doit conserver les 12 magasins');
assert.equal(new Set(coverageIds).size,12,'V185 ne doit créer aucun doublon pendant la réparation de couverture');
for(const day of workDays)assert.ok((geo.plan[day]||[]).length<=4,day+' doit rester sous la capacité après réparation');

const oldPlan={
  Lundi:[{id:'old-mon'}],Mardi:[{id:'old-tue'}],Mercredi:[{id:'old-wed'}],Jeudi:[{id:'old-thu'}],Vendredi:[{id:'old-fri'}],Samedi:[{id:'old-sat'}]
};
const generated={
  Lundi:[],Mardi:[],Mercredi:[{id:'new-wed'}],Jeudi:[{id:'new-thu'}],Vendredi:[{id:'new-fri'}],Samedi:[]
};
const merged=ctx.StoreRunnerPartialRangeV182.mergeWeekPlan(
  new Date('2026-09-14T12:00:00'),
  new Date('2026-09-16T12:00:00'),
  new Date('2026-09-18T12:00:00'),
  ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],generated,oldPlan
);
assert.deepEqual(merged.Lundi.map(x=>x.id),['old-mon']);
assert.deepEqual(merged.Mardi.map(x=>x.id),['old-tue']);
assert.deepEqual(merged.Mercredi.map(x=>x.id),['new-wed']);
assert.deepEqual(merged.Jeudi.map(x=>x.id),['new-thu']);
assert.deepEqual(merged.Vendredi.map(x=>x.id),['new-fri']);
assert.deepEqual(merged.Samedi.map(x=>x.id),['old-sat']);

assert(source.includes('Cette période touche une semaine déjà modifiée ou recalculée'),'une semaine protégée doit demander confirmation avant régénération partielle');
assert(source.includes("outsideIds.forEach(id=>"),'les magasins hors plage doivent être protégés pendant la génération');
assert(source.includes('patchSingleWeekGeography')&&source.includes('patchThreeWeekGeography'),'V185 doit optimiser la semaine normale et les 3 semaines escargot');
assert(source.includes('V185_REMOTE_MIN_KM=55'),'un découché local doit être bloqué par un seuil de distance au domicile');

/* Lot 3B — une visite posée pour une échéance du brief (result.deadlines, date du créneau) reste
   sur son jour pendant le rééquilibrage V185 ; les autres magasins de la semaine restent
   optimisés. L0 est verrouillé le lundi, J1 le jeudi ; D, dû le mardi 15/09, rejoindrait
   naturellement J1 le jeudi. */
const dl=(id,x)=>({id,x,enseigne:'Test',ville:'Zone '+id});
const deadlineWeek=()=>({Lundi:[dl('L0',10)],Mardi:[dl('D',50),dl('M1',10)],Mercredi:[],Jeudi:[dl('J1',50)],Vendredi:[],Samedi:[]});
const daysOf=plan=>Object.fromEntries(workDays.map(d=>[d,((plan&&plan[d])||[]).map(s=>s.id).sort().join('+')]));
const idsOf=plan=>workDays.flatMap(d=>((plan&&plan[d])||[]).map(s=>s.id)).sort();
const HISTORICAL={Lundi:'L0',Mardi:'M1',Mercredi:'',Jeudi:'D+J1',Vendredi:''},PINNED={Lundi:'L0+M1',Mardi:'D',Mercredi:'',Jeudi:'J1',Vendredi:''};
state.settings.maxVisitsPerDay=3;state.locks={L0:'Lundi',J1:'Jeudi'};

// Cas 1 — rebalance direct : sans fixedVisits, comportement historique ; avec, D reste mardi.
const historical=ctx.StoreRunnerGeographyV185.rebalance(deadlineWeek(),{weekKey:'2026-09-14',preferNearFirst:true});
assert.deepEqual(daysOf(historical.plan),HISTORICAL,'sans fixedVisits : V185 regroupe D avec J1 le jeudi (comportement historique)');
const pinned=ctx.StoreRunnerGeographyV185.rebalance(deadlineWeek(),{weekKey:'2026-09-14',preferNearFirst:true,fixedVisits:{D:'Mardi'}});
assert.equal(pinned.ok,true);
assert.deepEqual(daysOf(pinned.plan),PINNED,'fixedVisits : D reste mardi, M1 reste optimisé et rejoint L0 le lundi');
assert.deepEqual(idsOf(pinned.plan),['D','J1','L0','M1'],'aucune perte, aucun doublon');
// Cas 1b — réparation de couverture (V220) : Y, verrouillé jeudi, quitte le mercredi. Sans fixedVisits,
// D est pris comme donneur ; figé (fixedIds), jamais : comme pour un verrou, V185 renonce plutôt.
state.locks={L0:'Lundi',K:'Mardi',Y:'Jeudi',J1:'Jeudi'};
const coverageWeek=()=>({Lundi:[dl('L0',10)],Mardi:[dl('K',10),dl('D',50)],Mercredi:[dl('Y',50)],Jeudi:[dl('J1',50)],Vendredi:[],Samedi:[]});
assert.equal(daysOf(ctx.StoreRunnerGeographyV185.rebalance(coverageWeek(),{weekKey:'2026-09-14',preferNearFirst:true}).plan).Mercredi,'D','sans fixedVisits : D comble le mercredi');
const repair=ctx.StoreRunnerGeographyV185.rebalance(coverageWeek(),{weekKey:'2026-09-14',preferNearFirst:true,fixedVisits:{D:'Mardi'}});
assert.deepEqual([repair.ok,daysOf(repair.plan).Mardi],[false,'D+K'],'une visite figée n’est jamais donneuse de la réparation de couverture');
state.locks={L0:'Lundi',J1:'Jeudi'};

// Vrai wrapper 3 semaines (patchThreeWeekGeography) autour d'un faux générateur sans cross-day.
async function wrapped(result){
  const mem=new Map();
  ctx.__chefStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
  state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  ctx.StoreRunnerTerrainPlanningV1={generateThreeWeekSnail:async()=>result};
  assert.equal(ctx.StoreRunnerGeographyV185.patchThreeWeeks(),true,'V185 enveloppe le moteur 3 semaines');
  const out=await ctx.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail();
  return{out,archive:JSON.parse(mem.get('chef_sector_plan_archive_v1')||'{}')};
}
const generatedWeeks=(keys,deadlines)=>Object.assign({weeks:keys.map(weekKey=>({weekKey,plan:deadlineWeek(),manual:false,frozenDays:[]})),crossDay:{applied:false}},deadlines?{deadlines}:{});

(async function deadlinesSurviveTheThreeWeekGeography(){
  // Cas 2 — D posé pour son échéance le mardi 15/09 : il y reste, dans le résultat, state.plan et l'archive.
  const run=await wrapped(generatedWeeks(['2026-09-14'],[{storeId:'D',label:'Échéance D',dueDate:'2026-09-15',by:'placed',date:'2026-09-15'}]));
  assert.deepEqual(daysOf(run.out.weeks[0].plan),PINNED,'wrapper : D reste sur sa date d’échéance, M1 est optimisé');
  assert.deepEqual(daysOf(state.plan),PINNED,'state.plan cohérent avec le placement d’échéance');
  assert.deepEqual(daysOf(run.archive['2026-09-14'].plan),PINNED,'archive persistée cohérente avec le placement d’échéance');
  // Cas 3 — sans échéance, ou obligation tenue sans visite générée (pas de date) : strictement historique.
  for(const [label,deadlines] of [['sans échéance',null],['tenue par une visite faite',[{storeId:'D',label:'Échéance D',dueDate:'2026-09-15',by:'doneDate',date:null}]]]){
    const plain=await wrapped(generatedWeeks(['2026-09-14'],deadlines));
    assert.deepEqual(daysOf(plain.out.weeks[0].plan),HISTORICAL,label+' : V185 continue son optimisation normale');
    assert.deepEqual(daysOf(plain.archive['2026-09-14'].plan),HISTORICAL,label+' : archive historique');
  }
  // Cas 4 — échéance datée de la semaine suivante (mardi 22/09) : la semaine du 14/09 n'est pas figée.
  const other=await wrapped(generatedWeeks(['2026-09-14','2026-09-21'],[{storeId:'D',label:'Échéance D',dueDate:'2026-09-22',by:'placed',date:'2026-09-22'}]));
  assert.deepEqual(daysOf(other.out.weeks[0].plan),HISTORICAL,'semaine du 14/09 : D reste libre, comme avant');
  assert.deepEqual(daysOf(other.out.weeks[1].plan),PINNED,'semaine du 22/09 : D figé sur sa date d’échéance');
  state.locks={};delete ctx.__chefStorage;delete ctx.StoreRunnerTerrainPlanningV1;
  console.log('V185 guard: OK · zones éloignées regroupées, découché local refusé, Boulanger protégé, visites d’échéance figées');
})().catch(e=>{console.error(e);process.exitCode=1});
