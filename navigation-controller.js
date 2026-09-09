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

  function install(){
    if(installed)return;
    installed=true;

    document.addEventListener('click',function(e){
      const btn=e.target&&e.target.closest?e.target.closest('button'):null;
      if(!btn)return;
      if(btn.closest('#planPanel .departureCard'))returnToPlanning=true;
    },true);

    document.addEventListener('store-runner:profile-saved',function(){
      if(!returnToPlanning)return;
      returnToPlanning=false;
      goPlanning();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
