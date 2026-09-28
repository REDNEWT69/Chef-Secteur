/* V263.4 — découché obligatoire.
   Automatique : zone éloignée (≥ 55 km du domicile) ET économie ≥ seuil du profil, inchangé.
   Obligatoire : l'intention explicite passe outre les 55 km, jamais le gain minimal de 20 km ;
   on garde la meilleure paire de journées consécutives.
   Jamais : aucune nuit.
   Le lendemain d'un découché part de l'hôtel s'il est localisé, sinon la question est posée :
   aucune position d'hôtel n'est inventée.
   Géométrie plane injectée (km), domicile en (0,0) : les chiffres se lisent directement. */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const read=f=>fs.readFileSync(path.join(process.cwd(),f),'utf8');
const WEEK='2099-01-05';                      // semaine future : aucune nuit n'est « passée »
const FIVE=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const flat=(a,b)=>Math.hypot(Number(a.x||0)-Number(b.x||0),Number(a.y||0)-Number(b.y||0));
const at=(id,x,y,ville)=>({id,enseigne:'Enseigne '+id,ville:ville||'Ville-Test '+id,adresse:'1 rue Test',x,y:y||0});
const emptyPlan=()=>({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});

function makeState(){
  return{
    profile:{overnightMode:'auto',overnightMinSaving:80},
    settings:{days:FIVE.slice(),weekDate:WEEK},
    plan:emptyPlan(),stores:[],excluded:{},locks:{},visits:{},appointments:[],manualWeekEdits:{},hotelReservations:{}
  };
}
function makeDocument(elements){
  return{
    readyState:'loading',hidden:false,head:{appendChild(){}},
    addEventListener(){},dispatchEvent(){},
    getElementById(id){return elements[id]||null},
    querySelector(){return null},querySelectorAll(){return[]},
    createElement(tag){return{tagName:String(tag).toUpperCase(),dataset:{},style:{},classList:{add(){},remove(){}},setAttribute(){},remove(){},appendChild(){}}}
  };
}
function makeContext(distance,extra){
  const state=makeState(),elements={overnightBox:{innerHTML:''}};
  const ctx=Object.assign({
    console,state,document:makeDocument(elements),confirm(){return true},
    CustomEvent:function(type,opts){this.type=type;this.detail=opts&&opts.detail},
    setTimeout(){return 0},addEventListener(){},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    StoreRunnerSectorPilotage:{},
    hav:distance||flat,baseObj(){return{x:0,y:0}},storeVisitCredit(){return 1}
  },extra||{});
  ctx.window=ctx;ctx.__elements=elements;
  return ctx;
}
function loadControls(distance,extra){
  const ctx=makeContext(distance,extra);
  vm.runInNewContext(read('planning-day-origin.js'),ctx);
  vm.runInNewContext(read('auto-planning-fix.js'),ctx);
  const analyze=(plan)=>ctx.StoreRunnerStoreControlsV189.futureOvernightAnalysis(plan,WEEK);
  return{ctx,state:ctx.state,analyze};
}
function loadLegacy(){
  const ctx=makeContext();
  vm.runInNewContext(read('v182-fixes.js'),ctx);
  return{ctx,state:ctx.state,analyze:(plan)=>ctx.StoreRunnerOvernightV182.analyze(plan)};
}
function plan(rows){const p=emptyPlan();for(const[day,stores]of Object.entries(rows))p[day]=stores;return p}
function premise(row,remoteKm,saving){
  assert(row,'la paire de référence doit exister');
  if(remoteKm)assert(remoteKm(row.remoteKm),'prémisse remoteKm fausse : '+row.remoteKm);
  if(saving)assert(saving(row.saving),'prémisse économie fausse : '+row.saving);
}

/* Paires de référence (km).
   CLOSE : fin à 40 km, reprise à 50 km, 10 km entre les deux → économie 80, remoteKm 40.
   FAR_SMALL : 60 km et ~61 km, mais de part et d'autre → économie ~29, remoteKm 60.
   FAR_BIG : 90 et 100 km dans le même axe → économie 180, remoteKm 90.
   LOCAL : 8 et 12 km → économie 16. OPPOSITE : 60 km et 70 km opposés → économie 0. */
const CLOSE=[at('close-a',40),at('close-b',50)];
const FAR_SMALL=[at('far-s-a',60),at('far-s-b',-10,60)];
const FAR_BIG=[at('far-b-a',90),at('far-b-b',100)];
const LOCAL=[at('local-a',8),at('local-b',12)];
const OPPOSITE=[at('opp-a',60),at('opp-b',-70)];

const C=loadControls();
const {state}=C;

/* ── 1. Automatique + remoteKm < 55 → aucun découché, même avec un seuil à 0 ─────────── */
state.profile.overnightMode='auto';state.profile.overnightMinSaving=80;
let a=C.analyze(plan({Lundi:[CLOSE[0]],Mardi:[CLOSE[1]]}));
premise(a.best,r=>r<55,s=>s>=20);
assert.equal(a.candidate,null,'Automatique ne propose pas de nuit à moins de 55 km du domicile');
assert.equal(a.reason,'too-close');
state.profile.overnightMinSaving=0;
a=C.analyze(plan({Lundi:[CLOSE[0]],Mardi:[CLOSE[1]]}));
assert.equal(a.candidate,null,'un seuil à 0 km ne lève pas la distance minimale en Automatique');
assert.equal(a.reason,'too-close');

/* ── 2. Automatique + remoteKm ≥ 55 mais économie < 20 → aucun découché ─────────────── */
state.profile.overnightMinSaving=80;
a=C.analyze(plan({Lundi:[OPPOSITE[0]],Mardi:[OPPOSITE[1]]}));
premise(a.bestRemote,r=>r>=55,s=>s<20);
assert.equal(a.candidate,null,'Automatique ne propose pas une nuit qui n’économise pas 20 km');
assert.equal(a.reason,'threshold');

/* ── 3. Automatique, cas valide : comportement historique à l'identique ─────────────── */
a=C.analyze(plan({Lundi:[at('l0',5),FAR_BIG[0]],Mardi:[FAR_BIG[1],at('m1',6)]}));
assert.equal(a.mode,'auto');
assert.equal(a.reason,'candidate');
assert.equal(a.candidate.night,'Nuit Lundi → Mardi');
assert.equal(a.candidate.fromDate,'2099-01-05');
assert.equal(a.candidate.toDate,'2099-01-06');
assert.equal(Math.round(a.candidate.saving),180);
assert.equal(Math.round(a.candidate.remoteKm),90);
assert.equal(a.candidate.last.id,'far-b-a','la nuit se prend après le dernier magasin de la veille');
assert.equal(a.candidate.first.id,'far-b-b','le lendemain reprend au premier magasin');
// Automatique garde sa préférence pour la zone éloignée : une paire proche plus rentable
// (Lundi → Mardi, 80 km) ne lui fait pas quitter la paire lointaine (Jeudi → Vendredi, ~29 km).
state.profile.overnightMinSaving=20;
a=C.analyze(plan({Lundi:[CLOSE[0]],Mardi:[CLOSE[1]],Jeudi:[FAR_SMALL[0]],Vendredi:[FAR_SMALL[1]]}));
premise(a.best,r=>r<55,s=>s>=60);
assert.equal(a.candidate.night,'Nuit Jeudi → Vendredi','Automatique ne retient que la zone éloignée');
state.profile.overnightMinSaving=80;
a=C.analyze(plan({Lundi:[CLOSE[0]],Mardi:[CLOSE[1]],Jeudi:[FAR_SMALL[0]],Vendredi:[FAR_SMALL[1]]}));
assert.equal(a.candidate,null,'Automatique garde son seuil d’économie');
assert.equal(a.reason,'threshold');
// Oracle de la règle Automatique historique, sur des semaines pseudo-aléatoires.
{
  let seed=11;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};
  let checked=0,proposed=0;
  for(let t=0;t<400;t++){
    const days=FIVE.filter(()=>rnd()<0.85);if(days.length<2)continue;
    const p=emptyPlan();
    for(const d of days)if(rnd()<0.9){const n=1+Math.floor(rnd()*3);for(let k=0;k<n;k++)p[d].push(at(d+k,(rnd()-0.5)*260,(rnd()-0.5)*260))}
    const threshold=[0,10,20,40,80,120][Math.floor(rnd()*6)];
    state.settings.days=days;state.profile.overnightMinSaving=threshold;
    let expected=null;
    for(let i=0;i<days.length-1;i++){
      if(FIVE.indexOf(days[i+1])-FIVE.indexOf(days[i])!==1)continue;
      const x=p[days[i]],y=p[days[i+1]];if(!x.length||!y.length)continue;
      const last=x[x.length-1],first=y[0],h1=flat(last,{x:0,y:0}),h2=flat(first,{x:0,y:0}),saving=h1+h2-flat(last,first);
      if(Math.min(h1,h2)>=55&&(!expected||saving>expected.saving))expected={night:'Nuit '+days[i]+' → '+days[i+1],saving};
    }
    const want=expected&&expected.saving>=threshold?expected.night:null;
    const got=C.analyze(p).candidate;
    assert.equal(got?got.night:null,want,'Automatique doit rester la règle historique (cas '+t+')');
    checked++;if(want)proposed++;
  }
  assert(checked>300&&proposed>20,'l’oracle doit couvrir des propositions et des refus');
  state.settings.days=FIVE.slice();state.profile.overnightMinSaving=80;
}

/* ── 4. Obligatoire + remoteKm < 55 + économie ≥ 20 → découché accepté ──────────────── */
state.profile.overnightMode='mandatory';
a=C.analyze(plan({Lundi:[at('l0',5),CLOSE[0]],Mardi:[CLOSE[1],at('m1',6)]}));
assert.equal(a.reason,'candidate','Obligatoire : la demande explicite passe outre les 55 km');
assert.equal(a.candidate.night,'Nuit Lundi → Mardi');
assert.equal(Math.round(a.candidate.saving),80);
assert.equal(Math.round(a.candidate.remoteKm),40);
assert(a.candidate.remoteKm<55);

/* ── 5. Obligatoire + économie < 20 → refusé, proche ou lointain ────────────────────── */
a=C.analyze(plan({Lundi:[LOCAL[0]],Mardi:[LOCAL[1]]}));
premise(a.best,r=>r<55,s=>s<20);
assert.equal(a.candidate,null,'Obligatoire ne force jamais une nuit qui n’économise pas 20 km');
assert.equal(a.reason,'mandatory-no-useful');
a=C.analyze(plan({Lundi:[OPPOSITE[0]],Mardi:[OPPOSITE[1]]}));
premise(a.best,r=>r>=55,s=>s<20);
assert.equal(a.candidate,null,'être loin ne suffit pas : il faut 20 km économisés');
assert.equal(a.reason,'mandatory-no-useful');
a=C.analyze(plan({Lundi:[at('edge-a',9.9)],Mardi:[at('edge-b',30)]}));
assert(a.best.saving<20);assert.equal(a.candidate,null,'19,8 km économisés restent sous le gain utile');
a=C.analyze(plan({Lundi:[at('edge-a',10)],Mardi:[at('edge-b',30)]}));
assert.equal(Math.round(a.best.saving),20);assert.equal(a.reason,'candidate','20 km économisés suffisent');

/* ── 6. Obligatoire choisit la meilleure paire de journées consécutives ─────────────── */
a=C.analyze(plan({
  Lundi:[LOCAL[0]],Mardi:[LOCAL[1]],                       // 16 km : sous le gain utile
  Mercredi:[at('w0',3),CLOSE[0]],Jeudi:[CLOSE[1]],          // 80 km, zone proche
  Vendredi:[FAR_SMALL[1]]                                   // Jeudi → Vendredi : peu de gain
}));
assert.equal(a.candidate.night,'Nuit Mercredi → Jeudi','la paire la plus rentable l’emporte');
state.profile.overnightMinSaving=0;
a=C.analyze(plan({Lundi:[CLOSE[0]],Mardi:[CLOSE[1]],Jeudi:[FAR_SMALL[0]],Vendredi:[FAR_SMALL[1]]}));
assert.equal(a.candidate.night,'Nuit Lundi → Mardi','Obligatoire compare les économies, pas la distance au domicile');
state.profile.overnightMinSaving=80;
// Mercredi non travaillé : Mardi → Jeudi n'est pas une nuit, quelle que soit l'économie.
state.settings.days=['Lundi','Mardi','Jeudi','Vendredi'];
a=C.analyze(plan({Lundi:[LOCAL[0]],Mardi:[FAR_BIG[0]],Jeudi:[FAR_BIG[1]],Vendredi:[at('v0',-80)]}));
assert.notEqual(a.candidate&&a.candidate.night,'Nuit Mardi → Jeudi','deux jours séparés par un jour off ne font pas une nuit');
assert.equal(a.candidate,null,'aucune paire consécutive n’économise 20 km');
state.settings.days=FIVE.slice();
// L'analyse est une décision : elle ne touche ni au planning ni aux réservations.
{
  const p=plan({Lundi:[CLOSE[0]],Mardi:[CLOSE[1]]}),before=JSON.stringify(p),stateBefore=JSON.stringify(state);
  C.analyze(p);
  assert.equal(JSON.stringify(p),before,'l’analyse ne modifie pas le planning');
  assert.equal(JSON.stringify(state),stateBefore,'l’analyse n’écrit pas dans state');
}

/* ── 7. Jamais → aucun découché, même avec la meilleure paire possible ──────────────── */
state.profile.overnightMode='never';
for(const rows of [{Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]},{Lundi:[CLOSE[0]],Mardi:[CLOSE[1]]}]){
  a=C.analyze(plan(rows));
  assert.equal(a.candidate,null,'Jamais ne propose aucune nuit');
  assert.equal(a.reason,'disabled');
}

/* ── Copie V185 (v182-fixes.js) : rapport 3 semaines et statut de génération ────────
   Elle doit donner la même décision que futureOvernightAnalysis. */
{
  const L=loadLegacy();
  const same=(label,rows)=>{
    for(const mode of ['auto','mandatory','never']){
      for(const threshold of [0,20,80]){
        L.state.profile.overnightMode=mode;L.state.profile.overnightMinSaving=threshold;
        state.profile.overnightMode=mode;state.profile.overnightMinSaving=threshold;
        const x=L.analyze(plan(rows)),y=C.analyze(plan(rows));
        assert.equal(x.reason,y.reason,label+' / '+mode+' / '+threshold+' : même motif');
        assert.equal(x.candidate?x.candidate.night:null,y.candidate?y.candidate.night:null,label+' / '+mode+' / '+threshold+' : même nuit');
      }
    }
  };
  same('proche utile',{Lundi:[CLOSE[0]],Mardi:[CLOSE[1]]});
  same('proche inutile',{Lundi:[LOCAL[0]],Mardi:[LOCAL[1]]});
  same('éloignée',{Lundi:[FAR_BIG[0]],Mardi:[FAR_BIG[1]]});
  same('opposée',{Lundi:[OPPOSITE[0]],Mardi:[OPPOSITE[1]]});
  same('proche contre lointaine',{Lundi:[CLOSE[0]],Mardi:[CLOSE[1]],Jeudi:[FAR_SMALL[0]],Vendredi:[FAR_SMALL[1]]});
  // Jour off au milieu : la copie V185 ne relie plus Mardi à Jeudi en Obligatoire.
  L.state.settings.days=['Lundi','Mardi','Jeudi','Vendredi'];
  L.state.profile.overnightMode='mandatory';
  const legacy=L.analyze(plan({Lundi:[LOCAL[0]],Mardi:[FAR_BIG[0]],Jeudi:[FAR_BIG[1]]}));
  assert.equal(legacy.candidate,null,'la copie V185 ne propose pas de nuit entre deux jours non consécutifs');
  assert.equal(legacy.reason,'mandatory-no-useful');
  L.state.settings.days=FIVE.slice();
  L.state.profile.overnightMode='mandatory';
  const src=read('v182-fixes.js');
  assert(src.includes('V185_REMOTE_MIN_KM=55')&&src.includes('V185_MANDATORY_MIN_SAVING_KM=20'),'les deux seuils V185 restent déclarés');
  assert(!/bloc géographique éloigné/.test(src),'le message Obligatoire ne promet plus une zone éloignée');
}
state.profile.overnightMode='mandatory';state.profile.overnightMinSaving=80;
const controlsSource=read('auto-planning-fix.js');
assert(controlsSource.includes('const REMOTE_MIN_KM=55;'),'Automatique garde 55 km');
assert(controlsSource.includes('const MIN_USEFUL_OVERNIGHT_KM=20;'),'le gain utile reste 20 km');
assert(controlsSource.includes('Number.isFinite(n)&&n>=0?n:80'),'le seuil Automatique par défaut reste 80 km');

/* ── Cas terrain, vraies distances (haversine de l'application) ─────────────────────
   Base type Lyon ; lundi finit à ~39 km, mardi reprend à ~52 km, 13 km entre les deux. */
{
  const rad=d=>d*Math.PI/180;
  const hav=(p,q)=>{const R=6371,dla=rad(Number(q.lat)-Number(p.lat)),dlo=rad(Number(q.lon)-Number(p.lon)),x=Math.sin(dla/2)**2+Math.cos(rad(Number(p.lat)))*Math.cos(rad(Number(q.lat)))*Math.sin(dlo/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))};
  const T=loadControls(hav,{baseObj(){return{lat:45.7640,lon:4.8357}}});
  const monday=[{id:'t1',enseigne:'Enseigne T1',ville:'Ville-Test Est',lat:45.5860,lon:5.2740}];
  const tuesday=[{id:'t2',enseigne:'Enseigne T2',ville:'Ville-Test Plateau',lat:45.5660,lon:5.4440}];
  T.state.profile.overnightMode='auto';
  let r=T.analyze(plan({Lundi:monday,Mardi:tuesday}));
  assert.equal(r.reason,'too-close','Automatique : 39 km du domicile, pas de nuit');
  T.state.profile.overnightMode='mandatory';
  r=T.analyze(plan({Lundi:monday,Mardi:tuesday}));
  assert.equal(r.reason,'candidate','Obligatoire : la nuit est retenue');
  assert.equal(Math.round(r.candidate.remoteKm),39);
  assert.equal(Math.round(r.candidate.saving),78);
}

/* ── 8. Le lendemain d'un découché Obligatoire : origine protégée ──────────────────── */
(async()=>{
  let D_saved=0;
  const D=loadControls(flat,{save(){D_saved++}});
  const S=D.state,origin=D.ctx.StoreRunnerDayOrigin;
  S.profile.overnightMode='mandatory';
  S.plan=plan({Lundi:[at('l0',5),CLOSE[0]],Mardi:[CLOSE[1],at('m1',6)]});
  const cand=D.ctx.StoreRunnerStoreControlsV189.futureOvernightAnalysis().candidate;
  assert(cand&&cand.remoteKm<55,'la nuit Obligatoire proche est proposée à l’écran');
  assert.equal(D.ctx.StoreRunnerStoreControlsV189.renderOvernight(),true);
  assert.match(D.ctx.__elements.overnightBox.innerHTML,/Nuit sur place/);
  assert.match(D.ctx.__elements.overnightBox.innerHTML,/Ville-Test close-a/,'la zone hôtel conseillée est la fin de tournée');
  assert.equal(origin.originFor(cand.toDate,S).type,'base','sans réservation, le lendemain part de la base (rien n’est supposé)');
  assert.equal(origin.originFor(cand.toDate,S).pending,false);

  // a) Hôtel réservé sans adresse : aucune position inventée, la question est posée.
  const els=D.ctx.__elements;
  els.srHotelNameV212={value:'Hôtel Test'};els.srHotelRefV212={value:'R-1'};els.srHotelAddressV212={value:''};
  assert.equal(await D.ctx.storeRunnerSaveHotelReservation(cand.fromDate),true);
  const saved=S.hotelReservations[cand.fromDate];
  assert.equal(saved.toDate,cand.toDate,'la réservation porte le lendemain de la nuit Obligatoire');
  assert.equal(saved.zone,'Ville-Test close-a');
  assert.equal(saved.lat,null,'aucune latitude d’hôtel inventée');
  assert.equal(saved.lon,null,'aucune longitude d’hôtel inventée');
  let next=origin.originFor(cand.toDate,S);
  assert.equal(next.pending,true,'découché sans hôtel localisé : on demande, pas de retour muet au domicile');
  assert.equal(next.nightDate,cand.fromDate);
  assert.equal(origin.baseFor(cand.toDate,S).originPending,true,'l’ordonnanceur voit que le départ est à confirmer');
  assert.equal(origin.originFor(cand.fromDate,S).pending,false,'le jour du découché lui-même part de la base');
  assert.match(els.overnightBox.innerHTML,/demandera d’où vous partez le lendemain/);

  // b) Adresse non trouvée : toujours aucune position, toujours la question.
  let toast='';D.ctx.storeRunnerToast=m=>{toast=m};
  D.ctx.StoreRunnerGeocode={forward(){return Promise.reject(new Error('introuvable'))}};
  els.srHotelAddressV212={value:'Adresse inconnue'};
  assert.equal(await D.ctx.storeRunnerSaveHotelReservation(cand.fromDate),true);
  assert.equal(S.hotelReservations[cand.fromDate].lat,null);
  assert.equal(origin.originFor(cand.toDate,S).pending,true);
  assert.match(toast,/départ du lendemain sera demandé/);

  // c) Hôtel localisé : le lendemain part de l'hôtel, pas du domicile.
  D.ctx.StoreRunnerGeocode={forward(){return Promise.resolve({lat:45.5,lon:5.6,address:'Hôtel Test, Ville-Test'})}};
  els.srHotelAddressV212={value:'1 rue de l’Hôtel'};
  assert.equal(await D.ctx.storeRunnerSaveHotelReservation(cand.fromDate),true);
  next=origin.originFor(cand.toDate,S);
  assert.equal(next.type,'hotel');
  assert.equal(next.pending,false);
  assert.equal(next.lat,45.5);assert.equal(next.lon,5.6);
  assert.match(els.overnightBox.innerHTML,/Le lendemain démarrera depuis cet hôtel/);
  const dayAfter=new Date(cand.toDate+'T12:00:00');dayAfter.setDate(dayAfter.getDate()+1);
  const iso=dayAfter.getFullYear()+'-'+String(dayAfter.getMonth()+1).padStart(2,'0')+'-'+String(dayAfter.getDate()).padStart(2,'0');
  assert.equal(origin.originFor(iso,S).type,'base','le surlendemain revient à la base');
  assert(D_saved>=3,'chaque réservation est sauvegardée');

  // d) Passage en Jamais : l'écran ne propose plus de nuit, la réservation déjà saisie
  //    (donnée utilisateur) reste et continue de fixer l'origine du lendemain.
  S.profile.overnightMode='never';
  assert.equal(D.ctx.StoreRunnerStoreControlsV189.futureOvernightAnalysis().candidate,null);
  D.ctx.StoreRunnerStoreControlsV189.renderOvernight();
  assert.match(els.overnightBox.innerHTML,/Découché désactivé/);
  assert.equal(origin.originFor(cand.toDate,S).type,'hotel');

  console.log('mandatory overnight V263.4 : 8 scénarios OK');
})().catch(e=>{console.error(e);process.exit(1)});
