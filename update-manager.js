(function(){
  'use strict';

  const VERSION_URL='./version.json';
  const CENTER_ID='storeRunnerUpdateCenter';
  const MENU_BUTTON_ID='storeRunnerUpdateMenuButton';
  const BANNER_ID='storeRunnerUpdateBanner';
  const LAST_BUILD_KEY='store-runner-last-seen-build';
  const currentBuild=String(window.__STORE_RUNNER_BUILD_REV||'inconnue');
  const state={current:currentBuild,latest:currentBuild,displayVersion:displayVersion(currentBuild),status:'idle',lastCheckedAt:0,error:null};

  /* La date de publication départage les hotfixes qui conservent la même version
     visible (20260925-pwa261 → 20260926-pwa261). Sans elle, un version.json CDN ancien
     était pris pour une autre mise à jour 261 et pouvait faire repartir vers l'arrière. */
  function revisionParts(build){
    const value=String(build||'');
    const date=value.match(/^(\d{8})(?:-|$)/),version=value.match(/(\d+)$/);
    return{date:date?Number(date[1]):NaN,version:version?Number(version[1]):NaN};
  }
  function olderThanCurrent(build){
    const a=revisionParts(build),b=revisionParts(currentBuild);
    if(Number.isFinite(a.date)&&Number.isFinite(b.date)&&a.date!==b.date)return a.date<b.date;
    return Number.isFinite(a.version)&&Number.isFinite(b.version)&&a.version<b.version;
  }
  function updateAvailable(){
    return !!state.latest&&state.latest!==state.current&&!olderThanCurrent(state.latest);
  }

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
      #${BANNER_ID} .sruBannerActions{display:flex;gap:8px;flex:0 0 auto}
      #${BANNER_ID} button{flex:0 0 auto;border:0;border-radius:11px;min-height:38px;padding:0 11px;font-weight:850;background:#fff;color:#111827}
      #${BANNER_ID} button[hidden]{display:none!important}
      #${BANNER_ID} .sruLater{background:rgba(255,255,255,.14);color:#fff}
      @media(max-width:520px){#${BANNER_ID}{flex-wrap:wrap;align-items:flex-start}#${BANNER_ID} .sruBannerText{flex:1 1 100%}#${BANNER_ID} .sruBannerActions{flex:1 1 100%;justify-content:flex-end}#${BANNER_ID} button{font-size:12px}#${CENTER_ID} .sruActions{grid-template-columns:1fr}}
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
    banner.innerHTML='<div class="sruBannerText"><strong data-sru-banner-title></strong><span data-sru-banner-detail></span></div><div class="sruBannerActions"><button type="button" class="sruLater" data-sru-banner-dismiss hidden>Plus tard</button><button type="button" data-sru-banner-action></button></div>';
    document.body.appendChild(banner);
    return banner;
  }

  /* V260 — `onDismiss` affiche « Plus tard » : une proposition de mise à jour ne reste
     jamais collée en haut de l'écran, par-dessus l'en-tête, sans moyen de la fermer. */
  let bannerGeneration=0;
  function setBanner(title,detail,actionLabel,handler,autoHideMs,onDismiss){
    const banner=ensureBanner();
    delete banner.dataset.sticky;
    banner.querySelector('[data-sru-banner-title]').textContent=title||'';
    banner.querySelector('[data-sru-banner-detail]').textContent=detail||'';
    const action=banner.querySelector('[data-sru-banner-action]');
    if(actionLabel){action.hidden=false;action.textContent=actionLabel;action.onclick=handler||null}else{action.hidden=true;action.onclick=null}
    const later=banner.querySelector('[data-sru-banner-dismiss]');
    if(later){
      if(onDismiss){later.hidden=false;later.onclick=function(){hideBanner();onDismiss()}}else{later.hidden=true;later.onclick=null}
    }
    banner.hidden=false;
    /* Le masquage différé ne vise que CE message : un bandeau plus récent reste affiché. */
    const generation=String(++bannerGeneration);
    banner.dataset.generation=generation;
    if(autoHideMs)window.setTimeout(function(){if(banner&&!banner.dataset.sticky&&banner.dataset.generation===generation)banner.hidden=true},autoHideMs);
    return banner;
  }

  function hideBanner(){const banner=document.getElementById(BANNER_ID);if(banner){banner.hidden=true;delete banner.dataset.sticky}}

  function render(){
    const available=updateAvailable();
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
      else if(state.status==='installing')status.textContent='Mise à jour en cours…';
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

  async function fetchManifest(){
    const response=await fetch(VERSION_URL+'?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return parseManifest(await response.json());
  }

  /* Révision pour laquelle « Plus tard » a été choisi : plus de bandeau pour elle
     pendant cette session. Le point sur « ↻ Mise à jour » (menu Plus) reste visible, et
     la proposition revient à la prochaine ouverture de l'application. */
  let dismissedTarget=null;
  let readyTarget=null;

  function offerUpdate(){
    const target=state.latest;
    const banner=setBanner('Nouvelle version disponible','Version '+state.displayVersion+' prête à installer. Tes données restent sur l’appareil.','Mettre à jour',installUpdate,0,function(){dismissedTarget=target});
    banner.dataset.sticky='1';
    return banner;
  }

  async function checkForUpdates(silent){
    /* Une vérification silencieuse (retour au premier plan) n'écrase pas l'état d'une
       installation en cours. */
    if(silent&&applying)return{available:updateAvailable(),current:state.current,latest:state.latest};
    if(!silent){state.status='checking';state.error=null;render()}
    try{
      const manifest=await fetchManifest();
      state.latest=manifest.latestBuild;
      state.displayVersion=manifest.displayVersion;
      state.lastCheckedAt=Date.now();
      state.error=null;
      state.status='ready';
      render();
      if(updateAvailable()){
        /* Déjà téléchargée et prête (bandeau « Recharger ») : on ne la repropose pas. */
        if(dismissedTarget!==state.latest&&readyTarget!==state.latest)offerUpdate();
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

  /* V244 — Appliquer une mise à jour sans fermer puis rouvrir l'application.
     Avant : le module attendait la prise de contrôle 3,5 s au plus. Sur Android, le
     nouveau worker précharge ~75 fichiers pendant install() — souvent plus long que
     ça sur réseau mobile. L'écouteur était retiré, le bandeau demandait de fermer et
     rouvrir, et le worker finissait par s'activer sur une page restée l'ancienne.
     Maintenant : on attend réellement que le nouveau worker soit installé, on
     l'active, et on ne recharge qu'au controllerchange — quand il contrôle la page.
     Le rechargement est borné par un marqueur de session {from,to} : au plus un
     rechargement automatique par couple de versions, nettoyé dès que la nouvelle
     version tourne ou au bout de APPLY_MARKER_TTL. Aucune donnée locale n'est touchée :
     seuls les fichiers de l'application changent, via le cache du service worker. */
  const APPLY_MARKER_KEY='store-runner-update-apply';
  const APPLY_MARKER_TTL=5*60*1000;
  const INSTALL_TIMEOUT=120000;
  const ACTIVATE_TIMEOUT=15000;
  const NO_UPDATE_GRACE=2500;
  const RELOAD_DELAY=350;
  const FLUSH_TIMEOUT=5000;
  let applying=null;
  let reloadScheduled=false;

  function session(){
    try{return window.sessionStorage||null}catch(e){return null}
  }

  function readApplyMarker(){
    const s=session();if(!s)return null;
    try{const m=JSON.parse(s.getItem(APPLY_MARKER_KEY)||'null');return m&&typeof m==='object'?m:null}catch(e){return null}
  }

  function clearApplyMarker(){
    const s=session();if(!s)return;
    try{s.removeItem(APPLY_MARKER_KEY)}catch(e){}
  }

  function writeApplyMarker(target){
    const s=session();if(!s)return;
    try{s.setItem(APPLY_MARKER_KEY,JSON.stringify({from:currentBuild,to:target,at:Date.now()}))}catch(e){}
  }

  function markerFresh(m){
    return !!(m&&Number(m.at)>0&&Date.now()-Number(m.at)<=APPLY_MARKER_TTL);
  }

  /* Au démarrage : la nouvelle version tourne → marqueur retiré ; périmé ou sans rapport
     → retiré aussi. Il ne reste que s'il décrit un rechargement récent revenu sur
     l'ancienne version : c'est lui qui empêche d'en relancer un deuxième. */
  function settleApplyMarker(){
    const m=readApplyMarker();
    if(!m)return null;
    if(m.to===currentBuild){clearApplyMarker();return 'applied'}
    if(m.from!==currentBuild||!markerFresh(m)){clearApplyMarker();return null}
    return 'stale';
  }

  function reloadAlreadyTried(target){
    const m=readApplyMarker();
    return !!(m&&m.from===currentBuild&&m.to===target&&markerFresh(m));
  }

  function reloadNow(){
    try{
      if(window.location&&typeof window.location.reload==='function'){window.location.reload();return true}
      if(window.location&&typeof window.location.replace==='function'){window.location.replace(window.location.href);return true}
    }catch(e){}
    return false;
  }

  function stickyBanner(title,detail,actionLabel,handler){
    const banner=setBanner(title,detail,actionLabel,handler);
    if(banner)banner.dataset.sticky='1';
    return banner;
  }

  /* V260 — une saisie est en cours quand une fenêtre de travail est ouverte : visite,
     fiche magasin, rendez-vous, création de magasin… L'installation peut durer une
     minute sur réseau mobile ; si l'utilisateur a ouvert une visite entre-temps, la
     nouvelle version attend qu'il ait fini au lieu de recharger sous ses doigts. */
  function busy(){
    try{return !!(document.querySelector&&document.querySelector('dialog[open]'))}catch(e){return false}
  }

  /* V260 — le moteur V256 écrit dans IndexedDB de façon asynchrone. Avant de quitter la
     page, on attend que tout ce qui a été saisi soit réellement sur le disque. Sans
     moteur (tests, navigateur sans IndexedDB) : rien à attendre. */
  function flushStorage(){
    const s=window.__chefStorage;
    if(!s||typeof s.flush!=='function')return null;
    let flushed;
    try{flushed=Promise.resolve(s.flush()).then(function(){return true},function(){return false})}catch(e){flushed=Promise.resolve(false)}
    return Promise.race([flushed,delay(FLUSH_TIMEOUT).then(function(){return false})]);
  }

  function releaseReload(){
    reloadScheduled=false;
    clearApplyMarker();
    window.__storeRunnerUpdateApplying=false;
    state.status='ready';render();
  }

  function finishReload(){
    if(reloadNow())return;
    releaseReload();
    stickyBanner('Mise à jour installée','Recharge Store Runner pour ouvrir la nouvelle version.','Recharger',reloadNow);
  }

  function deferReload(target){
    readyTarget=target;
    window.__storeRunnerUpdateApplying=false;
    state.status='ready';render();
    stickyBanner('Mise à jour prête','Termine ta saisie en cours, puis recharge : rien ne sera perdu.','Recharger',function(){scheduleReload(target)});
    return true;
  }

  function scheduleReload(target){
    if(reloadScheduled)return true;
    if(reloadAlreadyTried(target)){
      window.__storeRunnerUpdateApplying=false;
      state.status='ready';render();
      setBanner('Nouvelle version pas encore servie','Le rechargement a rouvert l’ancienne version. Réessaie dans quelques minutes.','Réessayer',installUpdate,6000);
      return false;
    }
    if(busy())return deferReload(target);
    reloadScheduled=true;
    window.__storeRunnerUpdateApplying=true;
    writeApplyMarker(target);
    stickyBanner('Mise à jour installée','Store Runner recharge la nouvelle version…',null,null);
    window.setTimeout(function(){
      const flushed=flushStorage();
      if(!flushed)return finishReload();
      flushed.then(function(ok){
        if(ok)return finishReload();
        /* Données pas encore sur le disque : on ne quitte pas la page. */
        releaseReload();
        stickyBanner('Mise à jour en attente','Les dernières modifications s’enregistrent encore sur l’appareil. Réessaie dans un instant.','Réessayer',function(){scheduleReload(target)});
      });
    },RELOAD_DELAY);
    return true;
  }

  function delay(ms){return new Promise(function(resolve){window.setTimeout(resolve,ms)})}

  /* Attend un worker « installed » (donc registration.waiting). Couvre les trois
     départs possibles : déjà en attente, en cours d'installation, ou découvert par
     l'update() qu'on vient de lancer (updatefound). Si update() n'a rien trouvé, on
     ne laisse qu'un court délai à un updatefound tardif avant de conclure. */
  function waitForWaitingWorker(registration,timeoutMs){
    return new Promise(function(resolve){
      let done=false,timer=null;
      const watched=[];
      const arm=function(ms){if(timer)window.clearTimeout(timer);timer=window.setTimeout(function(){finish(registration.waiting||null)},ms)};
      const onFound=function(){arm(timeoutMs);watch(registration.installing)};
      const finish=function(worker){
        if(done)return;done=true;
        if(timer)window.clearTimeout(timer);
        try{if(typeof registration.removeEventListener==='function')registration.removeEventListener('updatefound',onFound)}catch(e){}
        resolve(worker||null);
      };
      const watch=function(worker){
        if(!worker||watched.indexOf(worker)>=0||typeof worker.addEventListener!=='function')return;
        watched.push(worker);
        worker.addEventListener('statechange',function(){
          if(registration.waiting)return finish(registration.waiting);
          if(worker.state==='redundant'){
            if(registration.installing&&registration.installing!==worker)watch(registration.installing);
            else finish(null);
          }
        });
      };
      if(registration.waiting)return finish(registration.waiting);
      if(typeof registration.addEventListener==='function')registration.addEventListener('updatefound',onFound);
      watch(registration.installing);
      arm(registration.installing?timeoutMs:Math.min(timeoutMs,NO_UPDATE_GRACE));
    });
  }

  /* Demande au worker la révision qu'il sert. Un worker antérieur à V244 ne répond pas :
     null, et on ne suppose rien. */
  function askWorkerBuild(worker){
    return new Promise(function(resolve){
      if(!worker||typeof worker.postMessage!=='function'||typeof MessageChannel!=='function')return resolve(null);
      let done=false;
      const finish=function(v){if(!done){done=true;resolve(v)}};
      try{
        const channel=new MessageChannel();
        channel.port1.onmessage=function(e){finish(e&&e.data&&e.data.buildRev?String(e.data.buildRev):null)};
        worker.postMessage({type:'GET_BUILD_REV'},[channel.port2]);
      }catch(e){return finish(null)}
      window.setTimeout(function(){finish(null)},1500);
    });
  }

  function installUpdate(){
    if(reloadScheduled)return Promise.resolve(true);
    if(applying)return applying;
    applying=applyUpdate().then(function(result){applying=null;return result},function(){applying=null;return false});
    return applying;
  }

  async function applyUpdate(){
    state.status='installing';state.error=null;render();
    stickyBanner('Mise à jour en cours…','Store Runner télécharge la nouvelle version.',null,null);
    let manifest=null;
    try{manifest=await fetchManifest()}catch(error){
      state.error=error;state.status='ready';render();
      setBanner('Mise à jour impossible','Connexion indisponible ou version pas encore propagée.','Réessayer',installUpdate,4200);
      return false;
    }
    state.latest=manifest.latestBuild;state.displayVersion=manifest.displayVersion;state.lastCheckedAt=Date.now();
    const target=state.latest;
    if(!updateAvailable()){
      state.status='ready';render();
      setBanner('Store Runner est à jour','Version '+displayVersion(state.current)+' installée.',null,null,2600);
      return false;
    }
    render();
    /* Sans service worker, aucune ancienne copie ne s'interpose : un rechargement suffit. */
    const sw=('serviceWorker' in navigator)?navigator.serviceWorker:null;
    if(!sw)return scheduleReload(target);
    let registration=null;
    try{registration=await sw.getRegistration()}catch(e){registration=null}
    if(!registration)return scheduleReload(target);

    /* À partir d'ici le rechargement appartient à ce module : le garde-fou du bootloader
       (index.html) s'efface pour qu'un seul rechargement parte. */
    window.__storeRunnerUpdateApplying=true;
    let controlled=false,resolveControlled=null;
    const controlledPromise=new Promise(function(resolve){resolveControlled=resolve});
    const onControllerChange=function(){controlled=true;resolveControlled(true)};
    sw.addEventListener('controllerchange',onControllerChange);
    const cleanup=function(){
      try{sw.removeEventListener('controllerchange',onControllerChange)}catch(e){}
      if(!reloadScheduled)window.__storeRunnerUpdateApplying=false;
    };
    try{
      try{await registration.update()}catch(error){if(!registration.waiting&&!registration.installing)throw error}
      const worker=controlled?null:await Promise.race([waitForWaitingWorker(registration,INSTALL_TIMEOUT),controlledPromise.then(function(){return null})]);
      if(controlled){cleanup();return scheduleReload(target)}
      if(!worker){
        /* Aucun worker en attente : soit le worker actif sert déjà la nouvelle version
           (page restée ancienne), soit la page n'est pas contrôlée — dans les deux cas le
           rechargement ouvre la bonne version. Sinon le serveur ne la publie pas encore. */
        const activeBuild=sw.controller?await askWorkerBuild(sw.controller):null;
        cleanup();
        if(!sw.controller||activeBuild===target)return scheduleReload(target);
        state.status='ready';render();
        setBanner('Nouvelle version pas encore prête','Le téléchargement n’a pas abouti. Réessaie dans quelques minutes.','Réessayer',installUpdate,6000);
        return false;
      }
      if(typeof worker.addEventListener==='function'){
        worker.addEventListener('statechange',function(){
          if(worker.state==='activated'&&sw.controller===worker)onControllerChange();
        });
      }
      worker.postMessage({type:'SKIP_WAITING'});
      const ok=await Promise.race([controlledPromise,delay(ACTIVATE_TIMEOUT).then(function(){return controlled})]);
      cleanup();
      if(ok)return scheduleReload(target);
      state.status='ready';render();
      setBanner('Mise à jour presque prête','La nouvelle version est téléchargée mais pas encore activée.','Réessayer',installUpdate,6000);
      return false;
    }catch(error){
      cleanup();
      state.error=error;state.status='ready';render();
      setBanner('Mise à jour impossible','Connexion indisponible ou version pas encore propagée.','Réessayer',installUpdate,4200);
      return false;
    }
  }

  /* V260 — page et worker de la même révision. Après un déploiement, une ouverture en
     ligne sert déjà la nouvelle page (réseau d'abord) alors que l'ancien worker reste
     aux commandes et que le nouveau attend, installé, jusqu'à la fermeture complète de
     l'application — des jours sur iPhone. Si le worker en attente sert exactement la
     révision de cette page, l'activer ne change aucun fichier affiché : aucun
     rechargement, et le hors-ligne passe tout de suite sur la bonne version. */
  function alignWaitingWorker(){
    const sw=('serviceWorker' in navigator)?navigator.serviceWorker:null;
    if(!sw||typeof sw.getRegistration!=='function')return;
    Promise.resolve().then(function(){return sw.getRegistration()}).then(function(registration){
      if(!registration)return;
      const consider=function(worker){
        if(!worker||applying||reloadScheduled||!sw.controller)return;
        askWorkerBuild(worker).then(function(build){
          if(build!==currentBuild||applying||reloadScheduled||registration.waiting!==worker)return;
          try{worker.postMessage({type:'SKIP_WAITING'})}catch(e){}
        });
      };
      const follow=function(worker){
        if(!worker||typeof worker.addEventListener!=='function')return;
        worker.addEventListener('statechange',function(){if(worker.state==='installed')consider(worker)});
      };
      consider(registration.waiting);
      /* Le bootloader lance update() avant que ce module démarre : le nouveau worker peut
         déjà être en cours d'installation, son updatefound déjà passé. */
      follow(registration.installing);
      if(typeof registration.addEventListener==='function')registration.addEventListener('updatefound',function(){follow(registration.installing)});
    }).catch(function(){});
  }

  /* Le worker aux commandes a changé hors de installUpdate() : alignement ci-dessus,
     première installation, ou autre fenêtre. Même révision → rien. Autre révision → on
     le propose ; plus aucun rechargement automatique (l'ancien bootloader en faisait un). */
  function watchController(){
    const sw=('serviceWorker' in navigator)?navigator.serviceWorker:null;
    if(!sw||typeof sw.addEventListener!=='function')return;
    sw.addEventListener('controllerchange',function(){
      if(applying||reloadScheduled)return;
      askWorkerBuild(sw.controller).then(function(build){
        if(!build||build===currentBuild||olderThanCurrent(build)||applying||reloadScheduled)return;
        state.latest=build;state.displayVersion=displayVersion(build);render();
        readyTarget=build;
        if(dismissedTarget===build)return;
        const banner=setBanner('Nouvelle version prête','Version '+displayVersion(build)+' installée. Recharge quand tu veux : tes données restent sur l’appareil.','Recharger',function(){scheduleReload(build)},0,function(){dismissedTarget=build});
        banner.dataset.sticky='1';
      });
    });
  }

  /* Retour du réseau après une session hors ligne : le worker n'a pas pu se mettre à
     jour au démarrage. On le relance, et on revérifie la version publiée. */
  function refreshWorker(){
    const sw=('serviceWorker' in navigator)?navigator.serviceWorker:null;
    if(!sw||typeof sw.getRegistration!=='function')return;
    Promise.resolve().then(function(){return sw.getRegistration()}).then(function(registration){
      if(registration&&typeof registration.update==='function'&&!applying)return registration.update();
    }).catch(function(){});
  }

  function announceInstalledBuild(){
    const s=storage();
    if(!s)return;
    let previous=null;
    try{previous=s.getItem(LAST_BUILD_KEY);s.setItem(LAST_BUILD_KEY,currentBuild)}catch(e){return}
    if(previous===currentBuild)return;
    const title=previous?'Mise à jour Store Runner installée':'Store Runner est à jour';
    const detail='Version '+displayVersion(currentBuild)+' installée.';
    window.setTimeout(function(){
      if(applying||reloadScheduled)return;
      /* Une information ne remplace jamais une proposition en attente d'une réponse. */
      const current=document.getElementById(BANNER_ID);
      if(current&&!current.hidden&&current.dataset.sticky)return;
      setBanner(title,detail,null,null,3600);
    },700);
  }

  function start(){
    settleApplyMarker();
    css();
    ensureMenuEntry();
    window.setTimeout(ensureMenuEntry,80);
    document.addEventListener('store-runner:home-rendered',function(){window.setTimeout(ensureMenuEntry,0)});
    announceInstalledBuild();
    window.setTimeout(function(){checkForUpdates(true)},1200);
    watchController();
    alignWaitingWorker();
    let lastVisibilityCheck=0;
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState!=='visible')return;
      const now=Date.now();if(now-lastVisibilityCheck<60000)return;lastVisibilityCheck=now;checkForUpdates(true);
    });
    let lastOnlineCheck=0;
    if(typeof window.addEventListener==='function')window.addEventListener('online',function(){
      const now=Date.now();if(now-lastOnlineCheck<60000)return;lastOnlineCheck=now;
      refreshWorker();checkForUpdates(true);
    });
  }

  window.StoreRunnerUpdates={checkForUpdates:checkForUpdates,installUpdate:installUpdate,openUpdateCenter:openUpdateCenter,getState:function(){return Object.assign({},state)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
