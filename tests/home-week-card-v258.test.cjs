/* V258 — carte « Cette semaine » : le réalisé passe devant le planifié ; vocabulaire Runner.

   1. Le gros chiffre est `completedVisitsWeek` dès qu'une visite est terminée cette
      semaine ; magasins planifiés, crédits et objectif restent en information secondaire.
   2. Tous les nombres viennent de StoreRunnerActivityMetrics : l'accueil ne recompte rien.
   3. completedVisitsWeek = visites réellement TERMINÉES dans la semaine courante (lundi →
      dimanche), une visite 6P et son historique legacy du même jour comptant une seule fois.
   4. Mode Runner : « Démarrer le run » / « Reprendre le run », sans toucher au modèle.
   Fixtures 100 % synthétiques. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const {StoreRunnerActivityMetrics:M}=require('../visit-counting.js');
const Home=require('../home-refresh-v2.js');

const NOW=new Date('2026-09-23T10:00:00'); // mercredi ; semaine du lundi 21 au dimanche 27
const cards=st=>Home.buildActivityCards(st,{now:NOW,pilotage:{rows:[]},performance:{rows:[]},opportunities:[],recommended:null,appointment:null});
const week=st=>cards(st).find(c=>c.id==='week');
function stores(n,prefix,enseigne){return Array.from({length:n},(_,i)=>({id:prefix+i,enseigne,ville:'Ville-Test '+prefix+i,adresse:i+' rue Test',lat:45+i/100,lon:5,active:true}))}
function done(st,storeId,day,legacy=true){
  st.businessV2.visits.push({id:'v-'+storeId+'-'+day,storeId,status:'completed',completedDate:day,completedAt:day+'T11:00:00.000Z'});
  if(legacy){const h=st.visits[storeId]||(st.visits[storeId]={lastVisit:'',history:[]});if(!h.history.includes(day))h.history.push(day);h.history.sort();h.lastVisit=h.history[h.history.length-1]}
}
let n=0;const pass=m=>{n++;console.log('PASS '+n+' · '+m)};

/* ---------------------------------------- 1. l'exemple demandé, à l'identique */
{
  /* 12 magasins planifiés : 6 Darty (x2) + 6 enseignes simples = 18 crédits. */
  const list=stores(6,'d','Darty').concat(stores(6,'s','Enseigne Simple'));
  const st={stores:list,settings:{target:15,weekDate:'2026-09-21'},visits:{},businessV2:{visits:[],actions:[],opportunities:[],storeSnapshots:{}},
    plan:{Lundi:list.slice(0,3).map(s=>({id:s.id})),Mardi:list.slice(3,6).map(s=>({id:s.id})),Mercredi:list.slice(6,9).map(s=>({id:s.id})),Jeudi:list.slice(9,12).map(s=>({id:s.id})),Vendredi:[],Samedi:[]}};
  /* 17 visites réalisées lundi → mercredi, chacune écrite par le 6P ET par l'historique. */
  const days=['2026-09-21','2026-09-22','2026-09-23'];let k=0;
  for(const day of days)for(const s of list){if(k>=17)break;done(st,s.id,day);k++}
  const m=M.compute(st,{now:NOW});
  assert.equal(m.completedVisitsWeek,17);assert.equal(m.plannedStoresWeek,12);assert.equal(m.plannedVisitCreditsWeek,18);
  const w=week(st);
  assert.equal(w.label,'Cette semaine');
  assert.equal(w.value,'17 visites réalisées');
  assert.equal(w.sub,'12 magasins planifiés · 18 crédits de visite · objectif 15 magasins');
  pass('« 17 visites réalisées » en valeur principale, « 12 magasins planifiés · 18 crédits de visite · objectif 15 magasins » en dessous');
}

/* ------------------------------------------ 2. sans visite réalisée : inchangé */
{
  const list=stores(2,'s','Enseigne Simple');
  const st={stores:list,settings:{target:15},visits:{},businessV2:{visits:[],actions:[]},plan:{Lundi:[{id:'s0'},{id:'s1'}]}};
  const w=week(st);
  assert.equal(w.value,'2 magasins planifiés');assert.equal(w.sub,'2 crédits de visite · objectif 15 magasins');
  assert.doesNotMatch(w.sub,/0 visite/,'jamais « 0 visite réalisée »');
  /* Réalisé sans planning : le réalisé reste en tête, l'objectif dessous. */
  done(st,'s0','2026-09-22');st.plan={};
  const w2=week(st);assert.equal(w2.value,'1 visite réalisée');assert.equal(w2.sub,'objectif 15 magasins');
  /* Ni planning ni visite : l'objectif seul, sans doublon dans le sous-titre. */
  const empty={stores:list,settings:{target:15},visits:{},businessV2:{visits:[],actions:[]},plan:{}};
  const w3=week(empty);assert.equal(w3.value,'Objectif 15 magasins');assert.equal(w3.sub,'Suivi hebdomadaire');
  pass('sans visite réalisée : magasins planifiés en tête comme avant ; aucun planning : réalisé ou objectif, sans doublon');
}

/* ---------------------------- 3. completedVisitsWeek = terminées, semaine courante */
{
  const list=stores(6,'s','Enseigne Simple');
  const st={stores:list,settings:{},visits:{},businessV2:{visits:[],actions:[]},plan:{}};
  done(st,'s0','2026-09-21');                    // lundi : compte
  done(st,'s1','2026-09-27');                    // dimanche : compte
  done(st,'s2','2026-09-20');                    // dimanche précédent : hors semaine
  done(st,'s3','2026-09-28');                    // lundi suivant : hors semaine
  st.businessV2.visits.push({id:'draft',storeId:'s4',status:'draft',completedDate:null,completedAt:null}); // brouillon : ne compte pas
  /* Même magasin, même jour : 6P + historique legacy + second 6P terminé = une visite. */
  done(st,'s5','2026-09-22');done(st,'s5','2026-09-22');st.businessV2.visits[st.businessV2.visits.length-1].id='v-bis';
  st.visits.s5.lastVisit='2026-09-22T16:40:00';
  /* « ✓ Visité » coché seul (legacy, sans 6P) : une vraie visite, comptée une fois. */
  st.visits.s4={lastVisit:'2026-09-23',history:['2026-09-23']};
  const m=M.compute(st,{now:NOW});
  assert.equal(m.completedVisitsWeek,4,'lundi s0 + dimanche s1 + mardi s5 (une fois) + mercredi s4 legacy');
  assert.equal(m.completedVisitsToday,1);
  /* Même magasin, deux jours différents de la semaine : deux passages. */
  done(st,'s0','2026-09-24');assert.equal(M.compute(st,{now:NOW}).completedVisitsWeek,5);
  pass('bornes lundi–dimanche, brouillon exclu, 6P + historique legacy du même jour comptés une seule fois, « Visité » legacy seul compté');
}

/* --------------------------------------- 4. une seule source, aucun compteur ajouté */
{
  const home=read('home-refresh-v2.js');
  const block=home.slice(home.indexOf("const L=api&&api.labels"),home.indexOf("candidates.push(card('week'"));
  assert(block.length>200);
  assert.doesNotMatch(block,/businessV2|\.visits\b|history|status==='completed'/,'la carte semaine ne relit aucune visite : elle n’affiche que les métriques');
  assert.match(block,/m\.completedVisitsWeek/);assert.match(block,/m\.plannedStoresWeek/);assert.match(block,/m\.plannedVisitCreditsWeek/);
  pass('la carte ne lit que StoreRunnerActivityMetrics (aucun recomptage dans l’accueil)');
}

/* ---------------------------------------------------- 5. vocabulaire Runner */
{
  const st={stores:stores(2,'s','Enseigne Simple'),settings:{weekDate:'2026-09-21'},visits:{},businessV2:{visits:[],actions:[]},plan:{Mercredi:[{id:'s0'},{id:'s1'}]}};
  const tour=M.todayTour(st,{now:NOW});
  assert.match(Home.buildTerrainCard(tour,{draft:false}),/data-sr-start="s0">Démarrer le run</,'aucune visite commencée : « Démarrer le run »');
  assert.match(Home.buildTerrainCard(tour,{draft:true}),/data-sr-start="s0">Reprendre le run</,'visite en brouillon : « Reprendre le run »');
  const core=read('src/chef-secteur.html');
  assert.match(core,/data-sr-terrain>Démarrer le run<\/button>/,'panneau Mode Runner : libellé initial Runner');
  assert.match(core,/runBtn\.textContent=draft\?'Reprendre le run':'Démarrer le run'/,'panneau Mode Runner : libellé selon le brouillon du magasin courant');
  for(const f of ['home-refresh-v2.js','src/chef-secteur.html'])assert.doesNotMatch(read(f),/Reprendre la visite 6P/,f+' : ancien libellé encore visible');
  assert.match(core,/data-sr-terrain>/,'le bouton garde son attribut data-sr-terrain (même gestionnaire)');
  pass('Mode Runner : « Démarrer le run » / « Reprendre le run » sur l’accueil et dans le panneau, gestionnaires inchangés');
}
