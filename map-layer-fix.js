(function(){
  'use strict';
  function install(){
    if(document.getElementById('map-layer-fix'))return;
    const s=document.createElement('style');
    s.id='map-layer-fix';
    s.textContent=`
      #routeCompactCard,
      #freeRouteMap,
      .leaflet-container{position:relative!important;z-index:1!important}
      .leaflet-pane{z-index:2!important}
      .leaflet-tile-pane{z-index:2!important}
      .leaflet-overlay-pane{z-index:3!important}
      .leaflet-shadow-pane{z-index:4!important}
      .leaflet-marker-pane{z-index:5!important}
      .leaflet-tooltip-pane{z-index:6!important}
      .leaflet-popup-pane{z-index:7!important}
      .leaflet-top,.leaflet-bottom{z-index:8!important}
      #assistantPanel,.assist{z-index:5000!important}
      #assistFab,.assist-fab{z-index:5001!important}
      dialog{z-index:6000!important}
    `;
    document.head.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();