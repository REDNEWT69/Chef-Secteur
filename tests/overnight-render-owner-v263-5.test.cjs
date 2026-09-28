/* V263.5 — #overnightBox n'a qu'un rendu : celui d'auto-planning-fix.js (V189).
   v182-fixes.js (V185) programme des passes de réparation différées (setTimeout après
   planning-updated, home-rendered, data-restored, retour au premier plan, et 120/500/1200 ms
   au chargement). Chacune se terminait par son ancien rendu, qui passait APRÈS celui de V189 :
   la réservation d'hôtel disparaissait du bandeau et les nuits passées redevenaient visibles.
   On charge les deux modules dans leur ordre réel et on rejoue ces passes. */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const read=f=>fs.readFileSync(path.join(process.cwd(),f),'utf8');
const WEEK='2099-01-05';
const box={innerHTML:''};
const timers=[];
const elements={overnightBox:box};
const document={
  readyState:'complete',hidden:false,head:{appendChild(){}},
  addEventListener(){},dispatchEvent(){},
  getElementById(id){return elements[id]||null},
  querySelector(){return null},querySelectorAll(){return[]},
  createElement(tag){return{tagName:String(tag).toUpperCase(),dataset:{},style:{},classList:{add(){},remove(){}},setAttribute(){},remove(){},appendChild(){}}}
};
const at=(id,x)=>({id,enseigne:'Enseigne '+id,ville:'Ville-Test '+id,adresse:'1 rue Test',x,y:0});
const state={
  profile:{overnightMode:'auto',overnightMinSaving:20},
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:WEEK},
  plan:{Lundi:[at('a',90)],Mardi:[at('b',100)],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
  stores:[],excluded:{},locks:{},visits:{},appointments:[],manualWeekEdits:{},
  hotelReservations:{[WEEK]:{fromDate:WEEK,toDate:'2099-01-06',hotelName:'Hôtel Test',reference:'REF-263-5',address:'',lat:null,lon:null}}
};
const ctx={
  console,state,document,confirm(){return true},
  CustomEvent:function(type,opts){this.type=type;this.detail=opts&&opts.detail},
  setTimeout(fn){timers.push(fn);return timers.length},addEventListener(){},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  StoreRunnerSectorPilotage:{},
  hav(a,b){return Math.hypot(Number(a.x||0)-Number(b.x||0),Number(a.y||0)-Number(b.y||0))},
  baseObj(){return{x:0,y:0}},storeVisitCredit(){return 1}
};
ctx.window=ctx;
// Ordre réel d'index.html : v182-fixes.js, puis planning-day-origin.js, puis auto-planning-fix.js.
vm.runInNewContext(read('v182-fixes.js'),ctx);
vm.runInNewContext(read('planning-day-origin.js'),ctx);
vm.runInNewContext(read('auto-planning-fix.js'),ctx);

const legacy=ctx.StoreRunnerOvernightV182;
assert.equal(legacy.analyze,ctx.StoreRunnerStoreControlsV189.futureOvernightAnalysis,'V189 possède la décision');
assert.equal(legacy.render,ctx.renderOvernight,'V189 possède aussi le rendu exposé par l’API V185');

function drain(){let n=0;while(timers.length&&n++<200)timers.shift()()}
function assertOwnerView(label){
  assert.match(box.innerHTML,/Nuit sur place/,label+' : vue V189');
  assert.match(box.innerHTML,/REF-263-5/,label+' : la réservation reste affichée');
  assert.doesNotMatch(box.innerHTML,/Chercher les hôtels près de la fin de tournée/,label+' : jamais l’ancienne vue V185');
}

ctx.renderOvernight();assertOwnerView('rendu initial');
drain();assertOwnerView('passes de réparation V185 différées (chargement)');
legacy.render();assertOwnerView('API V185');

// Une passe différée ne réaffiche jamais une nuit passée : le filtre des nuits futures tient.
state.settings.weekDate='2000-01-03';
state.plan={Lundi:[at('a',90)],Mardi:[at('b',100)],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
timers.push(()=>legacy.render());drain();
assert.doesNotMatch(box.innerHTML,/Nuit Lundi → Mardi|Nuit sur place/,'une nuit passée n’est plus proposée par une passe différée');
assert.match(box.innerHTML,/nuits déjà passées sont ignorées/);

// Sans V189, la couche V185 garde son propre rendu (repli inchangé).
{
  const solo={innerHTML:''},soloTimers=[];
  const soloDoc=Object.assign({},document,{getElementById(id){return id==='overnightBox'?solo:null}});
  const soloCtx=Object.assign({},ctx,{document:soloDoc,setTimeout(fn){soloTimers.push(fn);return 1},state:JSON.parse(JSON.stringify(state))});
  soloCtx.state.settings.weekDate=WEEK;soloCtx.window=soloCtx;
  delete soloCtx.StoreRunnerOvernightV182;delete soloCtx.StoreRunnerStoreControlsV189;delete soloCtx.renderOvernight;delete soloCtx.overnightCandidate;
  vm.runInNewContext(read('v182-fixes.js'),soloCtx);
  soloCtx.StoreRunnerOvernightV182.render();
  assert.match(solo.innerHTML,/Nuit Lundi → Mardi/,'sans V189, le rendu V185 reste le repli');
}

console.log('overnight render owner V263.5 : OK');
