const fs=require('fs');
const assert=require('assert/strict');

const index=fs.readFileSync(__dirname+'/../index.html','utf8');
const source=fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8');

for(const [name,html] of [['shell',index],['runtime',source]]){
  const viewport=(html.match(/<meta name="viewport" content="([^"]+)"/)||[])[1]||'';
  assert.match(viewport,/width=device-width/ ,name+' doit suivre la largeur de l’appareil');
  assert.match(viewport,/initial-scale=1/,name+' doit démarrer à l’échelle normale');
  assert.doesNotMatch(viewport,/user-scalable\s*=\s*no/i,name+' doit préserver le pinch-to-zoom');
  assert.doesNotMatch(viewport,/(?:maximum|minimum)-scale/i,name+' ne doit pas verrouiller l’échelle accessible');
}

assert.match(source,/@media\(max-width:650px\)\{[^}]*input:not\(\[type\]\)[^}]*input\[type=text\][^}]*select,textarea\{font-size:16px!important\}\}/,
  'les champs textuels mobiles doivent rester à 16 px pour empêcher l’auto-zoom Safari');
assert.doesNotMatch(source,/(?:html|body|\*)\s*\{[^}]*touch-action\s*:\s*none/i,
  'le correctif ne doit pas désactiver les gestes de zoom sur la page');

console.log('PASS: champs mobiles >= 16 px sans verrouiller le pinch-to-zoom.');
