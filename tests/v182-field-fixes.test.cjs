const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync(path.join(process.cwd(),'v182-fixes.js'),'utf8');
const index=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
const sw=fs.readFileSync(path.join(process.cwd(),'sw.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(process.cwd(),'version.json'),'utf8'));

assert(index.includes("const BUILD_REV='20260917-smarthome204'"),'index doit publier le build V204');
assert(sw.includes('const BUILD_REV = "20260917-smarthome204"'),'sw doit publier le même build V204');
assert.equal(version.latestBuild,'20260917-smarthome204');
assert.equal(version.displayVersion,'204');
assert(index.includes("'./v182-fixes.js'"),'le runtime de fiabilisation doit rester chargé');
assert(index.includes("'./priority-campaign-v187.js'"),'le moteur de priorités V188 doit être chargé');
assert(index.includes('id="srRuntimeBoot"'),'le boot historique doit être masqué pendant le rendu moderne');
assert(index.includes('<img src="./app-icon.svg?rev=20260917-smarthome204" alt="S-RUNNER">'),'le loader doit afficher le vrai logo S-RUNNER');
assert(sw.includes('"./v182-fixes.js"'),'les correctifs terrain doivent fonctionner hors ligne après installation');
assert(sw.includes('"./priority-campaign-v187.js"'),'le moteur de priorités V188 doit fonctionner hors ligne');
assert(source.includes('removeHomePilotageShortcut'),'Pilotage doit rester retiré de l’accueil');

/* V184 reste en place : le flux 3 semaines utilise la capacité planning Boulanger,
   l'enregistrement Secteur reste neutre pour le planning et le GPS interne est masqué. */
assert(index.includes('window.__storeRunnerPlanningGenerationActive=true'),'la génération 3 semaines doit activer la capacité planning Boulanger');
assert(index.includes('api.generateThreeWeekSnail=wrapped'),'le générateur 3 semaines public doit être enveloppé');
assert(index.includes('terrainSnailBtn')&&index.includes('api.generateThreeWeekSnail()'),'le bouton 3 semaines doit appeler le générateur enveloppé');
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
  srRuntimeBoot:{classList:{add(){}},parentNode:{},remove(){}},
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

console.log('V185 guard: OK · zones éloignées regroupées, découché local refusé, Boulanger protégé');
