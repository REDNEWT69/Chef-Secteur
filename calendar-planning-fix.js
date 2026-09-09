(function(){
'use strict';

var TOKEN_KEY='chef_secteur_google_token_v2';
var EXPIRY_KEY='chef_google_token_expiry_v1';
var LEGACY_KEYS=['chef_google_token_persist_v1','chef_google_token_persist_expiry_v1'];
var CONFIG_KEY='chef_secteur_google_calendar_v2';
var wrapping=false;

function safeGet(storage,key){try{return storage.getItem(key)||''}catch(e){return''}}
function tokenValid(token,expiry){return !!token&&Number(expiry)>Date.now()+15000}
function purgeLegacy(){try{LEGACY_KEYS.forEach(function(key){localStorage.removeItem(key)})}catch(e){}}
function sessionTokenValid(){return tokenValid(safeGet(sessionStorage,TOKEN_KEY),safeGet(sessionStorage,EXPIRY_KEY))}

function hasGoogleConfig(){
  try{
    var cfg=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}');
    return !!(cfg&&cfg.clientId&&String(cfg.clientId).indexOf('.apps.googleusercontent.com')>0);
  }catch(e){return false}
}

function waitForToken(timeoutMs){
  var start=Date.now();
  return new Promise(function(resolve){
    (function tick(){
      if(sessionTokenValid())return resolve(true);
      if(Date.now()-start>=timeoutMs)return resolve(false);
      setTimeout(tick,120);
    })();
  });
}

function setNonBlockingStatus(reason){
  var status=document.getElementById('googleCalendarStatus');
  var badge=document.getElementById('googleCalendarBadge');
  var last=window.state&&state.calendarLastSync?new Date(state.calendarLastSync).toLocaleString('fr-FR'):'';
  if(status)status.textContent='Agenda Google temporairement non vérifié. Le planning continue'+(last?' avec la dernière synchro du '+last:' sans bloquer la génération')+'.';
  if(badge&&last){badge.textContent='Connecté';badge.classList.add('on')}
  window.chefGoogleStatus={phase:'cached',connected:!!last,canRetry:true,lastSync:window.state&&state.calendarLastSync||null,message:reason||''};
}

async function trySilentReconnect(){
  if(sessionTokenValid())return true;
  if(!hasGoogleConfig()||typeof window.connectGoogleCalendar!=='function')return false;
  try{
    await window.connectGoogleCalendar();
    return await waitForToken(4500);
  }catch(e){return false}
}

function wrapSync(){
  if(wrapping||window.__chefCalendarPlanningFix||typeof window.syncGoogleCalendar!=='function')return false;
  wrapping=true;
  var base=window.syncGoogleCalendar;
  window.syncGoogleCalendar=async function(silent){
    purgeLegacy();
    var result;
    try{result=await base.apply(this,arguments)}catch(e){result={ok:false,reason:e&&e.message||'error'}}
    if(result&&result.ok)return result;

    if(silent){
      var reason=result&&result.reason||'error';
      if((reason==='disconnected'||reason==='expired')&&await trySilentReconnect()){
        try{result=await base.call(this,true)}catch(e2){result={ok:false,reason:e2&&e2.message||'error'}}
        if(result&&result.ok)return result;
      }
      setNonBlockingStatus(reason);
      return {ok:true,cached:true,reason:reason,lastSync:window.state&&state.calendarLastSync||null};
    }
    return result||{ok:false,reason:'error'};
  };
  window.__chefCalendarPlanningFix=true;
  wrapping=false;
  return true;
}

function boot(){
  purgeLegacy();
  if(wrapSync())return;
  [100,250,600,1200].forEach(function(delay){setTimeout(wrapSync,delay)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
document.addEventListener('visibilitychange',function(){if(!document.hidden)boot()});
})();
