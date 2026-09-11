(function(){
  'use strict';
  const CLIENT_ID='59370123885-qe3r60bm3bjgc9jlnmn8qb6342lthhr6.apps.googleusercontent.com';
  const CONFIG_KEY='chef_secteur_google_calendar_v2';
  const TOKEN_KEY='chef_secteur_google_token_v2';
  const EXPIRY_KEY='chef_google_token_expiry_v1';
  const LEGACY_TOKEN_KEYS=['chef_google_token_persist_v1','chef_google_token_persist_expiry_v1'];
  const PRIVACY_URL='./privacy.html';
  const TERMS_URL='./terms.html';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function sget(storage,key){try{return storage.getItem(key)||''}catch(e){return''}}
  function hasToken(){return !!sget(sessionStorage,TOKEN_KEY)}
  function tokenValid(){return hasToken()&&Number(sget(sessionStorage,EXPIRY_KEY))>Date.now()+15000}
  function setClientId(){try{localStorage.setItem(CONFIG_KEY,JSON.stringify({clientId:CLIENT_ID}))}catch(e){}const input=document.getElementById('googleClientId');if(input&&!input.value)input.value=CLIENT_ID}
  function purgeLegacyTokens(){try{LEGACY_TOKEN_KEYS.forEach(key=>localStorage.removeItem(key))}catch(e){}}
  function hasGoogleConfig(){try{const c=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}');return !!(c&&c.clientId)}catch(e){return false}}
  function waitGoogleToken(ms){const start=Date.now();return new Promise(resolve=>(function tick(){if(tokenValid())return resolve(true);if(Date.now()-start>=ms)return resolve(false);setTimeout(tick,120)})())}
  function emitCalendarUpdated(detail){try{document.dispatchEvent(new CustomEvent('store-runner:calendar-updated',{detail:detail||{}}))}catch(e){}}
  function installOAuthDisclosure(){
    const box=document.querySelector('.calendarConnect');if(!box)return false;
    const input=document.getElementById('googleClientId');
    if(input){input.hidden=true;const label=document.querySelector('label[for="googleClientId"]');if(label)label.hidden=true}
    const legacy=box.querySelector('p.tiny');
    if(legacy)legacy.textContent='Google Agenda est facultatif. Store Runner demande uniquement un accès en lecture seule pour tenir compte de tes rendez-vous et indisponibilités.';
    if(!document.getElementById('googleOAuthDisclosure')){
      const info=document.createElement('div');
      info.id='googleOAuthDisclosure';
      info.className='googleOAuthDisclosure';
      info.innerHTML='<strong>Confidentialité Google Agenda</strong><span>Les détails des événements restent dans Store Runner et ne sont pas envoyés à l’assistant IA en ligne. Aucun événement Google n’est créé, modifié ou supprimé.</span><div><a href="'+PRIVACY_URL+'">Politique de confidentialité</a><a href="'+TERMS_URL+'">Conditions d’utilisation</a></div>';
      const status=document.getElementById('googleCalendarStatus');
      if(status)status.insertAdjacentElement('beforebegin',info);else box.appendChild(info);
    }
    if(!document.getElementById('google-oauth-disclosure-css')){
      const style=document.createElement('style');style.id='google-oauth-disclosure-css';
      style.textContent='.googleOAuthDisclosure{margin:12px 0;padding:13px 14px;border:1px solid rgba(23,105,255,.14);border-radius:16px;background:rgba(239,246,255,.72);font-size:11.5px;line-height:1.45;color:#4b5565}.googleOAuthDisclosure strong,.googleOAuthDisclosure span{display:block}.googleOAuthDisclosure strong{color:#1d4f91;margin-bottom:4px}.googleOAuthDisclosure div{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}.googleOAuthDisclosure a{color:#176fd0;font-weight:700;text-decoration:none}';
      document.head.appendChild(style);
    }
    return true;
  }
  function fallbackStatus(reason){
    const status=document.getElementById('googleCalendarStatus'),badge=document.getElementById('googleCalendarBadge');
    const last=window.state&&state.calendarLastSync?new Date(state.calendarLastSync).toLocaleString('fr-FR'):'';
    const needsReconnect=reason==='disconnected'||reason==='expired',offline=reason==='offline';
    if(status)status.textContent=needsReconnect?(last?'Session Google à reconnecter · dernière synchro conservée : '+last:'Session Google à reconnecter.'):offline?(last?'Hors ligne · dernière synchro conservée : '+last:'Hors ligne · aucune synchro disponible.'):(last?'Agenda en cache · dernière synchro conservée : '+last:'Agenda temporairement non vérifié · génération du planning non bloquée.');
    if(badge){badge.textContent=needsReconnect?'À reconnecter':last?'En cache':'Déconnecté';badge.classList.remove('on')}
    window.chefGoogleStatus={phase:needsReconnect?'expired':offline?'offline':'cached',connected:false,canRetry:!needsReconnect&&!offline,lastSync:window.state&&state.calendarLastSync||null,message:reason||''};
  }
  async function silentReconnect(){return tokenValid()}
  function dateOnly(v){const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
  function addDays(iso,n){const p=String(iso||'').split('-');if(p.length!==3)return iso;const d=new Date(+p[0],+p[1]-1,+p[2],12);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function eventText(ev){return norm((ev&&ev.title||'')+' '+(ev&&ev.location||'')+' '+(ev&&ev.calendar||''))}
  function isPlanningBlock(ev){if(!ev)return false;if(ev.allDay)return true;const text=eventText(ev),hard=['formation','hotel','hebergement','deplacement','seminaire','conge','vacances','salon professionnel'];for(const k of hard)if(text.includes(k))return true;return /\bparis\b/.test(text)}
  function eventCoversDate(e,date){
    const start=dateOnly(e&& (e.date||e.start));if(!start)return false;
    let end=dateOnly(e&&e.end)||start;
    if(e&&e.allDay&&end>start)end=addDays(end,-1);
    if(end<start)end=start;
    return date>=start&&date<=end;
  }
  function rawEventToCalendarRow(e,date){
    const allDay=!!e.allDay;
    let startMin=0,endMin=1440;
    if(!allDay){
      const s=new Date(e.start),t=new Date(e.end||e.start);
      if(!isNaN(s)){startMin=s.getHours()*60+s.getMinutes();endMin=isNaN(t)?startMin+30:t.getHours()*60+t.getMinutes();if(date>dateOnly(e.start))startMin=0;if(date<dateOnly(e.end))endMin=1440;if(endMin<=startMin)endMin=Math.min(1440,startMin+30)}
    }
    return {id:e.id,title:e.title||'Événement',location:e.location||'',calendar:e.calendar||'Google Agenda',allDay:allDay,startMin:startMin,endMin:endMin,source:'google',spansMultipleDays:true};
  }
  function inferAwayRanges(){
    const list=(window.state&&Array.isArray(state.calendarEvents))?state.calendarEvents:[],anchors=[];
    for(const e of list){const text=eventText(e),paris=/\bparis\b/.test(text),travel=/(train|tgv|ouigo|ter|avion|vol|gare|deplacement|trajet)/.test(text),stay=/(hotel|hebergement)/.test(text);if(!(paris&&(travel||stay||/formation|seminaire/.test(text))))continue;const start=dateOnly(e.date||e.start);if(!start)continue;let end=dateOnly(e.end)||start;if(e.allDay&&end>start)end=addDays(end,-1);if(!end||end<start)end=start;anchors.push({start,end,text})}
    if(!anchors.length)return[];anchors.sort((a,b)=>a.start.localeCompare(b.start));let min=anchors[0].start,max=anchors[0].end;for(const a of anchors){if(a.start<min)min=a.start;if(a.end>max)max=a.end}const distinct=new Set();anchors.forEach(a=>{distinct.add(a.start);distinct.add(a.end)});if(distinct.size<2)return[];return[{start:min,end:max,city:'Paris'}]
  }
  function inferredAwayBlock(date){for(const r of inferAwayRanges())if(date>=r.start&&date<=r.end)return{id:'inferred-away-'+date,title:'Déplacement professionnel · '+r.city,location:r.city,calendar:'Déduit de Google Agenda',allDay:true,startMin:0,endMin:1440,planningBlock:true,inferredAway:true};return null}
  function installSemanticCalendarBlocks(){
    if(window.__calendarSemanticBlocks||typeof window.calendarEventsForDate!=='function')return false;
    const base=window.calendarEventsForDate;
    window.calendarEventsForDate=function(date){
      let rows=base(date)||[];
      const ids=new Set(rows.map(e=>e.id));
      try{for(const raw of (state.calendarEvents||[])){if(!ids.has(raw.id)&&eventCoversDate(raw,date)){rows.push(rawEventToCalendarRow(raw,date));ids.add(raw.id)}}}catch(e){}
      rows=rows.map(ev=>isPlanningBlock(ev)?Object.assign({},ev,{allDay:true,startMin:0,endMin:1440,planningBlock:true}):ev);
      const inferred=inferredAwayBlock(date);if(inferred&&!rows.some(e=>e.inferredAway||(e.planningBlock&&/paris/.test(eventText(e)))))rows.push(inferred);
      return rows.sort((a,b)=>Number(a.startMin||0)-Number(b.startMin||0));
    };
    window.__calendarSemanticBlocks=true;
    return true;
  }
  function weekMonday(){
    const raw=(state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10),d=new Date(raw+'T12:00:00'),w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d;
  }
  function dateForDay(day){const d=weekMonday();d.setDate(d.getDate()+Math.max(0,DAYS.indexOf(day)));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function dayIsBlocked(day){
    try{const rows=typeof window.calendarEventsForDate==='function'?window.calendarEventsForDate(dateForDay(day)):[];return rows.some(e=>e.allDay||e.planningBlock)}catch(e){return false}
  }
  function enforceBlockedDays(){
    if(!window.state||!state.plan)return;
    const chosen=(state.settings&&state.settings.days)||DAYS.slice(0,5),overflow=[],free=[];
    for(const day of chosen){
      if(dayIsBlocked(day)){
        if(Array.isArray(state.plan[day])&&state.plan[day].length)overflow.push.apply(overflow,state.plan[day]);
        state.plan[day]=[];
      }else free.push(day);
    }
    if(!free.length){if(typeof window.save==='function')window.save();if(typeof window.renderAll==='function')window.renderAll();return;}
    while(overflow.length){
      const store=overflow.shift();
      let best=free[0];
      for(const d of free)if((state.plan[d]||[]).length<(state.plan[best]||[]).length)best=d;
      if(!state.plan[best])state.plan[best]=[];
      state.plan[best].push(store);
    }
    try{if(typeof window.twoOpt==='function'&&typeof window.nearestRoute==='function'){for(const d of free)state.plan[d]=window.twoOpt(window.nearestRoute(state.plan[d]||[]))}}catch(e){}
    try{if(typeof window.applyAppointmentsToPlan==='function')window.applyAppointmentsToPlan()}catch(e){}
    if(typeof window.save==='function')window.save();
    if(typeof window.renderAll==='function')window.renderAll();
  }
  function wrapSync(){
    if(window.__storeRunnerCalendarSyncOwner||typeof window.syncGoogleCalendar!=='function')return false;
    const base=window.syncGoogleCalendar;
    window.syncGoogleCalendar=async function(silent){
      let finalResult=null;
      try{
        purgeLegacyTokens();
        if(silent&&window.__storeRunnerPlanningGenerationActive){
          fallbackStatus('planning-cache');installSemanticCalendarBlocks();
          finalResult={ok:true,cached:true,reason:'planning-cache',lastSync:window.state&&state.calendarLastSync||null};
          return finalResult;
        }
        let result;
        try{result=await base.apply(this,arguments)}catch(e){result={ok:false,reason:e&&e.message||'error'}}
        if(result&&result.ok){installSemanticCalendarBlocks();finalResult=result;return result}
        if(silent){
          const reason=result&&result.reason||'error';
          await silentReconnect();
          fallbackStatus(reason);
          installSemanticCalendarBlocks();
          finalResult={ok:true,cached:true,reason:reason,lastSync:window.state&&state.calendarLastSync||null};
          return finalResult;
        }
        finalResult=result||{ok:false,reason:'error'};
        return finalResult;
      }finally{
        const detail={ok:!!(finalResult&&finalResult.ok),cached:!!(finalResult&&finalResult.cached),connected:hasToken(),lastSync:window.state&&state.calendarLastSync||null};
        setTimeout(function(){emitCalendarUpdated(detail)},0);
      }
    };
    window.__storeRunnerCalendarSyncOwner=true;
    return true;
  }

  window.chefSecteurPrepareCalendarForPlanning=async function(){
    setClientId();installOAuthDisclosure();installSemanticCalendarBlocks();
    return true;
  };

  async function boot(){
    purgeLegacyTokens();setClientId();installOAuthDisclosure();
    for(let i=0;i<50;i++){
      setClientId();installOAuthDisclosure();installSemanticCalendarBlocks();wrapSync();
      if(window.__storeRunnerCalendarSyncOwner)break;
      await new Promise(r=>setTimeout(r,120));
    }
    if(hasToken()&&typeof window.syncGoogleCalendar==='function')try{await window.syncGoogleCalendar(true)}catch(e){}
  }
  window.chefSecteurCalendarPlanningBlock=isPlanningBlock;
  window.chefSecteurAwayRanges=inferAwayRanges;
  window.chefSecteurEventCoversDate=eventCoversDate;
  window.chefSecteurEnforceBlockedDays=enforceBlockedDays;
  window.chefSecteurInstallGoogleDisclosure=installOAuthDisclosure;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();
