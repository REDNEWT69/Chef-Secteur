(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let busy=false,timer=null;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function selectedDay(){
    try{
      const active=document.querySelector('#dayTabs .dayTab.active');
      if(active){const txt=active.textContent||'';const d=DAYS.find(x=>norm(txt).includes(norm(x)));if(d)return d;}
      if(typeof window.selectedPlanningDay==='string'&&window.selectedPlanningDay)return window.selectedPlanningDay;
      return ((state.settings&&state.settings.days)||DAYS)[0]||'Lundi';
    }catch(e){return'Lundi';}
  }
  function routeForDay(day){try{return (state.plan&&state.plan[day])||[]}catch(e){return[]}}
  function basePoint(){
    try{
      const p=state.profile||{};
      if(p.baseAddress)return p.baseAddress;
      if(isFinite(Number(p.baseLat))&&isFinite(Number(p.baseLon)))return Number(p.baseLat)+','+Number(p.baseLon);
    }catch(e){}
    return'';
  }
  function storePoint(s){
    if(!s)return'';
    if(s.adresse||s.ville)return [s.adresse,s.ville].filter(Boolean).join(' ');
    if(isFinite(Number(s.lat))&&isFinite(Number(s.lon)))return Number(s.lat)+','+Number(s.lon);
    return s.ville||s.enseigne||'';
  }
  function routeKm(route){
    try{
      if(!route.length)return 0;
      let km=typeof window.havBase==='function'?window.havBase(route[0]):0;
      for(let i=1;i<route.length;i++)if(typeof window.hav==='function')km+=window.hav(route[i-1],route[i]);
      return Math.round(km);
    }catch(e){return 0;}
  }
  function directionsUrl(day){
    const route=routeForDay(day);if(!route.length)return'';
    const origin=basePoint()||storePoint(route[0]);
    const destination=storePoint(route[route.length-1]);
    const middle=route.slice(origin===storePoint(route[0])?1:0,-1).map(storePoint).filter(Boolean).slice(0,8);
    let url='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(origin)+'&destination='+encodeURIComponent(destination);
    if(middle.length)url+='&waypoints='+encodeURIComponent(middle.join('|'));
    return url;
  }
  function openRoute(){
    const day=selectedDay(),url=directionsUrl(day);
    if(url)window.open(url,'_blank','noopener');
    else{
      const box=document.getElementById('routeCompactCard');
      if(box){const n=box.querySelector('.routeEmpty');if(n)n.textContent='Aucune tournée magasin prévue pour '+day+'.';}
    }
  }
  window.showPlanMap=openRoute;
  window.openSelectedDayRoute=openRoute;

  function hideLegacyMap(){
    const wrap=document.getElementById('planMapWrap');if(wrap)wrap.style.display='none';
    const map=document.getElementById('map');if(map)map.style.display='none';
    document.querySelectorAll('.applePlanTools button').forEach(btn=>{
      const txt=norm(btn.textContent||'');
      if(txt.includes('voir la carte')||txt.includes('itineraire')){
        btn.textContent='➤ Ouvrir l’itinéraire';
        btn.setAttribute('onclick','openSelectedDayRoute()');
      }
    });
  }
  function renderCompactRoute(){
    const shell=document.querySelector('#planPanel .timelineShell');if(!shell)return;
    let box=document.getElementById('routeCompactCard');
    if(!box){box=document.createElement('div');box.id='routeCompactCard';shell.parentNode.insertBefore(box,shell.nextSibling);}
    const day=selectedDay(),route=routeForDay(day),km=routeKm(route);
    if(!route.length){box.style.display='none';return;}
    box.style.display='block';
    box.style.cssText='margin:12px 0 0;padding:14px 16px;border:1px solid #e1e5ed;border-radius:18px;background:#fff;box-shadow:0 4px 14px rgba(25,42,80,.045)';
    const names=route.slice(0,4).map((s,i)=>(i+1)+'. '+esc((s.enseigne||'')+' '+(s.ville||''))).join(' · ')+(route.length>4?' · +'+(route.length-4)+' autres':'');
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><b style="font-size:14px">➤ Itinéraire du '+esc(day)+'</b><div style="font-size:11px;color:#667085;margin-top:4px">'+route.length+' visite'+(route.length>1?'s':'')+(km?' · ~'+km+' km':'')+'</div><div style="font-size:10.5px;color:#7b8494;margin-top:5px;line-height:1.4">'+names+'</div><div class="routeEmpty" style="font-size:10.5px;color:#7b8494;margin-top:4px"></div></div><button class="secondary" type="button" onclick="openSelectedDayRoute()">Ouvrir dans Google Maps</button></div>';
  }
  function polish(){if(busy)return;busy=true;try{hideLegacyMap();renderCompactRoute()}finally{busy=false}}
  function hook(){
    if(!window.__routePolishWeek&&typeof window.renderWeek==='function'){const base=window.renderWeek;window.renderWeek=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__routePolishWeek=true;}
    if(!window.__routePolishAll&&typeof window.renderAll==='function'){const base=window.renderAll;window.renderAll=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__routePolishAll=true;}
  }
  async function boot(){
    for(let i=0;i<50;i++){hook();polish();if(window.__routePolishWeek)break;await new Promise(r=>setTimeout(r,120));}
    document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(polish,30)},true);
    const root=document.querySelector('.wrap')||document.body;
    const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(polish,80)});obs.observe(root,{childList:true,subtree:true});
    polish();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();