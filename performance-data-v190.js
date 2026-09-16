/* Store Runner V190 — pilotage performance depuis le fichier hebdomadaire.

   Couche pure : lecture du .xlsx, normalisation des lignes, appariement magasin,
   agrégats de pilotage. Aucun DOM, aucun réseau, aucune dépendance externe — le fichier
   est lu sur l'appareil et n'en sort jamais. Aucune donnée commerciale n'est écrite dans
   le dépôt : les fixtures de test sont fabriquées de toutes pièces.

   Règle qui gouverne tout le module : une cellule vide reste vide. On ne fabrique jamais
   une PDM absente, et `null` n'est jamais remplacé par 0. */
(function(root){
'use strict';

const STORE_KEY='store-runner-performance-v190';
const PRIO={P1:'P1',P2:'P2',WATCH:'watch',NODATA:'nodata'};
const PRIO_ORDER={P1:0,P2:1,watch:2,nodata:3};
const PRIO_LABEL={P1:'Prio 1',P2:'Prio 2',watch:'À surveiller',nodata:'Pas de data'};

function text(v){return String(v==null?'':v).trim()}
function norm(v){try{return text(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9%]+/g,' ').trim()}catch(e){return text(v).toLowerCase()}}

/* ---------------------------------------------------------------- lecture du .xlsx --
   Un .xlsx est une archive ZIP de XML. On n'a besoin que de trois entrées, et le format
   est produit par une machine : des expressions régulières suffisent et évitent d'ajouter
   une dépendance à une application qui doit fonctionner hors ligne. */
async function inflateRaw(bytes){
  if(typeof DecompressionStream==='function'&&typeof Response==='function'&&typeof ReadableStream==='function'){
    const rs=new ReadableStream({start(c){c.enqueue(bytes);c.close()}});
    const buf=await new Response(rs.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return new Uint8Array(buf);
  }
  if(typeof module!=='undefined'&&typeof require==='function')return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(bytes)));
  throw new Error('Décompression indisponible sur cet appareil.');
}
function u8(input){
  if(input instanceof Uint8Array)return input;
  if(input&&input.buffer instanceof ArrayBuffer)return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  if(input instanceof ArrayBuffer)return new Uint8Array(input);
  throw new Error('Fichier illisible.');
}
async function unzip(input){
  const bytes=u8(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd=-1;
  for(let i=bytes.length-22;i>=0&&i>bytes.length-66000;i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break}
  if(eocd<0)throw new Error('Ce fichier n’est pas un classeur .xlsx.');
  const count=view.getUint16(eocd+10,true);let p=view.getUint32(eocd+16,true);
  const out={},decoder=new TextDecoder('utf-8');
  for(let n=0;n<count;n++){
    if(view.getUint32(p,true)!==0x02014b50)break;
    const method=view.getUint16(p+10,true),compSize=view.getUint32(p+20,true);
    const nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true);
    const local=view.getUint32(p+42,true),name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));
    const lNameLen=view.getUint16(local+26,true),lExtraLen=view.getUint16(local+28,true);
    const start=local+30+lNameLen+lExtraLen,raw=bytes.subarray(start,start+compSize);
    if(/^xl\/(sharedStrings|styles|workbook)\.xml$/.test(name)||/^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      out[name]=decoder.decode(method===0?raw:await inflateRaw(raw));
    p+=46+nameLen+extraLen+commentLen;
  }
  return out;
}
function unescapeXml(s){
  return String(s).replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCharCode(parseInt(h,16)))
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function sharedStrings(xml){
  if(!xml)return[];
  return (xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g)||[]).map(si=>
    (si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>unescapeXml(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/,'$1'))).join(''));
}
/* Le format de nombre dit si la cellule est un pourcentage. C'est la seule façon de savoir
   si 0,425 vaut 0,425 % ou 42,5 % — deviner à partir de la valeur serait inventer. */
function percentStyles(xml){
  const percent=new Set();
  if(!xml)return percent;
  const custom=new Set();
  for(const m of xml.match(/<numFmt\b[^>]*\/>/g)||[]){
    const id=(m.match(/numFmtId="(\d+)"/)||[])[1],code=(m.match(/formatCode="([^"]*)"/)||[])[1]||'';
    if(id&&unescapeXml(code).includes('%'))custom.add(id);
  }
  const block=(xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)||[])[0]||'';
  (block.match(/<xf\b[^>]*\/?>/g)||[]).forEach((xf,i)=>{
    const id=(xf.match(/numFmtId="(\d+)"/)||[])[1];
    if(id&&(id==='9'||id==='10'||custom.has(id)))percent.add(i);
  });
  return percent;
}
function colIndex(ref){
  const letters=String(ref||'').replace(/[^A-Z]/g,'');let n=0;
  for(let i=0;i<letters.length;i++)n=n*26+(letters.charCodeAt(i)-64);
  return n-1;
}
function sheetRows(xml,strings,percent){
  const rows=[];
  for(const rowXml of xml.match(/<row\b[\s\S]*?<\/row>/g)||[]){
    const cells=[];
    for(const c of rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g)||[]){
      /* Le type se lit entre guillemets, sans présumer de la casse : le classeur réel écrit
         `t="inlineStr"`, avec un S majuscule, et un motif en [a-z]+ le manquait entièrement.
         Le type retombait alors sur numérique, aucun <v> n'existe pour ces cellules, et
         tout le texte de la feuille devenait null — y compris la ligne d'en-tête. */
      const ref=(c.match(/\sr="([A-Z]+\d+)"/)||[])[1],type=(c.match(/\st="([^"]+)"/)||[])[1]||'n';
      const style=Number((c.match(/\ss="(\d+)"/)||[])[1]);
      const i=ref?colIndex(ref):cells.length;
      let value=null;
      if(type==='inlineStr'){
        value=(c.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>unescapeXml(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/,'$1'))).join('');
      }else{
        const raw=(c.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
        if(raw!==undefined){
          if(type==='s')value=strings[Number(raw)]!==undefined?strings[Number(raw)]:null;
          else if(type==='str'||type==='e')value=unescapeXml(raw);
          else{
            const n=Number(raw);
            value=Number.isFinite(n)?(percent.has(style)?n*100:n):null;
          }
        }
      }
      while(cells.length<i)cells.push(null);
      cells[i]=value===''?null:value;
    }
    rows.push(cells);
  }
  return rows;
}
async function readSheet(input){
  const files=await unzip(input);
  const name=Object.keys(files).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if(!name)throw new Error('Ce classeur ne contient aucune feuille.');
  return sheetRows(files[name],sharedStrings(files['xl/sharedStrings.xml']),percentStyles(files['xl/styles.xml']));
}

/* ------------------------------------------------------- normalisation métier ------- */
function num(v){
  if(v==null||v==='')return null;
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  const s=text(v).replace(/ | |\s/g,'').replace(/%/g,'').replace(/€/g,'').replace(',','.');
  if(!s||!/[0-9]/.test(s))return null;
  const n=Number(s.replace(/[^0-9.+-]/g,''));
  return Number.isFinite(n)?n:null;
}
function prioOf(value){
  const n=norm(value);
  if(!n)return null;
  if(/pas de data|no data|sans data/.test(n))return PRIO.NODATA;
  if(/surveill|watch/.test(n))return PRIO.WATCH;
  if(/(^|\D)2(\D|$)/.test(n)&&/prio|p/.test(n))return PRIO.P2;
  if(/(^|\D)1(\D|$)/.test(n)&&/prio|p/.test(n))return PRIO.P1;
  if(n==='1')return PRIO.P1;
  if(n==='2')return PRIO.P2;
  return null;
}
/* Précédence explicite : « Δ YTD W34 vs target » contient « ytd » et « w34 », il doit être
   reconnu comme un écart et pas comme la colonne YTD ni comme une colonne de semaine. */
function classify(header){
  const n=norm(header);
  if(!n)return null;
  const week=(n.match(/(?:^|\s)w(\d{1,2})(?:\s|$)/)||[])[1];
  if(/vs target/.test(n)){
    if(/ytd/.test(n))return{kind:'deltaYtd'};
    if(week)return{kind:'deltaWeek',week:'W'+week};
  }
  if(/sell ?out|sell-out/.test(n)){
    if(/ytd/.test(n))return{kind:'sellOutYtd'};
    return{kind:'sellOutWeek'};
  }
  /* Le classeur réel n'écrit jamais « sell out » : il écrit « Ecart SO€ 2026-2025 YTD »
     pour le cumul et « Ecart W32 2026-W32 2025 » pour chaque semaine. Les années sont
     volontairement ignorées — le fichier livré porte même une coquille (W34 2028). */
  if(/^ecart/.test(n)){
    if(/\bso\b/.test(n)&&/ytd/.test(n))return{kind:'sellOutYtd'};
    if(/ytd/.test(n))return{kind:'sellOutYtd'};
    if(week)return{kind:'sellOutWeek',week:'W'+week};
  }
  if(/evol/.test(n)&&/ly|n 1|n1/.test(n))return{kind:'evolYtd'};
  if(/^ytd/.test(n)||/ytd ihs/.test(n))return{kind:'ytd'};
  if(/^prio/.test(n))return{kind:'prio'};
  if(/retailer|enseigne/.test(n))return{kind:'retailer'};
  if(/site name|^site$|magasin|point de vente/.test(n))return{kind:'site'};
  if(/commentaire|mission|action terrain/.test(n))return{kind:'comment'};
  if(/^target/.test(n)||/target pdm/.test(n))return{kind:'target'};
  if(week&&n.replace(/\s/g,'')==='w'+week)return{kind:'week',week:'W'+week};
  return null;
}
/* « Target = 42.5% » posé dans un coin de la feuille, au-dessus du tableau. On lit le
   texte brut et pas la forme normalisée : la normalisation écrase le point décimal. */
function explicitTarget(rows,head){
  const limite=head>=0?head:Math.min(rows.length,25);
  for(let r=0;r<limite;r++)for(const cell of rows[r]||[]){
    const brut=text(cell);
    if(!brut||!/target/i.test(brut))continue;
    const m=brut.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/)||brut.match(/=\s*([0-9]+(?:[.,][0-9]+)?)/);
    if(m){const n=Number(String(m[1]).replace(',','.'));if(Number.isFinite(n))return n}
  }
  return null;
}
function findHeader(rows){
  for(let i=0;i<Math.min(rows.length,25);i++){
    const kinds=(rows[i]||[]).map(classify).filter(Boolean).map(k=>k.kind);
    if(kinds.includes('prio')&&(kinds.includes('site')||kinds.includes('retailer')))return i;
  }
  return -1;
}
function sourceKey(retailer,site){return norm(retailer)+'|'+norm(site)}

function parseRows(rows,options){
  const opts=options||{};
  const head=findHeader(rows);
  if(head<0)throw new Error('Colonnes Prios / Site name introuvables dans ce fichier.');
  const map={weeks:{},deltaWeeks:{},sellOutWeeks:{}};
  (rows[head]||[]).forEach((cell,i)=>{
    const k=classify(cell);if(!k)return;
    if(k.kind==='week')map.weeks[k.week]=i;
    else if(k.kind==='deltaWeek')map.deltaWeeks[k.week]=i;
    else if(k.kind==='sellOutWeek'&&k.week)map.sellOutWeeks[k.week]=i;
    else if(map[k.kind]===undefined)map[k.kind]=i;
  });
  const weekNames=Object.keys(map.weeks).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
  const at=(row,i)=>i===undefined?null:(row[i]===undefined?null:row[i]);
  const out=[];
  for(let r=head+1;r<rows.length;r++){
    const row=rows[r]||[];
    const retailer=text(at(row,map.retailer)),site=text(at(row,map.site));
    if(!retailer&&!site)continue;
    const weeks={},deltaWeeks={},sellOutWeeks={};
    for(const w of weekNames)weeks[w]=num(at(row,map.weeks[w]));
    for(const w of Object.keys(map.deltaWeeks))deltaWeeks[w]=num(at(row,map.deltaWeeks[w]));
    /* Les trois semaines de sell-out sont conservées séparément : les agréger ferait
       perdre l'information que le fichier porte semaine par semaine. */
    for(const w of Object.keys(map.sellOutWeeks))sellOutWeeks[w]=num(at(row,map.sellOutWeeks[w]));
    const sellOutWeekNames=Object.keys(sellOutWeeks).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
    const dernierSellOut=sellOutWeekNames.length?sellOutWeeks[sellOutWeekNames[sellOutWeekNames.length-1]]:num(at(row,map.sellOutWeek));
    out.push({
      key:sourceKey(retailer,site),retailer,site,
      prio:prioOf(at(row,map.prio)),
      pdmYtd:num(at(row,map.ytd)),
      evolYtd:num(at(row,map.evolYtd)),
      deltaYtd:num(at(row,map.deltaYtd)),
      weeks,deltaWeeks,sellOutWeeks,
      sellOutYtd:num(at(row,map.sellOutYtd)),
      /* Conservé pour les lecteurs existants : la dernière semaine connue. */
      sellOutWeek:dernierSellOut,
      comment:text(at(row,map.comment)),
      storeId:null
    });
  }
  /* La cible est lue si le fichier la porte. Le classeur réel l'écrit en clair en A1 —
     « Target = 42.5% » — donc on scanne d'abord la zone au-dessus de l'en-tête. On ne
     déduit qu'en dernier recours, et la source est dite à l'utilisateur. */
  let target=explicitTarget(rows,head),targetSource=target==null?null:'explicite';
  if(target==null&&map.target!==undefined){
    for(let r=head+1;r<rows.length&&target==null;r++)target=num(at(rows[r]||[],map.target));
    if(target!=null)targetSource='explicite';
  }
  if(target==null){
    const derived=out.map(x=>x.pdmYtd!=null&&x.deltaYtd!=null?Math.round((x.pdmYtd-x.deltaYtd)*100)/100:null).filter(x=>x!=null).sort((a,b)=>a-b);
    if(derived.length){target=derived[Math.floor(derived.length/2)];targetSource='déduit'}
  }
  const week=text(opts.week)||weekNames[weekNames.length-1]||'';
  return{week,targetPdm:target,targetSource,rows:out,importedAt:text(opts.now)||new Date().toISOString()};
}
async function parseWorkbook(input,options){return parseRows(await readSheet(input),options)}
function weekFromName(name){const m=norm(name).match(/(?:^|\s)w(\d{1,2})(?:\s|\.|$)/);return m?'W'+m[1]:''}

/* ------------------------------------------------------------- stockage local ------- */
function emptyStore(){return{version:2,imports:[],mapping:{},treated:{}}}
/* Migration non destructive v1 → v2. La v1 gardait une seule entrée par semaine, donc un
   second fichier couvrant la même semaine écrasait le premier. La v2 conserve chaque
   import tel quel pour l'audit ; l'affichage n'en retient qu'un par semaine. Rien n'est
   supprimé : une base v1 est relue en v2 sans perdre une ligne. */
function migrate(data){
  const out=emptyStore();
  if(!data||typeof data!=='object')return out;
  if(data.mapping&&typeof data.mapping==='object')out.mapping=data.mapping;
  if(data.treated&&typeof data.treated==='object')out.treated=data.treated;
  if(Array.isArray(data.imports))out.imports=data.imports.filter(x=>x&&x.week);
  else if(data.snapshots&&typeof data.snapshots==='object')
    out.imports=Object.keys(data.snapshots).map(w=>Object.assign({},data.snapshots[w],{week:data.snapshots[w].week||w})).filter(x=>x.week);
  out.imports=out.imports.slice().sort((a,b)=>text(a.importedAt).localeCompare(text(b.importedAt)));
  return out;
}
function readStore(db){
  try{const raw=db&&db.getItem(STORE_KEY);return migrate(raw?JSON.parse(raw):null)}catch(e){return emptyStore()}
}
function writeStore(db,data){try{if(db)db.setItem(STORE_KEY,JSON.stringify(data))}catch(e){}return data}
/* Un import s'ajoute à la pile. Il n'écrase ni l'historique, ni un import antérieur de la
   même semaine, ni le mapping acquis. */
function saveSnapshot(db,snapshot){
  const data=readStore(db);
  if(!snapshot||!snapshot.week)throw new Error('Semaine introuvable : renomme le fichier en « … W34.xlsx ».');
  data.imports.push(Object.assign({},snapshot,{importedAt:text(snapshot.importedAt)||new Date().toISOString()}));
  data.imports.sort((a,b)=>text(a.importedAt).localeCompare(text(b.importedAt)));
  writeStore(db,data);
  return data;
}
function weeks(db){
  const seen=new Set();
  for(const imp of readStore(db).imports)seen.add(imp.week);
  return[...seen].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
}
/* Semaines qui se chevauchent : tous les imports sont gardés, mais une semaine n'a qu'une
   valeur affichée — la dernière connue. Pas de doublon à l'écran, pas de perte à l'audit. */
function allImports(db,week){return readStore(db).imports.filter(imp=>!week||imp.week===week)}
function snapshot(db,week){const rows=allImports(db,week);return rows.length?rows[rows.length-1]:null}
function importCount(db,week){return allImports(db,week).length}
function latestSnapshot(db){const w=weeks(db);return w.length?snapshot(db,w[w.length-1]):null}

/* « Déjà visité » ne veut dire qu'une chose : une visite au statut `completed`. Un
   brouillon ouvert sur le parking n'est pas un passage fait, et ne doit jamais compter
   comme tel — ni dans le croisement, ni dans les comparaisons de pilotage. */
function completedVisitsFor(state,storeId){
  if(!storeId)return null;
  const b=(state&&state.businessV2)||{};
  const done=(b.visits||[]).filter(v=>v&&String(v.storeId)===String(storeId)&&v.status==='completed'&&text(v.completedDate));
  done.sort((a,b2)=>text(b2.completedDate).localeCompare(text(a.completedDate)));
  const legacy=((state&&state.visits)||{})[storeId]||{};
  const history=(Array.isArray(legacy.history)?legacy.history:[]).filter(Boolean).slice().sort();
  const last=text(done[0]&&done[0].completedDate)||text(legacy.lastVisit)||history[history.length-1]||'';
  const count=done.length||history.length;
  return last?{lastVisit:last,count,source:done.length?'businessV2':'historique'}:null;
}

/* « Déjà traité » : une marque posée sur la semaine, pas sur le planning. Marquer un P1
   comme traité ne crée aucune visite et ne déplace aucune journée — c'est une note de
   pilotage, réversible, qui n'existe que pour la semaine en cours. */
function markTreated(db,week,storeId,date){
  const data=readStore(db),w=text(week);
  if(!w||!storeId)return data.treated;
  if(!data.treated[w])data.treated[w]={};
  if(date===null)delete data.treated[w][String(storeId)];
  else data.treated[w][String(storeId)]={at:text(date)||new Date().toISOString().slice(0,10),source:'manuel'};
  writeStore(db,data);
  return data.treated;
}
function isTreated(db,week,storeId){
  const w=readStore(db).treated[text(week)]||{};
  return w[String(storeId)]||null;
}
/* Une visite terminée pendant la semaine du snapshot rend le magasin éligible au statut
   « déjà traité ». On le propose : rien n'est coché tout seul. */
function qualifyingVisit(visits,snapshot){
  const last=visits&&text(visits.lastVisit);
  if(!last||!snapshot||!snapshot.importedAt)return null;
  const imported=text(snapshot.importedAt).slice(0,10);
  if(!imported)return null;
  const diff=Math.round((new Date(imported+'T12:00:00')-new Date(last+'T12:00:00'))/86400000);
  return diff>=-7&&diff<=7?{date:last,days:diff}:null;
}

/* ------------------------------------------------------------------ appariement ----- */
/* Abréviations telles qu'elles apparaissent dans le classeur réel. « CONFO » n'a pas
   besoin d'entrée : l'inclusion conforama/confo le rattrape déjà. « BTLEC EST » reste
   volontairement absent — sans règle sûre, il vaut mieux un rattachement manuel qu'un
   mauvais rattachement automatique. */
const ALIASES={'pro&cie':'pro cie','procie':'pro cie','pro et cie':'pro cie','e leclerc':'leclerc','ed':'electro depot'};
function brandKey(v){const n=norm(v);return ALIASES[n]||n}
function tokens(v){return norm(v).split(' ').filter(t=>t.length>2)}
function matchScore(row,store){
  if(brandKey(row.retailer)&&brandKey(store.enseigne)){
    const a=brandKey(row.retailer),b=brandKey(store.enseigne);
    if(a!==b&&!a.includes(b)&&!b.includes(a))return 0;
  }
  const site=norm(row.site),ville=norm(store.ville);
  if(!site||!ville)return 0;
  if(site===ville)return 100;
  if(site.includes(ville)||ville.includes(site))return 80;
  const t=tokens(row.site),common=t.filter(x=>tokens(store.ville).includes(x)||norm(store.adresse).includes(x));
  return common.length?40+common.length*10:0;
}
/* Le mapping acquis prime toujours : une fois qu'un magasin a été apparié — automatiquement
   ou à la main — les semaines suivantes le retrouvent sans reposer la question. */
function matchRows(snapshotRows,stores,mapping){
  const map=mapping||{},list=Array.isArray(stores)?stores:[],out=[],ambiguous=[];
  for(const row of snapshotRows){
    const saved=map[row.key];
    if(saved&&list.some(s=>String(s.id)===String(saved))){out.push(Object.assign({},row,{storeId:String(saved),matchedBy:'mapping'}));continue}
    const scored=list.map(s=>({s,score:matchScore(row,s)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    const best=scored[0];
    if(best&&best.score>=80&&(!scored[1]||scored[1].score<best.score)){out.push(Object.assign({},row,{storeId:String(best.s.id),matchedBy:'auto'}));continue}
    out.push(Object.assign({},row,{storeId:null,matchedBy:null}));
    ambiguous.push({key:row.key,retailer:row.retailer,site:row.site,candidates:scored.slice(0,4).map(x=>({id:String(x.s.id),label:text(x.s.enseigne)+' · '+text(x.s.ville),score:x.score}))});
  }
  return{rows:out,ambiguous};
}
function rememberMatch(db,key,storeId){
  const data=readStore(db);
  if(storeId)data.mapping[key]=String(storeId);else delete data.mapping[key];
  writeStore(db,data);
  return data.mapping;
}

/* ------------------------------------------------------------------- pilotage ------- */
function rowForStore(db,storeId,week){
  const snap=week?snapshot(db,week):latestSnapshot(db);
  if(!snap)return null;
  const data=readStore(db);
  const matched=matchRows(snap.rows,(root.state&&root.state.stores)||[],data.mapping).rows;
  return matched.find(r=>String(r.storeId)===String(storeId))||null;
}
/* Historique d'un magasin, semaine par semaine : c'est ce qui permet de lire une évolution
   sans jamais affirmer qu'une visite l'a causée. */
function historyForStore(db,storeId,stores){
  const data=readStore(db),list=stores||((root.state&&root.state.stores)||[]);
  return weeks(db).map(w=>{
    const snap=snapshot(db,w);          // la dernière valeur connue pour cette semaine
    const row=matchRows(snap.rows,list,data.mapping).rows.find(r=>String(r.storeId)===String(storeId));
    return row?{week:w,targetPdm:snap.targetPdm,row}:null;
  }).filter(Boolean);
}
/* La PDM hebdomadaire est trop volatile pour classer quoi que ce soit : amplitude médiane
   de 22,7 points sur W32-W34, et 23 magasins sur 37 dépassent 20 points d'écart. Le statut
   et l'écart à la cible reposent donc sur le YTD, seul agrégat stable. */
function statusOf(row,targetPdm){
  if(!row||row.pdmYtd==null)return{key:'sansPdm',label:'Pas de PDM dans le fichier',basedOn:'ytd',underTarget:null,gap:null};
  const gap=row.deltaYtd!=null?row.deltaYtd:(targetPdm!=null?Math.round((row.pdmYtd-targetPdm)*100)/100:null);
  if(gap==null)return{key:'sansCible',label:'Cible inconnue',basedOn:'ytd',underTarget:null,gap:null};
  return gap<0?{key:'sousCible',label:'Sous la cible YTD',basedOn:'ytd',underTarget:true,gap}
              :{key:'surCible',label:'Au-dessus de la cible YTD',basedOn:'ytd',underTarget:false,gap};
}
/* Les colonnes hebdomadaires ne servent qu'à ça : dire dans quel sens la semaine bouge.
   Elles n'entrent dans aucun classement et ne décident d'aucun statut. */
function weeklyTrend(row){
  const names=Object.keys((row&&row.weeks)||{}).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
  const pts=names.map(w=>({week:w,value:row.weeks[w]})).filter(p=>p.value!=null);
  if(pts.length<2)return{usage:'tendance',points:pts,delta:null,direction:'indéterminée'};
  const first=pts[0],last=pts[pts.length-1],delta=Math.round((last.value-first.value)*10)/10;
  const amplitude=Math.round((Math.max.apply(null,pts.map(p=>p.value))-Math.min.apply(null,pts.map(p=>p.value)))*10)/10;
  return{usage:'tendance',points:pts,from:first.week,to:last.week,delta,amplitude,
    direction:delta>0?'hausse':delta<0?'baisse':'stable',
    volatile:amplitude>20};
}
function counts(rows){
  const out={P1:0,P2:0,watch:0,nodata:0,unmatched:0,total:rows.length};
  for(const r of rows){if(r.prio&&out[r.prio]!==undefined)out[r.prio]++;if(!r.storeId)out.unmatched++}
  return out;
}
function sortByPriority(rows){
  return rows.slice().sort((a,b)=>{
    const pa=PRIO_ORDER[a.prio]===undefined?9:PRIO_ORDER[a.prio],pb=PRIO_ORDER[b.prio]===undefined?9:PRIO_ORDER[b.prio];
    if(pa!==pb)return pa-pb;
    /* Départage sur l'écart YTD uniquement : une semaine isolée ne fait pas monter ni
       descendre un magasin dans la liste de pilotage. */
    const da=a.deltaYtd==null?0:a.deltaYtd,db2=b.deltaYtd==null?0:b.deltaYtd;
    return da-db2;
  });
}
/* Croisement performance × visites. On rapproche deux faits datés et on s'arrête là :
   « PDM en hausse depuis la visite » n'est pas « la visite a fait monter la PDM ». */
function crossVisits(db,options){
  const o=options||{},list=o.stores||((root.state&&root.state.stores)||[]);
  const snap=o.week?snapshot(db,o.week):latestSnapshot(db);
  if(!snap)return{week:'',rows:[],counts:counts([]),targetPdm:null};
  const data=readStore(db),matched=matchRows(snap.rows,list,data.mapping).rows;
  const all=weeks(db),previousWeek=all[all.indexOf(snap.week)-1];
  const previousSnap=previousWeek?snapshot(db,previousWeek):null;
  const previous=previousSnap?matchRows(previousSnap.rows,list,data.mapping).rows:[];
  const rows=matched.map(row=>{
    const store=list.find(s=>String(s.id)===String(row.storeId))||null;
    /* Une visite ne compte que terminée. Le repli lit la même règle côté état métier. */
    const visits=o.visitsFor?o.visitsFor(row.storeId):completedVisitsFor(o.state||root.state,row.storeId);
    const before=previous.find(p=>p.key===row.key)||null;
    const trend=row.pdmYtd!=null&&before&&before.pdmYtd!=null?Math.round((row.pdmYtd-before.pdmYtd)*100)/100:null;
    const status=statusOf(row,snap.targetPdm);
    const treated=isTreated(db,snap.week,row.storeId);
    return Object.assign({},row,{store,visits,trend,previousWeek:before?previousWeek:null,
      status,underTarget:status.underTarget,weekly:weeklyTrend(row),
      treated,qualifying:treated?null:qualifyingVisit(visits,snap)});
  });
  return{week:snap.week,targetPdm:snap.targetPdm,targetSource:snap.targetSource,rows:sortByPriority(rows),counts:counts(rows)};
}
/* Comparer « visités » et « non visités » sur une seule semaine ne compare rien : il n'y a
   pas d'avant. Ces deux vues n'apparaissent qu'à partir de deux snapshots, elles annoncent
   l'effectif comparé, et elles se lisent comme une association de dates — pas comme un
   effet de la visite sur la part de marché. */
function comparison(db,view,options){
  const o=options||{},history=weeks(db);
  const ready=history.length>=2;
  const seen=r=>!!(r.visits&&r.visits.lastVisit);
  const visited=view.rows.filter(r=>r.storeId&&seen(r)&&r.pdmYtd!=null);
  const notVisited=view.rows.filter(r=>r.storeId&&!seen(r)&&r.pdmYtd!=null);
  const base={
    available:ready,
    reason:ready?'':'Une seule semaine importée : il n’y a pas encore d’avant à comparer.',
    weeksCompared:history.length,
    wording:'association temporelle observée, sans lien de cause établi',
    sample:{visited:visited.length,notVisited:notVisited.length},
    visitedLowPdm:[],notVisitedGoodPdm:[]
  };
  if(!ready)return base;
  base.visitedLowPdm=visited.filter(r=>r.underTarget===true);
  base.notVisitedGoodPdm=notVisited.filter(r=>r.underTarget===false);
  const moyenne=rows=>{const v=rows.map(r=>r.trend).filter(x=>x!=null);return v.length?{n:v.length,delta:Math.round(v.reduce((a,b)=>a+b,0)/v.length*10)/10}:{n:0,delta:null}};
  base.trendVisited=moyenne(visited);
  base.trendNotVisited=moyenne(notVisited);
  return base;
}
function dashboard(db,options){
  const view=crossVisits(db,options);
  const compare=comparison(db,view,options);
  return{
    week:view.week,targetPdm:view.targetPdm,targetSource:view.targetSource,counts:view.counts,
    weeksImported:weeks(db).length,
    importsThisWeek:importCount(db,view.week),
    underTarget:view.rows.filter(r=>r.underTarget===true),
    comparison:compare,
    /* Conservés pour compatibilité de lecture, mais vides tant que la comparaison
       n'est pas légitime : on n'affiche pas un classement qu'on ne peut pas défendre. */
    notVisitedGoodPdm:compare.notVisitedGoodPdm,
    visitedLowPdm:compare.visitedLowPdm,
    rows:view.rows
  };
}
/* ---- 6. Influence sur le planning ---------------------------------------------------
   Lecture seule, depuis le snapshot le plus récent seulement, et sans jamais toucher
   `store.priority`, qui reste la priorité structurelle décidée par l'utilisateur. Le
   planificateur consulte cette valeur au moment où il construit une semaine : rien ne
   bouge tant qu'aucune génération ni recalcul explicite n'a été demandé. */
const PLANNING_BOOST={P1:60,P2:25,watch:0,nodata:0};
function planningBoost(db,storeId,stores){
  if(!storeId)return 0;
  const snap=latestSnapshot(db);
  if(!snap)return 0;
  const data=readStore(db),list=stores||((root.state&&root.state.stores)||[]);
  const row=matchRows(snap.rows,list,data.mapping).rows.find(r=>String(r.storeId)===String(storeId));
  if(!row||!row.prio)return 0;
  if(isTreated(db,snap.week,storeId))return 0;   // déjà traité cette semaine : plus de coup de pouce
  return PLANNING_BOOST[row.prio]||0;
}

const api={STORE_KEY,PRIO,PRIO_LABEL,PRIO_ORDER,
  norm,num,prioOf,classify,sourceKey,weekFromName,explicitTarget,ALIASES,brandKey,
  unzip,readSheet,parseRows,parseWorkbook,
  emptyStore,readStore,writeStore,saveSnapshot,weeks,snapshot,latestSnapshot,
  matchScore,matchRows,rememberMatch,rowForStore,historyForStore,markTreated,isTreated,qualifyingVisit,
  counts,sortByPriority,crossVisits,dashboard,comparison,
  allImports,importCount,migrate,completedVisitsFor,statusOf,weeklyTrend,planningBoost,PLANNING_BOOST};
root.StoreRunnerPerformanceV190=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
