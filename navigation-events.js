(function(){
  'use strict';
  function emit(name,detail){
    try{document.dispatchEvent(new CustomEvent(name,{detail:detail||{}}))}catch(e){}
  }
  document.addEventListener('click',function(e){
    const tab=e.target&&e.target.closest?e.target.closest('.tab'):null;
    if(!tab)return;
    const oc=tab.getAttribute('onclick')||'';
    const m=oc.match(/switchTab\(['\"]([^'\"]+)['\"]/);
    if(m)setTimeout(function(){emit('store-runner:tab-changed',{panelId:m[1]})},0);
  },true);
})();
