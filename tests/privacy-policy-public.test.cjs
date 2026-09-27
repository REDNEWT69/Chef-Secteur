/* Politique de confidentialité publique (Google Play Console) : https://store-runner.fr/confidentialite.html.
   La page est statique et indépendante du runtime : ni chargée par index.html ni mise en cache par sw.js.
   Ce test fige les rubriques exigées et les services tiers réellement appelés par l'application. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

assert.ok(fs.existsSync(path.join(root,'confidentialite.html')),'confidentialite.html doit exister à la racine publiée');
const page=read('confidentialite.html');

assert.match(page,/^<!doctype html>/i);
assert.match(page,/<html lang="fr">/);
assert.match(page,/name="viewport" content="width=device-width,initial-scale=1/);
assert.match(page,/<link rel="canonical" href="https:\/\/store-runner\.fr\/confidentialite\.html">/);
assert.match(page,/Dernière mise à jour : \d{1,2} [a-zéû]+ \d{4}\./);

for(const heading of ['Données traitées et finalités','Où les données sont stockées','Sauvegarde et restauration','Services tiers utilisés','Partage des données','Suppression et vos droits','Contact'])
  assert.ok(page.includes(heading),'rubrique manquante : '+heading);

/* Services tiers effectivement appelés par le runtime V1 : les retirer d'ici suppose de les retirer du code. */
for(const provider of ['Cloudflare','Groq','Nominatim','OSRM','Overpass','geo.api.gouv.fr','Google Agenda','Google Maps','GitHub Pages','unpkg','jsDelivr'])
  assert.ok(page.includes(provider),'service tiers non déclaré : '+provider);

assert.match(page,/IndexedDB/);
assert.match(page,/localStorage/);
assert.match(page,/sessionStorage/);
assert.match(page,/lecture seule/);
assert.match(page,/Limited Use/);
assert.match(page,/photos \(seul leur nombre/);
assert.match(page,/href="https:\/\/github\.com\/REDNEWT69\/Chef-Secteur\/issues"/);
assert.match(page,/href="\.\/privacy\.html"/);

/* Aucune ressource externe ni script : page lisible hors de l'application et sans traceur. */
assert.doesNotMatch(page,/<script\b/i);
assert.doesNotMatch(page,/<link[^>]+rel="stylesheet"/i);
assert.doesNotMatch(page,/<img[^>]+src="https?:/i);

/* Découplage du runtime : pas de bump BUILD_REV, pas de cache PWA. */
assert.doesNotMatch(read('index.html'),/confidentialite\.html/);
assert.doesNotMatch(read('sw.js'),/confidentialite\.html/);

console.log('privacy-policy-public: OK');
