/* Store Runner V216 — navigation interne mobile de la visite.
   Couche de présentation uniquement : aucun bloc métier existant n'est déplacé,
   aucune donnée n'est écrite et aucun statut de visite n'est modifié ici. */
(function(root){
'use strict';

const DIALOG_ID='srVisitDialog',NAV_ID='srVisitTabsV216',OVERVIEW_ID='srVisitOverviewV216',HISTORY_ID='srVisitHistoryV216';
let activeTab='action',lastVisitId='',observer=null,discoveryObserver=null,scheduled=false,busy=false;
let releaseStabilityInstalled=false,dayIntentSeq=0,hotelLock=null,hotelObserver=null,hotelObservedBox=null,settingsObserver=null,hotelRepairing=false;

function q(sel,host){try{return (host||root.document).querySelector(sel)}catch(e){return null}}
function qa(sel,host){try{return Array.from((host||root.document).querySelectorAll(sel))}catch(e){return[]}}
function text(v){return String(v==null?'':v).replace(/\s+/g,' ').trim()}
function dialog(){return root.document&&root.document.getElementById(DIALOG_ID)}
function mobile(){try{return root.matchMedia?root.matchMedia('(max-width:700px)').matches:Number(root.innerWidth||0)<=700}catch(e){return true}}
function visitId(){try{return root.StoreRunnerVisits&&typeof root.StoreRunnerVisits.activeVisitId==='function'?String(root.StoreRunnerVisits.activeVisitId()||''):''}catch(e){return''}}
function currentVisit(){const id=visitId();try{return ((root.state&&root.state.businessV2&&root.state.businessV2.visits)||[]).find(v=>String(v.id)===id)||null}catch(e){return null}}
function bodyOf(d){return qa(':scope > div',d).filter(n=>!n.classList.contains('sr-head')&&n.id!==NAV_ID).pop()||null}
function currentFamily(d){const pressed=q('.sr-familyBtn[aria-pressed="true"]',d);if(pressed)return text(pressed.textContent).toUpperCase();const active=q('.sr-familyActive',d),m=text(active&&active.textContent).match(/\b(BLANC|BRUN)\b/i);return m?m[1].toUpperCase():'—'}
function historyFor(v){try{const api=root.StoreRunnerVisits;if(!v||!api||typeof api.memoryFor!=='function')return[];return (api.memoryFor(v.storeId).visits||[]).filter(row=>String(row.id)!==String(v.id))}catch(e){return[]}}

function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-visit-v216-style'))return;
  const s=root.document.createElement('style');s.id='sr-visit-v216-style';
  s.textContent=`
#${NAV_ID}{display:none}
#${DIALOG_ID} .srVisitOverviewV216,#${DIALOG_ID} .srVisitHistoryV216{display:none}
@media(max-width:700px){
  #${DIALOG_ID}.srVisitV216{--sr-v216-head-h:92px;scroll-padding-top:calc(var(--sr-v216-head-h) + 58px)}
  #${DIALOG_ID}.srVisitV216 #${NAV_ID}{position:sticky;top:var(--sr-v216-head-h);z-index:11;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:0 -12px 8px;padding:6px 12px 7px;background:rgba(255,255,255,.95);border-bottom:1px solid #eceff4;backdrop-filter:blur(18px) saturate(1.12);-webkit-backdrop-filter:blur(18px) saturate(1.12)}
  #${DIALOG_ID}.srVisitV216 .srVisitTopV215{position:fixed;right:18px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:30;margin:0;pointer-events:auto;touch-action:manipulation}
  #${NAV_ID} button{min-width:0;min-height:38px;padding:6px 7px;border:1px solid #e1e6ef;border-radius:11px;background:#f7f8fb;color:#667085;font-size:10.5px;font-weight:850;white-space:nowrap}
  #${NAV_ID} button[aria-selected="true"]{background:#1428a0;color:#fff;border-color:#1428a0;box-shadow:0 5px 14px rgba(20,40,160,.16)}
  #${NAV_ID} .srV216Count{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;margin-left:3px;padding:0 4px;border-radius:999px;background:rgba(102,112,133,.12);font-size:9px;line-height:1}
  #${NAV_ID} button[aria-selected="true"] .srV216Count{background:rgba(255,255,255,.2)}
  #${DIALOG_ID} .srV216Hidden{display:none!important}
  #${DIALOG_ID} .srVisitOverviewV216{display:block;margin:8px 0 10px;padding:10px 11px;border:1px solid #e2e7f0;border-radius:15px;background:#fbfcff}
  #${DIALOG_ID} .srVisitOverviewV216 h3{margin:0 0 7px;font-size:13px}
  #${DIALOG_ID} .srVisitOverviewChipsV216{display:flex;flex-wrap:wrap;gap:6px}
  #${DIALOG_ID} .srVisitOverviewChipV216{display:inline-flex;align-items:center;min-height:27px;padding:3px 8px;border-radius:999px;background:#eef2ff;color:#334a8f;font-size:10px;font-weight:800}
  #${DIALOG_ID} .srVisitHistoryV216{display:block;margin:8px 0 10px;padding:10px;border:1px solid #e2e7f0;border-radius:15px;background:#fbfcff}
  #${DIALOG_ID} .srVisitHistoryV216 h3{margin:0 0 4px;font-size:13px}
  #${DIALOG_ID} .srVisitHistoryMetaV216{margin:0 0 8px;color:#667085;font-size:10.5px}
  #${DIALOG_ID} .srVisitHistoryListV216{display:grid;gap:7px}
  #${DIALOG_ID} .srVisitHistoryRowV216{width:100%;min-height:48px;padding:8px 9px;border:1px solid #dde3ec;border-radius:12px;background:#fff;text-align:left;color:#1d2939}
  #${DIALOG_ID} .srVisitHistoryRowV216 b{display:block;font-size:11.5px}
  #${DIALOG_ID} .srVisitHistoryRowV216 span{display:block;margin-top:2px;color:#667085;font-size:10.5px;line-height:1.3;white-space:normal}
  #${DIALOG_ID} .srVisitHistoryEmptyV216{padding:14px 8px;text-align:center;color:#667085;font-size:11px}
}
`;
  root.document.head.appendChild(s);
}

function ensureNav(d){
  let nav=root.document.getElementById(NAV_ID);if(nav)return nav;
  const head=q(':scope > .sr-head',d);if(!head)return null;
  nav=root.document.createElement('nav');nav.id=NAV_ID;nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Vue de la visite');
  [['view','Vue'],['action','Action'],['history','Historique']].forEach(([key,label])=>{
    const b=root.document.createElement('button');b.type='button';b.dataset.v216Tab=key;b.setAttribute('role','tab');b.textContent=label;
    b.addEventListener('click',()=>selectTab(key));nav.appendChild(b);
  });
  head.insertAdjacentElement('afterend',nav);return nav;
}
function updateHeadHeight(d){const head=q(':scope > .sr-head',d);if(!head)return;const h=Math.max(56,Math.ceil(head.getBoundingClientRect().height||0));const wanted=h+'px';if(d.style.getPropertyValue('--sr-v216-head-h')!==wanted)d.style.setProperty('--sr-v216-head-h',wanted)}

function ensureOverview(d,b,v){
  let panel=root.document.getElementById(OVERVIEW_ID);if(!panel){panel=root.document.createElement('section');panel.id=OVERVIEW_ID;panel.className='srVisitOverviewV216';b.insertBefore(panel,b.firstChild)}
  const history=historyFor(v),family=currentFamily(d),status=v&&v.status==='completed'?'Visite terminée':'Visite en cours';
  const signature=[v&&v.id,status,family,history.length].join('|');if(panel.dataset.signature===signature)return panel;panel.dataset.signature=signature;
  panel.replaceChildren();const h=root.document.createElement('h3');h.textContent='Vue rapide';const chips=root.document.createElement('div');chips.className='srVisitOverviewChipsV216';
  [status,'Famille '+family,history.length+' visite'+(history.length>1?'s':'')+' précédente'+(history.length>1?'s':'')].forEach(label=>{const c=root.document.createElement('span');c.className='srVisitOverviewChipV216';c.textContent=label;chips.appendChild(c)});panel.append(h,chips);return panel
}
function ensureHistory(b,v){
  let panel=root.document.getElementById(HISTORY_ID);if(!panel){panel=root.document.createElement('section');panel.id=HISTORY_ID;panel.className='srVisitHistoryV216';b.appendChild(panel)}
  const rows=historyFor(v),signature=(v&&v.id||'')+'|'+rows.map(x=>[x.id,x.completedDate,x.conclusion].join(':')).join('|');if(panel.dataset.signature===signature)return panel;panel.dataset.signature=signature;
  panel.replaceChildren();const h=root.document.createElement('h3');h.textContent='Historique du magasin';const meta=root.document.createElement('p');meta.className='srVisitHistoryMetaV216';meta.textContent=rows.length?rows.length+' visite'+(rows.length>1?'s':'')+' terminée'+(rows.length>1?'s':''):'Aucune visite terminée avant celle-ci';panel.append(h,meta);
  const list=root.document.createElement('div');list.className='srVisitHistoryListV216';
  if(!rows.length){const empty=root.document.createElement('div');empty.className='srVisitHistoryEmptyV216';empty.textContent='L’historique apparaîtra ici après tes premiers passages.';list.appendChild(empty)}
  rows.slice(0,8).forEach(row=>{const btn=root.document.createElement('button');btn.type='button';btn.className='srVisitHistoryRowV216';btn.dataset.v216HistoryVisit=row.id;const title=root.document.createElement('b');title.textContent=row.completedDate||'Visite terminée';const note=root.document.createElement('span');note.textContent=text(row.conclusion)||'Visite terrain enregistrée';btn.append(title,note);btn.addEventListener('click',()=>{try{if(root.StoreRunnerVisits&&typeof root.StoreRunnerVisits.openVisit==='function')root.StoreRunnerVisits.openVisit(row.id)}catch(e){}});list.appendChild(btn)});panel.appendChild(list);return panel
}

function roleOf(node){if(!node)return'action';if(node.id===OVERVIEW_ID)return'view';if(node.id===HISTORY_ID)return'history';if(node.classList&&(node.classList.contains('srVisitPerfFoldV215')||node.classList.contains('srPerfBrief192')))return'view';return'action'}
function setHidden(node,hidden){if(!node)return;const has=node.classList.contains('srV216Hidden');if(has!==hidden)node.classList.toggle('srV216Hidden',hidden)}
function updateNav(nav,historyCount){
  qa('[data-v216-tab]',nav).forEach(b=>{const selected=b.dataset.v216Tab===activeTab;if(b.getAttribute('aria-selected')!==String(selected))b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;if(b.dataset.v216Tab==='history'){let count=q('.srV216Count',b);if(!count){count=root.document.createElement('span');count.className='srV216Count';b.appendChild(count)}const value=String(historyCount);if(count.textContent!==value)count.textContent=value}})
}
function apply(d,b,v){
  const nav=ensureNav(d);if(!nav)return false;const isMobile=mobile();nav.hidden=!isMobile||!v;
  if(!isMobile||!v){Array.from(b.children).forEach(n=>setHidden(n,false));return true}
  const rows=historyFor(v);updateNav(nav,rows.length);Array.from(b.children).forEach(n=>setHidden(n,roleOf(n)!==activeTab));return true
}
function selectTab(key){if(!['view','action','history'].includes(key))return false;activeTab=key;const d=dialog();if(d){d.scrollTop=0;enhance()}return true}

/* Release V216 : le déploiement complet a révélé deux courses de rendu anciennes.
   Cette garde reste strictement visuelle : elle réaffirme le dernier choix tactile de jour
   et protège le formulaire Hôtel pendant que la feuille de réglages est ouverte. */
function markPlanningTabActive(tab){
  if(!tab)return false;const host=tab.parentNode;if(!host)return false;
  qa('.periodDayTab[data-date]',host).forEach(node=>node.classList.toggle('active',node===tab));return true
}
function reinforcePlanningDay(date,seq){
  if(!date||seq!==dayIntentSeq)return false;
  const current=q('#dayTabs .periodDayTab.active[data-date]');if(current&&current.dataset.date===date)return true;
  const tab=q('#dayTabs .periodDayTab[data-date="'+date+'"]');if(!tab)return false;
  try{if(typeof tab.onclick==='function')tab.onclick.call(tab)}catch(e){}
  markPlanningTabActive(tab);return true
}
function planningSettingsOpen(){const el=q('#planningSettings');return!!(el&&el.classList.contains('planningSettingsSheetOpen'))}
function captureHotelLock(){
  if(!hotelLock)return false;const box=q('#overnightBox');if(!box||!planningSettingsOpen())return false;
  const editor=q('.srHotelReservationV212[data-night]',box);if(!editor)return false;
  const night=String(editor.dataset.night||'');if(hotelLock.date&&night&&hotelLock.date!==night)return false;
  hotelLock.date=night||hotelLock.date;hotelLock.html=box.innerHTML;
  const name=q('#srHotelNameV212',editor),ref=q('#srHotelRefV212',editor);hotelLock.name=String(name&&name.value||'');hotelLock.reference=String(ref&&ref.value||'');return true
}
function syncLockedHotelEditor(){
  if(!hotelLock||hotelRepairing)return false;
  if(!planningSettingsOpen()){hotelLock=null;return false}
  const box=q('#overnightBox');if(!box)return false;
  let editor=q('.srHotelReservationV212[data-night]',box);
  if(editor&&(!hotelLock.date||String(editor.dataset.night||'')===hotelLock.date)){
    const name=q('#srHotelNameV212',editor),ref=q('#srHotelRefV212',editor);
    if(name&&name.value!==hotelLock.name)name.value=hotelLock.name;
    if(ref&&ref.value!==hotelLock.reference)ref.value=hotelLock.reference;
    if(!hotelLock.html)captureHotelLock();return true
  }
  if(!hotelLock.html)return false;
  hotelRepairing=true;
  try{
    box.innerHTML=hotelLock.html;editor=q('.srHotelReservationV212[data-night]',box);
    const name=q('#srHotelNameV212',editor),ref=q('#srHotelRefV212',editor);
    if(name)name.value=hotelLock.name;if(ref)ref.value=hotelLock.reference;return true
  }finally{hotelRepairing=false}
}
function ensureHotelObservers(){
  const box=q('#overnightBox');
  if(box&&box!==hotelObservedBox&&typeof root.MutationObserver==='function'){
    if(hotelObserver)hotelObserver.disconnect();hotelObservedBox=box;hotelObserver=new root.MutationObserver(syncLockedHotelEditor);hotelObserver.observe(box,{childList:true,subtree:true})
  }
  const settings=q('#planningSettings');
  if(settings&&!settingsObserver&&typeof root.MutationObserver==='function'){
    settingsObserver=new root.MutationObserver(()=>{if(hotelLock&&!planningSettingsOpen())hotelLock=null});settingsObserver.observe(settings,{attributes:true,attributeFilter:['class','open']})
  }
}
function installReleaseStabilityV216(){
  if(releaseStabilityInstalled||!root.document)return false;releaseStabilityInstalled=true;
  root.document.addEventListener('click',e=>{
    const target=e&&e.target&&e.target.closest?e.target:null;if(!target)return;
    const tab=target.closest('#dayTabs .periodDayTab[data-date]');
    if(tab){
      const date=String(tab.dataset.date||''),seq=++dayIntentSeq;markPlanningTabActive(tab);
      root.setTimeout(()=>reinforcePlanningDay(date,seq),0);
      if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(()=>reinforcePlanningDay(date,seq));
    }
    const cue=target.closest('#planningOvernightCueV206');
    if(cue){
      hotelLock={date:String(cue.dataset.date||''),html:'',name:'',reference:''};ensureHotelObservers();captureHotelLock();
      root.setTimeout(()=>{if(hotelLock&&!hotelLock.html)captureHotelLock();syncLockedHotelEditor()},0)
    }
    if(target.closest('[data-planning-settings-close]'))hotelLock=null;
  });
  root.document.addEventListener('input',e=>{
    if(!hotelLock||!e||!e.target)return;
    if(e.target.id==='srHotelNameV212')hotelLock.name=String(e.target.value||'');
    else if(e.target.id==='srHotelRefV212')hotelLock.reference=String(e.target.value||'');
  });
  root.document.addEventListener('keydown',e=>{if(e&&e.key==='Escape')hotelLock=null},true);
  root.document.addEventListener('store-runner:hotel-reservation-updated',()=>{hotelLock=null});
  ensureHotelObservers();return true
}

function enhance(){
  if(busy)return false;const d=dialog();if(!d)return false;const b=bodyOf(d);if(!b)return false;busy=true;
  try{
    ensureStyle();if(!d.classList.contains('srVisitV216'))d.classList.add('srVisitV216');updateHeadHeight(d);
    const v=currentVisit(),id=v?String(v.id):'';if(id!==lastVisitId){lastVisitId=id;activeTab='action'}
    if(v){ensureOverview(d,b,v);ensureHistory(b,v)}
    apply(d,b,v);return true;
  }finally{busy=false}
}
function schedule(){if(scheduled)return;scheduled=true;const run=()=>{scheduled=false;enhance()};if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);else root.setTimeout(run,0)}
function attach(){const d=dialog();if(!d)return false;enhance();if(observer)return true;observer=new MutationObserver(schedule);observer.observe(d,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open','aria-pressed']});root.addEventListener&&root.addEventListener('resize',schedule,{passive:true});return true}
function boot(){ensureStyle();installReleaseStabilityV216();if(attach())return;const host=root.document.documentElement||root.document;discoveryObserver=new MutationObserver(()=>{if(!attach())return;if(discoveryObserver){discoveryObserver.disconnect();discoveryObserver=null}});discoveryObserver.observe(host,{childList:true,subtree:true})}

root.StoreRunnerVisitTabsV216={enhance,selectTab,currentTab:()=>activeTab};
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
})(typeof window!=='undefined'?window:globalThis);
