const fs=require('fs');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync('period-day-slider.js','utf8');
const navigation=fs.readFileSync('navigation-controller.js','utf8');
assert.match(source,/function focusTodayIfVisible\(now\)/,'V205 doit exposer une sélection ciblée du jour courant');
assert.match(source,/store-runner:planning-user-opened/,'le slider doit réagir au signal d’ouverture utilisateur du Planning');
assert.doesNotMatch(source,/panelObserver/,'une activation technique de planPanel ne doit plus recentrer le jour');
assert.match(navigation,/function isDirectPlanningEntry\(btn\)/,'la navigation doit distinguer une vraie entrée utilisateur dans Planning');
assert.match(navigation,/store-runner:planning-user-opened/,'la navigation doit émettre le signal dédié après un tap vers Planning');
assert.doesNotMatch(source,/setInterval\(/,'V205 ne doit ajouter aucune surveillance permanente');

const RANGE='chef_sector_range_v1',ARCHIVE='chef_sector_plan_archive_v1';
const data={
  [RANGE]:JSON.stringify({start:'2026-09-14',end:'2026-09-18',workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']}),
  [ARCHIVE]:JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:{Lundi:[{id:'a'}],Mardi:[{id:'b'}],Mercredi:[],Jeudi:[{id:'d'}],Vendredi:[],Samedi:[]}}})
};
const storage={getItem:k=>Object.prototype.hasOwnProperty.call(data,k)?data[k]:null,setItem(k,v){data[k]=String(v)},removeItem(k){delete data[k]}};
const planPanel={classList:{active:true,contains(name){return name==='active'&&this.active}}};
const dayTabs={parentNode:null,querySelector(){return null}};
const weekDate={value:'2026-09-14'};
const document={
  readyState:'loading',
  addEventListener(){},
  getElementById(id){return id==='planPanel'?planPanel:id==='dayTabs'?dayTabs:id==='weekDate'?weekDate:null},
  querySelector(){return null},
  createElement(){return{}}
};
const state={
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14'},
  stores:[],
  plan:{Lundi:[{id:'a'}],Mardi:[{id:'b'}],Mercredi:[],Jeudi:[{id:'d'}],Vendredi:[],Samedi:[]}
};
let selected='Lundi';
const ctx={
  console,Date,JSON,Object,Array,String,Number,Math,Map,Set,state,document,
  __chefStorage:storage,localStorage:storage,
  requestAnimationFrame(){return 1},setTimeout(){return 1},
  addEventListener(){},save(){},
  selectPlanningDay(day){selected=day},
  window:null
};
ctx.window=ctx;
vm.runInNewContext(source,ctx);
assert(ctx.StoreRunnerPeriodDaySlider&&typeof ctx.StoreRunnerPeriodDaySlider.focusToday==='function');

assert.equal(ctx.StoreRunnerPeriodDaySlider.focusToday(new Date('2026-09-17T12:00:00')),true,'une vraie ouverture utilisateur dans la période courante doit sélectionner aujourd’hui');
assert.equal(ctx.selectedPlanningDay,'Jeudi');
assert.equal(selected,'Jeudi');
assert.equal(state.settings.weekDate,'2026-09-14');
assert.equal(weekDate.value,'2026-09-14');
assert.equal(state.plan.Jeudi[0].id,'d','le recentrage doit charger le planning existant, pas le modifier');

planPanel.classList.active=false;
ctx.selectedPlanningDay='Mardi';selected='Mardi';
assert.equal(ctx.StoreRunnerPeriodDaySlider.focusToday(new Date('2026-09-17T12:00:00')),false,'hors du panneau Planning, V205 ne doit jamais forcer le jour courant');
assert.equal(ctx.selectedPlanningDay,'Mardi');

planPanel.classList.active=true;
data[RANGE]=JSON.stringify({start:'2026-09-21',end:'2026-09-25',workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']});
const before=JSON.stringify(state.plan);
assert.equal(ctx.StoreRunnerPeriodDaySlider.focusToday(new Date('2026-09-17T12:00:00')),false,'une autre période volontairement consultée ne doit pas être remplacée par aujourd’hui');
assert.equal(JSON.stringify(state.plan),before);
assert.equal(ctx.selectedPlanningDay,'Mardi');

console.log('planning-auto-today-v205: OK · tap Planning vers aujourd’hui, activations techniques préservées');
