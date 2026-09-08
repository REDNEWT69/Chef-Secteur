(function(){
  'use strict';
  const TOKEN_KEY='chef_secteur_google_token_v2';
  let timer=null;

  function hasToken(){try{return !!sessionStorage.getItem(TOKEN_KEY)}catch(e){return false}}
  function eventCount(){try{return Array.isArray(state.calendarEvents)?state.calendarEvents.length:0}catch(e){return 0}}
  function syncTime(){try{const d=state&&state.calendarLastSync?new Date(state.calendarLastSync):null;return d&&!isNaN(d)?d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}catch(e){return''}}

  function css(){
    if(document.getElementById('manager-home-fixes-css'))return;
    const s=document.createElement('style');s.id='manager-home-fixes-css';s.textContent=`
      #managerGoogleStatus{display:flex;align-items:center;gap:8px;width:max-content;max-width:100%;margin:0 0 14px;padding:8px 11px;border:1px solid rgba(255,255,255,.82);border-radius:999px;background:rgba(255,255,255,.58);color:#6f7b91;font-size:11.5px;font-weight:680;box-shadow:0 8px 24px rgba(45,65,100,.06),inset 0 1px 0 rgba(255,255,255,.86);backdrop-filter:blur(18px) saturate(1.18);-webkit-backdrop-filter:blur(18px) saturate(1.18);cursor:pointer}
      #managerGoogleStatus .gdot{width:8px;height:8px;border-radius:50%;background:#ff9f0a;box-shadow:0 0 0 4px rgba(255,159,10,.10);flex:0 0 auto}
      #managerGoogleStatus.on{color:#28734c}#managerGoogleStatus.on .gdot{background:#34c759;box-shadow:0 0 0 4px rgba(52,199,89,.12)}
      @media(max-width:700px){
        html body #bottomAppNav{left:12px!important;right:12px!important;width:auto!important;max-width:none!important;transform:none!important;margin:0!important;bottom:calc(10px + env(safe-area-inset-bottom))!important;box-sizing:border-box!important;}
        html body #bottomAppNav .bottomNavBtn{min-width:0!important;flex:1 1 0!important;}
        #managerGoogleStatus{margin:0 0 12px;font-size:11px;padding:7px 10px}
      }
    `;document.head.appendChild(s);
  }

  function openSettings(){
    try{if(typeof window.goTab==='function')window.goTab('planPanel')}catch(e){}
    setTimeout(function(){const d=document.getElementById('planningSettings');if(d)d.open=true;const t=document.getElementById('googleCalendarStatus')||document.getElementById('googleCalendarBadge')||d;if(t&&t.scrollIntoView)t.scrollIntoView({behavior:'smooth',block:'center'})},180);
  }

  function render(){
    css();
    const box=document.getElementById('premiumHomeV2');if(!box)return false;
    let el=document.getElementById('managerGoogleStatus');
    if(!el){el=document.createElement('button');el.type='button';el.id='managerGoogleStatus';el.innerHTML='<span class="gdot"></span><span class="gtxt"></span>';el.addEventListener('click',openSettings)}
    const hero=box.querySelector('.mhHero')||box.querySelector('.phVisitCard');
    if(hero&&el.parentNode!==box)box.insertBefore(el,hero);
    const on=hasToken(),n=eventCount(),t=syncTime();el.classList.toggle('on',on);const txt=el.querySelector('.gtxt');if(txt)txt.textContent=on?'Google Agenda connecté'+(n?' · '+n+' événement'+(n>1?'s':''):'')+(t?' · '+t:''):'Google Agenda non connecté · toucher pour connecter';
    return true;
  }

  function hook(){
    if(!window.__managerHomeFixRender&&typeof window.renderAll==='function'){const base=window.renderAll;window.renderAll=function(){const out=base.apply(this,arguments);setTimeout(render,40);return out};window.__managerHomeFixRender=true}
    if(!window.__managerHomeFixSync&&typeof window.syncGoogleCalendar==='function'){const base=window.syncGoogleCalendar;window.syncGoogleCalendar=async function(){const out=await base.apply(this,arguments);setTimeout(render,40);return out};window.__managerHomeFixSync=true}
    return window.__managerHomeFixRender&&window.__managerHomeFixSync;
  }

  async function boot(){
    for(let i=0;i<40;i++){
      hook();
      render();
      if(window.__managerHomeFixRender&&document.getElementById('premiumHomeV2'))break;
      await new Promise(r=>setTimeout(r,100));
    }
  }

  document.addEventListener('visibilitychange',function(){if(!document.hidden){hook();setTimeout(render,40)}});
  window.addEventListener('focus',function(){hook();setTimeout(render,40)});
  window.addEventListener('resize',function(){clearTimeout(timer);timer=setTimeout(render,80)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();