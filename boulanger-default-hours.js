/* Store Runner V1 — règle terrain Boulanger/Darty confirmée par l’utilisateur.
   09:30–19:30 du lundi au samedi tant qu’aucun horaire explicite n’existe.
   Les horaires manuels/officiels restent prioritaires. */
(function(root){
'use strict';
const hours=root.StoreOpeningHoursV1||(typeof require==='function'?require('./store-opening-hours.js'):null);
const legacy=hours.legacyBrandDefaults;
const {DAYS,OPEN,CLOSE,SOURCE,isBoulanger,isDarty,isSupportedBrand,brandLabel,defaultHours,shouldApply,sameDefault,applyStore}=legacy;
let dialogObserver=null;

function apply(state=root.state){let changed=0;for(const store of state&&state.stores||[])if(applyStore(store,state))changed++;return changed}
function byId(id){return (root.state&&root.state.stores||[]).find(s=>String(s.id)===String(id))||null}
function ensureDialogHint(){
  if(!root.document)return null;const d=root.document.getElementById('storeHoursDialog');if(!d)return null;
  let hint=d.querySelector('#boulangerDefaultHoursHint');if(hint)return hint;
  hint=root.document.createElement('p');hint.id='boulangerDefaultHoursHint';hint.className='tiny';hint.style.cssText='margin:10px 0 0;padding:9px 10px;border-radius:12px;background:#eef4ff;color:#344054;font-weight:700;line-height:1.4';hint.hidden=true;
  const fields=d.querySelector('#storeHoursFields'),form=d.querySelector('form');if(fields&&fields.parentNode)fields.parentNode.insertBefore(hint,fields);else if(form)form.appendChild(hint);return hint;
}
function decorateDialog(){
  const d=root.document&&root.document.getElementById('storeHoursDialog'),hint=ensureDialogHint();if(!d||!hint)return false;
  const store=byId(d.dataset.storeId),active=!!(store&&hours.brandModel(store)===undefined&&isSupportedBrand(store)&&store.openingHoursSource===SOURCE&&sameDefault(store.openingHours));
  hint.hidden=!active;
  if(active)hint.textContent=brandLabel(store)+' : 09:30–19:30 appliqué par défaut du lundi au samedi. Tu n’as rien à saisir sauf si ce magasin est une exception.';
  return active;
}
function refresh(){
  const changed=apply();decorateDialog();
  if(changed&&root.StoreOpeningHoursV1&&typeof root.StoreOpeningHoursV1.decorateTimeline==='function')setTimeout(()=>root.StoreOpeningHoursV1.decorateTimeline(),0);
  return changed;
}
function observeDialog(){
  if(dialogObserver||!root.document||typeof MutationObserver==='undefined')return;const d=root.document.getElementById('storeHoursDialog');if(!d)return;
  dialogObserver=new MutationObserver(decorateDialog);dialogObserver.observe(d,{attributes:true,attributeFilter:['open','data-store-id']});
}
function boot(){refresh();observeDialog();decorateDialog()}
const api={DAYS,OPEN,CLOSE,SOURCE,isBoulanger,isDarty,isSupportedBrand,brandLabel,defaultHours,shouldApply,sameDefault,applyStore,apply,decorateDialog,refresh};
root.BoulangerDefaultHoursV1=api;root.StoreBrandDefaultHoursV1=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  root.document.addEventListener('store-runner:data-restored',refresh);
  root.document.addEventListener('store-runner:planning-updated',refresh);
  root.addEventListener('chef-range-generated',refresh);
}
})(typeof window!=='undefined'?window:globalThis);
