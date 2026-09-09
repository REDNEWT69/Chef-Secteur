(function(){
'use strict';

function hasBase(){
  try{
    return !!(window.state&&state.profile&&Number.isFinite(Number(state.profile.baseLat))&&Number.isFinite(Number(state.profile.baseLon)));
  }catch(e){return false}
}

var originalHav=window.hav;
var originalHavBase=window.havBase;
var originalBaseObj=window.baseObj;

if(typeof originalHav==='function'){
  window.hav=function(a,b){
    if((a&&a.__chefNoBase)||(b&&b.__chefNoBase)) return 0;
    return originalHav.apply(this,arguments);
  };
}
if(typeof originalHavBase==='function'){
  window.havBase=function(store){
    if(!hasBase()) return 0;
    return originalHavBase.apply(this,arguments);
  };
}
if(typeof originalBaseObj==='function'){
  window.baseObj=function(){
    if(!hasBase()) return {lat:null,lon:null,__chefNoBase:true};
    return originalBaseObj.apply(this,arguments);
  };
}

function installAutoApply(){
  var R=window.ChefReliability;
  if(!R||typeof R.capture!=='function') return false;
  if(R.propose&&R.propose.__chefAutoApply) return true;

  var autoApply=async function(candidate){
    try{
      var bundle=R.capture();
      bundle.state=JSON.parse(JSON.stringify(window.state));
      bundle.state.plan=candidate.plan||{};
      if(candidate.weekDate) bundle.state.settings.weekDate=candidate.weekDate;
      if(candidate.archive) bundle.archive=candidate.archive;
      if(candidate.range) bundle.range=candidate.range;

      try{R.checkpoint('Avant remplacement automatique du planning')}catch(e){}
      R.persist(bundle);
      window.state=bundle.state;
      if(typeof window.initControls==='function') window.initControls();
      if(typeof window.renderAll==='function') window.renderAll();
      return true;
    }catch(e){
      if(typeof window.showError==='function') window.showError('Génération impossible : '+(e.message||String(e)));
      return false;
    }
  };
  autoApply.__chefAutoApply=true;
  R.propose=autoApply;
  return true;
}

function retryInstall(){
  if(installAutoApply()) return;
  [80,180,350,700,1400,2600].forEach(function(delay){
    setTimeout(function(){installAutoApply()},delay);
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',retryInstall,{once:true});
else retryInstall();
window.addEventListener('load',installAutoApply,{once:true});
window.addEventListener('focus',installAutoApply);
document.addEventListener('visibilitychange',function(){if(!document.hidden)installAutoApply()});
})();
