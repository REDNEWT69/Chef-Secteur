/* Suggestions de magasins proches dans « Visites du jour ».
   Fixtures entièrement inventées : le dépôt est public. Les coordonnées sont
   construites le long d'un méridien, ce qui rend la distance haversine exacte
   au kilomètre demandé. */
const assert=require('node:assert/strict');
const path=require('node:path');
const M=require(path.join(__dirname,'..','planning-manual-visits.js'));

const DEG_KM=111.19492664455873;           /* 1° de latitude, à R = 6371 km */
const BASE={lat:47,lon:1};
const at=km=>({lat:BASE.lat+km/DEG_KM,lon:BASE.lon});

const TODAY='2026-09-17';                  /* jeudi */
const HIER='2026-09-16';
const DEMAIN='2026-09-18';

function store(id,km,extra){
  const pos=km==null?{lat:undefined,lon:undefined}:at(km);
  return Object.assign({id,enseigne:'Enseigne '+id,ville:'Ville-Test '+id,adresse:'1 rue Test',
    dept:'99',lat:pos.lat,lon:pos.lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']},extra||{});
}
function baseState(extra){
  const ancre=store('anc',0);
  return Object.assign({
    schemaVersion:5,
    profile:{sectorName:'Mon secteur',baseLat:47,baseLon:1},
    settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',target:20,maxVisitsPerDay:4},
    stores:[ancre],
    plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[ancre],Vendredi:[],Samedi:[]},
    visits:{},notes:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]
  },extra||{});
}
const deps=over=>Object.assign({today:TODAY,radiusKm:10},over||{});
const ids=rows=>rows.map(r=>r.id);

/* 1. Le rayon. 9,9 km entre, 10,1 km sort. ------------------------------- */
{
  const st=baseState();
  st.stores.push(store('dedans',9.9),store('dehors',10.1));
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps());
  assert.deepEqual(ids(rows),['dedans'],'9,9 km doit entrer et 10,1 km doit sortir');
  const mesure=rows[0].km;
  assert.ok(Math.abs(mesure-9.9)<0.02,'la distance doit être en kilomètres, mesurée '+mesure);
}
{
  /* La borne exacte. Une distance dérivée de coordonnées ne vaut jamais 10,000000
     exactement : on injecte la distance pour que la comparaison soit réellement
     figée. « Dans un rayon de 10 km » inclut 10 km. */
  const st=baseState();
  st.stores.push(store('pile',10));
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps({distance:()=>10}));
  assert.deepEqual(ids(rows),['pile'],'10,0 km est dans le rayon de 10 km : le seuil est inclusif');
  assert.deepEqual(M.computeSuggestions(st,'Jeudi',TODAY,deps({distance:()=>10.0000001})),[],'au-delà, le magasin sort');
}

/* 2. Journée passée : rien. ---------------------------------------------- */
{
  const st=baseState();
  st.stores.push(store('v',3));
  assert.deepEqual(M.computeSuggestions(st,'Jeudi',HIER,deps()),[],'un jour passé ne propose rien');
}

/* 3. Journée future : suggestions. --------------------------------------- */
{
  const st=baseState();
  st.stores.push(store('v',3));
  assert.deepEqual(ids(M.computeSuggestions(st,'Jeudi',DEMAIN,deps())),['v'],'un jour futur propose');
  assert.deepEqual(ids(M.computeSuggestions(st,'Jeudi',TODAY,deps())),['v'],'aujourd’hui propose aussi');
}

/* 4. Journée sans visite planifiée : rien. ------------------------------- */
{
  const st=baseState();
  st.plan.Jeudi=[];
  st.stores.push(store('v',3));
  assert.deepEqual(M.computeSuggestions(st,'Jeudi',TODAY,deps()),[],'sans visite planifiée, aucune ancre');
}

/* 5. Exclusions de la semaine affichée. ---------------------------------- */
{
  const st=baseState();
  const ailleurs=store('ailleurs',2),exclu=store('exclu',2.5),inactif=store('inactif',2.6),libre=store('libre',4);
  st.stores.push(ailleurs,exclu,inactif,libre);
  st.plan.Mardi=[ailleurs];
  st.excluded={exclu:true};
  inactif.active=false;
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps());
  assert.deepEqual(ids(rows),['libre'],'planifié ailleurs, exclu et inactif doivent être écartés');
}

/* 6. Fermé ce jour-là. --------------------------------------------------- */
{
  const st=baseState();
  st.stores.push(store('ferme',1),store('ouvert',2),store('inconnu',3));
  const closedOn=(s,day)=>s.id==='ferme'&&day==='Jeudi';
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps({closedOn}));
  assert.deepEqual(ids(rows),['ouvert','inconnu'],'un magasin fermé ce jour sort, un horaire inconnu reste');
}

/* 7. Sans GPS exploitable : ignoré. -------------------------------------- */
{
  const st=baseState();
  st.stores.push(store('sansgps',null),store('zero',0.5,{lat:0,lon:0}),store('avecgps',5));
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps());
  assert.deepEqual(ids(rows),['avecgps'],'lat/lon absents ou à 0,0 : le magasin est ignoré, jamais placé à l’équateur');
}

/* 8. Tri croissant et plafond à 3. --------------------------------------- */
{
  const st=baseState();
  [0.1,3,3.5,5,7,8,9].forEach((km,i)=>st.stores.push(store('v'+i,km)));
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps());
  assert.equal(rows.length,3,'plafond de trois suggestions');
  assert.deepEqual(ids(rows),['v0','v1','v2'],'tri par distance croissante');
  assert.ok(rows[0].km<rows[1].km&&rows[1].km<rows[2].km);
}

/* 9. Un P1 du rayon reste visible, en quatrième ligne. ------------------- */
{
  const st=baseState();
  [0.1,3,3.5,5,7,8,9].forEach((km,i)=>st.stores.push(store('v'+i,km)));
  const prio=id=>id==='v5'?'P1':id==='v1'?'P2':null;
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps({prio}));
  assert.equal(rows.length,4,'le P1 hors des trois plus proches ajoute une quatrième ligne');
  assert.deepEqual(ids(rows),['v0','v1','v2','v5']);
  assert.equal(rows[3].prio,'P1');
  assert.equal(rows[1].prio,'P2','le badge P2 est conservé');
  assert.equal(M.PRIO_BADGE.watch,'À surveiller');
}
{
  /* Un P1 déjà dans les trois plus proches n'ouvre pas de quatrième ligne. */
  const st=baseState();
  [0.1,3,3.5,5,7].forEach((km,i)=>st.stores.push(store('v'+i,km)));
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps({prio:id=>id==='v1'?'P1':null}));
  assert.equal(rows.length,3,'un P1 déjà visible ne déclenche pas de ligne supplémentaire');
}

/* 10. Aucun snapshot performance : aucun badge. -------------------------- */
{
  const st=baseState();
  st.stores.push(store('v',2));
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps());
  assert.equal(rows[0].prio,null,'sans snapshot, pas de priorité');
  assert.equal(M.PRIO_BADGE[rows[0].prio],undefined,'et donc aucun badge à afficher');
}

/* 11. Visites : brouillon ignoré, visite terminée retenue. --------------- */
{
  const st=baseState();
  st.stores.push(store('vu',2),store('jamais',3));
  st.businessV2={visits:[
    {id:'d1',storeId:'vu',status:'draft',completedDate:'2026-09-16'},
    {id:'c1',storeId:'vu',status:'completed',completedDate:'2026-09-07'},
    {id:'d2',storeId:'jamais',status:'draft',completedDate:'2026-09-15'}
  ],actions:[],storeSnapshots:{}};
  const V=require(path.join(__dirname,'..','performance-data-v190.js'));
  const lastVisit=id=>{const info=V.completedVisitsFor(st,id);return info&&info.lastVisit?info.lastVisit:''};
  const rows=M.computeSuggestions(st,'Jeudi',TODAY,deps({lastVisit}));
  const vu=rows.find(r=>r.id==='vu'),jamais=rows.find(r=>r.id==='jamais');
  assert.equal(vu.lastVisit,'2026-09-07','seule la visite terminée compte');
  assert.equal(vu.daysSince,10);
  assert.equal(M.visitLabel(vu),'vu il y a 10 j');
  assert.equal(jamais.daysSince,null,'un brouillon ne vaut pas une visite');
  assert.equal(M.visitLabel(jamais),'jamais visité');
}

/* 12. Libellé de distance, lisible en français. -------------------------- */
{
  assert.equal(M.suggestionLabel({km:3.46}),'≈ 3,5 km');
  assert.equal(M.suggestionLabel({km:0.1}),'≈ 0,1 km');
}

/* 13. Le calcul ne touche à rien. ---------------------------------------- */
{
  const st=baseState();
  [1,2,3,4].forEach((km,i)=>st.stores.push(store('v'+i,km)));
  const avant=JSON.stringify(st);
  M.computeSuggestions(st,'Jeudi',TODAY,deps());
  assert.equal(JSON.stringify(st),avant,'le calcul des suggestions ne modifie ni planning ni magasins');
  const priorites=st.stores.map(s=>s.priority);
  assert.deepEqual(priorites,priorites.map(()=>3),'store.priority n’est jamais touché');
}

/* 14. « Ajouter » donne le même état que l'ajout manuel, sans confirmation
       tant que la capacité de la journée reste respectée. ------------------ */
function fakeWin(state){
  const db=new Map(),confirmations=[];
  const win={
    state,
    __chefStorage:{getItem:k=>db.has(k)?db.get(k):null,setItem:(k,v)=>db.set(k,String(v)),removeItem:k=>db.delete(k)},
    confirm:message=>{confirmations.push(String(message||''));return true},
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init&&init.detail}},
    document:{dispatchEvent(){return true},querySelector(){return null},querySelectorAll(){return[]}}
  };
  win.__confirmations=confirmations;
  return win;
}
{
  const manuel=baseState(),suggere=baseState();
  [2,6].forEach((km,i)=>{manuel.stores.push(store('v'+i,km));suggere.stores.push(store('v'+i,km))});

  const winA=fakeWin(manuel),winB=fakeWin(suggere);
  /* IIFE await + catch explicite : sans cela, une assertion qui tombe dans la
     chaîne asynchrone laisserait le test afficher PASS et sortir en 0. */
  (async()=>{
    await M.addStore(winA,'v0','Jeudi');
    await M.acceptSuggestion(winB,'v0','Jeudi');
    {
      const strip=s=>JSON.stringify({plan:s.plan,stores:s.stores,locks:s.locks,excluded:s.excluded});
      assert.equal(strip(suggere),strip(manuel),'l’ajout par suggestion doit produire exactement le même état');
      assert.deepEqual(suggere.plan.Jeudi.map(s=>s.id),['anc','v0']);
      assert.equal(winB.__confirmations.length,0,'sans dépassement de capacité, Ajouter doit être immédiat');

      /* La suggestion acceptée disparaît de la liste suivante. */
      const restantes=M.computeSuggestions(suggere,'Jeudi',TODAY,deps());
      assert.deepEqual(ids(restantes),['v1'],'le magasin ajouté n’est plus proposé');

      /* 15. Si la capacité serait dépassée, l'avertissement reste obligatoire. */
      const bloque=baseState();
      bloque.settings.maxVisitsPerDay=1;
      bloque.stores.push(store('cap',2));
      const winC=fakeWin(bloque);
      winC.confirm=message=>{winC.__confirmations.push(String(message||''));return false};
      const annule=await M.acceptSuggestion(winC,'cap','Jeudi');
      assert.equal(annule.cancelled,true,'refuser l’avertissement doit annuler l’ajout');
      assert.deepEqual(bloque.plan.Jeudi.map(s=>s.id),['anc'],'le planning reste intact après refus');
      assert.equal(winC.__confirmations.length,1,'le dépassement doit demander une seule confirmation');
      assert.match(winC.__confirmations[0],/2 crédits/,'l’avertissement doit annoncer la charge prévue');
      assert.match(winC.__confirmations[0],/plafond prévu de 1/,'l’avertissement doit rappeler le plafond');

      const accepte=baseState();
      accepte.settings.maxVisitsPerDay=1;
      accepte.stores.push(store('cap-ok',2));
      const winD=fakeWin(accepte);
      const force=await M.acceptSuggestion(winD,'cap-ok','Jeudi');
      assert.equal(force.ok,true,'accepter le dépassement doit conserver le chemin addStore');
      assert.deepEqual(accepte.plan.Jeudi.map(s=>s.id),['anc','cap-ok']);
      assert.equal(winD.__confirmations.length,1,'le dépassement accepté ne demande qu’une confirmation');

      /* 16. Une sauvegarde existante reste valide, avec ou sans le réglage. */
      const R=require(path.join(__dirname,'..','reliability-core.js'));
      const sansReglage=JSON.parse(JSON.stringify(baseState()));
      assert.ok(!('suggestionRadiusKm' in sansReglage.settings),'la clé n’est pas obligatoire');
      const bundle=nu=>({format:'ChefSecteurBackup',version:1,createdAt:'2026-09-17T08:00:00.000Z',state:nu,archive:{},range:null});
      R.validate(bundle(sansReglage));
      const avecReglage=JSON.parse(JSON.stringify(baseState()));
      avecReglage.settings.suggestionRadiusKm=15;
      R.validate(bundle(avecReglage));
      assert.equal(M.radiusKm(avecReglage),15,'le rayon réglé est relu');
      assert.equal(M.radiusKm(sansReglage),M.DEFAULT_RADIUS_KM,'sans réglage, 10 km par défaut');
      assert.equal(M.DEFAULT_RADIUS_KM,10);

      console.log('suggestions de proximité : OK · rayon 9,9/10,1 · jour passé · jour vide · exclusions · fermé · sans GPS · tri et plafond · P1 en 4e · badge absent · brouillon ignoré · ajout direct · confirmation seulement si capacité dépassée · sauvegarde inchangée');
    }
  })().catch(e=>{console.error(e);process.exit(1)});
}
