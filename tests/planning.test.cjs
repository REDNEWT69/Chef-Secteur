const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../range-planner-v2.js','utf8').replace("window.generatePlanningRange=generateRange;", "window.testPlanning={strictSingleWeek,generateRange,eventBlocksPlanning,repairStaleBrandFilter,buildDayReplacement,plannedDayForStore};window.generatePlanningRange=generateRange;");
function env(){
  const els={weekDate:{value:'2026-09-07'},rangeStart:{value:'2026-09-07'},rangeEnd:{value:'2026-09-18'},endTime:{value:'18:00'},maxVisitsPerDay:{value:'4'},generateRangeBtn:{},rangePlanStatus:{style:{}},statusText:{textContent:''}};
  const state={settings:{days:['Lundi','Mardi'],target:2,weekDate:'2026-09-07',startTime:'08:30',endTime:'18:00',visitMinutes:60},profile:{},stores:[{id:'x',enseigne:'Darty',ville:'Lyon',lat:45,lon:4,priority:5},{id:'y',enseigne:'Darty',ville:'Valence',lat:45,lon:5,priority:4},{id:'z',enseigne:'Darty',ville:'Grenoble',lat:45,lon:4.5,priority:1},{id:'w',enseigne:'Boulanger',ville:'Saint-Priest',lat:45,lon:4.1,priority:3},{id:'v',enseigne:'Boulanger',ville:'Bron',lat:45,lon:4.12,priority:2}],plan:{Lundi:[{id:'old'}]},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]};
  let proposals=[],checkpoints=0,archiveWrites=0;
  const ctx={state,console,Date,Map,Set,CustomEvent:class{},localStorage:{getItem:()=>null,setItem(){archiveWrites++}},document:{readyState:'loading',hidden:false,addEventListener(){},getElementById:id=>els[id]||null,querySelectorAll:selector=>selector==='[data-brand]'?[{value:'Darty',checked:true}]:['Lundi','Mardi'].map(value=>({value,checked:true}))},addEventListener(){},setTimeout,confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},includedByFilters(s){const brands=state.settings.brands||[];return !brands.length||brands.includes(s.enseigne)},havBase:()=>0,hav:()=>0,baseObj:()=>({}),nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),ChefReliability:{checkpoint(){checkpoints++},propose:async c=>{proposals.push(c);return false}}};
  ctx.window=ctx;ctx.dispatchEvent=()=>{};ctx.syncGoogleCalendar=async()=>({ok:true});ctx.calendarEventsForDate=()=>[];vm.runInNewContext(source,ctx);return {ctx,state,proposals,els,counts:()=>({checkpoints,archiveWrites})};
}
function ids(plan){return Object.values(plan||{}).flat().map(s=>s.id)}
assert.doesNotMatch(source,/\[80,180,350,700,1400,2600\]/,'le planificateur ne doit plus multiplier les tentatives temporisées');
assert.doesNotMatch(source,/window\.addEventListener\('(load|focus)'/,'le planificateur ne doit plus se réinstaller sur load ou focus');
assert.doesNotMatch(source,/visibilitychange/,'le planificateur ne doit plus se réinstaller au retour de visibilité');
assert.match(source,/DOMContentLoaded',boot,\{once:true\}/,'l’installation initiale doit être unique au DOM prêt');
assert.match(source,/store-runner:planning-updated/,'une réinstallation ciblée doit rester disponible après mise à jour du planning');
assert.match(source,/store-runner:data-restored/,'une réinstallation ciblée doit rester disponible après restauration');
assert.match(source,/Changer ce magasin/,'la fiche rapide doit proposer le changement de magasin');
assert.match(source,/Recentrer la journée/,'le recentrage journalier doit être le mode proposé');
assert.match(source,/bundle\.archive\[weekKey\]/,'une modification manuelle doit aussi mettre à jour la semaine archivée');
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

  // Une période dont la première semaine est vide doit afficher la première semaine réellement remplie.
  t=env();t.ctx.calendarEventsForDate=date=>date<'2026-09-14'?[{allDay:true,title:'Formation Samsung'}]:[];await t.ctx.testPlanning.generateRange();assert.equal(t.proposals.length,1);assert.equal(t.proposals[0].weekDate,'2026-09-14','la semaine affichée doit être la première semaine non vide de la période');assert(ids(t.proposals[0].plan).length>0,'la proposition ne doit pas être vide quand une semaine suivante contient des visites');

  // Le recentrage remplace les visites libres par des magasins proches de la nouvelle ancre, sans toucher aux autres jours.
  t=env();{const by=id=>t.state.stores.find(s=>s.id===id);t.state.plan={Lundi:[by('x'),by('y')],Mardi:[by('z')]};t.ctx.hav=(a,b)=>Math.abs(Number(a.lon||0)-Number(b.lon||0))*100;t.ctx.havBase=()=>0;const beforeMardi=JSON.stringify(t.state.plan.Mardi);const result=t.ctx.testPlanning.buildDayReplacement('x',by('w'),'Lundi',true);assert.deepEqual(result.route.map(s=>s.id),['w','v'],'la journée doit se recentrer autour de Saint-Priest/Bron plutôt que conserver Valence');assert.equal(JSON.stringify(t.state.plan.Mardi),beforeMardi,'le calcul ne doit jamais muter un autre jour');}

  // Un magasin imposé ou contraint déjà présent dans la journée doit être conservé pendant le recentrage.
  t=env();{const by=id=>t.state.stores.find(s=>s.id===id);t.state.plan={Lundi:[by('x'),by('y')],Mardi:[by('z')]};t.state.included.y=true;t.ctx.hav=(a,b)=>Math.abs(Number(a.lon||0)-Number(b.lon||0))*100;t.ctx.havBase=()=>0;const result=t.ctx.testPlanning.buildDayReplacement('x',by('w'),'Lundi',true);assert(result.route.some(s=>s.id==='y'),'un magasin explicitement imposé doit rester dans la journée');}

  // Un rendez-vous sur le magasin remplacé empêche une substitution silencieuse.
  t=env();{const by=id=>t.state.stores.find(s=>s.id===id);t.state.plan={Lundi:[by('x'),by('y')],Mardi:[by('z')]};t.state.appointments=[{storeId:'x',date:'2026-09-07',time:'10:00'}];assert.throws(()=>t.ctx.testPlanning.buildDayReplacement('x',by('w'),'Lundi',true),/rendez-vous enregistré/);}

  // Un magasin déjà utilisé un autre jour de la semaine ne peut pas être dupliqué par le remplacement manuel.
  t=env();{const by=id=>t.state.stores.find(s=>s.id===id);t.state.plan={Lundi:[by('x'),by('y')],Mardi:[by('z')]};assert.throws(()=>t.ctx.testPlanning.buildDayReplacement('x',by('z'),'Lundi',true),/déjà planifié/);}

  // Le mode secondaire remplace uniquement le magasin demandé, sans recentrer le reste de la journée.
  t=env();{const by=id=>t.state.stores.find(s=>s.id===id);t.state.plan={Lundi:[by('x'),by('y')],Mardi:[by('z')]};const result=t.ctx.testPlanning.buildDayReplacement('x',by('w'),'Lundi',false);assert.deepEqual(result.route.map(s=>s.id),['w','y']);}

  assert.equal(t.ctx.testPlanning.eventBlocksPlanning({allDay:true,title:'Anniversaire'}),false);
  assert.equal(t.ctx.testPlanning.eventBlocksPlanning({allDay:true,title:'Congé'}),true);
  console.log('PASS: planning preserves previous data, repairs stale brand filters, respects forced stores and strong day locks, supports safe manual store replacement with geographic day recentering and archive persistence, shows the first non-empty range week, ignores informational all-day events, blocks real unavailability, rejects zero-visit plans and concurrent generations, and keeps range planner initialization targeted.');
})().catch(e=>{console.error(e);process.exitCode=1});