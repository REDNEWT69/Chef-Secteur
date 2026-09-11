const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let source=fs.readFileSync(__dirname+'/../period-day-slider.js','utf8');
assert.doesNotMatch(source,/localStorage\.getItem/,'le slider ne doit plus contourner le stockage actif de Store Runner');
assert.match(source,/window\.__chefStorage\|\|window\.localStorage/,'le slider doit utiliser __chefStorage avant localStorage');
assert.doesNotMatch(source,/scheduleBoot|\[0,80,220,500,1000,1800\]/,'les retries temporisés de boot doivent rester supprimés');
assert.doesNotMatch(source,/addEventListener\(['"](?:load|focus)['"]/,'le slider ne doit plus se réveiller sur load/focus');
assert.doesNotMatch(source,/visibilitychange/,'le slider ne doit plus se réveiller à chaque retour de visibilité');
assert.match(source,/new MutationObserver/,'un rattrapage ciblé doit rester disponible si le rendu historique remplace les onglets');
assert.match(source,/tabObserver\.observe\(box,\{childList:true\}\)/,'l’observer doit rester limité à #dayTabs');
assert.match(source,/store-runner:data-restored/,'une restauration de données doit rafraîchir la période');
source=source.replace(/\}\)\(\);\s*$/,'window.__periodTest={loadDate,range,load};})();');

const RANGE='chef_sector_range_v1',ARCHIVE='chef_sector_plan_archive_v1';
const localData={
  [RANGE]:JSON.stringify({start:'2026-01-05',end:'2026-01-09',workDays:['Lundi']}),
  [ARCHIVE]:JSON.stringify({})
};
const activeData={
  [RANGE]:JSON.stringify({start:'2026-09-14',end:'2026-09-18',workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']}),
  [ARCHIVE]:JSON.stringify({
    '2026-09-14':{weekMonday:'2026-09-14',plan:{Lundi:[{id:'new',enseigne:'Darty',ville:'Lyon'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}
  })
};
const makeStorage=data=>({getItem:key=>Object.prototype.hasOwnProperty.call(data,key)?data[key]:null,setItem(key,value){data[key]=String(value)},removeItem(key){delete data[key]}});
const state={settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-07'},stores:[{id:'new',enseigne:'Darty',ville:'Lyon'}],plan:{Lundi:[{id:'old'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}};
let scheduled=null;
const weekInput={value:'2026-09-07'};
const ctx={state,console,Date,JSON,Object,Array,String,Number,Math,Map,Set,setTimeout,requestAnimationFrame:fn=>{scheduled=fn},localStorage:makeStorage(localData),__chefStorage:makeStorage(activeData),save(){},selectPlanningDay(){},addEventListener(){},document:{readyState:'loading',addEventListener(){},getElementById:id=>id==='weekDate'?weekInput:null},window:null};
ctx.window=ctx;
vm.runInNewContext(source,ctx);
const T=ctx.__periodTest;
assert(T,'le test doit pouvoir accéder au cœur du slider');
let r=T.range();
assert.equal(r.start.getFullYear(),2026);assert.equal(r.start.getMonth(),8);assert.equal(r.start.getDate(),14,'la période doit venir de __chefStorage et non du localStorage natif');
const beforePlan=JSON.stringify(state.plan),beforeWeek=state.settings.weekDate;
assert.equal(T.loadDate(new Date('2026-09-21T12:00:00')),false,'une semaine absente de l’archive doit être refusée');
assert.equal(JSON.stringify(state.plan),beforePlan,'une archive manquante ne doit pas réétiqueter le plan courant');
assert.equal(state.settings.weekDate,beforeWeek,'une archive manquante ne doit pas changer la semaine affichée');
assert.equal(weekInput.value,'2026-09-07');
assert.equal(T.loadDate(new Date('2026-09-14T12:00:00')),true,'une semaine archivée doit rester navigable');
assert.equal(state.settings.weekDate,'2026-09-14');
assert.equal(weekInput.value,'2026-09-14');
assert.equal(state.plan.Lundi[0].id,'new');
assert.equal(typeof scheduled,'function','le rafraîchissement visuel doit être regroupé au prochain frame');
console.log('PASS: le slider de période utilise le stockage actif, refuse les semaines d’archive manquantes et reste événementiel sans retries focus/visibilité.');
