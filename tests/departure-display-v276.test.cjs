'use strict';

const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

const profile=read('profile-controller.js');
const home=read('home-refresh-v2.js');
const branding=read('store-runner-branding.js');
const core=read('src/chef-secteur.html');

assert.match(profile,/departureDisplay:departureDisplay/,'le propriétaire profil expose le libellé de départ');
assert.match(profile,/Position précise/,'le GPS courant a un libellé humain sans coordonnées');
assert.match(profile,/store-runner-departure-display-v1/,'le reverse geocode de présentation reste hors state');
assert.match(profile,/store-runner:departure-display-updated/,'la ville résolue rafraîchit les surfaces');
assert.match(core,/StoreRunnerProfile\.departureDisplay/,'le Planning délègue son libellé au propriétaire du départ');
assert.match(home,/phDepartureTitle/,'l’Accueil possède une ligne de départ dédiée');
assert.doesNotMatch(home,/<span class="phSector">/,'le secteur/count ne doit plus être affiché dans ce bloc Accueil');
assert.match(branding,/departureDisplay\.kind==='gps'/,'le branding sait rendre le GPS courant');
assert.match(branding,/store-runner:departure-display-updated/,'le branding suit la résolution asynchrone de la ville');

const renderHeader=core.slice(core.indexOf('function renderHeader()'),core.indexOf('function openDepartureSettings()'));
assert.match(renderHeader,/display\.title\+\(display\.detail/,'le Planning rend ville/position précise quand disponible');
assert.doesNotMatch(renderHeader,/Position GPS ·/,'le Planning ne doit pas reconstruire de coordonnées visibles');

console.log('departure-display-v276: OK · coordonnées masquées sur Accueil et Planning');
