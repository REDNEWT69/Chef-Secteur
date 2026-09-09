(function(){
'use strict';

var GOOGLE_TOKEN_KEY='chef_secteur_google_token_v2';
var GOOGLE_EXPIRY_KEY='chef_google_token_expiry_v1';
var GOOGLE_CONFIG_KEY='chef_secteur_google_calendar_v2';
var LEGACY_GOOGLE_TOKEN_KEYS=['chef_google_token_persist_v1','chef_google_token_persist_expiry_v1'];
var bootAttempts=0;

function installAutoApply(){
  var R=window.ChefReliability;if(!R||typeof R.capture!=='function')return false;
  if(R.propose&&R.propose.__chefAutoApply)return true;
  var fn=async function(candidate){
    try{
      var bundle=R.capture();bundle.state=JSON.parse(JSON.stringify(window.state));bundle.state.plan=candidate.plan||{};
      if(candidate.weekDate)bundle.state.settings.weekDate=candidate.weekDate;
      if(candidate.archive)bundle.archive=candidate.archive;
      if(candidate.range)bundle.range=candidate.range;
      try{R.checkpoint('Avant remplacement automatique du planning')}catch(e){}
      R.persist(bundle);window.state=bundle.state;
      if(typeof window.initControls==='function')window.initControls();
      if(typeof window.renderAll==='function')window.renderAll();
      return true;
    }catch(e){
      if(typeof window.showError==='function')window.showError('Génération impossible : '+(e.message||String(e)));
      return false;
    }
  };
  fn.__chefAutoApply=true;R.propose=fn;return true;
}

function sget(storage,key){try{return storage.getItem(key)||''}catch(e){return''}}
function googleTokenValid(token,expiry){return !!token&&Number(expiry)>Date.now()+15000}
function purgeLegacyGoogleTokens(){
  try{LEGACY_GOOGLE_TOKEN_KEYS.forEach(function(key){localStorage.removeItem(key)})}catch(e){}
}
function restoreGoogleToken(){
  var token=sget(sessionStorage,GOOGLE_TOKEN_KEY),expiry=sget(sessionStorage,GOOGLE_EXPIRY_KEY);
  return googleTokenValid(token,expiry);
}
function hasGoogleConfig(){try{var c=JSON.parse(localStorage.getItem(GOOGLE_CONFIG_KEY)||'{}');return !!(c&&c.clientId)}catch(e){return false}}
function waitGoogleToken(ms){var start=Date.now();return new Promise(function(resolve){(function tick(){if(restoreGoogleToken())return resolve(true);if(Date.now()-start>=ms)return resolve(false);setTimeout(tick,120)})()})}
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
    purgeLegacyGoogleTokens();
    restoreGoogleToken();
    var result;
    try{result=await base.apply(this,arguments)}catch(e){result={ok:false,reason:e&&e.message||'error'}}
    if(result&&result.ok)return result;
    if(silent){
      var reason=result&&result.reason||'error';
      if((reason==='disconnected'||reason==='expired')&&await silentGoogleReconnect()){
        try{result=await base.call(this,true)}catch(e2){result={ok:false,reason:e2&&e2.message||'error'}}
        if(result&&result.ok)return result;
      }
      googleFallbackStatus(reason);
      return {ok:true,cached:true,reason:reason,lastSync:window.state&&state.calendarLastSync||null};
    }
    return result||{ok:false,reason:'error'};
  };
  window.__chefGooglePlanningFix=true;return true;
}

function stabilize(){
  installAutoApply();
  restoreGoogleToken();
  installGooglePlanningFix();
}
function boot(){
  if(!window.state){
    if(bootAttempts++<40)setTimeout(boot,50);
    return;
  }
  bootAttempts=0;
  purgeLegacyGoogleTokens();
  stabilize();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(stabilize,40)});
window.addEventListener('focus',function(){setTimeout(stabilize,40)});
})();
