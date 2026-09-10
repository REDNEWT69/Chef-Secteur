(function(){
  'use strict';
  let attempts=0;

  function emitPlanningUpdated(){
    try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'generateWeek'}}))}catch(e){}
  }

  function countVisits(plan){
    if(!plan||typeof plan!=='object')return 0;
    return Object.keys(plan).reduce(function(total,day){return total+(Array.isArray(plan[day])?plan[day].length:0)},0);
  }

  function install(){
    if(window.__storeRunnerPlanningGenerateOwner)return true;
    if(typeof window.generateWeek!=='function')return false;
    const base=window.generateWeek;
    const owned=async function(){
      if(typeof window.chefSecteurPrepareCalendarForPlanning==='function'){
        try{await window.chefSecteurPrepareCalendarForPlanning()}catch(e){console.warn('Préparation Agenda ignorée :',e)}
      }
      const specialized=typeof window.storeRunnerGenerateSingleWeek==='function';
      const generator=specialized?window.storeRunnerGenerateSingleWeek:base;
      const beforeCount=countVisits(window.state&&state.plan);
      const out=await generator.apply(this,arguments);

      /* Le moteur spécialisé filtre lui-même les vraies indisponibilités Agenda.
         L'ancien enforceBlockedDays reste réservé au moteur historique afin qu'un
         simple événement Google « toute la journée » ne puisse plus vider une
         semaine déjà validée par le moteur V2. */
      if(!specialized&&typeof window.chefSecteurEnforceBlockedDays==='function'){
        try{window.chefSecteurEnforceBlockedDays()}catch(e){console.warn('Application des jours bloqués impossible :',e)}
      }

      const afterCount=countVisits(window.state&&state.plan);
      if(beforeCount>0&&afterCount===0&&out&&out.__storeRunnerRejectedEmpty!==true){
        console.warn('Le planning est devenu vide après génération. Le moteur spécialisé doit protéger ce cas.');
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
