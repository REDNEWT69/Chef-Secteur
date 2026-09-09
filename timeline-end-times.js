(function(){
  'use strict';
  function mins(t){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):null}
  function clock(v){v=((Math.round(v)%1440)+1440)%1440;return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')}
  function decorate(){document.querySelectorAll('.timelineRow').forEach(function(row){if(row.classList.contains('calendarEvent'))return;const t=row.querySelector('.tlTime'),d=row.querySelector('.tlDuration');if(!t||!d)return;const start=mins(t.textContent),dm=String(d.dataset.baseDuration||d.textContent||'').match(/(\d+)\s*min/i);if(start==null||!dm)return;const duration=+dm[1],end=clock(start+duration);if(!d.dataset.baseDuration)d.dataset.baseDuration=duration+' min';const label=d.dataset.baseDuration+' · fin '+end;if(d.textContent!==label)d.textContent=label})}
  function hook(){if(!window.__timelineEndRenderHook&&typeof window.renderAll==='function'){const b=window.renderAll;window.renderAll=function(){const r=b.apply(this,arguments);setTimeout(decorate,60);return r};window.__timelineEndRenderHook=true}if(!window.__timelineEndWeekHook&&typeof window.renderWeek==='function'){const b=window.renderWeek;window.renderWeek=function(){const r=b.apply(this,arguments);setTimeout(decorate,60);return r};window.__timelineEndWeekHook=true}}
  function boot(){hook();decorate()}
  function scheduleBoot(){[0,100,250,600,1200].forEach(function(delay){setTimeout(boot,delay)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleBoot,{once:true});else scheduleBoot();
  window.addEventListener('load',boot,{once:true});
  window.addEventListener('focus',boot);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(boot,40)});
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#dayTabs,.periodDayTab,.dayTab'))setTimeout(decorate,80)},true);
})();
