(function(){
  'use strict';
  const CLIENT_ID='59370123885-qe3r60bm3bjgc9jlnmn8qb6342lthhr6.apps.googleusercontent.com';
  const CONFIG_KEY='chef_secteur_google_calendar_v2';
  const TOKEN_KEY='chef_secteur_google_token_v2';

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function hasToken(){try{return !!sessionStorage.getItem(TOKEN_KEY)}catch(e){return false}}
  function setClientId(){try{localStorage.setItem(CONFIG_KEY,JSON.stringify({clientId:CLIENT_ID}))}catch(e){}const input=document.getElementById('googleClientId');if(input&&!input.value)input.value=CLIENT_ID}
  function dateOnly(v){const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
  function addDays(iso,n){const p=String(iso||'').split('-');if(p.length!==3)return iso;const d=new Date(+p[0],+p[1]-1,+p[2],12);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function eventText(ev){return norm((ev&&ev.title||'')+' '+(ev&&ev.location||'')+' '+(ev&&ev.calendar||''))}
  function isPlanningBlock(ev){if(!ev)return false;if(ev.allDay)return true;const text=eventText(ev),hard=['formation','hotel','hebergement','deplacement','seminaire','conge','vacances','salon professionnel'];for(const k of hard)if(text.includes(k))return true;return /\bparis\b/.test(text)}
  function eventCoversDate(e,date){
    const start=dateOnly(e&& (e.date||e.start));if(!start)return false;
    let end=dateOnly(e&&e.end)||start;
    if(e&&e.allDay&&end>start)end=addDays(end,-1); // fin Google all-day exclusive
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
    if(window.__calendarSemanticBlocks||typeof window.calendarEventsForDate!=='function')return;
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
  }
  function wrapSync(){if(window.__nativeCalendarSyncWrapped||typeof window.syncGoogleCalendar!=='function')return;const base=window.syncGoogleCalendar;window.syncGoogleCalendar=async function(){const out=await base.apply(this,arguments);installSemanticCalendarBlocks();try{if(typeof window.renderAll==='function')window.renderAll()}catch(e){}return out};window.__nativeCalendarSyncWrapped=true}
  function wrapGenerate(){if(window.__nativeCalendarGenerateWrapped||typeof window.generateWeek!=='function')return;const base=window.generateWeek;window.generateWeek=async function(){try{setClientId();if(hasToken()&&typeof window.syncGoogleCalendar==='function'){const s=document.getElementById('googleCalendarStatus');if(s)s.textContent='Mise à jour de l’agenda avant génération…';await window.syncGoogleCalendar(true)}}catch(e){console.warn('Pré-synchronisation Calendar :',e)}installSemanticCalendarBlocks();return base.apply(this,arguments)};window.__nativeCalendarGenerateWrapped=true}
  async function boot(){setClientId();for(let i=0;i<50;i++){setClientId();installSemanticCalendarBlocks();wrapSync();wrapGenerate();if(window.__nativeCalendarSyncWrapped&&window.__nativeCalendarGenerateWrapped)break;await new Promise(r=>setTimeout(r,120))}if(hasToken()&&typeof window.syncGoogleCalendar==='function')try{await window.syncGoogleCalendar(true)}catch(e){}}
  window.chefSecteurCalendarPlanningBlock=isPlanningBlock;window.chefSecteurAwayRanges=inferAwayRanges;window.chefSecteurEventCoversDate=eventCoversDate;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();