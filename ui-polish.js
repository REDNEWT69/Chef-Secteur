(function(){
  'use strict';
  const TOKEN_KEY='chef_secteur_google_token_v2';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let busy=false;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function hasToken(){try{return !!sessionStorage.getItem(TOKEN_KEY)}catch(e){return false}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function selectedDay(){
    try{
      const active=document.querySelector('#dayTabs .dayTab.active');
      if(active){const txt=active.textContent||'';const d=DAYS.find(x=>norm(txt).includes(norm(x)));if(d)return d}
      if(typeof window.selectedPlanningDay==='string'&&window.selectedPlanningDay)return window.selectedPlanningDay;
      return ((state.settings&&state.settings.days)||DAYS)[0]||'Lundi';
    }catch(e){return'Lundi'}
  }
  function weekMonday(){try{const raw=(state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10);const d=new Date(raw+'T12:00:00');const w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d}catch(e){return new Date()}}
  function dateForDay(day){const d=weekMonday();d.setDate(d.getDate()+Math.max(0,DAYS.indexOf(day)));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function addDays(iso,n){const p=String(iso||'').split('-');if(p.length!==3)return iso;const d=new Date(+p[0],+p[1]-1,+p[2],12);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function dateOnly(v){const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
  function eventCoversDate(e,date){
    if(typeof window.chefSecteurEventCoversDate==='function')try{return window.chefSecteurEventCoversDate(e,date)}catch(err){}
    const start=dateOnly(e&& (e.date||e.start));if(!start)return false;let end=dateOnly(e&&e.end)||start;if(e&&e.allDay&&end>start)end=addDays(end,-1);if(end<start)end=start;return date>=start&&date<=end;
  }

  function calendarCount(){try{return Array.isArray(state.calendarEvents)?state.calendarEvents.length:0}catch(e){return 0}}
  function syncCalendarBadges(){
    const connected=hasToken()||calendarCount()>0,badge=document.getElementById('googleCalendarBadge'),status=document.getElementById('googleCalendarStatus');
    if(badge){badge.textContent=connected?'Connecté':'Non connecté';badge.classList.toggle('on',connected)}
    if(status&&connected){const n=calendarCount(),last=state&&state.calendarLastSync?new Date(state.calendarLastSync):null;let txt=n+' événement'+(n>1?'s':'')+' synchronisé'+(n>1?'s':'');if(last&&!isNaN(last.getTime()))txt+=' · dernière synchro '+last.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});status.textContent=txt}
    const topStatus=document.getElementById('gcalStatus');if(topStatus&&connected&&/non connecté/i.test(topStatus.textContent||''))topStatus.textContent=calendarCount()+' événement'+(calendarCount()>1?'s':'')+' chargé'+(calendarCount()>1?'s':'')+' · agenda connecté';
  }

  function hotelEventsForDay(day){
    try{const date=dateForDay(day);return (state.calendarEvents||[]).filter(e=>eventCoversDate(e,date)&&/(hotel|hôtel|hebergement|hébergement|b&b|b\s*&\s*b)/i.test((e.title||'')+' '+(e.location||'')))}catch(e){return[]}
  }
  function awayRangeForDay(day){
    try{const date=dateForDay(day),ranges=typeof window.chefSecteurAwayRanges==='function'?window.chefSecteurAwayRanges():[];return ranges.find(r=>date>=r.start&&date<=r.end)||null}catch(e){return null}
  }
  function overnightForSelectedDay(){try{if(typeof window.overnightCandidate!=='function')return null;const o=window.overnightCandidate();if(!o)return null;const m=String(o.night||'').match(/Nuit\s+([^→]+)→\s*(.+)$/i);if(!m)return null;return selectedDay()===m[1].trim()?o:null}catch(e){return null}}
  function hotelSearchUrl(text){return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(text)}

  function ensureHotelBanner(){
    const day=selectedDay(),date=dateForDay(day),dayTabs=document.getElementById('dayTabs'),shell=document.querySelector('#planPanel .timelineShell');if(!shell)return;
    let box=document.getElementById('planningHotelBanner');const evs=hotelEventsForDay(day),overnight=overnightForSelectedDay(),away=awayRangeForDay(day);
    if(!evs.length&&!overnight&&!away){if(box)box.remove();return}
    if(!box){box=document.createElement('div');box.id='planningHotelBanner';(dayTabs&&dayTabs.parentNode?dayTabs.parentNode:shell.parentNode).insertBefore(box,shell)}
    box.style.cssText='margin:12px 0 14px;padding:16px 17px;border:2px solid #efc14f;border-radius:18px;background:linear-gradient(135deg,#fff7d8,#fffdf4);box-shadow:0 8px 22px rgba(153,102,0,.10)';
    let html='<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><b style="font-size:16px;color:#7a4b00">🌙 Découchage · Hôtel</b><div style="font-size:11px;color:#76572f;margin-top:4px">'+esc(day)+' '+esc(date)+' · affiché directement dans le planning</div></div><span style="font-size:10px;padding:5px 8px;border-radius:999px;background:#fff3bd;color:#7a4b00;font-weight:800">NUIT / DÉPLACEMENT</span></div>';
    if(evs.length){
      evs.forEach(ev=>{const label=ev.title||'Hôtel',where=ev.location||label;html+='<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(122,75,0,.16)"><b style="font-size:14px">'+esc(label)+'</b>'+(ev.location?'<div style="font-size:11px;color:#76572f;margin-top:3px">'+esc(ev.location)+'</div>':'')+'<div style="font-size:10.5px;color:#76572f;margin-top:3px">Séjour couvert par cet événement Google Agenda.</div><a target="_blank" rel="noopener" href="'+hotelSearchUrl(where)+'" style="display:inline-block;margin-top:8px;color:#0f61d6;font-size:11.5px;font-weight:700;text-decoration:none">Voir / rechercher cet hôtel ↗</a></div>'});
    }else if(overnight){
      const name='Hôtel près de '+(overnight.last&&overnight.last.ville?overnight.last.ville:'la fin de tournée');html+='<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(122,75,0,.16)"><b style="font-size:14px">'+esc(name)+'</b><div style="font-size:11px;color:#76572f;margin-top:3px">Découchage calculé par la tournée.</div><a target="_blank" rel="noopener" href="'+hotelSearchUrl(name)+'" style="display:inline-block;margin-top:8px;color:#0f61d6;font-size:11.5px;font-weight:700;text-decoration:none">Chercher un hôtel ↗</a></div>';
    }else if(away){
      html+='<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(122,75,0,.16)"><b style="font-size:14px">Déplacement professionnel · '+esc(away.city||'hors secteur')+'</b><div style="font-size:11px;color:#76572f;margin-top:3px">Séjour déduit de Google Agenda du '+esc(away.start)+' au '+esc(away.end)+'.</div></div>';
    }
    box.innerHTML=html;
  }

  function markHotelDayTab(){
    try{document.querySelectorAll('#dayTabs .dayTab').forEach(btn=>btn.querySelectorAll('.hotelDayBadge').forEach(x=>x.remove()));document.querySelectorAll('#dayTabs .dayTab').forEach((btn,i)=>{const day=DAYS.find(d=>norm(btn.textContent||'').includes(norm(d)))||DAYS[i];if(!day)return;const hasHotel=hotelEventsForDay(day).length>0,away=awayRangeForDay(day);let has=hasHotel||!!away;if(!has&&typeof window.overnightCandidate==='function')try{const o=window.overnightCandidate();if(o&&String(o.night||'').includes('Nuit '+day+' →'))has=true}catch(e){}if(has){const s=document.createElement('span');s.className='hotelDayBadge';s.textContent=hasHotel?'🌙 hôtel':'✈ déplacement';s.style.cssText='display:block;margin-top:4px;font-size:9px;color:#9a6200;font-weight:800';btn.appendChild(s)}})}catch(e){}
  }

  function simplifyNativeCalendarCard(){const input=document.getElementById('googleClientId');if(!input)return;const connected=hasToken()||calendarCount()>0,card=input.closest('.calendarConnect');if(!card)return;const label=card.querySelector('label[for="googleClientId"]'),p=Array.from(card.querySelectorAll('p.tiny')).find(x=>/Configuration unique/i.test(x.textContent||''));if(connected){if(label)label.style.display='none';input.style.display='none';if(p)p.style.display='none'}else{if(label)label.style.display='';input.style.display='';if(p)p.style.display=''}}
  function polish(){if(busy)return;busy=true;try{syncCalendarBadges();ensureHotelBanner();markHotelDayTab();simplifyNativeCalendarCard()}finally{busy=false}}
  function hook(){if(!window.__polishRenderWeek&&typeof window.renderWeek==='function'){const base=window.renderWeek;window.renderWeek=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__polishRenderWeek=true}if(!window.__polishRenderAll&&typeof window.renderAll==='function'){const base=window.renderAll;window.renderAll=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__polishRenderAll=true}if(!window.__polishSync&&typeof window.syncGoogleCalendar==='function'){const base=window.syncGoogleCalendar;window.syncGoogleCalendar=async function(){const out=await base.apply(this,arguments);setTimeout(polish,0);return out};window.__polishSync=true}}
  function refresh(){hook();polish()}
  function installEvents(){
    if(window.__uiPolishEvents)return;
    document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(polish,30)},true);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
    window.addEventListener('chef-range-generated',function(){setTimeout(refresh,40)});
    window.addEventListener('storage',function(e){if(e&&e.key&&/chef_sector|calendar|google/i.test(e.key))setTimeout(refresh,0)});
    window.__uiPolishEvents=true;
  }
  function boot(){installEvents();refresh();[80,180,350,700,1400,2600].forEach(delay=>setTimeout(refresh,delay))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('load',refresh,{once:true});
})();