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
function planningCredit(s){try{if(typeof window.storeVisitCredit==='function')return Math.max(1,Number(window.storeVisitCredit(s))||1)}catch(e){}return actualCredit(s)}
function routeCapacity(route){return (route||[]).reduce((n,s)=>n+planningCredit(s),0)}
function actualRouteCredits(route){return (route||[]).reduce((n,s)=>n+actualCredit(s),0)}
function currentStore(s){return (state.stores||[]).find(row=>storeId(row)===storeId(s))||s}
function isBoulanger(s){return /\bboulanger\b/.test(norm(currentStore(s).enseigne))}
function boulangerCount(route){return (route||[]).filter(isBoulanger).length}
function boulangerConflict(route){const list=route||[],count=boulangerCount(list);return count>1||(count===1&&list.some(s=>!isBoulanger(s)&&actualCredit(s)>1))}
function routeFits(route,day,date){const api=window.StoreOpeningHoursV1;return !api||typeof api.routeFits!=='function'||api.routeFits(route,day,state,{date})}
function count(plan){return DAYS.reduce((n,d)=>n+((plan&&plan[d])||[]).length,0)}
function planSignature(plan){return DAYS.map(day=>((plan&&plan[day])||[]).map(storeId).join('|')).join('||')}
function samePlan(a,b){return planSignature(a)===planSignature(b)}
function visitedOn(id,date){const legacy=state.visits&&state.visits[String(id)];if(legacy&&(String(legacy.lastVisit||'')===date||(Array.isArray(legacy.history)&&legacy.history.some(d=>String(d||'')===date))))return true;const rows=state.businessV2&&Array.isArray(state.businessV2.visits)?state.businessV2.visits:[];return rows.some(v=>String(v&&v.storeId)===String(id)&&String(v&&v.status)==='completed'&&String((v&&v.completedDate)||(v&&v.completedAt)||'').slice(0,10)===date)}
function lockDay(id,week){try{if(typeof window.storeRunnerLockDayForWeek==='function'){const d=window.storeRunnerLockDayForWeek(id,week);if(DAYS.includes(d))return d}}catch(e){}const raw=state.locks&&state.locks[String(id)];if(typeof raw==='string')return DAYS.includes(raw)?raw:'';if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&DAYS.includes(raw.day)&&String(raw.week||'')===week)return raw.day;return''}
function appointmentDay(id,mon){for(const day of DAYS){const date=dayDate(mon,day);if((state.appointments||[]).some(a=>String(a&&a.storeId)===String(id)&&String(a&&a.date||'').slice(0,10)===date))return day}return''}
function blocks(e){if(!e)return false;if(e.inferredAway)return true;const text=norm((e.title||'')+' '+(e.location||'')+' '+(e.calendar||'')),hard=['formation','deplacement','seminaire','conge','vacances','salon professionnel','indisponible','indisponibilite','absence','absent','journee bloquee','jour bloque','repos','hors secteur'];if(hard.some(w=>text.includes(w))||/\bparis\b/.test(text))return true;return !!(e.planningBlock&&!e.allDay)}
function blocked(date){try{return (typeof window.calendarEventsForDate==='function'?window.calendarEventsForDate(date):[]).some(blocks)}catch(e){return false}}
function fixedError(day,route,max){const actual=actualRouteCredits(route),cap=routeCapacity(route),rows=(route||[]).map(s=>storeName(s)+' ('+actualVisitCreditSafe(s)+')');let m=day+' contient déjà '+actual+' crédit'+(actual>1?'s':'')+' fixe'+(actual>1?'s':'')+(rows.length?' : '+rows.join(' + '):'')+'. Ton maximum est réglé sur '+max+'. ';if(boulangerConflict(route)||cap>max&&actual<=max)m+='La règle Boulanger n’autorise qu’un seul magasin à 1 crédit à ses côtés. Libère ou déplace le magasin incompatible. ';else if(actual>max)m+=(actual<=8?'Passe-le à '+actual+' dans Réglages ou libère une visite. ':'Augmente le maximum dans Réglages si c’est volontaire, ou libère une visite. ');return m+'Rien n’a été changé.'}
function actualVisitCreditSafe(s){return actualCredit(s)}
function keyOf(s){const id=storeId(s);return id?'id|'+id:norm(s&&s.enseigne)+'|'+norm(s&&s.ville)+'|'+norm(s&&s.adresse)}
function stats(archive,start,end){let stores=0,visits=0;const unique=new Set();for(const [key,snap] of Object.entries(archive||{})){const mon=parse((snap&&snap.weekMonday)||key);if(!mon||!snap||!snap.plan)continue;for(let i=0;i<DAYS.length;i++){const date=iso(add(mon,i));if(date<start||date>end)continue;for(const s of snap.plan[DAYS[i]]||[]){stores++;visits+=actualCredit(s);unique.add(keyOf(s))}}}return{stores,visits,uniqueStores:unique.size}}
function cascadeRange(archive,startWeek,lastWeek,days){const previous=load(RANGE_KEY,null)||{},priorEnd=parse(previous.end),cascadeEnd=add(parse(lastWeek)||parse(startWeek),5),end=iso(priorEnd&&priorEnd>cascadeEnd?priorEnd:cascadeEnd),start=startWeek,startMon=monday(parse(start)),endMon=monday(parse(end)),weeks=Math.max(1,Math.round((endMon-startMon)/604800000)+1),s=stats(archive,start,end);return Object.assign({},previous,{start,end,weeks,workDays:days.slice(),uniqueStores:s.uniqueStores,totalStores:s.stores,totalVisits:s.visits,rotation:'cascade-credit-v181',updatedAt:new Date().toISOString()})}
function canStay(plan,store,day,date,max,days){
  if(!days.includes(day)||blocked(date))return false;
  const id=storeId(store),route=plan[day]||[],trial=route.concat(store);
  if(DAYS.some(d=>(plan[d]||[]).some(s=>storeId(s)===id)))return false;
  return boulangerCount(trial)<=1&&routeCapacity(trial)<=max&&routeFits(trial,day,date);
}
function build(){
  if(!window.state||!state.plan)return{ok:false,error:'Aucun planning à recalculer.'};
  try{if(typeof window.readPlanningControls==='function')window.readPlanningControls();else if(typeof readPlanningControls==='function')readPlanningControls()}catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}
  const mon=weekMonday(),weekKey=iso(mon),today=iso(new Date()),days=workDays(),max=Math.max(1,Math.min(8,Number(state.settings&&state.settings.maxVisitsPerDay)||4)),archive=load(ARCHIVE_KEY,{}),source={},weeks={},entries={},movable=[],overCapacityKept=[];
  let total=0,visited=0,appointments=0,locks=0,past=0,stableKept=0;
  source[weekKey]=clone(state.plan||empty());for(const [key,snap] of Object.entries(archive))if(key>weekKey&&snap&&snap.plan&&parse(key))source[key]=clone(snap.plan);
  const weekPlan=key=>weeks[key]||(weeks[key]=empty());

  /* V252 : on commence par décrire le planning actuel au lieu de le vider. Une visite
     future valide doit avoir le droit de rester exactement sur son jour ; seules les
     visites réellement incompatibles rejoignent ensuite la cascade. */
  for(const key of Object.keys(source).sort()){
    const wm=parse(key),plan=source[key]||empty(),seen=new Set();weekPlan(key);entries[key]=[];
    for(const day of DAYS){const date=dayDate(wm,day);for(let index=0;index<(plan[day]||[]).length;index++){
      const store=plan[day][index],id=storeId(store);if(!id||seen.has(id))return{ok:false,error:'Magasin invalide ou en double dans la semaine du '+key+'. Rien n’a été changé.'};
      seen.add(id);total++;
      const done=visitedOn(id,date),appt=appointmentDay(id,wm),lock=lockDay(id,key),fixed=done?day:(appt||lock);
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
     si la journée reste compatible avec capacité, Boulanger, horaires et Agenda. */
  for(const key of Object.keys(entries).sort())for(const day of DAYS){
    const plan=weekPlan(key),rows=entries[key].filter(item=>item.day===day).sort((a,b)=>a.index-b.index);
    for(const item of rows){
      if(item.fixed){if(item.fixed===day)plan[day].push(item.store);continue}
      if(item.date<today){movable.push(item);continue}
      if(canStay(plan,item.store,day,item.date,max,days)){plan[day].push(item.store);stableKept++}
      else movable.push(item);
    }
  }

  /* V254.2 : une journée déjà fixée aujourd'hui peut avoir été volontairement chargée
     au-delà du plafond. On la conserve telle quelle, mais elle devient fermée à tout ajout.
     Les futures journées surchargées restent refusées, et la règle Boulanger reste stricte. */
  for(const [key,plan] of Object.entries(weeks)){const wm=parse(key);for(const day of DAYS){
    const date=dayDate(wm,day),route=plan[day]||[],actual=actualRouteCredits(route),cap=routeCapacity(route);
    if(date<today)continue;
    if(boulangerConflict(route)||(cap>max&&actual<=max))return{ok:false,error:fixedError(day,route,max)};
    if(cap>max){if(date===today&&actual>max){overCapacityKept.push({week:key,day,date,actual,max});continue}return{ok:false,error:fixedError(day,route,max)}}
  }}

  movable.sort((a,b)=>a.date===b.date?a.index-b.index:(a.date<b.date?-1:1));
  const limit=add(parse(weekKey),MAX_WEEKS*7-1);let latest=today;
  for(const item of movable){
    let cursor=parse(item.date<today?today:item.date),placed=false;
    while(cursor&&cursor<=limit){
      const date=iso(cursor),day=dayName(date);
      if(day&&days.includes(day)&&!blocked(date)){
        const wk=iso(monday(cursor)),plan=weekPlan(wk),route=plan[day],id=storeId(item.store),trial=route.concat(item.store);
        if(!DAYS.some(d=>plan[d].some(s=>storeId(s)===id))&&boulangerCount(trial)<=1&&routeCapacity(trial)<=max&&routeFits(trial,day,date)){
          route.push(item.store);placed=true;if(date>latest)latest=date;break;
        }
      }
      cursor=add(cursor,1);
    }
    if(!placed)return{ok:false,error:'Le décalage dépasse '+MAX_WEEKS+' semaines. '+storeName(item.store)+' n’a pas pu être replacé. Rien n’a été changé.'};
  }

  const after=Object.values(weeks).reduce((n,p)=>n+count(p),0);if(after!==total)return{ok:false,error:'Contrôle de sécurité : le nombre de visites a changé pendant le recalcul. Rien n’a été changé.'};
  const keys=Object.keys(weeks).sort(),last=keys[keys.length-1]||weekKey,changedWeekKeys=keys.filter(key=>!source[key]||!samePlan(source[key],weeks[key]));
  const nextArchive=clone(archive),editedAt=new Date().toISOString();
  for(const key of changedWeekKeys){const previous=nextArchive[key]||{};nextArchive[key]=Object.assign({},previous,{weekMonday:key,plan:clone(weeks[key]),manualEdited:true,manualEditedAt:editedAt})}
  const range=changedWeekKeys.length?cascadeRange(nextArchive,weekKey,last,days):(load(RANGE_KEY,null)||cascadeRange(nextArchive,weekKey,last,days));
  return{ok:true,plan:weeks[weekKey]||empty(),weeks,archive:nextArchive,range,weekKey,lastWeekKey:last,latestPlaced:latest,weeksTouched:changedWeekKeys.length,changedWeekKeys,unchanged:changedWeekKeys.length===0,stableKept,visitedKept:visited,appointmentsKept:appointments,locksKept:locks,pastUnvisited:past,moved:movable.length,totalOccurrences:total,overCapacityKept};
}
function capacityWarning(result){const rows=result&&Array.isArray(result.overCapacityKept)?result.overCapacityKept:[];if(!rows.length)return'';const first=rows[0],more=rows.length>1?' · +'+(rows.length-1)+' autre'+(rows.length>2?'s':'')+' journée'+(rows.length>2?'s':'')+' chargée'+(rows.length>2?'s':''):'';return first.day+' conservé à '+first.actual+'/'+first.max+' crédits · aucun ajout sur cette journée'+more+'.'}
function status(message,type){let box=document.getElementById('planningGenerateStatus');if(box){box.textContent=message||'';box.style.color=type==='bad'?'#b42318':type==='ok'?'#137333':'#667085';box.style.fontWeight=type==='bad'||type==='ok'?'700':'500'}if(type==='bad'&&typeof window.showError==='function')try{window.showError(message)}catch(e){}if(typeof window.storeRunnerToast==='function'&&(type==='bad'||type==='ok'))try{window.storeRunnerToast(message)}catch(e){}}
function markManual(weeks,keys){try{state.manualWeekEdits=state.manualWeekEdits||{};const at=new Date().toISOString(),wanted=new Set(Array.isArray(keys)?keys:Object.keys(weeks||{}));for(const [key,plan] of Object.entries(weeks||{}))if(wanted.has(key))state.manualWeekEdits[key]={at,plan:clone(plan)};if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(e){console.warn('Marquage manuel non enregistré',e)}}
async function recalc(){
  if(!window.state||!state.plan){status('Aucun planning à recalculer.','bad');return{ok:false}}
  if(!confirm('Recalculer le reste du planning à partir d’aujourd’hui ?\n\nLes visites déjà effectuées, les rendez-vous et les magasins verrouillés resteront en place. Store Runner conservera aussi les journées futures qui sont encore valides et ne déplacera que ce qui doit réellement bouger.'))return{ok:false,cancelled:true};
  status('Recalcul stable du planning…','busy');
  try{
    if(window.ChefReliability&&typeof ChefReliability.checkpoint==='function')ChefReliability.checkpoint('Avant recalcul stable du planning');
    const old=window.__storeRunnerPlanningGenerationActive;window.__storeRunnerPlanningGenerationActive=true;let result;try{result=build()}finally{window.__storeRunnerPlanningGenerationActive=old}
    if(!result.ok){status(result.error||'Recalcul impossible.','bad');return result}
    const warning=capacityWarning(result);
    if(result.unchanged){status('Planning déjà stable ✓ Aucun déplacement nécessaire.'+(warning?' '+warning:''),'ok');return result}
    const accepted=window.ChefReliability&&typeof ChefReliability.propose==='function'?await ChefReliability.propose({plan:result.plan,weekDate:result.weekKey,archive:result.archive,range:result.range,storeCount:result.range.totalStores,visitCredits:result.range.totalVisits}):false;
    if(!accepted){status('Planning précédent conservé.','busy');return{ok:false,cancelled:true}}
    markManual(result.weeks,result.changedWeekKeys);
    try{if(typeof window.renderAll==='function')window.renderAll();else if(typeof renderAll==='function')renderAll()}catch(e){}
    try{document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'recalculatePlanningCascade'}}))}catch(e){}
    const spill=result.lastWeekKey>result.weekKey?' · décalage jusqu’à la semaine du '+result.lastWeekKey:'';
    status('Planning recalculé ✓ '+result.moved+' visite'+(result.moved>1?'s':'')+' déplacée'+(result.moved>1?'s':'')+' · '+result.stableKept+' visite'+(result.stableKept>1?'s':'')+' future'+(result.stableKept>1?'s':'')+' laissée'+(result.stableKept>1?'s':'')+' en place'+spill+'.'+(warning?' '+warning:''),'ok');
    return result;
  }catch(e){const message=e&&e.message?e.message:String(e);status('Recalcul impossible : '+message,'bad');return{ok:false,error:message}}
}
function install(){window.storeRunnerRecalculateRemainingWeek=recalc;window.__storeRunnerBuildRemainingWeekPlan=build;const b=document.getElementById('recalculateRemainingWeekBtn');if(b)b.textContent='↻ Recalculer le reste du planning';return true}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();window.addEventListener('load',install,{once:true});document.addEventListener('store-runner:data-restored',install);document.addEventListener('visibilitychange',()=>{if(!document.hidden)install()});
})();