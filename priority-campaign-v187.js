/* V188 · Priorités terrain : échéance + géographie + découché dans un seul calcul. */
(function(root){
'use strict';

const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const REMOTE_MIN_KM=55;
const MIN_USEFUL_OVERNIGHT_KM=20;
/* Dépôt public : aucune identité de magasin n'est écrite ici. La campagne est vide par
   défaut ; ses cibles viennent des réglages de l'utilisateur. Depuis la V190, la priorité
   terrain provient du snapshot performance importé, et ce module ne sert plus qu'à une
   campagne ponctuelle explicitement configurée. */
const CAMPAIGN={
  id:'services-p1-2026-09',
  label:'Priorités services',
  reason:'Anomalie / faible part de marché services',
  startDate:'2026-09-14',
  dueDate:'2026-09-22',
  targets:[]
};
/* Une campagne ponctuelle expire : passée son échéance, elle ne réorganise plus rien et
   n'affiche plus de retard. Sans cibles configurées, elle est inerte dès le départ. */
function campaignTargets(){
  if(Array.isArray(CAMPAIGN.targets)&&CAMPAIGN.targets.length)return CAMPAIGN.targets;
  try{
    const configured=root.state&&root.state.settings&&root.state.settings.priorityCampaignTargets;
    return Array.isArray(configured)?configured:[];
  }catch(e){return[]}
}
function campaignExpired(today){
  const day=iso(parse(today)||new Date());
  return day>CAMPAIGN.dueDate;
}
function campaignActive(today){return campaignTargets().length>0&&!campaignExpired(today)}
function setCampaignTargets(list){CAMPAIGN.targets=Array.isArray(list)?list.slice():[];return CAMPAIGN.targets}

let applying=false,lastReport=null,bootAttempts=0;

function clone(v){return JSON.parse(JSON.stringify(v))}
function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
function parse(v){
  if(v instanceof Date)return new Date(v.getTime());
  const s=String(v||'').trim();
  if(!s)return null;
  const d=/^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(s+'T12:00:00'):new Date(s);
  return isNaN(d)?null:d
}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function dayForDate(d){return DAYS[(d.getDay()||7)-1]||''}
function diffDays(a,b){return Math.round((parse(b)-parse(a))/86400000)}
function dateLabel(value){const d=parse(value);if(!d)return value||'';return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')}
function storage(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function loadArchive(){try{const s=storage();return s?JSON.parse(s.getItem(ARCHIVE_KEY)||'{}')||{}:{}}catch(e){return{}}}
function saveArchive(v){try{const s=storage();if(s)s.setItem(ARCHIVE_KEY,JSON.stringify(v||{}))}catch(e){console.warn('Archive P1 non enregistrée',e)}}
function currentStores(){try{return Array.isArray(root.state&&root.state.stores)?root.state.stores:[]}catch(e){return[]}}
function snapshotStores(){try{return root.state&&root.state.businessV2&&root.state.businessV2.storeSnapshots?Object.values(root.state.businessV2.storeSnapshots):[]}catch(e){return[]}}
function storeHay(store){return norm([store&&store.enseigne,store&&store.sourceName,store&&store.ville,store&&store.adresse].filter(Boolean).join(' '))}
function targetMatches(target,store){
  if(!target||!store)return false;
  const brand=norm(store.enseigne),wanted=norm(target.brand);
  if(brand!==wanted&&!brand.includes(wanted))return false;
  const hay=storeHay(store);
  return (target.aliases||[]).some(a=>hay.includes(norm(a)))
}
function targetForStore(store){return campaignTargets().find(t=>targetMatches(t,store))||null}
function isPriorityStore(store){return !!targetForStore(store)}
function resolveTarget(target){return currentStores().find(s=>targetMatches(target,s))||null}

function visitDatesForId(id){
  const out=[];
  try{
    const legacy=root.state&&root.state.visits&&root.state.visits[String(id)];
    if(legacy){
      if(legacy.lastVisit)out.push(String(legacy.lastVisit).slice(0,10));
      if(Array.isArray(legacy.history))legacy.history.forEach(d=>out.push(String(d||'').slice(0,10)))
    }
  }catch(e){}
  try{
    const rows=root.state&&root.state.businessV2&&Array.isArray(root.state.businessV2.visits)?root.state.businessV2.visits:[];
    rows.forEach(v=>{
      if(String(v&&v.storeId)===String(id)&&String(v&&v.status)==='completed'){
        out.push(String((v&&v.completedDate)||(v&&v.completedAt)||'').slice(0,10))
      }
    })
  }catch(e){}
  return [...new Set(out.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
}
function actualCompletedDate(target){
  const candidates=currentStores().concat(snapshotStores()).filter(s=>targetMatches(target,s));
  let dates=[];
  candidates.forEach(s=>{if(s&&s.id!==undefined)dates=dates.concat(visitDatesForId(s.id))});
  dates=[...new Set(dates)].filter(d=>d>=CAMPAIGN.startDate&&d<=CAMPAIGN.dueDate).sort();
  return dates[0]||''
}
function completionDate(target){return actualCompletedDate(target)||target.creditedDate||''}

function workDays(){
  try{
    const days=root.state&&root.state.settings&&Array.isArray(root.state.settings.days)?root.state.settings.days.filter(d=>DAYS.includes(d)):[];
    return days.length?days:DAYS.slice(0,5)
  }catch(e){return DAYS.slice(0,5)}
}
function weekKeyFromState(){
  try{return iso(monday(parse(root.state&&root.state.settings&&root.state.settings.weekDate)||new Date()))}
  catch(e){return iso(monday(new Date()))}
}
function emptyPlan(){return Object.fromEntries(DAYS.map(d=>[d,[]]))}
function planForWeek(key,archive){
  if(key===weekKeyFromState()&&root.state&&root.state.plan)return clone(root.state.plan);
  const snap=archive&&archive[key];
  return snap&&snap.plan?clone(snap.plan):emptyPlan()
}
function weekPlansBetween(fromDate){
  const archive=loadArchive(),start=parse(iso(monday(parse(fromDate)))),end=parse(iso(monday(parse(CAMPAIGN.dueDate)))),plans={};
  for(let d=start;d<=end;d=addDays(d,7)){
    const key=iso(d);plans[key]=planForWeek(key,archive)
  }
  return{archive,plans}
}
function routeContext(plans,date){
  const d=parse(date),key=iso(monday(d)),day=dayForDate(d);
  return{date,key,day,plan:plans[key],route:plans[key]&&plans[key][day]||[]}
}
function allDates(from,to,allowedDays){
  const out=[],start=parse(iso(parse(from))),end=parse(iso(parse(to)));
  for(let d=start;d<=end;d=addDays(d,1)){
    const day=dayForDate(d);
    if(day&&allowedDays.includes(day))out.push(iso(d))
  }
  return out
}
function scheduledDateForTarget(target,plans,limitDue=true){
  for(const [key,plan] of Object.entries(plans)){
    const mon=parse(key);
    for(const day of DAYS){
      const date=iso(addDays(mon,DAYS.indexOf(day)));
      if(limitDue&&date>CAMPAIGN.dueDate)continue;
      if((plan[day]||[]).some(s=>targetMatches(target,s)))return date
    }
  }
  return''
}
function statusFromPlans(plans){
  return campaignTargets().map(target=>{
    const completed=completionDate(target),store=resolveTarget(target),planned=completed?'':scheduledDateForTarget(target,plans,true);
    return{key:target.key,label:target.label,completedDate:completed,plannedDate:planned,resolved:!!store,storeId:store&&String(store.id)}
  })
}

function planningCredit(store){try{if(typeof root.storeVisitCredit==='function')return Math.max(1,Number(root.storeVisitCredit(store))||1)}catch(e){}return 1}
function routeCredits(route){return (route||[]).reduce((n,s)=>n+planningCredit(s),0)}
function maxCredits(){try{return Math.max(1,Math.min(8,Number(root.state&&root.state.settings&&root.state.settings.maxVisitsPerDay)||4))}catch(e){return 4}}
function optimizeRoute(route){
  try{
    if(typeof root.nearestRoute==='function'&&typeof root.twoOpt==='function')return root.twoOpt(root.nearestRoute(route));
    if(typeof root.nearestRoute==='function')return root.nearestRoute(route)
  }catch(e){}
  return(route||[]).slice()
}
function routeKm(route){
  try{
    const api=root.StoreRunnerGeographyV185;
    if(api&&typeof api.routeKm==='function'){
      const n=Number(api.routeKm(route));if(Number.isFinite(n))return n
    }
  }catch(e){}
  return(route||[]).length*100
}
function homeDistance(store){
  try{
    const api=root.StoreRunnerGeographyV185;
    if(api&&typeof api.homeDistance==='function'){
      const n=Number(api.homeDistance(store));if(Number.isFinite(n))return n
    }
  }catch(e){}
  try{
    if(typeof root.havBase==='function'){
      const n=Number(root.havBase(store));if(Number.isFinite(n))return n
    }
  }catch(e){}
  return Infinity
}
function storeDistance(a,b){
  try{
    if(typeof root.hav==='function'){
      const n=Number(root.hav(a,b));if(Number.isFinite(n))return Math.max(0,n)
    }
  }catch(e){}
  return Infinity
}
function routeFits(route,day,weekKey){
  try{
    const api=root.StoreOpeningHoursV1;
    if(api&&typeof api.routeFits==='function')return !!api.routeFits(route,day,root.state,{weekMonday:parse(weekKey)})
  }catch(e){}
  try{
    if(typeof root.routeWorkMinutes!=='function')return true;
    const settings=root.state&&root.state.settings||{},clock=v=>{const p=String(v||'').split(':');return (+p[0]||0)*60+(+p[1]||0)};
    const start=clock(day==='Samedi'?(settings.saturdayStart||'08:00'):(settings.startTime||'08:30'));
    const end=clock(day==='Samedi'?(settings.saturdayEnd||'12:00'):(settings.endTime||'18:00'));
    return start+Number(root.routeWorkMinutes(route)||0)<=end+0.001
  }catch(e){return true}
}
function visitedOn(id,date){return visitDatesForId(id).includes(date)}
function lockDay(id,weekKey){
  try{
    if(typeof root.storeRunnerLockDayForWeek==='function'){
      const d=root.storeRunnerLockDayForWeek(id,weekKey);if(DAYS.includes(d))return d
    }
  }catch(e){}
  try{
    const raw=root.state&&root.state.locks&&root.state.locks[String(id)];
    if(typeof raw==='string')return DAYS.includes(raw)?raw:'';
    if(raw&&typeof raw==='object'&&DAYS.includes(raw.day)&&(!raw.week||String(raw.week)===String(weekKey)))return raw.day
  }catch(e){}
  return''
}
function appointmentDay(id,weekKey){
  try{
    for(const a of (root.state&&root.state.appointments||[])){
      if(String(a&&a.storeId)!==String(id))continue;
      const d=parse(String(a&&a.date||'').slice(0,10));
      if(!d||iso(monday(d))!==weekKey)continue;
      return dayForDate(d)
    }
  }catch(e){}
  return''
}
function fixedOnDay(store,date,day,weekKey){
  const id=String(store&&store.id||'');
  return !!(id&&(visitedOn(id,date)||appointmentDay(id,weekKey)===day||lockDay(id,weekKey)===day))
}
function eventBlocks(e){
  if(!e)return false;
  if(e.inferredAway)return true;
  const text=norm((e.title||'')+' '+(e.location||'')+' '+(e.calendar||''));
  return ['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'].some(x=>text.includes(x))||/\bparis\b/.test(text)||!!(e.planningBlock&&!e.allDay)
}
function dateBlocked(date){
  try{
    const rows=typeof root.calendarEventsForDate==='function'?root.calendarEventsForDate(date):[];
    return(rows||[]).some(eventBlocks)
  }catch(e){return false}
}
function startClockMinutes(){
  try{
    const p=String(root.state&&root.state.settings&&root.state.settings.startTime||'08:30').split(':');
    return(+p[0]||0)*60+(+p[1]||0)
  }catch(e){return 510}
}
function planningStartDate(now,options){
  if(options&&options.startDate)return parse(options.startDate)||now;
  const today=new Date(now),minutes=today.getHours()*60+today.getMinutes();
  if(minutes>=startClockMinutes()+90)return addDays(today,1);
  return today
}

function removeCompletedDuplicates(plans,fromIso){
  for(const target of campaignTargets()){
    const done=completionDate(target);
    if(!done)continue;
    for(const [key,plan] of Object.entries(plans)){
      const mon=parse(key);
      for(const day of DAYS){
        const date=iso(addDays(mon,DAYS.indexOf(day)));
        if(date<fromIso||date<=done)continue;
        plan[day]=(plan[day]||[]).filter(s=>!targetMatches(target,s))
      }
    }
  }
}
function existingBeforeStart(target,plans,startIso,todayIso){
  const date=scheduledDateForTarget(target,plans,true);
  return date&&date>=todayIso&&date<startIso?date:''
}
function stripMovablePriorities(plans,startIso){
  const fixedAssignments={};
  for(const [key,plan] of Object.entries(plans)){
    const mon=parse(key);
    for(const day of DAYS){
      const date=iso(addDays(mon,DAYS.indexOf(day)));
      if(date<startIso||date>CAMPAIGN.dueDate)continue;
      const keep=[];
      for(const store of (plan[day]||[])){
        if(!isPriorityStore(store)){keep.push(store);continue}
        if(fixedOnDay(store,date,day,key)){
          keep.push(store);
          (fixedAssignments[date]||(fixedAssignments[date]=[])).push(store)
        }
      }
      plan[day]=keep
    }
  }
  return fixedAssignments
}
function dayBase(plans,date){
  const ctx=routeContext(plans,date),fixed=[],movable=[];
  for(const store of (ctx.route||[])){
    if(isPriorityStore(store)){fixed.push(store);continue}
    if(fixedOnDay(store,date,ctx.day,ctx.key))fixed.push(store);else movable.push(store)
  }
  return{ctx,fixed,movable}
}
function bestOvernightBetween(dateA,routeA,dateB,routeB){
  if(diffDays(dateA,dateB)!==1)return null;
  let best=null;
  for(const a of (routeA||[]))for(const b of (routeB||[])){
    const ha=homeDistance(a),hb=homeDistance(b),direct=storeDistance(a,b);
    if(!Number.isFinite(ha)||!Number.isFinite(hb)||!Number.isFinite(direct))continue;
    const remote=Math.min(ha,hb),saving=ha+hb-direct;
    if(remote<REMOTE_MIN_KM||saving<MIN_USEFUL_OVERNIGHT_KM)continue;
    const row={fromDate:dateA,toDate:dateB,fromStore:a,toStore:b,saving,remoteKm:remote,directKm:direct};
    if(!best||row.saving>best.saving)best=row
  }
  return best
}
function preferredOvernightThreshold(){
  try{
    const n=Number(root.state&&root.state.profile&&root.state.profile.overnightMinSaving);
    return Number.isFinite(n)&&n>=0?n:80
  }catch(e){return 80}
}
function buildCandidate(plans,dates,assignment,fixedAssignments){
  const max=maxCredits(),routes={},evicted=[],overflowDays=[],dayDetails={};
  let score=0;
  for(const date of dates){
    const base=dayBase(plans,date);
    if(!base.ctx.plan)return null;
    const assigned=(assignment[date]||[]).slice();
    const fixedPriority=(fixedAssignments[date]||[]).filter(s=>!assigned.some(x=>String(x.id)===String(s.id)));
    let core=optimizeRoute(base.fixed.concat(fixedPriority,assigned));
    if(!routeFits(core,base.ctx.day,base.ctx.key))return null;
    const priorityCount=core.filter(isPriorityStore).length;
    if(priorityCount>2)return null;
    const credits=routeCredits(core),overflow=Math.max(0,credits-max);
    if(overflow>0){
      overflowDays.push(date);
      score+=100000+overflow*5000
    }
    const regular=base.movable.slice().sort((a,b)=>{
      const da=Math.max(0,routeKm(optimizeRoute(core.concat([a])))-routeKm(core));
      const db=Math.max(0,routeKm(optimizeRoute(core.concat([b])))-routeKm(core));
      return da-db
    });
    for(const store of regular){
      const trial=optimizeRoute(core.concat([store]));
      const allowedCredits=overflow>0?credits:max;
      if(routeCredits(trial)<=allowedCredits&&routeFits(trial,base.ctx.day,base.ctx.key))core=trial;
      else evicted.push(store)
    }
    routes[date]=core;
    dayDetails[date]={credits:routeCredits(core),priorityCount:core.filter(isPriorityStore).length};
    const km=routeKm(core);score+=Number.isFinite(km)?km:50000
  }
  score+=evicted.length*20000;
  let overnight=null;
  const threshold=preferredOvernightThreshold();
  for(let i=0;i<dates.length-1;i++){
    const row=bestOvernightBetween(dates[i],routes[dates[i]],dates[i+1],routes[dates[i+1]]);
    if(!row)continue;
    const bonus=row.saving*5+(row.saving>=threshold?1500:0);
    score-=bonus;
    if(!overnight||row.saving>overnight.saving)overnight=row
  }
  let early=0;
  dates.forEach((date,i)=>{early+=(assignment[date]||[]).length*i});
  score+=early*0.05;
  return{score,routes,evicted,overflowDays,overnight,dayDetails}
}
function solvePriorities(plans,dates,targets,fixedAssignments){
  const items=targets.map(target=>({target,store:resolveTarget(target)}));
  const unresolved=items.filter(x=>!x.store).map(x=>x.target.label);
  const resolved=items.filter(x=>x.store);
  const fixedIds=new Set(Object.values(fixedAssignments).flat().map(s=>String(s&&s.id||'')));
  const todo=resolved.filter(x=>!fixedIds.has(String(x.store&&x.store.id||'')));
  if(!dates.length&&todo.length)return{best:null,unresolved:unresolved.concat(todo.map(x=>x.target.label+' (aucun jour disponible)'))};

  todo.sort((a,b)=>{
    const da=homeDistance(a.store),db=homeDistance(b.store);
    if(Number.isFinite(da)&&Number.isFinite(db)&&db!==da)return db-da;
    return a.target.order-b.target.order
  });

  const assignment=Object.fromEntries(dates.map(d=>[d,[]]));
  let best=null,nodes=0;
  function walk(index){
    if(++nodes>50000)return;
    if(index>=todo.length){
      const candidate=buildCandidate(plans,dates,assignment,fixedAssignments);
      if(candidate&&(!best||candidate.score<best.score-0.001))best={...candidate,assignment:clone(assignment)};
      return
    }
    const store=todo[index].store;
    for(const date of dates){
      const fixedCount=(fixedAssignments[date]||[]).filter(isPriorityStore).length;
      if((assignment[date]||[]).length+fixedCount>=2)continue;
      assignment[date].push(store);
      walk(index+1);
      assignment[date].pop()
    }
  }
  walk(0);
  if(!best&&nodes>50000)unresolved.push('Optimisation interrompue : trop de combinaisons');
  return{best,unresolved,nodes}
}
function applyCandidate(plans,candidate,dates){
  const touched=new Set(),seenEvicted=new Set(),evicted=[];
  for(const date of dates){
    const ctx=routeContext(plans,date);
    if(!ctx.plan)continue;
    ctx.plan[ctx.day]=(candidate.routes[date]||[]).slice();
    touched.add(ctx.key)
  }
  for(const s of (candidate.evicted||[])){
    const id=String(s&&s.id||'');
    if(id&&!seenEvicted.has(id)){seenEvicted.add(id);evicted.push(s)}
  }
  return{touched,evicted}
}
function placeDeferred(stores,plans,fromDate){
  const end=addDays(monday(parse(CAMPAIGN.dueDate)),12);
  const dates=allDates(parse(fromDate),end,workDays()).filter(d=>d>CAMPAIGN.dueDate&&!dateBlocked(d));
  const unplaced=[];
  for(const store of stores){
    let best=null;
    for(const date of dates){
      const ctx=routeContext(plans,date);
      if(!ctx.plan){
        plans[ctx.key]=emptyPlan();ctx.plan=plans[ctx.key];ctx.route=[]
      }
      const trial=optimizeRoute((ctx.plan[ctx.day]||[]).concat([store]));
      if(routeCredits(trial)>maxCredits()||!routeFits(trial,ctx.day,ctx.key))continue;
      const score=Math.max(0,routeKm(trial)-routeKm(ctx.plan[ctx.day]||[]));
      if(!best||score<best.score)best={score,ctx,trial}
    }
    if(best)best.ctx.plan[best.ctx.day]=best.trial;else unplaced.push(store)
  }
  return unplaced
}
function persist(plans,archive,changedKeys,meta){
  const currentKey=weekKeyFromState(),at=new Date().toISOString();
  if(changedKeys.has(currentKey)&&root.state){
    root.state.plan=Object.fromEntries(DAYS.map(day=>[day,(plans[currentKey]&&plans[currentKey][day]||[]).map(row=>currentStores().find(s=>String(s.id)===String(row&&row.id))||row)]))
  }
  for(const key of changedKeys){
    const previous=archive[key]||{weekMonday:key};
    archive[key]=Object.assign({},previous,{
      weekMonday:key,plan:clone(plans[key]||emptyPlan()),updatedAt:at,
      priorityCampaign:CAMPAIGN.id,priorityPlanner:'v188',
      priorityOvernight:meta&&meta.overnight?{
        fromDate:meta.overnight.fromDate,toDate:meta.overnight.toDate,
        fromStoreId:String(meta.overnight.fromStore&&meta.overnight.fromStore.id||''),
        toStoreId:String(meta.overnight.toStore&&meta.overnight.toStore.id||''),
        saving:Math.round(meta.overnight.saving)
      }:null
    })
  }
  saveArchive(archive);
  try{if(root.ChefReliability&&typeof root.ChefReliability.checkpoint==='function')root.ChefReliability.checkpoint('Avant application des priorités services V188',storage())}catch(e){}
  try{if(typeof root.save==='function')root.save()}catch(e){}
  try{if(typeof root.renderAll==='function')root.renderAll()}catch(e){}
  try{const s=storage();if(s&&typeof s.flush==='function'){const p=s.flush();if(p&&typeof p.catch==='function')p.catch(()=>{})}}catch(e){}
}
function storeShort(store){return String((store&&store.enseigne)||'Magasin')+' '+String((store&&store.ville)||'').trim()}
function overnightText(o){
  if(!o)return'';
  return '🌙 Découché conseillé '+dateLabel(o.fromDate)+' → '+dateLabel(o.toDate)+' · '+storeShort(o.fromStore)+' → '+storeShort(o.toStore)+' · ~'+Math.max(0,Math.round(o.saving))+' km évités'
}

function renderSummary(){
  if(!root.document||!root.state)return false;
  /* Campagne inerte ou échue : on retire le bandeau au lieu d'afficher un retard qui
     n'a plus de sens. */
  if(!campaignActive(new Date())){
    const old=root.document.getElementById('priorityCampaignV187');
    if(old)old.remove();
    return false;
  }
  const now=new Date(),start=planningStartDate(now,{}),data=weekPlansBetween(start),rows=statusFromPlans(data.plans);
  const done=rows.filter(r=>r.completedDate).length,planned=rows.filter(r=>!r.completedDate&&r.plannedDate).length,pending=rows.length-done-planned;
  let box=root.document.getElementById('priorityCampaignV187');
  if(!box){
    const anchor=root.document.getElementById('planningUnifiedHint')||root.document.querySelector&&root.document.querySelector('#planPanel button.primary.full[onclick="generateWeek()"]');
    if(!anchor||!anchor.parentNode)return false;
    box=root.document.createElement('details');box.id='priorityCampaignV187';box.open=true;
    box.style.cssText='margin:10px 0;padding:10px 12px;border:1px solid #fecaca;border-radius:14px;background:#fff7f7;color:#7f1d1d;font-size:12px;line-height:1.45';
    anchor.insertAdjacentElement('afterend',box)
  }
  const summary=done+'/'+rows.length+' réalisées · '+planned+' planifiée'+(planned>1?'s':'')+(pending?' · '+pending+' à placer':'')+' · échéance 22/09';
  const routeHint=lastReport&&lastReport.overnight?'<div style="margin-top:7px;font-weight:750;color:#6941c6">'+overnightText(lastReport.overnight)+'</div>':'';
  const overloadHint=lastReport&&lastReport.overflowDays&&lastReport.overflowDays.length?'<div style="margin-top:5px;color:#92400e">⚠️ Journée double nécessaire pour respecter l’échéance : '+lastReport.overflowDays.map(dateLabel).join(', ')+'</div>':'';
  box.innerHTML='<summary style="cursor:pointer;font-weight:850">🔴 Priorités services · '+summary+'</summary><div style="margin-top:8px;color:#475467">'+
    rows.map(r=>r.completedDate?'✅ '+r.label+' · visitée '+dateLabel(r.completedDate):r.plannedDate?'📍 '+r.label+' · '+dateLabel(r.plannedDate):'🔴 '+r.label+' · à visiter avant le 22/09').join('<br>')+
    '</div>'+routeHint+overloadHint;
  return true
}

function apply(options){
  options=options||{};
  if(applying||!root.state||!Array.isArray(root.state.stores))return{ok:false,reason:'not-ready'};
  /* Aucune cible configurée, ou campagne échue : on ne touche pas au planning. */
  if(!campaignTargets().length)return{ok:false,reason:'no-targets'};
  if(campaignExpired(options.today||new Date()))return{ok:false,reason:'expired'};
  applying=true;
  try{
    const now=parse(options.today)||new Date(),todayIso=iso(now);
    if(todayIso>CAMPAIGN.dueDate){
      const data=weekPlansBetween(now);
      lastReport={ok:true,expired:true,status:statusFromPlans(data.plans)};
      if(options.render!==false)renderSummary();
      return lastReport
    }
    const start=planningStartDate(now,options),startIso=iso(start),due=parse(CAMPAIGN.dueDate);
    const data=weekPlansBetween(now),archive=data.archive,plans=data.plans,before=clone(plans);
    removeCompletedDuplicates(plans,todayIso);

    const targets=[],preStartPlanned=[];
    for(const target of campaignTargets()){
      if(completionDate(target))continue;
      const existing=existingBeforeStart(target,plans,startIso,todayIso);
      if(existing){preStartPlanned.push({target,date:existing});continue}
      targets.push(target)
    }

    const fixedAssignments=stripMovablePriorities(plans,startIso);
    const dates=allDates(start,due,workDays()).filter(d=>!dateBlocked(d));
    const solved=solvePriorities(plans,dates,targets,fixedAssignments);
    const unresolved=solved.unresolved.slice();

    let candidate=solved.best,evicted=[],deferredUnplaced=[],changedKeys=new Set();
    if(candidate){
      const applied=applyCandidate(plans,candidate,dates);evicted=applied.evicted;
      deferredUnplaced=placeDeferred(evicted,plans,addDays(due,1));
      for(const key of Object.keys(plans)){
        if(JSON.stringify(plans[key]||{})!==JSON.stringify(before[key]||{}))changedKeys.add(key)
      }
      if(changedKeys.size)persist(plans,archive,changedKeys,candidate)
    }else if(targets.some(t=>resolveTarget(t))){
      unresolved.push('Aucune combinaison terrain réaliste ne permet de placer toutes les priorités avant le 22/09')
    }

    const finalRows=statusFromPlans(plans),done=finalRows.filter(r=>r.completedDate).length,planned=finalRows.filter(r=>!r.completedDate&&r.plannedDate).length;
    lastReport={
      ok:true,campaign:CAMPAIGN.id,planner:'v188',startDate:startIso,dueDate:CAMPAIGN.dueDate,
      done,total:campaignTargets().length,planned,pending:campaignTargets().length-done-planned,
      unresolved,deferred:evicted.length,deferredUnplaced:deferredUnplaced.map(storeShort),
      overflowDays:candidate?candidate.overflowDays:[],overnight:candidate?candidate.overnight:null,
      nodes:solved.nodes,status:finalRows,preStartPlanned
    };
    try{if(changedKeys.size&&typeof root.storeRunnerRefreshOvernightDecision==='function')root.storeRunnerRefreshOvernightDecision(root.state.plan)}catch(e){}
    if(options.render!==false)renderSummary();
    if(options.emit!==false&&changedKeys.size&&root.document&&typeof root.CustomEvent==='function'){
      try{root.document.dispatchEvent(new root.CustomEvent('store-runner:planning-updated',{detail:{source:'priority-v188',campaign:CAMPAIGN.id}}))}catch(e){}
    }
    return lastReport
  }finally{applying=false}
}
function scheduleApply(source){
  if(applying)return;
  const run=()=>{
    const result=apply({});
    if(result&&result.ok&&typeof root.storeRunnerToast==='function'){
      try{
        if(result.pending)root.storeRunnerToast('Priorités services : '+result.pending+' magasin(s) restent à placer avant le 22/09.');
        else if(result.overnight)root.storeRunnerToast('Priorités optimisées · '+overnightText(result.overnight))
      }catch(e){}
    }
  };
  root.setTimeout?root.setTimeout(run,0):run()
}
function install(){
  if(!root.state||!Array.isArray(root.state.stores)){
    if(root.setTimeout&&bootAttempts++<40)root.setTimeout(install,100);
    return false
  }
  renderSummary();
  return true
}
if(root.document){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  root.document.addEventListener('store-runner:planning-updated',function(e){
    const source=e&&e.detail&&e.detail.source;
    if(source==='priority-v188'){renderSummary();return}
    if(['generateWeek','recalculateRemainingWeek','single-week-geo-v185'].includes(source))scheduleApply(source);
    else renderSummary()
  });
  root.document.addEventListener('store-runner:data-restored',renderSummary);
  root.document.addEventListener('store-runner:home-rendered',renderSummary)
}
const api={
  campaign:CAMPAIGN,apply,campaignTargets,campaignActive,campaignExpired,setCampaignTargets,status(){const data=weekPlansBetween(new Date());return statusFromPlans(data.plans)},
  render:renderSummary,targetMatches,completionDate,planningStartDate,
  solvePriorities,bestOvernightBetween,getLastReport(){return lastReport}
};
root.StoreRunnerPriorityCampaignV188=api;
root.StoreRunnerPriorityCampaignV187=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
