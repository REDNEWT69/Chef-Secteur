(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()}
  function selectedDay(){
    try{
      const active=document.querySelector('#dayTabs .dayTab.active');
      if(active){
        const txt=active.textContent||'';
        const day=DAYS.find(d=>norm(txt).includes(norm(d)));
        if(day)return day;
      }
      if(typeof window.selectedPlanningDay==='string'&&window.selectedPlanningDay)return window.selectedPlanningDay;
      return ((state.settings&&state.settings.days)||DAYS)[0]||'Lundi';
    }catch(e){return'Lundi'}
  }
  function stores(){try{return Array.isArray(state.stores)?state.stores:[]}catch(e){return[]}}
  function canonicalStore(planned){
    if(!planned)return planned;
    const all=stores();
    if(planned.id!=null){
      const byId=all.find(s=>s&&String(s.id)===String(planned.id));
      if(byId)return byId;
    }
    const key=norm((planned.enseigne||'')+'|'+(planned.ville||''));
    if(key!=='|'){
      const matches=all.filter(s=>s&&norm((s.enseigne||'')+'|'+(s.ville||''))===key);
      if(matches.length===1)return matches[0];
    }
    return planned;
  }
  function routeForDay(day){
    try{return ((state.plan&&state.plan[day])||[]).map(canonicalStore)}catch(e){return[]}
  }
  function coordinatePoint(lat,lon){
    const a=Number(lat),o=Number(lon);
    if(!Number.isFinite(a)||!Number.isFinite(o)||a<-90||a>90||o<-180||o>180)return'';
    return a+','+o;
  }
  function basePoint(){
    try{
      const p=state.profile||{};
      return coordinatePoint(p.baseLat,p.baseLon)||String(p.baseAddress||'').trim();
    }catch(e){return''}
  }
  function storePoint(planned){
    const s=canonicalStore(planned);
    if(!s)return'';
    const gps=coordinatePoint(s.lat,s.lon);
    if(gps)return gps;
    return [s.enseigne,s.adresse,s.ville].filter(Boolean).join(', ');
  }
  function appleDirectionsUrl(day){
    const route=routeForDay(day);
    if(!route.length)return'';
    const base=basePoint();
    const source=base||storePoint(route[0]);
    const destination=storePoint(route[route.length-1]);
    if(!source||!destination)return'';
    const startIndex=base?0:1;
    const middle=route.slice(startIndex,-1).map(storePoint).filter(Boolean);
    let url='https://maps.apple.com/directions?source='+encodeURIComponent(source)+'&destination='+encodeURIComponent(destination)+'&mode=driving';
    middle.forEach(point=>{url+='&waypoint='+encodeURIComponent(point)});
    return url;
  }
  function openRoute(){
    const url=appleDirectionsUrl(selectedDay());
    if(url)window.open(url,'_blank','noopener');
  }

  window.storeRunnerCanonicalRouteStore=canonicalStore;
  window.storeRunnerBuildAppleRouteUrl=appleDirectionsUrl;
  window.openSelectedDayRoute=openRoute;
  window.showPlanMap=openRoute;
})();
