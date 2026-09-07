(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function ensure(){
    try{
      if(!state.settings)state.settings={};
      if(!Number(state.settings.maxVisitsPerDay))state.settings.maxVisitsPerDay=4;
      return true;
    }catch(e){return false}
  }
  function selectedDays(){try{return (state.settings&&state.settings.days)||DAYS.slice(0,5)}catch(e){return DAYS.slice(0,5)}}
  function capPlan(){
    if(!ensure()||!state.plan)return;
    const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
    const days=selectedDays();
    for(const day of days){
      const route=state.plan[day]||[];
      if(route.length>max)state.plan[day]=route.slice(0,max);
    }
    try{if(typeof save==='function')save()}catch(e){}
  }
  function installField(){
    if(!ensure())return false;
    if(document.getElementById('maxVisitsPerDay'))return true;
    const target=document.getElementById('target');if(!target)return false;
    const label=document.createElement('label');label.textContent='Maximum de visites par jour';
    const input=document.createElement('input');input.id='maxVisitsPerDay';input.type='number';input.min='1';input.max='8';input.value=String(state.settings.maxVisitsPerDay||4);
    const hint=document.createElement('p');hint.className='tiny';hint.textContent='Mode forfait jours : le planning ne compacte jamais tout l’objectif hebdomadaire sur une seule journée disponible.';
    target.insertAdjacentElement('afterend',hint);hint.insertAdjacentElement('beforebegin',input);input.insertAdjacentElement('beforebegin',label);
    input.addEventListener('change',function(){state.settings.maxVisitsPerDay=Math.max(1,Math.min(8,Number(this.value)||4));capPlan();try{if(typeof renderAll==='function')renderAll()}catch(e){}});
    return true;
  }
  function hooks(){
    if(!window.__dailyCapGenerate&&typeof window.generateWeek==='function'){
      const base=window.generateWeek;window.generateWeek=function(){const r=base.apply(this,arguments);capPlan();try{if(typeof renderAll==='function')renderAll()}catch(e){}return r};window.__dailyCapGenerate=true;
    }
    if(!window.__dailyCapRead&&typeof window.readPlanningControls==='function'){
      const base=window.readPlanningControls;window.readPlanningControls=function(){const r=base.apply(this,arguments);ensure();const el=document.getElementById('maxVisitsPerDay');if(el)state.settings.maxVisitsPerDay=Math.max(1,Math.min(8,Number(el.value)||4));return r};window.__dailyCapRead=true;
    }
  }
  let n=0,t=setInterval(function(){n++;installField();hooks();if(n>120)clearInterval(t)},100);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){installField();hooks()});else setTimeout(function(){installField();hooks()},0);
})();
