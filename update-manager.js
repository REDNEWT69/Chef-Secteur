(function(){
  'use strict';

  const VERSION_URL='./version.json';
  const CENTER_ID='storeRunnerUpdateCenter';
  const MENU_BUTTON_ID='storeRunnerUpdateMenuButton';
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
      #${MENU_BUTTON_ID}{position:relative}
      #${MENU_BUTTON_ID}.sruAvailable::after{content:'';position:absolute;top:9px;right:11px;width:8px;height:8px;border-radius:999px;background:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.13)}
      #${CENTER_ID}{display:none;position:fixed;inset:0;z-index:205;background:rgba(20,24,32,.20);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
      #${CENTER_ID}.open{display:block}
      #${CENTER_ID} .sruCard{position:absolute;left:12px;right:12px;bottom:calc(82px + env(safe-area-inset-bottom));padding:10px;border-radius:28px;background:rgba(249,250,252,.97);border:1px solid rgba(255,255,255,.9);box-shadow:0 28px 80px rgba(20,25,35,.24)}
      #${CENTER_ID} .sruHandle{width:42px;height:5px;border-radius:999px;background:#d3d6dc;margin:2px auto 14px}
      #${CENTER_ID} .sruHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:2px 8px 4px}
      #${CENTER_ID} .sruTitle{font-size:20px;font-weight:850;color:#1d1d1f}
      #${CENTER_ID} .sruBuild{font-size:11px;color:#8e8e93;margin-top:4px;word-break:break-all}
      #${CENTER_ID} .sruBadge{font-size:11px;font-weight:800;padding:5px 8px;border-radius:999px;background:#eef2ff;color:#334155;white-space:nowrap}
      #${CENTER_ID} .sruStatus{font-size:13px;line-height:1.45;color:#6b7280;margin:10px 8px 14px}
      #${CENTER_ID} .sruActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      #${CENTER_ID} button{min-height:48px;border-radius:16px;padding:0 12px;font-weight:800}
      #${CENTER_ID} .sruPrimary{background:#1428A0;color:#fff;border:0}
      #${CENTER_ID} .sruSecondary{background:rgba(235,238,244,.78);color:#1d1d1f;border:0}
      #${CENTER_ID} .sruClose{width:100%;margin-top:8px;border:0;background:#111217;color:#fff}
      #${BANNER_ID}{position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:16px;background:rgba(17,24,39,.96);color:#fff;box-shadow:0 14px 38px rgba(0,0,0,.22);backdrop-filter:blur(18px)}
      #${BANNER_ID}[hidden]{display:none!important}
      #${BANNER_ID} .sruBannerText{min-width:0;font-size:13px;line-height:1.35}
      #${BANNER_ID} .sruBannerText strong{display:block;font-size:14px;margin-bottom:2px}
      #${BANNER_ID} button{flex:0 0 auto;border:0;border-radius:11px;min-height:38px;padding:0 11px;font-weight:850;background:#fff;color:#111827}
      @media(max-width:520px){#${BANNER_ID}{align-items:flex-start}#${BANNER_ID} button{font-size:12px}#${CENTER_ID} .sruActions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureMenuEntry(){
    const grid=document.querySelector('#moreSheetV2 .moreSheetGrid');
    if(!grid)return null;
    let button=document.getElementById(MENU_BUTTON_ID);
    if(button)return button;
    button=document.createElement('button');
    button.id=MENU_BUTTON_ID;
    button.type='button';
    button.textContent='↻ Mise à jour';
    button.setAttribute('aria-label','Mise à jour de Store Runner');
    button.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      const more=document.getElementById('moreSheetV2');
      if(more)more.classList.remove('open');
      openUpdateCenter();
    });
    grid.appendChild(button);
    render();
    return button;
  }

  function ensureCenter(){
    css();
    let center=document.getElementById(CENTER_ID);
    if(center)return center;
    center=document.createElement('div');
    center.id=CENTER_ID;
    center.setAttribute('role','dialog');
    center.setAttribute('aria-modal','true');
    center.setAttribute('aria-label','Mise à jour de Store Runner');
    center.innerHTML='<div class="sruCard"><div class="sruHandle"></div><div class="sruHead"><div><div class="sruTitle">Mise à jour</div><div class="sruBuild" data-sru-build></div></div><span class="sruBadge" data-sru-badge>Version</span></div><div class="sruStatus" data-sru-status></div><div class="sruActions"><button type="button" class="sruSecondary" data-sru-check>Vérifier les mises à jour</button><button type="button" class="sruPrimary" data-sru-install hidden>Mettre à jour maintenant</button></div><button type="button" class="sruClose" data-sru-close>Fermer</button></div>';
    document.body.appendChild(center);
    center.querySelector('[data-sru-check]').addEventListener('click',function(){checkForUpdates(false)});
    center.querySelector('[data-sru-install]').addEventListener('click',installUpdate);
    center.querySelector('[data-sru-close]').addEventListener('click',closeUpdateCenter);
    center.addEventListener('click',function(e){if(e.target===center)closeUpdateCenter()});
    render();
    return center;
  }

  function openUpdateCenter(){
    const center=ensureCenter();
    center.classList.add('open');
    render();
    checkForUpdates(false);
  }

  function closeUpdateCenter(){
    const center=document.getElementById(CENTER_ID);
    if(center)center.classList.remove('open');
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
    delete banner.dataset.sticky;
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
    const available=state.latest&&state.latest!==state.current;
    const menu=document.getElementById(MENU_BUTTON_ID);
    if(menu)menu.classList.toggle('sruAvailable',!!available);
    const center=document.getElementById(CENTER_ID);
    if(!center)return;
    const build=center.querySelector('[data-sru-build]');
    const badge=center.querySelector('[data-sru-badge]');
    const status=center.querySelector('[data-sru-status]');
    const install=center.querySelector('[data-sru-install]');
    const check=center.querySelector('[data-sru-check]');
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
      const existing=document.getElementById(BANNER_ID);
      if(existing&&existing.dataset.sticky)hideBanner();
      if(!silent)setBanner('Store Runner est à jour','Version '+displayVersion(state.current)+' installée.',null,null,2600);
      return{available:false,current:state.current,latest:state.latest};
    }catch(error){
      state.error=error;
      state.status='ready';
      render();
      return{available:false,error:error,current:state.current,latest:state.latest};
    }
  }

  function reloadNow(){
    try{
      if(window.location&&typeof window.location.reload==='function'){window.location.reload();return true}
    }catch(e){}
    return false;
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
      /* Le rechargement appartient à ce module, pas au bootloader. Le garde-fou
         'store-runner-sw-reload:' d'index.html est indexé sur le BUILD_REV de la page
         chargée, donc sur l'ancienne révision : une fois posé par le clients.claim()
         initial, il bloque tous les controllerchange suivants de la session. Ici on sait
         que la prise de contrôle est volontaire — l'utilisateur vient d'appuyer — donc on
         recharge sans borne, autant de fois qu'il y a de mises à jour dans la session. */
      const onControllerChange=function(){
        changed=true;
        const done=setBanner('Mise à jour installée','Store Runner recharge la nouvelle version…',null,null);
        if(done)done.dataset.sticky='1';
        window.setTimeout(function(){
          if(reloadNow())return;
          const manual=setBanner('Mise à jour installée','Ferme et rouvre Store Runner pour l’appliquer.',null,null);
          if(manual)manual.dataset.sticky='1';
        },350);
      };
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
        /* Sans prise de contrôle il n'y a pas de rechargement : on retire l'écouteur pour
           qu'il ne s'accumule pas d'un essai à l'autre, et on annonce ce qui se passe
           réellement au lieu de promettre un rechargement qui n'aura pas lieu. */
        try{navigator.serviceWorker.removeEventListener('controllerchange',onControllerChange)}catch(e){}
        state.status='ready';render();
        setBanner('Mise à jour prête','Ferme et rouvre Store Runner pour l’appliquer.','Vérifier',function(){checkForUpdates(false)},4200);
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
    css();
    ensureMenuEntry();
    window.setTimeout(ensureMenuEntry,80);
    document.addEventListener('store-runner:home-rendered',function(){window.setTimeout(ensureMenuEntry,0)});
    announceInstalledBuild();
    window.setTimeout(function(){checkForUpdates(true)},1200);
    let lastVisibilityCheck=0;
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState!=='visible')return;
      const now=Date.now();if(now-lastVisibilityCheck<60000)return;lastVisibilityCheck=now;checkForUpdates(true);
    });
  }

  window.StoreRunnerUpdates={checkForUpdates:checkForUpdates,installUpdate:installUpdate,openUpdateCenter:openUpdateCenter,getState:function(){return Object.assign({},state)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
