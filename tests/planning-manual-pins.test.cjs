const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// #138 / #143 : un magasin placé ou remplacé à la main est « posé ». La génération
// automatique ne doit jamais le déplacer, le remplacer ni le retirer. Un magasin déjà
// présent un autre jour peut maintenant être déplacé explicitement : l'ancien jour est
// adapté sans doublon et sans écraser les rendez-vous.

const plannerSource=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.openDayStoreReplacement=openDayStoreReplacement;','window.testPins={strictSingleWeek,persistDayReplacement,buildDayReplacement,plannedOtherDayForStore,pinStore,unpinStore,isPinnedOn,pinnedDay,togglePlannedStorePin,syncPinButton,installDayReplaceUi,routeCredits};window.openDayStoreReplacement=openDayStoreReplacement;');
const countingSource=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');
const coreSource=fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8');

// --- Garde-fous statiques -----------------------------------------------------------
// La pose réutilise state.locks, que le moteur honore déjà : pas de second registre.
assert.match(plannerSource,/function pinStore\(id,day\)/,'la pose manuelle doit exister dans le propriétaire du planning');
assert.match(plannerSource,/state\.locks\[String\(id\)\]=day/,'un magasin posé doit être verrouillé sur son jour, via le mécanisme existant');
assert.doesNotMatch(plannerSource,/state\.pins|state\.manualPlan|pinnedStores=/,'aucun registre concurrent ne doit doubler state.locks');
assert.match(plannerSource,/function unpinStore\(id\)/,'l’utilisateur doit pouvoir rendre un magasin à la génération automatique');
assert.match(plannerSource,/id="pinQuickStoreBtn"|pin\.id='pinQuickStoreBtn'/,'la fiche rapide doit proposer l’action poser/libérer');
assert.match(plannerSource,/↩ Libérer ce magasin/,'le libellé doit basculer vers la libération quand le magasin est posé');
assert.match(plannerSource,/📌 Poser ce magasin/,'le libellé doit proposer la pose quand le magasin est libre');
assert.match(plannerSource,/window\.storeRunnerPinPlannedStore/,'la pose doit être publique, pour qu’un futur déplacement l’appelle au lieu de redéfinir la règle');
assert.match(plannerSource,/Déplacer de /,'un magasin déjà prévu ailleurs doit être présenté comme déplaçable, pas comme un faux bouton sans effet');
assert.match(plannerSource,/store-moved-between-days/,'le déplacement inter-jours doit avoir un événement explicite');
// Indication visuelle, chez le propriétaire du rendu de la timeline.
assert.match(coreSource,/state\.locks&&state\.locks\[st\.id\]===selectedPlanningDay/,'la timeline doit distinguer une visite posée d’une visite automatique');
assert.match(coreSource,/\(pinned\?'<div class="tlPinned"/,'la ligne de timeline doit émettre le repère quand la visite est posée');
assert.match(coreSource,/timelineRow'\+\(pinned\?' pinnedVisit':''\)/,'la ligne posée doit aussi être reconnaissable au niveau de la ligne entière');
assert.match(coreSource,/\.tlPinned\{/,'le repère de visite posée doit être stylé');

// --- Environnement de test ----------------------------------------------------------
// Même approche que tests/planning.test.cjs : pas de jsdom.
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function env(options){
  const opts=options||{};
  const workDays=opts.workDays||['Lundi','Mardi'];
  const els={
    weekDate:{value:'2026-09-14'},rangeStart:{value:'2026-09-14'},rangeEnd:{value:'2026-09-18'},
    endTime:{value:'18:00'},maxVisitsPerDay:{value:String(opts.max||4)},
    generateRangeBtn:{},rangePlanStatus:{style:{}},statusText:{textContent:''}
  };
  const state={
    settings:{
      days:workDays.slice(),target:opts.target||20,weekDate:'2026-09-14',
      startTime:'08:30',endTime:'18:00',visitMinutes:60,maxVisitsPerDay:opts.max||4,
      visitCreditsByBrand:{darty:2,boulanger:2,carrefour:2}
    },
    profile:{},stores:(opts.stores||[]).map(s=>Object.assign({},s)),
    plan:opts.plan||{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
    included:{},excluded:{},locks:Object.assign({},opts.locks||{}),
    appointments:(opts.appointments||[]).map(a=>Object.assign({},a)),calendarEvents:[],visits:{},notes:{}
  };
  const proposals=[],checkpoints=[],saves=[];
  const ctx={
    state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{
      readyState:'complete',hidden:false,head:{appendChild(){}},body:{appendChild(){}},
      addEventListener(){},removeEventListener(){},
      createElement:()=>({style:{},classList:{add(){},remove(){},contains:()=>false,toggle(){}},dataset:{},appendChild(){},addEventListener(){},insertAdjacentElement(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]}),
      getElementById:id=>els[id]||null,
      querySelector:()=>null,dispatchEvent(){},
      querySelectorAll:selector=>selector==='[data-brand]'?[]:workDays.map(value=>({value,checked:true}))
    },
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,
    confirm:()=>true,readPlanningControls(){},save(){saves.push(1)},renderAll(){},initControls(){},
    includedByFilters:()=>true,
    havBase:()=>0,hav:()=>0,baseObj:()=>({lat:45,lon:4}),
    nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    MutationObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:fn=>fn(),
    ChefReliability:{
      checkpoint(reason){checkpoints.push(reason)},
      propose:async c=>{proposals.push(c);return opts.accept===true},
      capture:s=>({format:'ChefSecteurBackup',version:1,state:JSON.parse(JSON.stringify(s||state)),archive:JSON.parse(JSON.stringify(opts.archive||{})),range:opts.range||null}),
      persist(bundle){ctx.__persisted=bundle}
    },
    syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]
  };
  ctx.window=ctx;
  vm.runInNewContext(countingSource,ctx);
  vm.runInNewContext(plannerSource,ctx);
  return {ctx,state,proposals,checkpoints,saves,els};
}

function store(id,enseigne,lon){return{id,enseigne,ville:'V'+id,adresse:'A'+id,lat:45,lon,priority:3,active:true}}
function ids(route){return Array.from(route||[]).map(s=>String(s.id))}

(async()=>{
  const pool=[
    store('p1','Fnac',4.00),store('p2','Fnac',4.01),
    store('a1','Fnac',4.10),store('a2','Fnac',4.11),store('a3','Fnac',4.12),
    store('a4','Fnac',4.13),store('a5','Fnac',4.14),store('a6','Fnac',4.15)
  ];

  // --- 1. Les magasins posés sont retrouvés au même jour et à la même place ----------
  let t=env({max:4,target:20,workDays:['Lundi','Mardi'],stores:pool,accept:true,
    locks:{p1:'Lundi',p2:'Mardi'}});
  await t.ctx.testPins.strictSingleWeek();
  assert.equal(t.proposals.length,1,'la génération doit proposer un planning');
  let plan=t.proposals[0].plan;
  assert(ids(plan.Lundi).includes('p1'),'le magasin posé sur Lundi doit rester sur Lundi');
  assert(ids(plan.Mardi).includes('p2'),'le magasin posé sur Mardi doit rester sur Mardi');
  assert.equal(ids(plan.Lundi)[0],'p1','un magasin posé ouvre sa journée : il est placé avant les visites automatiques');
  assert.equal(ids(plan.Mardi)[0],'p2');
  for(const day of DAYS)if(day!=='Lundi')assert(!ids(plan[day]).includes('p1'),'un magasin posé ne doit jamais migrer vers '+day);
  for(const day of DAYS)if(day!=='Mardi')assert(!ids(plan[day]).includes('p2'),'un magasin posé ne doit jamais migrer vers '+day);

  // --- 2. Les visites automatiques, elles, sont bien recalculées ---------------------
  const auto1=ids(plan.Lundi).filter(id=>id!=='p1').concat(ids(plan.Mardi).filter(id=>id!=='p2'));
  assert(auto1.length,'la génération doit avoir complété les journées avec des visites automatiques');

  const t2=env({max:4,target:20,workDays:['Lundi','Mardi'],accept:true,locks:{p1:'Lundi',p2:'Mardi'},
    stores:[pool[0],pool[1],store('b1','Fnac',4.20),store('b2','Fnac',4.21),store('b3','Fnac',4.22),store('b4','Fnac',4.23)]});
  await t2.ctx.testPins.strictSingleWeek();
  const plan2=t2.proposals[0].plan;
  assert.equal(ids(plan2.Lundi)[0],'p1','le posé reste en tête après un changement complet de vivier');
  assert.equal(ids(plan2.Mardi)[0],'p2');
  const auto2=ids(plan2.Lundi).filter(id=>id!=='p1').concat(ids(plan2.Mardi).filter(id=>id!=='p2'));
  assert(auto2.length,'la seconde génération doit aussi produire des visites automatiques');
  assert(auto2.every(id=>/^b/.test(id)),'les visites automatiques doivent être recalculées à partir du vivier courant');
  assert.notDeepEqual(auto1,auto2,'les visites automatiques doivent réellement changer d’une génération à l’autre');

  // --- 3. Le budget de crédits tient compte des posés -------------------------------
  const t3=env({max:4,target:20,workDays:['Lundi'],accept:true,locks:{d1:'Lundi'},
    stores:[store('d1','Darty',4.0),store('f1','Fnac',4.1),store('f2','Fnac',4.2),store('f3','Fnac',4.3),store('f4','Fnac',4.4)]});
  await t3.ctx.testPins.strictSingleWeek();
  const lundi=t3.proposals[0].plan.Lundi;
  assert.equal(ids(lundi)[0],'d1','le Darty posé doit rester en tête de journée');
  assert.equal(t3.ctx.testPins.routeCredits(lundi),4,'la journée doit être remplie jusqu’au plafond, crédits compris');
  assert.equal(lundi.length,3,'2 crédits posés + 2 crédits automatiques : un Darty et deux Fnac');

  const t4=env({max:4,target:20,workDays:['Lundi'],accept:true,locks:{d1:'Lundi',d2:'Lundi'},
    stores:[store('d1','Darty',4.0),store('d2','Darty',4.1),store('f1','Fnac',4.2),store('f2','Fnac',4.3)]});
  await t4.ctx.testPins.strictSingleWeek();
  const satured=t4.proposals[0].plan.Lundi;
  assert.equal(t4.ctx.testPins.routeCredits(satured),4,'deux Darty posés remplissent le plafond');
  assert.deepEqual(ids(satured).slice(0,2),['d1','d2'],'les deux posés doivent être là, tous les deux');
  assert.equal(satured.length,2,'aucune visite automatique ne doit s’ajouter au-delà du plafond');

  // --- 4. Des posés au-dessus du plafond sont annoncés, jamais retirés ---------------
  const t5=env({max:2,target:20,workDays:['Lundi','Mardi'],accept:true,locks:{d1:'Lundi',d2:'Lundi'},
    stores:[store('d1','Darty',4.0),store('d2','Darty',4.1),store('f1','Fnac',4.2)]});
  const planAvant=JSON.stringify(t5.state.plan);
  await t5.ctx.testPins.strictSingleWeek();
  assert.equal(t5.proposals.length,0,'un dépassement par les seuls posés ne doit produire aucun planning');
  assert.equal(JSON.stringify(t5.state.plan),planAvant,'le planning précédent doit rester intact');
  assert.match(t5.els.rangePlanStatus.textContent,/Lundi/,'le message doit nommer la journée en cause');
  assert.match(t5.els.rangePlanStatus.textContent,/crédits? de visite/,'le refus doit s’expliquer en crédits');
  assert.match(t5.els.rangePlanStatus.textContent,/plafond de 2/,'le message doit rappeler le plafond');
  assert.match(t5.els.rangePlanStatus.textContent,/Libère-en un/,'le message doit dire quoi faire');

  const t5b=env({max:2,target:20,workDays:['Lundi'],accept:true,locks:{d1:'Lundi',d2:'Lundi'},
    stores:[store('d1','Darty',4.0),store('d2','Darty',4.1),store('f1','Fnac',4.2)]});
  await t5b.ctx.testPins.strictSingleWeek();
  assert.equal(t5b.proposals.length,0,'une capacité totale insuffisante ne doit produire aucun planning');
  assert.match(t5b.els.rangePlanStatus.textContent,/posés, imposés ou verrouillés/,'le refus doit parler des magasins posés');
  assert.match(t5b.els.rangePlanStatus.textContent,/4 crédits de visite pour seulement 2 disponibles/);

  // --- 5. Le remplacement manuel pose le nouveau magasin et libère l’ancien ----------
  const t6=env({max:4,target:20,workDays:['Lundi'],stores:pool,locks:{a1:'Lundi'},
    plan:{Lundi:[pool[2],pool[3]],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}});
  assert.equal(t6.ctx.testPins.pinnedDay('a1'),'Lundi','état de départ : a1 est posé sur Lundi');
  await t6.ctx.testPins.persistDayReplacement({
    day:'Lundi',anchor:pool[4],oldId:'a1',recenter:false,
    route:[pool[4],pool[3]],protectedIds:[],km:0,end:'12:00',reduced:false,previousCount:2
  });
  const apres=t6.ctx.__persisted.state;
  assert.equal(apres.locks.a3,'Lundi','le magasin choisi à la main doit être posé sur ce jour');
  assert.equal(apres.locks.a1,undefined,'le magasin remplacé doit être libéré, sinon il reviendrait de force');
  assert.equal(ids(apres.plan.Lundi)[0],'a3','le remplacement doit être appliqué à la journée');
  assert(t6.checkpoints.some(r=>/Avant changement manuel/.test(r)),'un point de restauration doit précéder la modification manuelle');
  assert.equal(apres.locks.a2,undefined,'le recentrage automatique ne doit poser personne d’autre');

  // --- 6. Poser puis libérer depuis la fiche rapide ---------------------------------
  const t7=env({max:4,target:20,workDays:['Lundi'],stores:pool,
    plan:{Lundi:[pool[2]],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}});
  t7.els.srQuickStart={dataset:{srStart:'a1'}};
  const btn={hidden:true,textContent:'',title:'',_attrs:{},setAttribute(n,v){this._attrs[n]=v}};
  t7.els.pinQuickStoreBtn=btn;

  assert.equal(t7.ctx.testPins.syncPinButton(),true,'le bouton doit se synchroniser sur le magasin affiché');
  assert.equal(btn.hidden,false,'un magasin présent dans la journée doit pouvoir être posé');
  assert.equal(btn.textContent,'📌 Poser ce magasin');
  assert.equal(btn._attrs['aria-pressed'],'false');

  await t7.ctx.testPins.togglePlannedStorePin();
  assert.equal(t7.state.locks.a1,'Lundi','le clic doit poser le magasin sur sa journée');
  assert.equal(btn.textContent,'↩ Libérer ce magasin','le libellé doit basculer');
  assert.equal(btn._attrs['aria-pressed'],'true');
  assert(t7.saves.length>=1,'la pose doit être enregistrée');
  assert(t7.checkpoints.some(r=>/Avant pose de/.test(r)),'un point de restauration doit précéder la pose');

  await t7.ctx.testPins.togglePlannedStorePin();
  assert.equal(t7.state.locks.a1,undefined,'le second clic doit rendre le magasin à la génération automatique');
  assert.equal(btn.textContent,'📌 Poser ce magasin','le libellé doit revenir à la pose');
  assert(t7.checkpoints.some(r=>/Avant libération de/.test(r)),'un point de restauration doit précéder la libération');

  t7.els.srQuickStart.dataset.srStart='a6';
  t7.ctx.testPins.syncPinButton();
  assert.equal(btn.hidden,true,'un magasin hors de la journée affichée ne doit pas proposer la pose');

  // --- 7. Un magasin libéré redevient déplaçable par la génération -------------------
  const t8=env({max:4,target:20,workDays:['Lundi','Mardi'],stores:pool,accept:true,locks:{p1:'Mardi'}});
  await t8.ctx.testPins.strictSingleWeek();
  assert(ids(t8.proposals[0].plan.Mardi).includes('p1'),'posé sur Mardi, le magasin y reste');
  t8.ctx.testPins.unpinStore('p1');
  assert.equal(t8.ctx.testPins.pinnedDay('p1'),'','la libération doit retirer la pose');
  const t9=env({max:4,target:20,workDays:['Lundi','Mardi'],stores:pool,accept:true});
  await t9.ctx.testPins.strictSingleWeek();
  const jourLibre=DAYS.find(d=>ids(t9.proposals[0].plan[d]||[]).includes('p1'));
  assert(jourLibre,'sans pose, le magasin reste planifiable');
  assert.equal(t9.ctx.testPins.pinnedDay('p1'),'','un magasin libre ne doit porter aucune pose');

  // --- 8. Déplacer un magasin déjà planifié un autre jour adapte la semaine ----------
  const moveStores=[store('old','Fnac',4.00),store('anchor','Fnac',4.10),store('m2','Fnac',4.11),store('l2','Fnac',4.01),store('free','Fnac',4.12)];
  const weekArchive={'2026-09-14':{weekMonday:'2026-09-14',plan:{Lundi:[moveStores[0],moveStores[3]],Mardi:[moveStores[1],moveStores[2]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}};
  const t10=env({max:4,target:20,workDays:['Lundi','Mardi'],stores:moveStores,locks:{old:'Lundi',anchor:'Mardi'},archive:weekArchive,
    plan:{Lundi:[moveStores[0],moveStores[3]],Mardi:[moveStores[1],moveStores[2]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}});
  assert.equal(t10.ctx.testPins.plannedOtherDayForStore('anchor','Lundi'),'Mardi','le moteur doit retrouver le jour d’origine');
  const preview=t10.ctx.testPins.buildDayReplacement('old',moveStores[1],'Lundi',false);
  assert.equal(preview.sourceDay,'Mardi','le remplacement doit devenir un déplacement inter-jours');
  assert(ids(preview.route).includes('anchor'),'le magasin choisi doit arriver sur Lundi');
  assert(!ids(preview.sourceRoute).includes('anchor'),'le magasin déplacé doit disparaître de Mardi');
  assert.equal(preview.sourceRoute.length,2,'Mardi doit être recomblé quand un candidat compatible existe');
  assert(t10.ctx.testPins.routeCredits(preview.route)<=4,'le jour cible doit respecter le budget de crédits');
  assert(t10.ctx.testPins.routeCredits(preview.sourceRoute)<=4,'le jour source doit respecter le budget de crédits');

  await t10.ctx.testPins.persistDayReplacement(preview);
  const moved=t10.ctx.__persisted;
  assert(ids(moved.state.plan.Lundi).includes('anchor'),'le déplacement persistant doit placer anchor sur Lundi');
  assert(!ids(moved.state.plan.Mardi).includes('anchor'),'anchor ne doit plus exister sur Mardi');
  const occurrences=DAYS.reduce((n,d)=>n+ids(moved.state.plan[d]||[]).filter(id=>id==='anchor').length,0);
  assert.equal(occurrences,1,'un déplacement ne doit jamais créer de doublon dans la semaine');
  assert.equal(moved.state.locks.anchor,'Lundi','la pose manuelle doit suivre le magasin sur son nouveau jour');
  assert.equal(moved.state.locks.old,undefined,'le magasin remplacé doit être libéré');
  assert(t10.checkpoints.some(r=>/Avant déplacement manuel de Mardi vers Lundi/.test(r)),'le déplacement doit avoir son point de restauration explicite');
  assert(ids(moved.archive['2026-09-14'].plan.Lundi).includes('anchor'),'l’archive de période doit recevoir le nouveau Lundi');
  assert(!ids(moved.archive['2026-09-14'].plan.Mardi).includes('anchor'),'l’archive de période doit aussi mettre à jour Mardi');

  // --- 9. Un rendez-vous empêche le déplacement silencieux ---------------------------
  const t11=env({max:4,target:20,workDays:['Lundi','Mardi'],stores:moveStores,locks:{anchor:'Mardi'},appointments:[{storeId:'anchor',date:'2026-09-15'}],
    plan:{Lundi:[moveStores[0]],Mardi:[moveStores[1],moveStores[2]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}});
  assert.throws(()=>t11.ctx.testPins.buildDayReplacement('old',moveStores[1],'Lundi',false),/rendez-vous Mardi/,'un magasin lié à un rendez-vous ne doit pas changer de jour sans déplacer le rendez-vous');
  assert(ids(t11.state.plan.Mardi).includes('anchor'),'le refus ne doit rien modifier avant validation');

  console.log('PASS: pose/libération, budgets de crédits et remplacement manuel restent protégés ; un magasin déjà prévu un autre jour peut être déplacé explicitement, le jour source est adapté sans doublon, les deux jours sont persistés dans l’archive, et un rendez-vous bloque le déplacement avant toute mutation.');
})().catch(e=>{console.error(e);process.exit(1)});
