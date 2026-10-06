/* Découché J1 → J2 — incrément 1 : l'enrichissement routier d'une nuit que V189 a DÉJÀ retenue.
   UNE SEULE AUTORITÉ : V189 (futureOvernightAnalysis, StoreRunnerOvernightV182.analyze) décide qu'une nuit
   est un découché. StoreRunnerRoadMatrixV248.leg ne fait que chiffrer ce que la route y gagne ; le bandeau
   V206 (period-day-slider.js) l'affiche. Rien ici ne retient, n'écarte ni ne recommande une nuit.
   Propriétaires :
     - auto-planning-fix.js (V189) : la décision ; seul changement : un domicile en (0, 0) n'est pas un domicile.
     - terrain-planning-v1.js : overnightRoadGain (pure, routage injecté), enrichOvernightCandidate,
       describeOvernightRoadGain, OVERNIGHT_ROAD_REFERENCE (diagnostic inerte, réservé à l'incrément 2).
     - period-day-slider.js : deux lignes dans #planningOvernightCueV206, rien d'autre.
   Ne couvre PAS : choix de l'hôtel, repositionnement des visites, validation, génération depuis un hôtel (incrément 2).
   La génération 3 semaines est protégée par cleanup-baseline-r20 et les tests terrain. */
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const T=require('../terrain-planning-v1.js');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

/* On gèle une COPIE : geler les fixtures partagées rendrait les tests suivants muets. */
const frozenCopy=o=>{const c=JSON.parse(JSON.stringify(o)),f=x=>{if(x&&typeof x==='object'){Object.freeze(x);Object.values(x).forEach(f)}return x};return f(c)};

/* ── Géographie de test : points nommés ; distances et durées posées à la main. ── */
const NAMES=new Map();
const reg=(name,p)=>{NAMES.set(p.lat+','+p.lon,name);return p};
const BASE=reg('BASE',{lat:45.1,lon:4.1});
const A=reg('A',{id:'A',enseigne:'Boulanger',ville:'Annemasse',adresse:'1 rue A',lat:46.2,lon:6.2});
const B=reg('B',{id:'B',enseigne:'Darty',ville:'Annecy',adresse:'2 rue B',lat:45.9,lon:6.1});
function net(legs,calls,source){
  return{leg(a,b){
    if(calls)calls.n++;
    const x=NAMES.get(a.lat+','+a.lon),y=NAMES.get(b.lat+','+b.lon),v=legs[x+'>'+y]||legs[y+'>'+x];
    return v?{distanceKm:v[0],durationMinutes:v[1],source:source||'road'}:null;
  }};
}
const gain=(legs,source)=>T.overnightRoadGain(A,B,BASE,net(legs,null,source));

/* 0. Vocabulaire : plus aucune décision côté enrichissement. */
assert.deepEqual({...T.OVERNIGHT_ROAD_REFERENCE},{minSavedKm:100,minSavedMinutes:75},'référence de l’incrément 2 : 100 km OU 75 min, inchangée');
assert.equal(Object.keys(T).some(k=>/recommend|opportunit/i.test(k)),false,'aucune API de recommandation autonome');
for(const k of ['overnightRoadGain','enrichOvernightCandidate','describeOvernightRoadGain'])assert.equal(typeof T[k],'function',k);
for(const k of ['evaluateOvernightOpportunity','overnightOpportunitiesForPlan','describeOvernightOpportunity','OVERNIGHT_OPPORTUNITY'])assert.equal(T[k],undefined,k+' (décision parallèle du premier essai) n’existe plus');

/* 1. Le calcul : gain = (dernière J1 → base + base → première J2) − (dernière J1 → première J2). */
{
  const g=gain({'A>BASE':[100,70],'BASE>B':[100,70],'A>B':[15,25]});
  assert.equal(g.savedKm,185,'100 + 100 − 15');assert.equal(g.savedMinutes,115,'70 + 70 − 25');
  assert.deepEqual(g.from,{zone:'Annemasse',storeId:'A'});assert.deepEqual(g.to,{zone:'Annecy',storeId:'B'});
  assert.equal(g.precision,'road');assert.equal(g.roadThresholdMet,true);
  assert.deepEqual(T.describeOvernightRoadGain(g),{route:'Annemasse → secteur Annecy',gain:'≈ 185 km · 1 h 55 de route évités'},'le texte de la décision produit');
  /* L'objet ne porte aucune décision : seulement des mesures et leur provenance. */
  assert.deepEqual(Object.keys(g).sort(),['from','precision','roadThresholdMet','savedKm','savedMinutes','to']);
}

/* 2. Les chiffres s'affichent quel que soit leur niveau : le seuil 100 km / 75 min ne filtre RIEN (il n'y a plus
      de deuxième recommandation). Un gain modeste sur une nuit retenue par V189 est montré tel qu'il est. */
{
  const modest=gain({'A>BASE':[30,35],'BASE>B':[30,35],'A>B':[15,20]});
  assert.equal(modest.savedKm,45);assert.equal(modest.savedMinutes,50);assert.equal(modest.roadThresholdMet,false);
  assert.equal(T.describeOvernightRoadGain(modest).gain,'≈ 45 km · 50 min de route évités','sous la référence : affiché quand même');
  const hours=gain({'A>BASE':[100,100],'BASE>B':[100,100],'A>B':[10,80]});
  assert.equal(T.describeOvernightRoadGain(hours).gain,'≈ 190 km · 2 h de route évités');
  const round=gain({'A>BASE':[100,70],'BASE>B':[100,70],'A>B':[12.4,24]});
  assert.equal(T.describeOvernightRoadGain(round).gain,'≈ 190 km · 1 h 55 de route évités','arrondi à 5 près');
  /* La seule partie positive est montrée : un gain de temps sans gain de km (ou l'inverse) n'invente rien. */
  assert.equal(T.describeOvernightRoadGain(gain({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[130,10]})).gain,'≈ 70 min de route évités'.replace('70 min','1 h 10'),'minutes seules');
  assert.equal(T.describeOvernightRoadGain(gain({'A>BASE':[60,10],'BASE>B':[60,10],'A>B':[20,40]})).gain,'≈ 100 km de route évités','km seuls');
  /* Même zone des deux côtés : « secteur X » seul. */
  const same=T.overnightRoadGain(A,{...A,id:'A2'},BASE,net({'A>BASE':[150,110],'BASE>A':[150,110],'A>A':[0,0]}));
  assert.equal(T.describeOvernightRoadGain(same).route,'secteur Annemasse');
  /* Rien de positif (la route n'y gagne rien, ou perd) : aucune ligne, le bandeau reste celui de V189. */
  for(const legs of [{'A>BASE':[140,100],'BASE>B':[140,100],'A>B':[280,200]},{'A>BASE':[100,70],'BASE>B':[100,70],'A>B':[260,200]}]){
    const g=gain(legs);assert.ok(g.savedKm<=0&&g.savedMinutes<=0);assert.equal(T.describeOvernightRoadGain(g),null);
  }
  assert.equal(T.describeOvernightRoadGain(null),null);assert.equal(T.describeOvernightRoadGain({savedKm:NaN,savedMinutes:NaN}),null);
}

/* 3. La référence de l'incrément 2 est un diagnostic : ses bornes sont inclusives et lisent les valeurs exposées. */
{
  assert.equal(gain({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[20.1,5]}).roadThresholdMet,true,'75 min exactement');
  assert.equal(gain({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[20.1,6]}).roadThresholdMet,false,'99,9 km et 74 min');
  assert.equal(gain({'A>BASE':[60,40],'BASE>B':[60,40],'A>B':[20,6]}).roadThresholdMet,true,'100 km exactement');
}

/* 4. Base absente ou inexploitable → null, jamais de point par défaut, routage jamais interrogé. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]},calls={n:0};
  for(const base of [null,undefined,{},{lat:null,lon:null},{lat:'',lon:''},{lat:'x',lon:4},{lat:95,lon:4},{lat:45,lon:181},{lat:0,lon:0},{lat:45.1}])
    assert.equal(T.overnightRoadGain(A,B,base,net(legs,calls)),null,'base '+JSON.stringify(base));
  assert.equal(calls.n,0,'aucune distance inventée sans base');
}

/* 5. Coordonnées ou routage incomplets → null, aucune valeur inventée. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]};
  const noGps={id:'X',ville:'Nulle-Part',lat:null,lon:null},zero={id:'Z',ville:'Zéro',lat:0,lon:0};
  assert.equal(T.overnightRoadGain(noGps,B,BASE,net(legs)),null);assert.equal(T.overnightRoadGain(A,noGps,BASE,net(legs)),null);assert.equal(T.overnightRoadGain(zero,B,BASE,net(legs)),null,'(0,0) = non localisé');
  for(const missing of ['A>BASE','BASE>B','A>B']){const partial={...legs};delete partial[missing];assert.equal(T.overnightRoadGain(A,B,BASE,net(partial)),null,'jambe absente : '+missing)}
  for(const bad of [{distanceKm:null,durationMinutes:10},{distanceKm:'',durationMinutes:10},{distanceKm:[],durationMinutes:10},{distanceKm:10,durationMinutes:''},{distanceKm:10,durationMinutes:false},{distanceKm:NaN,durationMinutes:10},{distanceKm:Infinity,durationMinutes:10},{distanceKm:10,durationMinutes:null},{distanceKm:-5,durationMinutes:10},{distanceKm:'abc',durationMinutes:10},null,undefined])
    assert.equal(T.overnightRoadGain(A,B,BASE,{leg:()=>bad}),null,JSON.stringify(bad));
  assert.equal(T.overnightRoadGain(A,B,BASE,{leg(){throw new Error('OSRM')}}),null,'un routage qui échoue ne casse rien');
  for(const routing of [null,undefined,{},{leg:'x'}])assert.equal(T.overnightRoadGain(A,B,BASE,routing),null);
}

/* 6. Précision : « road » seulement si les trois trajets sont routiers ; sinon estimation, dite telle quelle. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]};
  assert.equal(gain(legs,'estimate').precision,'estimate');assert.equal(gain(legs,'road-duration').precision,'estimate');
  assert.equal(T.overnightRoadGain(A,B,BASE,{leg:(a,b)=>{const l=net(legs).leg(a,b);delete l.source;return l}}).precision,'estimate','sans source déclarée, rien n’est affirmé');
}

/* 7. Déterminisme et lecture seule. */
{
  const legs={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]};
  const runs=Array.from({length:5},()=>JSON.stringify(T.overnightRoadGain(A,B,BASE,net(legs))));
  assert.equal(new Set(runs).size,1);
  const r=T.overnightRoadGain(frozenCopy(A),frozenCopy(B),frozenCopy(BASE),net(legs));assert.equal(r.savedKm,290);
}

/* 8. enrichOvernightCandidate : la nuit de V189 + le profil + le propriétaire des distances, rien d'autre. */
const BIG={'A>BASE':[150,110],'BASE>B':[160,115],'A>B':[20,25]};
function stateWith(extra){
  return Object.assign({profile:{baseName:'Base',baseLat:BASE.lat,baseLon:BASE.lon,overnightMode:'auto',overnightMinSaving:80},
    settings:{days:DAYS.slice(0,5),weekDate:'2026-10-05'},stores:[A,B],appointments:[{id:'r1',storeId:'B',date:'2026-10-07',time:'09:30',duration:60,type:'Rendez-vous',note:''}],calendarEvents:[],
    hotelReservations:{'2026-10-06':{fromDate:'2026-10-06',toDate:'2026-10-07',hotelName:'Hôtel du Lac'}},excluded:{},included:{B:true},locks:{A:{day:'Mardi'}},plan:{Mardi:[A],Mercredi:[B]}},extra||{});
}
{
  const state=stateWith(),candidate={fromDay:'Mardi',toDay:'Mercredi',last:{id:'A'},first:{id:'B'}};
  /* Les entrées partielles du plan sont complétées par le magasin du secteur (comme l'ordonnanceur). */
  const frozenState=frozenCopy(state),before=JSON.stringify(frozenState);
  const g=T.enrichOvernightCandidate(frozenCopy(candidate),frozenState,{routing:net(BIG)});
  assert.equal(g.savedKm,290);assert.equal(g.from.zone,'Annemasse');assert.equal(g.to.zone,'Annecy');
  assert.equal(JSON.stringify(frozenState),before,'RDV, verrous, imposés, hôtels, plan : strictement identiques (état gelé)');
  /* Sans base enregistrée : rien, même si le noyau pourrait répondre (0,0). */
  const noBase=stateWith();noBase.profile.baseLat=null;noBase.profile.baseLon=null;
  assert.equal(T.enrichOvernightCandidate(candidate,noBase,{routing:net(BIG)}),null);
  assert.equal(T.enrichOvernightCandidate(null,state,{routing:net(BIG)}),null);assert.equal(T.enrichOvernightCandidate({last:{id:'A'}},state,{routing:net(BIG)}),null);
  assert.doesNotThrow(()=>T.enrichOvernightCandidate({last:A,first:B},null,{routing:net(BIG)}));
  /* Au runtime le routage est StoreRunnerRoadMatrixV248.leg ; absent, aucun repli (ni haversine, ni Paris). */
  delete globalThis.StoreRunnerRoadMatrixV248;
  globalThis.hav=()=>{throw new Error('hav ne doit jamais être appelé par l’enrichissement')};globalThis.baseObj=()=>{throw new Error('baseObj() du noyau ne doit jamais être lu')};
  assert.equal(T.enrichOvernightCandidate(candidate,state),null,'pas de propriétaire des distances : pas de chiffre');
  const seen=[];globalThis.StoreRunnerRoadMatrixV248={leg:(a,b)=>{seen.push([a.lat,a.lon,b.lat,b.lon].join(','));return net(BIG).leg(a,b)}};
  assert.equal(T.enrichOvernightCandidate(candidate,state).savedKm,290);
  assert.equal(seen.length,3,'exactement trois trajets demandés au propriétaire V248');assert.ok(seen.every(k=>!/48\.85/.test(k)),'aucun point parisien');
  delete globalThis.StoreRunnerRoadMatrixV248;delete globalThis.hav;delete globalThis.baseObj;
}

/* 9. UNE SEULE AUTORITÉ : avec le vrai V189 dans un contexte VM, l'enrichissement suit sa décision et ne la change jamais. */
const CORE=read('src/chef-secteur.html');
const coreLine=re=>{const m=CORE.match(re);assert.ok(m,'noyau : '+re);return m[0]};
const CORE_DISTANCES=[/^function rad\(v\)\{.*$/m,/^function hav\(a,b\)\{.*$/m,/^function baseObj\(\)\{.*$/m].map(coreLine).join('\n');
function makeRuntime(profile,plan,withRoads){
  const clock={now:Date.parse('2026-09-30T09:00:00')};
  class FD extends Date{constructor(...a){super(...(a.length?a:[clock.now]))}static now(){return clock.now}}
  const el=()=>({dataset:{},style:{},classList:{add(){},remove(){}},setAttribute(){},appendChild(){},addEventListener(){},remove(){},innerHTML:'',textContent:''});
  const document={readyState:'loading',addEventListener(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:el()};
  const state={profile,settings:{days:DAYS.slice(0,5),weekDate:'2099-01-05'},plan,stores:[],excluded:{},included:{},locks:{},visits:{},appointments:[],calendarEvents:[],hotelReservations:{}};
  state.stores=[].concat(...Object.values(plan));
  const ctx={console,Date:FD,state,document,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:function(t,i){this.type=t;this.detail=i&&i.detail},setTimeout:()=>0,addEventListener(){},removeEventListener(){},dispatchEvent(){}};
  ctx.window=ctx;vm.runInNewContext(CORE_DISTANCES,ctx);
  for(const f of ['planning-day-origin.js','terrain-planning-v1.js','v182-fixes.js','auto-planning-fix.js'])vm.runInNewContext(read(f),ctx,{filename:f});
  /* Le propriétaire des distances : l'estimation du planning (1,22 × vol d'oiseau, 55 km/h), comme V248 sans matrice. */
  if(withRoads)ctx.StoreRunnerRoadMatrixV248={leg:(a,b)=>{const km=ctx.hav(a,b)*1.22;return{distanceKm:km,durationMinutes:km/55*60,source:'estimate'}}};
  return ctx;
}
const LYON={baseName:'Lyon',baseLat:45.764,baseLon:4.8357,overnightMode:'auto',overnightMinSaving:80};
const ANNEMASSE={id:'a',enseigne:'Boulanger',ville:'Annemasse',lat:46.1936,lon:6.2342},ANNECY={id:'b',enseigne:'Darty',ville:'Annecy',lat:45.8992,lon:6.1294};
const planOf=(j1,j2)=>({Lundi:[j1],Mardi:[j2],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});
const analyse=ctx=>ctx.StoreRunnerStoreControlsV189.futureOvernightAnalysis(ctx.state.plan,'2099-01-05');
{
  /* a) V189 retient la nuit → l'enrichissement la chiffre, avec les magasins mêmes de V189. */
  const ctx=makeRuntime({...LYON},planOf(ANNEMASSE,ANNECY),true),a=analyse(ctx);
  assert.ok(a.candidate,'V189 retient Lundi → Mardi');assert.equal(a.candidate.last.id,'a');assert.equal(a.candidate.first.id,'b');
  const g=ctx.StoreRunnerTerrainPlanningV1.enrichOvernightCandidate(a.candidate,ctx.state);
  assert.ok(g&&g.savedKm>100&&g.savedMinutes>75,'Annemasse → Annecy depuis Lyon : la route y gagne beaucoup');
  assert.equal(g.from.zone,'Annemasse');assert.equal(g.to.zone,'Annecy');
  const text=ctx.StoreRunnerTerrainPlanningV1.describeOvernightRoadGain(g);assert.match(text.gain,/^≈ \d+ km · (\d+ h( \d{2})?|\d+ min) de route évités$/);

  /* b) La décision de V189 est identique avec ou sans propriétaire des distances : l'enrichissement ne la touche pas. */
  const bare=makeRuntime({...LYON},planOf(ANNEMASSE,ANNECY),false),b=analyse(bare);
  assert.equal(JSON.stringify(a),JSON.stringify(b),'même analyse V189 avec ou sans StoreRunnerRoadMatrixV248');
  assert.equal(bare.StoreRunnerTerrainPlanningV1.enrichOvernightCandidate(b.candidate,bare.state),null,'sans routage : aucun chiffre, la nuit V189 reste retenue');
  assert.ok(b.candidate);

  /* c) V189 ne retient PAS la nuit (zone à moins de 55 km) : la route aurait pourtant dépassé 100 km, et pourtant
        il n'y a ni candidat, ni bandeau, ni ligne. Une nuit que V189 écarte n'est jamais recommandée par la route. */
  const near1={id:'n1',enseigne:'N1',ville:'Nord-A',lat:46.17,lon:4.84},near2={id:'n2',enseigne:'N2',ville:'Nord-B',lat:46.17,lon:4.9};
  const close=makeRuntime({...LYON},planOf(near1,near2),true),c=analyse(close);
  assert.equal(c.candidate,null,'V189 : zone trop proche → pas de découché');assert.equal(c.reason,'too-close');
  const road=close.StoreRunnerTerrainPlanningV1.overnightRoadGain(near1,near2,{lat:LYON.baseLat,lon:LYON.baseLon},close.StoreRunnerRoadMatrixV248);
  assert.equal(road.roadThresholdMet,true,'prémisse : le seuil routier 100 km serait atteint');
  assert.equal(close.StoreRunnerTerrainPlanningV1.enrichOvernightCandidate(c.candidate,close.state),null,'pas de candidat V189 → pas d’enrichissement');

  /* d) Mode Jamais : aucune nuit, aucune ligne. */
  const never=makeRuntime({...LYON,overnightMode:'never'},planOf(ANNEMASSE,ANNECY),true),n=analyse(never);
  assert.equal(n.candidate,null);assert.equal(n.reason,'disabled');

  /* e) Mode Obligatoire / Automatique inchangés : mêmes décisions qu'avant ce lot. */
  const mand=makeRuntime({...LYON,overnightMode:'mandatory'},planOf(ANNEMASSE,ANNECY),true);assert.ok(analyse(mand).candidate);
}

/* 10. Base absente → aucune absurdité. V189 lisait baseObj() du noyau, qui renvoie (0, 0) : « ~10 000 km d'économie ». */
{
  for(const [label,profile] of [['base null',{baseName:'',baseLat:null,baseLon:null}],['base vide',{baseName:'',baseLat:'',baseLon:''}],['base (0, 0)',{baseName:'Zéro',baseLat:0,baseLon:0}],['base absente du profil',{baseName:''}]]){
    const ctx=makeRuntime({...profile,overnightMode:'auto',overnightMinSaving:80},planOf(ANNEMASSE,ANNECY),true),a=analyse(ctx);
    assert.equal(a.candidate,null,label+' : aucun découché proposé');assert.equal(a.reason,'no-future-pair',label);
    assert.equal(ctx.StoreRunnerTerrainPlanningV1.enrichOvernightCandidate({last:ANNEMASSE,first:ANNECY},ctx.state),null,label+' : aucun chiffre');
    const mand=makeRuntime({...profile,overnightMode:'mandatory',overnightMinSaving:80},planOf(ANNEMASSE,ANNECY),true);assert.equal(analyse(mand).candidate,null,label+' : même en mode Obligatoire');
  }
  /* Positif de contrôle : avec une base enregistrée, la décision V189 est exactement celle d'avant. */
  const ok=makeRuntime({...LYON},planOf(ANNEMASSE,ANNECY),true),a=analyse(ok);
  assert.ok(a.candidate&&a.candidate.saving>80&&a.candidate.saving<400);assert.equal(a.reason,'candidate');
}

/* 11. Intégration réelle : vrai route-polish.js (V248) et vraie distance du noyau. Le résultat est EXACTEMENT ce que le
       propriétaire des distances répond : d'abord son estimation, puis la matrice routière amorcée (faux OSRM). */
async function integration(){
  const memory=new Map();
  const doc={readyState:'loading',hidden:false,addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},getElementById(){return null},createElement(){return{style:{},addEventListener(){},setAttribute(){}}},head:{appendChild(){}},dispatchEvent(){}};
  const ctx={console,document:doc,CustomEvent:function(t,i){this.type=t;this.detail=i&&i.detail},MutationObserver:function(){this.observe=function(){}},setTimeout(){return 1},clearTimeout(){},addEventListener(){},open(){},navigator:{onLine:true},location:{hostname:'localhost'},
    state:{profile:{baseName:'Lyon',baseLat:LYON.baseLat,baseLon:LYON.baseLon,overnightMode:'auto'},settings:{days:DAYS.slice(0,5),weekDate:'2026-10-05',startTime:'08:30',endTime:'18:00',visitMinutes:60},stores:[ANNEMASSE,ANNECY],plan:planOf(ANNEMASSE,ANNECY),appointments:[],calendarEvents:[],hotelReservations:{},excluded:{},visits:{}},routeCost:()=>0};
  ctx.window=ctx;ctx.__chefStorage=ctx.localStorage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
  vm.runInNewContext(CORE_DISTANCES,ctx,{filename:'src/chef-secteur.html'});
  vm.runInNewContext(read('route-polish.js'),ctx,{filename:'route-polish.js'});
  vm.runInNewContext(read('terrain-planning-v1.js'),ctx,{filename:'terrain-planning-v1.js'});
  const V248=ctx.StoreRunnerRoadMatrixV248,terrain=ctx.StoreRunnerTerrainPlanningV1,candidate={fromDay:'Lundi',toDay:'Mardi',last:ANNEMASSE,first:ANNECY};
  assert.ok(V248&&terrain);
  const home=()=>({lat:ctx.state.profile.baseLat,lon:ctx.state.profile.baseLon});
  const fromOwner=()=>{const l1=V248.leg(ANNEMASSE,home()),l2=V248.leg(home(),ANNECY),l3=V248.leg(ANNEMASSE,ANNECY);
    return{km:Math.round((l1.distanceKm+l2.distanceKm-l3.distanceKm)*10)/10,minutes:Math.round(l1.durationMinutes+l2.durationMinutes-l3.durationMinutes),sources:[l1,l2,l3].map(l=>l.source)}};

  /* a) Sans matrice : l'estimation du planning (1,22 × vol d'oiseau, 55 km/h), dite « estimate ». */
  let expected=fromOwner();assert.deepEqual(expected.sources,['estimate','estimate','estimate']);
  let g=terrain.enrichOvernightCandidate(candidate,ctx.state);
  assert.equal(g.savedKm,expected.km,'même km que StoreRunnerRoadMatrixV248.leg');assert.equal(g.savedMinutes,expected.minutes,'mêmes minutes');assert.equal(g.precision,'estimate');
  const manual=(ctx.hav(ANNEMASSE,home())+ctx.hav(home(),ANNECY)-ctx.hav(ANNEMASSE,ANNECY))*1.22;
  assert.ok(Math.abs(g.savedKm-manual)<0.2,'recoupement à la main : (A→base + base→B − A→B) × 1,22');
  /* b) Matrice routière amorcée (faux OSRM) : les mêmes trajets, maintenant « road ». */
  ctx.fetch=async url=>{
    const pts=String(url).match(/driving\/([^?]+)/)[1].split(';').map(s=>{const[lon,lat]=s.split(',').map(Number);return{lat,lon}});
    const dist=pts.map(a=>pts.map(b=>Math.round(ctx.hav(a,b)*1.4*1000))),dur=dist.map(r=>r.map(d=>Math.round(d/1000/75*3600)));
    return{ok:true,json:async()=>({code:'Ok',distances:dist,durations:dur})};
  };
  assert.equal((await V248.prime({force:true})).ok,true);
  expected=fromOwner();assert.deepEqual(expected.sources,['road','road','road']);
  g=terrain.enrichOvernightCandidate(candidate,ctx.state);
  assert.equal(g.precision,'road');assert.equal(g.savedKm,expected.km);assert.equal(g.savedMinutes,expected.minutes);
  /* c) Aucune base enregistrée : le baseObj() du noyau répondrait (0,0) — l'enrichissement, lui, refuse. */
  ctx.state.profile.baseLat=null;ctx.state.profile.baseLon=null;
  assert.equal(ctx.baseObj().lat,0,'prémisse : le noyau remplit 0 quand la base est inconnue');
  assert.equal(terrain.enrichOvernightCandidate(candidate,ctx.state),null);
  /* d) Rien n'a été écrit ni déplacé. */
  assert.equal(JSON.stringify(ctx.state.plan),JSON.stringify(planOf(ANNEMASSE,ANNECY)));assert.equal(Object.keys(ctx.state.hotelReservations).length,0);
}

/* 12. Verrous d'architecture : une seule décision, une seule surface, pas de second moteur, pas d'écriture, génération non couplée. */
function staticChecks(){
  const terrain=read('terrain-planning-v1.js');
  const from=terrain.indexOf('/* Découché — enrichissement routier'),to=terrain.indexOf('function summarizeOpeningHours');
  assert.ok(from>0&&to>from);const block=terrain.slice(from,to).replace(/\/\*[\s\S]*?\*\//g,'');   // le code, pas les commentaires qui expliquent ce qu'on évite
  assert.doesNotMatch(block,/\bhav\s*\(|haversine|Math\.(sin|cos|asin|atan2)|6371/,'aucun second moteur de distances');
  assert.doesNotMatch(block,/fetch\s*\(|XMLHttpRequest|nominatim|StoreRunnerGeocode|places|maps\.google|booking|hotel[s]?Api/i,'aucun réseau, aucun hôtel, aucun Places');
  assert.doesNotMatch(block,/localStorage|__chefStorage|\.save\s*\(|\bstate\.[A-Za-z_$.\[\]]+\s*=(?!=)|\bstate\.[A-Za-z_$.]+\.(?:push|splice|unshift)\s*\(|Object\.assign\(\s*state\b/,'aucune écriture dans state, le stockage ou une sauvegarde');
  assert.doesNotMatch(block,/baseObj\s*\(|baseLat\s*\|\|\s*\d|48\.85|paris/i,'aucune base par défaut, aucun repli Paris');
  assert.doesNotMatch(block,/\.notes?\b|visitNotes|report|assistant|openai|groq/i,'aucune lecture des notes terrain, aucun moteur IA');
  assert.doesNotMatch(block,/recommended|recommend|status\s*:|overnightMode|hotelReservations|dateBlocked/,'aucune décision : ni mode, ni réservation, ni statut, ni recommandation');
  assert.match(block,/StoreRunnerRoadMatrixV248/,'le routage runtime est le propriétaire V248');

  /* Une seule surface : le bandeau V206. Le premier essai (bloc dans planning-ui-fixes.js) n'existe plus nulle part. */
  const runtimeFiles=fs.readdirSync(ROOT).filter(f=>/\.(js|html|css)$/.test(f)&&f!=='sw.js').concat(['src/chef-secteur.html']);
  for(const f of runtimeFiles)assert.doesNotMatch(read(f),/evaluateOvernightOpportunity|overnightOpportunitiesForPlan|describeOvernightOpportunity|planningOvernightOpportunity|OVERNIGHT_OPPORTUNITY\b/,f+' : plus de décision ni de bloc parallèles');
  assert.equal(fs.readFileSync(path.join(ROOT,'planning-ui-fixes.js'),'utf8'),require('child_process').execFileSync('git',['show','cd2dd46:planning-ui-fixes.js'],{cwd:ROOT,encoding:'utf8',maxBuffer:1<<26}),'planning-ui-fixes.js : strictement celui de main, aucun second bloc');
  const slider=read('period-day-slider.js');
  const consumers=runtimeFiles.filter(f=>/enrichOvernightCandidate|describeOvernightRoadGain|overnightRoadGain/.test(read(f)));
  assert.deepEqual(consumers.sort(),['period-day-slider.js','terrain-planning-v1.js'],'seuls le moteur terrain (définition) et le bandeau V206 (affichage) connaissent l’enrichissement');
  assert.match(slider,/planningOvernightCueV206/);
  /* L'affichage : texte posé en textContent, jamais interprété, et rien d'interactif ajouté. */
  const part=slider.slice(slider.indexOf('function overnightRoadLines'),slider.indexOf('function syncOvernightVisibility'));
  assert.match(part,/route\.textContent=r/);assert.match(part,/gain\.textContent=g/);assert.doesNotMatch(part,/innerHTML|insertAdjacentHTML|\.save\s*\(|localStorage|state\.[A-Za-z_$.]+\s*=(?!=)/);
  assert.match(slider,/<span class="planningOvernightCueRoad" data-overnight-road hidden><span data-overnight-route><\/span><span data-overnight-gain><\/span><\/span>/,'deux lignes dans le bandeau existant, masquées par défaut');
  const mainSlider=require('child_process').execFileSync('git',['show','cd2dd46:period-day-slider.js'],{cwd:ROOT,encoding:'utf8',maxBuffer:1<<26});
  const count=(src,re)=>(src.match(re)||[]).length;
  assert.equal(count(slider,/createElement\('button'\)/g),count(mainSlider,/createElement\('button'\)/g),'aucun bouton ajouté par la bande : le bandeau V206 reste la seule action');
  assert.equal(count(slider,/addEventListener\('click'/g),count(mainSlider,/addEventListener\('click'/g),'aucun nouveau geste : le tap du bandeau ouvre toujours l’hôtel, rien d’autre');

  /* La génération et les autres décideurs ne connaissent pas l'enrichissement : elle ne peut pas changer. */
  for(const f of ['planning-generation-controller.js','range-planner-v2.js','planning-cascade-v181.js','planning-command-engine.js','planning-manual-visits.js','planning-route-optimizer-v251.js','store-opening-hours.js','auto-planning-fix.js','v182-fixes.js','visit-coverage.js','runner-behavior.js','home-refresh-v2.js','assistant-upgrade.js','route-polish.js','planning-ui-fixes.js'])
    assert.doesNotMatch(read(f),/enrichOvernightCandidate|describeOvernightRoadGain|overnightRoadGain|OVERNIGHT_ROAD_REFERENCE/,f+' ne dépend pas de l’enrichissement');
  const outside=(terrain.slice(0,from)+terrain.slice(to)).replace(/overnightRoadGain,enrichOvernightCandidate,describeOvernightRoadGain,OVERNIGHT_ROAD_REFERENCE,/,'');
  assert.doesNotMatch(outside,/enrichOvernightCandidate|describeOvernightRoadGain|overnightRoadGain|OVERNIGHT_ROAD_REFERENCE/,'le moteur 3 semaines n’appelle pas l’enrichissement : la génération ne peut pas changer');
  /* Pas de nouveau script de démarrage, sw.js limité à BUILD_REV. */
  assert.ok(!fs.existsSync(path.join(ROOT,'overnight-opportunity.js'))&&!fs.existsSync(path.join(ROOT,'overnight-road-enrichment.js')));
  assert.equal(read('sw.js').includes('overnight-road-enrichment.js'),false);
}

integration().then(()=>{
  staticChecks();
  console.log('PASS: découché J1 → J2 incrément 1 — V189 décide, la route chiffre : enrichissement pur, une seule surface, base absente, routage V248, lecture seule');
}).catch(err=>{console.error(err);process.exitCode=1});
