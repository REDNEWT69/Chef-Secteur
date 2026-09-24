/* Store Runner V251 — optimisation sûre de l'ordre des visites d'une journée.
   Cette couche ne choisit aucun magasin et ne déplace aucune visite entre deux jours.
   Elle compare seulement plusieurs ordres possibles avec les durées routières V248 et,
   quand il est disponible, le planificateur d'horaires StoreOpeningHoursV1.

   L'intégration runtime est événementielle : V185 termine d'abord son regroupement
   géographique, puis V251 ordonne les arrêts. Aucune fonction métier d'un autre module
   n'est remplacée et aucune semaine protégée/manuelle n'est réordonnée silencieusement. */
(function(root){
'use strict';

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';
let applying=false;

function rows(route){return Array.isArray(route)?route.filter(Boolean):[]}
function storeId(store,index){return String(store&&store.id!=null?store.id:'@'+index)}
function sameOrder(a,b){const x=rows(a),y=rows(b);return x.length===y.length&&x.every((s,i)=>storeId(s,i)===storeId(y[i],i))}
function memberSignature(route){return rows(route).map((s,i)=>storeId(s,i)).sort().join('|')}
function sameMembers(a,b){return rows(a).length===rows(b).length&&memberSignature(a)===memberSignature(b)}
function validCoord(v){return v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))}
function copy(value){return JSON.parse(JSON.stringify(value))}
function pad(n){return String(n).padStart(2,'0')}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseISO(value){const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return isNaN(d)?null:d}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function storage(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function loadJson(key,fallback){try{const s=storage(),raw=s&&s.getItem(key);return raw?JSON.parse(raw):fallback}catch(e){return fallback}}
function saveJson(key,value){try{const s=storage();if(s)s.setItem(key,JSON.stringify(value));return !!s}catch(e){return false}}
function basePoint(state){
  try{if(typeof root.baseObj==='function')return root.baseObj()}catch(e){}
  const p=state&&state.profile||{};return validCoord(p.baseLat)&&validCoord(p.baseLon)?{id:'BASE',lat:Number(p.baseLat),lon:Number(p.baseLon)}:null
}
function fallbackTravelMinutes(a,b){
  try{const api=root.StoreRunnerRoadMatrixV248;if(api&&typeof api.durationMinutes==='function'){const n=Number(api.durationMinutes(a,b));if(Number.isFinite(n)&&n>=0)return n}}catch(e){}
  try{if(typeof root.roadMinutes==='function'){const n=Number(root.roadMinutes(a,b));if(Number.isFinite(n)&&n>=0)return n}}catch(e){}
  try{if(typeof root.hav==='function'){const km=Number(root.hav(a,b));if(Number.isFinite(km)&&km>=0)return km*1.22/55*60}}catch(e){}
  return Infinity
}
function weekMonday(value){
  if(value instanceof Date&&!isNaN(value))return value;
  const d=parseISO(value);return d||undefined
}
function originFor(day,state,options){
  const o=options||{},hours=root.StoreOpeningHoursV1,wm=weekMonday(o.weekMonday);
  try{
    if(hours&&typeof hours.dateForDay==='function'&&typeof hours.originBase==='function'){
      const date=hours.dateForDay(day,state,wm),origin=hours.originBase(date,state);if(origin)return origin
    }
  }catch(e){}
  return o.origin||basePoint(state)
}
function visitMinutes(store,state){
  try{if(typeof root.storeVisitDuration==='function')return Math.max(1,Number(root.storeVisitDuration(store,state))||1)}catch(e){}
  return Math.max(15,Number(state&&state.settings&&state.settings.visitMinutes)||60)
}
function basicSchedule(route,day,state,options){
  const list=rows(route),origin=originFor(day,state,options),settings=state&&state.settings||{};
  const raw=day==='Samedi'?(settings.saturdayStart||'08:00'):(settings.startTime||'08:30'),p=String(raw).split(':'),start=(+p[0]||0)*60+(+p[1]||0);
  const rawEnd=day==='Samedi'?(settings.saturdayEnd||'12:00'):(settings.endTime||'18:00'),q=String(rawEnd).split(':'),endLimit=(+q[0]||0)*60+(+q[1]||0);
  let current=start,drive=0,prev=origin;if(!origin&&list.length)return{start,endLimit,estimatedEnd:null,closedCount:0,appointmentConflicts:1,rows:[],returnTravel:0};
  const out=[];
  for(let i=0;i<list.length;i++){
    const travel=Math.max(0,Number(fallbackTravelMinutes(prev,list[i]))||0);drive+=travel;current+=travel;const duration=visitMinutes(list[i],state);out.push({store:list[i],travel,duration,wait:0});current+=duration;prev=list[i]
  }
  const back=list.length&&origin?Math.max(0,Number(fallbackTravelMinutes(prev,origin))||0):0;drive+=back;current+=back;
  return{start,endLimit,estimatedEnd:current,closedCount:0,appointmentConflicts:0,rows:out,returnTravel:back,driveMinutes:drive}
}
function schedule(route,day,state,options){
  const list=rows(route),hours=root.StoreOpeningHoursV1,wm=weekMonday(options&&options.weekMonday);
  try{
    if(hours&&typeof hours.scheduleRoute==='function')return hours.scheduleRoute(list,day,state,{weekMonday:wm,travelMinutes:fallbackTravelMinutes})
  }catch(e){}
  return basicSchedule(list,day,state,options)
}
function evaluate(route,day,state,options){
  const list=rows(route),s=schedule(list,day,state,options||{}),closed=Math.max(0,Number(s&&s.closedCount)||0),conflicts=Math.max(0,Number(s&&s.appointmentConflicts)||0),end=Number(s&&s.estimatedEnd),limit=Number(s&&s.endLimit),drive=(s&&Array.isArray(s.rows)?s.rows.reduce((n,r)=>n+Math.max(0,Number(r&&r.travel)||0),0):0)+Math.max(0,Number(s&&s.returnTravel)||0),wait=s&&Array.isArray(s.rows)?s.rows.reduce((n,r)=>n+Math.max(0,Number(r&&r.wait)||0),0):0;
  const hasEnd=Number.isFinite(end),within=!Number.isFinite(limit)||hasEnd&&end<=limit+0.001,feasible=closed===0&&conflicts===0&&hasEnd&&within;
  return{route:list,schedule:s,feasible,closedCount:closed,appointmentConflicts:conflicts,estimatedEnd:hasEnd?end:Infinity,driveMinutes:Number.isFinite(drive)?drive:Infinity,waitMinutes:Number.isFinite(wait)?wait:Infinity}
}
function better(a,b){
  if(!b)return true;if(a.feasible!==b.feasible)return a.feasible;
  const ap=a.closedCount+a.appointmentConflicts,bp=b.closedCount+b.appointmentConflicts;if(ap!==bp)return ap<bp;
  /* Une fois les contraintes fortes satisfaites, V251 optimise d'abord le temps de
     conduite. Un ordre plus long n'est donc jamais préféré juste parce qu'il attend
     moins devant un magasin ou termine artificiellement plus tôt. */
  if(a.driveMinutes+0.1<b.driveMinutes)return true;if(b.driveMinutes+0.1<a.driveMinutes)return false;
  if(a.estimatedEnd+0.1<b.estimatedEnd)return true;if(b.estimatedEnd+0.1<a.estimatedEnd)return false;
  if(a.waitMinutes+0.1<b.waitMinutes)return true;return false
}
function nearestSeed(route,day,state,options){
  const source=rows(route),fixed=String(options&&options.fixedFirstId||''),out=[],remaining=source.slice();let prev=originFor(day,state,options);
  if(fixed){const i=remaining.findIndex(s=>String(s&&s.id)===fixed);if(i>=0){prev=remaining[i];out.push(remaining.splice(i,1)[0])}}
  while(remaining.length){let best=0,bestMinutes=Infinity;for(let i=0;i<remaining.length;i++){const n=Number(fallbackTravelMinutes(prev,remaining[i]));if(Number.isFinite(n)&&n<bestMinutes-0.001){bestMinutes=n;best=i}}prev=remaining[best];out.push(remaining.splice(best,1)[0])}
  return out
}
function allowed(route,options){const fixed=String(options&&options.fixedFirstId||'');return !fixed||route.length===0||String(route[0]&&route[0].id)===fixed}
function localSearch(seed,day,state,options){
  let best=evaluate(seed,day,state,options),loops=0;
  while(loops++<8){let next=best;const source=best.route,n=source.length,start=options&&options.fixedFirstId?1:0;
    for(let i=start;i<n;i++)for(let j=i+1;j<n;j++){
      const swapped=source.slice(),tmp=swapped[i];swapped[i]=swapped[j];swapped[j]=tmp;
      if(allowed(swapped,options)){const e=evaluate(swapped,day,state,options);if(better(e,next))next=e}
      const reversed=source.slice(),part=reversed.slice(i,j+1).reverse();reversed.splice(i,j-i+1,...part);
      if(allowed(reversed,options)){const e=evaluate(reversed,day,state,options);if(better(e,next))next=e}
    }
    if(next===best)break;best=next
  }
  return best
}
function explainOptimization(route,day,state,options){
  const original=rows(route),opts=options||{},before=evaluate(original,day,state,opts);if(original.length<2)return{route:original,before,after:before,changed:false};
  const candidates=[original,nearestSeed(original,day,state,opts)];
  const fixed=String(opts.fixedFirstId||'');
  if(!fixed){
    for(const first of original){const rest=original.filter(s=>s!==first),seed=nearestSeed([first].concat(rest),day,state,{...opts,fixedFirstId:String(first&&first.id)});candidates.push(seed)}
  }
  let best=before;
  for(const candidate of candidates){const found=localSearch(candidate,day,state,opts);if(better(found,best))best=found}
  /* Un changement automatique doit aboutir à une tournée faisable. Si aucune
     proposition ne satisfait les contraintes fortes, on garde l'ordre reçu, même si
     une permutation réduirait les kilomètres d'une journée qui reste de toute façon
     incohérente. Le diagnostic existant reste alors seul à demander un arbitrage. */
  if(!best.feasible)best=before;
  return{route:best.route,before,after:best,changed:!sameOrder(original,best.route)}
}
function optimizeRoute(route,day,state,options){return explainOptimization(route,day,state,options).route.slice()}
function benchmark(route,day,state,options){
  const x=explainOptimization(route,day,state,options);return{changed:x.changed,before:{feasible:x.before.feasible,driveMinutes:Math.round(x.before.driveMinutes*10)/10,estimatedEnd:Number.isFinite(x.before.estimatedEnd)?Math.round(x.before.estimatedEnd*10)/10:null},after:{feasible:x.after.feasible,driveMinutes:Math.round(x.after.driveMinutes*10)/10,estimatedEnd:Number.isFinite(x.after.estimatedEnd)?Math.round(x.after.estimatedEnd*10)/10:null},orderBefore:rows(route).map((s,i)=>storeId(s,i)),orderAfter:x.route.map((s,i)=>storeId(s,i))}
}

function optimizePlan(plan,weekKey,state,options){
  const source=plan&&typeof plan==='object'?plan:{},out={},benchmarks=[],opts=options||{};let changed=false;
  for(const day of DAYS){
    const before=Array.isArray(source[day])?source[day].slice():[];
    const fixed=opts.fixedFirstByDay&&opts.fixedFirstByDay[day];
    const result=explainOptimization(before,day,state,{weekMonday:weekKey,fixedFirstId:fixed||''});
    const safe=sameMembers(before,result.route)?result.route:before;
    out[day]=safe.slice();
    if(!sameOrder(before,safe))changed=true;
    benchmarks.push({day,...benchmark(before,day,state,{weekMonday:weekKey,fixedFirstId:fixed||''})});
  }
  return{plan:out,changed,benchmarks}
}
function currentWeekKey(state){
  try{const d=parseISO(state&&state.settings&&state.settings.weekDate)||new Date();return iso(monday(d))}catch(e){return''}
}
function isManualWeek(key,state,archive){return !!((state&&state.manualWeekEdits&&state.manualWeekEdits[key])||(archive&&archive[key]&&archive[key].manualEdited))}
function resolveStore(store,state){try{return (state&&state.stores||[]).find(s=>String(s&&s.id)===String(store&&store.id))||store}catch(e){return store}}
function serializablePlan(plan){return Object.fromEntries(DAYS.map(day=>[day,rows(plan&&plan[day]).map(copy)]))}
function canonicalPlan(plan,state){return Object.fromEntries(DAYS.map(day=>[day,rows(plan&&plan[day]).map(store=>resolveStore(store,state))]))}
function checkpoint(label){try{const R=root.ChefReliability,s=storage();if(R&&typeof R.checkpoint==='function')R.checkpoint(label,s)}catch(e){}}
async function flush(){try{const s=storage();if(s&&typeof s.flush==='function')await s.flush()}catch(e){}}
function saveState(){try{if(typeof root.save==='function')root.save();else if(typeof save==='function')save()}catch(e){}}
function render(){try{if(typeof root.renderAll==='function')root.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}}
function refreshCurrentOvernight(plan){try{if(typeof root.storeRunnerRefreshOvernightDecision==='function')root.storeRunnerRefreshOvernightDecision(plan)}catch(e){}}
function emit(source,detail){try{root.document&&root.document.dispatchEvent(new root.CustomEvent('store-runner:planning-updated',{detail:{...(detail||{}),source}}))}catch(e){}}

async function finalizeSingleWeek(state,options){
  const appState=state||root.state;if(!appState||!appState.plan)return{ok:false,reason:'no-plan'};
  const key=String(options&&options.weekKey||currentWeekKey(appState)),archive=loadJson(ARCHIVE_KEY,{})||{};
  if(!key||isManualWeek(key,appState,archive))return{ok:true,changed:false,skipped:'manual'};
  const result=optimizePlan(appState.plan,key,appState,options);
  if(!result.changed)return{ok:true,changed:false,benchmarks:result.benchmarks};
  checkpoint('Avant optimisation routière V251');
  appState.plan=canonicalPlan(result.plan,appState);
  const prev=archive[key]||{weekMonday:key};archive[key]={...prev,weekMonday:key,plan:serializablePlan(result.plan),routeOptimized:'v251',updatedAt:new Date().toISOString()};
  saveJson(ARCHIVE_KEY,archive);saveState();await flush();render();refreshCurrentOvernight(appState.plan);
  emit('route-opt-v251',{weekDate:key});
  return{ok:true,changed:true,benchmarks:result.benchmarks}
}
function rangeWeekKeys(range){
  const first=parseISO(range&&range.start);if(!first)return[];const count=Math.max(1,Math.min(12,Number(range&&range.weeks)||3));return Array.from({length:count},(_,i)=>iso(addDays(first,i*7)))
}
function overnightRowV185(week){
  try{
    const api=root.StoreRunnerOvernightV182;
    if(!api||typeof api.analyze!=='function')return null;
    const a=api.analyze(week&&week.plan),best=a&&a.candidate?a.candidate:(a&&a.reason==='threshold'?a.bestRemote||null:(a&&a.mode==='never'?a.bestRemote||a.best||null:null));
    return{weekKey:String(week&&week.weekKey||''),mode:a&&a.mode||'auto',threshold:Number(a&&a.threshold)||80,selected:!!(a&&a.candidate),reason:a&&a.candidate?'selected':a&&a.reason==='threshold'?'below-threshold':a&&a.reason==='disabled'?'disabled':'no-candidate',best}
  }catch(e){return null}
}
function recomputeRangeReports(range,weekRows,state){
  const terrain=root.StoreRunnerTerrainPlanningV1;if(!terrain)return range;
  try{
    const overnight=weekRows.map(overnightRowV185);
    if(overnight.every(Boolean))range.overnightReport=overnight;
    else if(typeof terrain.analyzeOvernightWeeks==='function')range.overnightReport=terrain.analyzeOvernightWeeks(weekRows,state)
  }catch(e){}
  try{if(typeof terrain.refreshThreeWeekDiagnostics==='function'){const x=terrain.refreshThreeWeekDiagnostics(weekRows,state);range.planningDiagnostics=x.planningDiagnostics;range.dayCoverage=x.dayCoverage}}catch(e){}
  try{if(typeof terrain.summarizeOpeningHours==='function')range.hoursReport=terrain.summarizeOpeningHours(weekRows,state)}catch(e){}
  return range
}
async function finalizeRange(state){
  const appState=state||root.state,range=loadJson(RANGE_KEY,null),archive=loadJson(ARCHIVE_KEY,{})||{};if(!appState||!range)return{ok:false,reason:'no-range'};
  const keys=rangeWeekKeys(range);if(!keys.length)return{ok:false,reason:'no-weeks'};
  const updates=[],weekRows=[];let changed=false;
  for(const key of keys){
    const snap=archive[key],manual=isManualWeek(key,appState,archive),original=snap&&snap.plan?snap.plan:null;
    if(!original){weekRows.push({weekKey:key,plan:{},manual});continue}
    if(manual){weekRows.push({weekKey:key,plan:original,manual:true});continue}
    const result=optimizePlan(original,key,appState,{});updates.push({key,result,snap});changed=changed||result.changed;weekRows.push({weekKey:key,plan:result.plan,manual:false})
  }
  if(!changed)return{ok:true,changed:false};
  checkpoint('Avant optimisation routière V251 sur 3 semaines');
  for(const item of updates){if(!item.result.changed)continue;archive[item.key]={...item.snap,weekMonday:item.key,plan:serializablePlan(item.result.plan),routeOptimized:'v251',updatedAt:new Date().toISOString()}}
  const current=currentWeekKey(appState),currentRow=weekRows.find(w=>w.weekKey===current);if(currentRow&&!currentRow.manual)appState.plan=canonicalPlan(currentRow.plan,appState);
  range.routeOptimized='v251';range.updatedAt=new Date().toISOString();recomputeRangeReports(range,weekRows,appState);
  saveJson(ARCHIVE_KEY,archive);saveJson(RANGE_KEY,range);saveState();await flush();render();refreshCurrentOvernight(appState.plan);
  emit('route-opt-v251',{weekDate:current||keys[0],weeks:keys.length});
  return{ok:true,changed:true,weeks:keys.length}
}
async function onPlanningUpdated(event){
  if(applying)return;const source=String(event&&event.detail&&event.detail.source||'');
  if(source!=='snail-geo-v185'&&source!=='generateWeek')return;
  applying=true;try{if(source==='snail-geo-v185')await finalizeRange(root.state);else await finalizeSingleWeek(root.state)}catch(e){console.warn('[V251] optimisation routière ignorée',e)}finally{applying=false}
}

const api={version:251,fallbackTravelMinutes,evaluate,nearestSeed,optimizeRoute,explainOptimization,benchmark,sameOrder,sameMembers,optimizePlan,finalizeSingleWeek,finalizeRange};
root.StoreRunnerRouteOptimizerV251=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document&&typeof root.document.addEventListener==='function')root.document.addEventListener('store-runner:planning-updated',onPlanningUpdated);
})(typeof window!=='undefined'?window:globalThis);
