/* V275 — contrats cuisinistes de groupement.
   Fixture synthétique inspirée d'un export réel : une ligne parent porte les totaux du
   contrat, puis plusieurs lignes magasins portent leur CA/portefeuille/produits. Aucune
   donnée métier réelle n'entre dans le dépôt. */
const assert=require('assert');
const zlib=require('zlib');

const TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c}return t})();
function crc32(buf){let c=0^-1;for(let i=0;i<buf.length;i++)c=(c>>>8)^TABLE[(c^buf[i])&0xff];return(c^-1)>>>0}
function zip(entries){const locals=[],central=[];let offset=0;for(const e of entries){const name=Buffer.from(e.name),raw=Buffer.from(e.data),body=zlib.deflateRawSync(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc32(raw),14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);locals.push(h,name,body);const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc32(raw),16);cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(raw.length,24);cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);central.push(cd,name);offset+=h.length+name.length+body.length}const c=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(c.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([Buffer.concat(locals),c,e])}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function col(i){let s='',n=i+1;while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function sheetXml(rows,strings,map){return'<?xml version="1.0"?><worksheet><sheetData>'+rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{if(v===null||v===undefined||v==='')return'';const ref=col(ci)+(ri+1);if(typeof v==='number')return'<c r="'+ref+'"><v>'+v+'</v></c>';let id=map.get(String(v));if(id===undefined){id=strings.length;strings.push(String(v));map.set(String(v),id)}return'<c r="'+ref+'" t="s"><v>'+id+'</v></c>'}).join('')+'</row>').join('')+'</sheetData></worksheet>'}
function workbook(hitRows,trackingRows){const strings=[],map=new Map(),entries=[],rels=[],names=[];[hitRows,trackingRows].forEach((rows,i)=>{entries.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheetXml(rows,strings,map)});rels.push('<Relationship Id="rId'+(i+1)+'" Target="worksheets/sheet'+(i+1)+'.xml"/>');names.push('<sheet name="Feuil'+(i+1)+'" r:id="rId'+(i+1)+'"/>')});entries.push({name:'xl/workbook.xml',data:'<?xml version="1.0"?><workbook><sheets>'+names.join('')+'</sheets></workbook>'});entries.push({name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0"?><Relationships>'+rels.join('')+'</Relationships>'});entries.push({name:'xl/sharedStrings.xml',data:'<?xml version="1.0"?><sst>'+strings.map(s=>'<si><t>'+esc(s)+'</t></si>').join('')+'</sst>'});return zip(entries)}

const HIT=['Secteur 2026','Magasin physique (lib)'];
const H=['SECTEUR','GROUPE','ENSEIGNE','VILLE CUISINISTE','GROUPEMENT','N° CLIENT','Client','DATE DÉBUT','DATE FIN','Statut Contrat','OBJECTIF CA','CA RÉALISÉ','Progress','Mois restant','% à facturer','€ à facturer','PORTEFEUILLE Mois en cours','PDT EXPO 1','PDT EXPO 2'];
const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
function row(values){const r=Array(H.length).fill(null);for(const [k,v] of Object.entries(values))r[ix[k]]=v;return r}
function parent(start,end,status,obj,real,progress,remain,closure,toInvoice,portfolio){
  return row({'GROUPEMENT':'GROUPE TEST','DATE DÉBUT':start,'DATE FIN':end,'Statut Contrat':status,'OBJECTIF CA':obj,'CA RÉALISÉ':real,'Progress':progress,'Mois restant':remain,'% à facturer':closure,'€ à facturer':toInvoice,'PORTEFEUILLE Mois en cours':portfolio});
}
function child(city,client,start,end,status,real,portfolio,p1,p2){
  return row({'SECTEUR':'Secteur Test','GROUPE':'SCHMIDT GROUPE','ENSEIGNE':'SCHMIDT','VILLE CUISINISTE':city,'GROUPEMENT':'GROUPE TEST','N° CLIENT':client,'Client':'SOCIETE TEST','DATE DÉBUT':start,'DATE FIN':end,'Statut Contrat':status,'CA RÉALISÉ':real,'Mois restant':status==='En cours'?3:'Fin','PORTEFEUILLE Mois en cours':portfolio,'PDT EXPO 1':p1,'PDT EXPO 2':p2});
}
const hitRows=[[null,HIT[0],HIT[1]],[null,'Secteur Test','SCH-VILLE ALPHA FR-38300'],[null,null,'SCH-VILLE BETA FR-38110']];
const currentRows=[H,parent(45992,46356,'En cours',14124,13506,.9562446899,3,'25%',294.25,2644.45),child('VILLE ALPHA',111,45992,46356,'En cours',8154,588.72,'BRBTEST','NVTEST'),child('VILLE BETA',222,45992,46356,'En cours',5352,2055.73,'-',null)];
const oldRows=[H,parent(45413,45838,'Finalisé',21600,16177.35,.7489513889,'Fin','100%',1800,2644.45),child('VILLE ALPHA',111,45413,45838,'Finalisé',13050.35,588.72,'RFOLD',null),child('VILLE BETA',222,45413,45838,'Finalisé',3127,2055.73,'-',null)];
const CURRENT=workbook(hitRows,currentRows),OLD=workbook(hitRows,oldRows),BOTH=workbook(hitRows,[H].concat(oldRows.slice(1),currentRows.slice(1)));

function memory(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
global.__chefStorage=memory();
global.state={stores:[
  {id:'a',enseigne:'Schmidt',ville:'Ville Alpha',channel:'cuisiniste',clientNumber:'111'},
  {id:'b',enseigne:'Schmidt',ville:'Ville Beta',channel:'cuisiniste',clientNumber:'222'},
],settings:{},plan:{Lundi:[]},businessV2:{visits:[],actions:[],storeSnapshots:{}}};

const V=require('../cuisiniste-contracts-v193.js');

(async()=>{
  // Nouveau vocabulaire de colonnes + structure parent/enfants dans un seul classeur.
  const both=await V.parseTrackingWorkbook(BOTH);
  assert.equal(both.sites.length,2);
  const alpha=both.sites.find(s=>s.city==='VILLE ALPHA');
  const beta=both.sites.find(s=>s.city==='VILLE BETA');
  assert(alpha&&beta);

  assert.equal(alpha.activeContract.groupContract.objective,14124,'objectif = total du groupement, jamais divisé');
  assert.equal(alpha.activeContract.groupContract.realized,13506);
  assert.equal(alpha.activeContract.groupContract.progress,.9562446899);
  assert.equal(alpha.activeContract.groupContract.toInvoice,294.25);
  assert.equal(alpha.activeContract.groupContract.memberCount,2);
  assert.equal(alpha.activeContract.storeMetrics.realized,8154,'CA magasin séparé du CA groupement');
  assert.equal(alpha.activeContract.storeMetrics.portfolio,588.72);
  assert.deepEqual(alpha.activeContract.products,['BRBTEST','NVTEST']);
  assert.equal(beta.activeContract.storeMetrics.realized,5352);
  assert.equal(beta.activeContract.storeMetrics.portfolio,2055.73);
  assert.equal(alpha.activeContract.storeMetrics.realized+beta.activeContract.storeMetrics.realized,13506);
  assert.notEqual(alpha.activeContract.groupContract.objective,7062,'aucune division silencieuse par le nombre de magasins');

  // Même période ≠ même groupement : un contrat indépendant ne doit jamais être aspiré
  // par le seul fait qu'il partage les dates du contrat parent.
  const linked=V.linkGroupContracts([
    {group:'GROUPE TEST',startDate:'2025-12-01',endDate:'2026-11-30',objective:14124,realized:13506},
    {brand:'SCHMIDT',city:'VILLE SOLO',group:'',startDate:'2025-12-01',endDate:'2026-11-30',status:'En cours',objective:7000,realized:4000}
  ]);
  assert.equal(linked.length,1);
  assert.equal(linked[0].groupContract,undefined,'la période seule ne crée jamais un faux groupement');
  assert.equal(linked[0].objective,7000,'les chiffres du contrat indépendant restent les siens');

  assert.equal(alpha.history.length,2,'les deux contrats du même magasin sont conservés');
  const previous=alpha.history.find(c=>c.status==='Finalisé');
  assert(previous);
  assert.equal(previous.groupContract.objective,21600);
  assert.equal(previous.groupContract.realized,16177.35);
  assert.equal(previous.storeMetrics.realized,13050.35);
  assert.equal(previous.groupContract.toInvoice,1800);

  // Deux fichiers sélectionnés ensemble doivent produire le même historique.
  const a=await V.parseTrackingWorkbook(OLD);
  const b=await V.parseTrackingWorkbook(CURRENT);
  const merged=V.mergeTrackingSnapshots([a,b]);
  const ma=merged.sites.find(s=>s.city==='VILLE ALPHA');
  assert.equal(merged.sourceCount,2);
  const cumul=V.mergeTrackingSnapshots([Object.assign({},merged,{sourceCount:2}),b]);
  assert.equal(cumul.sourceCount,3,'les imports mensuels séparés conservent le compte de sources');
  assert.equal(ma.history.length,2);
  assert.equal(ma.activeContract.groupContract.objective,14124);
  assert.equal(ma.activeContract.storeMetrics.realized,8154);

  // Le contrat global reste accessible à l'assistant sans écraser les métriques magasin.
  V.saveTracking(global.__chefStorage,merged);
  const resolved=V.resolveSites(global.__chefStorage,global.state.stores);
  const ra=resolved.find(s=>s.city==='VILLE ALPHA');
  assert.equal(ra.storeId,'a');
  const ctx=V.compactContext({}).cuisinistesV193.sites.find(s=>s.city==='VILLE ALPHA');
  assert.equal(ctx.groupContract.objective,14124);
  assert.equal(ctx.storeMetrics.realized,8154);
  assert.equal(ctx.historyCount,2);

  console.log('V275 cuisinistes: groupement + magasin + historique multi-fichiers ok');
})().catch(e=>{console.error(e);process.exit(1)});
