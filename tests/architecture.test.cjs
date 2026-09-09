const fs=require('fs');
const path=require('path');

function read(file){return fs.readFileSync(path.join(process.cwd(),file),'utf8')}
function forbid(file,patterns){
  const src=read(file);
  for(const [label,re] of patterns){
    if(re.test(src))throw new Error(`${file}: interdit: ${label}`);
  }
}

function requireMatch(file,label,re){
  const src=read(file);
  const match=src.match(re);
  if(!match)throw new Error(`${file}: requis absent: ${label}`);
  return match;
}

const noPermanentLoop=[['boucle setInterval',/\bsetInterval\s*\(/]];
['stores-layout-order.js','auto-planning-fix.js','connection-ui.js','ai-gateway-config.js'].forEach(file=>forbid(file,noPermanentLoop));

forbid('planning-ui-fixes.js',[
  ['wrapper renderAll',/window\.renderAll\s*=\s*function/],
  ['wrapper renderWeek',/window\.renderWeek\s*=\s*function/]
]);

forbid('manager-home-fixes.js',[
  ['wrapper renderAll',/window\.renderAll\s*=\s*function/],
  ['wrapper syncGoogleCalendar',/window\.syncGoogleCalendar\s*=\s*async\s+function/]
]);

forbid('timeline-end-times.js',[
  ['wrapper renderAll',/window\.renderAll\s*=\s*function/],
  ['wrapper renderWeek',/window\.renderWeek\s*=\s*function/]
]);

['route-polish.js','visual-refresh-v1.js'].forEach(file=>forbid(file,[
  ['wrapper renderAll',/window\.renderAll\s*=\s*function/],
  ['wrapper renderWeek',/window\.renderWeek\s*=\s*function/]
]));

forbid('sector-admin.js',[
  ['ancienne limite 500 magasins',/\.slice\(\s*0\s*,\s*500\s*\)/]
]);
forbid('store-runner-branding.js',[
  ['ancien chargeur de filtre secteur',/sector-brand-filter\.js/]
]);
requireMatch('sector-admin.js','filtre enseigne intégré',/saBrandFilter/);
requireMatch('sector-admin.js','chargement progressif du catalogue',/Afficher plus/);

forbid('stores-layout-order.js',[
  ['révision datée codée en dur',/\?rev=20\d{6}/]
]);
requireMatch('stores-layout-order.js','lecture de la révision du module',/document\.currentScript/);
requireMatch('stores-layout-order.js','héritage de révision des sous-modules',/withModuleRev/);
requireMatch('stores-layout-order.js','cible observée du filtre régional',/observedRegionResults/);
requireMatch('stores-layout-order.js','reconnexion observer sur nouvelle liste',/observedRegionResults\s*!==\s*results/);
requireMatch('stores-layout-order.js','déconnexion ancien observer régional',/regionResultsObserver\.disconnect\(\)/);

const branding=read('store-runner-branding.js');
if(/\bsetInterval\s*\(/.test(branding))throw new Error('Branding: setInterval interdit');
if(!/observerHost/.test(branding))throw new Error('Branding: cible observer dédiée absente');
if(!/observer\.disconnect\(\)/.test(branding))throw new Error('Branding: reconnexion observer sans déconnexion');
if(!/if\(!ready&&retry<20\)/.test(branding))throw new Error('Branding: les retries doivent s’arrêter dès que l’interface est prête');
if(!/observerHost===host/.test(branding))throw new Error('Branding: observer doit être conservé uniquement sur la bonne cible');

const deployWorkflow=read('.github/workflows/deploy-pages.yml');
if(!/^name:\s*Deploy Store Runner/m.test(deployWorkflow))throw new Error('Workflow: nom Store Runner absent');
if(/Chef Secteur SAMSUNG/.test(deployWorkflow))throw new Error('Workflow: ancien branding encore présent');

const calendarOauth=read('calendar-oauth.js');
if(/client_secret/i.test(calendarOauth))throw new Error('Agenda: client_secret ne doit jamais être embarqué côté navigateur');
if(/localStorage\.(?:getItem|setItem)\(\s*TOKEN_KEY/.test(calendarOauth))throw new Error('Agenda: token Google interdit dans localStorage');
if(!/sessionStorage\.getItem\(TOKEN_KEY\)/.test(calendarOauth))throw new Error('Agenda: token Google doit rester en sessionStorage');

const aiGateway=read('ai-gateway-config.js');
if(/\b(?:client_secret|api[_-]?key)\b\s*[:=]\s*['"][^'"]{12,}['"]/i.test(aiGateway))throw new Error('IA: secret ou clé API détecté côté navigateur');
if(!/workers\.dev/.test(aiGateway))throw new Error('IA: passerelle publique attendue absente');
if(!/MAX_TRIES\s*=\s*\d+/.test(aiGateway)||!/setTimeout\(retry,\s*100\)/.test(aiGateway))throw new Error('IA: retry borné attendu absent');

const index=read('index.html');
const sw=read('sw.js');
const indexRev=requireMatch('index.html','BUILD_REV',/const BUILD_REV=['\"]([^'\"]+)['\"]/)[1];
const swRev=requireMatch('sw.js','BUILD_REV',/const BUILD_REV\s*=\s*['\"]([^'\"]+)['\"]/)[1];
if(indexRev!==swRev)throw new Error(`PWA: BUILD_REV désaligné (${indexRev} != ${swRev})`);
if(!index.includes(`manifest.webmanifest?rev=${indexRev}`))throw new Error('PWA: manifest non aligné sur BUILD_REV');
if(!/viewport-fit=cover/.test(index))throw new Error('iPhone: viewport-fit=cover absent');
if(!/apple-mobile-web-app-capable[^>]+content=['\"]yes['\"]/.test(index))throw new Error('iPhone: mode web-app Apple absent');
if(!/apple-mobile-web-app-status-bar-style/.test(index))throw new Error('iPhone: style barre de statut absent');
if(!/apple-touch-icon/.test(index))throw new Error('iPhone: apple-touch-icon absent');
if(!/serviceWorker\.register\(['\"]\.\/sw\.js['\"],\s*\{updateViaCache:['\"]none['\"]\}/.test(index))throw new Error('PWA: service worker doit utiliser updateViaCache none');
if(!/CACHE_NAME\s*=\s*['\"]chef-secteur-stable-['\"]\s*\+\s*BUILD_REV/.test(sw))throw new Error('PWA: cache non dérivé de BUILD_REV');
if(!/skipWaiting\(\)/.test(sw)||!/clients\.claim\(\)/.test(sw))throw new Error('PWA: activation immédiate du nouveau worker incomplète');

console.log(`Architecture guards: OK · PWA ${indexRev}`);
