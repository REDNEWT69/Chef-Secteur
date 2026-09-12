(function(){
  'use strict';

  const VERSION_URL='./version.json';
  const PANEL_ID='storeRunnerUpdatePanel';
  const BANNER_ID='storeRunnerUpdateBanner';
  const LAST_BUILD_KEY='store-runner-last-seen-build';
  const currentBuild=String(window.__STORE_RUNNER_BUILD_REV||'inconnue');
  const state={current:currentBuild,latest:currentBuild,displayVersion:displayVersion(currentBuild),status:'idle',lastCheckedAt:0,error:null};

  function displayVersion(build){
    const m=String(build||'').match(/(\d{2,})$/);
    return m?m[1]:String(build||'inconnue');
  }

  function storage(){
    try{return window.__chefStorage||window.localStorage||null}catch(e){return null}
  }

  function css(){
    if(document.getElementById('store-runner-update-css'))return;
    const style=document.createElement('style');
    style.id='store-runner-update-css';
    style.textContent=`
      #${PANEL_ID}{margin-top:18px;padding-top:16px;border-top:1px solid rgba(60,60,67,.14)}
      #${PANEL_ID} .sruHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
      #${PANEL_ID} .sruTitle{font-size:15px;font-weight:850;color:#1d1d1f}
      #${PANEL_ID} .sruBuild{font-size:11px;color:#8e8e93;margin-top:3px;word-break:break-all}
      #${PANEL_ID} .sruBadge{font-size:11px;font-weight:800;padding:5px 8px;border-radius:999px;background:#eef2ff;color:#334155;white-space:nowrap}
      #${PANEL_ID} .sruStatus{font-size:12px;line-height:1.45;color:#6b7280;margin:8px 0 12px}
      #${PANEL_ID} .sruActions{display:flex;gap:8px;flex-wrap:wrap}
      #${PANEL_ID} button{min-height:40px;border-radius:12px;padding:0 12px;font-weight:800}
      #${PANEL_ID} .sruPrimary{background:#1428A0;color:#fff;border:0}
      #${PANEL_ID} .sruSecondary{background:#fff;color:#1d1d1f;border:1px solid rgba(60,60,67,.18)}
      #${BANNER_ID}{position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:16px;background:rgba(17,24,39,.96);color:#fff;box-shadow:0 14px 38px rgba(0,0,0,.22);backdrop-filter:blur(18px)}
      #${BANNER_ID}[hidden]{display:none!important}
      #${BANNER_ID} .sruBannerText{min-width:0;font-size:13px;line-height:1.35}
      #${BANNER_ID} .sruBannerText strong{display:block;font-size:14px;margin-bottom:2px}
      #${BANNER_ID} button{flex:0 0 auto;border:0;border-radius:11px;min-height:38px;padding:0 11px;font-weight:850;background:#fff;color:#111827}
      @media(max-width:520px){#${BANNER_ID}{align-items:flex-start}#${BANNER_ID} button{font-size:12px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    const settings=document.querySelector('#planningSettings .settingsInner');
    if(!settings)return null;
    let panel=document.getElementById(PANEL_ID);
    if(panel)return panel;
    css();
    panel=document.createElement('section');
    panel.id=PANEL_ID;
    panel.setAttribute('aria-label','Application et mises à jour');
    panel.innerHTML='<div class="sruHead"><div><div class="sruTitle">Application</div><div class="sruBuild" data-sru-build></div></div><span class="sruBadge" data-sru-badge>Version</span></div><div class="sruStatus" data-sru-status></div><div class="sruActions"><button type="button" class="sruSecondary" data-sru-check>Vérifier les mises à jour</button><button type="button" class="sruPrimary" data-sru-install hidden>Mettre à jour maintenant</button></div>';
    settings.appendChild(panel);
    panel.querySelector('[data-sru-check]').addEventListener('click',function(){checkForUpdates(false)});
    panel.querySelector('[data-sru-install]').addEventListener('click',installUpdate);
    render();
    return panel;
  }

  function ensureBanner(){
    css();
    let banner=document.getElementById(BANNER_ID);
    if(banner)return banner;
    banner=document.createElement('aside');
    banner.id=BANNER_ID;
    banner.hidden=true;
    banner.setAttribute('role','status');
    banner.innerHTML='<div class="sruBannerText"><strong data-sru-banner-title></strong><span data-sru-banner-detail></span></div><button type="button" data-sru-banner-action></button>';
    document.body.appendChild(banner);
    return banner;
  }

  function setBanner(title,detail,actionLabel,handler,autoHideMs){
    const banner=ensureBanner();
    banner.querySelector('[data-sru-banner-title]').textContent=title||'';
    banner.querySelector('[data-sru-banner-detail]').textContent=detail||'';
    const action=banner.querySelector('[data-sru-banner-action]');
    if(actionLabel){action.hidden=false;action.textContent=actionLabel;action.onclick=handler||null}else{action.hidden=true;action.onclick=null}
    banner.hidden=false;
    if(autoHideMs)window.setTimeout(function(){if(banner&&!banner.dataset.sticky)banner.hidden=true},autoHideMs);
    return banner;
  }

  function hideBanner(){const banner=document.getElementById(BANNER_ID);if(banner){banner.hidden=true;delete banner.dataset.sticky}}

  function render(){
    const panel=ensurePanel();
    if(!panel)return;
    const available=state.latest&&state.latest!==state.current;
    const build=panel.querySelector('[data-sru-build]');
    const badge=panel.querySelector('[data-sru-badge]');
    const status=panel.querySelector('[data-sru-status]');
    const install=panel.querySelector('[data-sru-install]');
    const check=panel.querySelector('[data-sru-check]');
    if(build)build.textContent='Build '+state.current;
    if(badge)badge.textContent='Version '+displayVersion(state.current);
    if(install)install.hidden=!available;
    if(check)check.disabled=state.status==='checking'||state.status==='installing';
    if(install)install.disabled=state.status==='installing';
    if(status){
      if(state.status==='checking')status.textContent='Recherche de mise à jour…';
      else if(state.status==='installing')status.textContent='Installation de la nouvelle version…';
      else if(available)status.textContent='Version '+(state.displayVersion||displayVersion(state.latest))+' disponible.';
      else if(state.error)status.textContent='Impossible de vérifier maintenant. La version installée reste utilisable hors ligne.';
      else status.textContent='À jour · Version '+displayVersion(state.current)+'.';
    }
  }

  function parseManifest(data){
    if(!data||typeof data!=='object')throw new Error('Manifest de version invalide');
    const latest=String(data.latestBuild||'').trim();
    if(!latest)throw new Error('latestBuild absent');
    return{latestBuild:latest,displayVersion:String(data.displayVersion||displayVersion(latest))};
  }

  async function checkForUpdates(silent){
    if(!silent){state.status='checking';state.error=null;render()}
    try{
      const response=await fetch(VERSION_URL+'?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const manifest=parseManifest(await response.json());
      state.latest=manifest.latestBuild;
      state.displayVersion=manifest.displayVersion;
      state.lastCheckedAt=Date.now();
      state.error=null;
      state.status='ready';
      render();
      if(state.latest!==state.current){
        const banner=setBanner('Nouvelle version disponible','Version '+state.displayVersion+' peut être installée maintenant.','Mettre à jour',installUpdate);
        banner.dataset.sticky='1';
        return{available:true,current:state.current,latest:state.latest};
      }
      hideBanner();
      if(!silent)setBanner('Store Runner est à jour','Version '+displayVersion(state.current)+' installée.',null,null,2600);
      return{available:false,current:state.current,latest:state.latest};
    }catch(error){
      state.error=error;
      state.status='ready';
      render();
      return{available:false,error:error,current:state.current,latest:state.latest};
    }
  }

  async function installUpdate(){
    if(!('serviceWorker' in navigator)){
      state.error=new Error('Service Worker indisponible');render();return false;
    }
    state.status='installing';state.error=null;render();
    const banner=setBanner('Installation en cours','Store Runner prépare la nouvelle version…',null,null);
    banner.dataset.sticky='1';
    try{
      const registration=await navigator.serviceWorker.getRegistration();
      if(!registration)throw new Error('Service Worker non enregistré');
      let changed=false;
      const onControllerChange=function(){changed=true;setBanner('Mise à jour installée','Store Runner recharge la nouvelle version…',null,null)};
      navigator.serviceWorker.addEventListener('controllerchange',onControllerChange,{once:true});
      await registration.update();
      if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      if(registration.installing){
        registration.installing.addEventListener('statechange',function(){
          if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
        });
      }
      window.setTimeout(function(){
        if(changed)return;
        state.status='ready';render();
        setBanner('Mise à jour détectée','Le téléchargement est lancé. Tu peux réessayer dans quelques instants.','Vérifier',function(){checkForUpdates(false)},4200);
      },3500);
      return true;
    }catch(error){
      state.error=error;state.status='ready';render();
      setBanner('Mise à jour impossible','Connexion indisponible ou version pas encore propagée.','Réessayer',installUpdate,4200);
      return false;
    }
  }

  function announceInstalledBuild(){
    const s=storage();
    if(!s)return;
    let previous=null;
    try{previous=s.getItem(LAST_BUILD_KEY);s.setItem(LAST_BUILD_KEY,currentBuild)}catch(e){return}
    if(previous===currentBuild)return;
    const title=previous?'Mise à jour Store Runner installée':'Store Runner est à jour';
    const detail='Version '+displayVersion(currentBuild)+' installée.';
    window.setTimeout(function(){setBanner(title,detail,null,null,3600)},700);
  }

  function start(){
    ensurePanel();
    announceInstalledBuild();
    window.setTimeout(function(){checkForUpdates(true)},1200);
    let lastVisibilityCheck=0;
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState!=='visible')return;
      const now=Date.now();if(now-lastVisibilityCheck<60000)return;lastVisibilityCheck=now;checkForUpdates(true);
    });
    const observer=new MutationObserver(function(){ensurePanel()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  window.StoreRunnerUpdates={checkForUpdates:checkForUpdates,installUpdate:installUpdate,getState:function(){return Object.assign({},state)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
