/* Import XLS/XLSM cuisinistes : classeurs irréguliers, périmètre réel, rapprochement.
   Toutes les fixtures sont synthétiques et anonymes : aucun fichier métier, aucun libellé
   de secteur réel, aucun nom d'onglet réel n'entre dans le dépôt. */
const assert=require('assert');
const zlib=require('zlib');

const TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c}return t})();
function crc32(buf){let c=0^-1;for(let i=0;i<buf.length;i++)c=(c>>>8)^TABLE[(c^buf[i])&0xff];return(c^-1)>>>0}
function zip(entries){const locals=[],central=[];let offset=0;for(const e of entries){const name=Buffer.from(e.name),raw=Buffer.isBuffer(e.data)?e.data:Buffer.from(e.data),body=zlib.deflateRawSync(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc32(raw),14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);locals.push(h,name,body);const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc32(raw),16);cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(raw.length,24);cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);central.push(cd,name);offset+=h.length+name.length+body.length}const c=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(c.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([Buffer.concat(locals),c,e])}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function col(i){let s='',n=i+1;while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}

/* Une feuille réelle déclare une plage bien plus large que son contenu et contient des
   milliers de lignes qui ne portent que du style. On les reproduit telles quelles. */
function sheetXml(sheet,strings,map){
  const rows=sheet.rows||[];
  let body='';
  rows.forEach((r,ri)=>{
    body+='<row r="'+(ri+1)+'">'+r.map((v,ci)=>{
      if(v===null||v===undefined||v==='')return'';
      const ref=col(ci)+(ri+1);
      if(typeof v==='number')return'<c r="'+ref+'"><v>'+v+'</v></c>';
      let id=map.get(String(v));
      if(id===undefined){id=strings.length;strings.push(String(v));map.set(String(v),id)}
      return'<c r="'+ref+'" t="s"><v>'+id+'</v></c>';
    }).join('')+'</row>';
  });
  for(let i=0;i<(sheet.styleOnlyRows||0);i++){
    const r=rows.length+1+i;
    body+='<row r="'+r+'" s="7" customFormat="1"><c r="A'+r+'" s="7"/><c r="B'+r+'" s="7"/></row>';
  }
  const dim=sheet.dimension||('A1:ZZ'+Math.max(100000,rows.length));
  return'<?xml version="1.0"?><worksheet><dimension ref="'+dim+'"/><sheetData>'+body+'</sheetData></worksheet>';
}
function workbook(sheets,extra){
  const strings=[],map=new Map(),entries=[],rels=[],names=[];
  sheets.forEach((s,i)=>{
    entries.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheetXml(s,strings,map)});
    rels.push('<Relationship Id="rId'+(i+1)+'" Target="worksheets/sheet'+(i+1)+'.xml"/>');
    /* Ordre d'attributs volontairement variable, comme les vrais classeurs. */
    names.push(s.ridFirst
      ?'<sheet r:id="rId'+(i+1)+'" sheetId="'+(i+1)+'"'+(s.hidden?' state="hidden"':'')+' name="'+esc(s.name)+'"/>'
      :'<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'"'+(s.hidden?' state="hidden"':'')+' r:id="rId'+(i+1)+'"/>');
  });
  entries.push({name:'xl/workbook.xml',data:'<?xml version="1.0"?><workbook><sheets>'+names.join('')+'</sheets></workbook>'});
  entries.push({name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0"?><Relationships>'+rels.join('')+'</Relationships>'});
  entries.push({name:'xl/sharedStrings.xml',data:'<?xml version="1.0"?><sst>'+strings.map(s=>'<si><t>'+esc(s)+'</t></si>').join('')+'</sst>'});
  for(const e of extra||[])entries.push(e);
  return zip(entries);
}

const HIT=['Secteur 2026','Magasin physique (lib)'];
const H=['Facturation','CHECK','SECTEUR','GROUPE','ENSEIGNE','VILLE CUISINISTE','GROUPEMENT','N° CLIENT','Client','DATE DÉBUT','DATE FIN','Mois Total','ANNEEMOIS DEBUT','ANNEEMOIS FIN','Statut Contrat','OBJECTIF CA','CA RÉALISÉ À DATE','MOIS','0-3 Mois <25%','4-6 Mois <50%','7-9 Mois <75%','10-12 Mois <100%','Progress','Mois restant','CA réalisé Y/N','CLOTURE','A facturer','PORTEFEUILLE Mois en cours','PDT EXPO 1'];
function contractRow(sector,brand,city,client,status,obj,real,progress,remain){
  const r=Array(H.length).fill(null);
  Object.assign(r,{2:sector,4:brand,5:city,7:client,9:46082,10:46446,14:status,15:obj,16:real,22:progress,23:remain,25:'25%',28:'EXPO1'});
  return r;
}

/* Deux secteurs, une feuille cachée inutile, des onglets renommés, des lignes vides et
   des plages artificielles : le parseur ne doit se fier qu'aux colonnes. */
const hitRows=[
  [],[],[null,'Note interne libre'],[],
  [null,'   ','   '],[null,' ',null],
  [null,HIT[0],HIT[1]],
  [null,'Secteur Alpha','SCH-VILLE UNE FR-11111'],
  [null,null,'SCH-VILLE DEUX FR-22222'],
  [null,null,'CUI-VILLE TROIS FR-33333'],
  [null,'Secteur Beta','SCH-VILLE LOIN FR-99999'],
  [null,null,'SCH-VILLE AILLEURS FR-88888'],
  [null,'Total Secteur Beta'],
];
const trackingRows=[
  H,
  contractRow('Secteur Alpha','SCHMIDT','VILLE UNE',4242,'En cours',7200,3600,.5,6),
  contractRow('Secteur Alpha','SCHMIDT','VILLE DEUX',5151,'En cours',5400,2700,.5,4),
  contractRow('Secteur Alpha','CUISINELLA','VILLE TROIS',6262,'Alerte',3600,900,.25,2),
  contractRow('Secteur Beta','SCHMIDT','VILLE LOIN',7373,'En cours',9000,4500,.5,8),
];
const SHEETS=[
  {name:'Lisez-moi',rows:[['Classeur interne'],['Ne pas diffuser']],hidden:true,styleOnlyRows:5000},
  {name:'TCD_2026_v4',rows:[['Étiquettes de lignes','Total']],styleOnlyRows:3000},
  {name:'Extraction 12',rows:hitRows,styleOnlyRows:8000,ridFirst:true},
  {name:'Base suivi (2)',rows:trackingRows,styleOnlyRows:12000},
];
const VBA=[{name:'xl/vbaProject.bin',data:Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,0,0,0,0])},
  {name:'xl/externalLinks/externalLink1.xml',data:'<?xml version="1.0"?><externalLink><externalBook/></externalLink>'},
  {name:'xl/pivotCache/pivotCacheDefinition1.xml',data:'<?xml version="1.0"?><pivotCacheDefinition/>'}];
const XLSM=workbook(SHEETS,VBA);
const XLSX=workbook(SHEETS);

function memory(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}

global.__chefStorage=memory();
global.state={stores:[],plan:{Lundi:[]},settings:{},businessV2:{visits:[],actions:[],storeSnapshots:{}}};
const V193=require('../cuisiniste-contracts-v193.js');
const V229=require('../cuisiniste-followup-v229.js');

const MES_CUISINISTES=[
  {id:'c1',enseigne:'Schmidt',ville:'Ville Une',adresse:'1 rue A 11111 Ville Une',channel:'cuisiniste',clientNumber:'4242'},
  {id:'c2',enseigne:'Schmidt',ville:'Ville Deux',adresse:'2 rue B 22222 Ville Deux',channel:'cuisiniste'},
  {id:'c3',enseigne:'Cuisinella',ville:'Ville Trois',adresse:'3 rue C 33333 Ville Trois',channel:'cuisiniste'},
  {id:'r1',enseigne:'Boulanger',ville:'Ville Une',adresse:'4 rue D 11111 Ville Une',channel:'retail'},
];

(async()=>{
  // --- 7. Plusieurs secteurs, aucun magasin connu : aucun choix silencieux ------------
  global.state.stores=[];
  const blind=await V193.parseTrackingWorkbook(XLSM);
  assert.equal(blind.needsSectorChoice,true,'sans magasin connu, aucun secteur n’est choisi tout seul');
  assert.equal(blind.sites.length,0,'aucun site n’est retenu au hasard');
  assert(blind.sectorsFound.length>=2,'les secteurs lisibles sont remontés pour que l’utilisateur tranche');
  assert.equal(blind.sector,'','aucun secteur implicite');

  // --- 1, 2, 3, 4, 5, 8, 9. Lecture .xlsm et .xlsx, périmètre réel -------------------
  global.state.stores=MES_CUISINISTES.slice();
  const stateBefore=JSON.stringify(global.state);
  const xlsm=await V193.parseTrackingWorkbook(XLSM);
  assert.equal(xlsm.needsSectorChoice,false);
  assert.deepEqual(xlsm.sites.map(s=>s.city).sort(),['VILLE DEUX','VILLE TROIS','VILLE UNE'],
    'seuls les sites qui désignent mes cuisinistes sont retenus');
  assert(!xlsm.sites.some(s=>/LOIN|AILLEURS/.test(s.key)),'les autres secteurs ne sont jamais injectés');
  assert.equal(xlsm.scanned,5,'les cinq sites du fichier ont bien été lus avant filtrage');
  assert.equal(xlsm.sector,'Secteur Alpha','le secteur affiché est déduit des sites retenus, pas choisi');
  const xlsx=await V193.parseTrackingWorkbook(XLSX);
  assert.deepEqual(xlsx.sites.map(s=>s.key),xlsm.sites.map(s=>s.key),'.xlsx et .xlsm donnent le même résultat');
  assert(!JSON.stringify(xlsm).includes('Lisez-moi'),'la feuille cachée inutile n’entre pas dans les données');
  assert(!JSON.stringify(xlsm).includes('TCD'),'le tableau croisé est ignoré');
  assert(!JSON.stringify(xlsm).includes('Extraction 12'),'aucun nom d’onglet n’est conservé');
  assert.equal(JSON.stringify(global.state),stateBefore,'aucun magasin n’est créé ni modifié par un import');

  // --- 6. Une plage style-only ne crée pas des milliers de lignes --------------------
  const files=await V193.unzip(XLSM);
  const hitSheet=V193.readSheetByColumns(files,V193.HITLIST_COLUMNS,null);
  assert(hitSheet.length<50,'les 8000 lignes de style ne deviennent pas des lignes de données · '+hitSheet.length);
  assert(!hitSheet.some(r=>r.every(c=>c==null||String(c).trim()==='')),'une ligne qui ne contient que des espaces est écartée');
  const trackingSheet=V193.readSheetByColumns(files,V193.TRACKING_COLUMNS,null);
  assert(trackingSheet.length<50,'les 12000 lignes de style du suivi sont écartées · '+trackingSheet.length);
  const sheets=V193.workbookSheets(files);
  assert.equal(sheets.length,4,'les quatre feuilles sont vues, y compris la cachée');
  assert.equal(sheets.filter(x=>x.hidden).length,1,'l’état caché est lu sans écarter la feuille d’office');
  assert(sheets.some(x=>x.name==='Extraction 12'),'les attributs dans le désordre sont lus correctement');

  // --- 10, 11, 12, 13, 14, 15. Échelle de rapprochement ------------------------------
  V193.saveTracking(global.__chefStorage,xlsm);
  let resolved=V193.resolveSites(global.__chefStorage,global.state.stores);
  const une=resolved.find(s=>s.city==='VILLE UNE');
  assert.equal(une.storeId,'c1');assert.equal(une.matchedBy,'client','le numéro client exact prime sur la ville');
  const deux=resolved.find(s=>s.city==='VILLE DEUX');
  assert.equal(deux.storeId,'c2');assert.equal(deux.matchedBy,'ville','enseigne + ville rapproche');
  const trois=resolved.find(s=>s.city==='VILLE TROIS');
  assert.equal(trois.storeId,'c3','Cuisinella est rapproché comme cuisiniste');
  assert(!resolved.some(s=>s.storeId==='r1'),'un magasin retail n’est jamais rapproché');
  assert(V193.appStoreScore({brand:'SCHMIDT',cityKey:'ville une'},MES_CUISINISTES[0])>0,'appStoreScore reste le score de référence');

  // Enseigne + code postal, quand la ville du fichier ne ressemble à aucune ville connue.
  global.state.stores=MES_CUISINISTES.concat([{id:'c4',enseigne:'Schmidt',ville:'Agglomération Nord',cp:'99999',channel:'cuisiniste'}]);
  const withPostal=await V193.parseTrackingWorkbook(XLSM);
  assert(withPostal.sites.some(s=>s.postal==='99999'),'le code postal fait entrer le site dans mon périmètre');
  V193.saveTracking(global.__chefStorage,withPostal);
  const postalSite=V193.resolveSites(global.__chefStorage,global.state.stores).find(s=>s.postal==='99999');
  assert.equal(postalSite.storeId,'c4');assert.equal(postalSite.matchedBy,'code-postal');

  // Ambiguïté : deux magasins également plausibles, aucune confirmation automatique.
  global.state.stores=MES_CUISINISTES.concat([{id:'c5',enseigne:'Schmidt',ville:'Ville Deux',channel:'cuisiniste'}]);
  const ambiguous=V193.resolveSites(global.__chefStorage,global.state.stores).find(s=>s.city==='VILLE DEUX');
  assert.equal(ambiguous.storeId,null,'deux candidats plausibles ne sont jamais tranchés tout seuls');
  assert.equal(ambiguous.candidates.length,2,'les deux candidats sont proposés au choix');

  // --- 10, 16. Le mapping confirmé prime et persiste ---------------------------------
  V193.rememberMatch(global.__chefStorage,ambiguous.key,'c5');
  const mapped=V193.resolveSites(global.__chefStorage,global.state.stores).find(s=>s.city==='VILLE DEUX');
  assert.equal(mapped.storeId,'c5');assert.equal(mapped.matchedBy,'mapping','le choix manuel prime sur tout le reste');

  // --- 17, 18, 19. Un réimport ne touche ni au suivi ni au mapping -------------------
  global.state.stores=MES_CUISINISTES.slice();
  const cle=xlsm.sites.find(s=>s.city==='VILLE UNE').key;
  V229.setStatus(global.__chefStorage,cle,'attente-signature');
  V229.addAction(global.__chefStorage,cle,{type:'relance',date:'2026-09-10',note:'Relance 1'});
  V229.setNextAction(global.__chefStorage,cle,{label:'Rappeler',dueDate:'2026-10-01',type:'relance'});
  const avant=V229.followupFor(global.__chefStorage,cle);
  const mappingAvant=JSON.stringify(V193.readStore(global.__chefStorage).mapping);
  V193.saveTracking(global.__chefStorage,await V193.parseTrackingWorkbook(XLSM));
  const apres=V229.followupFor(global.__chefStorage,cle);
  assert.equal(apres.workflowStatus,'attente-signature','le réimport conserve le statut de workflow');
  assert.equal(apres.history.length,avant.history.length,'le réimport conserve l’historique');
  assert.equal(apres.nextAction.label,'Rappeler','le réimport conserve la prochaine action');
  assert.equal(apres.nextAction.dueDate,'2026-10-01','le réimport conserve la date de relance');
  assert.equal(JSON.stringify(V193.readStore(global.__chefStorage).mapping),mappingAvant,'le réimport ne réinitialise pas le mapping');

  // Un contrat qui disparaît temporairement du fichier n'efface pas le suivi.
  const sansUne=JSON.parse(JSON.stringify(xlsm));
  sansUne.sites=sansUne.sites.filter(s=>s.city!=='VILLE UNE');
  V193.saveTracking(global.__chefStorage,sansUne);
  assert.equal(V229.followupFor(global.__chefStorage,cle).workflowStatus,'attente-signature',
    'un contrat absent d’un import ne supprime pas le suivi commercial');
  V193.saveTracking(global.__chefStorage,xlsm);

  // --- 20, 21, 22. Migration store:<id> -> site.key ---------------------------------
  const fallback=V229.fallbackKey('c2'),vraie=xlsm.sites.find(s=>s.city==='VILLE DEUX').key;
  V229.setStatus(global.__chefStorage,fallback,'proposition-presentee');
  V229.addAction(global.__chefStorage,fallback,{type:'rdv',date:'2026-08-01',note:'Visite avant import'});
  V229.addAction(global.__chefStorage,fallback,{type:'appel',date:'2026-08-15',note:'Appel de suivi'});
  V229.setNextAction(global.__chefStorage,fallback,{label:'Repasser',dueDate:'2026-11-05',type:'relance'});
  const orphelin=V229.followupFor(global.__chefStorage,fallback);
  assert(orphelin.history.length>=3,'le suivi de secours contient bien des actions');

  const sites=V193.resolveSites(global.__chefStorage,global.state.stores);
  const moved=V229.reconcileKeys(global.__chefStorage,sites);
  assert.equal(moved,1,'une seule clé de secours à migrer');
  const migre=V229.followupFor(global.__chefStorage,vraie);
  assert.equal(migre.workflowStatus,'proposition-presentee','le statut utilisateur survit à la migration');
  assert.equal(migre.nextAction.label,'Repasser','la prochaine action survit à la migration');
  assert.equal(migre.nextAction.dueDate,'2026-11-05');
  for(const row of orphelin.history)
    assert(migre.history.some(x=>x.id===row.id),'aucune action perdue : '+row.label);
  const ids=migre.history.map(x=>x.id);
  assert.equal(new Set(ids).size,ids.length,'la fusion ne duplique aucune entrée d’historique');
  assert.equal(V193.readStore(global.__chefStorage).followups[fallback],undefined,
    'la clé de secours n’est supprimée qu’après une migration réussie');
  assert.equal(V229.reconcileKeys(global.__chefStorage,sites),0,'une seconde passe ne refait rien');

  // La fusion ne doit pas écraser un suivi déjà présent sur la vraie clé.
  const cible=xlsm.sites.find(s=>s.city==='VILLE TROIS').key,repli=V229.fallbackKey('c3');
  V229.setStatus(global.__chefStorage,cible,'signe-en-cours');
  V229.addAction(global.__chefStorage,cible,{type:'signature',date:'2026-09-01',note:'Signé'});
  V229.setStatus(global.__chefStorage,repli,'a-proposer');
  V229.addAction(global.__chefStorage,repli,{type:'note',date:'2026-07-01',note:'Note ancienne'});
  V229.reconcileKeys(global.__chefStorage,V193.resolveSites(global.__chefStorage,global.state.stores));
  const fusion=V229.followupFor(global.__chefStorage,cible);
  assert.equal(fusion.workflowStatus,'signe-en-cours','le statut posé sur la vraie clé gagne');
  assert.equal(fusion.history.length,4,'les deux historiques sont réunis sans perte ni doublon');
  assert(fusion.history.some(x=>x.note==='Note ancienne'),'l’historique de la clé de secours est conservé');

  // --- 23. Aucun magasin hors périmètre ajouté dans state.stores ---------------------
  assert.equal(global.state.stores.length,MES_CUISINISTES.length,'aucun magasin créé par l’import');
  assert(!global.state.stores.some(s=>/LOIN|AILLEURS/i.test(String(s.ville))),'aucun magasin d’un autre secteur ajouté');

  // --- 3. Les macros ne sont jamais lues ni exécutées --------------------------------
  const SRC=require('fs').readFileSync(__dirname+'/../cuisiniste-contracts-v193.js','utf8');
  assert(!/vbaProject|\bFunction\s*\(|new\s+Function|eval\s*\(/.test(SRC),'aucune exécution de code embarqué');
  assert(/xl\\\/\(workbook\\.xml\|sharedStrings\\.xml\|styles\\.xml\|_rels\\\/workbook\\.xml\\.rels\|worksheets\\\/sheet\\d\+\\.xml\)/.test(SRC)
    ||/worksheets\\\/sheet/.test(SRC),'seules les entrées de feuille sont extraites du zip');

  console.log('import cuisinistes XLS/XLSM: classeur irrégulier, périmètre state.stores, échelle de rapprochement, migration de clé ok');
})().catch(e=>{console.error(e);process.exit(1)});
