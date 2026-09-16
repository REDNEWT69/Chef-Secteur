/* Store Runner V193 — suivi local des contrats expo Schmidt / Cuisinella Rhône-Alpes.
   Données lues depuis les classeurs sur l'appareil, filtrées au périmètre du hitlist 2026.
   Aucun fichier brut ni ligne hors secteur n'est conservé dans le modèle exploité. */
(function(root){
'use strict';

const STORE_KEY='store-runner-cuisine-contracts-v193';
const TARGET_REGION='Auvergne-Rhone-Alpes';
const MAX_ASSISTANT_ROWS=6;

function text(v){return String(v==null?'':v).trim()}
function norm(v){try{return text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return text(v).toLowerCase()}}
function nnum(v){if(v==null||v==='')return null;if(typeof v==='number')return Number.isFinite(v)?v:null;const s=text(v).replace(/[\s  €%]/g,'').replace(',','.');if(!/[0-9]/.test(s))return null;const n=Number(s.replace(/[^0-9.+-]/g,''));return Number.isFinite(n)?n:null}
function xmlDecode(s){return String(s||'').replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(Number(d))).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCharCode(parseInt(h,16))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')}
function u8(input){if(input instanceof Uint8Array)return input;if(input instanceof ArrayBuffer)return new Uint8Array(input);if(input&&input.buffer instanceof ArrayBuffer)return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);throw new Error('Fichier illisible.')}
async function inflateRaw(bytes){
  if(typeof DecompressionStream==='function'&&typeof Response==='function'&&typeof ReadableStream==='function'){
    const rs=new ReadableStream({start(c){c.enqueue(bytes);c.close()}});
    const buf=await new Response(rs.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();return new Uint8Array(buf);
  }
  if(typeof module!=='undefined'&&typeof require==='function')return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(bytes)));
  throw new Error('Décompression XLSX/XLSM indisponible sur cet appareil.');
}
async function unzipXml(input){
  const bytes=u8(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
  for(let i=bytes.length-22;i>=0&&i>bytes.length-66000;i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break}
  if(eocd<0)throw new Error('Ce fichier n’est pas un classeur Excel compatible.');
  const count=view.getUint16(eocd+10,true);let p=view.getUint32(eocd+16,true);const out={},decoder=new TextDecoder('utf-8');
  for(let n=0;n<count;n++){
    if(view.getUint32(p,true)!==0x02014b50)break;
    const method=view.getUint16(p+10,true),compSize=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
    const name=decoder.decode(bytes.subarray(p+46,p+46+nameLen)),lNameLen=view.getUint16(local+26,true),lExtraLen=view.getUint16(local+28,true),start=local+30+lNameLen+lExtraLen,raw=bytes.subarray(start,start+compSize);
    if(name==='xl/workbook.xml'||name==='xl/_rels/workbook.xml.rels'||name==='xl/sharedStrings.xml'||/^xl\/worksheets\/sheet\d+\.xml$/.test(name)){
      if(method!==0&&method!==8)throw new Error('Compression Excel non prise en charge.');
      out[name]=decoder.decode(method===0?raw:await inflateRaw(raw));
    }
    p+=46+nameLen+extraLen+commentLen;
  }
  return out;
}
function sharedStrings(xml){if(!xml)return[];return(xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g)||[]).map(si=>(si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>xmlDecode(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/,'$1'))).join(''))}
function colIndex(ref){const letters=String(ref||'').replace(/[^A-Z]/g,'');let n=0;for(let i=0;i<letters.length;i++)n=n*26+(letters.charCodeAt(i)-64);return n-1}
function sheetRows(xml,strings){
  const rows=[];
  for(const rowXml of String(xml||'').match(/<row\b[\s\S]*?<\/row>/g)||[]){
    const cells=[];
    for(const c of rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g)||[]){
      const ref=(c.match(/\sr="([A-Z]+\d+)"/)||[])[1],type=(c.match(/\st="([^"]+)"/)||[])[1]||'n',i=ref?colIndex(ref):cells.length;let value=null;
      if(type==='inlineStr')value=(c.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>xmlDecode(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/,'$1'))).join('');
      else{const raw=(c.match(/<v>([\s\S]*?)<\/v>/)||[])[1];if(raw!==undefined){if(type==='s')value=strings[Number(raw)]!==undefined?strings[Number(raw)]:null;else if(type==='str'||type==='e')value=xmlDecode(raw);else{const num=Number(raw);value=Number.isFinite(num)?num:null}}}
      while(cells.length<i)cells.push(null);cells[i]=value===''?null:value;
    }
    rows.push(cells);
  }
  return rows;
}
function relTargets(xml){const out={};for(const r of String(xml||'').match(/<Relationship\b[^>]*\/?>/g)||[]){const id=(r.match(/\bId="([^"]+)"/)||[])[1],target=(r.match(/\bTarget="([^"]+)"/)||[])[1];if(id&&target)out[id]=target}return out}
function targetPath(target){let t=String(target||'').replace(/^\//,'');while(t.startsWith('../'))t=t.slice(3);return t.startsWith('xl/')?t:'xl/'+t}
async function readWorkbook(input){
  const files=await unzipXml(input),book=files['xl/workbook.xml'];if(!book)throw new Error('Classeur Excel sans workbook.xml.');
  const strings=sharedStrings(files['xl/sharedStrings.xml']),rels=relTargets(files['xl/_rels/workbook.xml.rels']),sheets={};
  for(const s of book.match(/<sheet\b[^>]*\/?>/g)||[]){const name=xmlDecode((s.match(/\bname="([^"]+)"/)||[])[1]||''),rid=(s.match(/(?:r:)?id="([^"]+)"/)||[])[1],path=targetPath(rels[rid]);if(name&&files[path])sheets[name]=sheetRows(files[path],strings)}
  if(!Object.keys(sheets).length){const paths=Object.keys(files).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();paths.forEach((p,i)=>sheets['Feuille '+(i+1)]=sheetRows(files[p],strings))}
  return sheets;
}
function sheetByName(book,name){const wanted=norm(name),key=Object.keys(book||{}).find(k=>norm(k)===wanted)||Object.keys(book||{}).find(k=>norm(k).includes(wanted));return key?book[key]:null}
function headerIndex(row,patterns){const hs=(row||[]).map(norm);for(const p of patterns){const w=norm(p),i=hs.findIndex(x=>x===w||x.includes(w));if(i>=0)return i}return-1}
function findHeader(rows,must){for(let i=0;i<(rows||[]).length;i++){const h=(rows[i]||[]).map(norm);if(must.every(x=>h.some(v=>v===norm(x)||v.includes(norm(x)))))return{i,row:rows[i]};}return null}
function excelDate(v){
  if(typeof v==='number'&&Number.isFinite(v)&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*86400000));return d.toISOString().slice(0,10)}
  const s=text(v);if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const d=new Date(s);return isNaN(d)?s:d.toISOString().slice(0,10)
}
function brandFromHitlist(label){const n=norm(label);if(n.startsWith('sch '))return'Schmidt';if(n.startsWith('cui ')||n.startsWith('cuisinella '))return'Cuisinella';return''}
function cityKey(v){const parts=norm(v).split(' ').filter(Boolean).map(x=>x==='st'?'saint':x).filter(x=>x.length>1);if(parts[parts.length-1]==='e')parts.pop();return parts.join(' ')}
function hitlistInfo(label){
  const raw=text(label),postal=((raw.match(/FR[- ]?(\d{5})/i)||[])[1]||'');let city=raw.replace(/^(SCH|CUI|CUISINELLA)[- ]+/i,'').replace(/\s+FR[- ]?\d{5}.*$/i,'').trim();
  if(/\sE$/i.test(city)&&city.split(/\s+/).length>3)city=city.replace(/\sE$/i,'');
  return{key:norm(raw),label:raw,brand:brandFromHitlist(raw),city:city,cityKey:cityKey(city),postal:postal};
}
function parseHitlist(rows){
  const hdr=findHeader(rows,['Secteur 2026','Magasin physique']);if(!hdr)throw new Error('Onglet HITLIST : colonnes Secteur 2026 / Magasin physique introuvables.');
  const sIdx=headerIndex(hdr.row,['Secteur 2026']),mIdx=headerIndex(hdr.row,['Magasin physique']),out=[];let current='';
  for(let i=hdr.i+1;i<rows.length;i++){
    const r=rows[i]||[],sector=text(r[sIdx]),label=text(r[mIdx]);if(sector)current=sector;
    if(/^total\b/i.test(sector)||/^total\b/i.test(label))continue;
    if(norm(current)!==norm(TARGET_REGION)||!label)continue;
    out.push(Object.assign(hitlistInfo(label),{sourceRow:i+1,sector:TARGET_REGION}));
  }
  const unique=[];const seen=new Set();for(const x of out)if(!seen.has(x.key)){seen.add(x.key);unique.push(x)}return unique;
}
function contractHeaders(row){return{
  sector:headerIndex(row,['SECTEUR']),group:headerIndex(row,['GROUPE']),brand:headerIndex(row,['ENSEIGNE']),city:headerIndex(row,['VILLE CUISINISTE']),clientNo:headerIndex(row,['N° CLIENT','N CLIENT']),client:headerIndex(row,['Client']),
  start:headerIndex(row,['DATE DÉBUT','DATE DEBUT']),end:headerIndex(row,['DATE FIN']),status:headerIndex(row,['Statut Contrat']),objective:headerIndex(row,['OBJECTIF CA']),realized:headerIndex(row,['CA RÉALISÉ À DATE','CA REALISE A DATE']),progress:headerIndex(row,['Progress']),monthsRemaining:headerIndex(row,['Mois restant']),closure:headerIndex(row,['CLOTURE']),bill:headerIndex(row,['A facturer']),portfolio:headerIndex(row,['PORTEFEUILLE Mois en cours']),product1:headerIndex(row,['PDT EXPO 1'])
}}
function valueAt(r,i){return i>=0?r[i]:null}
function progressPct(v){const n=nnum(v);if(n==null)return null;return Math.round((Math.abs(n)<=2?n*100:n)*10)/10}
function parseContracts(rows){
  const hdr=findHeader(rows,['VILLE CUISINISTE','Statut Contrat','OBJECTIF CA']);if(!hdr)throw new Error('Onglet Suivi contrats exposition : en-têtes attendus introuvables.');
  const h=contractHeaders(hdr.row),out=[];
  for(let i=hdr.i+1;i<rows.length;i++){
    const r=rows[i]||[],city=text(valueAt(r,h.city));if(!city)continue;const products=[];if(h.product1>=0)for(let c=h.product1;c<h.product1+5;c++){const v=text(r[c]);if(v)products.push(v)}
    out.push({sourceRow:i+1,oldSector:text(valueAt(r,h.sector)),group:text(valueAt(r,h.group)),brand:text(valueAt(r,h.brand)),city,cityKey:cityKey(city),clientNo:text(valueAt(r,h.clientNo)),client:text(valueAt(r,h.client)),start:excelDate(valueAt(r,h.start)),end:excelDate(valueAt(r,h.end)),status:text(valueAt(r,h.status)),objective:nnum(valueAt(r,h.objective)),realized:nnum(valueAt(r,h.realized)),progressPct:progressPct(valueAt(r,h.progress)),monthsRemaining:valueAt(r,h.monthsRemaining)==null?'':valueAt(r,h.monthsRemaining),closure:text(valueAt(r,h.closure)),bill:nnum(valueAt(r,h.bill)),portfolio:nnum(valueAt(r,h.portfolio)),products});
  }
  return out;
}
function isFinalStatus(v){return/(final|termin|clos|clotur)/.test(norm(v))}
function isActiveContract(c,today){const n=norm(c&&c.status);if(!c||isFinalStatus(n))return false;if(n==='en cours'||n==='alerte')return true;const t=today||new Date().toISOString().slice(0,10);return !!(c.start&&c.end&&c.start<=t&&c.end>=t)}
function latestByStart(rows){return rows.slice().sort((a,b)=>String(b.start||'').localeCompare(String(a.start||''))||String(b.end||'').localeCompare(String(a.end||'')))[0]||null}
function buildScope(hitlist,contracts,options){
  const today=options&&options.today||new Date().toISOString().slice(0,10),result=[];
  for(const hit of hitlist){
    const matches=contracts.filter(c=>c.cityKey===hit.cityKey&&(!hit.brand||!c.brand||norm(c.brand).includes(norm(hit.brand))||norm(hit.brand).includes(norm(c.brand))));
    const active=matches.filter(c=>isActiveContract(c,today)),past=matches.filter(c=>!active.includes(c));
    result.push(Object.assign({},hit,{contracts:matches,currentContract:latestByStart(active),lastContract:latestByStart(past)}));
  }
  return result;
}
async function parseFollowUp(input,options){
  const book=await readWorkbook(input),hitRows=sheetByName(book,'HITLIST SECTEUR (VALEURS)'),contractRows=sheetByName(book,'Suivi contrats exposition');
  if(!hitRows)throw new Error('Onglet « HITLIST SECTEUR (VALEURS) » introuvable.');if(!contractRows)throw new Error('Onglet « Suivi contrats exposition » introuvable.');
  const hitlist=parseHitlist(hitRows),contracts=parseContracts(contractRows),stores=buildScope(hitlist,contracts,options);
  if(!stores.length)throw new Error('Aucun magasin « '+TARGET_REGION+' » trouvé dans le hitlist 2026.');
  return{version:1,region:TARGET_REGION,importedAt:new Date().toISOString(),fileName:options&&options.fileName||'',stores};
}
function refKey(v){return text(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function parseTariffRows(rows){
  const hdr=findHeader(rows,['Famille','Référence SCHMIDT GROUPE','Référence commerciale SAMSUNG']);if(!hdr)throw new Error('Fichier tarifs : colonnes Référence / Famille introuvables.');
  const h=hdr.row,idx={fs:headerIndex(h,['FS/BI']),family:headerIndex(h,['Famille']),segment:headerIndex(h,['Segment']),schmidt:headerIndex(h,['Référence SCHMIDT GROUPE']),commercial:headerIndex(h,['Référence commerciale SAMSUNG']),sap:headerIndex(h,['Référence SAP SAMSUNG']),desc:headerIndex(h,['Descriptif']),type:headerIndex(h,['Type']),price:headerIndex(h,["Prix d'achat Magasin"]),objective:headerIndex(h,['OBJECTIF Contrat Expo x12'])},products=[];
  for(let i=hdr.i+1;i<rows.length;i++){const r=rows[i]||[],refs=[text(valueAt(r,idx.schmidt)),text(valueAt(r,idx.commercial)),text(valueAt(r,idx.sap))].filter(Boolean);if(!refs.length)continue;products.push({sourceRow:i+1,fsBi:text(valueAt(r,idx.fs)),family:text(valueAt(r,idx.family)),segment:text(valueAt(r,idx.segment)),schmidtRef:refs[0]||'',commercialRef:text(valueAt(r,idx.commercial)),sapRef:text(valueAt(r,idx.sap)),description:text(valueAt(r,idx.desc)),type:text(valueAt(r,idx.type)),storePrice:nnum(valueAt(r,idx.price)),contractObjective12:nnum(valueAt(r,idx.objective)),keys:Array.from(new Set(refs.map(refKey)))})}
  return products;
}
async function parseTariff(input,options){const book=await readWorkbook(input),key=Object.keys(book).find(k=>norm(k).includes('schmidt'))||Object.keys(book)[0];if(!key)throw new Error('Aucune feuille dans le fichier tarifs.');return{version:1,importedAt:new Date().toISOString(),fileName:options&&options.fileName||'',products:parseTariffRows(book[key])}}
function emptyStore(){return{version:1,imports:[],tariffImports:[],mapping:{}}}
function storageDb(db){try{return db||root.__chefStorage||root.localStorage||null}catch(e){return db||null}}
function readStore(db){const s=storageDb(db);if(!s)return emptyStore();try{const v=JSON.parse(s.getItem(STORE_KEY)||'null');return v&&typeof v==='object'?Object.assign(emptyStore(),v):emptyStore()}catch(e){return emptyStore()}}
function writeStore(db,data){const s=storageDb(db);if(s)s.setItem(STORE_KEY,JSON.stringify(data));return data}
function saveSnapshot(db,snapshot){const data=readStore(db);data.imports.push(snapshot);writeStore(db,data);return snapshot}
function saveTariff(db,snapshot){const data=readStore(db);data.tariffImports.push(snapshot);writeStore(db,data);return snapshot}
function latestSnapshot(db){const a=readStore(db).imports;return a.length?a[a.length-1]:null}
function latestTariff(db){const a=readStore(db).tariffImports;return a.length?a[a.length-1]:null}
function sameBrand(a,b){const x=norm(a),y=norm(b);if(!x||!y)return true;return x.includes(y)||y.includes(x)}
function matchStores(snapshot,stateStores,mapping){
  const list=Array.isArray(stateStores)?stateStores:[],saved=mapping||{},rows=[];
  for(const target of (snapshot&&snapshot.stores)||[]){
    const mapped=saved[target.key],mappedStore=mapped&&list.find(s=>String(s.id)===String(mapped));if(mappedStore){rows.push(Object.assign({},target,{storeId:String(mappedStore.id),store:mappedStore,matchedBy:'mapping'}));continue}
    const candidates=list.filter(s=>sameBrand(target.brand,s.enseigne)&&cityKey(s.ville)===target.cityKey);
    if(candidates.length===1)rows.push(Object.assign({},target,{storeId:String(candidates[0].id),store:candidates[0],matchedBy:'auto'}));
    else rows.push(Object.assign({},target,{storeId:null,store:null,matchedBy:null,candidates:candidates.map(s=>({id:String(s.id),label:text(s.enseigne)+' · '+text(s.ville)}))}));
  }
  return rows;
}
function rememberMatch(db,key,storeId){const data=readStore(db);if(storeId)data.mapping[key]=String(storeId);else delete data.mapping[key];writeStore(db,data);return data.mapping}
function tariffLookup(tariff,ref){const k=refKey(ref);if(!k||!tariff)return null;return(tariff.products||[]).find(p=>(p.keys||[]).includes(k))||null}
function enrichContract(contract,tariff){if(!contract)return null;return Object.assign({},contract,{productsEnriched:(contract.products||[]).map(ref=>({ref,tariff:tariffLookup(tariff,ref)}))})}
function urgency(row){
  const c=row&&row.currentContract;if(!c)return{score:0,level:'info',reasons:['Aucun contrat actif trouvé : situation à qualifier, sans urgence automatique.']};
  const reasons=[];let score=0;if(norm(c.status)==='alerte'){score=Math.max(score,100);reasons.push('Statut source : Alerte')}
  const m=nnum(c.monthsRemaining);if(m!=null&&m<=1){score=Math.max(score,90);reasons.push('Fin de période très proche')}else if(m!=null&&m<=3){score=Math.max(score,70);reasons.push('Fin de période proche')}
  if(m!=null&&m<=3&&c.progressPct!=null&&c.progressPct<75){score=Math.max(score,85);reasons.push('Progression inférieure à 75 % avec peu de temps restant')}
  return{score,level:score>=90?'alerte':score>=70?'attention':'normal',reasons};
}
function dashboard(db,stateStores){
  const snap=latestSnapshot(db);if(!snap)return{region:TARGET_REGION,rows:[],importedAt:null,tariffImportedAt:null};const data=readStore(db),tariff=latestTariff(db),rows=matchStores(snap,stateStores||(root.state&&root.state.stores)||[],data.mapping).map(r=>Object.assign({},r,{currentContract:enrichContract(r.currentContract,tariff),lastContract:enrichContract(r.lastContract,tariff),urgency:null}));
  rows.forEach(r=>r.urgency=urgency(r));return{region:snap.region,importedAt:snap.importedAt,tariffImportedAt:tariff&&tariff.importedAt||null,rows};
}
function rowForStore(db,storeId,stateStores){return dashboard(db,stateStores).rows.find(r=>String(r.storeId)===String(storeId))||null}
function eur(v){return v==null?'—':Math.round(v).toLocaleString('fr-FR')+' €'}
function pct(v){return v==null?'—':String(Math.round(v*10)/10).replace('.',',')+' %'}
function rowSummary(r){const c=r&&r.currentContract,last=r&&r.lastContract;if(c)return(r.brand+' '+r.city+' · '+(c.status||'Contrat actif')+' · '+pct(c.progressPct)+' de '+eur(c.objective)+' · réalisé '+eur(c.realized)+(text(c.monthsRemaining)?' · '+text(c.monthsRemaining)+' mois restant(s)':'');if(last)return r.brand+' '+r.city+' · aucun contrat actif · dernier contrat '+(last.status||'historique')+' terminé '+(last.end||'date inconnue')+' · '+pct(last.progressPct);return r.brand+' '+r.city+' · aucun contrat actif trouvé'}
function tipsFor(r){
  const c=r&&r.currentContract,tips=[];
  if(c){tips.push('Faire un point chiffre avec le décisionnaire et valider l’avancement réel du contrat.');tips.push('Vérifier la présence et l’état des produits d’exposition ainsi que les références prévues au contrat.');tips.push('Qualifier le besoin de classroom / rappel produits avec l’équipe.');tips.push('Recueillir les sujets techniques, SAV ou ADV à suivre.');}
  else{tips.push('Qualifier la situation avec le décisionnaire : business actuel, concurrence et perception Samsung.');tips.push('Faire un point chiffre avant toute proposition de nouveau contrat.');tips.push('Proposer une classroom si elle est pertinente avant de travailler un contrat d’exposition.');}
  return tips;
}
function requestedRow(textValue,rows){const n=norm(textValue);let best=null,score=0;for(const r of rows){const c=cityKey(r.city),b=norm(r.brand+' '+r.city);let s=0;if(c&&n.includes(c))s=c.length+20;else for(const t of c.split(' ').filter(x=>x.length>3))if(n.includes(t))s+=6;if(b&&n.includes(b))s+=20;if(s>score){score=s;best=r}}return score>=6?best:null}
function assistantAnswer(textValue){
  const board=dashboard(null,(root.state&&root.state.stores)||[]);if(!board.rows.length)return null;const n=norm(textValue),specific=requestedRow(textValue,board.rows);
  if(specific&&/(prepare|prépar|visite|ou en est|où en est|contrat|expo|suivi)/.test(n)){let out=rowSummary(specific);if(/prepare|prépar|visite|piste|conseil/.test(n))out+='\nPistes à vérifier :\n'+tipsFor(specific).map(x=>'• '+x).join('\n');return out}
  if(/alerte/.test(n)){const rows=board.rows.filter(r=>r.currentContract&&norm(r.currentContract.status)==='alerte');return rows.length?'Contrats expo en alerte :\n'+rows.map(r=>'• '+rowSummary(r)).join('\n'):'Aucun contrat du périmètre Rhône-Alpes n’est marqué « Alerte » dans le dernier import.'}
  if(/fin de periode|fin de période|arriv.*fin|echeance|échéance/.test(n)){const rows=board.rows.filter(r=>r.currentContract&&nnum(r.currentContract.monthsRemaining)!=null).sort((a,b)=>nnum(a.currentContract.monthsRemaining)-nnum(b.currentContract.monthsRemaining));return rows.length?'Contrats par proximité de fin de période :\n'+rows.map(r=>'• '+rowSummary(r)).join('\n'):'Aucun mois restant exploitable dans le dernier import.'}
  if(/cuisiniste|contrat expo|contrats expo|dois je suivre|a suivre|à suivre/.test(n)){const rows=board.rows.slice().sort((a,b)=>(b.urgency&&b.urgency.score||0)-(a.urgency&&a.urgency.score||0));return'Rhône-Alpes · suivi cuisinistes :\n'+rows.map(r=>'• '+rowSummary(r)+(r.urgency&&r.urgency.reasons.length?' · '+r.urgency.reasons[0]:'')).join('\n')}
  return null;
}
function assistantContext(context){const board=dashboard(null,(root.state&&root.state.stores)||[]);if(!board.rows.length)return context||{};const out=context||{};out.cuisineContractsV193={region:board.region,rules:{scope:'HITLIST Secteur 2026 uniquement',planningSignal:'séparé de Performance P1/P2',contractReminder:'minimum 2, maximum 5 produits ; période de référence 12 mois ; clôture source du fichier conservée'},stores:board.rows.slice(0,MAX_ASSISTANT_ROWS).map(r=>({storeId:r.storeId,brand:r.brand,city:r.city,matched:!!r.storeId,current:r.currentContract?{status:r.currentContract.status,start:r.currentContract.start,end:r.currentContract.end,objective:r.currentContract.objective,realized:r.currentContract.realized,progressPct:r.currentContract.progressPct,monthsRemaining:r.currentContract.monthsRemaining,closure:r.currentContract.closure,bill:r.currentContract.bill,portfolio:r.currentContract.portfolio,products:(r.currentContract.productsEnriched||[]).map(p=>({ref:p.ref,family:p.tariff&&p.tariff.family||null,segment:p.tariff&&p.tariff.segment||null,description:p.tariff&&p.tariff.description||null,storePrice:p.tariff&&p.tariff.storePrice||null,contractObjective12:p.tariff&&p.tariff.contractObjective12||null}))}:null,last:r.lastContract?{status:r.lastContract.status,end:r.lastContract.end,progressPct:r.lastContract.progressPct,closure:r.lastContract.closure}:null,urgency:r.urgency}))};return out}

const api={STORE_KEY,TARGET_REGION,norm,nnum,readWorkbook,parseHitlist,parseContracts,buildScope,parseFollowUp,parseTariffRows,parseTariff,emptyStore,readStore,writeStore,saveSnapshot,saveTariff,latestSnapshot,latestTariff,matchStores,rememberMatch,tariffLookup,enrichContract,dashboard,rowForStore,urgency,rowSummary,tipsFor,assistantAnswer,assistantContext,excelDate,cityKey};
root.StoreRunnerCuisineV193=api;
if(typeof root.storeRunnerRegisterAssistantResolver==='function')root.storeRunnerRegisterAssistantResolver(assistantAnswer,30);
if(typeof root.storeRunnerRegisterAssistantContextTransform==='function')root.storeRunnerRegisterAssistantContextTransform(assistantContext,80);
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
