/* Régression V229 · périmètre multi-secteur.
   Cas terrain : un cuisiniste de l'utilisateur est classé dans le fichier sous un AUTRE
   secteur commercial (« Valence », « Hors Front de Vente »). Il doit rester dans le
   périmètre, parce que le périmètre c'est state.stores, pas la colonne « Secteur 2026 ».
   Fixtures synthétiques : aucune donnée métier réelle n'entre dans le dépôt. */
const assert=require('assert');
const zlib=require('zlib');

const TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c}return t})();
function crc32(buf){let c=0^-1;for(let i=0;i<buf.length;i++)c=(c>>>8)^TABLE[(c^buf[i])&0xff];return(c^-1)>>>0}
function zip(entries){const locals=[],central=[];let offset=0;for(const e of entries){const name=Buffer.from(e.name),raw=Buffer.from(e.data),body=zlib.deflateRawSync(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc32(raw),14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);locals.push(h,name,body);const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc32(raw),16);cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(raw.length,24);cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);central.push(cd,name);offset+=h.length+name.length+body.length}const c=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(c.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([Buffer.concat(locals),c,e])}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function col(i){let s='',n=i+1;while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function sheetXml(rows,strings,map){return'<?xml version="1.0"?><worksheet><sheetData>'+rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{if(v===null||v===undefined||v==='')return'';const ref=col(ci)+(ri+1);if(typeof v==='number')return'<c r="'+ref+'"><v>'+v+'</v></c>';let id=map.get(String(v));if(id===undefined){id=strings.length;strings.push(String(v));map.set(String(v),id)}return'<c r="'+ref+'" t="s"><v>'+id+'</v></c>'}).join('')+'</row>').join('')+'</sheetData></worksheet>'}
function workbook(sheets){const strings=[],map=new Map(),entries=[],rels=[],names=[];sheets.forEach((s,i)=>{entries.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheetXml(s.rows,strings,map)});rels.push('<Relationship Id="rId'+(i+1)+'" Target="worksheets/sheet'+(i+1)+'.xml"/>');names.push('<sheet name="'+esc(s.name)+'" r:id="rId'+(i+1)+'"/>')});entries.push({name:'xl/workbook.xml',data:'<?xml version="1.0"?><workbook><sheets>'+names.join('')+'</sheets></workbook>'});entries.push({name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0"?><Relationships>'+rels.join('')+'</Relationships>'});entries.push({name:'xl/sharedStrings.xml',data:'<?xml version="1.0"?><sst>'+strings.map(s=>'<si><t>'+esc(s)+'</t></si>').join('')+'</sst>'});return zip(entries)}

const HIT=['Secteur 2026','Magasin physique (lib)'];
const H=['Facturation','CHECK','SECTEUR','GROUPE','ENSEIGNE','VILLE CUISINISTE','GROUPEMENT','N° CLIENT','Client','DATE DÉBUT','DATE FIN','Mois Total','A','B','Statut Contrat','OBJECTIF CA','CA RÉALISÉ À DATE','MOIS','C','D','E','F','Progress','Mois restant','G','CLOTURE','A facturer','PORTEFEUILLE Mois en cours','PDT EXPO 1'];
function contrat(sector,ville,client,societe,debut,fin){
  const r=Array(H.length).fill(null);
  Object.assign(r,{2:sector,4:'SCHMIDT',5:ville,7:client,8:societe,9:debut,10:fin,14:'En cours',15:7200,16:3600,22:.5,23:6,25:'25%',28:'EXPO1'});
  return r;
}
/* 2025-12-01 et 2026-11-30 en série Excel. */
const DEBUT=45992,FIN=46356;

const hitRows=[
  [null,HIT[0],HIT[1]],
  [null,'Auvergne-Rhone-Alpes','SCH-SAINT-PRIEST FR-69800'],
  [null,null,'SCH-VILLE-LA-GRAND FR-74100'],
  [null,null,'SCH-SAINT-PAUL-LES-ROMANS FR-26750'],
  [null,null,'SCH-AUTRE VILLE ARA FR-69001'],
  [null,'Valence','SCH-BOURGOIN-JALLIEU FR-38300'],
  [null,null,'SCH-ROMANS FR-26100'],
  [null,null,'SCH-VALENCE CENTRE FR-26000'],
  [null,'Hors Front de Vente','SCH-AILLEURS FR-01000'],
];
const trackingRows=[H,
  contrat('Auvergne-Rhone-Alpes','SAINT-PRIEST',111,'SOC A',DEBUT,FIN),
  contrat('Auvergne-Rhone-Alpes','VILLE-LA-GRAND',222,'SOC B',DEBUT,FIN),
  contrat('Auvergne-Rhone-Alpes','SAINT-PAUL-LES-ROMANS',333,'SOC C',DEBUT,FIN),
  contrat('Auvergne-Rhone-Alpes','AUTRE VILLE ARA',444,'SOC D',DEBUT,FIN),
  contrat('Valence','BOURGOIN-JALLIEU',4110006194,'PM CONCEPTION',DEBUT,FIN),
  contrat('Valence','ROMANS',555,'SOC E',DEBUT,FIN),
  contrat('Valence','VALENCE CENTRE',666,'SOC F',DEBUT,FIN),
];
const WB=workbook([{name:'Feuil1',rows:hitRows},{name:'Feuil2',rows:trackingRows}]);

function memory(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
const MES_QUATRE=[
  {id:'sp',enseigne:'Schmidt',ville:'Saint-Priest',channel:'cuisiniste'},
  {id:'vg',enseigne:'Schmidt',ville:'Ville-la-Grand',channel:'cuisiniste'},
  {id:'pr',enseigne:'Schmidt',ville:'Saint-Paul-les-Romans',channel:'cuisiniste'},
  {id:'bj',enseigne:'Schmidt',ville:'Bourgoin-Jallieu',channel:'cuisiniste'},
];
const RETAIL={id:'rt',enseigne:'Boulanger',ville:'Bourgoin-Jallieu',channel:'retail'};

global.__chefStorage=memory();
global.state={stores:MES_QUATRE.slice(),plan:{Lundi:[]},settings:{},businessV2:{visits:[],actions:[],storeSnapshots:{}}};
const V193=require('../cuisiniste-contracts-v193.js');
const V229=require('../cuisiniste-followup-v229.js');
const villes=list=>list.map(s=>s.city).sort();

(async()=>{
  // --- 1, 5. Le secteur du fichier n'exclut jamais un magasin de state.stores --------
  global.state.stores=MES_QUATRE.concat([RETAIL]);
  const avant=JSON.stringify(global.state);
  const snap=await V193.parseTrackingWorkbook(WB);
  V193.saveTracking(global.__chefStorage,snap);
  let sites=V193.resolveSites(global.__chefStorage,global.state.stores);

  assert.equal(snap.scanned,8,'les huit sites du fichier sont lus avant toute décision');
  assert.equal(sites.length,4,'quatre sites retenus, pas trois · '+villes(sites).join(', '));
  assert.equal(sites.filter(s=>s.storeId).length,4,'les quatre sont rapprochés');
  const bourgoin=sites.find(s=>s.city==='BOURGOIN-JALLIEU');
  assert(bourgoin,'Bourgoin doit être présent malgré son secteur « Valence »');
  assert.equal(bourgoin.storeId,'bj','Bourgoin est lié au bon magasin');
  assert.equal(bourgoin.fileSector,'Valence','le secteur du fichier reste lisible, sans filtrer');
  assert.equal(bourgoin.activeContract.clientNumber,'4110006194','le contrat Bourgoin est bien rattaché');
  assert.equal(bourgoin.activeContract.client,'PM CONCEPTION','la société du contrat est conservée');
  assert.equal(bourgoin.activeContract.startDate,'2025-12-01');
  assert.equal(bourgoin.activeContract.endDate,'2026-11-30');
  assert(new Set(sites.map(s=>s.fileSector)).size>=2,'deux secteurs du fichier alimentent le même périmètre');

  // --- 2. Un magasin du même secteur mais absent de state.stores est ignoré ----------
  assert(!sites.some(s=>s.city==='AUTRE VILLE ARA'),'un magasin Auvergne-Rhone-Alpes inconnu n’entre pas');
  assert(!sites.some(s=>/VALENCE CENTRE|AILLEURS/.test(s.city)),'aucun autre magasin Valence n’est importé');
  // Régression : « Romans » est contenu dans « Saint-Paul-les-Romans ».
  assert(!sites.some(s=>s.city==='ROMANS'),'une ville contenue dans une autre ne crée pas un faux périmètre');
  const paul=sites.find(s=>s.city==='SAINT-PAUL-LES-ROMANS');
  assert.equal(paul.storeId,'pr','le magasin reste attribué au site qui le désigne le plus sûrement');

  // --- 4. Un magasin retail n'est jamais candidat ------------------------------------
  assert(!sites.some(s=>s.storeId==='rt'),'le Boulanger de Bourgoin n’est jamais rapproché');
  assert.equal(JSON.stringify(global.state),avant,'aucun magasin ajouté ni modifié dans state.stores');

  // --- Cause réelle du terrain : magasin ajouté APRÈS l'import -----------------------
  global.state.stores=MES_QUATRE.slice(0,3);
  const tardif=await V193.parseTrackingWorkbook(WB);
  V193.saveTracking(global.__chefStorage,tardif);
  assert.equal(V193.resolveSites(global.__chefStorage,global.state.stores).length,3,
    'au moment de l’import, trois cuisinistes seulement sont connus');
  global.state.stores=MES_QUATRE.slice();
  sites=V193.resolveSites(global.__chefStorage,global.state.stores);
  assert.equal(sites.length,4,'ajouter Bourgoin le fait apparaître sans réimport · '+villes(sites).join(', '));
  assert.equal(sites.find(s=>s.city==='BOURGOIN-JALLIEU').activeContract.client,'PM CONCEPTION',
    'et il arrive avec son contrat, pas une coquille vide');
  // Le supprimer le retire du périmètre sans toucher aux données importées.
  global.state.stores=MES_QUATRE.slice(0,3);
  assert.equal(V193.resolveSites(global.__chefStorage,global.state.stores).length,3);
  global.state.stores=MES_QUATRE.slice();

  // --- 6, 7. Le choix manuel de secteur est un repli, jamais un filtre ---------------
  const choisi=await V193.parseTrackingWorkbook(WB,'Auvergne-Rhone-Alpes');
  const avecChoix=[];
  V193.saveTracking(global.__chefStorage,choisi);
  avecChoix.push(...V193.resolveSites(global.__chefStorage,global.state.stores));
  assert(avecChoix.some(s=>s.city==='BOURGOIN-JALLIEU'),
    'choisir « Auvergne-Rhone-Alpes » n’exclut pas Bourgoin, qui est dans state.stores');
  assert(avecChoix.some(s=>s.city==='AUTRE VILLE ARA'),
    'le secteur choisi élargit le périmètre à ses magasins, à confirmer par l’utilisateur');
  assert.equal(avecChoix.find(s=>s.city==='AUTRE VILLE ARA').storeId,null,
    'un magasin du secteur choisi mais inconnu reste à confirmer, il n’est pas inventé');
  assert(!avecChoix.some(s=>s.city==='VALENCE CENTRE'),'le secteur choisi n’ouvre pas les autres secteurs');

  // Sans aucun cuisiniste connu, on retombe bien sur la demande de choix.
  const vierge=memory();
  const vraiState=global.state.stores;
  global.state.stores=[];
  global.__chefStorage=vierge;
  const aveugle=await V193.parseTrackingWorkbook(WB);
  assert.equal(aveugle.needsSectorChoice,true,'sans magasin connu, le secteur est demandé');
  assert.equal(aveugle.sites.length,0,'et rien n’est retenu au hasard');
  assert(aveugle.sectorsFound.length>=3,'les secteurs lisibles sont proposés');
  const SRC=require('fs').readFileSync(__dirname+'/../cuisiniste-contracts-v193.js','utf8');
  assert(!/found\[0\]/.test(SRC),'plus aucun repli sur le premier secteur trouvé');

  // --- 3, 8. Mapping prioritaire, réimport non destructif ---------------------------
  global.state.stores=vraiState;
  global.__chefStorage=memory();
  V193.saveTracking(global.__chefStorage,await V193.parseTrackingWorkbook(WB));
  const cle=V193.resolveSites(global.__chefStorage,global.state.stores).find(s=>s.city==='BOURGOIN-JALLIEU').key;
  V193.rememberMatch(global.__chefStorage,cle,'sp');
  const force=V193.resolveSites(global.__chefStorage,global.state.stores).find(s=>s.key===cle);
  assert.equal(force.storeId,'sp','le mapping manuel gagne sur tous les autres signaux');
  assert.equal(force.matchedBy,'mapping');
  V193.rememberMatch(global.__chefStorage,cle,'bj');

  V229.setStatus(global.__chefStorage,cle,'attente-signature');
  V229.addAction(global.__chefStorage,cle,{type:'relance',date:'2026-09-10',note:'Relance Bourgoin'});
  V229.setNextAction(global.__chefStorage,cle,{label:'Rappeler',dueDate:'2026-10-01',type:'relance'});
  const mappingAvant=JSON.stringify(V193.readStore(global.__chefStorage).mapping);
  const histAvant=V229.followupFor(global.__chefStorage,cle).history.length;
  V193.saveTracking(global.__chefStorage,await V193.parseTrackingWorkbook(WB));
  const apres=V229.followupFor(global.__chefStorage,cle);
  assert.equal(apres.workflowStatus,'attente-signature','le réimport conserve le statut');
  assert.equal(apres.history.length,histAvant,'le réimport conserve l’historique');
  assert.equal(apres.nextAction.label,'Rappeler','le réimport conserve la prochaine action');
  assert.equal(JSON.stringify(V193.readStore(global.__chefStorage).mapping),mappingAvant,'le mapping survit au réimport');
  assert.equal(V193.resolveSites(global.__chefStorage,global.state.stores).length,4,'le périmètre reste à quatre après réimport');

  console.log('périmètre cuisinistes multi-secteur: Bourgoin 4/4, secteur du fichier non filtrant, secteur choisi en repli, réimport non destructif');
})().catch(e=>{console.error(e);process.exit(1)});
