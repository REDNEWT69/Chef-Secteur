(function(){
  'use strict';
  let observer=null,scheduled=false;
  function mins(t){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):null}
  function clock(v){v=((Math.round(v)%1440)+1440)%1440;return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')}
  function decorate(){document.querySelectorAll('.timelineRow').forEach(function(row){if(row.classList.contains('calendarEvent'))return;const t=row.querySelector('.tlTime'),d=row.querySelector('.tlDuration');if(!t||!d)return;const start=mins(t.textContent),dm=String(d.dataset.baseDuration||d.textContent||'').match(/(\d+)\s*min/i);if(start==null||!dm)return;const duration=+dm[1],end=clock(start+duration);if(!d.dataset.baseDuration)d.dataset.baseDuration=duration+' min';const label=d.dataset.baseDuration+' · fin '+end;if(d.textContent!==label)d.textContent=label})}
  function schedule(){if(scheduled)return;scheduled=true;setTimeout(function(){scheduled=false;decorate()},40)}
  function observeTimeline(){if(observer)return true;const host=document.getElementById('planPanel')||document.querySelector('.timelineShell');if(!host)return false;observer=new MutationObserver(function(records){for(const r of records){if(r.type==='characterData'||(r.addedNodes&&r.addedNodes.length)){schedule();return}}});observer.observe(host,{childList:true,subtree:true,characterData:true});return true}
  function boot(){decorate();observeTimeline()}
  function scheduleBoot(){[0,100,250,600,1200].forEach(function(delay){setTimeout(boot,delay)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleBoot,{once:true});else scheduleBoot();
  window.addEventListener('load',boot,{once:true});
  window.addEventListener('focus',schedule);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule()});
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#dayTabs,.periodDayTab,.dayTab'))setTimeout(decorate,80)},true);
  window.addEventListener('chef-range-generated',schedule);
})();
