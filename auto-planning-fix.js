(function(){
'use strict';

function installAutoApply(){
  var R=window.ChefReliability;if(!R||typeof R.capture!=='function')return false;
  if(R.propose&&R.propose.__chefAutoApply)return true;
  var fn=async function(candidate){
    try{
      var bundle=R.capture();bundle.state=JSON.parse(JSON.stringify(window.state));bundle.state.plan=candidate.plan||{};
      if(candidate.weekDate)bundle.state.settings.weekDate=candidate.weekDate;
      if(candidate.archive)bundle.archive=candidate.archive;
      if(candidate.range)bundle.range=candidate.range;
      try{R.checkpoint('Avant remplacement automatique du planning')}catch(e){}
      R.persist(bundle);window.state=bundle.state;
      if(typeof window.initControls==='function')window.initControls();
      if(typeof window.renderAll==='function')window.renderAll();
      return true;
    }catch(e){
      if(typeof window.showError==='function')window.showError('Génération impossible : '+(e.message||String(e)));
      return false;
    }
  };
  fn.__chefAutoApply=true;R.propose=fn;return true;
}

function boot(){installAutoApply()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('store-runner:reliability-propose-ready',installAutoApply);
})();
