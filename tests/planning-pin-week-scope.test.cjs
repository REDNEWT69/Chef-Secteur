const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// Une pose manuelle est rattachée à la semaine où elle a été faite. state.locks[id] accepte
// deux formes : la chaîne "Mardi" (verrou récurrent, forme historique) et l'objet
// {day,week} (pose datée, honorée sur cette seule semaine). Sans dimension temporelle, une
// seule pose était réappliquée aux quatre semaines d'une période et y consommait quatre
// créneaux au lieu d'un, ce qui chassait des magasins de la couverture.

const plannerSource=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.openDayStoreReplacement=openDayStoreReplacement;','window.testScope={strictSingleWeek,generateRange,persistDayReplacement,pinStore,unpinStore,pinnedDay,isPinnedOn,lockEntry,lockDayForWeek,currentWeekKey,routeCredits,syncPinButton};window.openDayStoreReplacement=openDayStoreReplacement;');
const countingSource=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');
const coreSource=fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8');

// --- Garde-fous statiques -----------------------------------------------------------
assert.match(plannerSource,/function lockDayForWeek\(id,weekKey,source\)/,'la règle des deux formes doit exister en un seul endroit');
assert.match(plannerSource,/state\.locks\[String\(id\)\]=\{day,week:currentWeekKey\(\)\}/,'une pose doit être datée de la semaine courante');
assert.match(plannerSource,/function buildWeekUnique\(chosen,days,weekKey\)/,'la construction d’une semaine doit savoir de quelle semaine il s’agit');
assert.match(plannerSource,/const locked=lockDayForWeek\(store\.id,weekKey\)/,'le verrou appliqué doit être celui de la semaine construite');
assert.match(plannerSource,/function forcedRank\(s,weekKey\)/,'une pose datée ne doit pas réserver un créneau sur les autres semaines');
assert.match(plannerSource,/iso\(monday\(weekDate\)\)!==week/,'un objet de pose doit porter un lundi ISO valide, sinon il est refusé');
assert.doesNotMatch(plannerSource,/state\.pins|state\.pinnedWeeks|manualPins/,'aucun registre concurrent : state.locks reste la seule source');
// Le noyau lit la même règle au lieu de la redéfinir.
assert.match(coreSource,/window\.storeRunnerLockDayForWeek/,'le noyau doit consommer la règle publiée par le planificateur');
assert.match(coreSource,/var pinned=lockDayNow\(st\.id\)===selectedPlanningDay/,'le repère « posé » doit survivre à la forme datée');
// Onglet Magasins : le menu « Jour » ne doit ni mentir, ni convertir une pose en silence.
assert.match(coreSource,/window\.storeRunnerLockInfo/,'la liste des magasins doit distinguer un verrou récurrent d’une pose datée');
assert.match(coreSource,/Posé ce '\+esc\(posee\.day\.toLowerCase\(\)\)\+' \(semaine du /,'une pose datée doit être annoncée dans le menu, pas affichée « Jour libre »');
assert.match(coreSource,/Tous les '\+DAYS\[d\]\.toLowerCase\(\)\+'s<\/option>/,'choisir un jour dans ce menu doit s’annoncer comme récurrent');
assert.match(coreSource,/function setRecurringLock\(id,day\)/,'une seule écriture du verrou récurrent dans le noyau');
assert.match(coreSource,/window\.storeRunnerSetRecurringLock/,'et elle doit passer par le propriétaire de la règle');
assert.doesNotMatch(coreSource,/state\.locks\[found\.id\]=a\.day/,'l’assistant ne doit plus écrire le verrou en direct');
assert.doesNotMatch(coreSource,/state\.locks\[x\.store\.id\]=day/,'l’assistant ne doit plus écrire le verrou en direct');
// Les derniers lecteurs bruts du noyau sont convertis ; ne restent que les suppressions
// et les deux replis internes, qui sont indifférents à la forme.
assert.match(coreSource,/lock=lockDayNow\(s\.id\),km=/,'la vue semaine doit marquer « locked » selon la semaine affichée');
assert.match(coreSource,/state\.included\[s\.id\]\|\|lockDayNow\(s\.id\)/,'le repli de sélection doit lire la même règle');
assert.match(coreSource,/var lock=lockDayNow\(selected\[i\]\.id\);if\(lock&&groups\[lock\]\)/,'le repli de regroupement ne doit plus fabriquer groups["[object Object]"]');

// --- Environnement de test ----------------------------------------------------------
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const WORK=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

function env(options){
  const opts=options||{};
  const workDays=opts.workDays||WORK;
  const els={
    weekDate:{value:opts.weekDate||'2026-09-14'},
    rangeStart:{value:opts.rangeStart||'2026-09-14'},rangeEnd:{value:opts.rangeEnd||'2026-10-09'},
    endTime:{value:'18:00'},maxVisitsPerDay:{value:String(opts.max||4)},
    generateRangeBtn:{},rangePlanStatus:{style:{},textContent:''},statusText:{textContent:''}
  };
  const archiveStore={};
  const state={
    settings:{
      days:workDays.slice(),target:opts.target||20,weekDate:opts.weekDate||'2026-09-14',
      startTime:'08:30',endTime:'23:00',visitMinutes:1,maxVisitsPerDay:opts.max||4,
      visitCreditsByBrand:{darty:2,boulanger:2,carrefour:2}
    },
    profile:{},stores:(opts.stores||[]).map(s=>Object.assign({},s)),
    plan:opts.plan||Object.fromEntries(DAYS.map(d=>[d,[]])),
    included:{},excluded:{},locks:JSON.parse(JSON.stringify(opts.locks||{})),
    appointments:[],calendarEvents:[],visits:{},notes:{}
  };
  const proposals=[],checkpoints=[];
  const ctx={
    state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,Promise,
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    localStorage:{getItem:k=>archiveStore[k]||null,setItem(k,v){archiveStore[k]=String(v)},removeItem(k){delete archiveStore[k]}},
    document:{
      readyState:'complete',hidden:false,head:{appendChild(){}},body:{appendChild(){}},
      addEventListener(){},removeEventListener(){},dispatchEvent(){},
      createElement:()=>({style:{},classList:{add(){},remove(){},contains:()=>false,toggle(){}},dataset:{},appendChild(){},addEventListener(){},insertAdjacentElement(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]}),
      getElementById:id=>els[id]||null,
      querySelector:()=>null,
      querySelectorAll:selector=>selector==='[data-brand]'?[]:workDays.map(value=>({value,checked:true}))
    },
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout:(fn)=>{fn();return 0},clearTimeout(){},
    confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},initControls(){},
    includedByFilters:()=>true,
    havBase:()=>0,hav:()=>0,baseObj:()=>({lat:45,lon:4}),
    nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    MutationObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:fn=>fn(),
    ChefReliability:{
      checkpoint(reason){checkpoints.push(reason)},
      propose:async c=>{proposals.push(c);return opts.accept!==false},
      capture:s=>({format:'ChefSecteurBackup',version:1,state:JSON.parse(JSON.stringify(s||state)),archive:{},range:null}),
      persist(bundle){ctx.__persisted=bundle}
    },
    syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]
  };
  ctx.window=ctx;
  vm.runInNewContext(countingSource,ctx);
  vm.runInNewContext(plannerSource,ctx);
  return {ctx,state,proposals,checkpoints,els};
}

function store(id,enseigne,lon){return{id,enseigne,ville:'V'+id,adresse:'A'+id,lat:45,lon,priority:3,active:true}}
function ids(route){return Array.from(route||[]).map(s=>String(s.id))}

// Secteur synthétique calibré comme le secteur réel : la capacité de la période
// (4 semaines x 5 jours x 4 crédits = 80 crédits) est exactement consommée par le vivier
// (40 enseignes a 2 credits = 80 credits). Chaque magasin y passe donc une fois et une
// seule, et tout créneau pris deux fois par le même magasin en chasse un autre.
const SECTOR=Array.from({length:40},(_,i)=>store('s'+String(i).padStart(2,'0'),'Darty',4+i/100));
const WEEKS=['2026-09-14','2026-09-21','2026-09-28','2026-10-05'];

// Rejoue une période de 4 semaines et renvoie ce qui nous intéresse : le jour du magasin
// observé dans chaque semaine, et le nombre de magasins distincts couverts.
async function runRange(locks){
  const t=env({max:4,target:20,stores:SECTOR,locks,rangeStart:'2026-09-14',rangeEnd:'2026-10-09'});
  await t.ctx.testScope.generateRange();
  assert.equal(t.proposals.length,1,'la période doit être proposée');
  const archive=t.proposals[0].archive||{};
  const distinct=new Set(),perWeek={};
  for(const week of WEEKS){
    const snap=archive[week];
    perWeek[week]=null;
    if(!snap||!snap.plan)continue;
    for(const day of DAYS)for(const s of (snap.plan[day]||[])){
      distinct.add(String(s.id));
      if(String(s.id)==='s00')perWeek[week]=day;
    }
  }
  return {perWeek,distinct:distinct.size,statut:t.els.rangePlanStatus.textContent,t};
}

(async()=>{
  // --- Référence : sans aucune pose ------------------------------------------------
  const sans=await runRange({});
  const semainesSansPose=WEEKS.filter(w=>sans.perWeek[w]).length;

  // --- AVANT : la forme chaîne est réappliquée à toutes les semaines ----------------
  // C'est exactement ce que produisait pinStore avant ce correctif.
  const chaine=await runRange({s00:'Mardi'});
  const semainesChaine=WEEKS.filter(w=>chaine.perWeek[w]==='Mardi').length;
  assert.equal(semainesChaine,4,'AVANT : un verrou en forme chaîne occupe le mardi des 4 semaines');

  // --- APRÈS : la pose datée ne vaut que pour sa semaine ---------------------------
  const datee=await runRange({s00:{day:'Mardi',week:'2026-09-14'}});
  assert.equal(datee.perWeek['2026-09-14'],'Mardi','la pose doit être honorée sur sa propre semaine');
  const forcees=WEEKS.slice(1).filter(w=>datee.perWeek[w]==='Mardi').length;
  assert(forcees<3,'APRÈS : la pose ne doit plus imposer le mardi aux trois semaines suivantes');

  // Couverture : la pose datée ne doit plus chasser de magasins de la période.
  assert.equal(datee.distinct,sans.distinct,
    'la couverture doit revenir au niveau sans pose : '+sans.distinct+' attendus, '+datee.distinct+' obtenus');
  assert(chaine.distinct<sans.distinct,
    'le verrou récurrent, lui, réduit bien la couverture ('+chaine.distinct+' contre '+sans.distinct+')');

  console.error('  couverture sans pose        : '+sans.distinct+' magasins distincts');
  console.error('  couverture verrou récurrent : '+chaine.distinct+' magasins distincts, mardi occupé '+semainesChaine+' semaines sur 4');
  console.error('  couverture pose datée       : '+datee.distinct+' magasins distincts, mardi imposé 1 semaine sur 4');
  console.error('  semaines couvertes          : '+semainesSansPose+'/4 sans pose');

  // --- Le placement lui-même ignore la pose hors de sa semaine ---------------------
  // Vivier volontairement plus petit que la capacité : le magasin est sélectionné chaque
  // semaine. Semaine 1, la pose le tient sur Mardi. Semaine 2, elle ne s'applique plus,
  // donc l'équilibrage le pose sur la journée la moins chargée, Lundi.
  const petit=[store('s00','Fnac',4.0),store('s01','Fnac',4.1),store('s02','Fnac',4.2)];
  const tPlace=env({max:4,target:20,stores:petit,workDays:['Lundi','Mardi'],
    locks:{s00:{day:'Mardi',week:'2026-09-14'}},rangeStart:'2026-09-14',rangeEnd:'2026-09-25'});
  await tPlace.ctx.testScope.generateRange();
  const arch=tPlace.proposals[0].archive||{};
  const jourDe=(week)=>DAYS.find(d=>ids((arch[week]&&arch[week].plan&&arch[week].plan[d])||[]).includes('s00'))||null;
  assert.equal(jourDe('2026-09-14'),'Mardi','semaine de la pose : le magasin est tenu sur Mardi');
  assert.equal(jourDe('2026-09-21'),'Lundi','semaine suivante : la pose ne s’applique plus, l’équilibrage reprend la main');

  // --- La forme chaîne existante continue de fonctionner sans migration ------------
  const t1=env({max:4,target:20,stores:SECTOR,locks:{s00:'Mardi'},weekDate:'2026-09-14'});
  assert.deepEqual(Object.assign({},t1.ctx.testScope.lockEntry('s00')),{day:'Mardi',week:''},'la chaîne doit être lue comme un verrou récurrent');
  assert.equal(t1.ctx.testScope.pinnedDay('s00'),'Mardi','un verrou récurrent vaut pour la semaine affichée');
  assert.equal(t1.ctx.testScope.lockDayForWeek('s00','2026-10-05'),'Mardi','et pour toutes les autres');
  await t1.ctx.testScope.strictSingleWeek();
  assert(ids(t1.proposals[0].plan.Mardi).includes('s00'),'la semaine seule doit garder le magasin sur son mardi');
  assert.equal(t1.proposals[0].plan.Mardi.length>0,true);

  // --- La forme datée : honorée sur sa semaine, ignorée ailleurs -------------------
  const t2=env({max:4,target:20,stores:SECTOR,locks:{s00:{day:'Mardi',week:'2026-09-14'}},weekDate:'2026-09-14'});
  assert.deepEqual(Object.assign({},t2.ctx.testScope.lockEntry('s00')),{day:'Mardi',week:'2026-09-14'});
  assert.equal(t2.ctx.testScope.pinnedDay('s00'),'Mardi','la pose vaut pour sa propre semaine');
  assert.equal(t2.ctx.testScope.lockDayForWeek('s00','2026-09-21'),'','et pour aucune autre');
  await t2.ctx.testScope.strictSingleWeek();
  assert(ids(t2.proposals[0].plan.Mardi).includes('s00'),'régénérer la semaine seule laisse le magasin sur son mardi');
  assert.match(t2.els.rangePlanStatus.textContent,/Semaine générée/);
  assert.doesNotMatch(t2.els.rangePlanStatus.textContent,/non placée/,'0 visite non placée sur la semaine seule');

  // Sur une autre semaine affichée, la même pose ne force rien.
  const t3=env({max:4,target:20,stores:SECTOR,locks:{s00:{day:'Mardi',week:'2026-09-14'}},weekDate:'2026-09-21'});
  assert.equal(t3.ctx.testScope.pinnedDay('s00'),'','une pose d’une autre semaine ne s’applique pas ici');
  await t3.ctx.testScope.strictSingleWeek();
  assert.equal(t3.proposals.length,1);

  // --- pinStore écrit la forme datée, unpinStore la retire ------------------------
  const t4=env({max:4,target:20,stores:SECTOR,weekDate:'2026-09-21'});
  assert.equal(t4.ctx.testScope.currentWeekKey(),'2026-09-21','la semaine courante vient de settings.weekDate');
  assert.equal(t4.ctx.testScope.pinStore('s05','Jeudi'),true);
  assert.deepEqual(JSON.parse(JSON.stringify(t4.state.locks.s05)),{day:'Jeudi',week:'2026-09-21'},'la pose doit être datée');
  assert.equal(t4.ctx.testScope.isPinnedOn('s05','Jeudi'),true);
  assert.equal(t4.ctx.testScope.lockDayForWeek('s05','2026-09-14'),'','pas d’effet sur les autres semaines');
  assert.equal(t4.ctx.testScope.unpinStore('s05'),true,'le bouton Libérer doit retirer la pose');
  assert.equal(t4.state.locks.s05,undefined);
  assert.equal(t4.ctx.testScope.pinnedDay('s05'),'');

  // --- Les deux écritures publiques, et leur sens respectif -----------------------
  // Le bouton du planning pose sur une semaine ; la liste des magasins et l'assistant
  // verrouillent sur tous les jours de ce nom. Une seule règle, deux entrées explicites.
  const tApi=env({max:4,target:20,stores:SECTOR,weekDate:'2026-09-21'});
  assert.equal(tApi.ctx.storeRunnerLockInfo('s07'),null,'aucun verrou au départ');

  tApi.ctx.storeRunnerPinPlannedStore('s07','Mardi');
  let info=tApi.ctx.storeRunnerLockInfo('s07');
  assert.deepEqual({day:info.day,week:info.week,recurring:info.recurring},{day:'Mardi',week:'2026-09-21',recurring:false},'le bouton du planning pose sur la semaine affichée');
  assert.equal(tApi.ctx.testScope.lockDayForWeek('s07','2026-09-28'),'','et sur aucune autre');

  // Choisir un jour dans la liste des magasins remplace la pose par un verrou récurrent.
  assert.equal(tApi.ctx.storeRunnerSetRecurringLock('s07','Jeudi'),true);
  info=tApi.ctx.storeRunnerLockInfo('s07');
  assert.deepEqual({day:info.day,week:info.week,recurring:info.recurring},{day:'Jeudi',week:'',recurring:true},'la liste des magasins écrit un verrou récurrent');
  assert.equal(tApi.ctx.testScope.lockDayForWeek('s07','2026-10-05'),'Jeudi','qui vaut sur toutes les semaines');

  assert.equal(tApi.ctx.storeRunnerSetRecurringLock('s07',''),true,'« Jour libre » libère');
  assert.equal(tApi.ctx.storeRunnerLockInfo('s07'),null);
  assert.equal(tApi.ctx.storeRunnerSetRecurringLock('s07','Pizza'),false,'un jour inconnu est refusé, rien n’est écrit');
  assert.equal(tApi.ctx.storeRunnerLockInfo('s07'),null);

  // storeRunnerLockInfo décrit aussi la forme chaîne existante.
  const tInfo=env({max:4,target:20,stores:SECTOR,locks:{s08:'Mardi'},weekDate:'2026-09-14'});
  const i8=tInfo.ctx.storeRunnerLockInfo('s08');
  assert.deepEqual({day:i8.day,week:i8.week,recurring:i8.recurring},{day:'Mardi',week:'',recurring:true},'la forme chaîne est décrite comme récurrente');

  // --- Une valeur inattendue ne fait pas planter et n’impose rien -----------------
  for(const bidon of [
    {day:'Mardi'},
    {day:'Mardi',week:'2026-09-15'},
    {day:'Mardi',week:'2026-99-99'},
    {day:'Pizza',week:'2026-09-14'},
    {week:'2026-09-14'},
    'Pizza',{},42
  ]){
    const t=env({max:4,target:20,stores:SECTOR,locks:{s00:bidon},weekDate:'2026-09-14'});
    assert.equal(t.ctx.testScope.lockEntry('s00'),null,'forme illisible : lockEntry doit la refuser ('+JSON.stringify(bidon)+')');
    assert.equal(t.ctx.testScope.pinnedDay('s00'),'','forme illisible : aucun verrou, aucune exception ('+JSON.stringify(bidon)+')');
    assert.equal(t.ctx.storeRunnerLockInfo('s00'),null,'forme illisible : l’UI ne doit jamais la présenter comme récurrente ('+JSON.stringify(bidon)+')');
  }

  // --- Un jour non disponible fait toujours échouer, sans écraser le planning -----
  const planAvant={Lundi:[store('old','Fnac',4)],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  const t5=env({max:4,target:20,stores:SECTOR,workDays:['Lundi'],plan:planAvant,
    locks:{s00:{day:'Mardi',week:'2026-09-14'}},weekDate:'2026-09-14'});
  const avant=JSON.stringify(t5.state.plan);
  await t5.ctx.testScope.strictSingleWeek();
  assert.equal(t5.proposals.length,0,'aucun planning ne doit être proposé');
  assert.equal(JSON.stringify(t5.state.plan),avant,'le planning précédent doit être conservé');
  assert.match(t5.els.rangePlanStatus.textContent,/verrouillé sur Mardi/,'le message existant doit rester');

  // Même règle pour la forme chaîne.
  const t6=env({max:4,target:20,stores:SECTOR,workDays:['Lundi'],plan:planAvant,locks:{s00:'Mardi'},weekDate:'2026-09-14'});
  await t6.ctx.testScope.strictSingleWeek();
  assert.equal(t6.proposals.length,0);
  assert.match(t6.els.rangePlanStatus.textContent,/verrouillé sur Mardi/);

  // --- Le plafond journalier en crédits n’est pas cassé ---------------------------
  const gros=[store('d1','Darty',4.0),store('d2','Darty',4.1),store('d3','Darty',4.2),store('f1','Fnac',4.3)];
  const t7=env({max:4,target:20,stores:gros,workDays:['Lundi'],locks:{d1:{day:'Lundi',week:'2026-09-14'}},weekDate:'2026-09-14'});
  await t7.ctx.testScope.strictSingleWeek();
  const lundi=t7.proposals[0].plan.Lundi;
  assert(t7.ctx.testScope.routeCredits(lundi)<=4,'aucune journée ne doit dépasser 4 crédits');
  assert.equal(ids(lundi)[0],'d1','le magasin posé ouvre toujours sa journée');

  // --- Le remplacement manuel pose la forme datée ---------------------------------
  const t8=env({max:4,target:20,stores:SECTOR,weekDate:'2026-09-14',
    plan:Object.assign(Object.fromEntries(DAYS.map(d=>[d,[]])),{Lundi:[SECTOR[1],SECTOR[2]]}),
    locks:{s01:{day:'Lundi',week:'2026-09-14'}}});
  await t8.ctx.testScope.persistDayReplacement({
    day:'Lundi',anchor:SECTOR[3],oldId:'s01',recenter:false,
    route:[SECTOR[3],SECTOR[2]],protectedIds:[],km:0,end:'12:00',reduced:false,previousCount:2
  });
  const apres=t8.ctx.__persisted.state;
  assert.deepEqual(JSON.parse(JSON.stringify(apres.locks.s03)),{day:'Lundi',week:'2026-09-14'},'le magasin choisi à la main doit être posé et daté');
  assert.equal(apres.locks.s01,undefined,'le magasin remplacé doit être libéré');
  assert.equal(apres.locks.s02,undefined,'les magasins gardés automatiquement restent libres');
  assert(t8.checkpoints.some(r=>/Avant changement manuel/.test(r)),'le point de restauration doit rester');

  console.log('PASS: une pose est rattachée à sa semaine, la forme chaîne historique reste un verrou récurrent lisible sans migration, les objets datés incomplets sont refusés, la couverture d’une période retrouve son niveau sans pose, et le plafond en crédits comme le refus sur jour indisponible sont intacts.');
})().catch(e=>{console.error(e);process.exit(1)});