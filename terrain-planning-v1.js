/* Store Runner V1 — outils terrain optionnels : 3 semaines escargot + premier magasin choisi.
   Ce module ne remplace ni generateWeek ni generatePlanningRange. Il ajoute deux actions
   explicites autour du moteur V1 stable et persiste via ChefReliability. */
(function(root){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';

function copy(x){return JSON.parse(JSON.stringify(x))}
function pad(n){return String(n).padStart(2,'0')}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseISO(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return isNaN(d)?null:d}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function storeKey(s){return s&&s.id!=null&&String(s.id)?String(s.id):norm((s&&s.enseigne)||'')+'|'+norm((s&&s.ville)||'')+'|'+norm((s&&s.adresse)||'')}
function clock(v){const p=String(v||'').split(':');return (+p[0]||0)*60+(+p[1]||0)}
function db(){try{return root.__chefStorage||root.localStorage}catch(e){return root.localStorage}}
function validCoord(v){return v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))}
function validStoreGps(s){return !!(s&&validCoord(s.lat)&&validCoord(s.lon))}
function validBase(state){const p=state&&state.profile||{};return validCoord(p.baseLat)&&validCoord(p.baseLon)}
function distanceOf(store){
  if(!validStoreGps(store)||!validBase(root.state))return Infinity;
  try{const d=Number(root.havBase(store));return Number.isFinite(d)?d:Infinity}catch(e){return Infinity}
}
function visitCredit(store){
  try{if(typeof root.storeVisitCredit==='function')return Math.max(1,Number(root.storeVisitCredit(store))||1)}catch(e){}
  return 1;
}
function canonicalStore(id,state=root.state){return (state.stores||[]).find(s=>String(s.id)===String(id))||null}
function cloneStore(s){return{id:s.id,enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||'',dept:s.dept||'',lat:s.lat,lon:s.lon,freq:s.freq||'',priority:s.priority,lastVisit:s.lastVisit||'',intervalDays:s.intervalDays}}
function routeMinutes(route,state=root.state){
  if(!route||!route.length)return 0;
  const settings=state.settings||{},visit=Math.max(15,Number(settings.visitMinutes)||60);
  let km=0;
  try{
    const base=root.baseObj();
    if(!validBase(state)||route.some(s=>!validStoreGps(s)))return null;
    km+=Number(root.hav(base,route[0]))||0;
    for(let i=1;i<route.length;i++)km+=Number(root.hav(route[i-1],route[i]))||0;
    km+=Number(root.hav(route[route.length-1],base))||0;
  }catch(e){return null}
  return km*1.22/55*60+route.length*visit;
}
function dayFits(route,day,state=root.state,weekMonday){
  try{
    const hours=root.StoreOpeningHoursV1;
    if(hours&&typeof hours.routeFits==='function')return !!hours.routeFits(route,day,state,{weekMonday:weekMonday instanceof Date?weekMonday:undefined});
  }catch(e){}
  const settings=state.settings||{},start=clock(day==='Samedi'?(settings.saturdayStart||'08:00'):(settings.startTime||'08:30')),end=clock(day==='Samedi'?(settings.saturdayEnd||'12:00'):(settings.endTime||'18:00'));
  const work=routeMinutes(route,state);
  return work==null?true:start+work<=end+0.001;
}
function dateBlocked(date,state=root.state){
  const rows=(state.calendarEvents||[]).filter(e=>String(e.date||String(e.start||'').slice(0,10))===date);
  return rows.some(e=>{
    if(e&&e.inferredAway)return true;
    const t=norm((e&&e.title||'')+' '+(e&&e.location||'')+' '+(e&&e.calendar||''));
    return ['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'].some(x=>t.includes(x))||/\bparis\b/.test(t)||!!(e&&e.planningBlock&&!e.allDay);
  });
}
function appointmentDay(storeId,weekMonday,state=root.state){
  const start=iso(weekMonday),end=iso(addDays(weekMonday,7));
  const a=(state.appointments||[]).find(x=>String(x.storeId)===String(storeId)&&x.date>=start&&x.date<end);
  if(!a)return '';
  const d=parseISO(a.date);if(!d)return '';
  return DAYS[(d.getDay()||7)-1]||'';
}
function lockDay(storeId,weekKey){
  try{if(typeof root.storeRunnerLockDayForWeek==='function')return root.storeRunnerLockDayForWeek(storeId,weekKey)||''}catch(e){}
  return '';
}
function passesFilters(store,state=root.state,filterFn){
  if(typeof filterFn==='function')return !!filterFn(store,state);
  try{if(typeof root.includedByFilters==='function')return !!root.includedByFilters(store)}catch(e){}
  return true;
}
function included(store,state=root.state){
  if(!store||store.active===false||(state.excluded&&state.excluded[store.id]))return false;
  return passesFilters(store,state);
}
function summarizeTerrainPool(stores,state=root.state,filterFn){
  const out={total:0,active:0,excluded:0,filtered:0,planifiable:0,withGps:0,withoutGps:0,imposed:0};
  const ex=state&&state.excluded||{},imposed=state&&state.included||{};
  for(const store of (stores||[])){
    if(!store)continue;
    out.total++;
    if(store.active===false)continue;
    out.active++;
    if(ex[store.id]){out.excluded++;continue}
    if(!passesFilters(store,state,filterFn)){out.filtered++;continue}
    out.planifiable++;
    if(validStoreGps(store))out.withGps++;else out.withoutGps++;
    if(imposed[store.id])out.imposed++;
  }
  return out;
}
function rankStoresByDistance(stores,distanceFn){
  const fn=distanceFn||distanceOf;
  return (stores||[]).slice().sort((a,b)=>{
    const da=Number(fn(a)),dbv=Number(fn(b));
    const aa=Number.isFinite(da)?da:Infinity,bb=Number.isFinite(dbv)?dbv:Infinity;
    return aa-bb||String(a.enseigne||'').localeCompare(String(b.enseigne||''))||String(a.ville||'').localeCompare(String(b.ville||''));
  });
}
function nearestFrom(start,stores,distanceBetween){
  const rem=(stores||[]).slice(),out=[];let p=start;
  while(rem.length){let bi=0,bd=Infinity;for(let i=0;i<rem.length;i++){const d=Number(distanceBetween(p,rem[i]));if(Number.isFinite(d)&&d<bd){bd=d;bi=i}}p=rem.splice(bi,1)[0];out.push(p)}
  return out;
}
function reorderDayFromStore(route,storeId,distanceBetween){
  const rows=(route||[]).slice(),idx=rows.findIndex(s=>String(s.id)===String(storeId));
  if(idx<0)throw new Error('Ce magasin n’est plus dans cette journée.');
  if(idx===0)return rows;
  const first=rows[idx],rest=rows.filter((_,i)=>i!==idx);
  const fn=distanceBetween||((a,b)=>{try{return Number(root.hav(a,b))||Infinity}catch(e){return Infinity}});
  return [first].concat(nearestFrom(first,rest,fn));
}
function flattenPlan(plan,days=DAYS){const out=[];for(const d of days)for(const s of ((plan&&plan[d])||[]))out.push(s);return out}
function emptyPlan(){return Object.fromEntries(DAYS.map(d=>[d,[]]))}
function protectedPlanFor(weekKey,state,archive){
  const manual=state.manualWeekEdits&&state.manualWeekEdits[weekKey];
  const snap=archive&&archive[weekKey];
  if((snap&&snap.manualEdited)||manual)return copy((snap&&snap.plan)||(manual&&manual.plan)||emptyPlan());
  return null;
}
function safeDistance(a,b,distanceFn){
  try{const d=Number((distanceFn||root.hav)(a,b));return Number.isFinite(d)?d:Infinity}catch(e){return Infinity}
}
function overnightForPlan(plan,state=root.state,distanceFn){
  const profile=state&&state.profile||{},mode=profile.overnightMode||'auto',threshold=Math.max(0,Number(profile.overnightMinSaving)||80),days=((state&&state.settings&&state.settings.days)||DAYS.slice(0,5)).filter(d=>DAYS.includes(d));
  const base=validBase(state)?{lat:Number(profile.baseLat),lon:Number(profile.baseLon),adresse:profile.baseAddress||'',ville:profile.baseName||'Base'}:null;
  let best=null;
  if(base){
    for(let i=0;i<days.length-1;i++){
      const a=(plan&&plan[days[i]])||[],b=(plan&&plan[days[i+1]])||[];if(!a.length||!b.length)continue;
      const last=a[a.length-1],first=b[0],home1=safeDistance(last,base,distanceFn),home2=safeDistance(base,first,distanceFn),direct=safeDistance(last,first,distanceFn);
      if(!Number.isFinite(home1)||!Number.isFinite(home2)||!Number.isFinite(direct))continue;
      const saving=Math.max(0,home1+home2-direct),row={night:'Nuit '+days[i]+' → '+days[i+1],fromDay:days[i],toDay:days[i+1],saving,lastId:last.id,firstId:first.id};
      if(!best||row.saving>best.saving)best=row;
    }
  }
  const selected=!!best&&(mode==='mandatory'||(mode==='auto'&&best.saving>=threshold));
  const reason=mode==='never'?'disabled':!best?'no-candidate':selected?'selected':'below-threshold';
  return{mode,threshold,selected,reason,best};
}
function analyzeOvernightWeeks(weeks,state=root.state,distanceFn){return (weeks||[]).map(w=>({weekKey:w.weekKey,...overnightForPlan(w.plan,state,distanceFn)}))}
function summarizeOpeningHours(weeks,state=root.state,hoursApi=root.StoreOpeningHoursV1){
  const out={available:!!(hoursApi&&typeof hoursApi.intervalsFor==='function'),known:0,unknown:0,closed:0,uniqueUnknown:0};
  if(!out.available)return out;
  const unknown=new Set();
  for(const week of (weeks||[]))for(const day of DAYS)for(const planned of ((week.plan&&week.plan[day])||[])){
    const store=canonicalStore(planned.id,state)||planned,rows=hoursApi.intervalsFor(store,day);
    if(rows===undefined){out.unknown++;unknown.add(storeKey(store))}
    else if(!rows.length)out.closed++;
    else out.known++;
  }
  out.uniqueUnknown=unknown.size;return out;
}
function buildThreeWeekSnail(options){
  const state=options.state,first=monday(options.firstMonday),days=(options.days||[]).filter(d=>DAYS.includes(d)),target=Math.max(1,Number(options.target)||20),max=Math.max(1,Number(options.maxCreditsPerDay)||4),archive=options.archive||{},distance=options.distanceOf||(()=>Infinity),credit=options.creditOf||(()=>1),lockFor=options.lockDayForWeek||(()=>''),apptFor=options.appointmentDay||(()=>''),fits=options.dayFits||(()=>true),blocked=options.dayBlocked||(()=>false),imposed=state&&state.included||{};
  if(!days.length)throw new Error('Choisis au moins un jour travaillé.');
  const ranked=rankStoresByDistance((options.stores||[]).filter(Boolean),distance),used=new Set(),weeks=[],unknownGps=new Set(ranked.filter(s=>!validStoreGps(s)).map(storeKey));
  for(let wi=0;wi<3;wi++){
    const mon=addDays(first,wi*7),weekKey=iso(mon),protectedPlan=protectedPlanFor(weekKey,state,archive);
    if(protectedPlan){for(const s of flattenPlan(protectedPlan))used.add(storeKey(s));weeks.push({weekKey,plan:protectedPlan,manual:true,unplaced:[]});continue}
    const plan=emptyPlan(),activeDays=days.filter(day=>!blocked(iso(addDays(mon,DAYS.indexOf(day))))),weekPlaced=new Set(),unplaced=[];
    if(!activeDays.length){weeks.push({weekKey,plan,manual:false,unplaced});continue}
    const forced=[];
    for(const s of ranked){
      const ld=lockFor(s.id,weekKey),ad=apptFor(s.id,mon),day=ad||ld;
      if(day&&activeDays.includes(day))forced.push({store:s,day});
      else if(!day&&imposed[s.id])forced.push({store:s,day:''});
    }
    for(const item of forced){
      const s=item.store,k=storeKey(s);if(weekPlaced.has(k))continue;
      const candidateDays=item.day?[item.day]:activeDays;
      let placed=false;
      for(const day of candidateDays){
        const trial=plan[day].concat([s]),cost=trial.reduce((n,x)=>n+Math.max(1,Number(credit(x))||1),0);
        if(cost>max||!fits(trial,day,mon))continue;
        plan[day]=trial;weekPlaced.add(k);used.add(k);placed=true;break;
      }
      if(!placed)throw new Error((s.enseigne||'Magasin')+' '+(s.ville||'')+' ne tient pas dans la semaine malgré sa contrainte. Le planning précédent est conservé.');
    }
    for(const s of ranked){
      if(flattenPlan(plan,activeDays).length>=target)break;
      const k=storeKey(s);if(used.has(k)||weekPlaced.has(k))continue;
      let placed=false;
      for(const day of activeDays){
        const trial=plan[day].concat([s]),cost=trial.reduce((n,x)=>n+Math.max(1,Number(credit(x))||1),0);
        if(cost>max||!fits(trial,day,mon))continue;
        plan[day]=trial;weekPlaced.add(k);used.add(k);placed=true;break;
      }
      if(!placed)unplaced.push(s);
    }
    weeks.push({weekKey,plan,manual:false,unplaced});
  }
  return{weeks,uniqueStores:new Set(weeks.flatMap(w=>flattenPlan(w.plan).map(storeKey))).size,totalVisits:weeks.reduce((n,w)=>n+flattenPlan(w.plan).length,0),unknownGps:unknownGps.size};
}
async function syncCalendar(first,state=root.state){
  if(typeof root.syncGoogleCalendar!=='function')return false;
  const original=state.settings&&state.settings.weekDate,merged=new Map((state.calendarEvents||[]).map(e=>[String(e.id||'')+'|'+String(e.date||'')+'|'+String(e.start||''),e]));let ok=true;
  try{
    for(let wi=0;wi<3;wi++){
      const mon=addDays(first,wi*7),start=iso(mon),end=iso(addDays(mon,7));state.settings.weekDate=start;
      const r=await root.syncGoogleCalendar(true);if(!r||!r.ok){ok=false;break}
      for(const [key,e] of merged){const date=String(e.date||String(e.start||'').slice(0,10));if(date>=start&&date<end)merged.delete(key)}
      for(const e of state.calendarEvents||[])merged.set(String(e.id||'')+'|'+String(e.date||'')+'|'+String(e.start||''),e);
    }
  }finally{state.calendarEvents=Array.from(merged.values());state.settings.weekDate=original||iso(first);const w=root.document&&root.document.getElementById('weekDate');if(w)w.value=state.settings.weekDate;try{if(typeof root.save==='function')root.save()}catch(e){}}
  return ok;
}
function currentDays(state=root.state){return ((state.settings&&state.settings.days)||DAYS.slice(0,5)).filter(d=>DAYS.includes(d))}
function upcomingWorkMonday(now=new Date()){
  const d=new Date(now),base=monday(d),day=d.getDay();
  return day===0||day===6?addDays(base,7):base;
}
function resolveSnailStart(state=root.state,doc=root.document,now=new Date()){
  const get=id=>doc&&typeof doc.getElementById==='function'?doc.getElementById(id):null;
  const rangeStart=get('rangeStart');
  const explicitlyChosen=!!(rangeStart&&rangeStart.dataset&&rangeStart.dataset.snailUserEdited==='1');
  if(explicitlyChosen){const chosen=parseISO(String(rangeStart.value||'').trim());if(chosen)return monday(chosen)}
  return upcomingWorkMonday(now);
}
function syncPlanningControlsForSnail(state=root.state){
  const first=resolveSnailStart(state,root.document),start=iso(first),end=iso(addDays(first,20));
  if(!state.settings)state.settings={};state.settings.weekDate=start;
  const week=root.document&&root.document.getElementById('weekDate'),rangeStart=root.document&&root.document.getElementById('rangeStart'),rangeEnd=root.document&&root.document.getElementById('rangeEnd');
  if(week)week.value=start;if(rangeStart)rangeStart.value=start;if(rangeEnd)rangeEnd.value=end;
  try{if(typeof root.save==='function')root.save()}catch(e){}
  return first;
}
function ensureInsightsBox(){
  if(!root.document)return null;let box=root.document.getElementById('terrainSnailInsights');if(box)return box;
  const status=root.document.getElementById('terrainSnailStatus');if(!status||!status.parentNode)return null;
  box=root.document.createElement('div');box.id='terrainSnailInsights';box.hidden=true;box.style.cssText='margin-top:10px;padding:12px 13px;border:1px solid #e4e8ef;border-radius:15px;background:#fff;font-size:11.5px;line-height:1.45;color:#475467';status.insertAdjacentElement('afterend',box);return box;
}
function renderTerrainInsights(range){
  const box=ensureInsightsBox();if(!box)return false;
  const rows=range&&Array.isArray(range.overnightReport)?range.overnightReport:[],hours=range&&range.hoursReport;
  if(!rows.length&&!hours){box.hidden=true;box.innerHTML='';return false}
  const mode=rows[0]&&rows[0].mode||'auto',threshold=rows[0]&&Number(rows[0].threshold)||80,modeLabel=mode==='never'?'Jamais':mode==='mandatory'?'Obligatoire':'Automatique';
  let html='<div style="font-weight:850;color:#1d2939;font-size:12.5px">🌙 Découchés sur 3 semaines</div><div style="margin-top:2px;color:#667085">Mode '+modeLabel+(mode==='auto'?' · seuil '+Math.round(threshold)+' km':'')+'</div>';
  for(const row of rows){
    const d=String(row.weekKey||'').split('-'),label=d.length===3?d[2]+'/'+d[1]:row.weekKey,b=row.best,saving=b?Math.max(0,Math.round(Number(b.saving)||0)):0;
    let text='🏠 Retour domicile · aucun enchaînement exploitable';
    if(row.mode==='never'&&b)text='🏠 Découché désactivé · meilleur gain ~'+saving+' km';
    else if(row.selected&&b)text='🌙 '+b.fromDay+' → '+b.toDay+' · ~'+saving+' km économisés';
    else if(b)text='🏠 Retour domicile · meilleur gain ~'+saving+' km'+(row.mode==='auto'?' (< '+Math.round(Number(row.threshold)||0)+' km)':'');
    html+='<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eef1f5"><b style="color:#344054">Semaine du '+label+'</b><div>'+text+'</div></div>';
  }
  if(hours){
    let hoursText='Module horaires indisponible';
    if(hours.available){
      hoursText=hours.known+' passages connus · '+hours.unknown+' à vérifier';
      if(hours.uniqueUnknown)hoursText+=' sur '+hours.uniqueUnknown+' magasin'+(hours.uniqueUnknown>1?'s':'');
      if(hours.closed)hoursText+=' · '+hours.closed+' fermé'+(hours.closed>1?'s':'')+' dans une semaine protégée';
    }
    html+='<div style="margin-top:9px;padding-top:9px;border-top:1px solid #eef1f5"><b style="color:#344054">🕘 Horaires</b><div>'+hoursText+'</div></div>';
  }
  box.innerHTML=html;box.hidden=false;return true;
}
function renderStoredInsights(){try{const storage=db(),range=storage&&JSON.parse(storage.getItem(RANGE_KEY)||'null');return renderTerrainInsights(range)}catch(e){return false}}
async function generateThreeWeekSnail(){
  const state=root.state,R=root.ChefReliability,storage=db();
  if(!state||!R||typeof R.capture!=='function'||typeof R.persist!=='function')throw new Error('Protection des données indisponible.');
  const first=syncPlanningControlsForSnail(state);
  if(!validBase(state))throw new Error('Définis d’abord le GPS de ton point de départ dans Mon secteur.');
  const days=currentDays(state),report=summarizeTerrainPool(state.stores||[],state),pool=(state.stores||[]).filter(s=>included(s,state));
  if(!pool.length)throw new Error('Aucun magasin actif ne correspond aux filtres.');
  const status=root.document&&root.document.getElementById('terrainSnailStatus'),button=root.document&&root.document.getElementById('terrainSnailBtn');if(button)button.disabled=true;if(status)status.textContent='Vivier : '+report.planifiable+' planifiables · '+report.withoutGps+' GPS à vérifier · '+report.imposed+' imposés. Agenda puis génération…';
  try{
    const calendarSynced=await syncCalendar(first,state);
    const archive=JSON.parse(storage.getItem(ARCHIVE_KEY)||'{}')||{};
    const built=buildThreeWeekSnail({state,firstMonday:first,days,target:Number(state.settings.target)||20,maxCreditsPerDay:Number(state.settings.maxVisitsPerDay)||4,stores:pool,archive,distanceOf,creditOf:visitCredit,lockDayForWeek:lockDay,appointmentDay,dayBlocked:(date)=>dateBlocked(date,state),dayFits:(route,day,mon)=>dayFits(route,day,state,mon)});
    if(!built.totalVisits)throw new Error('Aucune visite ne tient dans les 3 semaines avec les réglages actuels.');
    const overnightReport=analyzeOvernightWeeks(built.weeks,state),hoursReport=summarizeOpeningHours(built.weeks,state);
    R.checkpoint('Avant génération 3 semaines escargot',storage);
    const bundle=R.capture(state,storage);
    for(const week of built.weeks){
      if(week.manual)continue;
      bundle.archive[week.weekKey]={weekMonday:week.weekKey,plan:Object.fromEntries(DAYS.map(d=>[d,(week.plan[d]||[]).map(cloneStore)])),manualEdited:false,generatedMode:'snail-distance-v1',updatedAt:new Date().toISOString()};
    }
    const firstWeek=built.weeks[0];bundle.state.settings.weekDate=firstWeek.weekKey;bundle.state.plan=Object.fromEntries(DAYS.map(d=>[d,(firstWeek.plan[d]||[]).map(s=>canonicalStore(s.id,bundle.state)||s)]));
    bundle.range={start:firstWeek.weekKey,end:iso(addDays(first,20)),weeks:3,workDays:days,uniqueStores:built.uniqueStores,totalVisits:built.totalVisits,rotation:'snail-distance-v1',calendarSynced,poolReport:report,overnightReport,hoursReport,updatedAt:new Date().toISOString()};
    R.persist(bundle,storage);if(storage&&typeof storage.flush==='function')await storage.flush();root.state=bundle.state;
    try{if(typeof root.initControls==='function')root.initControls();if(typeof root.renderAll==='function')root.renderAll()}catch(e){}
    root.dispatchEvent(new CustomEvent('chef-range-generated',{detail:{start:firstWeek.weekKey,end:bundle.range.end,weeks:3,workDays:days,uniqueStores:built.uniqueStores,mode:'snail-distance-v1'}}));
    root.document&&root.document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'three-week-snail',weekDate:firstWeek.weekKey}}));
    if(status)status.textContent='3 semaines escargot : '+built.totalVisits+' visites · '+built.uniqueStores+' magasins distincts · vivier '+report.planifiable+' planifiables'+(report.imposed?' · '+report.imposed+' imposé'+(report.imposed>1?'s':''):'')+(report.withoutGps?' · '+report.withoutGps+' GPS à vérifier':'')+(hoursReport.unknown?' · '+hoursReport.unknown+' horaires à vérifier':'')+'.';
    renderTerrainInsights(bundle.range);built.poolReport=report;built.overnightReport=overnightReport;built.hoursReport=hoursReport;
    return built;
  }finally{if(button)button.disabled=false}
}
async function startDayWithStore(storeId){
  const state=root.state,R=root.ChefReliability,storage=db();if(!state||!R)throw new Error('Protection des données indisponible.');
  let day='';for(const d of DAYS)if(((state.plan&&state.plan[d])||[]).some(s=>String(s.id)===String(storeId))){day=d;break}
  if(!day)throw new Error('Ce magasin n’est pas dans la semaine affichée.');
  const route=(state.plan[day]||[]).slice();if(route.length<2)return{day,route,unchanged:true};
  const reordered=reorderDayFromStore(route,storeId);
  if(String(reordered[0].id)!==String(storeId))throw new Error('Le magasin choisi n’a pas pu être placé en premier.');
  if(!dayFits(reordered,day,state))throw new Error('En commençant par ce magasin, la tournée dépasserait l’heure de fin ou un horaire magasin connu.');
  const weekKey=iso(monday(parseISO(state.settings&&state.settings.weekDate)||new Date()));R.checkpoint('Avant choix du premier magasin de '+day,storage);const bundle=R.capture(state,storage);
  bundle.state.plan[day]=reordered.map(s=>canonicalStore(s.id,bundle.state)||s);bundle.state.manualWeekEdits=bundle.state.manualWeekEdits||{};bundle.state.manualWeekEdits[weekKey]={at:new Date().toISOString(),plan:Object.fromEntries(DAYS.map(d=>[d,((bundle.state.plan&&bundle.state.plan[d])||[]).map(cloneStore)]))};
  bundle.archive=bundle.archive||{};if(!bundle.archive[weekKey])bundle.archive[weekKey]={weekMonday:weekKey,plan:{}};bundle.archive[weekKey].plan=Object.fromEntries(DAYS.map(d=>[d,((bundle.state.plan&&bundle.state.plan[d])||[]).map(cloneStore)]));bundle.archive[weekKey].manualEdited=true;bundle.archive[weekKey].manualEditedAt=new Date().toISOString();
  R.persist(bundle,storage);if(storage&&typeof storage.flush==='function')await storage.flush();root.state=bundle.state;try{if(typeof root.renderAll==='function')root.renderAll()}catch(e){}
  root.document&&root.document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'day-start-store',day,storeId:String(storeId),weekDate:weekKey}}));
  return{day,route:reordered,unchanged:false};
}
function showError(message){try{if(typeof root.showError==='function')root.showError(message);else root.alert(message)}catch(e){}}
function installSnailButton(){
  const host=root.document&&root.document.querySelector('#rangePlannerCard .planningChoiceBody');if(!host)return false;
  const rangeStart=root.document.getElementById('rangeStart');
  if(rangeStart&&rangeStart.dataset&&!rangeStart.dataset.snailTracked){
    rangeStart.dataset.snailTracked='1';
    const mark=()=>{rangeStart.dataset.snailUserEdited='1'};
    rangeStart.addEventListener('input',mark);rangeStart.addEventListener('change',mark);
  }
  if(root.document.getElementById('terrainSnailBtn')){ensureInsightsBox();renderStoredInsights();return true}
  const normal=root.document.getElementById('generateRangeBtn'),btn=root.document.createElement('button');btn.id='terrainSnailBtn';btn.type='button';btn.className='primary full';btn.textContent='◎ Générer 3 semaines · escargot';btn.onclick=async()=>{try{await generateThreeWeekSnail()}catch(e){showError(e.message||String(e))}};
  const status=root.document.createElement('div');status.id='terrainSnailStatus';status.className='tiny';status.style.marginTop='7px';status.textContent='Mode terrain : 3 semaines, du plus proche du départ vers le plus loin.';
  if(normal&&normal.nextSibling)host.insertBefore(btn,normal.nextSibling);else host.appendChild(btn);btn.insertAdjacentElement('afterend',status);ensureInsightsBox();renderStoredInsights();return true;
}
function installStartButton(){
  const actions=root.document&&root.document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;
  if(root.document.getElementById('startQuickStoreFirstBtn'))return true;
  const btn=root.document.createElement('button');btn.id='startQuickStoreFirstBtn';btn.type='button';btn.className='secondary';btn.textContent='▶ Commencer par ici';btn.title='Garde les mêmes visites mais place ce magasin en premier dans la journée.';btn.onclick=async()=>{const start=root.document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;if(!id)return showError('Ouvre ce magasin depuis le planning.');btn.disabled=true;try{const result=await startDayWithStore(id);if(typeof root.closeStoreQuick==='function')root.closeStoreQuick();const s=canonicalStore(id);const text=result.unchanged?'Ce magasin est déjà le premier de '+result.day+'.':(s.enseigne+' '+s.ville+' devient le premier magasin de '+result.day+'.');const st=root.document.getElementById('rangePlanStatus');if(st)st.textContent=text}catch(e){showError(e.message||String(e))}finally{btn.disabled=false}};
  const change=root.document.getElementById('changeQuickStoreBtn');actions.insertBefore(btn,change||actions.firstChild);return true;
}
function install(){installSnailButton();installStartButton()}
function boot(){install();root.document&&root.document.addEventListener('store-runner:planning-updated',()=>{install();renderStoredInsights()});root.document&&root.document.addEventListener('store-runner:data-restored',()=>{install();renderStoredInsights()})}
const api={rankStoresByDistance,reorderDayFromStore,summarizeTerrainPool,buildThreeWeekSnail,resolveSnailStart,dayFits,overnightForPlan,analyzeOvernightWeeks,summarizeOpeningHours,generateThreeWeekSnail,startDayWithStore,install};root.StoreRunnerTerrainPlanningV1=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
})(typeof window!=='undefined'?window:globalThis);
