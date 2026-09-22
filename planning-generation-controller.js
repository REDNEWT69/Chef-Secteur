(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  /* V239 : l'action principale du planning est le cycle 3 semaines. Les boutons qui la
     portent se déclarent par cet attribut, pas par un `onclick` inline : le libellé et la
     place restent à planning-ui-fixes.js / au shell, le câblage appartient à ce module. */
  const MAIN_GENERATE_SELECTOR='[data-planning-generate="three-weeks"]';
  let attempts=0;

  function emitPlanningUpdated(source){
    try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:source||'generateWeek'}}))}catch(e){}
  }

  function countVisits(plan){
    if(!plan||typeof plan!=='object')return 0;
    return Object.keys(plan).reduce(function(total,day){return total+(Array.isArray(plan[day])?plan[day].length:0)},0);
  }

  function hasValidBase(){
    return typeof window.storeRunnerHasValidBase==='function'&&window.storeRunnerHasValidBase();
  }

  function mainGenerateButtons(){
    try{return Array.prototype.slice.call(document.querySelectorAll('#planPanel '+MAIN_GENERATE_SELECTOR))}catch(e){return[]}
  }
  function mainGenerateAnchor(){
    return document.querySelector('#planPanel button.primary.full'+MAIN_GENERATE_SELECTOR)||mainGenerateButtons()[0]||null;
  }

  function generationStatus(message,type){
    let box=document.getElementById('planningGenerateStatus');
    if(!box){
      const button=mainGenerateAnchor();
      if(button){
        box=document.createElement('div');box.id='planningGenerateStatus';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
        box.style.margin='9px 2px 0';box.style.fontSize='12px';box.style.lineHeight='1.4';button.insertAdjacentElement('afterend',box);
      }
    }
    if(box){box.textContent=message||'';box.style.color=type==='bad'?'#b42318':type==='ok'?'#137333':'#667085';box.style.fontWeight=type==='bad'||type==='ok'?'700':'500'}
    if(type==='bad'){
      if(typeof window.showError==='function')try{window.showError(message)}catch(e){}
      if(typeof window.storeRunnerToast==='function')try{window.storeRunnerToast(message)}catch(e){}
    }else if(type==='ok'){
      const error=document.getElementById('errorBox');if(error)error.style.display='none';
      if(typeof window.storeRunnerToast==='function')try{window.storeRunnerToast(message)}catch(e){}
    }
  }

  function isoDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function parseDate(value){const d=new Date(String(value||'')+'T12:00:00');return isNaN(d)?null:d}
  function mondayOf(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
  function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
  function clone(value){return JSON.parse(JSON.stringify(value))}
  function currentWeekMonday(){
    const input=document.getElementById('weekDate');
    const raw=(input&&input.value)||(window.state&&state.settings&&state.settings.weekDate)||isoDate(new Date());
    return mondayOf(parseDate(raw)||new Date());
  }
  function selectedWorkDays(){
    const checked=[];
    try{document.querySelectorAll('[data-day]').forEach(function(el){if(el.checked&&DAYS.includes(el.value))checked.push(el.value)})}catch(e){}
    if(checked.length)return checked;
    const saved=window.state&&state.settings&&Array.isArray(state.settings.days)?state.settings.days.filter(function(day){return DAYS.includes(day)}):[];
    return saved.length?saved:DAYS.slice(0,5);
  }
  function dayDate(mon,day){return isoDate(addDays(mon,DAYS.indexOf(day)))}
  function visitedOn(storeId,date){
    const legacy=window.state&&state.visits&&state.visits[String(storeId)];
    if(legacy){
      if(String(legacy.lastVisit||'')===date)return true;
      if(Array.isArray(legacy.history)&&legacy.history.some(function(d){return String(d||'')===date}))return true;
    }
    const domain=window.state&&state.businessV2;
    const visits=domain&&Array.isArray(domain.visits)?domain.visits:[];
    return visits.some(function(v){
      if(String(v&&v.storeId)!==String(storeId)||String(v&&v.status)!=='completed')return false;
      const completed=String((v&&v.completedDate)||(v&&v.completedAt)||'').slice(0,10);
      return completed===date;
    });
  }
  function lockDayForWeek(storeId,weekKey){
    try{if(typeof window.storeRunnerLockDayForWeek==='function'){const d=window.storeRunnerLockDayForWeek(storeId,weekKey);if(DAYS.includes(d))return d}}catch(e){}
    const raw=window.state&&state.locks&&state.locks[String(storeId)];
    if(typeof raw==='string')return DAYS.includes(raw)?raw:'';
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&DAYS.includes(raw.day)&&String(raw.week||'')===weekKey)return raw.day;
    return'';
  }
  function appointmentDayForWeek(storeId,mon){
    const rows=window.state&&Array.isArray(state.appointments)?state.appointments:[];
    for(const day of DAYS){
      const date=dayDate(mon,day);
      if(rows.some(function(a){return String(a&&a.storeId)===String(storeId)&&String(a&&a.date||'').slice(0,10)===date}))return day;
    }
    return'';
  }
  function eventBlocksPlanning(e){
    if(!e)return false;
    if(e.inferredAway)return true;
    const text=norm((e.title||'')+' '+(e.location||'')+' '+(e.calendar||''));
    const hard=['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'];
    for(const word of hard)if(text.includes(word))return true;
    if(/\bparis\b/.test(text))return true;
    return !!(e.planningBlock&&!e.allDay);
  }
  function dateBlocked(date){
    try{const rows=typeof window.calendarEventsForDate==='function'?window.calendarEventsForDate(date):[];return rows.some(eventBlocksPlanning)}catch(e){return false}
  }
  function planningCredit(store){
    try{if(typeof window.storeVisitCredit==='function')return Math.max(1,Number(window.storeVisitCredit(store))||1)}catch(e){}
    return 1;
  }
  function routePlanningCredits(route){return (route||[]).reduce(function(n,s){return n+planningCredit(s)},0)}
  function actualVisitCredit(store){
    try{if(window.StoreVisitCounting&&typeof window.StoreVisitCounting.credit==='function')return Math.max(1,Number(window.StoreVisitCounting.credit(store))||1)}catch(e){}
    return 1;
  }
  function actualRouteCredits(route){return (route||[]).reduce(function(n,s){return n+actualVisitCredit(s)},0)}
  function candidateName(store){return (String((store&&store.enseigne)||'Magasin')+' '+String((store&&store.ville)||'').trim()).trim()}
  function storeId(store){return String((store&&store.id)||'')}
  function fixedCapacityError(day,route,max){
    const rows=(route||[]).map(function(store){return candidateName(store)+' ('+actualVisitCredit(store)+')'});
    const actual=actualRouteCredits(route),capacity=routePlanningCredits(route);
    let message=day+' contient déjà '+actual+' crédit'+(actual>1?'s':'')+' fixe'+(actual>1?'s':'')+(rows.length?' : '+rows.join(' + '):'')+'. Ton maximum est réglé sur '+max+'. ';
    if(actual>max){
      if(actual<=8)message+='Passe-le à '+actual+' dans Réglages ou libère une visite. ';
      else message+='Augmente le maximum dans Réglages si c’est volontaire, ou libère une visite. ';
    }else if(capacity>max){
      message+='La règle Boulanger n’autorise qu’un seul magasin à 1 crédit à ses côtés. Libère ou déplace le magasin incompatible. ';
    }
    return message+'Rien n’a été changé.';
  }

  function ensureUnifiedGenerationUi(){
    const generate=mainGenerateAnchor();
    if(!generate||!generate.parentNode)return false;

    /* V186 : une seule action visible doit avoir le droit de « générer la semaine ».
       Le raccourci historique Réorganiser rappelait exactement generateWeek() et donnait
       l'impression d'un second moteur. On le retire visuellement sans toucher à la carte. */
    try{
      document.querySelectorAll('#planPanel .applePlanTools button[onclick="generateWeek()"]').forEach(function(button){
        button.hidden=true;button.style.display='none';button.setAttribute('aria-hidden','true');button.tabIndex=-1;
      });
    }catch(e){}

    let hint=document.getElementById('planningUnifiedHint');
    if(!hint){
      hint=document.createElement('div');hint.id='planningUnifiedHint';hint.className='tiny';
      hint.style.margin='8px 2px 0';hint.style.lineHeight='1.45';
      generate.insertAdjacentElement('afterend',hint);
    }
    /* Texte réécrit seulement s'il doit changer : cette fonction repasse à chaque
       événement planning, et une écriture DOM inutile relance les observateurs. */
    const hintText='La génération prépare 3 semaines d’affilée à partir de la semaine affichée. Optimisation géographique et découché sont calculés automatiquement.';
    if(hint.textContent!==hintText)hint.textContent=hintText;

    /* Le recalcul reste utile quand la semaine est déjà entamée, mais ce n'est pas un
       deuxième bouton de génération. On le range dans la feuille Réglages, où il garde
       son rôle correctif sans concurrencer l'action principale du planning. */
    const settings=document.getElementById('planningSettings');
    if(settings){
      let repair=document.getElementById('planningRepairSettings');
      if(!repair){
        repair=document.createElement('div');repair.id='planningRepairSettings';
        repair.style.cssText='margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb';
        repair.innerHTML='<div style="font-weight:800;font-size:13px;margin-bottom:4px">Ajuster un planning déjà généré</div><div class="tiny" style="margin-bottom:8px">À utiliser seulement si la semaine a déjà commencé ou si une visite doit être replacée.</div>';
        settings.appendChild(repair);
      }
      let recalc=document.getElementById('recalculateRemainingWeekBtn');
      if(!recalc){
        recalc=document.createElement('button');recalc.type='button';recalc.id='recalculateRemainingWeekBtn';recalc.className='secondary full';
        recalc.textContent='↻ Recalculer le reste du planning';
        recalc.style.width='100%';recalc.style.minHeight='46px';
        recalc.addEventListener('click',function(){window.storeRunnerRecalculateRemainingWeek()});
      }
      if(recalc.parentNode!==repair)repair.appendChild(recalc);
    }

    return true;
  }

  function insertRecalculateButton(){return ensureUnifiedGenerationUi()}

  function refreshOvernightDecision(plan){
    try{
      const api=window.StoreRunnerOvernightV182;
      if(!api)return null;
      const analysis=typeof api.analyze==='function'?api.analyze(plan||(window.state&&state.plan)):null;
      if(typeof api.render==='function')api.render();
      return analysis||null;
    }catch(e){console.warn('Calcul du découché après génération impossible',e);return null}
  }

  function overnightStatusSuffix(analysis){
    if(!analysis)return'';
    const candidate=analysis.candidate;
    if(candidate){
      const saving=Math.max(0,Math.round(Number(candidate.saving)||0));
      return' · 🌙 découché '+candidate.fromDay+' → '+candidate.toDay+' (~'+saving+' km économisés)';
    }
    if(analysis.reason==='disabled')return' · découché désactivé';
    return' · découché vérifié';
  }

  function persistManualWeek(candidate,weekKey){
    const at=new Date().toISOString();
    if(!state.manualWeekEdits)state.manualWeekEdits={};
    state.manualWeekEdits[weekKey]={at:at,plan:clone(candidate)};
    try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){console.warn('Sauvegarde du recalcul impossible',e)}
    try{
      const storage=window.__chefStorage||window.localStorage;
      const archive=JSON.parse(storage.getItem(ARCHIVE_KEY)||'{}')||{};
      const previous=archive[weekKey]||{};
      archive[weekKey]=Object.assign({},previous,{weekMonday:weekKey,plan:clone(candidate),manualEdited:true,manualEditedAt:at});
      storage.setItem(ARCHIVE_KEY,JSON.stringify(archive));
      if(typeof storage.flush==='function'){
        const out=storage.flush();if(out&&typeof out.catch==='function')out.catch(function(e){console.warn('Archive de semaine non synchronisée',e)});
      }
    }catch(e){console.warn('Archive du recalcul impossible',e)}
  }

  function buildRemainingWeekPlan(){
    if(!window.state||!state.plan)return{ok:false,error:'Aucun planning à recalculer.'};
    try{if(typeof window.readPlanningControls==='function')window.readPlanningControls();else if(typeof readPlanningControls==='function')readPlanningControls()}catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}
    const mon=currentWeekMonday(),weekKey=isoDate(mon),today=isoDate(new Date()),weekEnd=isoDate(addDays(mon,5));
    const workDays=selectedWorkDays(),max=Math.max(1,Math.min(8,Number(state.settings&&state.settings.maxVisitsPerDay)||4));
    const candidate=Object.fromEntries(DAYS.map(function(day){return[day,[]]}));
    const movable=[],seen=new Set();
    let visitedKept=0,appointmentsKept=0,locksKept=0,pastUnvisited=0;

    for(const day of DAYS){
      const date=dayDate(mon,day),route=(state.plan&&state.plan[day])||[];
      for(let index=0;index<route.length;index++){
        const store=route[index],id=storeId(store);
        if(!id||seen.has(id))continue;
        seen.add(id);
        const visited=visitedOn(id,date),appointmentDay=appointmentDayForWeek(id,mon),lockedDay=lockDayForWeek(id,weekKey);
        let fixedDay='';
        if(visited){fixedDay=day;visitedKept++}
        else if(appointmentDay){fixedDay=appointmentDay;appointmentsKept++}
        else if(lockedDay){fixedDay=lockedDay;locksKept++}
        if(fixedDay){candidate[fixedDay].push(store);continue}
        if(date<today)pastUnvisited++;
        movable.push({store:store,originalDay:day,originalIndex:index});
      }
    }

    if(!seen.size)return{ok:false,error:'Aucun magasin n’est planifié sur cette semaine.'};
    if(today>weekEnd&&movable.length)return{ok:false,error:'Cette semaine est terminée. Les visites faites restent dans l’historique, mais il n’y a plus de jour futur où replacer '+movable.length+' visite'+(movable.length>1?'s':'')+' non faite'+(movable.length>1?'s':'')+'.'};

    const eligible=workDays.filter(function(day){const date=dayDate(mon,day);return date>=today&&!dateBlocked(date)});
    for(const day of DAYS){
      const hasFixed=candidate[day].length>0,date=dayDate(mon,day);
      if(hasFixed&&date>=today&&!eligible.includes(day))eligible.push(day);
    }
    eligible.sort(function(a,b){return DAYS.indexOf(a)-DAYS.indexOf(b)});
    if(movable.length&&!eligible.length)return{ok:false,error:'Aucun jour disponible à partir d’aujourd’hui pour replacer les visites restantes.'};

    for(const day of eligible){
      const used=routePlanningCredits(candidate[day]);
      if(used>max)return{ok:false,error:fixedCapacityError(day,candidate[day],max)};
    }

    movable.sort(function(a,b){
      const heavy=planningCredit(b.store)-planningCredit(a.store);
      if(heavy)return heavy;
      const dayDelta=DAYS.indexOf(a.originalDay)-DAYS.indexOf(b.originalDay);
      return dayDelta||a.originalIndex-b.originalIndex;
    });

    const unplaced=[];
    for(const item of movable){
      const store=item.store,original=item.originalDay;
      const order=eligible.slice().sort(function(a,b){
        if(a===original&&b!==original)return-1;if(b===original&&a!==original)return 1;
        const ca=routePlanningCredits(candidate[a]),cb=routePlanningCredits(candidate[b]);
        if(ca!==cb)return ca-cb;
        return DAYS.indexOf(a)-DAYS.indexOf(b);
      });
      let placed=false;
      for(const day of order){
        if(routePlanningCredits(candidate[day])+planningCredit(store)>max)continue;
        candidate[day].push(store);placed=true;break;
      }
      if(!placed)unplaced.push(store);
    }

    if(unplaced.length){
      const names=unplaced.slice(0,3).map(candidateName).join(', ')+(unplaced.length>3?'…':'');
      return{ok:false,error:'Le reste de la semaine ne tient pas avec les règles actuelles. '+unplaced.length+' magasin'+(unplaced.length>1?'s':'')+' ne '+(unplaced.length>1?'peuvent':'peut')+' pas être replacé'+(unplaced.length>1?'s':'')+' ('+names+'). Le planning précédent est conservé.'};
    }

    const beforeIds=Array.from(seen).sort(),afterIds=[];
    for(const day of DAYS)for(const store of candidate[day]||[])afterIds.push(storeId(store));
    afterIds.sort();
    if(JSON.stringify(beforeIds)!==JSON.stringify(afterIds))return{ok:false,error:'Contrôle de sécurité : la liste des magasins a changé pendant le recalcul. Le planning précédent est conservé.'};

    let actualCredits=0;
    for(const day of DAYS)for(const store of candidate[day]||[])actualCredits+=actualVisitCredit(store);
    return{ok:true,plan:candidate,weekKey:weekKey,visitedKept:visitedKept,appointmentsKept:appointmentsKept,locksKept:locksKept,pastUnvisited:pastUnvisited,moved:movable.length,actualCredits:actualCredits};
  }

  async function recalculateRemainingWeek(){
    if(!window.state||!state.plan){generationStatus('Aucun planning à recalculer.','bad');return{ok:false}}
    if(!confirm('Recalculer seulement ce qu’il reste à faire cette semaine ?\n\nLes visites déjà effectuées, les rendez-vous et les magasins verrouillés resteront en place. Les magasins non visités, y compris ceux ratés un jour passé, pourront être replacés à partir d’aujourd’hui.'))return{ok:false,cancelled:true};
    generationStatus('Recalcul du reste de la semaine…','busy');
    try{
      if(window.ChefReliability&&typeof window.ChefReliability.checkpoint==='function')window.ChefReliability.checkpoint('Avant recalcul du reste de la semaine');
      const previousFlag=window.__storeRunnerPlanningGenerationActive;
      window.__storeRunnerPlanningGenerationActive=true;
      let result;
      try{result=buildRemainingWeekPlan()}finally{window.__storeRunnerPlanningGenerationActive=previousFlag}
      if(!result.ok){generationStatus(result.error||'Recalcul impossible.','bad');return result}
      const accepted=window.ChefReliability&&typeof window.ChefReliability.propose==='function'?await window.ChefReliability.propose({plan:result.plan,weekDate:result.weekKey}):false;
      if(!accepted){generationStatus('Planning précédent conservé.','busy');return{ok:false,cancelled:true}}
      persistManualWeek(result.plan,result.weekKey);
      try{if(typeof window.renderAll==='function')window.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}
      const overnight=refreshOvernightDecision(result.plan);
      emitPlanningUpdated('recalculateRemainingWeek');
      generationStatus('Reste de la semaine recalculé ✓ '+result.moved+' visite'+(result.moved>1?'s':'')+' à organiser'+(result.pastUnvisited?' · '+result.pastUnvisited+' visite'+(result.pastUnvisited>1?'s':'')+' ratée'+(result.pastUnvisited>1?'s':'')+' replacée'+(result.pastUnvisited>1?'s':''):'')+overnightStatusSuffix(overnight)+'. Les visites déjà faites sont restées en place.','ok');
      return result;
    }catch(e){
      const message=e&&e.message?e.message:String(e);generationStatus('Recalcul impossible : '+message,'bad');return{ok:false,error:message}
    }
  }

  function setGenerateBusy(busy){
    mainGenerateButtons().forEach(function(button){button.disabled=!!busy});
  }

  /*
   * V239 — action principale du planning : un clic, trois semaines.
   *
   * Le cycle escargot 3 semaines existait déjà (StoreRunnerTerrainPlanningV1), mais il
   * était rangé derrière une action séparée dans « Planifier plusieurs semaines » alors
   * que c'est l'usage réel du terrain. Cette fonction ne replanifie rien elle-même :
   * elle prend la semaine affichée comme première semaine du cycle et délègue au moteur
   * existant, lu au moment de l'appel pour conserver les enveloppes V184 (capacité
   * quotidienne) et V185 (optimisation géographique) posées par-dessus.
   *
   * La génération d'une seule semaine (`generateWeek`) reste intacte pour ses autres
   * appelants — assistant, régénération d'une journée — mais n'est plus déclenchée par
   * le bouton principal.
   */
  async function generateThreeWeeks(){
    const api=window.StoreRunnerTerrainPlanningV1;
    if(!api||typeof api.generateThreeWeekSnail!=='function'){
      const message='Le moteur 3 semaines n’est pas encore chargé. Réessaie dans un instant.';
      generationStatus(message,'bad');return{ok:false,error:message};
    }
    if(!hasValidBase()){
      const message='Point de départ incomplet. Dans Mon activité, saisis une ville ou une adresse (ex. Francheville), puis enregistre les réglages.';
      generationStatus(message,'bad');
      return{ok:false,__storeRunnerRejectedEmpty:true,error:message};
    }
    const start=isoDate(currentWeekMonday());
    setGenerateBusy(true);
    generationStatus('Génération de 3 semaines · rotation géographique…','busy');
    try{
      const built=await api.generateThreeWeekSnail({start:start});
      const visits=Number(built&&built.totalVisits)||0,stores=Number(built&&built.uniqueStores)||0;
      generationStatus('Planning généré sur 3 semaines. '+visits+' visite'+(visits>1?'s':'')+' · '+stores+' magasin'+(stores>1?'s':'')+'.','ok');
      ensureUnifiedGenerationUi();
      return{ok:true,start:start,weeks:3,result:built};
    }catch(e){
      const message=e&&e.message?e.message:String(e);
      generationStatus(message,'bad');
      return{ok:false,error:message};
    }finally{
      setGenerateBusy(false);
    }
  }

  function install(){
    ensureUnifiedGenerationUi();
    if(window.__storeRunnerPlanningGenerateOwner)return true;
    if(typeof window.generateWeek!=='function')return false;
    const base=window.generateWeek;
    const owned=async function(){
      /*
       * La génération du planning doit rester purement locale : elle consomme le
       * dernier cache Agenda disponible mais ne déclenche jamais de synchro réseau
       * ni d'OAuth. `chefSecteurPrepareCalendarForPlanning` reste l'API Agenda de
       * préparation historique, mais elle n'est volontairement pas appelée ici.
       * Une reconnexion Google ne doit se produire qu'après une action explicite
       * de l'utilisateur dans l'interface Agenda.
       */
      generationStatus('Génération de la semaine · géographie + découché…','busy');
      if(!hasValidBase()){
        const message='Point de départ incomplet. Dans Mon activité, saisis une ville ou une adresse (ex. Francheville), puis enregistre les réglages.';
        generationStatus(message,'bad');
        return{ok:false,__storeRunnerRejectedEmpty:true,error:message};
      }
      const specialized=typeof window.storeRunnerGenerateSingleWeek==='function';
      const generator=specialized?window.storeRunnerGenerateSingleWeek:base;
      const beforeCount=countVisits(window.state&&state.plan);
      const previousPlanningFlag=window.__storeRunnerPlanningGenerationActive;
      window.__storeRunnerPlanningGenerationActive=true;
      let out;
      try{out=await generator.apply(this,arguments)}finally{window.__storeRunnerPlanningGenerationActive=previousPlanningFlag}

      /* Le moteur spécialisé filtre lui-même les vraies indisponibilités Agenda.
         L'ancien enforceBlockedDays reste réservé au moteur historique afin qu'un
         simple événement Google « toute la journée » ne puisse plus vider une
         semaine déjà validée par le moteur V2. */
      if(!specialized&&typeof window.chefSecteurEnforceBlockedDays==='function'){
        try{window.chefSecteurEnforceBlockedDays()}catch(e){console.warn('Application des jours bloqués impossible :',e)}
      }

      const afterCount=countVisits(window.state&&state.plan);
      if(beforeCount>0&&afterCount===0&&out&&out.__storeRunnerRejectedEmpty!==true){
        console.warn('Le planning est devenu vide après génération. Le moteur spécialisé doit protéger ce cas.');
      }
      let overnight=null;
      if((!out||out.ok!==false)&&afterCount>0){
        overnight=refreshOvernightDecision(window.state&&state.plan);
        if(out&&typeof out==='object')out.overnight=overnight;
      }
      if(out&&out.ok===false){
        generationStatus(out.error||'Le planning n’a pas été généré. Vérifie les réglages affichés.','bad');
      }else if(afterCount>0){
        generationStatus('Semaine générée ✓ '+afterCount+' visite'+(afterCount>1?'s':'')+overnightStatusSuffix(overnight),'ok');
      }else{
        generationStatus('Aucune visite générée. Vérifie le point de départ, les filtres et les horaires.','bad');
      }
      emitPlanningUpdated('generateWeek');
      ensureUnifiedGenerationUi();
      return out;
    };
    owned.__storeRunnerPlanningGenerateOwner=true;
    window.generateWeek=owned;
    window.__storeRunnerPlanningGenerateOwner=true;
    ensureUnifiedGenerationUi();
    return true;
  }

  function boot(){
    if(install())return;
    if(attempts++<40)setTimeout(boot,75);
  }

  /* Délégation plutôt qu'un branchement par bouton : la barre d'outils du planning est
     reconstruite par planning-ui-fixes.js quand elle veut, et un `onclick` inline ferait
     du libellé et du comportement deux propriétaires concurrents. Un bouton désactivé
     n'émet pas de clic : l'état occupé suffit à empêcher un second lancement. */
  document.addEventListener('click',function(event){
    const target=event&&event.target;
    const button=target&&typeof target.closest==='function'?target.closest(MAIN_GENERATE_SELECTOR):null;
    if(!button||!button.closest('#planPanel'))return;
    if(typeof event.preventDefault==='function')event.preventDefault();
    generateThreeWeeks();
  });

  window.storeRunnerGenerateThreeWeeks=generateThreeWeeks;
  window.storeRunnerRecalculateRemainingWeek=recalculateRemainingWeek;
  window.__storeRunnerBuildRemainingWeekPlan=buildRemainingWeekPlan;
  window.storeRunnerRefreshOvernightDecision=refreshOvernightDecision;
  window.storeRunnerEnsureUnifiedPlanningUi=ensureUnifiedGenerationUi;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',ensureUnifiedGenerationUi,{once:true});
  document.addEventListener('store-runner:planning-updated',ensureUnifiedGenerationUi);
  document.addEventListener('store-runner:data-restored',ensureUnifiedGenerationUi);
  document.addEventListener('store-runner:home-rendered',ensureUnifiedGenerationUi);
})();
