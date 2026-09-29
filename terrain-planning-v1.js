/* Store Runner V1 — propriétaire de l'allocation 3 semaines + premier magasin choisi.
   Ce module ne remplace ni generateWeek ni generatePlanningRange. Il expose le moteur
   escargot et l'action « Commencer par ici » autour du moteur V1 stable, et persiste via
   ChefReliability.
   V239 : le cycle 3 semaines est la génération standard du planning. Son déclencheur est
   le bouton principal, câblé par planning-generation-controller.js ; ce module n'installe
   plus d'action concurrente dans « Planifier plusieurs semaines ».
   V264 : après la construction sûre historique, ce propriétaire optimise l'affectation
   magasin → journée sur les trois semaines. V251 reste seul propriétaire de l'ordre des
   arrêts à l'intérieur d'une journée. */
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
function cloneStore(s){return{id:s.id,enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||'',dept:s.dept||'',lat:s.lat,lon:s.lon,freq:s.freq||'',priority:s.priority,lastVisit:s.lastVisit||'',intervalDays:s.intervalDays,visitMinutes:s.visitMinutes}}
function routeMinutes(route,state=root.state){
  if(!route||!route.length)return 0;
  const settings=state.settings||{};
  let km=0;
  try{
    const base=root.baseObj();
    if(!validBase(state)||route.some(s=>!validStoreGps(s)))return null;
    km+=Number(root.hav(base,route[0]))||0;
    for(let i=1;i<route.length;i++)km+=Number(root.hav(route[i-1],route[i]))||0;
    km+=Number(root.hav(route[route.length-1],base))||0;
  }catch(e){return null}
  const visits=(route||[]).reduce((n,s)=>{try{return n+(typeof root.storeVisitDuration==='function'?root.storeVisitDuration(s,state):Math.max(15,Number(settings.visitMinutes)||60))}catch(e){return n+Math.max(15,Number(settings.visitMinutes)||60)}},0);return km*1.22/55*60+visits;
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
  /* Agenda possède les bornes (fin exclusive des événements all-day). Le moteur terrain
     conserve ici sa liste historique de motifs bloquants, mais ne redéfinit plus les plages. */
  const covers=typeof root.chefSecteurEventCoversDate==='function'
    ? e=>root.chefSecteurEventCoversDate(e,date)
    : e=>String(e.date||String(e.start||'').slice(0,10))===date;
  const rows=(state.calendarEvents||[]).filter(e=>{try{return covers(e)}catch(x){return false}});
  return rows.some(e=>{
    if(e&&e.inferredAway)return true;
    const t=norm((e&&e.title||'')+' '+(e&&e.location||'')+' '+(e&&e.calendar||''));
    const holiday=/\bferies?\b/.test(t)||/\bpublic holidays?\b/.test(t);
    return ['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'].some(x=>t.includes(x))||holiday||/\bparis\b/.test(t)||!!(e&&e.planningBlock&&!e.allDay);
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
function rankStoresForSnail(stores,distanceFn,priorityFn){
  const dist=distanceFn||distanceOf,prio=typeof priorityFn==='function'?priorityFn:(()=>0);
  return (stores||[]).slice().sort((a,b)=>{
    const pa=Number(prio(a)),pb=Number(prio(b)),aa=Number.isFinite(pa)?pa:0,bb=Number.isFinite(pb)?pb:0;
    if(bb!==aa)return bb-aa;
    const da=Number(dist(a)),dbv=Number(dist(b)),ad=Number.isFinite(da)?da:Infinity,bd=Number.isFinite(dbv)?dbv:Infinity;
    return ad-bd||String(a.enseigne||'').localeCompare(String(b.enseigne||''))||String(a.ville||'').localeCompare(String(b.ville||''));
  })
}
function dayQuotas(days,target){const out={},rows=(days||[]).slice(),goal=Math.max(0,Math.floor(Number(target)||0));if(!rows.length)return out;const base=Math.floor(goal/rows.length),extra=goal%rows.length;rows.forEach((d,i)=>out[d]=base+(i<extra?1:0));return out}
function routeCreditCost(route,credit){return(route||[]).reduce((n,s)=>n+Math.max(1,Number(credit(s))||1),0)}
function orderedPlacementDays(activeDays,plan,quotas,credit){
  const order=new Map((activeDays||[]).map((d,i)=>[d,i]));
  return(activeDays||[]).slice().sort((a,b)=>{
    const an=(plan[a]||[]).length<(quotas[a]||0),bn=(plan[b]||[]).length<(quotas[b]||0);
    if(an!==bn)return an?-1:1;
    if(an&&bn)return order.get(a)-order.get(b);
    const ac=routeCreditCost(plan[a],credit),bc=routeCreditCost(plan[b],credit);
    return ac-bc||(plan[a]||[]).length-(plan[b]||[]).length||order.get(a)-order.get(b)
  })
}
function weekDistributionDiagnostics(options){
  const mon=options.mon,days=options.days||[],activeDays=options.activeDays||[],plan=options.plan||emptyPlan(),target=Math.max(1,Number(options.target)||1),max=Math.max(1,Number(options.max)||1),ranked=options.ranked||[],used=options.used||new Set(),weekPlaced=options.weekPlaced||new Set(),credit=options.credit||(()=>1),fits=options.fits||(()=>true),manual=!!options.manual,frozen=new Set(options.frozenDays||[]),recentlyVisited=Math.max(0,Number(options.recentlyVisited)||0),total=flattenPlan(plan,activeDays).length+flattenPlan(plan,[...frozen]).length;
  return days.map(day=>{
    const date=iso(addDays(mon,DAYS.indexOf(day))),route=plan[day]||[];
    /* V263 : une journée déjà passée est conservée telle quelle, jamais « vide à remplir ». */
    if(frozen.has(day))return{day,date,status:'past',count:route.length,credits:routeCreditCost(route,credit),reason:'Journée passée conservée'};
    if(manual)return{day,date,status:route.length?'manual-planned':'manual-empty',count:route.length,credits:routeCreditCost(route,credit),reason:'Semaine protégée manuellement'};
    if(!activeDays.includes(day))return{day,date,status:'blocked',count:0,credits:0,reason:'Jour bloqué ou indisponible dans l’agenda'};
    if(route.length)return{day,date,status:'planned',count:route.length,credits:routeCreditCost(route,credit),reason:''};
    let reason=recentlyVisited?'Magasins restants déjà visités récemment : pas reproposés avant leur fréquence':'Vivier éligible épuisé';
    if(total>=target)reason=target<activeDays.length?'Objectif hebdomadaire inférieur au nombre de jours travaillés':'Objectif hebdomadaire atteint par les autres jours ou des contraintes fixes';
    else{
      const remaining=ranked.filter(s=>!used.has(storeKey(s))&&!weekPlaced.has(storeKey(s)));
      if(remaining.length){let eligible=false,capacityReject=0,fitReject=0;for(const s of remaining){const c=Math.max(1,Number(credit(s))||1);if(c>max){capacityReject++;continue}if(!fits([s],day,mon)){fitReject++;continue}eligible=true;break}if(eligible)reason='Anomalie de répartition : un magasin éligible restait disponible';else if(capacityReject===remaining.length)reason='Capacité journalière insuffisante pour les magasins restants';else if(capacityReject+fitReject===remaining.length)reason='Horaires ou capacité empêchent les magasins restants';else reason='Aucun magasin restant compatible avec cette journée'}
    }
    return{day,date,status:'empty',count:0,credits:0,reason}
  })
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
/* V243 : mémoire de rotation multi-cycle, portée depuis range-planner-v2.js (V211,
   rotationMemoryV211) plutôt qu'appelée à travers ce fichier — les deux modules ne
   partagent pas le même format de storeKey (celui-ci clé par id, V211 clé par
   enseigne+ville+adresse), et brancher l'un sur l'autre sans unifier ce format ferait
   échouer silencieusement toute comparaison usedKeys.has(...). Cette version reprend
   l'algorithme, avec le storeKey (par id) déjà utilisé par ce fichier, donc directement
   compatible avec l'archive qu'il écrit et relit depuis toujours — aucune migration de
   données n'est nécessaire.
   Volontairement hors périmètre de ce lot : la cadence/fréquence par magasin (V211
   pondère aussi le retard « dû » via intervalDays et le boost performance dans sa marge
   de répétition anticipée). Le seul problème mesuré et documenté (audit section 6,
   benchmark V241) est l'absence totale de mémoire inter-cycles ; ce lot corrige
   précisément ça, sans changer par ailleurs ce qui fait qu'un magasin est prioritaire. */
function rotationWindowWeeks(pool,target){
  return Math.max(1,Math.min(8,Math.ceil((pool||[]).length/Math.max(1,Number(target)||1))));
}
function rotationMemory(pool,weekKey,target,archive){
  const usedKeys=new Set(),useCount=new Map(),lastUsedWeek=new Map(),windowWeeks=rotationWindowWeeks(pool,target);
  const ref=monday(parseISO(weekKey)||new Date()),valid=new Set((pool||[]).map(storeKey));
  for(const [key,snap] of Object.entries(archive||{})){
    const mon=parseISO((snap&&snap.weekMonday)||key);if(!mon)continue;
    const delta=Math.round((monday(mon)-ref)/(7*86400000));if(delta>=0||delta< -windowWeeks)continue;
    const weekSeen=new Set();
    for(const day of DAYS)for(const raw of ((snap&&snap.plan&&snap.plan[day])||[])){
      const k=storeKey(raw);
      if(!k||!valid.has(k)||weekSeen.has(k))continue;
      weekSeen.add(k);usedKeys.add(k);useCount.set(k,(useCount.get(k)||0)+1);
      const prev=lastUsedWeek.get(k);if(prev==null||delta>prev)lastUsedWeek.set(k,delta);
    }
  }
  return{usedKeys,useCount,lastUsedWeek,windowWeeks};
}
/* Tri de la file « déjà vus, à reprendre en dernier recours » : le moins récemment
   utilisé d'abord (delta le plus négatif), puis le moins souvent utilisé — même principe
   d'équilibrage que chooseStores côté V211, sans réintroduire son format de clé. */
function sortByLeastRecentlyUsed(list,memory){
  return (list||[]).slice().sort((a,b)=>{
    const ka=storeKey(a),kb=storeKey(b),la=memory.lastUsedWeek.get(ka),lb=memory.lastUsedWeek.get(kb);
    const la2=la==null?-Infinity:la,lb2=lb==null?-Infinity:lb;
    if(la2!==lb2)return la2-lb2;
    return (memory.useCount.get(ka)||0)-(memory.useCount.get(kb)||0);
  });
}
/* V242 : une semaine gelée manuellement ne doit pas rester avec des jours vides quand
   elle n'a été modifiée que partiellement — un jour posé à la main, un recalcul partiel,
   un magasin déplacé... Les visites déjà présentes ne changent jamais de jour ; seule la
   capacité encore libre d'un jour actif est complétée avec le vivier normal, sous les
   mêmes contraintes que la génération non protégée : capacité, horaires, jours bloqués,
   rendez-vous, verrous, sans doublon avec cette semaine ni avec les autres semaines du
   cycle. L'ordre des arrêts déjà posés n'est pas retouché et aucun jour hors activeDays
   (bloqué ou non travaillé) n'est complété : le réétalement géographique d'une semaine
   protégée reste hors périmètre de ce correctif, exactement comme V185 l'ignore déjà
   volontairement (cf. persistSnailGeography, if(week.manual)continue). */
/* V263 : `extra` (facultatif, fourni par le runtime) apporte le besoin de visite réel.
   Le complément d'une semaine protégée ne réinjecte alors plus un magasin trop récemment
   visité : il sert d'abord les contraintes explicites (verrou, rendez-vous, magasin imposé),
   puis les magasins les plus en retard. `countDays` compte aussi les journées passées
   conservées, qui ne reçoivent jamais de complément. Sans `extra`, rien ne change. */
function needOrdered(list,needAt){
  return (list||[]).map((s,i)=>({s,i,n:needAt(s)||{}})).sort((a,b)=>{
    const ta=Number.isFinite(a.n.tier)?a.n.tier:3,tb=Number.isFinite(b.n.tier)?b.n.tier:3;
    if(tb!==ta)return tb-ta;
    if(ta>=4){const ra=Number(a.n.ratio)||0,rb=Number(b.n.ratio)||0;if(rb!==ra)return rb-ra}
    return a.i-b.i;
  }).map(x=>x.s);
}
function completeProtectedWeek(protectedPlan,activeDays,mon,weekKey,target,ranked,used,max,credit,fits,lockFor,apptFor,extra){
  const plan=copy(protectedPlan);
  const presentKeys=new Set(flattenPlan(plan).map(storeKey));
  let total=flattenPlan(plan,(extra&&extra.countDays)||activeDays).length;
  let pool=ranked;
  if(extra&&typeof extra.needAt==='function'){
    const imposed=extra.imposed||{},constrained=s=>!!(lockFor(s.id,weekKey)||apptFor(s.id,mon)||imposed[s.id]);
    const fixed=ranked.filter(constrained),free=needOrdered(ranked.filter(s=>!constrained(s)&&!extra.needAt(s).blocked),extra.needAt);
    pool=fixed.concat(free);
  }
  for(const day of activeDays){
    if(total>=target)break;
    let route=Array.isArray(plan[day])?plan[day]:(plan[day]=[]);
    let cost=routeCreditCost(route,credit);
    if(cost>=max)continue;
    for(const s of pool){
      if(cost>=max||total>=target)break;
      const k=storeKey(s);
      if(used.has(k)||presentKeys.has(k))continue;
      const ld=lockFor(s.id,weekKey),ad=apptFor(s.id,mon);
      if((ld&&ld!==day)||(ad&&ad!==day))continue;
      const trial=route.concat([s]),trialCost=routeCreditCost(trial,credit);
      if(trialCost>max||!fits(trial,day,mon))continue;
      route=trial;cost=trialCost;presentKeys.add(k);total++;
    }
    plan[day]=route;
  }
  return plan;
}
function safeDistance(a,b,distanceFn){
  try{const d=Number((distanceFn||root.hav)(a,b));return Number.isFinite(d)?d:Infinity}catch(e){return Infinity}
}
/* V264 — allocation géographique sur l'horizon complet.

   Le cycle historique ci-dessous reste la construction initiale et donc le repli sûr. Cette
   passe ne redéfinit ni le besoin (StoreRunnerVisitCoverage), ni l'ordre d'une tournée
   (V251) : elle compare uniquement des affectations magasin → journée sur les trois
   semaines. Les rendez-vous, verrous, jours figés/manuels/passés, visites réalisées et
   décisions de découché existantes sont retirés du voisinage de recherche avant toute
   comparaison.

   Recherche bornée et déterministe :
   1. compléter les semaines avec le meilleur palier métier encore plaçable ;
   2. mouvements locaux dans une semaine ;
   3. échanges entre deux journées, y compris entre semaines ;
   4. substitutions de magasins strictement équivalents côté métier/rotation ;
   5. six passes maximum, avec départage stable par date puis identifiant.

   Une amélioration locale n'est acceptée que si minutes ET kilomètres n'augmentent pas.
   À égalité géographique, la charge en crédits départage. */
const CROSS_DAY_MAX_PASSES=6;
const CROSS_DAY_CANDIDATE_LIMIT=160;
const CROSS_DAY_EPSILON=.05;

function sameStoreMembersV264(a,b){
  const ids=route=>(route||[]).map(storeKey).sort();
  return JSON.stringify(ids(a))===JSON.stringify(ids(b));
}
function routeEndpointsV264(date,state,options){
  const reservations=(options&&options.overnightReservations)||(state&&state.hotelReservations)||{};
  const rows=Object.values(reservations||{}),previous=rows.find(row=>row&&String(row.toDate||'')===date),next=(reservations&&reservations[date])||rows.find(row=>row&&String(row.fromDate||'')===date);
  let base=options&&options.basePoint;
  if(typeof base==='function'){try{base=base(state)}catch(e){base=null}}
  if(!base){try{base=typeof root.baseObj==='function'?root.baseObj():null}catch(e){base=null}}
  if(!base){const profile=state&&state.profile||{};if(validCoord(profile.baseLat)&&validCoord(profile.baseLon))base={id:'BASE',lat:Number(profile.baseLat),lon:Number(profile.baseLon)}}
  const point=row=>row&&validCoord(row.lat)&&validCoord(row.lon)?row:null;
  return{origin:point(previous)||base,destination:point(next)||base}
}
function routeKilometersV264(route,date,state,options){
  const rows=(route||[]).filter(Boolean);if(!rows.length)return 0;
  const endpoints=routeEndpointsV264(date,state,options),distance=options&&options.distanceBetween;
  if(!endpoints.origin||!endpoints.destination||typeof distance!=='function')return Infinity;
  let km=safeDistance(endpoints.origin,rows[0],distance);
  for(let i=1;i<rows.length;i++)km+=safeDistance(rows[i-1],rows[i],distance);
  km+=safeDistance(rows[rows.length-1],endpoints.destination,distance);return km
}
function normalizeDayEvaluationV264(route,slot,state,options){
  let raw=null;
  try{if(typeof options.evaluateDayRoute==='function')raw=options.evaluateDayRoute(route.slice(),slot.day,slot.weekKey,state)}catch(e){raw=null}
  const proposed=raw&&Array.isArray(raw.route)&&sameStoreMembersV264(route,raw.route)?raw.route.slice():route.slice();
  let feasible=raw&&typeof raw.feasible==='boolean'?raw.feasible:null;
  if(feasible==null){try{feasible=!!options.dayFits(proposed,slot.day,parseISO(slot.weekKey))}catch(e){feasible=false}}
  let km=Number(raw&&raw.kilometers);if(!Number.isFinite(km))km=routeKilometersV264(proposed,slot.date,state,options);
  let drive=Number(raw&&raw.driveMinutes);if(!Number.isFinite(drive))drive=Number.isFinite(km)?km/55*60:Infinity;
  const credits=routeCreditCost(proposed,options.creditOf||(()=>1));
  return{route:proposed,feasible:!!feasible,driveMinutes:drive,kilometers:km,credits,signature:proposed.map(storeKey).join(',')}
}
function totalMetricsV264(slots,state,options){
  let driveMinutes=0,kilometers=0;
  for(const slot of slots){const metric=normalizeDayEvaluationV264(slot.route,slot,state,options);driveMinutes+=metric.driveMinutes;kilometers+=metric.kilometers}
  return{driveMinutes,kilometers}
}
function needRankV264(row){
  const tier=Number(row&&row.tier),status=String(row&&row.status||''),blocked=!!(row&&row.blocked);
  let business=0;
  if(!blocked&&tier>=4)business=5;
  else if(!blocked&&status==='never')business=4;
  else if(!blocked&&status==='late')business=3;
  else if(!blocked&&status==='soon')business=2;
  else if(!blocked&&status==='ok')business=1;
  else if(!blocked&&Number.isFinite(tier)){if(tier>=3.5)business=4;else if(tier>=3)business=3;else if(tier>=2)business=2;else if(tier>0)business=1}
  /* P1 ne vaut qu'un bit de départage dans le statut exact. Il ne peut donc jamais
     franchir très-en-retard > jamais-visité > retard > bientôt dû > à jour. */
  return business*100+(String(row&&row.priority||'')==='P1'?1:0)
}
function compareTupleV264(a,b){
  for(let i=0;i<Math.max(a.length,b.length);i++){const x=Number(a[i])||0,y=Number(b[i])||0;if(x!==y)return x>y?1:-1}
  return 0
}
function betterLocalV264(candidate,best){
  if(!candidate)return false;if(!best)return true;
  if(candidate.driveSaving>best.driveSaving+CROSS_DAY_EPSILON)return true;
  if(best.driveSaving>candidate.driveSaving+CROSS_DAY_EPSILON)return false;
  if(candidate.kmSaving>best.kmSaving+CROSS_DAY_EPSILON)return true;
  if(best.kmSaving>candidate.kmSaving+CROSS_DAY_EPSILON)return false;
  if(candidate.loadSaving!==best.loadSaving)return candidate.loadSaving>best.loadSaving;
  return candidate.signature<best.signature
}
function localImprovementV264(before,after,beforeLoad,afterLoad){
  const beforeDrive=before.reduce((n,row)=>n+row.driveMinutes,0),afterDrive=after.reduce((n,row)=>n+row.driveMinutes,0),beforeKm=before.reduce((n,row)=>n+row.kilometers,0),afterKm=after.reduce((n,row)=>n+row.kilometers,0);
  if(!after.every(row=>row.feasible)||afterDrive>beforeDrive+CROSS_DAY_EPSILON||afterKm>beforeKm+CROSS_DAY_EPSILON)return null;
  const driveSaving=beforeDrive-afterDrive,kmSaving=beforeKm-afterKm,loadSaving=beforeLoad-afterLoad;
  if(driveSaving<=CROSS_DAY_EPSILON&&kmSaving<=CROSS_DAY_EPSILON&&loadSaving<=0)return null;
  return{driveSaving,kmSaving,loadSaving}
}
function optimizeThreeWeekCrossDay(weeks,options){
  const state=options&&options.state||{},needAt=options&&options.needAt;
  if(options&&options.crossDayEnabled===false)return{applied:false,reason:'no-real-visit-history'};
  if(!Array.isArray(weeks)||!weeks.length||typeof needAt!=='function'||typeof options.evaluateDayRoute!=='function')return{applied:false,reason:'missing-evaluator-or-coverage'};
  const days=(options.days||[]).filter(day=>DAYS.includes(day)),max=Math.max(1,Number(options.maxCreditsPerDay)||4),target=Math.max(1,Number(options.target)||20),credit=options.creditOf||(()=>1),blocked=options.dayBlocked||(()=>false),lockFor=options.lockDayForWeek||(()=>''),apptFor=options.appointmentDay||(()=>''),completedOn=options.completedOn||(()=>false),imposed=state.included||{},memory=options.memory||{usedKeys:new Set(),useCount:new Map()},ranked=(options.ranked||[]).filter(Boolean),reservations=options.overnightReservations||state.hotelReservations||{};
  const first=parseISO(weeks[0].weekKey),horizonEnd=iso(addDays(first,20)),overnightDates=new Set();
  for(const row of Object.values(reservations||{})){if(row&&row.fromDate)overnightDates.add(String(row.fromDate));if(row&&row.toDate)overnightDates.add(String(row.toDate))}
  const refusal={manualWeeks:0,pastDays:0,unavailableDays:0,overnightDays:0,appointments:0,locks:0,imposed:0,completed:0},slots=[],weekSlots=new Map();let slotIndex=0;
  for(const week of weeks){
    const frozen=new Set(week.frozenDays||[]),rows=[];
    if(week.manual)refusal.manualWeeks++;
    for(const day of DAYS){
      const date=iso(addDays(parseISO(week.weekKey),DAYS.indexOf(day))),active=days.includes(day)&&!blocked(date),hardReason=week.manual?'manual':frozen.has(day)?'past':overnightDates.has(date)?'overnight':!active?'unavailable':'';
      if(hardReason==='past')refusal.pastDays++;else if(hardReason==='overnight')refusal.overnightDays++;else if(hardReason==='unavailable')refusal.unavailableDays++;
      const slot={index:slotIndex++,week,weekKey:week.weekKey,day,date,active,hardReason,mutable:active&&!hardReason,route:Array.isArray(week.plan&&week.plan[day])?week.plan[day].slice():[],initialNonEmpty:!!((week.plan&&week.plan[day])||[]).length};slots.push(slot);rows.push(slot)
    }
    weekSlots.set(week.weekKey,rows)
  }
  const missedPastIds=new Set();
  for(const slot of slots)if(slot.hardReason==='past')for(const store of slot.route)if(!completedOn(store.id,slot.date))missedPastIds.add(storeKey(store));
  const fixedReason=(slot,store)=>{
    if(slot.hardReason)return slot.hardReason;const id=storeKey(store);
    if(imposed[id])return'imposed';if(apptFor(store.id,parseISO(slot.weekKey)))return'appointment';if(lockFor(store.id,slot.weekKey))return'lock';if(completedOn(store.id,slot.date))return'completed';if(missedPastIds.has(id))return'missed-past';return''
  };
  for(const slot of slots)for(const store of slot.route){const reason=fixedReason(slot,store);if(reason==='appointment')refusal.appointments++;else if(reason==='lock')refusal.locks++;else if(reason==='imposed')refusal.imposed++;else if(reason==='completed')refusal.completed++}
  let evaluations=0;
  const evaluationCache=new Map(),metric=(route,slot)=>{
    const key=slot.date+'|'+(route||[]).map(storeKey).sort().join(',');
    if(!evaluationCache.has(key)){evaluationCache.set(key,normalizeDayEvaluationV264(route,slot,state,options));evaluations++}
    return evaluationCache.get(key)
  },totals=()=>{let driveMinutes=0,kilometers=0;for(const slot of slots){const row=metric(slot.route,slot);driveMinutes+=row.driveMinutes;kilometers+=row.kilometers}return{driveMinutes,kilometers}};
  /* V251 (ou l'évaluateur injecté par les tests) possède toujours l'ordre intra-journée. */
  for(const slot of slots){if(!slot.mutable||slot.route.length<2)continue;const row=metric(slot.route,slot);if(row.feasible)slot.route=row.route}
  const beforeSignature=slots.map(slot=>slot.weekKey+'|'+slot.day+':'+slot.route.map(storeKey).join(',')).join(';'),beforeMetrics=totals();
  let needEvaluations=0;
  const needCache=new Map(),needOn=(store,date)=>{const key=storeKey(store)+'|'+date;if(!needCache.has(key)){needCache.set(key,needAt(store,date));needEvaluations++}return needCache.get(key)},businessAt=(store,date)=>needRankV264(needOn(store,date));
  const projection=typeof options.projectedNeedAt==='function'?options.projectedNeedAt:null,projectionCache=new Map(),projectedBusiness=(store,visitDate)=>{
    if(!projection)return null;const key=storeKey(store)+'|'+visitDate+'|'+horizonEnd;
    if(!projectionCache.has(key)){projectionCache.set(key,needRankV264(projection(store,visitDate,horizonEnd)));needEvaluations++}
    return projectionCache.get(key)
  };
  const planningToday=String(options.today||needAt.today||iso(first)),baselineDates=new Map(),baselineStores=new Map();
  for(const week of (options.businessBaselineWeeks||[]))for(const day of DAYS){const date=iso(addDays(parseISO(week.weekKey),DAYS.indexOf(day)));if(date<planningToday)continue;for(const store of ((week.plan&&week.plan[day])||[])){const id=storeKey(store),rows=baselineDates.get(id)||[];rows.push(date);rows.sort();baselineDates.set(id,rows);baselineStores.set(id,store)}}
  const baselineProjected=new Map();if(projection)for(const [id,dates] of baselineDates)baselineProjected.set(id,projectedBusiness(baselineStores.get(id),dates[dates.length-1]));
  const projectionSafe=(store,fromDate,toDate)=>{
    if(!projection)return true;const before=projectedBusiness(store,fromDate),after=projectedBusiness(store,toDate),target=baselineProjected.get(storeKey(store));
    return target==null?after<=before:after<=target
  };
  const delayRowCache=new Map(),serviceDelay=(store,date)=>{
    const id=storeKey(store);if(!delayRowCache.has(id))delayRowCache.set(id,needOn(store,planningToday));const row=delayRowCache.get(id),origin=parseISO(row&&row.status==='never'?(row.today||planningToday):(row&&row.nextDue||'')),visit=parseISO(date);return origin&&visit?Math.max(0,Math.round((visit-origin)/86400000)):0
  };
  const planningStores=new Map(ranked.map(store=>[storeKey(store),store])),hasBusinessBaseline=Array.isArray(options.businessBaselineWeeks)&&options.businessBaselineWeeks.length>0;
  const baselineDelayLimit=hasBusinessBaseline?Array.from(planningStores.entries()).reduce((sum,[id,store])=>sum+serviceDelay(store,baselineDates.has(id)?baselineDates.get(id)[0]:horizonEnd),0):Infinity;
  const currentScheduleDelay=()=>{const dates=new Map();for(const slot of slots){if(slot.date<planningToday)continue;for(const store of slot.route){const id=storeKey(store),previous=dates.get(id);if(!previous||slot.date<previous)dates.set(id,slot.date)}}return Array.from(planningStores.entries()).reduce((sum,[id,store])=>sum+serviceDelay(store,dates.get(id)||horizonEnd),0)};
  const delaySafeMove=(store,fromDate,toDate)=>currentScheduleDelay()+serviceDelay(store,toDate)-serviceDelay(store,fromDate)<=baselineDelayLimit;
  const delaySafeSwap=(one,fromOne,toOne,two,fromTwo,toTwo)=>currentScheduleDelay()+serviceDelay(one,toOne)-serviceDelay(one,fromOne)+serviceDelay(two,toTwo)-serviceDelay(two,fromTwo)<=baselineDelayLimit;
  const moveBusinessSafe=(store,source,destination)=>{
    const from=businessAt(store,source.date),to=businessAt(store,destination.date);
    if(destination.date<=source.date)return projectionSafe(store,source.date,destination.date);
    return !!projection&&from===to&&projectedBusiness(store,destination.date)<projectedBusiness(store,source.date)&&projectionSafe(store,source.date,destination.date)
  };
  const swapBusinessSafe=(one,a,two,b)=>{
    let early=a,late=b,earlyStore=one,lateStore=two;
    if(b.date<a.date){early=b;late=a;earlyStore=two;lateStore=one}
    const atEarly=businessAt(earlyStore,early.date)-businessAt(lateStore,early.date);
    if(!projectionSafe(earlyStore,early.date,late.date)||!projectionSafe(lateStore,late.date,early.date))return false;
    if(atEarly>0)return false;if(atEarly<0)return true;
    /* À égalité au premier créneau, on protège ensuite le besoin au second : la
       géographie n'arrive qu'après égalité métier aux deux dates concernées. */
    return businessAt(earlyStore,late.date)>=businessAt(lateStore,late.date)
  };
  const replacementBusinessSafe=(current,replacement,slot)=>{
    const slotCurrent=businessAt(current,slot.date),slotReplacement=businessAt(replacement,slot.date),endCurrent=businessAt(current,horizonEnd),endReplacement=businessAt(replacement,horizonEnd);
    /* Un remplacement n'est admissible que si le magasin retiré reste dans la classe
       métier non due (à jour/couverte) sans cette visite, et si le candidat est strictement
       équivalent au créneau comme à J+20. Un très-en-retard qui resterait très-en-retard
       n'est jamais sacrifié sous prétexte que son libellé ne change pas. */
    const removalSafe=endCurrent<=101&&(!projection||projectedBusiness(current,slot.date)<=101);
    return slotCurrent===slotReplacement&&endCurrent===endReplacement&&removalSafe
  };
  const countPlanned=()=>{const counts=new Map();for(const slot of slots)for(const store of slot.route)counts.set(storeKey(store),(counts.get(storeKey(store))||0)+1);return counts};
  const canUse=(store,slot)=>{
    if(!slot.mutable)return false;const id=storeKey(store),ld=lockFor(store.id,slot.weekKey),ad=apptFor(store.id,parseISO(slot.weekKey));
    if((ld&&ld!==slot.day)||(ad&&ad!==slot.day))return false;if(imposed[id])return false;
    /* Un magasin déjà présent dans la journée (occurrence figée RDV/verrou) n'y est jamais posé une seconde fois. */
    if(slot.route.some(row=>storeKey(row)===id))return false;
    try{return !needOn(store,slot.date).blocked}catch(e){return false}
  };
  const loadPenalty=rows=>rows.reduce((n,row)=>n+Math.pow(routeCreditCost(row.route,credit),2),0);
  let insertions=0,moves=0,swaps=0,replacements=0;

  /* Construction complémentaire : le meilleur palier métier plaçable gagne toujours ; la
     géographie et la charge ne départagent qu'ensuite. */
  for(let guard=0;guard<Math.min(60,ranked.length);guard++){
    const planned=countPlanned(),openWeeks=new Set();
    for(const week of weeks){if(week.manual)continue;const count=(weekSlots.get(week.weekKey)||[]).reduce((n,slot)=>n+slot.route.length,0);if(count<target)openWeeks.add(week.weekKey)}
    if(!openWeeks.size)break;
    const candidates=ranked.filter(store=>!planned.has(storeKey(store))).map(store=>{
      let bestRank=0;for(const slot of slots)if(openWeeks.has(slot.weekKey)&&canUse(store,slot))bestRank=Math.max(bestRank,businessAt(store,slot.date));
      return{store,bestRank,fresh:memory.usedKeys&&memory.usedKeys.has(storeKey(store))?0:1,useCount:memory.useCount&&memory.useCount.get(storeKey(store))||0}
    }).filter(row=>row.bestRank>0).sort((a,b)=>b.bestRank-a.bestRank||b.fresh-a.fresh||a.useCount-b.useCount||String(storeKey(a.store)).localeCompare(String(storeKey(b.store)))).slice(0,CROSS_DAY_CANDIDATE_LIMIT);
    let best=null,bestTuple=null;
    for(const candidate of candidates){
      const tuple=[candidate.bestRank,candidate.fresh,-candidate.useCount];if(bestTuple&&compareTupleV264(tuple,bestTuple)<0)break;
      for(const slot of slots){
        if(!openWeeks.has(slot.weekKey)||!canUse(candidate.store,slot))continue;
        const before=metric(slot.route,slot),trial=slot.route.concat([candidate.store]);if(routeCreditCost(trial,credit)>max)continue;
        const after=metric(trial,slot);if(!after.feasible)continue;
        const score=(after.driveMinutes-before.driveMinutes)+4*(Math.pow(after.credits,2)-Math.pow(before.credits,2)),signature=slot.date+'|'+storeKey(candidate.store)+'|'+after.signature,row={candidate,slot,after,score,kmDelta:after.kilometers-before.kilometers,signature};
        if(!best||compareTupleV264(tuple,bestTuple)>0||compareTupleV264(tuple,bestTuple)===0&&(row.score<best.score-CROSS_DAY_EPSILON||Math.abs(row.score-best.score)<=CROSS_DAY_EPSILON&&(row.kmDelta<best.kmDelta-CROSS_DAY_EPSILON||Math.abs(row.kmDelta-best.kmDelta)<=CROSS_DAY_EPSILON&&row.signature<best.signature))){best=row;bestTuple=tuple}
      }
    }
    if(!best)break;best.slot.route=best.after.route;insertions++
  }

  function findBestMove(){
    let best=null;
    for(const source of slots){if(!source.mutable||source.route.length<= (source.initialNonEmpty?1:0))continue;
      for(let index=0;index<source.route.length;index++){
        const store=source.route[index];if(fixedReason(source,store))continue;
        for(const destination of slots){if(destination===source||destination.weekKey!==source.weekKey||!canUse(store,destination))continue;
          if(!moveBusinessSafe(store,source,destination)||!delaySafeMove(store,source.date,destination.date))continue;
          const sourceRoute=source.route.filter((_,i)=>i!==index),destinationRoute=destination.route.concat([store]);if(routeCreditCost(destinationRoute,credit)>max)continue;
          const before=[metric(source.route,source),metric(destination.route,destination)],after=[metric(sourceRoute,source),metric(destinationRoute,destination)];
          const gain=localImprovementV264(before,after,loadPenalty([source,destination]),Math.pow(after[0].credits,2)+Math.pow(after[1].credits,2));if(!gain)continue;
          const row={source,destination,sourceRoute:after[0].route,destinationRoute:after[1].route,...gain,signature:'move|'+source.date+'|'+destination.date+'|'+storeKey(store)};if(betterLocalV264(row,best))best=row
        }
      }
    }
    return best
  }
  function findBestDelayMove(){
    const currentDelay=currentScheduleDelay();if(!Number.isFinite(baselineDelayLimit)||currentDelay<=baselineDelayLimit)return null;let best=null;
    for(const source of slots){if(!source.mutable||source.route.length<=(source.initialNonEmpty?1:0))continue;
      for(let index=0;index<source.route.length;index++){const store=source.route[index];if(fixedReason(source,store))continue;
        for(const destination of slots){if(destination===source||destination.weekKey!==source.weekKey||destination.date>=source.date||!canUse(store,destination)||!moveBusinessSafe(store,source,destination))continue;
          const delayDelta=serviceDelay(store,destination.date)-serviceDelay(store,source.date);if(delayDelta>=0)continue;
          const sourceRoute=source.route.filter((_,i)=>i!==index),destinationRoute=destination.route.concat([store]);if(routeCreditCost(destinationRoute,credit)>max)continue;
          const before=[metric(source.route,source),metric(destination.route,destination)],after=[metric(sourceRoute,source),metric(destinationRoute,destination)];if(!after.every(row=>row.feasible))continue;
          const driveDelta=after.reduce((n,row)=>n+row.driveMinutes,0)-before.reduce((n,row)=>n+row.driveMinutes,0),kmDelta=after.reduce((n,row)=>n+row.kilometers,0)-before.reduce((n,row)=>n+row.kilometers,0),signature='delay|'+source.date+'|'+destination.date+'|'+storeKey(store),row={source,destination,sourceRoute:after[0].route,destinationRoute:after[1].route,delayDelta,driveDelta,kmDelta,signature};
          if(!best||row.delayDelta<best.delayDelta||row.delayDelta===best.delayDelta&&(row.driveDelta<best.driveDelta-CROSS_DAY_EPSILON||Math.abs(row.driveDelta-best.driveDelta)<=CROSS_DAY_EPSILON&&(row.kmDelta<best.kmDelta-CROSS_DAY_EPSILON||Math.abs(row.kmDelta-best.kmDelta)<=CROSS_DAY_EPSILON&&row.signature<best.signature)))best=row
        }
      }
    }
    return best
  }
  function findBestProjectionMove(){
    if(!projection)return null;let best=null;
    for(const source of slots){if(!source.mutable||source.route.length<=(source.initialNonEmpty?1:0))continue;
      for(let index=0;index<source.route.length;index++){const store=source.route[index];if(fixedReason(source,store))continue;
        for(const destination of slots){if(destination===source||destination.weekKey!==source.weekKey||destination.date<=source.date||!canUse(store,destination)||!moveBusinessSafe(store,source,destination)||!delaySafeMove(store,source.date,destination.date))continue;
          const beforeProjection=projectedBusiness(store,source.date),afterProjection=projectedBusiness(store,destination.date);if(afterProjection>=beforeProjection)continue;
          const sourceRoute=source.route.filter((_,i)=>i!==index),destinationRoute=destination.route.concat([store]);if(routeCreditCost(destinationRoute,credit)>max)continue;
          const before=[metric(source.route,source),metric(destination.route,destination)],after=[metric(sourceRoute,source),metric(destinationRoute,destination)];if(!after.every(row=>row.feasible))continue;
          const delay=Math.round((parseISO(destination.date)-parseISO(source.date))/86400000),driveDelta=after.reduce((n,row)=>n+row.driveMinutes,0)-before.reduce((n,row)=>n+row.driveMinutes,0),kmDelta=after.reduce((n,row)=>n+row.kilometers,0)-before.reduce((n,row)=>n+row.kilometers,0),signature='project|'+source.date+'|'+destination.date+'|'+storeKey(store),row={source,destination,sourceRoute:after[0].route,destinationRoute:after[1].route,delay,afterProjection,driveDelta,kmDelta,signature};
          if(!best||row.delay<best.delay||row.delay===best.delay&&(row.afterProjection<best.afterProjection||row.afterProjection===best.afterProjection&&(row.driveDelta<best.driveDelta-CROSS_DAY_EPSILON||Math.abs(row.driveDelta-best.driveDelta)<=CROSS_DAY_EPSILON&&(row.kmDelta<best.kmDelta-CROSS_DAY_EPSILON||Math.abs(row.kmDelta-best.kmDelta)<=CROSS_DAY_EPSILON&&row.signature<best.signature))))best=row
        }
      }
    }
    return best
  }
  function findBestProjectionSwap(){
    if(!projection)return null;let best=null;
    for(let ai=0;ai<slots.length;ai++){const a=slots[ai];if(!a.mutable)continue;
      for(let bi=ai+1;bi<slots.length;bi++){const b=slots[bi];if(!b.mutable||a.date===b.date)continue;
        for(let i=0;i<a.route.length;i++){const one=a.route[i];if(fixedReason(a,one)||!canUse(one,b))continue;
          for(let j=0;j<b.route.length;j++){const two=b.route[j];if(fixedReason(b,two)||!canUse(two,a)||storeKey(one)===storeKey(two)||!swapBusinessSafe(one,a,two,b)||!delaySafeSwap(one,a.date,b.date,two,b.date,a.date))continue;
            const beforeProjection=projectedBusiness(one,a.date)+projectedBusiness(two,b.date),afterProjection=projectedBusiness(one,b.date)+projectedBusiness(two,a.date);if(afterProjection>=beforeProjection)continue;
            const ar=a.route.slice(),br=b.route.slice();ar[i]=two;br[j]=one;if(routeCreditCost(ar,credit)>max||routeCreditCost(br,credit)>max)continue;
            const before=[metric(a.route,a),metric(b.route,b)],after=[metric(ar,a),metric(br,b)];if(!after.every(row=>row.feasible))continue;
            const gap=Math.round(Math.abs(parseISO(b.date)-parseISO(a.date))/86400000),driveDelta=after.reduce((n,row)=>n+row.driveMinutes,0)-before.reduce((n,row)=>n+row.driveMinutes,0),kmDelta=after.reduce((n,row)=>n+row.kilometers,0)-before.reduce((n,row)=>n+row.kilometers,0),signature='project-swap|'+a.date+'|'+b.date+'|'+storeKey(one)+'|'+storeKey(two),row={a,b,ar:after[0].route,br:after[1].route,gap,afterProjection,driveDelta,kmDelta,signature};
            if(!best||row.gap<best.gap||row.gap===best.gap&&(row.afterProjection<best.afterProjection||row.afterProjection===best.afterProjection&&(row.driveDelta<best.driveDelta-CROSS_DAY_EPSILON||Math.abs(row.driveDelta-best.driveDelta)<=CROSS_DAY_EPSILON&&(row.kmDelta<best.kmDelta-CROSS_DAY_EPSILON||Math.abs(row.kmDelta-best.kmDelta)<=CROSS_DAY_EPSILON&&row.signature<best.signature))))best=row
          }
        }
      }
    }
    return best
  }
  function findBestSwap(){
    let best=null;
    for(let ai=0;ai<slots.length;ai++){const a=slots[ai];if(!a.mutable)continue;
      for(let bi=ai+1;bi<slots.length;bi++){const b=slots[bi];if(!b.mutable)continue;
        for(let i=0;i<a.route.length;i++){const one=a.route[i];if(fixedReason(a,one)||!canUse(one,b))continue;
          for(let j=0;j<b.route.length;j++){const two=b.route[j];if(fixedReason(b,two)||!canUse(two,a)||storeKey(one)===storeKey(two))continue;
            if(!swapBusinessSafe(one,a,two,b)||!delaySafeSwap(one,a.date,b.date,two,b.date,a.date))continue;
            const ar=a.route.slice(),br=b.route.slice();ar[i]=two;br[j]=one;if(routeCreditCost(ar,credit)>max||routeCreditCost(br,credit)>max)continue;
            const before=[metric(a.route,a),metric(b.route,b)],after=[metric(ar,a),metric(br,b)];
            const gain=localImprovementV264(before,after,loadPenalty([a,b]),Math.pow(after[0].credits,2)+Math.pow(after[1].credits,2));if(!gain)continue;
            const row={a,b,ar:after[0].route,br:after[1].route,...gain,signature:'swap|'+a.date+'|'+b.date+'|'+storeKey(one)+'|'+storeKey(two)};if(betterLocalV264(row,best))best=row
          }
        }
      }
    }
    return best
  }
  function findBestReplacement(){
    const planned=countPlanned(),available=ranked.filter(store=>!planned.has(storeKey(store))),fresh=store=>memory.usedKeys&&memory.usedKeys.has(storeKey(store))?0:1;let best=null;
    for(const slot of slots){if(!slot.mutable)continue;
      for(let index=0;index<slot.route.length;index++){
        const current=slot.route[index];if(fixedReason(slot,current))continue;
        const pool=available.filter(store=>fresh(store)===fresh(current)&&canUse(store,slot)&&replacementBusinessSafe(current,store,slot)).slice(0,CROSS_DAY_CANDIDATE_LIMIT);
        for(const replacement of pool){const trial=slot.route.slice();trial[index]=replacement;if(routeCreditCost(trial,credit)>max)continue;
          const before=[metric(slot.route,slot)],after=[metric(trial,slot)];
          const gain=localImprovementV264(before,after,Math.pow(before[0].credits,2),Math.pow(after[0].credits,2));if(!gain)continue;
          const row={slot,route:after[0].route,current,replacement,...gain,signature:'replace|'+slot.date+'|'+storeKey(current)+'|'+storeKey(replacement)};if(betterLocalV264(row,best))best=row
        }
      }
    }
    return best
  }
  let iterations=0;
  for(;iterations<CROSS_DAY_MAX_PASSES;iterations++){
    let changed=false,delayMove=findBestDelayMove();if(delayMove){delayMove.source.route=delayMove.sourceRoute;delayMove.destination.route=delayMove.destinationRoute;moves++;changed=true}
    const projectionMove=findBestProjectionMove();if(projectionMove){projectionMove.source.route=projectionMove.sourceRoute;projectionMove.destination.route=projectionMove.destinationRoute;moves++;changed=true}
    const projectionSwap=findBestProjectionSwap();if(projectionSwap){projectionSwap.a.route=projectionSwap.ar;projectionSwap.b.route=projectionSwap.br;swaps++;changed=true}
    const move=findBestMove();if(move){move.source.route=move.sourceRoute;move.destination.route=move.destinationRoute;moves++;changed=true}
    const swap=findBestSwap();if(swap){swap.a.route=swap.ar;swap.b.route=swap.br;swaps++;changed=true}
    const replacement=findBestReplacement();if(replacement){replacement.slot.route=replacement.route;replacements++;changed=true}
    if(!changed){iterations++;break}
  }
  for(const slot of slots)slot.week.plan[slot.day]=slot.route.slice();
  const afterMetrics=totals(),afterSignature=slots.map(slot=>slot.weekKey+'|'+slot.day+':'+slot.route.map(storeKey).join(',')).join(';');
  return{applied:true,owner:'terrain-planning-v1.js',algorithm:'bounded-greedy-local-search',changed:beforeSignature!==afterSignature,insertions,moves,swaps,replacements,iterations,evaluations,needEvaluations,businessBaselineDelay:Number.isFinite(baselineDelayLimit)?baselineDelayLimit:null,businessFinalDelay:currentScheduleDelay(),fixedDays:slots.filter(slot=>!!slot.hardReason).length,fixedVisits:slots.reduce((n,slot)=>n+slot.route.filter(store=>!!fixedReason(slot,store)).length,0),refused:refusal,bounds:{maxPasses:CROSS_DAY_MAX_PASSES,candidateLimit:CROSS_DAY_CANDIDATE_LIMIT},before:{driveMinutes:beforeMetrics.driveMinutes,kilometers:beforeMetrics.kilometers},after:{driveMinutes:afterMetrics.driveMinutes,kilometers:afterMetrics.kilometers}}
}
function prepareCrossDayAllocationV264(weeks,state,days,reservations){
  const geography=root.StoreRunnerGeographyV185;if(!geography||typeof geography.rebalance!=='function')return false;
  const overnight=new Set();for(const row of Object.values(reservations||{})){if(row&&row.fromDate)overnight.add(String(row.fromDate));if(row&&row.toDate)overnight.add(String(row.toDate))}
  const reference=(weeks||[]).map(week=>Object.assign({},week,{plan:copy(week.plan),frozenDays:(week.frozenDays||[]).slice()}));let prepared=false;
  for(let index=0;index<(weeks||[]).length;index++){const week=weeks[index],baseline=reference[index];if(!week||week.manual)continue;const mon=parseISO(week.weekKey),frozen=new Set(week.frozenDays||[]);
    for(const day of DAYS)if(overnight.has(iso(addDays(mon,DAYS.indexOf(day)))))frozen.add(day);
    try{const historical=geography.rebalance(baseline.plan,{weekKey:week.weekKey,days,preferNearFirst:true,frozenDays:Array.from(frozen),preserveImposed:false});if(historical&&historical.ok){baseline.plan=historical.plan;week.plan=copy(historical.plan);prepared=true}}catch(e){}
  }
  return{prepared,businessBaselineWeeks:reference}
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
/* V263 — le cycle 3 semaines part du besoin réel de visite (visit-coverage.js), fourni par
   `options.needOf(store, dateIso)` → { tier, blocked, ratio, status }.
   Ordre de décision : contraintes explicites (verrous, rendez-vous, imposés) → besoin réel
   (très en retard, puis jamais visité, puis en retard, puis bientôt dû, puis à jour) → rotation
   V243 (magasins frais puis les moins récemment planifiés) → distance (escargot). Un magasin
   visité trop récemment pour sa fréquence (`blocked`) n'est jamais repris automatiquement.
   `options.today` + `options.existingPlanFor(weekKey)` : les journées déjà passées d'une
   semaine entamée sont conservées telles quelles, et une visite faite aujourd'hui reste
   sur aujourd'hui. Sans ces options, le cycle est exactement celui d'avant V263. */
function buildThreeWeekSnail(options){
  const state=options.state,first=monday(options.firstMonday),days=(options.days||[]).filter(d=>DAYS.includes(d)),target=Math.max(1,Number(options.target)||20),max=Math.max(1,Number(options.maxCreditsPerDay)||4),archive=options.archive||{},distance=options.distanceOf||(()=>Infinity),priority=options.priorityOf||(()=>0),credit=options.creditOf||(()=>1),lockFor=options.lockDayForWeek||(()=>''),apptFor=options.appointmentDay||(()=>''),fits=options.dayFits||(()=>true),blocked=options.dayBlocked||(()=>false),imposed=state&&state.included||{};
  const needOf=typeof options.needOf==='function'?options.needOf:null,today=/^\d{4}-\d{2}-\d{2}$/.test(String(options.today||''))?String(options.today):'',existingPlanFor=typeof options.existingPlanFor==='function'?options.existingPlanFor:null,completedOn=typeof options.completedOn==='function'?options.completedOn:(()=>false);
  if(!days.length)throw new Error('Choisis au moins un jour travaillé.');
  const ranked=rankStoresForSnail((options.stores||[]).filter(Boolean),distance,priority),used=new Set(),weeks=[],unknownGps=new Set(ranked.filter(s=>!validStoreGps(s)).map(storeKey));
  const byId=new Map(ranked.map(s=>[String(s.id),s]));
  /* V243 : calculée une seule fois pour tout le cycle, à partir de l'archive telle qu'elle
     est avant cette génération. Les 3 semaines du cycle se partagent ensuite cette même
     lecture du passé — used (déjà existant) suffit à empêcher les doublons entre elles. */
  const memory=rotationMemory(ranked,iso(first),target,archive);
  const refOf=mon=>{const key=iso(mon);return today&&today>key?today:key};
  const needMemo=new Map(),needAt=(s,ref)=>{
    if(!needOf)return{tier:3,blocked:false,ratio:null,status:''};
    const k=storeKey(s)+'|'+ref;if(!needMemo.has(k)){let n=null;try{n=needOf(s,ref)}catch(e){n=null}needMemo.set(k,n||{tier:3,blocked:false})}
    return needMemo.get(k);
  };
  const recentlySkipped=new Set();
  for(let wi=0;wi<3;wi++){
    const mon=addDays(first,wi*7),weekKey=iso(mon),protectedPlan=protectedPlanFor(weekKey,state,archive),ref=refOf(mon);
    const dateOf=day=>iso(addDays(mon,DAYS.indexOf(day)));
    const frozenDays=today&&existingPlanFor?DAYS.filter(day=>dateOf(day)<today):[],frozenSet=new Set(frozenDays);
    if(protectedPlan){
      const activeDaysProtected=days.filter(day=>!frozenSet.has(day)&&!blocked(dateOf(day)));
      const extra=needOf?{needAt:s=>needAt(s,ref),imposed,countDays:activeDaysProtected.concat(frozenDays)}:undefined;
      const completedPlan=completeProtectedWeek(protectedPlan,activeDaysProtected,mon,weekKey,target,ranked,used,max,credit,fits,lockFor,apptFor,extra);
      for(const s of flattenPlan(completedPlan))used.add(storeKey(s));
      const diagnostics=weekDistributionDiagnostics({mon,days,activeDays:days,plan:completedPlan,target,max,ranked,used,weekPlaced:new Set(flattenPlan(completedPlan).map(storeKey)),credit,fits,manual:true,frozenDays});
      weeks.push({weekKey,plan:completedPlan,manual:true,unplaced:[],diagnostics,frozenDays});
      continue
    }
    const plan=emptyPlan(),weekPlaced=new Set(),unplaced=[];
    let frozenCount=0;
    /* V263.1 : la visite faite aujourd'hui est conservée même quand aucune journée n'est
       encore passée (régénération un lundi) ; seul le figeage dépend de frozenDays. */
    if(today&&existingPlanFor){
      const existing=existingPlanFor(weekKey)||{};
      /* Une journée passée reste telle quelle. Seule une visite réellement faite retire le
         magasin du reste du cycle : une visite ratée reste due les semaines suivantes. */
      for(const day of frozenDays)for(const raw of (existing[day]||[])){
        const s=byId.get(String(raw&&raw.id))||raw,k=storeKey(s);if(!k||weekPlaced.has(k))continue;
        plan[day].push(s);weekPlaced.add(k);if(completedOn(s.id,dateOf(day)))used.add(k);frozenCount++;
      }
      /* Aujourd'hui n'est pas figé, mais une visite déjà faite aujourd'hui y reste. */
      const todayName=DAYS.find(day=>dateOf(day)===today);
      if(todayName)for(const raw of (existing[todayName]||[])){
        const s=byId.get(String(raw&&raw.id))||raw,k=storeKey(s);if(!k||weekPlaced.has(k)||!completedOn(s.id,today))continue;
        /* Un jour inactif (non travaillé, bloqué par l'agenda) n'est pas compté par count() :
           la visite gardée compte alors dans l'objectif comme une journée figée. */
        plan[todayName].push(s);weekPlaced.add(k);used.add(k);if(!days.includes(todayName)||blocked(today))frozenCount++;
      }
    }
    const activeDays=days.filter(day=>!frozenSet.has(day)&&!blocked(dateOf(day))),weekTarget=Math.max(0,target-frozenCount),quotas=dayQuotas(activeDays,weekTarget);
    const count=()=>flattenPlan(plan,activeDays).length+frozenCount;
    /* V263.1 : un magasin est candidat s'il n'est plus bloqué au dernier jour actif de la
       semaine (un hebdo visité vendredi est trop tôt lundi mais dû le vendredi suivant). Il
       n'est ensuite posé que sur un jour où il n'est pas bloqué. `blocked` ne repasse
       jamais de faux à vrai sans nouvelle visite : un magasin libre dès `ref` l'est toute la
       semaine, et son classement reste celui de `ref`. Les autres sont classés au premier
       jour où ils redeviennent proposables. */
    const lastRef=activeDays.length?dateOf(activeDays[activeDays.length-1]):ref,refAt=day=>{const d=dateOf(day);return today&&today>d?today:d};
    const freeOn=s=>activeDays.filter(day=>!needAt(s,refAt(day)).blocked);
    const rankNeed=s=>{const n=needAt(s,ref);if(!n.blocked)return n;const day=freeOn(s)[0];return day?needAt(s,refAt(day)):n};
    const candidates=ranked.filter(s=>{if(!needAt(s,lastRef).blocked)return true;const k=storeKey(s);if(!used.has(k)&&!weekPlaced.has(k))recentlySkipped.add(k);return false});
    const skippedThisWeek=ranked.length-candidates.length;
    if(!activeDays.length){const diagnostics=weekDistributionDiagnostics({mon,days,activeDays,plan,target,max,ranked:candidates,used,weekPlaced,credit,fits,frozenDays,recentlyVisited:skippedThisWeek});weeks.push({weekKey,plan,manual:false,unplaced,diagnostics,frozenDays});continue}
    const place=s=>{
      const open=new Set(freeOn(s));
      for(const day of orderedPlacementDays(activeDays,plan,quotas,credit)){
        if(!open.has(day))continue;
        const trial=plan[day].concat([s]),cost=trial.reduce((n,x)=>n+Math.max(1,Number(credit(x))||1),0);
        if(cost>max||!fits(trial,day,mon))continue;
        plan[day]=trial;const k=storeKey(s);weekPlaced.add(k);used.add(k);return true;
      }
      return false;
    };
    const forced=[];
    for(const s of ranked){
      const ld=lockFor(s.id,weekKey),ad=apptFor(s.id,mon),day=ad||ld;
      if(day&&activeDays.includes(day))forced.push({store:s,day});
      else if(!day&&imposed[s.id])forced.push({store:s,day:''});
    }
    for(const item of forced){
      const s=item.store,k=storeKey(s);if(weekPlaced.has(k))continue;
      const candidateDays=item.day?[item.day]:orderedPlacementDays(activeDays,plan,quotas,credit);
      let placed=false;
      for(const day of candidateDays){
        const trial=plan[day].concat([s]),cost=trial.reduce((n,x)=>n+Math.max(1,Number(credit(x))||1),0);
        if(cost>max||!fits(trial,day,mon))continue;
        plan[day]=trial;weekPlaced.add(k);used.add(k);placed=true;break;
      }
      if(!placed)throw new Error((s.enseigne||'Magasin')+' '+(s.ville||'')+' ne tient pas dans la semaine malgré sa contrainte. Le planning précédent est conservé.');
    }
    /* V263 : un palier de besoin après l'autre. Sans besoin connu, un seul palier : on
       retrouve exactement les deux passes V243 ci-dessous. V263.3 : les paliers sont ceux
       que la couverture donne (jamais visité 3,5 entre retard 3 et très en retard 4, P1 en
       quart de palier), dans l'ordre décroissant où `needOrdered` les a rangés ; la garde
       (palier 0) n'est jamais parcourue. */
    const ordered=needOf?needOrdered(candidates,rankNeed):candidates;
    const tiers=needOf?Array.from(new Set(ordered.map(s=>rankNeed(s).tier))).filter(t=>Number.isFinite(t)&&t>0):[null];
    for(const tier of tiers){
      if(count()>=target)break;
      const group=tier==null?ordered:ordered.filter(s=>rankNeed(s).tier===tier);
      /* V243 — palier 1 « frais » : magasins jamais vus dans la fenêtre de rotation
         (memory.usedKeys), dans l'ordre existant (priorité puis distance). Un magasin
         déjà utilisé récemment n'est plus reproposé tant qu'il reste un magasin frais. */
      for(const s of group){
        if(count()>=target)break;
        const k=storeKey(s);if(used.has(k)||weekPlaced.has(k)||memory.usedKeys.has(k))continue;
        if(!place(s))unplaced.push(s);
      }
      /* V243 — palier 2 « rotation » : on reprend ceux déjà utilisés, du moins récemment
         vu au plus récemment vu, pour qu'aucun magasin ne reste durablement hors rotation. */
      if(count()<target){
        const due=sortByLeastRecentlyUsed(group.filter(s=>{const k=storeKey(s);return !used.has(k)&&!weekPlaced.has(k)}),memory);
        for(const s of due){
          if(count()>=target)break;
          if(!place(s))unplaced.push(s);
        }
      }
    }
    const diagnostics=weekDistributionDiagnostics({mon,days,activeDays,plan,target,max,ranked:candidates,used,weekPlaced,credit,fits,frozenDays,recentlyVisited:skippedThisWeek});weeks.push({weekKey,plan,manual:false,unplaced,diagnostics,frozenDays});
  }
  const projectedNeedAt=needOf&&typeof needOf.projectedAfterVisit==='function'?(store,visitDate,ref)=>needOf.projectedAfterVisit(store,visitDate,ref):null;
  const reservations=options.overnightReservations||state&&state.hotelReservations||{};
  let preparation=null;if(options.crossDayEnabled!==false){const prepare=typeof options.prepareCrossDayWeeks==='function'?options.prepareCrossDayWeeks:(rows=>prepareCrossDayAllocationV264(rows,state,days,reservations));try{preparation=prepare(weeks)||null}catch(e){preparation=null}}
  const crossDay=optimizeThreeWeekCrossDay(weeks,Object.assign({},options,{state,days,target,maxCreditsPerDay:max,ranked,memory,needAt,projectedNeedAt,businessBaselineWeeks:preparation&&preparation.businessBaselineWeeks||null,completedOn,creditOf:credit,lockDayForWeek:lockFor,appointmentDay:apptFor,dayFits:fits,dayBlocked:blocked,overnightReservations:reservations}));
  const finalUsed=new Set(weeks.flatMap(w=>flattenPlan(w.plan).map(storeKey)));
  for(const week of weeks){
    const mon=parseISO(week.weekKey),frozenDays=week.frozenDays||[],frozenSet=new Set(frozenDays),activeDays=days.filter(day=>!frozenSet.has(day)&&!blocked(iso(addDays(mon,DAYS.indexOf(day))))),weekPlaced=new Set(flattenPlan(week.plan).map(storeKey));
    week.diagnostics=weekDistributionDiagnostics({mon,days,activeDays,plan:week.plan,target,max,ranked,used:finalUsed,weekPlaced,credit,fits,manual:!!week.manual,frozenDays,recentlyVisited:recentlySkipped.size})
  }
  const dayRows=weeks.flatMap(w=>(w.diagnostics||[]).filter(d=>d.status==='planned'||d.status==='empty')),emptyWorkDays=dayRows.filter(d=>d.status==='empty');
  const out={weeks,uniqueStores:finalUsed.size,totalVisits:weeks.reduce((n,w)=>n+flattenPlan(w.plan).length,0),unknownGps:unknownGps.size,dayCoverage:{planned:dayRows.filter(d=>d.status==='planned').length,active:dayRows.length,empty:emptyWorkDays.length},emptyWorkDays,crossDay};
  /* V263 — ce que le cycle n'a pas pu couvrir, dit clairement : magasins en retard ou jamais
     visités restés hors des 3 semaines faute de capacité, et magasins écartés parce qu'ils
     viennent d'être visités. */
  if(needOf){
    const firstRef=refOf(first),name=s=>((s.enseigne||'Magasin')+' '+(s.ville||'')).trim(),coverage={needAware:true,uncoveredLate:[],uncoveredNever:[],recentlyVisited:[]};
    for(const s of ranked){
      const k=storeKey(s);if(finalUsed.has(k))continue;
      const n=needAt(s,firstRef);
      if(recentlySkipped.has(k)&&n.blocked)coverage.recentlyVisited.push(name(s));
      else if(n.status==='late')coverage.uncoveredLate.push(name(s));
      else if(n.status==='never')coverage.uncoveredNever.push(name(s));
    }
    out.coverage=coverage;
  }
  return out;
}
function refreshThreeWeekDiagnostics(weeks,state=root.state){
  const days=currentDays(state),target=Math.max(1,Number(state&&state.settings&&state.settings.target)||20),max=Math.max(1,Number(state&&state.settings&&state.settings.maxVisitsPerDay)||4),pool=((state&&state.stores)||[]).filter(s=>included(s,state)),ranked=rankStoresForSnail(pool,distanceOf,s=>performancePlanningBoost(s,state)),used=new Set(),planningDiagnostics=[];
  for(const week of (weeks||[])){
    const mon=parseISO(week&&week.weekKey)||new Date(),plan=week&&week.plan||emptyPlan(),frozenDays=Array.isArray(week&&week.frozenDays)?week.frozenDays:[],activeDays=days.filter(day=>!frozenDays.includes(day)&&!dateBlocked(iso(addDays(mon,DAYS.indexOf(day))),state)),placed=flattenPlan(plan),weekPlaced=new Set(placed.map(storeKey));
    for(const s of placed)used.add(storeKey(s));
    const diagnostics=weekDistributionDiagnostics({mon,days,activeDays,plan,target,max,ranked,used,weekPlaced,credit:visitCredit,fits:(route,day,wm)=>dayFits(route,day,state,wm),manual:!!(week&&week.manual),frozenDays});
    if(week)week.diagnostics=diagnostics;
    planningDiagnostics.push({weekKey:String(week&&week.weekKey||''),days:diagnostics});
  }
  const dayRows=planningDiagnostics.flatMap(w=>(w.days||[]).filter(d=>d.status==='planned'||d.status==='empty')),emptyWorkDays=dayRows.filter(d=>d.status==='empty');
  return{planningDiagnostics,dayCoverage:{planned:dayRows.filter(d=>d.status==='planned').length,active:dayRows.length,empty:emptyWorkDays.length},emptyWorkDays};
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
function performancePlanningBoost(store,state=root.state){try{const P=root.StoreRunnerPerformanceV190,storage=db();if(P&&typeof P.planningBoost==='function')return Math.max(0,Number(P.planningBoost(storage,store&&store.id,(state&&state.stores)||[]))||0)}catch(e){}return 0}
function roadDistanceV264(a,b){
  try{const api=root.StoreRunnerRoadMatrixV248;if(api&&typeof api.distanceKm==='function'){const n=Number(api.distanceKm(a,b));if(Number.isFinite(n)&&n>=0)return n}}catch(e){}
  try{const n=Number(root.hav(a,b));return Number.isFinite(n)&&n>=0?n*1.22:Infinity}catch(e){return Infinity}
}
function evaluateDayRouteV264(route,day,weekKey,state=root.state){
  const rows=(route||[]).slice(),optimizer=root.StoreRunnerRouteOptimizerV251;let result=null;
  try{if(optimizer&&typeof optimizer.explainOptimization==='function')result=optimizer.explainOptimization(rows,day,state,{weekMonday:weekKey})}catch(e){result=null}
  const ordered=result&&Array.isArray(result.route)&&sameStoreMembersV264(rows,result.route)?result.route.slice():rows;
  let feasible=result&&result.after&&typeof result.after.feasible==='boolean'?result.after.feasible:null;
  if(feasible==null){try{feasible=dayFits(ordered,day,state,parseISO(weekKey))}catch(e){feasible=false}}
  const kilometers=routeKilometersV264(ordered,iso(addDays(parseISO(weekKey),DAYS.indexOf(day))),state,{distanceBetween:roadDistanceV264,overnightReservations:state&&state.hotelReservations||{}});
  let driveMinutes=Number(result&&result.after&&result.after.driveMinutes);if(!Number.isFinite(driveMinutes))driveMinutes=Number.isFinite(kilometers)?kilometers/55*60:Infinity;
  return{route:ordered,feasible:!!feasible,driveMinutes,kilometers,estimatedEnd:result&&result.after&&result.after.estimatedEnd,waitMinutes:result&&result.after&&result.after.waitMinutes}
}
function currentDays(state=root.state){return ((state.settings&&state.settings.days)||DAYS.slice(0,5)).filter(d=>DAYS.includes(d))}
function upcomingWorkMonday(now=new Date()){
  const d=new Date(now),base=monday(d),day=d.getDay();
  /* Le mode escargot prépare les semaines à venir. Le lundi courant n'est retenu que
     si on lance la génération le lundi ; du mardi au dimanche, on part au lundi suivant. */
  return day===1?base:addDays(base,7);
}
/* V239 : la génération principale du planning est le cycle 3 semaines. Le bouton
   « Générer mes 3 semaines » transmet explicitement la semaine sélectionnée dans le
   planning ; c'est elle qui devient la première semaine du cycle.
   Les deux règles historiques restent derrière, pour tout appel sans semaine imposée :
   une date de début saisie à la main dans « Planifier plusieurs semaines » gagne, sinon
   on part du prochain lundi travaillé. Une semaine simplement héritée de l'état ne suffit
   toujours pas à faire sauter ce lundi. */
function resolveSnailStart(state=root.state,doc=root.document,now=new Date(),requestedStart){
  const asked=parseISO(String((requestedStart&&requestedStart.start)||requestedStart||'').trim());
  if(asked)return monday(asked);
  const get=id=>doc&&typeof doc.getElementById==='function'?doc.getElementById(id):null;
  const rangeStart=get('rangeStart');
  const explicitlyChosen=!!(rangeStart&&rangeStart.dataset&&rangeStart.dataset.snailUserEdited==='1');
  if(explicitlyChosen){const chosen=parseISO(String(rangeStart.value||'').trim());if(chosen)return monday(chosen)}
  return upcomingWorkMonday(now);
}
function syncPlanningControlsForSnail(state=root.state,requestedStart){
  const first=resolveSnailStart(state,root.document,new Date(),requestedStart),start=iso(first),end=iso(addDays(first,20));
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
  const rows=range&&Array.isArray(range.overnightReport)?range.overnightReport:[],hours=range&&range.hoursReport,distribution=range&&Array.isArray(range.planningDiagnostics)?range.planningDiagnostics:[];
  const coverageText=coverageSummaryText(range&&range.coverage,'');
  if(!rows.length&&!hours&&!distribution.length&&!coverageText){box.hidden=true;box.innerHTML='';return false}
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
  if(distribution.length){
    html+='<div style="margin-top:9px;padding-top:9px;border-top:1px solid #eef1f5"><b style="color:#344054">📅 Répartition</b>';
    for(const week of distribution){const active=(week.days||[]).filter(d=>d.status==='planned'||d.status==='empty'),covered=active.filter(d=>d.status==='planned').length,empty=active.filter(d=>d.status==='empty'),parts=String(week.weekKey||'').split('-'),label=parts.length===3?parts[2]+'/'+parts[1]:week.weekKey;html+='<div style="margin-top:6px"><b>Semaine du '+label+'</b> · '+covered+'/'+active.length+' jours travaillés couverts'+(empty.length?' · '+empty.map(d=>d.day+' vide : '+d.reason).join(' ; '):'')+'</div>'}
    html+='</div>';
  }
  if(coverageText){const safe=coverageText.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));html+='<div style="margin-top:9px;padding-top:9px;border-top:1px solid #eef1f5"><b style="color:#344054">🎯 Couverture</b><div>'+safe+'</div></div>'}
  box.innerHTML=html;box.hidden=false;return true;
}
function renderStoredInsights(){try{const storage=db(),range=storage&&JSON.parse(storage.getItem(RANGE_KEY)||'null');return renderTerrainInsights(range)}catch(e){return false}}
function visitedOnLegacy(state,id,date){
  const legacy=state&&state.visits&&state.visits[String(id)];
  if(legacy&&(String(legacy.lastVisit||'')===date||(Array.isArray(legacy.history)&&legacy.history.some(d=>String(d||'')===date))))return true;
  const rows=state&&state.businessV2&&Array.isArray(state.businessV2.visits)?state.businessV2.visits:[];
  return rows.some(v=>String(v&&v.storeId)===String(id)&&v.status==='completed'&&String(v.completedDate||'').slice(0,10)===date);
}
/* V263 : ce que le cycle a volontairement laissé de côté, en une phrase. */
function coverageSummaryText(coverage,prefix){
  if(!coverage||!coverage.needAware)return'';
  const parts=[],n=(x,one,many)=>x+' '+(x>1?many:one);
  if(coverage.recentlyVisited.length)parts.push(n(coverage.recentlyVisited.length,'magasin visité trop récemment écarté','magasins visités trop récemment écartés'));
  if(coverage.uncoveredLate.length)parts.push(n(coverage.uncoveredLate.length,'magasin en retard reste','magasins en retard restent')+' hors de ces 3 semaines faute de capacité ('+coverage.uncoveredLate.slice(0,3).join(', ')+(coverage.uncoveredLate.length>3?'…':'')+')');
  if(coverage.uncoveredNever.length)parts.push(n(coverage.uncoveredNever.length,'magasin jamais visité reste','magasins jamais visités restent')+' à placer');
  return parts.length?(prefix||'')+parts.join(' · '):'';
}
async function generateThreeWeekSnail(options){
  const state=root.state,R=root.ChefReliability,storage=db();
  if(!state||!R||typeof R.capture!=='function'||typeof R.persist!=='function')throw new Error('Protection des données indisponible.');
  /* V263 : la semaine affichée avant génération sert de référence pour les journées déjà
     passées ; elle est lue avant que la date de départ du cycle ne soit réécrite. */
  const shownWeekKey=iso(monday(parseISO(String((state.settings&&state.settings.weekDate)||'').slice(0,10))||new Date())),shownPlan=copy(state.plan||{});
  const first=syncPlanningControlsForSnail(state,options);
  if(!validBase(state))throw new Error('Définis d’abord le GPS de ton point de départ dans Mon secteur.');
  const days=currentDays(state),report=summarizeTerrainPool(state.stores||[],state),pool=(state.stores||[]).filter(s=>included(s,state));
  if(!pool.length)throw new Error('Aucun magasin actif ne correspond aux filtres.');
  /* V239 : le verrou du bouton pendant la génération appartient au bouton principal,
     donc à planning-generation-controller.js. Ce moteur ne pilote plus que son statut. */
  const status=root.document&&root.document.getElementById('terrainSnailStatus');if(status)status.textContent='Vivier : '+report.planifiable+' planifiables · '+report.withoutGps+' GPS à vérifier · '+report.imposed+' imposés. Agenda puis génération…';
  const calendarSynced=await syncCalendar(first,state);
  const archive=JSON.parse(storage.getItem(ARCHIVE_KEY)||'{}')||{};
  const coverageApi=root.StoreRunnerVisitCoverage,needOf=coverageApi&&typeof coverageApi.needOf==='function'?coverageApi.needOf(state):null;
  const visitDays=coverageApi&&typeof coverageApi.visitDays==='function'?coverageApi.visitDays(state):null;
  const completedOn=(id,date)=>visitDays?(visitDays.get(String(id))||[]).includes(date):visitedOnLegacy(state,id,date);
  const existingPlanFor=key=>key===shownWeekKey?shownPlan:((archive[key]&&archive[key].plan)||null);
  const hasRealVisitHistory=!!(visitDays&&Array.from(visitDays.values()).some(rows=>Array.isArray(rows)&&rows.length));
  const built=buildThreeWeekSnail({needOf,today:iso(new Date()),existingPlanFor,completedOn,crossDayEnabled:hasRealVisitHistory,state,firstMonday:first,days,target:Number(state.settings.target)||20,maxCreditsPerDay:Number(state.settings.maxVisitsPerDay)||4,stores:pool,archive,distanceOf,distanceBetween:roadDistanceV264,evaluateDayRoute:(route,day,weekKey)=>evaluateDayRouteV264(route,day,weekKey,state),overnightReservations:state.hotelReservations||{},priorityOf:(store)=>performancePlanningBoost(store,state),creditOf:visitCredit,lockDayForWeek:lockDay,appointmentDay,dayBlocked:(date)=>dateBlocked(date,state),dayFits:(route,day,mon)=>dayFits(route,day,state,mon)});
  if(!built.totalVisits)throw new Error(built.coverage&&built.coverage.recentlyVisited.length?'Aucune visite à proposer : les magasins éligibles viennent tous d’être visités ('+built.coverage.recentlyVisited.length+'). Le planning précédent est conservé.':'Aucune visite ne tient dans les 3 semaines avec les réglages actuels.');
  const overnightReport=analyzeOvernightWeeks(built.weeks,state),hoursReport=summarizeOpeningHours(built.weeks,state);
  R.checkpoint('Avant génération 3 semaines escargot',storage);
  const bundle=R.capture(state,storage);
  for(const week of built.weeks){
    if(week.manual)continue;
    bundle.archive[week.weekKey]={weekMonday:week.weekKey,plan:Object.fromEntries(DAYS.map(d=>[d,(week.plan[d]||[]).map(cloneStore)])),manualEdited:false,generatedMode:built.crossDay&&built.crossDay.applied?'cross-day-v264':'snail-distance-v1',updatedAt:new Date().toISOString()};
    if(built.crossDay&&built.crossDay.applied)bundle.archive[week.weekKey].crossDayOptimized='v264';
    /* V185 et V251 lisent ce repère pour ne jamais réorganiser une journée passée. */
    if(week.frozenDays&&week.frozenDays.length)bundle.archive[week.weekKey].frozenDays=week.frozenDays.slice();
  }
  const firstWeek=built.weeks[0];bundle.state.settings.weekDate=firstWeek.weekKey;bundle.state.plan=Object.fromEntries(DAYS.map(d=>[d,(firstWeek.plan[d]||[]).map(s=>canonicalStore(s.id,bundle.state)||s)]));
  bundle.range={start:firstWeek.weekKey,end:iso(addDays(first,20)),weeks:3,workDays:days,uniqueStores:built.uniqueStores,totalVisits:built.totalVisits,rotation:built.crossDay&&built.crossDay.applied?'cross-day-v264':'snail-distance-v1',calendarSynced,poolReport:report,overnightReport,hoursReport,planningDiagnostics:built.weeks.map(w=>({weekKey:w.weekKey,days:w.diagnostics||[]})),dayCoverage:built.dayCoverage,coverage:built.coverage||null,crossDayReport:built.crossDay&&built.crossDay.applied?built.crossDay:null,updatedAt:new Date().toISOString()};
  R.persist(bundle,storage);if(storage&&typeof storage.flush==='function')await storage.flush();root.state=bundle.state;
  try{if(typeof root.initControls==='function')root.initControls();if(typeof root.renderAll==='function')root.renderAll()}catch(e){}
  root.dispatchEvent(new CustomEvent('chef-range-generated',{detail:{start:firstWeek.weekKey,end:bundle.range.end,weeks:3,workDays:days,uniqueStores:built.uniqueStores,mode:built.crossDay&&built.crossDay.applied?'cross-day-v264':'snail-distance-v1'}}));
  root.document&&root.document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'three-week-snail',weekDate:firstWeek.weekKey}}));
  if(status)status.textContent='3 semaines escargot : '+built.totalVisits+' visites · '+built.uniqueStores+' magasins distincts · '+built.dayCoverage.planned+'/'+built.dayCoverage.active+' jours travaillés couverts'+(built.emptyWorkDays.length?' · '+built.emptyWorkDays.length+' jour'+(built.emptyWorkDays.length>1?'s':'')+' vide'+(built.emptyWorkDays.length>1?'s':'')+' expliqué'+(built.emptyWorkDays.length>1?'s':''):'')+' · vivier '+report.planifiable+' planifiables'+(report.imposed?' · '+report.imposed+' imposé'+(report.imposed>1?'s':''):'')+(report.withoutGps?' · '+report.withoutGps+' GPS à vérifier':'')+(hoursReport.unknown?' · '+hoursReport.unknown+' horaires à vérifier':'')+coverageSummaryText(built.coverage,' · ')+'.';
  renderTerrainInsights(bundle.range);built.poolReport=report;built.overnightReport=overnightReport;built.hoursReport=hoursReport;
  return built;
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
/* V239 : le cycle 3 semaines est devenu la génération standard, déclenchée par le bouton
   principal du planning. L'ancienne action escargot séparée n'a donc plus de raison
   d'exister dans « Planifier plusieurs semaines » : elle faisait doublon.
   Ce module n'y laisse que le compte rendu du dernier cycle — statut et diagnostics —
   sans bouton ni séparateur orphelin. */
function installThreeWeekReport(){
  const host=root.document&&root.document.querySelector('#rangePlannerCard .planningChoiceBody');if(!host)return false;
  const rangeStart=root.document.getElementById('rangeStart');
  if(rangeStart&&rangeStart.dataset&&!rangeStart.dataset.snailTracked){
    rangeStart.dataset.snailTracked='1';
    const mark=()=>{rangeStart.dataset.snailUserEdited='1'};
    rangeStart.addEventListener('input',mark);rangeStart.addEventListener('change',mark);
  }
  /* Un shell déjà en cache peut encore porter l'ancien bouton : on le retire au lieu de
     laisser deux entrées de génération coexister. */
  const legacy=root.document.getElementById('terrainSnailBtn');
  if(legacy&&legacy.parentNode)legacy.parentNode.removeChild(legacy);
  if(!root.document.getElementById('terrainSnailStatus')){
    const status=root.document.createElement('div');status.id='terrainSnailStatus';status.className='tiny';status.style.marginTop='7px';
    status.textContent='Compte rendu du dernier cycle 3 semaines · rotation escargot, du plus proche du départ vers le plus loin.';
    host.appendChild(status);
  }
  ensureInsightsBox();renderStoredInsights();return true;
}
function installStartButton(){
  const actions=root.document&&root.document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;
  if(root.document.getElementById('startQuickStoreFirstBtn'))return true;
  const btn=root.document.createElement('button');btn.id='startQuickStoreFirstBtn';btn.type='button';btn.className='secondary';btn.textContent='▶ Commencer par ici';btn.title='Garde les mêmes visites mais place ce magasin en premier dans la journée.';btn.onclick=async()=>{const start=root.document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;if(!id)return showError('Ouvre ce magasin depuis le planning.');btn.disabled=true;try{const result=await startDayWithStore(id);if(typeof root.closeStoreQuick==='function')root.closeStoreQuick();const s=canonicalStore(id);const text=result.unchanged?'Ce magasin est déjà le premier de '+result.day+'.':(s.enseigne+' '+s.ville+' devient le premier magasin de '+result.day+'.');const st=root.document.getElementById('rangePlanStatus');if(st)st.textContent=text}catch(e){showError(e.message||String(e))}finally{btn.disabled=false}};
  const change=root.document.getElementById('changeQuickStoreBtn');actions.insertBefore(btn,change||actions.firstChild);return true;
}
function install(){installThreeWeekReport();installStartButton()}
function boot(){install();root.document&&root.document.addEventListener('store-runner:planning-updated',()=>{install();renderStoredInsights()});root.document&&root.document.addEventListener('store-runner:data-restored',()=>{install();renderStoredInsights()})}
const api={coverageSummaryText,needOrdered,rankStoresByDistance,rankStoresForSnail,dayQuotas,orderedPlacementDays,weekDistributionDiagnostics,performancePlanningBoost,reorderDayFromStore,summarizeTerrainPool,buildThreeWeekSnail,optimizeThreeWeekCrossDay,evaluateDayRouteV264,completeProtectedWeek,rotationWindowWeeks,rotationMemory,refreshThreeWeekDiagnostics,resolveSnailStart,dayFits,dateBlocked,overnightForPlan,analyzeOvernightWeeks,summarizeOpeningHours,generateThreeWeekSnail,startDayWithStore,install};root.StoreRunnerTerrainPlanningV1=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
})(typeof window!=='undefined'?window:globalThis);
