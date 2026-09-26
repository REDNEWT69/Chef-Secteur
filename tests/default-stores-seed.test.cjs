/* Garde-fou du premier lancement.
   DEFAULT_STORES reste une vieille graine anonymisée du noyau historique, mais le runtime
   moderne doit la reconnaître comme démonstration et l'écarter avant de proposer
   l'onboarding. Une sauvegarde réelle, elle, ne doit jamais être modifiée. */
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const vm=require('node:vm');

const src=fs.readFileSync(path.join(__dirname,'..','src','chef-secteur.html'),'utf8');
const navSrc=fs.readFileSync(path.join(__dirname,'..','navigation-controller.js'),'utf8');

function extractArray(text,marker){
  const i=text.indexOf(marker);
  assert.notEqual(i,-1,marker+' introuvable');
  const s=text.indexOf('[',i);
  let d=0,j=s;
  for(;j<text.length;j++){const c=text[j];if(c==='[')d++;else if(c===']'){d--;if(!d){j++;break}}}
  return JSON.parse(text.slice(s,j));
}
function extractFn(text,name){
  const i=text.indexOf('function '+name+'(');
  assert.notEqual(i,-1,name+' introuvable');
  const s=text.indexOf('{',i);
  let d=0,j=s;
  for(;j<text.length;j++){const c=text[j];if(c==='{')d++;else if(c==='}'){d--;if(!d){j++;break}}}
  return text.slice(i,j);
}

const DEFAULT_STORES=extractArray(src,'var DEFAULT_STORES=');

/* 1. La vieille graine reste identifiable sans ambiguïté. */
assert(DEFAULT_STORES.length>0,'la graine historique doit rester détectable');
const REQUIRED=['id','enseigne','ville','adresse','dept','deptName','type','freq','lat','lon','priority','intervalDays','products','active','source'];
for(const s of DEFAULT_STORES){
  for(const k of REQUIRED)assert(k in s,'clé manquante '+k+' sur '+s.id);
  assert(typeof s.lat==='number'&&typeof s.lon==='number','coordonnées numériques attendues sur '+s.id);
  assert(s.ville&&String(s.ville).trim(),'ville non vide attendue sur '+s.id);
  assert(Array.isArray(s.products)&&s.products.length,'produits attendus sur '+s.id);
}
assert.equal(new Set(DEFAULT_STORES.map(s=>s.id)).size,DEFAULT_STORES.length,'identifiants uniques');

const VILLE=/^Ville-Test \d{2}$/;
const RUE=/^\d{1,4} (?:rue de la Démonstration|avenue des Essais|boulevard du Test|route de la Fixture|chemin de l'Exemple|place du Bac à Sable|allée des Modèles|impasse du Prototype)$/;
for(const s of DEFAULT_STORES){
  assert(VILLE.test(s.ville),'ville de démonstration attendue sur '+s.id+' : '+s.ville);
  assert(RUE.test(s.adresse),'adresse de démonstration attendue sur '+s.id+' : '+s.adresse);
  assert.equal(s.source,'Secteur de démonstration','source de démonstration attendue sur '+s.id);
}

/* 2. Le noyau ne doit toujours jamais injecter cette graine dans une sauvegarde réelle. */
const ctx={console,JSON,Number,String,Array,Date,Math,Object};
vm.createContext(ctx);
vm.runInContext(
  'var DAYS=[\'Lundi\',\'Mardi\',\'Mercredi\',\'Jeudi\',\'Vendredi\',\'Samedi\'];'+
  'var DEFAULT_WORK_DAYS=DAYS.slice(0,5);'+
  'var DEFAULT_STORES='+JSON.stringify(DEFAULT_STORES)+';'+
  'function todayISO(){return \'2026-09-17\'}'+
  extractFn(src,'clone')+';'+
  extractFn(src,'defaultState')+';'+
  extractFn(src,'ensureState')+';'+
  'var state=null;'+
  'function run(saved){state=saved;ensureState();return state}',ctx);

const utilisateurExistant={
  schemaVersion:5,
  profile:{sectorName:'Mon secteur',repName:'R',baseName:'Base',baseAddress:'A',baseLat:42.9,baseLon:-1.5,overnightMode:'auto',overnightMinSaving:80},
  stores:[
    {id:'u1',enseigne:'Enseigne A',ville:'Ma ville',adresse:'1 rue A',dept:'99',deptName:'Ailleurs',type:'Gros',freq:'Hebdo',lat:45.1,lon:4.1,priority:5,intervalDays:7,products:['Blanc'],active:true,source:'import perso'},
    {id:'u2',enseigne:'Enseigne B',ville:'Autre ville',adresse:'2 rue B',dept:'99',deptName:'Ailleurs',type:'Petit',freq:'Mensuel',lat:45.9,lon:4.9,priority:2,intervalDays:30,products:['Brun'],active:false,source:'import perso'}
  ],
  visits:{u1:'2026-09-01'},notes:{u1:'note'},included:{},excluded:{u2:true},locks:{},plan:{Lundi:[{id:'u1'}]},
  settings:{target:20,days:['Lundi','Mardi'],brands:[],products:[],strategy:'balanced',weekDate:'2026-09-14'},
  ui:{firstRun:false}
};
const avant=JSON.stringify(utilisateurExistant.stores);
const apres=ctx.run(JSON.parse(JSON.stringify(utilisateurExistant)));
assert.equal(JSON.stringify(apres.stores),avant,'les magasins d\'un utilisateur existant ne doivent pas bouger');
assert.equal(apres.stores.length,2,'aucun magasin de démonstration ne doit être injecté');
assert.equal(apres.notes.u1,'note','les notes doivent survivre');
assert.equal(apres.excluded.u2,true,'les exclusions doivent survivre');
assert.equal(JSON.stringify(apres.plan),JSON.stringify(utilisateurExistant.plan),'le planning ne doit pas bouger');

/* 3. Le contrôleur moderne classe correctement neuf / démo / utilisateur existant. */
const fakeDocument={readyState:'loading',addEventListener(){},getElementById(){return null},documentElement:{classList:{add(){},remove(){}}}};
const navCtx={console,JSON,Number,String,Array,Date,Math,Object,Promise,setTimeout,clearTimeout,document:fakeDocument,CustomEvent:function(){}};
navCtx.window=navCtx;
vm.createContext(navCtx);
vm.runInContext(navSrc,navCtx);
const firstRun=navCtx.StoreRunnerNavigation&&navCtx.StoreRunnerNavigation._firstRun;
assert(firstRun,'helpers onboarding indisponibles');

const neuf=ctx.run(JSON.parse(JSON.stringify({schemaVersion:5})));
assert.equal(neuf.stores.length,DEFAULT_STORES.length,'le noyau historique produit encore sa graine transitoire');
assert.equal(firstRun.isPristineDemoState(neuf),true,'la graine intacte doit être reconnue comme pure démonstration');
assert.equal(firstRun.hasRealUserData(neuf),false,'la démonstration intacte ne doit pas compter comme donnée utilisateur');

const vide={schemaVersion:5,profile:{sectorName:'Mon secteur',repName:'',baseName:'',baseAddress:'',baseLat:null,baseLon:null},stores:[],visits:{},notes:{},hotelReservations:{},included:{},excluded:{},locks:{},plan:{},settings:{target:20,maxVisitsPerDay:4,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],brands:[],products:[],strategy:'balanced'}};
assert.equal(firstRun.isFreshEmptyState(vide),true,'un vrai secteur vide doit déclencher le premier lancement');
assert.equal(firstRun.hasRealUserData(utilisateurExistant),true,'un utilisateur réel doit être protégé de l’onboarding');
assert.equal(firstRun.isPristineDemoState(utilisateurExistant),false,'une vraie sauvegarde ne doit jamais être prise pour la démo');

/* 4. Le parcours doit nettoyer la graine AVANT l'onboarding, réutiliser l'ajout magasin
   officiel et mémoriser son état hors du schéma métier. */
assert.match(navSrc,/sanitizePristineDemoState\(state\)/,'la graine de démonstration doit être retirée au premier lancement');
assert.match(navSrc,/StoreRunnerStoreAdd/,'le premier magasin doit passer par StoreRunnerStoreAdd');
assert.match(navSrc,/store-runner-onboarding-v1/,'un marqueur dédié doit mémoriser le parcours');
assert.doesNotMatch(navSrc,/localStorage\.setItem\([^\n]*onboarding/i,'le marqueur onboarding ne doit pas contourner __chefStorage');

console.log('PASS: premier lancement sans fausses données, graine historique reconnue, sauvegardes existantes protégées.');
