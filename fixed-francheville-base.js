(function(){
'use strict';

var FIXED_BASE={
  name:'Francheville',
  address:'Francheville, 69340',
  lat:45.737222,
  lon:4.764167
};

function applyFixedBase(persist){
  if(!window.state||!state.profile)return false;
  state.profile.baseName=FIXED_BASE.name;
  state.profile.baseAddress=FIXED_BASE.address;
  state.profile.baseLat=FIXED_BASE.lat;
  state.profile.baseLon=FIXED_BASE.lon;
  if(persist&&typeof save==='function'){
    try{save()}catch(e){console.warn('Sauvegarde base Francheville impossible',e)}
  }
  return true;
}

function setValue(id,value,readOnly){
  var el=document.getElementById(id);
  if(!el)return;
  el.value=value;
  if(readOnly){
    el.readOnly=true;
    el.setAttribute('aria-readonly','true');
  }
}

function hideTechnicalField(id){
  var el=document.getElementById(id);
  if(!el)return;
  var label=el.closest('label');
  if(label) label.style.display='none';
  else el.style.display='none';
}

function polishProfileUI(){
  setValue('pBaseName',FIXED_BASE.name,true);
  setValue('pBaseAddress',FIXED_BASE.address,true);
  setValue('pBaseLat',FIXED_BASE.lat,true);
  setValue('pBaseLon',FIXED_BASE.lon,true);
  hideTechnicalField('pBaseLat');
  hideTechnicalField('pBaseLon');

  var departure=document.getElementById('departureSettings');
  if(departure&&!document.getElementById('fixedBaseNote')){
    var note=document.createElement('div');
    note.id='fixedBaseNote';
    note.className='notice';
    note.textContent='Base de départ automatique : Francheville (69340). Aucune latitude/longitude à saisir.';
    departure.insertBefore(note,departure.firstChild);
  }

  document.querySelectorAll('button').forEach(function(btn){
    var text=(btn.textContent||'').toLowerCase();
    if(text.indexOf('position actuelle')>=0||text.indexOf('ma position')>=0||text.indexOf('géolocal')>=0){
      btn.style.display='none';
    }
  });
}

function overrideFunctions(){
  window.baseObj=function(){
    return{id:'BASE',enseigne:'Base',ville:FIXED_BASE.name,adresse:FIXED_BASE.address,lat:FIXED_BASE.lat,lon:FIXED_BASE.lon};
  };
  window.havBase=function(s){return hav(baseObj(),s)};

  var originalFill=window.fillProfileForm;
  window.fillProfileForm=function(){
    applyFixedBase(false);
    if(typeof originalFill==='function') originalFill.apply(this,arguments);
    polishProfileUI();
  };

  window.saveProfile=function(){
    if(!state.profile)state.profile={};
    var sector=document.getElementById('pSector');
    var rep=document.getElementById('pRep');
    var overnight=document.getElementById('pOvernight');
    var saving=document.getElementById('pSaving');
    state.profile.sectorName=sector&&sector.value.trim()?sector.value.trim():'Rhône-Alpes';
    state.profile.repName=rep?rep.value.trim():'';
    state.profile.overnightMode=overnight?overnight.value:(state.profile.overnightMode||'auto');
    state.profile.overnightMinSaving=saving?(parseFloat(saving.value)||80):(state.profile.overnightMinSaving||80);
    applyFixedBase(false);
    if(typeof save==='function')save();
    if(typeof renderHeader==='function')renderHeader();
    if(typeof renderAll==='function')renderAll();
    if(typeof assistantBot==='function')assistantBot('Secteur enregistré. La base de départ reste automatiquement Francheville.');
  };

  window.useCurrentLocation=function(){
    applyFixedBase(true);
    polishProfileUI();
    if(typeof renderHeader==='function')renderHeader();
  };
}

function boot(){
  if(!window.state||!state.profile){setTimeout(boot,50);return;}
  applyFixedBase(true);
  overrideFunctions();
  polishProfileUI();
  if(typeof renderHeader==='function')renderHeader();
  if(typeof renderAll==='function')renderAll();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
else boot();
window.addEventListener('load',function(){applyFixedBase(true);polishProfileUI();});
})();
