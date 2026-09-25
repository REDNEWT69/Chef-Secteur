const assert=require('node:assert/strict');
const fs=require('fs');
const UI=require('../performance-ui-v190.js');
const fields=UI.suggestedStoreFields({retailer:'BOULANGER',site:'BOULANGER AUBIERE / Clermont'});
assert.equal(fields.enseigne,'Boulanger');
assert.equal(fields.ville,'AUBIERE');
assert.equal(fields.sourceName,'BOULANGER AUBIERE / Clermont');
const ui=fs.readFileSync('performance-ui-v190.js','utf8');
assert.match(ui,/Ajouter ce magasin à mon secteur/);
// V261 : l'ajout passe par l'écran unique store-add-v261.js (recherche, aperçu, doublon,
// RegionStores.commit) ; le rattachement n'est retenu qu'après un ajout réel.
assert.match(ui,/StoreRunnerStoreAdd/);
assert.match(ui,/A\.open\(\{drafts:\[suggestedStoreFields\(r\)\],onAdded:/);
assert.match(ui,/onAdded:store=>\{P\.rememberMatch\(db\(\),r\.key,store\.id\)/);
assert.doesNotMatch(ui,/data-v209-field|v209Field|Latitude|Longitude/,'plus aucun formulaire de coordonnées dans le pilotage');
assert.match(ui,/rattaché.*sur/);
assert.doesNotMatch(ui,/state\.plan\s*=|state\.plan\[/,'V209 ne doit jamais modifier le planning');
const profile=fs.readFileSync('profile-controller.js','utf8');
assert.match(profile,/window\.StoreRunnerGeocode=\{forward:forwardGeocode,reverse:reverseGeocode\}/);
assert.match(profile,/postcode:postcode/);
console.log('performance-store-reconcile-v209: OK · Aubière prérempli, création par l’écran unique V261, mapping persisté après ajout');
