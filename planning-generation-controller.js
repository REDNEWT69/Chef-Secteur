(function(){
  'use strict';
  let attempts=0;

  function emitPlanningUpdated(){
    try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'generateWeek'}}))}catch(e){}
  }

  function install(){
    if(window.__storeRunnerPlanningGenerateOwner)return true;
    if(typeof window.generateWeek!=='function')return false;
    const base=window.generateWeek;
    const owned=async function(){
      if(typeof window.chefSecteurPrepareCalendarForPlanning==='function'){
        try{await window.chefSecteurPrepareCalendarForPlanning()}catch(e){console.warn('Préparation Agenda ignorée :',e)}
      }
      const generator=typeof window.storeRunnerGenerateSingleWeek==='function'?window.storeRunnerGenerateSingleWeek:base;
      const out=await generator.apply(this,arguments);
      if(typeof window.chefSecteurEnforceBlockedDays==='function'){
        try{window.chefSecteurEnforceBlockedDays()}catch(e){console.warn('Application des jours bloqués impossible :',e)}
      }
      emitPlanningUpdated();
      return out;
    };
    owned.__storeRunnerPlanningGenerateOwner=true;
    window.generateWeek=owned;
    window.__storeRunnerPlanningGenerateOwner=true;
    return true;
  }

  function boot(){
    if(install())return;
    if(attempts++<40)setTimeout(boot,75);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',install,{once:true});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(install,40)});
})();
