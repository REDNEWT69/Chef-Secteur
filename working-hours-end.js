(function(){
  'use strict';
  function mins(t){var p=String(t||'').split(':');return (+p[0]||0)*60+(+p[1]||0)}
  function ensure(){
    try{
      if(!state.settings)state.settings={};
      if(!state.settings.endTime)state.settings.endTime='18:00';
      return true;
    }catch(e){return false}
  }
  function routeFinish(route,day){
    if(!route||!route.length)return mins(typeof dayStartTime==='function'?dayStartTime(day):'08:30');
    var start=mins(typeof dayStartTime==='function'?dayStartTime(day):'08:30');
    var visit=Number((state.settings&&state.settings.visitMinutes)||60),km=0;
    try{
      km+=havBase(route[0]);
      for(var i=1;i<route.length;i++)km+=hav(route[i-1],route[i]);
      km+=hav(route[route.length-1],baseObj());
    }catch(e){}
    return start+(km*1.22/55*60)+(route.length*visit);
  }
  function trimToEnd(){
    if(!ensure()||!state.plan)return;
    var days=(state.settings&&state.settings.days)||['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    for(var i=0;i<days.length;i++){
      var day=days[i],route=state.plan[day]||[];
      var limit=mins(day==='Samedi'?(state.settings.saturdayEnd||'12:00'):(state.settings.endTime||'18:00'));
      while(route.length&&routeFinish(route,day)>limit)route.pop();
      state.plan[day]=route;
    }
    try{if(typeof save==='function')save()}catch(e){}
  }
  function persistEndTime(value,trim){
    if(!ensure())return;
    state.settings.endTime=value||'18:00';
    try{if(typeof save==='function')save()}catch(e){}
    if(trim){
      trimToEnd();
      try{if(typeof renderAll==='function')renderAll()}catch(e){}
    }
  }
  function installField(){
    if(!ensure())return false;
    if(document.getElementById('endTime'))return true;
    var start=document.getElementById('startTime');if(!start)return false;
    var cell=start.parentElement;if(!cell)return false;
    var grid=cell.parentElement;
    var div=document.createElement('div');
    div.innerHTML='<label>Heure de fin (lundi–vendredi)</label><input id="endTime" type="time" value="'+String(state.settings.endTime||'18:00')+'">';
    if(grid&&grid.classList.contains('premium-time'))grid.insertBefore(div,cell.nextSibling);else cell.insertAdjacentElement('afterend',div);
    var el=document.getElementById('endTime');
    el.addEventListener('input',function(){persistEndTime(this.value,false)});
    el.addEventListener('change',function(){persistEndTime(this.value,true)});
    return true;
  }
  function boot(){installField()}
  function scheduleBoot(){[0,80,220,500,1000,1800].forEach(function(delay){setTimeout(boot,delay)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleBoot,{once:true});else scheduleBoot();
  window.addEventListener('load',boot,{once:true});
  window.addEventListener('focus',boot);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)boot()});
})();
