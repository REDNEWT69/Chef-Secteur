from pathlib import Path
import base64, gzip, re, subprocess

ROOT = Path('.')
parts = [ROOT / 'apple-v2' / f'part{i:02d}.txt' for i in range(1, 8)]
raw = ''.join(p.read_text().strip() for p in parts)
html = gzip.decompress(base64.b64decode(raw)).decode('utf-8')

# Saturday available, but not selected by default.
html = html.replace(
    "var DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];",
    "var DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];"
)
html = html.replace(
    "settings:{target:20,days:DAYS.slice(),brands:[]",
    "settings:{target:20,days:DAYS.slice(0,5),brands:[]"
)
html = html.replace(
    "if(!state.settings.days)state.settings.days=DAYS.slice();",
    "if(!state.settings.days)state.settings.days=DAYS.slice(0,5);"
)
html = html.replace("end.setDate(end.getDate()+4)", "end.setDate(end.getDate()+5)")
html = html.replace("idx>4", "idx>5")

calendar_ui = '''        <div class="calendarCard" id="googleCalendarCard">
          <h3 style="margin:0 0 8px">Google Agenda</h3>
          <div class="calendarHint">Lecture seule. Les événements de la semaine apparaissent dans la timeline et bloquent les visites qui chevauchent leur créneau.</div>
          <label>Client ID Google OAuth</label>
          <input id="googleCalendarClientId" type="text" placeholder="…apps.googleusercontent.com">
          <div class="row" style="margin-top:8px">
            <button class="secondary" type="button" onclick="connectGoogleCalendar()">Connecter Google</button>
            <button class="secondary" type="button" onclick="syncGoogleCalendar()">Synchroniser</button>
            <button class="secondary" type="button" onclick="disconnectGoogleCalendar()">Déconnecter</button>
          </div>
          <div id="googleCalendarStatus" class="calendarStatus">Non connecté</div>
        </div>

'''
needle = '        <button class="primary full" onclick="generateWeek()">✦ Générer ma semaine</button>'
assert needle in html
html = html.replace(needle, calendar_ui + needle, 1)

calendar_css = '.calendarCard{margin-top:16px;padding:15px;border:1px solid var(--ios-line);border-radius:18px;background:#fff}.calendarHint,.calendarStatus{font-size:11.5px;color:#667085;line-height:1.45}.calendarStatus{margin-top:8px}.calendarStatus.ok{color:#067647}.calendarStatus.bad{color:#b42318}.tlCalendar .tlDot{background:#7c3aed}.tlCalendar .tlBadge{background:#f1ebff;color:#6941c6}.tlCalendar .tlMain{cursor:default}.tlCalendar .tlMain:active{background:transparent}\n'
style_end = '</style>\n\n</head><body>'
assert style_end in html
html = html.replace(style_end, calendar_css + style_end, 1)

helpers = r'''
  var googleAccessToken='',googleTokenClient=null,GOOGLE_SCOPE='https://www.googleapis.com/auth/calendar.readonly';
  if(!state.googleCalendar)state.googleCalendar={clientId:'',enabled:false,lastSync:''};
  if(!Array.isArray(state.externalCalendarEvents))state.externalCalendarEvents=[];
  function calendarStatus(msg,cls){var el=document.getElementById('googleCalendarStatus');if(el){el.textContent=msg;el.className='calendarStatus '+(cls||'')}}
  function loadGoogleIdentity(){return new Promise(function(resolve,reject){if(window.google&&google.accounts&&google.accounts.oauth2)return resolve();var old=document.getElementById('google-gis-script');if(old){old.addEventListener('load',resolve,{once:true});return}var sc=document.createElement('script');sc.id='google-gis-script';sc.src='https://accounts.google.com/gsi/client';sc.async=true;sc.onload=resolve;sc.onerror=function(){reject(new Error('Impossible de charger la connexion Google.'))};document.head.appendChild(sc)})}
  function googleClientId(){var el=document.getElementById('googleCalendarClientId'),id=((el&&el.value)||state.googleCalendar.clientId||'').trim();if(!id)throw new Error('Ajoute le Client ID Google OAuth.');state.googleCalendar.clientId=id;save();return id}
  function requestGoogleToken(prompt){return new Promise(function(resolve,reject){try{googleTokenClient=google.accounts.oauth2.initTokenClient({client_id:googleClientId(),scope:GOOGLE_SCOPE,callback:function(r){if(r&&r.error)return reject(new Error(r.error));googleAccessToken=(r&&r.access_token)||'';if(!googleAccessToken)return reject(new Error('Google n’a pas renvoyé de jeton.'));state.googleCalendar.enabled=true;save();resolve(googleAccessToken)}});googleTokenClient.requestAccessToken({prompt:prompt||''})}catch(e){reject(e)}})}
  function normalizeGoogleEvent(e){var s=e.start||{},en=e.end||{},all=!!s.date,sd=s.date||String(s.dateTime||'').slice(0,10),sm=0,em=1440;if(!all){var ds=new Date(s.dateTime),de=new Date(en.dateTime);sm=ds.getHours()*60+ds.getMinutes();em=de.getHours()*60+de.getMinutes()}return{id:e.id||'',title:e.summary||'Événement Google',location:e.location||'',date:sd,start:sm,end:em,allDay:all}}
  function googleEventsFor(day){var dt=dateForDayName(day);return(state.externalCalendarEvents||[]).filter(function(e){return e.date===dt}).sort(function(a,b){return a.start-b.start})}
  function pushPastGoogleEvents(day,start,duration){var evs=googleEventsFor(day),t=start;for(var i=0;i<evs.length;i++){var ev=evs[i];if(ev.allDay)return 24*60;if(t<ev.end&&t+duration>ev.start)t=ev.end}return t}
  async function syncGoogleCore(){await loadGoogleIdentity();if(!googleAccessToken)await requestGoogleToken('');var m=refMonday(),end=new Date(m);end.setDate(end.getDate()+6);end.setHours(23,59,59,999);var url='https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin='+encodeURIComponent(m.toISOString())+'&timeMax='+encodeURIComponent(end.toISOString())+'&maxResults=100';var r=await fetch(url,{headers:{Authorization:'Bearer '+googleAccessToken},cache:'no-store'});if(r.status===401){googleAccessToken='';await requestGoogleToken('');return syncGoogleCore()}if(!r.ok)throw new Error('Google Agenda a répondu '+r.status+'.');var j=await r.json();state.externalCalendarEvents=(j.items||[]).filter(function(x){return x.status!=='cancelled'}).map(normalizeGoogleEvent);state.googleCalendar.lastSync=new Date().toISOString();save();renderAll();calendarStatus('Synchronisé · '+state.externalCalendarEvents.length+' événement(s)','ok')}
  window.connectGoogleCalendar=async function(){try{calendarStatus('Connexion…');await loadGoogleIdentity();await requestGoogleToken('consent');await syncGoogleCore()}catch(e){calendarStatus(e.message||String(e),'bad')}};
  window.syncGoogleCalendar=async function(){try{calendarStatus('Synchronisation…');await syncGoogleCore()}catch(e){calendarStatus(e.message||String(e),'bad')}};
  window.disconnectGoogleCalendar=function(){try{if(googleAccessToken&&window.google&&google.accounts&&google.accounts.oauth2)google.accounts.oauth2.revoke(googleAccessToken,function(){})}catch(e){}googleAccessToken='';state.googleCalendar.enabled=false;state.externalCalendarEvents=[];save();renderAll();calendarStatus('Déconnecté')};
'''
start_marker = "(function(){\n  var selectedPlanningDay=null;"
assert start_marker in html
html = html.replace(start_marker, start_marker + helpers, 1)

old_schedule = """      var s=r[i],travel=roadMinutes(prev,s),a=apptFor(s.id,date),arrival=clock+travel;
      if(a&&a.time){var fixed=timeMin(a.time); if(fixed>arrival)arrival=fixed}
      var dur=a?Math.max(15,Number(a.duration||visit)):visit;
      out.push({store:s,arrival:minTime(arrival),duration:dur,appt:a});"""
new_schedule = """      var s=r[i],travel=roadMinutes(prev,s),a=apptFor(s.id,date),arrival=clock+travel;
      if(a&&a.time){var fixed=timeMin(a.time); if(fixed>arrival)arrival=fixed}
      var dur=a?Math.max(15,Number(a.duration||visit)):visit;
      arrival=pushPastGoogleEvents(day,arrival,dur);
      out.push({store:s,arrival:minTime(arrival),duration:dur,appt:a});"""
assert old_schedule in html
html = html.replace(old_schedule, new_schedule, 1)

old_rows = """    var rows=daySchedule(selectedPlanningDay),h='';
    if(!rows.length)h='<div class=\"timelineEmpty\">Aucune visite pour '+esc(selectedPlanningDay)+'.</div>';
    for(var i=0;i<rows.length;i++){
      var x=rows[i],s=x.store,bc=brandClass(s.enseigne),appt=x.appt;
      h+='<div class=\"timelineRow\">'+
        '<div class=\"tlTime\">'+esc(x.arrival)+'</div>'+
        '<div class=\"tlTrack\"><span class=\"tlDot '+dotClass(s)+'\"></span></div>'+
        '<div class=\"tlMain\" onclick=\"openStoreQuick(\\''+esc(s.id)+'\\',\\''+esc(selectedPlanningDay)+'\\',\\''+esc(x.arrival)+'\\')\">'+
          '<div><div class=\"tlName\">'+esc(s.enseigne+' '+s.ville)+'</div>'+
          '<div class=\"tlMeta\">'+esc(s.adresse||'')+(s.dept?' · '+esc(s.dept):'')+'</div>'+
          (appt?'<div class=\"tlAppointment\">◷ '+esc(appt.type||'Rendez-vous')+' · '+esc(appt.time)+'</div>':'')+
          '</div>'+
          '<div class=\"tlRight\"><span class=\"tlBadge '+bc+'\">'+esc(s.enseigne)+'</span><span class=\"tlDuration\">'+x.duration+' min</span><span class=\"tlChevron\">›</span></div>'+
        '</div></div>'
    }"""
new_rows = """    var rows=daySchedule(selectedPlanningDay),events=googleEventsFor(selectedPlanningDay),items=[],h='';
    for(var ri=0;ri<rows.length;ri++)items.push({kind:'store',min:timeMin(rows[ri].arrival),x:rows[ri]});
    for(var ei=0;ei<events.length;ei++)items.push({kind:'calendar',min:events[ei].allDay?-1:events[ei].start,ev:events[ei]});
    items.sort(function(a,b){return a.min-b.min});
    if(!items.length)h='<div class=\"timelineEmpty\">Aucune visite pour '+esc(selectedPlanningDay)+'.</div>';
    for(var i=0;i<items.length;i++){
      var item=items[i];
      if(item.kind==='calendar'){var ev=item.ev;h+='<div class=\"timelineRow tlCalendar\"><div class=\"tlTime\">'+(ev.allDay?'Journée':minTime(ev.start))+'</div><div class=\"tlTrack\"><span class=\"tlDot\"></span></div><div class=\"tlMain\"><div><div class=\"tlName\">📅 '+esc(ev.title)+'</div><div class=\"tlMeta\">'+esc(ev.location||'Google Agenda')+'</div></div><div class=\"tlRight\"><span class=\"tlBadge\">Google</span><span class=\"tlDuration\">'+(ev.allDay?'Toute la journée':Math.max(0,ev.end-ev.start)+' min')+'</span></div></div></div>';continue}
      var x=item.x,s=x.store,bc=brandClass(s.enseigne),appt=x.appt;
      h+='<div class=\"timelineRow\">'+
        '<div class=\"tlTime\">'+esc(x.arrival)+'</div>'+
        '<div class=\"tlTrack\"><span class=\"tlDot '+dotClass(s)+'\"></span></div>'+
        '<div class=\"tlMain\" onclick=\"openStoreQuick(\\''+esc(s.id)+'\\',\\''+esc(selectedPlanningDay)+'\\',\\''+esc(x.arrival)+'\\')\">'+
          '<div><div class=\"tlName\">'+esc(s.enseigne+' '+s.ville)+'</div>'+
          '<div class=\"tlMeta\">'+esc(s.adresse||'')+(s.dept?' · '+esc(s.dept):'')+'</div>'+
          (appt?'<div class=\"tlAppointment\">◷ '+esc(appt.type||'Rendez-vous')+' · '+esc(appt.time)+'</div>':'')+
          '</div>'+
          '<div class=\"tlRight\"><span class=\"tlBadge '+bc+'\">'+esc(s.enseigne)+'</span><span class=\"tlDuration\">'+x.duration+' min</span><span class=\"tlChevron\">›</span></div>'+
        '</div></div>'
    }"""
assert old_rows in html
html = html.replace(old_rows, new_rows, 1)

boot_old = "setTimeout(function(){try{renderWeek();syncBottomNav(document.querySelector('.panel.on')?.id||'homePanel')}"
boot_new = "setTimeout(function(){try{var gc=document.getElementById('googleCalendarClientId');if(gc)gc.value=state.googleCalendar.clientId||'';if(state.googleCalendar.lastSync)calendarStatus('Dernière synchro · '+new Date(state.googleCalendar.lastSync).toLocaleString('fr-FR'),'ok');renderWeek();syncBottomNav(document.querySelector('.panel.on')?.id||'homePanel')}"
assert boot_old in html
html = html.replace(boot_old, boot_new, 1)

# Validate every inline script before publishing.
for i, code in enumerate(re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>', html, re.I)):
    js = Path(f'/tmp/check_{i}.js')
    js.write_text(code)
    subprocess.run(['node', '--check', str(js)], check=True)

out = ROOT / 'apple-native-v1'
out.mkdir(exist_ok=True)
b64 = base64.b64encode(gzip.compress(html.encode(), compresslevel=9, mtime=0)).decode()
chunks = [b64[i:i+8000] for i in range(0, len(b64), 8000)]
for i, chunk in enumerate(chunks, 1):
    (out / f'part{i:02d}.txt').write_text(chunk)
for old in out.glob('part*.txt'):
    try:
        n = int(old.stem[-2:])
    except ValueError:
        continue
    if n > len(chunks):
        old.unlink()

names = [f'part{i:02d}.txt' for i in range(1, len(chunks)+1)]
loader = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Chef Secteur</title><meta name="theme-color" content="#f5f5f7"><style>html,body{{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f5f5f7;color:#111}}.boot{{min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center}}.boot h1{{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:34px;margin:0 0 10px}}.boot p{{color:#6e6e73}}.err{{color:#b42318;white-space:pre-wrap}}</style></head><body><div class="boot"><div><h1>Chef Secteur</h1><p id="bootText">Chargement de l’application…</p></div></div><script>(async function(){{const parts={names!r};const status=document.getElementById('bootText');try{{const texts=await Promise.all(parts.map(async n=>{{const r=await fetch('./apple-native-v1/'+n+'?v=native1',{{cache:'no-store'}});if(!r.ok)throw new Error('Impossible de charger '+n+' ('+r.status+')');return(await r.text()).trim()}}));const binary=atob(texts.join(''));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));const app=await new Response(stream).text();document.open();document.write(app);document.close()}}catch(e){{status.className='err';status.textContent='Erreur de chargement : '+(e&&e.message?e.message:String(e))}}}})();</script></body></html>'''
(ROOT / 'index.html').write_text(loader)
(ROOT / 'sw.js').write_text("const CACHE_NAME='chef-secteur-native-1';self.addEventListener('install',e=>{self.skipWaiting()});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x)))));self.clients.claim()});self.addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)))})")
print(f'native build ok: {len(html)} bytes, {len(chunks)} parts')
