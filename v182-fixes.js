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
function removeRuntimeBoot(){
  const boot=document.getElementById('srRuntimeBoot');if(!boot)return false;
  boot.classList.add('srRuntimeBootOut');
  window.setTimeout(()=>{if(boot&&boot.parentNode)boot.remove()},140);
  return true;
}
function repairMobileRuntime(){
  if(repairing)return false;repairing=true;
  try{
    const ready=!!document.getElementById('premiumHomeV2');
    ensurePilotageShortcut();
    removeHomePilotageShortcut();
    if(ready)removeRuntimeBoot();
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
  return hard.some(x=>text.includes(x))||/\bparis\b/.test(text)||!!(e.planningBlock&&!e.allDay)
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
  const workDays=(options.days||selectedWorkDays()).filter(d=>DAYS.includes(d)),weekKey=String(options.weekKey||currentWeekKey()),mon=parse(weekKey)||monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()),max=Math.max(1,Math.min(8,Number(state.settings&&state.settings.maxVisitsPerDay)||4));
  if(!workDays.length||!homePoint())return{ok:false,plan,changed:false,reason:'no-days-or-base'};
  const out=Object.fromEntries(DAYS.map(d=>[d,workDays.includes(d)?[]:clone((plan&&plan[d])||[])])),free=[],seen=new Set(),origin={};
  for(const day of workDays)for(const store of ((plan&&plan[day])||[])){const id=String(store&&store.id||'');if(!id||seen.has(id))continue;seen.add(id);origin[id]=day;const fixed=lockDayV185(id,weekKey)||appointmentDayV185(id,mon)||(visitedOnV185(id,iso(addDays(mon,DAYS.indexOf(day))))?day:'');if(fixed){if(!workDays.includes(fixed))return{ok:false,plan,changed:false,reason:'fixed-outside'};out[fixed].push(store)}else free.push(store)}
  for(const day of workDays){out[day]=optimizeRouteV185(out[day]);if(routeCreditsV185(out[day])>max||!dayFitsV185(out[day],day,mon))return{ok:false,plan,changed:false,reason:'fixed-capacity'}}
  const sortDirection=options.preferNearFirst?1:-1;
  free.sort((a,b)=>sortDirection*(homeDistance(a)-homeDistance(b))||DAYS.indexOf(origin[String(a.id)])-DAYS.indexOf(origin[String(b.id)]));
  for(const store of free){
    let best=null;for(const day of workDays){const date=iso(addDays(mon,DAYS.indexOf(day)));if(dayBlockedV185(date))continue;const current=out[day]||[];if(routeCreditsV185(current)+planningCreditV185(store)>max)continue;const trial=optimizeRouteV185(current.concat([store]));if(!dayFitsV185(trial,day,mon))continue;const score=candidateScoreV185(out,day,store,trial,workDays);if(!best||score<best.score-0.001||(Math.abs(score-best.score)<0.001&&DAYS.indexOf(day)<DAYS.indexOf(best.day)))best={day,trial,score}}
    if(!best)return{ok:false,plan,changed:false,reason:'unplaced',store};out[best.day]=best.trial
  }
  for(const day of workDays){out[day]=optimizeRouteV185(out[day]);if(routeCreditsV185(out[day])>max)return{ok:false,plan,changed:false,reason:'capacity-after'}}
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
function chainHas(fn,marker){let cur=fn,n=0;while(typeof cur==='function'&&n++<8){if(cur[marker])return true;cur=cur.__v185Original||cur.__v184Original||cur.__v182Original}return false}
function patchSingleWeekGeography(){
  const original=window.storeRunnerGenerateSingleWeek;if(typeof original!=='function'||chainHas(original,'__v185Geo'))return false;
  const wrapped=async function(){const previous=window.__storeRunnerPlanningGenerationActive;window.__storeRunnerPlanningGenerationActive=true;try{const out=await original.apply(this,arguments);if(out&&out.ok===true&&state&&state.plan){const geo=rebalancePlanByGeography(state.plan,{weekKey:currentWeekKey()});if(geo.ok&&geo.changed)await persistGeoWeek(geo,currentWeekKey(),'single-week-geo-v185');out.geographyOptimized=!!(geo&&geo.ok&&geo.changed)}return out}finally{window.__storeRunnerPlanningGenerationActive=previous}};
  wrapped.__v185Geo=true;wrapped.__v185Original=original;window.storeRunnerGenerateSingleWeek=wrapped;return true
}
function terrainOvernightRow(week){
  const a=overnightAnalysis(week&&week.plan);let best=null;if(a.candidate)best=a.candidate;else if(a.reason==='threshold')best=a.bestRemote||null;else if(a.mode==='never')best=a.bestRemote||a.best||null;
  return{weekKey:String(week&&week.weekKey||''),mode:a.mode,threshold:a.threshold,selected:!!a.candidate,reason:a.candidate?'selected':a.reason==='threshold'?'below-threshold':a.reason==='disabled'?'disabled':'no-candidate',best}
}
async function persistSnailGeography(result){
  if(!result||!Array.isArray(result.weeks)||!result.weeks.length)return false;
  const archive=loadArchive();let changed=false;
  for(const week of result.weeks){if(!week||week.manual)continue;const geo=rebalancePlanByGeography(week.plan,{weekKey:week.weekKey,preferNearFirst:true});if(!geo.ok)continue;if(geo.changed){week.plan=geo.plan;changed=true;const prev=archive[week.weekKey]||{weekMonday:week.weekKey};archive[week.weekKey]=Object.assign({},prev,{weekMonday:week.weekKey,plan:clone(geo.plan),manualEdited:false,generatedMode:'snail-distance-geo-v185',geographyOptimized:'v185',updatedAt:new Date().toISOString()})}}
  if(changed){saveArchive(archive);const first=result.weeks[0];if(first&&String(state.settings&&state.settings.weekDate||'')===String(first.weekKey||''))state.plan=Object.fromEntries(DAYS.map(d=>[d,((first.plan&&first.plan[d])||[]).map(resolveStore)]));try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){}}
  const report=result.weeks.map(terrainOvernightRow);result.overnightReport=report;
  try{const s=storage(),range=s&&JSON.parse(s.getItem(RANGE_KEY)||'null');if(range){range.overnightReport=report;range.rotation='snail-distance-geo-v185';range.updatedAt=new Date().toISOString();s.setItem(RANGE_KEY,JSON.stringify(range))}if(s&&typeof s.flush==='function')await s.flush()}catch(e){}
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
   redevenait 80 km. V185 ajoute un garde-fou terrain : même en mode obligatoire, une nuit
   n'est proposée que si les deux journées s'enchaînent réellement loin du domicile. */
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
    if(row.remoteKm>=V185_REMOTE_MIN_KM&&row.saving>=V185_MANDATORY_MIN_SAVING_KM&&(!bestUseful||row.saving>bestUseful.saving))bestUseful=row
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
  if(a.reason==='mandatory-no-useful'){box.innerHTML='<div class="notice">🌙 Mode obligatoire actif, mais aucun enchaînement éloigné n’économise au moins '+V185_MANDATORY_MIN_SAVING_KM+' km. Aucun hôtel local n’est forcé : le planning doit d’abord créer un vrai bloc géographique éloigné.</div>';return true}
  if(a.reason==='threshold'){
    box.innerHTML='<div class="notice">🌙 Aucun découché retenu : meilleur enchaînement éloigné ~<b>'+Math.max(0,Math.round(a.bestRemote.saving))+' km</b> économisés, seuil automatique réglé à <b>'+Math.round(a.threshold)+' km</b>. Le seuil se règle dans Secteur.</div>';return true
  }
  const o=a.candidate;if(!o)return false;
  box.innerHTML='<div class="overnight"><b>🌙 '+esc(o.night)+'</b><div class="meta">Fin près de '+esc((o.last.enseigne||'Magasin')+' '+(o.last.ville||''))+' · reprise vers '+esc(o.first.ville||'')+' · économie estimée ~'+Math.max(0,Math.round(o.saving))+' km · zone à ~'+Math.round(o.remoteKm)+' km du domicile.'+(a.mode==='mandatory'?' · Découché obligatoire activé.':'')+'</div><a target="_blank" rel="noopener" href="'+mapsHotelUrl(o.last)+'">Chercher les hôtels près de la fin de tournée ↗</a></div>';return true
}
function wrapOnce(name,wrapper){
  const original=window[name];if(typeof original!=='function'||original.__v182Wrapped)return false;
  const wrapped=wrapper(original);wrapped.__v182Wrapped=true;wrapped.__v182Original=original;window[name]=wrapped;return true
}
function patchOvernight(){
  if(!window.state)return false;
  wrapOnce('overnightCandidate',()=>function(){return overnightAnalysis().candidate});
  wrapOnce('renderOvernight',original=>function(){let out;try{out=original.apply(this,arguments)}finally{renderOvernightV182()}return out});
  wrapOnce('fillProfileForm',original=>function(){const out=original.apply(this,arguments);try{const input=document.getElementById('pSaving'),raw=state.profile&&state.profile.overnightMinSaving,n=Number(raw);if(input&&Number.isFinite(n)&&n>=0)input.value=String(n)}catch(e){}return out});
  wrapOnce('saveProfile',original=>function(){
    const input=document.getElementById('pSaving'),raw=input?String(input.value||'').trim():'',n=raw===''?NaN:Number(raw);const out=original.apply(this,arguments);
    if(Number.isFinite(n)&&n>=0&&state.profile&&Number(state.profile.overnightMinSaving)!==n){state.profile.overnightMinSaving=n;try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){}if(input)input.value=String(n)}
    renderOvernightV182();return out
  });
  renderOvernightV182();return true
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
window.StoreRunnerGeographyV185={rebalance:rebalancePlanByGeography,routeKm:routeKmV185,homeDistance,patchSingle:patchSingleWeekGeography,patchThreeWeeks:patchThreeWeekGeography,remoteMinKm:V185_REMOTE_MIN_KM,mandatoryMinSavingKm:V185_MANDATORY_MIN_SAVING_KM};
window.storeRunnerRepairMobileRuntime=repairMobileRuntime;
})();