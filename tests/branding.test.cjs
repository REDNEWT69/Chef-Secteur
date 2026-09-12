const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');
const branding=read('store-runner-branding.js');

assert.match(branding,/const APP_NAME=['"]Store Runner['"]/,'le nom produit doit rester Store Runner');
assert.match(branding,/function profileContext\(\)/,'le contexte d’en-tête doit être centralisé');
assert.doesNotMatch(branding,/sector\+' · départ '/,'le secteur ne doit jamais être concaténé au départ');
assert.match(branding,/baseAddress/,'l’adresse de départ doit participer au contexte dynamique');
assert.match(branding,/context\.label/,'l’en-tête doit consommer le libellé dynamique complet');
assert.match(branding,/headerDeparture/,'le raccourci départ doit suivre le profil actif');
assert.match(branding,/store-runner:profile-saved/,'le branding doit se rafraîchir après sauvegarde du profil');
assert.match(branding,/store-runner:data-restored/,'le branding doit se rafraîchir après restauration des données');
assert.match(branding,/img\[src\*=["']samsung-wordmark["']\]/,'le wordmark Samsung hérité doit être retiré de l’accueil générique');
assert.match(branding,/Installer '\+APP_NAME/,'la carte d’installation doit utiliser le nom Store Runner');
assert.match(branding,/text-overflow:ellipsis/,'le sous-titre mobile doit se tronquer proprement');
assert.doesNotMatch(branding,/titleSub[^\n]{0,160}SIGNATURE/,'la signature ne doit plus remplacer le contexte secteur/départ dans l’en-tête');

console.log('Branding guards: OK · Store Runner + départ dynamique');

// Exercise the public branding context with a long departure and changing sector.
const vm=require('node:vm');
const state={profile:{sectorName:'Secteur de démonstration',baseName:'Ma position actuelle',baseAddress:'12 rue Fictive très longue'},stores:[{active:true},{active:false},{active:true}]};
const window={state,addEventListener(){}};
vm.runInNewContext(branding,{window,state,document:{readyState:'loading',addEventListener(){}},setTimeout(){}});
const before=JSON.stringify(state);
let context=window.storeRunnerBrandingContext();
assert.equal(context.label,'Secteur de démonstration · 2 magasins');
assert.equal(context.place,state.profile.baseAddress);
assert.equal(JSON.stringify(state),before,'le branding ne modifie pas le profil ou les magasins');
state.profile.sectorName='Nouveau parc';state.profile.baseName='Entrepôt';
context=window.storeRunnerBrandingContext();
assert.equal(context.label,'Nouveau parc · 2 magasins');
assert.equal(context.place,'Entrepôt');
const home=read('home-refresh-v2.js'),connection=read('connection-ui.js'),css=read('glass-theme.css');
assert.match(home,/phHeaderContext/);
assert.match(home,/store-runner:home-rendered/);
assert.match(connection,/store-runner:home-rendered',placeCard/,'le statut Agenda rejoint le header même après un nouveau rendu accueil');
assert.match(branding,/stores\.classList\.contains\('active'\)\?'Magasins'/);
assert.match(css,/\.phDepartureAddress\{[^}]*text-overflow:ellipsis/);
assert.match(css,/\.phHeaderContext \.phSector\{[^}]*overflow-wrap:anywhere/);
console.log('PASS: secteur/count séparés du départ, contexte dynamique sans mutation, titre Magasins et rattachement du statut Agenda.');
