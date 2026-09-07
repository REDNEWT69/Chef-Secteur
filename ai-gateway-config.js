(function(){
  'use strict';
  const DEFAULT_GATEWAY='https://chef-secteur-ai.rednewtizi.workers.dev';

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

  let tries=0;
  const timer=setInterval(function(){
    tries++;
    if(apply() || tries>80) clearInterval(timer);
  },100);

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply);
  else setTimeout(apply,0);
})();
