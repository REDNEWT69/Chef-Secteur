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
/* Les crédits de visite appartiennent à visit-counting.js : on consomme son API
   publique plutôt que de redéfinir les règles ou la normalisation de casse ici.
   Une enseigne à 2 crédits occupe deux unités du plafond journalier, parce qu'une
   visite Darty ou Boulanger demande 1h30 à 2h et non un créneau standard. Sans ce
   module, chaque magasin vaut 1 crédit : on retrouve exactement l'ancien comptage. */
function visitCredit(s){
  try{if(typeof window.storeVisitCredit==='function')return Math.max(1,Number(window.storeVisitCredit(s))||1)}catch(e){}
  return 1;
}
function routeCredits(route){return (route||[]).reduce((n,s)=>n+visitCredit(s),0)}
/* Magasins « posés » : une visite placée ou remplacée à la main par l'utilisateur ne
   doit jamais être déplacée, remplacée ni retirée par la génération automatique. On
   réutilise state.locks, qui porte déjà exactement cette sémantique et que le moteur
   honore depuis toujours, plutôt que d'ouvrir un second registre concurrent. Un magasin
   posé est donc un magasin verrouillé sur un jour : buildWeekUnique le place en premier,
   décompte ses crédits du plafond, et ne complète qu'avec le budget restant. */
/* Une pose est rattachée à la semaine où elle a été faite. state.locks[id] accepte donc
   deux formes, et ces trois fonctions sont le seul endroit du fichier qui les lit :
   - "Mardi" : verrou récurrent, honoré sur toutes les semaines. Forme historique, écrite
     par le sélecteur de jour de la fiche magasin. Les données existantes restent valides
     sans migration.
   - {day:"Mardi",week:"2026-09-14"} : pose datée, honorée uniquement sur la semaine dont
     le lundi vaut week. C'est la clé déjà utilisée par state.manualWeekEdits dans ce même
     fichier, pas une notation inventée pour l'occasion.
   Sans dimension temporelle, une seule pose était réappliquée aux quatre semaines d'une
   période et y consommait quatre créneaux au lieu d'un. */
function lockEntry(id,source){
  try{
    const map=source||(state&&state.locks);
    const raw=map&&map[String(id)];
    if(!raw)return null;
    if(typeof raw==='string')return DAYS.includes(raw)?{day:raw,week:''}:null;
    const day=String(raw.day||'');
    if(!DAYS.includes(day))return null;
    return{day,week:String(raw.week||'')};
  }catch(e){return null}
}
function currentWeekKey(){try{return iso(monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()))}catch(e){return ''}}
function lockDayForWeek(id,weekKey,source){
  const entry=lockEntry(id,source);
  if(!entry)return '';
  if(!entry.week)return entry.day;               // verrou récurrent : toutes les semaines
  return entry.week===String(weekKey||'')?entry.day:'';
}
function pinnedDay(id){return lockDayForWeek(id,currentWeekKey())}
function isPinnedOn(id,day){return pinnedDay(id)===day}
function pinStore(id,day){
  if(!id||!DAYS.includes(day))return false;
  if(!state.locks)state.locks={};
  state.locks[String(id)]={day,week:currentWeekKey()};
  return true;
}
function unpinStore(id){
  if(!id||!state.locks)return false;
  if(!Object.prototype.hasOwnProperty.call(state.locks,String(id)))return false;
  delete state.locks[String(id)];
  return true;
}
/* Le rang forcé dépend de la semaine construite : une pose datée sur une autre semaine ne
   doit ni réserver un créneau, ni consommer de crédits, ni passer devant le vivier frais. */
function forcedRank(s,weekKey){const id=s&&s.id;return (lockDayForWeek(id,weekKey)?2:0)+(state.included&&state.included[id]?1:0)}
function forcedCount(pool,weekKey){return (pool||[]).reduce((n,s)=>n+(forcedRank(s,weekKey)>0?1:0),0)}
function forcedCredits(pool,weekKey){return (pool||[]).reduce((n,s)=>n+(forcedRank(s,weekKey)>0?visitCredit(s):0),0)}
function selectionNeed(pool,usable,target,max,weekKey){
  /* Deux unités différentes coexistent volontairement : target reste un objectif de
     magasins, tandis que maxVisitsPerDay est un budget de crédits. On ne convertit
     donc plus la capacité en crédits en faux « nombre de magasins ». */
  const capacityCredits=max*usable.length,forced=forcedCount(pool,weekKey),forcedCost=forcedCredits(pool,weekKey);
  if(forcedCost>capacityCredits)throw new Error('Les magasins posés, imposés ou verrouillés demandent '+forcedCost+' crédit'+(forcedCost>1?'s':'')+' de visite pour seulement '+capacityCredits+' disponible'+(capacityCredits>1?'s':'')+'. Le planning précédent est conservé.');
  return{targetCount:Math.min(Math.max(Math.max(1,target),forced),pool.length),capacityCredits};
}
function chooseStores(pool,usedKeys,useCount,lastUsedWeek,targetCount,creditBudget,weekKey){
  const chosen=[],keys=new Set();let credits=0;
  const add=(s,isForced=false)=>{
    const k=storeKey(s),cost=visitCredit(s);
    if(!k||keys.has(k)||chosen.length>=targetCount)return false;
    if(!isForced&&credits+cost>creditBudget)return false;
    chosen.push(s);keys.add(k);credits+=cost;return true;
  };
  const forced=pool.filter(s=>forcedRank(s,weekKey)>0).sort((a,b)=>forcedRank(b,weekKey)-forcedRank(a,weekKey)||scoreOf(b)-scoreOf(a));
  for(const s of forced)add(s,true);
  /* Un magasin jamais réellement placé reste frais jusqu'à son premier passage.
     Le score ne départage que des magasins du même niveau de fraîcheur. */
  const fresh=pool.filter(s=>!keys.has(storeKey(s))&&!usedKeys.has(storeKey(s))).sort((a,b)=>scoreOf(b)-scoreOf(a));
  for(const s of fresh)add(s);
  /* Une fois le vivier frais épuisé pour le budget restant, équilibrer d'abord le
     nombre réel de passages, puis reprendre le moins récemment utilisé. Le score
     n'intervient qu'en dernier départage. */
  if(chosen.length<targetCount&&credits<creditBudget){
    const old=pool.filter(s=>!keys.has(storeKey(s))).sort((a,b)=>{
      const ka=storeKey(a),kb=storeKey(b),ca=useCount.get(ka)||0,cb=useCount.get(kb)||0;
      if(ca!==cb)return ca-cb;
      const la=lastUsedWeek.get(ka),lb=lastUsedWeek.get(kb);
      if(la!==lb)return (la==null?-999:la)-(lb==null?-999:lb);
      return scoreOf(b)-scoreOf(a);
    });
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

function buildWeekUnique(chosen,days,weekKey){
  const plan=Object.fromEntries(DAYS.map(d=>[d,[]]));
  if(!days.length||!chosen.length)return{plan,unplaced:chosen.slice()};
  const unique=[],seen=new Set();
  for(const s of chosen){const k=storeKey(s);if(k&&!seen.has(k)){seen.add(k);unique.push(s)}}
  /* Conserver ici l'ordre de sélection (forcé → frais → équilibrage/LRU).
     L'optimisation géographique se fait ensuite dans chaque journée ; la faire avant
     le placement pouvait remettre un magasin déjà vu devant un magasin encore frais. */
  const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
  const free=[];
  for(const store of unique){
    const locked=lockDayForWeek(store.id,weekKey);
    if(!locked){free.push(store);continue}
    if(!days.includes(locked))throw new Error((store.enseigne||'Magasin')+' '+(store.ville||'')+' est verrouillé sur '+locked+', mais ce jour n’est pas disponible. Le planning précédent est conservé.');
    plan[locked].push(store);
  }
  for(const day of days){
    const lockedCost=routeCredits(plan[day]);
    if(lockedCost>max)throw new Error('Les magasins posés ou verrouillés sur '+day+' demandent '+lockedCost+' crédit'+(lockedCost>1?'s':'')+' de visite pour un plafond de '+max+'. Libère-en un ou augmente le maximum de visites par jour. Le planning précédent est conservé.');
    plan[day]=optimizeRoute(plan[day]);
    if(plan[day].length&&finish(plan[day],day)>limitFor(day))throw new Error('Les magasins verrouillés sur '+day+' ne tiennent pas dans les horaires. Le planning précédent est conservé.');
  }
  const unplaced=[];
  for(const store of free){
    let placed=false;
    /* Le plafond journalier est un budget de crédits, pas un nombre de magasins : sans
       cela une journée à 4 pouvait recevoir 2 Darty et 2 Boulanger, soit 8 crédits. */
    const cost=visitCredit(store);
    const candidates=days.slice().sort((a,b)=>routeCredits(plan[a])-routeCredits(plan[b]));
    for(const day of candidates){
      if(routeCredits(plan[day])+cost>max)continue;
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
function ensureForcedPlaced(built,weekKey){
  const blocked=((built&&built.unplaced)||[]).filter(s=>forcedRank(s,weekKey)>0);
  if(!blocked.length)return;
  const plural=blocked.length>1;
  throw new Error(blocked.length+' magasin'+(plural?'s':'')+' imposé'+(plural?'s':'')+' ou verrouillé'+(plural?'s':'')+' ne '+(plural?'tiennent':'tient')+' pas dans les horaires disponibles. Le planning précédent est conservé.');
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
    const days=readControls(),raw=parse((state.settings&&state.settings.weekDate)||iso(new Date())),mon=monday(raw||new Date());
    const weekKey=iso(mon),archived=loadArchive()[weekKey],manualState=!!(state.manualWeekEdits&&state.manualWeekEdits[weekKey]);
    if((archived&&archived.manualEdited)||manualState){
      const visits=countPlan(state.plan,DAYS),credits=DAYS.reduce((n,d)=>n+routeCredits((state.plan&&state.plan[d])||[]),0);
      showStatus('Semaine modifiée manuellement : tes magasins sont conservés. La génération automatique n’a rien changé.');
      return{ok:true,preservedManual:true,visits,credits};
    }
    ChefReliability.checkpoint('Avant génération de la semaine');
    showStatus('Synchronisation Google Agenda puis génération de la semaine…');
    const synced=await window.syncGoogleCalendar(true);
    if((!synced||!synced.ok)&&!confirm('Google Agenda n’a pas pu être vérifié. Continuer avec les derniers événements conservés ?'))throw Error('Génération annulée.');
    const usable=activeDays(mon,days,mon,addDays(mon,6));
    if(!usable.length)throw new Error('Aucun jour disponible cette semaine. Vérifie les jours travaillés et les indisponibilités Agenda. Le planning précédent est conservé.');
    const pool=eligible();if(!pool.length)throw new Error('Aucun magasin actif ne correspond aux filtres. Ouvre « Enseignes » et vérifie la sélection.');
    const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
    const limits=selectionNeed(pool,usable,Number(state.settings.target)||20,max,weekKey);
    const chosen=chooseStores(pool,new Set(),new Map(),new Map(),limits.targetCount,limits.capacityCredits,weekKey),built=buildWeekUnique(chosen,usable,weekKey);ensureForcedPlaced(built,weekKey);const visits=countPlan(built.plan,usable);
    const credits=usable.reduce((n,d)=>n+routeCredits(built.plan[d]),0);
    if(!visits)throw new Error('0 visite possible avec les réglages actuels. Vérifie l’heure de fin, la durée par magasin et ton point de départ. Le planning précédent est conservé.');
    if(!await ChefReliability.propose({plan:built.plan,weekDate:iso(mon)})){showStatus('Planning précédent conservé.');return{ok:false,cancelled:true}}
    showStatus('Semaine générée : '+visits+' visites · '+credits+' crédit'+(credits>1?'s':'')+' de visite'+(built.unplaced.length?' · '+built.unplaced.length+' non placée'+(built.unplaced.length>1?'s':'')+' faute de créneau':'')+'.');
    return{ok:true,visits,credits,unplaced:built.unplaced.length};
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
    const target=Math.max(1,Number(state.settings.target)||20),max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4)),archive=loadArchive(),first=monday(start),last=monday(end),usedKeys=new Set(),useCount=new Map(),lastUsedWeek=new Map(),unique=new Set();
    showStatus('Synchronisation Google Agenda puis génération de la période…');
    const calendarSynced=await syncCalendarRange(first,last);
    let mon=new Date(first),weekIndex=0,weeks=0,totalVisits=0,totalCredits=0,totalUnplaced=0;
    while(mon<=last){
      const weekKey=iso(mon),archived=archive[weekKey],manualEntry=state.manualWeekEdits&&state.manualWeekEdits[weekKey],manualState=!!manualEntry;
      if((archived&&archived.manualEdited)||manualState){
        const protectedPlan=(archived&&archived.plan)||(manualEntry&&manualEntry.plan)||{};
        if(!archive[weekKey])archive[weekKey]={weekMonday:weekKey,plan:Object.fromEntries(DAYS.map(d=>[d,((protectedPlan&&protectedPlan[d])||[]).map(cloneStore)])),manualEdited:true,manualEditedAt:(manualEntry&&manualEntry.at)||new Date().toISOString()};
        const weekSeen=new Set();
        for(const d of DAYS)for(const s of ((protectedPlan&&protectedPlan[d])||[])){
          const k=storeKey(s);if(!k||weekSeen.has(k))continue;weekSeen.add(k);unique.add(k);usedKeys.add(k);useCount.set(k,(useCount.get(k)||0)+1);lastUsedWeek.set(k,weekIndex);totalVisits++;totalCredits+=visitCredit(s);
        }
        mon=addDays(mon,7);weekIndex++;weeks++;await new Promise(r=>setTimeout(r,10));continue;
      }
      const usable=activeDays(mon,days,start,end);
      if(!usable.length){archive[iso(mon)]=snapshot(mon,start,end,Object.fromEntries(DAYS.map(d=>[d,[]])),days);mon=addDays(mon,7);weekIndex++;weeks++;continue}
      const limits=selectionNeed(pool,usable,target,max,weekKey);
      const chosen=chooseStores(pool,usedKeys,useCount,lastUsedWeek,limits.targetCount,limits.capacityCredits,weekKey),built=buildWeekUnique(chosen,usable,weekKey);ensureForcedPlaced(built,weekKey);const plan=built.plan,weekSeen=new Set();
      totalUnplaced+=built.unplaced.length;
      for(const d of usable)for(const s of (plan[d]||[])){const k=storeKey(s);if(!k||weekSeen.has(k))continue;weekSeen.add(k);unique.add(k);usedKeys.add(k);useCount.set(k,(useCount.get(k)||0)+1);lastUsedWeek.set(k,weekIndex);totalVisits++;totalCredits+=visitCredit(s)}
      archive[iso(mon)]=snapshot(mon,start,end,plan,days);mon=addDays(mon,7);weekIndex++;weeks++;await new Promise(r=>setTimeout(r,10));
    }
    if(!totalVisits)throw new Error('La période donnerait 0 visite. Rien n’a été remplacé : vérifie les jours, les horaires et les indisponibilités Agenda.');
    const range={start:iso(start),end:iso(end),weeks,workDays:days,uniqueStores:unique.size,totalVisits,rotation:'balanced-lru-credit-v8',calendarSynced,updatedAt:new Date().toISOString()};
    let displayMon=new Date(first),displaySnap=null;
    while(displayMon<=last){const snap=archive[iso(displayMon)];if(snap&&countPlan(snap.plan,DAYS)>0){displaySnap=snap;break}displayMon=addDays(displayMon,7)}
    if(!displaySnap)throw new Error('La période contient des visites mais aucune semaine affichable n’a été retrouvée. Le planning précédent est conservé.');
    const candidate={};for(const d of DAYS)candidate[d]=(displaySnap.plan[d]||[]).map(x=>(state.stores||[]).find(s=>String(s.id)===String(x.id))||x);
    if(!await ChefReliability.propose({plan:candidate,weekDate:iso(displayMon),archive,range})){showStatus('Planning précédent conservé.');return}
    showStatus('Période appliquée : '+weeks+' semaines · '+totalVisits+' visites · '+totalCredits+' crédit'+(totalCredits>1?'s':'')+' de visite · '+unique.size+' magasins distincts'+(totalUnplaced?' · '+totalUnplaced+' visite'+(totalUnplaced>1?'s':'')+' non placée'+(totalUnplaced>1?'s':''):'')+' · '+(calendarSynced?'Agenda Google vérifié.':'Agenda Google non vérifié, données conservées utilisées.'));
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
function plannedOtherDayForStore(id,day){
  const wanted=String(id);
  for(const d of DAYS)if(d!==day&&((state.plan&&state.plan[d])||[]).some(s=>String(s.id)===wanted))return d;
  return null;
}
function appointmentOnDay(storeId,day){const date=dayDate(day);return (state.appointments||[]).some(a=>String(a.storeId)===String(storeId)&&a.date===date)}
function appointmentDayForStore(storeId){for(const day of DAYS)if(appointmentOnDay(storeId,day))return day;return null}
function distanceBetween(a,b){try{return Number(hav(a,b))||0}catch(e){const la=Number(a&&a.lat),loa=Number(a&&a.lon),lb=Number(b&&b.lat),lob=Number(b&&b.lon);if([la,loa,lb,lob].every(Number.isFinite))return Math.hypot(la-lb,loa-lob)*100;return 9999}}
function routeKm(route){if(!route||!route.length)return 0;try{let km=havBase(route[0]);for(let i=1;i<route.length;i++)km+=hav(route[i-1],route[i]);km+=hav(route[route.length-1],baseObj());return km*1.22}catch(e){return 0}}
function clockLabel(minutes){minutes=Math.max(0,Math.round(minutes));return String(Math.floor(minutes/60)%24).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')}
function usedElsewhere(storeId,day){const id=String(storeId);return DAYS.some(d=>d!==day&&((state.plan&&state.plan[d])||[]).some(s=>String(s.id)===id))}
function protectedDayIds(day,oldId){
  const out=new Set();
  for(const s of ((state.plan&&state.plan[day])||[])){
    if(String(s.id)===String(oldId))continue;
    if(isPinnedOn(s.id,day)||(state.included&&state.included[s.id])||appointmentOnDay(s.id,day))out.add(String(s.id));
  }
  return out;
}
function manualCandidatePool(anchor,day,oldId,blocked){
  const allowed=s=>s&&s.active!==false&&!(state.excluded&&state.excluded[s.id])&&String(s.id)!==String(oldId)&&!blocked.has(storeKey(s))&&!(pinnedDay(s.id)&&!isPinnedOn(s.id,day))&&!usedElsewhere(s.id,day);
  const primary=eligible().filter(allowed),fallback=(state.stores||[]).filter(allowed),seen=new Set(),out=[];
  for(const s of primary.concat(fallback)){const k=storeKey(s);if(!k||seen.has(k))continue;seen.add(k);out.push(s)}
  out.sort((a,b)=>distanceBetween(anchor,a)-distanceBetween(anchor,b)||scoreOf(b)-scoreOf(a)||String(a.ville||'').localeCompare(String(b.ville||'')));
  return out;
}
function sourceFitDistance(route,s){
  if(route&&route.length)return route.reduce((best,x)=>Math.min(best,distanceBetween(x,s)),Infinity);
  try{return Number(havBase(s))||9999}catch(e){return 9999}
}
function buildSourceAdjustment(sourceDay,anchor,targetDay,oldId,targetRoute){
  if(!sourceDay)return null;
  if(appointmentOnDay(anchor.id,sourceDay))throw new Error((anchor.enseigne||'Ce magasin')+' '+(anchor.ville||'')+' a un rendez-vous '+sourceDay+' : déplace d’abord ce rendez-vous avant de changer le jour.');
  const sourceCurrent=((state.plan&&state.plan[sourceDay])||[]).slice(),previousCount=sourceCurrent.length;
  let route=optimizeRoute(sourceCurrent.filter(s=>String(s.id)!==String(anchor.id)));
  const occupied=new Set();
  for(const d of DAYS){
    const rows=d===targetDay?(targetRoute||[]):d===sourceDay?route:((state.plan&&state.plan[d])||[]);
    for(const s of rows){const k=storeKey(s);if(k)occupied.add(k)}
  }
  const oldStore=(state.stores||[]).find(s=>String(s.id)===String(oldId));
  const allowed=s=>{
    if(!s||s.active===false||(state.excluded&&state.excluded[s.id])||String(s.id)===String(anchor.id))return false;
    const k=storeKey(s);if(!k||occupied.has(k))return false;
    const lock=pinnedDay(s.id);
    if(lock&&!(String(s.id)===String(oldId)&&lock===targetDay)&&lock!==sourceDay)return false;
    const appt=appointmentDayForStore(s.id);if(appt&&appt!==sourceDay)return false;
    return true;
  };
  const candidates=[],seen=new Set(),push=s=>{if(!allowed(s))return;const k=storeKey(s);if(seen.has(k))return;seen.add(k);candidates.push(s)};
  push(oldStore);
  for(const s of (state.stores||[]))push(s);
  candidates.sort((a,b)=>{
    if(oldStore){if(String(a.id)===String(oldStore.id)&&String(b.id)!==String(oldStore.id))return-1;if(String(b.id)===String(oldStore.id)&&String(a.id)!==String(oldStore.id))return 1}
    return sourceFitDistance(route,a)-sourceFitDistance(route,b)||scoreOf(b)-scoreOf(a)||String(a.ville||'').localeCompare(String(b.ville||''));
  });
  const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
  for(const candidate of candidates){
    if(route.length>=previousCount)break;
    const trial=optimizeRoute(route.concat([candidate]));
    if(routeCredits(trial)>max||finish(trial,sourceDay)>limitFor(sourceDay))continue;
    route=trial;occupied.add(storeKey(candidate));
  }
  route=optimizeRoute(route);
  return{sourceDay,sourceRoute:route,sourcePreviousCount:previousCount,sourceReduced:route.length<previousCount,sourceKm:routeKm(route),sourceEnd:route.length?clockLabel(finish(route,sourceDay)):'—'};
}
function buildDayReplacement(oldId,anchor,day,recenter=true){
  if(!anchor||anchor.active===false)throw new Error('Ce magasin n’est pas actif dans ton secteur.');
  if(state.excluded&&state.excluded[anchor.id])throw new Error('Ce magasin est actuellement exclu du planning.');
  const sourceDay=plannedOtherDayForStore(anchor.id,day),anchorLock=pinnedDay(anchor.id);
  if(anchorLock&&anchorLock!==day&&anchorLock!==sourceDay)throw new Error('Ce magasin est verrouillé sur '+anchorLock+'.');
  const current=((state.plan&&state.plan[day])||[]).slice(),oldIndex=current.findIndex(s=>String(s.id)===String(oldId));
  if(oldIndex<0)throw new Error('Ce magasin n’est plus présent dans '+day+'. Recharge le planning.');
  if(appointmentOnDay(oldId,day))throw new Error('Ce magasin a un rendez-vous enregistré '+day+'. Modifie d’abord ce rendez-vous avant de le remplacer.');
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
  const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
  if(routeCredits(route)>max)throw new Error('La nouvelle journée dépasserait le plafond de '+max+' crédits de visite.');
  if(finish(route,day)>limitFor(day))throw new Error('La nouvelle tournée dépasserait l’heure de fin. Choisis une zone plus proche ou moins de contraintes.');
  const source=buildSourceAdjustment(sourceDay,anchor,day,oldId,route);
  return Object.assign({route,day,anchor,oldId:String(oldId),recenter,protectedIds:[...protectedIds],km:routeKm(route),end:clockLabel(finish(route,day)),reduced:route.length<current.length,previousCount:current.length},source||{});
}
function refreshRangeStats(bundle){
  if(!bundle.range||!bundle.archive)return;
  let total=0;const unique=new Set();
  for(const snap of Object.values(bundle.archive||{}))for(const day of DAYS)for(const s of ((snap&&snap.plan&&snap.plan[day])||[])){total++;unique.add(storeKey(s))}
  bundle.range.totalVisits=total;bundle.range.uniqueStores=unique.size;bundle.range.updatedAt=new Date().toISOString();
}
async function persistDayReplacement(preview){
  const R=window.ChefReliability,db=storage();if(!R||typeof R.capture!=='function'||typeof R.persist!=='function')throw new Error('Protection des données indisponible.');
  R.checkpoint(preview.sourceDay?'Avant déplacement manuel de '+preview.sourceDay+' vers '+preview.day:'Avant changement manuel de '+preview.day,db);
  const bundle=R.capture(state,db),next=JSON.parse(JSON.stringify(state)),weekKey=iso(monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()));
  next.plan=next.plan||{};next.plan[preview.day]=preview.route.map(s=>(state.stores||[]).find(x=>String(x.id)===String(s.id))||s);
  if(preview.sourceDay&&Array.isArray(preview.sourceRoute))next.plan[preview.sourceDay]=preview.sourceRoute.map(s=>(state.stores||[]).find(x=>String(x.id)===String(s.id))||s);
  next.manualWeekEdits=next.manualWeekEdits||{};next.manualWeekEdits[weekKey]={at:new Date().toISOString(),plan:Object.fromEntries(DAYS.map(d=>[d,((next.plan&&next.plan[d])||[]).map(cloneStore)]))};
  /* Le magasin choisi à la main est posé sur sa nouvelle journée. S'il venait d'un autre
     jour, son verrou suit le déplacement. Le magasin remplacé est libéré ; les visites
     ajoutées automatiquement pour combler l'ancien jour restent libres. */
  next.locks=next.locks||{};
  if(preview.anchor&&preview.anchor.id)next.locks[String(preview.anchor.id)]={day:preview.day,week:weekKey};
  if(preview.oldId&&lockDayForWeek(preview.oldId,weekKey,next.locks)===preview.day)delete next.locks[String(preview.oldId)];
  bundle.state=next;
  bundle.archive=bundle.archive||loadArchive()||{};
  if(!bundle.archive[weekKey]){
    const plan={};for(const d of DAYS)plan[d]=((next.plan&&next.plan[d])||[]).map(cloneStore);
    bundle.archive[weekKey]={weekMonday:weekKey,plan};
  }
  bundle.archive[weekKey].plan=bundle.archive[weekKey].plan||{};
  bundle.archive[weekKey].plan[preview.day]=preview.route.map(cloneStore);
  if(preview.sourceDay&&Array.isArray(preview.sourceRoute))bundle.archive[weekKey].plan[preview.sourceDay]=preview.sourceRoute.map(cloneStore);
  bundle.archive[weekKey].manualEdited=true;
  bundle.archive[weekKey].manualEditedAt=new Date().toISOString();
  refreshRangeStats(bundle);
  R.persist(bundle,db);if(db&&typeof db.flush==='function')await db.flush();window.state=bundle.state;
  if(typeof initControls==='function')initControls();if(typeof renderAll==='function')renderAll();
  document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:preview.sourceDay?'store-moved-between-days':'day-store-recenter',day:preview.day,sourceDay:preview.sourceDay||null,weekDate:weekKey}}));
  return true;
}
function ensureReplaceCss(){if(document.getElementById('dayStoreReplaceCss'))return;const style=document.createElement('style');style.id='dayStoreReplaceCss';style.textContent='#dayStoreReplaceDialog{width:min(640px,calc(100% - 20px));max-height:88dvh;padding:0;overflow:hidden;border-radius:26px}#dayStoreReplaceDialog .dsrHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 18px 10px;position:sticky;top:0;background:#fff;z-index:3}#dayStoreReplaceDialog .dsrHead h2{margin:0;font-size:22px}#dayStoreReplaceDialog .dsrHead p{margin:4px 0 0;color:#667085;font-size:12px}#dayStoreReplaceDialog .dsrClose{border:0;background:#f2f3f5;border-radius:999px;width:36px;height:36px;font-size:22px}#dayStoreReplaceDialog .dsrBody{padding:6px 18px 18px;overflow:auto;max-height:calc(88dvh - 74px)}#dayStoreReplaceDialog .dsrFilters{display:grid;grid-template-columns:1fr 180px;gap:8px;position:sticky;top:0;background:#fff;padding:4px 0 10px;z-index:2}#dayStoreReplaceDialog .dsrResults{display:grid;gap:8px;max-height:45dvh;overflow:auto}#dayStoreReplaceDialog .dsrStore{display:flex;justify-content:space-between;gap:12px;text-align:left;border:1px solid #e1e5ed;background:#fff;border-radius:16px;padding:12px}#dayStoreReplaceDialog .dsrStore b{display:block;font-size:14px}#dayStoreReplaceDialog .dsrStore small{display:block;color:#667085;margin-top:3px;line-height:1.35}#dayStoreReplaceDialog .dsrMove{font-weight:800;color:#0b62d6!important}#dayStoreReplaceDialog .dsrMode{display:flex;gap:9px;align-items:flex-start;border:1px solid #dbe8ff;background:#f6f9ff;border-radius:16px;padding:11px;margin:10px 0}#dayStoreReplaceDialog .dsrMode input{width:20px;height:20px;margin-top:1px}#dayStoreReplaceDialog .dsrPreview{border:1px solid #e1e5ed;border-radius:18px;padding:13px;margin-top:10px;background:#fafbfc}#dayStoreReplaceDialog .dsrRoute{display:grid;gap:6px;margin:10px 0}#dayStoreReplaceDialog .dsrRoute div{background:#fff;border:1px solid #eaecf0;border-radius:12px;padding:9px 10px;font-size:12px}#dayStoreReplaceDialog .dsrButtons{display:grid;grid-template-columns:1fr 1.3fr;gap:8px;margin-top:12px}@media(max-width:560px){#dayStoreReplaceDialog .dsrFilters{grid-template-columns:1fr}#dayStoreReplaceDialog .dsrResults{max-height:40dvh}}';document.head.appendChild(style)}
function ensureReplaceDialog(){
  let dlg=document.getElementById('dayStoreReplaceDialog');if(dlg)return dlg;ensureReplaceCss();dlg=document.createElement('dialog');dlg.id='dayStoreReplaceDialog';dlg.innerHTML='<div class="dsrHead"><div><h2>Changer ce magasin</h2><p id="dsrContext"></p></div><button type="button" class="dsrClose" aria-label="Fermer">×</button></div><div class="dsrBody"><div id="dsrChooser"><div class="dsrFilters"><input id="dsrSearch" type="search" placeholder="Enseigne, ville, adresse, département"><select id="dsrBrand"><option value="">Toutes les enseignes</option></select></div><label class="dsrMode"><input id="dsrRecenter" type="checkbox" checked><span><b>Recentrer la journée</b><br><small>Remplace aussi les visites non contraintes par des magasins cohérents autour du magasin choisi. Décoche pour remplacer uniquement ce magasin.</small></span></label><div id="dsrResults" class="dsrResults"></div></div><div id="dsrPreview" class="dsrPreview" hidden></div></div>';
  document.body.appendChild(dlg);dlg.querySelector('.dsrClose').onclick=()=>dlg.close();dlg.addEventListener('cancel',()=>{replacePreview=null});dlg.querySelector('#dsrSearch').addEventListener('input',renderReplaceResults);dlg.querySelector('#dsrBrand').addEventListener('change',renderReplaceResults);dlg.querySelector('#dsrRecenter').addEventListener('change',()=>{if(replacePreview&&replacePreview.anchor)selectReplacement(replacePreview.anchor.id)});return dlg;
}
function renderReplaceResults(){
  const dlg=ensureReplaceDialog(),host=dlg.querySelector('#dsrResults'),q=norm(dlg.querySelector('#dsrSearch').value),brand=dlg.querySelector('#dsrBrand').value,oldId=replaceContext&&replaceContext.oldId,targetDay=replaceContext&&replaceContext.day;host.replaceChildren();
  const rows=(state.stores||[]).filter(s=>s&&s.active!==false&&!(state.excluded&&state.excluded[s.id])&&String(s.id)!==String(oldId)&&(!brand||String(s.enseigne)===brand)&&(!q||norm((s.enseigne||'')+' '+(s.ville||'')+' '+(s.adresse||'')+' '+(s.dept||'')).includes(q))).sort((a,b)=>String(a.enseigne||'').localeCompare(String(b.enseigne||''))||String(a.ville||'').localeCompare(String(b.ville||''))).slice(0,80);
  if(!rows.length){const p=document.createElement('p');p.textContent='Aucun magasin trouvé avec ces critères.';p.className='tiny';host.appendChild(p);return}
  for(const s of rows){const b=document.createElement('button');b.type='button';b.className='dsrStore';const left=document.createElement('span'),right=document.createElement('small');const name=document.createElement('b'),meta=document.createElement('small'),otherDay=targetDay?plannedOtherDayForStore(s.id,targetDay):null;name.textContent=(s.enseigne||'Magasin')+' '+(s.ville||'');meta.textContent=(s.adresse||'Adresse non renseignée')+(s.dept?' · '+s.dept:'');left.append(name,meta);if(otherDay){right.textContent='Déplacer de '+otherDay;right.className='dsrMove'}else try{right.textContent='~'+Math.round(havBase(s))+' km'}catch(e){right.textContent='Choisir'}b.append(left,right);b.onclick=()=>selectReplacement(s.id);host.appendChild(b)}
}
function showReplacementError(dlg,message){
  const host=dlg.querySelector('#dsrPreview');host.hidden=false;host.replaceChildren();const h=document.createElement('h3');h.textContent='Impossible pour l’instant';const p=document.createElement('p');p.className='tiny';p.textContent=message;const back=document.createElement('button');back.type='button';back.className='secondary full';back.textContent='Choisir un autre magasin';back.onclick=()=>{host.hidden=true;replacePreview=null};host.append(h,p,back);host.scrollIntoView({behavior:'smooth',block:'start'});
}
function selectReplacement(id){
  const anchor=(state.stores||[]).find(s=>String(s.id)===String(id));if(!anchor||!replaceContext)return;const dlg=ensureReplaceDialog(),recenter=dlg.querySelector('#dsrRecenter').checked,previewHost=dlg.querySelector('#dsrPreview');
  try{
    replacePreview=buildDayReplacement(replaceContext.oldId,anchor,replaceContext.day,recenter);previewHost.hidden=false;previewHost.replaceChildren();
    const h=document.createElement('h3');h.textContent=(recenter?'Nouvelle journée autour de ':'Remplacement par ')+(anchor.enseigne||'')+' '+(anchor.ville||'');
    const meta=document.createElement('p');meta.className='tiny';meta.textContent=replacePreview.route.length+' visite'+(replacePreview.route.length>1?'s':'')+' · ~'+Math.round(replacePreview.km)+' km · fin estimée '+replacePreview.end+(replacePreview.reduced?' · '+(replacePreview.previousCount-replacePreview.route.length)+' visite retirée pour respecter les horaires':'');
    const route=document.createElement('div');route.className='dsrRoute';replacePreview.route.forEach((s,i)=>{const row=document.createElement('div');row.textContent=(i+1)+'. '+(s.enseigne||'Magasin')+' '+(s.ville||'')+(replacePreview.protectedIds.includes(String(s.id))?' · conservé (contrainte)':'');route.appendChild(row)});
    const note=document.createElement('p');note.className='tiny';
    if(replacePreview.sourceDay){
      note.textContent=(anchor.enseigne||'Ce magasin')+' '+(anchor.ville||'')+' est actuellement prévu '+replacePreview.sourceDay+'. Il sera déplacé vers '+replacePreview.day+' et '+replacePreview.sourceDay+' sera adapté automatiquement.';
      const sourceTitle=document.createElement('b');sourceTitle.textContent=replacePreview.sourceDay+' après adaptation';const sourceMeta=document.createElement('p');sourceMeta.className='tiny';sourceMeta.textContent=replacePreview.sourceRoute.length+' visite'+(replacePreview.sourceRoute.length>1?'s':'')+(replacePreview.sourceRoute.length?' · ~'+Math.round(replacePreview.sourceKm)+' km · fin estimée '+replacePreview.sourceEnd:'')+(replacePreview.sourceReduced?' · 1 visite en moins faute de créneau compatible':'');const sourceRoute=document.createElement('div');sourceRoute.className='dsrRoute';replacePreview.sourceRoute.forEach((s,i)=>{const row=document.createElement('div');row.textContent=(i+1)+'. '+(s.enseigne||'Magasin')+' '+(s.ville||'');sourceRoute.appendChild(row)});previewHost.append(h,meta,route,note,sourceTitle,sourceMeta,sourceRoute);
    }else{note.textContent='Seule cette journée sera modifiée. Les autres jours et les autres semaines restent inchangés.';previewHost.append(h,meta,route,note)}
    const buttons=document.createElement('div');buttons.className='dsrButtons';const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Choisir un autre';back.onclick=()=>{previewHost.hidden=true;replacePreview=null};const apply=document.createElement('button');apply.type='button';apply.className='primary';apply.textContent=replacePreview.sourceDay?'Déplacer et adapter la semaine':'Appliquer cette journée';apply.onclick=async()=>{apply.disabled=true;try{await persistDayReplacement(replacePreview);const saved=replacePreview;dlg.close();replaceContext=null;replacePreview=null;showStatus(saved.sourceDay?(saved.anchor.enseigne+' '+saved.anchor.ville+' déplacé de '+saved.sourceDay+' vers '+saved.day+' · '+saved.sourceDay+' adapté.'):(saved.day+' recalculé autour de '+saved.anchor.enseigne+' '+saved.anchor.ville+'.'));setTimeout(()=>{if(typeof window.openStoreQuick==='function')window.openStoreQuick(saved.anchor.id,saved.day)},80)}catch(e){apply.disabled=false;showReplacementError(dlg,e.message||String(e))}};buttons.append(back,apply);previewHost.append(buttons);previewHost.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){replacePreview=null;showReplacementError(dlg,e.message||String(e))}
}
function openDayStoreReplacement(){
  const start=document.getElementById('srQuickStart'),oldId=start&&start.dataset&&start.dataset.srStart,day=plannedDayForStore(oldId);if(!oldId||!day){if(typeof showError==='function')showError('Ce magasin n’est pas dans la journée affichée. Ouvre un magasin directement depuis le planning.');return}
  const old=(state.stores||[]).find(s=>String(s.id)===String(oldId));if(!old)return;replaceContext={oldId:String(oldId),day};replacePreview=null;if(typeof window.closeStoreQuick==='function')window.closeStoreQuick();const dlg=ensureReplaceDialog();dlg.querySelector('#dsrContext').textContent=day+' · remplacer '+old.enseigne+' '+old.ville;dlg.querySelector('#dsrSearch').value='';dlg.querySelector('#dsrRecenter').checked=true;dlg.querySelector('#dsrPreview').hidden=true;const brand=dlg.querySelector('#dsrBrand'),brands=[...new Set((state.stores||[]).filter(s=>s&&s.active!==false).map(s=>String(s.enseigne||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b));brand.innerHTML='<option value="">Toutes les enseignes</option>';for(const value of brands){const o=document.createElement('option');o.value=value;o.textContent=value;brand.appendChild(o)}renderReplaceResults();dlg.showModal();setTimeout(()=>dlg.querySelector('#dsrSearch').focus(),60)
}
async function togglePlannedStorePin(){
  /* Poser à la main, ou rendre à la génération automatique. C'est la contrepartie
     explicite du remplacement : sans elle, un magasin posé le resterait pour toujours. */
  const start=document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;
  const day=plannedDayForStore(id);
  if(!id||!day){if(typeof showError==='function')showError('Ce magasin n’est pas dans la journée affichée. Ouvre un magasin directement depuis le planning.');return false}
  const store=(state.stores||[]).find(x=>String(x.id)===String(id))||{};
  const wasPinned=isPinnedOn(id,day);
  try{
    if(typeof ChefReliability!=='undefined'&&ChefReliability&&typeof ChefReliability.checkpoint==='function')
      ChefReliability.checkpoint((wasPinned?'Avant libération de ':'Avant pose de ')+(store.enseigne||'magasin')+' sur '+day);
  }catch(e){}
  if(wasPinned)unpinStore(id);else pinStore(id,day);
  try{if(typeof save==='function')save()}catch(e){if(typeof showError==='function')showError('Enregistrement impossible : '+(e&&e.message?e.message:String(e)));return false}
  try{if(typeof renderAll==='function')renderAll()}catch(e){}
  syncPinButton();
  document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:wasPinned?'store-unpinned':'store-pinned',day,storeId:String(id)}}));
  return true;
}
function syncPinButton(){
  const btn=document.getElementById('pinQuickStoreBtn');if(!btn)return false;
  const start=document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;
  const day=plannedDayForStore(id);
  if(!id||!day){btn.hidden=true;return false}
  btn.hidden=false;
  const pinned=isPinnedOn(id,day);
  btn.textContent=pinned?'↩ Libérer ce magasin':'📌 Poser ce magasin';
  const entry=lockEntry(id),recurrent=!!(entry&&!entry.week);
  btn.title=pinned
    ?(recurrent
      ?'Ce magasin est verrouillé sur tous les '+day+'. Le libérer le rendra à la génération automatique.'
      :'Rendre ce magasin à la génération automatique : elle pourra le déplacer ou le remplacer.')
    :'Poser ce magasin sur ce '+day+', pour la semaine affichée uniquement. Les autres semaines restent libres.';
  btn.setAttribute('aria-pressed',pinned?'true':'false');
  return true;
}
function hookQuickSheet(){
  /* La fiche rapide est rouverte magasin par magasin par son propriétaire, sans repasser
     par install(). On enveloppe openStoreQuick au lieu de le remplacer, pour resynchroniser
     le libellé « poser / libérer » sur le magasin réellement affiché. */
  const original=window.openStoreQuick;
  if(typeof original!=='function'||original.__pinSynced)return false;
  const wrapped=function(){const out=original.apply(this,arguments);try{syncPinButton()}catch(e){}return out};
  wrapped.__pinSynced=true;wrapped.__original=original;
  window.openStoreQuick=wrapped;
  return true;
}
function installDayReplaceUi(){
  hookQuickSheet();
  const actions=document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;
  let btn=document.getElementById('changeQuickStoreBtn');
  const full=[...actions.querySelectorAll('button')].find(b=>/Voir la fiche/i.test(b.textContent||''));
  if(!btn){btn=document.createElement('button');btn.type='button';btn.id='changeQuickStoreBtn';btn.className='secondary';btn.textContent='⇄ Changer ce magasin';btn.onclick=openDayStoreReplacement;actions.insertBefore(btn,full||null)}
  let pin=document.getElementById('pinQuickStoreBtn');
  if(!pin){pin=document.createElement('button');pin.type='button';pin.id='pinQuickStoreBtn';pin.className='secondary';pin.onclick=togglePlannedStorePin;actions.insertBefore(pin,full||null)}
  syncPinButton();
  ensureReplaceDialog();return true;
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
  // #rangePlannerCard est un <details> imbriqué dans le <details id="planningSettings">.
  // Un <details> fermé rend tout son contenu non focusable, y compris un <details> ouvert
  // à l'intérieur : sans ça, #rangeStart/#rangeEnd restent inertes quand le panneau des
  // réglages est replié, même si cette carte-ci est ouverte.
  box.addEventListener('toggle',function(){const parent=document.getElementById('planningSettings');if(box.open&&parent&&!parent.open)parent.open=true});
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
/* API publique de la pose manuelle : un futur déplacement d'un jour à l'autre n'aura
   qu'à l'appeler, sans redéfinir la règle ni ouvrir un second registre. */
window.storeRunnerPinPlannedStore=function(id,day){const ok=pinStore(id,day);if(ok){try{if(typeof save==='function')save()}catch(e){}syncPinButton()}return ok};
window.storeRunnerUnpinPlannedStore=function(id){const ok=unpinStore(id);if(ok){try{if(typeof save==='function')save()}catch(e){}syncPinButton()}return ok};
window.storeRunnerPlannedStoreIsPinned=function(id,day){return isPinnedOn(id,day)};
/* Le noyau historique affiche le repère « posé » et régénère une journée : il doit lire
   le verrou avec la même règle que le moteur, sans redéfinir les deux formes de son côté. */
window.storeRunnerLockDayForWeek=function(id,weekKey){return lockDayForWeek(id,weekKey===undefined?currentWeekKey():weekKey)};
/* Décrire un verrou sans en redéfinir les formes ailleurs : la liste des magasins doit
   pouvoir distinguer « tous les mardis » d'une pose sur une seule semaine. */
window.storeRunnerLockInfo=function(id){const e=lockEntry(id);return e?{day:e.day,week:e.week,recurring:!e.week}:null};
/* Verrou récurrent, écrit depuis la liste des magasins et depuis l'assistant : ces deux
   entrées ne connaissent aucune semaine affichée, leur sens est « tous les mardis ». La
   pose datée reste réservée au bouton du planning, qui agit sur une semaine précise. */
window.storeRunnerSetRecurringLock=function(id,day){
  if(!id)return false;
  if(!state.locks)state.locks={};
  if(!day){delete state.locks[String(id)];return true}
  if(!DAYS.includes(day))return false;
  state.locks[String(id)]=day;
  return true;
};
function boot(){install()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('store-runner:planning-updated',recoverInstall);
document.addEventListener('store-runner:data-restored',recoverInstall);
})();