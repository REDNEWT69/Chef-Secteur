(function(){
  'use strict';
  function ensure(){
    try{
      if(!state.settings)state.settings={};
      if(!state.settings.endTime)state.settings.endTime='18:00';
      return true;
    }catch(e){return false}
  }

  function persistEndTime(value){
    if(!ensure())return;
    state.settings.endTime=value||'18:00';
    try{if(typeof save==='function')save()}catch(e){}
  }

  function syncField(){
    if(!ensure())return false;
    var el=document.getElementById('endTime');
    if(!el)return false;
    el.value=String(state.settings.endTime||'18:00');
    return true;
  }

  function installField(){
    if(!ensure())return false;
    if(document.getElementById('endTime'))return syncField();
    var start=document.getElementById('startTime');if(!start)return false;
    var cell=start.parentElement;if(!cell)return false;
    var grid=cell.parentElement;
    var div=document.createElement('div');
    div.innerHTML='<label>Heure de fin (lundi–vendredi)</label><input id="endTime" type="time" value="'+String(state.settings.endTime||'18:00')+'"><p class="tiny">Cette heure s’applique aux prochaines générations. Le planning déjà généré est conservé.</p>';
    if(grid&&grid.classList.contains('premium-time'))grid.insertBefore(div,cell.nextSibling);else cell.insertAdjacentElement('afterend',div);
    var el=document.getElementById('endTime');
    el.addEventListener('input',function(){persistEndTime(this.value)});
    el.addEventListener('change',function(){persistEndTime(this.value)});
    return true;
  }

  /* Le point de départ reste disponible via le raccourci Départ du header et dans
     les réglages Secteur. La grosse carte du Planning est donc purement redondante. */
  function hidePlanningDepartureCard(){
    var card=document.querySelector('#planPanel .departureCard');
    if(!card)return false;
    card.hidden=true;
    card.style.setProperty('display','none','important');
    card.setAttribute('aria-hidden','true');
    return true;
  }

  function boot(){installField();hidePlanningDepartureCard()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('store-runner:data-restored',function(){syncField();hidePlanningDepartureCard()});
  document.addEventListener('store-runner:planning-updated',function(){if(!document.getElementById('endTime'))installField();hidePlanningDepartureCard()});
})();
