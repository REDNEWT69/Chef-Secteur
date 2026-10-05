(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const PLAN_ARCHIVE_KEY='chef_sector_plan_archive_v1';
  const resolverEntries=[];
  const contextTransforms=[];

  function registerAssistantResolver(fn,priority){
    if(typeof fn!=='function'||resolverEntries.some(x=>x.fn===fn))return false;
    resolverEntries.push({fn:fn,priority:Number(priority)||0});
    resolverEntries.sort((a,b)=>a.priority-b.priority);
    return true;
  }
  function registerAssistantContextTransform(fn,priority){
    if(typeof fn!=='function'||contextTransforms.some(x=>x.fn===fn))return false;
    contextTransforms.push({fn:fn,priority:Number(priority)||0});
    contextTransforms.sort((a,b)=>a.priority-b.priority);
    return true;
  }
  function runAssistantResolvers(text){
    for(const entry of resolverEntries){try{const answer=entry.fn(text);if(answer)return answer}catch(e){}}
    return null;
  }
  function applyAssistantContextTransforms(context){
    let out=context||{};
    for(const entry of contextTransforms){try{out=entry.fn(out)||out}catch(e){}}
    return out;
  }
  window.storeRunnerRegisterAssistantResolver=registerAssistantResolver;
  window.storeRunnerRegisterAssistantContextTransform=registerAssistantContextTransform;
  window.storeRunnerRunAssistantResolvers=runAssistantResolvers;
  window.storeRunnerApplyAssistantContextTransforms=applyAssistantContextTransforms;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function isoDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function todayISO(){return isoDate(new Date())}
  function mondayDate(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
  function mondayISO(){try{const raw=(state.settings&&state.settings.weekDate)||todayISO();return mondayDate(new Date(raw+'T12:00:00'))}catch(e){return mondayDate(new Date())}}
  function dateForDay(day){const d=mondayISO();d.setDate(d.getDate()+Math.max(0,DAYS.indexOf(day)));return isoDate(d)}
  function dayForDate(d){return DAYS[(d.getDay()+6)%7]||null}
  function dayRefFromText(t){
    const n=norm(t);
    for(const day of DAYS)if(n.includes(norm(day)))return{day,date:dateForDay(day),relative:false};
    if(n.includes('demain')){const d=new Date();d.setDate(d.getDate()+1);const day=dayForDate(d);return day?{day,date:isoDate(d),relative:true}:null}
    if(n.includes('aujourd')){const d=new Date(),day=dayForDate(d);return day?{day,date:isoDate(d),relative:true}:null}
    return null;
  }
  function dayFromText(t){const ref=dayRefFromText(t);return ref&&ref.day}
  function archiveStorage(){try{return window.__chefStorage||window.localStorage||null}catch(e){return null}}
  function loadPlanArchive(){try{const s=archiveStorage();return s?JSON.parse(s.getItem(PLAN_ARCHIVE_KEY)||'{}')||{}:{}}catch(e){return{}}}
  function calForDate(date){try{if(typeof window.calendarEventsForDate==='function')return window.calendarEventsForDate(date)||[];return(state.calendarEvents||[]).filter(e=>e.date===date)}catch(e){return[]}}
  function calForDay(day){return calForDate(dateForDay(day))}
  function planForDay(day,dateOverride){
    try{
      const date=dateOverride||dateForDay(day),selected=dateForDay(day);
      if(date===selected)return(state.plan&&state.plan[day])||[];
      const mon=isoDate(mondayDate(new Date(date+'T12:00:00'))),entry=loadPlanArchive()[mon];
      return(entry&&entry.plan&&Array.isArray(entry.plan[day]))?entry.plan[day]:[];
    }catch(e){return[]}
  }
  function awayForDate(date){try{const r=typeof window.chefSecteurAwayRanges==='function'?window.chefSecteurAwayRanges():[];return r.find(x=>date>=x.start&&date<=x.end)||null}catch(e){return null}}
  function awayForDay(day){return awayForDate(dateForDay(day))}
  function hotelForDate(date){const ev=calForDate(date);return ev.find(e=>/(hotel|hôtel|hebergement|hébergement|b&b)/i.test((e.title||'')+' '+(e.location||'')))||null}
  function hotelForDay(day){return hotelForDate(dateForDay(day))}
  function summaryForDay(day,dateOverride){
    const date=dateOverride||dateForDay(day),ev=calForDate(date),route=planForDay(day,date),away=awayForDate(date),hotel=hotelForDate(date);let lines=[day+' '+date+'.'];
    if(away)lines.push('Déplacement professionnel à '+(away.city||'l’extérieur du secteur')+' : aucune tournée magasin ne doit être prévue.');
    if(hotel)lines.push('Hôtel : '+(hotel.title||'Hôtel')+(hotel.location?' · '+hotel.location:''));
    const other=ev.filter(e=>e!==hotel&&!e.inferredAway);if(other.length)lines.push('Agenda : '+other.slice(0,4).map(e=>e.title||'Événement').join(' · ')+'.');
    if(route.length&&!away)lines.push(route.length+' visite'+(route.length>1?'s':'')+' : '+route.slice(0,6).map((s,i)=>(i+1)+'. '+s.enseigne+' '+s.ville).join(' · ')+(route.length>6?'…':'')+'.');
    else if(!route.length&&!away)lines.push('Aucune visite magasin prévue.');
    if(route.length&&away)lines.push('⚠ Le planning contient encore '+route.length+' visite'+(route.length>1?'s':'')+' malgré le déplacement : régénère la semaine.');
    return lines.join('\n');
  }
  function weekSummary(){const days=(state.settings&&state.settings.days)||DAYS.slice(0,5);return days.map(d=>summaryForDay(d)).join('\n\n')}
  function smartAnswer(text){
    const extensionAnswer=runAssistantResolvers(text);
    if(extensionAnswer)return extensionAnswer;
    const n=norm(text),ref=dayRefFromText(text),day=ref&&ref.day;
    if(day&&(n.includes('visite')||n.includes('planning')||n.includes('quand')||n.includes('agenda')||n.includes('hotel')||n.includes('hôtel')||n.includes('fais')||n.includes('quoi')))return summaryForDay(day,ref.date);
    if(n.includes('semaine')&&(n.includes('resume')||n.includes('résume')||n.includes('planning')))return weekSummary();
    if(n.includes('hotel')||n.includes('hôtel')||n.includes('dormir')){const days=(state.settings&&state.settings.days)||DAYS;const hits=days.map(d=>({d,h:hotelForDay(d),a:awayForDay(d)})).filter(x=>x.h||x.a);if(hits.length)return hits.map(x=>x.d+' : '+(x.h?(x.h.title||'Hôtel'):(x.a?'déplacement '+(x.a.city||'hors secteur'):'aucun hôtel'))).join('\n');}
    if(n.includes('paris')){const ranges=typeof window.chefSecteurAwayRanges==='function'?window.chefSecteurAwayRanges():[];if(ranges.length)return 'Déplacement Paris détecté : '+ranges.map(r=>r.start+' → '+r.end).join(', ')+'. Les journées comprises dans cette période doivent rester sans tournée magasin.';}
    return null;
  }
  window.chefSecteurSmartLocalAnswer=smartAnswer;

  function enrichContext(){
    if(window.__assistantContextWrapped||typeof window.sectorContext!=='function')return;
    const base=window.sectorContext;
    window.sectorContext=function(){
      let c=base.apply(this,arguments)||{};
      try{
        c.calendarEvents=(state.calendarEvents||[]).slice(0,120);
        c.calendarLastSync=state.calendarLastSync||null;
        c.awayRanges=typeof window.chefSecteurAwayRanges==='function'?window.chefSecteurAwayRanges():[];
        c.daySummaries={};
        for(const d of ((state.settings&&state.settings.days)||DAYS))c.daySummaries[d]=summaryForDay(d);
        c.overnight=typeof window.overnightCandidate==='function'?window.overnightCandidate():null;
        c.instructions='Respecte les événements Google Agenda, les déplacements hors secteur, les hôtels et les horaires magasins. Ne programme jamais de visite pendant une journée bloquée. Les données performance utilisent le YTD comme statut principal ; les semaines servent seulement de tendance indicative. Ne prétends jamais qu’une visite a causé une variation de PDM. Réponds comme un assistant de chef de secteur Samsung, de façon concise et opérationnelle.';
        c=applyAssistantContextTransforms(c);
      }catch(e){}
      return c;
    };
    window.__assistantContextWrapped=true;
  }
  function hookLocal(){
    if(window.__assistantLocalWrapped||typeof window.assistantHandle!=='function')return;
    const base=window.assistantHandle;
    window.assistantHandle=function(text){const s=smartAnswer(text);if(s)return s;return base.apply(this,arguments)};
    window.__assistantLocalWrapped=true;
  }
  function gatewayConfigured(){try{return !!(window.aiConfig&&aiConfig.gateway)}catch(e){return false}}
  function updateAssistantStatus(){
    const status=document.getElementById('assistantAIStatus');if(!status)return;
    const online=window.aiConfig&&aiConfig.mode==='online';
    if(online&&!gatewayConfigured()){status.className='ai-status bad';status.textContent='IA en ligne non configurée · une passerelle serveur sécurisée est nécessaire';}
    else if(online&&gatewayConfigured()){status.className='ai-status ok';status.textContent='IA en ligne prête · planning + synthèse performance si disponible · détails Google Agenda conservés localement · fichier Excel brut conservé localement';}
    else{status.className='ai-status';status.textContent='Mode local amélioré · planning, agenda, visites et performance disponibles sur l’appareil';}
  }
  function installStatusEvents(){
    if(window.__assistantStatusEvents)return;
    const refresh=function(){setTimeout(updateAssistantStatus,0)};
    document.addEventListener('click',function(e){
      const el=e.target&&e.target.closest?e.target.closest('[data-assistant-mode],button[onclick*="setAssistantMode"]'):null;
      if(el)refresh();
    },true);
    document.addEventListener('change',function(e){
      const el=e.target;
      if(el&&el.matches&&el.matches('[data-assistant-mode],input[name="assistantMode"],select[name="assistantMode"]'))refresh();
    },true);
    document.addEventListener('store-runner:assistant-mode-changed',refresh);
    window.__assistantStatusEvents=true;
  }
  /* ------------------------------------------------------------------ Runner (V268)
     Présence VISUELLE de Runner dans l'Assistant. L'Assistant monte Runner (`runner-visual.js`) et
     traduit ses propres signaux en état visuel ; Runner ne lit rien, ne possède aucun état métier et
     n'écrit rien. L'état est DÉRIVÉ de ce que le chat montre déjà, sans mémoire ni persistance :
       - analyzing : la bulle « ✦ Je réfléchis… » de l'envoi en ligne est le dernier message ;
       - alert     : le dernier message du bot est une erreur (IA indisponible, erreur, application
                     impossible), ou le statut de l'Assistant est en erreur (`.ai-status.bad`) ;
       - success   : le dernier message du bot confirme une action appliquée (Command Engine, actions
                     de l'IA, semaine générée, jour régénéré) ;
       - neutral   : tout le reste.
     Ni le Command Engine ni le noyau ne sont modifiés. Trois observateurs bornés (liste des messages,
     statut, classe du panneau) : aucun timer, aucune boucle, aucun écouteur de document. Runner n'est monté
     qu'à la première ouverture du panneau ; le conteneur ignore le toucher (`pointer-events:none`). */
  const RUNNER_SLOT_ID='srAssistantRunner';
  const RUNNER_PENDING=/^✦ Je réfléchis/;
  const RUNNER_ERRORS=['IA en ligne indisponible','Erreur :','Application impossible'];
  const RUNNER_DONE=['Actions appliquées','Commande appliquée','Semaine générée','a été régénéré'];
  const RUNNER_COPY={
    neutral:{title:'Runner',text:'Prêt quand tu l’es.'},
    analyzing:{title:'Analyse en cours…',text:'Je prépare une réponse pour ton secteur.'},
    alert:{title:'Attention !',text:'Une erreur est survenue.'},
    success:{title:'C’est fait !',text:'Action appliquée.'}
  };
  let runnerInstance=null,runnerSignature='';
  /* V273 : le TITRE d'un état suit la personnalité choisie (StoreRunnerBehavior), le texte reste celui du chat. Sans module,
     les titres V268 ci-dessus sont conservés. Une erreur technique peut recevoir une pointe (Taquin) : le message de
     l'Assistant, qui porte le fait et l'action possible, s'affiche toujours dessous, tel quel. */
  function behaviorTitle(stateName,fallback){
    try{const b=window.StoreRunnerBehavior;return(b&&typeof b.controller==='function'&&b.controller().title('assistant',stateName))||fallback}catch(e){return fallback}
  }
  function behaviorIdle(){
    try{const b=window.StoreRunnerBehavior;return!b||typeof b.controller!=='function'||b.controller().idle()!==false}catch(e){return true}
  }
  function behaviorTouch(){
    try{
      const b=window.StoreRunnerBehavior;
      if(b&&typeof b.controller==='function'){const now=Date.now(),d=new Date(now);b.controller().touch({now:now,date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})}
    }catch(e){}
  }
  function runnerLine(text,marker){
    const lines=String(text||'').split('\n').map(l=>l.trim()).filter(Boolean);
    return (marker&&lines.find(l=>l.indexOf(marker)!==-1))||lines[0]||'';
  }
  function runnerStateOf(msgs,status){
    const kids=msgs.children,last=kids.length?kids[kids.length-1]:null;
    if(last&&last.classList.contains('bot')){
      const text=String(last.textContent||'').trim();
      if(RUNNER_PENDING.test(text))return{state:'analyzing'};
      if(RUNNER_ERRORS.some(m=>text.indexOf(m)===0))return{state:'alert',text:runnerLine(text)};
      const done=RUNNER_DONE.find(m=>text.indexOf(m)!==-1);
      if(done)return{state:'success',text:runnerLine(text,done)};
    }
    if(status&&status.classList.contains('bad'))return{state:'alert',text:String(status.textContent||'').trim()};
    return{state:'neutral'};
  }
  function syncRunner(){
    if(runnerInstance&&!runnerInstance.isConnected()){runnerInstance.destroy();runnerInstance=null;runnerSignature=''}
    const panel=document.getElementById('assistantPanel'),msgs=document.getElementById('assistantMsgs');
    if(!panel||!msgs||!window.Runner||!panel.classList.contains('open')){if(runnerInstance)runnerInstance.setPresence(false);return}
    if(!runnerInstance||!runnerInstance.isConnected()){
      let slot=document.getElementById(RUNNER_SLOT_ID);
      if(!slot){slot=document.createElement('div');slot.id=RUNNER_SLOT_ID;slot.style.cssText='margin:6px 16px 4px;pointer-events:none';msgs.parentNode.insertBefore(slot,msgs)}
      runnerInstance=window.Runner.mount(slot,{variant:'sheet',size:'md',state:'neutral',title:RUNNER_COPY.neutral.title,message:RUNNER_COPY.neutral.text,silent:true});
      runnerSignature='neutral|';
      if(!runnerInstance)return;
    }
    behaviorTouch();
    const next=runnerStateOf(msgs,document.getElementById('assistantAIStatus'));
    const signature=next.state+'|'+(next.text||'');
    if(signature===runnerSignature){runnerInstance.setPresence(behaviorIdle());return}
    runnerSignature=signature;
    const copy=RUNNER_COPY[next.state];
    runnerInstance.setState(next.state,{title:behaviorTitle(next.state,copy.title),message:next.text||copy.text,silent:next.state==='neutral'});
    runnerInstance.setPresence(behaviorIdle());
  }
  function installRunnerPresence(){
    if(window.__assistantRunner||typeof MutationObserver==='undefined')return;
    const panel=document.getElementById('assistantPanel'),msgs=document.getElementById('assistantMsgs');
    if(!panel||!msgs)return;
    window.__assistantRunner=true;
    const observer=new MutationObserver(records=>{if(runnerInstance&&records.some(r=>r.target===panel&&/\bopen\b/.test(r.oldValue||'')))runnerInstance.setPresence(false);syncRunner()}),status=document.getElementById('assistantAIStatus');
    observer.observe(panel,{attributes:true,attributeFilter:['class'],attributeOldValue:true});
    observer.observe(msgs,{childList:true});
    if(status)observer.observe(status,{childList:true,characterData:true,attributes:true,attributeFilter:['class']});
    syncRunner();
  }
  function install(){
    enrichContext();
    hookLocal();
    installStatusEvents();
    updateAssistantStatus();
    installRunnerPresence();
  }
  function boot(){install()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
