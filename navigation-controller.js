(function(){
  'use strict';
  let returnToPlanning=false;
  let installed=false;
  let dragStartY=null;
  let suppressNextQuickOpen=false;

  const SETTINGS_ID='planningSettings';
  const SETTINGS_SHORTCUT_ID='planningSettingsShortcut';
  const SETTINGS_SHEET_CLASS='planningSettingsSheetOpen';
  const SETTINGS_HEADER_ID='planningSettingsSheetHeader';

  function activatePlanning(){
    if(typeof window.goTab==='function')window.goTab('planPanel');
    else if(typeof window.switchTab==='function')window.switchTab('planPanel',null);
    if(typeof window.syncBottomNav==='function'){
      try{window.syncBottomNav('planPanel')}catch(e){}
    }
  }

  function goPlanning(){
    activatePlanning();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function isDirectPlanningEntry(btn){
    if(!btn)return false;
    try{if(btn.matches&&btn.matches('.bottomNavBtn[data-panel="planPanel"]'))return true}catch(e){}
    let inline='';try{inline=String(btn.getAttribute&&btn.getAttribute('onclick')||'')}catch(e){}
    return /(?:goTab|switchTab)\(\s*['"]planPanel['"]/.test(inline);
  }

  function signalPlanningUserOpened(){
    try{document.dispatchEvent(new CustomEvent('store-runner:planning-user-opened'))}catch(e){}
  }

  function installStoreQuickReturnGuard(){
    const current=window.openStoreQuick;
    if(typeof current!=='function')return false;
    if(current.__storeRunnerPlanningReturnGuard)return true;
    function guardedOpenStoreQuick(){
      if(suppressNextQuickOpen){
        suppressNextQuickOpen=false;
        activatePlanning();
        return false;
      }
      return current.apply(this,arguments);
    }
    guardedOpenStoreQuick.__storeRunnerPlanningReturnGuard=true;
    window.openStoreQuick=guardedOpenStoreQuick;
    return true;
  }

  function ensureSettingsSheetCss(){
    if(document.getElementById('planning-settings-sheet-css'))return;
    const style=document.createElement('style');
    style.id='planning-settings-sheet-css';
    style.textContent=`
      #${SETTINGS_ID}.${SETTINGS_SHEET_CLASS}{position:fixed!important;inset:0!important;z-index:230!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:rgba(20,24,32,.24)!important;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);overflow:hidden!important;touch-action:none}
      #${SETTINGS_ID}.${SETTINGS_SHEET_CLASS}>summary{display:none!important}
      #${SETTINGS_ID}.${SETTINGS_SHEET_CLASS}>.settingsInner{display:block!important;position:absolute!important;left:12px!important;right:12px!important;bottom:calc(12px + env(safe-area-inset-bottom))!important;max-height:min(82dvh,760px)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;margin:0!important;padding:0 14px calc(18px + env(safe-area-inset-bottom))!important;border:1px solid rgba(255,255,255,.9)!important;border-radius:28px!important;background:rgba(249,250,252,.97)!important;box-shadow:0 28px 80px rgba(20,25,35,.24)!important}
      #${SETTINGS_HEADER_ID}{position:sticky;top:0;z-index:5;margin:0 -14px 10px;padding:7px 14px 12px;background:linear-gradient(180deg,rgba(249,250,252,.99) 78%,rgba(249,250,252,.91));backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
      #${SETTINGS_HEADER_ID} .pssHandle{width:42px;height:5px;border-radius:999px;background:#d3d6dc;margin:0 auto 10px}
      #${SETTINGS_HEADER_ID} .pssRow{display:flex;align-items:center;justify-content:space-between;gap:12px}
      #${SETTINGS_HEADER_ID} .pssTitle{font-size:20px;font-weight:850;color:#1d1d1f;letter-spacing:-.025em}
      #${SETTINGS_HEADER_ID} .pssSub{display:block;margin-top:3px;font-size:12px;color:#7a8290;font-weight:600}
      #${SETTINGS_HEADER_ID} .pssClose{width:44px;height:44px;min-width:44px;border:0;border-radius:16px;background:rgba(232,235,241,.92);color:#20242b;font-size:24px;line-height:1;font-weight:500}
      @media(min-width:800px){#${SETTINGS_ID}.${SETTINGS_SHEET_CLASS}>.settingsInner{left:50%!important;right:auto!important;top:50%!important;bottom:auto!important;width:min(680px,calc(100vw - 40px))!important;max-height:min(80vh,780px)!important;transform:translate(-50%,-50%)}}
    `;
    document.head.appendChild(style);
  }

  function closePlanningSettingsSheet(){
    const settings=document.getElementById(SETTINGS_ID);
    if(!settings||!settings.classList.contains(SETTINGS_SHEET_CLASS))return false;
    settings.classList.remove(SETTINGS_SHEET_CLASS);
    settings.removeAttribute('role');
    settings.removeAttribute('aria-modal');
    settings.removeAttribute('aria-label');
    settings.open=false;
    dragStartY=null;
    return true;
  }

  function ensureSettingsSheetUi(settings){
    ensureSettingsSheetCss();
    const inner=settings&&settings.querySelector?settings.querySelector('.settingsInner'):null;
    if(!inner)return false;
    let header=document.getElementById(SETTINGS_HEADER_ID);
    if(!header){
      header=document.createElement('div');
      header.id=SETTINGS_HEADER_ID;
      header.innerHTML='<div class="pssHandle" data-planning-settings-drag aria-hidden="true"></div><div class="pssRow"><div><div class="pssTitle">Réglages du planning</div><span class="pssSub">Modifie ton planning sans quitter ta journée.</span></div><button class="pssClose" type="button" data-planning-settings-close aria-label="Fermer les réglages">×</button></div>';
      inner.insertBefore(header,inner.firstChild||null);
      header.addEventListener('touchstart',function(e){
        if(e.touches&&e.touches.length===1)dragStartY=e.touches[0].clientY;
      },{passive:true});
      header.addEventListener('touchend',function(e){
        if(dragStartY==null)return;
        const y=e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientY:dragStartY;
        if(y-dragStartY>70)closePlanningSettingsSheet();
        dragStartY=null;
      },{passive:true});
    }
    return true;
  }

  function openPlanningSettingsSheet(){
    const settings=document.getElementById(SETTINGS_ID);
    if(!settings||!ensureSettingsSheetUi(settings))return false;
    settings.open=true;
    settings.classList.add(SETTINGS_SHEET_CLASS);
    settings.setAttribute('role','dialog');
    settings.setAttribute('aria-modal','true');
    settings.setAttribute('aria-label','Réglages du planning');
    return true;
  }

  function install(){
    if(installed)return;
    installed=true;
    ensureSettingsSheetCss();
    installStoreQuickReturnGuard();

    document.addEventListener('click',function(e){
      const shortcut=e.target&&e.target.closest?e.target.closest('#'+SETTINGS_SHORTCUT_ID):null;
      if(shortcut){
        if(typeof e.preventDefault==='function')e.preventDefault();
        if(typeof e.stopPropagation==='function')e.stopPropagation();
        openPlanningSettingsSheet();
        return;
      }

      const close=e.target&&e.target.closest?e.target.closest('[data-planning-settings-close]'):null;
      if(close){
        if(typeof e.preventDefault==='function')e.preventDefault();
        if(typeof e.stopPropagation==='function')e.stopPropagation();
        closePlanningSettingsSheet();
        return;
      }

      const settings=document.getElementById(SETTINGS_ID);
      if(settings&&settings.classList.contains(SETTINGS_SHEET_CLASS)&&e.target===settings){
        if(typeof e.preventDefault==='function')e.preventDefault();
        if(typeof e.stopPropagation==='function')e.stopPropagation();
        closePlanningSettingsSheet();
        return;
      }

      const btn=e.target&&e.target.closest?e.target.closest('button'):null;
      if(!btn)return;
      if(btn.closest('#planPanel .departureCard'))returnToPlanning=true;
    },true);

    /* Cette écoute est volontairement en phase de propagation normale : l'onclick du
       bouton a déjà activé planPanel quand le signal est émis. Les ouvertures techniques
       via goTab(), utilisées par d'autres modules, n'émettent jamais ce signal. */
    document.addEventListener('click',function(e){
      const btn=e.target&&e.target.closest?e.target.closest('button'):null;
      if(isDirectPlanningEntry(btn))signalPlanningUserOpened();
    });

    document.addEventListener('keydown',function(e){
      if(e&&e.key==='Escape')closePlanningSettingsSheet();
    },true);

    document.addEventListener('store-runner:profile-saved',function(){
      if(!returnToPlanning)return;
      returnToPlanning=false;
      goPlanning();
    });

    document.addEventListener('store-runner:planning-updated',function(e){
      const reason=e&&e.detail&&e.detail.reason;
      if(reason!=='day-store-recenter'&&reason!=='store-moved-between-days')return;
      suppressNextQuickOpen=true;
      installStoreQuickReturnGuard();
      if(typeof window.closeStoreQuick==='function'){
        try{window.closeStoreQuick()}catch(err){}
      }
      activatePlanning();
    });
  }

  window.StoreRunnerNavigation={openPlanningSettings:openPlanningSettingsSheet,closePlanningSettings:closePlanningSettingsSheet};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();