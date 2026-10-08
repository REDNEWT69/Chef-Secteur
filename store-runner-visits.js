(function(){
'use strict';
const M=window.StoreRunnerVisitModel;
const VISIBLE_STEPS=[3];
const STEP_LABELS={3:'Terrain'};
let dialog,body,status,title,session,activeId=null,viewStep=3,opener=null,quickMemoryObserver=null,storeDialogObserver=null,expandedMemoryStore='',previewFamily='';
const closingVisits=new Set();
function element(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
function button(text,fn,cls='secondary'){const b=element('button',text,cls);b.type='button';b.addEventListener('click',fn);return b}
function domain(){return window.state.businessV2||M.empty()}
function current(){return domain().visits.find(x=>x.id===activeId)}
function visitCtaLabel(storeId){const key=String(storeId||'');return domain().visits.some(v=>String(v.storeId)===key&&v.status==='draft')?'Reprendre la visite':'Démarrer la visite'}
function refreshStartCtas(storeId){const key=String(storeId||'');const quick=document.getElementById('srQuickStart'),edit=document.getElementById('srStoreStart');if(quick&&String(quick.dataset.srStart||'')===key)quick.textContent=visitCtaLabel(key);if(edit&&String(window.currentEditId||'')===key)edit.textContent=visitCtaLabel(key)}
function storeFor(storeId,state=window.state){const key=String(storeId);const stores=state&&Array.isArray(state.stores)?state.stores:[];return stores.find(x=>String(x.id)===key)||(state&&state.businessV2&&state.businessV2.storeSnapshots&&state.businessV2.storeSnapshots[key])||null}
function name(storeId){const s=storeFor(storeId);return s?s.enseigne+' · '+s.ville:'Magasin archivé'}
function message(text,error=false){status.textContent=text||'';status.classList.toggle('sr-error',!!error)}
async function save(change,after,intent){try{const changed=await session.edit(change,intent);if(changed===false)return false;if(after)after();return true}catch(e){message('Non enregistré : '+e.message,true);return false}}
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
function localDay(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
function sameDayCompleted(storeId){const id=String(storeId||''),day=localDay();return domain().visits.filter(v=>String(v.storeId)===id&&v.status==='completed'&&v.completedDate===day).sort((a,b)=>String(b.completedAt||b.updatedAt||'').localeCompare(String(a.completedAt||a.updatedAt||'')))[0]||null}
/* Une même lecture pour fiche magasin, rapport et préparation. Les citations sont
   rendues en textContent, datées et reliées au rapport ; aucune note n'est réécrite. */
function memorySource(item){
 const source=item.source||'';
 if(source.startsWith('actions.'))return 'Plan d’action';
 if(source.startsWith('report.')){const parts=source.split('.');return parts[2]==='team'?'Note terrain':parts[2]==='training'?'Prochain passage / formation':parts[2]==='context'?'Contexte magasin':'Compte rendu';}
 return source.startsWith('sixP.')?'Constat 6P':source.startsWith('arrival.')?'Relevé 360°':'Conclusion';
}
function runnerMemory(host,storeId,options){
 const opts=options||{},items=M.reportMemoryFor(window.state,storeId,opts).items;
 if(!items.length)return false;
 const box=element('section',undefined,'sr-reportMemory'+(opts.previous?' sr-lastPromise':''));box.setAttribute('aria-label','Mémoire Runner');
 box.append(element('b',opts.previous?'Pour ce passage':opts.onlyVisitId?'Runner a retenu':'À retenir avec Runner'));
 const list=element('div',undefined,'sr-reportMemoryList');
 function row(item,target){
  const entry=element('div',undefined,'sr-reportMemoryItem');entry.dataset.memoryKind=item.kind;
  entry.append(element('span',item.label+' · '+item.date+(item.family?' · '+item.family.toUpperCase():''),'sr-memoryMeta'),element('p',item.text));
  const origin=memorySource(item);
  if(item.visitId!==activeId||!dialog.open){const link=button(origin+' · voir le rapport',async()=>{if(!await save())return;if(typeof window.closeStoreQuick==='function')window.closeStoreQuick();openVisit(item.visitId)},'sr-memorySource');link.dataset.memoryVisit=item.visitId;entry.append(link)}
  else entry.append(element('span',origin,'sr-memoryMeta'));
  target.append(entry);
 }
 items.slice(0,2).forEach(item=>row(item,list));box.append(list);
 if(items.length>2){const more=element('details');more.append(element('summary','Voir les '+(items.length-2)+' autres éléments'));items.slice(2).forEach(item=>row(item,more));box.append(more)}
 box.append(element('small','Extraits des visites enregistrées. Seules les actions suivies ont un statut actualisé.'));
 host.append(box);return true;
}
/* V255 — la galerie s'ouvre sur les photos de CETTE visite, et la prochaine photo prend la
   famille affichée ici (BRUN ou BLANC) : aucun classement manuel à faire. */
function openPhotos(v){const api=window.StorePhotosV1;if(!api||typeof api.open!=='function'){message('Photos indisponibles sur cet appareil.',true);return}const opts={visitId:v.id};if(isCuisinisteStoreId(v.storeId))opts.simpleFamily=true;else opts.family=shownFamily(v);api.open(v.storeId,opts).catch(e=>message('Photos indisponibles : '+(e.message||String(e)),true))}
/* V276 — « À retenir » : Runner croise ce rapport avec les précédents du magasin, ses actions, son planning et sa priorité
   (StoreRunnerStoreExplorer.insightsFor) et n'en dit que 1 ou 2 (StoreRunnerBehavior.remarks), la plus grave d'abord. Rien d'utile :
   rien n'est affiché, pas même un cadre vide. Jamais de paraphrase : des statuts, des comptes, des dates. Dans le flux de l'écran,
   pas de bouton, pas de position flottante ; il ne parle que pour la dernière visite terminée du magasin. */
let remarkRunner=null;
function releaseRunner(){if(remarkRunner){try{remarkRunner.destroy()}catch(e){}remarkRunner=null}}
function runnerRemark(host,v){
 try{
  const X=window.StoreRunnerStoreExplorer,B=window.StoreRunnerBehavior;
  if(!X||typeof X.insightsFor!=='function'||!B||typeof B.controller!=='function')return;
  const latest=X.insightsFor(window.state,v.storeId,{});
  if(latest.visitId!==String(v.id))return;
  const said=B.controller().remarks({items:latest.items});
  if(!said.lines.length)return;
  const box=element('section',undefined,'sr-runnerRemark'),slot=element('span',undefined,'sr-runnerSlot'),list=element('div',undefined,'sr-runnerLines');
  box.setAttribute('aria-label','À retenir, par Runner');slot.setAttribute('aria-hidden','true');
  list.append(element('b','À retenir'));
  for(const line of said.lines)list.append(element('p',line.text));
  box.append(slot,list);host.append(box);
  const api=window.StoreRunnerRunner;
  if(api&&typeof api.mount==='function'){
   remarkRunner=api.mount(slot,{variant:'bubble',size:'sm',decorative:true});
   if(remarkRunner&&said.state!=='neutral'&&typeof remarkRunner.setState==='function')remarkRunner.setState(said.state,{resetAfter:B.CONFIG.messageMs,silent:true});
  }
 }catch(e){}
}
function cuisinisteReportText(v){
 const data=M.reportOf(v),values=[data.shared&&data.shared.context];
 for(const family of M.FAMILIES)for(const key of Object.keys(M.REPORT_FIELDS||{}))values.push(data[family]&&data[family][key]);
 const seen=new Set(),out=[];for(const value of values){const text=String(value||'').trim();if(text&&!seen.has(text)){seen.add(text);out.push(text)}}
 return out.join('\n\n');
}
function editCuisinisteReport(state,visitId,value){
 M.editReport(state,visitId,'shared','context',value);
 for(const family of M.FAMILIES)for(const key of Object.keys(M.REPORT_FIELDS||{}))M.editReport(state,visitId,family,key,'');
}
function cuisinisteReport(host,v){
 const note=field(host,'Rapport magasin',cuisinisteReportText(v),value=>save(s=>editCuisinisteReport(s,v.id,value)),'textarea',v.status==='completed');
 note.rows=10;note.placeholder='Ex. interlocuteur rencontré, retour showroom, références proposées, concurrence, formation, action ou point à suivre…';
 host.append(element('p','Tu peux dicter directement avec le micro du clavier. Un seul rapport pour le magasin.','sr-hint'));
 const photo=button('📷 Photos',()=>openPhotos(v),'sr-photoEntry');host.append(photo);
 if(v.status==='draft'){
  const finish=button('Terminer la visite',()=>completeVisit(v),'primary');finish.dataset.srCompleteVisit=v.id;host.append(finish)
 }else{
  host.append(element('p','Visite terminée le '+v.completedDate,'sr-completed'));
  runnerRemark(host,v);
  if(v.completedDate===localDay()){const reopen=button('↩ Réouvrir cette visite',()=>reopenVisit(v,true),'secondary');reopen.dataset.srReopenVisit=v.id;host.append(reopen)}
  dangerZone(host,v);
 }
}
function report(host,v){
 if(isCuisinisteStoreId(v.storeId)){cuisinisteReport(host,v);return}
 const data=M.reportOf(v),family=shownFamily(v),families=visitFamilies(v),block=data[family];
 if(v.status==='draft')runnerMemory(host,v.storeId,{family,excludeVisitId:v.id,previous:true,limit:6});
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
  runnerRemark(host,v);
  runnerMemory(host,v.storeId,{family,onlyVisitId:v.id,history:true});
  if(v.completedDate===localDay()){const reopen=button('↩ Réouvrir cette visite',()=>reopenVisit(v,true),'secondary');reopen.dataset.srReopenVisit=v.id;host.append(reopen)}
  dangerZone(host,v);
 }
}
/* V231 — supprimer une visite enregistrée par erreur.
   Le bouton est destructif : il vit dans un repli fermé, donc il faut deux gestes
   délibérés pour l'atteindre. Sur mobile un tap malheureux ouvre au pire le repli.
   La confirmation nomme l'enseigne, la ville et la date : on ne supprime jamais
   « la visite du dessus », on supprime celle qu'on vient de lire.
   Toute la mécanique métier reste chez StoreRunnerVisitModel.removeVisit. */
function visitIdentity(v){const s=storeFor(v&&v.storeId);return{enseigne:(s&&s.enseigne)||'Magasin archivé',ville:(s&&s.ville)||'',date:(v&&v.completedDate)||''}}
function dangerZone(host,v){
 const box=element('details',undefined,'sr-dangerZone');box.dataset.srDangerZone=v.id;
 box.append(element('summary','Cette visite est une erreur ?'));
 box.append(element('p','La supprimer retire définitivement la visite, ses actions liées et son jour dans l’historique du magasin. Les opportunités notées ici sont conservées sur le magasin.','sr-dangerHint'));
 const b=button('🗑 Supprimer cette visite',()=>deleteVisit(v.id),'sr-dangerBtn');
 b.dataset.srDeleteVisit=v.id;box.append(b);host.append(box);
}
function deletionSummary(result){
 if(!result)return 'Visite supprimée.';
 const parts=['Visite supprimée.'];
 if(result.actions)parts.push(result.actions+(result.actions>1?' actions liées supprimées.':' action liée supprimée.'));
 if(result.opportunities)parts.push(result.opportunities+(result.opportunities>1?' opportunités conservées':' opportunité conservée')+' sur le magasin.');
 return parts.join(' ');
}
function announceDeletion(detail){try{document.dispatchEvent(new CustomEvent('store-runner:visit-deleted',{detail}))}catch(e){}}
/* V276 : la clôture et la réouverture sont annoncées par leur propriétaire, comme la suppression. Les hôtes qui affirment quelque
   chose du métier (l'Accueil de Runner) se rafraîchissent sur ces événements au lieu de deviner : ils lisent alors la source la plus récente. */
function announceVisit(kind,v){try{document.dispatchEvent(new CustomEvent('store-runner:visit-'+kind,{detail:{visitId:String(v&&v.id||''),storeId:String(v&&v.storeId||''),date:localDay()}}))}catch(e){}}
/* Garde-fou V231 — les photos ne vivent pas dans `state` : elles sont dans IndexedDB,
   hors de l'écriture atomique qui supprime une visite. Supprimer la visite sans elles
   les abandonnerait sur leur magasin actuel — le mauvais magasin dans le cas qui a
   motivé ce lot — et les comptes rendus les rechargeraient par magasin. On refuse donc
   la suppression tant qu'une photo porte ce visitId, et on ne supprime JAMAIS une photo
   automatiquement : le déplacement (StorePhotosV1.moveRecords) coupe déjà le lien de
   visite vers un autre magasin, et c'est à l'utilisateur de trancher. */
async function linkedPhotos(visitId){
 const api=window.StorePhotosV1;
 if(!api||typeof api.listByVisitId!=='function')return [];
 return api.listByVisitId(visitId);
}
function photoBlockMessage(count){return 'Cette visite contient '+count+' photo'+(count>1?'s':'')+'. Déplace ou supprime ces photos avant de supprimer la visite.'}
async function deleteVisit(visitId){
 const key=String(visitId||''),v=domain().visits.find(x=>x.id===key);
 if(!v){message('Visite introuvable.',true);return false}
 const who=visitIdentity(v),storeId=String(v.storeId);
 const label=who.enseigne+(who.ville?' · '+who.ville:'');
 let photos;
 try{photos=await linkedPhotos(key)}
 catch(e){message('Photos illisibles : suppression annulée. '+(e.message||String(e)),true);return false}
 if(photos.length){message(photoBlockMessage(photos.length),true);return false}
 if(!window.confirm('Supprimer définitivement cette visite ?\n\n'+label+'\nVisite du '+(who.date||'jour non enregistré')+'\n\nElle disparaîtra de la mémoire magasin, de l’historique et des rapports. Les opportunités du magasin sont conservées. Cette action est irréversible.')){message('Visite conservée.');return false}
 let result=null;
 return save(s=>{result=M.removeVisit(s,key)},()=>{
  activeId=null;previewFamily='';viewStep=3;render();
  if(typeof window.renderAll==='function')window.renderAll();
  renderQuickMemory();
  if(window.StoreRunnerOpportunities&&typeof window.StoreRunnerOpportunities.refreshButtons==='function')window.StoreRunnerOpportunities.refreshButtons();
  announceDeletion({visitId:key,storeId,completedDate:who.date});
  message(deletionSummary(result));
 },{checkpoint:'Avant suppression d’une visite'});
}
/* Point d'entrée unique de l'écran Historique : la même opération, jamais une seconde
   implémentation. Une date qui porte plusieurs visites terminées n'est jamais tranchée
   à notre place — on ouvre le hub pour que la bonne visite soit choisie. */
async function deleteHistoryEntry(storeId,date){
 const key=String(storeId||''),day=String(date||'');
 const matches=domain().visits.filter(v=>v.status==='completed'&&String(v.storeId)===key&&String(v.completedDate)===day);
 if(matches.length>1){show();activeId=null;render();message('Plusieurs visites ont été terminées le '+day+' dans ce magasin : ouvre celle à supprimer.',true);return false}
 if(matches.length===1)return deleteVisit(matches[0].id);
 return deleteLegacyDay(key,day);
}
/* Un jour d'historique sans visite détaillée vient d'un import antérieur au modèle
   Visit : il n'existe aucun visitId à cibler, et state.visits en reste le seul
   propriétaire. La suppression passe quand même par la même écriture atomique. */
async function deleteLegacyDay(storeId,day){
 const legacy=(window.state&&window.state.visits||{})[storeId];
 if(!legacy||!Array.isArray(legacy.history)||!legacy.history.some(x=>String(x)===day)){message('Entrée d’historique introuvable.',true);return false}
 const s=storeFor(storeId),label=((s&&s.enseigne)||'Magasin')+((s&&s.ville)?' · '+s.ville:'');
 if(!window.confirm('Supprimer l’entrée d’historique du '+day+' ?\n\n'+label+'\n\nAucune visite détaillée n’est rattachée à ce jour.'))return false;
 return save(next=>{
  const row=next.visits&&next.visits[storeId];if(!row||!Array.isArray(row.history))return;
  row.history=row.history.filter(x=>String(x)!==day);row.history.sort();row.lastVisit=row.history[row.history.length-1]||'';
 },()=>{
  if(typeof window.renderAll==='function')window.renderAll();
  renderQuickMemory();announceDeletion({visitId:'',storeId,completedDate:day});
  message('Entrée d’historique supprimée.');
 },{checkpoint:'Avant suppression d’une entrée d’historique'});
}
function completionText(v){const d=M.reportOf(v),choices=[d.brun.team,d.blanc.team,d.brun.training,d.blanc.training,d.shared.context];return choices.map(x=>String(x||'').trim()).find(Boolean)||'Visite terrain enregistrée'}
async function applyAIEnrichment(visitId,result){
 const key=String(visitId||''),live=domain().visits.find(x=>x.id===key);
 if(!live||live.status!=='completed'||!result||!Array.isArray(result.items)||result.sourceSignature!==M.reportSourceSignature(live))return false;
 return save(s=>{const target=M.getVisit(s,key);if(target.status!=='completed'||M.reportSourceSignature(target)!==result.sourceSignature)return;target.runnerAI={version:1,status:'done',sourceSignature:result.sourceSignature,generatedAt:new Date().toISOString(),items:M.clone(result.items)}},()=>{
  if(activeId===key&&dialog.open){render();message(result.items.length?'Runner a enrichi la mémoire avec l’IA.':'Analyse IA terminée · rien de plus à retenir.')}
  renderQuickMemory();if(typeof window.renderAll==='function')window.renderAll();
  try{document.dispatchEvent(new CustomEvent('store-runner:report-ai-enriched',{detail:{visitId:key,storeId:String(live.storeId),count:result.items.length}}))}catch(e){}
 });
}
function reportFor(visitId,family){const v=domain().visits.find(x=>x.id===String(visitId));return v?M.professionalReportOf(v,family):null}
function announceReport(visitId){try{document.dispatchEvent(new CustomEvent('store-runner:visit-report-updated',{detail:{visitId:String(visitId)}}))}catch(e){}}
async function persistReportJob(visitId,expected,patch){
 let applied=false;const key=String(visitId);
 const ok=await save(s=>{const v=(s.businessV2&&s.businessV2.visits||[]).find(x=>x.id===key);if(v)applied=M.updateReportJob(s,key,expected,patch);return applied},()=>{if(applied)announceReport(key)},{backgroundReport:true,visitId:key});
 return ok&&applied;
}
async function applyReportResult(visitId,expected,validated,reports,memory){
 let applied=false;const key=String(visitId);
 const ok=await save(s=>{const v=(s.businessV2&&s.businessV2.visits||[]).find(x=>x.id===key);if(v)applied=M.applyProfessionalReport(s,key,expected,validated,reports,memory);return applied},()=>{
  if(!applied)return;announceReport(key);renderQuickMemory();if(activeId===key&&dialog.open){render();message('Compte rendu professionnel enregistré · notes originales conservées.')}
  if(typeof window.renderAll==='function')window.renderAll();
 },{backgroundReport:true,visitId:key});return ok&&applied;
}
async function ensureReportIntent(visitId){
 const key=String(visitId);let applied=false;
 const ok=await save(s=>{const v=(s.businessV2&&s.businessV2.visits||[]).find(x=>x.id===key);if(!v||v.status!=='completed'||v.reportJob||!v.runnerAI||v.runnerAI.status!=='pending')return false;M.createReportJob(s,key);applied=true;return true},null,{backgroundReport:true,visitId:key});
 return ok&&applied;
}
async function saveFinalReport(visitId,family,text){
 const key=String(visitId);const ok=await save(s=>{const v=M.getVisit(s,key),types=M.reportTypes(s,v),type=types.includes('cuisiniste')?'cuisiniste':types.includes('buying-groups')?'buying-groups':family;M.editProfessionalReport(s,key,type,text)},()=>announceReport(key));return ok;
}
async function requestReportRegeneration(visitId){
 const key=String(visitId);let reused=false;const ok=await save(s=>{const previous=M.getVisit(s,key).reportJob;const job=M.createReportJob(s,key,true);if(previous===job){reused=true;return false}});
 if(ok||reused){announceReport(key);try{document.dispatchEvent(new CustomEvent('store-runner:visit-report-requested',{detail:{visitId:key}}))}catch(e){}}return ok||reused;
}
async function completeVisit(v){
 const key=String(v&&v.id||'');if(!key||closingVisits.has(key))return false;const live=domain().visits.find(x=>x.id===key);if(!live||live.status==='completed')return !!live;
 closingVisits.add(key);try{
  if(!window.confirm('Terminer cette visite maintenant ?\n\nElle passera dans l’historique et deviendra en lecture seule.')){message('Visite conservée en cours.');return false}
  // Les derniers inputs doivent avoir réellement atteint IndexedDB avant la clôture.
  if(!await save())return false;
  return await save(s=>{const target=M.getVisit(s,key);if(target.status==='completed')return false;if(!String(target.conclusion||'').trim())M.editVisit(s,key,'conclusion',null,completionText(target).slice(0,500));M.complete(s,key,localDay())},()=>{viewStep=3;render();if(typeof window.renderAll==='function')window.renderAll();renderQuickMemory();message('Visite terminée et enregistrée · compte rendu automatique en attente. Tu peux quitter l’application.');announceVisit('completed',v)});
 }finally{closingVisits.delete(key)}
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
  M.preserveReportSource(live);live.status='draft';live.completedAt=null;live.completedDate=null;delete live.runnerMemory;delete live.runnerAI;if(live.reportJob)live.reportJob.obsolete=true;live.updatedAt=new Date().toISOString();normalizeVisitFamily(s,live);
  const otherSameDay=(s.businessV2&&s.businessV2.visits||[]).some(x=>x.id!==live.id&&String(x.storeId)===storeId&&x.status==='completed'&&x.completedDate===day);
  const legacy=s.visits&&s.visits[storeId];
  if(legacy&&Array.isArray(legacy.history)&&!otherSameDay){legacy.history=legacy.history.filter(x=>x!==day);legacy.history.sort();legacy.lastVisit=legacy.history[legacy.history.length-1]||''}
 },()=>{activeId=visitId;previewFamily=activeFamily(current());viewStep=3;render();if(typeof window.renderAll==='function')window.renderAll();renderQuickMemory();message('Visite réouverte · tu peux continuer la saisie.');announceVisit('reopened',v)})
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
function render(){releaseRunner();const v=current();if(!v){hub();return}body.replaceChildren();title.textContent=name(v.storeId)+' · '+(v.status==='draft'?'Visite en cours':'Visite terminée');steps(body,v);if(!isCuisinisteStoreId(v.storeId))familySwitch(body,v);report(body,v)}
function hub(){activeId=null;title.textContent='Visites';body.replaceChildren();const rows=domain().visits.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));if(!rows.length)body.append(element('p','Démarre une visite depuis une fiche magasin, le planning ou la tournée.'));for(const v of rows){const box=element('section',undefined,'sr-item');box.append(element('h3',name(v.storeId)),element('p',v.status==='draft'?'Visite en cours':('Terminée le '+v.completedDate)),button(v.status==='draft'?'Reprendre la visite':'Consulter la visite',()=>{activeId=v.id;previewFamily=activeFamily(v);viewStep=3;render()}));body.append(box)}}
function show(){if(!dialog.open){opener=document.activeElement;dialog.showModal()}}
/* V233 — une visite terminée aujourd'hui est consultée par défaut.
   Aucune annulation de dialogue ne peut désormais tomber dans M.start() et créer un
   doublon silencieux. Pour continuer la saisie, l'utilisateur passe explicitement par
   « Réouvrir cette visite », qui réutilise le même visitId. */
async function start(storeId){
 show();
 const key=String(storeId),draft=domain().visits.find(v=>String(v.storeId)===key&&v.status==='draft');
 if(!draft){
  const recent=sameDayCompleted(key);
  if(recent){
   activeId=recent.id;previewFamily=activeFamily(recent);viewStep=3;render();
   message('Une visite a déjà été terminée aujourd’hui. Consulte-la ou utilise « Réouvrir cette visite » pour continuer la saisie.');
   return recent.id;
  }
 }
 let id;await save(s=>{id=M.start(s,key);const v=M.getVisit(s,id);if(v.status==='draft'&&v.step!==3)M.editVisit(s,id,'step',null,3);normalizeVisitFamily(s,v)},()=>{activeId=id;previewFamily=activeFamily(current());viewStep=3;render()});return id
}
function openVisit(visitId){const v=domain().visits.find(x=>x.id===String(visitId));if(!v)return false;show();activeId=v.id;previewFamily=activeFamily(v);viewStep=3;render();if(v.status==='draft'&&v.activeFamily!==activeFamily(v))save(s=>normalizeVisitFamily(s,M.getVisit(s,v.id)),()=>{previewFamily=activeFamily(current());render()});return true}
function openHub(){show();save(undefined,hub);return true}
async function close(){if(!await save())return;releaseRunner();dialog.close();if(opener&&opener.isConnected)opener.focus();if(typeof window.renderAll==='function')window.renderAll()}
function memoryFor(storeId){const id=String(storeId||''),b=domain();const visits=(b.visits||[]).filter(v=>String(v.storeId)===id&&v.status==='completed').slice().sort((a,b)=>String(b.completedAt||b.completedDate||'').localeCompare(String(a.completedAt||a.completedDate||'')));const actions=(b.actions||[]).filter(a=>String(a.storeId)===id&&!['done','cancelled'].includes(a.status)).slice().sort((a,b)=>String(a.dueDate||'9999-12-31').localeCompare(String(b.dueDate||'9999-12-31'))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));return{visits,actions}}
function isCuisinisteStoreId(storeId){
 const s=storeFor(storeId);if(!s)return false;
 try{if(typeof window.storeChannel==='function')return window.storeChannel(s)==='cuisiniste'}catch(e){}
 return s.channel==='cuisiniste';
}
function ensureMemoryStyle(){if(document.getElementById('sr-store-memory-style'))return;const s=element('style');s.id='sr-store-memory-style';s.textContent='#srStoreMemory{margin:14px 0 4px;padding:14px;border:1px solid #e5e7eb;border-radius:18px;background:#f8fafc}#srStoreMemory .sr-memoryHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:9px}#srStoreMemory h3{margin:0;font-size:15px}#srStoreMemory .sr-memoryMeta{font-size:11px;color:#667085;margin-top:3px}#srStoreMemory .sr-memoryList{display:grid;gap:7px}#srStoreMemory .sr-memoryRow{width:100%;min-height:44px;text-align:left;border:1px solid #dde3ec;border-radius:13px;background:#fff;padding:9px 10px;display:block;color:#1d2939}#srStoreMemory .sr-memoryRow b{display:block;font-size:12px;margin-bottom:2px}#srStoreMemory .sr-memoryRow span{display:block;font-size:11px;line-height:1.35;color:#667085;white-space:normal}#srStoreMemory .sr-memoryActions{margin-top:12px;padding-top:10px;border-top:1px solid #e5e7eb}#srStoreMemory .sr-memoryToggle{width:100%;min-height:44px;margin-top:8px;border:0;border-radius:12px;background:#eef4ff;color:#1456c4;font-weight:800}';document.head.appendChild(s)}
function ensureMemoryHost(){const sheet=document.getElementById('storeQuickSheet');if(!sheet)return null;let host=document.getElementById('srStoreMemory');if(host)return host;host=element('section');host.id='srStoreMemory';host.setAttribute('aria-label','Mémoire terrain du magasin');const bottom=sheet.querySelector('.sheetBottom');if(bottom)sheet.insertBefore(host,bottom);else sheet.appendChild(host);return host}
function actionLabel(a){return (a.status==='in_progress'?'En cours':'À faire')+(a.dueDate?' · '+a.dueDate:'')+(a.owner?' · '+a.owner:'')}
function renderQuickMemory(){const sheet=document.getElementById('storeQuickSheet');if(!sheet||!sheet.classList.contains('open'))return;const startButton=document.getElementById('srQuickStart'),storeId=String(startButton&&startButton.dataset?(startButton.dataset.srStart||''):'');if(!storeId)return;refreshStartCtas(storeId);ensureMemoryStyle();const host=ensureMemoryHost();if(!host)return;if(isCuisinisteStoreId(storeId)){host.hidden=true;host.replaceChildren();expandedMemoryStore='';return}host.hidden=false;const data=memoryFor(storeId),expanded=expandedMemoryStore===storeId,shown=expanded?data.visits:data.visits.slice(0,3);host.replaceChildren();const head=element('div',undefined,'sr-memoryHead'),headText=element('div');headText.append(element('h3','Mémoire terrain'),element('div',data.visits.length+' visite'+(data.visits.length>1?'s':'')+' enregistrée'+(data.visits.length>1?'s':'')+' · '+data.actions.length+' action'+(data.actions.length>1?'s':'')+' en cours','sr-memoryMeta'));head.append(headText);host.append(head);runnerMemory(host,storeId,{limit:12});const list=element('div',undefined,'sr-memoryList');list.id='srStoreHistoryList';if(!shown.length)list.append(element('div','Aucune visite terminée pour ce magasin.','sr-memoryMeta'));for(const v of shown){const row=button('',()=>{if(typeof window.closeStoreQuick==='function')window.closeStoreQuick();openVisit(v.id)},'sr-memoryRow');row.dataset.srHistoryVisit=v.id;row.append(element('b',v.completedDate||'Visite terminée'),element('span',v.conclusion||'Visite terrain'));list.append(row)}host.append(list);if(data.visits.length>3){const toggle=button(expanded?'Réduire l’historique':'Voir tout l’historique ('+data.visits.length+')',()=>{expandedMemoryStore=expanded?'':storeId;renderQuickMemory()},'sr-memoryToggle');toggle.dataset.srHistoryToggle='1';host.append(toggle)}if(data.actions.length){const wrap=element('div',undefined,'sr-memoryActions');wrap.append(element('h3','Actions en cours'));const actionList=element('div',undefined,'sr-memoryList');for(const a of data.actions.slice(0,3)){const row=button('',()=>{if(typeof window.closeStoreQuick==='function')window.closeStoreQuick();openVisit(a.visitId)},'sr-memoryRow');row.dataset.srOpenAction=a.id;row.append(element('b',a.description||'Action'),element('span',actionLabel(a)));actionList.append(row)}wrap.append(actionList);host.append(wrap)}}
function installQuickMemory(){const sheet=document.getElementById('storeQuickSheet');if(!sheet||quickMemoryObserver)return;ensureMemoryStyle();ensureMemoryHost();quickMemoryObserver=new MutationObserver(renderQuickMemory);quickMemoryObserver.observe(sheet,{attributes:true,attributeFilter:['class','aria-hidden']});document.addEventListener('store-runner:data-restored',renderQuickMemory);document.addEventListener('store-runner:planning-updated',renderQuickMemory)}
function installStoreDialogCta(){const storeDialog=document.getElementById('storeDlg');if(!storeDialog||storeDialogObserver)return;storeDialogObserver=new MutationObserver(()=>{if(storeDialog.open)refreshStartCtas(window.currentEditId)});storeDialogObserver.observe(storeDialog,{attributes:true,attributeFilter:['open']})}
function boot(){if(document.getElementById('srVisitDialog'))return;dialog=element('dialog');dialog.id='srVisitDialog';dialog.className='sr-visit';dialog.setAttribute('aria-labelledby','srVisitTitle');const header=element('div',undefined,'sr-head');title=element('h2','Visites');title.id='srVisitTitle';header.append(title,button('Fermer',close));status=element('p',undefined,'sr-status');status.setAttribute('role','status');body=element('div');dialog.append(header,status,button('Réessayer l’enregistrement',()=>save()),body);document.body.append(dialog);session=window.StoreRunnerVisitStore.create({model:M,reliability:window.ChefReliability,db:window.__chefStorage||window.storage||window.localStorage,getState:()=>window.state,setState:s=>{window.state=s},onStatus:(phase,error,intent)=>{if(intent&&intent.backgroundReport&&phase!=='error')return;if(phase==='saving')message('Enregistrement…');else if(phase==='error')message('Non enregistré : '+error,true);else message(window.__chefStorageMode==='memory'?'Stockage temporaire : exporte tes données avant de fermer.':'Enregistré localement · '+new Date().toLocaleTimeString('fr-FR'),window.__chefStorageMode==='memory')}});window.StoreRunnerVisits={start,openVisit,openHub,memoryFor,renderQuickMemory,refreshStartCtas,deleteVisit,deleteHistoryEntry,reportFor,saveFinalReport,requestReportRegeneration,persistReportJob,applyReportResult,ensureReportIntent,flush:()=>save(),activeVisitId:()=>activeId};installQuickMemory();installStoreDialogCta();dialog.addEventListener('cancel',e=>{e.preventDefault();close()});document.addEventListener('click',e=>{const b=e.target.closest('[data-sr-start],[data-sr-current],[data-sr-terrain],[data-sr-hub]');if(!b)return;e.preventDefault();e.stopPropagation();if(b.hasAttribute('data-sr-hub'))openHub();else if(b.hasAttribute('data-sr-current')){if(window.currentEditId)start(window.currentEditId)}else if(b.hasAttribute('data-sr-terrain')){const t=window.terrainCurrent();if(t)start(t.store.id);else{show();hub();message('Aucune visite de tournée en attente.')}}else start(b.dataset.srStart)},true);document.addEventListener('store-runner:data-restored',()=>{session.invalidate();if(dialog.open){hub();message('Sauvegarde restaurée.')}});document.addEventListener('store-runner:report-ai-enrichment-ready',async e=>{const d=e&&e.detail||{};let ok=false;try{ok=await applyAIEnrichment(d.visitId,d.result)}catch(err){ok=false}try{if(typeof d.respond==='function')d.respond(!!ok)}catch(err){}});window.addEventListener('beforeunload',e=>{if(session.hasPending()){e.preventDefault();e.returnValue=''}});document.addEventListener('visibilitychange',()=>{if(document.hidden)save()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
