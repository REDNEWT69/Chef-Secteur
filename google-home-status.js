(function(){
  'use strict';
  const TOKEN_KEY='chef_secteur_google_token_v2';
  let timer=null;

  function hasToken(){try{return !!sessionStorage.getItem(TOKEN_KEY)}catch(e){return false}}
  function eventCount(){try{return Array.isArray(state.calendarEvents)?state.calendarEvents.length:0}catch(e){return 0}}
  function lastSync(){try{return state&&state.calendarLastSync?new Date(state.calendarLastSync):null}catch(e){return null}}
  function fmtTime(d){try{return d&&!isNaN(d.getTime())?d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}catch(e){return''}}

  function ensureCss(){
    if(document.getElementById('google-home-status-css'))return;
    const s=document.createElement('style');
    s.id='google-home-status-css';
    s.textContent=`
      #homeGoogleStatus{display:flex;align-items:center;gap:8px;width:max-content;max-width:100%;margin:-10px 0 16px;padding:8px 11px;border:1px solid rgba(255,255,255,.78);border-radius:999px;background:rgba(255,255,255,.54);color:#6f747d;font-size:11.5px;font-weight:650;box-shadow:0 8px 24px rgba(35,40,55,.05);backdrop-filter:blur(18px) saturate(1.15);-webkit-backdrop-filter:blur(18px) saturate(1.15);cursor:pointer}
      #homeGoogleStatus .gdot{width:8px;height:8px;border-radius:50%;background:#a1a7b0;box-shadow:0 0 0 4px rgba(161,167,176,.10);flex:0 0 auto}
      #homeGoogleStatus.on{color:#28734c}#homeGoogleStatus.on .gdot{background:#34c759;box-shadow:0 0 0 4px rgba(52,199,89,.12)}
      #homeGoogleStatus.warn{color:#9a6700}#homeGoogleStatus.warn .gdot{background:#ff9f0a;box-shadow:0 0 0 4px rgba(255,159,10,.12)}
      @media(max-width:700px){#homeGoogleStatus{margin:-7px 0 14px;font-size:11px;padding:7px 10px}}
    `;
    document.head.appendChild(s);
  }

  function openCalendarSettings(){
    try{if(typeof window.goTab==='function')window.goTab('planPanel')}catch(e){}
    setTimeout(function(){
      const details=document.getElementById('planningSettings');if(details)details.open=true;
      const target=document.getElementById('googleCalendarStatus')||document.getElementById('googleCalendarBadge')||document.getElementById('googleClientId')||details;
      if(target&&target.scrollIntoView)target.scrollIntoView({behavior:'smooth',block:'center'});
    },180);
  }

  function render(){
    ensureCss();
    const home=document.getElementById('premiumHomeV2')||document.getElementById('homePanel');
    if(!home)return false;
    let el=document.getElementById('homeGoogleStatus');
    if(!el){
      el=document.createElement('button');el.type='button';el.id='homeGoogleStatus';el.innerHTML='<span class="gdot"></span><span class="gtxt"></span>';
      el.addEventListener('click',openCalendarSettings);
      const hero=home.querySelector('.phVisitCard');
      if(hero&&hero.parentNode===home)home.insertBefore(el,hero);else home.insertBefore(el,home.firstChild);
    }
    const token=hasToken(),n=eventCount(),d=lastSync(),t=fmtTime(d);
    el.classList.toggle('on',token);el.classList.toggle('warn',!token);
    const txt=el.querySelector('.gtxt');
    if(txt){
      if(token)txt.textContent='Google Agenda connecté'+(n?' · '+n+' événement'+(n>1?'s':''):'')+(t?' · '+t:'');
      else txt.textContent='Google Agenda non connecté · toucher pour connecter';
    }
    return true;
  }

  function hook(){
    if(!window.__homeGoogleSyncHook&&typeof window.syncGoogleCalendar==='function'){
      const base=window.syncGoogleCalendar;
      window.syncGoogleCalendar=async function(){
        const out=await base.apply(this,arguments);setTimeout(render,30);return out;
      };
      window.__homeGoogleSyncHook=true;
    }
    if(!window.__homeGoogleRenderHook&&typeof window.renderAll==='function'){
      const base=window.renderAll;
      window.renderAll=function(){const out=base.apply(this,arguments);setTimeout(render,30);return out};
      window.__homeGoogleRenderHook=true;
    }
  }

  let tries=0;
  const boot=setInterval(function(){tries++;hook();render();if(tries>120)clearInterval(boot)},100);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(render,50)});
  window.addEventListener('storage',function(){setTimeout(render,30)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){hook();render()});else setTimeout(function(){hook();render()},0);
})();