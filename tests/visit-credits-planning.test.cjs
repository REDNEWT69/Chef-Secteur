const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// #131 + #225 : le générateur remplit une journée en crédits de visite. Darty,
// Boulanger, Carrefour et BUT valent 2 crédits métier, mais Boulanger réserve en plus
// la capacité nécessaire pour n'avoir qu'un seul magasin à 1 crédit à ses côtés.

const plannerSource=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;','window.testCredits={strictSingleWeek,generateRange,visitCredit,routeCredits};window.generatePlanningRange=generateRange;');
const countingSource=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');

assert.doesNotMatch(plannerSource,/DEFAULT_RULES|visitCreditsByBrand/,'le planificateur ne doit pas redéfinir les règles de crédit : elles appartiennent à visit-counting.js');
assert.match(plannerSource,/window\.storeVisitCredit/,'le planificateur doit consommer l’API publique des crédits de visite');
assert.match(plannerSource,/routeCredits\(plan\[day\]\)\+cost>max/,'le plafond journalier doit être un budget de crédits, jamais un nombre de magasins');
assert.doesNotMatch(plannerSource,/\(plan\[day\]\|\|\[\]\)\.length>=max/,'l’ancien plafond compté en magasins doit avoir disparu');
assert.match(countingSource,/function norm\(v\)[\s\S]*?toLowerCase\(\)/,'la normalisation de casse doit rester chez le propriétaire des crédits');
assert.match(countingSource,/but:2/,'BUT doit faire partie des enseignes à 2 crédits');
assert.match(countingSource,/function planningVisitCredit\(/,'la capacité spéciale Boulanger doit appartenir au propriétaire des crédits');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function env(options){
  const opts=options||{};
  const workDays=opts.workDays||['Lundi','Mardi'];
  const els={
    weekDate:{value:'2026-09-07'},rangeStart:{value:'2026-09-07'},rangeEnd:{value:'2026-09-11'},
    endTime:{value:'18:00'},maxVisitsPerDay:{value:String(opts.max||4)},
    generateRangeBtn:{disabled:false},rangePlanStatus:{style:{}},statusText:{textContent:''}
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
  if(opts.credits!==null)vm.runInNewContext(countingSource,ctx);
  vm.runInNewContext(plannerSource,ctx);
  return {ctx,state,proposals,els};
}

function store(id,enseigne,lon){return{id,enseigne,ville:'V'+id,adresse:'A'+id,lat:45,lon,priority:3,active:true}}
function actualCreditsOf(ctx,route){return (route||[]).reduce((n,s)=>n+(ctx.StoreVisitCounting?ctx.StoreVisitCounting.credit(s):1),0)}
async function generateWeekAsProduction(t){
  t.ctx.__storeRunnerPlanningGenerationActive=true;
  try{return await t.ctx.testCredits.strictSingleWeek()}finally{t.ctx.__storeRunnerPlanningGenerationActive=false}
}

(async()=>{
  const pool=[
    store('d1','Darty',4.0),store('d2','Darty',4.1),store('d3','Darty',4.2),
    store('b1','Boulanger',4.05),store('b2','Boulanger',4.15),store('b3','Boulanger',4.25),
    store('c1','Carrefour',4.3)
  ];
  let t=env({max:4,target:20,workDays:['Lundi'],stores:pool});
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'Darty'}),2,'Darty capitalisé doit valoir 2 crédits malgré la clé minuscule');
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'BOULANGER'}),2,'hors génération, Boulanger reste exactement à 2 crédits métier');
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'Boulanger Bourg-en-Bresse'}),2,'une enseigne suffixée doit rester reconnue');
  assert.equal(t.ctx.StoreVisitCounting.credit({enseigne:'BUT Saint-Priest'}),2,'BUT doit compter 2 crédits métier');
  assert.equal(t.ctx.testCredits.visitCredit({enseigne:'Fnac'}),1,'une enseigne non listée vaut 1 crédit');

  await generateWeekAsProduction(t);
  assert.equal(t.proposals.length,1,'la génération doit proposer un planning');
  let plan=t.proposals[0].plan;
  assert((plan.Lundi||[]).length,'la seule journée ouvrée ne doit pas être vide');
  for(const day of DAYS){
    const route=plan[day]||[];
    const actual=actualCreditsOf(t.ctx,route);
    assert(actual<=4,day+' dépasse le plafond métier : '+actual+' crédits pour un maximum de 4');
  }

  const boulangerPool=[
    store('b1','Boulanger',4.00),store('b2','Boulanger',4.02),
    store('but1','BUT',4.03),store('d1','Darty',4.04),
    store('f1','Fnac',4.05),store('f2','Fnac',4.06)
  ];
  const tb=env({max:4,target:20,workDays:['Lundi'],stores:boulangerPool});
  await generateWeekAsProduction(tb);
  assert.equal(tb.proposals.length,1,'la journée Boulanger doit pouvoir être générée');
  const br=tb.proposals[0].plan.Lundi||[];
  assert.equal(br.filter(s=>/boulanger/i.test(s.enseigne)).length,1,'jamais deux Boulanger le même jour');
  assert.equal(br.length,2,'un Boulanger doit être accompagné au maximum d’un seul autre magasin');
  const companion=br.find(s=>!/boulanger/i.test(s.enseigne));
  assert(companion,'un magasin léger doit compléter la journée quand il est disponible');
  assert.equal(tb.ctx.StoreVisitCounting.credit(companion),1,'le compagnon de Boulanger doit être une enseigne à 1 crédit');
  assert.equal(actualCreditsOf(tb.ctx,br),3,'Boulanger (2) + magasin léger (1) = 3 crédits métier');
  assert(!/but|darty/i.test(companion.enseigne),'BUT/Darty à 2 crédits ne doivent pas accompagner Boulanger');

  const tbLocked=env({max:4,target:20,workDays:['Lundi'],stores:boulangerPool,locks:{b1:'Lundi',b2:'Lundi'}});
  const beforeLocked=JSON.stringify(tbLocked.state.plan);
  await generateWeekAsProduction(tbLocked);
  assert.equal(tbLocked.proposals.length,0,'deux Boulanger verrouillés sur le même jour doivent être refusés');
  assert.equal(JSON.stringify(tbLocked.state.plan),beforeLocked,'le planning précédent doit rester intact si les verrous sont incompatibles');

  const tp=env({max:4,target:40,workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],stores:boulangerPool});
  tp.els.rangeStart.value='2026-09-07';tp.els.rangeEnd.value='2026-09-25';
  await tp.ctx.testCredits.generateRange();
  assert.equal(tp.proposals.length,1,'la génération de période doit proposer un planning');
  const archive=tp.proposals[0].archive||{};
  let semainesVerifiees=0;
  for(const snap of Object.values(archive)){
    if(!snap||!snap.plan)continue;
    semainesVerifiees++;
    for(const day of DAYS){
      const route=snap.plan[day]||[],bs=route.filter(s=>/boulanger/i.test(s.enseigne));
      assert(bs.length<=1,'période '+snap.weekMonday+' '+day+' : jamais deux Boulanger');
      if(bs.length){
        assert(route.length<=2,'période '+snap.weekMonday+' '+day+' : Boulanger + un seul compagnon maximum');
        for(const s of route)if(!/boulanger/i.test(s.enseigne))assert.equal(tp.ctx.StoreVisitCounting.credit(s),1,'le compagnon de Boulanger doit rester à 1 crédit sur la période');
      }
    }
  }
  assert(semainesVerifiees>=3,'la période de trois semaines doit avoir été vérifiée entièrement');

  const cheap=[store('f1','Fnac',4.0),store('f2','Fnac',4.1),store('f3','Fnac',4.2),store('f4','Fnac',4.3),store('f5','Fnac',4.4)];
  const t4=env({max:4,target:20,workDays:['Lundi'],stores:cheap});
  await generateWeekAsProduction(t4);
  assert.equal(t4.proposals.length,1);
  assert.equal((t4.proposals[0].plan.Lundi||[]).length,4,'quatre magasins à 1 crédit doivent tenir dans un plafond de 4');
  assert.equal(actualCreditsOf(t4.ctx,t4.proposals[0].plan.Lundi),4);

  const t5=env({max:4,target:20,workDays:['Lundi','Mardi'],stores:boulangerPool,accept:true});
  await generateWeekAsProduction(t5);
  const proposed=t5.proposals[0];
  const actualWeek=DAYS.reduce((n,d)=>n+actualCreditsOf(t5.ctx,(proposed.plan&&proposed.plan[d])||[]),0);
  assert.equal(t5.ctx.StoreVisitCounting.planCredits(proposed.plan),actualWeek,'l’API de comptage doit conserver Boulanger à 2 crédits métier');

  const t6=env({max:4,target:40,workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],stores:boulangerPool,accept:true});
  t6.els.rangeStart.value='2026-09-07';t6.els.rangeEnd.value='2026-09-18';
  await t6.ctx.testCredits.generateRange();
  assert.match(t6.els.rangePlanStatus.textContent,/Période appliquée/,'le statut de période doit rester disponible');

  const t7=env({max:4,target:20,workDays:['Lundi'],stores:pool,credits:null});
  assert.equal(t7.ctx.testCredits.visitCredit({enseigne:'Darty'}),1,'sans le module des crédits, chaque magasin vaut 1');
  await t7.ctx.testCredits.strictSingleWeek();
  assert.equal(t7.proposals.length,1);
  assert.equal((t7.proposals[0].plan.Lundi||[]).length,4,'le repli sans crédits doit redonner exactement l’ancien plafond en magasins');

  const t8=env({max:2,target:20,workDays:['Lundi'],stores:pool,locks:{d1:'Lundi',b1:'Lundi'}});
  const planAvant=JSON.stringify(t8.state.plan);
  await generateWeekAsProduction(t8);
  assert.equal(t8.proposals.length,0,'un verrouillage trop coûteux ne doit pas produire de planning');
  assert.equal(JSON.stringify(t8.state.plan),planAvant,'le planning précédent doit être conservé intact');
  assert.match(t8.els.rangePlanStatus.textContent,/crédits? de visite/,'le refus doit s’expliquer en crédits de visite');

  console.log('PASS: Boulanger reste à 2 crédits métier mais réserve une journée Boulanger + 1 crédit maximum pendant la génération, BUT vaut 2 crédits, la semaine/période respectent la règle et les statistiques restent en crédits réels.');
})().catch(e=>{console.error(e);process.exit(1)});
