(function(){
  'use strict';
  function boot(){
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
      window.renderHeader=function(){const result=original.apply(this,arguments);updateSectorSubtitle();return result};
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
      const connected=badge.classList.contains('on');
      const heading='Google Agenda';
      if(title.textContent!==heading)title.textContent=heading;
      if(detail.textContent!==status.textContent)detail.textContent=status.textContent;
      const issue=/impossible|expirée|refusée|erreur/i.test(status.textContent);
      card.dataset.issue=String(issue);
      action.title=status.textContent;
      action.setAttribute('aria-label',connected?'Google Agenda connecté. Synchroniser maintenant.':'Connecter Google Agenda');
      const label=issue?'À vérifier':connected?'Connecté':'Connecter';if(action.textContent!==label)action.textContent=label;
      card.dataset.connected=String(connected);
    }
    action.addEventListener('click',function(){if(badge.classList.contains('on'))window.syncGoogleCalendar();else window.connectGoogleCalendar()});
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
