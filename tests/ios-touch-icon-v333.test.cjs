const fs=require('fs');
const assert=require('assert');

const png=fs.readFileSync('apple-touch-icon-v333.png');
assert.ok(png.length>1000,'apple-touch-icon-v333.png doit être un vrai fichier image');
assert.deepStrictEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10],'signature PNG invalide');

const branding=fs.readFileSync('store-runner-branding.js','utf8');
assert.match(branding,/apple-touch-icon-v333\.png\?rev=20260919-iosicon333/,'le runtime doit référencer le nouveau PNG iPhone');
assert.match(branding,/apple\.rel='apple-touch-icon'/,'le runtime doit injecter apple-touch-icon dans le document final');
assert.match(branding,/setAttr\(apple,'sizes','180x180'\)/,'taille iPhone 180x180 attendue');
assert.match(branding,/setAttr\(apple,'type','image\/png'\)/,'type PNG attendu');

console.log('ios-touch-icon-v333: ok');
