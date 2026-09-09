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

  function ensureProfileFeedback(){
    const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
    if(!btn)return null;
    let box=document.getElementById('departureFeedback');
    if(!box){box=document.createElement('div');box.id='departureFeedback';box.className='departureFeedback';box.setAttribute('role','status');box.setAttribute('aria-live','polite');btn.insertAdjacentElement('afterend',box)}
    return box;
  }
  function feedback(message,type){const box=ensureProfileFeedback();if(!box)return;box.textContent=message;box.className='departureFeedback '+(type||'')}
  function toast(message){let t=document.getElementById('storeRunnerToast');if(!t){t=document.createElement('div');t.id='storeRunnerToast';t.className='storeRunnerToast';document.body.appendChild(t)}t.textContent=message;t.classList.add('show');clearTimeout(t.__hideTimer);t.__hideTimer=setTimeout(function(){t.classList.remove('show')},2200)}

  async function reverseGeocode(lat,lon){
    if(navigator.onLine===false)return '';
    try{const ctrl=new AbortController(),timer=setTimeout(function(){ctrl.abort()},6000),url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&zoom=18&addressdetails=1',r=await fetch(url,{headers:{Accept:'application/json'},signal:ctrl.signal,cache:'no-store'});clearTimeout(timer);if(!r.ok)return '';const data=await r.json();return String(data.display_name||'').trim()}catch(e){return ''}
  }

  function validBase(){return window.state&&state.profile&&isFinite(Number(state.profile.baseLat))&&isFinite(Number(state.profile.baseLon))&&Math.abs(Number(state.profile.baseLat))>1&&Math.abs(Number(state.profile.baseLon))>1}
  function installPersistedBaseOverride(){
    if(!validBase())return;
    window.baseObj=function(){return{id:'BASE',enseigne:'Départ',ville:state.profile.baseName||'Départ',adresse:state.profile.baseAddress||'',lat:Number(state.profile.baseLat),lon:Number(state.profile.baseLon)}};
    window.havBase=function(store){return typeof hav==='function'?hav(baseObj(),store):0};
    if(typeof window.renderHeader==='function')try{window.renderHeader()}catch(e){}
  }

  function installProfileFixes(){
    window.useCurrentLocation=function(){
      const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
      if(!navigator.geolocation){feedback('Localisation indisponible sur cet appareil.','bad');return}
      if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='⌖ Localisation…'}
      feedback('Recherche de ta position…','busy');
      navigator.geolocation.getCurrentPosition(async function(pos){
        const lat=Number(pos.coords.latitude),lon=Number(pos.coords.longitude),latInput=document.getElementById('pBaseLat'),lonInput=document.getElementById('pBaseLon'),nameInput=document.getElementById('pBaseName'),addressInput=document.getElementById('pBaseAddress');
        if(latInput)latInput.value=lat.toFixed(6);if(lonInput)lonInput.value=lon.toFixed(6);if(nameInput)nameInput.value='Ma position actuelle';if(addressInput)addressInput.value='Position GPS · '+lat.toFixed(5)+', '+lon.toFixed(5);
        feedback('Position récupérée ✓','ok');
        const address=await reverseGeocode(lat,lon);if(address&&addressInput){addressInput.value=address;feedback('Position et adresse récupérées ✓','ok')}
        if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}
      },function(err){let msg='Impossible de récupérer ta position.';if(err&&err.code===1)msg='Localisation refusée. Autorise Store Runner à accéder à ta position.';else if(err&&err.code===2)msg='Position GPS indisponible pour le moment.';else if(err&&err.code===3)msg='La localisation a pris trop de temps.';feedback(msg,'bad');if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
    };

    window.saveProfile=function(){
      try{
        const lat=parseFloat(document.getElementById('pBaseLat').value),lon=parseFloat(document.getElementById('pBaseLon').value);
        if(isNaN(lat)||isNaN(lon))throw new Error('Latitude/longitude de base obligatoires.');
        state.profile.sectorName=document.getElementById('pSector').value.trim()||'Mon secteur';
        state.profile.repName=document.getElementById('pRep').value.trim();
        state.profile.baseName=document.getElementById('pBaseName').value.trim()||'Départ';
        state.profile.baseAddress=document.getElementById('pBaseAddress').value.trim();
        state.profile.baseLat=lat;state.profile.baseLon=lon;
        state.profile.overnightMode=document.getElementById('pOvernight').value;
        state.profile.overnightMinSaving=parseFloat(document.getElementById('pSaving').value)||80;
        save();installPersistedBaseOverride();if(typeof renderAll==='function')renderAll();feedback('Réglages enregistrés ✓','ok');toast('Réglages enregistrés ✓');
      }catch(e){feedback(e&&e.message?e.message:'Enregistrement impossible.','bad');if(typeof showError==='function')showError(e.message||String(e));throw e}
    };
  }

  function css(){if(document.getElementById('planning-fix-css'))return;const s=document.createElement('style');s.id='planning-fix-css';s.textContent=`
    #planPanel .timelineRow{min-width:0!important}#planPanel .tlMain{min-width:0!important}#planPanel .timelineRow *{max-width:100%}
    #planPanel .applePlan{padding-top:2px!important}
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
    .departureFeedback{min-height:20px;margin:7px 2px 0;font-size:12px;color:#667085;line-height:1.35}
    .departureFeedback.ok{color:#137333;font-weight:700}.departureFeedback.bad{color:#b42318;font-weight:700}.departureFeedback.busy{color:#1769d2}
    #departureSettings button:disabled{opacity:.62;cursor:wait}
    .storeRunnerToast{position:fixed;left:50%;bottom:96px;z-index:260;transform:translate(-50%,14px);background:#111827;color:#fff;padding:11px 15px;border-radius:999px;font-size:13px;font-weight:750;box-shadow:0 12px 32px rgba(17,24,39,.25);opacity:0;pointer-events:none;transition:.18s ease;white-space:nowrap;max-width:calc(100vw - 28px);overflow:hidden;text-overflow:ellipsis}
    .storeRunnerToast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:650px){.planningHeroV2{padding-top:2px}.planningHeroTop{align-items:flex-start}.planningHeroWeek{max-width:58%;line-height:1.3}.planningHeroDay{font-size:50px}.planningHeroFull{font-size:13px}.planningToolsV2{margin-bottom:10px}.planningToolsV2 button{flex:1 1 0}.storeRunnerToast{bottom:92px}}
  `;document.head.appendChild(s)}

  function run(){css();reorderPlanning();restoreHotelStars();ensureProfileFeedback();installProfileFixes();installPersistedBaseOverride()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;run()})}
  function observeDayTabs(){const tabs=document.getElementById('dayTabs');if(!tabs||tabs.__planningFixObserver)return;const observer=new MutationObserver(schedule);observer.observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});tabs.__planningFixObserver=observer}
  function boot(){run();observeDayTabs();[120,500,900].forEach(function(delay){setTimeout(function(){run();observeDayTabs()},delay)})}
  document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(schedule,60)},true);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(run,120)});
  window.addEventListener('focus',function(){setTimeout(run,120)});
  window.addEventListener('load',function(){setTimeout(run,180)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
