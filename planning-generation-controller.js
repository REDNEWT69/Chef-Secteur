(function(){
  'use strict';
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

  function generationStatus(message,type,weekKey){
    let box=document.getElementById('planningGenerateStatus');
    if(!box){
      const button=mainGenerateAnchor();
      if(button){
        box=document.createElement('div');box.id='planningGenerateStatus';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
        box.style.margin='9px 2px 0';box.style.fontSize='12px';box.style.lineHeight='1.4';button.insertAdjacentElement('afterend',box);
      }
    }
    if(box){box.textContent=message||'';if(box.dataset)box.dataset.weekDate=weekKey||'';box.style.color=type==='bad'?'#b42318':type==='ok'?'#137333':'#667085';box.style.fontWeight=type==='bad'||type==='ok'?'700':'500'}
    if(type==='bad'){
      if(typeof window.showError==='function')try{window.showError(message)}catch(e){}
      if(typeof window.storeRunnerToast==='function')try{window.storeRunnerToast(message)}catch(e){}
    }else if(type==='ok'){
      const error=document.getElementById('errorBox');if(error)error.style.display='none';
      if(typeof window.storeRunnerToast==='function')try{window.storeRunnerToast(message)}catch(e){}
    }
  }

  function isoDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function humanDate(value){const p=String(value||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(value||'')}

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
    const hintText='La génération prépare les jours travaillés restants à partir d’aujourd’hui, puis les semaines suivantes. Une date de début explicitement choisie peut repousser le départ. Le point de départ est actualisé avant les calculs géographiques et le découché.';
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

  function setGenerateBusy(busy){
    mainGenerateButtons().forEach(function(button){button.disabled=!!busy});
  }

  /*
   * V239 — action principale du planning : un clic, trois semaines.
   *
   * Le cycle escargot 3 semaines existait déjà (StoreRunnerTerrainPlanningV1), mais il
   * était rangé derrière une action séparée dans « Planifier plusieurs semaines » alors
   * que c'est l'usage réel du terrain. Cette fonction ne replanifie rien elle-même :
   * elle capture la date locale réelle du clic et fait résoudre le départ par le propriétaire
   * terrain. Puis elle attend la localisation du propriétaire profil avant le moindre calcul.
   * Elle délègue ensuite au moteur existant, lu au moment de l'appel pour conserver les enveloppes V185
   * (optimisation géographique) et V248 (matrice routière) posées par-dessus.
   *
   * La génération d'une seule semaine (`generateWeek`) reste intacte pour ses autres
   * appelants — assistant, régénération d'une journée — mais n'est plus déclenchée par
   * le bouton principal.
   */
  async function generateThreeWeeks(){
    const now=new Date(),today=isoDate(now),previousWeek=String(window.state&&state.settings&&state.settings.weekDate||'').slice(0,10);
    const api=window.StoreRunnerTerrainPlanningV1;
    if(!api||typeof api.generateThreeWeekSnail!=='function'||typeof api.resolveSnailStart!=='function'){
      const message='Le moteur 3 semaines n’est pas encore chargé. Réessaie dans un instant.';
      generationStatus(message,'bad');return{ok:false,error:message};
    }
    setGenerateBusy(true);
    let engineStarted=false,start='';
    try{
      start=isoDate(api.resolveSnailStart(window.state,document,now));
      generationStatus('Départ du cycle : semaine du '+humanDate(start)+' · acquisition de ta position actuelle…','busy',previousWeek);
      if(typeof window.storeRunnerPreparePlanningOrigin!=='function')throw new Error('La localisation n’est pas encore chargée. Réessaie dans un instant.');
      const origin=await window.storeRunnerPreparePlanningOrigin();
      if(!origin||origin.ok!==true)throw new Error(origin&&origin.error||'Localisation indisponible. Enregistre un point de départ dans Mon activité.');
      if(!hasValidBase())throw new Error('Point de départ incomplet. Enregistre une base dans Mon activité ou autorise la localisation.');
      const originMessage=origin.source==='saved_base'?(origin.message||'Localisation indisponible : utilisation de ta base enregistrée.')+' ':'';
      generationStatus(originMessage+'Génération de 3 semaines à partir du '+humanDate(start<today?today:start)+' · rotation géographique…','busy',previousWeek);
      const previousThreeWeekPlanningFlag=window.__storeRunnerPlanningGenerationActive;
      window.__storeRunnerPlanningGenerationActive=true;
      let built;
      engineStarted=true;
      try{built=await api.generateThreeWeekSnail({start:start,today:today})}
      finally{window.__storeRunnerPlanningGenerationActive=previousThreeWeekPlanningFlag}
      const visits=Number(built&&built.totalVisits)||0,stores=Number(built&&built.uniqueStores)||0;
      /* V263 : le bilan de couverture (magasins écartés car visités trop récemment, magasins
         en retard restés hors du cycle) appartient au moteur 3 semaines ; on le relaie. */
      let coverage='';try{if(typeof api.coverageSummaryText==='function')coverage=api.coverageSummaryText(built&&built.coverage,' · ')}catch(e){}
      const last=new Date(start+'T12:00:00'),dayNames=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],workDays=(window.state&&state.settings&&state.settings.days)||dayNames.slice(0,5),lastDay=Math.max(0,...workDays.map(d=>dayNames.indexOf(d)));last.setDate(last.getDate()+14+lastDay);
      generationStatus(originMessage+'Planning généré sur 3 semaines du '+humanDate(start<today?today:start)+' au '+humanDate(isoDate(last))+'. '+visits+' visite'+(visits>1?'s':'')+' · '+stores+' magasin'+(stores>1?'s':'')+coverage+'.','ok',start);
      ensureUnifiedGenerationUi();
      return{ok:true,start:start,today:today,weeks:3,origin:origin.source,result:built};
    }catch(e){
      const raw=e&&e.message?e.message:String(e),message=raw+(engineStarted&&previousWeek?' Semaine conservée : '+humanDate(previousWeek)+'.':'');
      generationStatus(message,'bad',previousWeek);
      return{ok:false,error:raw,weekDate:previousWeek,attemptedStart:start};
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
  window.storeRunnerRefreshOvernightDecision=refreshOvernightDecision;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',ensureUnifiedGenerationUi,{once:true});
  document.addEventListener('store-runner:planning-updated',function(event){
    const detail=event&&event.detail||{},box=document.getElementById('planningGenerateStatus');
    if(detail.reason==='period-date-loaded'&&box&&box.dataset&&box.dataset.weekDate!==String(detail.weekDate||''))generationStatus('','info');
    ensureUnifiedGenerationUi();
  });
  document.addEventListener('store-runner:data-restored',ensureUnifiedGenerationUi);
  document.addEventListener('store-runner:home-rendered',ensureUnifiedGenerationUi);
})();
