(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';

  /* P0.4-B1 — le réglage des jours travaillés est prospectif : il dit aux prochaines
     générations quels jours utiliser (les moteurs lisent state.settings.days), il ne
     supprime rien de ce qui est déjà planifié. Ce module ne vide donc plus aucun jour :
     ni state.plan, ni l'archive, ni une semaine manuelle, ni state.manualWeekEdits. Une
     visite posée un jour désormais décoché reste telle quelle jusqu'à une action
     explicite (déplacement, suppression, génération ou recalcul demandé). Il ne fait plus
     que masquer l'onglet d'un jour décoché, et seulement quand ce jour est vide. */

  function selected(){
    try{return new Set((state.settings&&state.settings.days)||DAYS.slice(0,5))}
    catch(e){return new Set(DAYS.slice(0,5))}
  }

  function weekKey(raw){
    const d=new Date(String(raw||'').slice(0,10)+'T12:00:00');if(isNaN(d))return'';
    d.setDate(d.getDate()-((d.getDay()||7)-1));
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function loadArchive(){
    try{return JSON.parse((window.__chefStorage||localStorage).getItem(ARCHIVE_KEY)||'{}')||{}}
    catch(e){return{}}
  }

  /* Visites déjà posées à cette date : la semaine affichée vit dans state.plan, les autres
     dans l'archive (même lecture que visit-coverage.js). */
  function hasVisits(raw,name,archive){
    try{
      const key=weekKey(raw),shown=weekKey(state.settings&&state.settings.weekDate);
      const plan=key&&key===shown?state.plan:((archive()[key]||{}).plan);
      return !!(plan&&Array.isArray(plan[name])&&plan[name].length);
    }catch(e){return false}
  }

  function filterTabs(){
    try{
      const keep=selected();let cached=null;
      const archive=function(){return cached||(cached=loadArchive())};
      document.querySelectorAll('#dayTabs .periodDayTab').forEach(function(b){
        const raw=b.dataset.date;
        if(!raw)return;
        const dt=new Date(raw+'T12:00:00'),name=dt.getDay()===0?'Dimanche':DAYS[dt.getDay()-1];
        b.style.display=keep.has(name)||hasVisits(raw,name,archive)?'':'none';
      });
    }catch(e){}
  }

  function apply(){
    filterTabs();
  }

  window.addEventListener('chef-range-generated',function(){
    setTimeout(filterTabs,30);
    try{if(typeof renderAll==='function')renderAll()}catch(e){}
  });

  document.addEventListener('change',function(e){
    if(e.target&&e.target.matches&&e.target.matches('[data-day]')){
      setTimeout(filterTabs,20);
    }
  });

  function boot(){
    apply();
    setTimeout(apply,80);
    setTimeout(apply,250);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();

  window.addEventListener('load',apply);
  window.addEventListener('focus',apply);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)apply()});
})();
