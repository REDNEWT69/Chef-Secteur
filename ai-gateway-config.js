(function(){
  'use strict';
  const DEFAULT_GATEWAY='/api/ai';
  const VISIT_JSON_MODULE='./visit-report-ai-json-v225.js';
  const MAX_TRIES=80;
  let tries=0;
  let retryTimer=null;

  function ensureVisitJsonModule(){
    try{
      if(window.StoreRunnerVisitReportJSONV225){
        if(typeof window.StoreRunnerVisitReportJSONV225.install==='function') window.StoreRunnerVisitReportJSONV225.install();
        return true;
      }
      if(document.querySelector('script[data-sr-visit-json-v225]')) return false;
      const script=document.createElement('script');
      const rev=window.__STORE_RUNNER_BUILD_REV||'20260918-visitjson225';
      script.src=VISIT_JSON_MODULE+'?rev='+encodeURIComponent(rev);
      script.async=true;
      script.dataset.srVisitJsonV225='1';
      script.onload=function(){
        try{if(window.StoreRunnerVisitReportJSONV225&&typeof window.StoreRunnerVisitReportJSONV225.install==='function')window.StoreRunnerVisitReportJSONV225.install()}catch(e){console.warn('Activation JSON sortie magasin impossible',e)}
      };
      script.onerror=function(){console.warn('Module JSON sortie magasin indisponible. Le rapport local reste utilisable.')};
      (document.head||document.documentElement).appendChild(script);
      return true;
    }catch(e){
      console.warn('Chargement du module JSON sortie magasin impossible',e);
      return false;
    }
  }

  function apply(){
    try{
      if(!window.aiConfig) return false;

      // Toujours utiliser la passerelle publique officielle du projet.
      // Aucune clé API n'est stockée côté navigateur.
      if(window.aiConfig.gateway!==DEFAULT_GATEWAY){
        window.aiConfig.gateway=DEFAULT_GATEWAY;
      }
      window.aiConfig.mode='online';

      try{
        localStorage.setItem('sector_planner_ai_config_v1',JSON.stringify(window.aiConfig));
      }catch(e){}

      const input=document.getElementById('aiGateway');
      if(input) input.value=DEFAULT_GATEWAY;

      if(typeof window.setAssistantMode==='function'){
        window.setAssistantMode('online',true);
      }
      if(typeof window.updateAIStatus==='function') window.updateAIStatus();
      ensureVisitJsonModule();
      return true;
    }catch(e){
      console.warn('Configuration passerelle IA impossible',e);
      return false;
    }
  }

  function retry(){
    retryTimer=null;
    tries+=1;
    if(apply() || tries>=MAX_TRIES) return;
    retryTimer=setTimeout(retry,100);
  }

  function boot(){
    if(retryTimer) clearTimeout(retryTimer);
    tries=0;
    retry();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else setTimeout(boot,0);
})();
