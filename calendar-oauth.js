(function(){
  'use strict';
  const CLIENT_ID='59370123885-qe3r60bm3bjgc9jlnmn8qb6342lthhr6.apps.googleusercontent.com';
  const CONFIG_KEY='chef_secteur_google_calendar_v2';
  const TOKEN_KEY='chef_secteur_google_token_v2';
  let installed=false;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function hasToken(){try{return !!sessionStorage.getItem(TOKEN_KEY)}catch(e){return false}}
  function setClientId(){
    try{localStorage.setItem(CONFIG_KEY,JSON.stringify({clientId:CLIENT_ID}))}catch(e){}
    const input=document.getElementById('googleClientId');
    if(input&&!input.value)input.value=CLIENT_ID;
  }
  function isPlanningBlock(ev){
    if(!ev)return false;
    if(ev.allDay)return true;
    const text=norm((ev.title||'')+' '+(ev.location||'')+' '+(ev.calendar||''));
    const hard=['formation','hotel','hebergement','deplacement','seminaire','conge','vacances','salon professionnel'];
    for(const k of hard)if(text.includes(k))return true;
    if(/\bparis\b/.test(text))return true;
    return false;
  }
  function installSemanticCalendarBlocks(){
    if(window.__calendarSemanticBlocks||typeof window.calendarEventsForDate!=='function')return;
    const base=window.calendarEventsForDate;
    window.calendarEventsForDate=function(date){
      const rows=base(date)||[];
      return rows.map(function(ev){
        if(!isPlanningBlock(ev))return ev;
        return Object.assign({},ev,{allDay:true,startMin:0,endMin:1440,planningBlock:true});
      });
    };
    window.__calendarSemanticBlocks=true;
  }
  function wrapSync(){
    if(window.__nativeCalendarSyncWrapped||typeof window.syncGoogleCalendar!=='function')return;
    const base=window.syncGoogleCalendar;
    window.syncGoogleCalendar=async function(){
      const out=await base.apply(this,arguments);
      installSemanticCalendarBlocks();
      try{if(typeof window.renderAll==='function')window.renderAll()}catch(e){}
      return out;
    };
    window.__nativeCalendarSyncWrapped=true;
  }
  function wrapGenerate(){
    if(window.__nativeCalendarGenerateWrapped||typeof window.generateWeek!=='function')return;
    const base=window.generateWeek;
    window.generateWeek=async function(){
      try{
        setClientId();
        if(hasToken()&&typeof window.syncGoogleCalendar==='function'){
          const s=document.getElementById('googleCalendarStatus');
          if(s)s.textContent='Mise à jour de l’agenda avant génération…';
          await window.syncGoogleCalendar(true);
        }
      }catch(e){console.warn('Pré-synchronisation Calendar :',e)}
      installSemanticCalendarBlocks();
      return base.apply(this,arguments);
    };
    window.__nativeCalendarGenerateWrapped=true;
  }
  async function boot(){
    setClientId();
    for(let i=0;i<50;i++){
      setClientId();installSemanticCalendarBlocks();wrapSync();wrapGenerate();
      if(window.__nativeCalendarSyncWrapped&&window.__nativeCalendarGenerateWrapped){installed=true;break}
      await new Promise(r=>setTimeout(r,120));
    }
    if(hasToken()&&typeof window.syncGoogleCalendar==='function'){
      try{await window.syncGoogleCalendar(true)}catch(e){}
    }
  }
  window.chefSecteurCalendarPlanningBlock=isPlanningBlock;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();
