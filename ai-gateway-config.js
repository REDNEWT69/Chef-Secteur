(function(){
  'use strict';
  const DEFAULT_GATEWAY='https://chef-secteur-ai.rednewtizi.workers.dev';
  const MAX_TRIES=80;
  let tries=0;
  let retryTimer=null;

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
