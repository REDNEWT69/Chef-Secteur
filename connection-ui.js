(function(){
  'use strict';

  const GATEWAY_HEALTH_TTL=60000;
  const gatewayHealth={gateway:'',state:'idle',checkedAt:0,error:'',requestId:0};
  let gatewayHealthTimer=null;

  function healStorage(){
    try{
      if(window.__chefStorage){
        try{window.storage=window.__chefStorage}catch(e){}
      }
      var box=document.getElementById('errorBox');
      if(box&&/stockage (du navigateur )?indisponible|sauvegarde locale impossible/i.test(box.textContent||'')){
        try{
          var s=window.__chefStorage||window.storage;
          if(s){
            var k='__chef_heal_test__';
            s.setItem(k,'1');
            s.removeItem(k);
            window.storage=s;
            box.style.display='none';
            box.textContent='';
            var dot=document.getElementById('statusDot');
            if(dot&&dot.classList.contains('bad'))dot.className='dot ok';
          }
        }catch(e){}
      }
    }catch(e){}
  }

  function assistantOnline(){
    try{return !!(window.aiConfig&&window.aiConfig.mode==='online')}catch(e){return false}
  }
  function assistantGateway(){
    try{return String(window.aiConfig&&window.aiConfig.gateway||'').trim()}catch(e){return ''}
  }
  function assistantStatusNode(){return document.getElementById('assistantAIStatus')}
  function setAssistantStatus(className,text){
    const status=assistantStatusNode();
    if(!status)return;
    if(status.className!==className)status.className=className;
    if(status.textContent!==text)status.textContent=text;
    status.dataset.gatewayHealthManaged='1';
  }
  function scheduleGatewayHealth(force){
    if(gatewayHealthTimer)clearTimeout(gatewayHealthTimer);
    gatewayHealthTimer=setTimeout(function(){gatewayHealthTimer=null;checkGatewayHealth(!!force)},0);
  }
  function renderAssistantHealth(){
    if(!assistantStatusNode())return;
    if(!assistantOnline()){
      setAssistantStatus('ai-status','Mode local amélioré · comprend maintenant planning, agenda et déplacements');
      return;
    }
    const gateway=assistantGateway();
    if(!gateway){
      setAssistantStatus('ai-status bad','IA en ligne non configurée · une passerelle serveur sécurisée est nécessaire');
      return;
    }
    if(gatewayHealth.gateway!==gateway){
      gatewayHealth.gateway=gateway;
      gatewayHealth.state='idle';
      gatewayHealth.checkedAt=0;
      gatewayHealth.error='';
    }
    if(gatewayHealth.state==='ok'){
      setAssistantStatus('ai-status ok','IA en ligne prête · connexion vérifiée · planning transmis uniquement lors d’une demande');
      return;
    }
    if(gatewayHealth.state==='bad'){
      setAssistantStatus('ai-status bad','IA en ligne indisponible · '+(gatewayHealth.error||'connexion à la passerelle impossible'));
      return;
    }
    setAssistantStatus('ai-status','Vérification de l’IA en ligne…');
    if(gatewayHealth.state==='idle')scheduleGatewayHealth(false);
  }
  async function checkGatewayHealth(force){
    const gateway=assistantGateway();
    if(!assistantOnline()||!gateway){renderAssistantHealth();return false}
    if(gatewayHealth.gateway!==gateway){
      gatewayHealth.gateway=gateway;
      gatewayHealth.state='idle';
      gatewayHealth.checkedAt=0;
      gatewayHealth.error='';
    }
    const now=Date.now();
    if(!force&&gatewayHealth.state==='checking')return false;
    if(!force&&gatewayHealth.checkedAt&&now-gatewayHealth.checkedAt<GATEWAY_HEALTH_TTL&&(gatewayHealth.state==='ok'||gatewayHealth.state==='bad')){
      renderAssistantHealth();
      return gatewayHealth.state==='ok';
    }
    const requestId=++gatewayHealth.requestId;
    gatewayHealth.state='checking';
    gatewayHealth.error='';
    renderAssistantHealth();
    const ctrl=new AbortController();
    const timeout=setTimeout(function(){ctrl.abort()},10000);
    try{
      const url=new URL(gateway,window.location.href);
      url.searchParams.set('mode','ping');
      url.searchParams.set('ts',String(Date.now()));
      const response=await fetch(url.href,{method:'GET',cache:'no-store',signal:ctrl.signal});
      let data={};
      try{data=await response.json()}catch(e){}
      if(!response.ok)throw new Error('HTTP '+response.status);
      if(data&&data.ok===false)throw new Error(data.error||'passerelle indisponible');
      if(requestId!==gatewayHealth.requestId)return false;
      gatewayHealth.state='ok';
      gatewayHealth.error='';
      gatewayHealth.checkedAt=Date.now();
    }catch(error){
      if(requestId!==gatewayHealth.requestId)return false;
      gatewayHealth.state='bad';
      gatewayHealth.checkedAt=Date.now();
      gatewayHealth.error=error&&error.name==='AbortError'?'délai de connexion dépassé':(error&&error.message?error.message:'connexion à la passerelle impossible');
    }finally{
      clearTimeout(timeout);
    }
    renderAssistantHealth();
    return gatewayHealth.state==='ok';
  }
  function installAssistantHealth(){
    const status=assistantStatusNode();
    if(!status||window.__assistantHealthInstalled)return;
    window.__assistantHealthInstalled=true;
    const observer=new MutationObserver(function(){renderAssistantHealth()});
    observer.observe(status,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('store-runner:assistant-mode-changed',function(){
      setTimeout(function(){
        gatewayHealth.checkedAt=0;
        if(assistantOnline()&&assistantGateway())checkGatewayHealth(true);else renderAssistantHealth();
      },0);
    });
    document.addEventListener('click',function(e){
      const el=e.target&&e.target.closest?e.target.closest('[data-assistant-mode],button[onclick*="setAssistantMode"]'):null;
      if(el)setTimeout(function(){gatewayHealth.checkedAt=0;if(assistantOnline()&&assistantGateway())checkGatewayHealth(true);else renderAssistantHealth()},0);
    },true);
    window.storeRunnerCheckAssistantHealth=checkGatewayHealth;
    renderAssistantHealth();
  }

  function boot(){
    healStorage();
    setTimeout(healStorage,50);
    setTimeout(healStorage,250);

    // #titleSub appartient exclusivement à store-runner-branding.js (secteur + départ +
    // adresse). Ne pas y écrire ici ni ré-envelopper window.renderHeader pour ça : cela
    // écrasait silencieusement le libellé dynamique à chaque rendu de l'en-tête.
    window.addEventListener('focus',healStorage,{passive:true});
    document.addEventListener('visibilitychange',function(){if(!document.hidden)healStorage()});

    installAssistantHealth();

    const home=document.getElementById('homePanel'),badge=document.getElementById('googleCalendarBadge'),status=document.getElementById('googleCalendarStatus');
    if(!home||!badge||!status||document.getElementById('calendarHomeStatus'))return;
    const card=document.createElement('div');card.id='calendarHomeStatus';
    card.innerHTML='<div class="calendarHomeCopy" role="status"><strong></strong><small></small></div><button type="button"></button>';
    home.insertBefore(card,home.firstChild);
    function placeCard(){const host=home.querySelector('.phHeaderContext');if(host&&card.parentNode!==host)host.insertBefore(card,host.querySelector('.phSector'))}
    document.addEventListener('store-runner:home-rendered',placeCard);placeCard();
    const title=card.querySelector('strong'),detail=card.querySelector('small'),action=card.querySelector('button');
    function render(){
      healStorage();
      const googleState=window.chefGoogleStatus||{};
      const connected=googleState.connected===true;
      const heading='Google Agenda';
      if(title.textContent!==heading)title.textContent=heading;
      if(detail.textContent!==status.textContent)detail.textContent=status.textContent;
      const issue=['error','expired','offline'].includes(googleState.phase);
      card.dataset.issue=String(issue);
      action.title=status.textContent;
      action.setAttribute('aria-label',connected?'Google Agenda connecté. Synchroniser maintenant.':'Connecter Google Agenda');
      const label=googleState.phase==='syncing'?'Vérification…':googleState.phase==='offline'?'Hors ligne':googleState.phase==='expired'?'Reconnecter':issue?'À vérifier':connected?'Connecté':'Connecter';if(action.textContent!==label)action.textContent=label;
      card.dataset.connected=String(connected);
    }
    action.addEventListener('click',function(){if(window.chefGoogleStatus&&window.chefGoogleStatus.canRetry)window.syncGoogleCalendar();else window.connectGoogleCalendar()});
    const observer=new MutationObserver(render);
    observer.observe(badge,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
    observer.observe(status,{childList:true,characterData:true,subtree:true});render();
    const bar=document.querySelector('#assistantPanel .ai-modebar');
    if(bar){bar.setAttribute('role','group');bar.setAttribute('aria-label','Mode de l’assistant');
      bar.querySelectorAll('button').forEach(function(button){
        function sync(){const value=String(button.classList.contains('on'));if(button.getAttribute('aria-pressed')!==value)button.setAttribute('aria-pressed',value)}
        new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['class']});sync();
      });
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
