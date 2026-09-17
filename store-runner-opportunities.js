/* Store Runner V200 — opportunités commerciales magasin, locales et persistées. */
(function(root){
'use strict';
const CATEGORIES={
  pdl:'Gain PDL',
  massification:'Massification',
  extra_visibility:'Extra-visibilité',
  training:'Formation',
  theatricalization:'Théâtralisation',
  planogram:'Planogramme',
  exposure_contract:'Contrat d’exposition'
};
const STATUSES={open:'Ouverte',in_progress:'En cours',won:'Concrétisée',lost:'Non retenue'};
const OPEN_STATUSES=new Set(['open','in_progress']);
let dialog=null,activeStoreId='',activeVisitId='',editingId='',queue=Promise.resolve(),quickObserver=null,visitObserver=null;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>String(x==null?'':x).trim();
function dateValid(x){if(!x)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(String(x)))return false;const d=new Date(String(x)+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===String(x)}
function now(){return new Date().toISOString()}
function uid(){try{if(root.crypto&&typeof root.crypto.randomUUID==='function')return 'opp-'+root.crypto.randomUUID()}catch(e){}return 'opp-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}
function domain(state){return state&&object(state.businessV2)?state.businessV2:null}
function rows(state){const b=domain(state);return b&&Array.isArray(b.opportunities)?b.opportunities:[]}
function storeExists(state,storeId){const id=String(storeId);if((state.stores||[]).some(s=>String(s.id)===id))return true;const b=domain(state);return !!(b&&b.storeSnapshots&&b.storeSnapshots[id])}
function visitFor(state,visitId){const b=domain(state);return b&&Array.isArray(b.visits)?b.visits.find(v=>String(v.id)===String(visitId)):null}
function ensure(state){
  if(!object(state.businessV2)){
    if(root.StoreRunnerVisitModel&&typeof root.StoreRunnerVisitModel.data==='function')root.StoreRunnerVisitModel.data(state);
    else state.businessV2={version:2,revision:0,storeSnapshots:{},visits:[],actions:[]};
  }
  if(!Array.isArray(state.businessV2.opportunities))state.businessV2.opportunities=[];
  return state.businessV2.opportunities;
}
function validateOpportunity(row,state){
  if(!object(row)||typeof row.id!=='string'||!row.id||!storeExists(state,row.storeId))throw Error('Opportunité invalide ou magasin inconnu.');
  for(const key of ['storeId','category','description','owner','dueDate','status','createdAt','updatedAt'])if(typeof row[key]!=='string')throw Error('Champ opportunité invalide : '+key);
  if(!Object.hasOwn(CATEGORIES,row.category))throw Error('Catégorie d’opportunité invalide.');
  if(!Object.hasOwn(STATUSES,row.status))throw Error('Statut d’opportunité invalide.');
  if(!row.description.trim())throw Error('Décris l’opportunité.');
  if(row.dueDate&&!dateValid(row.dueDate))throw Error('Échéance d’opportunité invalide.');
  if(!Number.isFinite(Date.parse(row.createdAt))||!Number.isFinite(Date.parse(row.updatedAt)))throw Error('Horodatage d’opportunité invalide.');
  if(row.visitId!==null&&row.visitId!==undefined){const v=visitFor(state,row.visitId);if(!v||String(v.storeId)!==String(row.storeId))throw Error('Visite source de l’opportunité incohérente.');}
  if(OPEN_STATUSES.has(row.status)){if(row.closedAt!==null)throw Error('Clôture d’opportunité incohérente.')}else if(!Number.isFinite(Date.parse(row.closedAt)))throw Error('Date de clôture d’opportunité invalide.');
  return row;
}
function validate(state){const ids=new Set();for(const row of rows(state)){validateOpportunity(row,state);if(ids.has(row.id))throw Error('Opportunité dupliquée.');ids.add(row.id)}return state}
function createOpportunity(state,input,opts){
  input=input||{};opts=opts||{};const storeId=String(input.storeId||''),visitId=input.visitId?String(input.visitId):null;
  if(!storeExists(state,storeId))throw Error('Magasin introuvable.');
  if(visitId){const v=visitFor(state,visitId);if(!v||String(v.storeId)!==storeId)throw Error('Visite source incohérente.');}
  const category=String(input.category||''),description=text(input.description),owner=text(input.owner),dueDate=text(input.dueDate);
  if(!Object.hasOwn(CATEGORIES,category))throw Error('Choisis une catégorie.');if(!description)throw Error('Décris l’opportunité.');if(dueDate&&!dateValid(dueDate))throw Error('Échéance invalide.');
  const stamp=String(opts.now||now()),id=String(opts.id||uid());
  const row={id,storeId,visitId,source:visitId?'visit':'store',category,description,owner,dueDate,status:'open',closedAt:null,createdAt:stamp,updatedAt:stamp};
  const list=ensure(state);if(list.some(x=>x.id===id))throw Error('Identifiant opportunité déjà utilisé.');list.push(row);return row;
}
function updateOpportunity(state,id,patch,opts){
  patch=patch||{};opts=opts||{};const row=ensure(state).find(x=>x.id===String(id));if(!row)throw Error('Opportunité introuvable.');
  if(patch.category!==undefined){const v=String(patch.category);if(!Object.hasOwn(CATEGORIES,v))throw Error('Catégorie invalide.');row.category=v}
  if(patch.description!==undefined){const v=text(patch.description);if(!v)throw Error('Décris l’opportunité.');row.description=v}
  if(patch.owner!==undefined)row.owner=text(patch.owner);
  if(patch.dueDate!==undefined){const v=text(patch.dueDate);if(v&&!dateValid(v))throw Error('Échéance invalide.');row.dueDate=v}
  if(patch.status!==undefined){const v=String(patch.status);if(!Object.hasOwn(STATUSES,v))throw Error('Statut invalide.');row.status=v;row.closedAt=OPEN_STATUSES.has(v)?null:String(opts.now||now())}
  row.updatedAt=String(opts.now||now());validateOpportunity(row,state);return row;
}
function list(state,filter){filter=filter||{};let out=rows(state).slice();if(filter.storeId!==undefined)out=out.filter(x=>String(x.storeId)===String(filter.storeId));if(filter.visitId!==undefined)out=out.filter(x=>String(x.visitId||'')===String(filter.visitId||''));if(filter.openOnly)out=out.filter(x=>OPEN_STATUSES.has(x.status));return out.sort((a,b)=>{const ao=OPEN_STATUSES.has(a.status)?0:1,bo=OPEN_STATUSES.has(b.status)?0:1;return ao-bo||String(a.dueDate||'9999-12-31').localeCompare(String(b.dueDate||'9999-12-31'))||String(b.updatedAt).localeCompare(String(a.updatedAt))})}
function storeName(state,storeId){const id=String(storeId),live=(state.stores||[]).find(s=>String(s.id)===id),snap=domain(state)&&domain(state).storeSnapshots&&domain(state).storeSnapshots[id],s=live||snap;return s?[s.enseigne,s.ville].filter(Boolean).join(' · '):'Magasin'}
function persist(reason,mutator){
  const run=queue.then(async()=>{
    const R=root.ChefReliability,M=root.StoreRunnerVisitModel,db=root.__chefStorage||root.localStorage;if(!R||!M)throw Error('Stockage métier indisponible.');
    const next=M.clone(root.state);ensure(next);if(typeof mutator==='function')mutator(next);next.businessV2.revision=(Number(next.businessV2.revision)||0)+1;validate(next);R.validateState(next);
    R.checkpoint('Avant modification opportunité : '+reason,db);
    R.save(next,db);if(db&&typeof db.flush==='function')await db.flush();root.state=next;
    try{root.document.dispatchEvent(new root.CustomEvent('store-runner:opportunities-updated',{detail:{reason}}))}catch(e){}
    return next;
  });queue=run.catch(()=>{});return run;
}
function el(tag,txt,cls){const n=root.document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n}
function btn(txt,fn,cls){const b=el('button',txt,cls||'secondary');b.type='button';b.addEventListener('click',fn);return b}
function ensureStyle(){if(!root.document||root.document.getElementById('sr-opportunity-style'))return;const s=el('style');s.id='sr-opportunity-style';s.textContent=`
#srOpportunityDialog{box-sizing:border-box;width:min(700px,calc(100vw - 18px));max-width:calc(100vw - 18px);max-height:90dvh;border:0;border-radius:24px;padding:0;overflow:hidden}#srOpportunityDialog::backdrop{background:rgba(15,23,42,.34);backdrop-filter:blur(4px)}.sr-oppHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:16px 16px 10px;background:#fff;position:sticky;top:0;z-index:2}.sr-oppHead h2{margin:0;font-size:20px}.sr-oppHead p{margin:3px 0 0;color:#667085;font-size:11px}.sr-oppClose{min-width:44px;min-height:44px;border:0;border-radius:14px;background:#f1f3f6;font-size:20px}.sr-oppBody{padding:4px 16px 18px;overflow:auto;max-height:calc(90dvh - 72px)}.sr-oppForm{display:grid;gap:8px;padding:12px;border:1px solid #dfe5ef;border-radius:16px;background:#f8fafc;margin-bottom:12px}.sr-oppForm label{display:grid;gap:4px;font-size:11px;font-weight:750;color:#475467}.sr-oppForm input,.sr-oppForm select,.sr-oppForm textarea{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;padding:9px;font:inherit;color:#101828}.sr-oppForm textarea{min-height:76px;resize:vertical}.sr-oppFormActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sr-oppFormActions button{min-height:44px}.sr-oppList{display:grid;gap:8px}.sr-oppCard{border:1px solid #e4e7ec;border-radius:15px;padding:11px;background:#fff}.sr-oppCardTop{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}.sr-oppCard b{font-size:12px}.sr-oppBadge{white-space:nowrap;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800;background:#eef4ff;color:#1456c4}.sr-oppBadge.won{background:#ecfdf3;color:#027a48}.sr-oppBadge.lost{background:#f2f4f7;color:#667085}.sr-oppCard p{font-size:12px;line-height:1.4;margin:7px 0;color:#344054}.sr-oppMeta{font-size:10.5px;color:#667085}.sr-oppCardActions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.sr-oppCardActions button,.sr-oppCardActions select{min-height:42px}.sr-oppEmpty{padding:18px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d0d5dd;border-radius:14px}.sr-oppQuick{min-height:44px}.sr-oppVisitBtn{min-height:40px;border:1px solid #dfe5ef;border-radius:12px;background:#fff;font-weight:800;padding:0 10px}@media(max-width:520px){.sr-oppFormActions,.sr-oppCardActions{grid-template-columns:1fr}.sr-oppCardTop{align-items:flex-start}}
`;root.document.head.appendChild(s)}
function ensureDialog(){if(dialog)return dialog;ensureStyle();dialog=el('dialog');dialog.id='srOpportunityDialog';dialog.innerHTML='<div class="sr-oppHead"><div><h2>Opportunités</h2><p id="srOppSubtitle"></p></div><button type="button" class="sr-oppClose" aria-label="Fermer">×</button></div><div class="sr-oppBody"><div id="srOppForm"></div><div id="srOppList" class="sr-oppList"></div></div>';root.document.body.appendChild(dialog);dialog.querySelector('.sr-oppClose').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close()});return dialog}
function categoryOptions(selected){return Object.entries(CATEGORIES).map(([k,v])=>'<option value="'+k+'"'+(k===selected?' selected':'')+'>'+v+'</option>').join('')}
function statusOptions(selected){return Object.entries(STATUSES).map(([k,v])=>'<option value="'+k+'"'+(k===selected?' selected':'')+'>'+v+'</option>').join('')}
function renderForm(){const host=ensureDialog().querySelector('#srOppForm');host.replaceChildren();if(!activeStoreId)return;const existing=editingId?rows(root.state).find(x=>x.id===editingId):null,form=el('form',undefined,'sr-oppForm');form.innerHTML='<label>Catégorie<select name="category">'+categoryOptions(existing?existing.category:'pdl')+'</select></label><label>Opportunité<textarea name="description" placeholder="Ex. gagner 2 facings sur le mural TV"></textarea></label><label>Responsable · facultatif<input name="owner" type="text" placeholder="Ex. moi / chef de rayon"></label><label>Échéance · facultatif<input name="dueDate" type="date"></label>'+(existing?'<label>Statut<select name="status">'+statusOptions(existing.status)+'</select></label>':'')+'<div class="sr-oppFormActions"><button type="submit" class="primary">'+(existing?'Enregistrer':'Ajouter l’opportunité')+'</button><button type="button" data-cancel class="secondary">Annuler</button></div>';
 if(existing){form.elements.description.value=existing.description;form.elements.owner.value=existing.owner;form.elements.dueDate.value=existing.dueDate}
 form.querySelector('[data-cancel]').onclick=()=>{editingId='';renderDialog()};form.addEventListener('submit',async e=>{e.preventDefault();const data={category:form.elements.category.value,description:form.elements.description.value,owner:form.elements.owner.value,dueDate:form.elements.dueDate.value};try{if(existing){data.status=form.elements.status.value;await persist('mise à jour',s=>updateOpportunity(s,existing.id,data))}else await persist('création',s=>createOpportunity(s,Object.assign(data,{storeId:activeStoreId,visitId:activeVisitId||null})));editingId='';renderDialog();refreshButtons()}catch(err){root.alert&&root.alert('Opportunité non enregistrée : '+(err.message||String(err)))}});host.append(form)}
function renderList(){const host=ensureDialog().querySelector('#srOppList');host.replaceChildren();const listRows=list(root.state,activeStoreId?{storeId:activeStoreId}:{openOnly:true});if(!listRows.length){host.append(el('div',activeStoreId?'Aucune opportunité pour ce magasin.':'Aucune opportunité ouverte sur le secteur.','sr-oppEmpty'));return}
 for(const row of listRows){const card=el('section',undefined,'sr-oppCard'),top=el('div',undefined,'sr-oppCardTop'),left=el('div');left.append(el('b',CATEGORIES[row.category]||row.category));if(!activeStoreId)left.append(el('div',storeName(root.state,row.storeId),'sr-oppMeta'));const badge=el('span',STATUSES[row.status]||row.status,'sr-oppBadge '+row.status);top.append(left,badge);card.append(top,el('p',row.description));const meta=[row.owner?'Resp. '+row.owner:'',row.dueDate?'Échéance '+row.dueDate:'',row.visitId?'Issue d’une visite':'Créée depuis la fiche'].filter(Boolean).join(' · ');if(meta)card.append(el('div',meta,'sr-oppMeta'));const actions=el('div',undefined,'sr-oppCardActions'),edit=btn('Modifier',()=>{activeStoreId=String(row.storeId);activeVisitId=row.visitId?String(row.visitId):'';editingId=row.id;renderDialog()},'secondary'),status=el('select');status.innerHTML=statusOptions(row.status);status.setAttribute('aria-label','Statut de '+row.description);status.addEventListener('change',async()=>{try{await persist('changement de statut',s=>updateOpportunity(s,row.id,{status:status.value}));renderDialog();refreshButtons()}catch(err){root.alert&&root.alert(err.message||String(err))}});actions.append(edit,status);card.append(actions);host.append(card)}}
function renderDialog(){const d=ensureDialog();d.querySelector('#srOppSubtitle').textContent=activeStoreId?storeName(root.state,activeStoreId)+(activeVisitId?' · liée à la visite en cours':''):'Toutes les opportunités ouvertes du secteur';renderForm();renderList()}
function open(storeId,visitId){activeStoreId=storeId==null?'':String(storeId);activeVisitId=visitId==null?'':String(visitId);editingId='';renderDialog();if(!dialog.open)dialog.showModal();return true}
function quickStoreId(){const b=root.document&&root.document.getElementById('srQuickStart');return b&&b.dataset?String(b.dataset.srStart||''):''}
function activeVisit(){try{const id=root.StoreRunnerVisits&&root.StoreRunnerVisits.activeVisitId&&root.StoreRunnerVisits.activeVisitId();if(!id)return null;const b=domain(root.state),v=b&&b.visits&&b.visits.find(x=>String(x.id)===String(id));return v||null}catch(e){return null}}
function refreshQuickButton(){if(!root.document)return;const actions=root.document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;let b=root.document.getElementById('srOpportunityQuickBtn');if(!b){b=btn('💼 Opportunités',()=>{const id=quickStoreId();if(id)open(id,'')},'secondary sr-oppQuick');b.id='srOpportunityQuickBtn';actions.appendChild(b)}const id=quickStoreId(),count=id?list(root.state,{storeId:id,openOnly:true}).length:0,label='💼 Opportunités'+(count?' · '+count:'');if(b.textContent!==label)b.textContent=label;return true}
function refreshVisitButton(){if(!root.document)return false;const head=root.document.querySelector('#srVisitDialog .sr-head');if(!head)return false;let b=root.document.getElementById('srOpportunityVisitBtn');if(!b){b=btn('💼 Opportunités',()=>{const v=activeVisit();open(v?v.storeId:'',v?v.id:'')},'sr-oppVisitBtn');b.id='srOpportunityVisitBtn';const close=[...head.querySelectorAll('button')].find(x=>/fermer/i.test(x.textContent||''));if(close)head.insertBefore(b,close);else head.appendChild(b)}const v=activeVisit(),count=v?list(root.state,{storeId:v.storeId,openOnly:true}).length:list(root.state,{openOnly:true}).length,label='💼 Opportunités'+(count?' · '+count:''),title=v&&count?count+' opportunité'+(count>1?'s':'')+' ouverte'+(count>1?'s':'')+' à revoir pendant cette visite':'Voir les opportunités';if(b.textContent!==label)b.textContent=label;if(b.title!==title)b.title=title;return true}
function refreshButtons(){refreshQuickButton();refreshVisitButton()}
function install(){if(!root.document)return;ensureStyle();ensureDialog();refreshButtons();const sheet=root.document.getElementById('storeQuickSheet');if(sheet&&root.MutationObserver&&!quickObserver){quickObserver=new root.MutationObserver(refreshQuickButton);quickObserver.observe(sheet,{attributes:true,attributeFilter:['class','aria-hidden']})}const visit=root.document.getElementById('srVisitDialog');if(visit&&root.MutationObserver&&!visitObserver){visitObserver=new root.MutationObserver(refreshVisitButton);visitObserver.observe(visit,{attributes:true,attributeFilter:['open'],childList:true,subtree:true})}root.document.addEventListener('store-runner:data-restored',refreshButtons);root.document.addEventListener('store-runner:planning-updated',refreshButtons);root.document.addEventListener('store-runner:opportunities-updated',refreshButtons)}
const api={CATEGORIES,STATUSES,OPEN_STATUSES,dateValid,rows,ensure,validate,createOpportunity,updateOpportunity,list,storeName,open,refreshButtons};
root.StoreRunnerOpportunities=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install()}
})(typeof window!=='undefined'?window:globalThis);
