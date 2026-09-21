/* Store Runner V1 — horaires d'ouverture explicites et calcul terrain.
   Aucune heure par défaut n'est inventée : champ absent = horaire inconnu,
   tableau vide = fermé, intervalles = horaire connu. */
(function(root){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MODEL_DAYS=[...DAYS,'Dimanche'];
const own=(value,key)=>!!value&&Object.prototype.hasOwnProperty.call(value,key);
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
// V230 : un modèle est stocké une seule fois dans l'état, jamais dans ses héritiers.
function brandKey(value){return norm(value).replace(/[\s\p{P}]+/gu,'')}
function brandModel(store,state=root.state){
  const key=brandKey(store&&store.enseigne),models=state&&state.brandOpeningHours;
  return key&&own(models,key)?models[key]:undefined;
}
function validateBrandModels(models){
  if(!models||typeof models!=='object'||Array.isArray(models))throw new Error('Modèles enseigne invalides.');
  for(const [key,hours] of Object.entries(models)){
    if(!key||key!==brandKey(key)||['__proto__','constructor','prototype'].includes(key)||!hours||typeof hours!=='object'||Array.isArray(hours))throw new Error('Modèle enseigne invalide.');
    for(const [day,rows] of Object.entries(hours))if(!MODEL_DAYS.includes(day)||!Array.isArray(rows)||normalizeIntervals(rows)===undefined)throw new Error('Horaire enseigne invalide : '+day+'.');
  }
  return models;
}
function setBrandModel(brand,hours,state=root.state){
  const key=brandKey(brand),models={...(state.brandOpeningHours||{}),[key]:copy(hours)};
  validateBrandModels(models);state.brandOpeningHours=models;return models[key];
}
function clearStoreOverride(store){
  for(const key of ['openingHours','openingHoursSource','openingHoursUpdatedAt','openTime','closeTime'])delete store[key];
}
// Compatibilité V229 : les anciens défauts matérialisés restent des fallbacks.
// L'adaptateur Boulanger/Darty délègue ici ; il ne possède plus aucune règle horaire.
const LEGACY_OPEN='09:30',LEGACY_CLOSE='19:30',LEGACY_SOURCE='brand-default';
function isBoulanger(store){return !!store&&norm(store.enseigne)==='boulanger'}
function isDarty(store){return !!store&&norm(store.enseigne)==='darty'}
function isSupportedBrand(store){return isBoulanger(store)||isDarty(store)}
function brandLabel(store){return isBoulanger(store)?'Boulanger':isDarty(store)?'Darty':''}
function defaultHours(){const hours={};for(const day of DAYS)hours[day]=[{open:LEGACY_OPEN,close:LEGACY_CLOSE}];return hours}
function hasExplicitLegacy(store){return !!(String(store&&store.openTime||'').trim()||String(store&&store.closeTime||'').trim())}
function shouldApplyLegacy(store,state=root.state){
  if(!isSupportedBrand(store)||brandModel(store,state)!==undefined)return false;
  const source=String(store.openingHoursSource||'');
  return source!=='manual'&&(!source||source===LEGACY_SOURCE)&&(!store.openingHours||source===LEGACY_SOURCE)&&(!hasExplicitLegacy(store)||source===LEGACY_SOURCE);
}
function sameDefault(hours){return !!hours&&typeof hours==='object'&&DAYS.every(day=>Array.isArray(hours[day])&&hours[day].length===1&&hours[day][0]&&hours[day][0].open===LEGACY_OPEN&&hours[day][0].close===LEGACY_CLOSE)}
function applyLegacyStore(store,state=root.state){
  if(!shouldApplyLegacy(store,state)||store.openingHoursSource===LEGACY_SOURCE&&sameDefault(store.openingHours))return false;
  store.openingHours=defaultHours();store.openingHoursSource=LEGACY_SOURCE;delete store.openingHoursUpdatedAt;return true;
}
const legacyBrandDefaults={DAYS,OPEN:LEGACY_OPEN,CLOSE:LEGACY_CLOSE,SOURCE:LEGACY_SOURCE,isBoulanger,isDarty,isSupportedBrand,brandLabel,defaultHours,shouldApply:shouldApplyLegacy,sameDefault,applyStore:applyLegacyStore};
function intervalsFor(store,day,state=root.state){
  if(!store)return undefined;
  const model=brandModel(store,state);
  if(model!==undefined){
    if(store.openingHoursSource!==LEGACY_SOURCE){
      if(own(store.openingHours,day))return normalizeIntervals(store.openingHours[day]);
      // Les anciens champs quotidiens explicites sont aussi un override magasin.
      if(!store.openingHours&&store.openingHoursSource!=='manual'){
        const open=minute(store.openTime),close=minute(store.closeTime);
        if(open!=null&&close!=null&&close>open)return [{open:clock(open),close:clock(close)}];
      }
    }
    return normalizeIntervals(model[day]);
  }
  if(store.openingHours&&typeof store.openingHours==='object')return normalizeIntervals(store.openingHours[day]);
  if(store.openingHoursSource==='manual')return undefined;
  const open=minute(store.openTime),close=minute(store.closeTime);
  return open!=null&&close!=null&&close>open?[{open:clock(open),close:clock(close)}]:undefined;
}
function openingLabel(store,day,state=root.state){const rows=intervalsFor(store,day,state);return rows===undefined?'Horaire à vérifier':(!rows.length?'Fermé':rows.map(x=>x.open+'–'+x.close).join(' · '))}
function fitOpening(store,day,arrival,duration,state=root.state){
  const rows=intervalsFor(store,day,state),a=Number(arrival),dur=Math.max(1,Number(duration)||1);
  if(rows===undefined)return{known:false,closed:false,arrival:a,wait:0,interval:null};
  if(!rows.length)return{known:true,closed:true,arrival:null,wait:null,interval:null};
  for(const row of rows){const open=minute(row.open),close=minute(row.close),candidate=Math.max(a,open);if(candidate+dur<=close)return{known:true,closed:false,arrival:candidate,wait:Math.max(0,candidate-a),interval:{open,close}}}
  return{known:true,closed:true,arrival:null,wait:null,interval:null};
}
function overlapsBlock(start,duration,block){return !!(block&&!block.allDay&&Number.isFinite(Number(block.startMin))&&Number.isFinite(Number(block.endMin))&&start<Number(block.endMin)&&start+duration>Number(block.startMin))}
function fitWithBlocks(store,day,arrival,duration,blocks,state=root.state){
  let current=Number(arrival),first=current,opening=fitOpening(store,day,current,duration,state),loops=0;
  if(opening.closed)return{...opening,original:first};if(opening.arrival!=null)current=opening.arrival;
  while(loops++<=(blocks||[]).length){
    let shifted=false;
    for(const block of (blocks||[])){if(overlapsBlock(current,duration,block)){current=Number(block.endMin);shifted=true;break}}
    if(!shifted)break;
    opening=fitOpening(store,day,current,duration,state);if(opening.closed)return{...opening,original:first};current=opening.arrival;
  }
  const finalOpen=fitOpening(store,day,current,duration,state);if(finalOpen.closed)return{...finalOpen,original:first};
  return{...finalOpen,arrival:current,wait:Math.max(0,current-first),original:first};
}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseISO(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return isNaN(d)?null:d}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function dateForDay(day,state=root.state,weekMonday){const mon=weekMonday instanceof Date?monday(weekMonday):monday(parseISO(state&&state.settings&&state.settings.weekDate)||new Date());return iso(addDays(mon,Math.max(0,DAYS.indexOf(day))))}
function baseOf(){try{return typeof root.baseObj==='function'?root.baseObj():null}catch(e){return null}}
/* Le premier trajet ne part pas toujours de la base : après une nuit sur place, il part
   de là où l'on a dormi. Le point de départ effectif d'une date appartient à
   StoreRunnerDayOrigin, qui sait lire l'hôtel ou le choix confirmé par l'utilisateur.
   Module absent ou date inconnue : on retombe sur la base, comme avant. */
function originFor(date,state){
  try{
    const api=root.StoreRunnerDayOrigin;
    if(api&&typeof api.originFor==='function')return api.originFor(date,state);
  }catch(e){}
  return null;
}
function originBase(date,state){
  const origin=originFor(date,state);
  if(!origin||origin.type==='base')return null;
  return{id:'ORIGIN',enseigne:'Départ',ville:origin.ville,adresse:origin.adresse,lat:origin.lat,lon:origin.lon};
}
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
  const rows=[],date=options.date||dateForDay(day,state,options.weekMonday),
    origin=options.origin!==undefined?options.origin:originFor(date,state),
    base=options.base||baseOf(),
    departureBase=options.base||(origin&&origin.type!=='base'?{id:'ORIGIN',enseigne:'Départ',ville:origin.ville,adresse:origin.adresse,lat:origin.lat,lon:origin.lon}:base),blocks=options.blocks||blocksForDate(date),fallbackVisit=Math.max(15,Number(state&&state.settings&&state.settings.visitMinutes)||60),start=dayStart(day,state);
  const travel=options.travelMinutes||travelMinutes,appt=options.appointmentFor||((id,d)=>appointmentFor(id,d,state));let current=start,prev=departureBase,unknownCount=0,closedCount=0,appointmentConflicts=0;
  for(let i=0;i<(route||[]).length;i++){
    const store=(state&&state.stores||[]).find(s=>String(s.id)===String(route[i].id))||route[i],drive=Math.max(0,Number(travel(prev,store))||0),nominal=current+drive,a=appt(store.id,date),storeVisit=(()=>{try{return typeof root.storeVisitDuration==='function'?root.storeVisitDuration(store,state):fallbackVisit}catch(e){return fallbackVisit}})(),duration=a?Math.max(15,Number(a.duration)||storeVisit):storeVisit;let requested=nominal,fixed=null;
    if(a&&a.time){fixed=minute(a.time);if(fixed!=null&&fixed>requested)requested=fixed}
    let fitted=fitWithBlocks(store,day,requested,duration,blocks,state),arrival=fitted.arrival,status='ok';
    if(a&&fixed!=null){
      const atFixed=fitOpening(store,day,fixed,duration,state);
      /* Le premier arrêt part de la base, pas d'une visite précédente : `nominal` n'y
         est que « début de journée + trajet ». Vouloir y être plus tôt ne décrit donc
         aucune impossibilité de trajet, seulement un départ avancé — que l'utilisateur
         a le droit de choisir. Pour ce cas, et lui seul, `nominal > fixed` cesse de
         rendre l'arrivée impossible. Magasin fermé, horaires d'ouverture et blocages
         Agenda restent des contraintes réelles, et les vrais rendez-vous gardent leur
         comportement historique sur toute la tournée. */
      const canLeaveBaseEarlier=i===0&&a.manualHours===true;
      const unreachable=(nominal>fixed&&!canLeaveBaseEarlier)||(blocks||[]).some(b=>overlapsBlock(fixed,duration,b))||(atFixed.known&&(atFixed.closed||atFixed.arrival!==fixed));
      if(unreachable){appointmentConflicts++;status='appointment-conflict'}
      /* Un vrai rendez-vous garde son comportement historique : l'heure convenue fait
         foi, même si la tournée ne la tient pas — c'est au chef de secteur d'arbitrer.
         Un horaire posé à la main, lui, ne décrit que le souhait de l'utilisateur :
         s'il est intenable, planifier la suite depuis cette heure ferait repartir la
         journée d'un instant qui n'existe pas. On garde l'heure demandée visible dans
         requestedArrival et on planifie sur l'heure réellement atteignable, déjà
         calculée par fitWithBlocks (trajet, ouverture et Agenda compris). */
      arrival=unreachable&&a.manualHours===true?fitted.arrival:fixed;
      if(!atFixed.known){unknownCount++;if(status==='ok')status='unknown'}
    }else if(fitted.closed){closedCount++;status='closed';arrival=null}
    else if(!fitted.known){unknownCount++;status='unknown'}
    else if(fitted.wait>0)status='wait-opening';
    rows.push({store,index:i,date,day,travel:drive,nominalArrival:nominal,requestedArrival:fixed,arrival,duration,status,openingKnown:fitted.known,wait:fitted.wait||0,opening:intervalsFor(store,day,state),appointment:a});
    if(arrival==null)current=nominal+duration;else current=arrival+duration;prev=store;
  }
  /* Le plancher au début de journée reste la règle d'un planning automatique. Quand le
     premier arrêt porte un horaire posé à la main, le départ conseillé est exactement
     ce que ce choix implique — 09:30 moins 119 min de trajet = 07:31 — même si cela
     précède le début de journée habituel. */
  const first=rows[0];
  const firstIsManual=!!(first&&first.appointment&&first.appointment.manualHours===true);
  const recommendedDeparture=first&&first.arrival!=null&&first.status!=='appointment-conflict'
    ?(firstIsManual?first.arrival-first.travel:Math.max(start,first.arrival-first.travel))
    :null;
  // Le découché change seulement le départ du matin ; le retour reste à la base.
  const returnTravel=rows.length&&base?Math.max(0,Number(travel(rows[rows.length-1].store,base))||0):0;
  const estimatedEnd=rows.length&&!closedCount&&!appointmentConflicts?current+returnTravel:null;
  return{day,date,rows,start,origin,recommendedDeparture,estimatedEnd,returnTravel,unknownCount,closedCount,appointmentConflicts,endLimit:dayEnd(day,state)};
}
function routeFits(route,day,state=root.state,options={}){const s=scheduleRoute(route,day,state,options);return s.closedCount===0&&s.appointmentConflicts===0&&(s.estimatedEnd==null||s.estimatedEnd<=s.endLimit+0.001)}
function byId(id){return (root.state&&root.state.stores||[]).find(s=>String(s.id)===String(id))||null}
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function hasStoreOverride(store,state=root.state){
  if(store.openingHoursSource===LEGACY_SOURCE)return false;
  if(brandModel(store,state)!==undefined)return MODEL_DAYS.some(day=>own(store.openingHours,day))||!store.openingHours&&store.openingHoursSource!=='manual'&&hasExplicitLegacy(store);
  return !!(store.openingHours||store.openingHoursSource==='manual'||hasExplicitLegacy(store));
}
function brands(state=root.state){
  const rows=new Map();
  for(const store of state&&state.stores||[]){const key=brandKey(store.enseigne);if(!key)continue;if(!rows.has(key))rows.set(key,{key,label:String(store.enseigne).trim(),count:0,custom:0});const row=rows.get(key);row.count++;if(hasStoreOverride(store,state))row.custom++}
  for(const key of Object.keys(state&&state.brandOpeningHours||{}))if(!rows.has(key))rows.set(key,{key,label:key,count:0,custom:0});
  return [...rows.values()].sort((a,b)=>a.label.localeCompare(b.label,'fr'));
}
function closeDialog(d){if(typeof d.close==='function')d.close();else d.removeAttribute('open')}
function refreshHours(reason,storeId){
  if(typeof root.renderAll==='function')root.renderAll();
  root.document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason,storeId}}));scheduleDecorate();
}
async function persistHours(){
  if(typeof root.save!=='function')throw new Error('Sauvegarde indisponible.');
  if(root.__chefStorageMode==='memory')throw new Error('Stockage temporaire : les horaires ne peuvent pas être conservés.');
  root.save();const db=root.__chefStorage;if(db&&typeof db.flush==='function')await db.flush();
}
async function saveHoursChange(d,change,rollback,reason,storeId){
  if(d.dataset.saving==='true')return false;
  const error=d.querySelector('[data-hours-error]');
  if(d.hoursState!==root.state){error.textContent='Les données ont changé. Ferme puis rouvre les horaires.';return false}
  d.dataset.saving='true';const buttons=[...d.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{change();await persistHours()}
  catch(e){
    rollback();
    // Une transaction IndexedDB peut échouer après l'écriture dans le cache mémoire.
    // Réenregistrer le précédent état évite que le prochain flush ressuscite l'essai.
    try{await persistHours()}catch(_){}
    error.textContent=e.message||String(e);return false;
  }
  finally{delete d.dataset.saving;buttons.forEach(b=>b.disabled=false)}
  closeDialog(d);refreshHours(reason,storeId);return true;
}
function styleHoursDialog(d){
  d.addEventListener('cancel',e=>{if(d.dataset.saving==='true')e.preventDefault()});
  const cancel=d.querySelector('button[value="cancel"]');cancel.type='button';cancel.onclick=()=>closeDialog(d);cancel.setAttribute('aria-label','Fermer');
  d.querySelector('form').onsubmit=e=>{e.preventDefault();d.querySelector('button.primary').click()};
  d.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input[type="text"]')){e.preventDefault();d.querySelector('button.primary').click()}});
  d.style.cssText='box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto';
  d.querySelectorAll('input[type="text"],select').forEach(el=>{el.style.cssText='min-height:44px;min-width:0;max-width:100%;width:100%;box-sizing:border-box;font-size:16px'});
  d.querySelectorAll('button').forEach(el=>{el.style.minHeight='44px';el.style.minWidth='44px';el.style.whiteSpace='normal'});
}
function ensureBrandDialog(){
  let d=root.document.getElementById('brandHoursDialog');if(d)return d;
  d=root.document.createElement('dialog');d.id='brandHoursDialog';d.setAttribute('aria-labelledby','brandHoursHeading');
  d.innerHTML='<form method="dialog" style="min-width:0"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2 id="brandHoursHeading" style="margin:0">🕘 Horaires par enseigne</h2><button value="cancel" class="secondary" aria-label="Fermer">×</button></div><label for="brandHoursSelect">Enseigne</label><select id="brandHoursSelect"></select><p id="brandHoursCount" class="tiny" role="status"></p><p class="tiny">09:00-19:00 ou 09:00-12:30,14:00-19:00. « fermé » = fermé ; vide = inconnu. Les horaires personnalisés des magasins sont conservés.</p><div id="brandHoursFields" style="display:grid;gap:9px"></div><fieldset style="min-width:0;margin:14px 0;padding:8px"><legend>Copier le lundi vers</legend><div id="brandHoursCopyDays" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr))"></div><button type="button" id="copyBrandMondayHours" class="secondary" style="width:100%">Copier vers les jours cochés</button></fieldset><button type="button" id="saveBrandHours" class="primary" style="width:100%">Enregistrer le modèle</button><p id="brandHoursError" data-hours-error role="alert" class="tiny" style="color:#b42318"></p></form>';
  for(const day of MODEL_DAYS){
    const label=root.document.createElement('label');label.style.cssText='display:grid;gap:4px;margin:0;min-width:0';label.innerHTML='<span>'+day+'</span><input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-brand-hours-day="'+day+'" placeholder="Inconnu">';d.querySelector('#brandHoursFields').appendChild(label);
    if(day==='Lundi')continue;
    const target=root.document.createElement('label');target.style.cssText='display:flex;align-items:center;gap:8px;min-height:44px;margin:0';target.innerHTML='<input type="checkbox" data-copy-hours-day="'+day+'" '+(day==='Dimanche'?'':'checked')+' style="width:22px;height:22px;margin:0"><span>'+day+'</span>';d.querySelector('#brandHoursCopyDays').appendChild(target);
  }
  d.querySelector('#brandHoursSelect').onchange=()=>fillBrandDialog(d);
  d.querySelector('#copyBrandMondayHours').onclick=()=>{const value=d.querySelector('[data-brand-hours-day="Lundi"]').value;d.querySelectorAll('[data-copy-hours-day]:checked').forEach(el=>{d.querySelector('[data-brand-hours-day="'+el.dataset.copyHoursDay+'"]').value=value})};
  d.querySelector('#saveBrandHours').onclick=()=>{
    const error=d.querySelector('#brandHoursError');error.textContent='';
    try{
      const hours={},key=d.querySelector('#brandHoursSelect').value;if(!key)throw new Error('Ajoute un magasin pour choisir une enseigne.');
      for(const day of MODEL_DAYS){const parsed=parseDayHours(d.querySelector('[data-brand-hours-day="'+day+'"]').value);if(parsed!==undefined)hours[day]=parsed}
      const state=root.state,previous=state.brandOpeningHours,had=own(state,'brandOpeningHours');
      return saveHoursChange(d,()=>setBrandModel(key,hours,state),()=>{if(had)state.brandOpeningHours=previous;else delete state.brandOpeningHours},'brand-opening-hours');
    }catch(e){error.textContent=e.message||String(e);return false}
  };
  styleHoursDialog(d);root.document.body.appendChild(d);return d;
}
function fillBrandDialog(d){
  const key=d.querySelector('#brandHoursSelect').value,row=brands().find(x=>x.key===key),model=brandModel({enseigne:key});
  d.querySelector('#brandHoursCount').textContent=row?row.count+' magasin'+(row.count>1?'s':'')+' · '+row.custom+' avec horaires personnalisés'+(model===undefined?' · Nouveau modèle':' · Modèle enregistré'):'Aucune enseigne disponible.';
  d.querySelector('#saveBrandHours').disabled=!row;d.querySelector('#brandHoursError').textContent='';
  for(const day of MODEL_DAYS)d.querySelector('[data-brand-hours-day="'+day+'"]').value=model===undefined&&day==='Dimanche'?'fermé':serializeDayHours(model&&model[day]);
}
function openBrandHoursDialog(brand){
  const d=ensureBrandDialog(),rows=brands();d.hoursState=root.state;
  d.querySelector('#brandHoursSelect').innerHTML=rows.map(x=>'<option value="'+escapeHtml(x.key)+'">'+escapeHtml(x.label)+'</option>').join('');
  if(brand&&rows.some(x=>x.key===brandKey(brand)))d.querySelector('#brandHoursSelect').value=brandKey(brand);
  fillBrandDialog(d);if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');return true;
}
function installBrandButton(){
  const host=root.document.querySelector('#planningSettings .settingsInner');if(!host||root.document.getElementById('brandOpeningHoursBtn'))return;
  const button=root.document.createElement('button');button.id='brandOpeningHoursBtn';button.type='button';button.className='secondary full';button.textContent='🕘 Horaires par enseigne';button.style.cssText='min-height:44px;max-width:100%;white-space:normal';button.onclick=()=>openBrandHoursDialog();host.prepend(button);
}
function ensureDialog(){
  if(!root.document)return null;let d=root.document.getElementById('storeHoursDialog');if(d)return d;
  d=root.document.createElement('dialog');d.id='storeHoursDialog';d.style.cssText='box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto';d.innerHTML='<form method="dialog" style="min-width:0"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h2 style="margin:0">🕘 Horaires du magasin</h2><p id="storeHoursTitle" class="tiny" style="margin:5px 0 0"></p></div><button value="cancel" class="secondary" style="min-width:44px;min-height:44px">×</button></div><p class="tiny" style="margin-top:12px">Formats acceptés : <b>09:00-19:00</b>, <b>09:00-12:30,14:00-19:00</b> ou <b>fermé</b>.</p><div id="storeHoursFields" style="display:grid;gap:9px;margin-top:12px"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><button type="button" id="copyMondayHours" class="secondary" style="min-height:44px">Copier lundi → ven.</button><button type="button" id="saveStoreHours" class="primary" style="min-height:44px">Enregistrer</button></div><p id="storeHoursError" data-hours-error role="alert" class="tiny" style="color:#b42318;margin:9px 0 0"></p></form>';
  root.document.body.appendChild(d);
  const fields=d.querySelector('#storeHoursFields');for(const day of MODEL_DAYS){const row=root.document.createElement('label');row.style.cssText='display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin:0';row.innerHTML='<span>'+day+'</span><input type="text" inputmode="text" autocomplete="off" data-hours-day="'+day+'" placeholder="Inconnu" style="min-height:44px;min-width:0;width:100%;box-sizing:border-box">';fields.appendChild(row)}
  d.querySelector('#copyMondayHours').onclick=()=>{const value=d.querySelector('[data-hours-day="Lundi"]').value;for(const day of ['Mardi','Mercredi','Jeudi','Vendredi'])d.querySelector('[data-hours-day="'+day+'"]').value=value};
  const status=root.document.createElement('p');status.id='storeHoursInheritance';status.className='tiny';status.setAttribute('role','status');fields.before(status);
  const reset=root.document.createElement('button');reset.id='resetStoreHours';reset.type='button';reset.className='secondary full';reset.textContent='Revenir aux horaires de l’enseigne';reset.style.cssText='margin-top:12px;width:100%';
  reset.onclick=()=>{
    const store=byId(d.dataset.storeId);if(!store)return;const previous=copy(store);
    return saveHoursChange(d,()=>clearStoreOverride(store),()=>restoreStoreHours(store,previous),'store-opening-hours',String(store.id));
  };
  d.querySelector('form').appendChild(reset);d.setAttribute('aria-label','Horaires du magasin');styleHoursDialog(d);
  d.querySelector('#saveStoreHours').onclick=saveDialogHours;return d;
}
function openHoursDialog(storeId){
  const store=byId(storeId);if(!store)throw new Error('Magasin introuvable.');const d=ensureDialog(),model=brandModel(store);d.hoursState=root.state;d.dataset.storeId=String(store.id);d.querySelector('#storeHoursTitle').textContent=store.enseigne+' '+store.ville;d.querySelector('#storeHoursError').textContent='';
  const custom=hasStoreOverride(store);
  d.querySelector('#storeHoursInheritance').textContent=(custom?'Horaires personnalisés. ':model!==undefined?'Hérite de l’enseigne '+store.enseigne+'. ':'Horaires historiques ou inconnus. ')+(model!==undefined?'Les jours laissés vides héritent du modèle ; un jour absent du modèle est inconnu.':'Sans modèle enseigne, un champ vide reste inconnu.');
  d.querySelector('#resetStoreHours').hidden=!custom;
  for(const day of MODEL_DAYS){
    const input=d.querySelector('[data-hours-day="'+day+'"]');
    input.value=serializeDayHours(model!==undefined&&store.openingHoursSource===LEGACY_SOURCE?undefined:store.openingHours&&store.openingHours[day]);
    input.placeholder=model!==undefined?'Enseigne : '+(serializeDayHours(model[day])||'inconnu'):'Inconnu';
    let hint=input.parentNode.querySelector('.hoursResolved');if(!hint){hint=root.document.createElement('small');hint.className='hoursResolved';hint.style.cssText='grid-column:1 / -1;overflow-wrap:anywhere;color:#667085';input.parentNode.appendChild(hint)}
    hint.textContent='Actuellement : '+openingLabel(store,day);
  }
  if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');return true;
}
function restoreStoreHours(store,previous){for(const key of ['openingHours','openingHoursSource','openingHoursUpdatedAt','openTime','closeTime']){if(own(previous,key))store[key]=previous[key];else delete store[key]}}
function saveDialogHours(){
  const d=root.document.getElementById('storeHoursDialog'),store=d&&byId(d.dataset.storeId);if(!d||!store)return false;const error=d.querySelector('#storeHoursError'),hours={};error.textContent='';
  try{
    for(const day of MODEL_DAYS){const parsed=parseDayHours(d.querySelector('[data-hours-day="'+day+'"]').value);if(parsed!==undefined)hours[day]=parsed}
    const previous=copy(store);
    return saveHoursChange(d,()=>{
      if(Object.keys(hours).length)store.openingHours=hours;else delete store.openingHours;store.openingHoursSource='manual';store.openingHoursUpdatedAt=new Date().toISOString();
    },()=>restoreStoreHours(store,previous),'store-opening-hours',String(store.id));
  }catch(e){error.textContent=e.message||String(e);return false}
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
function boot(){ensureDialog();installQuickButton();installBrandButton();decorateTimeline();observe()}
const api={MODEL_DAYS,brandKey,brandModel,validateBrandModels,setBrandModel,clearStoreOverride,legacyBrandDefaults,openBrandHoursDialog,parseDayHours,serializeDayHours,intervalsFor,openingLabel,fitOpening,fitWithBlocks,scheduleRoute,routeFits,openHoursDialog,decorateTimeline,dayNow,dateForDay,originFor,originBase};root.StoreOpeningHoursV1=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();root.document.addEventListener('store-runner:planning-updated',()=>{installQuickButton();scheduleDecorate()});root.document.addEventListener('store-runner:data-restored',()=>{for(const id of ['brandHoursDialog','storeHoursDialog']){const d=root.document.getElementById(id);if(d&&d.open)closeDialog(d)}installQuickButton();installBrandButton();scheduleDecorate()});root.addEventListener('chef-range-generated',scheduleDecorate);root.document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('#dayTabs,.periodDayTab,.dayTab'))scheduleDecorate()},true)}
})(typeof window!=='undefined'?window:globalThis);
