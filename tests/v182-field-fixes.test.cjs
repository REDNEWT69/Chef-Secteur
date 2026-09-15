const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync(path.join(process.cwd(),'v182-fixes.js'),'utf8');
const index=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
const sw=fs.readFileSync(path.join(process.cwd(),'sw.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(process.cwd(),'version.json'),'utf8'));

assert(index.includes("const BUILD_REV='20260915-overnightguard184'"),'index doit publier le build V184');
assert(sw.includes('const BUILD_REV = "20260915-overnightguard184"'),'sw doit publier le même build V184');
assert.equal(version.latestBuild,'20260915-overnightguard184');
assert.equal(version.displayVersion,'184');
assert(index.includes("'./v182-fixes.js'"),'le runtime de fiabilisation doit rester chargé');
assert(index.includes('id="srRuntimeBoot"'),'le boot historique doit être masqué pendant le rendu moderne');
assert(index.includes('<img src="./app-icon.svg?rev=20260915-overnightguard184" alt="S-RUNNER">'),'le loader doit afficher le vrai logo S-RUNNER');
assert(sw.includes('"./v182-fixes.js"'),'les correctifs terrain doivent fonctionner hors ligne après installation');
assert(source.includes('removeHomePilotageShortcut'),'Pilotage doit rester retiré de l’accueil');

/* V184 : le flux 3 semaines doit utiliser exactement la même capacité planning que
   la génération semaine V181. Boulanger reste à 2 crédits métier mais réserve tout le
   budget journalier sauf une unité pendant la génération automatique. */
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
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14'},
  plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
  stores:[],excluded:{},manualWeekEdits:{}
};
const ctx={
  console,state,document,confirm(){return true},CustomEvent:function(type,opts){this.type=type;this.detail=opts&&opts.detail},
  setTimeout(){return 0},addEventListener(){},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  StoreRunnerSectorPilotage:{},
  hav(a,b){return Math.abs(Number(a.x||0)-Number(b.x||0))},
  baseObj(){return{x:0}}
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
state.plan.Lundi=[{id:'a',x:100,enseigne:'A',ville:'Loin'}];
state.plan.Mardi=[{id:'b',x:90,enseigne:'B',ville:'Loin'}];
let overnight=ctx.StoreRunnerOvernightV182.analyze();
assert.equal(overnight.threshold,0,'un seuil explicite à 0 km doit rester 0');
assert.equal(overnight.reason,'candidate','avec seuil 0 une économie positive doit proposer un découché');
assert.equal(Math.round(overnight.candidate.saving),180);
state.profile.overnightMode='never';
overnight=ctx.StoreRunnerOvernightV182.analyze();
assert.equal(overnight.reason,'disabled');
state.profile.overnightMode='auto';state.profile.overnightMinSaving=200;
overnight=ctx.StoreRunnerOvernightV182.analyze();
assert.equal(overnight.reason,'threshold','le diagnostic doit distinguer un seuil non atteint');

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

console.log('V184 guard: OK · Boulanger 3 semaines protégé, GPS masqué, sauvegarde Secteur neutre');