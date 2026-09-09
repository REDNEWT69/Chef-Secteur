(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let scheduled=false;

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
    const banner=document.getElementById('planningHotelBanner');
    if(banner&&!banner.querySelector('.hotelCornerStar')){const s=document.createElement('div');s.className='hotelCornerStar';s.textContent='✦';s.style.cssText='position:absolute;right:14px;top:10px;font-size:18px;color:#c98a00';banner.style.position='relative';banner.appendChild(s)}
  }

  function css(){if(document.getElementById('planning-fix-css'))return;const s=document.createElement('style');s.id='planning-fix-css';s.textContent='#planPanel .timelineRow{min-width:0!important}#planPanel .tlMain{min-width:0!important}#planPanel .timelineRow *{max-width:100%}';document.head.appendChild(s)}
  function run(){css();restoreHotelStars()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;run()})}

  function observeDayTabs(){
    const tabs=document.getElementById('dayTabs');
    if(!tabs||tabs.__hotelStarsObserver)return;
    const observer=new MutationObserver(schedule);
    observer.observe(tabs,{childList:true,subtree:true});
    tabs.__hotelStarsObserver=observer;
  }

  function boot(){run();observeDayTabs();setTimeout(function(){run();observeDayTabs()},120);setTimeout(function(){run();observeDayTabs()},500)}
  document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(schedule,40)},true);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(schedule,40)});
  window.addEventListener('focus',function(){setTimeout(schedule,40)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
