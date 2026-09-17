const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync(path.join(process.cwd(),'route-polish.js'),'utf8');
const state={
  profile:{baseLat:43.658,baseLon:-0.7,baseAddress:'Ancienne base'},
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']},
  stores:[
    {id:'s55',enseigne:'Boulanger',ville:'Ville-Test L',adresse:'Route de la Fixture',codePostal:'99010',lat:43.7377,lon:-0.7285},
    {id:'s69',enseigne:'Boulanger',ville:'Ville-Test I',adresse:'2 rue du Scénario',codePostal:'99020',lat:44.6808,lon:-0.647}
  ],
  plan:{
    Jeudi:[
      {id:'s55',enseigne:'Boulanger',ville:'Ville-Test L',adresse:'MAUVAISE ADRESSE',lat:1,lon:-3.5},
      {id:'s69',enseigne:'Boulanger',ville:'Ville-Test I',adresse:'ANCIENNE ADRESSE',lat:3,lon:-1.5}
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
assert(url.includes('source=43.658,-0.7'),'Le départ conserve les coordonnées GPS actuelles');
assert(url.includes('waypoint=Boulanger, Route de la Fixture, 99010, Ville-Test L'),'Ville-Test L doit utiliser l’adresse actuelle de la fiche magasin');
assert(url.includes('destination=Boulanger, 2 rue du Scénario, 99020, Ville-Test I'),'Ville-Test I doit utiliser l’adresse actuelle de la fiche magasin');
assert(!url.includes('MAUVAISE ADRESSE')&&!url.includes('ANCIENNE ADRESSE'),'Les anciennes adresses stockées dans le planning ne doivent jamais partir vers Plans');
assert(!url.includes('1,2')&&!url.includes('3,4'),'Les anciennes coordonnées stockées dans le planning ne doivent jamais partir vers Plans');
assert(!url.includes('45.8377,4.7715')&&!url.includes('46.7808,4.853'),'Une adresse actuelle doit être prioritaire sur les coordonnées magasin pour Apple Plans');

state.stores[0].adresse='';
state.stores[0].codePostal='';
state.stores[0].ville='';
const fallback=decodeURIComponent(ctx.storeRunnerBuildAppleRouteUrl('Jeudi'));
assert(fallback.includes('waypoint=43.7377,-0.7285'),'Sans adresse exploitable, Plans doit reprendre les coordonnées GPS actuelles en secours');

console.log('Apple route canonical stores: OK · Plans prefers current postal addresses and falls back to current GPS');
