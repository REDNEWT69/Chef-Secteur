/* Store Runner V1 — « Sortie magasin » : assemble les données déjà saisies pendant la
   visite dans le squelette attendu par le responsable, et le met dans le presse-papier.
   Aucune rédaction automatique, aucun appel réseau : tout fonctionne sur le parking. */
(function(root){
'use strict';

const SHEET_ID='srReportSheet';
const VISIT_BTN_ID='srReportBtn';
const QUICK_BTN_ID='srReportQuickBtn';
const PLACEHOLDER='[Non renseigné par le FMT]';
const STATUS_LABEL={ok:'OK',correct:'À corriger',opportunity:'Opportunité'};

/* Le squelette dépend du type d'enseigne, pas de la famille produit. */
const FAMILY_OF_BRAND={
  'grands-magasins':['boulanger','darty','fnac','conforama','but'],
  'cuisinistes':['schmidt','cuisinella'],
  'buying-groups':['gitem','pro&cie','pro et cie','procie','pro cie']
};
const MERGED={cuisinistes:1,'buying-groups':1};

function norm(v){return String(v==null?'':v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim()}
function skeletonFor(enseigne){
  const n=norm(enseigne);
  for(const key of Object.keys(FAMILY_OF_BRAND))if(FAMILY_OF_BRAND[key].indexOf(n)>=0)return key;
  return 'grands-magasins';
}
/* Le modèle est chargé avant ce fichier dans le navigateur ; en Node on le résout à la
   demande, pour que build() reste testable sans DOM ni global implicite. */
function model(){
  if(root.StoreRunnerVisitModel)return root.StoreRunnerVisitModel;
  try{if(typeof module!=='undefined'&&module.exports&&typeof require==='function')return require('./store-runner-visit-model.js')}catch(e){}
  return null;
}
function text(v){return String(v==null?'':v).trim()}
function orPlaceholder(v){return text(v)||PLACEHOLDER}

/* Une ligne étiquetée 'both' ou non étiquetée ('') appartient aux deux comptes rendus :
   mieux vaut une information en trop qu'une information perdue. */
function keeper(families){
  if(families.length>1)return()=>true;
  const target=families[0];
  return f=>{const x=text(f);return !x||x==='both'||x===target};
}

function sixPRows(M,v,keep){
  const out=[];
  for(const p of Object.keys(M.SIX_P)){
    const section=M.SIX_P[p],rows=(v.sixP&&v.sixP[p])||[];
    rows.forEach((row,i)=>{if(keep(row.family))out.push({label:section.label,item:section.items[i]||('Ligne '+(i+1)),row})});
  }
  return out;
}
function suffix(comment){const c=text(comment);return c?' : '+c:''}

function blockers(M,state,v,keep){
  const lines=[];
  for(const a of (v.arrival&&v.arrival.anomalies)||[])if(keep(a.family)&&text(a.text))lines.push('- '+text(a.text));
  for(const e of sixPRows(M,v,keep))
    if(e.row.status==='correct'||e.row.status==='opportunity')lines.push('- '+e.label+' · '+e.item+suffix(e.row.comment));
  const actions=((state.businessV2&&state.businessV2.actions)||[]).filter(a=>a.visitId===v.id&&['done','cancelled'].indexOf(a.status)<0);
  for(const a of actions)
    lines.push('- À suivre : '+text(a.description)+' · '+(text(a.owner)||'responsable à définir')+' · '+(text(a.dueDate)||'sans échéance'));
  return lines.length?lines.join('\n'):PLACEHOLDER;
}
function notes6p(M,v,keep){
  const lines=[];
  for(const e of sixPRows(M,v,keep)){
    if(!text(e.row.status)&&!text(e.row.comment))continue;
    lines.push('- '+e.label+' · '+e.item+' · '+(STATUS_LABEL[e.row.status]||'Non évalué')+suffix(e.row.comment));
  }
  return lines.join('\n');
}
function photoLine(photos,families){
  const keep=keeper(families),rows=(photos||[]).filter(r=>keep(r&&r.family));
  const before=rows.filter(r=>r&&r.moment==='avant').length,after=rows.filter(r=>r&&r.moment==='apres').length;
  if(!before&&!after)return '> **Photos :** '+PLACEHOLDER;
  return '> **Photos :** '+before+' avant / '+after+' après jointes à ce message.';
}
/* Sur un cuisiniste ou un buying group il n'y a qu'un seul compte rendu : les deux blocs
   non vides sont concaténés, blanc puis brun. */
function merge(report,key,families){
  const parts=families.map(f=>text(report[f]&&report[f][key])).filter(Boolean);
  return parts.length?parts.join('\n\n'):PLACEHOLDER;
}
function tidy(body){
  return body.split('\n').map(l=>l.replace(/[ \t]+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n').replace(/\s+$/,'')+'\n';
}
function visitDate(v){return text(v.completedDate)||text(v.createdAt).slice(0,10)}
function storeOf(state,v){
  const b=state.businessV2||{};
  return (b.storeSnapshots&&b.storeSnapshots[v.storeId])||(state.stores||[]).find(s=>String(s.id)===String(v.storeId))||{};
}

function build(state,visitId,family,photos){
  const M=model();
  if(!M)throw new Error('Modèle de visite indisponible.');
  const b=(state&&state.businessV2)||{};
  const v=(b.visits||[]).find(x=>x.id===visitId);
  if(!v)throw new Error('Visite introuvable.');
  const store=storeOf(state,v),skeleton=skeletonFor(store.enseigne),report=M.reportOf(v);
  const families=MERGED[skeleton]?['blanc','brun']:[M.FAMILIES.indexOf(family)>=0?family:'brun'];
  const keep=keeper(families),notes=notes6p(M,v,keep);
  const head='**Magasin :** '+text(store.enseigne)+' '+text(store.ville)+' — '+visitDate(v);
  const F=key=>MERGED[skeleton]?merge(report,key,families):orPlaceholder(report[families[0]][key]);
  const context=orPlaceholder(report.shared&&report.shared.context);
  const blocs=blockers(M,state,v,keep);
  let out;
  if(skeleton==='cuisinistes'){
    out='# COMPTE RENDU DE VISITE — CUISINISTE\n'+head+'\n\n'
      +'### 1. Suivi Magasin\n'+context+'\n\n'
      +'**Équipe rencontrée**\n'+F('team')+'\n\n'
      +'### 2. Point Produits & Concurrence\n'+F('massification')+'\n\n'
      +'### 3. Formation (Classroom)\n'+F('training')+'\n\n'
      +"### 4. Contrats d'Exposition\n"+F('actions')+'\n\n'
      +'### 5. SAV / ADV\n'+F('omni')+'\n\n'
      +"### 6. Plan d'Action\n"+blocs+'\n';
  }else if(skeleton==='buying-groups'){
    out='# COMPTE RENDU DE VISITE — BUYING GROUP\n'+head+'\n\n'
      +'### 1. Suivi Magasin & Profil\n'+context+'\n\n'
      +'**Équipe rencontrée**\n'+F('team')+'\n\n'
      +'### 2. Point Produits & Concurrence\n'+F('massification')+'\n\n'
      +'### 3. Formation & Newsletter\n'+F('training')+'\n\n'
      +'### 4. Écosystème SAV & Technique\n'+F('omni')+'\n\n'
      +'### 5. Contexte Marché\n'+F('actions')+'\n\n'
      +"### 6. Plan d'Action\n"+blocs+'\n';
  }else{
    const FAM=families[0].toUpperCase();
    out='# COMPTE RENDU DE VISITE\n'+head+' — Famille '+FAM+'\n\n'
      +'### 1. Contexte Magasin\n'+context+'\n\n'
      +'**Équipe rencontrée**\n'+F('team')+'\n\n'
      +'### 2. Actions Réalisées\n'+F('actions')+'\n\n'
      +photoLine(photos,families)+'\n\n'
      +'### 3. Massifications\n'+F('massification')+'\n\n'
      +'### 4. Suivi OMNI\n'+F('omni')+'\n\n'
      +'### 5. Points de blocage / À suivre\n'+blocs+'\n\n'
      +'### 6. Prochaine étape\n'+F('training')+'\n';
    if(notes)out+='\n---\n**Notes 6P — famille '+FAM+'**\n'+notes+'\n';
    return tidy(out);
  }
  if(notes)out+='\n---\n**Notes 6P**\n'+notes+'\n';
  return tidy(out);
}

/* ---------- Interface : #srReportSheet appartient à ce module et à lui seul ---------- */
let sheet=null,activeVisit='',activeTab='blanc';

function el(tag,txt,cls){const n=root.document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n}
function btn(txt,fn,cls){const b=el('button',txt,cls||'sr-reportBtn');b.type='button';b.addEventListener('click',fn);return b}
function state(){return root.state||{}}
function visitById(id){return (((state().businessV2||{}).visits)||[]).find(v=>v.id===id)||null}
function draftFor(storeId){
  const rows=((state().businessV2||{}).visits)||[];
  return rows.filter(v=>String(v.storeId)===String(storeId)&&v.status==='draft')
             .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null;
}
function say(msg,error){const box=sheet&&sheet.querySelector('#srReportStatus');if(box){box.textContent=msg||'';box.classList.toggle('sr-reportError',!!error)}}

function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-report-style'))return;
  const s=el('style');s.id='sr-report-style';
  s.textContent='#'+SHEET_ID+'{box-sizing:border-box;width:min(720px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;padding:16px;border-radius:24px;border:1px solid #d9dce3;background:#fff;color:#1d1d1f}'
    +'#'+SHEET_ID+'::backdrop{background:rgba(17,24,39,.45)}'
    +'.sr-reportHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}'
    +'.sr-reportHead h2{margin:0;font-size:20px}.sr-reportHead p{margin:4px 0 0;color:#667085;font-size:12px}'
    +'.sr-reportTabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 8px}'
    +'.sr-reportTab{min-height:44px;border:1px solid #d3d9e3;border-radius:13px;background:#f4f6fa;color:#454b56;font-weight:800;font-size:12px}'
    +'.sr-reportTab[aria-selected=true]{background:#1428a0;border-color:#1428a0;color:#fff}'
    +'#srReportText{width:100%;box-sizing:border-box;min-height:300px;border:1px solid #d9dee8;border-radius:14px;padding:10px;font:400 12px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.45;background:#fbfcff;color:#1d1d1f;-webkit-text-fill-color:#1d1d1f;resize:vertical}'
    +'.sr-reportStatus{min-height:18px;font-size:12px;color:#315b9d;margin:8px 0}.sr-reportStatus.sr-reportError{color:#b42318}'
    +'.sr-reportActions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px}.sr-reportBtn{min-height:48px;border-radius:14px;font-weight:800}'
    +'.sr-reportCopy{background:#1428a0;color:#fff;border:0}.sr-reportClose{background:#eef0f4;color:#1d1d1f;border:0}'
    +'#'+VISIT_BTN_ID+',#'+QUICK_BTN_ID+'{min-height:44px}';
  root.document.head.appendChild(s);
}
function ensureSheet(){
  if(sheet)return sheet;
  if(!root.document)return null;
  ensureStyle();
  sheet=el('dialog');sheet.id=SHEET_ID;sheet.setAttribute('aria-labelledby','srReportTitle');
  sheet.innerHTML='<div class="sr-reportHead"><div><h2 id="srReportTitle">Sortie magasin</h2>'
    +'<p id="srReportSubtitle"></p></div></div>'
    +'<div id="srReportTabs" class="sr-reportTabs"></div>'
    +'<textarea id="srReportText" rows="18" readonly aria-label="Compte rendu à copier"></textarea>'
    +'<p id="srReportStatus" class="sr-reportStatus" role="status"></p>'
    +'<div class="sr-reportActions"></div>';
  const actions=sheet.querySelector('.sr-reportActions');
  actions.append(btn('Copier le compte rendu',copy,'sr-reportBtn sr-reportCopy'),btn('Fermer',close,'sr-reportBtn sr-reportClose'));
  sheet.addEventListener('cancel',e=>{e.preventDefault();close()});
  root.document.body.appendChild(sheet);
  return sheet;
}
async function photosFor(storeId,family){
  const api=root.StorePhotosV1;
  if(!api||typeof api.listByFamily!=='function')return [];
  try{return await api.listByFamily(storeId,family)}catch(e){return []}
}
async function refresh(){
  const v=visitById(activeVisit);
  if(!v){say('Visite introuvable.',true);return}
  const store=storeOf(state(),v),skeleton=skeletonFor(store.enseigne),merged=!!MERGED[skeleton];
  sheet.querySelector('#srReportSubtitle').textContent=text(store.enseigne)+' '+text(store.ville)+' · '+visitDate(v)
    +(merged?' · un seul compte rendu':' · deux comptes rendus');
  const tabs=sheet.querySelector('#srReportTabs');tabs.replaceChildren();
  tabs.hidden=merged;
  if(!merged){
    const M=model();
    for(const family of M.FAMILIES){
      const b=btn(family.toUpperCase(),()=>{activeTab=family;refresh()},'sr-reportTab');
      b.setAttribute('role','tab');b.setAttribute('aria-selected',activeTab===family?'true':'false');
      b.dataset.family=family;tabs.append(b);
    }
  }
  /* Jamais de cache : on relit l'état et les photos à chaque affichage. */
  const photos=merged?[]:await photosFor(v.storeId,activeTab);
  sheet.querySelector('#srReportText').value=build(state(),v.id,activeTab,photos);
}
async function copy(){
  const area=sheet&&sheet.querySelector('#srReportText');
  if(!area)return false;
  try{
    if(root.navigator&&root.navigator.clipboard&&root.navigator.clipboard.writeText){
      await root.navigator.clipboard.writeText(area.value);say('Compte rendu copié.');return true;
    }
  }catch(e){}
  try{
    area.removeAttribute('readonly');area.select();
    const ok=root.document.execCommand&&root.document.execCommand('copy');
    area.setAttribute('readonly','');
    if(ok){say('Compte rendu copié.');return true}
  }catch(e){}
  say('Copie impossible ici. Sélectionne le texte et copie-le à la main.',true);
  return false;
}
function close(){if(sheet&&sheet.open)sheet.close()}
async function open(visitId){
  const v=visitById(String(visitId||''));
  if(!v)return false;
  ensureSheet();
  activeVisit=v.id;
  const M=model();
  activeTab=M&&M.FAMILIES.indexOf(v.activeFamily)>=0?v.activeFamily:'brun';
  say('');
  if(typeof sheet.showModal==='function'&&!sheet.open)sheet.showModal();else sheet.setAttribute('open','');
  await refresh();
  return true;
}

function fromVisitDialog(){
  const api=root.StoreRunnerVisits,id=api&&typeof api.activeVisitId==='function'?api.activeVisitId():'';
  if(!id)return false;
  open(id);return true;
}
function fromQuickSheet(){
  const start=root.document&&root.document.getElementById('srQuickStart'),storeId=start&&start.dataset?start.dataset.srStart:'';
  const draft=storeId?draftFor(storeId):null;
  if(!draft){
    ensureSheet();say('Démarre la visite avant de générer le compte rendu.',true);
    if(typeof root.alert==='function')root.alert('Démarre la visite avant de générer le compte rendu.');
    return false;
  }
  open(draft.id);return true;
}
function installButtons(){
  if(!root.document)return false;
  ensureStyle();
  let done=0;
  const head=root.document.querySelector('#srVisitDialog .sr-head');
  if(head&&!root.document.getElementById(VISIT_BTN_ID)){
    const b=btn('📤 Sortie magasin',fromVisitDialog,'secondary');b.id=VISIT_BTN_ID;
    const fermer=[...head.querySelectorAll('button')].find(x=>x.textContent==='Fermer');
    if(fermer)head.insertBefore(b,fermer);else head.appendChild(b);
    done++;
  }
  const actions=root.document.querySelector('#storeQuickSheet .sheetActions');
  if(actions&&!root.document.getElementById(QUICK_BTN_ID)){
    const b=btn('📤 Sortie magasin',fromQuickSheet,'secondary');b.id=QUICK_BTN_ID;
    const photo=root.document.getElementById('storePhotosQuickBtn');
    if(photo&&photo.parentNode===actions)photo.insertAdjacentElement('afterend',b);else actions.appendChild(b);
    done++;
  }
  return done>0;
}
function boot(){ensureSheet();installButtons()}

const api={FAMILY_OF_BRAND,skeletonFor,build,open,installButtons};
root.StoreRunnerVisitReport=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  root.document.addEventListener('store-runner:data-restored',installButtons);
  root.document.addEventListener('store-runner:planning-updated',installButtons);
}
})(typeof window!=='undefined'?window:globalThis);
