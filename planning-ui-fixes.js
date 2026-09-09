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

  function selectedDayIndex(){
    const tabs=[...document.querySelectorAll('#dayTabs .dayTab')];
    const idx=tabs.findIndex(b=>b.classList.contains('active'));
    return idx>=0?idx:0;
  }
  function selectedDayDate(){const d=weekMonday();d.setDate(d.getDate()+selectedDayIndex());return d}
  function dayHeroLabel(){
    const d=selectedDayDate();
    const day=new Intl.DateTimeFormat('fr-FR',{weekday:'long'}).format(d);
    return day.charAt(0).toUpperCase()+day.slice(1)+' '+d.getDate();
  }
  function fullDayLabel(){
    const d=selectedDayDate();
    return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(d);
  }
  function weekLabel(){
    const m=weekMonday(),end=new Date(m);end.setDate(end.getDate()+5);
    const a=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'}).format(m);
    const b=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(end);
    return 'Semaine du '+a+' au '+b;
  }

  function ensurePlanningHero(plan,title){
    let hero=document.getElementById('planningHeroV2');
    if(!hero){
      hero=document.createElement('section');hero.id='planningHeroV2';hero.className='planningHeroV2';
      hero.innerHTML='<div class="planningHeroTop"><span class="planningHeroPill">Cette semaine</span><span id="planningHeroWeek" class="planningHeroWeek"></span></div><div id="planningHeroDay" class="planningHeroDay"></div><div id="planningHeroFull" class="planningHeroFull"></div>';
    }
    if(hero.parentNode!==plan)plan.insertBefore(hero,plan.firstChild);
    const day=document.getElementById('planningHeroDay'),full=document.getElementById('planningHeroFull'),week=document.getElementById('planningHeroWeek');
    if(day)day.textContent=dayHeroLabel();if(full)full.textContent=fullDayLabel();if(week)week.textContent=weekLabel();
    if(title)title.style.display='none';
    return hero;
  }

  function syncSmartBrief(){
    const brief=document.getElementById('smartBrief');
    const plan=document.getElementById('planPanel');
    if(!brief||!plan)return;
    brief.style.display=plan.classList.contains('active')?'none':'';
  }

  function reorderPlanning(){
    const plan=document.querySelector('#planPanel .applePlan');
    const title=plan&&plan.querySelector('.applePlanTitle');
    const tabs=document.getElementById('dayTabs');
    const timeline=plan&&plan.querySelector('.timelineShell');
    const metrics=document.getElementById('planMetrics');
    const saturday=document.getElementById('saturdayRecommendation');
    const departure=plan&&plan.querySelector('.departureCard');
    const settings=document.getElementById('planningSettings');
    if(!plan||!tabs||!timeline)return;

    const hero=ensurePlanningHero(plan,title);
    hero.insertAdjacentElement('afterend',tabs);

    let tools=document.getElementById('planningToolsV2');
    if(!tools){
      tools=document.createElement('div');tools.id='planningToolsV2';tools.className='planningToolsV2';
      tools.innerHTML='<button class="secondary" type="button" onclick="showPlanMap()">⌖ Ouvrir la tournée</button><button class="secondary" type="button" onclick="generateWeek()">↝ Réorganiser</button>';
    }
    tabs.insertAdjacentElement('afterend',tools);
    tools.insertAdjacentElement('afterend',timeline);

    const monthly=document.querySelector('#planPanel #managerPlanningMonth, #planPanel .managerPlanningMonth, #planPanel .monthPlanning, #planPanel [data-planning-month]');
    let anchor=timeline;
    if(monthly){anchor.insertAdjacentElement('afterend',monthly);anchor=monthly}
    if(metrics){anchor.insertAdjacentElement('afterend',metrics);anchor=metrics}
    if(saturday){anchor.insertAdjacentElement('afterend',saturday);anchor=saturday}
    if(departure){anchor.insertAdjacentElement('afterend',departure);anchor=departure}
    if(settings)plan.appendChild(settings);
  }

  function css(){if(document.getElementById('planning-fix-css'))return;const s=document.createElement('style');s.id='planning-fix-css';s.textContent=`
    #planPanel .timelineRow{min-width:0!important}#planPanel .tlMain{min-width:0!important}#planPanel .timelineRow *{max-width:100%}
    #planPanel .applePlan{padding-top:2px!important}
    body:has(#planPanel.active) #smartBrief{display:none!important}
    #planPanel #iosDayHero{display:none!important}
    .planningHeroV2{margin:0 0 8px;padding:8px 2px 2px;background:transparent;border:0;box-shadow:none}
    .planningHeroTop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}
    .planningHeroPill{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.78);border:1px solid rgba(60,60,67,.12);font-size:11px;font-weight:800;color:#667085;box-shadow:0 4px 14px rgba(31,41,55,.04)}
    .planningHeroWeek{font-size:11px;color:#8a93a2;font-weight:650;text-align:right}
    .planningHeroDay{font-family:Georgia,"Times New Roman",serif;font-size:44px;line-height:.98;letter-spacing:-.045em;font-weight:500;color:#111318;margin:0}
    .planningHeroFull{font-size:14px;color:#717987;margin-top:8px;font-weight:600}
    #planPanel #dayTabs{margin:10px 0 8px;padding-bottom:2px}
    .planningToolsV2{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
    .planningToolsV2 button{min-height:40px;padding:9px 13px}
    #planPanel .timelineShell{margin-bottom:20px}
    #planPanel #planMetrics{margin:18px 0 14px!important}
    #planPanel .departureCard{margin:8px 0 14px!important}
    #planPanel #saturdayRecommendation:empty{display:none}
    @media(max-width:650px){.planningHeroV2{padding-top:2px}.planningHeroTop{align-items:flex-start}.planningHeroWeek{max-width:58%;line-height:1.3}.planningHeroDay{font-size:50px}.planningHeroFull{font-size:13px}.planningToolsV2{margin-bottom:10px}.planningToolsV2 button{flex:1 1 0}}
  `;document.head.appendChild(s)}

  function run(){css();syncSmartBrief();reorderPlanning();restoreHotelStars()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;run()})}
  function observeDayTabs(){const tabs=document.getElementById('dayTabs');if(!tabs||tabs.__planningFixObserver)return;const observer=new MutationObserver(schedule);observer.observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});tabs.__planningFixObserver=observer}
  function observePlanPanel(){const plan=document.getElementById('planPanel');if(!plan||plan.__planningActiveObserver)return;const observer=new MutationObserver(schedule);observer.observe(plan,{attributes:true,attributeFilter:['class']});plan.__planningActiveObserver=observer}
  function boot(){run();observeDayTabs();observePlanPanel();[120,500,900].forEach(function(delay){setTimeout(function(){run();observeDayTabs();observePlanPanel()},delay)})}
  document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(schedule,60)},true);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(run,120)});
  window.addEventListener('focus',function(){setTimeout(run,120)});
  window.addEventListener('load',function(){setTimeout(run,180)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
