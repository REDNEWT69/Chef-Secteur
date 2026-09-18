(function(){
'use strict';
const M=window.StoreRunnerVisitModel;
const VISIBLE_STEPS=[3];
const STEP_LABELS={3:'Terrain'};
let dialog,body,status,title,session,activeId=null,viewStep=3,opener=null,quickMemoryObserver=null,expandedMemoryStore='',previewFamily='';
function element(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
function button(text,fn,cls='secondary'){const b=element('button',text,cls);b.type='button';b.addEventListener('click',fn);return b}
function domain(){return window.state.businessV2||M.empty()}
function current(){return domain().visits.find(x=>x.id===activeId)}
function storeFor(storeId,state=window.state){const key=String(storeId);const stores=state&&Array.isArray(state.stores)?state.stores:[];return stores.find(x=>String(x.id)===key)||(state&&state.businessV2&&state.businessV2.storeSnapshots&&state.businessV2.storeSnapshots[key])||null}
function name(storeId){const s=storeFor(storeId);return s?s.enseigne+' · '+s.ville:'Magasin archivé'}
function message(text,error=false){status.textContent=text||'';status.classList.toggle('sr-error',!!error)}
async function save(change,after){try{await session.edit(change);if(after)after();return true}catch(e){message('Non enregistré : '+e.message,true);return false}}
function field(host,label,value,onChange,type='textarea',disabled=false){const wrap=element('label',label,'sr-field'),input=element(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;else input.rows=2;input.value=value||'';input.disabled=disabled;input.addEventListener(type==='date'?'change':'input',()=>onChange(input.value));wrap.append(input);host.append(wrap);return input}
function storeFamiliesFor(storeId,state=window.state){
 const store=storeFor(storeId,state),products=store&&Array.isArray(store.products)?store.products:[];
 const selected=[];
 for(const value of products){const key=String(value||'').trim().toLowerCase();if(key==='blanc'&&!selected.includes('blanc'))selected.push('blanc');if(key==='brun'&&!selected.includes('brun'))selected.push('brun')}
 const allowed=M.FAMILIES.filter(f=>selected.includes(f));
 return allowed.length?allowed:M.FAMILIES.slice()
}
function visitFamilies(v,state=window.state){return storeFamiliesFor(v&&v.storeId,state)}
function activeFamily(v,state=window.state){const allowed=visitFamilies(v,state),family=M.FAMILIES.includes(v&&v.activeFamily)?v.activeFamily:'';return allowed.includes(family)?family:(allowed[0]||'brun')}
function normalizeVisitFamily(state,v){if(!v||v.status!=='draft')return false;const allowed=visitFamilies(v,state),family=activeFamily(v,state);if(allowed.length===1&&v.activeFamily!==family){M.editVisit(state,v.id,'activeFamily',null,family);return true}return false}
function shownFamily(v){const allowed=visitFamilies(v);return v.status==='completed'&&allowed.includes(previewFamily)?previewFamily:activeFamily(v)}
function familySwitch(host,v){
 const box=element('div',undefined,'sr-familySwitch'),allowed=visitFamilies(v),active=shownFamily(v),single=allowed.length===1;
 if(single)box.classList.add('sr-familySwitchSingle');
 for(const family of allowed){
  let b;
  if(single){b=element('span',family.toUpperCase(),'sr-familyBtn sr-familyOnly');b.setAttribute('role','status')}
  else{
   const change=()=>{
    if(v.status==='completed'){previewFamily=family;render();return}
    save(s=>M.editVisit(s,v.id,'activeFamily',null,family),()=>{previewFamily=family;render();message('Famille active : '+family.toUpperCase())})
   };
   b=button(family.toUpperCase(),change,'sr-familyBtn')
  }
  b.setAttribute('aria-pressed',active===family?'true':'false');
  b.dataset.family=family;box.append(b)
 }
 if(!single){
  const label=v.status==='completed'?'Famille affichée : ':'Famille active : ';
  const hint=v.status==='completed'?'': ' · tes notes et prochaines photos seront classées '+active.toUpperCase();
  const state=element('p',label+active.toUpperCase()+hint,'sr-familyActive');state.setAttribute('aria-live','polite');box.append(state)
 }
 host.append(box)
}
function legacyReport(host,block){
 const rows=[['actions','Actions réalisées'],['massification','Massification / exposition'],['omni','Suivi OMNI']].filter(([key])=>String(block[key]||'').trim());
 if(!rows.length)return;
 const details=element('details');details.className='sr-legacyReport';details.append(element('summary','Anciennes notes détaillées conservées'));
 for(const [key,label] of rows){const row=element('div',undefined,'sr-legacyRow');row.append(element('b',label),element('p',block[key]));details.append(row)}
 host.append(details)
}
function frenchDay(iso){const p=String(iso||'').split('-');return p.length===3?p[2]+'/'+p[1]:String(iso||'')}
function localDay(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1).padStart(2,'0')+'-'+p(d.getDate()).padStart(2,'0')}
function sameDayCompleted(storeId){const id=String(storeId||''),day=localDay();return domain().visits.filter(v=>String(v.storeId)===id&&v.status==='completed'&&v.completedDate===day).sort((a,b)=>String(b.completedAt||b.updatedAt||'').localeCompare(String(a.completedAt||a.updatedAt||'')))[0]||null}
/* La promesse de la visite précédente, pour la famille affichée uniquement. Lecture seule :
   aucune écriture, aucun champ supplémentaire à remplir en magasin. */
function lastPromise(v,family){
 const rows=domain().visits
  .filter(x=>String(x.storeId)===String(v.storeId)&&x.id!==v.id&&x.status==='completed')
  .sort((a,b)=>String(b.completedDate||b.completedAt||'').localeCompare(String(a.completedDate||a.completedAt||'')));
 for(const row of rows){
  const t=String((M.reportOf(row)[family]||{}).training||'').trim();
  if(t)return{date:row.completedDate||'',text:t};
 }
 return null;
}
function openPhotos(v){const api=window.StorePhotosV1;if(!api||typeof api.open!=='function'){message('Photos indisponibles sur cet appareil.',true);return}api.open(v.storeId).catch(e=>message('Photos indisponibles : '+(e.message||String(e)),true))}
function report(host,v){
 const data=M.reportOf(v),family=shownFamily(v),families=visitFamilies(v),block=data[family];
 const promise=lastPromise(v,family);
 if(promise){
  const box=element('section',undefined,'sr-lastPromise');
  box.append(element('b','La dernière fois'+(promise.date?' ('+frenchDay(promise.date)+')':'')+', tu notais :'));
  box.append(element('p',promise.text));
  host.append(box);
 }
 const intro=element('section',undefined,'sr-terrainIntro');intro.append(element('h3','Carnet terrain · '+family.toUpperCase()),element('p','Note seulement ce que TeamHaven ne capte pas : retour vendeur, perception de la marque, concurrence, opportunité, formation ou point à revoir.'));host.append(intro);
 const contextLabel=families.length>1?'Contexte magasin · facultatif, commun BLANC / BRUN':'Contexte magasin · facultatif';
 const context=field(host,contextLabel,data.shared.context,value=>save(s=>M.editReport(s,v.id,'shared','context',value)),'textarea',v.status==='completed');context.rows=3;
 const note=field(host,'Note terrain '+family.toUpperCase(),block.team,value=>save(s=>M.editReport(s,v.id,family,'team',value)),'textarea',v.status==='completed');note.rows=8;note.placeholder='Ex. vendeur rencontré, ce qu’il t’a dit, perception de la marque, concurrence, produit remarqué, problème ou opportunité…';
 host.append(element('p','Tu peux dicter directement avec le micro du clavier. Pas de cases à remplir pour le plaisir de remplir des cases.','sr-hint'));
 const next=field(host,'Prochain passage / formation '+family.toUpperCase(),block.training,value=>save(s=>M.editReport(s,v.id,family,'training',value)),'textarea',v.status==='completed');next.rows=4;next.placeholder='Ex. revoir le mural, former l’équipe, suivre une objection SAV…';
 const photo=button('📷 Photos '+family.toUpperCase(),()=>openPhotos(v),'sr-photoEntry');photo.dataset.family=family;host.append(photo);
 legacyReport(host,block);
 if(v.status==='draft'){
  if(families.length>1)host.append(element('p','Quand tu sors du magasin, utilise « 📤 Sortie magasin » en haut : le texte et les photos seront déjà séparés BLANC / BRUN.','sr-terrainExitHint'));
  const finish=button('Terminer la visite',()=>completeVisit(v),'primary');finish.dataset.srCompleteVisit=v.id;host.append(finish)
 }else{
  host.append(element('p','Visite terminée le '+v.completedDate,'sr-completed'));
  if(v.completedDate===localDay()){const reopen=button('↩ Réouvrir cette visite',()=>reopenVisit(v,true),'secondary');reopen.dataset.srReopenVisit=v.id;host.append(reopen)}
 }
}
function completionText(v){const d=M.reportOf(v),choices=[d.brun.team,d.blanc.team,d.brun.training,d.blanc.training,d.shared.context];return choices.map(x=>String(x||'').trim()).find(Boolean)||'Visite terrain enregistrée'}
async function completeVisit(v){
 if(!window.confirm('Terminer cette visite maintenant ?\n\nElle passera dans l’historique et deviendra en lecture seule.')){message('Visite conservée en cours.');return false}
 return save(s=>{const live=M.getVisit(s,v.id);if(!String(live.conclusion||'').trim())M.editVisit(s,v.id,'conclusion',null,completionText(live).slice(0,500));M.complete(s,v.id,localDay())},()=>{viewStep=3;render();if(typeof window.renderAll==='function')window.renderAll();renderQuickMemory();message('Visite terminée et enregistrée dans l’historique.')})
}
async function reopenVisit(v,ask){
 if(!v||v.status!=='completed')return false;
 if(v.completedDate!==localDay()){message('Seule une visite terminée aujourd’hui peut être réouverte.',true);return false}
 if(ask&& !window.confirm('Réouvrir cette visite ?\n\nElle repassera en cours sans créer une nouvelle visite ni ajouter un nouveau jour.'))return false;
 const visitId=v.id;
 return save(s=>{
  const live=M.getVisit(s,visitId);if(live.status!=='completed')return;
  const day=live.completedDate,storeId=String(live.storeId);
  if(day!==localDay())throw Error('Seule une visite terminée aujourd’hui peut être réouverte.');
  live.status='draft';live.completedAt=null;live.completedDate=null;live.updatedAt=new Date().toISOString();normalizeVisitFamily(s,live);
  const otherSameDay=(s.businessV2&&s.businessV2.visits||[]).some(x=>x.id!==live.id&&String(x.storeId)===storeId&&x.status==='completed'&&x.completedDate===day);
  const legacy=s.visits&&s.visits[storeId];
  if(legacy&&Array.isArray(legacy.history)&&!otherSameDay){legacy.history=legacy.history.filter(x=>x!==day);legacy.history.sort();legacy.lastVisit=legacy.history[legacy.history.length-1]||''}
 },()=>{activeId=visitId;previewFamily=activeFamily(current());viewStep=3;render();if(typeof window.renderAll==='function')window.renderAll();renderQuickMemory();message('Visite réouverte · tu peux continuer la saisie.')})
}
/* Le parcours terrain n'a plus qu'une étape : l'ancien onglet Suivi ne pouvait plus rien
   afficher, aucun chemin ne créant plus d'action. Les actions encore ouvertes restent
   exposées par memoryFor() et affichées par renderQuickMemory() dans la fiche magasin. */
function stepOf(){return 3}
function steps(host,v){
 if(VISIBLE_STEPS.length<2)return;
 const step=stepOf(),nav=element('nav',undefined,'sr-steps');nav.setAttribute('aria-label','Étapes de la visite');
 for(const i of VISIBLE_STEPS){const b=button(STEP_LABELS[i],async()=>{if(v.status==='draft')await save(s=>M.editVisit(s,v.id,'step',null,i),()=>{render();dialog.scrollTop=0});else{viewStep=i;render();dialog.scrollTop=0}});b.setAttribute('aria-current',step===i?'step':'false');nav.append(b)}
 host.append(nav)
}
function render(){const v=current();if(!v){hub();return}body.replaceChildren();title.textContent=name(v.storeId)+' · '+(v.status==='draft'?'Visite en cours':'Visite terminée');steps(body,v);familySwitch(body,v);report(body,v)}
function hub(){activeId=null;title.textContent='Visites';body.replaceChildren();const rows=domain().visits.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));if(!rows.length)body.append(element('p','Démarre une visite depuis une fiche magasin, le planning ou la tournée.'));for(const v of rows){const box=element('section',undefined,'sr-item');box.append(element('h3',name(v.storeId)),element('p',v.status==='draft'?'Visite en cours':('Terminée le '+v.completedDate)),button(v.status==='draft'?'Reprendre la visite':'Consulter la visite',()=>{activeId=v.id;previewFamily=activeFamily(v);viewStep=3;render()}));body.append(box)}}
function show(){if(!dialog.open){opener=document.activeElement;dialog.showModal()}}
async function start(storeId){
 show();
 const key=String(storeId),draft=domain().visits.find(v=>String(v.storeId)===key&&v.status==='draft');
 if(!draft){const recent=sameDayCompleted(key);if(recent&&window.confirm('Une visite de ce magasin a déjà été terminée aujourd’hui.\n\nOK : reprendre cette visite\nAnnuler : créer une nouvelle visite'))return reopenVisit(recent,false)}
 let id;await save(s=>{id=M.start(s,key);const v=M.getVisit(s,id);if(v.status==='draft'&&v.step!==3)M.editVisit(s,id,'step',null,3);normalizeVisitFamily(s,v)},()=>{activeId=id;previewFamily=activeFamily(current());viewStep=3;render()});return id
}
function openVisit(visitId){const v=domain().visits.find(x=>x.id===String(visitId));if(!v)return false;show();activeId=v.id;previewFamily=activeFamily(v);viewStep=3;render();if(v.status==='draft'&&v.activeFamily!==activeFamily(v))save(s=>normalizeVisitFamily(s,M.getVisit(s,v.id)),()=>{previewFamily=activeFamily(current());render()});return true}
function openHub(){show();save(undefined,hub);return true}
async function close(){if(!await save())return;dialog.close();if(opener&&opener.isConnected)opener.focus();if(typeof window.renderAll==='function')window.renderAll()}
function memoryFor(storeId){const id=String(storeId||''),b=domain();const visits=(b.visits||[]).filter(v=>String(v.storeId)===id&&v.status==='completed').slice().sort((a,b)=>String(b.completedAt||b.completedDate||'').localeCompare(String(a.completedAt||a.completedDate||'')));const actions=(b.actions||[]).filter(a=>String(a.storeId)===id&&!['done','cancelled'].includes(a.status)).slice().sort((a,b)=>String(a.dueDate||'9999-12-31').localeCompare(String(b.dueDate||'9999-12-31'))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));return{visits,actions}}
function ensureMemoryStyle(){if(document.getElementById('sr-store-memory-style'))return;const s=element('style');s.id='sr-store-memory-style';s.textContent='#srStoreMemory{margin:14px 0 4px;padding:14px;border:1px solid #e5e7eb;border-radius:18px;background:#f8fafc}#srStoreMemory .sr-memoryHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:9px}#srStoreMemory h3{margin:0;font-size:15px}#srStoreMemory .sr-memoryMeta{font-size:11px;color:#667085;margin-top:3px}#srStoreMemory .sr-memoryList{display:grid;gap:7px}#srStoreMemory .sr-memoryRow{width:100%;min-height:44px;text-align:left;border:1px solid #dde3ec;border-radius:13px;background:#fff;padding:9px 10px;display:block;color:#1d2939}#srStoreMemory .sr-memoryRow b{display:block;font-size:12px;margin-bottom:2px}#srStoreMemory .sr-memoryRow span{display:block;font-size:11px;line-height:1.35;color:#667085;white-space:normal}#srStoreMemory .sr-memoryActions{margin-top:12px;padding-top:10px;border-top:1px solid #e5e7eb}#srStoreMemory .sr-memoryToggle{width:100%;min-height:44px;margin-top:8px;border:0;border-radius:12px;background:#eef4ff;color:#1456c4;font-weight:800}';document.head.appendChild(s)}
function ensureMemoryHost(){const sheet=document.getElementById('storeQuickSheet');if(!sheet)return null;let host=document.getElementById('srStoreMemory');if(host)return host;host=element('section');host.id='srStoreMemory';host.setAttribute('aria-label','Mémoire terrain du magasin');const bottom=sheet.querySelector('.sheetBottom');if(bottom)sheet.insertBefore(host,bottom);else sheet.appendChild(host);return host}
function actionLabel(a){return (a.status==='in_progress'?'En cours':'À faire')+(a.dueDate?' · '+a.dueDate:'')+(a.owner?' · '+a.owner:'')}
function renderQuickMemory(){const sheet=document.getElementById('storeQuickSheet');if(!sheet||!sheet.classList.contains('open'))return;const startButton=document.getElementById('srQuickStart'),storeId=String(startButton&&startButton.dataset?(startButton.dataset.srStart||''):'');if(!storeId)return;ensureMemoryStyle();const host=ensureMemoryHost();if(!host)return;const data=memoryFor(storeId),expanded=expandedMemoryStore===storeId,shown=expanded?data.visits:data.visits.slice(0,3);host.replaceChildren();const head=element('div',undefined,'sr-memoryHead'),headText=element('div');headText.append(element('h3','Mémoire terrain'),element('div',data.visits.length+' visite'+(data.visits.length>1?'s':'')+' enregistrée'+(data.visits.length>1?'s':'')+' · '+data.actions.length+' action'+(data.actions.length>1?'s':'')+' en cours','sr-memoryMeta'));head.append(headText);host.append(head);const list=element('div',undefined,'sr-memoryList');list.id='srStoreHistoryList';if(!shown.length)list.append(element('div','Aucune visite terminée pour ce magasin.','sr-memoryMeta'));for(const v of shown){const row=button('',()=>{if(typeof window.closeStoreQuick==='function')window.closeStoreQuick();openVisit(v.id)},'sr-memoryRow');row.dataset.srHistoryVisit=v.id;row.append(element('b',v.completedDate||'Visite terminée'),element('span',v.conclusion||'Visite terrain'));list.append(row)}host.append(list);if(data.visits.length>3){const toggle=button(expanded?'Réduire l’historique':'Voir tout l’historique ('+data.visits.length+')',()=>{expandedMemoryStore=expanded?'':storeId;renderQuickMemory()},'sr-memoryToggle');toggle.dataset.srHistoryToggle='1';host.append(toggle)}if(data.actions.length){const wrap=element('div',undefined,'sr-memoryActions');wrap.append(element('h3','Actions en cours'));const actionList=element('div',undefined,'sr-memoryList');for(const a of data.actions.slice(0,3)){const row=button('',()=>{if(typeof window.closeStoreQuick==='function')window.closeStoreQuick();openVisit(a.visitId)},'sr-memoryRow');row.dataset.srOpenAction=a.id;row.append(element('b',a.description||'Action'),element('span',actionLabel(a)));actionList.append(row)}wrap.append(actionList);host.append(wrap)}}
function installQuickMemory(){const sheet=document.getElementById('storeQuickSheet');if(!sheet||quickMemoryObserver)return;ensureMemoryStyle();ensureMemoryHost();quickMemoryObserver=new MutationObserver(renderQuickMemory);quickMemoryObserver.observe(sheet,{attributes:true,attributeFilter:['class','aria-hidden']});document.addEventListener('store-runner:data-restored',renderQuickMemory);document.addEventListener('store-runner:planning-updated',renderQuickMemory)}
function boot(){if(document.getElementById('srVisitDialog'))return;dialog=element('dialog');dialog.id='srVisitDialog';dialog.className='sr-visit';dialog.setAttribute('aria-labelledby','srVisitTitle');const header=element('div',undefined,'sr-head');title=element('h2','Visites');title.id='srVisitTitle';header.append(title,button('Fermer',close));status=element('p',undefined,'sr-status');status.setAttribute('role','status');body=element('div');dialog.append(header,status,button('Réessayer l’enregistrement',()=>save()),body);document.body.append(dialog);session=window.StoreRunnerVisitStore.create({model:M,reliability:window.ChefReliability,db:window.__chefStorage||window.storage||window.localStorage,getState:()=>window.state,setState:s=>{window.state=s},onStatus:(phase,error)=>{if(phase==='saving')message('Enregistrement…');else if(phase==='error')message('Non enregistré : '+error,true);else message(window.__chefStorageMode==='memory'?'Stockage temporaire : exporte tes données avant de fermer.':'Enregistré localement · '+new Date().toLocaleTimeString('fr-FR'),window.__chefStorageMode==='memory')}});window.StoreRunnerVisits={start,openVisit,openHub,memoryFor,renderQuickMemory,activeVisitId:()=>activeId,familiesForStore:storeFamiliesFor};installQuickMemory();dialog.addEventListener('cancel',e=>{e.preventDefault();close()});document.addEventListener('click',e=>{const b=e.target.closest('[data-sr-start],[data-sr-current],[data-sr-terrain],[data-sr-hub]');if(!b)return;e.preventDefault();e.stopPropagation();if(b.hasAttribute('data-sr-hub'))openHub();else if(b.hasAttribute('data-sr-current')){if(window.currentEditId)start(window.currentEditId)}else if(b.hasAttribute('data-sr-terrain')){const t=window.terrainCurrent();if(t)start(t.store.id);else{show();hub();message('Aucune visite de tournée en attente.')}}else start(b.dataset.srStart)},true);document.addEventListener('store-runner:data-restored',()=>{session.invalidate();if(dialog.open){hub();message('Sauvegarde restaurée.')}});window.addEventListener('beforeunload',e=>{if(session.hasPending()){e.preventDefault();e.returnValue=''}});document.addEventListener('visibilitychange',()=>{if(document.hidden)save()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();