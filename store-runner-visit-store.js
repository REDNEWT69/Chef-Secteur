/* Serializes Visit/Action edits; no replacement of another module's globals. */
(function(root){
'use strict';
function create(options){
 const M=options.model,R=options.reliability,db=options.db;
 let queue=Promise.resolve(),draft=null,baseRevision=null,allowedRaw=null,epoch=0,pending=0,historyChanges={};
 const revision=s=>s.businessV2?s.businessV2.revision:0;
 function edit(change){const generation=epoch;pending++;const result=queue.then(async()=>{
  if(generation!==epoch)throw Error('Les données ont été restaurées. Rouvre la visite.');
  const current=options.getState(),raw=db.getItem(R.keys.MAIN),disk=raw?JSON.parse(raw):null;
  if(draft){if(revision(current)!==baseRevision||(raw!==allowedRaw&&revision(disk||{})!==baseRevision))throw Error('Les données ont changé dans une autre fenêtre. Recharge avant de poursuivre.');}
  else if(disk&&revision(disk)!==revision(current))throw Error('Les données ont changé dans une autre fenêtre. Recharge avant de poursuivre.');
  if(!change&&!draft)return;
  const next=M.clone(current);if(draft)next.businessV2=M.clone(draft.businessV2);
  if(Object.keys(historyChanges).length)next.visits=Object.assign({},next.visits,M.clone(historyChanges));
  const beforeHistory=M.clone(next.visits||{});
  M.data(next);if(change){change(next);next.businessV2.revision++}
  for(const [key,value] of Object.entries(next.visits||{}))if(JSON.stringify(value)!==JSON.stringify(beforeHistory[key]))historyChanges[key]=M.clone(value);
  draft=next;baseRevision=revision(current);allowedRaw=raw;
  options.onStatus('saving');
  try{
   R.validateState(next);R.save(next,db);allowedRaw=db.getItem(R.keys.MAIN);
   if(typeof db.flush==='function')await db.flush();
   if(generation!==epoch)throw Error('Les données ont été restaurées pendant la sauvegarde.');
   // Preserve unrelated profile/calendar changes made while IndexedDB was committing.
   const latest=options.getState(),merged=M.clone(latest);merged.businessV2=next.businessV2;
   if(Object.keys(historyChanges).length)merged.visits=Object.assign({},merged.visits,M.clone(historyChanges));
   if(JSON.stringify(merged)!==JSON.stringify(next)){R.save(merged,db);if(typeof db.flush==='function')await db.flush()}
   options.setState(merged);draft=null;baseRevision=null;allowedRaw=null;historyChanges={};options.onStatus('saved');
  }catch(e){options.onStatus('error',e.message);throw e}
 }).finally(()=>{pending--});queue=result.catch(()=>{});return result}
 return {edit,flush:()=>edit(),hasPending:()=>!!draft||pending>0,invalidate(){epoch++;draft=null;baseRevision=null;allowedRaw=null;historyChanges={}}};
}
const api={create};root.StoreRunnerVisitStore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
