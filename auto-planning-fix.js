(function(){
'use strict';

var bootAttempts=0;

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

function boot(){
  if(!window.state){
    if(bootAttempts++<40)setTimeout(boot,50);
    return;
  }
  bootAttempts=0;
  installAutoApply();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(installAutoApply,40)});
window.addEventListener('focus',function(){setTimeout(installAutoApply,40)});
})();
