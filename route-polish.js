(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MAPKIT_TOKEN_KEY='chef_secteur_mapkit_token_v1';
  let busy=false,timer=null,mapInstance=null,mapLoading=null;

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
  function profile(){try{return state.profile||{}}catch(e){return{}}}
  function basePoint(){const p=profile();if(p.baseAddress)return p.baseAddress;if(isFinite(Number(p.baseLat))&&isFinite(Number(p.baseLon)))return Number(p.baseLat)+','+Number(p.baseLon);return''}
  function baseCoordinate(){const p=profile();if(isFinite(Number(p.baseLat))&&isFinite(Number(p.baseLon)))return{latitude:Number(p.baseLat),longitude:Number(p.baseLon)};return null}
  function storePoint(s){if(!s)return'';if(s.adresse||s.ville)return [s.adresse,s.ville].filter(Boolean).join(' ');if(isFinite(Number(s.lat))&&isFinite(Number(s.lon)))return Number(s.lat)+','+Number(s.lon);return s.ville||s.enseigne||''}
  function storeCoordinate(s){return s&&isFinite(Number(s.lat))&&isFinite(Number(s.lon))?{latitude:Number(s.lat),longitude:Number(s.lon)}:null}
  function routeKm(route){try{if(!route.length)return 0;let km=typeof window.havBase==='function'?window.havBase(route[0]):0;for(let i=1;i<route.length;i++)if(typeof window.hav==='function')km+=window.hav(route[i-1],route[i]);return Math.round(km)}catch(e){return 0}}

  function appleDirectionsUrl(day){
    const route=routeForDay(day);if(!route.length)return'';
    const source=basePoint()||storePoint(route[0]);
    const startIndex=basePoint()?0:1;
    const destination=storePoint(route[route.length-1]);
    const middle=route.slice(startIndex,-1).map(storePoint).filter(Boolean);
    let url='https://maps.apple.com/directions?source='+encodeURIComponent(source)+'&destination='+encodeURIComponent(destination)+'&mode=driving';
    middle.forEach(w=>{url+='&waypoint='+encodeURIComponent(w)});
    return url;
  }
  function openRoute(){const day=selectedDay(),url=appleDirectionsUrl(day);if(url)window.open(url,'_blank','noopener')}
  window.showPlanMap=openRoute;
  window.openSelectedDayRoute=openRoute;

  function token(){try{return localStorage.getItem(MAPKIT_TOKEN_KEY)||''}catch(e){return''}}
  function saveMapKitToken(){const input=document.getElementById('mapkitTokenInput');if(!input)return;const v=input.value.trim();try{if(v)localStorage.setItem(MAPKIT_TOKEN_KEY,v);else localStorage.removeItem(MAPKIT_TOKEN_KEY)}catch(e){}mapInstance=null;const old=document.getElementById('apple-mapkit-js');if(old)old.remove();window.mapkit=undefined;renderCompactRoute();if(v)setTimeout(renderEmbeddedMap,50)}
  window.saveMapKitToken=saveMapKitToken;
  window.toggleMapKitSetup=function(){const box=document.getElementById('mapkitSetup');if(box)box.style.display=box.style.display==='none'?'block':'none'};

  function loadMapKit(){
    if(window.mapkit&&window.mapkit.Map)return Promise.resolve(window.mapkit);
    if(mapLoading)return mapLoading;
    const t=token();if(!t)return Promise.reject(new Error('TOKEN_MISSING'));
    mapLoading=new Promise((resolve,reject)=>{
      const previous=document.getElementById('apple-mapkit-js');if(previous)previous.remove();
      const cb='chefSecteurMapKitReady_'+Date.now();
      window[cb]=function(){delete window[cb];if(window.mapkit)resolve(window.mapkit);else reject(new Error('MapKit non disponible'))};
      const s=document.createElement('script');s.id='apple-mapkit-js';s.src='https://cdn.apple-mapkit.com/mk/6/mapkit.core.js';s.crossOrigin='anonymous';s.async=true;s.dataset.callback=cb;s.dataset.libraries='full-map';s.dataset.token=t;s.onerror=function(){delete window[cb];mapLoading=null;reject(new Error('Impossible de charger Apple MapKit JS'))};document.head.appendChild(s);
    }).finally(()=>{mapLoading=null});
    return mapLoading;
  }

  async function renderEmbeddedMap(){
    const holder=document.getElementById('appleRouteMap');if(!holder)return;
    const day=selectedDay(),route=routeForDay(day);
    if(!route.length){holder.innerHTML='';holder.style.display='none';return}
    if(!token()){holder.style.display='none';return}
    holder.style.display='block';holder.innerHTML='<div style="display:grid;place-items:center;height:100%;color:#667085;font-size:12px">Chargement d’Apple Plans…</div>';
    try{
      await loadMapKit();
      holder.innerHTML='';
      mapInstance=new mapkit.Map('appleRouteMap',{showsZoomControl:true,showsMapTypeControl:false,showsCompass:mapkit.FeatureVisibility.Adaptive});
      const coordinates=[],annotations=[];
      const base=baseCoordinate();
      if(base){coordinates.push(base);annotations.push(new mapkit.MarkerAnnotation(base,{title:profile().baseName||'Départ',subtitle:'Départ',glyphText:'D'}))}
      route.forEach((s,i)=>{const c=storeCoordinate(s);if(!c)return;coordinates.push(c);annotations.push(new mapkit.MarkerAnnotation(c,{title:(i+1)+'. '+(s.enseigne||'Magasin')+' '+(s.ville||''),subtitle:s.adresse||'',glyphText:String(i+1)}))});
      if(annotations.length)mapInstance.addAnnotations(annotations);
      const directions=new mapkit.Directions({language:'fr-FR'}),polylines=[];
      let totalMeters=0,totalSeconds=0;
      for(let i=0;i<coordinates.length-1;i++){
        try{
          const data=await directions.route({origin:coordinates[i],destination:coordinates[i+1],transportType:mapkit.TransportType.Automobile,requestsAlternateRoutes:false});
          const r=data&&data.routes&&data.routes[0];if(r&&r.polyline){polylines.push(r.polyline);totalMeters+=Number(r.distance||0);totalSeconds+=Number(r.expectedTravelTime||0)}
        }catch(e){console.warn('MapKit leg',i,e)}
      }
      if(polylines.length){mapInstance.addOverlays(polylines);mapInstance.showItems(annotations.concat(polylines),{padding:{top:36,right:36,bottom:36,left:36}})}else if(annotations.length)mapInstance.showItems(annotations,{padding:{top:36,right:36,bottom:36,left:36}});
      const stats=document.getElementById('appleMapStats');if(stats&&totalMeters){const km=Math.round(totalMeters/1000),h=Math.floor(totalSeconds/3600),m=Math.round((totalSeconds%3600)/60);stats.textContent='Apple Plans · '+km+' km · '+(h?h+' h ':'')+m+' min de conduite estimée'}
    }catch(e){
      holder.innerHTML='<div style="padding:16px;color:#a33;font-size:11.5px">Carte Apple indisponible : '+esc(e&&e.message?e.message:e)+'. Vérifie le token MapKit JS et le domaine autorisé.</div>';
    }
  }

  function hideLegacyMap(){
    const wrap=document.getElementById('planMapWrap');if(wrap)wrap.style.display='none';const map=document.getElementById('map');if(map)map.style.display='none';
    document.querySelectorAll('.applePlanTools button').forEach(btn=>{const txt=norm(btn.textContent||'');if(txt.includes('voir la carte')||txt.includes('itineraire')){btn.textContent=' Ouvrir la tournée';btn.setAttribute('onclick','openSelectedDayRoute()')}});
  }
  function renderCompactRoute(){
    const shell=document.querySelector('#planPanel .timelineShell');if(!shell)return;let box=document.getElementById('routeCompactCard');if(!box){box=document.createElement('div');box.id='routeCompactCard';shell.parentNode.insertBefore(box,shell.nextSibling)}
    const day=selectedDay(),route=routeForDay(day),km=routeKm(route);if(!route.length){box.style.display='none';return}box.style.display='block';box.style.cssText='margin:12px 0 0;padding:14px 16px;border:1px solid #e1e5ed;border-radius:18px;background:#fff;box-shadow:0 4px 14px rgba(25,42,80,.045)';
    const names=route.slice(0,5).map((s,i)=>(i+1)+'. '+esc((s.enseigne||'')+' '+(s.ville||''))).join(' · ')+(route.length>5?' · +'+(route.length-5)+' autres':'');
    const hasToken=!!token();
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><b style="font-size:14px"> Tournée Apple Plans · '+esc(day)+'</b><div id="appleMapStats" style="font-size:11px;color:#667085;margin-top:4px">'+route.length+' visite'+(route.length>1?'s':'')+(km?' · ~'+km+' km géographiques':'')+'</div><div style="font-size:10.5px;color:#7b8494;margin-top:5px;line-height:1.4">'+names+'</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary" type="button" onclick="openSelectedDayRoute()">Ouvrir la tournée dans Plans</button><button class="secondary" type="button" onclick="toggleMapKitSetup()">'+(hasToken?'Réglages carte Apple':'Activer carte Apple intégrée')+'</button></div></div>'+
      '<div id="mapkitSetup" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid #eef1f5"><label style="font-size:11px;font-weight:700">Token MapKit JS Apple</label><div style="display:flex;gap:8px;margin-top:6px"><input id="mapkitTokenInput" type="password" value="'+esc(token())+'" placeholder="Token MapKit JS" style="flex:1"><button class="secondary" onclick="saveMapKitToken()">Enregistrer</button></div><div style="font-size:10.5px;color:#667085;margin-top:6px">Token public limité au domaine rednewt69.github.io. Aucun identifiant Apple ni clé privée ne doit être placé ici.</div></div>'+
      '<div id="appleRouteMap" style="display:'+(hasToken?'block':'none')+';height:360px;margin-top:12px;border-radius:16px;overflow:hidden;background:#f5f5f7"></div>';
    if(hasToken)setTimeout(renderEmbeddedMap,30)
  }
  function polish(){if(busy)return;busy=true;try{hideLegacyMap();renderCompactRoute()}finally{busy=false}}
  function hook(){if(!window.__routePolishWeek&&typeof window.renderWeek==='function'){const base=window.renderWeek;window.renderWeek=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__routePolishWeek=true}if(!window.__routePolishAll&&typeof window.renderAll==='function'){const base=window.renderAll;window.renderAll=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};window.__routePolishAll=true}}
  async function boot(){for(let i=0;i<50;i++){hook();polish();if(window.__routePolishWeek)break;await new Promise(r=>setTimeout(r,120))}document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(polish,30)},true);const root=document.querySelector('.wrap')||document.body;const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(polish,80)});obs.observe(root,{childList:true,subtree:true});polish()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();