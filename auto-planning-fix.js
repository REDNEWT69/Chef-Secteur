(function(){
'use strict';

var FIXED_BASE={name:'Francheville',address:'Francheville, 69340',lat:45.737222,lon:4.764167};

function applyBase(persist){
  try{
    if(!window.state||!state.profile)return false;
    state.profile.baseName=FIXED_BASE.name;
    state.profile.baseAddress=FIXED_BASE.address;
    state.profile.baseLat=FIXED_BASE.lat;
    state.profile.baseLon=FIXED_BASE.lon;
    if(persist&&typeof save==='function')save();
    return true;
  }catch(e){return false}
}

function hideTechnicalBaseFields(){
  ['pBaseLat','pBaseLon'].forEach(function(id){
    var el=document.getElementById(id);if(!el)return;
    var host=el.closest('label')||el;host.style.display='none';
  });
  var name=document.getElementById('pBaseName');if(name){name.value=FIXED_BASE.name;name.readOnly=true}
  var address=document.getElementById('pBaseAddress');if(address){address.value=FIXED_BASE.address;address.readOnly=true}
  var departure=document.getElementById('departureSettings');
  if(departure&&!document.getElementById('fixedBaseNote')){
    var note=document.createElement('div');note.id='fixedBaseNote';note.className='notice';
    note.textContent='Départ automatique : Francheville (69340). Aucun réglage GPS nécessaire.';
    departure.insertBefore(note,departure.firstChild);
  }
  document.querySelectorAll('button').forEach(function(btn){
    var t=(btn.textContent||'').toLowerCase();
    if(t.indexOf('ma position')>=0||t.indexOf('position actuelle')>=0||t.indexOf('géolocal')>=0)btn.style.display='none';
  });
}

function installBaseOverrides(){
  applyBase(false);
  window.baseObj=function(){return{id:'BASE',enseigne:'Base',ville:FIXED_BASE.name,adresse:FIXED_BASE.address,lat:FIXED_BASE.lat,lon:FIXED_BASE.lon}};
  window.havBase=function(store){return hav(baseObj(),store)};

  var originalFill=window.fillProfileForm;
  window.fillProfileForm=function(){applyBase(false);if(typeof originalFill==='function')originalFill.apply(this,arguments);hideTechnicalBaseFields()};

  window.saveProfile=function(){
    if(!state.profile)state.profile={};
    var sector=document.getElementById('pSector'),rep=document.getElementById('pRep'),overnight=document.getElementById('pOvernight'),saving=document.getElementById('pSaving');
    state.profile.sectorName=sector&&sector.value.trim()?sector.value.trim():'Rhône-Alpes';
    state.profile.repName=rep?rep.value.trim():'';
    state.profile.overnightMode=overnight?overnight.value:(state.profile.overnightMode||'auto');
    state.profile.overnightMinSaving=saving?(parseFloat(saving.value)||80):(state.profile.overnightMinSaving||80);
    applyBase(false);
    if(typeof save==='function')save();
    if(typeof renderHeader==='function')renderHeader();
    if(typeof renderAll==='function')renderAll();
  };
  window.useCurrentLocation=function(){applyBase(true);hideTechnicalBaseFields();if(typeof renderHeader==='function')renderHeader()};
  hideTechnicalBaseFields();
  if(typeof renderHeader==='function')renderHeader();
}

function installAutoApply(){
  var R=window.ChefReliability;if(!R||typeof R.capture!=='function')return false;
  if(R.propose&&R.propose.__chefAutoApply)return true;
  var fn=async function(candidate){
    try{
      applyBase(false);
      var bundle=R.capture();
      bundle.state=JSON.parse(JSON.stringify(window.state));
      bundle.state.plan=candidate.plan||{};
      if(candidate.weekDate)bundle.state.settings.weekDate=candidate.weekDate;
      if(candidate.archive)bundle.archive=candidate.archive;
      if(candidate.range)bundle.range=candidate.range;
      try{R.checkpoint('Avant remplacement automatique du planning')}catch(e){}
      R.persist(bundle);window.state=bundle.state;
      if(typeof window.initControls==='function')window.initControls();
      if(typeof window.renderAll==='function')window.renderAll();
      return true;
    }catch(e){if(typeof window.showError==='function')window.showError('Génération impossible : '+(e.message||String(e)));return false}
  };
  fn.__chefAutoApply=true;R.propose=fn;return true;
}

function boot(){
  if(!window.state||!state.profile){setTimeout(boot,50);return}
  applyBase(true);installBaseOverrides();installAutoApply();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
setInterval(function(){applyBase(false);installAutoApply();hideTechnicalBaseFields()},1000);
})();
