/* Store Runner V1 — horaires d'ouverture explicites et calcul terrain.
   Aucune heure par défaut n'est inventée : champ absent = horaire inconnu,
   tableau vide = fermé, intervalles = horaire connu. */
(function(root){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
let observer=null,scheduled=false,decorating=false;

function pad(n){return String(n).padStart(2,'0')}
function clock(m){if(m==null||!Number.isFinite(Number(m)))return '';m=Math.round(Number(m));return pad(Math.floor((m%1440+1440)%1440/60))+':'+pad((m%60+60)%60)}
function minute(value){const m=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;const h=+m[1],n=+m[2];return h>=0&&h<=23&&n>=0&&n<=59?h*60+n:null}
function norm(v){return String(v==null?'':v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function copy(x){return JSON.parse(JSON.stringify(x))}
function parseDayHours(text){
  const raw=String(text==null?'':text).trim();
  if(!raw)return undefined;
  if(['ferme','fermee','closed'].includes(norm(raw)))return [];
  const parts=raw.split(/[;,]/).map(x=>x.trim()).filter(Boolean),out=[];
  if(!parts.length)return undefined;
  for(const part of parts){
    const m=part.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);if(!m)throw new Error('Format attendu : 09:00-12:30,14:00-19:00 ou fermé.');
    const a=minute(m[1]),b=minute(m[2]);if(a==null||b==null||b<=a)throw new Error('Créneau invalide : '+part+'.');
    out.push({open:clock(a),close:clock(b)});
  }
  out.sort((a,b)=>minute(a.open)-minute(b.open));
  for(let i=1;i<out.length;i++)if(minute(out[i].open)<minute(out[i-1].close))throw new Error('Les créneaux d’ouverture se chevauchent.');
  return out;
}
function normalizeIntervals(value){
  if(value===undefined||value===null)return undefined;
  if(typeof value==='string'){try{return parseDayHours(value)}catch(e){return undefined}}
  if(!Array.isArray(value))return undefined;
  const out=[];
  for(const row of value){
    if(!row||typeof row!=='object')return undefined;const a=minute(row.open),b=minute(row.close);if(a==null||b==null||b<=a)return undefined;out.push({open:clock(a),close:clock(b)});
  }
  out.sort((a,b)=>minute(a.open)-minute(b.open));for(let i=1;i<out.length;i++)if(minute(out[i].open)<minute(out[i-1].close))return undefined;return out;
}
function serializeDayHours(value){const rows=normalizeIntervals(value);if(rows===undefined)return '';if(!rows.length)return 'fermé';return rows.map(x=>x.open+'-'+x.close).join(',')}
function intervalsFor(store,day){
  if(!store)return undefined;
  if(store.openingHours&&typeof store.openingHours==='object')return normalizeIntervals(store.openingHours[day]);
  if(store.openingHoursSource==='manual')return undefined;
  const open=minute(store.openTime),close=minute(store.closeTime);
  return open!=null&&close!=null&&close>open?[{open:clock(open),close:clock(close)}]:undefined;
}
function openingLabel(store,day){const rows=intervalsFor(store,day);return rows===undefined?'Horaire à vérifier':(!rows.length?'Fermé':rows.map(x=>x.open+'–'+x.close).join(' · '))}
function fitOpening(store,day,arrival,duration){
  const rows=intervalsFor(store,day),a=Number(arrival),dur=Math.max(1,Number(duration)||1);
  if(rows===undefined)return{known:false,closed:false,arrival:a,wait:0,interval:null};
  if(!rows.length)return{known:true,closed:true,arrival:null,wait:null,interval:null};
  for(const row of rows){const open=minute(row.open),close=minute(row.close),candidate=Math.max(a,open);if(candidate+dur<=close)return{known:true,closed:false,arrival:candidate,wait:Math.max(0,candidate-a),interval:{open,close}}}
  return{known:true,closed:true,arrival:null,wait:null,interval:null};
}
function overlapsBlock(start,duration,block){return !!(block&&!block.allDay&&Number.isFinite(Number(block.startMin))&&Number.isFinite(Number(block.endMin))&&start<Number(block.endMin)&&start+duration>Number(block.startMin))}
function fitWithBlocks(store,day,arrival,duration,blocks){
  let current=Number(arrival),first=current,opening=fitOpening(store,day,current,duration),loops=0;
  if(opening.closed)return{...opening,original:first};if(opening.arrival!=null)current=opening.arrival;
  while(loops++<=(blocks||[]).length){
    let shifted=false;
    for(const block of (blocks||[])){if(overlapsBlock(current,duration,block)){current=Number(block.endMin);shifted=true;break}}
    if(!shifted)break;
    opening=fitOpening(store,day,current,duration);if(opening.closed)return{...opening,original:first};current=opening.arrival;
  }
  const finalOpen=fitOpening(store,day,current,duration);if(finalOpen.closed)return{...finalOpen,original:first};
  return{...finalOpen,arrival:current,wait:Math.max(0,current-first),original:first};
}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseISO(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return isNaN(d)?null:d}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function dateForDay(day,state=root.state,weekMonday){const mon=weekMonday instanceof Date?monday(weekMonday):monday(parseISO(state&&state.settings&&state.settings.weekDate)||new Date());return iso(addDays(mon,Math.max(0,DAYS.indexOf(day))))}
function baseOf(){try{return typeof root.baseObj==='function'?root.baseObj():null}catch(e){return null}}
function travelMinutes(a,b){
  try{if(typeof root.roadMinutes==='function')return Math.max(0,Number(root.roadMinutes(a,b))||0)}catch(e){}
  try{if(typeof root.hav==='function')return Math.max(0,(Number(root.hav(a,b))||0)*1.22/55*60)}catch(e){}
  return 0;
}
function appointmentFor(storeId,date,state=root.state){return (state&&state.appointments||[]).find(a=>String(a.storeId)===String(storeId)&&a.date===date)||null}
function blocksForDate(date){try{return typeof root.calendarEventsForDate==='function'?(root.calendarEventsForDate(date)||[]):[]}catch(e){return []}}
function dayStart(day,state=root.state){const s=state&&state.settings||{},raw=day==='Samedi'?(s.saturdayStart||'08:00'):(s.startTime||'08:30');return minute(raw)??510}
function dayEnd(day,state=root.state){const s=state&&state.settings||{},raw=day==='Samedi'?(s.saturdayEnd||'12:00'):(s.endTime||'18:00');return minute(raw)??1080}
function scheduleRoute(route,day,state=root.state,options={}){
  const rows=[],date=options.date||dateForDay(day,state,options.weekMonday),base=options.base||baseOf(),blocks=options.blocks||blocksForDate(date),fallbackVisit=Math.max(15,Number(state&&state.settings&&state.settings.visitMinutes)||60),start=dayStart(day,state);
  const travel=options.travelMinutes||travelMinutes,appt=options.appointmentFor||((id,d)=>appointmentFor(id,d,state));let current=start,prev=base,unknownCount=0,closedCount=0,appointmentConflicts=0;
  for(let i=0;i<(route||[]).length;i++){
    const store=(state&&state.stores||[]).find(s=>String(s.id)===String(route[i].id))||route[i],drive=Math.max(0,Number(travel(prev,store))||0),nominal=current+drive,a=appt(store.id,date),storeVisit=(()=>{try{return typeof root.storeVisitDuration==='function'?root.storeVisitDuration(store,state):fallbackVisit}catch(e){return fallbackVisit}})(),duration=a?Math.max(15,Number(a.duration)||storeVisit):storeVisit;let requested=nominal,fixed=null;
    if(a&&a.time){fixed=minute(a.time);if(fixed!=null&&fixed>requested)requested=fixed}
    let fitted=fitWithBlocks(store,day,requested,duration,blocks),arrival=fitted.arrival,status='ok';
    if(a&&fixed!=null){
      const atFixed=fitOpening(store,day,fixed,duration);
      if(nominal>fixed||(blocks||[]).some(b=>overlapsBlock(fixed,duration,b))||(atFixed.known&&(atFixed.closed||atFixed.arrival!==fixed))){appointmentConflicts++;status='appointment-conflict'}
      arrival=fixed;
      if(!atFixed.known){unknownCount++;if(status==='ok')status='unknown'}
    }else if(fitted.closed){closedCount++;status='closed';arrival=null}
    else if(!fitted.known){unknownCount++;status='unknown'}
    else if(fitted.wait>0)status='wait-opening';
    rows.push({store,index:i,date,day,travel:drive,nominalArrival:nominal,arrival,duration,status,openingKnown:fitted.known,wait:fitted.wait||0,opening:intervalsFor(store,day),appointment:a});
    if(arrival==null)current=nominal+duration;else current=arrival+duration;prev=store;
  }
  const first=rows[0],recommendedDeparture=first&&first.arrival!=null&&first.status!=='appointment-conflict'?Math.max(start,first.arrival-first.travel):null;
  const returnTravel=rows.length&&base?Math.max(0,Number(travel(rows[rows.length-1].store,base))||0):0;
  const estimatedEnd=rows.length&&!closedCount&&!appointmentConflicts?current+returnTravel:null;
  return{day,date,rows,start,recommendedDeparture,estimatedEnd,returnTravel,unknownCount,closedCount,appointmentConflicts,endLimit:dayEnd(day,state)};
}
function routeFits(route,day,state=root.state,options={}){const s=scheduleRoute(route,day,state,options);return s.closedCount===0&&s.appointmentConflicts===0&&(s.estimatedEnd==null||s.estimatedEnd<=s.endLimit+0.001)}
function byId(id){return (root.state&&root.state.stores||[]).find(s=>String(s.id)===String(id))||null}
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function ensureDialog(){
  if(!root.document)return null;let d=root.document.getElementById('storeHoursDialog');if(d)return d;
  d=root.document.createElement('dialog');d.id='storeHoursDialog';d.style.cssText='box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto';d.innerHTML='<form method="dialog" style="min-width:0"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h2 style="margin:0">🕘 Horaires du magasin</h2><p id="storeHoursTitle" class="tiny" style="margin:5px 0 0"></p></div><button value="cancel" class="secondary" style="min-width:44px;min-height:44px">×</button></div><p class="tiny" style="margin-top:12px">Laisse vide si l’horaire est inconnu. Exemples : <b>09:00-19:00</b>, <b>09:00-12:30,14:00-19:00</b> ou <b>fermé</b>.</p><div id="storeHoursFields" style="display:grid;gap:9px;margin-top:12px"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><button type="button" id="copyMondayHours" class="secondary" style="min-height:44px">Copier lundi → ven.</button><button type="button" id="saveStoreHours" class="primary" style="min-height:44px">Enregistrer</button></div><p id="storeHoursError" class="tiny" style="color:#b42318;margin:9px 0 0"></p></form>';
  root.document.body.appendChild(d);
  const fields=d.querySelector('#storeHoursFields');for(const day of DAYS){const row=root.document.createElement('label');row.style.cssText='display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin:0';row.innerHTML='<span>'+day+'</span><input type="text" inputmode="text" autocomplete="off" data-hours-day="'+day+'" placeholder="Inconnu" style="min-height:44px;min-width:0;width:100%;box-sizing:border-box">';fields.appendChild(row)}
  d.querySelector('#copyMondayHours').onclick=()=>{const value=d.querySelector('[data-hours-day="Lundi"]').value;for(const day of ['Mardi','Mercredi','Jeudi','Vendredi'])d.querySelector('[data-hours-day="'+day+'"]').value=value};
  d.querySelector('#saveStoreHours').onclick=saveDialogHours;return d;
}
function openHoursDialog(storeId){
  const store=byId(storeId);if(!store)throw new Error('Magasin introuvable.');const d=ensureDialog();d.dataset.storeId=String(store.id);d.querySelector('#storeHoursTitle').textContent=store.enseigne+' '+store.ville;d.querySelector('#storeHoursError').textContent='';
  for(const day of DAYS)d.querySelector('[data-hours-day="'+day+'"]').value=serializeDayHours(store.openingHours&&store.openingHours[day]);
  if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');return true;
}
function saveDialogHours(){
  const d=root.document.getElementById('storeHoursDialog'),store=d&&byId(d.dataset.storeId);if(!d||!store)return false;const error=d.querySelector('#storeHoursError'),hours={};
  try{
    for(const day of DAYS){const parsed=parseDayHours(d.querySelector('[data-hours-day="'+day+'"]').value);if(parsed!==undefined)hours[day]=parsed}
    const previous=copy(store);
    if(Object.keys(hours).length)store.openingHours=hours;else delete store.openingHours;store.openingHoursSource='manual';store.openingHoursUpdatedAt=new Date().toISOString();
    try{if(typeof root.save!=='function')throw new Error('Sauvegarde indisponible.');root.save()}catch(e){for(const key of ['openingHours','openingHoursSource','openingHoursUpdatedAt']){if(Object.prototype.hasOwnProperty.call(previous,key))store[key]=previous[key];else delete store[key]}throw e}if(typeof d.close==='function')d.close();else d.removeAttribute('open');
    if(typeof root.renderAll==='function')root.renderAll();root.document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'store-opening-hours',storeId:String(store.id)}}));scheduleDecorate();return true;
  }catch(e){if(error)error.textContent=e.message||String(e);return false}
}
function installQuickButton(){
  if(!root.document)return false;const actions=root.document.querySelector('#storeQuickSheet .sheetActions');if(!actions)return false;if(root.document.getElementById('openingHoursQuickBtn'))return true;
  const b=root.document.createElement('button');b.type='button';b.id='openingHoursQuickBtn';b.className='secondary';b.textContent='🕘 Horaires';b.title='Renseigner les horaires connus de ce magasin';b.onclick=()=>{const start=root.document.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;if(!id)return;try{openHoursDialog(id)}catch(e){if(typeof root.showError==='function')root.showError(e.message||String(e))}};actions.appendChild(b);return true;
}
/* Le jour réellement affiché ne vit pas sur window : `selectedPlanningDay` est une
   variable privée de l'IIFE du planning (script v37-apple-planning-js). `root.selectedPlanningDay`
   valait donc toujours undefined et ce module retombait sur le premier jour travaillé :
   decorateTimeline réécrivait les heures de la timeline avec l'horaire du lundi quel que
   soit le jour consulté, en face des bons magasins. On lit le jour affiché dans les
   onglets réellement rendus, qui sont la seule source fiable exposée au DOM. */
function dayFromRows(){
  /* Source la plus sûre : renderWeek() écrit le jour rendu dans le onclick de chaque
     ligne. Il ne peut donc jamais diverger des lignes que l'on s'apprête à décorer,
     contrairement aux onglets, dont la bande de période tient son propre état. */
  try{
    const doc=root.document;if(!doc)return null;
    const main=doc.querySelector('#week .timelineRow:not(.calendarEvent) .tlMain[onclick]');
    if(!main)return null;
    const m=String(main.getAttribute('onclick')||'').match(/openStoreQuick\('[^']*','([^']*)'/);
    if(!m)return null;
    const wanted=norm(m[1]);
    for(const name of DAYS)if(norm(name)===wanted)return name;
  }catch(e){}
  return null;
}
function dayFromTabs(){
  try{
    const doc=root.document;if(!doc)return null;
    const dated=doc.querySelector('#dayTabs .periodDayTab.active[data-date]');
    if(dated&&dated.dataset){
      const d=parseISO(dated.dataset.date);
      if(d){const name=DAYS[(d.getDay()+6)%7];if(name)return name}
    }
    const legacy=doc.querySelector('#dayTabs .dayTab.active');
    if(legacy){
      const text=norm(legacy.textContent);
      for(const name of DAYS)if(text.indexOf(norm(name))===0)return name;
    }
  }catch(e){}
  return null;
}
function dayNow(){
  try{
    if(typeof root.selectedPlanningDay==='string'&&root.selectedPlanningDay)return root.selectedPlanningDay;
    const rendered=dayFromRows();
    if(rendered)return rendered;
    const shown=dayFromTabs();
    if(shown)return shown;
    return ((root.state.settings&&root.state.settings.days)||DAYS)[0]||'Lundi';
  }catch(e){return 'Lundi'}
}
function hintText(row){if(row.status==='closed')return '⛔ Aucun créneau disponible';if(row.status==='appointment-conflict')return '⚠ RDV incompatible avec la tournée, l’ouverture ou l’Agenda';if(row.status==='unknown')return '🕘 Horaire à vérifier';if(row.status==='wait-opening'&&row.arrival!=null)return '🕘 ouvre avant la visite · '+clock(row.arrival);return ''}
function summaryText(s){
  if(!s||!s.rows.length)return '';
  const parts=[];if(s.recommendedDeparture!=null)parts.push('Départ conseillé '+clock(s.recommendedDeparture));
  if(s.estimatedEnd!=null)parts.push('fin estimée '+clock(s.estimatedEnd));else if(s.closedCount||s.appointmentConflicts)parts.push('fin non fiable');
  if(s.closedCount)parts.push(s.closedCount+' magasin'+(s.closedCount>1?'s':'')+' sans créneau disponible');
  if(s.unknownCount)parts.push(s.unknownCount+' horaire'+(s.unknownCount>1?'s':'')+' à vérifier');
  if(s.appointmentConflicts)parts.push(s.appointmentConflicts+' RDV à vérifier');return parts.join(' · ')
}
function decorateTimeline(){
  if(decorating||!root.document||!root.state)return false;const week=root.document.getElementById('week');if(!week)return false;const day=dayNow(),route=(root.state.plan&&root.state.plan[day])||[],rows=[...week.querySelectorAll('.timelineRow:not(.calendarEvent)')];if(!route.length||!rows.length){const old=root.document.getElementById('openingHoursDaySummary');if(old)old.hidden=true;return false}
  decorating=true;try{
    const schedule=scheduleRoute(route,day,root.state),count=Math.min(rows.length,schedule.rows.length);
    for(let i=0;i<count;i++){
      const dom=rows[i],item=schedule.rows[i],time=dom.querySelector('.tlTime');if(time){const label=item.arrival==null?'Indisponible':clock(item.arrival);if(time.textContent!==label)time.textContent=label}
      const duration=dom.querySelector('.tlDuration');if(item.arrival==null&&duration){const label=duration.dataset.baseDuration||item.duration+' min';if(duration.textContent!==label)duration.textContent=label}
      let hint=dom.querySelector('.storeHoursHint'),target=dom.querySelector('.tlMain>div:first-child')||dom.querySelector('.tlMain'),text=hintText(item);
      if(text&&!hint&&target){hint=root.document.createElement('div');hint.className='storeHoursHint';hint.style.cssText='font-size:10.5px;margin-top:5px;font-weight:700;color:'+(item.status==='closed'||item.status==='appointment-conflict'?'#b42318':'#667085');target.appendChild(hint)}
      if(hint){if(hint.textContent!==text)hint.textContent=text;hint.hidden=!text;hint.style.color=item.status==='closed'||item.status==='appointment-conflict'?'#b42318':'#667085'}
    }
    const shell=week.closest('.timelineShell')||week.parentElement;if(shell&&shell.parentNode){let box=root.document.getElementById('openingHoursDaySummary');if(!box){box=root.document.createElement('div');box.id='openingHoursDaySummary';box.setAttribute('role','status');box.style.cssText='margin:8px 2px 10px;padding:10px 12px;border:1px solid #e1e5ed;border-radius:14px;background:#f8faff;color:#475467;font-size:12px;line-height:1.4';shell.parentNode.insertBefore(box,shell)}const summary=summaryText(schedule);if(box.textContent!==summary)box.textContent=summary;box.hidden=!box.textContent}
    return schedule;
  }finally{decorating=false}
}
function scheduleDecorate(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;decorateTimeline()},70)}
function observe(){if(observer||!root.document||typeof MutationObserver==='undefined')return;const host=root.document.getElementById('planPanel');if(!host)return;observer=new MutationObserver(records=>{if(decorating)return;for(const r of records){if(r.addedNodes&&r.addedNodes.length){scheduleDecorate();break}}});observer.observe(host,{childList:true,subtree:true})}
function boot(){ensureDialog();installQuickButton();decorateTimeline();observe()}
const api={parseDayHours,serializeDayHours,intervalsFor,openingLabel,fitOpening,fitWithBlocks,scheduleRoute,routeFits,openHoursDialog,decorateTimeline,dayNow,dateForDay};root.StoreOpeningHoursV1=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();root.document.addEventListener('store-runner:planning-updated',()=>{installQuickButton();scheduleDecorate()});root.document.addEventListener('store-runner:data-restored',()=>{installQuickButton();scheduleDecorate()});root.addEventListener('chef-range-generated',scheduleDecorate);root.document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('#dayTabs,.periodDayTab,.dayTab'))scheduleDecorate()},true)}
})(typeof window!=='undefined'?window:globalThis);
