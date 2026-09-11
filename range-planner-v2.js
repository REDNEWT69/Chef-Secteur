(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
let installed=false,generationBusy=false,replaceContext=null,replacePreview=null;

function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function storage(){try{return window.__chefStorage||localStorage}catch(e){return localStorage}}
function loadArchive(){try{return JSON.parse(storage().getItem(ARCHIVE_KEY)||'{}')||{}}catch(e){return{}}}
function cloneStore(s){return{id:s.id||'',enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||'',dept:s.dept||'',lat:s.lat,lon:s.lon,freq:s.freq||'',priority:s.priority,lastVisit:s.lastVisit||'',intervalDays:s.intervalDays}}
function showStatus(t,bad){const e=document.getElementById('rangePlanStatus');if(e){e.textContent=t;e.style.color=bad?'#b42318':'#667085'}const global=document.getElementById('statusText');if(global&&bad)global.textContent=t}
function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function storeKey(s){const b=norm((s&&s.enseigne)||''),v=norm((s&&s.ville)||''),a=norm((s&&s.adresse)||'');return (b||v||a)?b+'|'+v+'|'+a:'id|'+String((s&&s.id)||'')}
function selectedDays(){const out=[];document.querySelectorAll('[data-day]').forEach(e=>{if(e.checked&&DAYS.includes(e.value))out.push(e.value)});return out}
function readControls(){
  if(typeof readPlanningControls==='function')readPlanningControls();
  const days=selectedDays();
  if(!days.length)throw new Error('Choisis au moins un jour travaillé.');
  state.settings.days=days.slice();
  const end=document.getElementById('endTime');if(end&&end.value)state.settings.endTime=end.value;
  const max=document.getElementById('maxVisitsPerDay');if(max&&max.value)state.settings.maxVisitsPerDay=Math.max(1,Math.min(8,Number(max.value)||4));
  return days;
}
function repairStaleBrandFilter(){
  try{
    const selected=state.settings&&Array.isArray(state.settings.brands)?state.settings.brands.filter(Boolean):[];
    if(!selected.length)return false;
    const activeBrands=new Set((state.stores||[]).filter(s=>s&&s.active!==false).map(s=>String(s.enseigne||'')));
    if(selected.some(b=>activeBrands.has(String(b))))return false;
    state.settings.brands=[];
    document.querySelectorAll('[data-brand]').forEach(box=>{box.checked=true});
    if(typeof save==='function')save();
    showStatus('Les anciennes enseignes sélectionnées ne sont plus dans ce secteur. Filtre remis sur toutes les enseignes.');
    return true;
  }catch(e){return false}
}
function eligible(){
  repairStaleBrandFilter();
  const out=[],seen=new Set(),ex=state.excluded||{};
  for(const s of (state.stores||[])){
    if(!s||s.active===false||ex[s.id])continue;
    try{if(typeof includedByFilters==='function'&&!includedByFilters(s))continue}catch(e){}
    const k=storeKey(s);if(!k||seen.has(k))continue;seen.add(k);out.push(s);
  }
  return out;
}
function scoreOf(s){try{return typeof score==='function'?Number(score(s))||0:Number(s.priority)||0}catch(e){return Number(s.priority)||0}}
function forcedRank(s){const id=s&&s.id;return (state.locks&&state.locks[id]?2:0)+(state.included&&state.included[id]?1:0)}
function lockedCount(pool){return (pool||[]).reduce((n,s)=>n+((state.locks&&state.locks[s&&s.id])?1:0),0)}
function selectionNeed(pool,usable,target,max){
  const capacity=max*usable.length,locked=lockedCount(pool);
  if(locked>capacity)throw new Error('Il y a '+locked+' magasins verrouillés pour seulement '+capacity+' créneau'+(capacity>1?'x':'')+' disponible'+(capacity>1?'s':'')+'. Le planning précédent est conservé.');
  return Math.min(Math.max(Math.max(1,target),locked),capacity,pool.length);
}
function chooseStores(pool,usedKeys,lastUsedWeek,target){
  const chosen=[],keys=new Set(),add=s=>{const k=storeKey(s);if(!k||keys.has(k)||chosen.length>=target)return false;chosen.push(s);keys.add(k);return true};
  const forced=pool.filter(s=>forcedRank(s)>0).sort((a,b)=>forcedRank(b)-forcedRank(a)||scoreOf(b)-scoreOf(a));
  for(const s of forced)add(s);
  const fresh=pool.filter(s=>!keys.has(storeKey(s))&&!usedKeys.has(storeKey(s))).sort((a,b)=>scoreOf(b)-scoreOf(a));
  for(const s of fresh)add(s);
  if(chosen.length<target){
    const old=pool.filter(s=>!keys.has(storeKey(s))).sort((a,b)=>{const ka=storeKey(a),kb=storeKey(b),la=lastUsedWeek.get(ka),lb=lastUsedWeek.get(kb);if(la!==lb)return (la==null?-999:la)-(lb==null?-999:lb);return scoreOf(b)-scoreOf(a)});
    for(const s of old)add(s);
  }
  return chosen;
}
function tm(t){const p=String(t||'').split(':');return (+p[0]||0)*60+(+p[1]||0)}
function finish(route,day){
  if(!route||!route.length)return 0;
  let km=0;
  try{km+=havBase(route[0]);for(let i=1;i<route.length;i++)km+=hav(route[i-1],route[i]);km+=hav(route[route.length-1],baseObj())}catch(e){}
  const start=tm(day==='Samedi'?(state.settings.saturdayStart||'08:00'):(state.settings.startTime||'08:30'));
  return start+km*1.22/55*60+route.length*Number(state.settings.visitMinutes||60);
}
function limitFor(day){return tm(day==='Samedi'?(state.settings.saturdayEnd||'12:00'):(state.settings.endTime||'18:00'))}
function optimizeRoute(route){try{if(typeof nearestRoute==='function'&&typeof twoOpt==='function')return twoOpt(nearestRoute(route));if(typeof nearestRoute==='function')return nearestRoute(route)}catch(e){}return route.slice()}
function countPlan(plan,days){return (days||DAYS).reduce((n,d)=>n+((plan&&Array.isArray(plan[d]))?plan[d].length:0),0)}

function buildWeekUnique(chosen,days){
  const plan=Object.fromEntries(DAYS.map(d=>[d,[]]));
  if(!days.length||!chosen.length)return{plan,unplaced:chosen.slice()};
  const unique=[],seen=new Set();
  for(const s of chosen){const k=storeKey(s);if(k&&!seen.has(k)){seen.add(k);unique.push(s)}}
  unique.sort((a,b)=>{const la=Number(a.lat)||0,lb=Number(b.lat)||0;if(la!==lb)return la-lb;return (Number(a.lon)||0)-(Number(b.lon)||0)});
  const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
  const free=[];
  for(const store of unique){
    const locked=state.locks&&state.locks[store.id];
    if(!locked){free.push(store);continue}
    if(!days.includes(locked))throw new Error((store.enseigne||'Magasin')+' '+(store.ville||'')+' est verrouillé sur '+locked+', mais ce jour n’est pas disponible. Le planning précédent est conservé.');
    plan[locked].push(store);
  }
  for(const day of days){
    if(plan[day].length>max)throw new Error('Trop de magasins sont verrouillés sur '+day+' pour la capacité journalière. Le planning précédent est conservé.');
    plan[day]=optimizeRoute(plan[day]);
    if(plan[day].length&&finish(plan[day],day)>limitFor(day))throw new Error('Les magasins verrouillés sur '+day+' ne tiennent pas dans les horaires. Le planning précédent est conservé.');
  }
  const unplaced=[];
  for(const store of free){
    let placed=false;
    const candidates=days.slice().sort((a,b)=>(plan[a]||[]).length-(plan[b]||[]).length);
    for(const day of candidates){
      if((plan[day]||[]).length>=max)continue;
      const route=optimizeRoute((plan[day]||[]).concat([store]));
      if(finish(route,day)<=limitFor(day)){plan[day]=route;placed=true;break}
    }
    if(!placed)unplaced.push(store);
  }
  const global=new Set();
  for(const d of DAYS){
    const clean=[];
    for(const s of (plan[d]||[])){const k=storeKey(s);if(!k||global.has(k))continue;global.add(k);clean.push(s)}
    plan[d]=optimizeRoute(clean);
  }
  return{plan,unplaced};
}
function snapshot(mon,start,end,plan,days){const o={weekMonday:iso(mon),plan:{}};for(let i=0;i<DAYS.length;i++){const d=DAYS[i],dt=addDays(mon,i);o.plan[d]=(dt>=start&&dt<=end&&days.includes(d))?(plan[d]||[]).map(cloneStore):[]}return o}
function eventKey(e){return String((e&&e.id)||'')+'|'+String((e&&e.date)||'')+'|'+String((e&&e.start)||'')}
function eventDate(e){const raw=(e&&(e.date||e.start))||'';const m=String(raw).match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
async function syncCalendarRange(first,last){
  const original=state.settings.weekDate;let mon=new Date(first),ok=true;const merged=new Map((state.calendarEvents||[]).map(e=>[eventKey(e),e]));
  try{
    while(mon<=last){
      state.settings.weekDate=iso(mon);
      const result=await window.syncGoogleCalendar(true);if(!result||!result.ok){ok=false;break}
      const start=iso(mon),end=iso(addDays(mon,7));
      for(const [key,e] of merged){const date=eventDate(e);if(date&&date>=start&&date<end)merged.delete(key)}
      for(const e of state.calendarEvents||[])merged.set(eventKey(e),e);
      mon=addDays(mon,7);
    }
  }finally{
    state.calendarEvents=Array.from(merged.values());state.settings.weekDate=original;
    const w=document.getElementById('weekDate');if(w)w.value=original;
    if(typeof save==='function')save();
  }
  if(!ok&&!confirm('Google Agenda n’a pas pu être vérifié pour toute la période. Continuer avec les derniers événements conservés, qui peuvent être anciens ?'))throw Error('Génération annulée : reconnecte ou synchronise Google.');
  return ok;
}

function eventBlocksPlanning(e){
  if(!e)return false;
  if(e.inferredAway)return true;
  const text=norm((e.title||'')+' '+(e.location||'')+' '+(e.calendar||''));
  const hard=['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'];
  for(const word of hard)if(text.includes(word))return true;
  if(/\bparis\b/.test(text))return true;
  return !!(e.planningBlock&&!e.allDay);
}
function dateBlocked(date){try{const rows=typeof window.calendarEventsForDate==='function'?window.calendarEventsForDate(date):[];return rows.some(eventBlocksPlanning)}catch(e){return false}}
function activeDays(mon,days,start,end){return days.filter(day=>{const dt=addDays(mon,DAYS.indexOf(day));return dt>=start&&dt<=end&&!dateBlocked(iso(dt))})}

async function strictSingleWeek(){
  if(generationBusy)return{ok:false,busy:true};
  generationBusy=true;
  try{
    ChefReliability.checkpoint('Avant génération de la semaine');
    const days=readControls(),raw=parse((state.settings&&state.settings.weekDate)||iso(new Date())),mon=monday(raw||new Date());
    showStatus('Synchronisation Google Agenda puis génération de la semaine…');
    const synced=await window.syncGoogleCalendar(true);
    if((!synced||!synced.ok)&&!confirm('Google Agenda n’a pas pu être vérifié. Continuer avec les derniers événements conservés ?'))throw Error('Génération annulée.');
    const usable=activeDays(mon,days,mon,addDays(mon,6));
    if(!usable.length)throw new Error('Aucun jour disponible cette semaine. Vérifie les jours travaillés et les indisponibilités Agenda. Le planning précédent est conservé.');
    const pool=eligible();if(!pool.length)throw new Error('Aucun magasin actif ne correspond aux filtres. Ouvre « Enseignes » et vérifie la sélection.');
    const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
    const need=selectionNeed(pool,usable,Number(state.settings.target)||20,max);
    const chosen=chooseStores(pool,new Set(),new Map(),need),built=buildWeekUnique(chosen,usable),visits=countPlan(built.plan,usable);
    if(!visits)throw new Error('0 visite possible avec les réglages actuels. Vérifie l’heure de fin, la durée par magasin et ton point de départ. Le planning précédent est conservé.');
    if(!await ChefReliability.propose({plan:built.plan,weekDate:iso(mon)})){showStatus('Planning précédent conservé.');return{ok:false,cancelled:true}}
    showStatus('Semaine générée : '+visits+' visites'+(built.unplaced.length?' · '+built.unplaced.length+' non placée'+(built.unplaced.length>1?'s':'')+' faute de créneau':'')+'.');
    return{ok:true,visits,unplaced:built.unplaced.length};
  }catch(e){
    const message=e&&e.message?e.message:String(e);showStatus('Génération impossible : '+message,true);
    return{ok:false,__storeRunnerRejectedEmpty:true,error:message};
  }finally{generationBusy=false}
}

async function generateRange(){
  if(generationBusy)return;
  const se=document.getElementById('rangeStart'),ee=document.getElementById('rangeEnd'),start=parse(se&&se.value),end=parse(ee&&ee.value);
  if(!start||!end)return showStatus('Choisis une date de début et une date de fin.',true);
  if(end<start)return showStatus('La date de fin doit être après la date de début.',true);
  if(Math.round((end-start)/86400000)+1>93)return showStatus('Limite la génération à 3 mois maximum.',true);
  const btn=document.getElementById('generateRangeBtn');generationBusy=true;if(btn)btn.disabled=true;
  try{
    ChefReliability.checkpoint('Avant génération de la période');
    const days=readControls(),pool=eligible();if(!pool.length)throw new Error('Aucun magasin actif ne correspond aux filtres.');
    const target=Math.max(1,Number(state.settings.target)||20),max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4)),archive=loadArchive(),first=monday(start),last=monday(end),usedKeys=new Set(),lastUsedWeek=new Map(),unique=new Set();
    showStatus('Synchronisation Google Agenda puis génération de la période…');
    const calendarSynced=await syncCalendarRange(first,last);
    let mon=new Date(first),weekIndex=0,weeks=0,totalVisits=0,totalUnplaced=0;
    while(mon<=last){
      const usable=activeDays(mon,days,start,end);
      if(!usable.length){archive[iso(mon)]=snapshot(mon,start,end,Object.fromEntries(DAYS.map(d=>[d,[]])),days);mon=addDays(mon,7);weekIndex++;weeks++;continue}
      const need=selectionNeed(pool,usable,target,max),remaining=pool.filter(s=>!usedKeys.has(storeKey(s))).length;
      if(usedKeys.size&&remaining<need)usedKeys.clear();
      const chosen=chooseStores(pool,usedKeys,lastUsedWeek,need),built=buildWeekUnique(chosen,usable),plan=built.plan,weekSeen=new Set();
      totalUnplaced+=built.unplaced.length;
      for(const d of usable)for(const s of (plan[d]||[])){const k=storeKey(s);if(!k||weekSeen.has(k))continue;weekSeen.add(k);unique.add(k);usedKeys.add(k);lastUsedWeek.set(k,weekIndex);totalVisits++}
      archive[iso(mon)]=snapshot(mon,start,end,plan,days);mon=addDays(mon,7);weekIndex++;weeks++;await new Promise(r=>setTimeout(r,10));
    }
    if(!totalVisits)throw new Error('La période donnerait 0 visite. Rien n’a été remplacé : vérifie les jours, les horaires et les indisponibilités Agenda.');
    const range={start:iso(start),end:iso(end),weeks,workDays:days,uniqueStores:unique.size,totalVisits,rotation:'hard-unique-v6',calendarSynced,updatedAt:new Date().toISOString()};
    let displayMon=new Date(first),displaySnap=null;
    while(displayMon<=last){const snap=archive[iso(displayMon)];if(snap&&countPlan(snap.plan,DAYS)>0){displaySnap=snap;break}displayMon=addDays(displayMon,7)}
    if(!displaySnap)throw new Error('La période contient des visites mais aucune semaine affichable n’a été retrouvée. Le planning précédent est conservé.');
    const candidate={};for(const d of DAYS)candidate[d]=(displaySnap.plan[d]||[]).map(x=>(state.stores||[]).find(s=>String(s.id)===String(x.id))||x);
    if(!await ChefReliability.propose({plan:candidate,weekDate:iso(displayMon),archive,range})){showStatus('Planning précédent conservé.');return}
    showStatus('Période appliquée : '+weeks+' semaines · '+totalVisits+' visites · '+unique.size+' magasins distincts'+(totalUnplaced?' · '+totalUnplaced+' visite'+(totalUnplaced>1?'s':'')+' non placée'+(totalUnplaced>1?'s':''):'')+' · '+(calendarSynced?'Agenda Google vérifié.':'Agenda Google non vérifié, données conservées utilisées.'));
    window.dispatchEvent(new CustomEvent('chef-range-generated',{detail:{start:iso(start),end:iso(end),weeks,workDays:days,uniqueStores:unique.size}}));
  }catch(e){showStatus('Erreur pendant la génération : '+(e.message||String(e)),true)}finally{generationBusy=false;if(btn)btn.disabled=false}
}

function dayDate(day){const base=monday(parse(state.settings&&state.settings.weekDate)||new Date()),idx=DAYS.indexOf(day);return iso(addDays(base,Math.max(0,idx)))}
function plannedDayForStore(id){
  const wanted=String(id),selected=window.selectedPlanningDay;
  if(selected&&DAYS.includes(selected)&&((state.plan&&state.plan[selected])||[]).some(s=>String(s.id)===wanted))return selected;
  for(const day of DAYS)if(((state.plan&&state.plan[day])||[]).some(s=>String(s.id)===wanted))return day;
  return null;
}
function appointmentOnDay(storeId,day){const date=dayDate(day);return (state.appointments||[]).some(a=>String(a.storeId)===String(storeId)&&a.date===date)}
function distanceBetween(a,b){try{return Number(hav(a,b))||0}catch(e){const la=Number(a&&a.lat),loa=Number(a&&a.lon),lb=Number(b&&b.lat),lob=Number(b&&b.lon);if([la,loa,lb,lob].every(Number.isFinite))return Math.hypot(la-lb,loa-lob)*100;return 9999}}
function routeKm(route){if(!route||!route.length)return 0;try{let km=havBase(route[0]);for(let i=1;i<route.length;i++)km+=hav(route[i-1],route[i]);km+=hav(route[route.length-1],baseObj());return km*1.22}catch(e){return 0}}
function clockLabel(minutes){minutes=Math.max(0,Math.round(minutes));return String(Math.floor(minutes/60)%24).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')}
function usedElsewhere(storeId,day){const id=String(storeId);return DAYS.some(d=>d!==day&&((state.plan&&state.plan[d])||[]).some(s=>String(s.id)===id))}
function protectedDayIds(day,oldId){
  const out=new Set();
  for(const s of ((state.plan&&state.plan[day])||[])){
    if(String(s.id)===String(oldId))continue;
    if((state.locks&&state.locks[s.id]===day)||(state.included&&state.included[s.id])||appointmentOnDay(s.id,day))out.add(String(s.id));
  }
  return out;
}
function manualCandidatePool(anchor,day,oldId,blocked){
  const allowed=s=>s&&s.active!==false&&!(state.excluded&&state.excluded[s.id])&&String(s.id)!==String(oldId)&&!blocked.has(storeKey(s))&&!(state.locks&&state.locks[s.id]&&state.locks[s.id]!==day)&&!usedElsewhere(s.id,day);
  const primary=eligible().filter(allowed),fallback=(state.stores||[]).filter(allowed),seen=new Set(),out=[];
  for(const s of primary.concat(fallback)){const k=storeKey(s);if(!k||seen.has(k))continue;seen.add(k);out.push(s)}
  out.sort((a,b)=>distanceBetween(anchor,a)-distanceBetween(anchor,b)||scoreOf(b)-scoreOf(a)||String(a.ville||'').localeCompare(String(b.ville||'')));
  return out;
}
function buildDayReplacement(oldId,anchor,day,recenter=true){
  if(!anchor||anchor.active===false)throw new Error('Ce magasin n’est pas actif dans ton secteur.');
  if(state.excluded&&state.excluded[anchor.id])throw new Error('Ce magasin est actuellement exclu du planning.');
  if(state.locks&&state.locks[anchor.id]&&state.locks[anchor.id]!==day)throw new Error('Ce magasin est verrouillé sur '+state.locks[anchor.id]+'.');
  const current=((state.plan&&state.plan[day])||[]).slice(),oldIndex=current.findIndex(s=>String(s.id)===String(oldId));
  if(oldIndex<0)throw new Error('Ce magasin n’est plus présent dans '+day+'. Recharge le planning.');
  if(appointmentOnDay(oldId,day))throw new Error('Ce magasin a un rendez-vous enregistré '+day+'. Modifie d’abord ce rendez-vous avant de le remplacer.');
  if(usedElsewhere(anchor.id,day))throw new Error('Ce magasin est déjà planifié un autre jour de cette semaine.');
  if(current.some(s=>String(s.id)===String(anchor.id)&&String(s.id)!==String(oldId)))throw new Error('Ce magasin est déjà présent dans cette journée.');
  const protectedIds=protectedDayIds(day,oldId),protectedStores=current.filter(s=>protectedIds.has(String(s.id)));
  let route;
  if(!recenter){
    route=current.map(s=>String(s.id)===String(oldId)?anchor:s);
    route=optimizeRoute(route);
  }else{
    const target=current.length,base=[],seen=new Set(),add=s=>{const k=storeKey(s);if(!k||seen.has(k))return;seen.add(k);base.push(s)};
    add(anchor);for(const s of protectedStores)add(s);
    const blocked=new Set();for(const d of DAYS)if(d!==day)for(const s of ((state.plan&&state.plan[d])||[]))blocked.add(storeKey(s));for(const s of base)blocked.add(storeKey(s));
    const pool=manualCandidatePool(anchor,day,oldId,blocked);
    for(const s of pool){if(base.length>=target)break;add(s)}
    route=optimizeRoute(base);
    const removable=()=>route.filter(s=>String(s.id)!==String(anchor.id)&&!protectedIds.has(String(s.id)));
    while(route.length>1&&finish(route,day)>limitFor(day)&&removable().length){
      const candidates=removable().sort((a,b)=>distanceBetween(anchor,b)-distanceBetween(anchor,a));
      const removeId=String(candidates[0].id);route=optimizeRoute(route.filter(s=>String(s.id)!==removeId));
    }
  }
  const keys=route.map(storeKey);if(new Set(keys).size!==keys.length)throw new Error('Le recalcul créerait un doublon dans la journée.');
  if(finish(route,day)>limitFor(day))throw new Error('La nouvelle tournée dépasserait l’heure de fin. Choisis une zone plus proche ou moins de contraintes.');
  return{route,day,anchor,oldId:String(oldId),recenter,protectedIds:[...protectedIds],km:routeKm(route),end:clockLabel(finish(route,day)),reduced:route.length<current.length,previousCount:current.length};
}
function refreshRangeStats(bundle){
  if(!bundle.range||!bundle.archive)return;
  let total=0;const unique=new Set();
  for(const snap of Object.values(bundle.archive||{}))for(const day of DAYS)for(const s of ((snap&&snap.plan&&snap.plan[day])||[])){total++;unique.add(storeKey(s))}
  bundle.range.totalVisits=total;bundle.range.uniqueStores=unique.size;bundle.range.updatedAt=new Date().toISOString();
}
async function persistDayReplacement(preview){
  const R=window.ChefReliability,db=storage();if(!R||typeof R.capture!=='function'||typeof R.persist!=='function')throw new Error('Protection des données indisponible.');
  R.checkpoint('Avant changement manuel de '+preview.day,db);
  const bundle=R.capture(state,db),next=JSON.parse(JSON.stringify(state)),weekKey=iso(monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()));
  next.plan=next.plan||{};next.plan[preview.day]=preview.route.map(s=>(state.stores||[]).find(x=>String(x.id)===String(s.id))||s);
  bundle.state=next;
  if(bundle.archive&&bundle.archive[weekKey]){bundle.archive[weekKey].plan=bundle.archive[weekKey].plan||{};bundle.archive[weekKey].plan[preview.day]=preview.route.map(cloneStore);refreshRangeStats(bundle)}
  R.persist(bundle,db);if(db&&typeof db.flush==='function')await db.flush();window.state=bundle.state;
  if(typeof initControls==='function')initControls();if(typeof renderAll==='function')renderAll();
  document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'day-store-recenter',day:preview.day,weekDate:weekKey}}));
  return true;
}
function ensureReplaceCss(){if(document.getElementById('dayStoreReplaceCss'))return;const style=document.createElement('style');style.id='dayStoreReplaceCss';style.textContent='#dayStoreReplaceDialog{width:min(640px,calc(100% - 20px));max-height:88dvh;padding:0;overflow:hidden;border-radius:26px}#dayStoreReplaceDialog .dsrHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 18px 10px;position:sticky;top:0;background:#fff;z-index:3}#dayStoreReplaceDialog .dsrHead h2{margin:0;font-size:22px}#dayStoreReplaceDialog .dsrHead p{margin:4px 0 0;color:#667085;font-size:12px}#dayStoreReplaceDialog .dsrClose{border:0;background:#f2f3f5;border-radius:999px;width:36px;height:36px;font-size:22px}#dayStoreReplaceDialog .dsrBody{padding:6px 18px 18px;overflow:auto;max-height:calc(88dvh - 74px)}#dayStoreReplaceDialog .dsrFilters{display:grid;grid-template-columns:1fr 180px;gap:8px;position:sticky;top:0;background:#fff;padding:4px 0 10px;z-index:2}#dayStoreReplaceDialog .dsrResults{display:grid;gap:8px;max-height:45dvh;overflow:auto}#dayStoreReplaceDialog .dsrStore{display:flex;justify-content:space-between;gap:12px;text-align:left;border:1px solid #e1e5ed;background:#fff;border-radius:16px;padding:12px}#dayStoreReplaceDialog .dsrStore b{display:block;font-size:14px}#dayStoreReplaceDialog .dsrStore small{display:block;color:#667085;margin-top:3px;line-height:1.35}#dayStoreReplaceDialog .dsrMode{display:flex;gap:9px;align-items:flex-start;border:1px solid #dbe8ff;background:#f6f9ff;border-radius:16px;padding:11px;margin:10px 0}#dayStoreReplaceDialog .dsrMode input{width:20px;height:20px;margin-top:1px}#dayStoreReplaceDialog .dsrPreview{border:1px solid #e1e5ed;border-radius:18px;padding:13px;margin-top:10px;background:#fafbfc}#dayStoreReplaceDialog .dsrRoute{display:grid;gap:6px;margin:10px 0}#dayStoreReplaceDialog .dsrRoute div{background:#fff;border:1px solid #eaecf0;border-radius:12px;padding:9px 10px;font-size:12px}#dayStoreReplaceDialog .dsrButtons{display:grid;grid-template-columns:1fr 1.3fr;gap:8px;margin-top:12px}@media(max-width:560px){#dayStoreReplaceDialog .dsrFilters{grid-template-columns:1fr}#dayStoreReplaceDialog .dsrResults{max-height:40dvh}}';document.head.appendChild(style)}
function ensureReplaceDialog(){
  let dlg=document.getElementById('dayStoreReplaceDialog');if(dlg)return dlg;ensureReplaceCss();dlg=document.createElement('dialog');dlg.id='dayStoreReplaceDialog';dlg.innerHTML='<div class="dsrHead"><div><h2>Changer ce magasin</h2><p id="dsrContext"></p></div><button type="button" class="dsrClose" aria-label="Fermer">×</button></div><div class="dsrBody"><div id="dsrChooser"><div class="dsrFilters"><input id="dsrSearch" type="search" placeholder="Enseigne, ville, adresse, département"><select id="dsrBrand"><option value="">Toutes les enseignes</option></select></div><label class="dsrMode"><input id="dsrRecenter" type="checkbox" checked><span><b>Recentrer la journée</b><br><small>Remplace aussi les visites non contraintes par des magasins cohérents autour du magasin choisi. Décoche pour remplacer uniquement ce magasin.</small></span></label><div id="dsrResults" class="dsrResults"></div></div><div id="dsrPreview" class="dsrPreview" hidden></div></div>';
  document.body.appendChild(dlg);dlg.querySelector('.dsrClose').onclick=()=>dlg.close();dlg.addEventListener('cancel',()=>{replacePreview=null});dlg.querySelector('#dsrSearch').addEventListener('input',renderReplaceResults);dlg.querySelector('#dsrBrand').addEventListener('change',renderReplaceResults);dlg.querySelector('#dsrRecenter').addEventListener('change',()=>{if(replacePreview&&replacePreview.anchor)selectReplacement(replacePreview.anchor.id)});return dlg;
}
function renderReplaceResults(){
  const dlg=ensureReplaceDialog(),host=dlg.querySelector('#dsrResults'),q=norm(dlg.querySelector('#dsrSearch').value),brand=dlg.querySelector('#dsrBrand').value,oldId=replaceContext&&replaceContext.oldId;host.replaceChildren();
  const rows=(state.stores||[]).filter(s=>s&&s.active!==false&&!(state.excluded&&state.excluded[s.id])&&String(s.id)!==String(oldId)&&(!brand||String(s.enseigne)===brand)&&(!q||norm((s.enseigne||'')+' '+(s.ville||'')+' '+(s.adresse||'')+' '+(s.dept||'')).includes(q))).sort((a,b)=>String(a.enseigne||'').localeCompare(String(b.enseigne||''))||String(a.ville||'').localeCompare(String(b.ville||''))).slice(0,80);
  if(!rows.length){const p=document.createElement('p');p.textContent='Aucun magasin trouvé avec ces critères.';p.className='tiny';host.appendChild(p);return}
  for(const s of rows){const b=document.createElement('button');b.type='button';b.className='dsrStore';const left=document.createElement('span'),right=document.createElement('small');const name=document.createElement('b'),meta=document.createElement('small');name.textContent=(s.enseigne||'Magasin')+' '+(s.ville||'');meta.textContent=(s.adresse||'Adresse non renseignée')+(s.dept?' · '+s.dept:'');left.append(name,meta);try{right.textContent='~'+Math.round(havBase(s))+' km'}catch(e){right.textContent='Choisir'}b.append(left,right);b.onclick=()=>selectReplacement(s.id);host.appendChild(b)}
}
function selectReplacement(id){
  const anchor=(state.stores||[]).find(s=>String(s.id)===String(id));if(!anchor||!replaceContext)return;const dlg=ensureReplaceDialog(),recenter=dlg.querySelector('#dsrRecenter').checked,previewHost=dlg.querySelector('#dsrPreview');
  try{replacePreview=buildDayReplacement(replaceContext.oldId,anchor,replaceContext.day,recenter);previewHost.hidden=false;previewHost.replaceChildren();const h=document.createElement('h3');h.textContent=(recenter?'Nouvelle journée autour de ':'Remplacement par ')+(anchor.enseigne||'')+' '+(anchor.ville||'');const meta=document.createElement('p');meta.className='tiny';meta.textContent=replacePreview.route.length+' visite'+(replacePreview.route.length>1?'s':'')+' · ~'+Math.round(replacePreview.km)+' km · fin estimée '+replacePreview.end+(replacePreview.reduced?' · '+(replacePreview.previousCount-replacePreview.route.length)+' visite retirée pour respecter les horaires':'');const route=document.createElement('div');route.className='dsrRoute';replacePreview.route.forEach((s,i)=>{const row=document.createElement('div');row.textContent=(i+1)+'. '+(s.enseigne||'Magasin')+' '+(s.ville||'')+(replacePreview.protectedIds.includes(String(s.id))?' · conservé (contrainte)':'');route.appendChild(row)});const note=document.createElement('p');note.className='tiny';note.textContent='Seule cette journée sera modifiée. Les autres jours et les autres semaines restent inchangés.';const buttons=document.createElement('div');buttons.className='dsrButtons';const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Choisir un autre';back.onclick=()=>{previewHost.hidden=true;replacePreview=null};const apply=document.createElement('button');apply.type='button';apply.className='primary';apply.textContent='Appliquer cette journée';apply.onclick=async()=>{apply.disabled=true;try{await persistDayReplacement(replacePreview);const saved=replacePreview;dlg.close();replaceContext=null;replacePreview=null;showStatus(saved.day+' recalculé autour de '+saved.anchor.enseigne+' '+saved.anchor.ville+'.');setTimeout(()=>{if(typeof window.openStoreQuick==='function')window.openStoreQuick(saved.anchor.id,saved.day)},80)}catch(e){apply.disabled=false;if(typeof showError==='function')showError(e.message||String(e));else alert(e.message||String(e))}};buttons.append(back,apply);previewHost.append(h,meta,route,note,buttons);previewHost.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){replacePreview=null;previewHost.hidden=true;if(typeof showError==='function')showError(e.message||String(e));else alert(e.message||String(e))}
}
function openDayStoreReplacement(){
  const start=document.getElementById('srQuickStart'),oldId=start&&start.dataset&&start.dataset.srStart,day=plannedDayForStore(oldId);if(!oldId||!day){if(typeof showError==='function')showError('Ce magasin n’est pas dans la journée affichée. Ouvre un magasin directement depuis le planning.');return}
  const old=(state.stores||[]).find(s=>String(s.id)===String(oldId));if(!old)return;replaceContext={oldId:String(oldId),day};replacePreview=null;if(typeof window.closeStoreQuick==='function')window.closeStoreQuick();const dlg=ensureReplaceDialog();dlg.querySelector('#dsrContext').textContent=day+' · remplacer '+old.enseigne+' '+old.ville;dlg.querySelector('#dsrSearch').value='';dlg.querySelector('#dsrRecenter').checked=true;dlg.querySelector('#dsrPreview').hidden=true;const brand=dlg.querySelector('#dsrBrand'),brands=[...new Set((state.stores||[]).filter(s=>s&&s.active!==false).map(s=>String(s.enseigne||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b));brand.innerHTML='<option value="">Toutes les enseignes</option>';for(const value of brands){const o=document.createElement('option');o.value=value;o.textContent=value;brand.appendChild(o)}renderReplaceResults();dlg.showModal();setTimeout(()=>dlg.querySelector('#dsrSearch').focus(),60)
}
function installDayReplaceUi(){
  const actions=document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;let btn=document.getElementById('changeQuickStoreBtn');if(btn)return true;btn=document.createElement('button');btn.type='button';btn.id='changeQuickStoreBtn';btn.className='secondary';btn.textContent='⇄ Changer ce magasin';btn.onclick=openDayStoreReplacement;const full=[...actions.querySelectorAll('button')].find(b=>/Voir la fiche/i.test(b.textContent||''));actions.insertBefore(btn,full||null);ensureReplaceDialog();return true;
}

function install(){
  installDayReplaceUi();
  if(installed)return true;
  const settings=document.querySelector('#planningSettings .settingsInner'),week=document.getElementById('weekDate');if(!settings||!week)return false;
  const lab=week.previousElementSibling;if(lab&&lab.tagName==='LABEL')lab.style.display='none';week.style.display='none';
  let box=document.getElementById('rangePlannerCard');if(box)box.remove();
  const base=monday(parse(state.settings&&state.settings.weekDate)||new Date()),end=addDays(base,4);
  box=document.createElement('details');box.id='rangePlannerCard';box.className='planningChoice planningRangeDetails';
  box.innerHTML='<summary><span>Planifier plusieurs semaines</span><small>Optionnel</small></summary><div class="planningChoiceBody"><div class="formgrid"><div><label>Date de début</label><input id="rangeStart" type="date" value="'+iso(base)+'"></div><div><label>Date de fin</label><input id="rangeEnd" type="date" value="'+iso(end)+'"></div></div><button id="generateRangeBtn" class="secondary full" type="button">Générer la période</button><div id="rangePlanStatus" class="tiny" style="margin-top:9px">Pour préparer plusieurs semaines à la fois. La génération normale reste « Générer ma semaine ».</div></div>';
  const commercial=settings.querySelector('.commercialCalendar');if(commercial)settings.insertBefore(box,commercial);else settings.appendChild(box);
  document.getElementById('generateRangeBtn').onclick=generateRange;
  window.storeRunnerGenerateSingleWeek=strictSingleWeek;
  installed=true;return true;
}
function recoverInstall(){
  installDayReplaceUi();
  if(document.getElementById('rangePlannerCard'))return;
  installed=false;
  install();
}
window.generatePlanningRange=generateRange;
window.openDayStoreReplacement=openDayStoreReplacement;
function boot(){install()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('store-runner:planning-updated',recoverInstall);
document.addEventListener('store-runner:data-restored',recoverInstall);
})();