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

(function manualWeekKeepsPinnedStoreAndFillsGaps(){
  // V242 : une semaine protégée qui n'a qu'un seul magasin posé ne doit plus rester
  // gelée avec quatre jours vides. Le magasin posé reste sur son jour, le reste de la
  // capacité disponible (jusqu'à target) se remplit avec le vivier normal, sans doublon
  // avec les deux autres semaines du cycle.
  const stores = Array.from({length:50}, (_,i)=>store(i+1));
  const protectedPlan = {Lundi:[stores[40]],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  const state = {manualWeekEdits:{'2026-09-21':{at:'2026-09-13T00:00:00Z',plan:protectedPlan}}};
  const built = terrain.buildThreeWeekSnail({
    state, firstMonday:monday(), days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'], target:10,
    maxCreditsPerDay:4, stores, archive:{}, distanceOf:s=>s.distance, creditOf:()=>1,
    lockDayForWeek:()=>'', appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  });
  const week = built.weeks[1];
  assert.strictEqual(week.manual, true);
  assert.ok(week.plan.Lundi.some(s=>s.id==='s41'), 's41 doit rester posé sur son jour d’origine');
  assert.strictEqual(flat(week).length, 10, 'la semaine complétée doit atteindre la cible, pas dépasser la capacité de chaque jour');
  const ids = flat(week).map(s=>s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'aucun doublon à l’intérieur de la semaine complétée');
  const all = built.weeks.flatMap(flat).map(s=>s.id);
  assert.strictEqual(new Set(all).size, all.length, 'le remplissage ne doit pas réutiliser un magasin déjà pris par une autre semaine du cycle');
})();

(function fullyLoadedProtectedWeekIsUntouched(){
  // Cas de non-régression : si la semaine protégée est déjà pleine, le complètement ne
  // doit rien changer — comportement identique à avant V242.
  const stores = Array.from({length:20}, (_,i)=>store(i+1));
  const full = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].reduce((p,d,i)=>{p[d]=[stores[i*2],stores[i*2+1]];return p},{Samedi:[]});
  const state = {manualWeekEdits:{'2026-09-21':{at:'2026-09-13T00:00:00Z',plan:JSON.parse(JSON.stringify(full))}}};
  const built = terrain.buildThreeWeekSnail({
    state, firstMonday:monday(), days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'], target:10,
    maxCreditsPerDay:2, stores, archive:{}, distanceOf:s=>s.distance, creditOf:()=>1,
    lockDayForWeek:()=>'', appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  });
  assert.deepStrictEqual(built.weeks[1].plan.Lundi.map(s=>s.id), full.Lundi.map(s=>s.id), 'une semaine déjà à capacité ne doit pas être modifiée');
  assert.strictEqual(flat(built.weeks[1]).length, 10, 'rien à ajouter : la semaine était déjà pleine');
})();

(function protectedWeekFillRespectsLocksAppointmentsAndHours(){
  // Appel direct à completeProtectedWeek (exposée dans l'API) plutôt qu'au cycle complet :
  // isole précisément le remplissage d'une semaine, sans qu'une autre semaine du cycle ne
  // consomme le vivier avant que le test n'ait pu vérifier le verrou.
  const stores = Array.from({length:6}, (_,i)=>store(i+1)); // déjà triés par distance croissante
  const protectedPlan = {Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  const weekKey = '2026-09-21';
  const completed = terrain.completeProtectedWeek(
    protectedPlan, ['Lundi','Mardi'], monday(), weekKey, 4,
    stores, new Set(), 4, ()=>1,
    (route,day)=>route.length<=2, // horaires : 2 arrêts maximum par jour
    (id,wk)=> id==='s1'&&wk===weekKey ? 'Mardi' : '', // s1 verrouillé sur Mardi
    ()=>'' // aucun rendez-vous dans ce test
  );
  assert.ok(!completed.Lundi.some(s=>s.id==='s1'), 's1 verrouillé sur Mardi ne doit pas être placé Lundi');
  assert.ok(completed.Mardi.some(s=>s.id==='s1'), 's1 verrouillé doit finir par apparaître sur Mardi si la capacité le permet');
  assert.ok(completed.Lundi.length<=2 && completed.Mardi.length<=2, 'dayFits (ici : 2 arrêts maximum) doit être respecté pendant le remplissage');
  for(const day of ['Mercredi','Jeudi','Vendredi']) assert.strictEqual((completed[day]||[]).length, 0, 'un jour hors activeDays ne doit jamais recevoir de remplissage');
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

(function rotationMemoryCoversTheWholeSectorAcrossCycles(){
  // V243 : 40 magasins, cible 10/semaine × 3 semaines = 30 par cycle. Le premier cycle
  // couvre forcément les 30 plus proches (comportement radial inchangé, cf. tests
  // ci-dessus) et laisse 10 magasins jamais touchés. Sans mémoire de rotation, un second
  // cycle reprendrait exactement les 30 mêmes. Avec elle, il doit d'abord placer les 10
  // encore jamais vus, puis compléter avec les plus anciennement utilisés du 1er cycle.
  const stores = Array.from({length:40}, (_,i)=>store(i+1));
  const days = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
  const baseOptions = {
    days, target:10, maxCreditsPerDay:4, stores, distanceOf:s=>s.distance,
    creditOf:()=>1, lockDayForWeek:()=>'', appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  };
  const archive = {};
  const cycle1 = terrain.buildThreeWeekSnail(Object.assign({}, baseOptions, {
    state:{manualWeekEdits:{}}, firstMonday:monday(), archive
  }));
  const cycle1Ids = cycle1.weeks.flatMap(flat).map(s=>s.id);
  assert.strictEqual(new Set(cycle1Ids).size, 30, 'le premier cycle doit couvrir 30 magasins distincts, sans mémoire à consulter');
  assert.deepStrictEqual(cycle1Ids, Array.from({length:30},(_,i)=>'s'+(i+1)), 'le premier cycle reste radial : comportement inchangé sans historique');
  // Persiste l'archive comme le fait generateThreeWeekSnail() en usage réel.
  for(const week of cycle1.weeks) archive[week.weekKey] = {weekMonday:week.weekKey, plan:week.plan, manualEdited:false};

  const secondMonday = new Date(monday().getFullYear(), monday().getMonth(), monday().getDate()+21, 12);
  const cycle2 = terrain.buildThreeWeekSnail(Object.assign({}, baseOptions, {
    state:{manualWeekEdits:{}}, firstMonday:secondMonday, archive
  }));
  const cycle2Ids = cycle2.weeks.flatMap(flat).map(s=>s.id);
  const neverSeenBefore = Array.from({length:10},(_,i)=>'s'+(31+i));
  for(const id of neverSeenBefore) assert.ok(cycle2Ids.includes(id), id+' n’avait jamais été visité au cycle 1 : il doit être couvert au cycle 2');
  const allTwoCycles = new Set(cycle1Ids.concat(cycle2Ids));
  assert.strictEqual(allTwoCycles.size, 40, 'les deux cycles cumulés doivent couvrir l’intégralité des 40 magasins du secteur');
})();

(function rotationMemoryStaysBoundedOverManyCycles(){
  // V243 : 15 magasins, cible 5/semaine × 3 = 15 par cycle — chaque cycle couvre pile le
  // secteur entier une fois. Sur plusieurs cycles, l'écart entre le magasin le plus vu et
  // le moins vu doit rester minime (même principe que la garantie déjà testée pour V211
  // dans tests/planning-range-rotation.test.cjs).
  const stores = Array.from({length:15}, (_,i)=>store(i+1));
  const days = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
  const baseOptions = {
    days, target:5, maxCreditsPerDay:4, stores, distanceOf:s=>s.distance,
    creditOf:()=>1, lockDayForWeek:()=>'', appointmentDay:()=>'', dayBlocked:()=>false, dayFits:()=>true
  };
  const archive = {};
  const counts = new Map(stores.map(s=>[s.id,0]));
  let firstMonday = monday();
  for(let cycle=0; cycle<4; cycle++){
    const built = terrain.buildThreeWeekSnail(Object.assign({}, baseOptions, {state:{manualWeekEdits:{}}, firstMonday, archive}));
    for(const week of built.weeks){
      archive[week.weekKey] = {weekMonday:week.weekKey, plan:week.plan, manualEdited:false};
      for(const s of flat(week)) counts.set(s.id, counts.get(s.id)+1);
    }
    firstMonday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate()+21, 12);
  }
  const values = [...counts.values()];
  assert.ok(values.every(n=>n>0), 'aucun magasin ne doit rester à zéro passage après 4 cycles sur un secteur qui tient pile dans la cible');
  assert.ok(Math.max(...values)-Math.min(...values) <= 1, 'l’écart de rotation doit rester minime sur plusieurs cycles : '+JSON.stringify(Object.fromEntries(counts)));
})();

console.log('terrain-planning-v1: OK');
