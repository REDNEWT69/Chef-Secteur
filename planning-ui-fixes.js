(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let busy=false;
  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function selectedDay(){try{const active=document.querySelector('#dayTabs .dayTab.active');if(active){const t=active.textContent||'';const d=DAYS.find(x=>norm(t).includes(norm(x)));if(d)return d}return window.selectedPlanningDay||((state.settings&&state.settings.days)||DAYS)[0]||'Lundi'}catch(e){return'Lundi'}}
  function toMin(v){if(v==null)return null;const m=String(v).match(/(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):null}
  function fmt(m){m=Math.round(m);return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
  function finishFor(row){const a=toMin(row&&row.arrival);if(a==null)return null;const dur=Number(row.duration||((state.settings&&state.settings.visitMinutes)||60));return fmt(a+(Number.isFinite(dur)?dur:60))}
  function decorateFinishTimes(){
    if(typeof window.daySchedule!=='function')return;
    const day=selectedDay();let sched=[];try{sched=window.daySchedule(day)||[]}catch(e){return}
    const stores=sched.filter(r=>r&&r.kind==='store');
    const rows=Array.from(document.querySelectorAll('#planPanel .timelineRow:not(.calendarEvent)'));
    rows.forEach((el,i)=>{
      el.querySelectorAll('.finishTimeBadge').forEach(x=>x.remove());
      const r=stores[i];if(!r)return;const end=finishFor(r);if(!end)return;
      const chip=document.createElement('span');chip.className='finishTimeBadge';chip.textContent='fin '+end;chip.style.cssText='display:inline-block;margin-left:6px;padding:3px 7px;border-radius:999px;background:#f2f4f7;color:#475467;font-size:10px;font-weight:750;vertical-align:middle;white-space:nowrap';
      const durNode=Array.from(el.querySelectorAll('*')).find(x=>/^\s*\d+\s*min\s*$/i.test(x.textContent||''));
      if(durNode)durNode.appendChild(chip);else{const main=el.querySelector('.tlMain')||el;main.appendChild(chip)}
    });
  }
  function dateOnly(v){const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
  function weekMonday(){try{const raw=(state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10),d=new Date(raw+'T12:00:00'),w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d}catch(e){return new Date()}}
  function isoForIndex(i){const d=weekMonday();d.setDate(d.getDate()+i);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function eventCovers(e,date){if(typeof window.chefSecteurEventCoversDate==='function')try{return window.chefSecteurEventCoversDate(e,date)}catch(err){}const s=dateOnly(e&&(e.date||e.start));if(!s)return false;let end=dateOnly(e&&e.end)||s;if(e&&e.allDay&&end>s){const d=new Date(end+'T12:00:00');d.setDate(d.getDate()-1);end=d.toISOString().slice(0,10)}return date>=s&&date<=end}
  function hasHotel(date){try{return (state.calendarEvents||[]).some(e=>eventCovers(e,date)&&/(hotel|hôtel|hebergement|hébergement|b&b|b\s*&\s*b)/i.test((e.title||'')+' '+(e.location||'')))}catch(e){return false}}
  function restoreHotelStars(){
    document.querySelectorAll('#dayTabs .dayTab').forEach((btn,i)=>{
      btn.querySelectorAll('.hotelStarBadge').forEach(x=>x.remove());
      if(!hasHotel(isoForIndex(i)))return;
      const s=document.createElement('span');s.className='hotelStarBadge';s.textContent='✦ hôtel';s.style.cssText='display:block;margin-top:4px;font-size:9px;font-weight:850;color:#9a6200';btn.appendChild(s);
    });
    const banner=document.getElementById('planningHotelBanner');if(banner&&!banner.querySelector('.hotelCornerStar')){const s=document.createElement('div');s.className='hotelCornerStar';s.textContent='✦';s.style.cssText='position:absolute;right:14px;top:10px;font-size:18px;color:#c98a00';banner.style.position='relative';banner.appendChild(s)}
  }
  function css(){if(document.getElementById('planning-fix-css'))return;const s=document.createElement('style');s.id='planning-fix-css';s.textContent='#planPanel .timelineRow{min-width:0!important}#planPanel .tlMain{min-width:0!important}#planPanel .timelineRow *{max-width:100%}';document.head.appendChild(s)}
  function run(){if(busy)return;busy=true;try{css();decorateFinishTimes();restoreHotelStars()}finally{busy=false}}
  function hook(){
    let hooked=false;
    if(!window.__finishWeekHook&&typeof window.renderWeek==='function'){
      const base=window.renderWeek;window.renderWeek=function(){const out=base.apply(this,arguments);setTimeout(run,0);return out};window.__finishWeekHook=true;hooked=true;
    }
    if(!window.__finishAllHook&&typeof window.renderAll==='function'){
      const base=window.renderAll;window.renderAll=function(){const out=base.apply(this,arguments);setTimeout(run,0);return out};window.__finishAllHook=true;hooked=true;
    }
    return hooked||window.__finishWeekHook||window.__finishAllHook;
  }
  function boot(){
    hook();run();
    [120,300,700,1400].forEach(delay=>setTimeout(function(){hook();run()},delay));
  }
  document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(run,40)},true);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){hook();setTimeout(run,40)}});
  window.addEventListener('focus',function(){hook();setTimeout(run,40)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();