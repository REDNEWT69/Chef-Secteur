(function(){
  'use strict';
  let returnToPlanning=false;
  let installed=false;
  let dragStartY=null;
  let suppressNextQuickOpen=false;
  let onboardingStep=0;
  let onboardingOpen=false;

  const SETTINGS_ID='planningSettings';
  const SETTINGS_SHORTCUT_ID='planningSettingsShortcut';
  const SETTINGS_SHEET_CLASS='planningSettingsSheetOpen';
  const SETTINGS_HEADER_ID='planningSettingsSheetHeader';
  const ONBOARDING_ID='storeRunnerFirstRun';
  const ONBOARDING_STYLE_ID='storeRunnerFirstRunCss';
  const ONBOARDING_KEY='store-runner-onboarding-v1';
  const DEMO_SOURCE='Secteur de démonstration';

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
    const repair=document.getElementById('planningRepairSettings');
    if(repair){
      if(repair.parentNode!==inner)inner.appendChild(repair);
      if(repair.previousElementSibling!==header)header.insertAdjacentElement('afterend',repair);
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

  function onboardingStorage(){
    const s=window.__chefStorage;
    return s&&typeof s.getItem==='function'&&typeof s.setItem==='function'?s:null;
  }

  function readOnboardingMarker(){
    const s=onboardingStorage();
    if(!s)return null;
    try{const raw=s.getItem(ONBOARDING_KEY);return raw?JSON.parse(raw):null}catch(e){return null}
  }

  function writeOnboardingMarker(status,step,extra){
    const s=onboardingStorage();
    if(!s)return;
    const value=Object.assign({version:1,status:String(status||''),step:Math.max(0,Number(step)||0),at:new Date().toISOString()},extra||{});
    try{
      s.setItem(ONBOARDING_KEY,JSON.stringify(value));
      if(typeof s.flush==='function')Promise.resolve(s.flush()).catch(function(){});
    }catch(e){}
  }

  function objectHasEntries(value){return !!(value&&typeof value==='object'&&Object.keys(value).length)}
  function isDemoStore(store){
    return !!(store&&String(store.source||'')===DEMO_SOURCE&&/^Ville-Test \d{2}$/.test(String(store.ville||'')));
  }
  function workDaysAreDefault(days){
    const expected=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    return Array.isArray(days)&&days.length===expected.length&&expected.every(function(day,i){return days[i]===day});
  }
  function hasRealUserData(candidate){
    const s=candidate||{};
    const stores=Array.isArray(s.stores)?s.stores:[];
    if(stores.some(function(store){return !isDemoStore(store)}))return true;
    for(const key of ['visits','notes','hotelReservations','included','excluded','locks','plan'])if(objectHasEntries(s[key]))return true;
    if(Array.isArray(s.appointments)&&s.appointments.length)return true;
    if(Array.isArray(s.opportunities)&&s.opportunities.length)return true;
    if(objectHasEntries(s.businessV2)&&Object.keys(s.businessV2).some(function(k){
      const v=s.businessV2[k];return Array.isArray(v)?v.length>0:objectHasEntries(v);
    }))return true;
    const p=s.profile||{};
    if(String(p.repName||'').trim()||String(p.baseName||'').trim()||String(p.baseAddress||'').trim())return true;
    if(p.baseLat!=null||p.baseLon!=null)return true;
    if(String(p.sectorName||'Mon secteur').trim()&&String(p.sectorName||'Mon secteur').trim()!=='Mon secteur')return true;
    const settings=s.settings||{};
    if(Number(settings.target||20)!==20)return true;
    if(settings.maxVisitsPerDay!=null&&Number(settings.maxVisitsPerDay)!==4)return true;
    if(settings.strategy&&settings.strategy!=='balanced')return true;
    if(Array.isArray(settings.brands)&&settings.brands.length)return true;
    if(Array.isArray(settings.products)&&settings.products.length)return true;
    if(settings.days&&!workDaysAreDefault(settings.days))return true;
    return false;
  }
  function isPristineDemoState(candidate){
    const s=candidate||{},stores=Array.isArray(s.stores)?s.stores:[];
    return stores.length>0&&stores.every(isDemoStore)&&!hasRealUserData(s);
  }
  function isFreshEmptyState(candidate){
    const s=candidate||{},stores=Array.isArray(s.stores)?s.stores:[];
    return stores.length===0&&!hasRealUserData(s);
  }
  function saveStateQuietly(){
    try{
      if(typeof window.save==='function')window.save();
      else if(typeof save==='function')save();
      return true;
    }catch(e){return false}
  }
  function refreshAppQuietly(){
    try{if(typeof window.renderAll==='function')window.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}
    try{if(typeof window.renderFilterControls==='function')window.renderFilterControls()}catch(e){}
  }
  function sanitizePristineDemoState(candidate){
    const s=candidate||window.state;
    if(!isPristineDemoState(s))return false;
    s.stores=[];
    saveStateQuietly();
    refreshAppQuietly();
    try{document.dispatchEvent(new CustomEvent('store-runner:first-run-clean',{detail:{removedDemoSeed:true}}))}catch(e){}
    return true;
  }

  function ensureOnboardingCss(){
    if(document.getElementById(ONBOARDING_STYLE_ID))return;
    const style=document.createElement('style');
    style.id=ONBOARDING_STYLE_ID;
    style.textContent=`
      html.srFirstRunOpen,html.srFirstRunOpen body{overflow:hidden!important;overscroll-behavior:none}
      #${ONBOARDING_ID}{position:fixed;inset:0;z-index:245;display:grid;place-items:center;padding:16px;background:linear-gradient(165deg,rgba(247,249,255,.98),rgba(248,248,246,.98));font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#17191d}
      #${ONBOARDING_ID}[hidden]{display:none!important}
      #${ONBOARDING_ID} .srfrCard{width:min(520px,100%);max-height:calc(100dvh - 32px);overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid rgba(20,40,100,.09);border-radius:30px;background:rgba(255,255,255,.96);box-shadow:0 28px 80px rgba(26,36,62,.16);padding:24px;box-sizing:border-box}
      #${ONBOARDING_ID} .srfrLogo{width:62px;height:62px;border-radius:18px;display:grid;place-items:center;background:#1428a0;color:#fff;font-size:27px;font-weight:900;letter-spacing:-.06em;box-shadow:0 10px 26px rgba(20,40,160,.2)}
      #${ONBOARDING_ID} .srfrProgress{display:flex;gap:6px;margin:18px 0 20px}#${ONBOARDING_ID} .srfrProgress i{height:5px;flex:1;border-radius:99px;background:#e7e9ef}#${ONBOARDING_ID} .srfrProgress i.on{background:#1428a0}
      #${ONBOARDING_ID} h2{margin:0;font-size:28px;line-height:1.08;letter-spacing:-.035em}#${ONBOARDING_ID} p{margin:9px 0 0;color:#687080;font-size:14px;line-height:1.5}
      #${ONBOARDING_ID} .srfrGrid{display:grid;gap:12px;margin-top:20px}#${ONBOARDING_ID} .srfrFeature{padding:14px 15px;border:1px solid #e8eaf0;border-radius:18px;background:#fafbfc}#${ONBOARDING_ID} .srfrFeature b{display:block;font-size:14px}#${ONBOARDING_ID} .srfrFeature span{display:block;margin-top:3px;color:#747c8c;font-size:12px;line-height:1.4}
      #${ONBOARDING_ID} label{display:block;margin:14px 0 6px;font-size:12px;font-weight:800;color:#4d5563}#${ONBOARDING_ID} input{width:100%;box-sizing:border-box;min-height:48px;border:1px solid #d9dde6;border-radius:15px;background:#fff;padding:11px 13px;font:inherit;font-size:16px;color:#17191d;outline:none}#${ONBOARDING_ID} input:focus{border-color:#5070e7;box-shadow:0 0 0 3px rgba(80,112,231,.13)}
      #${ONBOARDING_ID} .srfrPair{display:grid;grid-template-columns:1fr 1fr;gap:10px}#${ONBOARDING_ID} .srfrCount{margin-top:18px;padding:16px;border-radius:18px;background:#f3f5ff;color:#24355f}#${ONBOARDING_ID} .srfrCount strong{display:block;font-size:28px}#${ONBOARDING_ID} .srfrCount span{font-size:12px;color:#657093}
      #${ONBOARDING_ID} .srfrActions{display:flex;gap:9px;flex-wrap:wrap;margin-top:22px}#${ONBOARDING_ID} button{min-height:46px;border:0;border-radius:15px;padding:11px 15px;font-size:14px;font-weight:800;cursor:pointer}#${ONBOARDING_ID} .srfrPrimary{flex:1;background:#1428a0;color:#fff}#${ONBOARDING_ID} .srfrSecondary{background:#eef1f6;color:#242932}#${ONBOARDING_ID} .srfrLink{background:transparent;color:#667085;padding-left:5px;padding-right:5px}#${ONBOARDING_ID} .srfrBack{min-width:46px}
      #${ONBOARDING_ID} .srfrHint{margin-top:13px;font-size:11.5px;color:#8a909c;line-height:1.4}#${ONBOARDING_ID} .srfrError{display:none;margin-top:10px;padding:10px 12px;border-radius:12px;background:#fff1f0;color:#a52b25;font-size:12px;font-weight:700}#${ONBOARDING_ID} .srfrError.show{display:block}
      @media(max-width:600px){#${ONBOARDING_ID}{place-items:end center;padding:10px 10px calc(10px + env(safe-area-inset-bottom))}#${ONBOARDING_ID} .srfrCard{width:100%;max-height:min(92dvh,760px);border-radius:28px;padding:20px}#${ONBOARDING_ID} h2{font-size:26px}#${ONBOARDING_ID} .srfrActions{position:sticky;bottom:-20px;margin-left:-20px;margin-right:-20px;padding:13px 20px calc(13px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(255,255,255,.88),#fff 28%);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}#${ONBOARDING_ID} .srfrPair{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function onboardingRoot(){
    ensureOnboardingCss();
    let root=document.getElementById(ONBOARDING_ID);
    if(root)return root;
    root=document.createElement('div');
    root.id=ONBOARDING_ID;
    root.hidden=true;
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','Bienvenue dans Store Runner');
    root.addEventListener('click',onOnboardingClick);
    document.body.appendChild(root);
    return root;
  }

  function progressHtml(step){
    let html='<div class="srfrProgress" aria-hidden="true">';
    for(let i=0;i<4;i++)html+='<i class="'+(i<=step?'on':'')+'"></i>';
    return html+'</div>';
  }

  function currentStoreCount(){
    const stores=window.state&&Array.isArray(state.stores)?state.stores:[];
    return stores.filter(function(store){return !isDemoStore(store)}).length;
  }

  function onboardingMarkup(step){
    const p=window.state&&state.profile?state.profile:{};
    const settings=window.state&&state.settings?state.settings:{};
    if(step===0)return '<div class="srfrCard"><div class="srfrLogo">SR</div>'+progressHtml(step)+'<h2>Bienvenue dans Store Runner</h2><p>Configure ton espace terrain en quelques minutes. Rien n’est prérempli avec de faux magasins : tu pars uniquement de tes vraies données.</p><div class="srfrGrid"><div class="srfrFeature"><b>▣ Prépare ta semaine</b><span>Organise tes magasins et garde la main sur l’ordre des visites.</span></div><div class="srfrFeature"><b>➤ Travaille en Mode Runner</b><span>Retrouve ta prochaine visite, tes actions et tes notes sur le terrain.</span></div><div class="srfrFeature"><b>✓ Garde ton historique</b><span>Visites, photos et comptes rendus restent liés à tes magasins.</span></div></div><div class="srfrActions"><button class="srfrPrimary" type="button" data-srfr-next>Configurer mon espace</button><button class="srfrSecondary" type="button" data-srfr-import>J’ai déjà une sauvegarde</button><button class="srfrLink" type="button" data-srfr-dismiss>Plus tard</button></div></div>';
    if(step===1)return '<div class="srfrCard">'+progressHtml(step)+'<h2>Ton secteur</h2><p>Juste l’essentiel pour démarrer. Le point de départ et les réglages avancés resteront modifiables ensuite.</p><label for="srfrSector">Nom du secteur</label><input id="srfrSector" type="text" autocomplete="organization" placeholder="Ex. Rhône-Alpes"><label for="srfrRep">Ton prénom <span style="font-weight:500;color:#8a909c">(facultatif)</span></label><input id="srfrRep" type="text" autocomplete="given-name" placeholder="Ex. Alex"><div class="srfrPair"><div><label for="srfrCapacity">Crédits max / jour</label><input id="srfrCapacity" type="number" inputmode="numeric" min="1" max="8" value="'+Math.max(1,Math.min(8,Number(settings.maxVisitsPerDay)||4))+'"></div><div><label for="srfrTarget">Objectif / semaine</label><input id="srfrTarget" type="number" inputmode="numeric" min="1" max="60" value="'+Math.max(1,Math.min(60,Number(settings.target)||20))+'"></div></div><div class="srfrError" data-srfr-error></div><div class="srfrActions"><button class="srfrSecondary srfrBack" type="button" data-srfr-back aria-label="Retour">‹</button><button class="srfrPrimary" type="button" data-srfr-save-setup>Continuer</button></div></div>';
    if(step===2){const n=currentStoreCount();return '<div class="srfrCard">'+progressHtml(step)+'<h2>Ajoute tes magasins</h2><p>Utilise la même recherche que dans l’application. Aucun catalogue fictif n’est ajouté automatiquement.</p><div class="srfrCount"><strong data-srfr-store-count>'+n+'</strong><span>'+((n===1)?'magasin ajouté':'magasins ajoutés')+'</span></div><div class="srfrGrid"><div class="srfrFeature"><b>Commence petit si tu veux</b><span>Tu peux ajouter un seul magasin maintenant et compléter ton secteur plus tard depuis Magasins.</span></div></div><div class="srfrActions"><button class="srfrSecondary srfrBack" type="button" data-srfr-back aria-label="Retour">‹</button><button class="srfrSecondary" type="button" data-srfr-add-store>+ Ajouter un magasin</button><button class="srfrPrimary" type="button" data-srfr-next>'+(n?'Continuer':'Continuer sans magasin')+'</button></div></div>'}
    const hasBase=!!(window.storeRunnerHasValidBase&&window.storeRunnerHasValidBase());
    return '<div class="srfrCard">'+progressHtml(3)+'<h2>Ton espace est prêt</h2><p>Store Runner ne t’impose aucune donnée. Tu peux maintenant construire ton vrai secteur à ton rythme.</p><div class="srfrGrid"><div class="srfrFeature"><b>1 · Magasins</b><span>'+currentStoreCount()+' enregistré'+(currentStoreCount()>1?'s':'')+'. Tu peux en ajouter à tout moment.</span></div><div class="srfrFeature"><b>2 · Point de départ</b><span>'+(hasBase?'Déjà configuré.':'À définir dans Secteur avant de générer ta première tournée.')+'</span></div><div class="srfrFeature"><b>3 · Planning puis Mode Runner</b><span>Génère ta semaine, ajuste l’ordre si besoin, puis lance ton run le jour J.</span></div></div><div class="srfrActions"><button class="srfrSecondary srfrBack" type="button" data-srfr-back aria-label="Retour">‹</button>'+(hasBase?'':'<button class="srfrSecondary" type="button" data-srfr-departure>Définir mon départ</button>')+'<button class="srfrPrimary" type="button" data-srfr-finish>Commencer</button></div></div>';
  }

  function fillOnboardingInputs(){
    if(onboardingStep!==1||!window.state)return;
    const p=state.profile||{};
    const sector=document.getElementById('srfrSector'),rep=document.getElementById('srfrRep');
    if(sector)sector.value=String(p.sectorName||'Mon secteur')==='Mon secteur'?'':String(p.sectorName||'');
    if(rep)rep.value=String(p.repName||'');
  }

  function focusOnNextFrame(id){
    const run=function(){
      const input=document.getElementById(id);
      if(!input)return;
      try{input.focus({preventScroll:true})}catch(e){try{input.focus()}catch(err){}}
    };
    if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(run);else run();
  }

  function renderOnboarding(){
    const root=onboardingRoot();
    root.innerHTML=onboardingMarkup(onboardingStep);
    root.hidden=false;
    onboardingOpen=true;
    document.documentElement.classList.add('srFirstRunOpen');
    fillOnboardingInputs();
    if(onboardingStep===1)focusOnNextFrame('srfrSector');
  }

  function closeOnboarding(){
    const root=document.getElementById(ONBOARDING_ID);
    if(root)root.hidden=true;
    onboardingOpen=false;
    document.documentElement.classList.remove('srFirstRunOpen');
  }

  function setOnboardingStep(step){
    onboardingStep=Math.max(0,Math.min(3,Number(step)||0));
    writeOnboardingMarker('in-progress',onboardingStep);
    renderOnboarding();
  }

  function saveOnboardingSetup(){
    if(!window.state)return false;
    const sector=document.getElementById('srfrSector'),rep=document.getElementById('srfrRep'),cap=document.getElementById('srfrCapacity'),target=document.getElementById('srfrTarget'),err=document.querySelector('[data-srfr-error]');
    const capacity=Math.round(Number(cap&&cap.value)),weekly=Math.round(Number(target&&target.value));
    if(!isFinite(capacity)||capacity<1||capacity>8||!isFinite(weekly)||weekly<1||weekly>60){
      if(err){err.textContent='Vérifie la capacité (1 à 8) et l’objectif hebdo (1 à 60).';err.classList.add('show')}
      return false;
    }
    if(!state.profile)state.profile={};
    if(!state.settings)state.settings={};
    state.profile.sectorName=String(sector&&sector.value||'').trim()||'Mon secteur';
    state.profile.repName=String(rep&&rep.value||'').trim();
    state.settings.maxVisitsPerDay=capacity;
    state.settings.target=weekly;
    saveStateQuietly();
    refreshAppQuietly();
    try{document.dispatchEvent(new CustomEvent('store-runner:first-run-setup-saved',{detail:{maxVisitsPerDay:capacity,target:weekly}}))}catch(e){}
    return true;
  }

  function openFirstStoreAdd(){
    const api=window.StoreRunnerStoreAdd;
    if(!api||typeof api.open!=='function')return false;
    api.open({onAdded:function(){
      if(onboardingOpen&&onboardingStep===2)renderOnboarding();
    }});
    return true;
  }

  function finishOnboarding(destination){
    writeOnboardingMarker('complete',3,{completedAt:new Date().toISOString()});
    closeOnboarding();
    if(destination==='profile'){
      if(typeof window.goTab==='function')window.goTab('profilePanel');
      else if(typeof window.switchTab==='function')window.switchTab('profilePanel',null);
      focusOnNextFrame('pBaseName');
    }else if(typeof window.goTab==='function')window.goTab('homePanel');
  }

  function onOnboardingClick(e){
    const t=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!t)return;
    if(t.hasAttribute('data-srfr-next')){setOnboardingStep(onboardingStep+1);return}
    if(t.hasAttribute('data-srfr-back')){setOnboardingStep(onboardingStep-1);return}
    if(t.hasAttribute('data-srfr-save-setup')){if(saveOnboardingSetup())setOnboardingStep(2);return}
    if(t.hasAttribute('data-srfr-add-store')){openFirstStoreAdd();return}
    if(t.hasAttribute('data-srfr-finish')){finishOnboarding();return}
    if(t.hasAttribute('data-srfr-departure')){finishOnboarding('profile');return}
    if(t.hasAttribute('data-srfr-dismiss')){writeOnboardingMarker('dismissed',onboardingStep,{dismissedAt:new Date().toISOString()});closeOnboarding();return}
    if(t.hasAttribute('data-srfr-import')){
      writeOnboardingMarker('importing',0);
      closeOnboarding();
      if(typeof window.goTab==='function')window.goTab('importPanel');
      else if(typeof window.switchTab==='function')window.switchTab('importPanel',null);
    }
  }

  function prepareFirstRun(force){
    if(!window.state)return false;
    let marker=readOnboardingMarker();
    if(force){onboardingStep=0;renderOnboarding();return true}
    if(marker&&(marker.status==='complete'||marker.status==='dismissed'))return false;
    if(marker&&marker.status==='importing'){
      if(hasRealUserData(state)){
        writeOnboardingMarker('complete',3,{reason:'restored-data'});
        return false;
      }
      marker=null;
    }
    if(marker&&marker.status==='in-progress'){
      onboardingStep=Math.max(0,Math.min(3,Number(marker.step)||0));
      renderOnboarding();
      return true;
    }
    if(hasRealUserData(state)){
      writeOnboardingMarker('complete',3,{reason:'existing-user'});
      return false;
    }
    sanitizePristineDemoState(state);
    if(!isFreshEmptyState(state))return false;
    onboardingStep=0;
    writeOnboardingMarker('in-progress',0,{startedAt:new Date().toISOString()});
    renderOnboarding();
    return true;
  }

  function installFirstRunOnboarding(){
    prepareFirstRun(false);
    document.addEventListener('store-runner:store-added',function(){
      if(onboardingOpen&&onboardingStep===2)renderOnboarding();
    });
    document.addEventListener('store-runner:data-restored',function(){
      if(window.state&&hasRealUserData(state)){
        writeOnboardingMarker('complete',3,{reason:'restored-data'});
        closeOnboarding();
      }
    });
  }

  function install(){
    if(installed)return;
    installed=true;
    ensureSettingsSheetCss();
    installStoreQuickReturnGuard();
    installFirstRunOnboarding();

    document.addEventListener('click',function(e){
      const shortcut=e.target&&e.target.closest?e.target.closest('#'+SETTINGS_SHORTCUT_ID):null;
      if(shortcut){
        if(typeof e.preventDefault==='function')e.preventDefault();
        if(typeof e.stopPropagation==='function')e.stopPropagation();
        openPlanningSettingsSheet();
        return;
      }

      const recalc=e.target&&e.target.closest?e.target.closest('#recalculateRemainingWeekBtn'):null;
      if(recalc){
        closePlanningSettingsSheet();
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

  window.StoreRunnerNavigation={
    openPlanningSettings:openPlanningSettingsSheet,
    closePlanningSettings:closePlanningSettingsSheet,
    openFirstRun:function(){return prepareFirstRun(true)},
    closeFirstRun:closeOnboarding,
    firstRunState:function(){return readOnboardingMarker()},
    _firstRun:{isDemoStore:isDemoStore,hasRealUserData:hasRealUserData,isPristineDemoState:isPristineDemoState,isFreshEmptyState:isFreshEmptyState}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();