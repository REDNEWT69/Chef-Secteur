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

(function manualWeekStaysStrictlyIdentical(){
  // P0.3 : une vraie semaine manuelle est figée telle quelle. Le contrat V242 — compléter une
  // semaine protégée qui n'a qu'un magasin posé — est obsolète : s41 reste seul sur son lundi,
  // rien n'est ajouté, retiré, déplacé ni réordonné. Les deux autres semaines du cycle
  // continuent d'utiliser le vivier normalement, sans reprendre le magasin de la semaine manuelle.
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
  assert.deepStrictEqual(
    Object.fromEntries(['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'].map(d=>[d,(week.plan[d]||[]).map(s=>s.id)])),
    {Lundi:['s41'],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
    'la vraie semaine manuelle doit rester strictement identique : s41 seul, le lundi'
  );
  assert.strictEqual(flat(week).length, 1, 'aucune visite ajoutée ni retirée dans une vraie semaine manuelle');
  for(const other of [built.weeks[0], built.weeks[2]]) assert.strictEqual(flat(other).length, 10, other.weekKey+' : les autres semaines du cycle utilisent le vivier normalement');
  const all = built.weeks.flatMap(flat).map(s=>s.id);
  assert.strictEqual(new Set(all).size, all.length, 'le magasin de la semaine manuelle n’est pas repris par une autre semaine du cycle');
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
  // H1 : une nuit déjà passée n'est jamais retenue ; ces semaines sont donc futures.
  const weeks=[0,1,2].map(i=>({weekKey:['2099-01-05','2099-01-12','2099-01-19'][i],plan:{Lundi:[a],Mardi:[b]}}));
  const report=terrain.analyzeOvernightWeeks(weeks,state,distance);
  assert.strictEqual(report.length,3);
  assert.strictEqual(report[0].best.saving,180);
  assert.strictEqual(report[0].selected,true);
  assert.strictEqual(report[0].best.fromDay,'Lundi');
  assert.strictEqual(report[0].best.toDay,'Mardi');
  assert.deepStrictEqual(report.map(r=>r.best.fromDate),['2099-01-05','2099-01-12','2099-01-19'],'chaque semaine est analysée avec sa propre weekKey');
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

/* Lot 3A — brief hebdomadaire V246 dans « Générer mes 3 semaines » (W40 → W42), vrai module V246.
   Seule sa contribution `brief` compte, pour la semaine où la visite serait posée : après les
   contraintes, le besoin réel et la rotation, avant la distance. Par défaut : lundi seul, 1 visite. */
const B=require('../weekly-brief-v246.js');
const W40=new Date(2026,8,28,12);
const isoOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function briefPrepare(stores,o={}){
  const state=Object.assign({manualWeekEdits:{},stores,included:{}},o.state||{});
  for(const [week,rule] of (o.rules||[]))B.addRule(state,week,Object.assign({confidence:'confirmed'},rule));
  const opts={state,firstMonday:W40,days:o.days||['Lundi'],target:o.target||1,maxCreditsPerDay:o.max||1,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,lockDayForWeek:o.lockDayForWeek||(()=>''),appointmentDay:o.appointmentDay||(()=>''),dayBlocked:()=>false,dayFits:()=>true,needOf:o.needOf,evaluateDayRoute:o.evaluateDayRoute};
  if(o.brief!==false)opts.weeklyBrief=o.api||B;
  return {state,opts};
}
function briefSnail(stores,o){const p=briefPrepare(stores,o);return Object.assign(p,{built:terrain.buildThreeWeekSnail(p.opts)})}
const picks=built=>built.weeks.map(w=>flat(w).map(s=>s.id).join('+')).join(' | ');
const w41=(extra)=>['2026-W41',Object.assign({type:'boost',label:'Challenge W41',boost:50,scope:{storeIds:['s4']}},extra||{})];

(function lot3aWithoutBriefKeepsHistoricalPlan(){
  const stores=[1,2,3,4].map(i=>store(i));
  const none=briefSnail(stores,{brief:false}).built,empty=briefSnail(stores).built;
  assert.strictEqual(picks(none),'s1 | s2 | s3','sans V246 : escargot historique');
  assert.strictEqual(JSON.stringify(empty.weeks.map(w=>w.plan)),JSON.stringify(none.weeks.map(w=>w.plan)),'V246 sans règle : plan strictement identique');
})();

(function lot3aBriefActsOnItsOwnWeekOnly(){
  const stores=[1,2,3,4].map(i=>store(i));
  assert.strictEqual(picks(briefSnail(stores,{rules:[w41()]}).built),'s1 | s4 | s2','W41 : à besoin et rotation égaux, le brief passe avant la distance');
  // Même règle, mais le créneau W41 est pris par un verrou : W40 et W42 gardent l'escargot historique.
  const locked=briefSnail(stores,{rules:[w41()],lockDayForWeek:(id,wk)=>id==='s3'&&wk==='2026-10-05'?'Lundi':''}).built;
  assert.strictEqual(picks(locked),'s1 | s3 | s2','aucun effet du brief W41 en W40 ni en W42');
})();

(function lot3aAmbiguousOrPendingRuleStaysNeutral(){
  const stores=[1,2,3,4].map(i=>store(i));
  assert.strictEqual(picks(briefSnail(stores,{rules:[w41({confidence:'ambiguous'})]}).built),'s1 | s2 | s3','règle ambiguë : aucun effet');
  assert.strictEqual(picks(briefSnail(stores,{rules:[w41({pending:'Confirmation SEF'})]}).built),'s1 | s2 | s3','règle en attente : aucun effet');
})();

(function lot3aBriefNeverCrossesANeedTier(){
  const stores=[store(1),store(2),store(4)];
  const needOf=s=>s.id==='s4'?{tier:1,status:'ok',blocked:false}:{tier:4,status:'late',ratio:1.2,blocked:false};
  const {built}=briefSnail(stores,{needOf,rules:[['2026-W40',{type:'boost',label:'Coup de pouce',boost:100,scope:{storeIds:['s4']}}]]});
  assert.strictEqual(flat(built.weeks[0]).map(s=>s.id).join(),'s1','W40 : un « très en retard » passe avant un brief +100 à jour');
})();

(function lot3aBlockedStoreStaysBlocked(){
  const stores=[1,2,3,4].map(i=>store(i));
  const needOf=s=>s.id==='s4'?{tier:0,status:'blocked',blocked:true}:{tier:3,status:'late',blocked:false};
  const {built}=briefSnail(stores,{needOf,rules:[['2026-W40',{type:'boost',label:'Gros brief',boost:100,scope:{storeIds:['s4']},validTo:'2026-W42'}]]});
  assert.ok(!built.weeks.some(w=>flat(w).some(s=>s.id==='s4')),'garde anti-sur-visite : un +100 ne reprend jamais un magasin bloqué');
})();

(function lot3aConstraintsStayFirst(){
  const stores=[1,2,3,4].map(i=>store(i)),rule=['2026-W40',{type:'boost',label:'W40',boost:100,scope:{storeIds:['s4']}}];
  const first=o=>flat(briefSnail(stores,Object.assign({rules:[rule]},o)).built.weeks[0]).map(s=>s.id).join('+');
  assert.strictEqual(first({}),'s4','sans contrainte, le brief W40 l’emporte');
  assert.strictEqual(first({state:{included:{s1:true}}}),'s1','un magasin imposé passe avant le brief');
  assert.strictEqual(first({appointmentDay:(id,mon)=>id==='s2'&&isoOf(mon)==='2026-09-28'?'Lundi':''}),'s2','un rendez-vous passe avant le brief');
  assert.strictEqual(first({lockDayForWeek:(id,wk)=>id==='s3'&&wk==='2026-09-28'?'Lundi':''}),'s3','un verrou passe avant le brief');
})();

(function lot3aNoBusinessWrite(){
  const P=require('../performance-data-v190.js'),mem=new Map(),storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
  const previous=global.__chefStorage;global.__chefStorage=storage;
  try{
    P.saveSnapshot(storage,{week:'W39',importedAt:'2026-09-25T08:00:00Z',rows:[{key:'k|4',retailer:'Test',site:'Ville 4',prio:'P1'}]});
    const stores=[1,2,3,4].map(i=>store(i)),p=briefPrepare(stores,{rules:[w41()]});
    const before=JSON.stringify([stores,p.state.weeklyBriefs,storage.getItem(P.STORE_KEY)]);
    assert.strictEqual(picks(terrain.buildThreeWeekSnail(p.opts)),'s1 | s4 | s2');
    assert.strictEqual(JSON.stringify([stores,p.state.weeklyBriefs,storage.getItem(P.STORE_KEY)]),before,'ni fiche magasin, ni weeklyBriefs, ni fichier performance modifiés');
  }finally{if(previous===undefined)delete global.__chefStorage;else global.__chefStorage=previous}
})();

(function lot3aBriefSurvivesCrossDayAndIsReadOncePerWeek(){
  // Vrai V246 + optimiseur V264 actif. W41 : S (+50) est posé avec s3, loin de lui. L'échange
  // S↔s4 (W42) gagnerait autant de kilomètres que s3↔s5, mais ferait perdre le +50 : seul
  // l'échange neutre pour le brief est accepté, et S reste en W41.
  const row=(id,distance,x)=>({id,enseigne:'Test',ville:'Ville '+id,distance,x,active:true});
  const stores=[row('s1',1,50),row('s2',2,50),row('s3',3,-100),row('s4',4,-100),row('s5',5,100),row('S',6,100)];
  const calls={lot:[],one:0},api=Object.assign({},B,{effectivePriorities(week,o){calls.lot.push(week);return B.effectivePriorities(week,o)},effectivePriority(){calls.one++;return B.effectivePriority.apply(B,arguments)}});
  const evaluateDayRoute=route=>{const r=route.slice().sort((a,b)=>a.x-b.x),d=r.length<2?0:r[r.length-1].x-r[0].x;return{route:r,feasible:true,kilometers:d,driveMinutes:d}};
  const {built}=briefSnail(stores,{api,target:2,max:2,needOf:()=>({tier:1,status:'ok',blocked:false}),evaluateDayRoute,rules:[['2026-W41',{type:'boost',label:'Challenge S',boost:50,scope:{storeIds:['S']}}]]});
  assert.ok(built.crossDay.applied&&built.crossDay.swaps>=1,'l’optimiseur cross-day a bien tourné : '+JSON.stringify(built.crossDay.swaps));
  assert.ok(flat(built.weeks[1]).some(s=>s.id==='S'),'S garde sa semaine W41 et son +50 après l’optimisation : '+picks(built));
  assert.strictEqual(built.weeks.map(w=>flat(w).map(s=>s.id).sort().join('+')).join(' | '),'s1+s2 | S+s5 | s3+s4','la géographie s’optimise (s3↔s5) sans effacer le brief');
  assert.deepStrictEqual(calls.lot.slice().sort(),['2026-W40','2026-W41','2026-W42'],'une seule lecture V246 en lot par semaine utile');
  assert.strictEqual(calls.one,0,'aucune lecture V246 magasin par magasin');
})();

/* Lot 3B — échéances confirmées du brief (règles deadline V246) : vraies obligations du cycle
   (W40 → W42, horizon 28/09 → 18/10). Par défaut : lundi seul, 1 visite, s1…s4 du plus proche au
   plus loin ; RDV et verrous lus comme le runtime (state.appointments, state.locks). */
const DAYS6=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],WEEK5=DAYS6.slice(0,5);
const deadline=(week,ids,dueDate,extra)=>[week,Object.assign({type:'deadline',label:'Échéance '+[].concat(ids).join('+'),dueDate,scope:{storeIds:[].concat(ids)}},extra||{})];
const plusDays=(key,n)=>{const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return isoOf(d)};
const planOf=(day,stores)=>Object.assign(Object.fromEntries(DAYS6.map(d=>[d,[]])),{[day]:stores});
function dueSnail(o={}){
  const stores=o.stores||[1,2,3,4].map(i=>store(i));
  const state=Object.assign({manualWeekEdits:{},stores,included:{},locks:{},appointments:[]},o.state||{});
  for(const [week,rule] of (o.rules||[]))B.addRule(state,week,Object.assign({confidence:'confirmed'},rule));
  const opts={state,firstMonday:W40,days:o.days||['Lundi'],target:o.target||1,maxCreditsPerDay:o.max||1,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,
    lockDayForWeek:(id,wk)=>{const raw=state.locks[String(id)];return typeof raw==='string'?raw:raw&&raw.week===wk?raw.day:''},
    appointmentDay:(id,mon)=>{const start=isoOf(mon),a=state.appointments.find(x=>String(x.storeId)===String(id)&&x.date>=start&&x.date<plusDays(start,7));return a?DAYS6[(new Date(a.date+'T12:00:00').getDay()||7)-1]:''},
    dayBlocked:o.dayBlocked||(()=>false),dayFits:o.dayFits||(()=>true),needOf:o.needOf,today:o.today,existingPlanFor:o.existingPlanFor,completedOn:o.completedOn,evaluateDayRoute:o.evaluateDayRoute,prepareCrossDayWeeks:o.prepareCrossDayWeeks,weeklyBrief:o.api||B};
  let built=null,error=null;try{built=terrain.buildThreeWeekSnail(opts)}catch(e){error=e}
  return{state,built,error};
}
const visitsOf=(built,id)=>built.weeks.flatMap(w=>DAYS6.filter(d=>(w.plan[d]||[]).some(s=>s.id===id)).map(d=>plusDays(w.weekKey,DAYS6.indexOf(d))));
const refusal=(r,label,due,name,why)=>{assert.strictEqual(r.built,null,'refus attendu, planning proposé : '+(r.built&&picks(r.built)));assert.strictEqual(r.error.message,'1 obligation d’échéance du brief impossible à tenir — « '+label+' » (échéance le '+due+') : '+name+' ('+why+'). Le planning précédent est conservé.')};
const ok=r=>{assert.strictEqual(r.error,null,r.error&&r.error.message);return r.built};

(function lot3bConfirmedDeadlineIsHardAndBeatsFreeCandidates(){
  // 1 + 7. s4, le plus loin et seulement à jour, doit être vu au plus tard le lundi 28/09.
  const needOf=s=>s.id==='s4'?{tier:1,status:'ok',blocked:false}:{tier:4,status:'late',ratio:1.2,blocked:false};
  assert.strictEqual(picks(ok(dueSnail({needOf}))),'s1 | s2 | s3','sans échéance : besoin puis distance');
  const built=ok(dueSnail({needOf,rules:[deadline('2026-W40','s4','2026-09-28')]}));
  assert.strictEqual(picks(built),'s4 | s1 | s2','obligation posée le 28/09, avant des candidats libres très en retard');
  assert.deepStrictEqual(built.deadlines,[{storeId:'s4',label:'Échéance s4',ruleId:'r1',dueDate:'2026-09-28',by:'placed',date:'2026-09-28'}]);
})();

(function lot3bOnlyConfirmedValidRulesBind(){
  // 2, 3, 4. Ambiguë, en attente ou hors validité (règle de la W39 seule) : aucune obligation.
  for(const [label,rule] of [['ambiguë',deadline('2026-W40','s4','2026-09-28',{confidence:'ambiguous'})],['en attente',deadline('2026-W40','s4','2026-09-28',{pending:'Confirmation SEF'})],['hors validité',deadline('2026-W39','s4','2026-09-30')]]){
    const built=ok(dueSnail({rules:[rule]}));
    assert.strictEqual(picks(built),'s1 | s2 | s3',label+' : aucune obligation');
    assert.strictEqual(built.deadlines,undefined,label);
  }
})();

(function lot3bDeadlineAfterTheHorizonIsOnlyAScoreSignal(){
  // 5. Échéance le 19/10, après la fin des 3 semaines (18/10), rendez-vous encore après : ni forçage, ni refus.
  const built=ok(dueSnail({state:{appointments:[{id:'a4',storeId:'s4',date:'2026-10-21'}]},rules:[deadline('2026-W40','s4','2026-10-19',{validTo:'2026-W43'})]}));
  assert.strictEqual(picks(built),'s1 | s2 | s3');
  assert.strictEqual(built.deadlines,undefined);
})();

(function lot3bBriefAndDeadlineShareOneV246Lot(){
  // 6. Brief Lot 3A (W42) et échéance Lot 3B (W40) lus dans le même lot : une lecture par semaine, semaine
  //    retouchée comprise, aucune lecture magasin par magasin.
  const calls={lot:[],one:0},api=Object.assign({},B,{effectivePriorities(week,o){calls.lot.push(week);return B.effectivePriorities(week,o)},effectivePriority(){calls.one++;return B.effectivePriority.apply(B,arguments)}});
  const manual={'2026-10-05':{at:'2026-09-20T00:00:00Z',plan:planOf('Lundi',[store(2)])}};
  const built=ok(dueSnail({api,state:{manualWeekEdits:manual},rules:[deadline('2026-W40','s3','2026-09-28'),['2026-W42',{type:'boost',label:'Challenge W42',boost:50,scope:{storeIds:['s4']}}]]}));
  assert.strictEqual(picks(built),'s3 | s2 | s4','W40 : obligation s3 ; W41 retouchée ; W42 : brief s4');
  assert.deepStrictEqual(calls.lot.slice().sort(),['2026-W40','2026-W41','2026-W42'],'une seule lecture V246 en lot par semaine du cycle');
  assert.strictEqual(calls.one,0,'aucune lecture V246 magasin par magasin');
})();

(function lot3bDeadlineBypassesTheOverVisitGuard(){
  // 8. s4 vient d'être visité (garde anti-sur-visite) : la consigne d'échéance le pose quand même.
  const needOf=s=>s.id==='s4'?{tier:0,status:'blocked',blocked:true}:{tier:3,status:'late',blocked:false};
  assert.strictEqual(picks(ok(dueSnail({needOf}))),'s1 | s2 | s3','sans échéance, la garde écarte s4');
  assert.strictEqual(picks(ok(dueSnail({needOf,rules:[deadline('2026-W40','s4','2026-09-28')]}))),'s4 | s1 | s2','l’échéance passe outre la garde');
})();

(function lot3bAllP1ScopedByV246BeforeTheDeadline(){
  // 9. « Tous les P1 avant mardi » : V246 juge le périmètre P1 (fichier performance), le cycle les pose tous.
  const P=require('../performance-data-v190.js'),mem=new Map(),storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
  const previous=global.__chefStorage;global.__chefStorage=storage;
  try{
    P.saveSnapshot(storage,{week:'W39',importedAt:'2026-09-25T08:00:00Z',rows:[3,4,5].map(i=>({key:'k|'+i,retailer:'Test',site:'Ville '+i,prio:'P1'}))});
    const built=ok(dueSnail({stores:[1,2,3,4,5,6].map(i=>store(i)),days:['Lundi','Mardi'],target:2,max:2,rules:[['2026-W40',{type:'deadline',label:'Tous les P1 avant mardi',dueDate:'2026-09-29',scope:{basePrio:'P1'}}]]}));
    assert.deepStrictEqual(built.deadlines.map(d=>d.storeId).sort(),['s3','s4','s5'],'seuls les P1 du fichier performance');
    for(const id of ['s3','s4','s5'])assert.deepStrictEqual(visitsOf(built,id).filter(d=>d<='2026-09-29').length,1,id+' : une visite au plus tard le 29/09');
    assert.deepStrictEqual(['Lundi','Mardi'].map(d=>built.weeks[0].plan[d].map(s=>s.id).join('+')),['s3+s4','s5'],'avant les candidats libres, première journée compatible');
  }finally{if(previous===undefined)delete global.__chefStorage;else global.__chefStorage=previous}
})();

(function lot3bNearestDeadlineFirst(){
  // 10. s3 dû mardi 29/09, s4 dû lundi 28/09, une place par jour : la distance donnerait lundi à s3.
  const built=ok(dueSnail({days:['Lundi','Mardi'],target:2,rules:[deadline('2026-W40','s3','2026-09-29',{label:'Mardi'}),deadline('2026-W40','s4','2026-09-28',{label:'Lundi'})]}));
  assert.deepStrictEqual(['Lundi','Mardi'].map(d=>built.weeks[0].plan[d].map(s=>s.id).join()),['s4','s3'],'échéance la plus proche d’abord');
})();

(function lot3bObligationsMayExceedTheNominalTarget(){
  // 11. Objectif 1, trois obligations le lundi : elles tiennent dans les 3 crédits du jour.
  const built=ok(dueSnail({max:3,rules:[deadline('2026-W40',['s2','s3','s4'],'2026-09-28',{label:'Trois lundi'})]}));
  assert.strictEqual(built.weeks[0].plan.Lundi.map(s=>s.id).sort().join('+'),'s2+s3+s4');
})();

(function lot3bObligationAppearsExactlyOnce(){
  // 12. s4 dû le 14/10 : une seule visite, la première journée compatible. s1 (le plus proche) dû le 06/10 par
  //     une règle valable à partir de W41 : pas repris en W40 par la sélection libre, posé une fois en W41.
  const built=ok(dueSnail({stores:[1,2,3,4,5,6].map(i=>store(i)),days:['Lundi','Mardi'],target:2,rules:[deadline('2026-W40','s4','2026-10-14',{validTo:'2026-W42'}),deadline('2026-W41','s1','2026-10-06')]}));
  assert.deepStrictEqual(visitsOf(built,'s4'),['2026-09-28']);
  assert.deepStrictEqual(visitsOf(built,'s1'),['2026-10-05']);
  for(const id of ['s1','s2','s3','s4','s5','s6'])assert.ok(visitsOf(built,id).length<=1,id+' : '+picks(built));
})();

(function lot3bTwoDeadlinesOfOneStoreKeepBothVisits(){
  // s4 : « A » dû le 28/09 (W40 seule), puis « B » dû le 05/10, valable à partir de W41 : fenêtres disjointes,
  // deux visites, toutes deux figées pour l'optimiseur cross-day.
  const evaluateDayRoute=route=>({route:route.slice(),feasible:true,kilometers:0,driveMinutes:0});
  const built=ok(dueSnail({needOf:()=>({tier:3,status:'late',blocked:false}),evaluateDayRoute,rules:[deadline('2026-W40','s4','2026-09-28',{label:'A'}),deadline('2026-W41','s4','2026-10-05',{label:'B'})]}));
  assert.deepStrictEqual(visitsOf(built,'s4'),['2026-09-28','2026-10-05']);
  assert.strictEqual(built.crossDay.refused.deadlines,2,'les deux visites d’échéance sont figées');
  // W40 fériée : « A » (dû le 14/10, fenêtre dès W40) et « B » (dû le 07/10, dès W41) se recouvrent.
  // La visite du lundi 05/10 posée pour B tient aussi A : aucune seconde visite en W42.
  const both=ok(dueSnail({dayBlocked:d=>d<'2026-10-05',rules:[deadline('2026-W40','s4','2026-10-14',{label:'A'}),deadline('2026-W41','s4','2026-10-07',{label:'B'})]}));
  assert.deepStrictEqual(visitsOf(both,'s4'),['2026-10-05']);
  assert.deepStrictEqual(both.deadlines.map(d=>d.label+':'+d.date),['A:2026-10-05','B:2026-10-05']);
})();

(function lot3bDoneVisitHoldsTheDeadline(){
  // 13. Visite faite le 25/09 (règle valable depuis W39) : doneDate V246 ≤ échéance, aucune nouvelle visite.
  const built=ok(dueSnail({state:{visits:{s4:{lastVisit:'2026-09-25',history:['2026-09-25']}}},rules:[deadline('2026-W39','s4','2026-09-30',{validTo:'2026-W40'})]}));
  assert.strictEqual(picks(built),'s1 | s2 | s3');
  assert.strictEqual(built.deadlines[0].by,'doneDate');
})();

(function lot3bKeptPastDayHoldsTheDeadline(){
  // 14. Mercredi 30/09 : le lundi 28/09, passé et conservé, contient déjà s4 (visite non cochée).
  const stores=[1,2,3,5,6,7,8,9,10,11].map(i=>store(i)).concat([Object.assign(store(4),{distance:99})]);
  const built=ok(dueSnail({stores,days:WEEK5,target:3,max:2,today:'2026-09-30',existingPlanFor:wk=>wk==='2026-09-28'?planOf('Lundi',[stores[10]]):null,completedOn:()=>false,rules:[deadline('2026-W40','s4','2026-10-02')]}));
  assert.deepStrictEqual(visitsOf(built,'s4'),['2026-09-28'],'tenue par la journée passée : aucune seconde visite');
  assert.deepStrictEqual([built.deadlines[0].by,built.deadlines[0].date],['kept',null]);
})();

(function lot3bManualWeekHoldsTheDeadline(){
  // 15. W41 retouchée pose s4 le lundi 05/10, échéance le 07/10 : tenue, ni avancée ni dupliquée.
  const manual={'2026-10-05':{at:'2026-09-20T00:00:00Z',plan:planOf('Lundi',[store(4)])}};
  const built=ok(dueSnail({state:{manualWeekEdits:manual},rules:[deadline('2026-W40','s4','2026-10-07',{validTo:'2026-W41'})]}));
  assert.deepStrictEqual(visitsOf(built,'s4'),['2026-10-05']);
  assert.strictEqual(built.deadlines[0].by,'manual');
  assert.strictEqual(picks(built),'s1 | s4 | s2');
})();

(function lot3bAppointmentOrLockHoldsTheDeadline(){
  // 16 + 17. Rendez-vous ou verrou daté le lundi 05/10, échéance le 07/10 : tenue, aucune visite en plus.
  for(const [label,extra] of [['rendez-vous',{appointments:[{id:'a4',storeId:'s4',date:'2026-10-05',time:'14:00'}]}],['verrou',{locks:{s4:{day:'Lundi',week:'2026-10-05'}}}]]){
    const built=ok(dueSnail({state:extra,rules:[deadline('2026-W40','s4','2026-10-07',{validTo:'2026-W41'})]}));
    assert.deepStrictEqual(visitsOf(built,'s4'),['2026-10-05'],label);
    assert.strictEqual(built.deadlines[0].by,'explicit',label);
  }
})();

(function lot3bConflictsAreRefusedAtomically(){
  // 18. Mercredi 30/09 : échéance mardi 29/09 déjà passée, rien ne la tient. Jamais de visite rétroactive.
  refusal(dueSnail({days:WEEK5,target:2,max:2,today:'2026-09-30',existingPlanFor:()=>({}),completedOn:()=>false,rules:[deadline('2026-W40','s4','2026-09-29',{label:'Avant mardi'})]}),'Avant mardi','29/09','Test Ville 4','échéance déjà dépassée');
  // 19. W41 retouchée pose s4 le mardi 06/10, après l'échéance du 05/10.
  const manual={'2026-10-05':{at:'2026-09-20T00:00:00Z',plan:planOf('Mardi',[store(4)])}};
  refusal(dueSnail({state:{manualWeekEdits:manual},rules:[deadline('2026-W40','s4','2026-10-05',{validTo:'2026-W41'})]}),'Échéance s4','05/10','Test Ville 4','semaine modifiée à la main : posé le 06/10, après l’échéance');
  // 20. Rendez-vous le 07/10 dans l'horizon, après l'échéance du 05/10.
  refusal(dueSnail({days:WEEK5,state:{appointments:[{id:'a4',storeId:'s4',date:'2026-10-07'}]},rules:[deadline('2026-W40','s4','2026-10-05',{validTo:'2026-W41'})]}),'Échéance s4','05/10','Test Ville 4','rendez-vous le 07/10, après l’échéance');
  // 21. Rendez-vous le 21/10, après l'échéance du 14/10 et après la fin de l'horizon.
  refusal(dueSnail({state:{appointments:[{id:'a4',storeId:'s4',date:'2026-10-21'}]},rules:[deadline('2026-W40','s4','2026-10-14',{validTo:'2026-W42'})]}),'Échéance s4','14/10','Test Ville 4','rendez-vous le 21/10, après l’échéance');
  // 22. Verrou daté hors horizon : la semaine qui suit le cycle (lundi 19/10) ou plus loin (mardi 27/10).
  refusal(dueSnail({state:{locks:{s4:{day:'Lundi',week:'2026-10-19'}}},rules:[deadline('2026-W40','s4','2026-10-14',{validTo:'2026-W42'})]}),'Échéance s4','14/10','Test Ville 4','verrouillé le 19/10, après l’échéance');
  refusal(dueSnail({state:{locks:{s4:{day:'Mardi',week:'2026-10-26'}}},rules:[deadline('2026-W40','s4','2026-10-14',{validTo:'2026-W42'})]}),'Échéance s4','14/10','Test Ville 4','verrouillé le 27/10, après l’échéance');
  // 23. Verrou récurrent le vendredi : sa prochaine occurrence (02/10) tombe après l'échéance du 30/09.
  refusal(dueSnail({days:WEEK5,target:2,max:2,state:{locks:{s4:'Vendredi'}},rules:[deadline('2026-W40','s4','2026-09-30')]}),'Échéance s4','30/09','Test Ville 4','verrouillé le 02/10, après l’échéance');
  // 24. Capacité : deux obligations le lundi 28/09 pour une seule place.
  refusal(dueSnail({rules:[deadline('2026-W40',['s3','s4'],'2026-09-28',{label:'Les deux lundi'})]}),'Les deux lundi','28/09','Test Ville 4','plus de créneau avant l’échéance : capacité ou horaires');
  // 25. Aucun jour compatible : seul le mercredi est travaillé, échéance le mardi 29/09.
  refusal(dueSnail({days:['Mercredi'],rules:[deadline('2026-W40','s4','2026-09-29')]}),'Échéance s4','29/09','Test Ville 4','aucune journée disponible avant l’échéance : jours non travaillés, bloqués ou magasin fermé');
  // Un RDV ou un verrou après l'échéance ne bloque pas une obligation déjà tenue (visite faite).
  ok(dueSnail({state:{visits:{s4:{lastVisit:'2026-09-25',history:['2026-09-25']}},appointments:[{id:'a4',storeId:'s4',date:'2026-10-21'}]},rules:[deadline('2026-W39','s4','2026-10-14',{validTo:'2026-W42'})]}));
  // Magasin du secteur hors du vivier planifiable (exclu ou filtré) : l'obligation ne peut pas être tenue.
  const pool=[1,2,3].map(i=>store(i));
  refusal(dueSnail({stores:pool,state:{stores:pool.concat([store(4)])},rules:[deadline('2026-W40','s4','2026-09-28')]}),'Échéance s4','28/09','Test Ville 4','exclu du planning ou hors des enseignes sélectionnées');
})();

(function lot3bObligationChoosesItsDayBeforeAnImposedStore(){
  // Un imposé sans jour peut aller ailleurs : l'obligation (lundi 28/09) choisit d'abord, les deux tiennent.
  const built=ok(dueSnail({days:['Lundi','Mardi'],target:2,state:{included:{s1:true}},rules:[deadline('2026-W40','s4','2026-09-28')]}));
  assert.deepStrictEqual(['Lundi','Mardi'].map(d=>built.weeks[0].plan[d].map(s=>s.id).join()),['s4','s1']);
})();

(function lot3bHolidaysAbsencesAndClosuresAreNeverBypassed(){
  // 26. Lundi 28/09 férié ou magasin fermé le lundi : posé le mardi ; échéance ce lundi-là : refus.
  const holiday=d=>d==='2026-09-28',closed=(route,day)=>!(day==='Lundi'&&route.some(s=>s.id==='s4'));
  for(const [label,extra] of [['férié',{dayBlocked:holiday}],['fermeture',{dayFits:closed}]]){
    assert.deepStrictEqual(visitsOf(ok(dueSnail(Object.assign({days:['Lundi','Mardi'],target:2,rules:[deadline('2026-W40','s4','2026-09-29')]},extra))),'s4'),['2026-09-29'],label);
    refusal(dueSnail(Object.assign({days:['Lundi','Mardi'],target:2,rules:[deadline('2026-W40','s4','2026-09-28')]},extra)),'Échéance s4','28/09','Test Ville 4','aucune journée disponible avant l’échéance : jours non travaillés, bloqués ou magasin fermé');
  }
})();

(function lot3bDeadlineVisitSurvivesCrossDayAndGeography(){
  // 27. D (dû lundi 28/09) est posé lundi avec a1, loin de lui ; l'échange D↔a2 (mardi) rapprocherait
  //     tout le monde, mais pousserait D après son échéance : V264 ne le fait pas.
  const row=(id,distance,x)=>({id,enseigne:'Test',ville:'Ville '+id,distance,x,active:true});
  const stores=[row('a1',1,100),row('a2',2,100),row('a3',3,-100),row('D',9,-100)];
  const evaluateDayRoute=route=>{const r=route.slice().sort((a,b)=>a.x-b.x),d=r.length<2?0:r[r.length-1].x-r[0].x;return{route:r,feasible:true,kilometers:d,driveMinutes:d}};
  const base={stores,days:['Lundi','Mardi'],target:3,max:2,needOf:()=>({tier:3,status:'late',blocked:false}),evaluateDayRoute,rules:[deadline('2026-W40','D','2026-09-28')]};
  const built=ok(dueSnail(base));
  assert.ok(built.crossDay.applied,'l’optimiseur cross-day a tourné');
  assert.deepStrictEqual(visitsOf(built,'D'),['2026-09-28'],'la visite d’échéance reste sur son créneau');
  assert.ok(built.crossDay.refused.deadlines>=1,'figée comme une contrainte explicite');
  // Une préparation géographique (V185) qui la déplacerait est annulée pour sa semaine.
  const moved=ok(dueSnail(Object.assign({},base,{prepareCrossDayWeeks:weeks=>{const p=weeks[0].plan;p.Mardi=p.Mardi.concat(p.Lundi.filter(s=>s.id==='D'));p.Lundi=p.Lundi.filter(s=>s.id!=='D');return{businessBaselineWeeks:weeks.map(w=>({weekKey:w.weekKey,plan:JSON.parse(JSON.stringify(w.plan))}))}}})));
  assert.deepStrictEqual(visitsOf(moved,'D'),['2026-09-28'],'préparation annulée : D reste le lundi');
})();

/* Atomicité par le bouton principal : vrai generateThreeWeekSnail, vrai V246, persistance simulée.
   Horloge figée au samedi 26/09 : W40 → W42 restent à venir quel que soit le jour d'exécution. */
async function lot3bRefusalKeepsThePreviousPlanning(){
  const fs=require('fs'),vm=require('vm'),path=require('path'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const Real=Date,NOW=new Real('2026-09-26T10:00:00');
  class FixedDate extends Real{constructor(...a){super(...(a.length?a:[NOW.getTime()]))}static now(){return NOW.getTime()}}
  async function run(rules,extra={}){
    const mem=new Map(),storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),flush:()=>Promise.resolve()};
    mem.set('chef_sector_plan_archive_v1',JSON.stringify({'2026-09-21':{weekMonday:'2026-09-21',plan:planOf('Lundi',[store(1)])}}));
    const stores=[1,2,3,4].map(i=>Object.assign(store(i),{lat:45,lon:4+i/100}));
    const state={profile:{baseLat:45,baseLon:4},settings:{days:['Lundi'],target:1,maxVisitsPerDay:1,weekDate:'2026-09-21',startTime:'08:30',endTime:'18:00',visitMinutes:45},stores,plan:planOf('Lundi',[stores[0]]),included:{},excluded:{},locks:{},appointments:extra.appointments||[],calendarEvents:[],manualWeekEdits:{},hotelReservations:{}};
    const persisted=[],ctx={console,Date:FixedDate,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,Promise,Error,setTimeout,clearTimeout,state,__chefStorage:storage,localStorage:storage,
      CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},dispatchEvent(){},addEventListener(){},removeEventListener(){},
      havBase:s=>Number(s.distance)||0,hav:(a,b)=>Math.abs((Number(a&&a.distance)||0)-(Number(b&&b.distance)||0)),baseObj:()=>({lat:45,lon:4,distance:0}),
      ChefReliability:{checkpoint(){},capture:(st,s)=>({state:JSON.parse(JSON.stringify(st)),archive:JSON.parse(s.getItem('chef_sector_plan_archive_v1')||'{}'),range:null}),persist:(bundle,s)=>{persisted.push(bundle);s.setItem('chef_sector_plan_archive_v1',JSON.stringify(bundle.archive||{}));s.setItem('chef_sector_range_v1',JSON.stringify(bundle.range))}}};
    ctx.window=ctx;
    vm.runInNewContext(read('weekly-brief-v246.js'),ctx,{filename:'weekly-brief-v246.js'});
    vm.runInNewContext(read('terrain-planning-v1.js'),ctx,{filename:'terrain-planning-v1.js'});
    for(const [week,rule] of rules)ctx.StoreRunnerWeeklyBriefV246.addRule(state,week,Object.assign({confidence:'confirmed'},rule));
    const before={plan:JSON.stringify(state.plan),storage:JSON.stringify([...mem.entries()])};
    let built=null,error=null;try{built=await ctx.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail({start:'2026-09-28'})}catch(e){error=e}
    return{built,error,persisted,ctx,before,after:{plan:JSON.stringify(ctx.state.plan),storage:JSON.stringify([...mem.entries()])},mem};
  }
  for(const [label,rules,extra,why] of [
    ['capacité',[deadline('2026-W40',['s3','s4'],'2026-09-28',{label:'Les deux lundi'})],{},'« Les deux lundi » (échéance le 28/09) : Test Ville 4 (plus de créneau avant l’échéance : capacité ou horaires)'],
    ['rendez-vous après l’échéance',[deadline('2026-W40','s4','2026-10-05',{validTo:'2026-W41'})],{appointments:[{id:'a4',storeId:'s4',date:'2026-10-12',time:'10:00'}]},'« Échéance s4 » (échéance le 05/10) : Test Ville 4 (rendez-vous le 12/10, après l’échéance)']
  ]){
    const r=await run(rules,extra);
    assert.ok(r.error&&r.built===null,label+' : la génération doit être refusée');
    assert.strictEqual(r.error.message,'1 obligation d’échéance du brief impossible à tenir — '+why+'. Le planning précédent est conservé.');
    assert.strictEqual(r.persisted.length,0,label+' : aucune proposition persistée');
    assert.strictEqual(r.after.plan,r.before.plan,label+' : planning précédent inchangé');
    assert.strictEqual(r.after.storage,r.before.storage,label+' : archive et période inchangées');
  }
  const done=await run([deadline('2026-W40','s4','2026-09-28')]);
  assert.strictEqual(done.error,null,done.error&&done.error.message);
  assert.strictEqual(done.persisted.length,1);
  assert.deepStrictEqual(JSON.parse(done.mem.get('chef_sector_plan_archive_v1'))['2026-09-28'].plan.Lundi.map(s=>s.id),['s4'],'obligation tenue et persistée par le bouton principal');
}

lot3bRefusalKeepsThePreviousPlanning().then(()=>console.log('terrain-planning-v1: OK'),e=>{console.error(e);process.exitCode=1});

// H1 : contrat découché du rapport 3 semaines, exécuté par Reliability à travers ce fichier.
require('./terrain-overnight-contract.test.cjs');
