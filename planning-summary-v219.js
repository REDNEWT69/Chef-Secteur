(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&root.document){root.StoreRunnerPlanningSummaryV219=api;api.install(root)}
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const observers=new WeakMap();
let refreshQueued=false;
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0}
function parseDate(v){const d=new Date(String(v||'')+(String(v||'').length===10?'T12:00:00':''));return isNaN(d)?null:d}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);x.setHours(12,0,0,0);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function storage(win){try{return win.__chefStorage||win.localStorage||null}catch(e){return null}}
function archive(win){const db=storage(win);if(!db)return{};try{return JSON.parse(db.getItem(ARCHIVE_KEY)||'{}')||{}}catch(e){return{}}}
function settings(state){return state&&state.settings||{}}
function workDays(state){const d=settings(state).days;return Array.isArray(d)&&d.length?d.slice():DAYS.slice(0,5)}
function safeRouteKm(win,route){
  if(!Array.isArray(route)||!route.length)return 0;
  let km=0;
  try{if(typeof win.havBase==='function')km+=finite(win.havBase(route[0]))}catch(e){}
  if(typeof win.hav==='function'){
    for(let i=1;i<route.length;i++){try{km+=finite(win.hav(route[i-1],route[i]))}catch(e){}}
    try{if(typeof win.baseObj==='function')km+=finite(win.hav(route[route.length-1],win.baseObj()))}catch(e){}
  }
  return finite(km)
}
function visitMinutes(win,state,store){
  try{if(typeof win.storeVisitDuration==='function'){const n=finite(win.storeVisitDuration(store,state));if(n>0)return n}}catch(e){}
  return Math.max(0,finite(settings(state).visitMinutes||60))
}
function routeMinutes(win,state,route){
  if(!Array.isArray(route)||!route.length)return 0;
  const drive=safeRouteKm(win,route)*1.22/55*60;
  const visits=route.reduce((n,s)=>n+visitMinutes(win,state,s),0);
  return finite(drive+visits)
}
function lastVisitDate(state,store){
  const candidates=[];
  if(store&&store.lastVisit)candidates.push(String(store.lastVisit));
  const legacy=(state&&state.visits||{})[store&&store.id]||(state&&state.visits||{})[String(store&&store.id)]||{};
  if(legacy.lastVisit)candidates.push(String(legacy.lastVisit));
  if(Array.isArray(legacy.history))legacy.history.forEach(d=>d&&candidates.push(String(d)));
  const rows=((state&&state.businessV2||{}).visits||[]).filter(v=>String(v.storeId)===String(store&&store.id)&&v.status==='completed'&&v.completedDate);
  rows.forEach(v=>candidates.push(String(v.completedDate)));
  candidates.sort();return candidates[candidates.length-1]||''
}
function intervalDays(store){const n=finite(store&&store.intervalDays);if(n>0)return n;const f=String(store&&store.freq||'');return /hebdo/i.test(f)?7:/bi-mens|quinz/i.test(f)?14:30}
function plannedIds(state){const out=new Set();for(const d of DAYS)for(const s of ((state&&state.plan||{})[d]||[]))out.add(String(s&&s.id));return out}
function priorityOutsideWeek(state,now){
  now=now instanceof Date?now:new Date(now||Date.now());
  const planned=plannedIds(state);let count=0;
  for(const s of (state&&state.stores||[])){
    if(!s||s.active===false||planned.has(String(s.id)))continue;
    const raw=lastVisitDate(state,s),last=parseDate(raw);
    if(!last){count++;continue}
    const age=Math.floor((now-last)/86400000);
    if(age-intervalDays(s)>14)count++
  }
  return count
}
function weekBounds(state){const raw=settings(state).weekDate,d=parseDate(raw)||new Date();const start=monday(d);return{start,end:addDays(start,6)}}
function candidateDates(win,state,start,end){
  const set=new Set(),a=iso(start),b=iso(end);
  function add(raw){const k=String(raw||'').slice(0,10);if(k&&k>=a&&k<=b)set.add(k)}
  try{for(const r of (state&&state.awayRanges||[]))add(r&&(r.start||r.date))}catch(e){}
  try{const hrs=state&&state.hotelReservations||{};for(const k of Object.keys(hrs))add(k)}catch(e){}
  try{if(typeof win.overnightCandidate==='function'){const c=win.overnightCandidate();if(c)add(c.fromDate||c.date)}}catch(e){}
  return set
}
function weekStats(win,state,now){
  state=state||{};const days=workDays(state);let visits=0,km=0,minutes=0;
  for(const day of days){const route=(state.plan&&state.plan[day])||[];visits+=route.length;km+=safeRouteKm(win,route);minutes+=routeMinutes(win,state,route)}
  const wb=weekBounds(state);
  return{visits,km:finite(km),minutes:finite(minutes),hotels:candidateDates(win,state,wb.start,wb.end).size,priorities:priorityOutsideWeek(state,now)}
}
function currentPlanWeek(state){const raw=String(settings(state).weekDate||'').slice(0,10);if(!raw)return null;return{weekMonday:iso(monday(parseDate(raw)||new Date())),plan:state.plan||{}}}
function monthStats(win,state,now){
  state=state||{};now=now instanceof Date?now:new Date(now||Date.now());const year=now.getFullYear(),month=now.getMonth();
  const weeks=archive(win),current=currentPlanWeek(state);if(current)weeks[current.weekMonday]=current;
  let visits=0,km=0,minutes=0;const days=workDays(state);
  for(const [key,snap] of Object.entries(weeks||{})){
    if(!snap||!snap.plan)continue;const mon=monday(parseDate(snap.weekMonday||key)||now);
    for(let i=0;i<DAYS.length;i++){
      const date=addDays(mon,i),day=DAYS[i];if(date.getFullYear()!==year||date.getMonth()!==month||!days.includes(day))continue;
      const route=snap.plan[day]||[];visits+=route.length;km+=safeRouteKm(win,route);minutes+=routeMinutes(win,state,route)
    }
  }
  const first=new Date(year,month,1,12),last=new Date(year,month+1,0,12);
  return{visits,km:finite(km),minutes:finite(minutes),hotels:candidateDates(win,state,first,last).size,label:first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}
}
function hoursLabel(minutes){minutes=Math.max(0,Math.round(finite(minutes)/5)*5);const h=Math.floor(minutes/60),m=minutes%60;return h+' h'+(m?' '+String(m).padStart(2,'0'):'')}
function metric(value,label){return '<div class="proWeekMetricV219"><b>'+value+'</b><span>'+label+'</span></div>'}
function installQuality(card){
  if(!card)return;card.classList.add('proQualityCardV219');card.setAttribute('role','button');card.setAttribute('tabindex','0');
  let detail=card.querySelector('#proQualityDetailV219');if(!detail){detail=card.ownerDocument.createElement('div');detail.id='proQualityDetailV219';detail.hidden=true;detail.textContent='Le score synthétise la charge, les horaires et la couverture. Les alertes au-dessus donnent le détail à traiter.';card.appendChild(detail)}
  if(card.dataset.v219Bound==='1')return;card.dataset.v219Bound='1';
  const toggle=()=>{const open=detail.hidden;detail.hidden=!open;card.classList.toggle('is-open',open);card.setAttribute('aria-expanded',open?'true':'false')};
  card.setAttribute('aria-expanded','false');card.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('button,a,input,select,textarea'))return;toggle()});
  card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}})
}
function renderPlanning(win){
  const doc=win.document,top=doc.getElementById('planningProTop');if(!top)return false;const row=top.querySelector('.proTop');if(!row||row.children.length<2)return false;
  const qCard=row.children[0],weekCard=row.children[1];installQuality(qCard);
  const title=weekCard.querySelector('.proTitle b'),sub=weekCard.querySelector('.proTitle span');if(title&&title.textContent!=='Cette semaine')title.textContent='Cette semaine';if(sub&&sub.textContent!=='semaine affichée')sub.textContent='semaine affichée';
  let box=weekCard.querySelector('#proMonthMetrics, #proWeekMetricsV219');if(!box)return false;if(box.id==='proMonthMetrics')box.id='proWeekMetricsV219';box.classList.remove('proMetrics');box.classList.add('proWeekMetricsV219');
  const st=weekStats(win,win.state||{},new Date()),html=metric(st.visits,'visites')+metric(Math.round(st.km),'km estimés')+metric(hoursLabel(st.minutes),'terrain + route')+metric(st.hotels,'découchés')+metric(st.priorities,'priorités hors planning');if(box.innerHTML!==html)box.innerHTML=html;
  return true
}
function renderPilotage(win){
  const doc=win.document,panel=doc.getElementById('pilotagePanel'),kpis=panel&&panel.querySelector('.spKpis');if(!panel||!kpis)return false;
  let card=panel.querySelector('.spMonthSummaryV219');if(!card){card=doc.createElement('article');card.className='spCard spMonthSummaryV219';kpis.insertAdjacentElement('afterend',card)}
  const st=monthStats(win,win.state||{},new Date()),html='<div class="spMonthSummaryHeadV219"><h3>Résumé du mois</h3><span>activité planifiée · '+st.label+'</span></div><div class="spMonthMetricsV219">'+metric(st.visits,'visites planifiées')+metric(Math.round(st.km),'km estimés')+metric(hoursLabel(st.minutes),'terrain + route')+metric(st.hotels,'découchés')+'</div>';if(card.innerHTML!==html)card.innerHTML=html;
  return true
}
function repairPlanningSettingsUi(win){
  const doc=win&&win.document;if(!doc)return false;
  const settings=doc.getElementById('planningSettings'),repair=doc.getElementById('planningRepairSettings');
  if(!settings||!repair)return false;
  const inner=settings.querySelector&&settings.querySelector('.settingsInner');
  const target=inner||settings;
  if(repair.parentNode!==target)target.appendChild(repair);
  return repair.parentNode===target
}
function ensureCss(doc){if(doc.getElementById('planningSummaryV219Css'))return;const s=doc.createElement('style');s.id='planningSummaryV219Css';s.textContent=`
.proQualityCardV219{padding:10px 14px!important;cursor:pointer;touch-action:manipulation}.proQualityCardV219 .proTitle{margin:0}.proQualityCardV219 #proQuality{margin-top:3px!important;gap:7px!important;align-items:baseline!important}.proQualityCardV219 #proQuality .proScore{font-size:21px!important;line-height:1.1}.proQualityCardV219 #proQuality .proScore small{font-size:9px!important}.proQualityCardV219 #proQuality>div:last-child{display:flex;align-items:baseline;gap:6px;min-width:0}.proQualityCardV219 #proQuality>div:last-child b{font-size:13px}.proQualityCardV219 #proQuality>div:last-child span{display:none}.proQualityCardV219.is-open #proQuality>div:last-child span{display:block;font-size:9px;color:#667085}.proQualityCardV219:focus-visible{outline:2px solid #4f7cff;outline-offset:2px}#proQualityDetailV219{font-size:10px;line-height:1.35;color:#667085;margin-top:7px;padding-top:7px;border-top:1px solid #eef0f3}#proQualityDetailV219[hidden]{display:none!important}.proWeekMetricsV219,.spMonthMetricsV219{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:8px}.proWeekMetricV219{background:#f7f9fc;border-radius:11px;padding:8px;min-width:0}.proWeekMetricV219 b{display:block;font-size:16px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.proWeekMetricV219 span{display:block;font-size:9px;line-height:1.2;color:#667085;margin-top:3px}.spMonthSummaryV219{margin-top:12px}.spMonthSummaryHeadV219{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.spMonthSummaryHeadV219 h3{margin:0!important}.spMonthSummaryHeadV219 span{font-size:10px;color:#747b86}.spMonthMetricsV219{grid-template-columns:repeat(4,minmax(0,1fr))}.spMonthMetricsV219 .proWeekMetricV219{background:#f7f9fc}
@media(max-width:700px){#planningProTop .proTop{gap:8px!important}.proQualityCardV219{margin-bottom:0!important}.proWeekMetricsV219{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.proWeekMetricsV219 .proWeekMetricV219:last-child{grid-column:1/-1}.proWeekMetricV219{padding:7px}.proWeekMetricV219 b{font-size:15px}.spMonthSummaryHeadV219{align-items:flex-start;flex-direction:column;gap:2px}.spMonthMetricsV219{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}}
`;doc.head.appendChild(s)}
function observe(node,win){if(!node||observers.has(node)||typeof win.MutationObserver==='undefined')return;const ob=new win.MutationObserver(()=>schedule(win));ob.observe(node,{childList:true,subtree:true});observers.set(node,ob)}
function refresh(win){ensureCss(win.document);repairPlanningSettingsUi(win);renderPlanning(win);renderPilotage(win);observe(win.document.getElementById('planningProTop'),win);observe(win.document.getElementById('pilotagePanel'),win)}
function schedule(win){if(refreshQueued)return;refreshQueued=true;const run=()=>{refreshQueued=false;refresh(win)};if(typeof win.requestAnimationFrame==='function')win.requestAnimationFrame(run);else setTimeout(run,0)}
function install(win){
  const boot=()=>{refresh(win);['store-runner:planning-updated','store-runner:data-restored','store-runner:home-rendered','store-runner:planning-user-opened'].forEach(name=>win.document.addEventListener(name,()=>schedule(win)));setTimeout(()=>refresh(win),120)};
  if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()
}
return{finite,safeRouteKm,routeMinutes,priorityOutsideWeek,weekStats,monthStats,hoursLabel,renderPlanning,renderPilotage,repairPlanningSettingsUi,install};
});
