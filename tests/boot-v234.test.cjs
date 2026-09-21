const fs=require('fs');
const assert=require('assert/strict');

const index=fs.readFileSync(__dirname+'/../index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../sw.js','utf8');

assert.match(index,/id="storeRunnerBoot" data-store-runner-boot/,'le shell initial doit exposer le loader V234');
assert.equal((index.match(/data-store-runner-boot/g)||[]).length,2,'le shell et le document runtime doivent utiliser le même loader, sans troisième écran');
assert.equal((index.match(/Chargement de ton espace terrain…/g)||[]).length,2,'le texte de chargement doit rester identique avant et après document.write');
assert.doesNotMatch(index,/srRuntimeBoot/,'l’ancien second loader ne doit plus exister');
assert.doesNotMatch(index,/document\.getElementById\(["']srRuntimeBoot["']\)/,'aucun code ne doit piloter l’ancien loader');
assert.match(index,/store-runner:home-rendered/,'le loader runtime doit attendre le rendu réel de l’accueil');
assert.match(index,/function removeBoot\(\)/,'la disparition du loader doit passer par une seule fonction explicite');
assert.match(index,/requestAnimationFrame\(function\(\)\{requestAnimationFrame\(removeBoot\)\}\)/,'le loader doit disparaître après le rendu visuel de l’accueil');
assert.doesNotMatch(index,/setTimeout\(function\(\)\{var b=document\.getElementById\(["']srRuntimeBoot["']\);if\(b\)b\.remove\(\)\},4500\)/,'un timeout fixe ne doit plus dévoiler l’ancienne interface');
assert.match(index,/fetch\(withRev\('\.\/src\/chef-secteur\.html'\)\)/,'le HTML principal versionné doit pouvoir profiter du cache navigateur/PWA');
assert.doesNotMatch(index,/fetch\(withRev\('\.\/src\/chef-secteur\.html'\),\{cache:'no-store'\}\)/,'le bootstrap ne doit plus forcer un aller-retour réseau pour le HTML versionné');

const cacheFirstAt=sw.indexOf("url.searchParams.get('rev') === BUILD_REV");
const networkFirstAt=sw.indexOf('// Les requêtes non versionnées restent network-first');
assert(cacheFirstAt>=0,'le service worker doit reconnaître les assets du BUILD_REV courant');
assert(networkFirstAt>cacheFirstAt,'le chemin cache-first versionné doit précéder le fallback network-first historique');
const versionedBlock=sw.slice(cacheFirstAt,networkFirstAt);
assert.match(versionedBlock,/cache\.match\(event\.request, \{ignoreSearch:true\}\)/,'un asset préchargé sans query-string doit être retrouvé immédiatement');
assert.ok(versionedBlock.indexOf('cache.match(event.request')<versionedBlock.indexOf('fetch(event.request'), 'le cache doit être consulté avant le réseau pour un asset versionné');
assert.match(versionedBlock,/if \(cached\) return cached/,'un hit cache doit court-circuiter le réseau au démarrage');

console.log('PASS: V234 garde un seul loader visuel jusqu’à home-rendered et sert le build courant cache-first.');
