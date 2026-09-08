(function(){
  'use strict';
  function boot(){
    const home=document.getElementById('homePanel'),badge=document.getElementById('googleCalendarBadge'),status=document.getElementById('googleCalendarStatus');
    if(!home||!badge||!status||document.getElementById('calendarHomeStatus'))return;
    const card=document.createElement('div');card.id='calendarHomeStatus';
    card.innerHTML='<div class="calendarHomeCopy" role="status"><strong></strong><small></small></div><button type="button"></button>';
    home.insertBefore(card,home.firstChild);
    const title=card.querySelector('strong'),detail=card.querySelector('small'),action=card.querySelector('button');
    function render(){
      const connected=badge.classList.contains('on');
      const heading='Google Agenda · '+(badge.textContent.trim()||'État en cours de vérification');
      if(title.textContent!==heading)title.textContent=heading;
      if(detail.textContent!==status.textContent)detail.textContent=status.textContent;
      const label=connected?'Synchroniser':'Connecter';if(action.textContent!==label)action.textContent=label;
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
