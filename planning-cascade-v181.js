(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1',RANGE_KEY='chef_sector_range_v1',MAX_WEEKS=26;
function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function add(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function clone(x){return JSON.parse(JSON.stringify(x))}
function empty(){return Object.fromEntries(DAYS.map(d=>[d,[]]))}
function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
function db(){try{return window.__chefStorage||window.localStorage}catch(e){return null}}
function load(key,fallback){try{const s=db();return s?JSON.parse(s.getItem(key)||JSON.stringify(fallback)):fallback}catch(e){return fallback}}
function weekMonday(){const input=document.getElementById('weekDate'),raw=(input&&input.value)||(state.settings&&state.settings.weekDate)||iso(new Date());return monday(parse(raw)||new Date())}
function workDays(){const checked=[];try{document.querySelectorAll('[data-day]').forEach(el=>{if(el.checked&&DAYS.includes(el.value))checked.push(el.value)})}catch(e){};if(checked.length)return checked;const saved=state.settings&&Array.isArray(state.settings.days)?state.settings.days.filter(d=>DAYS.includes(d)):[];return saved.length?saved:DAYS.slice(0,5)}
function dayDate(mon,day){return iso(add(mon,DAYS.indexOf(day)))}
function dayName(date){const d=parse(date),n=d&&d.getDay();return n>=1&&n<=6?DAYS[n-1]:''}
function storeId(s){return String((s&&s.id)||'')}
function storeName(s){return (String((s&&s.enseigne)||'Magasin')+' '+String((s&&s.ville)||'').trim()).trim()}
function actualCredit(s){try{if(window.StoreVisitCounting&&typeof StoreVisitCounting.credit==='function')return Math.max(1,Number(StoreVisitCounting.credit(s))||1)}catch(e){}return 1}
/* V261.4 : le recalcul propriétaire suit exactement les crédits métier. Il n'a plus
   aucune réserve ou incompatibilité cachée par enseigne : maxVisitsPerDay est le seul plafond. */
function planningCredit(s){return actualCredit(s)}
function routeCapacity(route){return (route||[]).reduce((n,s)=>n+planningCredit(s),0)}
function actualRouteCredits(route){return (route||[]).reduce((n,s)=>n+actualCredit(s),0)}
function routeFits(route,day,date){const api=window.StoreOpeningHoursV1;return !api||typeof api.routeFits!=='function'||api.routeFits(route,day,state,{date})}
function count(plan){return DAYS.reduce((n,d)=>n+((plan&&plan[d])||[]).length,0)}
function planSignature(plan){return DAYS.map(day=>((plan&&plan[day])||[]).map(storeId).join('|')).join('||')}
function samePlan(a,b){return planSignature(a)===planSignature(b)}
function visitedOn(id,date){const legacy=state.visits&&state.visits[String(id)];if(legacy&&(String(legacy.lastVisit||'')===date||(Array.isArray(legacy.history)&&legacy.history.some(d=>String(d||'')===date))))return true;const rows=state.businessV2&&Array.isArray(state.businessV2.visits)?state.businessV2.visits:[];return rows.some(v=>String(v&&v.storeId)===String(id)&&String(v&&v.status)==='completed'&&String((v&&v.completedDate)||(v&&v.completedAt)||'').slice(0,10)===date)}
function lockDay(id,week){try{if(typeof window.storeRunnerLockDayForWeek==='function'){const d=window.storeRunnerLockDayForWeek(id,week);if(DAYS.includes(d))return d}}catch(e){}const raw=state.locks&&state.locks[String(id)];if(typeof raw==='string')return DAYS.includes(raw)?raw:'';if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&DAYS.includes(raw.day)&&String(raw.week||'')===week)return raw.day;return''}
function appointmentDay(id,mon){for(const day of DAYS){const date=dayDate(mon,day);if((state.appointments||[]).some(a=>String(a&&a.storeId)===String(id)&&String(a&&a.date||'').slice(0,10)===date))return day}return''}
function blocks(e){if(!e)return false;if(e.inferredAway)return true;const text=norm((e.title||'')+' '+(e.location||'')+' '+(e.calendar||'')),hard=['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'];if(hard.some(w=>text.includes(w))||/\bparis\b/.test(text))return true;return !!(e.planningBlock&&!e.allDay)}
/* P0.2a — le recalcul bloque au moins les dates que bloque la génération 3 semaines : il
   interroge d'abord le prédicat du moteur terrain (StoreRunnerTerrainPlanningV1.dateBlocked,
   qui reconnaît notamment les jours fériés de l'Agenda), puis garde sa règle historique, qui
   voit en plus les déplacements déduits (inferredAway). Sans le module terrain, rien ne change. */
function blocked(date){try{const terrain=window.StoreRunnerTerrainPlanningV1;if(terrain&&typeof terrain.dateBlocked==='function'&&terrain.dateBlocked(date,state))return true}catch(e){}try{return (typeof window.calendarEventsForDate==='function'?window.calendarEventsForDate(date):[]).some(blocks)}catch(e){return false}}
function fixedError(day,route,max){const actual=actualRouteCredits(route),rows=(route||[]).map(s=>storeName(s)+' ('+actualCredit(s)+')');let m=day+' contient déjà '+actual+' crédit'+(actual>1?'s':'')+' fixe'+(actual>1?'s':'')+(rows.length?' : '+rows.join(' + '):'')+'. Ton maximum est réglé sur '+max+'. ';if(actual>max)m+=(actual<=8?'Passe-le à '+actual+' dans Réglages ou libère une visite. ':'Augmente le maximum dans Réglages si c’est volontaire, ou libère une visite. ');return m+'Rien n’a été changé.'}
function impossibleError(store,kind,day,date){const d=parse(date),when=day.toLowerCase()+(d?' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'):'');return storeName(store)+(kind==='rendez-vous'?' a un rendez-vous le ':' est verrouillé sur le ')+when+', mais ce jour n’est pas disponible. Rien n’a été changé.'}
function keyOf(s){const id=storeId(s);return id?'id|'+id:norm(s&&s.enseigne)+'|'+norm(s&&s.ville)+'|'+norm(s&&s.adresse)}
function stats(archive,start,end){let stores=0,visits=0;const unique=new Set();for(const [key,snap] of Object.entries(archive||{})){const mon=parse((snap&&snap.weekMonday)||key);if(!mon||!snap||!snap.plan)continue;for(let i=0;i<DAYS.length;i++){const date=iso(add(mon,i));if(date<start||date>end)continue;for(const s of snap.plan[DAYS[i]]||[]){stores++;visits+=actualCredit(s);unique.add(keyOf(s))}}}return{stores,visits,uniqueStores:unique.size}}
function cascadeRange(archive,startWeek,lastWeek,days){const previous=load(RANGE_KEY,null)||{},priorEnd=parse(previous.end),cascadeEnd=add(parse(lastWeek)||parse(startWeek),5),end=iso(priorEnd&&priorEnd>cascadeEnd?priorEnd:cascadeEnd),start=startWeek,startMon=monday(parse(start)),endMon=monday(parse(end)),weeks=Math.max(1,Math.round((endMon-startMon)/604800000)+1),s=stats(archive,start,end);return Object.assign({},previous,{start,end,weeks,workDays:days.slice(),uniqueStores:s.uniqueStores,totalStores:s.stores,totalVisits:s.visits,rotation:'cascade-credit-v181',updatedAt:new Date().toISOString()})}
function canStay(plan,store,day,date,max,days){
  if(!days.includes(day)||blocked(date))return false;
  const id=storeId(store),route=plan[day]||[],trial=route.concat(store);
  if(DAYS.some(d=>(plan[d]||[]).some(s=>storeId(s)===id)))return false;
  return routeCapacity(trial)<=max&&routeFits(trial,day,date);
}
/* V263 — le recalcul lit le besoin réel de visite (visit-coverage.js). Une visite future
   non contrainte d'un magasin visité trop récemment pour sa fréquence est retirée ; une
   visite ratée d'un magasin déjà vu ailleurs n'est plus replacée. Les créneaux libérés
   vont, dans la même semaine, aux magasins en retard, jamais visités ou bientôt dus,
   puis au jour le plus cohérent géographiquement. Sans le module, rien ne change. */
function canonical(store){const id=storeId(store);return (state.stores||[]).find(s=>String(s&&s.id)===id)||store}
function coverageNeed(){try{const api=window.StoreRunnerVisitCoverage;if(api&&typeof api.needOf==='function')return api.needOf(state)}catch(e){}return null}
function passesFilters(s){try{if(typeof window.includedByFilters==='function')return !!window.includedByFilters(s)}catch(e){}return true}
function distanceBetween(a,b){try{if(typeof window.hav==='function'){const n=Number(window.hav(a,b));if(Number.isFinite(n))return n}}catch(e){}return Infinity}
function baseDistance(s){try{if(typeof window.havBase==='function'){const n=Number(window.havBase(s));if(Number.isFinite(n))return n}}catch(e){}return Infinity}
function cohesion(route,s){if(!route||!route.length)return baseDistance(s);let best=Infinity;for(const x of route)best=Math.min(best,distanceBetween(x,s));return best}
function routeKm(route){try{if(typeof window.routeCost==='function')return Number(window.routeCost(route))||0}catch(e){}return 0}
function planKm(plan){return DAYS.reduce((n,d)=>n+routeKm((plan&&plan[d])||[]),0)}
function needOrder(a,b){if(b.n.tier!==a.n.tier)return b.n.tier-a.n.tier;if(a.n.tier>=4&&(b.n.ratio||0)!==(a.n.ratio||0))return (b.n.ratio||0)-(a.n.ratio||0);return (Number(b.n.overdueDays)||0)-(Number(a.n.overdueDays)||0)||storeName(a.s).localeCompare(storeName(b.s),'fr')}
function catchUpPresent(weeks,needFn,today){let n=0;const seen=new Set();for(const plan of Object.values(weeks||{}))for(const d of DAYS)for(const s of ((plan&&plan[d])||[])){const id=storeId(s);if(seen.has(id))continue;seen.add(id);const x=needFn(canonical(s),today);if(!x.blocked&&x.tier>=2)n++}return n}
function fillFreedSlots(weeks,removed,needFn,today,days,max){
  const added=[],present=new Set();
  for(const plan of Object.values(weeks))for(const d of DAYS)for(const s of (plan[d]||[]))present.add(storeId(s));
  for(const r of removed)present.add(r.id);
  const perWeek={};for(const r of removed)perWeek[r.key]=(perWeek[r.key]||0)+1;
  for(const key of Object.keys(perWeek).sort()){
    const wm=parse(key),plan=weeks[key];if(!wm||!plan)continue;
    const ref=key<today?today:key;
    const pool=(state.stores||[]).filter(s=>s&&s.active!==false&&!(state.excluded&&state.excluded[s.id])&&!present.has(storeId(s))&&passesFilters(s))
      .map(s=>({s,n:needFn(s,ref)})).filter(x=>!x.n.blocked&&x.n.tier>=2).sort(needOrder);
    let left=perWeek[key];
    for(const {s,n} of pool){
      if(left<=0)break;
      const id=storeId(s),lock=lockDay(id,key),appt=appointmentDay(id,wm);
      let best=null;
      for(const day of DAYS){
        const date=dayDate(wm,day);
        if(date<today||!days.includes(day)||blocked(date)||(lock&&lock!==day)||(appt&&appt!==day))continue;
        if(needFn(s,date).blocked)continue;
        const trial=(plan[day]||[]).concat(s);if(routeCapacity(trial)>max||!routeFits(trial,day,date))continue;
        const score=cohesion(plan[day],s),load=routeCapacity(plan[day]);
        if(!best||score<best.score-0.001||(Math.abs(score-best.score)<0.001&&load<best.load))best={day,date,score,load};
      }
      if(!best)continue;
      plan[best.day].push(s);present.add(id);left--;
      added.push({id,name:storeName(s),key,day:best.day,date:best.date,status:n.status,label:n.label||''});
    }
  }
  return added;
}
/* V263.2 — ordre de passage après recalcul. Une journée modifiée par le recalcul gardait
   l'ordre de l'ancienne tournée et recevait ses ajouts en dernier (cas terrain
   Saint-Étienne : Limonest › Écully › Saint-Étienne, retour 14:31 au lieu de 13:45 pour
   les mêmes kilomètres). On lui applique l'ordre V251 — contraintes, puis conduite, puis
   fin de journée, puis attente — et seulement à elle : journée future (jamais aujourd'hui
   ni un jour passé), magasins modifiés par ce recalcul, semaine non retouchée à la main.
   Un premier arrêt à arrivée imposée reste premier. V251 ne change jamais les magasins
   d'une journée et refuse tout ordre infaisable. Sans V251, rien ne change. */
function routeOptimizer(){const api=window.StoreRunnerRouteOptimizerV251;return api&&typeof api.explainOptimization==='function'?api:null}
function sameIds(a,b){const x=(a||[]).map(storeId),y=(b||[]).map(storeId);return x.length===y.length&&x.every((id,i)=>id===y[i])}
function sameMembers(a,b){const sig=r=>(r||[]).map(storeId).sort().join('|');return (a||[]).length===(b||[]).length&&sig(a)===sig(b)}
/* Une semaine marquée « manuelle » par un recalcul précédent n'a pas été retouchée par
   l'utilisateur tant que sa date de marque et son plan — celui de l'archive comme celui
   qu'on recalcule — sont exactement ceux que ce recalcul a écrits. Toute retouche (ajout,
   retrait, ordre, « Commencer par ici », remplacement) réécrit le plan et
   `manualEditedAt` : la semaine redevient intouchable. */
function recalcOnly(snap,plan){const r=snap&&snap.recalculated,sig=r&&r.signature;return !!(r&&r.at&&r.at===snap.manualEditedAt&&sig===planSignature(snap.plan)&&sig===planSignature(plan))}
function userManualWeek(key,archive,plan){const snap=archive&&archive[key];return !!(((state.manualWeekEdits&&state.manualWeekEdits[key])||(snap&&snap.manualEdited))&&!recalcOnly(snap,plan))}
function imposedFirstId(route,date){const id=storeId(route&&route[0]);return id&&(state.appointments||[]).some(a=>a&&a.manualHours===true&&String(a.storeId)===id&&String(a.date||'').slice(0,10)===date)?id:''}
function orderChangedDays(source,weeks,userManual,today){
  const api=routeOptimizer(),out=[];if(!api)return out;
  for(const key of Object.keys(weeks).sort()){
    if(userManual[key])continue;
    const wm=parse(key),before=source[key]||empty(),plan=weeks[key];
    for(const day of DAYS){
      const date=dayDate(wm,day),route=plan[day]||[];
      if(date<=today||route.length<2||sameIds(before[day],route))continue;
      let x=null;try{x=api.explainOptimization(route,day,state,{weekMonday:key,fixedFirstId:imposedFirstId(route,date)})}catch(e){x=null}
      if(!x||!x.changed||!Array.isArray(x.route)||!sameMembers(route,x.route))continue;
      plan[day]=x.route.slice();
      out.push({key,day,date,driveBefore:Number(x.before&&x.before.driveMinutes),driveAfter:Number(x.after&&x.after.driveMinutes),endBefore:Number(x.before&&x.before.estimatedEnd),endAfter:Number(x.after&&x.after.estimatedEnd)});
    }
  }
  return out;
}
function hm(m){const v=Math.round(Number(m));if(!Number.isFinite(v))return'';const x=((v%1440)+1440)%1440;return String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0')}
function orderLabel(x){const d=parse(x.date),parts=[],drive=Math.round(x.driveBefore-x.driveAfter),end=Math.round(x.endBefore-x.endAfter);if(Number.isFinite(drive)&&drive>=1)parts.push('−'+drive+' min de route');if(Number.isFinite(end)&&end>=1)parts.push('retour ~'+hm(x.endAfter)+' au lieu de ~'+hm(x.endBefore));return x.day+(d?' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'):'')+(parts.length?' ('+parts.join(', ')+')':'')}
function previewLines(r){
  const lines=[],names=list=>list.slice(0,4).map(x=>x.name).join(', ')+(list.length>4?'…':'');
  lines.push('✓ '+r.kept+' visite'+(r.kept>1?'s':'')+' conservée'+(r.kept>1?'s':'')+(r.visitedKept?' (dont '+r.visitedKept+' déjà faite'+(r.visitedKept>1?'s':'')+')':''));
  if(r.removed.length)lines.push('− '+r.removed.length+' retiré'+(r.removed.length>1?'s':'')+' car déjà visité'+(r.removed.length>1?'s':'')+' récemment : '+names(r.removed));
  if(r.added.length)lines.push('+ '+r.added.length+' ajouté'+(r.added.length>1?'s':'')+' car en retard ou jamais visité'+(r.added.length>1?'s':'')+' : '+names(r.added));
  if(r.moved)lines.push('↔ '+r.moved+' visite'+(r.moved>1?'s':'')+' à replacer');
  if(r.reordered&&r.reordered.length)lines.push('↕ Ordre de passage optimisé : '+r.reordered.map(orderLabel).join(' · '));
  if(r.kmBefore>0||r.kmAfter>0)lines.push('Kilométrage estimé semaine : ~'+Math.round(r.kmBefore)+' km → ~'+Math.round(r.kmAfter)+' km');
  if(r.coverageBefore!=null)lines.push('Magasins à rattraper planifiés : '+r.coverageBefore+' → '+r.coverageAfter);
  return lines;
}
function build(){
  if(!window.state||!state.plan)return{ok:false,error:'Aucun planning à recalculer.'};
  try{if(typeof window.readPlanningControls==='function')window.readPlanningControls();else if(typeof readPlanningControls==='function')readPlanningControls()}catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}
  const mon=weekMonday(),weekKey=iso(mon),today=iso(new Date()),days=workDays(),max=Math.max(1,Math.min(8,Number(state.settings&&state.settings.maxVisitsPerDay)||4)),archive=load(ARCHIVE_KEY,{}),source={},weeks={},entries={},movable=[],overCapacityKept=[],removed=[],needFn=coverageNeed();
  let total=0,visited=0,appointments=0,locks=0,past=0,stableKept=0;
  source[weekKey]=clone(state.plan||empty());for(const [key,snap] of Object.entries(archive))if(key>weekKey&&snap&&snap.plan&&parse(key))source[key]=clone(snap.plan);
  const userManual={};for(const key of Object.keys(source))userManual[key]=userManualWeek(key,archive,source[key]);
  const weekPlan=key=>weeks[key]||(weeks[key]=empty());
  /* P0.3 — une vraie retouche utilisateur à venir est une zone fermée : son plan est recopié tel
     quel, rien n'y est retiré, ajouté, déplacé ni réordonné, et la cascade la traverse sans s'y
     poser. La semaine affichée, que l'utilisateur demande de recalculer, reste recalculée ; une
     semaine marquée par un recalcul précédent (recalcOnly) reste ouverte. */
  const closedWeek=key=>key>weekKey&&(Object.prototype.hasOwnProperty.call(userManual,key)?userManual[key]:userManualWeek(key,archive,(archive[key]&&archive[key].plan)||empty()));

  /* V252 : on commence par décrire le planning actuel au lieu de le vider. Une visite
     future valide doit avoir le droit de rester exactement sur son jour ; seules les
     visites réellement incompatibles rejoignent ensuite la cascade. */
  for(const key of Object.keys(source).sort()){
    const wm=parse(key),plan=source[key]||empty(),seen=new Set(),shut=closedWeek(key);entries[key]=[];
    if(shut)weeks[key]=Object.assign(empty(),clone(plan));else weekPlan(key);
    for(const day of DAYS){const date=dayDate(wm,day);for(let index=0;index<(plan[day]||[]).length;index++){
      const store=plan[day][index],id=storeId(store);if(!id||seen.has(id))return{ok:false,error:'Magasin invalide ou en double dans la semaine du '+key+'. Rien n’a été changé.'};
      seen.add(id);total++;
      if(shut)continue;
      const done=visitedOn(id,date),appt=appointmentDay(id,wm),lock=lockDay(id,key),fixed=done?day:(appt||lock);
      /* P0.3 — un rendez-vous (prioritaire) ou un verrou à venir posé sur un jour impossible
         (non travaillé ou bloqué par l'Agenda) : refus contrôlé avant tout déplacement. Une
         visite réellement réalisée reste un fait et garde sa priorité historique. */
      const target=done?'':(appt||lock),targetDate=target?dayDate(wm,target):'';
      if(target&&targetDate>=today&&(!days.includes(target)||blocked(targetDate)))return{ok:false,error:impossibleError(canonical(store),appt?'rendez-vous':'verrou',target,targetDate)};
      if(done)visited++;else if(appt)appointments++;else if(lock)locks++;
      if(!fixed&&date<today)past++;
      entries[key].push({store,id,key,day,date,index,fixed});
    }}
  }
  if(!total)return{ok:false,error:'Aucun magasin n’est planifié à recalculer.'};

  /* Les rendez-vous/verrous qui changent réellement de jour sont posés en premier : ils
     restent non négociables. Ils peuvent rendre un autre magasin instable, mais ils ne
     déclenchent plus une reconstruction de toutes les journées sans rapport. */
  for(const key of Object.keys(entries).sort())for(const item of entries[key]){
    if(item.fixed&&item.fixed!==item.day)weekPlan(key)[item.fixed].push(item.store);
  }

  /* Puis on relit chaque journée dans son ordre d'origine. Les éléments fixes restés sur
     le même jour gardent leur position relative ; chaque autre visite future est conservée
     si la journée reste compatible avec capacité, horaires et Agenda. */
  for(const key of Object.keys(entries).sort())for(const day of DAYS){
    const plan=weekPlan(key),rows=entries[key].filter(item=>item.day===day).sort((a,b)=>a.index-b.index);
    for(const item of rows){
      if(item.fixed){if(item.fixed===day)plan[day].push(item.store);continue}
      if(needFn){const at=item.date<today?today:item.date,n=needFn(canonical(item.store),at);if(n.blocked){removed.push({id:item.id,key:item.key,day:item.day,date:item.date,name:storeName(canonical(item.store)),status:n.status,reason:item.date<today?'visité un autre jour':'visité récemment'});continue}}
      if(item.date<today){movable.push(item);continue}
      if(canStay(plan,item.store,day,item.date,max,days)){plan[day].push(item.store);stableKept++}
      else movable.push(item);
    }
  }

  /* V261.4 : une journée déjà fixée aujourd'hui peut avoir été volontairement chargée
     au-delà du plafond. On la conserve telle quelle, mais elle devient fermée à tout ajout.
     Pour les jours futurs, le seul critère de capacité est le total de crédits métier. */
  for(const [key,plan] of Object.entries(weeks)){if(closedWeek(key))continue;const wm=parse(key);for(const day of DAYS){
    const date=dayDate(wm,day),route=plan[day]||[],actual=actualRouteCredits(route),cap=routeCapacity(route);
    if(date<today)continue;
    if(cap>max){if(date===today&&actual>max){overCapacityKept.push({week:key,day,date,actual,max});continue}return{ok:false,error:fixedError(day,route,max)}}
  }}

  movable.sort((a,b)=>a.date===b.date?a.index-b.index:(a.date<b.date?-1:1));
  const limit=add(parse(weekKey),MAX_WEEKS*7-1);let latest=today;
  for(const item of movable){
    let cursor=parse(item.date<today?today:item.date),placed=false;
    while(cursor&&cursor<=limit){
      const date=iso(cursor),day=dayName(date);
      if(day&&days.includes(day)&&!blocked(date)&&!closedWeek(iso(monday(cursor)))){
        const wk=iso(monday(cursor)),plan=weekPlan(wk),route=plan[day],id=storeId(item.store),trial=route.concat(item.store);
        if(!DAYS.some(d=>plan[d].some(s=>storeId(s)===id))&&routeCapacity(trial)<=max&&routeFits(trial,day,date)){
          route.push(item.store);placed=true;if(date>latest)latest=date;break;
        }
      }
      cursor=add(cursor,1);
    }
    if(!placed)return{ok:false,error:'Le décalage dépasse '+MAX_WEEKS+' semaines. '+storeName(item.store)+' n’a pas pu être replacé. Rien n’a été changé.'};
  }

  const added=needFn&&removed.length?fillFreedSlots(weeks,removed,needFn,today,days,max):[];
  const after=Object.values(weeks).reduce((n,p)=>n+count(p),0);if(after!==total-removed.length+added.length)return{ok:false,error:'Contrôle de sécurité : le nombre de visites a changé pendant le recalcul. Rien n’a été changé.'};
  const reordered=orderChangedDays(source,weeks,userManual,today);
  const keys=Object.keys(weeks).sort(),last=keys[keys.length-1]||weekKey,changedWeekKeys=keys.filter(key=>!source[key]||!samePlan(source[key],weeks[key]));
  const nextArchive=clone(archive),editedAt=new Date().toISOString();
  /* La marque `recalculated` dit que la protection vient de ce recalcul : jamais posée sur
     une semaine retouchée à la main, qui le reste. */
  for(const key of changedWeekKeys){const previous=nextArchive[key]||{},entry=Object.assign({},previous,{weekMonday:key,plan:clone(weeks[key]),manualEdited:true,manualEditedAt:editedAt});if(userManual[key])delete entry.recalculated;else entry.recalculated={at:editedAt,signature:planSignature(weeks[key])};nextArchive[key]=entry}
  const range=changedWeekKeys.length?cascadeRange(nextArchive,weekKey,last,days):(load(RANGE_KEY,null)||cascadeRange(nextArchive,weekKey,last,days));
  const result={ok:true,plan:weeks[weekKey]||empty(),weeks,archive:nextArchive,range,weekKey,lastWeekKey:last,latestPlaced:latest,weeksTouched:changedWeekKeys.length,changedWeekKeys,unchanged:changedWeekKeys.length===0,stableKept,visitedKept:visited,appointmentsKept:appointments,locksKept:locks,pastUnvisited:past,moved:movable.length,totalOccurrences:total,overCapacityKept,removed,added,reordered,kept:total-removed.length,
    kmBefore:planKm(source[weekKey]),kmAfter:planKm(weeks[weekKey]),coverageBefore:needFn?catchUpPresent(source,needFn,today):null,coverageAfter:needFn?catchUpPresent(weeks,needFn,today):null};
  result.previewLines=previewLines(result);
  return result;
}
function capacityWarning(result){const rows=result&&Array.isArray(result.overCapacityKept)?result.overCapacityKept:[];if(!rows.length)return'';const first=rows[0],more=rows.length>1?' · +'+(rows.length-1)+' autre'+(rows.length>2?'s':'')+' journée'+(rows.length>2?'s':'')+' chargée'+(rows.length>2?'s':''):'';return first.day+' conservé à '+first.actual+'/'+first.max+' crédits · aucun ajout sur cette journée'+more+'.'}
function status(message,type){let box=document.getElementById('planningGenerateStatus');if(box){box.textContent=message||'';box.style.color=type==='bad'?'#b42318':type==='ok'?'#137333':'#667085';box.style.fontWeight=type==='bad'||type==='ok'?'700':'500'}if(type==='bad'&&typeof window.showError==='function')try{window.showError(message)}catch(e){}if(typeof window.storeRunnerToast==='function'&&(type==='bad'||type==='ok'))try{window.storeRunnerToast(message)}catch(e){}}
function markManual(weeks,keys){try{state.manualWeekEdits=state.manualWeekEdits||{};const at=new Date().toISOString(),wanted=new Set(Array.isArray(keys)?keys:Object.keys(weeks||{}));for(const [key,plan] of Object.entries(weeks||{}))if(wanted.has(key))state.manualWeekEdits[key]={at,plan:clone(plan)};if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){console.warn('Marquage manuel non enregistré',e)}}
function confirmText(result){
  const lines=Array.isArray(result&&result.previewLines)?result.previewLines:[];
  return 'Recalculer le reste du planning à partir d’aujourd’hui ?\n\n'+(lines.length?'Ce que le recalcul change :\n'+lines.join('\n')+'\n\n':'')+'Les visites déjà effectuées, les rendez-vous et les magasins posés ou verrouillés restent en place. Les journées futures encore valides ne bougent pas.';
}
async function recalc(){
  if(!window.state||!state.plan){status('Aucun planning à recalculer.','bad');return{ok:false}}
  status('Recalcul stable du planning…','busy');
  try{
    if(window.ChefReliability&&typeof ChefReliability.checkpoint==='function')ChefReliability.checkpoint('Avant recalcul stable du planning');
    const old=window.__storeRunnerPlanningGenerationActive;window.__storeRunnerPlanningGenerationActive=true;let result;try{result=build()}finally{window.__storeRunnerPlanningGenerationActive=old}
    if(!result.ok){status(result.error||'Recalcul impossible.','bad');return result}
    const warning=capacityWarning(result);
    if(result.unchanged){status('Planning déjà stable ✓ Aucun déplacement nécessaire.'+(warning?' '+warning:''),'ok');return result}
    /* V263 : calculer d'abord, puis montrer ce qui change avant d'appliquer. La proposition
       est ensuite appliquée par ChefReliability.propose (application automatique V189). */
    if(!confirm(confirmText(result))){status('Planning précédent conservé.','busy');return{ok:false,cancelled:true}}
    const accepted=window.ChefReliability&&typeof ChefReliability.propose==='function'?await ChefReliability.propose({plan:result.plan,weekDate:result.weekKey,archive:result.archive,range:result.range,storeCount:result.range.totalStores,visitCredits:result.range.totalVisits,previewTitle:'Ce que le recalcul change',previewLines:result.previewLines}):false;
    if(!accepted){status('Planning précédent conservé.','busy');return{ok:false,cancelled:true}}
    markManual(result.weeks,result.changedWeekKeys);
    try{if(typeof window.renderAll==='function')window.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}
    try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'recalculatePlanningCascade'}}))}catch(e){}
    const spill=result.lastWeekKey>result.weekKey?' · décalage jusqu’à la semaine du '+result.lastWeekKey:'';
    status('Planning recalculé ✓ '+result.moved+' visite'+(result.moved>1?'s':'')+' déplacée'+(result.moved>1?'s':'')+' · '+result.stableKept+' visite'+(result.stableKept>1?'s':'')+' future'+(result.stableKept>1?'s':'')+' laissée'+(result.stableKept>1?'s':'')+' en place'+(result.removed.length?' · '+result.removed.length+' retirée'+(result.removed.length>1?'s':'')+' (déjà visité'+(result.removed.length>1?'s':'')+')':'')+(result.added.length?' · '+result.added.length+' ajoutée'+(result.added.length>1?'s':'')+' (en retard)':'')+spill+'.'+(warning?' '+warning:''),'ok');
    return result;
  }catch(e){const message=e&&e.message?e.message:String(e);status('Recalcul impossible : '+message,'bad');return{ok:false,error:message}}
}
function install(){window.storeRunnerRecalculateRemainingWeek=recalc;window.__storeRunnerBuildRemainingWeekPlan=build;const b=document.getElementById('recalculateRemainingWeekBtn');if(b)b.textContent='↻ Recalculer le reste du planning';return true}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();window.addEventListener('load',install,{once:true});document.addEventListener('store-runner:data-restored',install);document.addEventListener('visibilitychange',()=>{if(!document.hidden)install()});
})();