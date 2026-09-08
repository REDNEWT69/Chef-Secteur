(function(){
'use strict';
function text(el){return String(el&&el.textContent||'').trim()}
function hide(el){if(el)el.style.setProperty('display','none','important')}
function show(el){if(el)el.style.removeProperty('display')}
function cleanToolbar(){
  var panel=document.getElementById('storesPanel');
  var toolbar=panel&&panel.querySelector('.toolbar');
  if(!toolbar)return;
  var region=document.getElementById('sectorAdminBtn');
  var book=document.getElementById('regionDiscover');
  if(region){region.textContent='📍 Gérer ma région';show(region)}
  if(book){book.textContent='📒 Carnet d’adresses';show(book)}
  toolbar.querySelectorAll('button').forEach(function(btn){
    if(btn!==region&&btn!==book)hide(btn);
  });
}
function cleanSectorDialog(){
  var btn=document.getElementById('sectorAdminBtn');
  if(!btn)return;
  var dialogs=[].slice.call(document.querySelectorAll('dialog.catalogDialog'));
  dialogs.forEach(function(d){
    if(!d.querySelector('#saSave'))return;
    var small=d.querySelector('.catalogHead small');if(small)small.textContent='MA RÉGION';
    var h=d.querySelector('.catalogHead h2');if(h)h.textContent='Gérer ma région';
    var notices=d.querySelectorAll('.notice');
    if(notices[0])notices[0].textContent='Choisissez la région ou les départements qui correspondent à votre zone, puis sélectionnez les magasins à conserver.';
    if(notices[1])hide(notices[1]);
    hide(d.querySelector('#saExport'));hide(d.querySelector('#saImport'));hide(d.querySelector('#saFile'));
    var name=d.querySelector('#saName');if(name&&name.closest('label'))hide(name.closest('label'));
  });
}
function cleanAddressBook(){
  var launch=document.getElementById('regionDiscover');
  if(launch)launch.textContent='📒 Carnet d’adresses';
  var d=document.querySelector('dialog.regionDialog');
  if(!d)return;
  var small=d.querySelector('.regionHeading small');if(small)small.textContent='CARNET D’ADRESSES';
  var h=d.querySelector('.regionHeading h2');if(h)h.textContent='Carnet d’adresses';
  var firstP=d.querySelector('.regionHeading + p');if(firstP)firstP.textContent='Choisissez une région pour consulter les magasins disponibles et ajouter ceux qui vous intéressent.';
  hide(d.querySelector('fieldset'));
  hide(d.querySelector('.regionOfficialLinks'));
  var osm=d.querySelector('#regionOsmComplement');if(osm&&osm.closest('label'))hide(osm.closest('label'));
  hide(d.querySelector('.regionSource'));
  var search=d.querySelector('#regionSearch');if(search)search.textContent='Afficher les magasins';
  d.querySelectorAll('small').forEach(function(s){
    if(/coordonnées disponibles/i.test(text(s)))s.textContent=text(s).replace(/coordonnées disponibles/ig,'fiche complète');
  });
}
function hideTechnicalCoordinates(){
  document.querySelectorAll('dialog label').forEach(function(label){
    var t=text(label).toLowerCase();
    if(/^latitude\b/.test(t)||/^longitude\b/.test(t))hide(label);
  });
}
function apply(){cleanToolbar();cleanSectorDialog();cleanAddressBook();hideTechnicalCoordinates()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
window.addEventListener('load',apply);
new MutationObserver(function(){apply()}).observe(document.documentElement,{childList:true,subtree:true});
setInterval(apply,1200);
})();
