/* Store Runner V215 — ergonomie mobile de l'écran de visite.
   Couche visuelle uniquement : aucune donnée métier, aucun statut de visite et aucune
   action de sauvegarde ne sont modifiés ici. */
(function(root){
'use strict';

const DIALOG_ID='srVisitDialog';
let observer=null,scheduled=false,busy=false,scrollBound=false;

function q(sel,host){try{return (host||root.document).querySelector(sel)}catch(e){return null}}
function qa(sel,host){try{return Array.from((host||root.document).querySelectorAll(sel))}catch(e){return[]}}
function text(v){return String(v==null?'':v).replace(/\s+/g,' ').trim()}
function dialog(){return root.document&&root.document.getElementById(DIALOG_ID)}

function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-visit-v215-style'))return;
  const s=root.document.createElement('style');s.id='sr-visit-v215-style';
  s.textContent=`
#${DIALOG_ID}.srVisitV215{position:relative;scroll-behavior:smooth;scroll-padding-top:126px}
#${DIALOG_ID} .srVisitHeadActionsV215{display:flex;align-items:center;gap:7px;min-width:0}
#${DIALOG_ID} .srVisitPerfFoldV215{margin:10px 0 12px;border:1px solid #dfe5ef;border-radius:16px;background:#f8faff;overflow:hidden}
#${DIALOG_ID} .srVisitPerfFoldV215>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:9px 11px;cursor:pointer}
#${DIALOG_ID} .srVisitPerfFoldV215>summary::-webkit-details-marker{display:none}
#${DIALOG_ID} .srVisitPerfSummaryMainV215{display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap}
#${DIALOG_ID} .srVisitPerfSummaryMainV215 b{font-size:12px;white-space:nowrap}
#${DIALOG_ID} .srVisitPerfSummaryBadgeV215{padding:3px 7px;border-radius:8px;background:#eef2ff;color:#263e8f;font-size:10px;font-weight:850;white-space:nowrap}
#${DIALOG_ID} .srVisitPerfSummaryMetricV215{font-size:11px;font-weight:800;color:#475467;white-space:nowrap}
#${DIALOG_ID} .srVisitPerfChevronV215{color:#667085;font-size:15px;transition:transform .18s ease}
#${DIALOG_ID} .srVisitPerfFoldV215[open] .srVisitPerfChevronV215{transform:rotate(180deg)}
#${DIALOG_ID} .srVisitPerfFoldV215>.srPerfBrief192{margin:0;border:0;border-top:1px solid #e6eaf0;border-radius:0;background:#fff}
#${DIALOG_ID} .srVisitTopV215{position:sticky;bottom:10px;z-index:8;display:none;margin:10px 2px 0 auto;width:46px;height:46px;padding:0;border:1px solid rgba(20,40,160,.12);border-radius:999px;background:rgba(20,40,160,.94);color:#fff;font-size:19px;font-weight:900;box-shadow:0 8px 24px rgba(20,40,160,.24);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
#${DIALOG_ID} .srVisitTopV215.srVisitTopVisibleV215{display:block}
@media(max-width:700px){
  #${DIALOG_ID}.srVisitV215{width:calc(100vw - 10px);max-height:calc(100dvh - 8px);padding:0 12px calc(16px + env(safe-area-inset-bottom));border-radius:25px 25px 10px 10px}
  #${DIALOG_ID}.srVisitV215>.sr-head{position:sticky;top:0;z-index:12;display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin:0 -12px 4px;padding:10px 12px 9px;background:rgba(255,255,255,.94);border-bottom:1px solid #eceff4;backdrop-filter:blur(20px) saturate(1.15);-webkit-backdrop-filter:blur(20px) saturate(1.15)}
  #${DIALOG_ID}.srVisitV215>.sr-head h2{margin:0;font-size:17px;line-height:1.18;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #${DIALOG_ID} .srVisitHeadActionsV215{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(104px,1fr);overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding:0 0 1px}
  #${DIALOG_ID} .srVisitHeadActionsV215::-webkit-scrollbar{display:none}
  #${DIALOG_ID} .srVisitHeadActionsV215 button{min-height:38px!important;height:38px;padding:6px 9px!important;border-radius:12px!important;font-size:10.5px!important;white-space:nowrap}
  #${DIALOG_ID} .sr-familySwitch{position:relative!important;top:auto!important;z-index:3;margin:5px 0 9px;padding:5px 0 7px;gap:6px;background:#fff}
  #${DIALOG_ID} .sr-familyBtn{min-height:40px;padding:5px 8px;font-size:11.5px;border-radius:12px}
  #${DIALOG_ID} .sr-familyActive{padding:5px 8px;font-size:10.5px;line-height:1.25;border-radius:9px}
  #${DIALOG_ID} .srPerfBrief192{padding:9px}
  #${DIALOG_ID} .srPerfBrief192Head{display:none}
  #${DIALOG_ID} .srPerfBrief192Grid{margin-top:0;gap:6px}
  #${DIALOG_ID} .srPerfBrief192Note{font-size:10.5px;margin:7px 0 0}
  #${DIALOG_ID} .sr-terrainIntro{margin:8px 0 10px;padding:10px 11px}
  #${DIALOG_ID} .sr-terrainIntro h3{font-size:14px}
  #${DIALOG_ID} .sr-terrainIntro p{font-size:11px}
  #${DIALOG_ID}>.sr-status{margin:4px 0 5px;min-height:16px;font-size:10.5px}
  #${DIALOG_ID}>button:first-of-type{min-height:38px;font-size:11px;margin-bottom:5px}
  #${DIALOG_ID} details{margin:9px 0;padding:9px 10px}
  #${DIALOG_ID} details>summary{min-height:28px;font-size:12px}
}
`;
  root.document.head.appendChild(s);
}

function ensureHeader(d){
  const head=q(':scope > .sr-head',d)||q('.sr-head',d);if(!head)return false;
  head.classList.add('srVisitHeadV215');
  let actions=q('.srVisitHeadActionsV215',head);
  if(!actions){actions=root.document.createElement('div');actions.className='srVisitHeadActionsV215';head.appendChild(actions)}
  qa(':scope > button',head).forEach(b=>actions.appendChild(b));
  return true;
}

function activeFamily(d){
  const pressed=q('.sr-familyBtn[aria-pressed="true"]',d);
  if(pressed)return text(pressed.textContent).toUpperCase();
  const active=q('.sr-familyActive',d),m=text(active&&active.textContent).match(/\b(BLANC|BRUN)\b/i);
  return m?m[1].toUpperCase():'';
}
function compactFamily(d){
  const active=q('.sr-familyActive',d);if(!active)return false;
  const family=activeFamily(d);if(!family)return false;
  const wanted=family+' actif · notes & photos classées ici';
  if(text(active.textContent)!==wanted)active.textContent=wanted;
  active.setAttribute('aria-label','Famille active : '+family+'. Notes et photos classées dans cette famille.');
  return true;
}

function perfParts(brief){
  const badge=text(q('.srPerfBrief192Badge',brief)?.textContent)||'Performance';
  let gap='';
  qa('.srPerfBrief192Cell',brief).some(cell=>{
    const label=text(q('span',cell)?.textContent).toLowerCase();
    if(label.includes('écart cible')||label.includes('ecart cible')){gap=text(q('b',cell)?.textContent);return true}
    return false;
  });
  return{badge,gap};
}
function updatePerfSummary(fold,brief){
  const summary=q(':scope > summary',fold);if(!summary)return;
  const p=perfParts(brief),badge=q('.srVisitPerfSummaryBadgeV215',summary),metric=q('.srVisitPerfSummaryMetricV215',summary);
  if(badge)badge.textContent=p.badge;if(metric)metric.textContent=p.gap&&p.gap!=='—'?'Écart '+p.gap:'Voir le détail';
}
function foldPerformance(d){
  const brief=q('.srPerfBrief192',d);if(!brief)return false;
  let fold=brief.closest('details.srVisitPerfFoldV215');
  if(!fold){
    fold=root.document.createElement('details');fold.className='srVisitPerfFoldV215';fold.dataset.v215Fold='performance';
    const summary=root.document.createElement('summary');
    summary.innerHTML='<span class="srVisitPerfSummaryMainV215"><span class="srVisitPerfSummaryBadgeV215">Performance</span><b>Performance magasin</b><span class="srVisitPerfSummaryMetricV215">Voir le détail</span></span><span class="srVisitPerfChevronV215" aria-hidden="true">⌄</span>';
    brief.parentNode.insertBefore(fold,brief);fold.append(summary,brief);
  }
  updatePerfSummary(fold,brief);
  return true;
}

function compactSecondary(d){
  qa('details.sr-legacyReport',d).forEach(node=>{if(!node.dataset.v215Seen){node.dataset.v215Seen='1';node.removeAttribute('open')}});
}

function ensureTopButton(d){
  let b=q('.srVisitTopV215',d);
  if(!b){
    b=root.document.createElement('button');b.type='button';b.className='srVisitTopV215';b.textContent='↑';b.setAttribute('aria-label','Revenir en haut de la visite');
    b.addEventListener('click',()=>{try{d.scrollTo({top:0,behavior:'smooth'})}catch(e){d.scrollTop=0}});
    d.appendChild(b);
  }
  if(!scrollBound){
    scrollBound=true;
    d.addEventListener('scroll',()=>{const btn=q('.srVisitTopV215',d);if(btn)btn.classList.toggle('srVisitTopVisibleV215',d.scrollTop>280)},{passive:true});
  }
  return b;
}

function enhance(){
  if(busy)return false;const d=dialog();if(!d)return false;busy=true;
  try{
    ensureStyle();d.classList.add('srVisitV215');ensureHeader(d);compactFamily(d);foldPerformance(d);compactSecondary(d);ensureTopButton(d);return true;
  }finally{busy=false}
}
function schedule(){if(scheduled)return;scheduled=true;const run=()=>{scheduled=false;enhance()};if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);else setTimeout(run,0)}
function attach(){
  const d=dialog();if(!d)return false;enhance();if(observer)return true;
  observer=new MutationObserver(schedule);observer.observe(d,{childList:true,subtree:true,attributes:true,attributeFilter:['open','aria-pressed','class']});
  ['store-runner:data-restored','store-runner:planning-updated'].forEach(name=>root.document.addEventListener(name,schedule));
  return true;
}
function boot(){ensureStyle();if(attach())return;let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>40)clearInterval(timer)},100)}

root.StoreRunnerVisitMobileUXV215={enhance,compactFamily,foldPerformance};
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
})(typeof window!=='undefined'?window:globalThis);
