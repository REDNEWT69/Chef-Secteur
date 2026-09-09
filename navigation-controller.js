(function(){
  'use strict';
  let returnToPlanning=false;
  let installed=false;

  function goPlanning(){
    if(typeof window.goTab==='function')window.goTab('planPanel');
    else if(typeof window.switchTab==='function')window.switchTab('planPanel',null);
    if(typeof window.syncBottomNav==='function'){
      try{window.syncBottomNav('planPanel')}catch(e){}
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function savedProfileMatchesForm(){
    try{
      const latInput=document.getElementById('pBaseLat');
      const lonInput=document.getElementById('pBaseLon');
      const lat=latInput?parseFloat(latInput.value):NaN;
      const lon=lonInput?parseFloat(lonInput.value):NaN;
      const profile=window.state&&state.profile?state.profile:null;
      return !!(profile&&isFinite(lat)&&isFinite(lon)&&Math.abs(Number(profile.baseLat)-lat)<0.000001&&Math.abs(Number(profile.baseLon)-lon)<0.000001);
    }catch(e){return false}
  }

  function install(){
    if(installed)return;
    installed=true;
    document.addEventListener('click',function(e){
      const btn=e.target&&e.target.closest?e.target.closest('button'):null;
      if(!btn)return;

      if(btn.closest('#planPanel .departureCard')){
        returnToPlanning=true;
        return;
      }

      if(!returnToPlanning||!btn.closest('#departureSettings'))return;
      const action=btn.getAttribute('onclick')||'';
      if(action.indexOf('saveProfile')<0)return;

      setTimeout(function(){
        if(!savedProfileMatchesForm())return;
        returnToPlanning=false;
        goPlanning();
      },220);
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
