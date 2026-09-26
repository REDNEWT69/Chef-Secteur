(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';
/* Carrefour repasse à 1 par défaut en V189. Un magasin précis peut être passé à 2
   depuis sa fiche grâce à visitCreditOverride. */
const DEFAULT_RULES={darty:2,boulanger:2,but:2,conforama:2};
const OBSERVED_UI_IDS=['summary','proMonthBody','storeQuickSheet'];
let patchScheduled=false,uiObserver=null;

function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
function storage(){try{return window.__chefStorage||window.localStorage}catch(e){return null}}
function liveState(){try{return typeof window!=='undefined'?window.state:null}catch(e){return null}}
function rules(){
  const live=liveState(),configured=(live&&live.settings&&live.settings.visitCreditsByBrand)||{};
  const map=Object.assign({},DEFAULT_RULES,configured);
  /* L'ancienne valeur Carrefour x2 venait du code, pas d'un choix utilisateur. La V189
     force donc le défaut enseigne à 1 ; le double comptage se décide magasin par magasin. */
  map.carrefour=1;
  return map;
}
function ensureRules(){
  if(!window.state)return false;
  if(!state.settings)state.settings={};
  const current=state.settings.visitCreditsByBrand||{},merged=Object.assign({},DEFAULT_RULES,current,{carrefour:1});
  if(JSON.stringify(current)===JSON.stringify(merged))return false;
  state.settings.visitCreditsByBrand=merged;
  try{if(typeof window.save==='function')window.save()}catch(e){console.warn('Crédits de visite non persistés',e)}
  return true;
}
/* Un élément de state.plan n'est pas toujours une copie complète du magasin : selon le
   chemin qui l'a écrit (génération, archive relue, transfert JSON), il peut être réduit
   à { id }. Lire l'enseigne ou l'override sur cette copie donne alors 1 crédit pour un
   Darty. La source de vérité est state.stores : on y retrouve le magasin par son id avant
   tout calcul. Sans magasin canonique, on garde l'objet reçu — jamais d'exception, jamais
   de crédit inventé. */
function canonicalStore(entry){
  if(!entry||typeof entry!=='object')return entry||null;
  const id=entry.id;
  if(id==null||id==='')return entry;
  try{
    const live=liveState(),list=(live&&Array.isArray(live.stores))?live.stores:null;
    if(!list||!list.length)return entry;
    const found=list.find(s=>s&&String(s.id)===String(id));
    return found||entry;
  }catch(e){return entry}
}
function visitCredit(entry){
  const store=canonicalStore(entry);
  if(!store)return 0;
  const own=Number(store.visitCreditOverride);
  if(own===1||own===2)return own;
  const brand=norm(store.enseigne),map=rules();
  if(Object.prototype.hasOwnProperty.call(map,brand))return Math.max(1,Number(map[brand])||1);
  for(const key of Object.keys(map)){
    const k=norm(key);if(!k)continue;
    const safe=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp('(^| )'+safe+'( |$)').test(brand))return Math.max(1,Number(map[key])||1)
  }
  return 1;
}
function routeCredits(route){return (route||[]).reduce((n,s)=>n+visitCredit(s),0)}
function visitDuration(entry,stateArg){
  /* Même raison que pour le crédit : une copie partielle a perdu visitMinutes. */
  const store=canonicalStore(entry);
  const own=Number(store&&store.visitMinutes);
  if(Number.isFinite(own)&&own>=15&&own<=480)return Math.round(own);
  let fallback=60;
  try{const s=(stateArg&&stateArg.settings)||(window.state&&state.settings)||{};fallback=Number(s.visitMinutes)||60}catch(e){}
  return Math.max(15,Math.min(480,Math.round(fallback)))
}
function routeVisitMinutes(route,stateArg){return (route||[]).reduce((n,s)=>n+visitDuration(s,stateArg),0)}
/* V261.2 — la capacité planning n'a plus de règle cachée par enseigne.
   Un passage consomme exactement son vrai crédit métier ; le seul plafond est
   settings.maxVisitsPerDay, choisi par l'utilisateur dans Réglages. */
function planningVisitCredit(store){return visitCredit(store)}
function planStores(plan,days){return (days||DAYS).reduce((n,d)=>n+((plan&&Array.isArray(plan[d]))?plan[d].length:0),0)}
function planCredits(plan,days){return (days||DAYS).reduce((n,d)=>n+routeCredits((plan&&plan[d])||[]),0)}
/* Un magasin ne doit pas compter pour deux magasins distincts selon que l'archive en a
   gardé une copie complète ou seulement l'id. */
function storeKey(entry){const s=canonicalStore(entry),b=norm((s&&s.enseigne)||''),v=norm((s&&s.ville)||''),a=norm((s&&s.adresse)||'');return (b||v||a)?b+'|'+v+'|'+a:'id|'+String((s&&s.id)||'')}
function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function archiveStats(archive,start,end){
  let stores=0,visits=0;const unique=new Set(),from=String(start||'').slice(0,10),to=String(end||'').slice(0,10);
  for(const [key,snap] of Object.entries(archive||{})){
    const mon=parse((snap&&snap.weekMonday)||key);if(!mon||!snap||!snap.plan)continue;
    for(let i=0;i<DAYS.length;i++){
      const date=iso(addDays(mon,i));if((from&&date<from)||(to&&date>to))continue;
      for(const s of (snap.plan[DAYS[i]]||[])){stores++;visits+=visitCredit(s);unique.add(storeKey(s))}
    }
  }
  return{stores,visits,uniqueStores:unique.size};
}
function normalizeCandidate(candidate){
  if(!candidate||!candidate.plan)return candidate;
  candidate.storeCount=planStores(candidate.plan);
  candidate.visitCredits=planCredits(candidate.plan);
  if(candidate.range){
    const stats=candidate.archive?archiveStats(candidate.archive,candidate.range.start,candidate.range.end):{stores:candidate.storeCount,visits:candidate.visitCredits,uniqueStores:candidate.range.uniqueStores||0};
    candidate.range.totalStores=stats.stores;
    candidate.range.totalVisits=stats.visits;
    candidate.range.uniqueStores=stats.uniqueStores||candidate.range.uniqueStores||0;
    candidate.range.visitCreditRules=rules();
  }
  return candidate;
}
function reconcileStoredRangeStats(){
  const db=storage();if(!db)return null;
  let archive={},range=null;
  try{archive=JSON.parse(db.getItem(ARCHIVE_KEY)||'{}')||{};range=JSON.parse(db.getItem(RANGE_KEY)||'null')}catch(e){return null}
  if(!range||!range.start||!range.end)return null;
  const stats=archiveStats(archive,range.start,range.end);
  range.totalStores=stats.stores;
  range.totalVisits=stats.visits;
  range.uniqueStores=stats.uniqueStores;
  range.visitCreditRules=rules();
  range.updatedAt=new Date().toISOString();
  try{
    db.setItem(RANGE_KEY,JSON.stringify(range));
    if(typeof db.flush==='function'){
      const flushed=db.flush();
      if(flushed&&typeof flushed.catch==='function')flushed.catch(e=>console.warn('Statistiques de période non synchronisées',e));
    }
  }catch(e){console.warn('Statistiques de période non persistées',e);return null}
  return range;
}
function planStats(plan){return{stores:planStores(plan),visits:planCredits(plan)}}
function currentPlanStats(){try{return planStats(state.plan||{})}catch(e){return{stores:0,visits:0}}}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
/* V245 — Source unique des compteurs affichés.
   Avant, l'accueil, le planning, l'historique et ce module recomptaient chacun « les
   visites » et se réécrivaient après rendu. Toutes les vues lisent désormais ces valeurs
   nommées ; aucune règle de crédit n'est changée (visitCredit reste l'unique règle).
   - magasins planifiés = passages physiques de state.plan (unité de settings.target :
     le moteur compare flattenPlan(plan).length à target, jamais des crédits) ;
   - crédits de visite  = somme de visitCredit sur ces passages (Darty x2, etc.) ;
   - visite réalisée    = couple magasin + jour, visite 6P terminée ou « Visité » coché,
     dédupliqué : une visite 6P terminée écrit aussi l'historique legacy du même jour. */
function metricsState(stateArg){return stateArg||liveState()||{}}
function storeResolver(stateArg){
  const map=new Map();for(const s of (metricsState(stateArg).stores||[]))if(s&&s.id!=null)map.set(String(s.id),s);
  return entry=>{if(entry==null)return null;if(typeof entry!=='object')return map.get(String(entry))||{id:String(entry)};return (entry.id!=null&&map.get(String(entry.id)))||entry};
}
function mondayIso(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return iso(x)}
function refDate(now){const d=now instanceof Date?new Date(now):new Date(now==null?Date.now():now);return isNaN(d)?new Date():d}
function completedVisitDays(stateArg){
  const st=metricsState(stateArg),out=new Map();
  const add=(id,date)=>{const key=String(id==null?'':id),day=String(date||'').slice(0,10);if(!key||!/^\d{4}-\d{2}-\d{2}$/.test(day))return;if(!out.has(key))out.set(key,new Set());out.get(key).add(day)};
  for(const v of ((st.businessV2&&Array.isArray(st.businessV2.visits))?st.businessV2.visits:[]))if(v&&v.status==='completed')add(v.storeId,v.completedDate);
  for(const [id,h] of Object.entries(st.visits||{})){if(!h)continue;if(h.lastVisit)add(id,h.lastVisit);if(Array.isArray(h.history))for(const d of h.history)add(id,d)}
  return out;
}
function activityMetrics(stateArg,options){
  const st=metricsState(stateArg),opts=options||{},now=refDate(opts.now),today=iso(now),monday=mondayIso(now),sunday=iso(addDays(parse(monday),6)),month=today.slice(0,7);
  const resolve=storeResolver(st),credit=typeof opts.credit==='function'?opts.credit:(entry=>visitCredit(resolve(entry)));
  let plannedStores=0,plannedCredits=0;
  for(const d of DAYS)for(const entry of ((st.plan&&Array.isArray(st.plan[d]))?st.plan[d]:[])){plannedStores++;plannedCredits+=Number(credit(entry))||0}
  let total=0,todayCount=0,week=0,monthCount=0;const monthStores=new Set();
  for(const [id,days] of completedVisitDays(st))for(const day of days){total++;if(day===today)todayCount++;if(day>=monday&&day<=sunday)week++;if(day.slice(0,7)===month){monthCount++;monthStores.add(id)}}
  let openActions=0,overdueActions=0;
  for(const a of ((st.businessV2&&Array.isArray(st.businessV2.actions))?st.businessV2.actions:[])){if(!a||a.status==='done'||a.status==='cancelled')continue;openActions++;if(a.dueDate&&a.dueDate<today)overdueActions++}
  const target=Number(st.settings&&st.settings.target);
  return{
    today,weekStart:monday,weekEnd:sunday,month,
    activeStores:(st.stores||[]).filter(s=>s&&s.active!==false).length,
    plannedStoresWeek:plannedStores,
    plannedVisitCreditsWeek:plannedCredits,
    target:Number.isFinite(target)&&target>0?Math.round(target):null,
    targetUnit:'magasins',
    completedVisitsToday:todayCount,
    completedVisitsWeek:week,
    completedVisitsMonth:monthCount,
    completedVisitsTotal:total,
    completedUniqueStoresMonth:monthStores.size,
    openActions,overdueActions
  };
}
function plural(n,one,many){return n+' '+(n>1?many:one)}
const LABELS={
  plannedStores:n=>plural(n,'magasin planifié','magasins planifiés'),
  credits:n=>plural(n,'crédit de visite','crédits de visite'),
  completed:(n,when)=>plural(n,'visite réalisée','visites réalisées')+(when?' '+when:''),
  activeStores:n=>plural(n,'magasin actif','magasins actifs'),
  target:n=>'objectif '+n+' magasin'+(n>1?'s':'')
};
/* V259 — une seule mise en forme de « Cette semaine », partagée par la carte d'accueil
   et le bandeau historique du noyau (#smartBrief). V258 : dès qu'une visite est terminée,
   le réalisé passe devant le planifié ; crédits et objectif restent lisibles dessous.
   Ne lit que les métriques déjà calculées : aucun recomptage. */
function weekSummary(m){
  const bits=[];let value='';
  if(!m)return{value,bits};
  if(m.completedVisitsWeek){
    value=LABELS.completed(m.completedVisitsWeek);
    if(m.plannedStoresWeek)bits.push(LABELS.plannedStores(m.plannedStoresWeek),LABELS.credits(m.plannedVisitCreditsWeek));
  }else if(m.plannedStoresWeek){
    value=LABELS.plannedStores(m.plannedStoresWeek);
    bits.push(LABELS.credits(m.plannedVisitCreditsWeek));
  }
  if(m.target!=null){if(value)bits.push(LABELS.target(m.target));else value='Objectif '+plural(m.target,'magasin','magasins')}
  return{value,bits};
}
/* La tournée du jour se lit sur la vraie date : state.plan peut contenir une autre
   semaine quand l'utilisateur navigue dans le planning ; l'archive de la semaine courante
   prend alors le relais. Aucune donnée n'est écrite. */
function todayTour(stateArg,options){
  const st=metricsState(stateArg),opts=options||{},now=refDate(opts.now),today=iso(now),dayIndex=(now.getDay()+6)%7;
  if(dayIndex>5)return null;
  const day=DAYS[dayIndex],monday=mondayIso(now),planMonday=mondayIso(parse(String((st.settings&&st.settings.weekDate)||'').slice(0,10))||now);
  let rows=null;
  if(planMonday===monday&&st.plan&&Array.isArray(st.plan[day]))rows=st.plan[day];
  else{let archive=opts.archive;try{if(typeof archive==='function')archive=archive()}catch(e){archive=null}const snap=archive&&archive[monday];if(snap&&snap.plan&&Array.isArray(snap.plan[day]))rows=snap.plan[day]}
  if(!rows||!rows.length)return null;
  const resolve=storeResolver(st),credit=typeof opts.credit==='function'?opts.credit:(entry=>visitCredit(resolve(entry))),done=completedVisitDays(st);
  const route=rows.map(resolve).filter(s=>s&&s.id!=null);if(!route.length)return null;
  const visited=route.map(s=>!!(done.get(String(s.id))&&done.get(String(s.id)).has(today)));
  const index=visited.indexOf(false),remaining=visited.filter(v=>!v).length;
  let credits=0,remainingCredits=0;route.forEach((s,i)=>{const c=Number(credit(s))||0;credits+=c;if(!visited[i])remainingCredits+=c});
  let next=null;if(index>=0)for(let i=index+1;i<route.length;i++)if(!visited[i]){next=route[i];break}
  return{day,date:today,route,visited,total:route.length,done:route.length-remaining,remaining,credits,remainingCredits,index,current:index>=0?route[index]:null,previous:index>0?route[index-1]:null,next,finished:index<0};
}
function summaryHtml(stateArg,options){
  const st=metricsState(stateArg),m=activityMetrics(st,options),opts=options||{};let km=0;
  try{const cost=opts.routeCost||(typeof routeCost==='function'?routeCost:null);if(cost)for(const d of DAYS)km+=Number(cost((st.plan&&st.plan[d])||[]))||0}catch(e){}
  return '<span>'+LABELS.plannedStores(m.plannedStoresWeek)+'</span><span>'+LABELS.credits(m.plannedVisitCreditsWeek)+'</span><span>~'+Math.round(km)+' km géographiques</span><span>'+LABELS.completed(m.completedVisitsToday,'aujourd’hui')+'</span>';
}
function patchSummary(){
  const el=document.getElementById('summary');if(!el||!window.state)return;
  const html=summaryHtml(state);
  if(el.innerHTML!==html)el.innerHTML=html;
}
function visibleMonth(){
  const head=document.querySelector('#proMonthBody .proMonthHead b');if(!head)return null;const text=norm(head.textContent),months=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];let month=-1;for(let i=0;i<months.length;i++)if(text.includes(months[i])){month=i;break}const m=text.match(/\b(20\d{2})\b/);return month>=0&&m?{year:Number(m[1]),month}:null;
}
function monthArchiveStats(year,month){
  let stores=0,visits=0;const unique=new Set(),db=storage();if(!db)return{stores,visits,uniqueStores:0};let archive={};try{archive=JSON.parse(db.getItem(ARCHIVE_KEY)||'{}')||{}}catch(e){}
  for(const [key,snap] of Object.entries(archive)){const mon=parse((snap&&snap.weekMonday)||key);if(!mon||!snap||!snap.plan)continue;for(let i=0;i<DAYS.length;i++){const date=addDays(mon,i);if(date.getFullYear()!==year||date.getMonth()!==month)continue;for(const s of (snap.plan[DAYS[i]]||[])){stores++;visits+=visitCredit(s);unique.add(storeKey(s))}}}
  return{stores,visits,uniqueStores:unique.size};
}
function patchProMonth(){
  const month=visibleMonth();if(!month)return;const stats=monthArchiveStats(month.year,month.month),head=document.querySelector('#proMonthBody .proMonthHead span');setText(head,LABELS.credits(stats.visits)+' planifiés · '+stats.uniqueStores+' magasins distincts');const first=document.querySelector('#proMonthMetrics > div:first-child');if(first){setText(first.querySelector('b'),String(stats.visits));setText(first.querySelector('span'),stats.visits>1?'crédits de visite planifiés':'crédit de visite planifié')}document.querySelectorAll('#proMonthBody .proMore').forEach(e=>{if(/visites?/i.test(e.textContent||''))e.textContent=e.textContent.replace(/visites?/i,'magasins')});
}
function patchQuickStore(){
  const sheet=document.getElementById('storeQuickSheet'),start=document.getElementById('srQuickStart');if(!sheet||!start||!start.dataset)return;const id=start.dataset.srStart;if(!id)return;let store=null;try{store=(state.stores||[]).find(s=>String(s.id)===String(id))}catch(e){}if(!store)return;const address=document.getElementById('sqAddress');if(!address)return;let badge=document.getElementById('sqVisitCredit');if(!badge){badge=document.createElement('div');badge.id='sqVisitCredit';badge.className='tiny';badge.style.marginTop='6px';address.insertAdjacentElement('afterend',badge)}const c=visitCredit(store),families=(Array.isArray(store.products)?store.products:[]).filter(x=>x&&x!=='À confirmer');const duration=visitDuration(store);setText(badge,'Ce passage vaut '+LABELS.credits(c)+' · '+duration+' min prévues'+(families.length?' · Familles : '+families.join(' + '):''));
}
function patchVisibleUi(){if(!window.state)return;patchSummary();patchProMonth();patchQuickStore()}
function schedulePatch(){if(patchScheduled)return;patchScheduled=true;const run=()=>{patchScheduled=false;patchVisibleUi()};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0)}
function observeUi(){
  if(uiObserver||typeof MutationObserver==='undefined')return;
  const targets=OBSERVED_UI_IDS.map(id=>document.getElementById(id)).filter(Boolean);if(!targets.length)return;
  uiObserver=new MutationObserver(schedulePatch);
  for(const target of targets){
    if(target.id==='storeQuickSheet')uiObserver.observe(target,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-hidden','data-sr-start']});
    else uiObserver.observe(target,{subtree:true,childList:true,characterData:true});
  }
}
function formatAssistantSummary(){
  if(!window.state)return'Aucune semaine générée.';const days=(state.settings&&state.settings.days)||DAYS,lines=[];let stores=0,visits=0,km=0;
  for(const day of days){const route=(state.plan&&state.plan[day])||[],s=route.length,v=routeCredits(route);stores+=s;visits+=v;let dkm=0;try{if(typeof routeCost==='function')dkm=Number(routeCost(route))||0}catch(e){}km+=dkm;lines.push(day+' : '+s+' magasin'+(s>1?'s':'')+' · '+LABELS.credits(v)+' · ~'+Math.round(dkm)+' km')}
  return stores?lines.join('\n')+'\nTotal : '+stores+' magasins · '+LABELS.credits(visits)+' · ~'+Math.round(km)+' km.':'Aucune semaine générée.';
}
function patchRangeStatus(candidate){
  const el=document.getElementById('rangePlanStatus');if(!el||!candidate)return;const stores=Number(candidate.range&&candidate.range.totalStores)||Number(candidate.storeCount)||0,visits=Number(candidate.range&&candidate.range.totalVisits)||Number(candidate.visitCredits)||0;if(candidate.range)setText(el,'Période appliquée : '+candidate.range.weeks+' semaines · '+stores+' magasins · '+LABELS.credits(visits)+' · '+Number(candidate.range.uniqueStores||0)+' magasins distincts.');else setText(el,'Semaine générée : '+stores+' magasins · '+LABELS.credits(visits)+'.');
}
function hookReliability(){
  const R=window.ChefReliability;if(!R||typeof R.propose!=='function'||R.propose.__visitCreditsWrapped)return false;const original=R.propose;
  const wrapped=async function(candidate){normalizeCandidate(candidate);const ok=await original.apply(this,arguments);if(ok){schedulePatch();setTimeout(()=>patchRangeStatus(candidate),0)}return ok};wrapped.__visitCreditsWrapped=true;wrapped.__original=original;R.propose=wrapped;return true;
}
function onPlanningUpdated(e){
  if(e&&e.detail&&e.detail.reason==='day-store-recenter')reconcileStoredRangeStats();
  schedulePatch();
}
function boot(){ensureRules();window.assistantSummary=formatAssistantSummary;hookReliability();observeUi();schedulePatch();document.addEventListener('store-runner:planning-updated',onPlanningUpdated);document.addEventListener('store-runner:data-restored',()=>{ensureRules();schedulePatch()});document.addEventListener('chef-range-generated',schedulePatch);document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('.proMonthPrev,.proMonthNext'))schedulePatch()});document.addEventListener('touchend',e=>{if(e.target&&e.target.closest&&e.target.closest('#proMonthBody'))schedulePatch()},{passive:true})}

const ActivityMetrics={compute:activityMetrics,todayTour,completedVisitDays,summaryHtml,weekSummary,labels:LABELS};
if(typeof module!=='undefined'&&module.exports)module.exports={StoreRunnerActivityMetrics:ActivityMetrics,credit:visitCredit,planStores,planCredits};
if(typeof window==='undefined'||typeof document==='undefined')return;
window.StoreRunnerActivityMetrics=ActivityMetrics;
window.storeVisitCredit=planningVisitCredit;
window.storeVisitCreditsForRoute=routeCredits;
window.storeVisitDuration=visitDuration;
window.storeVisitMinutesForRoute=routeVisitMinutes;
window.storeVisitCreditsForPlan=planCredits;
window.storeVisitStoresForPlan=planStores;
window.StoreVisitCounting={canonicalStore,credit:visitCredit,planningCredit:planningVisitCredit,duration:visitDuration,routeVisitMinutes,routeCredits,planCredits,planStores,archiveStats,normalizeCandidate,reconcileStoredRangeStats,monthArchiveStats,rules,refresh:schedulePatch};
document.addEventListener('store-runner:reliability-propose-ready',hookReliability);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();