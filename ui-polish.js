(function(){
  'use strict';
  const TOKEN_KEY='chef_secteur_google_token_v2';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let busy=false,timer=null;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function hasToken(){try{return !!sessionStorage.getItem(TOKEN_KEY)}catch(e){return false}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function selectedDay(){try{return window.selectedPlanningDay||((state.settings&&state.settings.days)||DAYS)[0]||'Lundi'}catch(e){return'Lundi'}}
  function weekMonday(){try{const raw=(state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10);const d=new Date(raw+'T12:00:00');const w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d}catch(e){return new Date()}}
  function dateForDay(day){const d=weekMonday();d.setDate(d.getDate()+Math.max(0,DAYS.indexOf(day)));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

  function calendarCount(){try{return Array.isArray(state.calendarEvents)?state.calendarEvents.length:0}catch(e){return 0}}
  function syncCalendarBadges(){
    const connected=hasToken()||calendarCount()>0;
    const badge=document.getElementById('googleCalendarBadge');
    const status=document.getElementById('googleCalendarStatus');
    if(badge){badge.textContent=connected?'Connecté':'Non connecté';badge.classList.toggle('on',connected)}
    if(status&&connected){
      const n=calendarCount(),last=state&&state.calendarLastSync?new Date(state.calendarLastSync):null;
      let txt=n+' événement'+(n>1?'s':'')+' synchronisé'+(n>1?'s':'');
      if(last&&!isNaN(last.getTime()))txt+=' · dernière synchro '+last.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      status.textContent=txt;
    }
    const topStatus=document.getElementById('gcalStatus');
    if(topStatus&&connected&&/non connecté/i.test(topStatus.textContent||''))topStatus.textContent=calendarCount()+' événement'+(calendarCount()>1?'s':'')+' chargé'+(calendarCount()>1?'s':'')+' · agenda connecté';
  }

  function hotelEventsForSelectedDay(){
    try{
      const date=dateForDay(selectedDay());
      return (state.calendarEvents||[]).filter(e=>e.date===date&&/(hotel|hôtel|hebergement|hébergement)/i.test((e.title||'')+' '+(e.location||'')));
    }catch(e){return[]}
  }
  function overnightForSelectedDay(){
    try{
      if(typeof window.overnightCandidate!=='function')return null;
      const o=window.overnightCandidate();if(!o)return null;
      const m=String(o.night||'').match(/Nuit\s+([^→]+)→\s*(.+)$/i);if(!m)return null;
      const from=m[1].trim(),to=m[2].trim();
      return selectedDay()===from?o:null;
    }catch(e){return null}
  }
  function hotelSearchUrl(text){return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(text)}

  function ensureHotelBanner(){
    const shell=document.querySelector('#planPanel .timelineShell');if(!shell)return;
    let box=document.getElementById('planningHotelBanner');
    const evs=hotelEventsForSelectedDay();
    const overnight=overnightForSelectedDay();
    if(!evs.length&&!overnight){if(box)box.remove();return}
    if(!box){box=document.createElement('div');box.id='planningHotelBanner';shell.parentNode.insertBefore(box,shell)}
    box.style.cssText='margin:12px 0 14px;padding:16px 17px;border:2px solid #efc14f;border-radius:18px;background:linear-gradient(135deg,#fff7d8,#fffdf4);box-shadow:0 8px 22px rgba(153,102,0,.10)';
    let html='<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><b style="font-size:16px;color:#7a4b00">🌙 Découchage · Hôtel conseillé</b><div style="font-size:11px;color:#76572f;margin-top:4px">'+esc(selectedDay())+' · visible directement dans ton planning</div></div><span style="font-size:10px;padding:5px 8px;border-radius:999px;background:#fff3bd;color:#7a4b00;font-weight:800">NUIT</span></div>';
    if(evs.length){
      evs.forEach(ev=>{
        const label=ev.title||'Hôtel';const where=ev.location||label;
        html+='<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(122,75,0,.16)"><b style="font-size:14px">'+esc(label)+'</b>'+(ev.location?'<div style="font-size:11px;color:#76572f;margin-top:3px">'+esc(ev.location)+'</div>':'')+'<a target="_blank" rel="noopener" href="'+hotelSearchUrl(where)+'" style="display:inline-block;margin-top:8px;color:#0f61d6;font-size:11.5px;font-weight:700;text-decoration:none">Voir / rechercher cet hôtel ↗</a></div>';
      });
    }else if(overnight){
      const name='Hôtel près de '+(overnight.last&&overnight.last.ville?overnight.last.ville:'la fin de tournée');
      html+='<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(122,75,0,.16)"><b style="font-size:14px">'+esc(name)+'</b><div style="font-size:11px;color:#76572f;margin-top:3px">Fin de tournée près de '+esc((overnight.last&&overnight.last.enseigne?overnight.last.enseigne+' ':'')+(overnight.last&&overnight.last.ville||''))+'</div><a target="_blank" rel="noopener" href="'+hotelSearchUrl(name)+'" style="display:inline-block;margin-top:8px;color:#0f61d6;font-size:11.5px;font-weight:700;text-decoration:none">Chercher un hôtel ↗</a></div>';
    }
    box.innerHTML=html;
  }

  function markHotelDayTab(){
    try{
      document.querySelectorAll('#dayTabs .dayTab').forEach(btn=>{btn.querySelectorAll('.hotelDayBadge').forEach(x=>x.remove())});
      const dateMap={};(state.calendarEvents||[]).forEach(e=>{if(/(hotel|hôtel|hebergement|hébergement)/i.test((e.title||'')+' '+(e.location||'')))dateMap[e.date]=true});
      const monday=weekMonday();
      document.querySelectorAll('#dayTabs .dayTab').forEach((btn,i)=>{
        const day=DAYS[i];if(!day)return;const d=new Date(monday);d.setDate(d.getDate()+i);const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        let has=!!dateMap[iso];
        if(!has&&typeof window.overnightCandidate==='function'){try{const o=window.overnightCandidate();if(o&&String(o.night||'').includes('Nuit '+day+' →'))has=true}catch(e){}}
        if(has){const s=document.createElement('span');s.className='hotelDayBadge';s.textContent='🌙 hôtel';s.style.cssText='display:block;margin-top:4px;font-size:9px;color:#9a6200;font-weight:800';btn.appendChild(s)}
      });
    }catch(e){}
  }

  function simplifyNativeCalendarCard(){
    const input=document.getElementById('googleClientId');if(!input)return;
    const connected=hasToken()||calendarCount()>0;
    const card=input.closest('.calendarConnect');if(!card)return;
    const label=card.querySelector('label[for="googleClientId"]');
    if(connected){if(label)label.style.display='none';input.style.display='none';const p=Array.from(card.querySelectorAll('p.tiny')).find(x=>/Configuration unique/i.test(x.textContent||''));if(p)p.style.display='none'}
    else{if(label)label.style.display='';input.style.display='';const p=Array.from(card.querySelectorAll('p.tiny')).find(x=>/Configuration unique/i.test(x.textContent||''));if(p)p.style.display=''}
  }

  function polish(){if(busy)return;busy=true;try{syncCalendarBadges();ensureHotelBanner();markHotelDayTab();simplifyNativeCalendarCard()}finally{busy=false}}
  function hook(){
    if(!window.__polishRenderWeek&&typeof window.renderWeek==='function'){const base=window.renderWeek;window.renderWeek=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__polishRenderWeek=true}
    if(!window.__polishRenderAll&&typeof window.renderAll==='function'){const base=window.renderAll;window.renderAll=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__polishRenderAll=true}
    if(!window.__polishSync&&typeof window.syncGoogleCalendar==='function'){const base=window.syncGoogleCalendar;window.syncGoogleCalendar=async function(){const out=await base.apply(this,arguments);setTimeout(polish,0);return out};window.__polishSync=true}
  }
  async function boot(){for(let i=0;i<50;i++){hook();polish();if(window.__polishRenderWeek&&window.__polishSync)break;await new Promise(r=>setTimeout(r,120))}const root=document.querySelector('.wrap')||document.body;const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(polish,80)});obs.observe(root,{childList:true,subtree:true,characterData:true});polish()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();