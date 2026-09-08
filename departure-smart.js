(function(){
'use strict';

var HOME={name:'Francheville',address:'Francheville, 69340',lat:45.737222,lon:4.764167};
var SESSION_KEY='chef_departure_override_v1';
var runtime=null;

function loadRuntime(){
  try{
    var raw=sessionStorage.getItem(SESSION_KEY);
    if(!raw)return null;
    var v=JSON.parse(raw);
    if(!v||!isFinite(Number(v.lat))||!isFinite(Number(v.lon)))return null;
    return {name:v.name||'Ma position actuelle',address:v.address||'',lat:Number(v.lat),lon:Number(v.lon)};
  }catch(e){return null}
}
function saveRuntime(v){
  runtime=v||null;
  try{if(v)sessionStorage.setItem(SESSION_KEY,JSON.stringify(v));else sessionStorage.removeItem(SESSION_KEY)}catch(e){}
}
function ensureHome(){
  if(!window.state||!state.profile)return false;
  var p=state.profile;
  var invalid=!isFinite(Number(p.baseLat))||!isFinite(Number(p.baseLon))||Math.abs(Number(p.baseLat))<1||Math.abs(Number(p.baseLon))<1;
  if(invalid||!p.baseName){
    p.baseName=HOME.name;p.baseAddress=HOME.address;p.baseLat=HOME.lat;p.baseLon=HOME.lon;
    try{if(typeof save==='function')save()}catch(e){}
  }
  return true;
}
function currentBase(){return runtime||HOME}
function installMath(){
  if(typeof window.hav==='function'){
    window.baseObj=function(){var b=currentBase();return{id:'BASE',enseigne:'Départ',ville:b.name,adresse:b.address,lat:b.lat,lon:b.lon}};
    window.havBase=function(s){return window.hav(window.baseObj(),s)};
  }
}
function refreshLabels(){
  var b=currentBase();
  var header=document.getElementById('headerDeparture');if(header)header.textContent=b.name;
  var pd=document.getElementById('planningDeparture');if(pd)pd.textContent=b.name+(b.address?' · '+b.address:'');
  var status=document.getElementById('smartDepartureStatus');if(status)status.textContent=runtime?'Départ temporaire : position actuelle. Francheville reste ta base par défaut.':'Base par défaut : Francheville.';
  var reset=document.getElementById('resetSmartDeparture');if(reset)reset.style.display=runtime?'inline-flex':'none';
}
function useCurrent(){
  var status=document.getElementById('smartDepartureStatus');
  if(!navigator.geolocation){if(status)status.textContent='Localisation indisponible sur cet appareil.';return}
  if(status)status.textContent='Localisation en cours…';
  navigator.geolocation.getCurrentPosition(function(pos){
    saveRuntime({name:'Ma position actuelle',address:'Départ GPS temporaire',lat:pos.coords.latitude,lon:pos.coords.longitude});
    installMath();refreshLabels();
    if(status)status.textContent='Position actuelle utilisée pour cette tournée. Francheville sera rétablie quand tu choisiras « Revenir à Francheville ».';
  },function(err){
    if(status)status.textContent=err&&err.code===1?'Autorise la localisation pour utiliser ta position actuelle.':'Impossible de récupérer ta position. Francheville reste utilisée.';
  },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function resetHome(){saveRuntime(null);installMath();ensureHome();refreshLabels()}
function installUi(){
  var host=document.querySelector('#planningSettings .settingsInner')||document.getElementById('planningSettings');
  if(!host||document.getElementById('smartDepartureBox'))return false;
  var box=document.createElement('div');box.id='smartDepartureBox';box.className='notice';box.style.margin='0 0 14px';
  box.innerHTML='<b>Départ de la tournée</b><div id="smartDepartureStatus" class="tiny" style="margin-top:5px"></div><div class="row" style="margin-top:10px"><button id="useCurrentDeparture" type="button" class="secondary">📍 Utiliser ma position maintenant</button><button id="resetSmartDeparture" type="button" class="secondary">↩︎ Revenir à Francheville</button></div>';
  host.insertBefore(box,host.firstChild);
  document.getElementById('useCurrentDeparture').onclick=useCurrent;
  document.getElementById('resetSmartDeparture').onclick=resetHome;
  refreshLabels();return true;
}
function hideGpsFields(){
  ['pBaseLat','pBaseLon'].forEach(function(id){var el=document.getElementById(id);if(el){var wrap=el.closest('div')||el.parentElement;if(wrap)wrap.style.display='none'}});
  var btn=document.querySelector('[onclick*="useCurrentLocation"]');if(btn)btn.style.display='none';
}
function patchProfile(){
  if(typeof window.saveProfile==='function'&&!window.saveProfile.__smartDeparture){
    var original=window.saveProfile;
    window.saveProfile=function(){
      var lat=document.getElementById('pBaseLat'),lon=document.getElementById('pBaseLon'),name=document.getElementById('pBaseName'),addr=document.getElementById('pBaseAddress');
      if(lat)lat.value=String(HOME.lat);if(lon)lon.value=String(HOME.lon);if(name&&!name.value.trim())name.value=HOME.name;if(addr&&!addr.value.trim())addr.value=HOME.address;
      return original.apply(this,arguments);
    };
    window.saveProfile.__smartDeparture=true;
  }
}
function boot(){runtime=loadRuntime();if(!runtime)ensureHome();installMath();patchProfile();hideGpsFields();installUi();refreshLabels()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
setInterval(function(){ensureHome();installMath();patchProfile();hideGpsFields();installUi();refreshLabels()},1200);
})();
