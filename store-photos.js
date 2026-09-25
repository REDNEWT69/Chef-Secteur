/* Store Runner V1 — mémoire photo par magasin, locale et hors ligne.

   V255 — galerie magasin. Les photos restent dans le même IndexedDB, avec les mêmes
   enregistrements : aucune migration, aucun champ renommé. Le classement vient du
   contexte déjà connu au moment de la prise (magasin, visite en cours, famille active,
   date) ; il est lu, jamais demandé. Deux champs FACULTATIFS s'ajoutent aux nouvelles
   photos :
   - `thumb`    miniature JPEG ~360 px, pour que la galerie n'affiche jamais les originaux ;
   - `category` catégorie métier optionnelle (TV, Froid, Mural…), '' par défaut.
   Une photo d'avant V255 reste lisible telle quelle : sa miniature est fabriquée à la
   première apparition dans la galerie puis ajoutée à l'enregistrement, sans toucher
   au blob ni aux étiquettes. En cas d'échec, la galerie retombe sur l'original. */
(function(root){
'use strict';
const DB_NAME='store-runner-store-photos-v1';
const DB_VERSION=1;
const STORE='photos';
const MAX_EDGE=1600;
const JPEG_QUALITY=.82;
const THUMB_EDGE=360;
const THUMB_QUALITY=.72;
/* Chargement progressif : la galerie pose les tuiles par paquets, jamais tout d'un coup. */
const PAGE_SIZE=24;
const GROUPS_COLLAPSED=3;
let dbPromise=null,dialog=null,viewer=null,activeStoreId='',compareOpen=false,moveDialog=null;
let selectedIds=new Set(),objectUrls=[];
/* Étiquettes appliquées à la PROCHAINE photo prise : le prompt de reporting exige des
   avant / après systématiques, et les régler après coup sur chaque carte est intenable
   sur le terrain. La famille suit par défaut celle de la visite en cours. */
let pendingFamily='',pendingMoment='',pendingCategory='';
const FAMILY_OPTIONS=[['','Non étiquetée'],['blanc','Blanc'],['brun','Brun']];
const MOMENT_OPTIONS=[['','Sans moment'],['avant','Avant'],['apres','Après']];
/* Catégories métier, toujours facultatives. Une famille = ses catégories propres + les
   communes. Pour en ajouter : registerCategory(famille, id, libellé). L'identifiant est
   ce qui est stocké ; le libellé peut évoluer sans migration. */
const CATEGORY_CATALOG={
  brun:[['tv','TV'],['oled','OLED'],['neo-qled','Neo QLED / Mini LED'],['qled','QLED'],['lifestyle','Lifestyle / Frame'],['audio','Audio'],['plv','PLV']],
  blanc:[['froid','Froid'],['lavage','Lavage'],['cuisson','Cuisson'],['micro-ondes','Micro-ondes'],['aspiration','Aspiration'],['pem','PEM']],
  commun:[['tg','TG'],['entree','Entrée magasin'],['mural','Mural'],['concurrence','Concurrence'],['anomalie','Anomalie merchandising']]
};
/* État de la galerie ouverte. `allRows` = toutes les photos du magasin (métadonnées +
   poignées Blob : IndexedDB ne lit pas les octets tant qu'on ne les affiche pas). */
let allRows=[],viewRows=[],renderedCount=0,shownCount=PAGE_SIZE,filters=freshFilters(),showAllGroups=false,renderToken=0,moreObserver=null,lastDay='';
let viewerRows=[],viewerIndex=-1,viewerUrl='',galleryDirty=false,swipeStart=null;
const thumbFailures=new Set();
let thumbQueue=Promise.resolve();

function safePart(value){return String(value==null?'':value).trim().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'photo'}
function scaleSize(width,height,maxEdge=MAX_EDGE){width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);const max=Math.max(width,height);if(max<=maxEdge)return{width:Math.round(width),height:Math.round(height)};const ratio=maxEdge/max;return{width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))}}
function defaultSelection(records,visitId){const rows=Array.isArray(records)?records:[],id=String(visitId||'');const linked=id?rows.filter(r=>String(r.visitId||'')===id):[];return new Set((linked.length?linked:rows.slice(0,2)).map(r=>String(r.id)))}
function extensionFor(type){type=String(type||'').toLowerCase();if(type.includes('png'))return'png';if(type.includes('webp'))return'webp';if(type.includes('heic')||type.includes('heif'))return'heic';return'jpg'}
function shareFileName(record,store){const stamp=String(record&&record.createdAt||'').replace(/[:.]/g,'-').replace('T','_').replace('Z','');const place=[store&&store.enseigne,store&&store.ville].filter(Boolean).map(safePart).join('-')||'magasin';
  /* Les étiquettes s'insèrent seulement si elles existent : un enregistrement d'avant leur
     introduction garde exactement le nom qu'il avait. Aucun nom de personne ici. */
  const tags=[record&&record.family,record&&record.moment].filter(Boolean).map(safePart).join('_');
  return place+(tags?'_'+tags:'')+'_'+(stamp||'photo')+'.'+extensionFor(record&&record.type)}
function uid(){try{if(root.crypto&&typeof root.crypto.randomUUID==='function')return root.crypto.randomUUID()}catch(e){}return 'photo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}
function storeById(id){return (root.state&&root.state.stores||[]).find(s=>String(s.id)===String(id))||null}
function storeName(id){const s=storeById(id);return s?[s.enseigne,s.ville].filter(Boolean).join(' · '):'Magasin'}
function visitRows(){return root.state&&root.state.businessV2&&Array.isArray(root.state.businessV2.visits)?root.state.businessV2.visits:[]}
function currentVisitId(storeId){const draft=visitRows().filter(v=>String(v.storeId)===String(storeId)&&v.status==='draft').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];return draft?String(draft.id):''}
function currentVisit(storeId){const id=currentVisitId(storeId);return id?visitRows().find(v=>String(v.id)===id)||null:null}
function defaultFamily(storeId){const v=currentVisit(storeId),f=v&&v.activeFamily;return f==='blanc'||f==='brun'?f:''}
function formatDate(value){try{return new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}catch(e){return String(value||'')}}
function pad(n){return String(n).padStart(2,'0')}
/* Jour LOCAL (celui du terrain), pas le jour UTC : une photo de 00 h 30 appartient au jour vécu. */
function localDay(value){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function frenchDay(day){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day||''));return m?m[3]+'/'+m[2]+'/'+m[1]:'Date inconnue'}
function familyKey(row){const f=String(row&&row.family||'');return f==='brun'||f==='blanc'?f:'none'}
function plural(n,word){return n+' '+word+(n>1?'s':'')}

/* --- Catégories ------------------------------------------------------------ */
function categoriesFor(family){const f=String(family||'');const own=f==='brun'||f==='blanc'?CATEGORY_CATALOG[f]:CATEGORY_CATALOG.brun.concat(CATEGORY_CATALOG.blanc);return own.concat(CATEGORY_CATALOG.commun).map(([id,label])=>({id,label}))}
function categoryLabel(id){const key=String(id||'');if(!key)return '';for(const list of Object.values(CATEGORY_CATALOG))for(const [k,label] of list)if(k===key)return label;return ''}
/* Une catégorie qui n'existe pas pour la famille de la photo tombe : « OLED » n'a pas de
   sens sur une photo BLANC. Les catégories communes (TG, Mural…) survivent au changement. */
function normalizeCategory(family,category){const c=String(category||'');return c&&categoriesFor(family).some(x=>x.id===c)?c:''}
function registerCategory(family,id,label){const bucket=family==='brun'||family==='blanc'?family:'commun',key=String(id||'').trim(),text=String(label||'').trim();if(!key||!text)return false;if(Object.values(CATEGORY_CATALOG).some(list=>list.some(([k])=>k===key)))return false;CATEGORY_CATALOG[bucket].push([key,text]);return true}

/* --- Regroupement et filtres (purs, testés hors navigateur) ---------------- */
function freshFilters(){return{family:'all',group:'',category:'',sort:'desc'}}
/* Une photo liée à une visite appartient à cette visite ; les autres sont regroupées par
   jour. C'est tout le « classement » : il découle des champs déjà présents, donc les
   anciennes photos sont classées exactement comme les nouvelles. */
function groupKeyOf(row){const v=String(row&&row.visitId||'');return v?'v:'+v:'d:'+(localDay(row&&row.createdAt)||'inconnue')}
function groupRows(rows,visits){
  const byId=new Map((Array.isArray(visits)?visits:[]).map(v=>[String(v&&v.id),v])),map=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const key=groupKeyOf(row);let g=map.get(key);
    if(!g){const vid=String(row.visitId||''),visit=vid?byId.get(vid):null;g={key,visitId:vid,isVisit:!!vid,day:(visit&&localDay(visit.createdAt))||localDay(row.createdAt),latest:'',total:0,brun:0,blanc:0,none:0};map.set(key,g)}
    g.total++;g[familyKey(row)]++;const c=String(row.createdAt||'');if(c>g.latest)g.latest=c;
  }
  return [...map.values()].sort((a,b)=>b.latest.localeCompare(a.latest)||(a.key<b.key?-1:a.key>b.key?1:0));
}
function groupLabel(group){if(!group)return '';return group.isVisit?'Visite du '+frenchDay(group.day):'Hors visite · '+frenchDay(group.day)}
function compareRows(a,b){return String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id))}
function filterRows(rows,f){
  const opt=Object.assign(freshFilters(),f||{});
  const out=(Array.isArray(rows)?rows:[]).filter(r=>(opt.family==='all'||familyKey(r)===opt.family)&&(!opt.group||groupKeyOf(r)===opt.group)&&(!opt.category||String(r.category||'')===opt.category));
  out.sort((a,b)=>opt.sort==='asc'?compareRows(a,b):compareRows(b,a));
  return out;
}
function familyCounts(rows,group){const c={all:0,brun:0,blanc:0,none:0};for(const r of Array.isArray(rows)?rows:[]){if(group&&groupKeyOf(r)!==group)continue;c.all++;c[familyKey(r)]++}return c}

/* --- Stockage --------------------------------------------------------------- */
function openDb(){
  if(dbPromise)return dbPromise;
  if(!root.indexedDB)return Promise.reject(new Error('Stockage photo indisponible sur cet appareil.'));
  dbPromise=new Promise((resolve,reject)=>{
    const req=root.indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;let os;
      if(!db.objectStoreNames.contains(STORE))os=db.createObjectStore(STORE,{keyPath:'id'});else os=req.transaction.objectStore(STORE);
      if(!os.indexNames.contains('storeId'))os.createIndex('storeId','storeId',{unique:false});
      if(!os.indexNames.contains('createdAt'))os.createIndex('createdAt','createdAt',{unique:false});
    };
    /* V257 — une connexion fermée (iOS en arrière-plan) ou sommée de céder la place
       (mise à niveau, suppression) n'est plus gardée en cache : la prochaine opération
       rouvre la base. Sans cela, les photos restaient inaccessibles jusqu'au redémarrage. */
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{try{db.close()}catch(e){}if(dbPromise===opened)dbPromise=null};db.onclose=()=>{if(dbPromise===opened)dbPromise=null};resolve(db)};
    req.onerror=()=>{if(dbPromise===opened)dbPromise=null;reject(req.error||new Error('Impossible d’ouvrir le stockage photo.'))};
  });
  const opened=dbPromise;
  return dbPromise;
}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Écriture photo interrompue.'))})}
async function putRecord(record){const db=await openDb(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);await txDone(tx);return record}
async function removeRecord(id){const db=await openDb(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(String(id));await txDone(tx);return true}
/* Lecture-modification-écriture d'UN enregistrement dans une seule transaction.
   `mutate` renvoie false pour ne rien écrire. Renvoie l'enregistrement écrit, ou null. */
async function patchRecord(id,mutate){const db=await openDb(),tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE),req=os.get(String(id));const row=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});if(!row||mutate(row)===false){tx.abort();await txDone(tx).catch(()=>{});return null}os.put(row);await txDone(tx);return row}
async function updateNote(id,note){return !!(await patchRecord(id,row=>{row.note=String(note||'').trim();row.updatedAt=new Date().toISOString()}))}
function applyTags(row,patch){
  if(patch&&patch.family!==undefined)row.family=['blanc','brun'].includes(patch.family)?patch.family:'';
  if(patch&&patch.moment!==undefined)row.moment=['avant','apres'].includes(patch.moment)?patch.moment:'';
  if(patch&&patch.category!==undefined)row.category=normalizeCategory(row.family,patch.category);
  else if(row.category)row.category=normalizeCategory(row.family,row.category);
  return row;
}
async function updateTags(id,patch){return !!(await patchRecord(id,row=>{applyTags(row,patch);row.updatedAt=new Date().toISOString()}))}
/* Miniature ajoutée après coup à une ancienne photo : on n'écrit que ce champ, et
   seulement s'il manque encore. `updatedAt` ne bouge pas, ce n'est pas une édition. */
async function saveThumb(id,thumb){return !!(await patchRecord(id,row=>{if(row.thumb)return false;row.thumb=thumb}))}
/* ---------------------------------------------------------------------------
   Déplacer des photos vers un autre magasin.

   Une photo prise dans le mauvais magasin n'a aucune raison d'être reprise :
   seul son `storeId` est faux. On le corrige sur place, sans toucher au blob ni
   aux étiquettes, et sans jamais créer ni supprimer d'enregistrement.
   --------------------------------------------------------------------------- */
function visitStoreId(visitId){
  const v=visitRows().find(x=>String(x.id)===String(visitId));
  return v&&v.storeId!=null?String(v.storeId):'';
}
/* Le lien de visite ne survit que s'il est vérifiablement une visite du magasin
   d'arrivée. Une visite inconnue n'est pas une visite du bon magasin : on coupe
   le lien plutôt que de laisser un rattachement qu'on ne peut pas justifier. */
function keepsVisitLink(visitId,targetStoreId){
  if(!visitId)return false;
  const owner=visitStoreId(visitId);
  return !!owner&&owner===String(targetStoreId);
}
async function moveRecords(ids,targetStoreId){
  const list=[...new Set((Array.isArray(ids)?ids:[ids]).map(x=>String(x==null?'':x).trim()).filter(Boolean))];
  const target=String(targetStoreId==null?'':targetStoreId).trim();
  if(!list.length)throw new Error('Sélectionne au moins une photo à déplacer.');
  if(!target)throw new Error('Choisis le magasin de destination.');
  if(!storeById(target))throw new Error('Magasin de destination introuvable.');
  const db=await openDb(),tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE);
  /* Toutes les lectures sont émises avant le premier await : une transaction
     IndexedDB se referme dès qu'elle n'a plus de requête en attente. */
  const pending=list.map(id=>({id,req:os.get(id)}));
  const rows=await Promise.all(pending.map(x=>new Promise((resolve,reject)=>{
    x.req.onsuccess=()=>resolve(x.req.result||null);
    x.req.onerror=()=>reject(x.req.error||new Error('Lecture de la photo impossible.'));
  })));
  const now=new Date().toISOString(),moved=[];
  rows.forEach((row,i)=>{
    if(!row)return;                                   /* déjà supprimée : on saute sans échouer */
    const from=String(row.storeId==null?'':row.storeId);
    if(from===target){moved.push({id:String(row.id),from,to:target,already:true});return}
    row.storeId=target;
    if(!keepsVisitLink(row.visitId,target))row.visitId=null;
    row.updatedAt=now;
    os.put(row);
    moved.push({id:String(row.id),from,to:target,already:false});
  });
  await txDone(tx);
  return moved;
}
async function list(storeId){
  const db=await openDb(),tx=db.transaction(STORE,'readonly'),idx=tx.objectStore(STORE).index('storeId'),rows=[];
  await new Promise((resolve,reject)=>{const req=idx.openCursor(root.IDBKeyRange.only(String(storeId)));req.onsuccess=()=>{const cur=req.result;if(!cur){resolve();return}rows.push(cur.value);cur.continue()};req.onerror=()=>reject(req.error||new Error('Lecture des photos impossible.'))});
  rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return rows;
}
function loadImage(file){
  if(typeof root.createImageBitmap==='function')return root.createImageBitmap(file,{imageOrientation:'from-image'}).catch(()=>root.createImageBitmap(file)).then(image=>({image,width:image.width,height:image.height,close:()=>{try{image.close()}catch(e){}}}));
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({image:img,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,close:()=>URL.revokeObjectURL(url)});img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Photo illisible.'))};img.src=url});
}
async function drawJpeg(decoded,edge,quality){
  const size=scaleSize(decoded.width,decoded.height,edge),canvas=root.document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Compression indisponible.');ctx.drawImage(decoded.image,0,0,size.width,size.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob)throw new Error('Compression indisponible.');canvas.width=canvas.height=0;return{blob,width:size.width,height:size.height};
}
async function compressImage(file){
  if(!file||!String(file.type||'').startsWith('image/'))throw new Error('Choisis une image ou prends une photo.');
  let decoded;
  try{
    decoded=await loadImage(file);const main=await drawJpeg(decoded,MAX_EDGE,JPEG_QUALITY);
    /* La miniature vient de la même image décodée : aucun second décodage. Son échec
       ne fait jamais échouer l'enregistrement de la photo. */
    let thumb=null;try{thumb=(await drawJpeg(decoded,THUMB_EDGE,THUMB_QUALITY)).blob}catch(e){thumb=null}
    return{blob:main.blob,type:main.blob.type||'image/jpeg',width:main.width,height:main.height,size:main.blob.size,thumb};
  }catch(error){
    if(file.size>12*1024*1024)throw new Error('Photo trop volumineuse pour être stockée sans compression.');
    return{blob:file,type:file.type||'image/jpeg',width:0,height:0,size:file.size||0,thumb:null};
  }finally{if(decoded&&decoded.close)decoded.close()}
}
async function makeThumb(blob){let decoded;try{decoded=await loadImage(blob);return (await drawJpeg(decoded,THUMB_EDGE,THUMB_QUALITY)).blob}finally{if(decoded&&decoded.close)decoded.close()}}
/* File d'attente séquentielle : une ancienne photo à la fois, jamais vingt décodages
   1600 px en parallèle sur un téléphone. */
function ensureThumb(row){
  if(!row)return Promise.resolve(null);if(row.thumb)return Promise.resolve(row.thumb);
  const id=String(row.id);if(thumbFailures.has(id)||!row.blob||!root.document)return Promise.resolve(null);
  const job=thumbQueue.then(async()=>{if(row.thumb)return row.thumb;try{const thumb=await makeThumb(row.blob);row.thumb=thumb;try{await saveThumb(id,thumb)}catch(e){}return thumb}catch(e){thumbFailures.add(id);return null}});
  thumbQueue=job.catch(()=>null);return job;
}
/* Sur iPhone, un stockage non persistant peut être purgé par le système : on le demande
   une fois, sans bloquer ni insister. Aucun effet si le navigateur refuse. */
let persistAsked=false;
function askPersistentStorage(){if(persistAsked)return;persistAsked=true;try{const s=root.navigator&&root.navigator.storage;if(s&&typeof s.persisted==='function'&&typeof s.persist==='function')s.persisted().then(p=>p||s.persist()).catch(()=>{})}catch(e){}}
async function addPhoto(storeId,file,visitId){
  const packed=await compressImage(file),linked=visitId===undefined?currentVisitId(storeId):String(visitId||''),now=new Date().toISOString();
  const family=['blanc','brun'].includes(pendingFamily)?pendingFamily:defaultFamily(storeId);
  const moment=['avant','apres'].includes(pendingMoment)?pendingMoment:'';
  const category=normalizeCategory(family,pendingCategory);
  askPersistentStorage();
  return putRecord({id:uid(),storeId:String(storeId),visitId:linked||null,createdAt:now,updatedAt:now,note:'',family,moment,category,blob:packed.blob,thumb:packed.thumb||null,type:packed.type,width:packed.width,height:packed.height,size:packed.size,originalName:String(file&&file.name||'')}).catch(err=>{throw friendlyStorageError(err)});
}
/* Une photo non étiquetée est volontairement rendue pour les deux familles : mieux vaut une
   photo en trop dans un compte rendu qu'une photo manquante. */
/* V231 — lecture seule : quelles photos portent encore ce lien de visite ?
   Les photos vivent dans IndexedDB, hors de `state` et donc hors de la transaction
   atomique qui supprime une visite : elles ne peuvent pas être nettoyées avec elle.
   Le balayage complet est volontaire — une photo prise pendant une visite peut se
   trouver sur n'importe quel magasin, et c'est exactement le cas qu'on veut détecter.
   Cette fonction ne supprime ni ne réécrit jamais un enregistrement. */
async function listByVisitId(visitId){
  const id=String(visitId==null?'':visitId);if(!id)return [];
  if(!root.indexedDB)return [];
  const db=await openDb(),tx=db.transaction(STORE,'readonly'),rows=[];
  await new Promise((resolve,reject)=>{
    const req=tx.objectStore(STORE).openCursor();
    req.onsuccess=()=>{const cur=req.result;if(!cur){resolve();return}if(String(cur.value&&cur.value.visitId||'')===id)rows.push(cur.value);cur.continue()};
    req.onerror=()=>reject(req.error||new Error('Lecture des photos impossible.'));
  });
  rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return rows;
}
async function listByFamily(storeId,family){const rows=await list(storeId);return rows.filter(r=>{const f=String(r&&r.family||'');return !f||f===String(family||'')})}
/* V235 — lecture STRICTE par famille, pour le partage et le reporting.
   `listByFamily` rend volontairement les photos non étiquetées aux deux familles :
   l'affichage historique en dépend, son contrat ne bouge pas.
   Mais un partage « Sortie magasin » qui reprend ces photos les envoie deux fois,
   une fois dans le lot BRUN et une fois dans le lot BLANC. Ici, seule une famille
   explicitement posée compte : une photo sans famille n'appartient à aucun lot.
   Aucun enregistrement n'est modifié — c'est une lecture, pas une migration. */
async function listStrictByFamily(storeId,family){const target=String(family||'');if(!target)return [];const rows=await list(storeId);return rows.filter(r=>String(r&&r.family||'')===target)}

/* --- Interface ---------------------------------------------------------------- */
function clearUrls(){for(const url of objectUrls)try{URL.revokeObjectURL(url)}catch(e){}objectUrls=[]}
function blobUrl(blob){const url=URL.createObjectURL(blob);objectUrls.push(url);return url}
function el(tag,text,cls){const node=root.document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node}
function btn(text,fn,cls='secondary'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b}
function setStatus(text,error=false){if(!dialog)return;const box=dialog.querySelector('#srPhotoStatus');box.textContent=text||'';box.classList.toggle('sr-photoError',!!error)}
function report(e){setStatus(e&&e.message||String(e),true)}
function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-store-photo-style'))return;
  const s=el('style');s.id='sr-store-photo-style';s.textContent=[
  '#storePhotosDialog [hidden],#srPhotoViewer [hidden]{display:none!important}',
  '#storePhotosDialog{box-sizing:border-box;width:min(720px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;overscroll-behavior:contain;padding:16px;border-radius:24px}',
  '.sr-photoHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-16px;background:#fff;padding:5px 0 10px;z-index:3}.sr-photoHead h2{margin:0;font-size:20px;overflow-wrap:anywhere}.sr-photoHead p{margin:4px 0 0;color:#667085;font-size:12px}',
  '.sr-photoClose{flex:0 0 auto;min-width:44px;min-height:44px;border:1px solid #dde3ec;background:#fff;border-radius:14px;font-size:20px}',
  '.sr-photoCapture{border:1px solid #e3e8f0;border-radius:18px;background:#f8fafc;padding:10px;margin:4px 0 8px}',
  '.sr-photoContext{margin:0 0 6px;font-size:12px;font-weight:750;color:#1d2939;line-height:1.35}.sr-photoContext span{color:#1428a0}',
  '.sr-photoActions,.sr-photoReportActions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.sr-photoActions button,.sr-photoReportActions button{min-height:46px}.sr-photoActions{margin-bottom:0}',
  '.sr-photoHint{font-size:11px;color:#667085;line-height:1.4;margin:8px 0}.sr-photoTags{margin:4px 0}.sr-photoTags .sr-photoHint{margin:0 0 4px}',
  '.sr-photoTagRow{display:flex;align-items:center;gap:6px;margin:6px 0}.sr-photoTagRow b{flex:0 0 62px;font-size:11px;color:#454b56}',
  '.sr-photoTagBtn{flex:1 1 0;min-width:0;min-height:44px;border:1px solid #d3d9e3;border-radius:12px;background:#fff;color:#454b56;font-weight:800;font-size:11.5px;padding:6px 4px}.sr-photoTagBtn[aria-pressed=true]{background:#1428a0;border-color:#1428a0;color:#fff}',
  '.sr-photoTagSelect{min-height:44px;width:100%;min-width:0;box-sizing:border-box;border:1px solid #d9dee8;border-radius:12px;font-size:12px;background:#fff;padding:0 6px;color:#1d1d1f}.sr-photoTagRow .sr-photoTagSelect{flex:1 1 auto}',
  '.sr-photoStatus{min-height:18px;font-size:12px;color:#315b9d;margin:8px 0}.sr-photoStatus.sr-photoError{color:#b42318}',
  '.sr-photoSeg{display:flex;gap:3px;background:#eef0f4;border-radius:14px;padding:3px;margin:4px 0 10px}.sr-photoSeg button{flex:1 1 0;min-width:0;min-height:42px;border:0;border-radius:11px;background:transparent;font-weight:800;font-size:12px;color:#454b56;white-space:nowrap;padding:0 4px}.sr-photoSeg button small{font-weight:700;opacity:.7;margin-left:3px}.sr-photoSeg button[aria-pressed=true]{background:#fff;color:#1428a0;box-shadow:0 1px 3px rgba(15,23,42,.14)}',
  '.sr-photoGroups{margin:0 0 8px}.sr-photoGroupsHead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 6px}.sr-photoGroupsHead b{font-size:13px}',
  '.sr-photoLink{min-height:36px;border:0;background:transparent;color:#1428a0;font-weight:800;font-size:12px;padding:0 4px}',
  '.sr-photoGroup{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;border:1px solid #e2e6ec;border-radius:14px;background:#fff;padding:4px;margin:0 0 6px}.sr-photoGroup[aria-current=true]{border-color:#1428a0;background:#eef2ff}',
  '.sr-photoGroupMain{min-height:44px;text-align:left;border:0;background:transparent;padding:4px 6px;min-width:0}.sr-photoGroupMain b{display:block;font-size:13px}.sr-photoGroupMain small{display:block;color:#667085;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.sr-photoGroupFams{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.sr-photoGroupFam{min-height:40px;border:1px solid #d3d9e3;border-radius:11px;background:#f4f6fa;font-size:11px;font-weight:800;padding:0 8px;white-space:nowrap}.sr-photoGroupFam[data-family=brun]{background:#2b2522;border-color:#2b2522;color:#fff}.sr-photoGroupFam[data-family=blanc]{background:#fff;color:#1d1d1f}',
  '.sr-photoActive{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}.sr-photoChip{min-height:36px;border:1px solid #1428a0;border-radius:18px;background:#eef2ff;color:#1428a0;font-weight:800;font-size:12px;padding:0 12px}',
  '.sr-photoGridHead{display:flex;align-items:center;gap:8px;margin:8px 0 6px}.sr-photoGridHead>b{flex:1 1 auto;font-size:13px;min-width:0}.sr-photoGridHead .sr-photoTagSelect{flex:0 1 150px;min-height:40px;width:auto}',
  '.sr-photoSort{flex:0 0 auto;min-height:40px;border:1px solid #d3d9e3;border-radius:12px;background:#fff;font-weight:800;font-size:12px;padding:0 10px;white-space:nowrap}',
  '.sr-photoCompare{border:1px solid #dfe5ef;border-radius:16px;background:#f8fafc;padding:10px;margin:10px 0}.sr-photoCompareGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sr-photoCompareCard{min-width:0}.sr-photoCompareCard img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:#eef1f5}.sr-photoCompareCard b,.sr-photoCompareCard span{display:block;font-size:11px;margin-top:4px}.sr-photoCompareCard span{color:#667085;line-height:1.35}',
  '.sr-photoGallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:6px}@media(min-width:600px){.sr-photoGallery{grid-template-columns:repeat(4,minmax(0,1fr))}}',
  '.sr-photoDay{grid-column:1/-1;margin:8px 0 0;font-size:12px;font-weight:800;color:#454b56}.sr-photoDay:first-child{margin-top:0}',
  '.sr-photoCard{position:relative;min-width:0;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:#e7ebf1}',
  '.sr-photoOpen{display:block;width:100%;height:100%;padding:0;margin:0;border:0;background:transparent;cursor:pointer}.sr-photoOpen img{display:block;width:100%;height:100%;object-fit:cover;transition:opacity .15s}.sr-photoCard.sr-photoPending img{opacity:0}',
  '.sr-photoBadge{position:absolute;left:4px;bottom:4px;max-width:calc(100% - 8px);box-sizing:border-box;padding:2px 6px;border-radius:8px;background:rgba(17,24,39,.74);color:#fff;font-size:10px;font-weight:800;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}.sr-photoBadge[data-family=blanc]{background:rgba(255,255,255,.94);color:#1d1d1f}.sr-photoBadge[data-family=none]{background:rgba(71,84,103,.78)}',
  '.sr-photoPick{position:absolute;top:0;right:0;width:44px;height:44px;box-sizing:border-box;display:flex;align-items:flex-start;justify-content:flex-end;padding:6px}.sr-photoPick input{width:22px;height:22px;margin:0;accent-color:#1428a0;filter:drop-shadow(0 0 2px rgba(0,0,0,.45))}',
  '.sr-photoMore{display:block;width:100%;min-height:46px;margin:10px 0 0}',
  '.sr-photoEmpty{grid-column:1/-1;padding:22px 10px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d8dee8;border-radius:16px}.sr-photoEmpty button{display:block;margin:10px auto 0;min-height:44px}',
  '.sr-photoMoveBar{margin:0 0 10px}.sr-photoMoveBar button{width:100%;min-height:46px}',
  '#srPhotoMoveDialog{box-sizing:border-box;width:min(520px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 40px);overflow:auto;padding:16px;border-radius:24px}#srPhotoMoveDialog::backdrop{background:rgba(15,23,42,.38)}.sr-photoMoveHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sr-photoMoveHead h2{margin:0;font-size:18px}.sr-photoMoveHead p{margin:4px 0 0;color:#667085;font-size:12px}.sr-photoMoveSearch{width:100%;box-sizing:border-box;min-height:44px;margin:12px 0 8px;border:1px solid #d9dee8;border-radius:12px;padding:0 11px;font-size:13px}.sr-photoMoveList{display:grid;gap:6px;max-height:46dvh;overflow:auto;margin-bottom:10px}.sr-photoMoveItem{display:block;width:100%;text-align:left;min-height:48px;border:1px solid #e2e6ec;border-radius:14px;background:#fff;padding:9px 11px;font-size:13px}.sr-photoMoveItem[aria-pressed=true]{border-color:#1428a0;background:#eef2ff}.sr-photoMoveItem b{display:block;font-weight:750}.sr-photoMoveItem small{display:block;color:#737b86;margin-top:2px;font-size:11px}.sr-photoMoveEmpty{padding:16px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d8dee8;border-radius:14px}.sr-photoMoveFoot{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sr-photoMoveFoot button{min-height:46px}',
  /* Visionneuse plein écran */
  '#srPhotoViewer{box-sizing:border-box;width:100vw;height:100dvh;max-width:100vw;max-height:100dvh;margin:0;padding:0;border:0;border-radius:0;background:#0b0f19;color:#fff;overflow:hidden}#srPhotoViewer[open]{display:flex;flex-direction:column}#srPhotoViewer::backdrop{background:#0b0f19}',
  '.sr-viewerTop{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px}',
  '.sr-viewerBack{min-height:44px;padding:0 14px;border-radius:14px;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.08);color:#fff;font-weight:800;font-size:14px}',
  '.sr-viewerCount{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;min-width:64px;text-align:right}',
  '.sr-viewerStage{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;touch-action:pan-y;-webkit-user-select:none;user-select:none;overflow:hidden}.sr-viewerStage img{display:block;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none}',
  '.sr-viewerNav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:64px;border:0;border-radius:14px;background:rgba(0,0,0,.38);color:#fff;font-size:30px;line-height:1}.sr-viewerNav.sr-prev{left:6px}.sr-viewerNav.sr-next{right:6px}.sr-viewerNav:disabled{opacity:0;pointer-events:none}',
  '.sr-viewerPanel{flex:0 0 auto;max-height:46dvh;overflow:auto;background:#fff;color:#1d1d1f;border-radius:20px 20px 0 0;padding:12px 12px calc(env(safe-area-inset-bottom,0px) + 12px)}',
  '.sr-viewerMeta{margin:0 0 8px;font-size:12px;font-weight:750;color:#344054;line-height:1.35}',
  '.sr-viewerTags{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 8px}.sr-viewerTags label{display:block;min-width:0;font-size:10.5px;font-weight:800;color:#667085}.sr-viewerTags .sr-photoTagSelect{margin-top:2px}',
  '.sr-photoNote{width:100%;min-height:44px;border:1px solid #d9dee8;border-radius:11px;padding:8px;font-size:13px;box-sizing:border-box}',
  '.sr-viewerActions{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:6px;margin-top:8px}.sr-viewerActions button,.sr-viewerPick{min-height:44px;font-size:12px}.sr-viewerPick{display:flex;align-items:center;gap:6px;font-weight:800;color:#1d2939;min-width:0}.sr-viewerPick input{width:20px;height:20px;margin:0;flex:0 0 auto;accent-color:#1428a0}',
  '#storeQuickSheet .sheetActions>#storePhotosQuickBtn{min-height:45px}#srStorePhotosBtn{width:100%;min-height:44px;margin:8px 0 0}',
  '@media(max-width:620px){#storeQuickSheet .sheetActions>button[onclick*="appointmentFromQuick"]{grid-column:1/-1}#storeQuickSheet .sheetActions>button[onclick*="fullStoreFromQuick"]{grid-column:1!important}#storeQuickSheet .sheetActions>#storePhotosQuickBtn{grid-column:2!important}}',
  '@media(max-width:520px){.sr-photoActions,.sr-photoReportActions{grid-template-columns:1fr 1fr}#storePhotosDialog{padding:14px 12px}}'
  ].join('');root.document.head.appendChild(s)
}

/* --- Étiquettes de la prochaine photo --------------------------------------- */
function tagRow(host,label,options,value,pick){
  const row=el('div',undefined,'sr-photoTagRow');row.append(el('b',label));
  for(const [key,text] of options){const b=btn(text,()=>{pick(key);renderPendingTags()},'sr-photoTagBtn');b.setAttribute('aria-pressed',String(value)===key?'true':'false');b.dataset.tag=key;row.append(b)}
  host.append(row);
}
function categorySelect(family,value,label){
  const sel=el('select');sel.className='sr-photoTagSelect';sel.setAttribute('aria-label',label);
  const none=el('option','Sans catégorie');none.value='';sel.append(none);
  for(const c of categoriesFor(family)){const o=el('option',c.label);o.value=c.id;sel.append(o)}
  sel.value=normalizeCategory(family,value);return sel;
}
function renderContext(){
  if(!dialog)return;const box=dialog.querySelector('#srPhotoContext');if(!box)return;
  const v=currentVisit(activeStoreId),fam=pendingFamily?pendingFamily.toUpperCase():'sans famille';
  box.replaceChildren(root.document.createTextNode('Prochaine photo classée : '));
  const where=v?'visite du '+frenchDay(localDay(v.createdAt)||localDay(new Date().toISOString())):'hors visite, au '+frenchDay(localDay(new Date().toISOString()));
  box.append(el('span',where+' · '+fam+(pendingCategory?' · '+categoryLabel(pendingCategory):'')));
}
function renderPendingTags(){
  if(!dialog)return;const host=dialog.querySelector('#srPhotoTags');if(!host)return;host.replaceChildren();
  pendingCategory=normalizeCategory(pendingFamily,pendingCategory);
  host.append(el('p','S’appliquent à la prochaine photo prise. Tout est facultatif.','sr-photoHint'));
  tagRow(host,'Famille',FAMILY_OPTIONS,pendingFamily,v=>{pendingFamily=v});
  tagRow(host,'Moment',MOMENT_OPTIONS,pendingMoment,v=>{pendingMoment=v});
  const row=el('div',undefined,'sr-photoTagRow');row.append(el('b','Catégorie'));
  const sel=categorySelect(pendingFamily,pendingCategory,'Catégorie de la prochaine photo (facultatif)');sel.id='srPendingCategory';
  sel.onchange=()=>{pendingCategory=normalizeCategory(pendingFamily,sel.value);renderContext()};row.append(sel);host.append(row);
  renderContext();
}

function ensureDialog(){
  if(dialog)return dialog;if(!root.document)return null;ensureStyle();
  dialog=el('dialog');dialog.id='storePhotosDialog';dialog.innerHTML='<div class="sr-photoHead"><div><h2 id="srPhotoTitle">Photos magasin</h2><p id="srPhotoSubtitle"></p></div><button type="button" class="sr-photoClose" id="srPhotoClose" aria-label="Fermer">×</button></div>'
    +'<section class="sr-photoCapture" aria-label="Prendre une photo"><p id="srPhotoContext" class="sr-photoContext"></p><section id="srPhotoTags" class="sr-photoTags" aria-label="Étiquettes de la prochaine photo"></section><div class="sr-photoActions"><button type="button" class="primary" id="srTakePhoto">📷 Prendre une photo</button><button type="button" class="secondary" id="srChoosePhoto">🖼 Choisir dans Photos</button></div><input id="srPhotoCameraInput" type="file" accept="image/*" capture="environment" hidden><input id="srPhotoLibraryInput" type="file" accept="image/*" multiple hidden></section>'
    +'<p id="srPhotoStatus" class="sr-photoStatus" role="status"></p>'
    +'<div id="srPhotoFamilyFilter" class="sr-photoSeg" role="group" aria-label="Filtrer par famille"></div>'
    +'<section id="srPhotoGroups" class="sr-photoGroups" aria-label="Photos par visite"></section>'
    +'<div id="srPhotoActiveFilters" class="sr-photoActive"></div>'
    +'<div class="sr-photoReportActions"><button type="button" class="primary" id="srSharePhotos">Partager la sélection pour le rapport</button><button type="button" class="secondary" id="srComparePhotos">Comparer les 2 dernières</button></div>'
    +'<div class="sr-photoMoveBar" id="srPhotoMoveBar" hidden><button type="button" class="secondary" id="srMovePhotos">Déplacer la sélection</button></div>'
    +'<section id="srPhotoComparePanel" class="sr-photoCompare" hidden></section>'
    +'<div class="sr-photoGridHead"><b id="srPhotoGridTitle"></b><span id="srPhotoCategoryFilterHost"></span><button type="button" class="sr-photoSort" id="srPhotoSort"></button></div>'
    +'<div id="srPhotoGallery" class="sr-photoGallery"></div><button type="button" class="secondary sr-photoMore" id="srPhotoMore" hidden></button>'
    +'<p class="sr-photoHint">Les photos restent sur cet appareil, même hors ligne. Elles ne sont jamais envoyées automatiquement et ne font pas partie de la sauvegarde JSON.</p>';
  root.document.body.appendChild(dialog);
  const camera=dialog.querySelector('#srPhotoCameraInput'),library=dialog.querySelector('#srPhotoLibraryInput');
  dialog.querySelector('#srPhotoClose').onclick=closeDialog;
  dialog.querySelector('#srTakePhoto').onclick=()=>camera.click();
  dialog.querySelector('#srChoosePhoto').onclick=()=>library.click();
  camera.addEventListener('change',()=>consumeInput(camera));library.addEventListener('change',()=>consumeInput(library));
  dialog.querySelector('#srSharePhotos').onclick=shareSelected;
  dialog.querySelector('#srMovePhotos').onclick=openMoveDialog;
  dialog.querySelector('#srComparePhotos').onclick=()=>{compareOpen=!compareOpen;renderBrowse(true)};
  dialog.querySelector('#srPhotoSort').onclick=()=>setFilters({sort:filters.sort==='asc'?'desc':'asc'});
  dialog.querySelector('#srPhotoMore').onclick=()=>{shownCount+=PAGE_SIZE;renderGridPage()};
  /* Chargement progressif : le paquet suivant arrive quand le bouton entre à l'écran.
     Le bouton reste utilisable seul si IntersectionObserver manque. */
  if(typeof root.IntersectionObserver==='function'){moreObserver=new root.IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&dialog.open&&renderedCount<viewRows.length){shownCount+=PAGE_SIZE;renderGridPage()}},{root:dialog,rootMargin:'0px 0px 240px 0px'});moreObserver.observe(dialog.querySelector('#srPhotoMore'))}
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog()});
  return dialog;
}
async function consumeInput(input){
  const files=Array.from(input.files||[]);input.value='';if(!files.length)return;
  setStatus('Enregistrement de '+files.length+' photo'+(files.length>1?'s':'')+'…');
  try{
    let last=null;for(const file of files){last=await addPhoto(activeStoreId,file);selectedIds.add(String(last.id))}
    /* La photo qu'on vient de prendre doit être visible : un filtre qui l'exclurait est levé. */
    if(last){const next={};if(filters.family!=='all'&&familyKey(last)!==filters.family)next.family='all';if(filters.group&&groupKeyOf(last)!==filters.group)next.group=groupKeyOf(last);if(filters.category&&String(last.category||'')!==filters.category)next.category='';Object.assign(filters,next)}
    await render();setStatus(files.length+' photo'+(files.length>1?'s enregistrées':' enregistrée')+'.');
  }catch(e){report(e)}
}
function downloadRecord(record){
  const store=storeById(record.storeId),url=URL.createObjectURL(record.blob),a=el('a');a.href=url;a.download=shareFileName(record,store);a.style.display='none';root.document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)
}
async function shareRecords(records){
  const rows=Array.isArray(records)?records:[];
  const files=rows.map(r=>new File([r.blob],shareFileName(r,storeById(r.storeId)),{type:r.type||r.blob.type||'image/jpeg',lastModified:new Date(r.createdAt).getTime()||Date.now()})),nav=root.navigator||{};
  const titleStoreId=rows.length?rows[0].storeId:activeStoreId;
  let can=false;try{can=!!(nav.share&&(!nav.canShare||nav.canShare({files})))}catch(e){can=false}
  if(can){await nav.share({files,title:'Photos terrain · '+storeName(titleStoreId),text:'Photos Store Runner à joindre au rapport terrain.'});return'shared'}
  if(rows.length===1){downloadRecord(rows[0]);return'downloaded'}
  return'unsupported';
}
async function shareSelected(){
  try{const rows=(await list(activeStoreId)).filter(r=>selectedIds.has(String(r.id)));if(!rows.length){setStatus('Sélectionne au moins une photo pour le rapport.',true);return false}setStatus('Préparation du partage…');const result=await shareRecords(rows);if(result==='shared')setStatus(rows.length+' photo'+(rows.length>1?'s partagées':' partagée')+' pour le rapport.');else if(result==='downloaded')setStatus('Photo téléchargée.');else setStatus('Partage de plusieurs fichiers indisponible ici. Ouvre une photo puis Télécharger.',true);return true}catch(e){if(e&&e.name==='AbortError'){setStatus('Partage annulé.');return false}setStatus('Partage impossible : '+(e.message||String(e)),true);return false}
}
function renderComparison(){
  const panel=dialog.querySelector('#srPhotoComparePanel');panel.replaceChildren();
  const rows=filterRows(allRows,Object.assign({},filters,{sort:'desc'}));
  panel.hidden=!compareOpen||rows.length<2;if(panel.hidden)return;
  const grid=el('div',undefined,'sr-photoCompareGrid'),pair=[{label:'Avant',row:rows[1]},{label:'Maintenant',row:rows[0]}];
  for(const item of pair){const card=el('div',undefined,'sr-photoCompareCard'),img=el('img');img.src=blobUrl(item.row.thumb||item.row.blob);img.alt=item.label+' · '+formatDate(item.row.createdAt);card.append(img,el('b',item.label+' · '+formatDate(item.row.createdAt)),el('span',item.row.note||'Aucune note'));grid.append(card)}panel.append(el('b','Comparaison des 2 dernières photos'),grid)
}
function syncMoveButton(){
  if(!dialog)return;
  const bar=dialog.querySelector('#srPhotoMoveBar');if(!bar)return;
  const n=selectedIds.size;
  /* Rien de coché : le bouton n'a rien à déplacer, il disparaît. */
  bar.hidden=n===0;
  const b=bar.querySelector('#srMovePhotos');
  if(b)b.textContent=n>1?'Déplacer les '+n+' photos sélectionnées':'Déplacer la photo sélectionnée';
  const share=dialog.querySelector('#srSharePhotos');if(share)share.textContent=n?'Partager la sélection ('+n+') pour le rapport':'Partager la sélection pour le rapport';
}
function movableStores(){
  return (root.state&&root.state.stores||[])
    .filter(s=>s&&s.id!=null&&s.active!==false&&String(s.id)!==String(activeStoreId));
}
function ensureMoveDialog(){
  if(moveDialog)return moveDialog;if(!root.document)return null;ensureStyle();
  moveDialog=el('dialog');moveDialog.id='srPhotoMoveDialog';
  moveDialog.innerHTML='<div class="sr-photoMoveHead"><div><h2>Déplacer vers un autre magasin</h2><p id="srPhotoMoveCount"></p></div><button type="button" class="sr-photoClose" id="srPhotoMoveClose" aria-label="Fermer">×</button></div><input id="srPhotoMoveSearch" class="sr-photoMoveSearch" type="search" placeholder="Enseigne, ville, adresse" aria-label="Rechercher un magasin"><div id="srPhotoMoveList" class="sr-photoMoveList" role="listbox" aria-label="Magasins de destination"></div><p id="srPhotoMoveStatus" class="sr-photoStatus" role="status"></p><div class="sr-photoMoveFoot"><button type="button" class="secondary" id="srPhotoMoveCancel">Annuler</button><button type="button" class="primary" id="srPhotoMoveConfirm">Déplacer</button></div>';
  root.document.body.appendChild(moveDialog);
  moveDialog.querySelector('#srPhotoMoveClose').onclick=closeMoveDialog;
  moveDialog.querySelector('#srPhotoMoveCancel').onclick=closeMoveDialog;
  moveDialog.querySelector('#srPhotoMoveConfirm').onclick=confirmMove;
  moveDialog.querySelector('#srPhotoMoveSearch').addEventListener('input',renderMoveList);
  moveDialog.addEventListener('cancel',e=>{e.preventDefault();closeMoveDialog()});
  return moveDialog;
}
function moveStatus(text,error=false){
  if(!moveDialog)return;const box=moveDialog.querySelector('#srPhotoMoveStatus');
  box.textContent=text||'';box.classList.toggle('sr-photoError',!!error);
}
function renderMoveList(){
  if(!moveDialog)return;
  const host=moveDialog.querySelector('#srPhotoMoveList');
  const q=String(moveDialog.querySelector('#srPhotoMoveSearch').value||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const picked=moveDialog.dataset.targetId||'';
  host.replaceChildren();
  const rows=movableStores().filter(s=>{
    if(!q)return true;
    const hay=[s.enseigne,s.ville,s.adresse].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    return hay.includes(q);
  }).sort((a,b)=>String(a.enseigne||'').localeCompare(String(b.enseigne||''),'fr')||String(a.ville||'').localeCompare(String(b.ville||''),'fr')).slice(0,60);
  if(!rows.length){host.append(el('div','Aucun magasin ne correspond.','sr-photoMoveEmpty'));return}
  for(const s of rows){
    const b=btn('',()=>{moveDialog.dataset.targetId=String(s.id);moveStatus('');renderMoveList()},'sr-photoMoveItem');
    b.setAttribute('role','option');
    b.setAttribute('aria-pressed',String(s.id)===picked?'true':'false');
    b.setAttribute('aria-selected',String(s.id)===picked?'true':'false');
    b.dataset.moveTarget=String(s.id);
    b.append(el('b',[s.enseigne,s.ville].filter(Boolean).join(' · ')||'Magasin'),el('small',s.adresse||'Adresse non renseignée'));
    host.append(b);
  }
}
function openMoveDialog(){
  if(!selectedIds.size){setStatus('Sélectionne au moins une photo à déplacer.',true);return false}
  ensureMoveDialog();
  moveDialog.dataset.targetId='';
  moveDialog.querySelector('#srPhotoMoveSearch').value='';
  const n=selectedIds.size;
  moveDialog.querySelector('#srPhotoMoveCount').textContent=n+' photo'+(n>1?'s':'')+' · actuellement dans '+storeName(activeStoreId);
  moveStatus('');
  renderMoveList();
  if(typeof moveDialog.showModal==='function'&&!moveDialog.open)moveDialog.showModal();else moveDialog.setAttribute('open','');
  return true;
}
function closeMoveDialog(){
  if(!moveDialog)return;
  if(typeof moveDialog.close==='function'&&moveDialog.open)moveDialog.close();else moveDialog.removeAttribute('open');
}
async function confirmMove(){
  if(!moveDialog)return false;
  const target=moveDialog.dataset.targetId||'';
  if(!target){moveStatus('Choisis le magasin de destination.',true);return false}
  const ids=[...selectedIds];
  if(!ids.length){moveStatus('Sélectionne au moins une photo à déplacer.',true);return false}
  try{
    moveStatus('Déplacement…');
    const moved=await moveRecords(ids,target);
    const n=moved.filter(m=>!m.already).length;
    closeMoveDialog();
    for(const m of moved)selectedIds.delete(String(m.id));
    await render();
    setStatus(n?(n+' photo'+(n>1?'s déplacées':' déplacée')+' vers '+storeName(target)+'.'):'Ces photos étaient déjà dans '+storeName(target)+'.');
    return true;
  }catch(e){moveStatus(e.message||String(e),true);return false}
}

/* --- Galerie ----------------------------------------------------------------- */
function setFilters(patch){
  Object.assign(filters,patch||{});renderBrowse();
  /* Un filtre choisi tout en bas de la galerie remonte au début des résultats. */
  const head=dialog&&dialog.querySelector('#srPhotoFamilyFilter');if(head&&dialog.scrollTop>head.offsetTop)dialog.scrollTop=Math.max(0,head.offsetTop-72);
}
function renderFamilyFilter(){
  const host=dialog.querySelector('#srPhotoFamilyFilter');host.replaceChildren();
  const counts=familyCounts(allRows,filters.group);
  const items=[['all','Toutes'],['brun','BRUN'],['blanc','BLANC']];
  /* Les anciennes photos sans famille gardent leur propre accès : elles ne sont jamais
     mêlées à BRUN ou BLANC, mais restent trouvables. */
  if(counts.none||filters.family==='none')items.push(['none','Sans']);
  if(filters.family!=='all'&&!items.some(([k])=>k===filters.family))filters.family='all';
  for(const [key,label] of items){const b=btn(label,()=>setFilters({family:key}),'');b.dataset.familyFilter=key;b.setAttribute('aria-label',(key==='none'?'Sans famille':label)+' · '+plural(counts[key]||0,'photo'));b.setAttribute('aria-pressed',filters.family===key?'true':'false');b.append(el('small',String(counts[key]||0)));host.append(b)}
  host.hidden=!allRows.length;
}
function renderGroups(){
  const host=dialog.querySelector('#srPhotoGroups');host.replaceChildren();
  const groups=groupRows(allRows,visitRows());
  if(groups.length<2&&!filters.group){host.hidden=true;return}
  host.hidden=false;
  const head=el('div',undefined,'sr-photoGroupsHead');head.append(el('b','Par visite / date'));
  if(groups.length>GROUPS_COLLAPSED)head.append(btn(showAllGroups?'Réduire':'Tout voir ('+groups.length+')',()=>{showAllGroups=!showAllGroups;renderGroups()},'sr-photoLink'));
  host.append(head);
  let visible=showAllGroups?groups:groups.slice(0,GROUPS_COLLAPSED);
  /* La visite filtrée reste toujours affichée, même repliée plus bas dans la liste. */
  if(filters.group&&!visible.some(g=>g.key===filters.group)){const g=groups.find(x=>x.key===filters.group);if(g)visible=visible.concat(g)}
  for(const g of visible){
    const row=el('div',undefined,'sr-photoGroup');row.dataset.photoGroup=g.key;row.setAttribute('aria-current',filters.group===g.key?'true':'false');
    const main=btn('',()=>setFilters({group:filters.group===g.key&&filters.family==='all'?'':g.key,family:'all'}),'sr-photoGroupMain');
    main.append(el('b',frenchDay(g.day)),el('small',(g.isVisit?'Visite':'Hors visite')+' · '+plural(g.total,'photo')));
    main.setAttribute('aria-label',groupLabel(g)+', '+plural(g.total,'photo'));
    const fams=el('div',undefined,'sr-photoGroupFams');
    for(const [key,label] of [['brun','BRUN'],['blanc','BLANC'],['none','Sans']]){if(!g[key])continue;const b=btn(label+' · '+g[key],()=>setFilters({group:g.key,family:key}),'sr-photoGroupFam');b.dataset.family=key;b.dataset.groupFamily=key;b.setAttribute('aria-label',groupLabel(g)+' · '+(key==='none'?'sans famille':label)+' · '+plural(g[key],'photo'));fams.append(b)}
    row.append(main,fams);host.append(row);
  }
}
function renderActiveFilters(){
  const host=dialog.querySelector('#srPhotoActiveFilters');host.replaceChildren();
  if(filters.group){const g=groupRows(allRows,visitRows()).find(x=>x.key===filters.group),visitId=filters.group.startsWith('v:')?filters.group.slice(2):'',v=visitId?visitRows().find(x=>String(x.id)===visitId):null;
    const label=g?groupLabel(g):(v?'Visite du '+frenchDay(localDay(v.createdAt)):'Visite');
    const chip=btn(label+'  ✕',()=>setFilters({group:''}),'sr-photoChip');chip.id='srPhotoClearGroup';chip.setAttribute('aria-label','Retirer le filtre '+label);host.append(chip)}
  host.hidden=!host.childNodes.length;
}
function renderCategoryFilter(scope){
  const host=dialog.querySelector('#srPhotoCategoryFilterHost');host.replaceChildren();
  const used=new Set(scope.map(r=>String(r.category||'')).filter(Boolean));
  if(filters.category&&!used.has(filters.category))used.add(filters.category);
  if(!used.size)return;
  const sel=el('select');sel.className='sr-photoTagSelect';sel.id='srPhotoCategoryFilter';sel.setAttribute('aria-label','Filtrer par catégorie');
  const all=el('option','Toutes catégories');all.value='';sel.append(all);
  for(const id of [...used].sort((a,b)=>categoryLabel(a).localeCompare(categoryLabel(b),'fr'))){const o=el('option',categoryLabel(id)||id);o.value=id;sel.append(o)}
  sel.value=filters.category;sel.onchange=()=>setFilters({category:sel.value});host.append(sel);
}
function badgeText(row){const f=familyKey(row);return [f==='none'?'':f.toUpperCase(),categoryLabel(row.category),row.moment==='avant'?'Avant':row.moment==='apres'?'Après':''].filter(Boolean).join(' · ')}
function tileFor(row,index,token){
  const card=el('article',undefined,'sr-photoCard');card.dataset.photoId=String(row.id);card.dataset.family=familyKey(row);
  const open=btn('',()=>openViewer(index),'sr-photoOpen');open.setAttribute('aria-label','Ouvrir la photo du '+formatDate(row.createdAt)+(badgeText(row)?' · '+badgeText(row):''));
  const img=el('img');img.alt='';img.decoding='async';img.loading='lazy';img.draggable=false;open.append(img);
  if(row.thumb)img.src=blobUrl(row.thumb);
  else{card.classList.add('sr-photoPending');ensureThumb(row).then(thumb=>{if(token!==renderToken)return;img.src=blobUrl(thumb||row.blob);card.classList.remove('sr-photoPending')})}
  card.append(open);
  const text=badgeText(row);if(text){const badge=el('span',text,'sr-photoBadge');badge.dataset.family=familyKey(row);card.append(badge)}
  const pick=el('label',undefined,'sr-photoPick'),check=el('input');check.type='checkbox';check.checked=selectedIds.has(String(row.id));check.dataset.photoSelect=String(row.id);check.setAttribute('aria-label','Inclure au rapport');
  check.onchange=()=>{if(check.checked)selectedIds.add(String(row.id));else selectedIds.delete(String(row.id));syncMoveButton()};pick.append(check);card.append(pick);
  return card;
}
function renderGridPage(){
  if(!dialog)return;const gallery=dialog.querySelector('#srPhotoGallery'),token=renderToken,end=Math.min(viewRows.length,shownCount);
  const frag=root.document.createDocumentFragment();
  for(let i=renderedCount;i<end;i++){const row=viewRows[i],day=localDay(row.createdAt);if(day!==lastDay){lastDay=day;frag.append(el('h3',frenchDay(day),'sr-photoDay'))}frag.append(tileFor(row,i,token))}
  gallery.append(frag);renderedCount=end;
  const more=dialog.querySelector('#srPhotoMore'),rest=viewRows.length-renderedCount;
  more.hidden=rest<=0;more.textContent=rest>0?'Afficher '+Math.min(PAGE_SIZE,rest)+' photo'+(Math.min(PAGE_SIZE,rest)>1?'s':'')+' de plus ('+rest+' restante'+(rest>1?'s':'')+')':'';
}
/* `keepPages` : garder les paquets déjà chargés (retour de la visionneuse, comparaison). */
function renderBrowse(keepPages){
  if(!dialog)return [];if(!keepPages)shownCount=PAGE_SIZE;
  renderToken++;clearUrls();
  const groups=groupRows(allRows,visitRows()),visits=groups.filter(g=>g.isVisit).length;
  dialog.querySelector('#srPhotoTitle').textContent='Photos · '+storeName(activeStoreId);
  dialog.querySelector('#srPhotoSubtitle').textContent=allRows.length+' photo'+(allRows.length>1?'s':'')+' enregistrée'+(allRows.length>1?'s':'')+(visits?' · '+plural(visits,'visite'):'');
  renderFamilyFilter();renderGroups();renderActiveFilters();
  viewRows=filterRows(allRows,filters);
  const scope=filterRows(allRows,{family:filters.family,group:filters.group});
  renderCategoryFilter(scope);
  const compareButton=dialog.querySelector('#srComparePhotos'),recentCount=filterRows(allRows,Object.assign({},filters,{sort:'desc'})).length;
  if(recentCount<2)compareOpen=false;compareButton.disabled=recentCount<2;compareButton.textContent=compareOpen?'Masquer la comparaison':'Comparer les 2 dernières';
  renderComparison();syncMoveButton();
  const sort=dialog.querySelector('#srPhotoSort');sort.textContent=filters.sort==='asc'?'↑ Anciennes':'↓ Récentes';sort.setAttribute('aria-label',filters.sort==='asc'?'Tri : plus anciennes d’abord. Toucher pour les plus récentes.':'Tri : plus récentes d’abord. Toucher pour les plus anciennes.');
  const head=dialog.querySelector('.sr-photoGridHead');head.hidden=!allRows.length;
  dialog.querySelector('#srPhotoGridTitle').textContent=plural(viewRows.length,'photo');
  const gallery=dialog.querySelector('#srPhotoGallery');gallery.replaceChildren();renderedCount=0;lastDay='';
  if(!allRows.length){gallery.append(el('div','Aucune photo pour ce magasin. Prends-en une pendant la visite pour construire l’historique visuel.','sr-photoEmpty'));dialog.querySelector('#srPhotoMore').hidden=true;return viewRows}
  if(!viewRows.length){const empty=el('div',filters.group?'Aucune photo pour cette visite avec ce filtre.':'Aucune photo pour ce filtre.','sr-photoEmpty');empty.append(btn('Voir toutes les photos',()=>setFilters(freshFilters()),'secondary'));gallery.append(empty);dialog.querySelector('#srPhotoMore').hidden=true;return viewRows}
  renderGridPage();
  return viewRows;
}
async function render(){
  ensureDialog();const rows=await list(activeStoreId);allRows=rows;
  const ids=new Set(rows.map(r=>String(r.id)));selectedIds=new Set([...selectedIds].filter(id=>ids.has(id)));if(!selectedIds.size&&rows.length)selectedIds=defaultSelection(rows,currentVisitId(activeStoreId));
  renderPendingTags();
  renderBrowse();
  return rows;
}

/* --- Visionneuse plein écran ------------------------------------------------- */
function ensureViewer(){
  if(viewer)return viewer;if(!root.document)return null;ensureStyle();
  viewer=el('dialog');viewer.id='srPhotoViewer';viewer.setAttribute('aria-label','Photo en plein écran');
  viewer.innerHTML='<div class="sr-viewerTop"><button type="button" class="sr-viewerBack" id="srViewerBack">‹ Galerie</button><b class="sr-viewerCount" id="srViewerCount" aria-live="polite"></b></div>'
    +'<div class="sr-viewerStage" id="srViewerStage"><img id="srViewerImg" alt=""><button type="button" class="sr-viewerNav sr-prev" id="srViewerPrev" aria-label="Photo précédente">‹</button><button type="button" class="sr-viewerNav sr-next" id="srViewerNext" aria-label="Photo suivante">›</button></div>'
    +'<div class="sr-viewerPanel"><p class="sr-viewerMeta" id="srViewerMeta"></p><div class="sr-viewerTags" id="srViewerTags"></div><input type="text" class="sr-photoNote" id="srViewerNote" placeholder="Note / changement observé" aria-label="Note de la photo"><div class="sr-viewerActions"><label class="sr-viewerPick"><input type="checkbox" id="srViewerPick">Inclure au rapport</label><button type="button" class="secondary" id="srViewerDownload">Télécharger</button><button type="button" class="danger" id="srViewerDelete">Supprimer</button></div><p class="sr-photoStatus" id="srViewerStatus" role="status"></p></div>';
  root.document.body.appendChild(viewer);
  viewer.querySelector('#srViewerBack').onclick=closeViewer;
  viewer.querySelector('#srViewerPrev').onclick=()=>stepViewer(-1);
  viewer.querySelector('#srViewerNext').onclick=()=>stepViewer(1);
  viewer.querySelector('#srViewerDownload').onclick=()=>{const r=viewerRows[viewerIndex];if(r)downloadRecord(r)};
  viewer.querySelector('#srViewerDelete').onclick=deleteCurrent;
  const note=viewer.querySelector('#srViewerNote');
  note.addEventListener('change',async()=>{const r=viewerRows[viewerIndex];if(!r)return;try{await updateNote(r.id,note.value);r.note=String(note.value||'').trim();viewerStatus('Note photo enregistrée.');galleryDirty=true}catch(e){viewerStatus(e.message||String(e),true)}});
  const pick=viewer.querySelector('#srViewerPick');
  pick.addEventListener('change',()=>{const r=viewerRows[viewerIndex];if(!r)return;if(pick.checked)selectedIds.add(String(r.id));else selectedIds.delete(String(r.id));galleryDirty=true});
  /* Balayage gauche / droite. `touch-action:pan-y` laisse le défilement vertical au
     navigateur et nous confie l'horizontal. Un geste court ou oblique est ignoré. */
  const stage=viewer.querySelector('#srViewerStage');
  stage.addEventListener('pointerdown',e=>{if(e.target&&e.target.closest&&e.target.closest('button'))return;swipeStart={x:e.clientX,y:e.clientY}});
  stage.addEventListener('pointerup',e=>{if(!swipeStart)return;const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;swipeStart=null;if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.3)stepViewer(dx<0?1:-1)});
  stage.addEventListener('pointercancel',()=>{swipeStart=null});
  viewer.addEventListener('keydown',e=>{const t=e.target&&e.target.tagName;if(t==='INPUT'||t==='SELECT'||t==='TEXTAREA')return;if(e.key==='ArrowLeft'){e.preventDefault();stepViewer(-1)}else if(e.key==='ArrowRight'){e.preventDefault();stepViewer(1)}});
  viewer.addEventListener('cancel',e=>{e.preventDefault();closeViewer()});
  return viewer;
}
function viewerStatus(text,error=false){if(!viewer)return;const box=viewer.querySelector('#srViewerStatus');box.textContent=text||'';box.classList.toggle('sr-photoError',!!error)}
function revokeViewerUrl(){if(viewerUrl){try{URL.revokeObjectURL(viewerUrl)}catch(e){}viewerUrl=''}}
function viewerMeta(row){
  const g=groupRows([row],visitRows())[0],bits=[formatDate(row.createdAt),g?groupLabel(g).replace(/^Hors visite · .*/,'Hors visite'):''];
  const f=familyKey(row);bits.push(f==='none'?'Sans famille':f.toUpperCase());
  if(row.category)bits.push(categoryLabel(row.category)||row.category);
  return bits.filter(Boolean).join(' · ');
}
function renderViewerTags(row){
  const host=viewer.querySelector('#srViewerTags');host.replaceChildren();
  const fields=[['family','Famille',FAMILY_OPTIONS,row.family||''],['moment','Moment',MOMENT_OPTIONS,row.moment||'']];
  for(const [key,label,options,current] of fields){
    const wrap=el('label',label),sel=el('select');sel.className='sr-photoTagSelect';sel.dataset.photoTag=key;sel.setAttribute('aria-label',label+' de la photo');
    for(const [value,text] of options){const opt=el('option',text);opt.value=value;sel.append(opt)}
    sel.value=current;sel.onchange=()=>saveViewerTags({[key]:sel.value});wrap.append(sel);host.append(wrap);
  }
  const wrap=el('label','Catégorie'),sel=categorySelect(row.family,row.category,'Catégorie de la photo (facultatif)');sel.dataset.photoTag='category';
  sel.onchange=()=>saveViewerTags({category:sel.value});wrap.append(sel);host.append(wrap);
}
async function saveViewerTags(patch){
  const r=viewerRows[viewerIndex];if(!r)return;
  try{if(!(await updateTags(r.id,patch)))throw new Error('Photo introuvable.');applyTags(r,patch);galleryDirty=true;showViewer();viewerStatus('Étiquette photo enregistrée.')}
  catch(e){viewerStatus(e.message||String(e),true)}
}
function showViewer(){
  const row=viewerRows[viewerIndex];if(!row){closeViewer();return}
  const img=viewer.querySelector('#srViewerImg');revokeViewerUrl();viewerUrl=URL.createObjectURL(row.blob);img.src=viewerUrl;img.alt='Photo du '+formatDate(row.createdAt);
  viewer.dataset.photoId=String(row.id);
  viewer.querySelector('#srViewerCount').textContent=(viewerIndex+1)+' / '+viewerRows.length;
  viewer.querySelector('#srViewerPrev').disabled=viewerIndex<=0;
  viewer.querySelector('#srViewerNext').disabled=viewerIndex>=viewerRows.length-1;
  viewer.querySelector('#srViewerMeta').textContent=viewerMeta(row);
  renderViewerTags(row);
  viewer.querySelector('#srViewerNote').value=row.note||'';
  viewer.querySelector('#srViewerPick').checked=selectedIds.has(String(row.id));
}
function openViewer(index){
  ensureViewer();viewerRows=viewRows.slice();viewerIndex=Math.max(0,Math.min(Number(index)||0,viewerRows.length-1));
  if(!viewerRows.length)return false;galleryDirty=false;viewerStatus('');showViewer();
  if(typeof viewer.showModal==='function'&&!viewer.open)viewer.showModal();else viewer.setAttribute('open','');
  return true;
}
function stepViewer(delta){const next=viewerIndex+delta;if(next<0||next>=viewerRows.length)return false;viewerIndex=next;viewerStatus('');showViewer();return true}
function closeViewer(){
  if(!viewer)return;const note=viewer.querySelector('#srViewerNote');if(root.document.activeElement===note)note.blur();
  revokeViewerUrl();viewer.querySelector('#srViewerImg').removeAttribute('src');
  if(typeof viewer.close==='function'&&viewer.open)viewer.close();else viewer.removeAttribute('open');
  /* Retour à la galerie telle qu'on l'a laissée : même filtre, mêmes paquets chargés. */
  if(galleryDirty&&dialog&&dialog.open){galleryDirty=false;renderBrowse(true)}
}
async function deleteCurrent(){
  const r=viewerRows[viewerIndex];if(!r)return false;
  if(root.confirm&&!root.confirm('Supprimer cette photo de ce magasin ?'))return false;
  try{await removeRecord(r.id)}catch(e){viewerStatus(e.message||String(e),true);return false}
  const id=String(r.id);selectedIds.delete(id);allRows=allRows.filter(x=>String(x.id)!==id);viewerRows.splice(viewerIndex,1);galleryDirty=true;
  setStatus('Photo supprimée.');
  if(!viewerRows.length){closeViewer();return true}
  if(viewerIndex>=viewerRows.length)viewerIndex=viewerRows.length-1;
  showViewer();viewerStatus('Photo supprimée.');return true;
}

/* --- Ouverture ------------------------------------------------------------------ */
/* `options.visitId` : ouverte depuis une visite, la galerie montre d'abord les photos
   de CETTE visite. `options.family` : famille affichée par la visite, appliquée à la
   prochaine photo. Sans option, comportement historique. */
async function open(storeId,options){
  if(!storeId)throw new Error('Magasin introuvable.');ensureDialog();const opts=options&&typeof options==='object'?options:{};
  activeStoreId=String(storeId);selectedIds.clear();compareOpen=false;showAllGroups=false;filters=freshFilters();
  const visitId=String(opts.visitId||'');if(visitId&&visitStoreId(visitId)===activeStoreId)filters.group='v:'+visitId;
  pendingFamily=['blanc','brun'].includes(opts.family)?opts.family:defaultFamily(activeStoreId);pendingMoment='';pendingCategory='';setStatus('');
  if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');
  dialog.scrollTop=0;
  try{await render();return true}catch(e){report(e);return false}
}
function closeDialog(){galleryDirty=false;closeViewer();clearUrls();allRows=[];viewRows=[];if(dialog&&typeof dialog.close==='function'&&dialog.open)dialog.close();else if(dialog)dialog.removeAttribute('open')}
function openFromQuick(){const start=root.document&&root.document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;if(!id){setStatus('Magasin introuvable.',true);return false}open(id);return true}
function installQuickButton(){
  if(!root.document)return false;const actions=root.document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;if(root.document.getElementById('storePhotosQuickBtn'))return true;
  const b=btn('📷 Photos',openFromQuick,'secondary');b.id='storePhotosQuickBtn';b.title='Prendre, comparer et partager les photos de ce magasin';b.style.minHeight='44px';const full=[...actions.querySelectorAll('button')].find(x=>String(x.getAttribute('onclick')||'').includes('fullStoreFromQuick'));if(full&&full.parentNode===actions)full.insertAdjacentElement('afterend',b);else actions.appendChild(b);return true
}
/* Fiche magasin complète : un accès direct à la galerie, visible seulement pour un
   magasin existant (le bouton de visite `#srStoreStart` porte déjà cet état). Le
   fermer ramène à la fiche, restée ouverte dessous. */
let storeStartObserver=null;
function syncStoreButton(){const start=root.document&&root.document.getElementById('srStoreStart'),b=root.document&&root.document.getElementById('srStorePhotosBtn');if(b)b.hidden=!start||start.hidden}
function openFromStoreDialog(){const id=root.currentEditId;if(!id)return false;open(String(id)).catch(()=>{});return true}
function installStoreDialogButton(){
  if(!root.document)return false;const start=root.document.getElementById('srStoreStart');if(!start||!start.parentNode)return false;
  let b=root.document.getElementById('srStorePhotosBtn');
  if(!b){b=btn('📷 Photos du magasin',openFromStoreDialog,'secondary');b.id='srStorePhotosBtn';b.title='Galerie photo de ce magasin, classée par visite et par famille';start.insertAdjacentElement('afterend',b)}
  if(!storeStartObserver&&typeof root.MutationObserver==='function'){storeStartObserver=new root.MutationObserver(syncStoreButton);storeStartObserver.observe(start,{attributes:true,attributeFilter:['hidden']})}
  syncStoreButton();return true;
}
function installButtons(){installQuickButton();installStoreDialogButton()}
function boot(){ensureDialog();installButtons();installBackupCard()}

/* ---------------------------------------------------------------------------
   V257 — archive photo : export / restauration hors de l'appareil.

   Les photos vivent dans IndexedDB, hors de `state` et donc hors de la sauvegarde
   JSON : perdre le téléphone, c'était perdre les photos. L'archive est un .zip
   « stocké » (sans compression : un JPEG ne se compresse plus) que n'importe quel
   ordinateur ouvre, avec :
   - `manifest.json` : pour chaque photo, TOUTES ses métadonnées (magasin, visite,
     famille, moment, catégorie, note, dates, dimensions) et le CRC32 du fichier ;
   - `photos/<id>.<ext>` : l'image telle qu'elle est stockée.
   Rien n'est recompressé ni renommé : une photo restaurée est la même photo.

   La restauration FUSIONNE : une photo dont l'identifiant existe déjà est laissée en
   place, jamais écrasée. Restaurer deux fois la même archive ne crée aucun doublon.
   Le fichier n'est jamais chargé en entier : chaque image est lue par tranche
   (`Blob.slice`), vérifiée (taille + CRC32), puis écrite.

   Les très gros volumes partent en plusieurs archives (PART_MAX_BYTES), chacune
   restaurable seule. « Nouvelles photos » n'exporte que ce qui a été pris ou modifié
   depuis le dernier export photo : chaque export retient l'identifiant et la date de
   modification des photos parties (aucune horloge en jeu, une photo à date future ou
   un téléphone mal réglé ne trompent pas le compte). Une photo restaurée depuis une
   archive est, par définition, déjà exportée.
   --------------------------------------------------------------------------- */
const ARCHIVE_FORMAT='StoreRunnerPhotos';
const PART_MAX_BYTES=150*1024*1024;
const PART_MAX_PHOTOS=2000;
const EXPORT_MARK_KEY='store-runner-photo-export-v1';
let crcTable=null;
function crc32(bytes,crc=0){
  if(!crcTable){crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}}
  crc=(crc^0xFFFFFFFF)>>>0;for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&0xFF]^(crc>>>8);return (crc^0xFFFFFFFF)>>>0;
}
function utf8(text){return new TextEncoder().encode(String(text))}
async function blobBytes(blob){if(blob&&typeof blob.arrayBuffer==='function')return new Uint8Array(await blob.arrayBuffer());if(blob instanceof Uint8Array)return blob;throw new Error('Contenu photo illisible.')}
function dosTime(date){const d=new Date(date);if(!Number.isFinite(d.getTime())||d.getFullYear()<1980)return{time:0,date:33};return{time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()}}
function header(size){const buf=new ArrayBuffer(size);return{buf,view:new DataView(buf),bytes:new Uint8Array(buf)}}
/* Zip « stocké » minimal. `entries` : [{name, data (Blob|Uint8Array), crc, size, when}]. */
function zipBlob(entries){
  const parts=[],central=[];let offset=0;
  for(const e of entries){
    const name=utf8(e.name),t=dosTime(e.when),h=header(30+name.length);
    h.view.setUint32(0,0x04034b50,true);h.view.setUint16(4,20,true);h.view.setUint16(6,0x0800,true);h.view.setUint16(8,0,true);
    h.view.setUint16(10,t.time,true);h.view.setUint16(12,t.date,true);h.view.setUint32(14,e.crc,true);h.view.setUint32(18,e.size,true);h.view.setUint32(22,e.size,true);
    h.view.setUint16(26,name.length,true);h.view.setUint16(28,0,true);h.bytes.set(name,30);
    parts.push(h.buf,e.data);
    const c=header(46+name.length);
    c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x0800,true);c.view.setUint16(10,0,true);
    c.view.setUint16(12,t.time,true);c.view.setUint16(14,t.date,true);c.view.setUint32(16,e.crc,true);c.view.setUint32(20,e.size,true);c.view.setUint32(24,e.size,true);
    c.view.setUint16(28,name.length,true);c.view.setUint32(42,offset,true);c.bytes.set(name,46);central.push(c.buf);
    offset+=30+name.length+e.size;
  }
  const centralSize=central.reduce((n,b)=>n+b.byteLength,0),end=header(22);
  end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,entries.length,true);end.view.setUint16(10,entries.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
  return new Blob(parts.concat(central,[end.buf]),{type:'application/zip'});
}
/* Lecture d'un zip sans le charger : fin de fichier, répertoire central, puis tranches. */
async function readZip(file){
  if(!file||typeof file.slice!=='function')throw new Error('Archive photo illisible.');
  const tailSize=Math.min(file.size,22+65535),tail=await blobBytes(file.slice(file.size-tailSize));
  let at=-1;for(let i=tail.length-22;i>=0;i--)if(tail[i]===0x50&&tail[i+1]===0x4b&&tail[i+2]===0x05&&tail[i+3]===0x06){at=i;break}
  if(at<0)throw new Error('Ce fichier n’est pas une archive photo Store Runner.');
  const endView=new DataView(tail.buffer,tail.byteOffset+at,22),count=endView.getUint16(10,true),cdSize=endView.getUint32(12,true),cdOffset=endView.getUint32(16,true);
  const cd=await blobBytes(file.slice(cdOffset,cdOffset+cdSize)),view=new DataView(cd.buffer,cd.byteOffset,cd.byteLength),decoder=new TextDecoder(),entries=new Map();
  let p=0;
  for(let i=0;i<count;i++){
    if(view.getUint32(p,true)!==0x02014b50)throw new Error('Archive photo abîmée (répertoire).');
    const method=view.getUint16(p+10,true),crc=view.getUint32(p+16,true),size=view.getUint32(p+20,true),usize=view.getUint32(p+24,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
    const name=decoder.decode(cd.subarray(p+46,p+46+nameLen));
    entries.set(name,{name,method,crc,size,usize,local});p+=46+nameLen+extraLen+commentLen;
  }
  async function body(entry){
    if(entry.method!==0||entry.size!==entry.usize)throw new Error('Archive recompressée par un autre outil : utilise le fichier d’origine exporté par Store Runner.');
    const lh=await blobBytes(file.slice(entry.local,entry.local+30)),lv=new DataView(lh.buffer,lh.byteOffset,30);
    if(lv.getUint32(0,true)!==0x04034b50)throw new Error('Archive photo abîmée (entrée).');
    const start=entry.local+30+lv.getUint16(26,true)+lv.getUint16(28,true);
    return file.slice(start,start+entry.size);
  }
  return{entries,body};
}
function extFor(type){return extensionFor(type)}
/* Métadonnées exportées : tout l'enregistrement sauf les octets (le blob part en
   fichier, la miniature se refabrique à l'affichage). */
function manifestRow(r,file,crc){
  const store=storeById(r.storeId);
  return{id:String(r.id),file,crc,storeId:String(r.storeId==null?'':r.storeId),storeLabel:store?[store.enseigne,store.ville].filter(Boolean).join(' · '):'',
    visitId:r.visitId==null||r.visitId===''?null:String(r.visitId),createdAt:String(r.createdAt||''),updatedAt:String(r.updatedAt||r.createdAt||''),
    note:String(r.note||''),family:String(r.family||''),moment:String(r.moment||''),category:String(r.category||''),
    type:String(r.type||(r.blob&&r.blob.type)||'image/jpeg'),width:Number(r.width)||0,height:Number(r.height)||0,size:Number(r.blob&&r.blob.size)||Number(r.size)||0,originalName:String(r.originalName||'')};
}
async function listAll(){
  const db=await openDb(),tx=db.transaction(STORE,'readonly'),rows=[];
  await new Promise((resolve,reject)=>{const req=tx.objectStore(STORE).openCursor();req.onsuccess=()=>{const cur=req.result;if(!cur){resolve();return}rows.push(cur.value);cur.continue()};req.onerror=()=>reject(req.error||new Error('Lecture des photos impossible.'))});
  rows.sort(compareRows);return rows;
}
/* Découpe en archives restaurables seules : taille et nombre bornés. */
function planParts(rows,maxBytes=PART_MAX_BYTES,maxPhotos=PART_MAX_PHOTOS){
  const parts=[];let cur=[],bytes=0;
  for(const r of rows){const n=Number(r.blob&&r.blob.size)||Number(r.size)||0;if(cur.length&&(bytes+n>maxBytes||cur.length>=maxPhotos)){parts.push(cur);cur=[];bytes=0}cur.push(r);bytes+=n}
  if(cur.length)parts.push(cur);return parts;
}
async function buildArchive(rows,meta){
  const entries=[],manifest={format:ARCHIVE_FORMAT,version:1,createdAt:new Date().toISOString(),part:meta&&meta.part||1,parts:meta&&meta.parts||1,count:rows.length,photos:[]};
  for(const r of rows){
    if(!r||!r.blob)continue;
    const file='photos/'+safePart(r.id)+'.'+extFor(r.type||r.blob.type),bytes=await blobBytes(r.blob),crc=crc32(bytes);
    entries.push({name:file,data:r.blob,crc,size:bytes.length,when:r.createdAt});
    manifest.photos.push(manifestRow(r,file,crc));
  }
  manifest.count=manifest.photos.length;
  const text=utf8(JSON.stringify(manifest));
  entries.unshift({name:'manifest.json',data:text,crc:crc32(text),size:text.length,when:manifest.createdAt});
  return{blob:zipBlob(entries),manifest};
}
function exportMark(){try{const s=root.__chefStorage||root.localStorage,m=JSON.parse(s&&s.getItem(EXPORT_MARK_KEY)||'null');return m&&typeof m==='object'?Object.assign({seen:{}},m,{seen:m.seen&&typeof m.seen==='object'?m.seen:{}}):null}catch(e){return null}}
function versionOf(r){return String(r&&(r.updatedAt||r.createdAt)||'')}
/* Ajoute des photos à l'index des photos déjà sorties de l'appareil. */
function markExported(rows){const mark=exportMark()||{seen:{}};for(const r of rows)mark.seen[String(r.id)]=versionOf(r);mark.at=new Date().toISOString();mark.count=Object.keys(mark.seen).length;try{const s=root.__chefStorage||root.localStorage;if(s)s.setItem(EXPORT_MARK_KEY,JSON.stringify(mark))}catch(e){}}
function isPending(r,mark){return !mark||mark.seen[String(r.id)]!==versionOf(r)}
/* `onlyNew` : seules les photos jamais exportées, ou modifiées depuis, partent. */
async function exportArchives(options){
  const opts=options||{},mark=opts.onlyNew?exportMark():null;
  const rows=(await listAll()).filter(r=>!opts.onlyNew||isPending(r,mark));
  const parts=planParts(rows,opts.maxBytes,opts.maxPhotos),out=[],stamp=new Date().toISOString().replace(/[:.]/g,'-');
  for(let i=0;i<parts.length;i++){
    const built=await buildArchive(parts[i],{part:i+1,parts:parts.length});
    const name='Store-Runner-photos-'+stamp+(parts.length>1?'-partie-'+(i+1)+'-sur-'+parts.length:'')+'.zip';
    out.push({name,blob:built.blob,count:built.manifest.count});
    if(typeof opts.onPart==='function')await opts.onPart(out[out.length-1],i,parts.length);
  }
  if(opts.mark!==false&&rows.length)markExported(rows);
  return{parts:out,count:rows.length};
}
function checkManifestRow(p){
  if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id||p.id.length>200||typeof p.file!=='string'||!/^photos\//.test(p.file))throw new Error('Manifeste photo invalide.');
  if(typeof p.storeId!=='string'||!p.storeId)throw new Error('Photo sans magasin dans le manifeste.');
  if(!Number.isFinite(Date.parse(p.createdAt)))throw new Error('Date de photo invalide dans le manifeste.');
  if(!String(p.type||'').startsWith('image/'))throw new Error('Type de fichier inattendu dans l’archive.');
}
/* Fusion : n'écrit que les photos absentes. Rend {added, skipped, total}. */
async function importArchive(file,options){
  const opts=options||{},zip=await readZip(file),entry=zip.entries.get('manifest.json');
  if(!entry)throw new Error('Ce fichier n’est pas une archive photo Store Runner.');
  const mf=await blobBytes(await zip.body(entry));if(crc32(mf)!==entry.crc)throw new Error('Archive photo abîmée (manifeste).');
  let manifest;try{manifest=JSON.parse(new TextDecoder().decode(mf))}catch(e){throw new Error('Manifeste photo illisible.')}
  if(!manifest||manifest.format!==ARCHIVE_FORMAT||manifest.version!==1||!Array.isArray(manifest.photos))throw new Error('Ce fichier n’est pas une archive photo Store Runner.');
  for(const p of manifest.photos){checkManifestRow(p);const e=zip.entries.get(p.file);if(!e||e.crc!==p.crc)throw new Error('Archive photo incomplète : '+p.file+' manque ou ne correspond pas.')}
  const db=await openDb();let added=0,skipped=0,done=0;
  for(const p of manifest.photos){
    const exists=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(p.id);req.onsuccess=()=>resolve(!!req.result);req.onerror=()=>reject(req.error)});
    if(exists){skipped++}
    else{
      const e=zip.entries.get(p.file),slice=await zip.body(e),bytes=await blobBytes(slice);
      if(bytes.length!==e.size||crc32(bytes)!==p.crc)throw new Error('Photo abîmée dans l’archive : '+p.file+'. Rien d’autre n’a été modifié pour cette photo.');
      const blob=new Blob([bytes],{type:p.type});
      const record={id:p.id,storeId:p.storeId,visitId:p.visitId||null,createdAt:p.createdAt,updatedAt:p.updatedAt||p.createdAt,note:String(p.note||''),family:'',moment:'',category:'',blob,thumb:null,type:p.type,width:Number(p.width)||0,height:Number(p.height)||0,size:bytes.length,originalName:String(p.originalName||'')};
      applyTags(record,{family:p.family,moment:p.moment,category:p.category});
      try{await putRecord(record)}catch(err){throw friendlyStorageError(err)}
      added++;
    }
    done++;if(typeof opts.onProgress==='function')opts.onProgress(done,manifest.photos.length);
  }
  if(opts.mark!==false)markExported(manifest.photos);
  return{added,skipped,total:manifest.photos.length,part:manifest.part||1,parts:manifest.parts||1};
}
/* Comptes pour l'écran Données : sans lire un seul octet d'image. */
async function stats(){
  const rows=await listAll(),known=new Set((root.state&&root.state.stores||[]).map(s=>String(s.id)));let bytes=0,orphans=0,linked=0;
  for(const r of rows){bytes+=Number(r.blob&&r.blob.size)||Number(r.size)||0;if(!known.has(String(r.storeId)))orphans++;if(r.visitId)linked++}
  const mark=exportMark(),pending=rows.filter(r=>isPending(r,mark)).length;
  return{count:rows.length,bytes,orphans,linked,lastExport:mark&&mark.at||null,pending};
}
function friendlyStorageError(err){
  const name=err&&err.name||'',msg=err&&err.message||String(err);
  if(/quota/i.test(name+' '+msg))return new Error('Stockage du téléphone plein : photo non enregistrée. Exporte tes photos (Plus → Données) puis libère de l’espace.');
  return err instanceof Error?err:new Error(msg);
}

/* --- Écran Données : section Photos ----------------------------------------------- */
function saveBlob(name,blob){const url=URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=name;root.document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},4000)}
function mbText(n){return (Math.round(n/1024/1024*10)/10).toLocaleString('fr-FR')+' Mo'}
async function refreshBackupCard(){
  const info=root.document&&root.document.getElementById('photoBackupInfo');if(!info)return;
  try{const s=await stats();info.textContent=s.count?plural(s.count,'photo')+' sur ce téléphone · '+mbText(s.bytes)+(s.lastExport?' · dernier export photo le '+new Date(s.lastExport).toLocaleDateString('fr-FR')+(s.pending?' · '+s.pending+(s.pending>1?' nouvelles photos':' nouvelle photo')+' à exporter':' · tout est exporté'):' · aucune photo exportée pour l’instant')+(s.orphans?' · '+plural(s.orphans,'photo')+' d’un magasin retiré du secteur (conservées)':''):'Aucune photo sur ce téléphone.'}
  catch(e){info.textContent=e.message||String(e)}
}
function backupStatus(text,error){const n=root.document.getElementById('photoBackupFeedback');if(n){n.textContent=text||'';n.classList.toggle('sr-photoError',!!error)}}
async function runExport(onlyNew){
  try{
    backupStatus('Préparation de l’archive photo…');
    const res=await exportArchives({onlyNew,onPart:async(part,i,n)=>{backupStatus('Archive '+(i+1)+' / '+n+' : '+plural(part.count,'photo')+'…');saveBlob(part.name,part.blob)}});
    backupStatus(res.count?plural(res.count,'photo')+' exportée'+(res.count>1?'s':'')+' en '+plural(res.parts.length,'archive')+'. Vérifie que '+(res.parts.length>1?'les fichiers sont bien enregistrés':'le fichier est bien enregistré')+' dans Fichiers.':'Aucune nouvelle photo à exporter.');
  }catch(e){backupStatus(e.message||String(e),true)}
  refreshBackupCard();
}
async function runImport(file){
  if(!file)return;
  try{backupStatus('Lecture de l’archive photo…');const r=await importArchive(file,{onProgress:(d,t)=>backupStatus('Restauration des photos : '+d+' / '+t+'…')});
    backupStatus('Archive '+r.part+(r.parts>1?' / '+r.parts:'')+' restaurée : '+plural(r.added,'photo')+' ajoutée'+(r.added>1?'s':'')+(r.skipped?', '+r.skipped+' déjà présente'+(r.skipped>1?'s':'')+' (non modifiée'+(r.skipped>1?'s':'')+')':'')+'.')}
  catch(e){backupStatus('Restauration photo refusée : '+(e.message||String(e)),true)}
  finally{const input=root.document.getElementById('photoBackupFile');if(input)input.value=''}
  refreshBackupCard();
}
function installBackupCard(){
  if(!root.document)return false;const host=root.document.getElementById('importPanel');if(!host)return false;
  if(root.document.getElementById('photoBackupTools'))return true;
  ensureStyle();
  const box=el('section',undefined,'card');box.id='photoBackupTools';
  box.append(el('h2','Photos'),el('p','Les photos ne sont pas dans la sauvegarde JSON : exporte-les ici, dans une archive .zip avec leur magasin, leur visite, leur famille et leur date. La restauration ajoute les photos absentes sans jamais remplacer celles déjà présentes.'));
  const info=el('p','',undefined);info.id='photoBackupInfo';
  const actions=el('div',undefined,'sr-photoReportActions');
  const all=btn('Exporter toutes les photos',()=>runExport(false),'primary');all.id='photoExportAll';
  const fresh=btn('Exporter les nouvelles',()=>runExport(true),'secondary');fresh.id='photoExportNew';
  actions.append(all,fresh);
  const label=el('label','Restaurer une archive photo (.zip)'),input=el('input');input.type='file';input.id='photoBackupFile';input.accept='.zip,application/zip';input.onchange=e=>runImport(e.target.files[0]);label.append(input);
  const feedback=el('p','','sr-photoStatus');feedback.id='photoBackupFeedback';feedback.setAttribute('role','status');
  box.append(info,actions,label,feedback);
  const after=root.document.getElementById('backupTools');if(after&&after.parentNode===host)after.insertAdjacentElement('afterend',box);else host.insertBefore(box,host.firstChild);
  /* Comptes relus à chaque ouverture de l'écran Données : un observateur borné à la
     classe de ce seul panneau, aucune boucle. */
  /* Rien n'est lu au démarrage : parcourir toutes les photos ne sert qu'à cet écran. */
  if(typeof root.MutationObserver==='function'){let wasActive=host.classList.contains('active');new root.MutationObserver(()=>{const active=host.classList.contains('active');if(active&&!wasActive)refreshBackupCard();wasActive=active}).observe(host,{attributes:true,attributeFilter:['class']})}
  if(host.classList.contains('active'))refreshBackupCard();return true;
}

const api={DB_NAME,STORE,MAX_EDGE,THUMB_EDGE,PAGE_SIZE,CATEGORY_CATALOG,ARCHIVE_FORMAT,PART_MAX_BYTES,PART_MAX_PHOTOS,crc32,zipBlob,readZip,planParts,manifestRow,checkManifestRow,listAll,exportArchives,importArchive,stats,installBackupCard,safePart,scaleSize,defaultSelection,shareFileName,openDb,list,listByFamily,listStrictByFamily,listByVisitId,addPhoto,removeRecord,updateNote,updateTags,open,render,shareRecords,installQuickButton,installStoreDialogButton,moveRecords,visitStoreId,keepsVisitLink,movableStores,openMoveDialog,closeMoveDialog,confirmMove,renderMoveList,syncMoveButton,categoriesFor,categoryLabel,normalizeCategory,registerCategory,groupKeyOf,groupRows,groupLabel,filterRows,familyCounts,localDay,frenchDay,ensureThumb,openViewer,closeViewer,stepViewer};
root.StorePhotosV1=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();root.document.addEventListener('store-runner:data-restored',()=>{installButtons();const panel=root.document.getElementById('importPanel');if(panel&&panel.classList.contains('active'))refreshBackupCard()});root.document.addEventListener('store-runner:planning-updated',installButtons)}
})(typeof window!=='undefined'?window:globalThis);
