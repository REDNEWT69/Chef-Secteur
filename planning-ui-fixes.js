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

  function mondayLabel(){
    const m=weekMonday(),end=new Date(m);end.setDate(end.getDate()+5);
    const fmt=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'});
    const fmtEnd=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'});
    return 'Semaine du '+fmt.format(m)+' au '+fmtEnd.format(end);
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
    if(!plan||!title||!tabs||!timeline)return;

    let label=document.getElementById('planningWeekLabel');
    if(!label){
      label=document.createElement('div');
      label.id='planningWeekLabel';
      label.className='planningWeekLabel';
      const h=title.querySelector('h2');
      if(h)h.textContent='Mon agenda';
      if(h)h.insertAdjacentElement('afterend',label);else title.prepend(label);
    }
    label.textContent=mondayLabel();

    plan.insertBefore(title,plan.firstChild);
    title.insertAdjacentElement('afterend',tabs);
    tabs.insertAdjacentElement('afterend',timeline);
    if(metrics)timeline.insertAdjacentElement('afterend',metrics);
    if(saturday){
      const anchor=metrics||timeline;
      anchor.insertAdjacentElement('afterend',saturday);
    }
    if(departure){
      const anchor=saturday||metrics||timeline;
      anchor.insertAdjacentElement('afterend',departure);
    }
    if(settings)plan.appendChild(settings);
  }

  function ensureProfileFeedback(){
    const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
    if(!btn)return null;
    let box=document.getElementById('departureFeedback');
    if(!box){
      box=document.createElement('div');
      box.id='departureFeedback';
      box.className='departureFeedback';
      box.setAttribute('role','status');
      box.setAttribute('aria-live','polite');
      btn.insertAdjacentElement('afterend',box);
    }
    return box;
  }

  function feedback(message,type){
    const box=ensureProfileFeedback();
    if(!box)return;
    box.textContent=message;
    box.className='departureFeedback '+(type||'');
  }

  function toast(message){
    let t=document.getElementById('storeRunnerToast');
    if(!t){t=document.createElement('div');t.id='storeRunnerToast';t.className='storeRunnerToast';document.body.appendChild(t)}
    t.textContent=message;t.classList.add('show');
    clearTimeout(t.__hideTimer);
    t.__hideTimer=setTimeout(function(){t.classList.remove('show')},2200);
  }

  async function reverseGeocode(lat,lon){
    if(navigator.onLine===false)return '';
    try{
      const ctrl=new AbortController();
      const timer=setTimeout(function(){ctrl.abort()},6000);
      const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&zoom=18&addressdetails=1';
      const r=await fetch(url,{headers:{Accept:'application/json'},signal:ctrl.signal,cache:'no-store'});
      clearTimeout(timer);
      if(!r.ok)return '';
      const data=await r.json();
      return String(data.display_name||'').trim();
    }catch(e){return ''}
  }

  function installProfileFixes(){
    if(window.__storeRunnerProfileFixesInstalled)return;
    window.__storeRunnerProfileFixesInstalled=true;
    const originalSave=window.saveProfile;

    window.useCurrentLocation=function(){
      const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
      if(!navigator.geolocation){feedback('Localisation indisponible sur cet appareil.','bad');return}
      if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='⌖ Localisation…'}
      feedback('Recherche de ta position…','busy');
      navigator.geolocation.getCurrentPosition(async function(pos){
        const lat=Number(pos.coords.latitude),lon=Number(pos.coords.longitude);
        const latInput=document.getElementById('pBaseLat'),lonInput=document.getElementById('pBaseLon'),nameInput=document.getElementById('pBaseName'),addressInput=document.getElementById('pBaseAddress');
        if(latInput)latInput.value=lat.toFixed(6);
        if(lonInput)lonInput.value=lon.toFixed(6);
        if(nameInput)nameInput.value='Ma position actuelle';
        if(addressInput)addressInput.value='Position GPS · '+lat.toFixed(5)+', '+lon.toFixed(5);
        feedback('Position récupérée ✓','ok');
        const address=await reverseGeocode(lat,lon);
        if(address&&addressInput){addressInput.value=address;feedback('Position et adresse récupérées ✓','ok')}
        if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}
      },function(err){
        let msg='Impossible de récupérer ta position.';
        if(err&&err.code===1)msg='Localisation refusée. Autorise Store Runner à accéder à ta position dans les réglages du navigateur/iPhone.';
        else if(err&&err.code===2)msg='Position GPS indisponible pour le moment.';
        else if(err&&err.code===3)msg='La localisation a pris trop de temps. Réessaie dans un endroit avec un meilleur signal.';
        feedback(msg,'bad');
        if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}
      },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
    };

    if(typeof originalSave==='function'){
      window.saveProfile=function(){
        try{
          const result=originalSave.apply(this,arguments);
          feedback('Réglages enregistrés ✓','ok');
          toast('Réglages enregistrés ✓');
          return result;
        }catch(e){
          feedback(e&&e.message?e.message:'Enregistrement impossible.','bad');
          throw e;
        }
      };
    }
  }

  function css(){if(document.getElementById('planning-fix-css'))return;const s=document.createElement('style');s.id='planning-fix-css';s.textContent=`
    #planPanel .timelineRow{min-width:0!important}#planPanel .tlMain{min-width:0!important}#planPanel .timelineRow *{max-width:100%}
    #planPanel .applePlanTitle{margin-top:0!important;margin-bottom:10px!important;align-items:flex-end!important;flex-wrap:wrap}
    #planPanel .applePlanTitle h2{margin-bottom:2px!important}
    .planningWeekLabel{font-size:13px;color:#667085;font-weight:650;margin-top:2px;flex-basis:100%;order:2}
    #planPanel #dayTabs{margin-bottom:2px}
    #planPanel .timelineShell{margin-bottom:18px}
    #planPanel #planMetrics{margin-top:0;margin-bottom:14px}
    #planPanel .departureCard{margin-top:2px;margin-bottom:14px}
    .departureFeedback{min-height:20px;margin:7px 2px 0;font-size:12px;color:#667085;line-height:1.35}
    .departureFeedback.ok{color:#137333;font-weight:700}.departureFeedback.bad{color:#b42318;font-weight:700}.departureFeedback.busy{color:#1769d2}
    #departureSettings button:disabled{opacity:.62;cursor:wait}
    .storeRunnerToast{position:fixed;left:50%;bottom:96px;z-index:260;transform:translate(-50%,14px);background:#111827;color:#fff;padding:11px 15px;border-radius:999px;font-size:13px;font-weight:750;box-shadow:0 12px 32px rgba(17,24,39,.25);opacity:0;pointer-events:none;transition:.18s ease;white-space:nowrap;max-width:calc(100vw - 28px);overflow:hidden;text-overflow:ellipsis}
    .storeRunnerToast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:650px){#planPanel .applePlanTools{width:100%;justify-content:flex-start}.planningWeekLabel{font-size:12px}.storeRunnerToast{bottom:92px}}
  `;document.head.appendChild(s)}

  function run(){css();reorderPlanning();restoreHotelStars();ensureProfileFeedback();installProfileFixes()}
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
