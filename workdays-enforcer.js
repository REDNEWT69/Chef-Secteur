(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  function selected(){try{return new Set((state.settings&&state.settings.days)||DAYS.slice(0,5))}catch(e){return new Set(DAYS.slice(0,5))}}
  function sanitizePlan(){try{if(!state.plan)return;const keep=selected();for(const d of DAYS)if(!keep.has(d))state.plan[d]=[]}catch(e){}}
  function sanitizeArchive(){try{const keep=selected(),a=JSON.parse(localStorage.getItem(ARCHIVE_KEY)||'{}')||{};let changed=false;for(const k of Object.keys(a)){if(!a[k]||!a[k].plan)continue;for(const d of DAYS){if(!keep.has(d)&&a[k].plan[d]&&a[k].plan[d].length){a[k].plan[d]=[];changed=true}}}if(changed)localStorage.setItem(ARCHIVE_KEY,JSON.stringify(a))}catch(e){}}
  function filterTabs(){try{const keep=selected();document.querySelectorAll('#dayTabs .periodDayTab').forEach(function(b){const raw=b.dataset.date;if(!raw)return;const dt=new Date(raw+'T12:00:00'),name=dt.getDay()===0?'Dimanche':DAYS[dt.getDay()-1];b.style.display=keep.has(name)?'':'none'})}catch(e){}}
  function installHook(){if(window.__workdayEnforcer||typeof window.generateWeek!=='function')return false;const base=window.generateWeek;window.generateWeek=function(){const r=base.apply(this,arguments);sanitizePlan();try{if(typeof save==='function')save()}catch(e){}return r};window.__workdayEnforcer=true;return true}
  window.addEventListener('chef-range-generated',function(){sanitizePlan();sanitizeArchive();setTimeout(filterTabs,30);try{if(typeof renderAll==='function')renderAll()}catch(e){}});
  document.addEventListener('change',function(e){if(e.target&&e.target.matches&&e.target.matches('[data-day]'))setTimeout(function(){sanitizePlan();sanitizeArchive();filterTabs()},20)});
  let n=0,t=setInterval(function(){n++;installHook();sanitizePlan();filterTabs();if(n>120)clearInterval(t)},100);
})();
