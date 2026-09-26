// V262 — contrat du confort mobile : clavier, bouton retour Android, retouches visuelles.
// Le comportement réel est vérifié dans un vrai Chromium par mobile-ux-v262-browser.spec.cjs.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const mod=read('mobile-ux-v262.js'),index=read('index.html'),core=read('src/chef-secteur.html'),sw=read('sw.js');

// Chargé par le démarrage et mis en cache hors ligne.
assert.match(index,/'\.\/weekly-brief-import-v246b\.js','\.\/mobile-ux-v262\.js'\s*\]\.map\(scriptTag\)/,'index.html doit charger mobile-ux-v262.js en dernier module');
assert.match(sw,/"\.\/mobile-ux-v262\.js"/,'sw.js doit précacher mobile-ux-v262.js');

// Viewport : clavier Android en « resizes-content » (ignoré par iOS), zoom utilisateur intact.
for(const [name,src] of [['index.html',index],['src/chef-secteur.html',core]]){
  const meta=(src.match(/<meta name="viewport" content="([^"]+)">/)||[])[1]||'';
  assert.match(meta,/interactive-widget=resizes-content/,name+' : le clavier Android doit redimensionner la page');
  assert.match(meta,/width=device-width/);assert.match(meta,/initial-scale=1/);assert.match(meta,/viewport-fit=cover/);
  assert.doesNotMatch(meta,/user-scalable\s*=\s*no|maximum-scale/,name+' : le pinch zoom doit rester permis');
}

// Aucun propriétaire contourné, aucune boucle de surveillance, aucune donnée touchée.
assert.doesNotMatch(mod,/setInterval\(/,'aucune surveillance permanente');
assert.doesNotMatch(mod,/window\.(goTab|switchTab|openStoreQuick|closeStoreQuick|toggleAssistant|saveQuickNote)\s*=(?!=)/,'aucune fonction globale métier remplacée');
assert.doesNotMatch(mod,/root\.(goTab|switchTab|openStoreQuick|closeStoreQuick|toggleAssistant)\s*=(?!=)/,'aucune fonction globale métier remplacée');
assert.doesNotMatch(mod,/localStorage|__chefStorage|indexedDB|state\.|save\(\)/,'le module ne lit ni n’écrit aucune donnée');
assert.doesNotMatch(mod,/addEventListener\('(focus|visibilitychange)'/,'pas de rafraîchissement global au focus');

// Retour Android : une seule sentinelle, jamais consommée si elle vient d'un ancien document.
assert.match(mod,/pushState\(\{srBack:1\},'',root\.location\.href\)/,'la sentinelle garde l’URL de l’app');
assert.match(mod,/if\(!sentinelActive\|\|onSentinel\(\)\)return;/,'une navigation étrangère ne referme rien');
assert.match(mod,/if\(onSentinel\(\)\)\{try\{root\.history\.replaceState\(null/,'une sentinelle d’avant rechargement est neutralisée, jamais consommée');
assert.match(mod,/scrollRestoration='manual'/,'le retour ne doit pas faire sauter le défilement');
assert.ok(mod.indexOf("name:'assistant'")<mod.indexOf("name:'more'")&&mod.indexOf("name:'more'")<mod.indexOf("name:'store'")&&mod.indexOf("name:'store'")<mod.indexOf("name:'tab'"),'ordre de fermeture : assistant, menu, fiche, puis onglet');

// Clavier : barre basse et bouton IA retirés seulement pendant la saisie.
assert.match(mod,/html\[data-sr-keyboard="open"\] #bottomAppNav,html\[data-sr-keyboard="open"\] #assistFab\{display:none!important\}/);
assert.match(mod,/viewportHeight\(\)<baseline\.h-120/,'un clavier matériel ou une simple sélection ne masque rien');

// Retouches visuelles bornées au mobile.
const css=(mod.match(/const CSS=\[([\s\S]*?)\]\.join\(''\)/)||[])[1]||'';
assert.match(css,/^\s*'@media\(max-width:700px\)\{',/,'toutes les retouches sont limitées au mobile');
assert.match(css,/'#smartBrief\{display:none!important\}'/,'le bandeau répété quitte les onglets mobiles');
assert.match(css,/#storesPanel \.storeline \.flags\{display:grid!important/,'la rangée Imposer/Exclure/✎ reste nette avec des champs de 16 px');

// Modale de visite ancrée à l'écran même depuis une page défilée.
assert.match(read('visit-mobile-ux-v215.js'),/#\$\{DIALOG_ID\}\.srVisitV215\{position:fixed;/);
assert.doesNotMatch(read('visit-mobile-ux-v215.js'),/#\$\{DIALOG_ID\}\.srVisitV215\{position:relative/);

// Aucun glyphe propre aux polices Apple (carré vide sur Android).
for(const f of fs.readdirSync(path.join(__dirname,'..')).filter(f=>/\.(js|html|css)$/.test(f)).concat(['src/chef-secteur.html'])){
  assert.ok(!read(f).includes(''),f+' : le logo Apple (U+F8FF) s’affiche en carré vide sur Android');
}

// /v2/ reste isolé.
assert.doesNotMatch(mod,/v2\//);
console.log('PASS: V262 — clavier, retour Android, modales ancrées et retouches mobiles verrouillés.');
