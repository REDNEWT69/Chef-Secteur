/* V245 — Mode terrain contextuel et compteurs cohérents.

   1. Une seule source des compteurs : StoreRunnerActivityMetrics (visit-counting.js).
      magasins planifiés ≠ crédits de visite ≠ visites réalisées, et settings.target est
      un objectif de MAGASINS (le moteur compare flattenPlan(plan).length à target).
   2. La tournée du jour (todayTour) alimente la carte noire de l'accueil, qui réutilise
      le workflow terrain existant au lieu d'en créer un second.

   Fixtures synthétiques : enseignes réelles pour les règles de crédit, villes inventées. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const {StoreRunnerActivityMetrics:M}=require('../visit-counting.js');
const Home=require('../home-refresh-v2.js');

const NOW=new Date('2026-09-23T10:00:00'); // mercredi
const STORES=[
  {id:'b1',enseigne:'Boulanger',ville:'Ville-Test A',adresse:'1 avenue Alpha',lat:45.6,lon:5.9,active:true},
  {id:'d1',enseigne:'Darty',ville:'Ville-Test A',adresse:'2 rue Beta',lat:45.61,lon:5.91,active:true},
  {id:'s1',enseigne:'Enseigne Simple',ville:'Ville-Test B',adresse:'3 place Gamma',lat:45.7,lon:5.95,active:true},
  {id:'c1',enseigne:'Carrefour',ville:'Ville-Test C',adresse:'4 bd Delta',lat:45.5,lon:5.8,active:true,visitCreditOverride:2},
  {id:'x1',enseigne:'Enseigne Simple',ville:'Ville-Test D',active:false}
];
function baseState(){
  return{
    stores:JSON.parse(JSON.stringify(STORES)),
    settings:{target:15,weekDate:'2026-09-21'},
    plan:{Lundi:[{id:'c1'}],Mardi:[],Mercredi:[{id:'b1'},{id:'d1'},{id:'s1'}],Jeudi:[],Vendredi:[],Samedi:[]},
    visits:{},
    businessV2:{visits:[],actions:[],opportunities:[],storeSnapshots:{}}
  };
}
const complete=(st,storeId,date)=>st.businessV2.visits.push({id:'v-'+storeId+'-'+date,storeId,status:'completed',completedDate:date});

// ------------------------------------------------ 13–19. Compteurs, une seule source
{
  const st=baseState();
  // Un 6P terminé écrit aussi l'historique legacy du même jour : une seule visite.
  complete(st,'b1','2026-09-23');st.visits.b1={lastVisit:'2026-09-23',history:['2026-09-02','2026-09-23']};
  // « ✓ Visité » seul (historique legacy), autre jour de la semaine.
  st.visits.c1={lastVisit:'2026-09-21',history:['2026-09-21']};
  // Mois précédent : ni la semaine ni le mois.
  complete(st,'s1','2026-08-28');
  st.businessV2.actions=[{id:'a1',status:'todo',dueDate:'2026-09-01'},{id:'a2',status:'in_progress',dueDate:'2026-10-01'},{id:'a3',status:'done',dueDate:'2026-09-01'}];
  const m=M.compute(st,{now:NOW});
  assert.equal(m.plannedStoresWeek,4,'13. quatre passages physiques planifiés dans la semaine');
  assert.equal(m.plannedVisitCreditsWeek,7,'14. Boulanger x2 + Darty x2 + simple x1 + Carrefour réglé à 2 = sept crédits');
  assert.equal(m.completedVisitsToday,1,'15. une visite réalisée aujourd’hui, même si 6P et historique legacy la portent tous les deux');
  assert.equal(m.completedVisitsWeek,2,'16. lundi + mercredi dans la semaine en cours');
  assert.equal(m.completedVisitsMonth,3,'17. 2, 21 et 23 septembre');
  assert.equal(m.completedUniqueStoresMonth,2,'17. deux magasins distincts visités en septembre');
  assert.equal(m.completedVisitsTotal,4,'toutes les visites réalisées, août compris');
  assert.equal(m.activeStores,4,'18. un magasin inactif n’est pas un magasin actif');
  assert.equal(m.openActions,2);assert.equal(m.overdueActions,1);
  assert.notEqual(m.plannedStoresWeek,m.plannedVisitCreditsWeek,'19. magasins et crédits restent deux nombres distincts');
  assert.equal(m.target,15);assert.equal(m.targetUnit,'magasins','20. target est un objectif de magasins physiques');
  // Aucune mutation.
  const before=JSON.stringify(st);M.compute(st,{now:NOW});M.todayTour(st,{now:NOW});assert.equal(JSON.stringify(st),before,'les métriques ne modifient jamais les données');
  // Libellés sans ambiguïté.
  assert.equal(M.labels.credits(17),'17 crédits de visite');
  assert.equal(M.labels.plannedStores(10),'10 magasins planifiés');
  assert.equal(M.labels.completed(3,'aujourd’hui'),'3 visites réalisées aujourd’hui');
  assert.equal(M.labels.activeStores(58),'58 magasins actifs');
  assert.equal(M.labels.target(15),'objectif 15 magasins');
}

// ------------------------------------------ 20. settings.target : preuve dans le moteur
{
  const engine=read('terrain-planning-v1.js');
  assert.match(engine,/if\(flattenPlan\(plan,activeDays\)\.length>=target\)break;/,'le moteur ESCARGOT arrête la semaine au nombre de passages physiques, pas de crédits');
  assert.match(read('src/chef-secteur.html'),/<label>Nombre de magasins<\/label>\s*<input id="target"/,'le champ de réglage de target est libellé en magasins');
  for(const f of ['home-refresh-v2.js','visit-counting.js','src/chef-secteur.html'])assert.doesNotMatch(read(f),/objectif '\+[^;]{0,80}\+' visites/,f+' ne libelle plus l’objectif en visites');
}

// ---------------------------------------------------- 3, 4, 7, 8. Tournée du jour
{
  const st=baseState();
  let t=M.todayTour(st,{now:NOW});
  assert(t,'1. une tournée existe aujourd’hui');
  assert.equal(t.day,'Mercredi');assert.equal(t.total,3);assert.equal(t.index,0);
  assert.equal(t.current.id,'b1','3. le magasin courant est le premier non visité aujourd’hui');
  assert.equal(t.current.adresse,'1 avenue Alpha','le magasin courant est résolu sur state.stores');
  assert.equal(t.next.id,'d1');assert.equal(t.credits,5,'Boulanger x2 + Darty x2 + simple x1');
  // 7. Visite terminée (6P) → magasin suivant, sans rechargement.
  complete(st,'b1','2026-09-23');
  t=M.todayTour(st,{now:NOW});
  assert.equal(t.index,1,'4. visite 2 / 3');assert.equal(t.current.id,'d1','7. passage au magasin suivant');assert.equal(t.previous.id,'b1');
  assert.equal(t.done,1);assert.equal(t.remainingCredits,3);
  // « ✓ Visité » legacy compte aussi.
  st.visits.d1={lastVisit:'2026-09-23',history:['2026-09-23']};
  t=M.todayTour(st,{now:NOW});assert.equal(t.current.id,'s1');assert.equal(t.next,null,'dernier magasin : pas de suivant');
  // Une visite d'un autre jour ne coche pas le magasin aujourd’hui.
  st.visits.s1={lastVisit:'2026-09-16',history:['2026-09-16']};
  assert.equal(M.todayTour(st,{now:NOW}).current.id,'s1');
  // 8. Dernière visite → fin de tournée propre.
  complete(st,'s1','2026-09-23');
  t=M.todayTour(st,{now:NOW});
  assert.equal(t.finished,true);assert.equal(t.current,null);assert.equal(t.done,3);assert.equal(t.index,-1);
}
{
  // 2. Aucune visite aujourd’hui, dimanche, ou semaine affichée différente sans archive.
  const st=baseState();st.plan.Mercredi=[];
  assert.equal(M.todayTour(st,{now:NOW}),null,'2. pas de tournée aujourd’hui');
  assert.equal(M.todayTour(baseState(),{now:new Date('2026-09-27T10:00:00')}),null,'dimanche : pas de tournée');
  const other=baseState();other.settings.weekDate='2026-10-05';
  assert.equal(M.todayTour(other,{now:NOW}),null,'le planning affiché d’une autre semaine n’est pas la tournée du jour');
  // La semaine courante est relue dans l'archive quand le planning affiche une autre semaine.
  const archive={'2026-09-21':{weekMonday:'2026-09-21',plan:{Mercredi:[{id:'s1'},{id:'d1'}]}}};
  const t=M.todayTour(other,{now:NOW,archive:()=>archive});
  assert.equal(t.total,2);assert.equal(t.current.id,'s1');assert.equal(t.current.ville,'Ville-Test B');
  // Identifiants seuls dans le plan (copie partielle) : magasin canonique retrouvé.
  const ids=baseState();ids.plan.Mercredi=['d1'];
  assert.equal(M.todayTour(ids,{now:NOW}).current.enseigne,'Darty');
}

// -------------------------------------------- 1, 5, 6, 8. Carte noire de l'accueil
{
  const st=baseState();const tour=M.todayTour(st,{now:NOW});
  const html=Home.buildTerrainCard(tour,{distanceKm:73.4,dayKm:120.6,draft:false});
  assert.match(html,/class="phTerrain" data-home-terrain="active"/,'1. carte terrain présente');
  assert.match(html,/Mode Runner/);
  assert.match(html,/Mercredi · visite 1 \/ 3/,'4. visite X / Y');
  assert.match(html,/Boulanger Ville-Test A/,'3. magasin courant');
  assert.match(html,/1 avenue Alpha · ~73 km à vol d’oiseau/,'distance géographique annoncée comme telle');
  assert.match(html,/data-sr-start="b1">Démarrer le run</,'5. le CTA passe par le workflow 6P existant (data-sr-start → StoreRunnerVisits.start), libellé Runner V258');
  assert.match(html,/data-store-id="b1" onclick="openMapsStore\(this\.dataset\.storeId\)"/,'6. itinéraire sur le magasin courant via openMapsStore');
  assert.match(html,/Aujourd’hui : 0\/3 magasins faits · 5 crédits de visite · ~121 km estimés/,'résumé du jour depuis les métriques centrales');
  assert.match(html,/Prochaine : <b>Darty Ville-Test A<\/b>/);
  assert.match(html,/onclick="openTerrain\(\)"/,'accès au terrainPanel existant');
  assert.match(Home.buildTerrainCard(tour,{draft:true}),/Reprendre le run/,'une visite en brouillon se reprend (V258 : vocabulaire Runner)');
  assert.doesNotMatch(Home.buildTerrainCard(tour,{}),/km estimés|vol d’oiseau/,'sans calcul disponible, aucune distance inventée');
  complete(st,'b1','2026-09-23');complete(st,'d1','2026-09-23');complete(st,'s1','2026-09-23');
  const done=Home.buildTerrainCard(M.todayTour(st,{now:NOW}),{});
  assert.match(done,/data-home-terrain="done"/,'8. état de fin de tournée');
  assert.match(done,/tournée terminée/);assert.match(done,/3 \/ 3 magasins visités/);assert.match(done,/data-sr-hub/);
  assert.doesNotMatch(done,/data-sr-start/,'fin de tournée : plus de CTA de visite');
  assert.equal(Home.buildTerrainCard(null,{}),'','2. aucune tournée : aucune carte');
}

// ------------------------------------------------- 9–12, 21. Câblage et propriétaires
{
  const core=read('src/chef-secteur.html'),home=read('home-refresh-v2.js'),ui=read('planning-ui-fixes.js'),counting=read('visit-counting.js'),autofix=read('auto-planning-fix.js'),visits=read('store-runner-visits.js');
  assert.equal((core.match(/<section id="terrainPanel"/g)||[]).length,1,'12. un seul terrainPanel');
  assert.equal((core.match(/function terrainCurrent\(/g)||[]).length,1,'12. un seul moteur terrain');
  for(const [f,src] of [['home-refresh-v2.js',home],['planning-ui-fixes.js',ui],['visit-counting.js',counting]])assert.doesNotMatch(src,/function terrainCurrent|id="terrainPanel"/,f+' ne crée pas de second terrain');
  assert.match(visits,/else start\(b\.dataset\.srStart\)/,'5. data-sr-start reste câblé sur StoreRunnerVisits.start');
  assert.match(core,/function openTerrain\(day\)\{terrainFocusDay=/,'9. openTerrain cible un jour du planning');
  assert.match(core,/function switchTab\(id,btn\)\{if\(id!=='terrainPanel'&&typeof terrainFocusDay!=='undefined'\)terrainFocusDay='';/,'quitter le terrain efface le jour ciblé');
  assert.match(core,/while\(i<days\.length&&terrainDayISO\(days\[i\]\)<today\)i\+\+/,'sans jour ciblé, le terrain commence aujourd’hui et non lundi');
  assert.doesNotMatch(core.slice(core.indexOf('function terrainDayISO'),core.indexOf('function renderTerrain')),/dateForDay/,'le terrain ne dépend pas de dateForDay, hors de portée du noyau');
  assert.match(core,/var q=\(s\.adresse\|\|s\.address\|\|''\)\+' '\+\(s\.ville\|\|''\)/,'6. l’itinéraire lit le vrai champ adresse');
  assert.match(ui,/btn\.textContent='▶ Passer en mode terrain'/,'9. bouton planning');
  assert.match(ui,/window\.openTerrain\(btn\.dataset\.day\|\|''\)/,'9. le bouton planning ouvre le même terrainPanel');
  assert.match(ui,/if\(btn\.hidden!==!count\)btn\.hidden=!count;/,'10. jour sans visite : bouton masqué');
  assert.match(home,/<button data-go="terrainPanel" data-terrain-fallback>➤ Mode Runner<\/button>/,'11. accès de secours dans Plus');
  assert.doesNotMatch(home,/data-panel="terrainPanel"/,'le terrain n’est pas une destination principale de la barre mobile');
  assert.match(home,/'terrainDay','terrainStore'/,'7. l’accueil suit le rendu du terrainPanel pour passer au magasin suivant');
  // 21. Plus aucun écrivain concurrent des compteurs.
  assert.doesNotMatch(counting,/patchPremiumHome|patchLegacyBrief/,'21. visit-counting ne réécrit plus l’accueil ni le brief');
  assert.doesNotMatch(autofix,/textContent=physical\+|textContent=visits\+/,'21. auto-planning-fix ne recopie plus ses totaux');
  assert.doesNotMatch(home,/function plannedWeek|function completedWeek/,'21. l’accueil ne recompte plus les visites');
  assert.match(core,/StoreRunnerActivityMetrics\.summaryHtml\(state\)/,'le résumé planning du noyau lit la source unique');
  assert.match(core,/var m=StoreRunnerActivityMetrics\.compute\(state\)/,'l’historique lit la source unique');
}

// ---------------------------------------------------- Accueil : carte semaine
{
  const st=baseState();complete(st,'b1','2026-09-23');
  const cards=Home.buildActivityCards(st,{now:NOW,pilotage:{rows:[]},performance:{rows:[]},opportunities:[],recommended:null,appointment:null});
  const week=cards.find(c=>c.id==='week');
  /* V258 : dès qu'une visite est réalisée, elle passe au premier plan. */
  assert.equal(week.value,'1 visite réalisée');
  assert.equal(week.sub,'4 magasins planifiés · 7 crédits de visite · objectif 15 magasins');
}

console.log('terrain-activity-metrics-v245: OK · source unique des compteurs, target en magasins, tournée du jour, carte terrain, planning, Plus');
