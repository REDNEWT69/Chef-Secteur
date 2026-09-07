(function(){
  if(!window.state||!window.DAYS)return;
  if(DAYS.indexOf('Samedi')<0)DAYS.push('Samedi');
  if(!state.googleCalendar)state.googleCalendar={clientId:'',enabled:false,lastSync:''};
  if(!Array.isArray(state.externalCalendarEvents))state.externalCalendarEvents=[];
  var tokenClient=null,accessToken='',SCOPE='https://www.googleapis.com/auth/calendar.readonly';
  function saveSafe(){try{save()}catch(e){}}
  function pad(n){return('0'+n).slice(-2)}
  function refMonday(){var s=(state.settings&&state.settings.weekDate)||todayISO(),d=new Date(s+'T12:00:00'),w=d.getDay(),delta=(w===0?-6:1-w);d.setDate(d.getDate()+delta);return d}
  function dateFor(day){var d=refMonday(),i=DAYS.indexOf(day);d.setDate(d.getDate()+Math.max(0,i));return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function mins(t){var p=String(t||'00:00').split(':');return(+p[0]||0)*60+(+p[1]||0)}
  function clock(m){m=Math.round(m);return pad(Math.floor(m/60)%24)+':'+pad(m%60)}
  function calEvents(day){var dt=dateFor(day);return(state.externalCalendarEvents||[]).filter(function(e){return e.date===dt}).sort(function(a,b){return a.start-b.start})}
  function status(msg,cls){var el=document.getElementById('googleCalendarStatus');if(el){el.textContent=msg;el.className='calendarStatus '+(cls||'')}}
  function loadGIS(){return new Promise(function(res,rej){if(window.google&&google.accounts&&google.accounts.oauth2)return res();var old=document.querySelector('script[data-gcal-gis]');if(old){old.addEventListener('load',res,{once:true});return}var s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.dataset.gcalGis='1';s.onload=res;s.onerror=function(){rej(new Error('Impossible de charger Google.'))};document.head.appendChild(s)})}
  function initClient(){var el=document.getElementById('googleCalendarClientId'),id=(el&&el.value||state.googleCalendar.clientId||'').trim();if(!id)throw new Error('Ajoute le Client ID Google OAuth.');state.googleCalendar.clientId=id;saveSafe();tokenClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,callback:function(){}});return tokenClient}
  function requestToken(prompt){return new Promise(function(res,rej){try{var tc=initClient();tc.callback=function(r){if(r.error)return rej(new Error(r.error));accessToken=r.access_token||'';if(!accessToken)return rej(new Error('Aucun jeton Google reçu.'));state.googleCalendar.enabled=true;saveSafe();res(accessToken)};tc.requestAccessToken({prompt:prompt||''})}catch(e){rej(e)}})}
  function normalize(e){var s=e.start||{},en=e.end||{},all=!!s.date,sd=s.date||String(s.dateTime||'').slice(0,10),sm=all?0:(new Date(s.dateTime).getHours()*60+new Date(s.dateTime).getMinutes()),em=all?1440:(new Date(en.dateTime).getHours()*60+new Date(en.dateTime).getMinutes());return{id:e.id,title:e.summary||'Événement Google',location:e.location||'',date:sd,start:sm,end:em,allDay:all}}
  async function sync(){await loadGIS();if(!accessToken)await requestToken('');var m=refMonday(),e=new Date(m);e.setDate(e.getDate()+7);var url='https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin='+encodeURIComponent(m.toISOString())+'&timeMax='+encodeURIComponent(e.toISOString())+'&maxResults=100';var r=await fetch(url,{headers:{Authorization:'Bearer '+accessToken},cache:'no-store'});if(r.status===401)throw new Error('Connexion Google expirée. Appuie sur Connecter.');if(!r.ok)throw new Error('Google Agenda a répondu '+r.status+'.');var j=await r.json();state.externalCalendarEvents=(j.items||[]).filter(function(x){return x.status!=='cancelled'}).map(normalize);state.googleCalendar.lastSync=new Date().toISOString();saveSafe();renderAll();status('Synchronisé · '+state.externalCalendarEvents.length+' événement(s)','ok')}
  window.connectGoogleCalendar=async function(){try{status('Connexion…');await loadGIS();await requestToken('consent');await sync()}catch(e){status(e.message||String(e),'bad')}};
  window.syncGoogleCalendar=async function(){try{status('Synchronisation…');await sync()}catch(e){status(e.message||String(e),'bad')}};
  window.disconnectGoogleCalendar=function(){try{if(accessToken&&window.google)google.accounts.oauth2.revoke(accessToken,function(){})}catch(e){}accessToken='';state.googleCalendar.enabled=false;state.externalCalendarEvents=[];saveSafe();renderAll();status('Déconnecté')};
  function injectUI(){if(document.getElementById('googleCalendarCard'))return;var wrap=document.querySelector('#planningSettings .settingsInner');if(!wrap)return;var d=document.createElement('div');d.id='googleCalendarCard';d.className='calendarCard';d.innerHTML='<h3>Google Agenda</h3><div class="calendarRow"><input id="googleCalendarClientId" type="text" placeholder="Client ID Google OAuth (…apps.googleusercontent.com)"><button class="secondary" type="button" onclick="connectGoogleCalendar()">Connecter</button><button class="secondary" type="button" onclick="syncGoogleCalendar()">Synchroniser</button><button class="secondary" type="button" onclick="disconnectGoogleCalendar()">Déconnecter</button></div><div id="googleCalendarStatus" class="calendarStatus">Non connecté</div><div class="calendarHint">Lecture seule. Les événements Google sont ajoutés à la timeline et repoussent automatiquement les visites qui chevauchent leurs horaires.</div>';wrap.appendChild(d);var inp=document.getElementById('googleCalendarClientId');if(inp)inp.value=state.googleCalendar.clientId||''}
  var css=document.createElement('style');css.textContent='.calendarCard{margin-top:14px;padding:15px;border:1px solid rgba(60,60,67,.14);border-radius:18px;background:#fff}.calendarCard h3{margin:0 0 8px}.calendarRow{display:flex;gap:8px;flex-wrap:wrap}.calendarRow input{flex:1;min-width:220px}.calendarStatus,.calendarHint{font-size:11.5px;color:#667085;margin-top:8px}.calendarStatus.ok{color:#067647}.calendarStatus.bad{color:#b42318}.tlCalendar .tlDot{background:#7c3aed}.tlCalendar .tlBadge{background:#f1ebff;color:#6941c6}';document.head.appendChild(css);
  var oldRF=window.renderFilterControls;window.renderFilterControls=function(){oldRF();injectUI()};
  try{renderFilterControls()}catch(e){injectUI()}
  var oldRenderWeek=window.renderWeek;
  window.renderWeek=function(){
    oldRenderWeek();injectUI();
    var days=(state.settings&&state.settings.days)||DAYS,active=document.querySelector('.dayTab.active b'),day=active?active.textContent.split(' ')[0]:(days[0]||'Lundi'),events=calEvents(day),week=document.getElementById('week');
    if(!week||!events.length)return;
    var storeRows=[].slice.call(week.querySelectorAll('.timelineRow')),previousEnd=0;
    storeRows.forEach(function(r){
      var t=r.querySelector('.tlTime'),durEl=r.querySelector('.tlDuration'),start=t?mins(t.textContent):0,dur=parseInt(durEl&&durEl.textContent,10)||60;
      start=Math.max(start,previousEnd);
      var moved=true;
      while(moved){moved=false;for(var i=0;i<events.length;i++){var ev=events[i],es=ev.allDay?0:ev.start,ee=ev.allDay?1440:ev.end;if(start<ee&&start+dur>es){start=ee;moved=true}}}
      if(t)t.textContent=clock(start);r.dataset.min=start;previousEnd=start+dur;
    });
    events.forEach(function(ev){var row=document.createElement('div');row.className='timelineRow tlCalendar';row.dataset.min=ev.allDay?-1:ev.start;row.innerHTML='<div class="tlTime">'+(ev.allDay?'Journée':clock(ev.start))+'</div><div class="tlTrack"><span class="tlDot"></span></div><div class="tlMain"><div><div class="tlName">📅 '+esc(ev.title)+'</div><div class="tlMeta">'+esc(ev.location||'Google Agenda')+'</div></div><div class="tlRight"><span class="tlBadge">Google</span><span class="tlDuration">'+(ev.allDay?'Toute la journée':Math.max(0,ev.end-ev.start)+' min')+'</span></div></div>';week.appendChild(row)});
    var all=[].slice.call(week.children);all.sort(function(a,b){return Number(a.dataset.min||9999)-Number(b.dataset.min||9999)}).forEach(function(r){week.appendChild(r)});
  };
  var oldGen=window.generateWeek;window.generateWeek=function(){oldGen();setTimeout(function(){try{renderWeek()}catch(e){}},0)};
  setTimeout(function(){try{renderFilterControls();renderWeek()}catch(e){}},100);
})();
