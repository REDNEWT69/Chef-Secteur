(function(){
  'use strict';

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

  function boot(){
    healStorage();
    setTimeout(healStorage,50);
    setTimeout(healStorage,250);
    setInterval(healStorage,1500);

    function updateSectorSubtitle(){
      const sub=document.getElementById('titleSub');
      if(!sub||typeof state==='undefined')return;
      const sector=String((state.profile&&state.profile.sectorName)||'Rhône-Alpes').replace(/^samsung\s*[·:–—-]?\s*/i,'').trim()||'Rhône-Alpes';
      const stores=typeof window.activeStores==='function'?window.activeStores():(state.stores||[]).filter(s=>s.active!==false);
      const label=sector+' · '+stores.length+' magasins';
      if(sub.textContent!==label)sub.textContent=label;
    }
    if(typeof window.renderHeader==='function'&&!window.__sectorSubtitleInstalled){
      const original=window.renderHeader;
      window.renderHeader=function(){const result=original.apply(this,arguments);updateSectorSubtitle();healStorage();return result};
      window.__sectorSubtitleInstalled=true;
    }
    updateSectorSubtitle();
    const home=document.getElementById('homePanel'),badge=document.getElementById('googleCalendarBadge'),status=document.getElementById('googleCalendarStatus');
    if(!home||!badge||!status||document.getElementById('calendarHomeStatus'))return;
    const card=document.createElement('div');card.id='calendarHomeStatus';
    card.innerHTML='<div class="calendarHomeCopy" role="status"><strong></strong><small></small></div><button type="button"></button>';
    home.insertBefore(card,home.firstChild);
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
