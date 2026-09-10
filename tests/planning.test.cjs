const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8').replace("window.generatePlanningRange=generateRange;", "window.testPlanning={strictSingleWeek,generateRange,eventBlocksPlanning,repairStaleBrandFilter};window.generatePlanningRange=generateRange;");
function env(){
  const els={weekDate:{value:'2026-09-07'},rangeStart:{value:'2026-09-07'},rangeEnd:{value:'2026-09-18'},endTime:{value:'18:00'},maxVisitsPerDay:{value:'4'},generateRangeBtn:{},rangePlanStatus:{style:{}},statusText:{textContent:''}};
  const state={settings:{days:['Lundi','Mardi'],target:2,weekDate:'2026-09-07',startTime:'08:30',endTime:'18:00',visitMinutes:60},profile:{},stores:[{id:'x',enseigne:'Darty',ville:'Lyon',lat:45,lon:4,priority:5},{id:'y',enseigne:'Darty',ville:'Bron',lat:45,lon:4.1,priority:4},{id:'z',enseigne:'Darty',ville:'Villeurbanne',lat:45,lon:4.2,priority:1}],plan:{Lundi:[{id:'old'}]},included:{},excluded:{},locks:{},calendarEvents:[]};
  let proposals=[],checkpoints=0,archiveWrites=0;
  const ctx={state,console,Date,Map,Set,CustomEvent:class{},localStorage:{getItem:()=>null,setItem(){archiveWrites++}},document:{readyState:'loading',hidden:false,addEventListener(){},getElementById:id=>els[id]||null,querySelectorAll:selector=>selector==='[data-brand]'?[{value:'Darty',checked:true}]:['Lundi','Mardi'].map(value=>({value,checked:true}))},addEventListener(){},setTimeout,confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},includedByFilters(s){const brands=state.settings.brands||[];return !brands.length||brands.includes(s.enseigne)},havBase:()=>0,hav:()=>0,baseObj:()=>({}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),ChefReliability:{checkpoint(){checkpoints++},propose:async c=>{proposals.push(c);return false}}};
  ctx.window=ctx;ctx.dispatchEvent=()=>{};ctx.syncGoogleCalendar=async()=>({ok:true});ctx.calendarEventsForDate=()=>[];vm.runInNewContext(source,ctx);return {ctx,state,proposals,els,counts:()=>({checkpoints,archiveWrites})};
}
function ids(plan){return Object.values(plan||{}).flat().map(s=>s.id)}
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

  // Un filtre d'enseigne hérité d'un ancien secteur ne doit pas vider un nouveau secteur.
  t=env();t.state.settings.brands=['Ancienne enseigne'];await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,1,'un filtre devenu orphelin doit être réparé avant la génération');assert.equal(t.state.settings.brands.length,0,'le filtre orphelin doit revenir à toutes les enseignes');

  // Un filtre encore valide reste volontairement appliqué.
  t=env();t.state.settings.brands=['Darty'];await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,1);assert.deepEqual(t.state.settings.brands,['Darty']);

  // Un magasin explicitement imposé passe avant un magasin mieux scoré.
  t=env();t.state.included.z=true;await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,1);assert(ids(t.proposals[0].plan).includes('z'),'le magasin imposé doit faire partie de la proposition');assert.equal(new Set(ids(t.proposals[0].plan)).size,ids(t.proposals[0].plan).length,'aucun doublon ne doit être créé');

  // Un verrouillage de jour doit être respecté par le moteur V2.
  t=env();t.state.locks.y='Mardi';await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,1);assert(t.proposals[0].plan.Mardi.some(s=>s.id==='y'),'le magasin verrouillé doit rester sur Mardi');assert(!t.proposals[0].plan.Lundi.some(s=>s.id==='y'),'le magasin verrouillé ne doit pas être déplacé');

  // Un verrouillage vers un jour non disponible est un conflit, jamais une réaffectation silencieuse.
  t=env();t.state.locks.y='Mercredi';await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,0);assert.equal(t.state.plan.Lundi[0].id,'old');assert.match(t.els.rangePlanStatus.textContent,/verrouillé sur Mercredi/);

  // Les verrous sont des contraintes fortes : ils passent tous même si la cible hebdo est plus basse.
  t=env();t.state.settings.target=2;t.state.locks={x:'Lundi',y:'Mardi',z:'Lundi'};await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,1);assert.deepEqual(new Set(ids(t.proposals[0].plan)),new Set(['x','y','z']),'la cible hebdo ne doit jamais éliminer un magasin verrouillé');

  // Si les verrous dépassent la capacité physique de la semaine, on bloque au lieu d'en ignorer un.
  t=env();t.els.maxVisitsPerDay.value='1';t.state.settings.maxVisitsPerDay=1;t.state.settings.target=1;t.state.locks={x:'Lundi',y:'Mardi',z:'Lundi'};await t.ctx.testPlanning.strictSingleWeek();assert.equal(t.proposals.length,0);assert.equal(t.state.plan.Lundi[0].id,'old');assert.match(t.els.rangePlanStatus.textContent,/3 magasins verrouillés|seulement 2 créneaux/);

  assert.equal(t.ctx.testPlanning.eventBlocksPlanning({allDay:true,title:'Anniversaire'}),false);
  assert.equal(t.ctx.testPlanning.eventBlocksPlanning({allDay:true,title:'Congé'}),true);
  console.log('PASS: planning preserves previous data, repairs stale brand filters, respects forced stores and strong day locks, ignores informational all-day events, blocks real unavailability, rejects zero-visit plans and concurrent generations.');
})().catch(e=>{console.error(e);process.exitCode=1});