const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const terrain=require('../terrain-planning-v1.js');

(function snailStartsNextMondayFromFriday(){
  const fields={rangeStart:{value:'2026-09-14',dataset:{}},weekDate:{value:'2026-09-14'}};
  const doc={getElementById:id=>fields[id]||null};
  const start=terrain.resolveSnailStart({settings:{weekDate:'2026-09-14'}},doc,new Date(2026,8,18,12));
  assert.equal(start.getFullYear(),2026);assert.equal(start.getMonth(),8);assert.equal(start.getDate(),21,
    'vendredi 18/09, l’escargot doit préparer la semaine du lundi 21/09');
  fields.rangeStart.value='2026-10-05';fields.rangeStart.dataset.snailUserEdited='1';
  assert.equal(terrain.resolveSnailStart({},doc,new Date(2026,8,18,12)).getDate(),5,
    'une date choisie manuellement doit rester prioritaire');
})();

(function customVisitDurationHasFallback(){
  const source=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');
  const ctx={
    console,Map,Set,Date,JSON,Object,Array,String,Number,Math,RegExp,
    state:{settings:{visitMinutes:60},plan:{},stores:[]},
    document:{readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null},querySelectorAll(){return[]}},
    addEventListener(){},requestAnimationFrame(){},setTimeout(){},MutationObserver:function(){this.observe=function(){}}
  };
  ctx.window=ctx;ctx.localStorage={getItem(){return null},setItem(){},removeItem(){}};
  vm.runInNewContext(source,ctx,{filename:'visit-counting.js'});
  assert.equal(ctx.storeVisitDuration({id:'b',visitMinutes:120},ctx.state),120);
  assert.equal(ctx.storeVisitDuration({id:'c'},ctx.state),60);
  assert.equal(ctx.storeVisitMinutesForRoute([{visitMinutes:120},{visitMinutes:45}],ctx.state),165);
})();

const files={
  core:fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8'),
  range:fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8'),
  terrain:fs.readFileSync(__dirname+'/../terrain-planning-v1.js','utf8'),
  hours:fs.readFileSync(__dirname+'/../store-opening-hours.js','utf8'),
  quality:fs.readFileSync(__dirname+'/../route-polish.js','utf8'),
  reliability:fs.readFileSync(__dirname+'/../reliability-core.js','utf8'),
  hotel:fs.readFileSync(__dirname+'/../auto-planning-fix.js','utf8'),
  period:fs.readFileSync(__dirname+'/../period-day-slider.js','utf8')
};
assert(files.core.includes('id="fVisitMinutes"'),'la fiche magasin doit exposer la durée personnalisée');
assert(files.core.includes('s.visitMinutes=visitMin'),'la durée personnalisée doit être persistée');
for(const [name,src] of Object.entries({range:files.range,terrain:files.terrain,hours:files.hours,quality:files.quality,reliability:files.reliability}))
  assert(src.includes('storeVisitDuration'),name+' doit consommer la durée magasin');
assert(files.hotel.includes('storeRunnerSaveHotelReservation'),'la réservation hôtel doit être enregistrable');
assert(files.hotel.includes('N° / référence de réservation'),'la référence de réservation doit être visible');
assert(files.hotel.includes('hotelReservations()[key]'),'la réservation doit être rattachée à la date de nuit');
assert(files.period.includes('StoreRunnerNavigation.openPlanningSettings')&&files.period.includes('StoreRunnerStoreControlsV189.renderOvernight'),'le bouton Hôtel conseillé doit ouvrir la feuille et rendre la réservation V212');

console.log('v212 smart schedule ok · prochain lundi · durée magasin · hôtel réservé');
