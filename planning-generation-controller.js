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

  function hasValidBase(){
    return typeof window.storeRunnerHasValidBase==='function'&&window.storeRunnerHasValidBase();
  }

  function generationStatus(message,type){
    let box=document.getElementById('planningGenerateStatus');
    if(!box){
      const button=document.querySelector('#planPanel button.primary.full[onclick="generateWeek()"]');
      if(button){
        box=document.createElement('div');box.id='planningGenerateStatus';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
        box.style.margin='9px 2px 0';box.style.fontSize='12px';box.style.lineHeight='1.4';button.insertAdjacentElement('afterend',box);
      }
    }
    if(box){box.textContent=message||'';box.style.color=type==='bad'?'#b42318':type==='ok'?'#137333':'#667085';box.style.fontWeight=type==='bad'||type==='ok'?'700':'500'}
    if(type==='bad'){
      if(typeof window.showError==='function')try{window.showError(message)}catch(e){}
      if(typeof window.storeRunnerToast==='function')try{window.storeRunnerToast(message)}catch(e){}
    }else if(type==='ok'){
      const error=document.getElementById('errorBox');if(error)error.style.display='none';
      if(typeof window.storeRunnerToast==='function')try{window.storeRunnerToast(message)}catch(e){}
    }
  }

  function install(){
    if(window.__storeRunnerPlanningGenerateOwner)return true;
    if(typeof window.generateWeek!=='function')return false;
    const base=window.generateWeek;
    const owned=async function(){
      /*
       * La génération du planning doit rester purement locale : elle consomme le
       * dernier cache Agenda disponible mais ne déclenche jamais de synchro réseau
       * ni d'OAuth. `chefSecteurPrepareCalendarForPlanning` reste l'API Agenda de
       * préparation historique, mais elle n'est volontairement pas appelée ici.
       * Une reconnexion Google ne doit se produire qu'après une action explicite
       * de l'utilisateur dans l'interface Agenda.
       */
      generationStatus('Génération du planning…','busy');
      if(!hasValidBase()){
        const message='Point de départ incomplet. Dans Mon activité, saisis une ville ou une adresse (ex. Francheville), puis enregistre les réglages.';
        generationStatus(message,'bad');
        return{ok:false,__storeRunnerRejectedEmpty:true,error:message};
      }
      const specialized=typeof window.storeRunnerGenerateSingleWeek==='function';
      const generator=specialized?window.storeRunnerGenerateSingleWeek:base;
      const beforeCount=countVisits(window.state&&state.plan);
      const previousPlanningFlag=window.__storeRunnerPlanningGenerationActive;
      window.__storeRunnerPlanningGenerationActive=true;
      let out;
      try{out=await generator.apply(this,arguments)}finally{window.__storeRunnerPlanningGenerationActive=previousPlanningFlag}

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
      if(out&&out.ok===false){
        generationStatus(out.error||'Le planning n’a pas été généré. Vérifie les réglages affichés.','bad');
      }else if(afterCount>0){
        generationStatus('Planning généré ✓ '+afterCount+' visite'+(afterCount>1?'s':''),'ok');
      }else{
        generationStatus('Aucune visite générée. Vérifie le point de départ, les filtres et les horaires.','bad');
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
