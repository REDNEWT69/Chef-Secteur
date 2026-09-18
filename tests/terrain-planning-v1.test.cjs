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

(function openingHoursEngineOwnsDayFitWhenAvailable(){
  const previous=global.StoreOpeningHoursV1;
  let called=0;
  global.StoreOpeningHoursV1={routeFits(route,day,state,options){called++;assert.strictEqual(day,'Lundi');assert.ok(options.weekMonday instanceof Date);return false}};
  const state={settings:{startTime:'08:30',endTime:'18:00'},profile:{baseLat:42.9,baseLon:-1.5}};
  assert.strictEqual(terrain.dayFits([{id:'a',lat:45,lon:4.1}],'Lundi',state,monday()),false,'un horaire magasin impossible doit refuser ce jour');
  assert.strictEqual(called,1);
  if(previous===undefined)delete global.StoreOpeningHoursV1;else global.StoreOpeningHoursV1=previous;
})();

(function overnightReportExplainsTheThreeWeeks(){
  const a={id:'a'},b={id:'b'};
  const state={profile:{baseLat:42.9,baseLon:-1.5,overnightMode:'auto',overnightMinSaving:80},settings:{days:['Lundi','Mardi']}};
  const distance=(x,y)=>({
    'a-base':100,'base-a':100,'base-b':100,'b-base':100,'a-b':20,'b-a':20
  })[(x.id||'base')+'-'+(y.id||'base')] ?? 0;
  const weeks=[0,1,2].map(i=>({weekKey:['2026-09-14','2026-09-21','2026-09-28'][i],plan:{Lundi:[a],Mardi:[b]}}));
  const report=terrain.analyzeOvernightWeeks(weeks,state,distance);
  assert.strictEqual(report.length,3);
  assert.strictEqual(report[0].best.saving,180);
  assert.strictEqual(report[0].selected,true);
  assert.strictEqual(report[0].best.fromDay,'Lundi');
  assert.strictEqual(report[0].best.toDay,'Mardi');
  state.profile.overnightMinSaving=200;
  assert.strictEqual(terrain.analyzeOvernightWeeks(weeks,state,distance)[0].selected,false,'sous le seuil, le rapport doit expliquer le retour domicile');
  state.profile.overnightMode='never';
  const never=terrain.analyzeOvernightWeeks(weeks,state,distance)[0];
  assert.strictEqual(never.selected,false);
  assert.strictEqual(never.reason,'disabled');
})();

(function openingHoursReportShowsOnlyRealUnknowns(){
  const a={id:'a'},b={id:'b'},c={id:'c'};
  const state={stores:[a,b,c]};
  const api={intervalsFor(store){if(store.id==='a')return[{open:'09:00',close:'19:00'}];if(store.id==='b')return undefined;return[]}};
  const report=terrain.summarizeOpeningHours([{weekKey:'2026-09-14',plan:{Lundi:[a,b],Mardi:[b,c]}}],state,api);
  assert.deepStrictEqual(report,{available:true,known:1,unknown:2,closed:1,uniqueUnknown:1});
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

(function balancedTargetCoversTheWholeWorkWeek(){
  const stores=Array.from({length:40},(_,i)=>store(i+1));
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:12,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:()=>false,dayFits:()=>true});
  const first=built.weeks[0],lengths=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].map(d=>first.plan[d].length);
  assert.deepStrictEqual(lengths,[3,3,2,2,2],'12 visites doivent être réparties sur les 5 jours au lieu de remplir seulement le début de semaine');
  assert.strictEqual(first.diagnostics.filter(d=>d.status==='empty').length,0);
  assert.deepStrictEqual(flat(first).map(s=>s.id),Array.from({length:12},(_,i)=>'s'+(i+1)),'la progression proche → loin reste stable');
})();

(function performancePriorityWinsInsideTheRadialPool(){
  const stores=Array.from({length:20},(_,i)=>store(i+1));
  const boost=s=>s.id==='s10'?60:s.id==='s9'?25:0;
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:5,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:boost,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:()=>false,dayFits:()=>true});
  assert.deepStrictEqual(flat(built.weeks[0]).map(s=>s.id),['s10','s9','s1','s2','s3'],'P1 puis P2 doivent passer avant la distance, la distance départage ensuite');
})();

(function blockedDayIsExplainedNotSilentlyEmpty(){
  const stores=Array.from({length:30},(_,i)=>store(i+1));
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:8,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:d=>d==='2026-09-17',dayFits:()=>true});
  const diag=built.weeks[0].diagnostics.find(d=>d.day==='Jeudi');
  assert.strictEqual(diag.status,'blocked');
  assert.match(diag.reason,/bloqué|indisponible/i);
  for(const day of ['Lundi','Mardi','Mercredi','Vendredi'])assert.ok(built.weeks[0].plan[day].length>0,day+' doit être alimenté');
})();

(function targetBelowWorkDaysExplainsTheNecessaryGap(){
  const stores=Array.from({length:20},(_,i)=>store(i+1));
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:4,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:()=>false,dayFits:()=>true});
  assert.strictEqual(built.emptyWorkDays.length,3,'un jour par semaine reste nécessairement vide quand la cible est 4 pour 5 jours');
  assert.ok(built.emptyWorkDays.every(d=>/objectif hebdomadaire inférieur/i.test(d.reason)));
})();


(function finalGeographicPlanOwnsTheDiagnostics(){
  const stores=Array.from({length:12},(_,i)=>store(i+1));
  const plan={Lundi:[stores[0]],Mardi:[stores[1]],Mercredi:stores.slice(2,6),Jeudi:stores.slice(6,8),Vendredi:stores.slice(8,12),Samedi:[]};
  const state={manualWeekEdits:{},settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:12,maxVisitsPerDay:4},stores,excluded:{},included:{},calendarEvents:[]};
  const weeks=[{weekKey:'2026-09-14',plan,manual:false}];
  const rebuilt=terrain.refreshThreeWeekDiagnostics(weeks,state);
  const counts=rebuilt.planningDiagnostics[0].days.filter(d=>d.status==='planned'||d.status==='empty').map(d=>d.count);
  assert.deepStrictEqual(counts,[1,1,4,2,4],'le diagnostic doit décrire le planning final après optimisation géographique');
  assert.deepStrictEqual(rebuilt.dayCoverage,{planned:5,active:5,empty:0});
  assert.deepStrictEqual(weeks[0].diagnostics.map(d=>d.count),[1,1,4,2,4]);
})();

console.log('terrain-planning-v1: OK');
