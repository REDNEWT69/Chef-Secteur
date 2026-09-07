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
  function dateOnly(v){
    if(!v)return'';
    const s=String(v);
    const m=s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?m[1]:'';
  }
  function addDays(iso,n){
    const p=String(iso||'').split('-');if(p.length!==3)return iso;
    const d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]),12,0,0,0);d.setDate(d.getDate()+n);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function eventText(ev){return norm((ev&&ev.title||'')+' '+(ev&&ev.location||'')+' '+(ev&&ev.calendar||''));}
  function isPlanningBlock(ev){
    if(!ev)return false;
    if(ev.allDay)return true;
    const text=eventText(ev);
    const hard=['formation','hotel','hebergement','deplacement','seminaire','conge','vacances','salon professionnel'];
    for(const k of hard)if(text.includes(k))return true;
    if(/\bparis\b/.test(text))return true;
    return false;
  }

  function inferAwayRanges(){
    const list=(window.state&&Array.isArray(state.calendarEvents))?state.calendarEvents:[];
    const anchors=[];
    for(const e of list){
      const text=eventText(e);
      const paris=/\bparis\b/.test(text);
      const travel=/(train|tgv|ouigo|ter|avion|vol|gare|deplacement|trajet)/.test(text);
      const stay=/(hotel|hebergement)/.test(text);
      if(!(paris&&(travel||stay||/formation|seminaire/.test(text))))continue;
      const start=dateOnly(e.date||e.start),rawEnd=dateOnly(e.end)||start;
      if(!start)continue;
      let end=rawEnd;
      if(e.allDay&&end&&end>start)end=addDays(end,-1); // Google Calendar: fin journée entière exclusive.
      if(!end||end<start)end=start;
      anchors.push({start:start,end:end,text:text});
    }
    if(!anchors.length)return[];
    anchors.sort((a,b)=>a.start.localeCompare(b.start));
    let min=anchors[0].start,max=anchors[0].end;
    for(const a of anchors){if(a.start<min)min=a.start;if(a.end>max)max=a.end;if(a.start>max)max=a.start;}
    // On ne déduit un séjour continu que s'il y a au moins deux points distincts
    // (ex. train aller + hôtel/formation + train retour) ou un événement multi-jour.
    const distinct=new Set();anchors.forEach(a=>{distinct.add(a.start);distinct.add(a.end)});
    if(distinct.size<2)return[];
    return[{start:min,end:max,city:'Paris'}];
  }
  function inferredAwayBlock(date){
    const ranges=inferAwayRanges();
    for(const r of ranges){
      if(date>=r.start&&date<=r.end){
        return {id:'inferred-away-'+date,title:'Déplacement professionnel · '+r.city,location:r.city,calendar:'Déduit de Google Agenda',allDay:true,startMin:0,endMin:1440,planningBlock:true,inferredAway:true};
      }
    }
    return null;
  }

  function installSemanticCalendarBlocks(){
    if(window.__calendarSemanticBlocks||typeof window.calendarEventsForDate!=='function')return;
    const base=window.calendarEventsForDate;
    window.calendarEventsForDate=function(date){
      let rows=(base(date)||[]).map(function(ev){
        if(!isPlanningBlock(ev))return ev;
        return Object.assign({},ev,{allDay:true,startMin:0,endMin:1440,planningBlock:true});
      });
      const inferred=inferredAwayBlock(date);
      if(inferred&&!rows.some(function(e){return e.inferredAway||e.planningBlock&&/paris/.test(eventText(e));}))rows.push(inferred);
      return rows.sort(function(a,b){return Number(a.startMin||0)-Number(b.startMin||0)});
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
  window.chefSecteurAwayRanges=inferAwayRanges;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();
