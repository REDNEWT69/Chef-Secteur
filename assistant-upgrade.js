(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let installed=false;
  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function mondayISO(){try{const raw=(state.settings&&state.settings.weekDate)||todayISO(),d=new Date(raw+'T12:00:00'),w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d}catch(e){return new Date()}}
  function dateForDay(day){const d=mondayISO();d.setDate(d.getDate()+Math.max(0,DAYS.indexOf(day)));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function dayFromText(t){const n=norm(t);for(const d of DAYS)if(n.includes(norm(d)))return d;if(n.includes('demain')){const now=new Date(),x=new Date(now);x.setDate(x.getDate()+1);return DAYS[(x.getDay()+6)%7]||null}if(n.includes('aujourd')){const now=new Date();return DAYS[(now.getDay()+6)%7]||null}return null}
  function calForDay(day){try{const date=dateForDay(day);if(typeof window.calendarEventsForDate==='function')return window.calendarEventsForDate(date)||[];return(state.calendarEvents||[]).filter(e=>e.date===date)}catch(e){return[]}}
  function planForDay(day){try{return(state.plan&&state.plan[day])||[]}catch(e){return[]}}
  function awayForDay(day){try{const date=dateForDay(day),r=typeof window.chefSecteurAwayRanges==='function'?window.chefSecteurAwayRanges():[];return r.find(x=>date>=x.start&&date<=x.end)||null}catch(e){return null}}
  function hotelForDay(day){const ev=calForDay(day);return ev.find(e=>/(hotel|hôtel|hebergement|hébergement|b&b)/i.test((e.title||'')+' '+(e.location||'')))||null}
  function summaryForDay(day){
    const date=dateForDay(day),ev=calForDay(day),route=planForDay(day),away=awayForDay(day),hotel=hotelForDay(day);let lines=[day+' '+date+'.'];
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
    try{
      if(typeof window.chefSecteurStoreScheduleAnswer==='function'){
        const storeAnswer=window.chefSecteurStoreScheduleAnswer(text);
        if(storeAnswer)return storeAnswer;
      }
    }catch(e){}
    const n=norm(text),day=dayFromText(text);
    if(day&&(n.includes('visite')||n.includes('planning')||n.includes('quand')||n.includes('agenda')||n.includes('hotel')||n.includes('hôtel')||n.includes('fais')||n.includes('quoi')))return summaryForDay(day);
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
        c.instructions='Respecte les événements Google Agenda, les déplacements hors secteur, les hôtels et les horaires magasins. Ne programme jamais de visite pendant une journée bloquée. Réponds comme un assistant de chef de secteur Samsung, de façon concise et opérationnelle.';
        if(typeof window.storeRunnerLimitAssistantContext==='function')c=window.storeRunnerLimitAssistantContext(c)||c;
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
    else if(online&&gatewayConfigured()){status.className='ai-status ok';status.textContent='IA en ligne prête · planning + agenda + hôtels envoyés comme contexte';}
    else{status.className='ai-status';status.textContent='Mode local amélioré · comprend maintenant planning, agenda et déplacements';}
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
  function install(){
    enrichContext();hookLocal();installStatusEvents();updateAssistantStatus();
    installed=!!(window.__assistantContextWrapped&&window.__assistantLocalWrapped);
    return installed;
  }
  function boot(){
    if(install())return;
    [100,250,600,1200,2400].forEach(delay=>setTimeout(install,delay));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
  window.addEventListener('focus',()=>setTimeout(install,0));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(install,0)});
})();
