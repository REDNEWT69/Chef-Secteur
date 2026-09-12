const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// #131 : le générateur de planning doit remplir une journée en crédits de visite, pas en
// nombre de magasins. Une enseigne à 2 crédits (Darty, Boulanger, Carrefour) demande 1h30
// à 2h : avec un plafond de 4, une journée ne doit jamais contenir 2 Darty et 2 Boulanger.

const plannerSource=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;','window.testCredits={strictSingleWeek,generateRange,visitCredit,routeCredits};window.generatePlanningRange=generateRange;');
const countingSource=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');

// Le planificateur ne doit pas redéfinir les règles de crédit : visit-counting.js en est
// le propriétaire, et c'est lui qui normalise la casse entre stores[].enseigne et les
// clés minuscules de visitCreditsByBrand.
assert.doesNotMatch(plannerSource,/DEFAULT_RULES|visitCreditsByBrand/,'le planificateur ne doit pas redéfinir les règles de crédit : elles appartiennent à visit-counting.js');
assert.match(plannerSource,/window\.storeVisitCredit/,'le planificateur doit consommer l’API publique des crédits de visite');
assert.match(plannerSource,/routeCredits\(plan\[day\]\)\+cost>max/,'le plafond journalier doit être un budget de crédits, jamais un nombre de magasins');
assert.doesNotMatch(plannerSource,/\(plan\[day\]\|\|\[\]\)\.length>=max/,'l’ancien plafond compté en magasins doit avoir disparu');
assert.match(countingSource,/function norm\(v\)[\s\S]*?toLowerCase\(\)/,'la normalisation de casse doit rester chez le propriétaire des crédits');

// --- Environnement de test ---------------------------------------------------------
// Même approche que tests/planning.test.cjs : pas de jsdom, seulement les primitives
// réellement utilisées par range-planner-v2.js.
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function env(options){
  const opts=options||{};
  const workDays=opts.workDays||['Lundi','Mardi'];
  const els={
    weekDate:{value:'2026-09-07'},rangeStart:{value:'2026-09-07'},rangeEnd:{value:'2026-09-11'},
    endTime:{value:'18:00'},maxVisitsPerDay:{value:String(opts.max||4)},
    generateRangeBtn:{},rangePlanStatus:{style:{}},statusText:{textContent:''}
  };
  const state={
    settings:{
      days:workDays.slice(),target:opts.target||20,weekDate:'2026-09-07',
      startTime:'08:30',endTime:'18:00',visitMinutes:60,
      maxVisitsPerDay:opts.max||4,
      visitCreditsByBrand:opts.credits===null?undefined:(opts.credits||{darty:2,boulanger:2,carrefour:2})
    },
    profile:{},stores:(opts.stores||[]).map(s=>Object.assign({},s)),
    plan:{Lundi:[{id:'old'}]},included:{},excluded:{},locks:opts.locks||{},
    appointments:[],calendarEvents:[],visits:{},notes:{}
  };
  const proposals=[];
  const ctx={
    state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{
      readyState:'loading',hidden:false,head:{appendChild(){}},body:{appendChild(){}},
      addEventListener(){},removeEventListener(){},
      createElement:()=>({style:{},classList:{add(){},remove(){},contains:()=>false,toggle(){}},dataset:{},appendChild(){},addEventListener(){},insertAdjacentElement(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]}),
      getElementById:id=>els[id]||null,
      querySelector:()=>null,
      querySelectorAll:selector=>selector==='[data-brand]'?[]:workDays.map(value=>({value,checked:true}))
    },
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,
    confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},initControls(){},
    includedByFilters:()=>true,
    havBase:()=>0,hav:()=>0,baseObj:()=>({lat:45,lon:4}),
    nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    MutationObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:fn=>fn(),
    ChefReliability:{checkpoint(){},propose:async c=>{proposals.push(c);return opts.accept===true}},
    syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]
  };
  ctx.window=ctx;
  // visit-counting.js d'abord : c'est lui qui publie window.storeVisitCredit, exactement
  // comme l'ordre de chargement dans index.html.
  if(opts.credits!==null)vm.runInNewContext(countingSource,ctx);
  vm.runInNewContext(plannerSource,ctx);
  return {ctx,state,proposals,els};
}

function store(id,enseigne,lon){return{id,enseigne,ville:'V'+id,adresse:'A'+id,lat:45,lon,priority:3,active:true}}

function creditsOf(ctx,route){return ctx.testCredits.routeCredits(route||[])}

function planDays(plan){return DAYS.filter(d=>(plan&&plan[d]||[]).length)}

(async()=>{
  // --- 1. Le cas terrain du ticket -------------------------------------------------
  // Plafond 4, Darty et Boulanger à 2 crédits : une journée ne doit jamais recevoir
  // 2 Darty et 2 Boulanger (8 crédits pour un plafond de 4).
  const pool=[
    store('d1','Darty',4.0),store('d2','Darty',4.1),store('d3','Darty',4.2),
    store('b1','Boulanger',4.05),store('b2','Boulanger',4.15),store('b3','Boulanger',4.25),
    store('c1','Carrefour',4.3)
  ];
  // Une seule journée ouvrée et un vivier plus grand que le plafond : c'est la situation
  // qui produisait 2 Darty + 2 Boulanger, soit 8 crédits pour un plafond de 4.
  let t=env({max:4,target:20,workDays:['Lundi'],stores:pool});
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'Darty'}),2,'Darty capitalisé doit valoir 2 crédits malgré la clé minuscule');
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'BOULANGER'}),2,'la correspondance d’enseigne doit ignorer la casse');
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'Boulanger Bourg-en-Bresse'}),2,'une enseigne suffixée doit rester reconnue');
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'Fnac'}),1,'une enseigne non listée vaut 1 crédit');

  await t.ctx.testCredits.strictSingleWeek();
  assert.equal(t.proposals.length,1,'la génération doit proposer un planning');
  let plan=t.proposals[0].plan;
  assert((plan.Lundi||[]).length,'la seule journée ouvrée ne doit pas être vide');
  for(const day of DAYS){
    const route=plan[day]||[];
    const cost=creditsOf(t.ctx,route);
    assert(cost<=4,day+' dépasse le plafond : '+cost+' crédits pour un maximum de 4');
    const darty=route.filter(s=>/darty/i.test(s.enseigne)).length;
    const boulanger=route.filter(s=>/boulanger/i.test(s.enseigne)).length;
    assert(!(darty>=2&&boulanger>=2),day+' contient 2 Darty et 2 Boulanger : exactement le cas que le ticket interdit');
    assert(route.length<=2,day+' contient '+route.length+' magasins à 2 crédits pour un plafond de 4');
  }
  assert.equal(creditsOf(t.ctx,plan.Lundi),4,'la journée doit être remplie jusqu’au plafond, mais en crédits');
  assert.equal((plan.Lundi||[]).length,2,'deux enseignes à 2 crédits saturent un plafond de 4');

  // La même situation étalée sur cinq jours reste sous le plafond, journée par journée.
  const tSpread=env({max:4,target:20,workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],stores:pool});
  await tSpread.ctx.testCredits.strictSingleWeek();
  assert.equal(tSpread.proposals.length,1);
  assert(planDays(tSpread.proposals[0].plan).length,'le planning étalé ne doit pas être vide');
  for(const day of DAYS){
    const cost=creditsOf(tSpread.ctx,tSpread.proposals[0].plan[day]||[]);
    assert(cost<=4,'étalement : '+day+' atteint '+cost+' crédits');
  }

  // --- 2. Le plafond tient sur plusieurs plafonds et plusieurs semaines --------------
  for(const max of [1,2,3,4,5,6,7,8]){
    const t2=env({max,target:40,workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],stores:pool});
    await t2.ctx.testCredits.strictSingleWeek();
    if(!t2.proposals.length)continue; // un plafond de 1 peut légitimement ne rien placer
    for(const day of DAYS){
      const cost=creditsOf(t2.ctx,t2.proposals[0].plan[day]||[]);
      assert(cost<=max,'plafond '+max+' : '+day+' atteint '+cost+' crédits');
    }
  }

  const t3=env({max:4,target:40,workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],stores:pool});
  t3.els.rangeStart.value='2026-09-07';t3.els.rangeEnd.value='2026-09-25';
  await t3.ctx.testCredits.generateRange();
  assert.equal(t3.proposals.length,1,'la génération de période doit proposer un planning');
  const archive=t3.proposals[0].archive||{};
  let semainesVerifiees=0;
  for(const snap of Object.values(archive)){
    if(!snap||!snap.plan)continue;
    semainesVerifiees++;
    for(const day of DAYS){
      const cost=creditsOf(t3.ctx,snap.plan[day]||[]);
      assert(cost<=4,'semaine '+snap.weekMonday+' : '+day+' atteint '+cost+' crédits pour un plafond de 4');
    }
  }
  assert(semainesVerifiees>=3,'la période de trois semaines doit avoir été vérifiée entièrement');

  // --- 3. Un magasin à 1 crédit remplit bien le plafond en nombre --------------------
  const cheap=[store('f1','Fnac',4.0),store('f2','Fnac',4.1),store('f3','Fnac',4.2),store('f4','Fnac',4.3),store('f5','Fnac',4.4)];
  const t4=env({max:4,target:20,workDays:['Lundi'],stores:cheap});
  await t4.ctx.testCredits.strictSingleWeek();
  assert.equal(t4.proposals.length,1);
  assert.equal((t4.proposals[0].plan.Lundi||[]).length,4,'quatre magasins à 1 crédit doivent tenir dans un plafond de 4');
  assert.equal(creditsOf(t4.ctx,t4.proposals[0].plan.Lundi),4);

  // --- 4. Le total en crédits est affiché à côté du compteur de visites --------------
  const t5=env({max:4,target:20,workDays:['Lundi','Mardi'],stores:pool,accept:true});
  await t5.ctx.testCredits.strictSingleWeek();
  assert.match(t5.els.rangePlanStatus.textContent,/\d+ visites · \d+ crédits? de visite/,'le statut de génération doit annoncer les crédits à côté des visites');
  const affiche=t5.els.rangePlanStatus.textContent.match(/(\d+) visites · (\d+) crédit/);
  assert(affiche,'le statut doit être lisible');
  const visitesAffichees=Number(affiche[1]),creditsAffiches=Number(affiche[2]);
  const creditsReels=DAYS.reduce((n,d)=>n+creditsOf(t5.ctx,t5.proposals[0].plan[d]||[]),0);
  assert.equal(creditsAffiches,creditsReels,'le total affiché doit être le vrai total de crédits');
  assert(creditsAffiches>=visitesAffichees,'un planning d’enseignes à 2 crédits doit afficher plus de crédits que de visites');

  const t6=env({max:4,target:40,workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],stores:pool,accept:true});
  t6.els.rangeStart.value='2026-09-07';t6.els.rangeEnd.value='2026-09-18';
  await t6.ctx.testCredits.generateRange();
  assert.match(t6.els.rangePlanStatus.textContent,/\d+ visites · \d+ crédits? de visite/,'le statut de période doit aussi annoncer les crédits');

  // --- 5. Sans visit-counting.js, l'ancien comptage en magasins est préservé ---------
  // Le planificateur ne doit jamais casser si le module des crédits n'est pas chargé.
  const t7=env({max:4,target:20,workDays:['Lundi'],stores:pool,credits:null});
  assert.equal(t7.ctx.testCredits.visitCredit({enseigne:'Darty'}),1,'sans le module des crédits, chaque magasin vaut 1');
  await t7.ctx.testCredits.strictSingleWeek();
  assert.equal(t7.proposals.length,1);
  assert.equal((t7.proposals[0].plan.Lundi||[]).length,4,'le repli sans crédits doit redonner exactement l’ancien plafond en magasins');

  // --- 6. Un magasin verrouillé trop coûteux est refusé, sans rien écraser -----------
  const t8=env({max:2,target:20,workDays:['Lundi'],stores:pool,locks:{d1:'Lundi',b1:'Lundi'}});
  const planAvant=JSON.stringify(t8.state.plan);
  await t8.ctx.testCredits.strictSingleWeek();
  assert.equal(t8.proposals.length,0,'un verrouillage à 4 crédits sous un plafond de 2 ne doit pas produire de planning');
  assert.equal(JSON.stringify(t8.state.plan),planAvant,'le planning précédent doit être conservé intact');
  assert.match(t8.els.rangePlanStatus.textContent,/crédits? de visite/,'le refus doit s’expliquer en crédits de visite');

  console.log('PASS: le générateur remplit les journées en crédits de visite, aucune journée générée ne dépasse maxVisitsPerDay en crédits, la casse des enseignes est normalisée par visit-counting.js, le total en crédits est affiché à côté des visites, et le repli sans module de crédits reste l’ancien comptage.');
})().catch(e=>{console.error(e);process.exit(1)});
