(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';
const DEFAULT_RULES={darty:2,boulanger:2,carrefour:2};
let patchScheduled=false,uiObserver=null;

function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
function storage(){try{return window.__chefStorage||window.localStorage}catch(e){return null}}
function rules(){
  const configured=(window.state&&state.settings&&state.settings.visitCreditsByBrand)||{};
  return Object.assign({},DEFAULT_RULES,configured);
}
function ensureRules(){
  if(!window.state)return false;
  if(!state.settings)state.settings={};
  const current=state.settings.visitCreditsByBrand||{},merged=Object.assign({},DEFAULT_RULES,current);
  if(JSON.stringify(current)===JSON.stringify(merged))return false;
  state.settings.visitCreditsByBrand=merged;
  try{if(typeof window.save==='function')window.save()}catch(e){console.warn('Crédits de visite non persistés',e)}
  return true;
}
function visitCredit(store){
  if(!store)return 0;
  const brand=norm(store.enseigne),map=rules();
  if(Object.prototype.hasOwnProperty.call(map,brand))return Math.max(1,Number(map[brand])||1);
  for(const key of Object.keys(map)){const k=norm(key);if(k&&new RegExp('(^| )'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'( |$)').test(brand))return Math.max(1,Number(map[key])||1)}
  return 1;
}
function routeCredits(route){return (route||[]).reduce((n,s)=>n+visitCredit(s),0)}
function planStores(plan,days){return (days||DAYS).reduce((n,d)=>n+((plan&&Array.isArray(plan[d]))?plan[d].length:0),0)}
function planCredits(plan,days){return (days||DAYS).reduce((n,d)=>n+routeCredits((plan&&plan[d])||[]),0)}
function storeKey(s){const b=norm((s&&s.enseigne)||''),v=norm((s&&s.ville)||''),a=norm((s&&s.adresse)||'');return (b||v||a)?b+'|'+v+'|'+a:'id|'+String((s&&s.id)||'')}
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
function patchSummary(){
  const el=document.getElementById('summary');if(!el||!window.state)return;
  const stats=currentPlanStats();let km=0,visitedStores=0,visitedVisits=0;
  try{for(const d of DAYS){const r=(state.plan&&state.plan[d])||[];if(typeof routeCost==='function')km+=Number(routeCost(r))||0;for(const s of r){if(typeof storeVisit==='function'&&typeof todayISO==='function'&&storeVisit(s).lastVisit===todayISO()){visitedStores++;visitedVisits+=visitCredit(s)}}}}catch(e){}
  const html='<span>'+stats.stores+' magasins planifiés</span><span>'+stats.visits+' visites comptabilisées</span><span>~'+Math.round(km)+' km géographiques</span><span>'+visitedVisits+' visites cochées aujourd’hui'+(visitedStores&&visitedVisits!==visitedStores?' · '+visitedStores+' magasins':'')+'</span>';
  if(el.innerHTML!==html)el.innerHTML=html;
}
function patchLegacyBrief(){
  const value=document.querySelector('#smartBrief .planMetric:first-child .pmValue'),sub=document.querySelector('#smartBrief .planMetric:first-child .pmSub');if(!value)return;
  const stats=currentPlanStats();setText(value,stats.visits+' visites');setText(sub,stats.stores+' magasins planifiés · objectif '+Number((state.settings&&state.settings.target)||20)+' magasins');
}
function patchPremiumHome(){
  const card=document.querySelector('#premiumHomeV2 .phGrid .phCard:first-child');if(!card)return;
  const value=card.querySelector('.phValue'),sub=card.querySelector('.phSub'),stats=currentPlanStats();setText(value,stats.visits+' visites');setText(sub,stats.stores+' magasins planifiés · objectif '+Number((state.settings&&state.settings.target)||20)+' magasins');
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
  const month=visibleMonth();if(!month)return;const stats=monthArchiveStats(month.year,month.month),head=document.querySelector('#proMonthBody .proMonthHead span');setText(head,stats.visits+' visites comptabilisées · '+stats.uniqueStores+' magasins distincts');const first=document.querySelector('#proMonthMetrics > div:first-child');if(first){setText(first.querySelector('b'),String(stats.visits));setText(first.querySelector('span'),'visites comptabilisées')}document.querySelectorAll('#proMonthBody .proMore').forEach(e=>{if(/visites?/i.test(e.textContent||''))e.textContent=e.textContent.replace(/visites?/i,'magasins')});
}
function patchQuickStore(){
  const sheet=document.getElementById('storeQuickSheet'),start=document.getElementById('srQuickStart');if(!sheet||!start||!start.dataset)return;const id=start.dataset.srStart;if(!id)return;let store=null;try{store=(state.stores||[]).find(s=>String(s.id)===String(id))}catch(e){}if(!store)return;const address=document.getElementById('sqAddress');if(!address)return;let badge=document.getElementById('sqVisitCredit');if(!badge){badge=document.createElement('div');badge.id='sqVisitCredit';badge.className='tiny';badge.style.marginTop='6px';address.insertAdjacentElement('afterend',badge)}const c=visitCredit(store);setText(badge,c>1?'Ce passage compte pour '+c+' visites (Blanc + Brun).':'Ce passage compte pour 1 visite.');
}
function patchVisibleUi(){if(!window.state)return;patchSummary();patchLegacyBrief();patchPremiumHome();patchProMonth();patchQuickStore()}
function schedulePatch(){if(patchScheduled)return;patchScheduled=true;const run=()=>{patchScheduled=false;patchVisibleUi()};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0)}
function observeUi(){if(uiObserver||typeof MutationObserver==='undefined'||!document.body)return;uiObserver=new MutationObserver(schedulePatch);uiObserver.observe(document.body,{subtree:true,childList:true,characterData:true})}
function formatAssistantSummary(){
  if(!window.state)return'Aucune semaine générée.';const days=(state.settings&&state.settings.days)||DAYS,lines=[];let stores=0,visits=0,km=0;
  for(const day of days){const route=(state.plan&&state.plan[day])||[],s=route.length,v=routeCredits(route);stores+=s;visits+=v;let dkm=0;try{if(typeof routeCost==='function')dkm=Number(routeCost(route))||0}catch(e){}km+=dkm;lines.push(day+' : '+s+' magasin'+(s>1?'s':'')+' · '+v+' visite'+(v>1?'s':'')+' comptabilisée'+(v>1?'s':'')+' · ~'+Math.round(dkm)+' km')}
  return stores?lines.join('\n')+'\nTotal : '+stores+' magasins · '+visits+' visites comptabilisées · ~'+Math.round(km)+' km.':'Aucune semaine générée.';
}
function patchRangeStatus(candidate){
  const el=document.getElementById('rangePlanStatus');if(!el||!candidate)return;const stores=Number(candidate.range&&candidate.range.totalStores)||Number(candidate.storeCount)||0,visits=Number(candidate.range&&candidate.range.totalVisits)||Number(candidate.visitCredits)||0;if(candidate.range)setText(el,'Période appliquée : '+candidate.range.weeks+' semaines · '+stores+' magasins · '+visits+' visites comptabilisées · '+Number(candidate.range.uniqueStores||0)+' magasins distincts.');else setText(el,'Semaine générée : '+stores+' magasins · '+visits+' visites comptabilisées.');
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

window.storeVisitCredit=visitCredit;
window.storeVisitCreditsForRoute=routeCredits;
window.storeVisitCreditsForPlan=planCredits;
window.storeVisitStoresForPlan=planStores;
window.StoreVisitCounting={credit:visitCredit,routeCredits,planCredits,planStores,archiveStats,normalizeCandidate,reconcileStoredRangeStats,monthArchiveStats,rules};
document.addEventListener('store-runner:reliability-propose-ready',hookReliability);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
