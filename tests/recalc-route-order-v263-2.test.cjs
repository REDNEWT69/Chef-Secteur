// V263.2 — Recalcul : les journées futures qu'il modifie reprennent l'ordre de passage V251.
//
// Cas terrain « Saint-Étienne » (audit planning du 27/09/2026) : le recalcul retirait
// Fnac Écully et BUT Tassin (visités le 24/09), ajoutait Boulanger Saint-Étienne en FIN de
// jeudi puis marquait la semaine manuelle ; V251 ne repassait jamais. Résultat : Limonest
// › Écully › Saint-Étienne, départ 09:20 pour attendre l'ouverture de Limonest, retour
// 14:31 — alors que Saint-Étienne en premier fait exactement les mêmes kilomètres et rentre
// à 13:45.
//
// Ces tests rejouent le VRAI code (recalcul en cascade, V251, horaires, couverture,
// crédits, modifications manuelles), avec une horloge figée au mardi 29/09/2026 07:30 et
// les coordonnées réelles des magasins. Ils verrouillent aussi tout ce qui ne doit jamais
// être réordonné : journées passées, journée du jour, visites faites, rendez-vous, magasins
// posés ou imposés, premier arrêt à arrivée imposée, semaines retouchées à la main.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

const ROOT=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(ROOT,name),'utf8');
const RealDate=Date;
const NOW='2026-09-29T07:30:00';
class Clock extends RealDate{constructor(...args){super(...(args.length?args:[NOW]))}static now(){return new RealDate(NOW).getTime()}}
// planning-manual-visits.js s'exécute dans le contexte du test : même horloge figée.
global.Date=Clock;
const Manual=require('../planning-manual-visits.js');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const WEEK='2026-09-28',NEXT_WEEK='2026-10-05',TODAY='2026-09-29';
const ARCHIVE='chef_sector_plan_archive_v1',MAIN='sector_planner_universal_v1';
const BASE={name:'Francheville',lat:45.7366,lon:4.7636};
const copy=x=>JSON.parse(JSON.stringify(x));
const ids=route=>Array.from(route||[],s=>String(s.id));
const empty=()=>Object.fromEntries(DAYS.map(d=>[d,[]]));
/* Même format que la signature de plan du recalcul (planning-cascade-v181.js). */
const signature=plan=>DAYS.map(day=>((plan&&plan[day])||[]).map(s=>String((s&&s.id)||'')).join('|')).join('||');
function hav(a,b){
  const R=6371,r=Math.PI/180,dla=(Number(b.lat)-Number(a.lat))*r,dlo=(Number(b.lon)-Number(a.lon))*r;
  const x=Math.sin(dla/2)**2+Math.cos(Number(a.lat)*r)*Math.cos(Number(b.lat)*r)*Math.sin(dlo/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function shift(iso,days){const d=new RealDate(iso+'T12:00:00');d.setDate(d.getDate()+days);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
/* Darty et Boulanger : 09:30–19:30 du lundi au samedi, la règle terrain que
   boulanger-default-hours.js applique à l'exécution. Autres enseignes : horaire inconnu. */
const BRAND_HOURS=Object.fromEntries(DAYS.map(d=>[d,[{open:'09:30',close:'19:30'}]]));
function mk(id,enseigne,ville,lat,lon,extra={}){
  const s={id,enseigne,ville,adresse:'1 rue '+ville,dept:'69',lat,lon,active:true,priority:3,intervalDays:30,...extra};
  if(/^(Darty|Boulanger)$/.test(enseigne)){s.openingHours=copy(BRAND_HOURS);s.openingHoursSource='brand-default'}
  return s;
}

/* Bac à sable : les vrais modules du planning, dans l'ordre de chargement d'index.html. */
function env(o){
  const mem=new Map(),events=[],confirms=[],proposals=[];
  const db={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),flush:async()=>{}};
  const byId=new Map(o.stores.map(s=>[s.id,s]));
  const planOf=src=>{const p=empty();for(const [day,list] of Object.entries(src||{}))p[day]=list.map(id=>byId.get(id));return p};
  const plan=planOf(o.plan);
  const state={schemaVersion:5,profile:{baseName:BASE.name,baseLat:BASE.lat,baseLon:BASE.lon,overnightMode:'never'},
    settings:{weekDate:WEEK,days:DAYS.slice(0,5),maxVisitsPerDay:o.max||6,target:15,startTime:'08:30',endTime:'18:00',visitMinutes:60},
    stores:o.stores,plan,visits:o.visits||{},businessV2:{version:2,revision:0,visits:[],actions:[],storeSnapshots:{}},
    locks:o.locks||{},included:o.included||{},excluded:{},appointments:o.appointments||[],manualWeekEdits:o.manualWeekEdits||{},calendarEvents:[]};
  const archive=o.archive?o.archive({plan,planOf}):{[WEEK]:{weekMonday:WEEK,plan:copy(plan)}};
  for(const [key,week] of Object.entries(o.futureWeeks||{}))archive[key]={weekMonday:key,plan:copy(planOf(week))};
  db.setItem(ARCHIVE,JSON.stringify(archive));
  const weekInput={value:WEEK};
  const document={readyState:'loading',hidden:false,addEventListener(){},removeEventListener(){},dispatchEvent(e){events.push(e)},
    getElementById:id=>id==='weekDate'?weekInput:null,querySelector:()=>null,querySelectorAll:()=>[]};
  const ctx={state,console,Date:Clock,JSON,Math,Map,Set,Promise,setTimeout,clearTimeout,document,localStorage:db,__chefStorage:db,
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init&&init.detail}},
    addEventListener(){},removeEventListener(){},dispatchEvent(){},
    hav,havBase:s=>hav(BASE,s),baseObj:()=>({id:'BASE',enseigne:'Base',ville:BASE.name,lat:BASE.lat,lon:BASE.lon}),
    routeCost:route=>{if(!route||!route.length)return 0;let p=BASE,km=0;for(const s of route){km+=hav(p,s);p=s}return km+hav(p,BASE)},
    calendarEventsForDate:()=>[],
    confirm:message=>{confirms.push(String(message));return true},
    save(){db.setItem(MAIN,JSON.stringify(state))},renderAll(){},
    ChefReliability:{checkpoint(){},propose:async candidate=>{proposals.push(copy(candidate));state.plan=candidate.plan;if(candidate.archive)db.setItem(ARCHIVE,JSON.stringify(candidate.archive));return true}}};
  ctx.window=ctx;
  const modules=['visit-counting.js','store-opening-hours.js','visit-coverage.js'].concat(o.withoutV251?[]:['planning-route-optimizer-v251.js']);
  for(const name of modules)vm.runInNewContext(read(name),ctx,{filename:name});
  // Le recalcul publie ses points d'entrée au DOMContentLoaded : on l'installe tout de suite.
  vm.runInNewContext(read('planning-cascade-v181.js').replace("if(document.readyState==='loading')","if(false)"),ctx,{filename:'planning-cascade-v181.js'});
  return{ctx,state,db,events,confirms,proposals,byId,
    archive:()=>JSON.parse(db.getItem(ARCHIVE)||'{}'),
    recalc:()=>ctx.storeRunnerRecalculateRemainingWeek()};
}
/* Juge de paix indépendant du recalcul : le même ordonnanceur (horaires, RDV, fin de
   journée) et la même évaluation V251, dans un bac à sable qui possède V251. */
function evaluate(t,routeIds,day,weekKey){
  const api=t.ctx.StoreRunnerRouteOptimizerV251;assert.ok(api,'V251 doit être chargé pour évaluer');
  return api.evaluate(routeIds.map(id=>t.byId.get(id)),day,t.state,{weekMonday:weekKey||WEEK});
}

/* ------------------------------------------------------ cas terrain Saint-Étienne */
function saintEtienne(extra={}){
  const stores=[
    mk('lim','Darty','Limonest',45.806155,4.776187,{intervalDays:15}),
    mk('ecu','Carrefour','Écully',45.787,4.763,{intervalDays:15}),
    mk('bse','Boulanger','Saint-Étienne',45.441,4.426),
    mk('fnm','Fnac','Écully',45.788,4.769),
    mk('but','BUT','Tassin-la-Demi-Lune',45.763,4.756),
    mk('pdi','Darty','Lyon Part-Dieu',45.7621058,4.8557052,{intervalDays:7}),
    mk('fpd','Fnac','Lyon Part-Dieu',45.7609,4.8566,{intervalDays:15}),
    mk('rep','Darty','Lyon République',45.761279,4.836196,{intervalDays:15}),
    mk('ven','Darty','Vénissieux',45.7168865,4.8562065,{intervalDays:15}),
    mk('cve','Carrefour','Vénissieux',45.704,4.882),
    mk('cfv','Conforama','Vénissieux',45.702,4.876),
    mk('bro','Darty','Bron',45.7213405,4.9198091,{intervalDays:15}),
    mk('bbr','Boulanger','Bron',45.7216246,4.9215729,{intervalDays:15}),
    mk('spr','Darty','Saint-Priest',45.7135604,4.9634737),
    mk('cal','Darty','Caluire-et-Cuire',45.8043008,4.8572363,{intervalDays:15}),
    mk('cvi','Carrefour','Villeurbanne',45.767,4.899),
    mk('cri','Carrefour','Rillieux',45.82,4.897)
  ];
  // Dernière visite réelle à ~60 % de la fréquence : à jour, ni retiré ni rajouté.
  const visits={};
  for(const s of stores){if(s.id==='bse')continue;const d=shift(TODAY,-Math.round(0.6*s.intervalDays));visits[s.id]={lastVisit:d,history:[d]}}
  for(const id of ['fnm','but'])visits[id]={lastVisit:'2026-09-24',history:['2026-09-24']};   // visités jeudi dernier
  for(const id of ['pdi','fpd','rep'])visits[id]={lastVisit:WEEK,history:[shift(TODAY,-20),WEEK]}; // lundi réalisé
  const plan={Lundi:['pdi','fpd','rep'],Mardi:['ven','cve','cfv'],Mercredi:['bro','bbr','spr'],
    // Jeudi dans l'ordre V251 de la génération d'origine (quatre magasins).
    Jeudi:['fnm','lim','ecu','but'],Vendredi:['cal','cvi','cri']};
  return env(Object.assign({stores,visits,plan},extra));
}

test('Saint-Étienne : sans V251, le recalcul reproduit exactement le défaut terrain (témoin)',async()=>{
  const t=saintEtienne({withoutV251:true});
  const r=await t.recalc();
  assert.equal(r.ok,true,r.error);
  assert.deepEqual(Array.from(r.removed,x=>x.id).sort(),['but','fnm'],'Fnac Écully et BUT Tassin retirés : visités trop récemment');
  assert.deepEqual(Array.from(r.added,x=>x.id+'@'+x.day),['bse@Jeudi'],'Boulanger Saint-Étienne ajouté jeudi');
  assert.deepEqual(ids(t.state.plan.Jeudi),['lim','ecu','bse'],'sans V251 : Saint-Étienne reste ajouté en dernier');
  assert.ok(!(r.previewLines||[]).some(line=>/Ordre de passage/.test(line)),'aucun ordre annoncé sans V251');
});

test('Saint-Étienne : le jeudi recalculé reprend l’ordre V251 (même trajet, retour plus tôt)',async()=>{
  const t=saintEtienne();
  const appended=['lim','ecu','bse'];
  const before=evaluate(t,appended,'Jeudi');
  const r=await t.recalc();
  assert.equal(r.ok,true,r.error);
  assert.deepEqual(Array.from(r.removed,x=>x.id).sort(),['but','fnm']);
  assert.deepEqual(Array.from(r.added,x=>x.id+'@'+x.day),['bse@Jeudi']);
  const jeudi=ids(t.state.plan.Jeudi);
  assert.deepEqual(jeudi.slice().sort(),['bse','ecu','lim'],'mêmes magasins : l’ordre seul change');
  assert.equal(jeudi[0],'bse','Saint-Étienne passe en premier : l’attente d’ouverture de Limonest disparaît');
  const expected=t.ctx.StoreRunnerRouteOptimizerV251.explainOptimization(appended.map(id=>t.byId.get(id)),'Jeudi',t.state,{weekMonday:WEEK});
  assert.deepEqual(jeudi,ids(expected.route),'l’ordre est exactement celui que V251 choisit');
  const after=evaluate(t,jeudi,'Jeudi');
  assert.equal(after.feasible,true,'tournée faisable (horaires, fin de journée)');
  assert.ok(after.driveMinutes<=before.driveMinutes+0.1,'jamais plus de conduite : '+after.driveMinutes+' > '+before.driveMinutes);
  assert.ok(after.estimatedEnd<before.estimatedEnd-30,'retour nettement plus tôt : '+after.estimatedEnd+' vs '+before.estimatedEnd);
  // La réorganisation n'est pas silencieuse : l'aperçu confirmé par l'utilisateur la nomme.
  const line=(r.previewLines||[]).find(l=>/Ordre de passage optimisé/.test(l));
  assert.ok(line,'une ligne d’aperçu annonce le nouvel ordre');
  assert.match(line,/Jeudi/);
  assert.match(t.confirms[0],/Ordre de passage optimisé/,'la confirmation montre la ligne avant d’appliquer');
  assert.deepEqual(Array.from(t.proposals[0].previewLines),Array.from(r.previewLines));
  // Ce qui ne bouge pas : lundi réalisé, journée du jour, autres jours futurs intacts.
  assert.deepEqual(ids(t.state.plan.Lundi),['pdi','fpd','rep']);
  assert.deepEqual(ids(t.state.plan.Mardi),['ven','cve','cfv']);
  assert.deepEqual(ids(t.state.plan.Mercredi),['bro','bbr','spr']);
  assert.deepEqual(ids(t.state.plan.Vendredi),['cal','cvi','cri']);
  // Archive = ce qui est affiché, marquée par ce recalcul (et non par l'utilisateur).
  const snap=t.archive()[WEEK];
  assert.deepEqual(ids(snap.plan.Jeudi),jeudi,'l’archive relue par la bande des jours porte le même ordre');
  assert.equal(snap.manualEdited,true,'la semaine reste protégée des générateurs, comme avant');
  assert.ok(snap.recalculated&&snap.recalculated.at===snap.manualEditedAt,'marque de recalcul datée comme la protection');
  assert.equal(snap.recalculated.signature,signature(snap.plan),'marque de recalcul liée au plan écrit');
});

test('Saint-Étienne : une semaine réordonnée au doigt n’est jamais réorganisée par le recalcul',async()=>{
  const t=saintEtienne();
  const moved=await Manual.reorderStore(t.ctx,'lim','Jeudi',0);
  assert.equal(moved.ok,true,moved.error);
  assert.deepEqual(ids(t.state.plan.Jeudi),['lim','fnm','ecu','but'],'ordre choisi à la main');
  const r=await t.recalc();
  assert.equal(r.ok,true,r.error);
  assert.deepEqual(ids(t.state.plan.Jeudi),['lim','ecu','bse'],'ordre relatif de l’utilisateur conservé, ajout en fin comme avant');
  assert.ok(!(r.previewLines||[]).some(line=>/Ordre de passage/.test(line)));
  const snap=t.archive()[WEEK];
  assert.equal(snap.manualEdited,true);
  assert.equal(snap.recalculated,undefined,'une semaine retouchée à la main ne reçoit jamais la marque de recalcul');
});

test('Saint-Étienne : une semaine marquée par un recalcul précédent reste réordonnable, jusqu’à la première retouche',async()=>{
  const marked=({plan})=>({[WEEK]:{weekMonday:WEEK,plan:copy(plan),manualEdited:true,manualEditedAt:'2026-09-27T18:00:00.000Z',
    recalculated:{at:'2026-09-27T18:00:00.000Z',signature:signature(plan)}}});
  const recalcOnly=saintEtienne({archive:marked,manualWeekEdits:{[WEEK]:{at:'2026-09-27T18:00:01.000Z',plan:{}}}});
  const r=await recalcOnly.recalc();
  assert.equal(r.ok,true,r.error);
  assert.equal(ids(recalcOnly.state.plan.Jeudi)[0],'bse','semaine protégée par un recalcul, pas par l’utilisateur : V251 repasse');

  const touched=saintEtienne({archive:marked,manualWeekEdits:{[WEEK]:{at:'2026-09-27T18:00:01.000Z',plan:{}}}});
  assert.equal((await Manual.reorderStore(touched.ctx,'ecu','Jeudi',0)).ok,true);
  const again=await touched.recalc();
  assert.equal(again.ok,true,again.error);
  assert.deepEqual(ids(touched.state.plan.Jeudi),['ecu','lim','bse'],'retouchée à la main après le recalcul : plus jamais réordonnée');
  assert.equal(touched.archive()[WEEK].recalculated,undefined);

  // Le plan affiché diffère de celui que le recalcul a écrit, même sans trace dans l'archive :
  // quelqu'un l'a changé, la semaine reste intouchable.
  const drifted=saintEtienne({archive:marked,manualWeekEdits:{[WEEK]:{at:'2026-09-27T18:00:01.000Z',plan:{}}}});
  drifted.state.plan.Jeudi=['lim','fnm','ecu','but'].map(id=>drifted.byId.get(id));
  const kept=await drifted.recalc();
  assert.equal(kept.ok,true,kept.error);
  assert.deepEqual(ids(drifted.state.plan.Jeudi),['lim','ecu','bse']);
  assert.ok(!(kept.previewLines||[]).some(line=>/Ordre de passage/.test(line)));
  assert.equal(drifted.archive()[WEEK].recalculated,undefined);
});

/* ---------------------------------------------- journées que rien ne doit réordonner */
/* Géométrie en zigzag : N puis S puis NE (35 km) au lieu de N, NE, S (28 km). */
const N=[45.7866,4.7636],S=[45.6866,4.7936],NE=[45.7866,4.8236],NEAR=[45.7466,4.7736];
function fnac(id,[lat,lon]){return mk(id,'Fnac','Ville '+id,lat,lon)}

test('jours passés, journée du jour et visites faites gardent leur ordre ; le même zigzag un jour futur est corrigé',async()=>{
  const stores=[fnac('m1',N),fnac('m2',S),fnac('m3',NE),fnac('mx',NEAR),
    fnac('t1',N),fnac('t2',S),fnac('td',NEAR),fnac('t3',NE),
    fnac('j1',N),fnac('j2',S),fnac('jd',NEAR),fnac('j3',NE),
    fnac('w1',N),fnac('w2',S),fnac('wd',NEAR),fnac('w3',NE)];
  const visits={};
  for(const id of ['m1','m2','m3'])visits[id]={lastVisit:WEEK,history:[WEEK]};              // lundi réalisé
  for(const id of ['td','jd','wd'])visits[id]={lastVisit:'2026-09-27',history:['2026-09-27']}; // visités dimanche
  const t=env({stores,visits,
    plan:{Lundi:['m1','mx','m2','m3'],Mardi:['t1','t2','td','t3'],Jeudi:['j1','j2','jd','j3']},
    futureWeeks:{[NEXT_WEEK]:{Jeudi:['w1','w2','wd','w3']}}});
  const zigzag=evaluate(t,['j1','j2','j3'],'Jeudi');
  const r=await t.recalc();
  assert.equal(r.ok,true,r.error);
  assert.deepEqual(ids(t.state.plan.Lundi),['m1','m2','m3'],'lundi passé : visites faites en place, ordre inchangé');
  assert.deepEqual(ids(t.state.plan.Mardi),['t1','t2','t3','mx'],'aujourd’hui : jamais réordonné (journée peut-être entamée)');
  const jeudi=ids(t.state.plan.Jeudi);
  assert.deepEqual(jeudi.slice().sort(),['j1','j2','j3']);
  assert.notDeepEqual(jeudi,['j1','j2','j3'],'jeudi futur modifié : le zigzag est corrigé');
  assert.ok(evaluate(t,jeudi,'Jeudi').driveMinutes<zigzag.driveMinutes-5,'moins de conduite sur le jeudi futur');
  const next=r.weeks[NEXT_WEEK];
  assert.ok(next,'la semaine suivante archivée fait partie du recalcul');
  assert.deepEqual(ids(next.Jeudi).slice().sort(),['w1','w2','w3']);
  assert.notDeepEqual(ids(next.Jeudi),['w1','w2','w3'],'semaine suivante : même correction, datée sur sa propre semaine');
  assert.ok(evaluate(t,ids(next.Jeudi),'Jeudi',NEXT_WEEK).driveMinutes<zigzag.driveMinutes-5);
});

test('rendez-vous, magasin posé et magasin imposé restent sur leur jour ; aucun conflit créé',async()=>{
  const stores=[fnac('l',S),fnac('r',N),fnac('vd',NEAR),fnac('i',NE)];
  const t=env({stores,visits:{vd:{lastVisit:'2026-09-27',history:['2026-09-27']}},
    plan:{Vendredi:['l','r','vd','i']},
    locks:{l:{day:'Vendredi',week:WEEK}},included:{i:true},
    appointments:[{id:'rdv',storeId:'r',date:'2026-10-02',time:'10:00',duration:60,type:'Rendez-vous',note:''}]});
  const r=await t.recalc();
  assert.equal(r.ok,true,r.error);
  const vendredi=ids(t.state.plan.Vendredi);
  assert.deepEqual(vendredi.slice().sort(),['i','l','r'],'posé, imposé et rendez-vous restent vendredi');
  for(const day of DAYS)if(day!=='Vendredi')assert.deepEqual(ids(t.state.plan[day]),[],day+' ne reçoit aucun de ces magasins');
  const schedule=t.ctx.StoreOpeningHoursV1.scheduleRoute(t.state.plan.Vendredi,'Vendredi',t.state,{weekMonday:new Clock(WEEK+'T12:00:00')});
  assert.equal(schedule.appointmentConflicts,0,'le rendez-vous de 10:00 reste tenu');
  const row=schedule.rows.find(x=>String(x.store.id)==='r');
  assert.equal(row.arrival,600,'arrivée au rendez-vous à 10:00');
  assert.ok(evaluate(t,vendredi,'Vendredi').feasible,'vendredi faisable');
});

test('un premier arrêt à arrivée imposée reste premier',async()=>{
  const stores=[fnac('f1',[45.7366,4.95]),fnac('a',N),fnac('b',S),fnac('md',NEAR)];
  const t=env({stores,visits:{md:{lastVisit:'2026-09-27',history:['2026-09-27']}},
    plan:{Mercredi:['f1','a','b','md']},
    appointments:[{id:'mh1',storeId:'f1',date:'2026-09-30',time:'11:00',endTime:null,duration:60,type:'Horaire manuel',manualHours:true,note:''}]});
  // Sans cette garde, V251 ferait passer un autre magasin avant l'arrivée imposée.
  const free=t.ctx.StoreRunnerRouteOptimizerV251.explainOptimization(['f1','a','b'].map(id=>t.byId.get(id)),'Mercredi',t.state,{weekMonday:WEEK});
  assert.notEqual(ids(free.route)[0],'f1','le cas est significatif : V251 libre changerait le premier arrêt');
  const r=await t.recalc();
  assert.equal(r.ok,true,r.error);
  const mercredi=ids(t.state.plan.Mercredi);
  assert.equal(mercredi[0],'f1','l’arrêt dont l’arrivée est imposée reste le premier');
  assert.deepEqual(mercredi.slice().sort(),['a','b','f1']);
  assert.ok(evaluate(t,mercredi,'Mercredi').feasible);
});
