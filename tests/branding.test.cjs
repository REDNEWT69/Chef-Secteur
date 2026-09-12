const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');
const branding=read('store-runner-branding.js');

assert.match(branding,/const APP_NAME=['"]Store Runner['"]/,'le nom produit doit rester Store Runner');
assert.match(branding,/function profileContext\(\)/,'le contexte d’en-tête doit être centralisé');
assert.match(branding,/sector\+' · départ '\+place/,'le sous-titre doit afficher le secteur puis le départ');
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
