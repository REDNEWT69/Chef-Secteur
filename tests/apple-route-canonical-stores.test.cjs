const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync(path.join(process.cwd(),'route-polish.js'),'utf8');
const state={
  profile:{baseLat:45.758,baseLon:4.80,baseAddress:'Ancienne base'},
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']},
  stores:[
    {id:'s55',enseigne:'Boulanger',ville:'Limonest',adresse:'Route Nationale 6',lat:45.8377,lon:4.7715},
    {id:'s69',enseigne:'Boulanger',ville:'Chalon-sur-Saône',adresse:'2 Rue René Cassin',lat:46.7808,lon:4.853}
  ],
  plan:{
    Jeudi:[
      {id:'s55',enseigne:'Boulanger',ville:'Limonest',adresse:'MAUVAISE ADRESSE',lat:1,lon:2},
      {id:'s69',enseigne:'Boulanger',ville:'Chalon-sur-Saône',adresse:'ANCIENNE ADRESSE',lat:3,lon:4}
    ]
  }
};

const ctx={
  state,
  console,
  setTimeout(){return 0},
  clearTimeout(){},
  MutationObserver:function(){this.observe=function(){}},
  document:{
    readyState:'loading',
    addEventListener(){},
    getElementById(){return null},
    querySelector(){return null},
    querySelectorAll(){return[]},
    createElement(){return{style:{},appendChild(){},addEventListener(){}}},
    head:{appendChild(){}},
    hidden:false
  },
  addEventListener(){},
  open(){}
};
ctx.window=ctx;
vm.runInNewContext(source,ctx);

assert.equal(typeof ctx.storeRunnerBuildAppleRouteUrl,'function','Le constructeur Apple Plans doit être exposé pour contrôle');
assert.equal(ctx.storeRunnerCanonicalRouteStore(state.plan.Jeudi[0]),state.stores[0],'Le magasin actuel doit remplacer la copie périmée du planning');

const url=decodeURIComponent(ctx.storeRunnerBuildAppleRouteUrl('Jeudi'));
assert(url.includes('source=45.758,4.8'),'Le départ doit utiliser les coordonnées GPS actuelles');
assert(url.includes('waypoint=45.8377,4.7715'),'Limonest doit utiliser les coordonnées de la fiche magasin actuelle');
assert(url.includes('destination=46.7808,4.853'),'Chalon doit utiliser les coordonnées de la fiche magasin actuelle');
assert(!url.includes('MAUVAISE ADRESSE')&&!url.includes('ANCIENNE ADRESSE'),'Les anciennes adresses stockées dans le planning ne doivent jamais partir vers Plans');
assert(!url.includes('1,2')&&!url.includes('3,4'),'Les anciennes coordonnées stockées dans le planning ne doivent jamais partir vers Plans');

state.stores[0].lat='';
state.stores[0].lon='';
const fallback=decodeURIComponent(ctx.storeRunnerBuildAppleRouteUrl('Jeudi'));
assert(fallback.includes('waypoint=Boulanger, Route Nationale 6, Limonest'),'Sans GPS, le texte doit venir de la fiche magasin actuelle et inclure enseigne + adresse + ville');

console.log('Apple route canonical stores: OK · Plans uses current store records and GPS coordinates');
