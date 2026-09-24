// V254.3 — réordonner une journée au doigt (issue #426) : règles, persistance et
// interactions moteur.
//
// Le geste (planning-reorder-v254.js) ne fait que lire l'écran et déléguer ; les règles
// et l'écriture vivent dans planning-manual-visits.js. Ces tests rejouent le vrai code
// des modules du planning avec une horloge figée au jeudi 24/09/2026 : lundi-mercredi
// sont passés, jeudi est aujourd'hui, vendredi est à venir.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

const RealDate=Date;
const NOW='2026-09-24T07:00:00';
class Clock extends RealDate{constructor(...args){super(...(args.length?args:[NOW]))}static now(){return new RealDate(NOW).getTime()}}
// planning-manual-visits.js s'exécute dans ce contexte-ci : il lit la même horloge figée.
global.Date=Clock;

const Manual=require('../planning-manual-visits.js');
const Reorder=require('../planning-reorder-v254.js');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE='chef_sector_plan_archive_v1',MAIN='sector_planner_universal_v1',WEEK='2026-09-21';
const copy=x=>JSON.parse(JSON.stringify(x));
const empty=()=>Object.fromEntries(DAYS.map(d=>[d,[]]));
const store=(id,extra={})=>({id,enseigne:'Fnac',ville:id,active:true,lat:45.75,lon:4.85,...extra});
const ids=route=>Array.from(route||[],s=>s.id);
const read=name=>fs.readFileSync(__dirname+'/../'+name,'utf8');

function env(){
  const mem=new Map(),events=[];
  const db={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),flush:async()=>{}};
  const state={schemaVersion:5,profile:{baseName:'Lyon',baseLat:45.75,baseLon:4.85},settings:{weekDate:WEEK,days:DAYS.slice(0,5),maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00',visitMinutes:60},stores:[],plan:empty(),locks:{},appointments:[],visits:{},manualWeekEdits:{}};
  const ctx={state,console,Date:Clock,JSON,Math,
    document:{readyState:'loading',addEventListener(){},dispatchEvent(e){events.push(e)},getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null},
    addEventListener(){},localStorage:db,__chefStorage:db,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init&&init.detail}},
    save(){db.setItem(MAIN,JSON.stringify(state))},renderAll(){},setTimeout,clearTimeout};
  ctx.window=ctx;
  for(const name of ['visit-counting.js','store-opening-hours.js','planning-route-optimizer-v251.js'])vm.runInNewContext(read(name),ctx);
  // Le recalcul publie ses points d'entrée au DOMContentLoaded : on l'installe tout de suite.
  vm.runInNewContext(read('planning-cascade-v181.js').replace("if(document.readyState==='loading')","if(false)"),ctx);
  const t={ctx,state,db,mem,events,
    build(){ctx.__storeRunnerPlanningGenerationActive=true;try{return ctx.__storeRunnerBuildRemainingWeekPlan()}finally{ctx.__storeRunnerPlanningGenerationActive=false}},
    archive(){return JSON.parse(db.getItem(ARCHIVE)||'{}')},
    saved(){return JSON.parse(db.getItem(MAIN)||'null')},
    policy(){return Manual.reorderPolicy(ctx)},
    set(stores,plan){state.stores=stores;for(const [day,list] of Object.entries(plan))state.plan[day]=list.slice();return t}
  };
  return t;
}

/* ------------------------------------------------------------------ geste pur */
test('le geste lit la ligne affichée et calcule la place de dépôt',()=>{
  assert.deepEqual(copy(Reorder.rowInfoFromAttr("openStoreQuick('c1','Jeudi','10:46')")),{id:'c1',day:'Jeudi'});
  assert.equal(Reorder.rowInfoFromAttr("openStoreQuick('c1','Dimanche','10:46')"),null,'un jour inconnu ne soulève rien');
  assert.equal(Reorder.rowInfoFromAttr(''),null);
  const centers=[100,300,500];
  assert.equal(Reorder.dropIndex(centers,50),0,'au-dessus de tout : première visite');
  assert.equal(Reorder.dropIndex(centers,150),1);
  assert.equal(Reorder.dropIndex(centers,300),1,'sur un centre exact : pas encore dépassé');
  assert.equal(Reorder.dropIndex(centers,900),3,'sous la liste : dernière visite');
  assert.equal(Reorder.ordinal(0,4),'1re visite');assert.equal(Reorder.ordinal(1,4),'2e visite');assert.equal(Reorder.ordinal(3,4),'dernière visite');
});
test('les autres cartes se décalent d’une place pour montrer l’insertion',()=>{
  // Flux : [A, B, événement Agenda, C, D] ; C (index de flux 3, 3e visite) est soulevée.
  const positions=[0,1,4],dragged=3;
  assert.equal(Reorder.shiftRange(positions,dragged,2,2),null,'même place : rien ne bouge');
  assert.deepEqual(copy(Reorder.shiftRange(positions,dragged,2,0)),{from:0,to:2,dir:1},'en tête : A, B et l’événement descendent');
  assert.deepEqual(copy(Reorder.shiftRange(positions,dragged,2,1)),{from:1,to:2,dir:1},'en 2e : B et l’événement descendent');
  assert.deepEqual(copy(Reorder.shiftRange(positions,dragged,2,3)),{from:4,to:4,dir:-1},'en dernier : D remonte');
  const others=[{top:0,bottom:150},{top:170,bottom:320},{top:520,bottom:670}];
  assert.equal(Reorder.settleOffset(340,160,others,2,0),-340,'posée à la place de A');
  assert.equal(Reorder.settleOffset(340,160,others,2,3),170,'posée juste après D');
  assert.equal(Reorder.settleOffset(340,160,others,2,2),0);
});
test('le défilement automatique ne vit qu’aux bords, sous l’en-tête et au-dessus de la navigation',()=>{
  const top=66,bottom=769,zone=72,max=16;
  assert.equal(Reorder.edgeSpeed(400,top,bottom,zone,max),0,'au centre, la page ne bouge pas');
  assert.ok(Reorder.edgeSpeed(80,top,bottom,zone,max)<0,'près du haut, on remonte');
  assert.ok(Reorder.edgeSpeed(760,top,bottom,zone,max)>0,'près du bas, on descend');
  assert.ok(Math.abs(Reorder.edgeSpeed(70,top,bottom,zone,max))>Math.abs(Reorder.edgeSpeed(130,top,bottom,zone,max)),'plus près du bord, plus vite');
  assert.equal(Reorder.edgeSpeed(820,top,bottom,zone,max),max,'sur la barre de navigation : vitesse maximale');
  assert.equal(Reorder.edgeSpeed(10,top,bottom,zone,max),-max,'sous l’en-tête collant : vitesse maximale');
});
test('un balayage ne peut jamais devenir un glissement, et rien ne s’ajoute aux cartes',()=>{
  assert.ok(Reorder.LONG_PRESS_MS>=300&&Reorder.LONG_PRESS_MS<=400,'appui long d’environ 350 ms (#426)');
  // Les balayages existants démarrent à 9 px (retrait) et 10 px (changement de jour) :
  // l'appui long est abandonné avant qu'ils puissent s'engager.
  assert.ok(Reorder.TOUCH_SLOP<9,'la tolérance du doigt immobile reste sous les seuils de balayage');
  for(const selector of ['button','a','[role="button"]','.tlChevron'])assert.ok(Reorder.INTERACTIVE.split(',').includes(selector),'hors boutons et liens : '+selector);
  const src=read('planning-reorder-v254.js'),code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  assert.doesNotMatch(src,/[⠿☰]/,'aucune poignée ni symbole ajouté aux cartes (#426)');
  assert.doesNotMatch(code,/srReorderTray|moveStoreToDay|srReorderLine/,'aucun déplacement vers un autre jour dans ce lot (#426)');
  assert.match(code,/addEventListener\('touchmove',onWeekTouchMove,\{passive:false\}\)/,'la zone du planning reçoit des touchmove annulables (iOS)');
  assert.match(code,/addEventListener\('touchstart',onTouchStart,\{passive:true\}\)/,'le premier contact ne bloque jamais le défilement');
  assert.match(code,/if\(Math\.hypot\(t\.clientX-p\.x,t\.clientY-p\.y\)>TOUCH_SLOP\)cancelPending\(\)/,'bouger pendant l’attente rend la main au défilement');
  assert.match(code,/onPendingScroll/,'un défilement pendant l’attente annule l’appui');
  assert.doesNotMatch(code.slice(code.indexOf('function onTouchStart'),code.indexOf('function onWeekTouchMove')),/classList\.add/,'aucun retour visuel avant l’activation (#426)');
  assert.match(code,/if\(!e\.cancelable\)\{cancelDrag\(\);return\}/,'si le navigateur défile déjà, la carte est reposée proprement');
  assert.match(code,/scroll-behavior:auto!important/,'le défilement automatique n’est pas amorti par html{scroll-behavior:smooth}');
  assert.match(code,/-webkit-touch-callout:none/,'aucun menu système sur une carte soulevable');
  assert.doesNotMatch(code,/\bsetInterval\s*\(/,'aucune boucle permanente');
  assert.doesNotMatch(code,/new\s+MutationObserver/,'aucun observer permanent');
  for(const owned of ['renderAll','renderWeek','save','generateWeek','applyAppointmentsToPlan'])
    assert.doesNotMatch(code,new RegExp('window\\.'+owned+'\\s*=(?!=)'),'propriétaire contourné : '+owned);
  assert.doesNotMatch(code,/\.plan\s*=(?!=)|\.plan\[[^\]]+\]\s*=(?!=)/,'le geste n’écrit jamais le planning lui-même');
  for(const api of ['reorderStore','undoEdit'])assert.match(code,new RegExp('api\\.'+api+'\\('),'écriture déléguée au propriétaire : '+api);
});

/* ------------------------------------------------------ réordonner une journée */
test('réordonner une journée enregistre l’ordre partout où le planning est relu',async()=>{
  const t=env(),b=store('b1',{enseigne:'Boulanger'}),d=store('d1',{enseigne:'Darty'}),c=store('c1',{enseigne:'Carrefour'}),f=store('f1');
  t.set([b,d,c,f],{Jeudi:[b,d,c,f]});
  const r=await Manual.reorderStore(t.ctx,'c1','Jeudi',0,{expected:['b1','d1','c1','f1']});
  assert.equal(r.ok,true,r.error);assert.equal(r.from,2);assert.equal(r.to,0);assert.equal(r.warning,null);
  assert.deepEqual(ids(t.state.plan.Jeudi),['c1','b1','d1','f1'],'état courant');
  assert.deepEqual(ids(t.saved().plan.Jeudi),['c1','b1','d1','f1'],'sauvegarde principale : survit au rechargement');
  const snap=t.archive()[WEEK];
  assert.deepEqual(ids(snap.plan.Jeudi),['c1','b1','d1','f1'],'archive de période : relue par la bande des jours');
  assert.equal(snap.manualEdited,true,'la journée est protégée comme modification manuelle');
  assert.ok(t.state.manualWeekEdits[WEEK]);
  assert.equal(t.events.at(-1).type,'store-runner:planning-updated');
  assert.equal(t.events.at(-1).detail.reason,'manual-store-reordered');
  assert.deepEqual(copy(r.undo),{week:WEEK,day:'Jeudi',before:['b1','d1','c1','f1'],after:['c1','b1','d1','f1']});
  for(const day of DAYS.filter(d=>d!=='Jeudi'))assert.deepEqual(ids(t.state.plan[day]),[],'aucune visite ne change de jour');
  // Même place : rien n'est écrit.
  const writes=JSON.stringify([...t.mem]),same=await Manual.reorderStore(t.ctx,'c1','Jeudi',0);
  assert.equal(same.unchanged,true);assert.equal(JSON.stringify([...t.mem]),writes);
});
test('les positions hors limites sont bornées, les positions invalides refusées',()=>{
  const state={plan:{Jeudi:[store('a'),store('b'),store('c')]}};
  assert.equal(Manual.reorderInPlan(state,'Jeudi','a',99).to,2);assert.deepEqual(ids(state.plan.Jeudi),['b','c','a']);
  assert.equal(Manual.reorderInPlan(state,'Jeudi','a',-5).to,0);assert.deepEqual(ids(state.plan.Jeudi),['a','b','c']);
  assert.equal(Manual.reorderInPlan(state,'Jeudi','a','x').ok,false);
  assert.equal(Manual.reorderInPlan(state,'Jeudi','a',1.5).ok,false);
  assert.equal(Manual.reorderInPlan(state,'Jeudi','zz',0).ok,false);
  assert.equal(Manual.reorderInPlan(state,'Dimanche','a',0).ok,false);
  assert.deepEqual(ids(state.plan.Jeudi),['a','b','c'],'un refus ne touche à rien');
});
test('une journée passée ou un écran périmé ne se réorganisent pas',async()=>{
  const t=env(),a=store('a'),b=store('b');t.set([a,b],{Lundi:[a,b],Jeudi:[b,a]});
  const past=await Manual.reorderStore(t.ctx,'b','Lundi',0);
  assert.equal(past.ok,false);assert.equal(past.code,'past');assert.deepEqual(ids(t.state.plan.Lundi),['a','b']);
  const stale=await Manual.reorderStore(t.ctx,'a','Jeudi',0,{expected:['a','b']});
  assert.equal(stale.ok,false);assert.equal(stale.code,'stale');assert.deepEqual(ids(t.state.plan.Jeudi),['b','a']);
  assert.equal(t.db.getItem(MAIN),null,'aucune écriture');
});
test('un échec d’écriture ne laisse aucun ordre à moitié enregistré',async()=>{
  const t=env(),a=store('a'),b=store('b');t.set([a,b],{Jeudi:[a,b]});
  t.db.setItem(ARCHIVE,JSON.stringify({[WEEK]:{weekMonday:WEEK,plan:{Jeudi:[{id:'a'},{id:'b'}]}}}));const archiveBefore=t.db.getItem(ARCHIVE);
  t.ctx.save=()=>{throw Error('quota')};
  const r=await Manual.reorderStore(t.ctx,'b','Jeudi',0);
  assert.equal(r.ok,false);assert.match(r.error,/quota/);
  assert.deepEqual(ids(t.state.plan.Jeudi),['a','b']);assert.equal(t.db.getItem(ARCHIVE),archiveBefore);
  assert.deepEqual(copy(t.state.manualWeekEdits),{},'la protection manuelle n’est posée qu’avec une écriture réussie');
});
test('crédits, maximum et règle Boulanger sont intacts après un réordonnancement',async()=>{
  const t=env(),b=store('b1',{enseigne:'Boulanger'}),f=store('f1');
  t.set([b,f],{Vendredi:[b,f]});
  const credits=()=>{t.ctx.__storeRunnerPlanningGenerationActive=true;try{return t.state.plan.Vendredi.reduce((n,s)=>n+t.ctx.storeVisitCredit(s),0)}finally{t.ctx.__storeRunnerPlanningGenerationActive=false}};
  const before=[credits(),t.ctx.storeVisitCreditsForPlan(t.state.plan)];
  assert.equal((await Manual.reorderStore(t.ctx,'f1','Vendredi',0)).ok,true);
  assert.deepEqual([credits(),t.ctx.storeVisitCreditsForPlan(t.state.plan)],before,'mêmes crédits de planification et réels');
  const r=t.build();assert.equal(r.ok,true,r.error);
  assert.deepEqual(ids(r.plan.Vendredi),['f1','b1'],'le recalcul accepte la journée Boulanger réordonnée, dans l’ordre choisi');
});
test('le recalcul garde l’ordre posé à la main quand la journée reste valide',async()=>{
  const t=env(),a=store('a'),b=store('b'),c=store('c');t.set([a,b,c],{Vendredi:[a,b,c]});
  assert.equal((await Manual.reorderStore(t.ctx,'c','Vendredi',0)).ok,true);
  const r=t.build();assert.equal(r.ok,true,r.error);
  assert.equal(r.unchanged,true,'aucun déplacement artificiel');
  assert.deepEqual(ids(r.plan.Vendredi),['c','a','b']);
});
test('V254.2 : la journée du jour surchargée se réorganise et le recalcul l’accepte encore',async()=>{
  const t=env(),d1=store('d1',{enseigne:'Darty'}),d2=store('d2',{enseigne:'Darty'}),f=store('f');
  t.state.settings.maxVisitsPerDay=3;t.set([d1,d2,f],{Jeudi:[d1,d2,f]});
  t.state.locks.d1={day:'Jeudi',week:WEEK};t.state.locks.d2={day:'Jeudi',week:WEEK};
  const r=await Manual.reorderStore(t.ctx,'d2','Jeudi',0);
  assert.equal(r.ok,true,r.error);assert.deepEqual(ids(t.state.plan.Jeudi),['d2','d1','f']);
  const built=t.build();assert.equal(built.ok,true,built.error);
  assert.deepEqual(ids(built.plan.Jeudi),['d2','d1'],'les visites fixes gardent l’ordre posé');
  assert.deepEqual(ids(built.plan.Vendredi),['f'],'seul le trop-plein repart');
  assert.equal(built.overCapacityKept.length,1);
});
test('V254.2 : une journée future surchargée reste refusée par le recalcul, ordre ou pas',async()=>{
  const t=env(),d1=store('d1',{enseigne:'Darty'}),d2=store('d2',{enseigne:'Darty'});
  t.state.settings.maxVisitsPerDay=3;t.set([d1,d2],{Vendredi:[d1,d2]});
  t.state.locks.d1={day:'Vendredi',week:WEEK};t.state.locks.d2={day:'Vendredi',week:WEEK};
  assert.equal((await Manual.reorderStore(t.ctx,'d2','Vendredi',0)).ok,true,'réordonner ne crée aucune surcharge');
  const built=t.build();assert.equal(built.ok,false);assert.match(built.error,/Vendredi contient déjà 4 crédits fixes/);
});
test('un ordre infaisable est enregistré tel quel, avec un avertissement clair',async()=>{
  const t=env(),a=store('a'),b=store('b'),late=store('late',{openingHours:{Jeudi:[{open:'10:00',close:'19:00'}]}}),early=store('early',{openingHours:{Jeudi:[{open:'08:00',close:'10:00'}]}}),rdv=store('rdv');
  t.state.settings.endTime='12:00';
  t.set([a,b,late,early,rdv],{Jeudi:[a,b,late]});
  // 08:30 a, 09:30 b, 10:30 late -> fin 11:30. Commencer par « late » ferait attendre 10:00.
  const check=Manual.reorderCheck(t.state,'late','Jeudi',t.policy(),0);
  assert.equal(check.ok,true,'l’ordre reste possible');assert.equal(check.warning.code,'late-end');
  assert.equal(check.warning.reason,'Fin estimée vers 13:00, après ta fin de journée (12:00).');
  assert.equal(check.schedule.rows[0].store.id,'late','le contrôle rend l’horaire du nouvel ordre');
  const r=await Manual.reorderStore(t.ctx,'late','Jeudi',0);
  assert.equal(r.ok,true,r.error);assert.equal(r.warning.code,'late-end');
  assert.deepEqual(ids(t.state.plan.Jeudi),['late','a','b'],'le choix n’est pas réécrit');
  assert.deepEqual(ids(t.saved().plan.Jeudi),['late','a','b']);

  t.state.settings.endTime='18:00';t.state.plan.Jeudi=[early,a];
  const closing=Manual.reorderCheck(t.state,'early','Jeudi',t.policy(),1);
  assert.equal(closing.ok,true);assert.equal(closing.warning.code,'closing');assert.equal(closing.warning.reason,'Fnac early serait fermé à ton arrivée avec cet ordre.');

  t.state.plan.Jeudi=[rdv,a];t.state.appointments=[{id:'r',storeId:'rdv',date:'2026-09-24',time:'09:00',duration:60,type:'Rendez-vous'}];
  const conflict=Manual.reorderCheck(t.state,'rdv','Jeudi',t.policy(),1);
  assert.equal(conflict.ok,true);assert.equal(conflict.warning.code,'rdv-conflict');
  assert.equal(conflict.warning.reason,'Le rendez-vous de 09:00 chez Fnac rdv n’est plus tenable avec cet ordre.');
  // Réparer un rendez-vous déjà intenable ne déclenche aucun avertissement.
  t.state.plan.Jeudi=[a,rdv];
  const repaired=await Manual.reorderStore(t.ctx,'rdv','Jeudi',0);
  assert.equal(repaired.ok,true,repaired.error);assert.equal(repaired.warning,null);assert.deepEqual(ids(t.state.plan.Jeudi),['rdv','a']);
});
test('V254.2 : une journée déjà trop longue se réorganise sans avertissement imputé au geste',async()=>{
  const t=env(),d1=store('d1',{enseigne:'Darty'}),d2=store('d2',{enseigne:'Darty'}),f=store('f');
  t.state.settings.maxVisitsPerDay=3;t.state.settings.endTime='09:00';t.set([d1,d2,f],{Jeudi:[d1,d2,f]});
  const r=await Manual.reorderStore(t.ctx,'f','Jeudi',0);
  assert.equal(r.ok,true,r.error);assert.equal(r.warning,null);assert.deepEqual(ids(t.state.plan.Jeudi),['f','d1','d2']);
});
test('les avertissements nomment ce qui casse',()=>{
  const before={rows:[{store:{id:'a',enseigne:'Darty',ville:'Bron'},status:'ok'}],appointmentConflicts:0,closedCount:0,estimatedEnd:600,endLimit:1080};
  assert.equal(Manual.scheduleIssue(before,{...before}),null);
  const conflict={...before,appointmentConflicts:1,rows:[{store:{id:'a',enseigne:'Darty',ville:'Bron'},status:'appointment-conflict',appointment:{time:'10:00',manualHours:true}}]};
  assert.equal(Manual.scheduleIssue(before,conflict).reason,'L’arrivée imposée de 10:00 chez Darty Bron n’est plus tenable avec cet ordre.');
  assert.equal(Manual.scheduleIssue({...before,estimatedEnd:1100},{...before,estimatedEnd:1110}),null,'une journée déjà trop longue n’est pas imputée au nouvel ordre');
  assert.equal(Manual.scheduleIssue(before,{...before,estimatedEnd:1090}).code,'late-end');
});
test('l’optimiseur V251 ne réordonne jamais une semaine réorganisée à la main',async()=>{
  const t=env(),a=store('a',{lat:45.9,lon:4.9}),b=store('b',{lat:45.76,lon:4.86}),c=store('c',{lat:45.8,lon:4.88});
  t.set([a,b,c],{Vendredi:[b,a,c]});
  assert.equal((await Manual.reorderStore(t.ctx,'a','Vendredi',0)).ok,true);
  const r=await t.ctx.StoreRunnerRouteOptimizerV251.finalizeSingleWeek(t.state,{weekKey:WEEK});
  assert.equal(r.skipped,'manual');assert.deepEqual(ids(t.state.plan.Vendredi),['a','b','c']);
});
test('l’annulation rétablit l’ordre précédent, une seule fois et seulement si rien n’a bougé',async()=>{
  const t=env(),a=store('a'),b=store('b'),c=store('c');t.set([a,b,c],{Vendredi:[a,b,c]});
  const first=await Manual.reorderStore(t.ctx,'c','Vendredi',0);
  const undone=await Manual.undoEdit(t.ctx,first.undo);
  assert.equal(undone.ok,true,undone.error);assert.deepEqual(ids(t.state.plan.Vendredi),['a','b','c']);
  assert.deepEqual(ids(t.saved().plan.Vendredi),['a','b','c']);assert.equal(t.events.at(-1).detail.reason,'manual-store-reorder-undone');
  assert.equal((await Manual.undoEdit(t.ctx,first.undo)).ok,false,'une annulation ne se rejoue pas');
  const second=await Manual.reorderStore(t.ctx,'c','Vendredi',0);
  assert.equal((await Manual.reorderStore(t.ctx,'a','Vendredi',0)).ok,true);
  const refused=await Manual.undoEdit(t.ctx,second.undo);
  assert.equal(refused.ok,false);assert.match(refused.error,/a changé/);assert.deepEqual(ids(t.state.plan.Vendredi),['a','c','b']);
  t.state.settings.weekDate='2026-09-28';
  const otherWeek=await Manual.undoEdit(t.ctx,{week:WEEK,day:'Vendredi',before:['c','a','b'],after:['a','c','b']});
  assert.equal(otherWeek.ok,false);assert.match(otherWeek.error,/semaine/);
});

/* ------------------------------------------------ rendez-vous et rechargement */
test('un magasin avec rendez-vous garde sa place à chaque ouverture',()=>{
  const html=read('src/chef-secteur.html');
  const helpers=['parseISO','isoDate','mondayFor'].map(name=>{const m=html.match(new RegExp('function '+name+'\\([^)]*\\)\\{[^\\n]*'));assert.ok(m,name);return m[0]}).join('\n');
  const start=html.indexOf('window.applyAppointmentsToPlan=function(){'),end=html.indexOf('// remplace generateWeek',start);
  assert.ok(start>0&&end>start,'applyAppointmentsToPlan introuvable');
  const source=helpers+'\n'+html.slice(start,end);
  const run=(plan,appointments)=>{
    const state={settings:{weekDate:WEEK,days:DAYS.slice(0,5)},stores:['a','b','c','d'].map(id=>store(id)),plan,appointments};
    const ctx={state,DAYS,Date:Clock,window:{},ensureAppointments(){},todayISO(){return '2026-09-24'},byId(id){return state.stores.find(s=>s.id===id)||null}};
    vm.runInNewContext(source+'\nwindow.applyAppointmentsToPlan();',ctx);return state.plan;
  };
  const rdv=(storeId,date,extra={})=>({id:'r-'+storeId,storeId,date,time:'09:00',duration:60,type:'Rendez-vous',...extra});
  let plan=run({Jeudi:[store('b'),store('a'),store('c')]},[rdv('b','2026-09-24')]);
  assert.deepEqual(ids(plan.Jeudi),['b','a','c'],'déjà prévu ce jour-là : il reste en tête, là où l’utilisateur l’a mis');
  plan=run({Mercredi:[store('b')],Jeudi:[store('a'),store('c')]},[rdv('b','2026-09-24')]);
  assert.deepEqual(ids(plan.Mercredi),[]);assert.deepEqual(ids(plan.Jeudi),['a','c','b'],'prévu un autre jour : il rejoint le jour du rendez-vous');
  plan=run({Jeudi:[store('a')]},[rdv('d','2026-09-24')]);
  assert.deepEqual(ids(plan.Jeudi),['a','d'],'non prévu : il est ajouté au jour du rendez-vous');
  plan=run({Jeudi:[store('b'),store('a')],Vendredi:[store('b')]},[rdv('b','2026-09-24')]);
  assert.deepEqual(ids(plan.Jeudi),['b','a']);assert.deepEqual(ids(plan.Vendredi),[],'ses copies sur d’autres jours disparaissent');
  plan=run({Jeudi:[store('b'),store('a')]},[rdv('b','2026-09-25',{manualHours:true})]);
  assert.deepEqual(ids(plan.Jeudi),['b','a'],'une arrivée imposée ne déplace rien');
});
