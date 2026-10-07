const assert=require('assert/strict');
const fs=require('fs');
/* Explorer Terrain V1 — store-explorer.js : lecture seule, contraintes citées avec leur propriétaire,
   frise, filtres P1/P2/P3 et statuts. Aucune donnée n'est écrite, aucun second registre n'existe. */
globalThis.StoreRunnerVisitCoverage=require('../visit-coverage.js');
globalThis.StoreRunnerManualHours=require('../planning-manual-hours.js');
const X=require('../store-explorer.js');
const TODAY='2026-10-07'; // mercredi
const stores=[
  {id:'a',enseigne:'Darty',ville:'Lyon',freq:'Mensuel',active:true,priority:3},
  {id:'b',enseigne:'Boulanger',ville:'Valence',freq:'Hebdo',active:true,priority:3},
  {id:'c',enseigne:'Fnac',ville:'Grenoble',freq:'Mensuel',active:true,priority:3},
  {id:'d',enseigne:'Electro <b>Dépôt</b>',ville:'Annecy',freq:'Mensuel',active:false,priority:3},
  {id:'e',enseigne:'Conforama',ville:'Bourg',freq:'Mensuel',active:true,priority:3},
  {id:'x"><img src=x onerror=alert(1)>',enseigne:'Piège',ville:'Test',freq:'Mensuel',active:true,priority:3}
];
const state={
  stores,
  visits:{a:{lastVisit:'2026-10-05',history:['2026-10-05']},b:{lastVisit:'2026-08-01',history:['2026-08-01']},e:{lastVisit:'2026-09-20',history:['2026-09-20']}},
  notes:{a:'PLV à revoir'},
  included:{c:true},excluded:{e:true},
  locks:{a:{day:'Jeudi',week:'2026-10-05'},b:'Jeudi',c:{day:'Lundi',week:'2026-09-28'}},
  appointments:[
    {id:'r1',storeId:'a',date:'2026-10-13',time:'14:00',duration:60,type:'Formation',note:'Équipe complète'},
    {id:'h1',storeId:'a',date:'2026-10-08',time:'09:30',duration:45,type:'Horaire manuel',manualHours:true},
    {id:'h2',storeId:'b',date:'2026-10-08',time:'10:00',duration:45,type:'Horaire manuel',manualHours:true,arrivalMode:'flexible'},
    {id:'r0',storeId:'a',date:'2026-09-01',time:'10:00',duration:60,type:'Point',note:''}
  ],
  storeContacts:{a:[{name:'Marie',role:'Responsable',email:'marie@example.com'},{name:'',role:'',email:''}]},
  businessV2:{version:2,revision:0,storeSnapshots:{},
    visits:[
      {id:'v1',storeId:'a',status:'completed',completedDate:'2026-10-05',createdAt:'2026-10-05T10:00:00Z',activeFamily:'blanc',conclusion:'Très bonne visite, PLV posée.'},
      {id:'v2',storeId:'b',status:'draft',createdAt:'2026-10-06T10:00:00Z'}
    ],
    actions:[
      {id:'x1',storeId:'a',visitId:'v1',status:'open',description:'Commander des affichettes',dueDate:'2026-10-20',createdAt:'2026-10-05T11:00:00Z'},
      {id:'x2',storeId:'a',visitId:'v1',status:'done',description:'Ranger',createdAt:'2026-10-05T11:05:00Z'}
    ],
    opportunities:[{id:'o1',storeId:'a',visitId:'v1',status:'open',description:'Gain de linéaire TV',createdAt:'2026-10-05T12:00:00Z'}]}
};
const archive={'2026-10-05':{weekMonday:'2026-10-05',plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[{id:'a'},{id:'b'}],Vendredi:[],Samedi:[]}}};
const priorities=new Map([['a','P1'],['b','P2']]);
const opts={today:TODAY,archive,priorities};
const frozen=JSON.stringify(state);

// --- Contraintes : nature, force, propriétaire --------------------------------------------------
const kinds=id=>X.constraintsFor(state,id,opts).map(c=>c.kind);
const a=X.constraintsFor(state,'a',opts);
assert.deepEqual(a.map(c=>c.kind),['lock_dated','arrival','appointment','second_visit'],'pose manuelle, arrivée imposée, rendez-vous (triés par date), puis 2e passage P1 (la garde cède sous 2 visites)');
assert.equal(a[0].strength,'hard');assert.equal(a[0].source,'locks');assert.equal(a[0].date,'2026-10-08');assert.match(a[0].title,/Pose manuelle/);
assert.equal(a[1].mode,'strict','une entrée « Horaire manuel » existante est lue « strict », sans migration');
assert.match(a[1].title,/Arrivée imposée 09:30/);assert.match(a[1].detail,/^Strict/);
assert.equal(a[1].appointmentId,'h1');assert.equal(a[2].appointmentId,'r1');
assert.equal(a[3].strength,'soft');assert.match(a[3].title,/2e passage P1/);
// Même magasin sans priorité P1 : la garde de couverture s'applique (visité le 05/10, mensuel : jusqu'à la moitié du cycle, 15 j).
const guarded=X.constraintsFor(state,'a',{today:TODAY,archive,priorities:new Map()}).find(c=>c.kind==='guard');
assert.ok(guarded&&guarded.strength==='soft');assert.equal(guarded.date,'2026-10-20');assert.match(guarded.detail,/avant le/);
assert.ok(!a.some(c=>c.appointmentId==='r0'),'un rendez-vous passé n’est plus une contrainte active');
const b=X.constraintsFor(state,'b',opts);
assert.deepEqual(b.map(c=>c.kind),['lock_recurring','arrival']);
assert.equal(b[0].day,'Jeudi');assert.match(b[0].title,/Posé tous les jeudis/);
assert.equal(b[1].mode,'flexible');assert.match(b[1].detail,/appliquée comme stricte/,'flexible est lu mais annoncé honnêtement : le moteur ne le distingue pas encore');
assert.deepEqual(kinds('c'),['included'],'une pose datée d’une semaine passée est expirée ; Imposé reste actif');
assert.deepEqual(kinds('d'),['inactive']);
assert.deepEqual(kinds('e'),['excluded']);
assert.deepEqual(X.constraintsFor(state,'zzz',opts),[]);

// --- Frise : à venir croissant, historique décroissant, rien d'inventé -------------------------------
const tl=X.timelineFor(state,'a',opts);
assert.deepEqual(tl.upcoming.map(e=>e.kind+':'+e.date),['planned:2026-10-08','arrival:2026-10-08','appointment:2026-10-13']);
assert.deepEqual(tl.past.map(e=>e.kind),['visit','action','action','opportunity','appointment']);
assert.equal(tl.past[0].visitId,'v1');assert.match(tl.past[0].detail,/Blanc · Très bonne visite/);
assert.ok(!tl.past.some(e=>e.kind==='visit_marked'),'le jour coché et la visite 6P du même jour ne font qu’un événement');
assert.equal(tl.past.find(e=>e.kind==='appointment').date,'2026-09-01');
const tb=X.timelineFor(state,'b',opts);
assert.ok(tb.past.some(e=>e.kind==='visit_marked'&&e.date==='2026-08-01'),'une visite seulement cochée apparaît comme telle');
assert.ok(tb.past.some(e=>e.kind==='visit_draft'&&e.visitId==='v2'),'un brouillon de visite est signalé');
const merged=X.mergePhotos(tl,[{createdAt:'2026-10-05T12:30:00Z'},{createdAt:'2026-10-05T13:00:00Z'},{createdAt:'2026-09-30T12:00:00Z'},{createdAt:'n’importe quoi'}]);
const photos=merged.past.filter(e=>e.kind==='photos');
assert.deepEqual(photos.map(e=>e.date+':'+e.title),['2026-10-05:2 photos','2026-09-30:1 photo']);
assert.deepEqual(merged.upcoming,tl.upcoming);
assert.ok(merged.past.map(e=>e.date).every((d,i,all)=>!i||all[i-1]>=d),'l’historique reste trié du plus récent au plus ancien');

// --- Fiche 360 -------------------------------------------------------------------------------------------
const p=X.profileFor(state,'a',opts);
assert.equal(p.cadence.label,'Mensuel');assert.equal(p.cadence.intervalDays,30);
assert.equal(p.lastVisit,'2026-10-05');assert.equal(p.priority,'P1');
assert.deepEqual(p.nextVisit,{date:'2026-10-08',kind:'planned'});
assert.equal(p.nextDue,'2026-11-04');
assert.deepEqual(p.nextAppointment,{date:'2026-10-13',time:'14:00',type:'Formation',id:'r1'},'le rendez-vous « Horaire manuel » n’est pas un rendez-vous client');
assert.equal(p.contacts.length,1);assert.equal(p.contacts[0].email,'marie@example.com');
assert.equal(p.note,'PLV à revoir');assert.equal(p.openActions,1);assert.equal(p.openOpportunities,1);
assert.equal(X.profileFor(state,'jamais',opts),null);
const html=X.sectionHtml(p,{photoCount:3});
assert.match(html,/Contraintes actives/);assert.match(html,/data-sr-x-plan="2026-10-08"/);assert.match(html,/data-sr-x-visit="v1"/);assert.match(html,/data-sr-x-pilotage="ok"/);assert.match(html,/3 photos/);
assert.ok(!/<script|onerror=/i.test(X.sectionHtml(X.profileFor(state,'x"><img src=x onerror=alert(1)>',opts),{})),'aucune donnée magasin n’est injectée en HTML brut');
const quiet=X.sectionHtml(X.profileFor(state,'d',opts),{});
assert.match(quiet,/Désactivé du secteur/);
assert.match(X.sectionHtml(X.profileFor(state,stores[5].id,opts),{}),/Aucune contrainte/);
const futureState=JSON.parse(JSON.stringify(state));futureState.stores=[{id:'future',enseigne:'Darty',ville:'Horizon',freq:'Mensuel',active:true,priority:3}];futureState.visits={future:{lastVisit:'2026-09-16',history:['2026-09-16']}};futureState.appointments=[];futureState.locks={};futureState.included={};futureState.excluded={};futureState.businessV2={version:2,visits:[],actions:[],opportunities:[]};
const future=X.profileFor(futureState,'future',{today:TODAY,archive:{},priorities:new Map()});
assert.equal(future.forecast.forecastWeek,2);assert.equal(future.forecast.forecastInDays,9);
assert.match(X.sectionHtml(future,{}),/À jour · deviendra en retard dans 9 jours/,'la fiche 360 lit le forecast du propriétaire couverture');
assert.match(X.sectionHtml(X.profileFor(state,'b',opts),{}),/En retard depuis \d+ jours/);

// --- Mes magasins : filtres P1 / P2 / P3, à visiter, en retard ------------------------------------------------
const lc=X.listContext(Object.assign({state},opts));
const pick=()=>stores.filter(s=>X.matches(s,lc)).map(s=>s.id).filter(id=>id.length===1);
X.resetFilters();Object.assign(lc.filter,X.filter);
assert.deepEqual(pick(),['a','b','c','d','e']);
const set=(priority,status)=>{X.filter.priority=priority;X.filter.status=status;lc.filter={priority,status}};
set('P1','all');assert.deepEqual(pick(),['a']);
set('P2','all');assert.deepEqual(pick(),['b']);
set('P3','all');assert.deepEqual(pick(),['c','d','e'],'P3 = ni P1 ni P2 du fichier performance');
set('all','todo');assert.deepEqual(pick(),['b','c','d'],'À visiter = jamais visité, en retard ou à revoir bientôt');
set('all','late');assert.deepEqual(pick(),['b']);
set('all','never');assert.deepEqual(pick(),['c','d']);
set('all','watch');assert.deepEqual(pick(),['b','c'],'vue 3 semaines : le forecast exclut les magasins désactivés ou exclus du planning');
set('P3','todo');assert.deepEqual(pick(),['c','d']);
X.resetFilters();
const counts=X.counts(lc.ctx);
assert.deepEqual(counts.status,{all:4,watch:3,todo:3,late:1,never:2},'a, b, c et le magasin piège : les désactivés (d) et exclus (e) ne comptent pas');
assert.deepEqual(counts.priority,{all:4,P1:1,P2:1,P3:2});
const row=X.rowHtml(stores[1],lc);
assert.match(row,/En retard/);assert.match(row,/P2/);assert.match(row,/Dernière .*il y a 67 j/);assert.match(row,/Prochaine/);assert.match(row,/1 contrainte|2 contraintes/);assert.match(row,/data-sr-store-360="b"/);
assert.match(X.rowHtml(stores[2],lc),/Jamais visité/);assert.match(X.rowHtml(stores[2],lc),/À planifier/);
assert.ok(!X.rowHtml(stores[5],lc).includes('x"><img'),'l’identifiant magasin est échappé dans les attributs');
const sorted=X.listContext(Object.assign({state},opts));X.filter.status='todo';const sorted2=X.listContext(Object.assign({state},opts));
assert.equal(sorted.compare,null,'sans filtre de statut, l’ordre alphabétique du noyau est conservé');
assert.equal(typeof sorted2.compare,'function');X.resetFilters();

// --- Priorité du parc : un P1/P2 « traité » reste P1/P2 dans Mes magasins ---------------------------------------
{
  const C=globalThis.StoreRunnerVisitCoverage,saved={db:globalThis.__chefStorage,perf:globalThis.StoreRunnerPerformanceV190};
  globalThis.__chefStorage={getItem(){return null}};
  globalThis.StoreRunnerPerformanceV190={
    latestSnapshot:()=>({week:'2026-W41',rows:[{storeId:'a',prio:'P1'},{storeId:'b',prio:'P2'}]}),
    matchRows:rows=>({rows}),readStore:()=>({mapping:{}}),
    isTreated:(db,week,id)=>String(id)==='a'
  };
  try{
    assert.deepEqual([...C.performancePriorities(state)],[['a','P1'],['b','P2']],'la priorité est stable : « traité » n’en sort pas (voir p1-treated-priority-v266)');
    const o={today:TODAY,archive};
    assert.equal(C.need(state,stores[0],{today:TODAY}).priority,'P1','les moteurs lisent la même priorité que Mes magasins');
    const p=X.profileFor(state,'a',o);
    assert.equal(p.priority,'P1','fiche : un P1 traité reste P1');
    const lc=X.listContext(Object.assign({state},o));
    const set2=(priority,status)=>{X.filter.priority=priority;X.filter.status=status;lc.filter={priority,status}};
    set2('P1','all');assert.deepEqual(stores.filter(x=>X.matches(x,lc)).map(x=>x.id),['a'],'le filtre P1 garde le P1 traité');
    set2('P3','all');assert.ok(!stores.some(x=>x.id==='a'&&X.matches(x,lc)),'un P1 traité n’est jamais « P3 / autres »');
    X.resetFilters();
    assert.match(X.rowHtml(stores[0],lc),/srXp">P1</,'la ligne affiche P1');
    assert.equal(X.counts(lc.ctx).priority.P1,1);
  }finally{globalThis.__chefStorage=saved.db;globalThis.StoreRunnerPerformanceV190=saved.perf;if(saved.db===undefined)delete globalThis.__chefStorage;if(saved.perf===undefined)delete globalThis.StoreRunnerPerformanceV190}
}



/* --- Fiche Cuisiniste : contrat à son propriétaire, un seul rapport, contacts/photos/horaires ------------------ */
{
  const cuisineStore={id:'k',enseigne:'Schmidt',ville:'Cuisine-Test',channel:'cuisiniste',freq:'Mensuel',active:true,priority:2,products:['Encastrable']};
  const cuisineState={
    stores:[cuisineStore],visits:{},notes:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[],
    storeContacts:{k:[{name:'Nadia',role:'Responsable showroom',email:'nadia@example.test'}]},
    businessV2:{version:2,visits:[
      {id:'old-k',storeId:'k',status:'completed',completedDate:'2026-09-01',completedAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z',activeFamily:'blanc',conclusion:'Ancien rapport à ne pas afficher',report:{shared:{context:'Ancien contexte'},blanc:{team:'Ancienne note'},brun:{}}},
      {id:'new-k',storeId:'k',status:'completed',completedDate:'2026-10-06',completedAt:'2026-10-06T12:00:00Z',updatedAt:'2026-10-06T12:00:00Z',activeFamily:'brun',conclusion:'Showroom revu avec la responsable',report:{
        shared:{context:'Nouvelle exposition en place'},
        blanc:{team:'Retour encastrable à suivre',training:'Prévoir une formation'},
        brun:{team:'Retour encastrable à suivre',massification:'Four et micro-ondes bien exposés'}
      }}
    ],actions:[],opportunities:[]}
  };
  const cp=X.profileFor(cuisineState,'k',{today:TODAY,archive:{},priorities:new Map(),forecast:false});
  assert.equal(cp.cuisiniste,true);
  assert.equal(cp.latestReport.visitId,'new-k');
  assert.equal(cp.latestReport.fields.find(x=>x.key==='team').text,'Retour encastrable à suivre','les doublons des anciennes familles sont fusionnés sans étiquette BRUN/BLANC');
  const ch=X.sectionHtml(cp,{photoCount:4});
  assert.match(ch,/Fiche Cuisiniste/);
  assert.match(ch,/Contacts/);assert.match(ch,/Nadia/);
  assert.match(ch,/Rapport magasin/);assert.match(ch,/Showroom revu avec la responsable/);assert.match(ch,/Four et micro-ondes bien exposés/);
  assert.doesNotMatch(ch,/Ancien rapport à ne pas afficher/,'un seul rapport : le dernier passage uniquement');
  assert.doesNotMatch(ch,/\bBlanc\b|\bBrun\b|BRUN|BLANC/,'aucune famille BRUN/BLANC dans la fiche Cuisiniste');
  assert.match(ch,/4 photos/);assert.match(ch,/data-sr-x-hours="1"/);
  assert.doesNotMatch(ch,/Cadence|Contraintes actives|Frise du magasin/,'la fiche Cuisiniste ne reprend pas le tableau 360 Retail');
  const clc=X.listContext({state:cuisineState,today:TODAY,archive:{},priorities:new Map(),forecast:false});
  assert.match(X.rowHtml(cuisineStore,clc),/Fiche Cuisiniste/);
}

// --- Aucune écriture, aucun second propriétaire -----------------------------------------------------------------------
assert.equal(JSON.stringify(state),frozen,'lire ne modifie jamais state');
const src=fs.readFileSync(__dirname+'/../store-explorer.js','utf8');
assert.doesNotMatch(src,/setItem\(|removeItem\(|localStorage\.[sr]|\bsave\(|state\.[A-Za-z]+(?:\[[^\]]+\])?\s*=[^=]/,'le module n’écrit ni state ni stockage');
assert.doesNotMatch(src,/setInterval\(|visibilitychange|addEventListener\(['"](?:focus|load)['"]/,'rafraîchissement événementiel uniquement');
assert.doesNotMatch(src,/window\.renderStores\s*=|window\.openStoreQuick\s*=|window\.generateWeek\s*=/,'aucune fonction globale d’un autre propriétaire n’est reprise');
assert.match(src,/StoreRunnerPeriodDaySlider\.openDate/,'navigation vers une date via le propriétaire de la navigation');
assert.match(src,/StorePhotosV1/);assert.match(src,/StoreRunnerVisits\.openVisit/);
const html5=fs.readFileSync(__dirname+'/../index.html','utf8'),sw=fs.readFileSync(__dirname+'/../sw.js','utf8');
assert.ok(html5.includes("'./store-explorer.js'")&&sw.includes('"./store-explorer.js"'),'chargé au démarrage et mis en cache hors ligne');
console.log('store-explorer-v266: OK');
