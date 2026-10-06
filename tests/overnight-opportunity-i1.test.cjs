/* Découché J1 → J2 — incrément 1 : une recommandation fiable, explicable et NON destructive.
   Propriétaires (voir OVERNIGHT_OPPORTUNITY_I1.md) :
     - terrain-planning-v1.js : evaluateOvernightOpportunity (fonction pure), overnightOpportunitiesForPlan
       (paires de journées consécutives), describeOvernightOpportunity (texte). Aucune distance n'y est
       calculée : le routage est injecté, et au runtime c'est StoreRunnerRoadMatrixV248.leg.
     - planning-ui-fixes.js : seul à poser un bloc dans le Planning, sans bouton, sans écriture.
     - auto-planning-fix.js (V189) : garde « domicile inconnu » seulement ; sa décision n'est pas modifiée.
   Ne couvre PAS : choix de l'hôtel, repositionnement des visites, validation, génération depuis un hôtel
   (incrément 2). La génération 3 semaines est protégée par cleanup-baseline-r20 et les tests terrain. */
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {createFakeDom}=require('./helpers/fake-dom.cjs');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const T=require('../terrain-planning-v1.js');

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const WEEK='2026-10-05';                       // lundi
const TUE='2026-10-06',WED='2026-10-07';
const TODAY='2026-10-05';

/* ── Géographie de test : trois points nommés ; les distances et durées sont posées à la main. ── */
const NAMES=new Map();
const reg=(name,p)=>{NAMES.set(p.lat+','+p.lon,name);return p};
const BASE=reg('BASE',{lat:45.1,lon:4.1});
const A=reg('A',{id:'A',enseigne:'Boulanger',ville:'Annemasse',adresse:'1 rue A',lat:46.2,lon:6.2});
const B=reg('B',{id:'B',enseigne:'Darty',ville:'Annecy',adresse:'2 rue B',lat:45.9,lon:6.1});
const C=reg('C',{id:'C',enseigne:'Fnac',ville:'Chambéry',adresse:'3 rue C',lat:45.6,lon:5.9});
function net(legs,calls,source){
  return{leg(a,b){
    if(calls)calls.n++;
    const x=NAMES.get(a.lat+','+a.lon),y=NAMES.get(b.lat+','+b.lon),v=legs[x+'>'+y]||legs[y+'>'+x];
    return v?{distanceKm:v[0],durationMinutes:v[1],source:source||'road'}:null;
  }};
}
const day=(date,name,visits,extra)=>Object.assign({date,day:name,visits},extra||{});
const J1=(...v)=>day(TUE,'Mardi',v),J2=(...v)=>day(WED,'Mercredi',v);
const evaluate=(legs,options)=>T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,net(legs),options);
/* On gèle une COPIE : geler les fixtures partagées rendrait les tests suivants muets. */
const frozenCopy=o=>{const c=JSON.parse(JSON.stringify(o)),f=x=>{if(x&&typeof x==='object'){Object.freeze(x);Object.values(x).forEach(f)}return x};return f(c)};

/* 0. Constantes produit : identifiées, uniques, faciles à modifier. */
assert.deepEqual({...T.OVERNIGHT_OPPORTUNITY},{minSavedKm:100,minSavedMinutes:75},'seuils initiaux : 100 km OU 75 min');
assert.match(read('terrain-planning-v1.js'),/const OVERNIGHT_OPPORTUNITY=\{minSavedKm:100,minSavedMinutes:75\};/,'les seuils sont définis une seule fois, nommés');

/* 1. Gros gain kilométrique → recommandation. gain = (A→base + base→B) − (A→B). */
{
  const r=evaluate({'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]});
  assert.equal(r.recommended,true);assert.equal(r.status,'recommended');
  assert.equal(r.savedKm,290,'150 + 160 − 20');assert.equal(r.savedMinutes,200,'110 + 115 − 25');
  assert.equal(r.trigger,'both');assert.equal(r.precision,'road');
  assert.deepEqual(r.from,{zone:'Annemasse',storeId:'A'});assert.deepEqual(r.to,{zone:'Annecy',storeId:'B'});
  assert.equal([r.fromDay,r.toDay,r.fromDate,r.toDate].join('|'),'Mardi|Mercredi|'+TUE+'|'+WED);
  assert.equal(r.reason,'retour à la base puis nouveau départ nettement moins efficace');
  const km=evaluate({'A>BASE':[60,50],'BASE>B':[60,50],'A>B':[20,60]});   // 100 km mais seulement 40 min
  assert.equal(km.recommended,true);assert.equal(km.trigger,'km');assert.equal(km.savedKm,100);assert.equal(km.savedMinutes,40);
}

/* 2. Gros gain de TEMPS seul → recommandation (routes de montagne : peu de km, beaucoup de minutes). */
{
  const r=evaluate({'A>BASE':[45,60],'BASE>B':[45,60],'A>B':[10,20]});
  assert.equal(r.savedKm,80,'sous 100 km');assert.equal(r.savedMinutes,100,'au-dessus de 75 min');
  assert.equal(r.recommended,true);assert.equal(r.trigger,'minutes');
}

/* 3. Gain faible → aucune recommandation ; les bornes sont inclusives et se lisent sur les valeurs exposées. */
{
  const weak=evaluate({'A>BASE':[30,35],'BASE>B':[30,35],'A>B':[15,20]});
  assert.equal(weak.recommended,false);assert.equal(weak.status,'below-threshold');
  assert.equal(weak.savedKm,45);assert.equal(weak.savedMinutes,50,'le gain est calculé et exposé, mais pas recommandé');
  assert.equal(weak.reason,'');assert.equal(weak.trigger,null);
  assert.equal(T.describeOvernightOpportunity(weak),null,'rien à afficher sous les seuils');
  const justUnder=evaluate({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[20.1,5]});
  assert.equal(justUnder.savedKm,99.9);assert.equal(justUnder.savedMinutes,75,'75 min exactement : recommandé par le temps');
  assert.equal(justUnder.trigger,'minutes');
  const both=evaluate({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[20.1,6]});
  assert.equal(both.savedMinutes,74);assert.equal(both.recommended,false,'99,9 km et 74 min : sous les deux seuils');
  const edge=evaluate({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[20,6]});
  assert.equal(edge.savedKm,100);assert.equal(edge.recommended,true,'100 km exactement : recommandé');
  const custom=evaluate({'A>BASE':[30,35],'BASE>B':[30,35],'A>B':[15,20]},{thresholds:{minSavedKm:40}});
  assert.equal(custom.recommended,true,'les seuils sont substituables sans toucher au code');
}

/* 4. Pas de J2, J1/J2 sans visite, jour bloqué → aucune recommandation. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]},calls={n:0},r=net(legs,calls);
  const none=(d1,d2)=>T.evaluateOvernightOpportunity(d1,d2,BASE,r);
  assert.equal(none(J1(A),null).status,'no-day');assert.equal(none(J1(A),undefined).recommended,false);
  assert.equal(none(null,J2(B)).status,'no-day');
  assert.equal(none(J1(A),J2()).status,'no-visits','J2 sans visite');
  assert.equal(none(J1(),J2(B)).status,'no-visits','J1 sans visite');
  assert.equal(none(J1(A),{date:WED,day:'Mercredi'}).status,'no-visits','J2 sans liste de visites');
  assert.equal(none(J1(A),day(WED,'Mercredi',[B],{blocked:true})).status,'blocked-day','jour férié, en absence ou bloqué');
  assert.equal(none(day(TUE,'Mardi',[A],{blocked:true}),J2(B)).status,'blocked-day');
  assert.equal(calls.n,0,'aucun calcul de trajet quand la situation est déjà sans objet');
}

/* 5. Base absente ou inexploitable → aucune recommandation, jamais de point par défaut. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]},calls={n:0};
  for(const base of [null,undefined,{},{lat:null,lon:null},{lat:'',lon:''},{lat:'x',lon:4},{lat:95,lon:4},{lat:45,lon:181},{lat:0,lon:0},{lat:45.1}]){
    const r=T.evaluateOvernightOpportunity(J1(A),J2(B),base,net(legs,calls));
    assert.equal(r.recommended,false,'base '+JSON.stringify(base));assert.equal(r.status,'no-base');assert.equal(r.savedKm,null);assert.equal(r.savedMinutes,null);
  }
  assert.equal(calls.n,0,'le routage n’est jamais interrogé sans base : aucune distance inventée');
  /* Au niveau semaine : un profil sans coordonnées de base n'est jamais complété par baseObj() du noyau (0,0). */
  const state={profile:{baseName:'Maison',baseLat:null,baseLon:null,overnightMode:'auto'},settings:{days:DAYS.slice(0,5),weekDate:WEEK},stores:[A,B],appointments:[],calendarEvents:[],hotelReservations:{}};
  const week=T.overnightOpportunitiesForPlan({Mardi:[A],Mercredi:[B]},state,{weekKey:WEEK,today:TODAY,routing:net(legs)});
  assert.equal(week.best,null);assert.ok(week.opportunities.every(o=>o.status==='no-base'||o.status==='no-visits'));
}

/* 6. Routage ou coordonnées incomplets → aucune recommandation, aucune valeur inventée. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]};
  const noGps={id:'X',enseigne:'Sans GPS',ville:'Nulle-Part',lat:null,lon:null};
  const zero={id:'Z',enseigne:'Zéro',ville:'Zéro',lat:0,lon:0};
  for(const [label,d1,d2] of [['dernière visite J1 sans GPS',J1(A,noGps),J2(B)],['première visite J2 sans GPS',J1(A),J2(noGps,B)],['(0,0) = non localisé',J1(zero),J2(B)]]){
    const r=T.evaluateOvernightOpportunity(d1,d2,BASE,net(legs));
    assert.equal(r.recommended,false,label);assert.equal(r.status,'incomplete-data',label);assert.equal(r.savedKm,null,label);
  }
  /* Une visite sans GPS au milieu de la journée ne change rien : seules la dernière de J1 et la première de J2 comptent. */
  assert.equal(T.evaluateOvernightOpportunity(J1(noGps,A),J2(B,noGps),BASE,net(legs)).recommended,true);
  /* Le propriétaire des distances ne sait pas répondre pour un trajet : pas de recommandation. */
  for(const missing of ['A>BASE','BASE>B','A>B']){
    const partial={...legs};delete partial[missing];
    const r=T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,net(partial));
    assert.equal(r.status,'incomplete-data','jambe absente : '+missing);assert.equal(r.recommended,false);
  }
  for(const bad of [{distanceKm:null,durationMinutes:10},{distanceKm:'',durationMinutes:10},{distanceKm:[],durationMinutes:10},{distanceKm:10,durationMinutes:''},{distanceKm:10,durationMinutes:false},{distanceKm:NaN,durationMinutes:10},{distanceKm:Infinity,durationMinutes:10},{distanceKm:10,durationMinutes:null},{distanceKm:-5,durationMinutes:10},{distanceKm:'abc',durationMinutes:10},null,undefined]){
    const r=T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,{leg:()=>bad});
    assert.equal(r.status,'incomplete-data',JSON.stringify(bad));assert.equal(r.recommended,false);
  }
  assert.equal(T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,{leg(){throw new Error('OSRM')}}).status,'incomplete-data','un routage qui échoue ne casse rien');
  for(const routing of [null,undefined,{},{leg:'x'}])assert.equal(T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,routing).status,'no-routing');
}

/* 7. Deux journées éloignées de la base mais dans des directions opposées : le découchage n'économise rien. */
{
  const r=evaluate({'A>BASE':[140,100],'BASE>B':[140,100],'A>B':[270,195]});
  assert.equal(r.recommended,false);assert.equal(r.status,'below-threshold');assert.equal(r.savedKm,10);assert.equal(r.savedMinutes,5);
  const negative=evaluate({'A>BASE':[100,70],'BASE>B':[100,70],'A>B':[260,200]});
  assert.equal(negative.recommended,false,'un détour plus court par la base (routes réelles) n’est jamais conseillé');
  assert.ok(negative.savedKm<0);
  /* Même zone, proche de la base : gain insignifiant. */
  const near=evaluate({'A>BASE':[6,10],'BASE>B':[7,12],'A>B':[2,4]});
  assert.equal(near.recommended,false);assert.equal(near.savedKm,11);
}

/* 8. Précision : « road » seulement si les trois trajets sont routiers ; sinon estimation, dite telle quelle. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]};
  assert.equal(T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,net(legs,null,'estimate')).precision,'estimate');
  assert.equal(T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,net(legs,null,'road-duration')).precision,'estimate');
  assert.equal(T.evaluateOvernightOpportunity(J1(A),J2(B),BASE,{leg:(a,b)=>{const l=net(legs).leg(a,b);delete l.source;return l}}).precision,'estimate','sans source déclarée, rien n’est affirmé');
}

/* 9. Déterminisme : mêmes entrées → même sortie, indépendamment de l'ordre des magasins et des appels. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]};
  const runs=Array.from({length:5},()=>JSON.stringify(T.evaluateOvernightOpportunity(J1(C,A),J2(B,C),BASE,net(legs))));
  assert.equal(new Set(runs).size,1);
  const state=state0=>({profile:{baseName:'Base',baseLat:BASE.lat,baseLon:BASE.lon,overnightMode:'auto'},settings:{days:DAYS.slice(0,5),weekDate:WEEK},stores:state0,appointments:[],calendarEvents:[],hotelReservations:{}});
  const plan={Mardi:[A],Mercredi:[B]};
  const one=T.overnightOpportunitiesForPlan(plan,state([A,B,C]),{weekKey:WEEK,today:TODAY,routing:net(legs)});
  const two=T.overnightOpportunitiesForPlan(plan,state([C,B,A]),{weekKey:WEEK,today:TODAY,routing:net(legs)});
  assert.equal(JSON.stringify(one),JSON.stringify(two),'l’ordre de state.stores n’influence rien');
  assert.equal(JSON.stringify(one),JSON.stringify(T.overnightOpportunitiesForPlan(plan,state([A,B,C]),{weekKey:WEEK,today:TODAY,routing:net(legs)})));
}

/* 10. Semaine : mêmes jours travaillés, nuits futures consécutives, mode, réservations, Agenda. */
function weekState(extra){
  return Object.assign({profile:{baseName:'Base',baseLat:BASE.lat,baseLon:BASE.lon,overnightMode:'auto',overnightMinSaving:80},
    settings:{days:DAYS.slice(0,5),weekDate:WEEK},stores:[A,B,C],appointments:[],calendarEvents:[],hotelReservations:{},excluded:{},included:{},locks:{}},extra||{});
}
const BIG={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25],'B>BASE':[160,115],'BASE>C':[150,105],'B>C':[40,45],'A>C':[70,70],'C>BASE':[150,105]};
const weekOf=(plan,state,options)=>T.overnightOpportunitiesForPlan(plan,state||weekState(),Object.assign({weekKey:WEEK,today:TODAY,routing:net(BIG)},options));
{
  const w=weekOf({Mardi:[A],Mercredi:[B]});
  assert.equal(w.mode,'auto');assert.equal(w.weekKey,WEEK);
  assert.equal(w.best.fromDate,TUE);assert.equal(w.best.toDate,WED);assert.equal(w.best.recommended,true);
  assert.equal(w.opportunities.length,4,'une évaluation par paire de jours consécutifs : Lun→Mar, Mar→Mer, Mer→Jeu, Jeu→Ven');
  assert.equal(w.opportunities[0].status,'no-visits','Lundi sans visite');

  /* Mode Jamais : l'utilisateur a dit non, aucun conseil. */
  const never=weekState();never.profile.overnightMode='never';
  const wn=weekOf({Mardi:[A],Mercredi:[B]},never);assert.equal(wn.best,null);assert.deepEqual(wn.opportunities,[]);
  /* Obligatoire / Automatique : le conseil reste disponible. */
  const mand=weekState();mand.profile.overnightMode='mandatory';assert.ok(weekOf({Mardi:[A],Mercredi:[B]},mand).best);

  /* Nuit déjà passée : on ne conseille pas hier. */
  assert.equal(weekOf({Mardi:[A],Mercredi:[B]},null,{today:'2026-10-07'}).best,null,'mardi → mercredi commence hier');
  assert.equal(weekOf({Mardi:[A],Mercredi:[B]},null,{today:TUE}).best.fromDate,TUE,'aujourd’hui reste conseillable');

  /* mardi → jeudi n'est pas une nuit quand mercredi n'est pas travaillé. */
  const noWed=weekState();noWed.settings.days=['Lundi','Mardi','Jeudi','Vendredi'];
  assert.equal(weekOf({Mardi:[A],Jeudi:[B]},noWed).best,null);
  /* Samedi optionnel : vendredi → samedi n'existe que si le samedi est travaillé. */
  const fri='2026-10-09',sat='2026-10-10';
  const withSat=weekState();withSat.settings.days=DAYS.slice();
  const ws=weekOf({Vendredi:[A],Samedi:[B]},withSat);assert.equal(ws.best.fromDate,fri);assert.equal(ws.best.toDate,sat);
  assert.equal(weekOf({Vendredi:[A],Samedi:[B]}).best,null,'samedi non travaillé : aucune paire');

  /* Jour férié / bloqué par l'Agenda, même avec des visites. */
  const holiday=weekState({calendarEvents:[{id:'h',date:WED,title:'Jour férié',allDay:true}]});
  const wh=weekOf({Mardi:[A],Mercredi:[B]},holiday);
  assert.equal(wh.best,null);assert.equal(wh.opportunities.find(o=>o.fromDate===TUE).status,'blocked-day');
  const away=weekState({calendarEvents:[{id:'v',date:TUE,title:'Formation produit',allDay:true}]});
  assert.equal(weekOf({Mardi:[A],Mercredi:[B]},away).best,null);

  /* Réservation d'hôtel déjà posée sur cette nuit : rien à conseiller. */
  const booked=weekState({hotelReservations:{[TUE]:{fromDate:TUE,toDate:WED,hotelName:'Hôtel du Lac'}}});
  const wb=weekOf({Mardi:[A],Mercredi:[B]},booked);
  assert.equal(wb.best,null);assert.equal(wb.opportunities.find(o=>o.fromDate===TUE).status,'already-planned');

  /* Deux nuits recommandées : la plus au-dessus de son seuil, puis la plus proche. */
  const two=weekOf({Lundi:[C],Mardi:[A],Mercredi:[B]});
  assert.equal(two.opportunities.filter(o=>o.recommended).length,2,'Lun→Mar (C→A) et Mar→Mer (A→B)');
  assert.equal(two.best.fromDate,TUE,'A→B (290 km) bat C→A (150 + 150 − 70)');

  /* Entrées de plan partielles : le magasin canonique du secteur fait foi pour les coordonnées. */
  const partial=weekOf({Mardi:[{id:'A'}],Mercredi:[{id:'B'}]});assert.equal(partial.best.from.zone,'Annemasse');
  /* Jamais d'exception sur des états vides. */
  assert.doesNotThrow(()=>T.overnightOpportunitiesForPlan(null,null,{weekKey:WEEK,today:TODAY}));
  assert.doesNotThrow(()=>T.overnightOpportunitiesForPlan({},{},{}));
  assert.equal(T.overnightOpportunitiesForPlan({},{profile:{},settings:{}},{weekKey:WEEK,today:TODAY}).best,null);
}

/* 11. RDV présents : l'évaluation ne déplace, ne retire, ne crée rien — état et plan gelés, puis comparés. */
{
  const appointments=[{id:'r1',storeId:'B',date:WED,time:'09:30',duration:60,type:'Rendez-vous',note:'Le gérant'},{id:'r2',storeId:'A',date:TUE,time:'16:00',duration:45,type:'Rendez-vous',note:''}];
  const state=weekState({appointments,locks:{B:{day:'Mercredi'}},included:{A:true},hotelReservations:{'2026-10-12':{fromDate:'2026-10-12',hotelName:'Ailleurs'}}});
  const plan={Lundi:[],Mardi:[A],Mercredi:[B],Jeudi:[],Vendredi:[],Samedi:[]};
  const snapshot=JSON.stringify({state,plan});
  const frozenState=frozenCopy(state),frozenPlan=frozenCopy(plan);      // le module est en strict mode : toute écriture lèverait une TypeError
  assert.ok(Object.isFrozen(frozenState.appointments[0])&&Object.isFrozen(frozenPlan.Mardi[0]));
  const w=T.overnightOpportunitiesForPlan(frozenPlan,frozenState,{weekKey:WEEK,today:TODAY,routing:net(BIG)});
  assert.equal(w.best.fromDate,TUE,'un RDV en J1 et en J2 n’empêche pas le conseil : il n’est ni déplacé ni supprimé');
  assert.equal(JSON.stringify({state:frozenState,plan:frozenPlan}),snapshot,'state (RDV, verrous, imposés, réservations) et plan strictement identiques');
  assert.equal(frozenState.appointments.length,2);
  const r=T.evaluateOvernightOpportunity(frozenCopy(J1(A)),frozenCopy(J2(B)),BASE,net(BIG));assert.equal(r.recommended,true);
}

/* 12. Le texte : une information par ligne, sans décor ; rien sous les seuils. */
{
  const rec=evaluate({'A>BASE':[100,70],'BASE>B':[100,70],'A>B':[15,25]});             // 185 km, 115 min
  assert.equal(rec.savedKm,185);assert.equal(rec.savedMinutes,115);
  assert.deepEqual(T.describeOvernightOpportunity(rec),{
    title:'Découchage conseillé · Mardi → Mercredi',
    route:'Annemasse → secteur Annecy',
    gain:'≈ 185 km et 1 h 55 de route évités',
    reason:'Raison : retour à la base puis nouveau départ nettement moins efficace.'});
  const round=evaluate({'A>BASE':[100,70],'BASE>B':[100,70],'A>B':[12.4,24]});         // 187,6 km, 116 min
  assert.equal(T.describeOvernightOpportunity(round).gain,'≈ 190 km et 1 h 55 de route évités','arrondi à 5 près');
  const hours=evaluate({'A>BASE':[100,100],'BASE>B':[100,100],'A>B':[10,80]});          // 190 km, 120 min
  assert.equal(T.describeOvernightOpportunity(hours).gain,'≈ 190 km et 2 h de route évités');
  const mins=evaluate({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[20,40]});               // 100 km, 40 min
  assert.equal(T.describeOvernightOpportunity(mins).gain,'≈ 100 km et 40 min de route évités');
  const minutesOnly=evaluate({'A>BASE':[45,60],'BASE>B':[45,60],'A>B':[10,20]});        // 80 km, 100 min
  assert.equal(T.describeOvernightOpportunity(minutesOnly).gain,'≈ 80 km et 1 h 40 de route évités');
  const same=T.evaluateOvernightOpportunity(J1(A),J2({...A,id:'A2'}),BASE,net({'A>BASE':[150,110],'BASE>A':[150,110],'A>A':[0,0]}));
  assert.equal(T.describeOvernightOpportunity(same).route,'secteur Annemasse','même zone : « secteur X » seul');
  assert.equal(T.describeOvernightOpportunity(null),null);assert.equal(T.describeOvernightOpportunity({recommended:false}),null);
  /* Pas de verbiage : quatre lignes courtes, aucun « Runner », aucune formule décorative. */
  const lines=Object.values(T.describeOvernightOpportunity(rec));
  assert.equal(lines.length,4);assert.ok(lines.every(l=>l.length<90),'phrases courtes');
  assert.doesNotMatch(lines.join(' '),/runner|super|bravo|!|\?|💡|✨/i);
}

/* 13. Au runtime, le routage est StoreRunnerRoadMatrixV248.leg ; sans lui, aucun repli maison (ni haversine, ni Paris). */
{
  const state=weekState(),plan={Mardi:[A],Mercredi:[B]};
  delete globalThis.StoreRunnerRoadMatrixV248;
  globalThis.hav=()=>{throw new Error('hav ne doit jamais être appelé par l’évaluateur')};
  const without=T.overnightOpportunitiesForPlan(plan,state,{weekKey:WEEK,today:TODAY});
  assert.equal(without.best,null);assert.equal(without.opportunities.find(o=>o.fromDate===TUE).status,'no-routing');
  const seen=[];
  globalThis.StoreRunnerRoadMatrixV248={leg:(a,b)=>{seen.push([a.lat,a.lon,b.lat,b.lon].join(','));return net(BIG).leg(a,b)}};
  const wired=T.overnightOpportunitiesForPlan(plan,state,{weekKey:WEEK,today:TODAY});
  assert.equal(wired.best.savedKm,290);assert.ok(seen.length>=3,'les trajets sont demandés au propriétaire V248');
  assert.ok(seen.every(k=>!/48\.85/.test(k)),'aucun point parisien');
  delete globalThis.StoreRunnerRoadMatrixV248;delete globalThis.hav;
}

/* 14. Intégration réelle : vrai route-polish.js (V248) et vraie distance du noyau, dans un contexte VM. Le résultat est
       EXACTEMENT ce que le propriétaire des distances répond, estimation d'abord, puis matrice routière amorcée. */
(async()=>{
  const CORE=read('src/chef-secteur.html');
  const coreLine=re=>{const m=CORE.match(re);assert.ok(m,'noyau : '+re);return m[0]};
  const CORE_DISTANCES=[/^function rad\(v\)\{.*$/m,/^function hav\(a,b\)\{.*$/m,/^function baseObj\(\)\{.*$/m].map(coreLine).join('\n');
  const memory=new Map();
  const doc={readyState:'loading',hidden:false,addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},getElementById(){return null},createElement(){return{style:{},addEventListener(){},setAttribute(){}}},head:{appendChild(){}},dispatchEvent(){}};
  const LYON={lat:45.764,lon:4.8357},ANNEMASSE={id:'a',enseigne:'Boulanger',ville:'Annemasse',lat:46.1936,lon:6.2342},ANNECY={id:'b',enseigne:'Darty',ville:'Annecy',lat:45.8992,lon:6.1294};
  const ctx={console,document:doc,CustomEvent:function(t,i){this.type=t;this.detail=i&&i.detail},MutationObserver:function(){this.observe=function(){}},setTimeout(){return 1},clearTimeout(){},addEventListener(){},open(){},navigator:{onLine:true},location:{hostname:'localhost'},
    state:{profile:{baseName:'Lyon',baseLat:LYON.lat,baseLon:LYON.lon,overnightMode:'auto'},settings:{days:DAYS.slice(0,5),weekDate:WEEK,startTime:'08:30',endTime:'18:00',visitMinutes:60},stores:[ANNEMASSE,ANNECY],plan:{Mardi:[ANNEMASSE],Mercredi:[ANNECY]},appointments:[],calendarEvents:[],hotelReservations:{},excluded:{},visits:{}},
    routeCost:()=>0};
  ctx.window=ctx;ctx.__chefStorage=ctx.localStorage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
  vm.runInNewContext(CORE_DISTANCES,ctx,{filename:'src/chef-secteur.html'});
  vm.runInNewContext(read('route-polish.js'),ctx,{filename:'route-polish.js'});
  vm.runInNewContext(read('terrain-planning-v1.js'),ctx,{filename:'terrain-planning-v1.js'});
  const V248=ctx.StoreRunnerRoadMatrixV248,terrain=ctx.StoreRunnerTerrainPlanningV1;
  assert.ok(V248&&terrain);
  const home=()=>({lat:ctx.state.profile.baseLat,lon:ctx.state.profile.baseLon});
  const expectFromOwner=()=>{
    const l1=V248.leg(ANNEMASSE,home()),l2=V248.leg(home(),ANNECY),l3=V248.leg(ANNEMASSE,ANNECY);
    return{km:Math.round((l1.distanceKm+l2.distanceKm-l3.distanceKm)*10)/10,minutes:Math.round(l1.durationMinutes+l2.durationMinutes-l3.durationMinutes),sources:[l1,l2,l3].map(l=>l.source)};
  };
  const run=()=>terrain.overnightOpportunitiesForPlan(ctx.state.plan,ctx.state,{weekKey:WEEK,today:TODAY});

  /* a) Sans matrice : l'estimation du planning (1,22 × vol d'oiseau, 55 km/h) — dite « estimate ». */
  let expected=expectFromOwner();
  assert.deepEqual(expected.sources,['estimate','estimate','estimate']);
  let w=run();
  assert.equal(w.best.savedKm,expected.km,'même km que StoreRunnerRoadMatrixV248.leg');assert.equal(w.best.savedMinutes,expected.minutes,'mêmes minutes');
  assert.equal(w.best.precision,'estimate');
  const manual=(ctx.hav(ANNEMASSE,home())+ctx.hav(home(),ANNECY)-ctx.hav(ANNEMASSE,ANNECY))*1.22;
  assert.ok(Math.abs(w.best.savedKm-manual)<0.2,'recoupement à la main : (A→base + base→B − A→B) × 1,22');
  assert.equal(JSON.stringify(run()),JSON.stringify(w),'déterministe');

  /* b) Matrice routière amorcée (faux OSRM) : les mêmes trajets, maintenant « road ». */
  ctx.fetch=async url=>{
    const pts=String(url).match(/driving\/([^?]+)/)[1].split(';').map(s=>{const[lon,lat]=s.split(',').map(Number);return{lat,lon}});
    const dist=pts.map(a=>pts.map(b=>Math.round(ctx.hav(a,b)*1.4*1000))),dur=dist.map(r=>r.map(d=>Math.round(d/1000/75*3600)));
    return{ok:true,json:async()=>({code:'Ok',distances:dist,durations:dur})};
  };
  assert.equal((await V248.prime({force:true})).ok,true);
  expected=expectFromOwner();assert.deepEqual(expected.sources,['road','road','road']);
  w=run();assert.equal(w.best.precision,'road');assert.equal(w.best.savedKm,expected.km);assert.equal(w.best.savedMinutes,expected.minutes);
  assert.ok(w.best.savedKm>=100&&w.best.recommended,'Annemasse → Annecy depuis Lyon : > 100 km de route évités');
  assert.deepEqual(JSON.parse(JSON.stringify(w.best.from)),{zone:'Annemasse',storeId:'a'});assert.equal(w.best.to.zone,'Annecy');

  /* c) Aucune base enregistrée : le baseObj() du noyau répondrait (0,0) — l'évaluateur, lui, refuse. */
  ctx.state.profile.baseLat=null;ctx.state.profile.baseLon=null;
  assert.equal(ctx.baseObj().lat,0,'prémisse : le noyau remplit 0 quand la base est inconnue');
  w=run();assert.equal(w.best,null);assert.ok(w.opportunities.some(o=>o.status==='no-base'));

  /* d) Génération et planning : rien n'a été écrit ni déplacé. */
  assert.equal(JSON.stringify(ctx.state.plan),JSON.stringify({Mardi:[ANNEMASSE],Mercredi:[ANNECY]}));
  assert.equal(ctx.state.hotelReservations&&Object.keys(ctx.state.hotelReservations).length,0);
})().then(()=>{
  uiCheck();staticChecks();v189Guard();
  console.log('PASS: découché J1 → J2 incrément 1 — évaluateur, semaine, texte, routage V248, UI Planning, non-régression');
}).catch(err=>{console.error(err);process.exitCode=1});

/* 15. Planning : un bloc discret sous la Couverture, ou rien — sans bouton, sans écriture, texte non interprété. */
function uiCheck(){
  const TODAY_MS=Date.parse(TODAY+'T09:00:00');
  class FrozenDate extends Date{constructor(...a){super(...(a.length?a:[TODAY_MS]))}static now(){return TODAY_MS}}
  const dom=createFakeDom(),doc=dom.document;
  const plan=doc.createElement('section');plan.className='applePlan';
  const panel=doc.createElement('div');panel.id='planPanel';panel.classList.add('active');panel.appendChild(plan);
  const tabs=doc.createElement('div');tabs.id='dayTabs';plan.appendChild(tabs);
  const timeline=doc.createElement('div');timeline.className='timelineShell';plan.appendChild(timeline);
  const coverage=doc.createElement('details');coverage.id='planningCoverageV263';plan.appendChild(coverage);
  const state=weekState();const ownA={...A},ownB={...B};state.stores=[ownA,ownB];state.plan={Lundi:[],Mardi:[ownA],Mercredi:[ownB],Jeudi:[],Vendredi:[],Samedi:[]};
  const ctx={state,console,Date:FrozenDate,JSON,Object,Array,String,Number,Math,Map,Set,Intl,RegExp,Boolean,setTimeout(){return 0},clearTimeout(){},requestAnimationFrame(fn){return 1},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},save(){throw new Error('le Planning ne doit rien enregistrer')},renderAll(){},addEventListener(){},removeEventListener(){},getComputedStyle:()=>({}),
    MutationObserver:function(){this.observe=()=>{};this.disconnect=()=>{}},CustomEvent:function(type,opts){return{type,detail:opts&&opts.detail}},document:doc,window:null};
  ctx.window=ctx;
  vm.runInNewContext(read('terrain-planning-v1.js'),ctx,{filename:'terrain-planning-v1.js'});
  const src=read('planning-ui-fixes.js'),exposed=src.replace(/\}\)\(\);\s*$/,'window.__ui={reorderPlanning,syncOvernightOpportunity};})();');
  assert.notEqual(exposed,src);
  vm.runInNewContext(exposed,ctx,{filename:'planning-ui-fixes.js'});
  /* Le faux DOM n'oublie pas l'id d'un nœud retiré : « présent » veut dire « rattaché au Planning ». */
  const ui=ctx.__ui,slot=()=>{const el=doc.getElementById('planningOvernightOpportunity');return el&&el.parentNode?el:null};
  const before=JSON.stringify(state);

  /* Sans routage (matrice absente) : aucune trace. */
  ui.reorderPlanning();assert.equal(slot(),null,'aucune opportunité calculable : aucune trace visuelle');
  /* Routage disponible mais gain sous les seuils : aucune trace. */
  ctx.StoreRunnerRoadMatrixV248=net({'A>BASE':[30,35],'BASE>B':[30,35],'A>B':[15,20]});
  ui.reorderPlanning();assert.equal(slot(),null,'gain sous les seuils : aucune trace');
  /* Gros gain : le bloc apparaît, à la bonne place. */
  ctx.StoreRunnerRoadMatrixV248=net({'A>BASE':[100,70],'BASE>B':[100,70],'A>B':[15,25]});
  ui.reorderPlanning();
  const s=slot();assert.ok(s,'le bloc découché apparaît');
  assert.deepEqual(s.children.map(c=>c.textContent),[
    'Découchage conseillé · Mardi → Mercredi','Annemasse → secteur Annecy','≈ 185 km et 1 h 55 de route évités','Raison : retour à la base puis nouveau départ nettement moins efficace.']);
  const order=plan.children.map(el=>el.id||el.className);
  assert.equal(order.indexOf('planningOvernightOpportunity'),order.indexOf('planningCoverageV263')+1,'juste sous le bloc Couverture');
  assert.ok(order.indexOf('planningOvernightOpportunity')<order.indexOf('timelineShell'),'avant la liste des visites');
  assert.ok(order.indexOf('planningToolsV2')<order.indexOf('planningOvernightOpportunity'),'après les actions du Planning');
  /* Information seule : ni bouton, ni lien, ni action, ni modal. */
  const all=[s,...s.children];
  assert.ok(all.every(el=>!/^(BUTTON|A|INPUT|SELECT|DIALOG)$/.test(el.tagName)&&el.onclick===null&&!el._listeners.click),'aucun élément interactif');
  assert.equal(s.getAttribute('role'),'note');
  /* Stable : un second rendu ne duplique ni ne reconstruit. */
  ui.reorderPlanning();ui.reorderPlanning();assert.equal(plan.children.filter(c=>c.id==='planningOvernightOpportunity').length,1);assert.equal(slot(),s,'même nœud réutilisé');
  assert.equal(s.children.length,4);
  /* Le texte est posé en textContent : un nom de ville piégé n'est jamais du HTML. */
  const evil='<img src=x onerror=alert(1)>';ownA.ville=evil;ui.reorderPlanning();
  assert.equal(slot().children[1].textContent,evil+' → secteur Annecy');assert.equal(slot().children[1].innerHTML,'','jamais assigné via innerHTML');ownA.ville='Annemasse';
  ui.reorderPlanning();assert.equal(slot().children[1].textContent,'Annemasse → secteur Annecy');
  /* Quand l'opportunité disparaît (réservation d'hôtel posée), le bloc disparaît : aucune trace résiduelle. */
  state.hotelReservations[TUE]={fromDate:TUE,toDate:WED,hotelName:'Hôtel du Lac'};
  ui.reorderPlanning();assert.equal(slot(),null,'nuit réservée : plus rien à conseiller, plus de bloc');
  delete state.hotelReservations[TUE];
  state.profile.overnightMode='never';ui.reorderPlanning();assert.equal(slot(),null,'mode Jamais : aucun bloc');
  state.profile.overnightMode='auto';ui.reorderPlanning();assert.ok(slot());
  /* Rien n'a été écrit : ni state (hors nos propres manipulations de test), ni stockage, ni save(). */
  state.hotelReservations={};
  assert.equal(JSON.stringify(state),before,'ni state, ni plan, ni stockage, ni save() : le Planning n’écrit rien');
}

/* 16. Verrous d'architecture : pas de second moteur, pas de réseau, pas d'écriture, génération non couplée. */
function staticChecks(){
  const terrain=read('terrain-planning-v1.js');
  const from=terrain.indexOf('/* Découché — opportunité J1 → J2'),to=terrain.indexOf('function summarizeOpeningHours');
  assert.ok(from>0&&to>from);
  const block=terrain.slice(from,to);
  assert.doesNotMatch(block,/\bhav\s*\(|haversine|Math\.(sin|cos|asin|atan2)|6371/,'aucun second moteur de distances');
  assert.doesNotMatch(block,/fetch\s*\(|XMLHttpRequest|nominatim|StoreRunnerGeocode|places|maps\.google|booking|hotel[s]?Api/i,'aucun réseau, aucun hôtel, aucun Places');
  assert.doesNotMatch(block,/localStorage|__chefStorage|\.save\s*\(|state\.[A-Za-z_$.]+\s*=(?!=)|\.push\s*\(\s*\{[^}]*hotel/,'aucune écriture');
  assert.doesNotMatch(block,/baseObj\s*\(|baseLat\s*\|\|\s*\d|48\.85|paris/i,'aucune base par défaut, aucun repli Paris');
  assert.doesNotMatch(block,/\.notes?\b|visitNotes|report|assistant|openai|groq/i,'aucune lecture des notes terrain, aucun moteur IA');
  assert.match(block,/StoreRunnerRoadMatrixV248/,'le routage runtime est le propriétaire V248');
  /* La génération ne consomme jamais ces fonctions : seuls l'évaluateur, son export et le bloc Planning y touchent. */
  const consumers=['planning-generation-controller.js','range-planner-v2.js','planning-cascade-v181.js','planning-command-engine.js','planning-manual-visits.js','planning-route-optimizer-v251.js','store-opening-hours.js','period-day-slider.js','auto-planning-fix.js','v182-fixes.js','visit-coverage.js','runner-behavior.js','home-refresh-v2.js','assistant-upgrade.js','route-polish.js'];
  for(const file of consumers)assert.doesNotMatch(read(file),/evaluateOvernightOpportunity|overnightOpportunitiesForPlan|describeOvernightOpportunity/,file+' ne dépend pas du conseil de découchage');
  const outsideBlock=terrain.slice(0,from)+terrain.slice(to);
  assert.doesNotMatch(outsideBlock.replace(/,evaluateOvernightOpportunity,overnightOpportunitiesForPlan,describeOvernightOpportunity,OVERNIGHT_OPPORTUNITY,/,','),/evaluateOvernightOpportunity|overnightOpportunitiesForPlan|describeOvernightOpportunity|OVERNIGHT_OPPORTUNITY/,'le moteur 3 semaines n’appelle pas ce conseil : la génération ne peut pas changer');
  /* L'UI n'est ajoutée qu'à planning-ui-fixes.js, par son nom public, et sans nouveau script de démarrage. */
  const ui=read('planning-ui-fixes.js');
  assert.match(ui,/StoreRunnerTerrainPlanningV1/);assert.doesNotMatch(ui.slice(ui.indexOf('Découché conseillé — incrément 1'),ui.indexOf('function choiceSummary')),/state\.[A-Za-z_$.\[\]]+\s*=(?!=)|\bsave\s*\(|localStorage|innerHTML|insertAdjacentHTML/);
  const sw=read('sw.js');
  assert.ok(!fs.existsSync(path.join(ROOT,'overnight-opportunity.js')),'aucun nouveau script de démarrage : le budget de la baseline r20 reste inchangé');
  assert.equal(sw.includes('overnight-opportunity.js'),false,'sw.js ne précache aucun nouveau fichier : il ne change que par BUILD_REV');
}

/* 17. V189 : une base inconnue n'est plus le golfe de Guinée. Seul changement de V189 — sa décision reste celle du contrat. */
function v189Guard(){
  const CORE=read('src/chef-secteur.html');
  const coreLine=re=>{const m=CORE.match(re);assert.ok(m);return m[0]};
  const CORE_DISTANCES=[/^function rad\(v\)\{.*$/m,/^function hav\(a,b\)\{.*$/m,/^function baseObj\(\)\{.*$/m].map(coreLine).join('\n');
  const make=profile=>{
    const clock={now:Date.parse('2026-09-30T09:00:00')};
    class FD extends Date{constructor(...a){super(...(a.length?a:[clock.now]))}static now(){return clock.now}}
    const el=()=>({dataset:{},style:{},classList:{add(){},remove(){}},setAttribute(){},appendChild(){},addEventListener(){},remove(){},innerHTML:'',textContent:''});
    const document={readyState:'loading',addEventListener(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:el()};
    const state={profile,settings:{days:DAYS.slice(0,5),weekDate:'2099-01-05'},plan:{},stores:[],excluded:{},included:{},locks:{},visits:{},appointments:[],calendarEvents:[],hotelReservations:{}};
    const ctx={console,Date:FD,state,document,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:function(t,i){this.type=t;this.detail=i&&i.detail},setTimeout:()=>0,addEventListener(){},removeEventListener(){},dispatchEvent(){}};
    ctx.window=ctx;vm.runInNewContext(CORE_DISTANCES,ctx);
    for(const f of ['planning-day-origin.js','terrain-planning-v1.js','v182-fixes.js','auto-planning-fix.js'])vm.runInNewContext(read(f),ctx,{filename:f});
    state.plan={Lundi:[{id:'A',enseigne:'A',ville:'Annemasse',lat:46.19,lon:6.23}],Mardi:[{id:'B',enseigne:'B',ville:'Annecy',lat:45.9,lon:6.12}],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    return ctx;
  };
  const noBase=make({baseName:'',baseLat:null,baseLon:null,overnightMode:'auto',overnightMinSaving:80});
  const a=noBase.StoreRunnerStoreControlsV189.futureOvernightAnalysis(noBase.state.plan,'2099-01-05');
  assert.equal(a.candidate,null,'sans base enregistrée, aucun découché « de 10 000 km »');assert.equal(a.reason,'no-future-pair');
  const withBase=make({baseName:'Lyon',baseLat:45.764,baseLon:4.8357,overnightMode:'auto',overnightMinSaving:80});
  const b=withBase.StoreRunnerStoreControlsV189.futureOvernightAnalysis(withBase.state.plan,'2099-01-05');
  assert.ok(b.candidate&&b.candidate.saving>80&&b.candidate.saving<400,'avec une base enregistrée, la décision V189 est inchangée');
}
