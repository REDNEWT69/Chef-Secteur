(function(){
  'use strict';
  const CLIENT_ID='59370123885-qe3r60bm3bjgc9jlnmn8qb6342lthhr6.apps.googleusercontent.com';
  const SCOPE='https://www.googleapis.com/auth/calendar.readonly';
  let tokenClient;

  function loadScript(src,id){return new Promise((resolve,reject)=>{if(document.getElementById(id))return resolve();const s=document.createElement('script');s.id=id;s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
  function status(t){const e=document.getElementById('gcalStatus');if(e)e.textContent=t;}
  function monday(){const raw=(window.state&&state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10);const p=raw.split('-');const d=new Date(+p[0],+p[1]-1,+p[2],12);const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d;}
  function render(items){const box=document.getElementById('gcalEvents');if(!box)return;box.innerHTML=(items||[]).slice(0,12).map(e=>'<div style="padding:8px 0;border-top:1px solid #eef1f5"><b>'+String(e.summary||'(Sans titre)').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</b><div class="tiny">'+String((e.start&&((e.start.dateTime||e.start.date)))||'')+'</div></div>').join('')||'<div class="tiny">Aucun événement cette semaine.</div>';}

  async function prepare(){
    await Promise.all([
      loadScript('https://accounts.google.com/gsi/client','google-gis'),
      loadScript('https://apis.google.com/js/api.js','google-api-js')
    ]);
    await new Promise(resolve=>gapi.load('client',resolve));
    await gapi.client.init({discoveryDocs:['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']});
    if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,callback:async r=>{if(r.error){status('Connexion refusée : '+r.error);return;}gapi.client.setToken(r);document.getElementById('gcalConnect').style.display='none';document.getElementById('gcalSync').style.display='';await window.syncGoogleCalendar();}});
  }

  window.connectGoogleCalendar=async function(){try{status('Ouverture de Google…');await prepare();tokenClient.requestAccessToken({prompt:'consent'});}catch(e){status('Erreur de connexion Google : '+(e.message||e));}};
  window.syncGoogleCalendar=async function(){try{await prepare();const a=monday(),b=new Date(a);b.setDate(b.getDate()+7);status('Synchronisation…');const r=await gapi.client.calendar.events.list({calendarId:'primary',timeMin:a.toISOString(),timeMax:b.toISOString(),singleEvents:true,orderBy:'startTime',maxResults:100});const items=(r.result.items||[]).filter(e=>e.status!=='cancelled');window.chefSecteurGoogleEvents=items;render(items);status(items.length+' événement'+(items.length>1?'s':'')+' chargé'+(items.length>1?'s':'')+' en lecture seule.');}catch(e){status('Erreur Calendar : '+(e.result&&e.result.error&&e.result.error.message||e.message||e));}};

  function mount(){if(document.getElementById('gcalCard'))return;const card=document.createElement('div');card.id='gcalCard';card.className='card';card.innerHTML='<div class="row" style="justify-content:space-between"><div><h2 style="margin-bottom:4px">Google Calendar</h2><div id="gcalStatus" class="tiny">Lecture seule · non connecté</div></div><div class="row"><button id="gcalConnect" class="primary" onclick="connectGoogleCalendar()">Connecter Google Calendar</button><button id="gcalSync" class="secondary" style="display:none" onclick="syncGoogleCalendar()">Synchroniser</button></div></div><div id="gcalEvents" style="margin-top:10px"></div>';const panel=document.getElementById('planPanel');const grid=panel&&panel.querySelector('.grid');if(panel&&grid)panel.insertBefore(card,grid);else{const wrap=document.querySelector('.wrap');if(wrap)wrap.insertBefore(card,wrap.firstChild);}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else setTimeout(mount,0);
})();
