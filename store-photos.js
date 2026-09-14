/* Store Runner V1 — mémoire photo par magasin, locale et hors ligne. */
(function(root){
'use strict';
const DB_NAME='store-runner-store-photos-v1';
const DB_VERSION=1;
const STORE='photos';
const MAX_EDGE=1600;
const JPEG_QUALITY=.82;
let dbPromise=null,dialog=null,activeStoreId='',compareOpen=false;
let selectedIds=new Set(),objectUrls=[];

function safePart(value){return String(value==null?'':value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'photo'}
function scaleSize(width,height,maxEdge=MAX_EDGE){width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);const max=Math.max(width,height);if(max<=maxEdge)return{width:Math.round(width),height:Math.round(height)};const ratio=maxEdge/max;return{width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))}}
function defaultSelection(records,visitId){const rows=Array.isArray(records)?records:[],id=String(visitId||'');const linked=id?rows.filter(r=>String(r.visitId||'')===id):[];return new Set((linked.length?linked:rows.slice(0,2)).map(r=>String(r.id)))}
function extensionFor(type){type=String(type||'').toLowerCase();if(type.includes('png'))return'png';if(type.includes('webp'))return'webp';if(type.includes('heic')||type.includes('heif'))return'heic';return'jpg'}
function shareFileName(record,store){const stamp=String(record&&record.createdAt||'').replace(/[:.]/g,'-').replace('T','_').replace('Z','');const place=[store&&store.enseigne,store&&store.ville].filter(Boolean).map(safePart).join('-')||'magasin';return place+'_'+(stamp||'photo')+'.'+extensionFor(record&&record.type)}
function uid(){try{if(root.crypto&&typeof root.crypto.randomUUID==='function')return root.crypto.randomUUID()}catch(e){}return 'photo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}
function storeById(id){return (root.state&&root.state.stores||[]).find(s=>String(s.id)===String(id))||null}
function storeName(id){const s=storeById(id);return s?[s.enseigne,s.ville].filter(Boolean).join(' · '):'Magasin'}
function currentVisitId(storeId){const rows=root.state&&root.state.businessV2&&Array.isArray(root.state.businessV2.visits)?root.state.businessV2.visits:[];const draft=rows.filter(v=>String(v.storeId)===String(storeId)&&v.status==='draft').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];return draft?String(draft.id):''}
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
async function addPhoto(storeId,file){
  const packed=await compressImage(file),visitId=currentVisitId(storeId),now=new Date().toISOString();
  return putRecord({id:uid(),storeId:String(storeId),visitId:visitId||null,createdAt:now,updatedAt:now,note:'',blob:packed.blob,type:packed.type,width:packed.width,height:packed.height,size:packed.size,originalName:String(file&&file.name||'')});
}
function clearUrls(){for(const url of objectUrls)try{URL.revokeObjectURL(url)}catch(e){}objectUrls=[]}
function blobUrl(blob){const url=URL.createObjectURL(blob);objectUrls.push(url);return url}
function el(tag,text,cls){const node=root.document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node}
function btn(text,fn,cls='secondary'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b}
function setStatus(text,error=false){if(!dialog)return;const box=dialog.querySelector('#srPhotoStatus');box.textContent=text||'';box.classList.toggle('sr-photoError',!!error)}
function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-store-photo-style'))return;
  const s=el('style');s.id='sr-store-photo-style';s.textContent='#storePhotosDialog{box-sizing:border-box;width:min(720px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;padding:16px;border-radius:24px}.sr-photoHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-16px;background:#fff;padding:5px 0 10px;z-index:3}.sr-photoHead h2{margin:0;font-size:20px}.sr-photoHead p{margin:4px 0 0;color:#667085;font-size:12px}.sr-photoClose{min-width:44px;min-height:44px;border:1px solid #dde3ec;background:#fff;border-radius:14px;font-size:20px}.sr-photoActions,.sr-photoReportActions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.sr-photoActions button,.sr-photoReportActions button{min-height:46px}.sr-photoHint{font-size:11px;color:#667085;line-height:1.4;margin:8px 0}.sr-photoStatus{min-height:18px;font-size:12px;color:#315b9d;margin:8px 0}.sr-photoStatus.sr-photoError{color:#b42318}.sr-photoCompare{border:1px solid #dfe5ef;border-radius:16px;background:#f8fafc;padding:10px;margin:10px 0}.sr-photoCompareGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sr-photoCompareCard{min-width:0}.sr-photoCompareCard img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:#eef1f5}.sr-photoCompareCard b,.sr-photoCompareCard span{display:block;font-size:11px;margin-top:4px}.sr-photoCompareCard span{color:#667085;line-height:1.35}.sr-photoGallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}.sr-photoCard{border:1px solid #e0e5ed;border-radius:16px;padding:9px;background:#fff;min-width:0}.sr-photoCard img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:#eef1f5}.sr-photoMeta{font-size:10.5px;color:#667085;margin:7px 0}.sr-photoSelect{display:flex;gap:7px;align-items:center;font-size:11px;font-weight:700;min-height:34px}.sr-photoSelect input{width:18px;height:18px}.sr-photoNote{width:100%;min-height:44px;border:1px solid #d9dee8;border-radius:11px;padding:8px;font-size:11px;box-sizing:border-box}.sr-photoCardActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.sr-photoCardActions button{min-height:44px;font-size:11px}.sr-photoEmpty{grid-column:1/-1;padding:22px 10px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d8dee8;border-radius:16px}#storeQuickSheet .sheetActions>#storePhotosQuickBtn{min-height:45px}@media(max-width:620px){#storeQuickSheet .sheetActions>button[onclick*="appointmentFromQuick"]{grid-column:1/-1}#storeQuickSheet .sheetActions>button[onclick*="fullStoreFromQuick"]{grid-column:1!important}#storeQuickSheet .sheetActions>#storePhotosQuickBtn{grid-column:2!important}}@media(max-width:520px){.sr-photoGallery{grid-template-columns:1fr 1fr}.sr-photoActions,.sr-photoReportActions{grid-template-columns:1fr}.sr-photoCard{padding:7px}}';root.document.head.appendChild(s)
}
function ensureDialog(){
  if(dialog)return dialog;if(!root.document)return null;ensureStyle();
  dialog=el('dialog');dialog.id='storePhotosDialog';dialog.innerHTML='<div class="sr-photoHead"><div><h2 id="srPhotoTitle">Photos magasin</h2><p id="srPhotoSubtitle"></p></div><button type="button" class="sr-photoClose" id="srPhotoClose" aria-label="Fermer">×</button></div><div class="sr-photoActions"><button type="button" class="primary" id="srTakePhoto">📷 Prendre une photo</button><button type="button" class="secondary" id="srChoosePhoto">🖼 Choisir dans Photos</button></div><input id="srPhotoCameraInput" type="file" accept="image/*" capture="environment" hidden><input id="srPhotoLibraryInput" type="file" accept="image/*" multiple hidden><p class="sr-photoHint">Les photos restent sur cet appareil, même hors ligne. Elles ne sont jamais envoyées automatiquement.</p><div class="sr-photoReportActions"><button type="button" class="primary" id="srSharePhotos">Partager la sélection pour le rapport</button><button type="button" class="secondary" id="srComparePhotos">Comparer les 2 dernières</button></div><p id="srPhotoStatus" class="sr-photoStatus" role="status"></p><section id="srPhotoComparePanel" class="sr-photoCompare" hidden></section><div id="srPhotoGallery" class="sr-photoGallery"></div>';
  root.document.body.appendChild(dialog);
  const camera=dialog.querySelector('#srPhotoCameraInput'),library=dialog.querySelector('#srPhotoLibraryInput');
  dialog.querySelector('#srPhotoClose').onclick=closeDialog;
  dialog.querySelector('#srTakePhoto').onclick=()=>camera.click();
  dialog.querySelector('#srChoosePhoto').onclick=()=>library.click();
  camera.addEventListener('change',()=>consumeInput(camera));library.addEventListener('change',()=>consumeInput(library));
  dialog.querySelector('#srSharePhotos').onclick=shareSelected;
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
  const store=storeById(activeStoreId),files=records.map(r=>new File([r.blob],shareFileName(r,store),{type:r.type||r.blob.type||'image/jpeg',lastModified:new Date(r.createdAt).getTime()||Date.now()})),nav=root.navigator||{};
  let can=false;try{can=!!(nav.share&&(!nav.canShare||nav.canShare({files})))}catch(e){can=false}
  if(can){await nav.share({files,title:'Photos terrain · '+storeName(activeStoreId),text:'Photos Store Runner à joindre au rapport terrain.'});return'shared'}
  if(records.length===1){downloadRecord(records[0]);return'downloaded'}
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
async function render(){
  ensureDialog();const rows=await list(activeStoreId),store=storeById(activeStoreId);clearUrls();
  dialog.querySelector('#srPhotoTitle').textContent='Photos · '+storeName(activeStoreId);dialog.querySelector('#srPhotoSubtitle').textContent=rows.length+' photo'+(rows.length>1?'s':'')+' enregistrée'+(rows.length>1?'s':'');
  const ids=new Set(rows.map(r=>String(r.id)));selectedIds=new Set([...selectedIds].filter(id=>ids.has(id)));if(!selectedIds.size&&rows.length)selectedIds=defaultSelection(rows,currentVisitId(activeStoreId));
  const compareButton=dialog.querySelector('#srComparePhotos');compareButton.disabled=rows.length<2;compareButton.textContent=compareOpen?'Masquer la comparaison':'Comparer les 2 dernières';if(rows.length<2)compareOpen=false;
  renderComparison(rows);
  const gallery=dialog.querySelector('#srPhotoGallery');gallery.replaceChildren();if(!rows.length){gallery.append(el('div','Aucune photo pour ce magasin. Prends-en une pendant la visite pour construire l’historique visuel.','sr-photoEmpty'));return rows}
  for(const row of rows){
    const card=el('article',undefined,'sr-photoCard');card.dataset.photoId=String(row.id);const img=el('img');img.src=blobUrl(row.blob);img.alt='Photo magasin du '+formatDate(row.createdAt);img.loading='lazy';
    const meta=el('div',formatDate(row.createdAt)+(row.visitId?' · liée à la visite':''),'sr-photoMeta');
    const select=el('label',undefined,'sr-photoSelect'),check=el('input');check.type='checkbox';check.checked=selectedIds.has(String(row.id));check.dataset.photoSelect=String(row.id);check.onchange=()=>{if(check.checked)selectedIds.add(String(row.id));else selectedIds.delete(String(row.id))};select.append(check,root.document.createTextNode('Inclure au rapport'));
    const note=el('input');note.type='text';note.className='sr-photoNote';note.placeholder='Note / changement observé';note.value=row.note||'';note.addEventListener('change',async()=>{try{await updateNote(row.id,note.value);setStatus('Note photo enregistrée.');if(compareOpen)await render()}catch(e){setStatus(e.message||String(e),true)}});
    const actions=el('div',undefined,'sr-photoCardActions');actions.append(btn('Télécharger',()=>downloadRecord(row)),btn('Supprimer',async()=>{if(root.confirm&&!root.confirm('Supprimer cette photo de ce magasin ?'))return;try{await removeRecord(row.id);selectedIds.delete(String(row.id));await render();setStatus('Photo supprimée.')}catch(e){setStatus(e.message||String(e),true)}},'danger'));
    card.append(img,meta,select,note,actions);gallery.append(card)
  }
  return rows;
}
async function open(storeId){
  if(!storeId)throw new Error('Magasin introuvable.');ensureDialog();activeStoreId=String(storeId);selectedIds.clear();compareOpen=false;setStatus('');if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');try{await render();return true}catch(e){setStatus(e.message||String(e),true);return false}
}
function closeDialog(){clearUrls();if(dialog&&typeof dialog.close==='function'&&dialog.open)dialog.close();else if(dialog)dialog.removeAttribute('open')}
function openFromQuick(){const start=root.document&&root.document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;if(!id){setStatus('Magasin introuvable.',true);return false}open(id);return true}
function installQuickButton(){
  if(!root.document)return false;const actions=root.document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;if(root.document.getElementById('storePhotosQuickBtn'))return true;
  const b=btn('📷 Photos',openFromQuick,'secondary');b.id='storePhotosQuickBtn';b.title='Prendre, comparer et partager les photos de ce magasin';b.style.minHeight='44px';const full=[...actions.querySelectorAll('button')].find(x=>String(x.getAttribute('onclick')||'').includes('fullStoreFromQuick'));if(full&&full.parentNode===actions)full.insertAdjacentElement('afterend',b);else actions.appendChild(b);return true
}
function boot(){ensureDialog();installQuickButton()}

const api={DB_NAME,STORE,MAX_EDGE,safePart,scaleSize,defaultSelection,shareFileName,openDb,list,addPhoto,removeRecord,updateNote,open,render,shareRecords,installQuickButton};
root.StorePhotosV1=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();root.document.addEventListener('store-runner:data-restored',installQuickButton);root.document.addEventListener('store-runner:planning-updated',installQuickButton)}
})(typeof window!=='undefined'?window:globalThis);
