const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const source=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;', 'window.testRangeRotation={generateRange,chooseStores,buildWeekUnique,visitCredit,routeCredits,rankCandidateDaysV249,dayCohesionV249};window.generatePlanningRange=generateRange;');

function makeStore(id,priority,enseigne='Fnac'){
  return {id,enseigne,ville:'Ville '+id,adresse:'Adresse '+id,lat:45,lon:4,priority,active:true};
}

function env(options={}){
  const workDays=options.workDays||['Lundi'];
  const stores=(options.stores||[]).map(s=>Object.assign({},s));
  const start=options.start||'2026-09-07';
  const end=options.end||'2026-09-25';
  const max=options.max||4;
  const target=options.target||4;
  const els={
    weekDate:{value:start},rangeStart:{value:start},rangeEnd:{value:end},endTime:{value:'18:00'},
    maxVisitsPerDay:{value:String(max)},generateRangeBtn:{disabled:false},rangePlanStatus:{style:{}},statusText:{textContent:''}
  };
  const proposals=[];
  const state={
    settings:{days:workDays.slice(),target,weekDate:start,startTime:'08:30',endTime:'18:00',visitMinutes:60,maxVisitsPerDay:max},
    profile:{},stores,plan:{Lundi:[{id:'old'}]},included:options.included||{},excluded:{},locks:options.locks||{},appointments:[],calendarEvents:[]
  };
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
    confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},initControls(){},includedByFilters:()=>true,
    havBase:()=>0,hav:()=>0,baseObj:()=>({lat:45,lon:4}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>fn(),
    ChefReliability:{checkpoint(){},propose:async candidate=>{proposals.push(candidate);return false}},
    syncGoogleCalendar:async()=>({ok:true}),
    calendarEventsForDate:date=>(options.blockedDates&&options.blockedDates.has(date))?[{allDay:true,title:'Formation Samsung'}]:[],
    storeVisitCredit:s=>/^(Darty|Boulanger|Carrefour)$/i.test(String(s&&s.enseigne||''))?2:1
  };
  ctx.window=ctx;
  vm.runInNewContext(source,ctx);
  return {ctx,state,proposals,els};
}

function snapshots(proposal){
  return Object.values((proposal&&proposal.archive)||{}).filter(s=>s&&s.plan).sort((a,b)=>String(a.weekMonday).localeCompare(String(b.weekMonday)));
}
function weekIds(snap){return DAYS.flatMap(d=>(snap.plan[d]||[]).map(s=>s.id));}
function creditOf(ctx,snap){return DAYS.reduce((n,d)=>n+ctx.testRangeRotation.routeCredits(snap.plan[d]||[]),0);}

(async()=>{
  let stores=Array.from({length:12},(_,i)=>makeStore('s'+(i+1),12-i));
  let t=env({stores,target:4,max:4,end:'2026-09-25'});
  await t.ctx.testRangeRotation.generateRange();
  assert.equal(t.proposals.length,1);
  let snaps=snapshots(t.proposals[0]);
  assert.equal(snaps.length,3);
  const firstCycle=snaps.flatMap(weekIds);
  assert.equal(firstCycle.length,12,'les trois semaines doivent contenir 12 visites');
  assert.equal(new Set(firstCycle).size,12,'les 12 magasins doivent être couverts avant toute répétition');

  stores=Array.from({length:10},(_,i)=>makeStore('r'+(i+1),10-i));
  t=env({stores,target:4,max:4,end:'2026-09-25'});
  await t.ctx.testRangeRotation.generateRange();
  snaps=snapshots(t.proposals[0]);
  const coveredAfter3=new Set(snaps.slice(0,3).flatMap(weekIds));
  assert.equal(coveredAfter3.size,10,'les deux derniers magasins frais doivent être planifiés avant une répétition de confort');
  assert(weekIds(snaps[2]).includes('r9')&&weekIds(snaps[2]).includes('r10'),'la semaine 3 doit contenir le reliquat frais r9/r10 malgré leur score plus faible');

  stores=Array.from({length:10},(_,i)=>makeStore('l'+(i+1),10-i));
  t=env({stores,target:4,max:4,end:'2026-10-09'});
  await t.ctx.testRangeRotation.generateRange();
  snaps=snapshots(t.proposals[0]);
  assert.equal(snaps.length,5);
  const counts=new Map();for(const id of snaps.flatMap(weekIds))counts.set(id,(counts.get(id)||0)+1);
  assert.equal(counts.size,10,'aucun magasin éligible ne doit disparaître de la rotation longue');
  const values=[...counts.values()];
  assert(Math.max(...values)-Math.min(...values)<=1,'la rotation longue doit rester équilibrée entre magasins planifiables: '+JSON.stringify(Object.fromEntries(counts)));

  stores=[
    makeStore('e1',10,'Darty'),makeStore('e2',9,'Boulanger'),makeStore('e3',8,'Carrefour'),makeStore('e4',7,'Darty'),
    makeStore('c1',3,'Fnac'),makeStore('c2',2,'Fnac'),makeStore('c3',1,'Fnac')
  ];
  t=env({stores,target:4,max:4,end:'2026-09-28'});
  await t.ctx.testRangeRotation.generateRange();
  snaps=snapshots(t.proposals[0]);
  for(const snap of snaps)assert(creditOf(t.ctx,snap)<=4,snap.weekMonday+' dépasse le plafond de 4 crédits');
  const mixedIds=new Set(snaps.flatMap(weekIds));
  for(const id of ['c1','c2','c3'])assert(mixedIds.has(id),id+' à 1 crédit doit finir par entrer dans la rotation malgré sa priorité faible');

  stores=[makeStore('p1',100),makeStore('p2',90),makeStore('p3',80),makeStore('p4',70),makeStore('p5',1)];
  t=env({stores,target:2,max:2,end:'2026-09-25'});
  await t.ctx.testRangeRotation.generateRange();
  snaps=snapshots(t.proposals[0]);
  assert(snaps.slice(0,3).flatMap(weekIds).includes('p5'),'le magasin faible priorité doit apparaître avant que les meilleurs soient recyclés');

  stores=Array.from({length:7},(_,i)=>makeStore('k'+(i+1),7-i));
  t=env({stores,target:3,max:3,end:'2026-09-25',locks:{k1:'Lundi'}});
  await t.ctx.testRangeRotation.generateRange();
  snaps=snapshots(t.proposals[0]);
  assert(snaps.every(s=>weekIds(s).includes('k1')),'le magasin verrouillé doit rester présent chaque semaine');
  const nonForced=new Set(snaps.flatMap(weekIds).filter(id=>id!=='k1'));
  assert.equal(nonForced.size,6,'la répétition du verrou ne doit pas empêcher la couverture des six autres magasins');

  stores=Array.from({length:5},(_,i)=>makeStore('b'+(i+1),5-i));
  t=env({stores,target:2,max:2,end:'2026-09-28',blockedDates:new Set(['2026-09-14'])});
  await t.ctx.testRangeRotation.generateRange();
  snaps=snapshots(t.proposals[0]);
  assert.equal(weekIds(snaps[1]).length,0,'la semaine bloquée doit rester vide');
  const afterBlocked=new Set(snaps.flatMap(weekIds));
  assert.equal(afterBlocked.size,5,'le dernier magasin frais doit encore être planifié après une semaine bloquée');

  // V249 : à charge égale, le magasin rejoint la journée géographiquement la plus proche.
  const west=makeStore('west',5),east=makeStore('east',5),nearWest=makeStore('near-west',4),nearEast=makeStore('near-east',4);
  t=env({stores:[west,east,nearWest,nearEast],target:4,max:2,workDays:['Lundi','Mardi']});
  t.ctx.StoreRunnerRoadMatrixV248={distanceKm:(a,b)=>{
    const x=String(a&&a.id||'base'),y=String(b&&b.id||'base'),pair=[x,y].sort().join('|');
    const distances={'near-west|west':2,'east|near-east':3,'east|near-west':95,'near-east|west':100};
    return Object.prototype.hasOwnProperty.call(distances,pair)?distances[pair]:40;
  }};
  let ranked=t.ctx.testRangeRotation.rankCandidateDaysV249({Lundi:[west],Mardi:[east]},['Lundi','Mardi'],nearEast);
  assert.equal(ranked[0],'Mardi','à charge égale, near-east doit rejoindre le groupe east');
  ranked=t.ctx.testRangeRotation.rankCandidateDaysV249({Lundi:[],Mardi:[east]},['Lundi','Mardi'],nearEast);
  assert.equal(ranked[0],'Lundi','l’équilibre de charge doit rester prioritaire sur la proximité');
  const zoned=t.ctx.testRangeRotation.buildWeekUnique([west,east,nearWest,nearEast],['Lundi','Mardi'],'2026-09-07').plan;
  assert.equal(zoned.Lundi.map(s=>s.id).join(','),'west,near-west','la journée de lundi doit former le groupe ouest');
  assert.equal(zoned.Mardi.map(s=>s.id).join(','),'east,near-east','la journée de mardi doit former le groupe est');

  console.log('PASS: la génération de période couvre le vivier avant répétition, garde une mémoire équilibrée/LRU, respecte crédits/contraintes et regroupe les journées par cohésion géographique V249.');
})().catch(e=>{console.error(e);process.exitCode=1});
