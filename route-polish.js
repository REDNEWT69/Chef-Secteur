(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let busy=false,timer=null,mapInstance=null,leafletLoading=null,routeSeq=0,observer=null,refreshTimer=null;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function selectedDay(){try{const active=document.querySelector('#dayTabs .dayTab.active');if(active){const txt=active.textContent||'';const d=DAYS.find(x=>norm(txt).includes(norm(x)));if(d)return d}if(typeof window.selectedPlanningDay==='string'&&window.selectedPlanningDay)return window.selectedPlanningDay;return ((state.settings&&state.settings.days)||DAYS)[0]||'Lundi'}catch(e){return'Lundi'}}
  function allStores(){try{return Array.isArray(state.stores)?state.stores:[]}catch(e){return[]}}
  function canonicalStore(planned){
    if(!planned)return planned;
    const stores=allStores();
    if(planned.id!=null){const byId=stores.find(s=>s&&String(s.id)===String(planned.id));if(byId)return byId}
    const key=norm((planned.enseigne||'')+'|'+(planned.ville||''));
    if(key!=='|'){const matches=stores.filter(s=>s&&norm((s.enseigne||'')+'|'+(s.ville||''))===key);if(matches.length===1)return matches[0]}
    return planned;
  }
  function routeForDay(day){try{return ((state.plan&&state.plan[day])||[]).map(canonicalStore)}catch(e){return[]}}
  function profile(){try{return state.profile||{}}catch(e){return{}}}
  function coordValue(v,min,max){if(v==null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
  function baseCoordinate(){const p=profile(),lat=coordValue(p.baseLat,-90,90),lon=coordValue(p.baseLon,-180,180);return lat!=null&&lon!=null?{lat,lon}:null}
  function storeCoordinate(s){s=canonicalStore(s);if(!s)return null;const lat=coordValue(s.lat,-90,90),lon=coordValue(s.lon,-180,180);return lat!=null&&lon!=null?{lat,lon}:null}
  function basePoint(){const p=profile(),c=baseCoordinate();if(c)return c.lat+','+c.lon;if(p.baseAddress)return p.baseAddress;return''}
  function storePoint(s){
    s=canonicalStore(s);if(!s)return'';
    if(s.adresse||s.codePostal||s.ville)return [s.enseigne,s.adresse,s.codePostal,s.ville].filter(Boolean).join(', ');
    const c=storeCoordinate(s);if(c)return c.lat+','+c.lon;
    return s.ville||s.enseigne||'';
  }

  function appleDirectionsUrl(day){const route=routeForDay(day);if(!route.length)return'';const source=basePoint()||storePoint(route[0]),destination=storePoint(route[route.length-1]),startIndex=basePoint()?0:1;const middle=route.slice(startIndex,-1).map(storePoint).filter(Boolean);let url='https://maps.apple.com/directions?source='+encodeURIComponent(source)+'&destination='+encodeURIComponent(destination)+'&mode=driving';middle.forEach(w=>{url+='&waypoint='+encodeURIComponent(w)});return url}
  function openRoute(){const url=appleDirectionsUrl(selectedDay());if(url)window.open(url,'_blank','noopener')}
  window.showPlanMap=openRoute;window.openSelectedDayRoute=openRoute;window.storeRunnerBuildAppleRouteUrl=appleDirectionsUrl;window.storeRunnerCanonicalRouteStore=canonicalStore;

  function loadLeaflet(){if(window.L&&window.L.map)return Promise.resolve(window.L);if(leafletLoading)return leafletLoading;leafletLoading=new Promise((resolve,reject)=>{if(!document.getElementById('leaflet-css')){const css=document.createElement('link');css.id='leaflet-css';css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css)}const existing=document.getElementById('leaflet-js');if(existing){if(window.L)return resolve(window.L);existing.addEventListener('load',()=>resolve(window.L),{once:true});existing.addEventListener('error',()=>reject(new Error('Leaflet indisponible')),{once:true});return}const js=document.createElement('script');js.id='leaflet-js';js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.onload=()=>resolve(window.L);js.onerror=()=>reject(new Error('Impossible de charger la carte'));document.head.appendChild(js)}).finally(()=>{leafletLoading=null});return leafletLoading}

  function routeCoordinates(day){const route=routeForDay(day),pts=[];const base=baseCoordinate();if(base)pts.push({coord:base,label:'Départ',kind:'base'});route.forEach((s,i)=>{const c=storeCoordinate(s);if(c)pts.push({coord:c,label:(i+1)+'. '+(s.enseigne||'Magasin')+' '+(s.ville||''),kind:'store',store:s,index:i+1})});return pts}
  async function fetchRoadRoute(points){if(points.length<2)return null;const coords=points.map(p=>p.coord.lon+','+p.coord.lat).join(';');const url='https://router.project-osrm.org/route/v1/driving/'+coords+'?overview=full&geometries=geojson&steps=false';const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('Service routier indisponible');const data=await r.json();if(!data.routes||!data.routes[0])throw new Error('Aucun itinéraire routier trouvé');return data.routes[0]}
  function markerIcon(L,n,isBase){return L.divIcon({className:'chef-route-marker',html:'<div style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:'+(isBase?'#111827':'#fff')+';color:'+(isBase?'#fff':'#111827')+';border:2px solid #111827;font:800 12px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.18)">'+(isBase?'D':n)+'</div>',iconSize:[28,28],iconAnchor:[14,14]})}

  async function renderFreeMap(){const holder=document.getElementById('freeRouteMap'),stats=document.getElementById('freeMapStats');if(!holder)return;const day=selectedDay(),points=routeCoordinates(day),seq=++routeSeq;if(points.length<2){holder.style.display='none';return}holder.style.display='block';holder.innerHTML='<div style="height:100%;display:grid;place-items:center;color:#667085;font-size:12px">Calcul du vrai tracé routier…</div>';try{const L=await loadLeaflet();if(seq!==routeSeq)return;holder.innerHTML='';if(mapInstance){try{mapInstance.remove()}catch(e){}mapInstance=null}mapInstance=L.map(holder,{zoomControl:true,attributionControl:true,preferCanvas:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(mapInstance);const bounds=[];points.forEach((p,i)=>{const latlng=[p.coord.lat,p.coord.lon];bounds.push(latlng);L.marker(latlng,{icon:markerIcon(L,i,p.kind==='base')}).addTo(mapInstance).bindPopup('<b>'+esc(p.label)+'</b>'+(p.store&&p.store.adresse?'<br>'+esc(p.store.adresse):''))});let road=null;try{road=await fetchRoadRoute(points)}catch(e){console.warn('OSRM:',e)}if(seq!==routeSeq)return;if(road&&road.geometry&&road.geometry.coordinates){const line=road.geometry.coordinates.map(c=>[c[1],c[0]]);L.polyline(line,{weight:5,opacity:.78}).addTo(mapInstance);line.forEach(x=>bounds.push(x));if(stats){const km=Math.round(road.distance/1000),mins=Math.round(road.duration/60),h=Math.floor(mins/60),m=mins%60;stats.textContent='Tracé routier · '+km+' km · '+(h?h+' h ':'')+m+' min de conduite'}}else{L.polyline(points.map(p=>[p.coord.lat,p.coord.lon]),{weight:4,opacity:.45,dashArray:'8 8'}).addTo(mapInstance);if(stats)stats.textContent='Aperçu géographique · calcul routier momentanément indisponible'}if(bounds.length)mapInstance.fitBounds(bounds,{padding:[24,24],maxZoom:12});setTimeout(()=>{if(mapInstance){mapInstance.invalidateSize(true);if(bounds.length)mapInstance.fitBounds(bounds,{padding:[24,24],maxZoom:12})}},180)}catch(e){holder.innerHTML='<div style="padding:16px;color:#a33;font-size:11.5px">Carte indisponible : '+esc(e&&e.message?e.message:e)+'</div>'}}

  function hideLegacyMap(){const wrap=document.getElementById('planMapWrap');if(wrap)wrap.style.display='none';const map=document.getElementById('map');if(map)map.style.display='none';document.querySelectorAll('.applePlanTools button').forEach(btn=>{const txt=norm(btn.textContent||'');if(txt.includes('voir la carte')||txt.includes('itineraire')){btn.textContent=' Ouvrir la tournée';btn.setAttribute('onclick','openSelectedDayRoute()')}})}
  function ensureResponsiveCss(){if(document.getElementById('route-polish-responsive'))return;const s=document.createElement('style');s.id='route-polish-responsive';s.textContent='#routeCompactCard{width:100%!important;max-width:100%!important;min-width:0!important;overflow:hidden!important}#routeCompactCard>div{min-width:0!important}#freeRouteMap{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}.leaflet-container{width:100%!important;max-width:100%!important;box-sizing:border-box!important}@media(max-width:700px){#freeRouteMap{height:300px!important}#routeCompactCard{padding:12px!important;border-radius:15px!important}}';document.head.appendChild(s)}
  function renderCompactRoute(){const shell=document.querySelector('#planPanel .timelineShell');if(!shell)return;let box=document.getElementById('routeCompactCard');if(!box){box=document.createElement('div');box.id='routeCompactCard';shell.parentNode.insertBefore(box,shell.nextSibling)}const day=selectedDay(),route=routeForDay(day);if(!route.length){box.style.display='none';return}box.style.display='block';box.style.cssText='margin:12px 0 0;padding:14px 16px;border:1px solid #e1e5ed;border-radius:18px;background:#fff;box-shadow:0 4px 14px rgba(25,42,80,.045);width:100%;max-width:100%;min-width:0;overflow:hidden';const names=route.slice(0,5).map((s,i)=>(i+1)+'. '+esc((s.enseigne||'')+' '+(s.ville||''))).join(' · ')+(route.length>5?' · +'+(route.length-5)+' autres':'');box.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;min-width:0"><div style="min-width:0;flex:1"><b style="font-size:14px">🗺 Tournée du '+esc(day)+'</b><div id="freeMapStats" style="font-size:11px;color:#667085;margin-top:4px">'+route.length+' visite'+(route.length>1?'s':'')+' · calcul routier en cours</div><div style="font-size:10.5px;color:#7b8494;margin-top:5px;line-height:1.4;overflow-wrap:anywhere">'+names+'</div></div><button class="secondary" type="button" onclick="openSelectedDayRoute()"> Ouvrir la tournée dans Plans</button></div><div id="freeRouteMap" style="width:100%;max-width:100%;height:340px;margin-top:12px;border-radius:16px;overflow:hidden;background:#f5f5f7"></div><div style="font-size:9.5px;color:#98a2b3;margin-top:6px">Carte OpenStreetMap · tracé routier calculé en ligne, sans abonnement ni clé API.</div>';setTimeout(renderFreeMap,40)}
  function polish(){if(busy)return;busy=true;try{ensureResponsiveCss();hideLegacyMap();renderCompactRoute()}finally{busy=false}}
  function schedulePolish(delay){clearTimeout(refreshTimer);refreshTimer=setTimeout(polish,delay==null?40:delay)}
  function observeTimeline(){if(observer)return true;const shell=document.querySelector('#planPanel .timelineShell');if(!shell)return false;observer=new MutationObserver(function(records){for(const r of records){if((r.addedNodes&&r.addedNodes.length)||(r.removedNodes&&r.removedNodes.length)||r.type==='characterData'){schedulePolish(50);return}}});observer.observe(shell,{childList:true,subtree:true,characterData:true});return true}
  function refresh(){observeTimeline();polish()}
  function installEvents(){
    if(window.__routePolishEvents)return;
    document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))schedulePolish(40)},true);
    window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(mapInstance)mapInstance.invalidateSize(true)},120)});
    window.addEventListener('focus',()=>schedulePolish(30));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedulePolish(30)});
    window.addEventListener('chef-range-generated',()=>schedulePolish(40));
    window.__routePolishEvents=true;
  }
  function boot(){installEvents();refresh();[80,180,350,700,1400,2600].forEach(delay=>setTimeout(refresh,delay))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('load',refresh,{once:true});
})();

/* V248 — matrice de trajets routiers réelle, persistée hors de `state`.
   Le planning reste maître de ses magasins, priorités et jours. Cette couche ne décide
   rien : elle remplace seulement l'estimation 1,22 × distance à vol d'oiseau quand une
   durée/distance OSRM fraîche est disponible. Le réseau n'est sollicité qu'au moment
   d'une génération explicitement demandée par l'utilisateur ; l'ouverture de l'app ne
   change donc jamais les horaires du planning en arrière-plan. */
(function(root){
'use strict';
const KEY='store_runner_road_matrix_v248';
const SCHEMA=1;
const TTL_MS=30*86400000;
const MAX_POINTS=90;
const MAX_AGE_MS=180*86400000;
const PRIME_TIMEOUT_MS=6000;
let cache=null,index=null,inflight=null,primeTimer=null;

function db(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function number(v,min,max){if(v==null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
function point(value){if(!value)return null;const lat=number(value.lat,-90,90),lon=number(value.lon,-180,180);return lat==null||lon==null?null:{lat,lon}}
function pointKey(value){const p=point(value);return p?p.lat.toFixed(5)+','+p.lon.toFixed(5):''}
function profileBase(state){const p=state&&state.profile||{},lat=number(p.baseLat,-90,90),lon=number(p.baseLon,-180,180);return lat==null||lon==null?null:{id:'BASE',lat,lon}}
function emptyMatrix(n){return Array.from({length:n},()=>Array(n).fill(null))}
function validMatrix(rows,n){return Array.isArray(rows)&&rows.length===n&&rows.every(row=>Array.isArray(row)&&row.length===n)}
function normalize(raw){
  if(!raw||typeof raw!=='object'||Number(raw.schema)!==SCHEMA||!Array.isArray(raw.points))return null;
  const points=raw.points.map(String),n=points.length;if(n<2||n>MAX_POINTS||new Set(points).size!==n)return null;
  if(!validMatrix(raw.durations,n)||!validMatrix(raw.distances,n))return null;
  const updatedAt=Number(raw.updatedAt)||0;if(!updatedAt||Date.now()-updatedAt>MAX_AGE_MS)return null;
  return{schema:SCHEMA,updatedAt,signature:String(raw.signature||''),points,durations:raw.durations,distances:raw.distances,truncated:!!raw.truncated,totalPoints:Math.max(n,Number(raw.totalPoints)||n)};
}
function rebuildIndex(){index=new Map();if(cache)cache.points.forEach((k,i)=>index.set(k,i))}
function load(){
  if(cache)return cache;
  try{const storage=db(),raw=storage&&storage.getItem(KEY);cache=normalize(raw?JSON.parse(raw):null)}catch(e){cache=null}
  rebuildIndex();return cache;
}
function persist(next){
  cache=next;rebuildIndex();
  try{const storage=db();if(storage){storage.setItem(KEY,JSON.stringify(next));if(typeof storage.flush==='function'){const out=storage.flush();if(out&&typeof out.catch==='function')out.catch(()=>{})}}return true}catch(e){console.warn('[V248] cache routier non persisté',e);return false}
}
function haversineKm(a,b){
  const pa=point(a),pb=point(b);if(!pa||!pb)return Infinity;
  const rad=Math.PI/180,dLat=(pb.lat-pa.lat)*rad,dLon=(pb.lon-pa.lon)*rad,s1=Math.sin(dLat/2),s2=Math.sin(dLon/2),q=s1*s1+Math.cos(pa.lat*rad)*Math.cos(pb.lat*rad)*s2*s2;
  return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));
}
function fallbackDistanceKm(a,b){
  try{if(typeof root.hav==='function'){const n=Number(root.hav(a,b));if(Number.isFinite(n)&&n>=0)return n*1.22}}catch(e){}
  const n=haversineKm(a,b);return Number.isFinite(n)?n*1.22:Infinity
}
function cachedLeg(a,b){
  const ka=pointKey(a),kb=pointKey(b);if(!ka||!kb)return null;if(ka===kb)return{distanceKm:0,durationMinutes:0,source:'road'};
  const data=load();if(!data||!index||!index.has(ka)||!index.has(kb))return null;
  const i=index.get(ka),j=index.get(kb),rawD=data.distances[i]&&data.distances[i][j],rawT=data.durations[i]&&data.durations[i][j],d=rawD==null?NaN:Number(rawD),t=rawT==null?NaN:Number(rawT);
  if(!Number.isFinite(t)||t<0)return null;
  return{distanceKm:Number.isFinite(d)&&d>=0?d/1000:fallbackDistanceKm(a,b),durationMinutes:t/60,source:Number.isFinite(d)&&d>=0?'road':'road-duration'};
}
function leg(a,b){
  const exact=cachedLeg(a,b);if(exact)return exact;
  const km=fallbackDistanceKm(a,b);return{distanceKm:km,durationMinutes:Number.isFinite(km)?km/55*60:Infinity,source:'estimate'}
}
function routeMetrics(route,start){
  const rows=Array.isArray(route)?route.filter(Boolean):[];if(!rows.length)return{distanceKm:0,durationMinutes:0,roadLegs:0,estimatedLegs:0,completeRoad:true};
  const origin=start||profileBase(root.state);if(!origin)return{distanceKm:Infinity,durationMinutes:Infinity,roadLegs:0,estimatedLegs:rows.length+1,completeRoad:false};
  let km=0,minutes=0,roadLegs=0,estimatedLegs=0,previous=origin;
  for(const store of rows){const item=leg(previous,store);if(!Number.isFinite(item.distanceKm)||!Number.isFinite(item.durationMinutes))return{distanceKm:Infinity,durationMinutes:Infinity,roadLegs,estimatedLegs:estimatedLegs+1,completeRoad:false};km+=item.distanceKm;minutes+=item.durationMinutes;if(item.source==='estimate')estimatedLegs++;else roadLegs++;previous=store}
  const back=leg(previous,origin);if(!Number.isFinite(back.distanceKm)||!Number.isFinite(back.durationMinutes))return{distanceKm:Infinity,durationMinutes:Infinity,roadLegs,estimatedLegs:estimatedLegs+1,completeRoad:false};km+=back.distanceKm;minutes+=back.durationMinutes;if(back.source==='estimate')estimatedLegs++;else roadLegs++;
  return{distanceKm:km,durationMinutes:minutes,roadLegs,estimatedLegs,completeRoad:estimatedLegs===0}
}
function scopePoints(state){
  const base=profileBase(state);if(!base)return{points:[],signature:'',truncated:false,totalPoints:0};
  const seen=new Set(),stores=[];for(const s of (state&&Array.isArray(state.stores)?state.stores:[])){
    if(!s||s.active===false||(state.excluded&&state.excluded[s.id]))continue;const key=pointKey(s);if(!key||seen.has(key))continue;seen.add(key);stores.push({value:s,key,distance:fallbackDistanceKm(base,s)})
  }
  stores.sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key));
  const totalPoints=stores.length+1,truncated=totalPoints>MAX_POINTS,chosen=stores.slice(0,MAX_POINTS-1),values=[base].concat(chosen.map(x=>x.value)),keys=values.map(pointKey);
  return{points:values,keys,signature:keys.join('|'),truncated,totalPoints}
}
async function requestTable(values,withDistance,signal){
  const coords=values.map(v=>{const p=point(v);return p.lon.toFixed(5)+','+p.lat.toFixed(5)}).join(';');
  const annotations=withDistance?'distance,duration':'duration',url='https://router.project-osrm.org/table/v1/driving/'+coords+'?annotations='+annotations;
  const response=await root.fetch(url,{cache:'no-store',signal});if(!response.ok)throw new Error('OSRM HTTP '+response.status);const data=await response.json();if(!data||data.code!=='Ok'||!Array.isArray(data.durations))throw new Error('OSRM '+String(data&&data.code||'réponse invalide'));return data
}
function localRuntime(){
  try{const host=String(root.location&&root.location.hostname||'').toLowerCase();return host==='localhost'||host==='127.0.0.1'||host==='0.0.0.0'||host==='::1'}catch(e){return false}
}
async function prime(options){
  const o=options||{},scope=scopePoints(o.state||root.state),now=Date.now(),existing=load();
  if(scope.points.length<2)return{ok:false,reason:'coordinates',points:scope.points.length};
  if(!o.force&&existing&&existing.signature===scope.signature&&now-existing.updatedAt<TTL_MS)return{ok:true,cached:true,points:existing.points.length,truncated:existing.truncated};
  /* La CI et les aperçus locaux ne doivent jamais dépendre du service public OSRM.
     `force:true` reste disponible pour le test unitaire avec son faux fetch. */
  if(!o.force&&localRuntime())return{ok:false,local:true,cached:!!existing};
  if(root.navigator&&root.navigator.onLine===false)return{ok:false,offline:true,cached:!!existing};
  if(inflight)return inflight;
  inflight=(async()=>{
    let controller=null,timer=null;
    try{
      if(typeof root.AbortController==='function'){controller=new root.AbortController();timer=root.setTimeout(()=>controller.abort(),PRIME_TIMEOUT_MS)}
      let data,withDistance=true;
      try{data=await requestTable(scope.points,true,controller&&controller.signal)}catch(first){
        if(controller&&controller.signal&&controller.signal.aborted)throw first;
        data=await requestTable(scope.points,false,controller&&controller.signal);withDistance=false
      }
      const n=scope.points.length;if(!validMatrix(data.durations,n))throw new Error('Matrice de durées OSRM incomplète');
      const distances=withDistance&&validMatrix(data.distances,n)?data.distances:emptyMatrix(n);
      const next={schema:SCHEMA,updatedAt:Date.now(),signature:scope.signature,points:scope.keys,durations:data.durations,distances,truncated:scope.truncated,totalPoints:scope.totalPoints};persist(next);
      try{root.document&&root.document.dispatchEvent(new root.CustomEvent('store-runner:road-cache-updated',{detail:{points:n,truncated:scope.truncated,totalPoints:scope.totalPoints}}))}catch(e){}
      return{ok:true,cached:false,points:n,truncated:scope.truncated,totalPoints:scope.totalPoints,distanceMatrix:withDistance}
    }finally{if(timer)root.clearTimeout(timer);inflight=null}
  })().catch(error=>{console.warn('[V248] matrice routière indisponible, estimation conservée',error);return{ok:false,error:error&&error.message?error.message:String(error),cached:!!load()}});
  return inflight
}
function schedulePrime(reason,delay){
  if(primeTimer)root.clearTimeout(primeTimer);
  primeTimer=root.setTimeout(()=>{primeTimer=null;prime({reason}).catch(()=>{})},delay==null?0:delay)
}
function status(){const data=load(),now=Date.now();return data?{ready:true,points:data.points.length,totalPoints:data.totalPoints,truncated:data.truncated,updatedAt:new Date(data.updatedAt).toISOString(),ageDays:Math.round((now-data.updatedAt)/8640000)/10,stale:now-data.updatedAt>=TTL_MS}:{ready:false,points:0,totalPoints:0,truncated:false,updatedAt:null,ageDays:null,stale:true}}
function distanceKm(a,b){return leg(a,b).distanceKm}
function durationMinutes(a,b){return leg(a,b).durationMinutes}
function clear(){cache=null;index=null;try{const storage=db();if(storage)storage.removeItem(KEY)}catch(e){}return true}

function carriesPrime(fn){
  let current=fn,guard=0;
  while(typeof current==='function'&&guard++<8){if(current.__v248RoadPrime)return true;current=current.__v248Original||current.__v184Original||current.__original||null}
  return false
}
async function primeBeforePlanning(reason){try{return await prime({reason})}catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}}
function wrapFunction(owner,key,reason){
  const original=owner&&owner[key];if(typeof original!=='function'||carriesPrime(original))return false;
  const wrapped=async function(){await primeBeforePlanning(reason);return original.apply(this,arguments)};
  wrapped.__v248RoadPrime=true;wrapped.__v248Original=original;owner[key]=wrapped;return true
}
function wrapRangeButton(){
  const doc=root.document,button=doc&&doc.getElementById('generateRangeBtn');if(!button||typeof button.onclick!=='function'||carriesPrime(button.onclick))return false;
  const original=button.onclick;button.onclick=async function(){await primeBeforePlanning('range');return original.apply(this,arguments)};button.onclick.__v248RoadPrime=true;button.onclick.__v248Original=original;return true
}
function installGenerationHooks(){
  let touched=false;
  try{if(root.StoreRunnerTerrainPlanningV1)touched=wrapFunction(root.StoreRunnerTerrainPlanningV1,'generateThreeWeekSnail','three-weeks')||touched}catch(e){}
  try{touched=wrapFunction(root,'storeRunnerGenerateSingleWeek','single-week')||touched}catch(e){}
  try{touched=wrapFunction(root,'generatePlanningRange','range-api')||touched}catch(e){}
  try{touched=wrapRangeButton()||touched}catch(e){}
  return touched
}
function scheduleHooks(){[0,80,180,350,700,1400,2600].forEach(ms=>root.setTimeout(installGenerationHooks,ms))}

const api={key:KEY,pointKey,cachedLeg,leg,distanceKm,durationMinutes,routeMetrics,prime,status,clear,schedulePrime,installGenerationHooks};
root.StoreRunnerRoadMatrixV248=api;
if(typeof root.roadMinutes!=='function'){
  const roadMinutes=function(a,b){return durationMinutes(a,b)};roadMinutes.__v248RoadMatrix=true;root.roadMinutes=roadMinutes;
}
try{
  const doc=root.document;
  if(doc){doc.addEventListener('store-runner:planning-updated',installGenerationHooks);doc.addEventListener('store-runner:data-restored',installGenerationHooks);doc.addEventListener('store-runner:home-rendered',installGenerationHooks);}
  root.addEventListener&&root.addEventListener('load',installGenerationHooks,{once:true});
  scheduleHooks();
}catch(e){}
})(window);

/* V210 + V248 : le moteur de répartition géographique et l'ordonnanceur intra-journée
   partagent toujours la même métrique. Quand V248 possède un couple routier réel, il
   remplace le haversine pour le coût de route ; sinon le comportement historique reste
   intact. Les durées de conduite préfèrent la matrice V248 et gardent le même repli. */
(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
function roadApi(){try{return window.StoreRunnerRoadMatrixV248||null}catch(e){return null}}
function finiteDistance(a,b){
  try{const api=roadApi(),road=api&&typeof api.cachedLeg==='function'?api.cachedLeg(a,b):null;if(road&&Number.isFinite(Number(road.distanceKm)))return Number(road.distanceKm)}catch(e){}
  try{const n=Number(window.hav(a,b));return Number.isFinite(n)&&n>=0?n:Infinity}catch(e){return Infinity}
}
function basePoint(){try{return typeof window.baseObj==='function'?window.baseObj():null}catch(e){return null}}
function roundTripRouteKm(route,start){
  const rows=Array.isArray(route)?route:[];if(!rows.length)return 0;
  const origin=start||basePoint();if(!origin)return Infinity;
  let km=0,previous=origin;
  for(const store of rows){const d=finiteDistance(previous,store);if(!Number.isFinite(d))return Infinity;km+=d;previous=store}
  const back=finiteDistance(previous,origin);return Number.isFinite(back)?km+back:Infinity
}
function routeDriveMinutes(route,start){
  try{const api=roadApi(),metrics=api&&typeof api.routeMetrics==='function'?api.routeMetrics(route,start||basePoint()):null;if(metrics&&Number.isFinite(Number(metrics.durationMinutes)))return Number(metrics.durationMinutes)}catch(e){}
  const km=roundTripRouteKm(route,start);return Number.isFinite(km)?km*1.22/55*60:Infinity
}
function patchRouteCost(){
  const current=window.routeCost;
  if(current&&current.__v210RoundTrip){window.storeRunnerRoundTripRouteKm=roundTripRouteKm;return false}
  const wrapped=function(route,start){return roundTripRouteKm(route,start)};
  wrapped.__v210RoundTrip=true;wrapped.__v210Original=current;window.routeCost=wrapped;window.storeRunnerRoundTripRouteKm=roundTripRouteKm;return true
}
function clock(value){const p=String(value||'').split(':');return(+p[0]||0)*60+(+p[1]||0)}
function settings(){try{return(window.state&&state.settings)||{}}catch(e){return{}}}
function routeWorkMinutes(route){const s=settings(),drive=routeDriveMinutes(route);if(!Number.isFinite(drive))return Infinity;const visits=(route||[]).reduce((n,store)=>{try{return n+(typeof window.storeVisitDuration==='function'?window.storeVisitDuration(store,state):Math.max(15,Number(s.visitMinutes)||60))}catch(e){return n+Math.max(15,Number(s.visitMinutes)||60)}},0);return drive+visits}
function dayStart(day){const s=settings();return clock(day==='Samedi'?(s.saturdayStart||'08:00'):(s.startTime||'08:30'))}
function dayEnd(day){const s=settings();return clock(day==='Samedi'?(s.saturdayEnd||'12:00'):(s.endTime||'18:00'))}
function parseDate(value){const d=new Date(String(value||'')+'T12:00:00');return isNaN(d)?null:d}
function isoDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function lastVisit(store){
  try{const id=String(store&&store.id||''),v=state.visits&&state.visits[id];if(v){if(v.lastVisit)return String(v.lastVisit).slice(0,10);if(Array.isArray(v.history)&&v.history.length)return String(v.history[v.history.length-1]).slice(0,10)}}catch(e){}
  return store&&store.lastVisit?String(store.lastVisit).slice(0,10):''
}
function overdue(store,today){
  const interval=Math.max(1,Number(store&&store.intervalDays)||30),last=parseDate(lastVisit(store));if(!last)return{known:false,days:null};
  const now=parseDate(today)||new Date(),age=Math.max(0,Math.floor((now-last)/86400000));return{known:true,days:Math.max(0,age-interval)}
}
function lateness(stores,today){let never=0,sum=0,max=0,known=0,late=0;for(const store of stores||[]){const row=overdue(store,today);if(!row.known){never++;continue}known++;sum+=row.days;max=Math.max(max,row.days);if(row.days>0)late++}return{known,neverVisited:never,late,averageDays:known?Math.round(sum/known*10)/10:0,maxDays:max}}
function performanceCoverage(planned){
  const out={P1:{total:0,served:0},P2:{total:0,served:0}};
  try{
    const api=window.StoreRunnerPerformanceV190,db=window.__chefStorage||window.localStorage;if(!api||typeof api.rowForStore!=='function'||!db)return out;
    const plannedIds=new Set((planned||[]).map(s=>String(s&&s.id||'')));
    for(const store of (state.stores||[])){if(!store||store.active===false)continue;const row=api.rowForStore(db,store.id);const p=String(row&&row.prio||'');if(p!=='P1'&&p!=='P2')continue;out[p].total++;if(plannedIds.has(String(store.id)))out[p].served++}
  }catch(e){}
  return out
}
function measure(plan,options){
  options=options||{};const s=settings(),source=plan||(window.state&&state.plan)||{},days=(options.days||(Array.isArray(s.days)&&s.days.length?s.days:DAYS.slice(0,5))).filter(d=>DAYS.includes(d)),today=String(options.today||isoDate(new Date())).slice(0,10);
  let totalKm=0,driveMinutes=0,workMinutes=0,plannedStores=0;const infeasibleDays=[],details={},planned=[];
  for(const day of days){const route=Array.isArray(source[day])?source[day]:[],km=roundTripRouteKm(route),drive=routeDriveMinutes(route),work=routeWorkMinutes(route),fits=Number.isFinite(work)&&dayStart(day)+work<=dayEnd(day)+0.001;plannedStores+=route.length;planned.push(...route);if(Number.isFinite(km))totalKm+=km;else totalKm=Infinity;if(Number.isFinite(driveMinutes)&&Number.isFinite(drive))driveMinutes+=drive;else driveMinutes=Infinity;if(Number.isFinite(workMinutes)&&Number.isFinite(work))workMinutes+=work;else workMinutes=Infinity;if(!fits)infeasibleDays.push(day);details[day]={stores:route.length,km:Number.isFinite(km)?Math.round(km*10)/10:null,driveMinutes:Number.isFinite(drive)?Math.round(drive):null,workMinutes:Number.isFinite(work)?Math.round(work):null,fits}}
  const sector=(window.state&&Array.isArray(state.stores)?state.stores.filter(x=>x&&x.active!==false):[]);
  return{days:days.slice(),plannedStores,totalKm:Number.isFinite(totalKm)?Math.round(totalKm*10)/10:null,driveMinutes:Number.isFinite(driveMinutes)?Math.round(driveMinutes):null,workMinutes:Number.isFinite(workMinutes)?Math.round(workMinutes):null,infeasibleDays,infeasibleDayCount:infeasibleDays.length,plannedLateness:lateness(planned,today),sectorLateness:lateness(sector,today),performance:performanceCoverage(planned),details}
}
function compare(before,after,options){const a=measure(before,options),b=measure(after,options);return{before:a,after:b,delta:{km:a.totalKm==null||b.totalKm==null?null:Math.round((b.totalKm-a.totalKm)*10)/10,driveMinutes:a.driveMinutes==null||b.driveMinutes==null?null:b.driveMinutes-a.driveMinutes,workMinutes:a.workMinutes==null||b.workMinutes==null?null:b.workMinutes-a.workMinutes,infeasibleDays:b.infeasibleDayCount-a.infeasibleDayCount}}}
function benchmark(plan,options){const result=measure(plan,options);try{console.table(result.details);console.info('[Store Runner V248] qualité planning',result)}catch(e){}return result}
const api={roundTripRouteKm,routeDriveMinutes,measure,compare,benchmark,patchRouteCost};window.StoreRunnerPlanningQualityV210=api;patchRouteCost();
try{document.addEventListener('store-runner:data-restored',patchRouteCost);document.addEventListener('store-runner:road-cache-updated',patchRouteCost);window.addEventListener('load',patchRouteCost,{once:true})}catch(e){}
})();