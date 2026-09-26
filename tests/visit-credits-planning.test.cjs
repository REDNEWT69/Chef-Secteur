const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

/* V261.2 — le plafond journalier est entièrement choisi par l'utilisateur.
   Les crédits métier restent inchangés (Boulanger/Darty/BUT/Conforama x2), mais aucune
   enseigne ne réserve de capacité supplémentaire pendant une génération/recalcul. */
const plannerSource=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;','window.testCredits={strictSingleWeek,generateRange,visitCredit,routeCredits};window.generatePlanningRange=generateRange;');
const countingSource=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');
const capacitySource=fs.readFileSync(__dirname+'/../daily-capacity.js','utf8');

assert.doesNotMatch(plannerSource,/DEFAULT_RULES|visitCreditsByBrand/,'le planificateur ne redéfinit pas les règles de crédit');
assert.match(plannerSource,/window\.storeVisitCredit/,'le planificateur consomme l’API publique des crédits');
assert.match(plannerSource,/routeCredits\(plan\[day\]\)\+cost>max/,'la limite réglée doit rester le seul budget journalier');
assert.match(countingSource,/function planningVisitCredit\(store\)\{return visitCredit\(store\)\}/,'visit-counting doit exposer le vrai crédit comme crédit planning');
assert.doesNotMatch(countingSource,/planningCapacityActive|max-1|Boulanger garde sa réserve/,'aucune réserve Boulanger ne doit subsister dans la source de vérité');
assert.match(capacitySource,/bindPlanningCreditsToUserLimit/,'daily-capacity garde un filet de compatibilité pour les sessions déjà chargées');
assert.match(capacitySource,/api\.planningCredit=api\.credit/,'l’API planning doit exposer le vrai crédit métier');
assert.doesNotMatch(capacitySource,/max-1/,'aucune réserve Boulanger ne doit être recréée dans le module de capacité');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function env(options){
  const opts=options||{};
  const workDays=opts.workDays||['Lundi','Mardi'];
  const els={
    weekDate:{value:'2026-09-07'},rangeStart:{value:'2026-09-07'},rangeEnd:{value:'2026-09-11'},
    endTime:{value:'18:00'},maxVisitsPerDay:{value:String(opts.max||4)},
    generateRangeBtn:{disabled:false},rangePlanStatus:{style:{},textContent:''},statusText:{textContent:''},
    target:{value:String(opts.target||20),addEventListener(){},insertAdjacentElement(){}}
  };
  const state={
    settings:{
      days:workDays.slice(),target:opts.target||20,weekDate:'2026-09-07',
      startTime:'08:30',endTime:'18:00',visitMinutes:60,maxVisitsPerDay:opts.max||4,
      visitCreditsByBrand:{darty:2,boulanger:2,but:2,conforama:2}
    },
    profile:{},stores:(opts.stores||[]).map(s=>Object.assign({},s)),
    plan:{Lundi:[{id:'old'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
    included:{},excluded:{},locks:opts.locks||{},appointments:[],calendarEvents:[],visits:{},notes:{}
  };
  const proposals=[];
  const listeners={};
  const ctx={
    state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,Boolean,Error,
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{
      readyState:'loading',hidden:false,activeElement:null,head:{appendChild(){}},body:{appendChild(){}},
      addEventListener(name,fn){(listeners[name]||(listeners[name]=[])).push(fn)},removeEventListener(){},
      createElement:()=>({style:{},className:'',classList:{add(){},remove(){},contains:()=>false,toggle(){}},dataset:{},appendChild(){},addEventListener(){},insertAdjacentElement(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]}),
      getElementById:id=>els[id]||null,
      querySelector:()=>null,
      querySelectorAll:selector=>selector==='[data-brand]'?[]:workDays.map(value=>({value,checked:true}))
    },
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,
    confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},initControls(){},
    includedByFilters:()=>true,
    havBase:()=>0,hav:()=>0,baseObj:()=>({lat:45,lon:4}),
    nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>fn(),
    ChefReliability:{checkpoint(){},propose:async c=>{proposals.push(c);return opts.accept===true}},
    syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[]
  };
  ctx.window=ctx;
  vm.runInNewContext(countingSource,ctx);
  vm.runInNewContext(capacitySource,ctx);
  vm.runInNewContext(plannerSource,ctx);
  return {ctx,state,proposals,els};
}

function store(id,enseigne,lon,extra){return Object.assign({id,enseigne,ville:'V'+id,adresse:'A'+id,lat:45,lon,priority:3,active:true},extra||{})}
function actualCreditsOf(ctx,route){return (route||[]).reduce((n,s)=>n+ctx.StoreVisitCounting.credit(s),0)}
async function generateWeekAsProduction(t){
  t.ctx.__storeRunnerPlanningGenerationActive=true;
  try{return await t.ctx.testCredits.strictSingleWeek()}finally{t.ctx.__storeRunnerPlanningGenerationActive=false}
}

(async()=>{
  const b1=store('b1','Boulanger',4.00),b2=store('b2','Boulanger',4.02),d1=store('d1','Darty',4.04),but1=store('but1','BUT',4.06),f1=store('f1','Fnac',4.08),f2=store('f2','Fnac',4.10);

  // 1. Les crédits métier ne changent pas, y compris pendant un recalcul.
  let t=env({max:4,target:20,workDays:['Lundi'],stores:[b1,d1,but1,f1]});
  assert.equal(t.ctx.StoreVisitCounting.credit(b1),2,'Boulanger reste à 2 crédits métier');
  assert.equal(t.ctx.StoreVisitCounting.credit(d1),2,'Darty reste à 2 crédits métier');
  assert.equal(t.ctx.StoreVisitCounting.credit(but1),2,'BUT reste à 2 crédits métier');
  assert.equal(t.ctx.StoreVisitCounting.credit(f1),1,'une enseigne simple reste à 1 crédit');
  t.ctx.__storeRunnerPlanningGenerationActive=true;
  assert.equal(t.ctx.storeVisitCredit(b1),2,'Boulanger ne doit plus réserver 3 unités pendant la génération');
  assert.equal(t.ctx.StoreVisitCounting.planningCredit(b1),2,'planningCredit doit être identique au vrai crédit');
  t.ctx.__storeRunnerPlanningGenerationActive=false;

  // 2. Limite utilisateur 4 : Boulanger x2 + Darty x2 = 4, donc autorisé.
  t=env({max:4,target:20,workDays:['Lundi'],stores:[b1,d1,f1],locks:{b1:'Lundi',d1:'Lundi'}});
  await generateWeekAsProduction(t);
  assert.equal(t.proposals.length,1,'Boulanger + Darty doivent être planifiables avec une limite de 4');
  let route=t.proposals[0].plan.Lundi||[];
  assert(route.some(s=>s.id==='b1')&&route.some(s=>s.id==='d1'),'les deux magasins verrouillés doivent rester le même jour');
  assert.equal(actualCreditsOf(t.ctx,route),4,'la journée doit consommer exactement les 4 unités choisies');

  // 3. Deux Boulanger x2 tiennent aussi dans une limite de 4 : aucune règle cachée d’enseigne.
  t=env({max:4,target:20,workDays:['Lundi'],stores:[b1,b2],locks:{b1:'Lundi',b2:'Lundi'}});
  await generateWeekAsProduction(t);
  assert.equal(t.proposals.length,1,'deux Boulanger doivent être autorisés si leurs vrais crédits tiennent dans la limite');
  route=t.proposals[0].plan.Lundi||[];
  assert.equal(route.length,2);
  assert.equal(actualCreditsOf(t.ctx,route),4);

  // 4. La liberté vient du réglage : à 3, le même couple à 4 crédits est refusé.
  t=env({max:3,target:20,workDays:['Lundi'],stores:[b1,d1],locks:{b1:'Lundi',d1:'Lundi'}});
  const before=JSON.stringify(t.state.plan);
  await generateWeekAsProduction(t);
  assert.equal(t.proposals.length,0,'la limite utilisateur doit être respectée sans exception');
  assert.equal(JSON.stringify(t.state.plan),before,'un recalcul impossible ne doit pas altérer le planning précédent');
  assert.match(t.els.rangePlanStatus.textContent,/crédits? de visite/,'le refus doit expliquer le dépassement en crédits');

  // 5. À 5, 2 + 2 + 1 tient. Le réglage est bien la seule barrière de capacité.
  t=env({max:5,target:20,workDays:['Lundi'],stores:[b1,d1,f1],locks:{b1:'Lundi',d1:'Lundi',f1:'Lundi'}});
  await generateWeekAsProduction(t);
  assert.equal(t.proposals.length,1);
  route=t.proposals[0].plan.Lundi||[];
  assert.equal(actualCreditsOf(t.ctx,route),5,'la limite 5 choisie par l’utilisateur doit permettre 2+2+1');

  // 6. Un override magasin continue d’être prioritaire sur la règle enseigne.
  const b1simple=store('b1','Boulanger',4.00,{visitCreditOverride:1});
  t=env({max:4,target:20,workDays:['Lundi'],stores:[b1simple,d1,f1],locks:{b1:'Lundi',d1:'Lundi',f1:'Lundi'}});
  await generateWeekAsProduction(t);
  assert.equal(t.proposals.length,1);
  route=t.proposals[0].plan.Lundi||[];
  assert.equal(actualCreditsOf(t.ctx,route),4,'override Boulanger 1 + Darty 2 + Fnac 1 = 4');

  // 7. Une journée classique reste inchangée.
  const cheap=[store('s1','Fnac',4.0),store('s2','Fnac',4.1),store('s3','Fnac',4.2),store('s4','Fnac',4.3),store('s5','Fnac',4.4)];
  t=env({max:4,target:20,workDays:['Lundi'],stores:cheap});
  await generateWeekAsProduction(t);
  assert.equal(t.proposals.length,1);
  assert.equal((t.proposals[0].plan.Lundi||[]).length,4,'quatre magasins à 1 crédit doivent remplir une limite de 4');
  assert.equal(actualCreditsOf(t.ctx,t.proposals[0].plan.Lundi),4);

  // 8. La génération de période respecte la même limite sur toutes les semaines.
  t=env({max:4,target:40,workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],stores:[b1,b2,d1,but1,f1,f2]});
  t.els.rangeStart.value='2026-09-07';t.els.rangeEnd.value='2026-09-25';
  await t.ctx.testCredits.generateRange();
  assert.equal(t.proposals.length,1,'la génération de période doit proposer un planning');
  let weeks=0;
  for(const snap of Object.values(t.proposals[0].archive||{})){
    if(!snap||!snap.plan)continue;weeks++;
    for(const day of DAYS)assert(actualCreditsOf(t.ctx,snap.plan[day]||[])<=4,'la période dépasse la limite utilisateur le '+day);
  }
  assert(weeks>=3,'la période de trois semaines doit être couverte');

  console.log('PASS: la capacité du recalcul suit uniquement maxVisitsPerDay ; Boulanger/Darty/BUT gardent leurs vrais crédits, sans réserve cachée par enseigne.');
})().catch(e=>{console.error(e);process.exit(1)});
