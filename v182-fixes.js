(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';
const V185_REMOTE_MIN_KM=55;
const V185_MANDATORY_MIN_SAVING_KM=20;
const V185_CLUSTER_LINK_KM=55;
let repairing=false;

function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function clone(v){return JSON.parse(JSON.stringify(v))}
function storage(){try{return window.__chefStorage||window.localStorage||null}catch(e){return null}}
function loadArchive(){try{const s=storage();return s?JSON.parse(s.getItem(ARCHIVE_KEY)||'{}')||{}:{}}catch(e){return{}}}
function saveArchive(archive){try{const s=storage();if(s)s.setItem(ARCHIVE_KEY,JSON.stringify(archive||{}))}catch(e){console.warn('Archive planning non enregistrée',e)}}
function currentWeekKey(){try{return iso(monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()))}catch(e){return''}}
function resolveStore(s){try{return (state.stores||[]).find(x=>String(x.id)===String(s&&s.id))||s}catch(e){return s}}

/* Android / Chrome peut terminer le rendu de l'accueil après sector-pilotage.js. Le
   module Pilotage écoute déjà les clics [data-pilotage] au niveau document : il suffit
   donc de garantir la présence du bouton une fois le menu Plus réellement créé. */
function ensurePilotageShortcut(){
  const grid=document.querySelector('#moreSheetV2 .moreSheetGrid');
  if(!grid||grid.querySelector('[data-pilotage]')||!window.StoreRunnerSectorPilotage)return false;
  const b=document.createElement('button');b.type='button';b.dataset.pilotage='1';b.textContent='▥ Pilotage';
  grid.insertBefore(b,grid.firstChild);return true;
}
/* V183 : Pilotage reste accessible depuis Plus / trois points, mais il ne doit plus
   occuper une carte dédiée sur l'accueil. On enlève aussi une éventuelle carte héritée
   d'un rendu précédent, puis les événements de rendu maintiennent cette règle. */
function removeHomePilotageShortcut(){
  let removed=false;
  try{document.querySelectorAll('#premiumHomeV2 .phPilotageShortcut').forEach(node=>{if(node&&typeof node.remove==='function'){node.remove();removed=true}})}catch(e){}
  return removed;
}
/* V234 : le voile de démarrage a un seul propriétaire, le chargeur de index.html.
   Ce module ne le touche plus : deux modules qui retirent le même écran à des moments
   différents, c'est exactement ce qui laissait apparaître l'ancienne interface. */
function repairMobileRuntime(){
  if(repairing)return false;repairing=true;
  try{
    const ready=!!document.getElementById('premiumHomeV2');
    ensurePilotageShortcut();
    removeHomePilotageShortcut();
    return ready;
  }finally{repairing=false}
}

function safeDistance(a,b){
  try{const n=Number(hav(a,b));return Number.isFinite(n)?Math.max(0,n):Infinity}catch(e){return Infinity}
}
function homePoint(){try{return baseObj()}catch(e){return null}}
function homeDistance(store){const b=homePoint();return b?safeDistance(b,store):Infinity}
function routeKmV185(route){
  if(!route||!route.length)return 0;const b=homePoint();if(!b)return Infinity;
  let km=safeDistance(b,route[0]);for(let i=1;i<route.length;i++)km+=safeDistance(route[i-1],route[i]);km+=safeDistance(route[route.length-1],b);return km
}
function minDistanceToRoute(store,route){let best=Infinity;for(const s of (route||[]))best=Math.min(best,safeDistance(store,s));return best}
function routeHasRemote(route){return (route||[]).some(s=>homeDistance(s)>=V185_REMOTE_MIN_KM)}
function optimizeRouteV185(route){
  try{if(typeof window.nearestRoute==='function'&&typeof window.twoOpt==='function')return window.twoOpt(window.nearestRoute(route));if(typeof window.nearestRoute==='function')return window.nearestRoute(route)}catch(e){}
  return (route||[]).slice()
}
function planningCreditV185(store){
  try{if(typeof window.storeVisitCredit==='function')return Math.max(1,Number(window.storeVisitCredit(store))||1)}catch(e){}
  return 1
}
function routeCreditsV185(route){return (route||[]).reduce((n,s)=>n+planningCreditV185(s),0)}
function clock(v){const p=String(v||'').split(':');return (+p[0]||0)*60+(+p[1]||0)}
function dayFitsV185(route,day,mon){
  try{const api=window.StoreOpeningHoursV1;if(api&&typeof api.routeFits==='function')return !!api.routeFits(route,day,state,{weekMonday:mon})}catch(e){}
  try{
    if(typeof window.routeWorkMinutes!=='function')return true;
    const settings=state.settings||{},start=clock(day==='Samedi'?(settings.saturdayStart||'08:00'):(settings.startTime||'08:30')),end=clock(day==='Samedi'?(settings.saturdayEnd||'12:00'):(settings.endTime||'18:00'));
    return start+Number(window.routeWorkMinutes(route)||0)<=end+0.001
  }catch(e){return true}
}
function eventBlocksPlanningV185(e){
  if(!e)return false;if(e.inferredAway)return true;
  let text='';try{text=String((e.title||'')+' '+(e.location||'')+' '+(e.calendar||'')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}catch(x){}
  const hard=['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'];
  const holiday=/\bferies?\b/.test(text)||/\bpublic holidays?\b/.test(text);
  return hard.some(x=>text.includes(x))||holiday||/\bparis\b/.test(text)||!!(e.planningBlock&&!e.allDay)
}
function dayBlockedV185(date){
  try{if(typeof window.calendarEventsForDate==='function')return (window.calendarEventsForDate(date)||[]).some(eventBlocksPlanningV185)}catch(e){}
  try{return (state.calendarEvents||[]).filter(e=>String(e.date||String(e.start||'').slice(0,10))===date).some(eventBlocksPlanningV185)}catch(e){return false}
}
function lockDayV185(id,weekKey){
  try{if(typeof window.storeRunnerLockDayForWeek==='function'){const d=window.storeRunnerLockDayForWeek(id,weekKey);if(DAYS.includes(d))return d}}catch(e){}
  const raw=state.locks&&state.locks[String(id)];if(typeof raw==='string')return DAYS.includes(raw)?raw:'';
  if(raw&&typeof raw==='object'&&DAYS.includes(raw.day)&&(!raw.week||String(raw.week)===String(weekKey)))return raw.day;return''
}
function appointmentDayV185(id,mon){
  try{for(const a of (state.appointments||[])){if(String(a&&a.storeId)!==String(id))continue;const d=parse(String(a.date||'').slice(0,10));if(!d||iso(monday(d))!==iso(mon))continue;const idx=(d.getDay()||7)-1;return DAYS[idx]||''}}catch(e){}return''
}
function visitedOnV185(id,date){
  try{const v=state.visits&&state.visits[String(id)];if(v&&(String(v.lastVisit||'')===date||(Array.isArray(v.history)&&v.history.some(x=>String(x)===date))))return true}catch(e){}
  try{return !!(state.businessV2&&Array.isArray(state.businessV2.visits)&&state.businessV2.visits.some(v=>String(v&&v.storeId)===String(id)&&String(v&&v.status)==='completed'&&String((v&&v.completedDate)||(v&&v.completedAt)||'').slice(0,10)===date))}catch(e){return false}
}
function signatureFor(plan,days){return (days||DAYS).map(d=>d+':'+((plan&&plan[d])||[]).map(s=>String(s&&s.id||'')).join(',')).join('|')}
function sameStoreIds(a,b,days){
  const ids=p=>(days||DAYS).flatMap(d=>((p&&p[d])||[]).map(s=>String(s&&s.id||''))).filter(Boolean).sort();return JSON.stringify(ids(a))===JSON.stringify(ids(b))
}
function candidateScoreV185(plan,day,store,trial,workDays){
  const current=plan[day]||[],before=routeKmV185(current),after=routeKmV185(trial);let score=(Number.isFinite(after)?after:99999)-(Number.isFinite(before)?before:0);
  const near=minDistanceToRoute(store,current);if(current.length&&Number.isFinite(near))score+=Math.min(120,near)*0.35;
  score+=routeCreditsV185(current)*1.5;
  if(homeDistance(store)>=V185_REMOTE_MIN_KM){
    const idx=workDays.indexOf(day);for(const delta of [-1,1]){const other=workDays[idx+delta];if(!other)continue;const r=plan[other]||[];if(!r.length||!routeHasRemote(r))continue;const d=minDistanceToRoute(store,r);if(d<=V185_CLUSTER_LINK_KM)score-=25+(V185_CLUSTER_LINK_KM-d)*0.45}
  }
  return score
}
function rebalancePlanByGeography(plan,options){
  options=options||{};if(!window.state||!plan)return{ok:false,plan:plan||{},changed:false,reason:'no-state'};
  const preserveImposed=options.preserveImposed!==false;
  /* Lot 3B : `fixedVisits` ({id magasin: jour}, facultatif) fige une visite posée par la génération
     pour une échéance du brief, comme un verrou : elle reste exactement sur son jour, réordonnable
     dans sa journée, jamais déplacée, retirée ni dupliquée. Sans l'option, rien ne change. */
  const fixedVisits=options.fixedVisits&&typeof options.fixedVisits==='object'?options.fixedVisits:null,fixedVisitDay=id=>fixedVisits&&DAYS.includes(fixedVisits[id])?fixedVisits[id]:'';
  const workDays=(options.days||selectedWorkDays()).filter(d=>DAYS.includes(d)),weekKey=String(options.weekKey||currentWeekKey()),mon=parse(weekKey)||monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()),max=Math.max(1,Math.min(8,Number(state.settings&&state.settings.maxVisitsPerDay)||4));
  if(!workDays.length||!homePoint())return{ok:false,plan,changed:false,reason:'no-days-or-base'};
  /* V263 : `frozenDays` (journées déjà passées d'une semaine entamée, posées par le cycle
     3 semaines) restent exactement telles quelles et ne reçoivent aucun magasin. */
  const frozen=new Set((Array.isArray(options.frozenDays)?options.frozenDays:[]).filter(d=>workDays.includes(d))),movableDays=workDays.filter(d=>!frozen.has(d));
  /* V263.1 : même garde que le cycle 3 semaines. Une visite libre n'est déplacée que vers un
     jour où son magasin n'est pas bloqué (visit-coverage.js). Imposés, verrous et
     rendez-vous passent outre, comme partout. Un magasin bloqué sur tous les jours
     déplaçables (posé avant V263 ou à la main) garde le comportement historique. */
  const coverage=window.StoreRunnerVisitCoverage,needFn=coverage&&typeof coverage.needOf==='function'?(()=>{try{return coverage.needOf(state)}catch(e){return null}})():null,todayIso=iso(new Date());
  const blockedOnDay=(store,day)=>{if(!needFn||!store||(state.included&&state.included[store.id]))return false;try{const date=iso(addDays(mon,DAYS.indexOf(day)));return !!needFn(resolveStore(store),date<todayIso?todayIso:date).blocked}catch(e){return false}};
  const openDays=new Map(),mayGo=(store,day)=>{const id=String(store&&store.id||'');if(!openDays.has(id)){const open=movableDays.filter(d=>!blockedOnDay(store,d));openDays.set(id,open.length?new Set(open):null)}const open=openDays.get(id);return !open||open.has(day)};
  const out=Object.fromEntries(DAYS.map(d=>[d,movableDays.includes(d)?[]:clone((plan&&plan[d])||[])])),free=[],seen=new Set(),origin={},fixedIds=new Set();
  for(const day of workDays)if(frozen.has(day))for(const store of ((plan&&plan[day])||[])){const id=String(store&&store.id||'');if(id){seen.add(id);fixedIds.add(id)}}
  for(const day of movableDays)for(const store of ((plan&&plan[day])||[])){const id=String(store&&store.id||'');if(!id||seen.has(id))continue;seen.add(id);origin[id]=day;let fixed=lockDayV185(id,weekKey)||appointmentDayV185(id,mon)||fixedVisitDay(id)||((preserveImposed&&state.included&&state.included[id])?day:'')||(visitedOnV185(id,iso(addDays(mon,DAYS.indexOf(day))))?day:'');if(fixed&&frozen.has(fixed))fixed=day;if(fixed){if(!workDays.includes(fixed))return{ok:false,plan,changed:false,reason:'fixed-outside'};out[fixed].push(store);fixedIds.add(id)}else free.push(store)}
  for(const day of movableDays){out[day]=optimizeRouteV185(out[day]);if(routeCreditsV185(out[day])>max||!dayFitsV185(out[day],day,mon))return{ok:false,plan,changed:false,reason:'fixed-capacity'}}
  const sortDirection=options.preferNearFirst?1:-1;
  free.sort((a,b)=>sortDirection*(homeDistance(a)-homeDistance(b))||DAYS.indexOf(origin[String(a.id)])-DAYS.indexOf(origin[String(b.id)]));
  for(const store of free){
    let best=null;for(const day of movableDays){const date=iso(addDays(mon,DAYS.indexOf(day)));if(dayBlockedV185(date)||!mayGo(store,day))continue;const current=out[day]||[];if(routeCreditsV185(current)+planningCreditV185(store)>max)continue;const trial=optimizeRouteV185(current.concat([store]));if(!dayFitsV185(trial,day,mon))continue;const score=candidateScoreV185(out,day,store,trial,workDays);if(!best||score<best.score-0.001||(Math.abs(score-best.score)<0.001&&DAYS.indexOf(day)<DAYS.indexOf(best.day)))best={day,trial,score}}
    if(!best)return{ok:false,plan,changed:false,reason:'unplaced',store};out[best.day]=best.trial
  }
  /* V220 : V185 optimise les kilomètres après le moteur escargot. Il n'a plus le droit
     de gagner quelques kilomètres en compactant 12 visites sur trois jours si le plan
     source couvrait déjà les cinq jours. On répare uniquement les jours que le moteur
     amont avait réellement couverts ; une journée volontairement vide (cible < nombre
     de jours) reste donc vide. Les visites fixes ne sont jamais déplacées. */
  const coverageDays=movableDays.filter(day=>((plan&&plan[day])||[]).length>0&&!dayBlockedV185(iso(addDays(mon,DAYS.indexOf(day))))),coverageSet=new Set(coverageDays);
  for(const target of coverageDays){
    if((out[target]||[]).length)continue;
    let bestMove=null;
    for(const donor of movableDays){
      const donorRoute=out[donor]||[],minimum=coverageSet.has(donor)?1:0;if(donorRoute.length<=minimum)continue;
      for(let i=0;i<donorRoute.length;i++){
        const store=donorRoute[i],id=String(store&&store.id||'');if(!id||fixedIds.has(id)||!mayGo(store,target))continue;
        const donorTrial=optimizeRouteV185(donorRoute.filter((_,idx)=>idx!==i)),targetTrial=optimizeRouteV185((out[target]||[]).concat([store]));
        if(routeCreditsV185(targetTrial)>max||routeCreditsV185(donorTrial)>max)continue;
        if(!dayFitsV185(targetTrial,target,mon)||!dayFitsV185(donorTrial,donor,mon))continue;
        const beforeA=routeKmV185(donorRoute),beforeB=routeKmV185(out[target]||[]),afterA=routeKmV185(donorTrial),afterB=routeKmV185(targetTrial);
        const score=(Number.isFinite(afterA)?afterA:99999)+(Number.isFinite(afterB)?afterB:99999)-(Number.isFinite(beforeA)?beforeA:99999)-(Number.isFinite(beforeB)?beforeB:0),originMatch=origin[id]===target;
        if(!bestMove||(originMatch&&!bestMove.originMatch)||(originMatch===bestMove.originMatch&&(score<bestMove.score-0.001||(Math.abs(score-bestMove.score)<0.001&&DAYS.indexOf(donor)<DAYS.indexOf(bestMove.donor)))))bestMove={donor,donorTrial,targetTrial,score,originMatch};
      }
    }
    if(!bestMove)return{ok:false,plan,changed:false,reason:'coverage-unplaced',day:target};
    out[bestMove.donor]=bestMove.donorTrial;out[target]=bestMove.targetTrial;
  }
  for(const day of movableDays){out[day]=optimizeRouteV185(out[day]);if(routeCreditsV185(out[day])>max)return{ok:false,plan,changed:false,reason:'capacity-after'}}
  if(!sameStoreIds(plan,out,workDays))return{ok:false,plan,changed:false,reason:'store-integrity'};
  return{ok:true,plan:out,changed:signatureFor(plan,DAYS)!==signatureFor(out,DAYS),reason:'ok'}
}
async function persistGeoWeek(result,weekKey,source){
  if(!result||!result.ok||!result.changed)return false;
  try{if(window.ChefReliability&&typeof window.ChefReliability.checkpoint==='function')window.ChefReliability.checkpoint('Avant optimisation géographique V185',storage())}catch(e){}
  state.plan=Object.fromEntries(DAYS.map(d=>[d,((result.plan&&result.plan[d])||[]).map(resolveStore)]));
  try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){}
  const archive=loadArchive(),prev=archive[weekKey]||{weekMonday:weekKey};archive[weekKey]=Object.assign({},prev,{weekMonday:weekKey,plan:clone(result.plan),updatedAt:new Date().toISOString(),geographyOptimized:'v185'});saveArchive(archive);
  try{const s=storage();if(s&&typeof s.flush==='function')await s.flush()}catch(e){}
  try{if(typeof window.renderAll==='function')window.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}
  try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:source||'geo-v185',weekDate:weekKey}}))}catch(e){}
  return true
}
/* V263.1 : V184 (capacité), V185 (géographie) et V248 (matrice routière) enveloppent les
   mêmes générateurs. Chacun suit les liens de tous les autres : sans cela, une couche
   étrangère au-dessus rendait la sienne invisible et elle se réempilait à chaque
   événement planning, soit une passe géographique de plus par couche à chaque clic. */
function chainHas(fn,marker){let cur=fn,n=0;while(typeof cur==='function'&&n++<32){if(cur[marker])return true;cur=cur.__v185Original||cur.__v184Original||cur.__v182Original||cur.__v248Original||cur.__original||null}return false}
/* P0.4-B1 — une semaine retouchée à la main est un résultat final. Quand V211 répond
   `preservedManual` (ou que la semaine porte la marque manuelle, même lecture que V251),
   V185 ne rééquilibre rien, ne réordonne rien et n'écrit ni state.plan ni l'archive :
   state.manualWeekEdits reste la seule source de cette semaine et l'ordre manuel tient. */
function manualWeekV185(key){try{if(state.manualWeekEdits&&state.manualWeekEdits[key])return true;const snap=loadArchive()[key];return !!(snap&&snap.manualEdited)}catch(e){return false}}
/* P0.4-C1 — semaine entamée : comme pour le cycle 3 semaines, les journées déjà passées de la
   semaine en cours sont transmises en `frozenDays` et restent exactement telles quelles. Les
   autres semaines n'en ont aucune. */
function patchSingleWeekGeography(){
  const original=window.storeRunnerGenerateSingleWeek;if(typeof original!=='function'||chainHas(original,'__v185Geo'))return false;
  const wrapped=async function(){const previous=window.__storeRunnerPlanningGenerationActive;window.__storeRunnerPlanningGenerationActive=true;try{const out=await original.apply(this,arguments);if(out&&out.ok===true&&state&&state.plan){if(out.preservedManual===true||manualWeekV185(currentWeekKey())){out.geographyOptimized=false;return out}const wk=currentWeekKey(),today=iso(new Date()),frozenDays=wk===iso(monday(new Date()))?DAYS.filter(d=>iso(addDays(parse(wk),DAYS.indexOf(d)))<today):[];const geo=rebalancePlanByGeography(state.plan,{weekKey:wk,frozenDays});if(geo.ok&&geo.changed)await persistGeoWeek(geo,currentWeekKey(),'single-week-geo-v185');out.geographyOptimized=!!(geo&&geo.ok&&geo.changed)}return out}finally{window.__storeRunnerPlanningGenerationActive=previous}};
  wrapped.__v185Geo=true;wrapped.__v185Original=original;window.storeRunnerGenerateSingleWeek=wrapped;return true
}
function terrainOvernightRow(week){
  const a=overnightAnalysis(week&&week.plan);let best=null;if(a.candidate)best=a.candidate;else if(a.reason==='threshold')best=a.bestRemote||null;else if(a.mode==='never')best=a.bestRemote||a.best||null;
  return{weekKey:String(week&&week.weekKey||''),mode:a.mode,threshold:a.threshold,selected:!!a.candidate,reason:a.candidate?'selected':a.reason==='threshold'?'below-threshold':a.reason==='disabled'?'disabled':'no-candidate',best}
}
async function persistSnailGeography(result){
  if(!result||!Array.isArray(result.weeks)||!result.weeks.length)return false;
  const archive=loadArchive(),crossDay=!!(result.crossDay&&result.crossDay.applied);let changed=false;
  /* V264 : terrain-planning-v1.js possède désormais l'affectation entre journées sur les
     trois semaines. Repasser V185 semaine par semaine pourrait défaire un échange entre
     semaines ; V185 reste le repli des anciens appels sans couverture/évaluateur.
     Lot 3B : une visite posée pour une échéance du brief (result.deadlines, date du créneau posé)
     reste figée sur son jour dans sa semaine ; les autres magasins restent optimisés. Une
     obligation tenue sans visite générée (visite faite, contrainte existante) n'a pas de date. */
  const deadlineVisits=weekKey=>{const out={};let n=0;for(const d of (Array.isArray(result.deadlines)?result.deadlines:[])){const date=parse(String((d&&d.date)||''));if(!date||d.storeId==null||iso(monday(date))!==String(weekKey))continue;const day=DAYS[(date.getDay()||7)-1];if(day){out[String(d.storeId)]=day;n++}}return n?out:null};
  for(const week of result.weeks){if(!week||week.manual||crossDay)continue;const fixedVisits=deadlineVisits(week.weekKey),geo=rebalancePlanByGeography(week.plan,Object.assign({weekKey:week.weekKey,preferNearFirst:true,frozenDays:week.frozenDays},fixedVisits?{fixedVisits}:{}));if(!geo.ok)continue;if(geo.changed){week.plan=geo.plan;changed=true;const prev=archive[week.weekKey]||{weekMonday:week.weekKey};archive[week.weekKey]=Object.assign({},prev,{weekMonday:week.weekKey,plan:clone(geo.plan),manualEdited:false,generatedMode:'snail-distance-geo-v185',geographyOptimized:'v185',updatedAt:new Date().toISOString()})}}
  if(changed){saveArchive(archive);const first=result.weeks[0];if(first&&String(state.settings&&state.settings.weekDate||'')===String(first.weekKey||''))state.plan=Object.fromEntries(DAYS.map(d=>[d,((first.plan&&first.plan[d])||[]).map(resolveStore)]));try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){}}
  let finalDiagnostics=null,finalHours=null;
  try{const terrain=window.StoreRunnerTerrainPlanningV1;if(terrain&&typeof terrain.refreshThreeWeekDiagnostics==='function'){finalDiagnostics=terrain.refreshThreeWeekDiagnostics(result.weeks,state);result.dayCoverage=finalDiagnostics.dayCoverage;result.emptyWorkDays=finalDiagnostics.emptyWorkDays}if(terrain&&typeof terrain.summarizeOpeningHours==='function'){finalHours=terrain.summarizeOpeningHours(result.weeks,state);result.hoursReport=finalHours}}catch(e){console.warn('Diagnostic final escargot non recalculé',e)}
  const report=result.weeks.map(terrainOvernightRow);result.overnightReport=report;
  try{const s=storage(),range=s&&JSON.parse(s.getItem(RANGE_KEY)||'null');if(range){range.overnightReport=report;if(finalDiagnostics){range.planningDiagnostics=finalDiagnostics.planningDiagnostics;range.dayCoverage=finalDiagnostics.dayCoverage}if(finalHours)range.hoursReport=finalHours;range.rotation=crossDay?'cross-day-v264':'snail-distance-geo-v185';if(crossDay)range.crossDayReport=result.crossDay;range.updatedAt=new Date().toISOString();s.setItem(RANGE_KEY,JSON.stringify(range))}if(s&&typeof s.flush==='function')await s.flush()}catch(e){}
  if(changed){try{if(typeof window.renderAll==='function')window.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}}
  try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'snail-geo-v185',weekDate:String(result.weeks[0]&&result.weeks[0].weekKey||'')}}))}catch(e){}
  return changed
}
function patchThreeWeekGeography(){
  const api=window.StoreRunnerTerrainPlanningV1,original=api&&api.generateThreeWeekSnail;if(typeof original!=='function'||chainHas(original,'__v185Geo'))return false;
  const wrapped=async function(){const previous=window.__storeRunnerPlanningGenerationActive;window.__storeRunnerPlanningGenerationActive=true;try{const out=await original.apply(this,arguments);await persistSnailGeography(out);return out}finally{window.__storeRunnerPlanningGenerationActive=previous}};
  wrapped.__v185Geo=true;wrapped.__v185Original=original;api.generateThreeWeekSnail=wrapped;return true
}

/* Découché : le moteur historique faisait `seuil || 80`, donc un seuil explicite à 0 km
   redevenait 80 km. En automatique, une nuit n'est proposée que si les deux journées
   s'enchaînent réellement loin du domicile. En obligatoire, la demande explicite passe outre
   cette distance, mais la nuit doit relier deux journées consécutives et économiser au moins
   V185_MANDATORY_MIN_SAVING_KM : même règle que futureOvernightAnalysis (auto-planning-fix.js). */
function overnightThreshold(){
  try{const raw=state.profile&&state.profile.overnightMinSaving,n=Number(raw);return Number.isFinite(n)&&n>=0?n:80}catch(e){return 80}
}
function overnightAnalysis(plan){
  const profile=(window.state&&state.profile)||{},mode=profile.overnightMode||'auto',threshold=overnightThreshold();
  if(mode==='never')return{mode,threshold,candidate:null,reason:'disabled',best:null,bestRemote:null};
  const days=(state.settings&&Array.isArray(state.settings.days)&&state.settings.days.length?state.settings.days:DAYS.slice(0,5)).filter(d=>DAYS.includes(d));
  const source=plan||state.plan||{};let best=null,bestRemote=null,bestUseful=null;
  for(let i=0;i<days.length-1;i++){
    const a=source[days[i]]||[],b=source[days[i+1]]||[];if(!a.length||!b.length)continue;
    const last=a[a.length-1],first=b[0],home1=homeDistance(last),home2=homeDistance(first),direct=safeDistance(last,first),saving=home1+home2-direct;if(!Number.isFinite(saving))continue;
    const row={night:'Nuit '+days[i]+' → '+days[i+1],fromDay:days[i],toDay:days[i+1],last,first,saving,fromHome:home1,toHome:home2,remoteKm:Math.min(home1,home2)};
    if(!best||row.saving>best.saving)best=row;
    if(row.remoteKm>=V185_REMOTE_MIN_KM&&(!bestRemote||row.saving>bestRemote.saving))bestRemote=row;
    if(DAYS.indexOf(days[i+1])-DAYS.indexOf(days[i])===1&&row.saving>=V185_MANDATORY_MIN_SAVING_KM&&(!bestUseful||row.saving>bestUseful.saving))bestUseful=row
  }
  if(!best)return{mode,threshold,candidate:null,reason:'no-pair',best:null,bestRemote:null};
  if(mode==='mandatory')return bestUseful?{mode,threshold,candidate:bestUseful,reason:'candidate',best,bestRemote}:{mode,threshold,candidate:null,reason:'mandatory-no-useful',best,bestRemote};
  if(!bestRemote)return{mode,threshold,candidate:null,reason:'too-close',best,bestRemote:null};
  if(bestRemote.saving<threshold)return{mode,threshold,candidate:null,reason:'threshold',best,bestRemote};
  return{mode,threshold,candidate:bestRemote,reason:'candidate',best,bestRemote};
}
function mapsHotelUrl(s){
  try{if(typeof window.mapsHotelUrl==='function'&&window.mapsHotelUrl!==mapsHotelUrl)return window.mapsHotelUrl(s)}catch(e){}
  const q='hotel près de '+String((s&&s.adresse)||'')+' '+String((s&&s.ville)||'');return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q)
}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function renderOvernightV182(){
  const box=document.getElementById('overnightBox');if(!box||!window.state)return false;
  const a=overnightAnalysis();
  if(a.reason==='disabled'){box.innerHTML='<div class="notice">🌙 Découché désactivé dans <b>Secteur → Découché</b>. Choisis « Automatique si utile » ou « Obligatoire 1 fois/semaine » pour recevoir une proposition.</div>';return true}
  if(a.reason==='no-pair'){box.innerHTML='<div class="notice">🌙 Aucun découché possible sur cette semaine : il faut au moins deux jours de tournée à la suite avec des visites planifiées.</div>';return true}
  if(a.reason==='too-close'){box.innerHTML='<div class="notice">🌙 Aucun découché utile : les enchaînements actuels restent trop proches du domicile. Store Runner ne propose pas d’hôtel à moins de '+V185_REMOTE_MIN_KM+' km juste pour cocher une case.</div>';return true}
  if(a.reason==='mandatory-no-useful'){box.innerHTML='<div class="notice">🌙 Mode obligatoire actif, mais aucune paire de journées consécutives n’économise au moins '+V185_MANDATORY_MIN_SAVING_KM+' km. Aucun hôtel n’est forcé sans gain réel.</div>';return true}
  if(a.reason==='threshold'){
    box.innerHTML='<div class="notice">🌙 Aucun découché retenu : meilleur enchaînement éloigné ~<b>'+Math.max(0,Math.round(a.bestRemote.saving))+' km</b> économisés, seuil automatique réglé à <b>'+Math.round(a.threshold)+' km</b>. Le seuil se règle dans Secteur.</div>';return true
  }
  const o=a.candidate;if(!o)return false;
  box.innerHTML='<div class="overnight"><b>🌙 '+esc(o.night)+'</b><div class="meta">Fin près de '+esc((o.last.enseigne||'Magasin')+' '+(o.last.ville||''))+' · reprise vers '+esc(o.first.ville||'')+' · économie estimée ~'+Math.max(0,Math.round(o.saving))+' km · zone à ~'+Math.round(o.remoteKm)+' km du domicile.'+(a.mode==='mandatory'?' · Découché obligatoire activé.':'')+'</div><a target="_blank" rel="noopener" href="'+mapsHotelUrl(o.last)+'">Chercher les hôtels près de la fin de tournée ↗</a></div>';return true
}
/* V263.5 : #overnightBox n'a qu'un rendu, celui du propriétaire courant. auto-planning-fix.js
   (V189) redirige StoreRunnerOvernightV182.render vers le sien ; sans lui, c'est celui-ci. Les
   passes de réparation différées ne réécrivent donc plus le bandeau avec l'ancienne vue, qui
   effaçait la réservation d'hôtel et ignorait le filtre des nuits futures. */
function renderOvernightOwner(){const api=window.StoreRunnerOvernightV182,fn=api&&typeof api.render==='function'?api.render:renderOvernightV182;return fn()}
/* Stabilisation V264 : V184 et V182 réparent saveProfile sur les mêmes événements.
   La garde doit donc parcourir toute la chaîne commune, pas seulement la fonction de tête. */
function wrapOnce(name,wrapper){
  const original=window[name];if(typeof original!=='function'||chainHas(original,'__v182Wrapped'))return false;
  const wrapped=wrapper(original);wrapped.__v182Wrapped=true;wrapped.__v182Original=original;window[name]=wrapped;return true
}
function patchOvernight(){
  if(!window.state)return false;
  wrapOnce('overnightCandidate',()=>function(){return overnightAnalysis().candidate});
  wrapOnce('renderOvernight',original=>function(){let out;try{out=original.apply(this,arguments)}finally{renderOvernightOwner()}return out});
  wrapOnce('fillProfileForm',original=>function(){const out=original.apply(this,arguments);try{const input=document.getElementById('pSaving'),raw=state.profile&&state.profile.overnightMinSaving,n=Number(raw);if(input&&Number.isFinite(n)&&n>=0)input.value=String(n)}catch(e){}return out});
  wrapOnce('saveProfile',original=>function(){
    const input=document.getElementById('pSaving'),raw=input?String(input.value||'').trim():'',n=raw===''?NaN:Number(raw);const out=original.apply(this,arguments);
    if(Number.isFinite(n)&&n>=0&&state.profile&&Number(state.profile.overnightMinSaving)!==n){state.profile.overnightMinSaving=n;try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){}if(input)input.value=String(n)}
    renderOvernightOwner();return out
  });
  renderOvernightOwner();return true
}

/* Génération 3 jours : range-planner protège à juste titre les semaines manuelles, mais
   V181 marque aussi ses semaines recalculées comme manuelles. Pour une plage courte dans
   UNE semaine, on lève la protection uniquement le temps de la génération demandée puis
   on fusionne le résultat avec les jours hors plage. Rien hors des dates choisies n'est
   effacé. */
function selectedWorkDays(){
  const checked=[];try{document.querySelectorAll('[data-day]').forEach(e=>{if(e.checked&&DAYS.includes(e.value))checked.push(e.value)})}catch(e){}
  if(checked.length)return checked;try{return (state.settings.days||DAYS.slice(0,5)).filter(d=>DAYS.includes(d))}catch(e){return DAYS.slice(0,5)}
}
function mergeWeekPlan(mon,start,end,workDays,generated,previous){
  const out={};for(let i=0;i<DAYS.length;i++){const day=DAYS[i],date=addDays(mon,i),inside=date>=start&&date<=end&&workDays.includes(day),src=inside?((generated&&generated[day])||[]):((previous&&previous[day])||[]);out[day]=src.map(clone)}return out
}
function planForWeek(archive,key){
  const snap=archive&&archive[key];if(snap&&snap.plan)return clone(snap.plan);
  if(currentWeekKey()===key&&state.plan)return clone(state.plan);
  return Object.fromEntries(DAYS.map(d=>[d,[]]))
}
function outsideStoreIds(mon,start,end,workDays,plan){
  const ids=new Set();for(let i=0;i<DAYS.length;i++){const day=DAYS[i],date=addDays(mon,i),inside=date>=start&&date<=end&&workDays.includes(day);if(inside)continue;for(const s of ((plan&&plan[day])||[]))if(s&&s.id)ids.add(String(s.id))}return ids
}
async function runPartialRange(original,button,args){
  const startInput=document.getElementById('rangeStart'),endInput=document.getElementById('rangeEnd'),start=parse(startInput&&startInput.value),end=parse(endInput&&endInput.value);
  if(!start||!end||end<start||iso(monday(start))!==iso(monday(end)))return original.apply(button,args);
  const mon=monday(start),key=iso(mon),days=selectedWorkDays(),beforeArchive=loadArchive(),beforePlan=planForWeek(beforeArchive,key),manualEntry=state.manualWeekEdits&&state.manualWeekEdits[key],wasManual=!!((beforeArchive[key]&&beforeArchive[key].manualEdited)||manualEntry);
  const firstWork=days.map(d=>addDays(mon,DAYS.indexOf(d))).filter(d=>d>=start&&d<=end);if(!firstWork.length)return original.apply(button,args);
  if(wasManual&&!confirm('Cette période touche une semaine déjà modifiée ou recalculée.\n\nSeuls les jours compris entre '+iso(start)+' et '+iso(end)+' seront régénérés. Les autres jours resteront exactement comme ils sont. Continuer ?'))return;
  const s=storage(),savedManual=manualEntry?clone(manualEntry):null,tempArchive=clone(beforeArchive),oldExcluded={},outsideIds=outsideStoreIds(mon,start,end,days,beforePlan);
  if(tempArchive[key]){delete tempArchive[key].manualEdited;delete tempArchive[key].manualEditedAt}
  if(!state.excluded)state.excluded={};
  outsideIds.forEach(id=>{oldExcluded[id]={had:Object.prototype.hasOwnProperty.call(state.excluded,id),value:state.excluded[id]};state.excluded[id]=true});
  if(state.manualWeekEdits&&Object.prototype.hasOwnProperty.call(state.manualWeekEdits,key))delete state.manualWeekEdits[key];
  saveArchive(tempArchive);
  try{return await original.apply(button,args)}finally{
    const afterArchive=loadArchive(),generated=(afterArchive[key]&&afterArchive[key].plan)||Object.fromEntries(DAYS.map(d=>[d,[]])),merged=mergeWeekPlan(mon,start,end,days,generated,beforePlan),meta=Object.assign({},afterArchive[key]||beforeArchive[key]||{weekMonday:key},{weekMonday:key,plan:merged});
    if(wasManual){meta.manualEdited=true;meta.manualEditedAt=new Date().toISOString()}
    afterArchive[key]=meta;saveArchive(afterArchive);
    outsideIds.forEach(id=>{const old=oldExcluded[id];if(old&&old.had)state.excluded[id]=old.value;else delete state.excluded[id]});
    if(wasManual){state.manualWeekEdits=state.manualWeekEdits||{};state.manualWeekEdits[key]={at:new Date().toISOString(),plan:clone(merged)}}else if(savedManual){state.manualWeekEdits=state.manualWeekEdits||{};state.manualWeekEdits[key]=savedManual}
    if(currentWeekKey()===key)state.plan=Object.fromEntries(DAYS.map(d=>[d,(merged[d]||[]).map(resolveStore)]));
    try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){}
    try{if(s&&typeof s.flush==='function')await s.flush()}catch(e){}
    try{if(typeof window.renderAll==='function')window.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}
    try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'partial-range-v182',weekDate:key,start:iso(start),end:iso(end)}}))}catch(e){}
  }
}
function bindPartialRange(){
  const btn=document.getElementById('generateRangeBtn');if(!btn||btn.__v182PartialRange)return false;
  const original=typeof btn.onclick==='function'?btn.onclick:window.generatePlanningRange;if(typeof original!=='function')return false;
  btn.__v182PartialRange=true;btn.__v182Original=original;btn.onclick=function(){return runPartialRange(original,btn,arguments)};return true
}

function repairAll(){repairMobileRuntime();patchOvernight();patchSingleWeekGeography();patchThreeWeekGeography();bindPartialRange()}
function scheduledRepair(){window.setTimeout(repairAll,0)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduledRepair,{once:true});else scheduledRepair();
window.addEventListener('load',scheduledRepair,{once:true});
document.addEventListener('store-runner:home-rendered',scheduledRepair);
document.addEventListener('store-runner:planning-updated',scheduledRepair);
document.addEventListener('store-runner:data-restored',scheduledRepair);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduledRepair()});
[120,500,1200].forEach(ms=>window.setTimeout(repairAll,ms));
window.StoreRunnerOvernightV182={threshold:overnightThreshold,analyze:overnightAnalysis,render:renderOvernightV182};
window.StoreRunnerPartialRangeV182={mergeWeekPlan,run:runPartialRange,bind:bindPartialRange};
window.StoreRunnerGeographyV185={rebalance:rebalancePlanByGeography,eventBlocksPlanning:eventBlocksPlanningV185,routeKm:routeKmV185,homeDistance,patchSingle:patchSingleWeekGeography,patchThreeWeeks:patchThreeWeekGeography,remoteMinKm:V185_REMOTE_MIN_KM,mandatoryMinSavingKm:V185_MANDATORY_MIN_SAVING_KM};
window.storeRunnerRepairMobileRuntime=repairMobileRuntime;
})();
