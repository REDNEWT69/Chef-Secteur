(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
let installed=false,generationBusy=false;

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
    const firstSnap=archive[iso(first)],candidate={};for(const d of DAYS)candidate[d]=firstSnap&&firstSnap.plan?(firstSnap.plan[d]||[]).map(x=>(state.stores||[]).find(s=>String(s.id)===String(x.id))||x):[];
    if(!await ChefReliability.propose({plan:candidate,weekDate:iso(first),archive,range})){showStatus('Planning précédent conservé.');return}
    showStatus('Période appliquée : '+weeks+' semaines · '+totalVisits+' visites · '+unique.size+' magasins distincts'+(totalUnplaced?' · '+totalUnplaced+' visite'+(totalUnplaced>1?'s':'')+' non placée'+(totalUnplaced>1?'s':''):'')+' · '+(calendarSynced?'Agenda Google vérifié.':'Agenda Google non vérifié, données conservées utilisées.'));
    window.dispatchEvent(new CustomEvent('chef-range-generated',{detail:{start:iso(start),end:iso(end),weeks,workDays:days,uniqueStores:unique.size}}));
  }catch(e){showStatus('Erreur pendant la génération : '+(e.message||String(e)),true)}finally{generationBusy=false;if(btn)btn.disabled=false}
}

function install(){
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
window.generatePlanningRange=generateRange;
function bootInstall(){if(install())return;[80,180,350,700,1400,2600].forEach(ms=>setTimeout(install,ms))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootInstall);else bootInstall();
window.addEventListener('load',install);
window.addEventListener('focus',install);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)install()});
})();