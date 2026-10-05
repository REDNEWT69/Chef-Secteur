(function(){
  'use strict';
  let returnToPlanning=false;
  let installed=false;
  let dragStartY=null;
  let suppressNextQuickOpen=false;
  let onboardingStep=0;
  let onboardingOpen=false;
  /* V271 : état du guide. Tout est en mémoire ; rien n'est persisté hors du marqueur. */
  let renderedStep=-1;        // dernière étape dessinée (-1 : guide fermé)
  let guideBusy='';           // 'position' | 'generate' : un propriétaire travaille
  let guideAwaiting=null;     // 'import' | 'departure' : le guide attend un écran existant
  let guideNote=null;         // dernier retour d'un propriétaire { kind:'ok'|'alert', text }
  let guideGenerated=null;    // { visits, stores } renvoyés par la génération du propriétaire
  let guideRunner=null;       // instance Runner du guide (détruite à la fermeture)
  let runnerKey='';           // état + texte déjà posés sur Runner : aucun rejeu à l'identique
  let introPlayed=false;      // la sortie de derrière le logo n'est jouée qu'une fois par document
  let guideArmed=false;       // écouteurs d'événements métier posés

  const SETTINGS_ID='planningSettings';
  const SETTINGS_SHORTCUT_ID='planningSettingsShortcut';
  const SETTINGS_SHEET_CLASS='planningSettingsSheetOpen';
  const SETTINGS_HEADER_ID='planningSettingsSheetHeader';
  const ONBOARDING_ID='storeRunnerFirstRun';
  const ONBOARDING_STYLE_ID='storeRunnerFirstRunCss';
  const ONBOARDING_KEY='store-runner-onboarding-v1';
  const APP_ICON='./app-icon.svg';
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

  /* ==========================================================================
     Premier lancement guidé par Runner (V271) — contrat : RUNNER_FIRST_RUN_V271.md

     Ce bloc possède l'écran du premier lancement et rien d'autre. Il appelle les
     propriétaires existants (ajout de magasins, écran Données, profil/GPS, génération
     3 semaines) et laisse Runner traduire leur résultat réel en état visuel :
     aucune donnée écrite par le guide, aucune visite choisie ou simulée, aucun
     timer, aucun observer permanent (un seul observer borné, au renvoi vers un écran
     existant : watchHomeReturn). Le marqueur du moteur durable n'est qu'un indice : l'étape
     se déduit toujours de l'état réel (deriveStep). Le schéma de `state` n'est pas
     touché.
     ========================================================================== */
  const STEP_COUNT=5;
  const STEP_TITLES=['Bienvenue dans Store Runner','Ton secteur','Ton point de départ','Ton planning','Tout est en place'];
  /* Champs facultatifs du marqueur qui survivent aux réécritures de statut. */
  const KEPT_MARKER_FIELDS=['startedAt','startSkipped','generated'];

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
    const previous=readOnboardingMarker()||{},kept={};
    KEPT_MARKER_FIELDS.forEach(function(key){if(previous[key]!==undefined)kept[key]=previous[key]});
    const value=Object.assign({version:1},kept,{status:String(status||''),step:Math.max(0,Number(step)||0),at:new Date().toISOString()},extra||{});
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
  /* Activité qui dépasse l'installation : ni les magasins, ni le point de départ, ni le
     planning que le guide fait créer. Elle prouve qu'on parle d'un utilisateur installé. */
  function hasActivityBeyondSetup(candidate){
    const s=candidate||{};
    for(const key of ['visits','notes','hotelReservations','included','excluded','locks'])if(objectHasEntries(s[key]))return true;
    if(Array.isArray(s.appointments)&&s.appointments.length)return true;
    if(Array.isArray(s.opportunities)&&s.opportunities.length)return true;
    return !!(objectHasEntries(s.businessV2)&&Object.keys(s.businessV2).some(function(k){
      const v=s.businessV2[k];return Array.isArray(v)?v.length>0:objectHasEntries(v);
    }));
  }
  function hasRealUserData(candidate){
    const s=candidate||{};
    const stores=Array.isArray(s.stores)?s.stores:[];
    if(stores.some(function(store){return !isDemoStore(store)}))return true;
    if(objectHasEntries(s.plan))return true;
    if(hasActivityBeyondSetup(s))return true;
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

  /* ------------------------------------------------------------------ faits réels */
  /* `window.state` est relu à chaque appel : la génération et la restauration le remplacent. */
  function plural(n,one,many){return n+' '+(n>1?many:one)}
  function currentStoreCount(){
    const stores=window.state&&Array.isArray(state.stores)?state.stores:[];
    return stores.filter(function(store){return !isDemoStore(store)}).length;
  }
  function hasStartPoint(){
    try{return !!(typeof window.storeRunnerHasValidBase==='function'&&window.storeRunnerHasValidBase())}catch(e){return false}
  }
  function startPointLabel(){
    const p=window.state&&state.profile?state.profile:{};
    const name=String(p.baseName||'').trim(),address=String(p.baseAddress||'').trim();
    const label=name&&!/^(départ|depart|base)$/i.test(name)?name:(address||name);
    return label.length>80?label.slice(0,79).trimEnd()+'…':label;
  }
  function plannedVisitCount(){
    const plan=window.state&&state.plan;
    if(!plan||typeof plan!=='object')return 0;
    return Object.keys(plan).reduce(function(n,day){return n+(Array.isArray(plan[day])?plan[day].length:0)},0);
  }
  function guideFacts(){
    return{stores:currentStoreCount(),hasStart:hasStartPoint(),startLabel:startPointLabel(),planned:plannedVisitCount()};
  }

  /* L'étape (0 présentation, 1 secteur, 2 départ, 3 planning, 4 fin) se déduit de l'état réel ;
     le marqueur ne dit que « la présentation est passée », « le départ est passé » et
     « le guide a généré ». Un marqueur de l'ancien parcours se lit de la même façon. */
  function deriveStep(facts,marker){
    const f=facts||{},m=marker||{};
    if(m.generated)return 4;
    if(!f.stores)return Number(m.step)>=1?1:0;
    if(!f.hasStart&&!m.startSkipped)return 2;
    return 3;
  }
  /* Raison de terminer en silence un guide « en cours » dont l'utilisateur n'a plus besoin. */
  function establishedReason(candidate,marker,facts){
    if(hasActivityBeyondSetup(candidate))return 'existing-user';
    const f=facts||guideFacts();
    if(!(marker&&marker.generated)&&f.stores>0&&f.hasStart&&f.planned>0)return 'setup-complete';
    return '';
  }

  /* ------------------------------------------------------------ textes de Runner */
  /* Runner ne dit que ce que l'état ou un propriétaire a produit : aucun « optimisé »,
     « meilleur » ou « optimal » (verrouillé par tests/first-run-runner-v271.test.cjs).
     La voix de Runner est le contenu du guide : elle est annoncée aux lecteurs d'écran à chaque
     changement d'étape ou d'état. Seule l'alerte se tait (`silent`) : sa note `role="alert"` porte
     le message du propriétaire, qui ne doit pas être lu deux fois. */
  function stepCopy(step,facts,ui){
    const f=facts||{},u=ui||{};
    if(step===0)return{state:'neutral',title:'Je suis Runner, ton copilote terrain.',text:'Je t’aide à préparer ton secteur et tes tournées.'};
    if(step===1){
      if(f.stores>0)return{state:'success',title:plural(f.stores,'magasin','magasins')+' dans ton secteur.',text:'Tu peux en ajouter d’autres ou continuer.'};
      return{state:'neutral',title:'Commençons par ton secteur.',text:'Ajoute tes magasins ou importe tes données.'};
    }
    if(step===2){
      if(u.busy==='position')return{state:'analyzing',title:'Je cherche ta position…',text:'Cela peut prendre quelques secondes.'};
      if(u.note&&u.note.kind==='alert')return{state:'alert',title:'Position indisponible.',text:'Tu peux réessayer ou saisir une adresse.',silent:true};
      if(f.hasStart)return{state:'success',title:'Point de départ enregistré.',text:f.startLabel||'Tes trajets partiront de là.'};
      return{state:'neutral',title:'D’où pars-tu ?',text:'Je calcule tes trajets depuis ce point.'};
    }
    if(step===3){
      if(u.busy==='generate')return{state:'analyzing',title:'Je prépare tes 3 semaines.',text:'Cela peut prendre quelques secondes.'};
      if(u.note&&u.note.kind==='alert')return{state:'alert',title:'La génération n’a pas abouti.',text:'Tu peux réessayer ou modifier ton point de départ.',silent:true};
      return{state:'neutral',title:'Ton secteur est prêt.',text:'Générons tes 3 prochaines semaines.'};
    }
    return{state:'success',title:'C’est prêt.',text:'Je t’accompagnerai dans le Planning, l’Assistant et tes magasins.'};
  }

  /* ------------------------------------------------------------------ présentation */
  function ensureOnboardingCss(){
    if(document.getElementById(ONBOARDING_STYLE_ID))return;
    const style=document.createElement('style');
    style.id=ONBOARDING_STYLE_ID;
    const R='#'+ONBOARDING_ID;
    style.textContent=[
      'html.srFirstRunOpen,html.srFirstRunOpen body{overflow:hidden!important;overscroll-behavior:none}',
      R+'{position:fixed;inset:0;z-index:245;display:grid;place-items:center;padding:16px;background:linear-gradient(165deg,#f7f9ff,#f8f8f6);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#17191d}',
      R+'[hidden]{display:none!important}',
      R+' .srfrCard{width:min(520px,100%);max-height:calc(100dvh - 32px);overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;border:1px solid rgba(20,40,100,.09);border-radius:30px;background:rgba(255,255,255,.96);box-shadow:0 28px 80px rgba(26,36,62,.16);padding:22px 24px 20px;box-sizing:border-box}',
      R+' .srfrHead{display:flex;align-items:center;gap:14px}',
      R+' .srfrLogo{display:block;flex:0 0 auto;width:52px;height:52px;object-fit:contain;position:relative;z-index:1}',
      R+' .srfrProgress{display:flex;flex:1 1 auto;gap:6px;min-width:0}',
      R+' .srfrProgress i{height:5px;flex:1;border-radius:99px;background:#e7e9ef;transition:background-color .2s ease}',
      R+' .srfrProgress i.on{background:#1428a0}',
      R+' .srfrStage{display:flex;align-items:center;min-height:104px;margin:16px 0 4px}',
      R+' .srfrStage:empty{display:none}',
      R+' .srfrStage .srRunner{flex:1 1 auto}',
      R+' .srfrEyebrow{margin:12px 0 0;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#687080}',
      R+' h2{margin:4px 0 0;font-size:26px;line-height:1.1;letter-spacing:-.035em;outline:none}',
      R+' p{margin:9px 0 0;color:#687080;font-size:14px;line-height:1.5}',
      R+' .srfrGrid{display:grid;gap:10px;margin-top:16px}',
      R+' .srfrGrid.two{grid-template-columns:1fr 1fr}',
      R+' .srfrFeature{padding:13px 15px;border:1px solid #e8eaf0;border-radius:18px;background:#fafbfc}',
      R+' .srfrFeature b{display:block;font-size:14px}',
      R+' .srfrFeature span{display:block;margin-top:3px;color:#747c8c;font-size:13px;line-height:1.4;overflow-wrap:anywhere}',
      R+' .srfrCount{margin-top:16px;padding:14px 16px;border-radius:18px;background:#f3f5ff;color:#24355f}',
      R+' .srfrCount strong{display:block;font-size:28px;line-height:1.1}',
      R+' .srfrCount span{font-size:13px;color:#657093}',
      R+' .srfrNote{margin-top:14px;padding:11px 13px;border-radius:14px;font-size:13px;font-weight:650;line-height:1.45;overflow-wrap:anywhere}',
      R+' .srfrNote.alert{background:#fff1f0;color:#a52b25}',
      R+' .srfrNote.ok{background:#e8f7ef;color:#16704a}',
      R+' .srfrHint{margin-top:12px;font-size:12px;color:#7a8190;line-height:1.45}',
      R+' .srfrMain.is-in{animation:srfrIn .22s ease-out}',
      '@keyframes srfrIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      R+' .srfrActions{display:grid;gap:9px;margin-top:18px}',
      /* touch-action : un double toucher rapide ne zoome pas la page (génération, « Continuer »). */
      R+' button{min-height:48px;border:0;border-radius:15px;padding:11px 15px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      R+' button:disabled{opacity:.55;cursor:default}',
      R+' .srfrPrimary{background:#1428a0;color:#fff}',
      R+' .srfrSecondary{background:#eef1f6;color:#242932}',
      R+' .srfrFoot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px}',
      R+' .srfrFoot.solo{justify-content:center}',
      R+' .srfrLink{min-height:44px;padding:8px 8px;background:transparent;color:#5b6472;font-size:14px;font-weight:700}',
      '@media(max-width:600px){'+R+'{place-items:end center;padding:10px 10px calc(10px + env(safe-area-inset-bottom))}'+R+' .srfrCard{width:100%;max-height:min(92dvh,760px);border-radius:28px;padding:18px 18px 12px}'+R+' h2{font-size:24px}'+R+' .srfrActions{position:sticky;bottom:-12px;margin:14px -18px -12px;padding:12px 18px 12px;background:linear-gradient(180deg,rgba(255,255,255,.88),#fff 30%);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}}',
      /* Écran court (téléphone en paysage, fenêtre partagée) : la carte se resserre et les actions, collées en bas, passent côte à côte pour que l'action principale reste toujours à portée du pouce. */
      '@media(max-height:480px){'+R+' .srfrCard{padding:14px 18px 10px}'+R+' .srfrStage{min-height:0;margin:10px 0 0}'+R+' .srfrEyebrow{margin-top:8px}'+R+' h2{font-size:22px}'+R+' .srfrActions{display:flex;flex-wrap:wrap;position:sticky;bottom:-10px;margin:12px -18px -10px;padding:10px 18px;background:linear-gradient(180deg,rgba(255,255,255,.88),#fff 30%);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}'+R+' .srfrActions>button{flex:1 1 150px}'+R+' .srfrActions>.srfrFoot{flex:1 1 100%}}',
      /* Le guide est la surface de retour : les toasts passagers de l'application (génération, mise à jour installée) ne s'empilent pas dessus. Une bannière qui attend une réponse (data-sticky) reste visible. */
      'html.srFirstRunOpen .storeRunnerToast,html.srFirstRunOpen #storeRunnerUpdateBanner:not([data-sticky]){display:none!important}',
      '@media (prefers-reduced-motion:reduce){'+R+' *{animation:none!important;transition:none!important}}'
    ].join('\n');
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
    root.setAttribute('aria-labelledby','srfrTitle');
    root.addEventListener('click',onOnboardingClick);
    root.addEventListener('keydown',onOnboardingKeydown);
    document.body.appendChild(root);
    return root;
  }

  /* Même logo que l'en-tête et l'écran de chargement. L'URL versionnée est celle que
     sw.js précache : le premier écran reste servi hors ligne, sans attendre le réseau. */
  function appIconUrl(){
    const rev=window.__STORE_RUNNER_BUILD_REV;
    return APP_ICON+(rev?'?rev='+encodeURIComponent(rev):'');
  }

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
  }

  /* Le retour d'un propriétaire (position, génération) n'est montré que sur l'étape qui l'a demandé. */
  function noteFor(step){
    return guideNote&&guideNote.step===step&&guideNote.text?guideNote:null;
  }
  function noteHtml(step){
    const note=noteFor(step);
    if(!note)return '';
    const alert=note.kind==='alert';
    return '<div class="srfrNote '+(alert?'alert':'ok')+'" role="'+(alert?'alert':'status')+'">'+esc(note.text)+'</div>';
  }

  function mainHtml(step,f){
    const head='<p class="srfrEyebrow">Étape '+(step+1)+' sur '+STEP_COUNT+'</p><h2 id="srfrTitle" tabindex="-1">'+esc(STEP_TITLES[step])+'</h2>';
    const startFact='<div class="srfrFeature"><b>Point de départ</b><span>'+(f.hasStart?esc(f.startLabel||'Enregistré'):'Pas encore défini')+'</span></div>';
    let body='';
    if(step===0){
      body='<p>Configure ton espace en quelques minutes : tes magasins, ton point de départ, puis tes 3 premières semaines.</p><p class="srfrHint">Rien n’est prérempli avec de faux magasins : tu pars uniquement de tes vraies données.</p>';
    }else if(step===1){
      body='<div class="srfrCount"><strong data-srfr-store-count>'+f.stores+'</strong><span>'+(f.stores===1?'magasin ajouté':'magasins ajoutés')+'</span></div>'
        +'<p>'+(f.stores?'Tu peux continuer ou en ajouter d’autres.':'Ajoute-les un par un, par enseigne et région, ou importe ta sauvegarde.')+'</p>';
    }else if(step===2){
      body=guideBusy==='position'?'<p>Recherche de ta position…</p>'
        :(f.hasStart?'<div class="srfrGrid">'+startFact+'</div>':'<p>Choisis ton domicile, un bureau ou ta position du moment. Je ne demande ta position que si tu touches « Utiliser ma position ».</p>');
      body+=noteHtml(2);
    }else if(step===3){
      body='<div class="srfrGrid two"><div class="srfrFeature"><b>'+esc(plural(f.stores,'magasin','magasins'))+'</b><span>dans ton secteur</span></div>'+startFact+'</div>'
        +'<p class="srfrHint">'+(f.hasStart?'À la génération, ta position actuelle est relue pour fixer le départ. Ton adresse de départ enregistrée, si tu en as une, sert de repli.':'Ta position te sera demandée au moment de générer.')+'</p>'
        +noteHtml(3);
    }else{
      const g=guideGenerated||(readOnboardingMarker()||{}).generated||{};
      const visits=Number(g.visits)||0,stores=Number(g.stores)||0;
      body=visits?'<div class="srfrCount"><strong>'+visits+'</strong><span>'+(visits===1?'visite planifiée':'visites planifiées')+' sur 3 semaines'+(stores?' · '+esc(plural(stores,'magasin','magasins')):'')+'</span></div>':'';
      body+='<p>Ton Accueil t’attend.</p>';
    }
    return head+body;
  }

  function actionsHtml(step,f){
    const busy=!!guideBusy,dis=busy?' disabled':'';
    const back='<button class="srfrLink" type="button" data-srfr-back aria-label="Retour"'+dis+'>‹ Retour</button>';
    const later='<button class="srfrLink" type="button" data-srfr-dismiss'+dis+'>Plus tard</button>';
    const primary=function(attr,label){return '<button class="srfrPrimary" type="button" '+attr+dis+'>'+label+'</button>'};
    const secondary=function(attr,label){return '<button class="srfrSecondary" type="button" '+attr+dis+'>'+label+'</button>'};
    if(step===0)return primary('data-srfr-next','Commencer')+secondary('data-srfr-import','J’ai déjà une sauvegarde')+'<div class="srfrFoot solo">'+later+'</div>';
    if(step===1){
      return (f.stores?primary('data-srfr-next','Continuer')+secondary('data-srfr-add-store','+ Ajouter des magasins')
        :primary('data-srfr-add-store','Ajouter mes magasins')+secondary('data-srfr-import','Importer mes données'))
        +'<div class="srfrFoot">'+back+later+'</div>';
    }
    if(step===2){
      if(f.hasStart)return primary('data-srfr-next','Continuer')+secondary('data-srfr-address','Modifier mon point de départ')+'<div class="srfrFoot">'+back+later+'</div>';
      return primary('data-srfr-position',guideBusy==='position'?'Recherche en cours…':'Utiliser ma position')+secondary('data-srfr-address','Saisir une adresse')
        +'<div class="srfrFoot">'+back+'<button class="srfrLink" type="button" data-srfr-skip'+dis+'>Passer cette étape</button>'+later+'</div>';
    }
    if(step===3){
      const failed=!!(noteFor(3)&&noteFor(3).kind==='alert');
      return primary('data-srfr-generate',guideBusy==='generate'?'Génération en cours…':(failed?'Réessayer':'Générer mes 3 semaines'))
        +(failed?secondary('data-srfr-start','Modifier mon point de départ'):'')+'<div class="srfrFoot">'+back+later+'</div>';
    }
    return primary('data-srfr-finish','Ouvrir mon accueil');
  }

  function focusableIn(root){
    return Array.prototype.slice.call(root.querySelectorAll('button:not([disabled]),[tabindex="0"]')).filter(function(el){return el.getClientRects().length>0});
  }
  function focusKey(el){
    const names=el&&el.getAttributeNames?el.getAttributeNames():[];
    for(const name of names)if(name.indexOf('data-srfr-')===0)return name;
    return '';
  }
  function focusElement(el){
    if(!el)return;
    try{el.focus({preventScroll:true})}catch(e){try{el.focus()}catch(err){}}
  }
  /* Le guide est modal : la tabulation tourne dans sa carte au lieu de sortir vers l'application dessous. */
  function onOnboardingKeydown(e){
    if(!e||e.key!=='Tab')return;
    const root=document.getElementById(ONBOARDING_ID);
    if(!root||root.hidden)return;
    const items=focusableIn(root);
    if(!items.length){if(e.preventDefault)e.preventDefault();return}
    const first=items[0],last=items[items.length-1],active=document.activeElement;
    if(e.shiftKey&&(active===first||!root.contains(active)||active.id==='srfrTitle')){if(e.preventDefault)e.preventDefault();focusElement(last)}
    else if(!e.shiftKey&&(active===last||!root.contains(active))){if(e.preventDefault)e.preventDefault();focusElement(first)}
  }

  function paintCard(root){
    let card=root.querySelector('.srfrCard');
    if(card)return card;
    root.innerHTML='<div class="srfrCard"><div class="srfrHead"><img class="srfrLogo" src="'+appIconUrl()+'" width="52" height="52" alt="" decoding="async"><div class="srfrProgress" aria-hidden="true" data-srfr-progress></div></div>'
      +'<div class="srfrStage" data-srfr-stage></div><div class="srfrMain" data-srfr-main></div><div class="srfrActions" data-srfr-actions></div></div>';
    card=root.querySelector('.srfrCard');
    return card;
  }

  /* ------------------------------------------------------------------- Runner */
  function runnerApi(){
    const api=window.StoreRunnerRunner;
    return api&&typeof api.mount==='function'?api:null;
  }
  function releaseGuideRunner(){
    if(guideRunner){try{guideRunner.cancelMove();guideRunner.destroy()}catch(e){}}
    guideRunner=null;
    runnerKey='';
  }
  /* L'écran de chargement du shell couvre tout jusqu'à l'Accueil monté : jouer la sortie de
     Runner dessous la consommerait sans que personne la voie. On attend donc, par événement,
     que le voile ait levé (deux images après l'Accueil, comme le shell). */
  function whenAppVisible(fn){
    const boot=window.StoreRunnerBoot;
    if(!boot||typeof boot.settled!=='function'||boot.settled()){fn();return}
    const twoFrames=function(){
      if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(function(){window.requestAnimationFrame(fn)});else fn();
    };
    /* Page déjà chargée : plus de `load` à attendre, le voile se lève dans les deux images qui viennent. */
    if(document.readyState==='complete'){twoFrames();return}
    let done=false;
    const go=function(){
      if(done)return;
      done=true;
      document.removeEventListener('store-runner:home-rendered',go);
      window.removeEventListener('load',go);
      twoFrames();
    };
    document.addEventListener('store-runner:home-rendered',go);
    window.addEventListener('load',go);
  }
  /* Une seule sortie de derrière le logo par document (mouvement V270), même si le guide
     est rouvert, redessiné ou repris à une autre étape. */
  function scheduleIntro(stage){
    if(introPlayed)return;
    introPlayed=true;
    stage.style.visibility='hidden';
    whenAppVisible(function(){
      stage.style.visibility='';
      const runner=guideRunner,logo=document.querySelector('#'+ONBOARDING_ID+' .srfrLogo');
      if(runner&&runner.isConnected()&&runner.el.parentNode===stage&&typeof runner.moveTo==='function')runner.moveTo(stage,{from:logo,animate:true,entrance:'peek',duration:1180});
    });
  }
  function syncGuideRunner(stage,step,facts){
    const api=runnerApi();
    if(!api||!stage)return;
    let mounted=false;
    if(!guideRunner||!guideRunner.isConnected()||guideRunner.el.parentNode!==stage){
      releaseGuideRunner();
      guideRunner=api.mount(stage,{variant:'sheet',size:'md',state:'neutral',decorative:true});
      if(!guideRunner)return;
      mounted=true;
    }
    const view=stepCopy(step,facts,{busy:guideBusy,note:noteFor(step)});
    const key=[view.state,view.title,view.text,view.silent?1:0].join('|');
    if(key!==runnerKey){
      runnerKey=key;
      guideRunner.setState(view.state,{message:view.text,title:view.title,silent:view.silent===true});
    }
    if(mounted)scheduleIntro(stage);
  }

  /* ------------------------------------------------------------------ cycle de vie */
  const GUIDE_EVENTS=[
    ['store-runner:store-added',onStoreAdded],
    ['store-runner:stores-added',onStoresAdded],
    ['store-runner:profile-saved',onProfileSaved],
    ['store-runner:home-rendered',onHomeRendered],
    ['store-runner:data-restored',onDataRestored]
  ];
  /* Écoutés seulement tant que le guide est en cours : un utilisateur installé n'en porte aucun. */
  function armGuide(){
    if(guideArmed)return;
    guideArmed=true;
    GUIDE_EVENTS.forEach(function(pair){document.addEventListener(pair[0],pair[1])});
  }
  function disarmGuide(){
    if(!guideArmed)return;
    guideArmed=false;
    GUIDE_EVENTS.forEach(function(pair){document.removeEventListener(pair[0],pair[1])});
  }

  function renderOnboarding(){
    const root=onboardingRoot(),step=onboardingStep,facts=guideFacts();
    const changed=renderedStep!==step,reopened=root.hidden;
    const card=paintCard(root);
    const previousFocus=!reopened&&document.activeElement&&root.contains(document.activeElement)?focusKey(document.activeElement):'';
    const progress=card.querySelector('[data-srfr-progress]'),main=card.querySelector('[data-srfr-main]'),actions=card.querySelector('[data-srfr-actions]');
    let dots='';
    for(let i=0;i<STEP_COUNT;i++)dots+='<i class="'+(i<=step?'on':'')+'"></i>';
    progress.innerHTML=dots;
    main.innerHTML=mainHtml(step,facts);
    actions.innerHTML=actionsHtml(step,facts);
    root.hidden=false;
    onboardingOpen=true;
    armGuide();
    document.documentElement.classList.add('srFirstRunOpen');
    syncGuideRunner(card.querySelector('[data-srfr-stage]'),step,facts);
    if(changed){
      main.classList.remove('is-in');
      void main.offsetWidth;
      main.classList.add('is-in');
    }
    /* Le focus ne bouge qu'à un changement d'étape : une mise à jour de la même étape (un magasin
       ajouté, un retour de position) ne le ramène pas sur le titre. */
    if(changed||reopened)focusElement(main.querySelector('#srfrTitle'));
    else if(previousFocus)focusElement(root.querySelector('['+previousFocus+']:not([disabled])'));
    renderedStep=step;
  }

  /* Referme le guide sans le terminer : il attend un écran existant (Données, point de départ). */
  function hideGuide(){
    const root=document.getElementById(ONBOARDING_ID);
    if(root)root.hidden=true;
    onboardingOpen=false;
    renderedStep=-1;
    releaseGuideRunner();
    document.documentElement.classList.remove('srFirstRunOpen');
  }
  /* Renvoi vers un écran existant (Données, point de départ) : si l'utilisateur en revient sans l'avoir
     terminé (bouton Retour d'Android, onglet Accueil), le guide reprend là où il en était au lieu de le
     laisser sur un Accueil vide. Un seul observer, sur la classe d'un seul élément : créé au renvoi,
     déconnecté à la reprise et à la fin du guide. Un rendu de l'Accueil en arrière-plan ne reprend rien. */
  let homeWatch=null;
  function stopWatchingHome(){
    if(homeWatch){homeWatch.disconnect();homeWatch=null}
  }
  function watchHomeReturn(){
    stopWatchingHome();
    const home=document.getElementById('homePanel');
    if(!home||typeof MutationObserver!=='function')return;
    /* Le renvoi n'a pas eu lieu (l'Accueil est encore l'écran actif) : rien à attendre, le guide reprend. */
    if(home.classList.contains('active')){resumeFromRealState();return}
    homeWatch=new MutationObserver(function(){
      if(guideAwaiting&&!onboardingOpen&&home.classList.contains('active'))resumeFromRealState();
    });
    homeWatch.observe(home,{attributes:true,attributeFilter:['class']});
  }

  /* Fin définitive (terminé, reporté ou fermé par l'API) : plus aucun écouteur, et l'Accueil peut
     jouer l'entrée de Runner qu'il a gardée pour ce moment. */
  function closeGuide(status){
    hideGuide();
    guideAwaiting=null;
    stopWatchingHome();
    disarmGuide();
    try{document.dispatchEvent(new CustomEvent('store-runner:first-run-closed',{detail:{status:String(status||'hidden')}}))}catch(e){}
  }
  function goStep(step){
    onboardingStep=Math.max(0,Math.min(STEP_COUNT-1,Number(step)||0));
    guideNote=null;
    writeOnboardingMarker('in-progress',onboardingStep);
    renderOnboarding();
  }

  function goTo(panel){
    if(typeof window.goTab==='function')window.goTab(panel);
    else if(typeof window.switchTab==='function')window.switchTab(panel,null);
  }

  function finishOnboarding(){
    writeOnboardingMarker('complete',STEP_COUNT-1,{completedAt:new Date().toISOString()});
    closeGuide('complete');
    goTo('homePanel');
  }

  function dismissOnboarding(){
    writeOnboardingMarker('dismissed',onboardingStep,{dismissedAt:new Date().toISOString()});
    closeGuide('dismissed');
  }

  /* L'ajout de magasins appartient à store-add-v261.js : le guide n'ouvre que sa porte unique. */
  function openFirstStoreAdd(){
    const api=window.StoreRunnerStoreAdd;
    if(!api||typeof api.open!=='function')return false;
    api.open({});
    return true;
  }

  function openImportScreen(){
    writeOnboardingMarker('importing',onboardingStep);
    guideAwaiting='import';
    hideGuide();
    goTo('importPanel');
    watchHomeReturn();
  }

  function openDepartureScreen(){
    guideAwaiting='departure';
    writeOnboardingMarker('in-progress',2);
    hideGuide();
    if(typeof window.openDepartureSettings==='function')window.openDepartureSettings();
    else goTo('profilePanel');
    watchHomeReturn();
  }

  /* La position n'est lue qu'au tap, par le propriétaire du profil et du GPS. */
  async function useCurrentPosition(){
    if(guideBusy)return;
    const profile=window.StoreRunnerProfile;
    if(!profile||typeof profile.resolvePlanningOrigin!=='function'||typeof profile.applyPlanningOrigin!=='function'){
      guideNote={step:2,kind:'alert',text:'La localisation n’est pas encore chargée. Réessaie dans un instant.'};
      renderOnboarding();
      return;
    }
    guideBusy='position';
    guideNote=null;
    renderOnboarding();
    let origin=null;
    try{origin=await profile.resolvePlanningOrigin()}catch(e){origin={ok:false,error:String(e&&e.message||e)}}
    guideBusy='';
    if(origin&&origin.ok===true){
      if(origin.source==='gps'&&profile.applyPlanningOrigin(origin))saveStateQuietly();
      guideNote={step:2,kind:'ok',text:String(origin.message||'')};
    }else{
      guideNote={step:2,kind:'alert',text:String(origin&&origin.error||'Position indisponible pour le moment.')};
    }
    renderOnboarding();
  }

  /* La génération appartient à planning-generation-controller.js : le guide l'appelle au tap,
     une seule fois à la fois, et ne montre que ce que le propriétaire a renvoyé. */
  async function generateThreeWeeks(){
    if(guideBusy)return;
    const generate=window.storeRunnerGenerateThreeWeeks;
    if(typeof generate!=='function'){
      guideNote={step:3,kind:'alert',text:'Le moteur de planning n’est pas encore chargé. Réessaie dans un instant.'};
      renderOnboarding();
      return;
    }
    guideBusy='generate';
    guideNote=null;
    renderOnboarding();
    let out=null;
    try{out=await generate()}catch(e){out={ok:false,error:String(e&&e.message||e)}}
    guideBusy='';
    const built=out&&out.ok===true&&out.result?out.result:null;
    const visits=Number(built&&built.totalVisits)||plannedVisitCount(),stores=Number(built&&built.uniqueStores)||0;
    if(out&&out.ok===true&&visits>0){
      guideGenerated={visits:visits,stores:stores};
      writeOnboardingMarker('in-progress',STEP_COUNT-1,{generated:{visits:visits,stores:stores,at:new Date().toISOString()}});
      onboardingStep=STEP_COUNT-1;
      guideNote=null;
    }else{
      guideNote={step:3,kind:'alert',text:String(out&&out.error||'Le planning n’a pas été généré.')};
    }
    renderOnboarding();
  }

  function onOnboardingClick(e){
    const t=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!t||t.disabled)return;
    if(t.hasAttribute('data-srfr-next')){goStep(onboardingStep+1);return}
    if(t.hasAttribute('data-srfr-back')){goStep(onboardingStep-1);return}
    if(t.hasAttribute('data-srfr-add-store')){openFirstStoreAdd();return}
    if(t.hasAttribute('data-srfr-position')){useCurrentPosition();return}
    if(t.hasAttribute('data-srfr-address')){openDepartureScreen();return}
    if(t.hasAttribute('data-srfr-skip')){writeOnboardingMarker('in-progress',3,{startSkipped:true});goStep(3);return}
    if(t.hasAttribute('data-srfr-start')){goStep(2);return}
    if(t.hasAttribute('data-srfr-generate')){generateThreeWeeks();return}
    if(t.hasAttribute('data-srfr-finish')){finishOnboarding();return}
    if(t.hasAttribute('data-srfr-dismiss')){dismissOnboarding();return}
    if(t.hasAttribute('data-srfr-import'))openImportScreen();
  }

  /* ------------------------------------------------- réactions à l'état réel */
  function resumeFromRealState(){
    stopWatchingHome();
    guideAwaiting=null;
    guideNote=null;
    onboardingStep=deriveStep(guideFacts(),readOnboardingMarker());
    writeOnboardingMarker('in-progress',onboardingStep);
    renderOnboarding();
  }
  function onStoreAdded(e){
    if(e&&e.detail&&e.detail.batch)return;
    onStoresAdded();
  }
  function onStoresAdded(){
    if(guideAwaiting==='import'&&!onboardingOpen&&currentStoreCount()>0){resumeFromRealState();return}
    if(onboardingOpen&&onboardingStep===1)renderOnboarding();
  }
  function onProfileSaved(){
    if(guideAwaiting==='departure'&&!onboardingOpen)resumeFromRealState();
  }
  /* Des magasins arrivés par un autre chemin d'import (sans événement dédié) se voient au retour
     sur l'Accueil : une seule reprise, seulement tant que le guide attend cet import. */
  function onHomeRendered(){
    if(guideAwaiting==='import'&&!onboardingOpen&&currentStoreCount()>0)resumeFromRealState();
  }
  function onDataRestored(){
    if(window.state&&hasRealUserData(state)){
      writeOnboardingMarker('complete',3,{reason:'restored-data'});
      closeGuide('complete');
    }
  }

  function prepareFirstRun(force){
    if(!window.state)return false;
    let marker=readOnboardingMarker();
    if(force){
      sanitizePristineDemoState(state);
      onboardingStep=deriveStep(guideFacts(),marker);
      renderOnboarding();
      return true;
    }
    if(marker&&(marker.status==='complete'||marker.status==='dismissed'))return false;
    if(marker&&marker.status==='importing'){
      if(hasRealUserData(state)){
        writeOnboardingMarker('complete',3,{reason:'restored-data'});
        return false;
      }
      /* Rien n'est arrivé pendant l'absence : même reprise qu'un guide en cours, à l'étape où l'import a été demandé. */
      writeOnboardingMarker('in-progress',marker.step);
      marker=readOnboardingMarker();
    }
    if(marker&&marker.status==='in-progress'){
      /* Même promesse qu'au premier écran : jamais de faux magasins, y compris à la reprise. */
      sanitizePristineDemoState(state);
      const reason=establishedReason(state,marker);
      if(reason){
        writeOnboardingMarker('complete',STEP_COUNT-1,{reason:reason});
        return false;
      }
      onboardingStep=deriveStep(guideFacts(),marker);
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
    closeFirstRun:function(){closeGuide('hidden')},
    firstRunState:function(){return readOnboardingMarker()},
    _firstRun:{
      isDemoStore:isDemoStore,hasRealUserData:hasRealUserData,isPristineDemoState:isPristineDemoState,isFreshEmptyState:isFreshEmptyState,
      hasActivityBeyondSetup:hasActivityBeyondSetup,establishedReason:establishedReason,deriveStep:deriveStep,stepCopy:stepCopy,
      STEP_COUNT:STEP_COUNT,STEP_TITLES:STEP_TITLES.slice()
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();