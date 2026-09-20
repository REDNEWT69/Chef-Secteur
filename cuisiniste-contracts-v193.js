/* Store Runner V193 — suivi local des contrats d’exposition cuisinistes, limité au secteur
   du fichier importé. Aucun libellé de secteur ni nom d’onglet réel n’est écrit ici. */
(function(root){
'use strict';

const STORE_KEY='store-runner-cuisiniste-contracts-v193';
/* Dépôt public : aucun libellé de secteur ni nom d'onglet réel n'est écrit ici. Le secteur
   à conserver vient des réglages ou, à défaut, du fichier importé lui-même ; les onglets
   sont retrouvés par leurs colonnes, pas par leur nom. */
const HITLIST_COLUMNS=['Secteur 2026','Magasin physique (lib)'];
const TRACKING_COLUMNS=['ENSEIGNE','VILLE CUISINISTE','N° CLIENT','Statut Contrat','OBJECTIF CA','CA RÉALISÉ À DATE'];
const MENU_BTN_ID='srCuisineMenuButton';
const SHEET_ID='srCuisineSheet';
const STORE_CARD_ID='srCuisineContractCard';
const MAX_ASSISTANT_ROWS=10;
let sheet=null,visitObserver=null,quickObserver=null,renderQueued=false;

function text(v){return String(v==null?'':v).trim()}
function norm(v){try{return text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return text(v).toLowerCase()}}
function db(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function stores(){try{return Array.isArray(root.state&&root.state.stores)?root.state.stores:[]}catch(e){return[]}}
function emptyStore(){return{schema:1,trackingImports:[],tariffImports:[],mapping:{},followups:{}}}
function readStore(storage){try{const raw=storage&&storage.getItem(STORE_KEY);if(!raw)return emptyStore();const p=JSON.parse(raw)||{};return{schema:1,trackingImports:Array.isArray(p.trackingImports)?p.trackingImports:[],tariffImports:Array.isArray(p.tariffImports)?p.tariffImports:[],mapping:p.mapping&&typeof p.mapping==='object'?p.mapping:{},
/* Le suivi commercial V229 vit dans ce même stockage. readStore reconstruit l'objet, donc
   toute clé non reprise ici serait effacée au premier writeStore — un import de suivi
   aurait suffi à perdre l'historique d'actions. On la conserve explicitement. */
followups:p.followups&&typeof p.followups==='object'&&!Array.isArray(p.followups)?p.followups:{}}}catch(e){return emptyStore()}}
function writeStore(storage,data){if(!storage)return data;storage.setItem(STORE_KEY,JSON.stringify(data));return data}
function nowIso(){return new Date().toISOString()}
function latestTracking(storage){const a=readStore(storage).trackingImports;return a.length?a[a.length-1]:null}
function latestTariff(storage){const a=readStore(storage).tariffImports;return a.length?a[a.length-1]:null}
function saveTracking(storage,snapshot){const d=readStore(storage),s=Object.assign({},snapshot,{importedAt:snapshot.importedAt||nowIso()});d.trackingImports.push(s);writeStore(storage,d);return s}
function saveTariff(storage,snapshot){const d=readStore(storage),s=Object.assign({},snapshot,{importedAt:snapshot.importedAt||nowIso()});d.tariffImports.push(s);writeStore(storage,d);return s}
function rememberMatch(storage,key,storeId){const d=readStore(storage);if(storeId)d.mapping[String(key)]=String(storeId);else delete d.mapping[String(key)];writeStore(storage,d);return d.mapping}

async function inflateRaw(bytes){
  if(typeof DecompressionStream==='function'&&typeof Response==='function'&&typeof ReadableStream==='function'){
    const rs=new ReadableStream({start(c){c.enqueue(bytes);c.close()}});
    return new Uint8Array(await new Response(rs.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  if(typeof module!=='undefined'&&typeof require==='function')return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(bytes)));
  throw new Error('Décompression indisponible sur cet appareil.');
}
function u8(input){if(input instanceof Uint8Array)return input;if(input instanceof ArrayBuffer)return new Uint8Array(input);if(input&&input.buffer instanceof ArrayBuffer)return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);throw new Error('Fichier illisible.')}
async function unzip(input){
  const bytes=u8(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
  for(let i=bytes.length-22;i>=0&&i>bytes.length-66000;i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break}
  if(eocd<0)throw new Error('Ce fichier n’est pas un classeur Excel compatible.');
  const count=view.getUint16(eocd+10,true);let p=view.getUint32(eocd+16,true),out={},decoder=new TextDecoder('utf-8');
  for(let n=0;n<count;n++){
    if(view.getUint32(p,true)!==0x02014b50)break;
    const method=view.getUint16(p+10,true),compSize=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
    const name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));
    if(/^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(name)){
      const ln=view.getUint16(local+26,true),le=view.getUint16(local+28,true),start=local+30+ln+le,raw=bytes.subarray(start,start+compSize);
      if(method!==0&&method!==8)throw new Error('Compression Excel non prise en charge.');
      out[name]=decoder.decode(method===0?raw:await inflateRaw(raw));
    }
    p+=46+nameLen+extraLen+commentLen;
  }
  return out;
}
function unescapeXml(s){return String(s).replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(Number(d))).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCharCode(parseInt(h,16))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')}
function sharedStrings(xml){if(!xml)return[];return(xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g)||[]).map(si=>(si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>unescapeXml(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/,'$1'))).join(''))}
function colIndex(ref){const letters=String(ref||'').replace(/[^A-Z]/g,'');let n=0;for(let i=0;i<letters.length;i++)n=n*26+(letters.charCodeAt(i)-64);return n-1}
function sheetRows(xml,strings){
  const rows=[];
  for(const rowXml of (xml||'').match(/<row\b[\s\S]*?<\/row>/g)||[]){
    const cells=[];
    for(const c of rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g)||[]){
      const ref=(c.match(/\sr="([A-Z]+\d+)"/)||[])[1],type=(c.match(/\st="([^"]+)"/)||[])[1]||'n',i=ref?colIndex(ref):cells.length;let value=null;
      if(type==='inlineStr')value=(c.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>unescapeXml(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/,'$1'))).join('');
      else{const raw=(c.match(/<v>([\s\S]*?)<\/v>/)||[])[1];if(raw!==undefined){if(type==='s')value=strings[Number(raw)]!==undefined?strings[Number(raw)]:null;else if(type==='str'||type==='e')value=unescapeXml(raw);else if(type==='b')value=raw==='1';else{const n=Number(raw);value=Number.isFinite(n)?n:null}}}
      while(cells.length<i)cells.push(null);cells[i]=value===''?null:value;
    }
    rows.push(cells);
  }
  return rows;
}
function workbookSheets(files){
  const wb=files['xl/workbook.xml']||'',rels=files['xl/_rels/workbook.xml.rels']||'',out=[];
  for(const m of wb.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)){
    const name=unescapeXml(m[1]),rid=m[2],rx=new RegExp('<Relationship\\b[^>]*Id="'+rid.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"[^>]*Target="([^"]+)"[^>]*/>'),r=rels.match(rx);if(!r)continue;
    let target=unescapeXml(r[1]).replace(/^\//,'');if(!/^xl\//.test(target))target='xl/'+target.replace(/^\.\//,'');target=target.replace(/xl\/worksheets\/\.\.\//g,'xl/');
    out.push({name,target});
  }
  return out;
}
function readNamedSheet(files,name){const sh=workbookSheets(files).find(s=>norm(s.name)===norm(name));if(!sh||!files[sh.target])throw new Error('Onglet « '+name+' » introuvable dans ce fichier.');return sheetRows(files[sh.target],sharedStrings(files['xl/sharedStrings.xml']))}
function setting(key){try{const v=root.state&&root.state.settings&&root.state.settings[key];return text(v)}catch(e){return''}}
/* On cherche la feuille qui porte les colonnes attendues. Un nom d'onglet configuré dans
   les réglages est essayé d'abord, pour les classeurs qui s'écartent de la forme connue. */
function readSheetByColumns(files,required,settingKey){
  const configured=settingKey?setting(settingKey):'';
  if(configured){try{return readNamedSheet(files,configured)}catch(e){}}
  const strings=sharedStrings(files['xl/sharedStrings.xml']);
  for(const sh of workbookSheets(files)){
    if(!files[sh.target])continue;
    let rows;try{rows=sheetRows(files[sh.target],strings)}catch(e){continue}
    if(findHeaderRow(rows,required)>=0)return rows;
  }
  throw new Error('Onglet introuvable : aucune feuille ne porte les colonnes attendues ('+required.slice(0,2).join(' / ')+').');
}
function headerIndex(row,label){const n=norm(label);for(let i=0;i<(row||[]).length;i++)if(norm(row[i])===n)return i;return-1}
function findHeaderRow(rows,required){for(let r=0;r<rows.length;r++){const ns=(rows[r]||[]).map(norm);if(required.every(x=>ns.includes(norm(x))))return r}return-1}
function excelDate(v){if(!v)return'';if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10);const n=Number(v);if(!Number.isFinite(n))return text(v);const ms=Date.UTC(1899,11,30)+Math.round(n)*86400000;return new Date(ms).toISOString().slice(0,10)}
function number(v){if(v==null||v==='')return null;if(typeof v==='number')return Number.isFinite(v)?v:null;const s=text(v).replace(/[\s€%]/g,'').replace(',','.').replace(/[^0-9.+-]/g,'');const n=Number(s);return Number.isFinite(n)?n:null}
function cleanClient(v){const n=number(v);return n!=null?String(Math.trunc(n)):text(v)}
function cityKey(v){let n=norm(v).replace(/^st\s+/,'saint ');n=n.replace(/\bst\b/g,'saint');return n.replace(/\s+/g,' ').trim()}
function parseHitLabel(label){const raw=text(label),m=raw.match(/^(SCH|CUI)-(.+?)\s+FR-(\d{5})$/i);if(!m)return null;let city=m[2].replace(/\s+E$/i,'').trim();return{key:raw,brand:m[1].toUpperCase()==='SCH'?'SCHMIDT':'CUISINELLA',city,cityKey:cityKey(city),postal:m[3],label:raw}}
/* Le secteur retenu : celui des réglages s'il est renseigné, sinon le plus représenté dans
   le fichier importé. Aucune valeur réelle n'est écrite dans le code. */
function sectorsIn(rows,hr,si){
  const tally=new Map();let current='';
  for(let i=hr+1;i<rows.length;i++){
    const v=text(rows[i][si]);if(v)current=v;
    if(!current||/^total\b/i.test(norm(current)))continue;
    tally.set(current,(tally.get(current)||0)+1);
  }
  return[...tally.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
}
function extractHitlist(rows,wanted){
  const hr=findHeaderRow(rows,HITLIST_COLUMNS);if(hr<0)throw new Error('Colonnes « '+HITLIST_COLUMNS.join(' / ')+' » introuvables.');
  const si=headerIndex(rows[hr],HITLIST_COLUMNS[0]),mi=headerIndex(rows[hr],HITLIST_COLUMNS[1]);
  const found=sectorsIn(rows,hr,si);
  const target=text(wanted)||setting('cuisinisteSector')||found[0]||'';
  if(!target)throw new Error('Aucun secteur lisible dans le hitlist de ce fichier.');
  let current='';const out=[];
  for(let i=hr+1;i<rows.length;i++){const s=text(rows[i][si]);if(s)current=s;if(norm(current)==='total '+norm(target))break;if(norm(current)!==norm(target))continue;const rec=parseHitLabel(rows[i][mi]);if(rec)out.push(rec)}
  if(!out.length)throw new Error('Aucun magasin du secteur « '+target+' » trouvé dans le hitlist.');
  out.sector=target;return out;
}
function trackingHeader(rows){const hr=findHeaderRow(rows,TRACKING_COLUMNS);if(hr<0)throw new Error('Colonnes du suivi contrats introuvables.');const row=rows[hr],idx={};for(let i=0;i<row.length;i++)if(row[i]!=null)idx[norm(row[i])]=i;return{hr,idx}}
function idxOf(idx,label){return idx[norm(label)]==null?-1:idx[norm(label)]}
function rowValue(row,idx,label){const i=idxOf(idx,label);return i<0?null:row[i]}
function contractFromRow(row,idx){
  const products=[];for(let i=1;i<=5;i++){const v=text(rowValue(row,idx,'PDT EXPO '+i));if(v)products.push(v)}const progress=number(rowValue(row,idx,'Progress'));
  return{sector:text(rowValue(row,idx,'SECTEUR')),brand:text(rowValue(row,idx,'ENSEIGNE')).toUpperCase(),city:text(rowValue(row,idx,'VILLE CUISINISTE')),clientNumber:cleanClient(rowValue(row,idx,'N° CLIENT')),client:text(rowValue(row,idx,'Client')),group:text(rowValue(row,idx,'GROUPEMENT')),startDate:excelDate(rowValue(row,idx,'DATE DÉBUT')),endDate:excelDate(rowValue(row,idx,'DATE FIN')),status:text(rowValue(row,idx,'Statut Contrat')),objective:number(rowValue(row,idx,'OBJECTIF CA')),realized:number(rowValue(row,idx,'CA RÉALISÉ À DATE')),progress,monthsRemaining:number(rowValue(row,idx,'Mois restant')),closure:text(rowValue(row,idx,'CLOTURE')),toInvoice:rowValue(row,idx,'A facturer'),portfolio:number(rowValue(row,idx,'PORTEFEUILLE Mois en cours')),products};
}
function activeStatus(v){const n=norm(v);return !!n&&!/(finalis|termine|clotur|closed)/.test(n)}
function latestByDate(rows){return rows.slice().sort((a,b)=>String(b.endDate||b.startDate||'').localeCompare(String(a.endDate||a.startDate||'')))[0]||null}
function matchHitToContract(hit,c){if(!c)return false;if(norm(c.brand)!==norm(hit.brand))return false;const a=cityKey(c.city),b=hit.cityKey;if(a===b)return true;if(a.includes(b)||b.includes(a))return true;const at=a.split(' ').filter(x=>x.length>2),bt=b.split(' ').filter(x=>x.length>2);return bt.length>=2&&bt.filter(x=>at.includes(x)).length>=Math.min(2,bt.length)}
async function parseTrackingWorkbook(input){
  const files=await unzip(input),hit=extractHitlist(readSheetByColumns(files,HITLIST_COLUMNS,'cuisinisteHitlistSheet')),rows=readSheetByColumns(files,TRACKING_COLUMNS,'cuisinisteTrackingSheet'),h=trackingHeader(rows),all=[];
  for(let r=h.hr+1;r<rows.length;r++){const c=contractFromRow(rows[r],h.idx);if(c.brand&&c.city&&c.clientNumber)all.push(c)}
  const sites=hit.map(site=>{const history=all.filter(c=>matchHitToContract(site,c));const active=latestByDate(history.filter(c=>activeStatus(c.status))),last=latestByDate(history);return Object.assign({},site,{activeContract:active||null,lastContract:last||null,history:history.slice().sort((a,b)=>String(b.endDate).localeCompare(String(a.endDate))).slice(0,8)})});
  return{type:'tracking',sector:hit.sector||'',sites,importedAt:nowIso()};
}
function tariffHeader(rows){const hr=findHeaderRow(rows,['Famille','Segment','Référence SCHMIDT GROUPE','Référence commerciale SAMSUNG']);if(hr<0)throw new Error('Colonnes du tarif contrats expo introuvables.');const idx={};for(let i=0;i<rows[hr].length;i++)if(rows[hr][i]!=null)idx[norm(rows[hr][i])]=i;return{hr,idx}}
async function parseTariffWorkbook(input){
  const files=await unzip(input),sheets=workbookSheets(files);if(!sheets.length)throw new Error('Aucun onglet tarif trouvé.');const rows=sheetRows(files[sheets[0].target],sharedStrings(files['xl/sharedStrings.xml'])),h=tariffHeader(rows),products=[];
  for(let r=h.hr+1;r<rows.length;r++){const row=rows[r],p={family:text(rowValue(row,h.idx,'Famille')),segment:text(rowValue(row,h.idx,'Segment')),refSchmidt:text(rowValue(row,h.idx,'Référence SCHMIDT GROUPE')),refCommercial:text(rowValue(row,h.idx,'Référence commerciale SAMSUNG')),refSap:text(rowValue(row,h.idx,'Référence SAP SAMSUNG (à utiliser sur les contrats expo)')),description:text(rowValue(row,h.idx,'Descriptif')),type:text(rowValue(row,h.idx,'Type')),purchasePrice:number(rowValue(row,h.idx,"Prix d'achat Magasin")),contractObjective:number(rowValue(row,h.idx,'OBJECTIF Contrat Expo x12 (à mentionner sur le contrat)')),infos:text(rowValue(row,h.idx,'INFOS'))};if(p.refSchmidt||p.refCommercial||p.refSap)products.push(p)}
  return{type:'tariff',products,importedAt:nowIso()};
}
function productInfo(storage,ref){const t=latestTariff(storage),needle=norm(ref);if(!t||!needle)return null;return(t.products||[]).find(p=>[p.refSchmidt,p.refCommercial,p.refSap].some(v=>norm(v)===needle))||null}
function appStoreScore(site,s){if(!site||!s)return 0;const brand=norm(s.enseigne||s.retailer||'');if(brand&&brand!==norm(site.brand)&&!brand.includes(norm(site.brand))&&!norm(site.brand).includes(brand))return 0;const a=cityKey(s.ville||s.city||''),b=site.cityKey;if(!a||!b)return 0;if(a===b)return 100;if(a.includes(b)||b.includes(a))return 80;const at=a.split(' ').filter(x=>x.length>2),bt=b.split(' ').filter(x=>x.length>2),hits=bt.filter(x=>at.includes(x)).length;return hits>=2?50+hits*5:0}
function resolveSites(storage,list){const tr=latestTracking(storage);if(!tr)return[];const data=readStore(storage),ss=Array.isArray(list)?list:stores();return(tr.sites||[]).map(site=>{const saved=data.mapping[site.key];if(saved&&ss.some(s=>String(s.id)===String(saved)))return Object.assign({},site,{storeId:String(saved),matchedBy:'mapping'});const scored=ss.map(s=>({s,score:appStoreScore(site,s)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);const best=scored[0];if(best&&best.score>=80&&(!scored[1]||scored[1].score<best.score))return Object.assign({},site,{storeId:String(best.s.id),matchedBy:'auto'});return Object.assign({},site,{storeId:null,matchedBy:null,candidates:scored.slice(0,5).map(x=>({id:String(x.s.id),label:text(x.s.enseigne)+' · '+text(x.s.ville),score:x.score}))})})}
function urgency(site){const c=site&&site.activeContract;if(!c)return{score:0,label:'À qualifier',reason:'Aucun contrat actif trouvé'};let score=0,reasons=[];if(/alerte/i.test(c.status)){score+=100;reasons.push('statut Alerte')}if(c.monthsRemaining!=null&&c.monthsRemaining<=3){score+=50+(3-c.monthsRemaining)*5;reasons.push('fin de période proche')}if(c.progress!=null&&c.monthsRemaining!=null){const elapsed=Math.max(0,12-c.monthsRemaining),expected=Math.min(1,elapsed/12);if(c.progress+0.15<expected){score+=30;reasons.push('progression à vérifier par rapport au temps écoulé')}}return{score,label:score>=100?'Prioritaire':score>=50?'À suivre':'Suivi normal',reason:reasons.join(' · ')||'contrat en cours'}}
function siteForStore(storage,storeId){return resolveSites(storage,stores()).find(s=>String(s.storeId)===String(storeId))||null}
function enrichedContract(storage,c){if(!c)return null;return Object.assign({},c,{products:(c.products||[]).map(ref=>({ref,info:productInfo(storage,ref)}))})}
function briefingForStore(storeId){const storage=db(),site=siteForStore(storage,storeId);if(!site)return null;return Object.assign({},site,{activeContract:enrichedContract(storage,site.activeContract),lastContract:enrichedContract(storage,site.lastContract),urgency:urgency(site)})}
function planningSignal(storeId){const x=briefingForStore(storeId);if(!x)return null;const u=urgency(x);return{score:u.score,reason:u.reason,source:'Contrat expo',active:!!x.activeContract}}
function compactSite(site,storage){const c=site.activeContract||site.lastContract;return{storeId:site.storeId||null,brand:site.brand,city:site.city,hasActive:!!site.activeContract,status:c?c.status:null,startDate:c?c.startDate:null,endDate:c?c.endDate:null,objective:c?c.objective:null,realized:c?c.realized:null,progress:c?c.progress:null,monthsRemaining:c?c.monthsRemaining:null,closure:c?c.closure:null,products:c?(c.products||[]).slice(0,5).map(ref=>{const info=productInfo(storage,ref);return{ref,family:info&&info.family||null,segment:info&&info.segment||null,description:info&&info.description||null,type:info&&info.type||null}}):[],urgency:urgency(site)}}
function compactContext(context){const storage=db(),sites=resolveSites(storage,stores());if(!sites.length)return context||{};const out=context||{},sorted=sites.slice().sort((a,b)=>urgency(b).score-urgency(a).score);out.cuisinistesV193={sector:(latestTracking(storage)||{}).sector||'',counts:{sites:sites.length,active:sites.filter(s=>s.activeContract).length,alerts:sites.filter(s=>s.activeContract&&/alerte/i.test(s.activeContract.status)).length,unmatched:sites.filter(s=>!s.storeId).length},rules:{scope:'secteur du fichier importé uniquement',separateFromPerformance:true,rawWorkbookShared:false},sites:sorted.slice(0,MAX_ASSISTANT_ROWS).map(s=>compactSite(s,storage))};return out}
function fmtEuro(v){return v==null?'—':Math.round(Number(v)).toLocaleString('fr-FR')+' €'}
function fmtPct(v){return v==null?'—':(Math.round(Number(v)*1000)/10).toString().replace('.',',')+' %'}
function siteLabel(s){return s.brand+' '+s.city}
function detail(site){const c=site.activeContract||site.lastContract;if(!c)return siteLabel(site)+' · aucun contrat retrouvé';const parts=[siteLabel(site),site.activeContract?c.status:'aucun contrat actif · dernier '+c.status];if(c.objective!=null)parts.push('objectif '+fmtEuro(c.objective));if(c.realized!=null)parts.push('réalisé '+fmtEuro(c.realized));if(c.progress!=null)parts.push('progression '+fmtPct(c.progress));if(c.monthsRemaining!=null&&typeof c.monthsRemaining==='number')parts.push(c.monthsRemaining+' mois restant'+(c.monthsRemaining>1?'s':''));return parts.join(' · ')}
function findSite(textValue,sites){const n=norm(textValue);let best=null,score=0;for(const s of sites){const cands=[s.city,siteLabel(s),s.key].map(norm);for(const c of cands){let sc=0;if(c&&n.includes(c))sc=c.length+20;else{const toks=cityKey(s.city).split(' ').filter(x=>x.length>3),hits=toks.filter(x=>n.includes(x)).length;sc=hits*8}if(sc>score){score=sc;best=s}}}return score>=8?best:null}
function visitTips(site){const c=site.activeContract,tips=[];if(c){tips.push('Faire le point chiffre avec le décisionnaire et vérifier l’avancement du contrat.');if(c.products&&c.products.length)tips.push('Vérifier la présence, la visibilité et la bonne identification des produits d’exposition.');if(c.monthsRemaining!=null&&c.monthsRemaining<=3)tips.push('La fin de période est proche : qualifier les actions restantes et le suivi de clôture.');if(/alerte/i.test(c.status))tips.push('Le fichier source indique « Alerte » : vérifier la situation avec le magasin sans inventer la cause.')}else tips.push('Aucun contrat actif retrouvé : qualifier avec le décisionnaire s’il faut préparer un nouveau contrat ou mettre à jour le suivi.');tips.push('Proposer ou planifier une classroom si l’équipe a besoin d’un rappel produit.');tips.push('Rester disponible pour les questions techniques, SAV et ADV.');return tips.slice(0,5)}
function answer(q){const storage=db(),sites=resolveSites(storage,stores());if(!sites.length)return null;const n=norm(q),specific=findSite(q,sites),asksPrep=/(prepar|visite|piste|tip|conseil)/.test(n);if(specific){let out=detail(specific);if(asksPrep)out+='\nPistes à vérifier :\n'+visitTips(specific).map(x=>'• '+x).join('\n');return out}if(/alerte/.test(n)){const r=sites.filter(s=>s.activeContract&&/alerte/i.test(s.activeContract.status));return r.length?'Contrats en alerte :\n'+r.map(s=>'• '+detail(s)).join('\n'):'Aucun contrat du périmètre importé n’est marqué « Alerte » dans le dernier import.'}if(/fin|echeance|échéance|termine/.test(n)){const r=sites.filter(s=>s.activeContract&&s.activeContract.monthsRemaining!=null&&s.activeContract.monthsRemaining<=3).sort((a,b)=>a.activeContract.monthsRemaining-b.activeContract.monthsRemaining);return r.length?'Contrats proches de la fin de période :\n'+r.map(s=>'• '+detail(s)).join('\n'):'Aucun contrat actif à 3 mois ou moins de la fin de période.'}if(/cuisiniste|contrat.*suiv|dois.*suiv|priorit/.test(n)){const r=sites.filter(s=>s.activeContract).sort((a,b)=>urgency(b).score-urgency(a).score);return r.length?'Suivi cuisinistes du secteur importé :\n'+r.map(s=>'• '+detail(s)+' · '+urgency(s).reason).join('\n'):'Aucun contrat actif retrouvé dans le périmètre.'}return null}
function el(tag,txt,cls){const n=root.document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n}
function btn(txt,fn,cls){const b=el('button',txt,cls||'secondary');b.type='button';b.addEventListener('click',fn);return b}
function ensureStyle(){if(!root.document||root.document.getElementById('sr-cuisine-v193-style'))return;const s=el('style');s.id='sr-cuisine-v193-style';s.textContent='#'+SHEET_ID+'{box-sizing:border-box;width:min(780px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;padding:16px;border-radius:24px;border:1px solid #d9dce3;background:#fff;color:#1d1d1f}#'+SHEET_ID+'::backdrop{background:rgba(17,24,39,.45)}.srCuisineBar{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.srCuisineBar button{min-height:46px;border-radius:13px;font-weight:800}.srCuisineRow,.srCuisineBrief193,#'+STORE_CARD_ID+'{margin:9px 0;padding:11px;border:1px solid #e2e6ed;border-radius:15px;background:#fbfcff;font-size:11.5px;line-height:1.45}.srCuisineRow b,.srCuisineBrief193 b,#'+STORE_CARD_ID+' b{font-size:12.5px}.srCuisineMeta{display:block;color:#667085;white-space:pre-line;margin-top:4px}.srCuisineBadge{display:inline-block;padding:3px 8px;border-radius:9px;background:#fff1db;color:#8a5200;font-size:10px;font-weight:850;margin-right:6px}.srCuisineAlert{background:#fdecea;color:#a3261c}.srCuisineGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.srCuisineCell{background:#fff;border:1px solid #e5e9f0;border-radius:10px;padding:7px}.srCuisineCell span{display:block;font-size:9px;color:#667085}.srCuisineCell b{display:block;margin-top:2px}.srCuisineRow select{width:100%;min-height:44px;margin-top:8px}.srCuisineStatus{font-size:12px;color:#315b9d;min-height:18px}.srCuisineStatus.bad{color:#b42318}@media(max-width:520px){.srCuisineBar{grid-template-columns:1fr}.srCuisineGrid{grid-template-columns:1fr 1fr}.srCuisineCell{min-width:0}.srCuisineCell b{overflow-wrap:anywhere}}';root.document.head.appendChild(s)}
function status(msg,bad){const x=sheet&&sheet.querySelector('#srCuisineStatus');if(x){x.textContent=msg||'';x.classList.toggle('bad',!!bad)}}
function renderProductLine(storage,c){if(!c||!c.products||!c.products.length)return'';return c.products.map(ref=>{const p=productInfo(storage,ref);return p?ref+' · '+[p.family,p.segment,p.type].filter(Boolean).join(' / '):ref+' · référence non trouvée dans le tarif courant'}).join('\n')}
function renderSheet(){if(!sheet)return;const storage=db(),sites=resolveSites(storage,stores()),body=sheet.querySelector('#srCuisineBody');body.replaceChildren();const tr=latestTracking(storage),ta=latestTariff(storage);sheet.querySelector('#srCuisineSubtitle').textContent=(text((tr||{}).sector)||'Secteur à importer')+' · '+(tr?'suivi importé':'suivi à importer')+' · '+(ta?'tarifs importés':'tarifs à importer');if(!tr){body.append(el('p','Importe le fichier de suivi .xlsm. Seules les données du hitlist de ton secteur seront conservées dans Store Runner.','srCuisineMeta'));return}const shown=followupSheetHeader(body,sites)||sites;
for(const site of shown){const box=el('section',undefined,'srCuisineRow'),c=site.activeContract||site.lastContract,u=urgency(site);const head=el('div');const badge=el('span',site.activeContract?(c.status||'Contrat actif'):'Historique','srCuisineBadge'+(/alerte/i.test(c&&c.status||'')?' srCuisineAlert':''));head.append(badge,el('b',siteLabel(site)));box.append(head);if(c){const meta=[];meta.push(site.activeContract?'Contrat actif':'Aucun contrat actif trouvé · dernier contrat');if(c.startDate||c.endDate)meta.push('Période : '+(c.startDate||'—')+' → '+(c.endDate||'—'));if(c.objective!=null||c.realized!=null)meta.push('Objectif '+fmtEuro(c.objective)+' · réalisé '+fmtEuro(c.realized)+' · progression '+fmtPct(c.progress));if(c.monthsRemaining!=null&&typeof c.monthsRemaining==='number')meta.push('Temps restant : '+c.monthsRemaining+' mois');if(c.closure)meta.push('Clôture source : '+c.closure);if(c.toInvoice!=null&&text(c.toInvoice))meta.push('À facturer : '+text(c.toInvoice));if(c.portfolio!=null)meta.push('Portefeuille mois : '+fmtEuro(c.portfolio));const prod=renderProductLine(storage,c);if(prod)meta.push('Produits expo :\n'+prod);meta.push('Signal : '+u.label+' · '+u.reason);box.append(el('span',meta.join('\n'),'srCuisineMeta'))}else box.append(el('span','Aucun contrat retrouvé dans le suivi importé.','srCuisineMeta'));if(!site.storeId){const sel=el('select');sel.append(Object.assign(el('option','Rattacher à un magasin Store Runner…'),{value:''}));for(const s of stores())sel.append(Object.assign(el('option',text(s.enseigne)+' · '+text(s.ville)),{value:String(s.id)}));sel.onchange=()=>{if(sel.value){rememberMatch(storage,site.key,sel.value);renderSheet();renderStoreCard();queueVisitRender()}};box.append(sel)}else box.append(el('span','Rattaché au magasin Store Runner · '+site.matchedBy,'srCuisineMeta'));followupRow(box,site);body.append(box)}}
async function importTracking(file){try{status('Lecture locale du suivi contrats…');const snap=await parseTrackingWorkbook(new Uint8Array(await file.arrayBuffer()));saveTracking(db(),snap);status('Suivi importé · '+snap.sites.length+' cuisinistes'+(snap.sector?' · '+snap.sector:'')+'.');renderSheet();renderStoreCard();queueVisitRender();return true}catch(e){status(e&&e.message||String(e),true);return false}}
async function importTariff(file){try{status('Lecture locale du tarif contrats expo…');const snap=await parseTariffWorkbook(new Uint8Array(await file.arrayBuffer()));saveTariff(db(),snap);status('Tarifs importés · '+snap.products.length+' références.');renderSheet();renderStoreCard();queueVisitRender();return true}catch(e){status(e&&e.message||String(e),true);return false}}
function ensureSheet(){if(sheet)return sheet;if(!root.document)return null;ensureStyle();sheet=el('dialog');sheet.id=SHEET_ID;sheet.innerHTML='<div><h2 style="margin:0">Contrats expo · Cuisinistes</h2><p id="srCuisineSubtitle" class="srCuisineMeta"></p></div><div class="srCuisineBar"><button id="srCuisineImportTracking" class="primary">📥 Suivi contrats .xlsm</button><button id="srCuisineImportTariff">📦 Tarifs / références .xlsx</button></div><input id="srCuisineTrackingFile" type="file" accept=".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12" hidden><input id="srCuisineTariffFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><p id="srCuisineStatus" class="srCuisineStatus" role="status"></p><div id="srCuisineBody"></div><div class="srCuisineBar"><button id="srCuisineClose">Fermer</button></div>';root.document.body.appendChild(sheet);const tf=sheet.querySelector('#srCuisineTrackingFile'),pf=sheet.querySelector('#srCuisineTariffFile');sheet.querySelector('#srCuisineImportTracking').onclick=()=>tf.click();sheet.querySelector('#srCuisineImportTariff').onclick=()=>pf.click();sheet.querySelector('#srCuisineClose').onclick=()=>sheet.close();tf.onchange=()=>{const f=tf.files&&tf.files[0];tf.value='';if(f)importTracking(f)};pf.onchange=()=>{const f=pf.files&&pf.files[0];pf.value='';if(f)importTariff(f)};return sheet}
function open(){ensureSheet();status('');if(typeof sheet.showModal==='function'&&!sheet.open)sheet.showModal();else sheet.setAttribute('open','');renderSheet();return true}
function ensureMenuEntry(){if(!root.document)return false;const grid=root.document.querySelector('#moreSheetV2 .moreSheetGrid');if(!grid)return false;if(root.document.getElementById(MENU_BTN_ID))return true;const b=btn('🧾 Contrats expo',e=>{if(e){e.preventDefault();e.stopPropagation()}const more=root.document.getElementById('moreSheetV2');if(more)more.classList.remove('open');open()});b.id=MENU_BTN_ID;b.setAttribute('aria-label','Suivi contrats expo cuisinistes');grid.appendChild(b);return true}
function followupSheetHeader(body,sites){
  /* En-tête de l'écran Contrats expo : résumé et filtres de suivi commercial. V229
     renvoie la liste à afficher ; absent, on affiche tout comme avant. */
  const fu=root.StoreRunnerCuisinisteFollowupV229;
  if(!fu||typeof fu.renderSheetHeader!=='function')return null;
  try{return fu.renderSheetHeader(body,sites)}catch(e){return null}
}
function followupRow(box,site){
  const fu=root.StoreRunnerCuisinisteFollowupV229;
  if(!fu||typeof fu.renderSheetRow!=='function')return false;
  try{return fu.renderSheetRow(box,site)}catch(e){return false}
}
function followupSection(storeId){
  /* Le suivi commercial V229 vit au-dessus de cette carte, jamais à côté : il se pose
     juste avant elle pour que le statut et la prochaine action soient lus en premier.
     Absent, rien ne change. */
  const fu=root.StoreRunnerCuisinisteFollowupV229;
  if(!fu||typeof fu.renderStoreSection!=='function')return false;
  try{return fu.renderStoreSection(storeId)}catch(e){return false}
}
function renderStoreCard(){if(!root.document)return false;const sh=root.document.getElementById('storeQuickSheet'),start=root.document.getElementById('srQuickStart');if(!sh||!start||!start.dataset)return false;const storeId=text(start.dataset.srStart);let old=root.document.getElementById(STORE_CARD_ID);if(!storeId){if(old)old.remove();followupSection(null);return false}const x=briefingForStore(storeId);if(!x){if(old)old.remove();followupSection(storeId);return false}const anchor=root.document.getElementById('sqPerformance')||root.document.getElementById('sqVisitCredit')||root.document.getElementById('sqAddress');if(!anchor)return false;if(!old){ensureStyle();old=el('section');old.id=STORE_CARD_ID;old.setAttribute('aria-label','Contrat expo du magasin');anchor.insertAdjacentElement('afterend',old)}old.replaceChildren();const c=x.activeContract||x.lastContract,badge=el('span',x.activeContract?(c.status||'Contrat expo'):'Historique','srCuisineBadge'+(/alerte/i.test(c&&c.status||'')?' srCuisineAlert':''));old.append(badge,el('b','Contrat Expo · '+siteLabel(x)));if(c){const line=t=>old.append(el('span',t,'srCuisineMeta'));line(x.activeContract?'Contrat actif':'Aucun contrat actif trouvé · dernier contrat '+(c.status||''));line('Période '+(c.startDate||'—')+' → '+(c.endDate||'—'));line('Objectif '+fmtEuro(c.objective)+' · réalisé '+fmtEuro(c.realized)+' · '+fmtPct(c.progress));if(c.monthsRemaining!=null&&typeof c.monthsRemaining==='number')line('Temps restant : '+c.monthsRemaining+' mois');if(c.products&&c.products.length)line('Produits expo : '+c.products.map(p=>p.info?(p.ref+' · '+[p.info.family,p.info.segment].filter(Boolean).join(' / ')):p.ref).join(' · '));line('Signal : '+x.urgency.reason)}old.append(btn('Ouvrir le suivi contrats expo',open));followupSection(storeId);return true}
function createBriefing(storeId){const x=briefingForStore(storeId);if(!x||!root.document)return null;ensureStyle();const s=el('section',undefined,'srCuisineBrief193');s.dataset.storeId=String(storeId);s.setAttribute('aria-label','Brief contrat expo');const c=x.activeContract||x.lastContract,b=el('span',x.activeContract?(c.status||'Contrat expo'):'Historique','srCuisineBadge'+(/alerte/i.test(c&&c.status||'')?' srCuisineAlert':''));s.append(b,el('b','Contrat expo · '+siteLabel(x)));if(c){const g=el('div',undefined,'srCuisineGrid'),cell=(l,v)=>{const x=el('div',undefined,'srCuisineCell');x.append(el('span',l),el('b',v));g.append(x)};cell('Progression',fmtPct(c.progress));cell('Objectif',fmtEuro(c.objective));cell('Réalisé',fmtEuro(c.realized));cell('Temps restant',c.monthsRemaining!=null&&typeof c.monthsRemaining==='number'?c.monthsRemaining+' mois':'—');s.append(g);if(c.products&&c.products.length)s.append(el('span','Produits expo : '+c.products.map(p=>p.ref).join(' · '),'srCuisineMeta'));s.append(el('span','À vérifier : '+visitTips(x).slice(0,3).join(' '),'srCuisineMeta'))}else s.append(el('span','Aucun contrat retrouvé dans le dernier import.','srCuisineMeta'));return s}
function activeVisitStoreId(){try{const id=root.StoreRunnerVisits&&typeof root.StoreRunnerVisits.activeVisitId==='function'?root.StoreRunnerVisits.activeVisitId():null;if(!id)return null;const vs=(root.state&&root.state.businessV2&&root.state.businessV2.visits)||[],v=vs.find(x=>String(x.id)===String(id));return v&&v.storeId!=null?String(v.storeId):null}catch(e){return null}}
function renderVisitBriefing(){if(!root.document)return false;const dialog=root.document.getElementById('srVisitDialog');if(!dialog||!dialog.open)return false;const intro=dialog.querySelector('.sr-terrainIntro');if(!intro)return false;const storeId=activeVisitStoreId();if(!storeId)return false;const old=dialog.querySelector('.srCuisineBrief193');if(old&&old.dataset.storeId===String(storeId))return true;if(old)old.remove();const box=createBriefing(storeId);if(!box)return false;intro.insertAdjacentElement('beforebegin',box);return true}
function queueVisitRender(){if(renderQueued)return;renderQueued=true;const f=()=>{renderQueued=false;renderVisitBriefing()};if(root.requestAnimationFrame)root.requestAnimationFrame(f);else setTimeout(f,0)}
function attachObservers(){if(!root.document)return;if(!visitObserver){const d=root.document.getElementById('srVisitDialog');if(d){visitObserver=new MutationObserver(queueVisitRender);visitObserver.observe(d,{childList:true,subtree:true,attributes:true,attributeFilter:['open']})}}if(!quickObserver){const q=root.document.getElementById('storeQuickSheet');if(q){quickObserver=new MutationObserver(renderStoreCard);quickObserver.observe(q,{attributes:true,subtree:true,attributeFilter:['class','aria-hidden','data-sr-start']})}}}
function install(){ensureStyle();ensureMenuEntry();attachObservers();renderStoreCard();queueVisitRender();return true}
function scheduleInstall(){setTimeout(install,0);setTimeout(install,350);setTimeout(install,1200)}

const api={STORE_KEY,HITLIST_COLUMNS,TRACKING_COLUMNS,sectorsIn,readSheetByColumns,norm,cityKey,parseHitLabel,extractHitlist,parseTrackingWorkbook,parseTariffWorkbook,saveTracking,saveTariff,latestTracking,latestTariff,readStore,writeStore,siteForStore,db,siteLabel,rememberMatch,resolveSites,appStoreScore,productInfo,urgency,briefingForStore,planningSignal,compactContext,answer,visitTips,open,install,importTracking,importTariff,renderStoreCard,createBriefing};
root.StoreRunnerCuisinisteV193=api;
if(typeof root.storeRunnerRegisterAssistantResolver==='function')root.storeRunnerRegisterAssistantResolver(answer,25);
if(typeof root.storeRunnerRegisterAssistantContextTransform==='function')root.storeRunnerRegisterAssistantContextTransform(compactContext,75);
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',scheduleInstall,{once:true});else scheduleInstall();root.document.addEventListener('store-runner:data-restored',scheduleInstall);root.document.addEventListener('store-runner:planning-updated',()=>{renderStoreCard();queueVisitRender()})}
})(typeof window!=='undefined'?window:globalThis);
