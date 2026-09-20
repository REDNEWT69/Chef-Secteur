(function(){
'use strict';

/* V189 : réglages terrain par magasin + découché futur exploitable.
   Ce module ne prend pas possession des fonctions de rendu globales : il se branche
   sur les événements Store Runner et sur les deux actions de la fiche magasin. */
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const CREDIT_OVERRIDES_KEY='store-runner-visit-credit-overrides-v189';
const DEFAULT_CREDITS={darty:2,boulanger:2,but:2,conforama:2,carrefour:1};
const REMOTE_MIN_KM=55;
const MIN_USEFUL_OVERNIGHT_KM=20;
let editingStoreId='';

function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function storage(){try{return window.__chefStorage||window.localStorage||null}catch(e){return null}}
function parse(v){if(v instanceof Date)return new Date(v.getTime());const s=String(v||'').trim();if(!s)return null;const d=/^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(s+'T12:00:00'):new Date(s);return isNaN(d)?null:d}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function dateLabel(v){const d=parse(v);return d?String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'):String(v||'')}
function storeFingerprint(s){return[norm(s&&s.enseigne),norm(s&&s.ville),norm(s&&s.adresse)].join('|')}
function stores(){try{return Array.isArray(window.state&&state.stores)?state.stores:[]}catch(e){return[]}}
function findStore(id){return stores().find(s=>String(s&&s.id)===String(id))||null}

function loadCreditOverrides(){try{const s=storage();return s?JSON.parse(s.getItem(CREDIT_OVERRIDES_KEY)||'{}')||{}:{}}catch(e){return{}}}
function saveCreditOverride(store,credit){
  if(!store)return false;
  const n=Number(credit)===2?2:1,map=loadCreditOverrides();
  store.visitCreditOverride=n;map[storeFingerprint(store)]=n;
  try{const s=storage();if(s)s.setItem(CREDIT_OVERRIDES_KEY,JSON.stringify(map))}catch(e){}
  return true
}
function restoreCreditOverrides(){
  const map=loadCreditOverrides();let changed=false;
  for(const store of stores()){
    const own=Number(store&&store.visitCreditOverride);if(own===1||own===2)continue;
    const saved=Number(map[storeFingerprint(store)]);if(saved===1||saved===2){store.visitCreditOverride=saved;changed=true}
  }
  return changed
}
function ensureCarrefourDefault(){
  if(!window.state)return false;if(!state.settings)state.settings={};
  if(!state.settings.visitCreditsByBrand||typeof state.settings.visitCreditsByBrand!=='object')state.settings.visitCreditsByBrand={};
  if(Number(state.settings.visitCreditsByBrand.carrefour)===1)return false;
  state.settings.visitCreditsByBrand.carrefour=1;return true
}
function configuredRules(){const configured=(window.state&&state.settings&&state.settings.visitCreditsByBrand)||{},map=Object.assign({},DEFAULT_CREDITS,configured);map.carrefour=1;return map}
function brandCredit(store){
  if(!store)return 0;const brand=norm(store.enseigne),map=configuredRules();
  if(Object.prototype.hasOwnProperty.call(map,brand))return Math.max(1,Number(map[brand])||1);
  for(const key of Object.keys(map)){const k=norm(key);if(!k)continue;const safe=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp('(^| )'+safe+'( |$)').test(brand))return Math.max(1,Number(map[key])||1)}
  return 1
}
function visitCredit(store){if(!store)return 0;const own=Number(store.visitCreditOverride);return own===1||own===2?own:brandCredit(store)}
function planningCapacityActive(){try{if(window.__storeRunnerPlanningGenerationActive)return true;const b=document.getElementById('generateRangeBtn');return!!(b&&b.disabled)}catch(e){return false}}
function planningCredit(store){
  const actual=visitCredit(store),brand=norm(store&&store.enseigne);
  if(actual<=1||!/(^| )boulanger( |$)/.test(brand)||!planningCapacityActive())return actual;
  const max=Math.max(1,Math.min(8,Number(window.state&&state.settings&&state.settings.maxVisitsPerDay)||4));return Math.max(actual,Math.max(1,max-1))
}
function routeCredits(route){return(route||[]).reduce((n,s)=>n+visitCredit(s),0)}
function planStores(plan,days){return(days||DAYS).reduce((n,d)=>n+((plan&&Array.isArray(plan[d]))?plan[d].length:0),0)}
function planCredits(plan,days){return(days||DAYS).reduce((n,d)=>n+routeCredits((plan&&plan[d])||[]),0)}
function storeKey(s){const b=norm(s&&s.enseigne),v=norm(s&&s.ville),a=norm(s&&s.adresse);return(b||v||a)?b+'|'+v+'|'+a:'id|'+String(s&&s.id||'')}
function archiveStats(archive,start,end){
  let count=0,visits=0;const unique=new Set(),from=String(start||'').slice(0,10),to=String(end||'').slice(0,10);
  for(const [key,snap] of Object.entries(archive||{})){const mon=parse((snap&&snap.weekMonday)||key);if(!mon||!snap||!snap.plan)continue;for(let i=0;i<DAYS.length;i++){const date=iso(addDays(mon,i));if((from&&date<from)||(to&&date>to))continue;for(const s of(snap.plan[DAYS[i]]||[])){count++;visits+=visitCredit(s);unique.add(storeKey(s))}}}
  return{stores:count,visits,uniqueStores:unique.size}
}
function normalizeCandidate(candidate){
  if(!candidate||!candidate.plan)return candidate;candidate.storeCount=planStores(candidate.plan);candidate.visitCredits=planCredits(candidate.plan);
  if(candidate.range){const stats=candidate.archive?archiveStats(candidate.archive,candidate.range.start,candidate.range.end):{stores:candidate.storeCount,visits:candidate.visitCredits,uniqueStores:candidate.range.uniqueStores||0};candidate.range.totalStores=stats.stores;candidate.range.totalVisits=stats.visits;candidate.range.uniqueStores=stats.uniqueStores||candidate.range.uniqueStores||0;candidate.range.visitCreditRules=configuredRules()}
  return candidate
}
function reconcileStoredRangeStats(){
  const db=storage();if(!db)return null;let archive={},range=null;try{archive=JSON.parse(db.getItem('chef_sector_plan_archive_v1')||'{}')||{};range=JSON.parse(db.getItem('chef_sector_range_v1')||'null')}catch(e){return null}
  if(!range||!range.start||!range.end)return null;const stats=archiveStats(archive,range.start,range.end);range.totalStores=stats.stores;range.totalVisits=stats.visits;range.uniqueStores=stats.uniqueStores;range.visitCreditRules=configuredRules();range.updatedAt=new Date().toISOString();
  try{db.setItem('chef_sector_range_v1',JSON.stringify(range));if(typeof db.flush==='function'){const p=db.flush();if(p&&typeof p.catch==='function')p.catch(()=>{})}}catch(e){return null}return range
}
function monthArchiveStats(year,month){
  const db=storage();let archive={};try{archive=db?JSON.parse(db.getItem('chef_sector_plan_archive_v1')||'{}')||{}:{}}catch(e){}let count=0,visits=0;const unique=new Set();
  for(const [key,snap] of Object.entries(archive)){const mon=parse((snap&&snap.weekMonday)||key);if(!mon||!snap||!snap.plan)continue;for(let i=0;i<DAYS.length;i++){const date=addDays(mon,i);if(date.getFullYear()!==year||date.getMonth()!==month)continue;for(const s of(snap.plan[DAYS[i]]||[])){count++;visits+=visitCredit(s);unique.add(storeKey(s))}}}return{stores:count,visits,uniqueStores:unique.size}
}
function patchCountingApi(){
  ensureCarrefourDefault();restoreCreditOverrides();window.storeVisitCredit=planningCredit;window.storeVisitCreditsForRoute=routeCredits;window.storeVisitCreditsForPlan=planCredits;window.storeVisitStoresForPlan=planStores;
  const V=window.StoreVisitCounting;if(V){V.credit=visitCredit;V.planningCredit=planningCredit;V.routeCredits=routeCredits;V.planCredits=planCredits;V.planStores=planStores;V.archiveStats=archiveStats;V.normalizeCandidate=normalizeCandidate;V.reconcileStoredRangeStats=reconcileStoredRangeStats;V.monthArchiveStats=monthArchiveStats;V.rules=configuredRules}return true
}

function ensureStoreRulesUi(){
  const dlg=document.getElementById('storeDlg'),note=document.getElementById('fNote');if(!dlg||!note)return false;if(document.getElementById('srStoreRulesV189'))return true;
  const box=document.createElement('section');box.id='srStoreRulesV189';box.style.cssText='margin:14px 0;padding:13px;border:1px solid #dfe5ef;border-radius:16px;background:#f8fafc';
  box.innerHTML='<div style="font-weight:850;margin-bottom:7px">Règles de ce magasin</div><label>Ce passage compte pour</label><select id="fVisitCreditOverride"><option value="1">1 visite</option><option value="2">2 visites</option></select><p class="tiny" style="margin:6px 0 12px">Ce choix est propre à ce magasin et remplace la règle de l’enseigne.</p><label>Familles suivies dans ce magasin</label><div class="checkgrid" id="srStoreProductsV189"><label class="checkitem"><input type="checkbox" data-fproduct value="Blanc"> Blanc</label><label class="checkitem"><input type="checkbox" data-fproduct value="Brun"> Brun</label><label class="checkitem"><input type="checkbox" data-fproduct value="Encastrable"> Encastrable</label><label class="checkitem"><input type="checkbox" data-fproduct value="Mobile"> Mobile</label><label class="checkitem"><input type="checkbox" data-fproduct value="TV / Audio"> TV / Audio</label></div><p class="tiny" style="margin:7px 0 0">Blanc et Brun sont indépendants : décoche simplement la famille que le magasin ne travaille pas.</p>';
  const label=note.previousElementSibling&&note.previousElementSibling.tagName==='LABEL'?note.previousElementSibling:note;dlg.insertBefore(box,label);return true
}
function fillStoreRules(id){ensureStoreRulesUi();const store=id?findStore(id):null,select=document.getElementById('fVisitCreditOverride');if(select)select.value=String(store?visitCredit(store):1)}
function patchStoreFunctions(){
  if(typeof window.openStore==='function'&&!window.openStore.__v189StoreRules){const original=window.openStore;const wrapped=function(id){editingStoreId=id==null?'':String(id);ensureStoreRulesUi();restoreCreditOverrides();const out=original.apply(this,arguments);fillStoreRules(id);return out};wrapped.__v189StoreRules=true;wrapped.__original=original;window.openStore=wrapped}
  if(typeof window.saveStore==='function'&&!window.saveStore.__v189StoreRules){const original=window.saveStore;const wrapped=function(){ensureStoreRulesUi();const select=document.getElementById('fVisitCreditOverride'),credit=select&&Number(select.value)===2?2:1,before=new Set(stores().map(s=>String(s.id))),targetId=editingStoreId;const out=original.apply(this,arguments);let store=targetId?findStore(targetId):stores().find(s=>!before.has(String(s.id)))||null;if(store){saveCreditOverride(store,credit);try{if(typeof window.save==='function')window.save()}catch(e){}try{if(typeof window.renderStores==='function')window.renderStores()}catch(e){}refreshCountingUi()}editingStoreId='';return out};wrapped.__v189StoreRules=true;wrapped.__original=original;window.saveStore=wrapped}
  return true
}
function productsLabel(store){return(store&&Array.isArray(store.products)?store.products:[]).filter(x=>x&&x!=='À confirmer').join(' + ')}
function refreshCountingUi(){
  if(!window.state)return false;patchCountingApi();const plan=state.plan||{},physical=planStores(plan),visits=planCredits(plan),summary=document.getElementById('summary');if(summary){const spans=summary.querySelectorAll('span');if(spans[0])spans[0].textContent=physical+' magasins planifiés';if(spans[1])spans[1].textContent=visits+' visites comptabilisées'}
  const card=document.querySelector('#premiumHomeV2 .phGrid .phCard:first-child');if(card){const value=card.querySelector('.phValue'),sub=card.querySelector('.phSub');if(value)value.textContent=visits+' visites';if(sub)sub.textContent=physical+' magasins planifiés · objectif '+Number((state.settings&&state.settings.target)||20)+' magasins'}
  const sheet=document.getElementById('storeQuickSheet'),start=document.getElementById('srQuickStart');if(sheet&&start&&start.dataset&&start.dataset.srStart){const store=findStore(start.dataset.srStart),address=document.getElementById('sqAddress');if(store&&address){let badge=document.getElementById('sqVisitCredit');if(!badge){badge=document.createElement('div');badge.id='sqVisitCredit';badge.className='tiny';badge.style.marginTop='6px';address.insertAdjacentElement('afterend',badge)}const fam=productsLabel(store),c=visitCredit(store),duration=(()=>{try{return typeof window.storeVisitDuration==='function'?window.storeVisitDuration(store,state):Math.max(15,Number(state.settings&&state.settings.visitMinutes)||60)}catch(e){return Math.max(15,Number(state.settings&&state.settings.visitMinutes)||60)}})();badge.textContent='Ce passage compte pour '+c+' visite'+(c>1?'s':'')+' · '+duration+' min prévues'+(fam?' · Familles : '+fam:'')}}return true
}

function baseObjSafe(){try{return typeof window.baseObj==='function'?window.baseObj():null}catch(e){return null}}
function distance(a,b){try{const n=Number(window.hav(a,b));return Number.isFinite(n)?Math.max(0,n):Infinity}catch(e){return Infinity}}
function homeDistance(store){const b=baseObjSafe();return b?distance(store,b):Infinity}
function overnightThreshold(){const n=Number(window.state&&state.profile&&state.profile.overnightMinSaving);return Number.isFinite(n)&&n>=0?n:80}
function selectedWeekMonday(weekDate){const d=parse(weekDate)||parse(window.state&&state.settings&&state.settings.weekDate)||new Date();return monday(d)}
function futureOvernightAnalysis(plan,weekDate){
  const profile=(window.state&&state.profile)||{},mode=profile.overnightMode||'auto',threshold=overnightThreshold();if(mode==='never')return{mode,threshold,candidate:null,reason:'disabled',best:null,bestRemote:null};
  const days=(state.settings&&Array.isArray(state.settings.days)&&state.settings.days.length?state.settings.days:DAYS.slice(0,5)).filter(d=>DAYS.includes(d)),source=plan||state.plan||{},mon=selectedWeekMonday(weekDate),today=iso(new Date());let best=null,bestRemote=null,bestUseful=null;
  for(let i=0;i<days.length-1;i++){const fromDay=days[i],toDay=days[i+1],fromDate=iso(addDays(mon,DAYS.indexOf(fromDay))),toDate=iso(addDays(mon,DAYS.indexOf(toDay)));if(fromDate<today)continue;if(Math.round((parse(toDate)-parse(fromDate))/86400000)!==1)continue;const a=source[fromDay]||[],b=source[toDay]||[];if(!a.length||!b.length)continue;const last=a[a.length-1],first=b[0],home1=homeDistance(last),home2=homeDistance(first),direct=distance(last,first),saving=home1+home2-direct;if(!Number.isFinite(saving))continue;const row={night:'Nuit '+fromDay+' → '+toDay,fromDay,toDay,fromDate,toDate,last,first,saving,fromHome:home1,toHome:home2,remoteKm:Math.min(home1,home2)};if(!best||row.saving>best.saving)best=row;if(row.remoteKm>=REMOTE_MIN_KM&&(!bestRemote||row.saving>bestRemote.saving))bestRemote=row;if(row.remoteKm>=REMOTE_MIN_KM&&row.saving>=MIN_USEFUL_OVERNIGHT_KM&&(!bestUseful||row.saving>bestUseful.saving))bestUseful=row}
  if(!best)return{mode,threshold,candidate:null,reason:'no-future-pair',best:null,bestRemote:null};if(mode==='mandatory')return bestUseful?{mode,threshold,candidate:bestUseful,reason:'candidate',best,bestRemote}:{mode,threshold,candidate:null,reason:'mandatory-no-useful',best,bestRemote};if(!bestRemote)return{mode,threshold,candidate:null,reason:'too-close',best,bestRemote:null};if(bestRemote.saving<threshold)return{mode,threshold,candidate:null,reason:'threshold',best,bestRemote};return{mode,threshold,candidate:bestRemote,reason:'candidate',best,bestRemote}
}
function hotelUrl(store){const q='hôtel près de '+String(store&&store.adresse||'')+' '+String(store&&store.ville||'');return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q)}
function hotelReservations(){
  if(!window.state)return{};
  if(!state.hotelReservations||typeof state.hotelReservations!=='object'||Array.isArray(state.hotelReservations))state.hotelReservations={};
  return state.hotelReservations
}
function hotelReservationFor(date){return hotelReservations()[String(date||'')]||null}
function currentWeekHotelReservations(){
  const mon=selectedWeekMonday(),end=addDays(mon,6);
  return Object.values(hotelReservations()).filter(r=>r&&parse(r.fromDate)>=mon&&parse(r.fromDate)<=end).sort((a,b)=>String(a.fromDate).localeCompare(String(b.fromDate)))
}
function hotelReservationSummaryHtml(){
  const rows=currentWeekHotelReservations();if(!rows.length)return'';
  return '<div class="srHotelSavedListV212">'+rows.map(r=>'<div class="srHotelSavedV212">✅ <b>Hôtel réservé · '+esc(dateLabel(r.fromDate))+'</b><div>'+esc(r.hotelName||'Hôtel')+(r.reference?' · Réf. '+esc(r.reference):'')+'</div></div>').join('')+'</div>'
}
function hotelReservationEditorHtml(o){
  const saved=hotelReservationFor(o&&o.fromDate)||{},name=esc(saved.hotelName||''),reference=esc(saved.reference||''),address=esc(saved.address||'');
  const located=!!(window.StoreRunnerDayOrigin&&window.StoreRunnerDayOrigin.located(saved));
  return '<div class="srHotelReservationV212" data-night="'+esc(o.fromDate)+'"><b>'+(saved.hotelName?'✅ Hôtel réservé':'🛏 Enregistrer mon hôtel')+'</b>'+
    (saved.hotelName?'<div class="srHotelSavedLineV212">'+esc(saved.hotelName)+(saved.reference?' · Réf. '+reference:'')+'</div>':'')+
    '<div class="srHotelReservationGridV212"><label>Nom de l’hôtel<input id="srHotelNameV212" type="text" value="'+name+'" placeholder="Ex. Hôtel du Parc"></label>'+
    '<label>N° / référence de réservation<input id="srHotelRefV212" type="text" value="'+reference+'" placeholder="Ex. ABC123"></label>'+
    '<label>Adresse ou ville de l’hôtel<input id="srHotelAddressV212" type="text" value="'+address+'" placeholder="Ex. 12 rue de la Gare, Chambéry"></label></div>'+
    '<p class="srHotelOriginHintV212">'+(located?'Le lendemain démarrera depuis cet hôtel.':'Sans adresse, Store Runner demandera d’où vous partez le lendemain.')+'</p>'+
    '<div class="srHotelReservationActionsV212"><button type="button" class="secondary" onclick="storeRunnerSaveHotelReservation(\''+esc(o.fromDate)+'\')">Enregistrer la réservation</button>'+
    (saved.hotelName?'<button type="button" class="linkBtn" onclick="storeRunnerClearHotelReservation(\''+esc(o.fromDate)+'\')">Effacer</button>':'')+'</div></div>'
}
async function saveHotelReservation(date){
  const name=document.getElementById('srHotelNameV212'),ref=document.getElementById('srHotelRefV212'),addr=document.getElementById('srHotelAddressV212');
  const hotelName=String(name&&name.value||'').trim(),reference=String(ref&&ref.value||'').trim(),address=String(addr&&addr.value||'').trim();
  if(!hotelName){if(typeof window.showError==='function')window.showError('Indique le nom de l’hôtel réservé.');return false}
  const candidate=futureOvernightAnalysis().candidate,key=String(date||''),previous=hotelReservationFor(key)||{};
  /* L'adresse sert à situer l'hôtel pour le trajet du lendemain. On réutilise le
     géocodeur du profil ; aucune coordonnée n'est jamais montrée à l'utilisateur, et une
     recherche infructueuse n'empêche pas d'enregistrer la réservation. */
  let lat=null,lon=null,resolved='';
  if(address){
    if(address===String(previous.address||'')&&window.StoreRunnerDayOrigin&&window.StoreRunnerDayOrigin.located(previous)){
      lat=previous.lat;lon=previous.lon;resolved=previous.resolvedAddress||'';
    }else{
      try{
        const geo=window.StoreRunnerGeocode;
        if(geo&&typeof geo.forward==='function'){
          const hit=await geo.forward(address);
          lat=Number(hit.lat);lon=Number(hit.lon);resolved=String(hit.address||'');
        }
      }catch(e){
        if(typeof window.storeRunnerToast==='function')window.storeRunnerToast('Adresse non localisée : le départ du lendemain sera demandé.');
      }
    }
  }
  hotelReservations()[key]={fromDate:key,address,resolvedAddress:resolved,lat,lon,toDate:candidate&&candidate.fromDate===key?candidate.toDate:(previous.toDate||iso(addDays(parse(key)||new Date(),1))),hotelName,reference,zone:candidate&&candidate.fromDate===key?String(candidate.last&&candidate.last.ville||''):(previous.zone||''),updatedAt:new Date().toISOString()};
  try{if(window.StoreRunnerDayOrigin)window.StoreRunnerDayOrigin.pruneOrigins(window.state)}catch(e){}
  try{if(typeof window.save==='function')window.save()}catch(e){if(typeof window.showError==='function')window.showError('Réservation non enregistrée : '+(e.message||e));return false}
  renderOvernightV189();document.dispatchEvent(new CustomEvent('store-runner:hotel-reservation-updated',{detail:{date:key}}));return true
}
function clearHotelReservation(date){
  const key=String(date||'');if(!hotelReservationFor(key))return false;delete hotelReservations()[key];
  try{if(window.StoreRunnerDayOrigin)window.StoreRunnerDayOrigin.pruneOrigins(window.state)}catch(e){}
  try{if(typeof window.save==='function')window.save()}catch(e){return false}
  renderOvernightV189();document.dispatchEvent(new CustomEvent('store-runner:hotel-reservation-updated',{detail:{date:key}}));return true
}
function ensureOvernightStyle(){if(document.getElementById('srOvernightV189Style'))return;const style=document.createElement('style');style.id='srOvernightV189Style';style.textContent='.srOvernightDayV189{border-color:#f2c94c!important;box-shadow:0 0 0 3px rgba(242,201,76,.12)!important}.srOvernightStarV189{display:inline-flex;align-items:center;gap:4px;margin-left:7px;padding:4px 7px;border-radius:999px;background:#fff4c2;color:#7a5600;font-size:10px;font-weight:900;white-space:nowrap}.srHotelZoneV189{margin-top:7px;padding:8px 10px;border-radius:12px;background:#fffdf5;border:1px solid #f5e2a7;color:#6b5311;font-size:11px}.srHotelReservationV212,.srHotelSavedV212{margin-top:10px;padding:10px;border:1px solid #e2e8f0;border-radius:13px;background:#fff}.srHotelReservationGridV212{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px}.srHotelReservationGridV212 label{font-size:10.5px;font-weight:750;color:#475467}.srHotelReservationGridV212 input{width:100%;box-sizing:border-box;margin-top:4px}.srHotelReservationActionsV212{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px}.srHotelSavedLineV212{margin-top:4px;color:#344054}.srHotelSavedListV212{margin-bottom:10px}@media(max-width:520px){.srHotelReservationGridV212{grid-template-columns:1fr}}';document.head.appendChild(style)}
function decorateOvernightDay(candidate){
  ensureOvernightStyle();document.querySelectorAll('.srOvernightStarV189').forEach(e=>e.remove());document.querySelectorAll('.srOvernightDayV189').forEach(e=>e.classList.remove('srOvernightDayV189'));if(!candidate)return false;
  for(const card of document.querySelectorAll('#week .day')){const title=card.querySelector('.dayhead b');if(!title||norm(title.textContent)!==norm(candidate.fromDay))continue;card.classList.add('srOvernightDayV189');const head=card.querySelector('.dayhead>div')||card.querySelector('.dayhead');if(head){const badge=document.createElement('span');badge.className='srOvernightStarV189';badge.textContent='★ Nuit sur place';head.appendChild(badge)}return true}return false
}
function renderOvernightV189(){
  const box=document.getElementById('overnightBox');if(!box||!window.state)return false;const a=futureOvernightAnalysis(),o=a.candidate;decorateOvernightDay(o);
  const saved=hotelReservationSummaryHtml();
  if(a.reason==='disabled'){box.innerHTML=saved+'<div class="notice">🌙 Découché désactivé dans Secteur.</div>';return true}
  if(!o){box.innerHTML=saved+'<div class="notice">🌙 Aucun découché futur utile retenu avec le planning actuel. Les nuits déjà passées sont ignorées.</div>';return true}
  const zone=String(o.last&&o.last.ville||'la fin de tournée'),next=String(o.first&&o.first.ville||'la tournée suivante');
  box.innerHTML='<div class="overnight"><b>★ Nuit sur place · '+esc(dateLabel(o.fromDate))+' → '+esc(dateLabel(o.toDate))+'</b><div class="meta">Fin près de '+esc((o.last.enseigne||'Magasin')+' '+zone)+' · reprise vers '+esc(next)+' · économie estimée ~'+Math.max(0,Math.round(o.saving))+' km.</div><div class="srHotelZoneV189">🏨 <b>Zone hôtel conseillée : '+esc(zone)+'</b>, idéalement sur l’axe vers '+esc(next)+'.</div><a target="_blank" rel="noopener" href="'+hotelUrl(o.last)+'">Voir les hôtels à proximité ↗</a>'+hotelReservationEditorHtml(o)+'</div>';return true
}
function patchOvernight(){
  ensureOvernightStyle();const candidate=function(){return futureOvernightAnalysis().candidate};candidate.__v182Wrapped=true;candidate.__v189FutureOnly=true;window.overnightCandidate=candidate;const render=function(){return renderOvernightV189()};render.__v182Wrapped=true;render.__v189FutureOnly=true;window.renderOvernight=render;if(window.StoreRunnerOvernightV182)window.StoreRunnerOvernightV182.analyze=futureOvernightAnalysis;renderOvernightV189();return true
}

function installAutoApply(){
  const R=window.ChefReliability;if(!R||typeof R.capture!=='function')return false;if(R.propose&&R.propose.__chefAutoApply)return true;
  const fn=async function(candidate){try{normalizeCandidate(candidate);const bundle=R.capture();bundle.state=JSON.parse(JSON.stringify(window.state));bundle.state.plan=candidate.plan||{};if(candidate.weekDate)bundle.state.settings.weekDate=candidate.weekDate;if(candidate.archive)bundle.archive=candidate.archive;if(candidate.range)bundle.range=candidate.range;try{R.checkpoint('Avant remplacement automatique du planning')}catch(e){}R.persist(bundle);window.state=bundle.state;restoreCreditOverrides();ensureCarrefourDefault();if(typeof window.initControls==='function')window.initControls();if(typeof window.renderAll==='function')window.renderAll();refreshCountingUi();renderOvernightV189();return true}catch(e){if(typeof window.showError==='function')window.showError('Génération impossible : '+(e.message||String(e)));return false}};
  fn.__chefAutoApply=true;R.propose=fn;return true
}
function repair(){
  if(!window.state)return false;const changed=ensureCarrefourDefault()|restoreCreditOverrides();patchCountingApi();ensureStoreRulesUi();patchStoreFunctions();patchOvernight();installAutoApply();refreshCountingUi();if(changed){try{if(typeof window.save==='function')window.save()}catch(e){}}return true
}
function boot(){repair()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('store-runner:reliability-propose-ready',()=>{installAutoApply();repair()});
document.addEventListener('store-runner:data-restored',()=>{repair();refreshCountingUi();renderOvernightV189()});
document.addEventListener('store-runner:planning-updated',()=>{repair();refreshCountingUi();renderOvernightV189()});
document.addEventListener('store-runner:home-rendered',()=>{restoreCreditOverrides();refreshCountingUi();decorateOvernightDay(futureOvernightAnalysis().candidate)});
window.storeRunnerSaveHotelReservation=saveHotelReservation;
window.storeRunnerClearHotelReservation=clearHotelReservation;
window.StoreRunnerStoreControlsV189={visitCredit,planningCredit,saveCreditOverride,restoreCreditOverrides,futureOvernightAnalysis,renderOvernight:renderOvernightV189,saveHotelReservation,clearHotelReservation,hotelReservationFor,repair};
})();
