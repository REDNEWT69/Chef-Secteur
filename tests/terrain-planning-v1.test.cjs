const assert = require('assert');

// Le module expose volontairement ses fonctions pures pour les tester sans navigateur.
const terrain = require('../terrain-planning-v1.js');

function monday(){ return new Date(2026, 8, 14, 12); }
function store(i, credit=1){
  return { id:'s'+i, enseigne:'Test', ville:'Ville '+i, distance:i, credit, active:true };
}
function flat(week){
  return ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'].flatMap(d => week.plan[d] || []);
}

(function threeWeeksStayRadialAndUnique(){
  const stores = Array.from({length:83}, (_,i)=>store(i+1));
  const state = { manualWeekEdits:{} };
  const built = terrain.buildThreeWeekSnail({
    state,
    firstMonday:monday(),
    days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],
    target:20,
    maxCreditsPerDay:4,
    stores,
    archive:{},
    distanceOf:s=>s.distance,
    creditOf:s=>s.credit,
    lockDayForWeek:()=>'',
    appointmentDay:()=>'',
    dayBlocked:()=>false,
    dayFits:()=>true
  });
  assert.strictEqual(built.weeks.length, 3);
  assert.strictEqual(built.totalVisits, 60);
  assert.strictEqual(built.uniqueStores, 60);
  const all = built.weeks.flatMap(flat);
  assert.deepStrictEqual(all.map(s=>s.id), Array.from({length:60},(_,i)=>'s'+(i+1)));
  assert.strictEqual(new Set(all.map(s=>s.id)).size, 60);
  for(const week of built.weeks){
    for(const day of ['Lundi','Mardi','Mercredi','Jeudi','Vendredi']){
      assert.ok((week.plan[day]||[]).length <= 4, day+' dépasse la capacité');
    }
  }
})();

(function creditsAreARealDailyBudget(){
  const stores = Array.from({length:30}, (_,i)=>store(i+1, 2));
  const built = terrain.buildThreeWeekSnail({
    state:{manualWeekEdits:{}}, firstMonday:monday(),
    days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'], target:20, maxCreditsPerDay:4,
    stores, archive:{}, distanceOf:s=>s.distance, creditOf:s=>s.credit,
    lockDayForWeek:()=>'', appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  });
  assert.strictEqual(flat(built.weeks[0]).length, 10, '2 crédits par magasin => 2 magasins/jour avec budget 4');
  for(const day of ['Lundi','Mardi','Mercredi','Jeudi','Vendredi']){
    assert.strictEqual((built.weeks[0].plan[day]||[]).reduce((n,s)=>n+s.credit,0), 4);
  }
})();

(function manualWeekIsNeverOverwritten(){
  const stores = Array.from({length:50}, (_,i)=>store(i+1));
  const protectedPlan = {Lundi:[stores[40]],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  const state = {manualWeekEdits:{'2026-09-21':{at:'2026-09-13T00:00:00Z',plan:protectedPlan}}};
  const built = terrain.buildThreeWeekSnail({
    state, firstMonday:monday(), days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'], target:10,
    maxCreditsPerDay:4, stores, archive:{}, distanceOf:s=>s.distance, creditOf:()=>1,
    lockDayForWeek:()=>'', appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  });
  assert.strictEqual(built.weeks[1].manual, true);
  assert.deepStrictEqual(flat(built.weeks[1]).map(s=>s.id), ['s41']);
})();

(function recurrentOrDatedLocksRemainHonoured(){
  const stores = Array.from({length:25}, (_,i)=>store(i+1));
  const built = terrain.buildThreeWeekSnail({
    state:{manualWeekEdits:{}}, firstMonday:monday(), days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],
    target:10, maxCreditsPerDay:4, stores, archive:{}, distanceOf:s=>s.distance, creditOf:()=>1,
    lockDayForWeek:(id,week)=> id==='s20' && week==='2026-09-14' ? 'Jeudi' : '',
    appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  });
  assert.ok((built.weeks[0].plan.Jeudi||[]).some(s=>s.id==='s20'));
})();

(function imposedStoreIsARealWeeklyConstraint(){
  const stores = Array.from({length:10}, (_,i)=>store(i+1));
  const built = terrain.buildThreeWeekSnail({
    state:{manualWeekEdits:{},included:{s10:true}}, firstMonday:monday(), days:['Lundi'],
    target:3, maxCreditsPerDay:4, stores, archive:{}, distanceOf:s=>s.distance, creditOf:()=>1,
    lockDayForWeek:()=>'', appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  });
  for(const week of built.weeks){
    assert.ok(flat(week).some(s=>s.id==='s10'),'le magasin imposé doit être présent chaque semaine');
  }
  const normal=built.weeks.flatMap(flat).filter(s=>s.id!=='s10').map(s=>s.id);
  assert.deepStrictEqual(normal,['s1','s2','s3','s4','s5','s6'],'les autres places continuent la progression proche → loin sans répétition');
})();

(function poolDiagnosticMatchesTheRealV1Reach(){
  const stores=[
    {id:'a',active:true,lat:45,lon:4,enseigne:'Fnac'},
    {id:'b',active:true,lat:null,lon:null,enseigne:'Fnac'},
    {id:'c',active:true,lat:45,lon:4,enseigne:'Darty'},
    {id:'d',active:true,lat:45,lon:4,enseigne:'Fnac'},
    {id:'e',active:false,lat:45,lon:4,enseigne:'Fnac'}
  ];
  const state={excluded:{c:true},included:{b:true}};
  const report=terrain.summarizeTerrainPool(stores,state,s=>s.id!=='d');
  assert.deepStrictEqual(report,{total:5,active:4,excluded:1,filtered:1,planifiable:2,withGps:1,withoutGps:1,imposed:1});
})();

(function inheritedFutureWeekDoesNotSkipTheUpcomingMonday(){
  const state={settings:{weekDate:'2026-09-21'}};
  const fields={rangeStart:{value:'2026-09-21',dataset:{}},weekDate:{value:'2026-09-21'}};
  const doc={getElementById:id=>fields[id]||null};
  const start=terrain.resolveSnailStart(state,doc,new Date(2026,8,13,12));
  assert.strictEqual(start.getFullYear(),2026);
  assert.strictEqual(start.getMonth(),8);
  assert.strictEqual(start.getDate(),14,'un dimanche 13, une date future héritée ne doit pas faire sauter le lundi 14');
})();

(function explicitFutureStartStillWins(){
  const state={settings:{weekDate:'2026-09-14'}};
  const fields={rangeStart:{value:'2026-09-21',dataset:{snailUserEdited:'1'}},weekDate:{value:'2026-09-14'}};
  const doc={getElementById:id=>fields[id]||null};
  const start=terrain.resolveSnailStart(state,doc,new Date(2026,8,13,12));
  assert.strictEqual(start.getDate(),21,'une date de début choisie explicitement par l’utilisateur doit rester prioritaire');
})();

(function missingGpsCountsTheWholeEligiblePoolNotOnlyPlacedStores(){
  const stores=Array.from({length:65},(_,i)=>Object.assign(store(i+1),{lat:45+i*0.001,lon:4}));
  stores[64].lat=null;stores[64].lon=null;
  const built=terrain.buildThreeWeekSnail({
    state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],
    target:20,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,creditOf:()=>1,
    lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:()=>false,dayFits:()=>true
  });
  assert.strictEqual(built.totalVisits,60);
  assert.strictEqual(built.unknownGps,1,'un GPS manquant hors des 60 visites doit quand même être signalé');
})();

(function startFromChosenStorePreservesTheWholeDay(){
  const route=[store(1),store(2),store(3),store(4)];
  const pos={s1:0,s2:10,s3:3,s4:7};
  const dist=(a,b)=>Math.abs(pos[a.id]-pos[b.id]);
  const next=terrain.reorderDayFromStore(route,'s2',dist);
  assert.strictEqual(next[0].id,'s2');
  assert.deepStrictEqual(new Set(next.map(s=>s.id)), new Set(route.map(s=>s.id)));
  assert.strictEqual(next.length, route.length);
  assert.strictEqual(new Set(next.map(s=>s.id)).size, route.length);
  assert.deepStrictEqual(route.map(s=>s.id), ['s1','s2','s3','s4'], 'la route source ne doit pas être mutée');
})();

(function alreadyFirstDoesNotRebuildNeedlessly(){
  const route=[store(1),store(2)];
  const next=terrain.reorderDayFromStore(route,'s1',()=>1);
  assert.deepStrictEqual(next.map(s=>s.id), ['s1','s2']);
})();

console.log('terrain-planning-v1: OK');