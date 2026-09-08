(function(){
'use strict';

var HOME={name:'Francheville',address:'Francheville, 69340',lat:45.737222,lon:4.764167};
var SESSION_KEY='chef_departure_override_v1';
var runtimeBase=null;

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
function boot(){
  if(!window.state||!state.profile){setTimeout(boot,50);return}
  loadRuntime();ensureHome(true);installBaseOverrides();installProfileGuard();installAutoApply();installDepartureUi();hideTechnicalBaseFields();refreshDepartureUi();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
setInterval(function(){ensureHome(false);installBaseOverrides();installProfileGuard();installAutoApply();installDepartureUi();hideTechnicalBaseFields();refreshDepartureUi()},1200);
})();
