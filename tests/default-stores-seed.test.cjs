/* Garde-fou de l'anonymisation du secteur de démonstration.
   DEFAULT_STORES n'est qu'une graine de premier lancement : il ne doit jamais
   toucher les magasins d'un utilisateur déjà installé. Ce test rejoue load()
   sur une sauvegarde existante et vérifie que la liste ressort à l'identique.
   Il doit passer AVANT et APRÈS le remplacement de la liste. */
const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');

const src=fs.readFileSync(require('path').join(__dirname,'..','src','chef-secteur.html'),'utf8');

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

/* 1. La graine reste structurellement exploitable. */
assert(DEFAULT_STORES.length>0,'la graine ne doit pas être vide');
const REQUIRED=['id','enseigne','ville','adresse','dept','deptName','type','freq','lat','lon','priority','intervalDays','products','active','source'];
for(const s of DEFAULT_STORES){
  for(const k of REQUIRED)assert(k in s,'clé manquante '+k+' sur '+s.id);
  assert(typeof s.lat==='number'&&typeof s.lon==='number','coordonnées numériques attendues sur '+s.id);
  assert(s.ville&&String(s.ville).trim(),'ville non vide attendue sur '+s.id);
  assert(Array.isArray(s.products)&&s.products.length,'produits attendus sur '+s.id);
}
assert.equal(new Set(DEFAULT_STORES.map(s=>s.id)).size,DEFAULT_STORES.length,'identifiants uniques');

/* 2. La graine est inventée, et la règle est structurelle plutôt qu'une liste
   de villes réelles : énumérer ici les noms interdits reviendrait à les
   réintroduire dans le dépôt. Toute ville doit porter le préfixe de test, et
   toute adresse doit venir du jeu de libellés de démonstration. */
const VILLE=/^Ville-Test \d{2}$/;
const RUE=/^\d{1,4} (?:rue de la Démonstration|avenue des Essais|boulevard du Test|route de la Fixture|chemin de l'Exemple|place du Bac à Sable|allée des Modèles|impasse du Prototype)$/;
for(const s of DEFAULT_STORES){
  assert(VILLE.test(s.ville),'ville de démonstration attendue sur '+s.id+' : '+s.ville);
  assert(RUE.test(s.adresse),'adresse de démonstration attendue sur '+s.id+' : '+s.adresse);
  assert.equal(s.source,'Secteur de démonstration','source de démonstration attendue sur '+s.id);
}

/* 3. Une sauvegarde existante ressort à l'identique de ensureState(). */
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

/* 4. Premier lancement : la graine est bien servie à un état neuf. */
const neuf=ctx.run(JSON.parse(JSON.stringify({schemaVersion:5})));
assert.equal(neuf.stores.length,DEFAULT_STORES.length,'un état neuf reçoit la graine complète');

console.log('PASS: graine DEFAULT_STORES anonymisée, structure intacte, sauvegarde existante inchangée ('+DEFAULT_STORES.length+' magasins de démonstration).');
