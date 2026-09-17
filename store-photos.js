/* Store Runner V1 — mémoire photo par magasin, locale et hors ligne. */
(function(root){
'use strict';
const DB_NAME='store-runner-store-photos-v1';
const DB_VERSION=1;
const STORE='photos';
const MAX_EDGE=1600;
const JPEG_QUALITY=.82;
let dbPromise=null,dialog=null,activeStoreId='',compareOpen=false,moveDialog=null;
let selectedIds=new Set(),objectUrls=[];
/* Étiquettes appliquées à la PROCHAINE photo prise : le prompt de reporting exige des
   avant / après systématiques, et les régler après coup sur chaque carte est intenable
   sur le terrain. La famille suit par défaut celle de la visite en cours. */
let pendingFamily='',pendingMoment='';
const FAMILY_OPTIONS=[['','Non étiquetée'],['blanc','Blanc'],['brun','Brun']];
const MOMENT_OPTIONS=[['','Sans moment'],['avant','Avant'],['apres','Après']];

function safePart(value){return String(value==null?'':value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'photo'}
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
function currentVisitId(storeId){const rows=root.state&&root.state.businessV2&&Array.isArray(root.state.businessV2.visits)?root.state.businessV2.visits:[];const draft=rows.filter(v=>String(v.storeId)===String(storeId)&&v.status==='draft').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];return draft?String(draft.id):''}
function currentVisit(storeId){const rows=root.state&&root.state.businessV2&&Array.isArray(root.state.businessV2.visits)?root.state.businessV2.visits:[];const id=currentVisitId(storeId);return id?rows.find(v=>String(v.id)===id)||null:null}
function defaultFamily(storeId){const v=currentVisit(storeId),f=v&&v.activeFamily;return f==='blanc'||f==='brun'?f:''}
function formatDate(value){try{return new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}catch(e){return String(value||'')}}

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
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Impossible d’ouvrir le stockage photo.'));
  });
  return dbPromise;
}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Écriture photo interrompue.'))})}
async function putRecord(record){const db=await openDb(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);await txDone(tx);return record}
async function removeRecord(id){const db=await openDb(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(String(id));await txDone(tx);return true}
async function updateNote(id,note){const db=await openDb(),tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE),req=os.get(String(id));const row=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});if(!row){tx.abort();return false}row.note=String(note||'').trim();row.updatedAt=new Date().toISOString();os.put(row);await txDone(tx);return true}
async function updateTags(id,patch){const db=await openDb(),tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE),req=os.get(String(id));const row=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});if(!row){tx.abort();return false}
  if(patch&&patch.family!==undefined)row.family=['blanc','brun'].includes(patch.family)?patch.family:'';
  if(patch&&patch.moment!==undefined)row.moment=['avant','apres'].includes(patch.moment)?patch.moment:'';
  row.updatedAt=new Date().toISOString();os.put(row);await txDone(tx);return true}
/* ---------------------------------------------------------------------------
   Déplacer des photos vers un autre magasin.

   Une photo prise dans le mauvais magasin n'a aucune raison d'être reprise :
   seul son `storeId` est faux. On le corrige sur place, sans toucher au blob ni
   aux étiquettes, et sans jamais créer ni supprimer d'enregistrement.
   --------------------------------------------------------------------------- */
function visitStoreId(visitId){
  const rows=root.state&&root.state.businessV2&&Array.isArray(root.state.businessV2.visits)?root.state.businessV2.visits:[];
  const v=rows.find(x=>String(x.id)===String(visitId));
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
async function compressImage(file){
  if(!file||!String(file.type||'').startsWith('image/'))throw new Error('Choisis une image ou prends une photo.');
  let decoded;
  try{
    decoded=await loadImage(file);const size=scaleSize(decoded.width,decoded.height),canvas=root.document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Compression indisponible.');ctx.drawImage(decoded.image,0,0,size.width,size.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',JPEG_QUALITY));if(!blob)throw new Error('Compression indisponible.');return{blob,type:blob.type||'image/jpeg',width:size.width,height:size.height,size:blob.size};
  }catch(error){
    if(file.size>12*1024*1024)throw new Error('Photo trop volumineuse pour être stockée sans compression.');
    return{blob:file,type:file.type||'image/jpeg',width:0,height:0,size:file.size||0};
  }finally{if(decoded&&decoded.close)decoded.close()}
}
async function addPhoto(storeId,file,visitId){
  const packed=await compressImage(file),linked=visitId===undefined?currentVisitId(storeId):String(visitId||''),now=new Date().toISOString();
  const family=['blanc','brun'].includes(pendingFamily)?pendingFamily:defaultFamily(storeId);
  const moment=['avant','apres'].includes(pendingMoment)?pendingMoment:'';
  return putRecord({id:uid(),storeId:String(storeId),visitId:linked||null,createdAt:now,updatedAt:now,note:'',family,moment,blob:packed.blob,type:packed.type,width:packed.width,height:packed.height,size:packed.size,originalName:String(file&&file.name||'')});
}
/* Une photo non étiquetée est volontairement rendue pour les deux familles : mieux vaut une
   photo en trop dans un compte rendu qu'une photo manquante. */
async function listByFamily(storeId,family){const rows=await list(storeId);return rows.filter(r=>{const f=String(r&&r.family||'');return !f||f===String(family||'')})}
function clearUrls(){for(const url of objectUrls)try{URL.revokeObjectURL(url)}catch(e){}objectUrls=[]}
function blobUrl(blob){const url=URL.createObjectURL(blob);objectUrls.push(url);return url}
function el(tag,text,cls){const node=root.document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node}
function btn(text,fn,cls='secondary'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b}
function setStatus(text,error=false){if(!dialog)return;const box=dialog.querySelector('#srPhotoStatus');box.textContent=text||'';box.classList.toggle('sr-photoError',!!error)}
function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-store-photo-style'))return;
  const s=el('style');s.id='sr-store-photo-style';s.textContent='#storePhotosDialog{box-sizing:border-box;width:min(720px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;padding:16px;border-radius:24px}.sr-photoHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-16px;background:#fff;padding:5px 0 10px;z-index:3}.sr-photoHead h2{margin:0;font-size:20px}.sr-photoHead p{margin:4px 0 0;color:#667085;font-size:12px}.sr-photoClose{min-width:44px;min-height:44px;border:1px solid #dde3ec;background:#fff;border-radius:14px;font-size:20px}.sr-photoActions,.sr-photoReportActions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.sr-photoActions button,.sr-photoReportActions button{min-height:46px}.sr-photoHint{font-size:11px;color:#667085;line-height:1.4;margin:8px 0}.sr-photoTags{margin:10px 0 4px}.sr-photoTagRow{display:flex;align-items:center;gap:6px;margin:6px 0}.sr-photoTagRow b{flex:0 0 62px;font-size:11px;color:#454b56}.sr-photoTagBtn{flex:1 1 0;min-width:0;min-height:44px;border:1px solid #d3d9e3;border-radius:12px;background:#f4f6fa;color:#454b56;font-weight:800;font-size:11.5px;padding:6px 4px}.sr-photoTagBtn[aria-pressed=true]{background:#1428a0;border-color:#1428a0;color:#fff}.sr-photoCardTags{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}.sr-photoTagSelect{min-height:38px;width:100%;box-sizing:border-box;border:1px solid #d9dee8;border-radius:10px;font-size:11px;background:#fff;padding:0 6px}.sr-photoStatus{min-height:18px;font-size:12px;color:#315b9d;margin:8px 0}.sr-photoStatus.sr-photoError{color:#b42318}.sr-photoCompare{border:1px solid #dfe5ef;border-radius:16px;background:#f8fafc;padding:10px;margin:10px 0}.sr-photoCompareGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sr-photoCompareCard{min-width:0}.sr-photoCompareCard img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:#eef1f5}.sr-photoCompareCard b,.sr-photoCompareCard span{display:block;font-size:11px;margin-top:4px}.sr-photoCompareCard span{color:#667085;line-height:1.35}.sr-photoGallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}.sr-photoCard{border:1px solid #e0e5ed;border-radius:16px;padding:9px;background:#fff;min-width:0}.sr-photoCard img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:#eef1f5}.sr-photoMeta{font-size:10.5px;color:#667085;margin:7px 0}.sr-photoSelect{display:flex;gap:7px;align-items:center;font-size:11px;font-weight:700;min-height:34px}.sr-photoSelect input{width:18px;height:18px}.sr-photoNote{width:100%;min-height:44px;border:1px solid #d9dee8;border-radius:11px;padding:8px;font-size:11px;box-sizing:border-box}.sr-photoCardActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.sr-photoCardActions button{min-height:44px;font-size:11px}.sr-photoEmpty{grid-column:1/-1;padding:22px 10px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d8dee8;border-radius:16px}.sr-photoMoveBar{margin:0 0 10px}.sr-photoMoveBar button{width:100%;min-height:46px}#srPhotoMoveDialog{box-sizing:border-box;width:min(520px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 40px);overflow:auto;padding:16px;border-radius:24px}#srPhotoMoveDialog::backdrop{background:rgba(15,23,42,.38)}.sr-photoMoveHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sr-photoMoveHead h2{margin:0;font-size:18px}.sr-photoMoveHead p{margin:4px 0 0;color:#667085;font-size:12px}.sr-photoMoveSearch{width:100%;box-sizing:border-box;min-height:44px;margin:12px 0 8px;border:1px solid #d9dee8;border-radius:12px;padding:0 11px;font-size:13px}.sr-photoMoveList{display:grid;gap:6px;max-height:46dvh;overflow:auto;margin-bottom:10px}.sr-photoMoveItem{display:block;width:100%;text-align:left;min-height:48px;border:1px solid #e2e6ec;border-radius:14px;background:#fff;padding:9px 11px;font-size:13px}.sr-photoMoveItem[aria-pressed=true]{border-color:#1428a0;background:#eef2ff}.sr-photoMoveItem b{display:block;font-weight:750}.sr-photoMoveItem small{display:block;color:#737b86;margin-top:2px;font-size:11px}.sr-photoMoveEmpty{padding:16px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d8dee8;border-radius:14px}.sr-photoMoveFoot{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sr-photoMoveFoot button{min-height:46px}#storeQuickSheet .sheetActions>#storePhotosQuickBtn{min-height:45px}@media(max-width:620px){#storeQuickSheet .sheetActions>button[onclick*="appointmentFromQuick"]{grid-column:1/-1}#storeQuickSheet .sheetActions>button[onclick*="fullStoreFromQuick"]{grid-column:1!important}#storeQuickSheet .sheetActions>#storePhotosQuickBtn{grid-column:2!important}}@media(max-width:520px){.sr-photoGallery{grid-template-columns:1fr 1fr}.sr-photoActions,.sr-photoReportActions{grid-template-columns:1fr}.sr-photoCard{padding:7px}}';root.document.head.appendChild(s)
}
function tagRow(host,label,options,value,pick){
  const row=el('div',undefined,'sr-photoTagRow');row.append(el('b',label));
  for(const [key,text] of options){const b=btn(text,()=>{pick(key);renderPendingTags()},'sr-photoTagBtn');b.setAttribute('aria-pressed',String(value)===key?'true':'false');b.dataset.tag=key;row.append(b)}
  host.append(row);
}
function renderPendingTags(){
  if(!dialog)return;const host=dialog.querySelector('#srPhotoTags');if(!host)return;host.replaceChildren();
  host.append(el('p','S’appliquent à la prochaine photo prise.','sr-photoHint'));
  tagRow(host,'Famille',FAMILY_OPTIONS,pendingFamily,v=>{pendingFamily=v});
  tagRow(host,'Moment',MOMENT_OPTIONS,pendingMoment,v=>{pendingMoment=v});
}
function ensureDialog(){
  if(dialog)return dialog;if(!root.document)return null;ensureStyle();
  dialog=el('dialog');dialog.id='storePhotosDialog';dialog.innerHTML='<div class="sr-photoHead"><div><h2 id="srPhotoTitle">Photos magasin</h2><p id="srPhotoSubtitle"></p></div><button type="button" class="sr-photoClose" id="srPhotoClose" aria-label="Fermer">×</button></div><section id="srPhotoTags" class="sr-photoTags" aria-label="Étiquettes de la prochaine photo"></section><div class="sr-photoActions"><button type="button" class="primary" id="srTakePhoto">📷 Prendre une photo</button><button type="button" class="secondary" id="srChoosePhoto">🖼 Choisir dans Photos</button></div><input id="srPhotoCameraInput" type="file" accept="image/*" capture="environment" hidden><input id="srPhotoLibraryInput" type="file" accept="image/*" multiple hidden><p class="sr-photoHint">Les photos restent sur cet appareil, même hors ligne. Elles ne sont jamais envoyées automatiquement.</p><div class="sr-photoReportActions"><button type="button" class="primary" id="srSharePhotos">Partager la sélection pour le rapport</button><button type="button" class="secondary" id="srComparePhotos">Comparer les 2 dernières</button></div><div class="sr-photoMoveBar" id="srPhotoMoveBar" hidden><button type="button" class="secondary" id="srMovePhotos">Déplacer la sélection</button></div><p id="srPhotoStatus" class="sr-photoStatus" role="status"></p><section id="srPhotoComparePanel" class="sr-photoCompare" hidden></section><div id="srPhotoGallery" class="sr-photoGallery"></div>';
  root.document.body.appendChild(dialog);
  const camera=dialog.querySelector('#srPhotoCameraInput'),library=dialog.querySelector('#srPhotoLibraryInput');
  dialog.querySelector('#srPhotoClose').onclick=closeDialog;
  dialog.querySelector('#srTakePhoto').onclick=()=>camera.click();
  dialog.querySelector('#srChoosePhoto').onclick=()=>library.click();
  camera.addEventListener('change',()=>consumeInput(camera));library.addEventListener('change',()=>consumeInput(library));
  dialog.querySelector('#srSharePhotos').onclick=shareSelected;
  dialog.querySelector('#srMovePhotos').onclick=openMoveDialog;
  dialog.querySelector('#srComparePhotos').onclick=()=>{compareOpen=!compareOpen;render().catch(e=>setStatus(e.message||String(e),true))};
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog()});
  return dialog;
}
async function consumeInput(input){
  const files=Array.from(input.files||[]);input.value='';if(!files.length)return;
  setStatus('Enregistrement de '+files.length+' photo'+(files.length>1?'s':'')+'…');
  try{for(const file of files){const row=await addPhoto(activeStoreId,file);selectedIds.add(String(row.id))}await render();setStatus(files.length+' photo'+(files.length>1?'s enregistrées':' enregistrée')+'.')}
  catch(e){setStatus(e.message||String(e),true)}
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
  try{const rows=(await list(activeStoreId)).filter(r=>selectedIds.has(String(r.id)));if(!rows.length){setStatus('Sélectionne au moins une photo pour le rapport.',true);return false}setStatus('Préparation du partage…');const result=await shareRecords(rows);if(result==='shared')setStatus(rows.length+' photo'+(rows.length>1?'s partagées':' partagée')+' pour le rapport.');else if(result==='downloaded')setStatus('Photo téléchargée.');else setStatus('Partage de plusieurs fichiers indisponible ici. Utilise Télécharger sous chaque photo.',true);return true}catch(e){if(e&&e.name==='AbortError'){setStatus('Partage annulé.');return false}setStatus('Partage impossible : '+(e.message||String(e)),true);return false}
}
function renderComparison(rows){
  const panel=dialog.querySelector('#srPhotoComparePanel');panel.replaceChildren();panel.hidden=!compareOpen||rows.length<2;if(panel.hidden)return;
  const grid=el('div',undefined,'sr-photoCompareGrid'),pair=[{label:'Avant',row:rows[1]},{label:'Maintenant',row:rows[0]}];
  for(const item of pair){const card=el('div',undefined,'sr-photoCompareCard'),img=el('img');img.src=blobUrl(item.row.blob);img.alt=item.label+' · '+formatDate(item.row.createdAt);card.append(img,el('b',item.label+' · '+formatDate(item.row.createdAt)),el('span',item.row.note||'Aucune note'));grid.append(card)}panel.append(el('b','Comparaison des 2 dernières photos'),grid)
}
function syncMoveButton(){
  if(!dialog)return;
  const bar=dialog.querySelector('#srPhotoMoveBar');if(!bar)return;
  const n=selectedIds.size;
  /* Rien de coché : le bouton n'a rien à déplacer, il disparaît. */
  bar.hidden=n===0;
  const b=bar.querySelector('#srMovePhotos');
  if(b)b.textContent=n>1?'Déplacer les '+n+' photos sélectionnées':'Déplacer la photo sélectionnée';
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
async function render(){
  ensureDialog();const rows=await list(activeStoreId),store=storeById(activeStoreId);clearUrls();
  dialog.querySelector('#srPhotoTitle').textContent='Photos · '+storeName(activeStoreId);dialog.querySelector('#srPhotoSubtitle').textContent=rows.length+' photo'+(rows.length>1?'s':'')+' enregistrée'+(rows.length>1?'s':'');
  const ids=new Set(rows.map(r=>String(r.id)));selectedIds=new Set([...selectedIds].filter(id=>ids.has(id)));if(!selectedIds.size&&rows.length)selectedIds=defaultSelection(rows,currentVisitId(activeStoreId));
  renderPendingTags();
  const compareButton=dialog.querySelector('#srComparePhotos');compareButton.disabled=rows.length<2;compareButton.textContent=compareOpen?'Masquer la comparaison':'Comparer les 2 dernières';if(rows.length<2)compareOpen=false;
  renderComparison(rows);syncMoveButton();
  const gallery=dialog.querySelector('#srPhotoGallery');gallery.replaceChildren();if(!rows.length){gallery.append(el('div','Aucune photo pour ce magasin. Prends-en une pendant la visite pour construire l’historique visuel.','sr-photoEmpty'));syncMoveButton();return rows}
  for(const row of rows){
    const card=el('article',undefined,'sr-photoCard');card.dataset.photoId=String(row.id);const img=el('img');img.src=blobUrl(row.blob);img.alt='Photo magasin du '+formatDate(row.createdAt);img.loading='lazy';
    const meta=el('div',formatDate(row.createdAt)+(row.visitId?' · liée à la visite':''),'sr-photoMeta');
    const select=el('label',undefined,'sr-photoSelect'),check=el('input');check.type='checkbox';check.checked=selectedIds.has(String(row.id));check.dataset.photoSelect=String(row.id);check.onchange=()=>{if(check.checked)selectedIds.add(String(row.id));else selectedIds.delete(String(row.id));syncMoveButton()};select.append(check,root.document.createTextNode('Inclure au rapport'));
    const note=el('input');note.type='text';note.className='sr-photoNote';note.placeholder='Note / changement observé';note.value=row.note||'';note.addEventListener('change',async()=>{try{await updateNote(row.id,note.value);setStatus('Note photo enregistrée.');if(compareOpen)await render()}catch(e){setStatus(e.message||String(e),true)}});
    const cardTags=el('div',undefined,'sr-photoCardTags');
    for(const [key,options,current] of [['family',FAMILY_OPTIONS,row.family||''],['moment',MOMENT_OPTIONS,row.moment||'']]){
      const sel=el('select');sel.className='sr-photoTagSelect';sel.dataset.photoTag=key;sel.setAttribute('aria-label',(key==='family'?'Famille':'Moment')+' de la photo');
      for(const [value,text] of options){const opt=el('option',text);opt.value=value;sel.append(opt)}
      sel.value=current;sel.onchange=async()=>{try{await updateTags(row.id,{[key]:sel.value});setStatus('Étiquette photo enregistrée.');await render()}catch(e){setStatus(e.message||String(e),true)}};
      cardTags.append(sel);
    }
    const actions=el('div',undefined,'sr-photoCardActions');actions.append(btn('Télécharger',()=>downloadRecord(row)),btn('Supprimer',async()=>{if(root.confirm&&!root.confirm('Supprimer cette photo de ce magasin ?'))return;try{await removeRecord(row.id);selectedIds.delete(String(row.id));await render();setStatus('Photo supprimée.')}catch(e){setStatus(e.message||String(e),true)}},'danger'));
    card.append(img,meta,select,cardTags,note,actions);gallery.append(card)
  }
  return rows;
}
async function open(storeId){
  if(!storeId)throw new Error('Magasin introuvable.');ensureDialog();activeStoreId=String(storeId);selectedIds.clear();compareOpen=false;pendingFamily=defaultFamily(activeStoreId);pendingMoment='';setStatus('');if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');try{await render();return true}catch(e){setStatus(e.message||String(e),true);return false}
}
function closeDialog(){clearUrls();if(dialog&&typeof dialog.close==='function'&&dialog.open)dialog.close();else if(dialog)dialog.removeAttribute('open')}
function openFromQuick(){const start=root.document&&root.document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;if(!id){setStatus('Magasin introuvable.',true);return false}open(id);return true}
function installQuickButton(){
  if(!root.document)return false;const actions=root.document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;if(root.document.getElementById('storePhotosQuickBtn'))return true;
  const b=btn('📷 Photos',openFromQuick,'secondary');b.id='storePhotosQuickBtn';b.title='Prendre, comparer et partager les photos de ce magasin';b.style.minHeight='44px';const full=[...actions.querySelectorAll('button')].find(x=>String(x.getAttribute('onclick')||'').includes('fullStoreFromQuick'));if(full&&full.parentNode===actions)full.insertAdjacentElement('afterend',b);else actions.appendChild(b);return true
}
function boot(){ensureDialog();installQuickButton()}

const api={DB_NAME,STORE,MAX_EDGE,safePart,scaleSize,defaultSelection,shareFileName,openDb,list,listByFamily,addPhoto,removeRecord,updateNote,updateTags,open,render,shareRecords,installQuickButton,moveRecords,visitStoreId,keepsVisitLink,movableStores,openMoveDialog,closeMoveDialog,confirmMove,renderMoveList,syncMoveButton};
root.StorePhotosV1=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();root.document.addEventListener('store-runner:data-restored',installQuickButton);root.document.addEventListener('store-runner:planning-updated',installQuickButton)}
})(typeof window!=='undefined'?window:globalThis);