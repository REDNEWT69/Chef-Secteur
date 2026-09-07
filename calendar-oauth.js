(function(){
  'use strict';
  const CLIENT_ID='59370123885-qe3r60bm3bjgc9jlnmn8qb6342lthhr6.apps.googleusercontent.com';
  const SCOPE='https://www.googleapis.com/auth/calendar.readonly';
  let tokenClient;

  function loadScript(src,id){return new Promise((resolve,reject)=>{if(document.getElementById(id))return resolve();const s=document.createElement('script');s.id=id;s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
  function status(t){const e=document.getElementById('gcalStatus');if(e)e.textContent=t;}
  function esc(v){return String(v||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
  function monday(){const raw=(window.state&&state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10);const p=raw.split('-');const d=new Date(+p[0],+p[1]-1,+p[2],12);const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d;}
  function isoLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function timeMinutes(v){const p=String(v||'08:30').split(':');return (+p[0]||0)*60+(+p[1]||0);}
  function render(items){const box=document.getElementById('gcalEvents');if(!box)return;box.innerHTML=(items||[]).slice(0,12).map(e=>'<div style="padding:8px 0;border-top:1px solid #eef1f5"><b>'+esc(e.summary||'(Sans titre)')+'</b><div class="tiny">'+esc((e.start&&((e.start.dateTime||e.start.date)))||'')+'</div></div>').join('')||'<div class="tiny">Aucun événement cette semaine.</div>';}

  function activeDays(){return (window.state&&state.settings&&state.settings.days)||window.DAYS||['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];}
  function dateForDay(day){const days=window.DAYS||['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];const d=monday();d.setDate(d.getDate()+Math.max(0,days.indexOf(day)));return isoLocal(d);}
  function eventsForDay(day){const date=dateForDay(day);return (window.chefSecteurGoogleEvents||[]).filter(e=>e.status!=='cancelled'&&e.transparency!=='transparent'&&e.start&&((e.start.date===date)||(e.start.dateTime&&String(e.start.dateTime).slice(0,10)===date)));}
  function dayWindow(day){let start='08:30',end='18:00';if(typeof window.dayStartTime==='function')start=window.dayStartTime(day)||start;if(day==='Samedi'&&window.state&&state.settings){start=state.settings.saturdayStart||start;end=state.settings.saturdayEnd||'12:00';}return{start:timeMinutes(start),end:timeMinutes(end)};}
  function busyMinutes(day){const ev=eventsForDay(day),w=dayWindow(day);let busy=0,allDay=false;for(const e of ev){if(e.start&&e.start.date){allDay=true;continue;}const s=new Date(e.start.dateTime),t=new Date((e.end&&e.end.dateTime)||e.start.dateTime);const sm=s.getHours()*60+s.getMinutes(),em=t.getHours()*60+t.getMinutes();busy+=Math.max(0,Math.min(w.end,em)-Math.max(w.start,sm));}return allDay?Math.max(0,w.end-w.start):Math.min(Math.max(0,w.end-w.start),busy);}
  function availableMinutes(day){const w=dayWindow(day);return Math.max(0,(w.end-w.start)-busyMinutes(day));}
  function routeMinutes(route,day){try{if(typeof window.dayEstimatePremium==='function'){const r=window.dayEstimatePremium(route||[],day);if(r&&Number.isFinite(r.minutes))return r.minutes;}}catch(e){}try{if(typeof window.routeWorkMinutes==='function')return window.routeWorkMinutes(route||[]);}catch(e){}const visit=(window.state&&state.settings&&Number(state.settings.visitMinutes))||60;return (route||[]).length*visit;}
  function reapplyAppointments(){try{if(typeof window.applyAppointmentsToPlan==='function')window.applyAppointmentsToPlan();}catch(e){}}
  function persistAndRender(){try{if(typeof window.save==='function')window.save();}catch(e){}try{if(typeof window.renderAll==='function')window.renderAll();}catch(e){}}

  window.applyGoogleCalendarToPlan=function(){
    if(!window.state||!state.plan||!(window.chefSecteurGoogleEvents||[]).length)return{moved:0,unscheduled:0,blockedDays:[]};
    const days=activeDays().slice(),overflow=[],blockedDays=[];
    for(const day of days){if(!state.plan[day])state.plan[day]=[];const cap=availableMinutes(day);if(cap<=0&&state.plan[day].length)blockedDays.push(day);while(state.plan[day].length&&routeMinutes(state.plan[day],day)>cap){overflow.push(state.plan[day].pop());}}
    let moved=0;const unscheduled=[];
    while(overflow.length){const store=overflow.shift();let best=null,bestScore=-Infinity;for(const day of days){const cap=availableMinutes(day);if(cap<=0)continue;const test=(state.plan[day]||[]).concat([store]);const used=routeMinutes(test,day);const spare=cap-used;if(spare<0)continue;const score=spare-(state.plan[day].length*5);if(score>bestScore){bestScore=score;best=day;}}if(best){state.plan[best].push(store);moved++;}else unscheduled.push(store);}
    window.chefSecteurCalendarUnscheduled=unscheduled;
    reapplyAppointments();
    persistAndRender();
    return{moved,unscheduled:unscheduled.length,blockedDays};
  };

  function calendarSummary(result){const ev=(window.chefSecteurGoogleEvents||[]).length;let text=ev+' événement'+(ev>1?'s':'')+' chargé'+(ev>1?'s':'')+' · pris en compte dans le planning';if(result&&result.moved)text+=' · '+result.moved+' visite'+(result.moved>1?'s':'')+' déplacée'+(result.moved>1?'s':'');if(result&&result.unscheduled)text+=' · ⚠ '+result.unscheduled+' visite'+(result.unscheduled>1?'s':'')+' à replacer manuellement';return text+'.';}

  async function prepare(){
    await Promise.all([loadScript('https://accounts.google.com/gsi/client','google-gis'),loadScript('https://apis.google.com/js/api.js','google-api-js')]);
    await new Promise(resolve=>gapi.load('client',resolve));
    await gapi.client.init({discoveryDocs:['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']});
    if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,callback:async r=>{if(r.error){status('Connexion refusée : '+r.error);return;}gapi.client.setToken(r);document.getElementById('gcalConnect').style.display='none';document.getElementById('gcalSync').style.display='';await window.syncGoogleCalendar();}});
  }

  window.connectGoogleCalendar=async function(){try{status('Ouverture de Google…');await prepare();tokenClient.requestAccessToken({prompt:'consent'});}catch(e){status('Erreur de connexion Google : '+(e.message||e));}};
  window.syncGoogleCalendar=async function(){try{await prepare();const a=monday(),b=new Date(a);b.setDate(b.getDate()+7);status('Synchronisation…');const r=await gapi.client.calendar.events.list({calendarId:'primary',timeMin:a.toISOString(),timeMax:b.toISOString(),singleEvents:true,orderBy:'startTime',maxResults:100});const items=(r.result.items||[]).filter(e=>e.status!=='cancelled');window.chefSecteurGoogleEvents=items;render(items);const result=window.applyGoogleCalendarToPlan();status(calendarSummary(result));}catch(e){status('Erreur Calendar : '+((e.result&&e.result.error&&e.result.error.message)||e.message||e));}};

  function hookGenerateWeek(){if(window.__gcalGenerateHook)return;if(typeof window.generateWeek!=='function')return;const original=window.generateWeek;window.generateWeek=function(){const out=original.apply(this,arguments);try{if((window.chefSecteurGoogleEvents||[]).length){const r=window.applyGoogleCalendarToPlan();status(calendarSummary(r));}}catch(e){console.warn('Google Calendar planning:',e);}return out;};window.__gcalGenerateHook=true;}

  function mount(){if(document.getElementById('gcalCard')){hookGenerateWeek();return;}const card=document.createElement('div');card.id='gcalCard';card.className='card';card.innerHTML='<div class="row" style="justify-content:space-between"><div><h2 style="margin-bottom:4px">Google Calendar</h2><div id="gcalStatus" class="tiny">Lecture seule · non connecté</div></div><div class="row"><button id="gcalConnect" class="primary" onclick="connectGoogleCalendar()">Connecter Google Calendar</button><button id="gcalSync" class="secondary" style="display:none" onclick="syncGoogleCalendar()">Synchroniser</button></div></div><div class="notice" style="margin-top:12px">Les rendez-vous Google réduisent automatiquement le temps disponible de la journée. Les visites sont déplacées vers les jours les plus légers quand c’est possible.</div><div id="gcalEvents" style="margin-top:10px"></div>';const panel=document.getElementById('planPanel');const grid=panel&&panel.querySelector('.grid');if(panel&&grid)panel.insertBefore(card,grid);else{const wrap=document.querySelector('.wrap');if(wrap)wrap.insertBefore(card,wrap.firstChild);}hookGenerateWeek();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else setTimeout(mount,0);
  setTimeout(hookGenerateWeek,1200);
})();
