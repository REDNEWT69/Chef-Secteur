const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const source=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;', 'window.testManualWeek={strictSingleWeek,generateRange,persistDayReplacement};window.generatePlanningRange=generateRange;');

function store(id,priority=1){return {id,enseigne:'Fnac',ville:'Ville '+id,adresse:'Adresse '+id,lat:45,lon:4,priority,active:true}}
function emptyPlan(){return Object.fromEntries(DAYS.map(d=>[d,[]]))}

function env(options={}){
  const stores=options.stores||[store('a',3),store('b',2),store('c',1)];
  const weekDate=options.weekDate||'2026-09-07';
  const rangeEnd=options.rangeEnd||'2026-09-18';
  const archive=JSON.parse(JSON.stringify(options.archive||{}));
  let persisted=null;
  const proposals=[];
  const state={settings:{days:['Lundi'],target:1,weekDate,startTime:'08:30',endTime:'18:00',visitMinutes:60,maxVisitsPerDay:4},profile:{},stores,plan:options.plan||Object.assign(emptyPlan(),{Lundi:[stores[0]]}),included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]};
  const els={weekDate:{value:weekDate},rangeStart:{value:weekDate},rangeEnd:{value:rangeEnd},endTime:{value:'18:00'},maxVisitsPerDay:{value:'4'},generateRangeBtn:{disabled:false},rangePlanStatus:{style:{}},statusText:{textContent:''}};
  const localStorage={getItem:key=>key===ARCHIVE_KEY?JSON.stringify(archive):null,setItem(){},removeItem(){}};
  const ctx={state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,localStorage,
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>els[id]||null,querySelectorAll:selector=>selector==='[data-brand]'?[]:[{value:'Lundi',checked:true}]},
    setTimeout,confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},initControls(){},includedByFilters:()=>true,
    havBase:()=>0,hav:()=>0,baseObj:()=>({lat:45,lon:4}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),dispatchEvent(){},
    syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[],storeVisitCredit:()=>1,
    ChefReliability:{
      checkpoint(){},
      propose:async candidate=>{proposals.push(candidate);return false},
      capture:()=>({state:JSON.parse(JSON.stringify(state)),archive:JSON.parse(JSON.stringify(archive)),range:null}),
      persist:bundle=>{persisted=JSON.parse(JSON.stringify(bundle));Object.keys(archive).forEach(k=>delete archive[k]);Object.assign(archive,JSON.parse(JSON.stringify(bundle.archive||{})))}
    }
  };
  ctx.window=ctx;
  vm.runInNewContext(source,ctx);
  return {ctx,state,archive,proposals,els,persisted:()=>persisted};
}

(async()=>{
  // Une semaine explicitement marquée comme retouchée à la main est intouchable par « Générer ma semaine ».
  const manualPlan=emptyPlan();manualPlan.Lundi=[store('manual')];
  let t=env({plan:manualPlan,archive:{'2026-09-07':{weekMonday:'2026-09-07',manualEdited:true,manualEditedAt:'2026-09-07T12:00:00.000Z',plan:JSON.parse(JSON.stringify(manualPlan))}}});
  const before=JSON.stringify(t.state.plan);
  const single=await t.ctx.testManualWeek.strictSingleWeek();
  assert.equal(JSON.stringify(t.state.plan),before,'la semaine manuelle ne doit jamais être remplacée');
  assert.equal(t.proposals.length,0,'aucune proposition automatique ne doit être ouverte pour une semaine manuelle');
  assert.equal(single&&single.preservedManual,true,'le moteur doit signaler explicitement la conservation manuelle');
  assert.match(t.els.rangePlanStatus.textContent,/modifiée manuellement|conservée/i);

  // Un remplacement manuel marque immédiatement toute la semaine comme protégée.
  t=env();
  const replacement=[t.state.stores[1]];
  await t.ctx.testManualWeek.persistDayReplacement({day:'Lundi',sourceDay:null,route:replacement,anchor:t.state.stores[1],oldId:'a'});
  const saved=t.persisted();
  assert(saved&&saved.archive&&saved.archive['2026-09-07'],'la semaine doit être créée dans l’archive même si elle n’y était pas encore');
  assert.equal(saved.archive['2026-09-07'].manualEdited,true,'la modification manuelle doit poser le marqueur de protection de semaine');
  assert.equal(saved.archive['2026-09-07'].plan.Lundi[0].id,'b','l’archive protégée doit contenir la journée réellement modifiée');

  // Une génération de période saute également une semaine manuelle au lieu de la recalculer.
  const protectedPlan=emptyPlan();protectedPlan.Lundi=[store('protected')];
  t=env({archive:{'2026-09-07':{weekMonday:'2026-09-07',manualEdited:true,plan:JSON.parse(JSON.stringify(protectedPlan))}},rangeEnd:'2026-09-18'});
  await t.ctx.testManualWeek.generateRange();
  assert.equal(t.proposals.length,1,'la période doit encore pouvoir générer les autres semaines');
  const proposed=t.proposals[0];
  assert.equal(proposed.archive['2026-09-07'].manualEdited,true,'le marqueur manuel doit survivre à la génération de période');
  assert.equal(proposed.archive['2026-09-07'].plan.Lundi[0].id,'protected','la semaine manuelle doit rester strictement identique');
  assert(proposed.archive['2026-09-14']&&proposed.archive['2026-09-14'].plan.Lundi.length>0,'la semaine suivante reste générable automatiquement');

  console.log('PASS: les semaines modifiées manuellement sont protégées contre Générer ma semaine et Générer la période, et le marqueur est persisté avec l’archive.');
})().catch(e=>{console.error(e);process.exitCode=1});
