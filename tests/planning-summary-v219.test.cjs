const assert=require('assert');
const Summary=require('../planning-summary-v219.js');

const archive={
  '2026-09-07':{
    weekMonday:'2026-09-07',
    plan:{Lundi:[],Mardi:[],Mercredi:[{id:'d'}],Jeudi:[],Vendredi:[],Samedi:[]}
  }
};
const memory=new Map([['chef_sector_plan_archive_v1',JSON.stringify(archive)]]);
const win={
  __chefStorage:{getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value))},
  havBase:()=>NaN,
  hav:(a,b)=>{if(b&&b.id==='base')return 8;if(a&&a.id==='a'&&b&&b.id==='b')return 12;return NaN},
  baseObj:()=>({id:'base'}),
  storeVisitDuration:(store)=>({a:45,b:60,c:75,d:50}[store&&store.id]||60),
  overnightCandidate:()=>({fromDate:'2026-09-16',toDate:'2026-09-17'})
};
const stores=[
  {id:'a',active:true,intervalDays:30},
  {id:'b',active:true,intervalDays:30},
  {id:'c',active:true,intervalDays:30},
  {id:'d',active:true,intervalDays:30},
  {id:'e',active:true,intervalDays:30},
  {id:'off',active:false,intervalDays:30}
];
const state={
  settings:{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],visitMinutes:60},
  stores,
  plan:{Lundi:[stores[0],stores[1]],Mardi:[stores[2]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
  visits:{e:{lastVisit:'2026-09-14',history:['2026-09-14']}},
  awayRanges:[{start:'2026-09-16'}],
  hotelReservations:{'2026-09-16':{name:'Hôtel test'}}
};
win.state=state;

assert.strictEqual(Summary.finite(NaN),0);
assert.strictEqual(Summary.finite(Infinity),0);
assert.strictEqual(Summary.safeRouteKm(win,state.plan.Lundi),20,'les segments invalides sont neutralisés sans contaminer le total');
assert.strictEqual(Summary.safeRouteKm(win,state.plan.Mardi),8);
assert(Number.isFinite(Summary.routeMinutes(win,state,state.plan.Lundi)));

const week=Summary.weekStats(win,state,new Date('2026-09-15T12:00:00'));
assert.strictEqual(week.visits,3);
assert.strictEqual(Math.round(week.km),28);
assert(Number.isFinite(week.minutes));
assert.strictEqual(week.hotels,1,'un même découché provenant de plusieurs sources reste compté une seule fois');
assert.strictEqual(week.priorities,1,'seul le magasin actif non planifié jamais visité doit remonter ici');
assert(!Object.values(week).some(v=>typeof v==='number'&&Number.isNaN(v)),'aucune métrique semaine ne doit être NaN');

const month=Summary.monthStats(win,state,new Date('2026-09-18T12:00:00'));
assert.strictEqual(month.visits,4,'le mois additionne les archives et la semaine courante sans dupliquer la semaine active');
assert(Number.isFinite(month.km));
assert(Number.isFinite(month.minutes));
assert.strictEqual(month.hotels,1);
assert(month.label.toLowerCase().includes('septembre'));
assert(!Object.values(month).some(v=>typeof v==='number'&&Number.isNaN(v)),'aucune métrique mensuelle ne doit être NaN');

assert.strictEqual(Summary.hoursLabel(0),'0 h');
assert.strictEqual(Summary.hoursLabel(217),'3 h 35');
assert.strictEqual(Summary.hoursLabel(NaN),'0 h');

// V252.1/V252.2 : le recalcul vit DANS la feuille visible .settingsInner et peut
// recevoir le polish compact sans casser le déplacement dans un DOM minimal.
const inner={children:[],appendChild(node){if(node.parentNode&&node.parentNode.children){const i=node.parentNode.children.indexOf(node);if(i>=0)node.parentNode.children.splice(i,1)}node.parentNode=this;this.children.push(node);return node},querySelector(){return null}};
const settings={children:[],querySelector(sel){return sel==='.settingsInner'?inner:null},appendChild:inner.appendChild};
const oldParent={children:[],appendChild(node){node.parentNode=this;this.children.push(node);return node}};
const classes=new Set();
const repair={id:'planningRepairSettings',parentNode:null,firstElementChild:null,classList:{add(name){classes.add(name)}},removeAttribute(){},querySelector(){return null}};oldParent.appendChild(repair);
const uiWin={document:{getElementById(id){if(id==='planningSettings')return settings;if(id==='planningRepairSettings')return repair;return null}}};
assert.strictEqual(Summary.repairPlanningSettingsUi(uiWin),true,'le correctif doit trouver la feuille Réglages');
assert.strictEqual(repair.parentNode,inner,'le bloc recalcul doit être déplacé dans .settingsInner, pas derrière la feuille');
assert(inner.children.includes(repair),'le bouton doit être rendu dans le contenu scrollable visible');
assert(classes.has('planningRepairCardV2522'),'le polish compact doit être appliqué à la carte de recalcul');

console.log('planning-summary-v219: OK');
