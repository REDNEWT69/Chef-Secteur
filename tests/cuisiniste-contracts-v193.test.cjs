const assert=require('assert');
const zlib=require('zlib');

const TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c}return t})();
function crc32(buf){let c=0^-1;for(let i=0;i<buf.length;i++)c=(c>>>8)^TABLE[(c^buf[i])&0xff];return(c^-1)>>>0}
function zip(entries){const locals=[],central=[];let offset=0;for(const e of entries){const name=Buffer.from(e.name),raw=Buffer.from(e.data),body=zlib.deflateRawSync(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc32(raw),14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);locals.push(h,name,body);const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc32(raw),16);cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(raw.length,24);cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);central.push(cd,name);offset+=h.length+name.length+body.length}const c=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(c.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([Buffer.concat(locals),c,e])}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function col(i){let s='',n=i+1;while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function sheetXml(rows,strings,map){return'<?xml version="1.0"?><worksheet><sheetData>'+rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{if(v===null||v===undefined||v==='')return'';const ref=col(ci)+(ri+1);if(typeof v==='number')return'<c r="'+ref+'"><v>'+v+'</v></c>';let id=map.get(String(v));if(id===undefined){id=strings.length;strings.push(String(v));map.set(String(v),id)}return'<c r="'+ref+'" t="s"><v>'+id+'</v></c>'}).join('')+'</row>').join('')+'</sheetData></worksheet>'}
function workbook(sheets){const strings=[],map=new Map(),entries=[],rels=[];const names=[];sheets.forEach((s,i)=>{entries.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheetXml(s.rows,strings,map)});rels.push('<Relationship Id="rId'+(i+1)+'" Target="worksheets/sheet'+(i+1)+'.xml"/>');names.push('<sheet name="'+esc(s.name)+'" r:id="rId'+(i+1)+'"/>')});entries.push({name:'xl/workbook.xml',data:'<?xml version="1.0"?><workbook><sheets>'+names.join('')+'</sheets></workbook>'});entries.push({name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0"?><Relationships>'+rels.join('')+'</Relationships>'});entries.push({name:'xl/sharedStrings.xml',data:'<?xml version="1.0"?><sst>'+strings.map(s=>'<si><t>'+esc(s)+'</t></si>').join('')+'</sst>'});return zip(entries)}

const hitRows=[[],[],[],[],[],[],[null,'Secteur 2026','Magasin physique (lib)'],[null,'Autre','SCH-HORS-ZONE FR-00001'],[null,'Secteur Test Nord','SCH-TEST-NORD FR-00001'],[null,null,'SCH-TEST-CENTRE FR-00002'],[null,null,'SCH-TEST-SUD FR-00003'],[null,'Total Secteur Test Nord']];
const H=['Facturation','CHECK','SECTEUR','GROUPE','ENSEIGNE','VILLE CUISINISTE','GROUPEMENT','N° CLIENT','Client','DATE DÉBUT','DATE FIN','Mois Total','ANNEEMOIS DEBUT','ANNEEMOIS FIN','Statut Contrat','OBJECTIF CA','CA RÉALISÉ À DATE ','MOIS','0-3 Mois <25%','4-6 Mois <50%','7-9 Mois <75%','10-12 Mois <100%','Progress','Mois restant','CA réalisé Y/N','CLOTURE','A facturer','PORTEFEUILLE Mois en cours','PDT EXPO 1','PDT EXPO 2','PDT EXPO 3','PDT EXPO 4','PDT EXPO 5'];
function row(sector,brand,city,client,status,obj,real,progress,remain,closure,prod,start=46082,end=46446){const r=Array(H.length).fill(null);Object.assign(r,{2:sector,4:brand,5:city,7:client,9:start,10:end,14:status,15:obj,16:real,22:progress,23:remain,25:closure,26:0,27:1234,28:prod});return r}
const trackingRows=[H,row('Zone Ancienne','SCHMIDT','TEST-NORD',111,'Finalisé',6000,7000,1.1,'Fin','gratuit','OLDREF',45597,46081),row('Zone Ancienne','SCHMIDT','TEST-NORD',111,'En cours',7200,6300,.875,6,'25%','BRBTEST',46082,46446),row('Secteur Test Nord','SCHMIDT','TEST-CENTRE',222,'Alerte',5400,2200,.407,1,'100%','MICROTEST',45930,46300),row('Zone Ancienne','SCHMIDT','TEST-SUD',333,'Finalisé',8000,9000,1.125,'Fin','gratuit','HISTREF',45200,45930),row('Bordeaux','SCHMIDT','HORS-ZONE',444,'Alerte',1,0,0,1,'100%','NOPE')];
const tracking=workbook([{name:'ONGLET_TEST',rows:hitRows},{name:'ONGLET_TEST_SUIVI',rows:trackingRows}]);
const tariffRows=[['FS/BI','Famille','Segment','Référence SCHMIDT GROUPE','Référence commerciale SAMSUNG','Référence SAP SAMSUNG\r\n (à utiliser sur les contrats expo)','Code EAN','Descriptif','Type',"Prix d'achat Magasin",'OBJECTIF Contrat Expo x12 (à mentionner sur le contrat)','INFOS'],['BI','REF','COMBINE','BRBTEST0','BRBTEST','BRBTEST',123,'Combiné test','BIP',600,7200,'']];
const tariff=workbook([{name:'SCHMIDT GROUPE',rows:tariffRows}]);

function memory(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
global.__chefStorage=memory();
global.state={stores:[{id:'s1',enseigne:'Schmidt',ville:'Test-Nord',priority:4},{id:'s2',enseigne:'Schmidt',ville:'Test-Centre',priority:3},{id:'s3',enseigne:'Schmidt',ville:'Test-Sud',priority:2}],plan:{Lundi:[]},businessV2:{visits:[],actions:[],storeSnapshots:{}}};
const api=require('../cuisiniste-contracts-v193.js');
(async()=>{
  const before=JSON.stringify(global.state);
  const t=await api.parseTrackingWorkbook(tracking);
  assert.equal(t.sector,'Secteur Test Nord');assert.equal(t.sites.length,3);assert(!t.sites.some(s=>/HORS-ZONE/.test(s.key)));
  const sp=t.sites.find(s=>s.city==='TEST-NORD');assert.equal(sp.activeContract.status,'En cours');assert.equal(sp.activeContract.objective,7200);assert.equal(sp.history.length,2);assert.equal(sp.activeContract.sector,'Zone Ancienne');
  const romans=t.sites.find(s=>/CENTRE/.test(s.city));assert.equal(romans.activeContract.status,'Alerte');assert.equal(romans.activeContract.monthsRemaining,1);
  const ville=t.sites.find(s=>s.city==='TEST-SUD');assert.equal(ville.activeContract,null);assert.equal(ville.lastContract.status,'Finalisé');
  api.saveTracking(global.__chefStorage,t);
  const p=await api.parseTariffWorkbook(tariff);assert.equal(p.products.length,1);api.saveTariff(global.__chefStorage,p);assert.equal(api.productInfo(global.__chefStorage,'BRBTEST').family,'REF');assert.equal(api.productInfo(global.__chefStorage,'HISTREF'),null);
  const resolved=api.resolveSites(global.__chefStorage,global.state.stores);assert.deepEqual(resolved.map(x=>x.storeId),['s1','s2','s3']);
  const sig=api.planningSignal('s2');assert.equal(sig.source,'Contrat expo');assert(sig.score>=100);assert(/Alerte/.test(sig.reason));
  const ctx=api.compactContext({planning:{safe:true}});assert.equal(ctx.cuisinistesV193.sector,'Secteur Test Nord');assert(ctx.cuisinistesV193.sites.length<=10);assert(!JSON.stringify(ctx).includes('ONGLET_TEST'));
  const ans=api.answer('Prépare-moi ma visite chez Test-Nord');assert(/point chiffre/i.test(ans));assert(/6 mois/.test(ans));
  assert.equal(JSON.stringify(global.state),before,'questions/import must not mutate planning or store.priority');
  console.log('V193 cuisinistes: OK · 3 Secteur Test Nord · Zone Ancienne legacy ignored · alert/history/tariff/assistant');
})().catch(e=>{console.error(e);process.exit(1)});
