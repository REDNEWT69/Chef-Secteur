(function(){
'use strict';

var HOME={name:'Francheville',address:'Francheville, 69340',lat:45.737222,lon:4.764167};
var SESSION_KEY='chef_departure_override_v1';
var runtimeBase=null;

var GOOGLE_TOKEN_KEY='chef_secteur_google_token_v2';
var GOOGLE_EXPIRY_KEY='chef_google_token_expiry_v1';
var GOOGLE_PERSIST_TOKEN='chef_google_token_persist_v1';
var GOOGLE_PERSIST_EXPIRY='chef_google_token_persist_expiry_v1';
var GOOGLE_CONFIG_KEY='chef_secteur_google_calendar_v2';

function valid(n){return isFinite(Number(n))&&Math.abs(Number(n))>1}
function loadRuntime(){
  try{
    var v=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(v&&valid(v.lat)&&valid(v.lon))runtimeBase={name:v.name||'Ma position actuelle',address:v.address||'Départ GPS temporaire',lat:Number(v.lat),lon:Number(v.lon)};
  }catch(e){runtimeBase=null}
}
function saveRuntime(v){runtimeBase=v||null;try{if(v)sessionStorage.setItem(SESSION_KEY,JSON.stringify(v));else sessionStorage.removeItem(SESSION_KEY)}catch(e){}}
function ensureHome(persist){
  try{
    if(!window.state||!state.profile)return false;
    if(!valid(state.profile.baseLat)||!valid(state.profile.baseLon)||!state.profile.baseName){
      state.profile.baseName=HOME.name;state.profile.baseAddress=HOME.address;state.profile.baseLat=HOME.lat;state.profile.baseLon=HOME.lon;
      if(persist&&typeof save==='function')save();
    }
    return true;
  }catch(e){return false}
}
function activeBase(){return runtimeBase||HOME}
function installBaseOverrides(){
  window.baseObj=function(){var b=activeBase();return{id:'BASE',enseigne:'Départ',ville:b.name,adresse:b.address,lat:b.lat,lon:b.lon}};
  window.havBase=function(store){return typeof hav==='function'?hav(baseObj(),store):0};
}
function refreshDepartureUi(){
  var b=activeBase();
  var h=document.getElementById('headerDeparture');if(h)h.textContent=b.name;
  var p=document.getElementById('planningDeparture');if(p)p.textContent=b.name+(b.address?' · '+b.address:'');
  var s=document.getElementById('smartDepartureStatus');if(s)s.textContent=runtimeBase?'Départ temporaire : ta position actuelle.':'Base par défaut : Francheville.';
  var r=document.getElementById('resetSmartDeparture');if(r)r.style.display=runtimeBase?'inline-flex':'none';
}
function useCurrentDeparture(){
  var status=document.getElementById('smartDepartureStatus');
  if(!navigator.geolocation){if(status)status.textContent='Localisation indisponible sur cet appareil.';return}
  if(status)status.textContent='Localisation en cours…';
  navigator.geolocation.getCurrentPosition(function(pos){
    saveRuntime({name:'Ma position actuelle',address:'Départ GPS temporaire',lat:pos.coords.latitude,lon:pos.coords.longitude});
    installBaseOverrides();refreshDepartureUi();
    if(status)status.textContent='Position actuelle utilisée pour cette tournée. Francheville reste ta base par défaut.';
  },function(err){
    if(status)status.textContent=err&&err.code===1?'Autorise la localisation pour utiliser ta position actuelle.':'Impossible de récupérer ta position. Francheville reste utilisée.';
  },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function resetDeparture(){saveRuntime(null);ensureHome(true);installBaseOverrides();refreshDepartureUi()}
function installDepartureUi(){
  var host=document.querySelector('#planningSettings .settingsInner')||document.getElementById('planningSettings');
  if(!host||document.getElementById('smartDepartureBox'))return false;
  var box=document.createElement('div');box.id='smartDepartureBox';box.className='notice';box.style.margin='0 0 14px';
  box.innerHTML='<b>Départ de la tournée</b><div id="smartDepartureStatus" class="tiny" style="margin-top:5px"></div><div class="row" style="margin-top:10px"><button id="useCurrentDeparture" type="button" class="secondary">📍 Utiliser ma position maintenant</button><button id="resetSmartDeparture" type="button" class="secondary">↩︎ Revenir à Francheville</button></div>';
  host.insertBefore(box,host.firstChild);
  document.getElementById('useCurrentDeparture').onclick=useCurrentDeparture;
  document.getElementById('resetSmartDeparture').onclick=resetDeparture;
  refreshDepartureUi();return true;
}
function hideTechnicalBaseFields(){
  ['pBaseLat','pBaseLon'].forEach(function(id){var el=document.getElementById(id);if(el){var wrap=el.closest('div')||el.closest('label')||el.parentElement;if(wrap)wrap.style.display='none'}});
  var note=document.getElementById('fixedBaseNote');if(note)note.textContent='Base par défaut : Francheville. Pour une tournée ailleurs, utilise « Ma position maintenant » dans Planning.';
}
function installProfileGuard(){
  if(typeof window.saveProfile==='function'&&!window.saveProfile.__smartBase){
    var original=window.saveProfile;
    window.saveProfile=function(){
      var lat=document.getElementById('pBaseLat'),lon=document.getElementById('pBaseLon');
      if(lat)lat.value=String(HOME.lat);if(lon)lon.value=String(HOME.lon);
      var name=document.getElementById('pBaseName'),address=document.getElementById('pBaseAddress');
      if(name&&!name.value.trim())name.value=HOME.name;if(address&&!address.value.trim())address.value=HOME.address;
      return original.apply(this,arguments);
    };
    window.saveProfile.__smartBase=true;
  }
}
function installAutoApply(){
  var R=window.ChefReliability;if(!R||typeof R.capture!=='function')return false;
  if(R.propose&&R.propose.__chefAutoApply)return true;
  var fn=async function(candidate){
    try{
      ensureHome(false);installBaseOverrides();
      var bundle=R.capture();bundle.state=JSON.parse(JSON.stringify(window.state));bundle.state.plan=candidate.plan||{};
      if(candidate.weekDate)bundle.state.settings.weekDate=candidate.weekDate;if(candidate.archive)bundle.archive=candidate.archive;if(candidate.range)bundle.range=candidate.range;
      try{R.checkpoint('Avant remplacement automatique du planning')}catch(e){}
      R.persist(bundle);window.state=bundle.state;
      if(typeof window.initControls==='function')window.initControls();if(typeof window.renderAll==='function')window.renderAll();
      refreshDepartureUi();return true;
    }catch(e){if(typeof window.showError==='function')window.showError('Génération impossible : '+(e.message||String(e)));return false}
  };
  fn.__chefAutoApply=true;R.propose=fn;return true;
}

function sget(storage,key){try{return storage.getItem(key)||''}catch(e){return''}}
function sset(storage,key,value){try{storage.setItem(key,String(value));return true}catch(e){return false}}
function sremove(storage,key){try{storage.removeItem(key)}catch(e){}}
function googleTokenValid(token,expiry){return !!token&&Number(expiry)>Date.now()+15000}
function restoreGoogleToken(){
  var token=sget(sessionStorage,GOOGLE_TOKEN_KEY),expiry=sget(sessionStorage,GOOGLE_EXPIRY_KEY);
  if(googleTokenValid(token,expiry))return true;
  token=sget(localStorage,GOOGLE_PERSIST_TOKEN);expiry=sget(localStorage,GOOGLE_PERSIST_EXPIRY);
  if(googleTokenValid(token,expiry)){sset(sessionStorage,GOOGLE_TOKEN_KEY,token);sset(sessionStorage,GOOGLE_EXPIRY_KEY,expiry);return true}
  if(expiry&&Number(expiry)<=Date.now()){sremove(localStorage,GOOGLE_PERSIST_TOKEN);sremove(localStorage,GOOGLE_PERSIST_EXPIRY)}
  return false;
}
function mirrorGoogleToken(){
  var token=sget(sessionStorage,GOOGLE_TOKEN_KEY),expiry=sget(sessionStorage,GOOGLE_EXPIRY_KEY);
  if(!googleTokenValid(token,expiry))return false;
  sset(localStorage,GOOGLE_PERSIST_TOKEN,token);sset(localStorage,GOOGLE_PERSIST_EXPIRY,expiry);return true;
}
function hasGoogleConfig(){try{var c=JSON.parse(localStorage.getItem(GOOGLE_CONFIG_KEY)||'{}');return !!(c&&c.clientId)}catch(e){return false}}
function waitGoogleToken(ms){var start=Date.now();return new Promise(function(resolve){(function tick(){if(restoreGoogleToken()||mirrorGoogleToken())return resolve(true);if(Date.now()-start>=ms)return resolve(false);setTimeout(tick,120)})()})}
function googleFallbackStatus(reason){
  var status=document.getElementById('googleCalendarStatus'),badge=document.getElementById('googleCalendarBadge');
  var last=window.state&&state.calendarLastSync?new Date(state.calendarLastSync).toLocaleString('fr-FR'):'';
  if(status)status.textContent=last?'Agenda temporairement non vérifié · dernière synchro conservée : '+last:'Agenda temporairement non vérifié · génération du planning non bloquée.';
  if(badge&&last){badge.textContent='Connecté';badge.classList.add('on')}
  window.chefGoogleStatus={phase:'cached',connected:!!last,canRetry:true,lastSync:window.state&&state.calendarLastSync||null,message:reason||''};
}
async function silentGoogleReconnect(){
  if(restoreGoogleToken())return true;
  if(!hasGoogleConfig()||typeof window.connectGoogleCalendar!=='function')return false;
  try{await window.connectGoogleCalendar();return await waitGoogleToken(4500)}catch(e){return false}
}
function installGooglePlanningFix(){
  if(window.__chefGooglePlanningFix||typeof window.syncGoogleCalendar!=='function')return false;
  var base=window.syncGoogleCalendar;
  window.syncGoogleCalendar=async function(silent){
    restoreGoogleToken();
    var result;
    try{result=await base.apply(this,arguments)}catch(e){result={ok:false,reason:e&&e.message||'error'}}
    mirrorGoogleToken();
    if(result&&result.ok)return result;
    if(silent){
      var reason=result&&result.reason||'error';
      if((reason==='disconnected'||reason==='expired')&&await silentGoogleReconnect()){
        try{result=await base.call(this,true)}catch(e2){result={ok:false,reason:e2&&e2.message||'error'}}
        mirrorGoogleToken();
        if(result&&result.ok)return result;
      }
      googleFallbackStatus(reason);
      return {ok:true,cached:true,reason:reason,lastSync:window.state&&state.calendarLastSync||null};
    }
    return result||{ok:false,reason:'error'};
  };
  window.__chefGooglePlanningFix=true;return true;
}

function boot(){
  if(!window.state||!state.profile){setTimeout(boot,50);return}
  loadRuntime();ensureHome(true);installBaseOverrides();installProfileGuard();installAutoApply();installDepartureUi();hideTechnicalBaseFields();refreshDepartureUi();restoreGoogleToken();mirrorGoogleToken();installGooglePlanningFix();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
setInterval(function(){ensureHome(false);installBaseOverrides();installProfileGuard();installAutoApply();installDepartureUi();hideTechnicalBaseFields();refreshDepartureUi();restoreGoogleToken();mirrorGoogleToken();installGooglePlanningFix()},1200);
})();
