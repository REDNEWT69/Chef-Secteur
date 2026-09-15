(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
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
    if(ready)removeRuntimeBoot();
    return ready;
  }finally{repairing=false}
}

/* Découché : le moteur historique faisait `seuil || 80`, donc un seuil explicite à 0 km
   redevenait 80 km. On centralise ici une lecture qui respecte vraiment 0 et on explique
   pourquoi une nuit n'est pas proposée au lieu d'un message opaque. */
function overnightThreshold(){
  try{const raw=state.profile&&state.profile.overnightMinSaving,n=Number(raw);return Number.isFinite(n)&&n>=0?n:80}catch(e){return 80}
}
function overnightAnalysis(plan){
  const profile=(window.state&&state.profile)||{},mode=profile.overnightMode||'auto',threshold=overnightThreshold();
  if(mode==='never')return{mode,threshold,candidate:null,reason:'disabled',best:null};
  const days=(state.settings&&Array.isArray(state.settings.days)&&state.settings.days.length?state.settings.days:DAYS.slice(0,5)).filter(d=>DAYS.includes(d));
  const source=plan||state.plan||{};let best=null;
  for(let i=0;i<days.length-1;i++){
    const a=source[days[i]]||[],b=source[days[i+1]]||[];if(!a.length||!b.length)continue;
    const last=a[a.length-1],first=b[0];let saving=null;
    try{const back=Number(hav(last,baseObj()))+Number(hav(baseObj(),first)),direct=Number(hav(last,first));saving=back-direct}catch(e){}
    if(!Number.isFinite(saving))continue;
    const row={night:'Nuit '+days[i]+' → '+days[i+1],last,first,saving};if(!best||row.saving>best.saving)best=row;
  }
  if(!best)return{mode,threshold,candidate:null,reason:'no-pair',best:null};
  if(mode==='auto'&&best.saving<threshold)return{mode,threshold,candidate:null,reason:'threshold',best};
  return{mode,threshold,candidate:best,reason:'candidate',best};
}
function mapsHotelUrl(s){
  try{if(typeof window.mapsHotelUrl==='function'&&window.mapsHotelUrl!==mapsHotelUrl)return window.mapsHotelUrl(s)}catch(e){}
  const q='hotel près de '+String((s&&s.adresse)||'')+' '+String((s&&s.ville)||'');return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q)
}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderOvernightV182(){
  const box=document.getElementById('overnightBox');if(!box||!window.state)return false;
  const a=overnightAnalysis();
  if(a.reason==='disabled'){box.innerHTML='<div class="notice">🌙 Découché désactivé dans <b>Secteur → Découché</b>. Choisis « Automatique si utile » ou « Obligatoire 1 fois/semaine » pour recevoir une proposition.</div>';return true}
  if(a.reason==='no-pair'){box.innerHTML='<div class="notice">🌙 Aucun découché possible sur cette semaine : il faut au moins deux jours de tournée à la suite avec des visites planifiées.</div>';return true}
  if(a.reason==='threshold'){
    box.innerHTML='<div class="notice">🌙 Aucun découché retenu : meilleur gain estimé <b>~'+Math.max(0,Math.round(a.best.saving))+' km</b>, seuil automatique réglé à <b>'+Math.round(a.threshold)+' km</b>. Le seuil se règle dans Secteur.</div>';return true
  }
  const o=a.candidate;if(!o)return false;
  box.innerHTML='<div class="overnight"><b>🌙 '+esc(o.night)+'</b><div class="meta">Fin près de '+esc((o.last.enseigne||'Magasin')+' '+(o.last.ville||''))+' · reprise vers '+esc(o.first.ville||'')+' · économie estimée ~'+Math.max(0,Math.round(o.saving))+' km.'+(a.mode==='mandatory'?' · Découché obligatoire activé.':'')+'</div><a target="_blank" rel="noopener" href="'+mapsHotelUrl(o.last)+'">Chercher les hôtels près de la fin de tournée ↗</a></div>';return true
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

function repairAll(){repairMobileRuntime();patchOvernight();bindPartialRange()}
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
window.storeRunnerRepairMobileRuntime=repairMobileRuntime;
})();