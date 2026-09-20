/* V229 — un magasin cuisiniste peut exister dans state.stores et porter des contrats dans
   le fichier de suivi SANS jamais apparaître dans HITLIST. HITLIST cesse donc d'être la
   seule source de candidats : une trackingReserve est construite à part, puis résolue par
   le moteur de rapprochement existant.

   Toutes les fixtures sont synthétiques : villes A/B/C/D inventées, numéros client hors
   plage réelle, société « SOCIETE TEST 1 », références « REF_TEST_A / REF_TEST_B ». Aucune
   donnée du fichier métier n'entre dans le dépôt. */
const assert=require('assert');
const zlib=require('zlib');

const TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c}return t})();
function crc32(buf){let c=0^-1;for(let i=0;i<buf.length;i++)c=(c>>>8)^TABLE[(c^buf[i])&0xff];return(c^-1)>>>0}
function zip(entries){const locals=[],central=[];let offset=0;for(const e of entries){const name=Buffer.from(e.name),raw=Buffer.isBuffer(e.data)?e.data:Buffer.from(e.data),body=zlib.deflateRawSync(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc32(raw),14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);locals.push(h,name,body);const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc32(raw),16);cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(raw.length,24);cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);central.push(cd,name);offset+=h.length+name.length+body.length}const c=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(c.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([Buffer.concat(locals),c,e])}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function col(i){let s='',n=i+1;while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function sheetXml(sheet,strings,map){
  let body='';
  (sheet.rows||[]).forEach((r,ri)=>{
    body+='<row r="'+(ri+1)+'">'+r.map((v,ci)=>{
      if(v===null||v===undefined||v==='')return'';
      const ref=col(ci)+(ri+1);
      if(typeof v==='number')return'<c r="'+ref+'"><v>'+v+'</v></c>';
      let id=map.get(String(v));
      if(id===undefined){id=strings.length;strings.push(String(v));map.set(String(v),id)}
      return'<c r="'+ref+'" t="s"><v>'+id+'</v></c>';
    }).join('')+'</row>';
  });
  return'<?xml version="1.0"?><worksheet><dimension ref="A1:ZZ5000"/><sheetData>'+body+'</sheetData></worksheet>';
}
function workbook(sheets){
  const strings=[],map=new Map(),entries=[],rels=[],names=[];
  sheets.forEach((s,i)=>{
    entries.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheetXml(s,strings,map)});
    rels.push('<Relationship Id="rId'+(i+1)+'" Target="worksheets/sheet'+(i+1)+'.xml"/>');
    names.push('<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>');
  });
  entries.push({name:'xl/workbook.xml',data:'<?xml version="1.0"?><workbook><sheets>'+names.join('')+'</sheets></workbook>'});
  entries.push({name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0"?><Relationships>'+rels.join('')+'</Relationships>'});
  entries.push({name:'xl/sharedStrings.xml',data:'<?xml version="1.0"?><sst>'+strings.map(s=>'<si><t>'+esc(s)+'</t></si>').join('')+'</sst>'});
  return zip(entries);
}

const HIT=['Secteur 2026','Magasin physique (lib)'];
const H=['SECTEUR','ENSEIGNE','VILLE CUISINISTE','N° CLIENT','Client','DATE DÉBUT','DATE FIN','Statut Contrat','OBJECTIF CA','CA RÉALISÉ À DATE','Progress','Mois restant','PDT EXPO 1','PDT EXPO 2'];
function contractRow(city,client){
  const r=Array(H.length).fill(null);
  Object.assign(r,{0:'Secteur Test',1:'SCHMIDT',2:city,3:client,4:'SOCIETE TEST 1',
    5:'2025-01-01',6:'2025-12-31',7:'En cours',8:1000,9:800,10:.8,11:6,
    12:'REF_TEST_A',13:'REF_TEST_B'});
  return r;
}

/* HITLIST ne connaît que A, B et C. Le magasin de Ville D est volontairement absent. */
const hitRowsSansD=[
  [null,HIT[0],HIT[1]],
  [null,'Secteur Test','SCH-VILLE-A FR-00001'],
  [null,null,'SCH-VILLE-B FR-00002'],
  [null,null,'SCH-VILLE-C FR-00003'],
];
/* Import ultérieur : le fichier finit par nommer Ville D avec sa clé canonique. */
const hitRowsAvecD=hitRowsSansD.concat([[null,null,'SCH-VILLE-D FR-00004']]);
const trackingRows=[
  H,
  contractRow('VILLE D','9000000001'),
  contractRow('VILLE A','9000000002'),
  contractRow('VILLE B','9000000003'),
  contractRow('VILLE C','9000000004'),
];
/* Classeur dedié au repli d'identité : des lignes contrat réelles sans N° CLIENT, plus un
   magasin dont une ligne porte un client et l'autre non. */
const trackingSansClient=[
  H,
  contractRow('VILLE D','9000000001'),
  contractRow('VILLE E',null),
  contractRow('VILLE F','9000000010'),
  Object.assign(contractRow('VILLE F',null),{6:'2025-06-30'}),
];
const SANS_D=workbook([{name:'Feuil1',rows:hitRowsSansD},{name:'Feuil2',rows:trackingRows}]);
const SANS_CLIENT=workbook([{name:'Feuil1',rows:hitRowsSansD},{name:'Feuil2',rows:trackingSansClient}]);
const AVEC_D=workbook([{name:'Feuil1',rows:hitRowsAvecD},{name:'Feuil2',rows:trackingRows}]);

function memory(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
global.__chefStorage=memory();
global.state={stores:[],plan:{Lundi:[]},settings:{},businessV2:{visits:[],actions:[],storeSnapshots:{}}};
const V193=require('../cuisiniste-contracts-v193.js');
const V229=require('../cuisiniste-followup-v229.js');

/* store-d est un magasin ajouté à la main : ni numéro client, ni code postal, ni channel.
   Seuls l'enseigne et la ville sont renseignés — c'est exactement le cas à couvrir. */
const STORE_D={id:'store-d',enseigne:'Schmidt',ville:'Ville D'};
const MES_CUISINISTES=[
  {id:'store-a',enseigne:'Schmidt',ville:'Ville A',channel:'cuisiniste'},
  {id:'store-b',enseigne:'Schmidt',ville:'Ville B',channel:'cuisiniste'},
  {id:'store-c',enseigne:'Schmidt',ville:'Ville C',channel:'cuisiniste'},
  STORE_D,
];

(async()=>{
  // --- 3.4. Le repli de channelOf() reconnaît un cuisiniste sans champ channel ---------
  assert.equal(V193.isCuisinisteStore(STORE_D),true,
    'Schmidt sans channel explicite doit rester un cuisiniste via le repli par enseigne');
  assert.equal(STORE_D.clientNumber,undefined,'le magasin minimal n’a pas de numéro client');
  assert.equal(STORE_D.cp,undefined,'le magasin minimal n’a pas de code postal');
  assert.equal(STORE_D.channel,undefined,'le magasin minimal n’a pas de channel');

  global.state.stores=MES_CUISINISTES.slice();
  const storesAvant=JSON.stringify(global.state.stores);

  // --- 3.1. Une trackingReserve indépendante de HITLIST ------------------------------
  const snap=await V193.parseTrackingWorkbook(SANS_D);
  assert.equal(snap.scanned,3,'scanned reste le nombre de sites lus dans HITLIST');
  assert.equal(snap.sites.length,3,'HITLIST ne fournit que trois sites');
  assert(Array.isArray(snap.trackingReserve),'la réserve du suivi est conservée dans le résultat d’import');
  assert.equal(snap.trackingReserve.length,1,
    'seul le groupe de contrats absent de HITLIST entre en réserve · '+snap.trackingReserve.length);
  const reserveD=snap.trackingReserve[0];
  assert.equal(reserveD.trackingOnly,true,'le candidat de réserve est marqué tracking-only');
  assert.equal(reserveD.identityBy,'client','identité principale : enseigne normalisée + numéro client');
  assert.equal(reserveD.city,'VILLE D');

  // Identité de repli enseigne + ville quand le numéro client manque.
  const sansClient=V193.buildTrackingReserve([{brand:'SCHMIDT',city:'VILLE E',clientNumber:'',client:'SOCIETE TEST 1',endDate:'2025-12-31',status:'En cours'}],[]);
  assert.equal(sansClient.length,1);
  assert.equal(sansClient[0].identityBy,'ville','sans numéro client, l’identité retombe sur enseigne + ville');
  // Le nom de société seul n'est jamais une identité.
  const memeSociete=V193.buildTrackingReserve([
    {brand:'SCHMIDT',city:'VILLE E',clientNumber:'',client:'SOCIETE TEST 1',endDate:'2025-12-31',status:'En cours'},
    {brand:'SCHMIDT',city:'VILLE F',clientNumber:'',client:'SOCIETE TEST 1',endDate:'2025-12-31',status:'En cours'}],[]);
  assert.equal(memeSociete.length,2,'deux villes sous la même raison sociale restent deux identités distinctes');
  assert.equal(V193.buildTrackingReserve([{brand:'',city:'VILLE E',clientNumber:'9000000009'}],[]).length,0,
    'sans enseigne, aucune identité fiable n’est fabriquée');
  // Réserve bornée.
  const trop=[];for(let i=0;i<V193.MAX_RESERVE_SITES+40;i++)trop.push({brand:'SCHMIDT',city:'VILLE '+i,clientNumber:String(9100000000+i),endDate:'2025-12-31',status:'En cours'});
  assert.equal(V193.buildTrackingReserve(trop,[]).length,V193.MAX_RESERVE_SITES,
    'la réserve du suivi reste bornée à '+V193.MAX_RESERVE_SITES+' groupes');

  /* Régression : la borne était appliquée PENDANT le regroupement. Dans un gros classeur
     dont les 500 premiers groupes sont déjà nommés par HITLIST, le magasin tracking-only
     tardif — celui que cette réserve existe pour rattraper — tombait avant l'exclusion,
     et la réserve sortait vide. */
  const pad=n=>String(n).padStart(4,'0'),gros=[];
  for(let i=0;i<V193.MAX_RESERVE_SITES+100;i++)
    gros.push({brand:'SCHMIDT',city:'VILLEA'+pad(i),clientNumber:String(9200000000+i),endDate:'2025-12-31',status:'En cours'});
  gros.push({brand:'SCHMIDT',city:'ZZTARDIVE',clientNumber:'9300000001',endDate:'2025-12-31',status:'En cours'});
  const connus=gros.slice(0,V193.MAX_RESERVE_SITES+100).map(c=>({brand:c.brand,city:c.city,cityKey:V193.cityKey(c.city)}));
  const rattrape=V193.buildTrackingReserve(gros,connus);
  assert(rattrape.some(x=>x.city==='ZZTARDIVE'),
    'la borne doit s’appliquer après l’exclusion HITLIST, sinon le magasin tardif est perdu');
  assert(rattrape.length<=V193.MAX_RESERVE_SITES,'la réserve rendue reste bornée');

  /* Régression : deux numéros client distincts sous une seule étiquette HITLIST étaient
     tous les deux écartés, rendant le contrat du second magasin introuvable. */
  const uneEtiquette=[{brand:'SCHMIDT',city:'VILLE G',cityKey:V193.cityKey('VILLE G'),key:'SCH-VILLE-G FR-00007'}];
  const deuxClients=V193.buildTrackingReserve([
    {brand:'SCHMIDT',city:'VILLE G',clientNumber:'9000000020',endDate:'2025-12-31',status:'En cours'},
    {brand:'SCHMIDT',city:'VILLE G',clientNumber:'9000000021',endDate:'2025-12-31',status:'En cours'}],uneEtiquette);
  assert.equal(deuxClients.length,2,
    'deux clients distincts sous une seule étiquette HITLIST restent deux candidats');
  assert.deepEqual(deuxClients.map(x=>x.clientNumber).sort(),['9000000020','9000000021']);
  /* Un groupe seul à correspondre à son site HITLIST reste bien écarté : la réserve ne
     doit pas doubler ce que HITLIST porte déjà. */
  const seul=V193.buildTrackingReserve([
    {brand:'SCHMIDT',city:'VILLE G',clientNumber:'9000000020',endDate:'2025-12-31',status:'En cours'}],uneEtiquette);
  assert.equal(seul.length,0,'un site HITLIST déjà porteur de son unique groupe n’est pas doublé');

  // --- 3.5. Résultat attendu du scénario complet -------------------------------------
  V193.saveTracking(global.__chefStorage,snap);
  const sites=V193.resolveSites(global.__chefStorage,global.state.stores);
  assert.equal(sites.length,4,'quatre sites du secteur, dont celui que HITLIST ne nomme pas');
  const matched=sites.filter(s=>s.storeId),pending=sites.filter(s=>!s.storeId);
  assert.equal(matched.length,4,'les quatre sites sont rapprochés');
  assert.equal(pending.length,0,'aucun site à vérifier');
  const villeD=sites.find(s=>s.city==='VILLE D');
  assert(villeD,'Ville D apparaît malgré son absence de HITLIST');

  // --- 3.4 (suite). store-d retrouvé par enseigne normalisée + ville normalisée -------
  assert.equal(villeD.storeId,'store-d','le magasin ajouté à la main est bien celui retrouvé');
  assert.equal(villeD.matchedBy,'ville','le rapprochement se fait sur enseigne + ville, sans client ni code postal');
  assert.equal(villeD.trackingOnly,true,'le site reste identifié comme issu du suivi');

  // --- 3.5. Aucun magasin créé, aucun doublon ----------------------------------------
  assert.equal(JSON.stringify(global.state.stores),storesAvant,'aucun magasin n’est créé ni modifié');
  assert.equal(global.state.stores.length,4,'state.stores garde exactement ses quatre magasins');
  const ids=matched.map(s=>String(s.storeId));
  assert.equal(new Set(ids).size,ids.length,'aucun magasin n’est attribué à deux sites');
  const keys=sites.map(s=>s.key);
  assert.equal(new Set(keys).size,keys.length,'aucune clé de site dupliquée');

  // --- 3.8. Le compteur « cuisinistes dans le fichier » ne gonfle pas -----------------
  const enregistre=V193.latestTracking(global.__chefStorage);
  assert.equal(enregistre.scanned,3,'le compteur du fichier reste celui de HITLIST');
  assert(enregistre.scanned<sites.length,'les sites du secteur peuvent dépasser le scanned HITLIST');

  // --- 3.7. Le candidat tracking-only n'est pas appauvri -----------------------------
  const c=villeD.activeContract;
  assert(c,'le candidat du suivi garde son contrat actif');
  assert.equal(villeD.lastContract.clientNumber,'9000000001');
  assert.equal(c.client,'SOCIETE TEST 1','la société est conservée');
  assert.equal(c.clientNumber,'9000000001','le numéro client est conservé');
  assert.equal(c.startDate,'2025-01-01');
  assert.equal(c.endDate,'2025-12-31');
  assert.equal(c.status,'En cours');
  assert.equal(c.objective,1000);
  assert.equal(c.realized,800);
  assert.equal(c.monthsRemaining,6);
  assert.deepEqual(c.products,['REF_TEST_A','REF_TEST_B'],'les produits expo sont conservés');
  assert(Array.isArray(villeD.history)&&villeD.history.length>=1,'l’historique contrats est conservé');

  // --- 3.9. Identité commerciale affichée uniquement si la donnée existe --------------
  assert.equal(V193.siteIdentityLine(villeD),'Société : SOCIETE TEST 1 · client 9000000001',
    'la ligne société / client est construite à partir du fichier, jamais codée en dur');
  assert.equal(V193.siteIdentityLine({brand:'SCHMIDT',city:'VILLE E'}),'',
    'sans donnée, aucune ligne n’est affichée');

  // --- 3.2. Un tracking-only sans magasin correspondant reste invisible ---------------
  global.state.stores=MES_CUISINISTES.filter(s=>s.id!=='store-d');
  const sansMagasin=V193.resolveSites(global.__chefStorage,global.state.stores);
  assert.equal(sansMagasin.length,3,'sans magasin correspondant, la réserve du suivi ne remonte rien');
  assert(!sansMagasin.some(s=>s.city==='VILLE D'),'aucun site tracking-only fantôme');
  assert.equal(global.state.stores.length,3,'aucun magasin recréé pour faire exister le site');
  global.state.stores=MES_CUISINISTES.slice();

  // --- 3.3. Priorité : un tracking-only ne vole pas un magasin mieux rapproché --------
  const hitA=snap.sites.find(s=>s.key==='SCH-VILLE-A FR-00001'),voleur=Object.assign({},reserveD,{
    key:'tracking|client|schmidt|9000000099',city:'VILLE A',cityKey:'ville a',clientNumber:'9000000099'});
  V193.saveTracking(global.__chefStorage,Object.assign({},snap,{sites:[hitA],others:[],trackingReserve:[voleur],scanned:1}));
  const duel=V193.resolveSites(global.__chefStorage,global.state.stores);
  assert.equal(duel.length,1,'le tracking-only perdant disparaît au lieu de doubler le site HITLIST');
  assert.equal(duel[0].key,hitA.key,'la clé HITLIST canonique est conservée');
  assert.equal(duel[0].storeId,'store-a','le magasin reste au candidat HITLIST');
  V193.saveTracking(global.__chefStorage,snap);

  // --- 3.6. Clé store:<id> puis migration vers la clé canonique -----------------------
  assert.equal(villeD.key,'store:store-d',
    'sans clé HITLIST canonique, le site tracking-only vit sous store:<storeId>');
  const repli=V229.fallbackKey('store-d');
  assert.equal(repli,villeD.key,'la clé de repli V229 et la clé du site tracking-only sont la même');
  V229.setStatus(global.__chefStorage,repli,'proposition-presentee');
  V229.addAction(global.__chefStorage,repli,{type:'rdv',date:'2025-03-02',note:'Point expo'});
  V229.addAction(global.__chefStorage,repli,{type:'appel',date:'2025-04-10',note:'Suivi'});
  V229.setNextAction(global.__chefStorage,repli,{label:'Repasser',dueDate:'2025-06-01',type:'relance'});
  const avant=V229.followupFor(global.__chefStorage,repli);
  assert.equal(avant.history.length,3,'le suivi de repli contient bien trois entrées');

  /* Tant qu'aucun import n'apporte la clé canonique, reconcileKeys ne bouge rien. */
  assert.equal(V229.reconcileKeys(global.__chefStorage,V193.resolveSites(global.__chefStorage,global.state.stores)),0,
    'sans clé canonique, aucune migration prématurée');
  assert.equal(V229.followupFor(global.__chefStorage,repli).workflowStatus,'proposition-presentee');

  const avecD=await V193.parseTrackingWorkbook(AVEC_D);
  assert.equal(avecD.scanned,4,'le nouvel import lit bien quatre sites HITLIST');
  assert.equal(avecD.trackingReserve.length,0,'un site nommé par HITLIST sort de la réserve du suivi');
  V193.saveTracking(global.__chefStorage,avecD);
  const apresImport=V193.resolveSites(global.__chefStorage,global.state.stores);
  const canonique=apresImport.find(s=>s.key==='SCH-VILLE-D FR-00004');
  assert.equal(canonique.key,'SCH-VILLE-D FR-00004','la clé canonique de HITLIST reprend la main');
  assert.equal(canonique.storeId,'store-d','le magasin reste le même après l’import');
  assert.equal(V229.reconcileKeys(global.__chefStorage,apresImport),1,'une seule clé de repli à migrer');
  const migre=V229.followupFor(global.__chefStorage,canonique.key);
  assert.equal(migre.workflowStatus,'proposition-presentee','le statut de workflow survit à la migration');
  assert.equal(migre.nextAction.label,'Repasser','la prochaine action survit à la migration');
  assert.equal(migre.nextAction.dueDate,'2025-06-01');
  assert.equal(migre.lastAction.note,'Suivi','la dernière action survit à la migration');
  for(const row of avant.history)
    assert(migre.history.some(x=>x.id===row.id),'aucune action perdue : '+row.label);
  const histIds=migre.history.map(x=>x.id);
  assert.equal(new Set(histIds).size,histIds.length,'la migration ne duplique aucune entrée');
  assert.equal(V193.readStore(global.__chefStorage).followups[repli],undefined,
    'la clé de repli disparaît une fois la fusion écrite');
  assert.equal(V229.reconcileKeys(global.__chefStorage,apresImport),0,'la migration est idempotente');

  // --- 3.1 (chemin d'import réel). Une ligne sans N° CLIENT atteint bien la réserve ----
  /* Régression : parseTrackingWorkbook() n'acceptait une ligne que si elle portait un
     numéro client. Le repli d'identité « enseigne + ville » était donc inatteignable
     depuis un vrai import, alors même que trackingIdentity() le gère. */
  const STORE_E={id:'store-e',enseigne:'Schmidt',ville:'Ville E'};
  const STORE_F={id:'store-f',enseigne:'Schmidt',ville:'Ville F'};
  global.state.stores=MES_CUISINISTES.concat([STORE_E,STORE_F]);
  const avecSansClient=JSON.stringify(global.state.stores);
  const snapSansClient=await V193.parseTrackingWorkbook(SANS_CLIENT);
  assert.equal(snapSansClient.scanned,3,'HITLIST reste inchangé par les lignes sans client');
  const villeE=snapSansClient.trackingReserve.find(x=>x.city==='VILLE E');
  assert(villeE,'une ligne contrat sans numéro client doit atteindre la réserve depuis l’import');
  assert.equal(villeE.identityBy,'ville',
    'parseTrackingWorkbook doit produire une identité de repli enseigne + ville');
  assert.equal(villeE.clientNumber,'','aucun numéro client n’est inventé');
  assert.equal(villeE.activeContract.client,'SOCIETE TEST 1','le contrat reste complet');
  assert.equal(villeE.activeContract.objective,1000);

  /* Deux lignes du même magasin, l'une avec client l'autre sans : un seul candidat complet. */
  const villeF=snapSansClient.trackingReserve.filter(x=>x.city==='VILLE F');
  assert.equal(villeF.length,1,'pas deux candidats appauvris pour un même magasin');
  assert.equal(villeF[0].identityBy,'client','l’identité la plus forte est conservée');
  assert.equal(villeF[0].clientNumber,'9000000010');
  assert.equal(villeF[0].history.length,2,'les deux lignes contrat sont réunies dans l’historique');

  V193.saveTracking(global.__chefStorage,snapSansClient);
  const resolusSansClient=V193.resolveSites(global.__chefStorage,global.state.stores);
  const siteE=resolusSansClient.find(x=>x.city==='VILLE E');
  assert(siteE,'le site sans numéro client est bien rendu visible par son magasin');
  assert.equal(siteE.storeId,'store-e','rattaché au magasin existant, jamais créé');
  assert.equal(siteE.matchedBy,'ville','rapproché par enseigne normalisée + ville normalisée');
  assert.equal(siteE.key,'store:store-e','clef de repli store:<storeId>');
  const siteF=resolusSansClient.find(x=>x.city==='VILLE F');
  assert.equal(siteF.storeId,'store-f');
  const idsSansClient=resolusSansClient.filter(x=>x.storeId).map(x=>String(x.storeId));
  assert.equal(new Set(idsSansClient).size,idsSansClient.length,'toujours aucun magasin attribué deux fois');
  assert.equal(JSON.stringify(global.state.stores),avecSansClient,'aucun magasin créé ni modifié');
  global.state.stores=MES_CUISINISTES.slice();

  // --- Aucun second moteur de matching, aucune création de magasin -------------------
  const SRC=require('fs').readFileSync(__dirname+'/../cuisiniste-contracts-v193.js','utf8');
  assert(/function buildTrackingReserve\(/.test(SRC),'la réserve du suivi est construite dans V193');
  assert(/const\{assigned,proposals\}=assignStores\(pooled/.test(SRC),
    'resolveSites continue de passer par assignStores : pas de second moteur de rapprochement');
  assert(!/state\.stores\.push|stores\(\)\.push/.test(SRC),'aucun magasin n’est jamais créé par l’import');
  assert.equal(global.state.stores.length,4,'state.stores est intact à la fin du scénario');

  console.log('V229 trackingReserve: HITLIST n’est plus la seule source, store-d retrouvé par enseigne + ville, aucune création ni doublon, migration store:<id> ok');
})().catch(e=>{console.error(e);process.exit(1)});
