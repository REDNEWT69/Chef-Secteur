const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8').replace("window.generatePlanningRange=generateRange;", "window.testPlanning={strictSingleWeek,generateRange,eventBlocksPlanning};window.generatePlanningRange=generateRange;");
function env(){
  const els={weekDate:{value:'2026-09-07'},rangeStart:{value:'2026-09-07'},rangeEnd:{value:'2026-09-18'},endTime:{value:'18:00'},maxVisitsPerDay:{value:'4'},generateRangeBtn:{},rangePlanStatus:{style:{}},statusText:{textContent:''}};
  const state={settings:{days:['Lundi','Mardi'],target:2,weekDate:'2026-09-07',startTime:'08:30',endTime:'18:00',visitMinutes:60},profile:{},stores:[{id:'x',enseigne:'Darty',ville:'Lyon',lat:45,lon:4},{id:'y',enseigne:'Darty',ville:'Bron',lat:45,lon:4.1}],plan:{Lundi:[{id:'old'}]},excluded:{},calendarEvents:[]};
  let proposals=[],checkpoints=0,archiveWrites=0;
  const ctx={state,console,Date,Map,Set,CustomEvent:class{},localStorage:{getItem:()=>null,setItem(){archiveWrites++}},document:{readyState:'loading',hidden:false,addEventListener(){},getElementById:id=>els[id]||null,querySelectorAll:()=>['Lundi','Mardi'].map(value=>({value,checked:true}))},addEventListener(){},setTimeout,confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},havBase:()=>0,hav:()=>0,baseObj:()=>({}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),ChefReliability:{checkpoint(){checkpoints++},propose:async c=>{proposals.push(c);return false}}};
  ctx.window=ctx;ctx.dispatchEvent=()=>{};ctx.syncGoogleCalendar=async()=>({ok:true});ctx.calendarEventsForDate=()=>[];vm.runInNewContext(source,ctx);return {ctx,state,proposals,els,counts:()=>({checkpoints,archiveWrites})};
}
(async()=>{
  let t=env();const old=JSON.stringify(t.state.plan);await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,1);assert.equal(JSON.stringify(t.state.plan),old);assert.equal(t.counts().checkpoints,1);

  t=env();t.ctx.syncGoogleCalendar=async()=>({ok:false});t.ctx.confirm=()=>false;await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,0);assert.equal(t.state.plan.Lundi[0].id,'old');

  t=env();await t.ctx.testPlanning.generateRange();assert.equal(t.proposals.length,1);assert.equal(t.proposals[0].range.weeks,2);assert.equal(t.counts().archiveWrites,0);assert.equal(t.state.plan.Lundi[0].id,'old');

  t=env();t.ctx.syncGoogleCalendar=async()=>({ok:false});await t.ctx.testPlanning.generateRange();assert.equal(t.proposals[0].range.calendarSynced,false);

  t=env();let release;t.ctx.syncGoogleCalendar=()=>new Promise(resolve=>release=resolve);const running=t.ctx.testPlanning.strictSingleWeek();await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.counts().checkpoints,1);release({ok:true});await running;

  // Un simple événement Google toute la journée ne doit plus condamner la journée.
  t=env();t.ctx.calendarEventsForDate=()=>[{allDay:true,title:'Anniversaire'}];await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,1,'un événement informatif toute la journée ne doit pas produire 0 visite');

  // Une vraie indisponibilité métier bloque la journée et ne remplace jamais le planning par du vide.
  t=env();t.ctx.calendarEventsForDate=()=>[{allDay:true,title:'Formation Samsung'}];await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,0);assert.equal(t.state.plan.Lundi[0].id,'old');assert.match(t.els.rangePlanStatus.textContent,/Aucun jour disponible|Génération impossible/);

  // Si aucune visite ne tient dans les horaires, l'ancien planning est conservé plutôt que validé à 0.
  t=env();t.ctx.havBase=()=>1000;t.ctx.hav=()=>1000;await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,0);assert.equal(t.state.plan.Lundi[0].id,'old');assert.match(t.els.rangePlanStatus.textContent,/0 visite possible/);

  assert.equal(t.ctx.testPlanning.eventBlocksPlanning({allDay:true,title:'Anniversaire'}),false);
  assert.equal(t.ctx.testPlanning.eventBlocksPlanning({allDay:true,title:'Congé'}),true);
  console.log('PASS: planning preserves previous data, ignores informational all-day events, blocks real unavailability, rejects zero-visit plans and concurrent generations.');
})().catch(e=>{console.error(e);process.exitCode=1});
