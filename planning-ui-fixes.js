(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const SHORT={Lundi:'Lun',Mardi:'Mar',Mercredi:'Mer',Jeudi:'Jeu',Vendredi:'Ven',Samedi:'Sam'};
  let scheduled=false;
  // Verrou explicite posé dès qu'on interagit avec un champ des réglages, levé au `change`
  // ou à la fermeture du panneau - pas seulement en observant document.activeElement.
  // Sur iOS, ouvrir un <input type="date"> fait perdre le focus à la page (le champ n'est
  // plus document.activeElement pendant que le sélecteur natif est affiché) tout en
  // déclenchant plusieurs événements de perte de focus au niveau de la fenêtre : sans ce
  // verrou, le panneau était réorganisé pendant la saisie et le sélecteur natif se
  // refermait aussitôt.
  let editingLocked=false;
  const SETTINGS_FIELD='#planningSettings input, #planningSettings select, #planningSettings textarea';

  function dateOnly(v){const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
  function weekMonday(){try{const raw=(state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10),d=new Date(raw+'T12:00:00'),w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d}catch(e){return new Date()}}
  function isoForIndex(i){const d=weekMonday();d.setDate(d.getDate()+i);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function eventCovers(e,date){if(typeof window.chefSecteurEventCoversDate==='function')try{return window.chefSecteurEventCoversDate(e,date)}catch(err){}const s=dateOnly(e&&(e.date||e.start));if(!s)return false;let end=dateOnly(e&&e.end)||s;if(e&&e.allDay&&end>s){const d=new Date(end+'T12:00:00');d.setDate(d.getDate()-1);end=d.toISOString().slice(0,10)}return date>=s&&date<=end}
  function hasHotel(date){try{return (state.calendarEvents||[]).some(e=>eventCovers(e,date)&&/(hotel|hôtel|hebergement|hébergement|b&b|b\s*&\s*b)/i.test((e.title||'')+' '+(e.location||'')))}catch(e){return false}}

  /* Deux règles, apprises sur la bande de période :
     1. la bande peut couvrir plusieurs semaines, donc la position de l'onglet ne vaut
        plus sa date - l'étoile tombait deux jours à côté dès le deuxième lundi affiché.
        L'onglet porte sa vraie date : c'est elle qui fait foi, comme pour l'en-tête du
        jour et la pastille de découché.
     2. cette fonction s'exécute sous l'observateur de #dayTabs (childList + subtree) :
        retirer puis reposer une étoile identique relance un rendu au frame suivant, donc
        indéfiniment. On ne touche au DOM que si l'état affiché doit réellement changer. */
  function restoreHotelStars(){
    document.querySelectorAll('#dayTabs .dayTab').forEach((btn,i)=>{
      const date=(btn.dataset&&btn.dataset.date)||isoForIndex(i);
      const existing=[...btn.querySelectorAll('.hotelStarBadge')];
      if(!hasHotel(date)){existing.forEach(x=>x.remove());return}
      existing.slice(1).forEach(x=>x.remove());
      if(existing.length)return;
      const s=document.createElement('span');s.className='hotelStarBadge';s.textContent='✦ hôtel';s.style.cssText='display:block;margin-top:4px;font-size:9px;font-weight:850;color:#9a6200';btn.appendChild(s);
    });
    const banner=document.getElementById('planningHotelBanner');
    if(banner&&!banner.querySelector('.hotelCornerStar')){const s=document.createElement('div');s.className='hotelCornerStar';s.textContent='✦';s.style.cssText='position:absolute;right:14px;top:10px;font-size:18px;color:#c98a00';banner.style.position='relative';banner.appendChild(s)}
  }

  function selectedDayIndex(){const tabs=[...document.querySelectorAll('#dayTabs .dayTab')],idx=tabs.findIndex(b=>b.classList.contains('active'));return idx>=0?idx:0}
  /* La bande de jours peut couvrir plusieurs semaines : l'index de l'onglet actif ne
     suffit plus, il faut lire sa date réelle quand elle est disponible. Sans cela un
     onglet de la 2e semaine affichait un en-tête décalé de plusieurs jours. */
  function selectedDayDate(){
    const active=document.querySelector('#dayTabs .dayTab.active[data-date]');
    if(active){const dated=new Date(String(active.dataset.date)+'T12:00:00');if(!isNaN(dated))return dated}
    const d=weekMonday();d.setDate(d.getDate()+selectedDayIndex());return d;
  }
  function dayHeroLabel(){const d=selectedDayDate(),day=new Intl.DateTimeFormat('fr-FR',{weekday:'long'}).format(d);return day.charAt(0).toUpperCase()+day.slice(1)+' '+d.getDate()}
  function fullDayLabel(){return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(selectedDayDate())}
  function weekLabel(){const m=weekMonday(),end=new Date(m);end.setDate(end.getDate()+5);const a=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'}).format(m),b=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(end);return 'Semaine du '+a+' au '+b}

  function ensurePlanningHero(plan,title){
    let hero=document.getElementById('planningHeroV2');
    if(!hero){hero=document.createElement('section');hero.id='planningHeroV2';hero.className='planningHeroV2';hero.innerHTML='<div class="planningHeroTop"><span class="planningHeroPill">Cette semaine</span><span id="planningHeroWeek" class="planningHeroWeek"></span></div><div id="planningHeroDay" class="planningHeroDay"></div><div id="planningHeroFull" class="planningHeroFull"></div>'}
    if(hero.parentNode!==plan)plan.insertBefore(hero,plan.firstChild);
    const day=document.getElementById('planningHeroDay'),full=document.getElementById('planningHeroFull'),week=document.getElementById('planningHeroWeek');
    if(day)day.textContent=dayHeroLabel();if(full)full.textContent=fullDayLabel();if(week)week.textContent=weekLabel();if(title)title.style.display='none';syncTerrainShortcut(hero);return hero;
  }
  /* V245 : le jour affiché, s'il contient au moins une visite, ouvre le même terrainPanel
     (openTerrain du noyau) ciblé sur ce jour. Aucun second moteur terrain ; un jour vide
     n'affiche pas de bouton inutile. */
  function selectedDayName(){const i=(selectedDayDate().getDay()+6)%7;return i<DAYS.length?DAYS[i]:''}
  function syncTerrainShortcut(hero){
    let btn=document.getElementById('planningTerrainBtn');
    if(!btn){btn=document.createElement('button');btn.id='planningTerrainBtn';btn.type='button';btn.className='planningTerrainBtn';btn.textContent='▶ Passer en mode terrain';btn.addEventListener('click',function(e){if(e&&typeof e.preventDefault==='function')e.preventDefault();if(typeof window.openTerrain==='function')window.openTerrain(btn.dataset.day||'')})}
    if(btn.parentNode!==hero)hero.appendChild(btn);
    let count=0;const name=selectedDayName();try{const rows=state.plan&&state.plan[name];count=Array.isArray(rows)?rows.length:0}catch(e){}
    if(btn.dataset.day!==name)btn.dataset.day=name;
    if(btn.hidden!==!count)btn.hidden=!count;
    return btn;
  }

  function syncSmartBrief(){const brief=document.getElementById('smartBrief'),plan=document.getElementById('planPanel');if(!brief||!plan)return;brief.style.display=plan.classList.contains('active')?'none':''}
  function activePlanningControl(){const el=document.activeElement;return !!(el&&el.matches&&el.matches(SETTINGS_FIELD))}
  // Le verrou explicite est la source de vérité ; document.activeElement reste un filet de
  // sécurité pour les navigateurs où il suit correctement le focus pendant une saisie.
  function isEditingLocked(){return editingLocked||activePlanningControl()}
  function moveAfter(anchor,node){if(!anchor||!node||anchor.nextElementSibling===node)return;anchor.insertAdjacentElement('afterend',node)}

  const SETTINGS_SHORTCUT_ID='planningSettingsShortcut';
  function isSettingsShortcut(el){return !!(el&&el.closest&&el.closest('#'+SETTINGS_SHORTCUT_ID))}
  function openPlanningSettings(){
    /* Accès direct aux réglages depuis le haut du planning : Red les ouvre en permanence
       pour planifier trois semaines à l'avance, et ils sont placés en dernier dans
       .applePlan, après toute la journée de visites.
       Ce raccourci n'est pas propriétaire de la position de #planningSettings :
       reorderPlanning() la fixe déjà et plusieurs modules en dépendent. On se contente
       donc d'ouvrir le panneau et d'y défiler, sans jamais déplacer le nœud ni déclencher
       de réorganisation - en particulier pendant qu'un champ des réglages est en cours de
       saisie, où toute réorganisation referme le sélecteur natif iOS. */
    const settings=document.getElementById('planningSettings');if(!settings)return false;
    if(!settings.open)settings.open=true;
    if(typeof settings.scrollIntoView==='function')settings.scrollIntoView({block:'start'});
    return true;
  }
  function ensureSettingsShortcut(tools){
    if(!tools||typeof tools.querySelector!=='function')return false;
    if(tools.querySelector('#'+SETTINGS_SHORTCUT_ID))return false;
    const btn=document.createElement('button');
    btn.id=SETTINGS_SHORTCUT_ID;btn.type='button';btn.className='secondary';btn.textContent='⚙ Réglages';
    btn.setAttribute('aria-controls','planningSettings');
    btn.addEventListener('click',function(e){if(e&&typeof e.preventDefault==='function')e.preventDefault();openPlanningSettings()});
    tools.appendChild(btn);
    return true;
  }

  function reorderPlanning(){
    const plan=document.querySelector('#planPanel .applePlan'),title=plan&&plan.querySelector('.applePlanTitle'),tabs=document.getElementById('dayTabs'),timeline=plan&&plan.querySelector('.timelineShell'),metrics=document.getElementById('planMetrics'),saturday=document.getElementById('saturdayRecommendation'),departure=plan&&plan.querySelector('.departureCard'),settings=document.getElementById('planningSettings');
    if(!plan||!tabs||!timeline)return;
    const editing=isEditingLocked(),hero=ensurePlanningHero(plan,title);moveAfter(hero,tabs);
    /* Explorer Terrain V1 : la navigation par semaine (period-day-slider.js) se range entre le héros
       et la bande des jours, qu'elle pilote. Même principe que le message « semaine non générée » :
       sans ce déplacement, réordonner le panneau la laisserait seule plus bas. */
    const weekNav=document.getElementById('periodWeekNavV266');if(weekNav)moveAfter(hero,weekNav);
    /* La bande de période pose son message « semaine non générée » juste après #dayTabs.
       Réordonner le panneau sans l'emmener laissait ce message seul en haut du planning,
       détaché de la bande qu'il explique. */
    const notice=document.getElementById('periodDayNotice');if(notice)moveAfter(tabs,notice);
    let tools=document.getElementById('planningToolsV2');
    /* V239 : l'action principale est le cycle 3 semaines. Ce module reste propriétaire du
       libellé et de la place du bouton ; son câblage appartient à
       planning-generation-controller.js, qui écoute `data-planning-generate`. */
    if(!tools){tools=document.createElement('div');tools.id='planningToolsV2';tools.className='planningToolsV2';tools.innerHTML='<button class="secondary" type="button" onclick="showPlanMap()">⌖ Ouvrir la tournée</button><button class="primary" type="button" data-planning-generate="three-weeks">✦ Générer mes 3 semaines</button>'}
    const generation=tools.querySelector('[data-planning-generate="three-weeks"]')||tools.querySelector('button[onclick*="generateWeek"]');
    if(generation){generation.className='primary';generation.type='button';generation.removeAttribute('onclick');generation.setAttribute('data-planning-generate','three-weeks');generation.textContent='✦ Générer mes 3 semaines'}
    ensureSettingsShortcut(tools);
    /* V263 : le bloc Couverture (visit-coverage.js) se range juste sous les actions, replié
       sur une ligne : on voit ce qui reste à rattraper avant de générer ou de recalculer. */
    const coverage=document.getElementById('planningCoverageV263');
    /* V269 : Runner prend place sous la Couverture et avant la liste des visites. Même principe que
       les autres blocs : ce module pose l'emplacement, jamais le contenu d'un autre propriétaire. */
    const runnerSlot=ensureRunnerSlot();
    moveAfter(notice||tabs,tools);observeGenerateBusy(tools);
    let above=tools;if(coverage){moveAfter(tools,coverage);above=coverage}
    if(runnerSlot){moveAfter(above,runnerSlot);above=runnerSlot}
    moveAfter(above,timeline);
    const monthly=document.querySelector('#planPanel #managerPlanningMonth, #planPanel .managerPlanningMonth, #planPanel .monthPlanning, #planPanel [data-planning-month]');let anchor=timeline;
    if(monthly){moveAfter(anchor,monthly);anchor=monthly}if(metrics){moveAfter(anchor,metrics);anchor=metrics}if(saturday){moveAfter(anchor,saturday);anchor=saturday}if(departure){moveAfter(anchor,departure);anchor=departure}
    if(settings&&!editing&&(settings.parentNode!==plan||settings.nextElementSibling))plan.appendChild(settings);
  }

  /* V269 — Runner dans le Planning.
     Ce module possède la hiérarchie du Planning : il pose l'emplacement de Runner et traduit en
     état visuel des faits que d'AUTRES propriétaires produisent déjà :
       - le plan affiché (`state.plan`) : nombre de visites et premier arrêt ;
       - l'ordonnanceur d'ouverture (`StoreOpeningHoursV1.scheduleRoute`, déjà lu par les alertes
         du planning) : RDV à vérifier, magasins sans créneau, fin estimée au-delà de la limite ;
       - le forecast de couverture (`StoreRunnerVisitCoverage.forecastThreeWeeks`) : magasins à
         surveiller et contraintes explicites incompatibles avec les jours disponibles ;
       - les événements publics de génération (`chef-range-generated`), de recalcul
         (`store-runner:planning-updated`, source `recalculatePlanningCascade`) et de commande
         (`store-runner:planning-command-applied`), et le marqueur d'occupation du bouton
         « Générer mes 3 semaines » (planning-generation-controller.js) pour l'état « analyse ».
     Runner (runner-visual.js) reste de la présentation pure. Ici rien n'est décidé, calculé,
     persisté ni écrit : aucun `state`, aucun stockage, aucun moteur. Et aucune provenance n'est
     inventée — pas de « trajet le plus court » ni de « meilleur choix » : aucun propriétaire ne
     fournit ce motif, donc le premier arrêt est nommé sans dire pourquoi il l'est. */
  const RUNNER_SLOT_ID='planningRunnerV269',RUNNER_SUCCESS_MS=6000,RUNNER_MIN_MS=1500,RUNNER_FORECAST_MS=60000;
  const RUNNER_DONE={range:'Tes 3 semaines sont générées.',cascade:'Le planning a été recalculé.',command:'La commande a été appliquée au planning.'};
  let runnerInstance=null,runnerSignature='',runnerDone=null,runnerForecastRead=null;

  function localIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function mondayIso(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return localIso(x)}
  function plural(n,one,many){return n+' '+(n>1?many:one)}
  function runnerClock(v){v=Math.round(v);return String(Math.floor(v/60)%24).padStart(2,'0')+':'+String(v%60).padStart(2,'0')}
  function runnerWhen(date,today){return localIso(date)===today?'aujourd’hui':new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric'}).format(date)}
  function runnerCap(text){return text.charAt(0).toUpperCase()+text.slice(1)}
  function runnerStoreLabel(row){const s=row||{};return String(s.enseigne||'Magasin')+(s.ville?' '+s.ville:'')}

  /* Faits de l'ordonnanceur pour le jour affiché, dans ses propres mots. */
  function runnerDayIssues(route,name){
    try{
      const api=window.StoreOpeningHoursV1;
      if(!api||typeof api.scheduleRoute!=='function'||!route.length)return[];
      const s=api.scheduleRoute(route,name,state);if(!s)return[];
      const out=[],closed=Number(s.closedCount)||0,conflicts=Number(s.appointmentConflicts)||0;
      if(s.estimatedEnd!=null&&Number.isFinite(s.endLimit)&&s.estimatedEnd>s.endLimit+.001)out.push('fin estimée '+runnerClock(s.estimatedEnd)+' après ta limite de '+runnerClock(s.endLimit));
      if(closed)out.push(plural(closed,'magasin sans créneau disponible','magasins sans créneau disponible'));
      if(conflicts)out.push(conflicts+' RDV à vérifier');
      return out;
    }catch(e){return[]}
  }
  /* Empreinte des données que le forecast lit dans `state` : une visite, un rendez-vous, un jour posé, un
     magasin ajouté, désactivé ou changé de fréquence relance le calcul, sans attendre un événement que le
     noyau n'émet pas toujours (marquer « Visité » n'en émet aucun). Lecture seule, quelques dizaines de Ko. */
  function runnerInputsKey(){
    const s=state||{},done=s.businessV2&&Array.isArray(s.businessV2.visits)?s.businessV2.visits.filter(function(v){return v&&v.status==='completed'}).map(function(v){return[v.storeId,v.completedDate]}):[];
    const text=JSON.stringify([s.visits,s.appointments,s.locks,s.included,s.excluded,s.settings&&s.settings.days,(s.stores||[]).map(function(x){return[x&&x.id,x&&x.active,x&&x.intervalDays,x&&x.freq,x&&x.priority]}),done]);
    let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
    return text.length+':'+(h>>>0);
  }
  /* Comptes du forecast 3 semaines, tels que son propriétaire les donne : aucun second calcul de couverture.
     Le forecast coûte de 30 à 300 ms selon la taille du secteur : changer de jour ne le recalcule pas.
     La lecture est mémorisée pour le jour, la semaine et l'empreinte des données ; elle est aussi oubliée à
     chaque événement qui change des données hors de `state` (archive, fichier performance : liste dans
     `forgetForecast`) et, au plus tard, après une minute. */
  function runnerForecast(today){
    const key=today+'|'+mondayIso(weekMonday())+'|'+runnerInputsKey();
    if(runnerForecastRead&&runnerForecastRead.key===key&&Date.now()-runnerForecastRead.at<RUNNER_FORECAST_MS)return runnerForecastRead.facts;
    let facts=null;
    try{
      const api=window.StoreRunnerVisitCoverage;
      const c=api&&typeof api.forecastThreeWeeks==='function'?(api.forecastThreeWeeks(state,{today})||{}).counts:null;
      if(c)facts={watch:Number(c.watch&&c.watch.total)||0,constraints:Number(c.constraintIssues)||0};
    }catch(e){facts=null}
    runnerForecastRead={key,at:Date.now(),facts};
    return facts;
  }
  function forgetForecast(){runnerForecastRead=null}
  function generationBusy(){return !!document.querySelector('#planningToolsV2 [data-planning-generate="three-weeks"][disabled]')}

  /* Ce que Runner affiche pour le jour sélectionné, ou null s'il n'y a rien d'utile à dire. */
  function runnerView(){
    if(runnerDone){
      const left=runnerDone.until-Date.now();
      if(left>=RUNNER_MIN_MS)return{state:'success',title:'C’est fait !',text:RUNNER_DONE[runnerDone.kind],resetAfter:left};
      runnerDone=null;
    }
    if(generationBusy())return{state:'analyzing',title:'Génération en cours…',text:'Je prépare tes 3 semaines.'};
    const date=selectedDayDate(),today=localIso(new Date());
    /* Le plan chargé doit être celui de la semaine du jour affiché : sinon on attend le rendu suivant. */
    if(mondayIso(date)!==mondayIso(weekMonday()))return null;
    const name=selectedDayName(),rows=state.plan&&state.plan[name],route=Array.isArray(rows)?rows:[],when=runnerWhen(date,today);
    /* Journée passée : un simple rappel, jamais de conseil ni d'alerte sur l'avenir. */
    if(localIso(date)<today)return route.length?{state:'neutral',title:'Journée passée',text:plural(route.length,'visite était prévue','visites étaient prévues')+' '+when+'.'}:null;
    const issues=runnerDayIssues(route,name);
    if(issues.length)return{state:'alert',title:'Contrainte détectée',text:runnerCap(when)+' : '+issues.join(' · ')+'.'};
    const forecast=runnerForecast(today);
    if(forecast&&forecast.constraints)return{state:'alert',title:'Contrainte détectée',text:plural(forecast.constraints,'rendez-vous ou jour posé tombe','rendez-vous ou jours posés tombent')+' sur un jour non travaillé ou bloqué, dans les 3 prochaines semaines.'};
    const watch=forecast&&forecast.watch?plural(forecast.watch,'magasin à surveiller','magasins à surveiller')+' sur les 3 prochaines semaines.':'';
    if(route.length)return{state:'neutral',title:'Ta journée',text:plural(route.length,'visite prévue','visites prévues')+' '+when+'. Premier arrêt : '+runnerStoreLabel(route[0])+'.'+(watch?' '+watch:'')};
    return watch?{state:'neutral',title:'Ta journée',text:'Aucune visite prévue '+when+'. '+watch}:null;
  }

  function ensureRunnerSlot(){
    const plan=document.querySelector('#planPanel .applePlan');
    if(!plan||!window.StoreRunnerRunner)return null;
    let slot=document.getElementById(RUNNER_SLOT_ID);
    if(!slot){slot=document.createElement('div');slot.id=RUNNER_SLOT_ID;slot.hidden=true}
    return slot;
  }
  function syncRunner(){
    const panel=document.getElementById('planPanel'),slot=document.getElementById(RUNNER_SLOT_ID),api=window.StoreRunnerRunner;
    if(!panel||!slot||!api||!panel.classList.contains('active'))return;
    const view=runnerView();
    if(!view){if(!slot.hidden)slot.hidden=true;return}
    /* Un rendu du Planning peut retirer l'emplacement : Runner est alors remonté, sans annonce. */
    const fresh=!runnerInstance||!runnerInstance.isConnected()||runnerInstance.el.parentNode!==slot;
    if(fresh){
      runnerInstance=api.mount(slot,{variant:'bubble',size:'sm',state:'neutral'});
      runnerSignature='';
      if(!runnerInstance){slot.hidden=true;return}
    }
    if(slot.hidden)slot.hidden=false;
    const signature=view.state+'|'+view.title+'|'+view.text;
    if(signature===runnerSignature)return;
    runnerSignature=signature;
    /* Le quotidien (neutre) ne s'annonce pas à voix haute ; une alerte, une analyse ou un succès qui
       APPARAISSENT pendant que le Planning est ouvert, si. */
    runnerInstance.setState(view.state,{title:view.title,message:view.text,silent:fresh||view.state==='neutral',resetAfter:view.resetAfter});
  }
  function celebrate(kind){
    const panel=document.getElementById('planPanel');
    if(!panel||!panel.classList.contains('active')||!window.StoreRunnerRunner)return;
    runnerDone={kind,until:Date.now()+RUNNER_SUCCESS_MS};schedule();
  }
  function observeGenerateBusy(tools){
    if(!tools||tools.__runnerBusyObserver||typeof MutationObserver==='undefined')return;
    const observer=new MutationObserver(schedule);
    observer.observe(tools,{subtree:true,attributes:true,attributeFilter:['disabled']});
    tools.__runnerBusyObserver=observer;
  }

  function choiceSummary(boxId,type){
    const all=[...document.querySelectorAll('#'+boxId+' input[type="checkbox"]')],checked=all.filter(x=>x.checked);
    if(type==='days')return checked.length?checked.map(x=>SHORT[x.value]||x.value).join(', '):'Aucun jour';
    const counts=planningFilterCounts();if(!counts)return'';
    const label=!all.length||checked.length===all.length?'Toutes':checked.length+' sur '+all.length;
    return label+(counts.filtered?' · '+counts.filtered+' magasin'+(counts.filtered>1?'s':'')+' écarté'+(counts.filtered>1?'s':''):'');
  }

  function planningFilterCounts(){
    if(typeof includedByFilters!=='function')return null;
    const stores=Array.isArray(state.stores)?state.stores:[],excluded=state.excluded||{};
    let available=0,filtered=0;
    for(const store of stores){
      if(!store||store.active===false||excluded[store.id])continue;
      if(includedByFilters(store))available++;else filtered++;
    }
    return {available,filtered};
  }

  function syncBrandChoice(){
    const details=document.getElementById('planningBrandsDetails');if(!details)return;
    const summary=details.querySelector('[data-choice-summary]');if(summary)summary.textContent=choiceSummary('brandsBox','brands');
    const box=document.getElementById('brandsBox'),body=details.querySelector('.planningChoiceBody');if(!box||!body)return;
    const partial=[...box.querySelectorAll('input[type="checkbox"]')].some(input=>!input.checked);
    let button=document.getElementById('planningAllBrands');
    if(!partial){if(button)button.remove();return}
    if(!button){
      button=document.createElement('button');button.id='planningAllBrands';button.type='button';button.className='secondary';button.textContent='Toutes les enseignes';
      button.style.cssText='min-height:44px;margin-top:8px;white-space:normal';
      button.addEventListener('click',()=>{
        document.querySelectorAll('#brandsBox input[type="checkbox"]').forEach(input=>{input.checked=true});
        state.settings.brands=[];save();syncDynamicStoreCount();syncBrandChoice();schedule();
      });
    }
    // Hors de brandsBox : renderFilterControls() en remplace intégralement le contenu.
    if(button.parentNode!==body||box.nextElementSibling!==button)box.insertAdjacentElement('afterend',button);
  }

  function ensureChoiceDetails(boxId,detailsId,title,type){
    const box=document.getElementById(boxId);if(!box)return;
    let details=document.getElementById(detailsId);
    if(!details){
      const parent=box.parentNode,label=box.previousElementSibling&&box.previousElementSibling.tagName==='LABEL'?box.previousElementSibling:null;
      details=document.createElement('details');details.id=detailsId;details.className='planningChoice';
      const summary=document.createElement('summary');summary.innerHTML='<span>'+title+'</span><small data-choice-summary></small>';
      const body=document.createElement('div');body.className='planningChoiceBody';
      parent.insertBefore(details,label||box);details.appendChild(summary);details.appendChild(body);if(label)body.appendChild(label);body.appendChild(box);
    }
    const summary=details.querySelector('[data-choice-summary]');if(summary)summary.textContent=choiceSummary(boxId,type);
    if(type==='brands')syncBrandChoice();
  }

  function ensureAdvancedDetails(){
    const settings=document.querySelector('#planningSettings .settingsInner'),strategy=document.getElementById('strategy');if(!settings||!strategy)return;
    let details=document.getElementById('planningAdvancedDetails');
    if(!details){
      const label=strategy.previousElementSibling&&strategy.previousElementSibling.tagName==='LABEL'?strategy.previousElementSibling:null,grid=settings.querySelector('.premium-time');
      details=document.createElement('details');details.id='planningAdvancedDetails';details.className='planningChoice planningAdvancedDetails';details.innerHTML='<summary><span>Horaires & stratégie</span><small>Avancé</small></summary><div class="planningChoiceBody"></div>';
      settings.insertBefore(details,label||strategy);const body=details.querySelector('.planningChoiceBody');if(label)body.appendChild(label);body.appendChild(strategy);
      if(grid){const hint=grid.nextElementSibling&&grid.nextElementSibling.classList.contains('tiny')?grid.nextElementSibling:null;body.appendChild(grid);if(hint)body.appendChild(hint)}
    }
  }

  function ensureCalendarDetails(){
    const card=document.querySelector('#planningSettings .calendarConnect');if(!card)return;
    let details=document.getElementById('planningCalendarDetails');
    if(!details){details=document.createElement('details');details.id='planningCalendarDetails';details.className='planningChoice planningCalendarDetails';details.innerHTML='<summary><span>Google Agenda</span><small data-calendar-summary>Connexion</small></summary><div class="planningChoiceBody"></div>';card.parentNode.insertBefore(details,card);details.querySelector('.planningChoiceBody').appendChild(card)}
    const badge=document.getElementById('googleCalendarBadge'),small=details.querySelector('[data-calendar-summary]');if(small)small.textContent=badge&&badge.textContent?badge.textContent:'Connexion';
  }

  function suppressDuplicateGeneration(){
    const settings=document.querySelector('#planningSettings .settingsInner');if(!settings)return;
    settings.querySelectorAll('button[onclick*="generateWeek"],[data-planning-generate]').forEach(btn=>btn.classList.add('planningDuplicateGenerate'));
    const target=document.getElementById('target');if(target){const label=target.previousElementSibling;if(label&&label.tagName==='LABEL')label.textContent='Objectif de visites par semaine'}
  }

  function syncDynamicStoreCount(){
    let total=0,active=0;
    try{const stores=Array.isArray(state.stores)?state.stores:[];total=stores.length;active=stores.filter(s=>s&&s.active!==false).length}catch(e){}
    // Ciblage par id plutôt qu'une regex sur le texte affiché : un motif de correspondance
    // sur le libellé se désynchronise dès que celui-ci change (c'est ce qui avait laissé
    // passer un compteur figé « 83 magasins » sans que rien ne le détecte).
    const notice=document.getElementById('departureStoreNotice');
    if(notice){const label=active+' magasin'+(active>1?'s':'')+' actif'+(active>1?'s':'')+' dans ton secteur'+(total!==active?' · '+total+' au total':'')+'. Le compteur suit automatiquement tes données.';if(notice.textContent!==label)notice.textContent=label}
    const counts=planningFilterCounts();
    let line=document.getElementById('planningDynamicStoreCount');
    if(!counts){if(line)line.remove();return}
    const settings=document.querySelector('#planningSettings .settingsInner');if(settings){if(!line){line=document.createElement('div');line.id='planningDynamicStoreCount';line.className='planningStoreCount tiny';const target=document.getElementById('target');if(target)target.insertAdjacentElement('afterend',line);else settings.appendChild(line)}const n=counts.available;line.textContent=n+' magasin'+(n>1?'s':'')+' disponible'+(n>1?'s':'')+' pour le planning'+(counts.filtered?' · '+counts.filtered+' écarté'+(counts.filtered>1?'s':'')+' par le filtre Enseignes':'')+'.'}
  }

  function compactSettings(){ensureChoiceDetails('daysBox','planningDaysDetails','Jours travaillés','days');ensureChoiceDetails('brandsBox','planningBrandsDetails','Enseignes','brands');ensureAdvancedDetails();ensureCalendarDetails();suppressDuplicateGeneration();syncDynamicStoreCount()}

  function css(){if(document.getElementById('planning-fix-css'))return;const s=document.createElement('style');s.id='planning-fix-css';s.textContent=`
    /* Seule la feuille de navigation affiche les réglages. open=true seul ne
       doit pas révéler un panneau sans son en-tête ni sa croix en bas de page. */
    #planningSettings:not([open]),#planningSettings:not(.planningSettingsSheetOpen){display:none!important}
    #planPanel .timelineRow{min-width:0!important}#planPanel .tlMain{min-width:0!important}#planPanel .timelineRow *{max-width:100%}
    #planPanel .applePlan{padding-top:2px!important}body:has(#planPanel.active) #smartBrief{display:none!important}#planPanel #iosDayHero{display:none!important}
    .planningHeroV2{margin:0 0 8px;padding:8px 2px 2px;background:transparent;border:0;box-shadow:none}.planningTerrainBtn{display:block;width:100%;min-height:50px;margin:12px 0 4px;border:0;border-radius:17px;background:#111;color:#fff;font-size:16px;font-weight:800;box-shadow:0 12px 28px rgba(0,0,0,.14)}.planningTerrainBtn[hidden]{display:none}.planningHeroTop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}.planningHeroPill{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.78);border:1px solid rgba(60,60,67,.12);font-size:11px;font-weight:800;color:#667085;box-shadow:0 4px 14px rgba(31,41,55,.04)}.planningHeroWeek{font-size:11px;color:#8a93a2;font-weight:650;text-align:right}.planningHeroDay{font-family:Georgia,"Times New Roman",serif;font-size:44px;line-height:.98;letter-spacing:-.045em;font-weight:500;color:#111318;margin:0}.planningHeroFull{font-size:14px;color:#717987;margin-top:8px;font-weight:600}
    #planPanel #dayTabs{margin:10px 0 8px;padding-bottom:2px;display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none}#planPanel #dayTabs::-webkit-scrollbar{display:none}#planPanel #dayTabs .dayTab{flex:1 1 0!important;min-width:56px!important;max-width:96px!important;scroll-snap-align:center;touch-action:pan-x}
    .planningToolsV2{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.planningToolsV2 button{min-height:44px;padding:10px 13px;flex:1 1 180px}#planPanel .timelineShell{margin-bottom:20px}#planPanel #planMetrics{margin:18px 0 14px!important}#planPanel .departureCard{margin:8px 0 14px!important}#planPanel #saturdayRecommendation:empty{display:none}
    /* AGENTS.md : la hiérarchie d'affichage du planning appartient à ce module. Le duo
       de reporting « Qualité du planning / Cette semaine » fait doublon avec les tuiles
       d'accueil et le détail d'activité : il est retiré de la vue, pas supprimé. */
    #planningProTop>.proTop{display:none!important}
    #planningRunnerV269{margin:0 0 12px;pointer-events:none}#planningRunnerV269[hidden]{display:none}
    #planningSettings{scroll-margin-top:72px}#planningSettings[open]>.settingsInner{display:block!important}.planningChoice{margin:10px 0;border:1px solid rgba(120,125,140,.15);border-radius:16px;background:rgba(255,255,255,.58);overflow:hidden}.planningChoice>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:12px 14px;cursor:pointer;font-weight:800;color:#1f2937}.planningChoice>summary::-webkit-details-marker{display:none}.planningChoice>summary:after{content:'＋';font-size:18px;color:#1674d9;margin-left:6px}.planningChoice[open]>summary:after{content:'−'}.planningChoice>summary small{margin-left:auto;color:#7a8290;font-size:11px;font-weight:650;white-space:nowrap;max-width:58%;overflow:hidden;text-overflow:ellipsis}.planningChoiceBody{padding:0 12px 13px}.planningChoiceBody>label:first-child{display:none}.planningChoiceBody .checkgrid{display:grid!important;grid-template-columns:1fr!important;gap:6px!important;max-height:170px;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px}.planningChoiceBody .checkitem{min-height:42px;margin:0}#planningDaysDetails .planningChoiceBody #daysBox{max-height:none!important;overflow:visible!important;-webkit-overflow-scrolling:auto;touch-action:auto}.planningAdvancedDetails .premium-time{margin-top:6px}.planningCalendarDetails .calendarConnect{margin:0!important;border:0!important;box-shadow:none!important;background:transparent!important;padding:4px 0!important}.planningRangeDetails .formgrid{margin-top:4px}.planningDuplicateGenerate{display:none!important}.planningStoreCount{margin:6px 0 2px;color:#697386}.planningRangeDetails{order:20}
    @media(max-width:650px){.planningHeroV2{padding-top:2px}.planningHeroTop{align-items:flex-start}.planningHeroWeek{max-width:58%;line-height:1.3}.planningHeroDay{font-size:50px}.planningHeroFull{font-size:13px}.planningToolsV2{margin-bottom:10px}.planningToolsV2 button{flex:1 1 calc(50% - 4px);min-width:0;min-height:44px}.planningChoice{border-radius:15px}.planningChoice>summary{padding:11px 12px}.planningChoiceBody{padding:0 10px 11px}.planningChoiceBody .checkgrid{max-height:150px}#planningDaysDetails .planningChoiceBody #daysBox{max-height:none!important;overflow:visible!important}.planningAdvancedDetails .formgrid,.planningRangeDetails .formgrid{grid-template-columns:1fr!important}}
  `;document.head.appendChild(s)}

  function run(){css();syncSmartBrief();if(isEditingLocked())return;reorderPlanning();compactSettings();restoreHotelStars();try{syncRunner()}catch(e){}}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;run()})}
  function observeDayTabs(){const tabs=document.getElementById('dayTabs');if(!tabs||tabs.__planningFixObserver)return;const observer=new MutationObserver(schedule);observer.observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});tabs.__planningFixObserver=observer}
  function observePlanPanel(){const plan=document.getElementById('planPanel');if(!plan||plan.__planningActiveObserver)return;const observer=new MutationObserver(schedule);observer.observe(plan,{attributes:true,attributeFilter:['class']});plan.__planningActiveObserver=observer}
  function boot(){run();observeDayTabs();observePlanPanel();[120,500,900].forEach(function(delay){setTimeout(function(){run();observeDayTabs();observePlanPanel()},delay)})}
  document.addEventListener('click',e=>{if(e.target&&e.target.closest&&(e.target.closest('#dayTabs .dayTab')||e.target.closest('.tab')))setTimeout(schedule,60)},true);
  // Pose du verrou dès l'intention d'interagir (pointerdown/focusin), pas seulement au focus
  // in fine : sur iOS, l'ouverture du sélecteur natif d'un <input type="date"> peut survenir
  // entre les deux, et document.activeElement ne suit plus le champ pendant que le sélecteur
  // est affiché.
  document.addEventListener('pointerdown',e=>{if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD))editingLocked=true},true);
  document.addEventListener('focusin',e=>{if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD))editingLocked=true},true);
  function releaseEditingLock(){if(!editingLocked)return;editingLocked=false;schedule()}
  document.addEventListener('pointerdown',e=>{if(editingLocked&&!isSettingsShortcut(e.target)&&!(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD)))releaseEditingLock()},true);
  document.addEventListener('focusin',e=>{if(editingLocked&&!isSettingsShortcut(e.target)&&!(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD)))releaseEditingLock()},true);
  document.addEventListener('change',e=>{
    if(e.target&&e.target.matches&&e.target.matches('#brandsBox input[type="checkbox"]')){
      // Le moteur lit ces mêmes cases à la génération. Enregistrer le choix dès le
      // change permet de compter via includedByFilters, sans dupliquer sa règle.
      state.settings.brands=[...document.querySelectorAll('#brandsBox input[type="checkbox"]')].filter(input=>input.checked).map(input=>input.value);
      save();syncDynamicStoreCount();syncBrandChoice();
    }
    if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD)){editingLocked=false;schedule()}
    if(e.target&&e.target.matches&&(e.target.matches('[data-day],[data-brand]')||e.target.matches('#rangeStart,#rangeEnd')))setTimeout(schedule,20);
  },true);
  // Le focusout que provoque l'ouverture du sélecteur natif iOS ne doit pas relancer un
  // rendu tant que le verrou tient : il ne se lève qu'au `change` (date choisie) ou à la
  // fermeture du panneau, jamais sur un simple changement de focus.
  document.addEventListener('focusout',e=>{if(editingLocked)return;if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD))setTimeout(schedule,80)},true);
  document.addEventListener('toggle',e=>{if(e.target&&e.target.id==='planningSettings'&&!e.target.open){editingLocked=false;schedule()}},true);
  document.addEventListener('store-runner:planning-updated',function(e){const d=e&&e.detail;if(!d||d.reason!=='period-date-loaded')forgetForecast();if(d&&d.source==='recalculatePlanningCascade')celebrate('cascade');schedule()});document.addEventListener('store-runner:data-restored',schedule);document.addEventListener('store-runner:calendar-updated',schedule);
  /* Le forecast se relit quand une donnée dont il dépend change (changer de jour ne la change pas). */
  ['store-runner:data-restored','store-runner:calendar-updated','store-runner:visit-deleted','store-runner:store-added','store-runner:stores-added','store-runner:planning-user-opened','store-runner:planning-command-applied'].forEach(function(name){document.addEventListener(name,forgetForecast)});
  /* V269 : un succès de génération, de recalcul ou de commande est un moment, pas un état durable.
     Runner le montre quelques secondes (`resetAfter`) puis la journée reprend la main. */
  window.addEventListener('chef-range-generated',function(){forgetForecast();celebrate('range')});
  document.addEventListener('store-runner:planning-command-applied',function(){celebrate('command')});
  document.addEventListener('store-runner:runner-state',function(e){const slot=document.getElementById(RUNNER_SLOT_ID),d=e&&e.detail;if(slot&&e.target&&slot.contains(e.target)&&d&&d.previous==='success'){runnerDone=null;schedule()}});
  // Les réinstallations globales sur le focus de la fenêtre ou la visibilité de l'onglet
  // sont interdites par AGENTS.md quand un événement métier existe déjà - ce sont elles qui
  // déclenchaient la réorganisation du panneau pendant la saisie sur iOS.
  window.addEventListener('load',function(){setTimeout(run,180)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
