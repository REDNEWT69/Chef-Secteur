const fs=require('fs');
const path=require('path');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');
function forbid(file,label,re){if(re.test(read(file)))throw new Error(`${file}: interdit: ${label}`)}
function requireMatch(file,label,re){const m=read(file).match(re);if(!m)throw new Error(`${file}: requis absent: ${label}`);return m}
function forbidMany(file,pairs){for(const [label,re] of pairs)forbid(file,label,re)}

for(const file of ['stores-layout-order.js','auto-planning-fix.js','connection-ui.js','ai-gateway-config.js'])forbid(file,'boucle setInterval',/\bsetInterval\s*\(/);
for(const file of ['planning-ui-fixes.js','timeline-end-times.js','route-polish.js','visual-refresh-v1.js'])forbidMany(file,[['wrapper renderAll',/window\.renderAll\s*=\s*function/],['wrapper renderWeek',/window\.renderWeek\s*=\s*function/]]);
forbidMany('manager-home-fixes.js',[['wrapper renderAll',/window\.renderAll\s*=\s*function/],['wrapper syncGoogleCalendar',/window\.syncGoogleCalendar\s*=\s*async\s+function/]]);
forbidMany('calendar-enhancements.js',[['wrapper renderHeader',/window\.renderHeader\s*=\s*function/],['wrapper renderHome',/window\.renderHome\s*=\s*function/],['wrapper renderWeek',/window\.renderWeek\s*=\s*function/]]);
for(const [label,re] of [['observer contexte header',/headerContextObserver/],['observer contexte accueil',/homeContextObserver/],['observer semaine',/weekObserver/],['cible semaine observée',/observedWeek/]])requireMatch('calendar-enhancements.js',label,re);

forbidMany('auto-planning-fix.js',[['sauvegarde profil',/window\.saveProfile\s*=/],['override baseObj',/window\.baseObj\s*=/],['override havBase',/window\.havBase\s*=/],['base Francheville codée en dur',/Francheville/],['départ temporaire session',/chef_departure_override_v1/],['wrapper Google Agenda',/window\.syncGoogleCalendar\s*=(?!=)/],['token Google',/chef_secteur_google_token_v2/]]);
requireMatch('auto-planning-fix.js','application automatique Reliability',/R\.propose/);

forbid('sector-admin.js','ancienne limite 500 magasins',/\.slice\(\s*0\s*,\s*500\s*\)/);
requireMatch('sector-admin.js','filtre enseigne intégré',/saBrandFilter/);
requireMatch('sector-admin.js','chargement progressif du catalogue',/Afficher plus/);
forbidMany('official-catalog.js',[['ancienne limite 300 magasins',/\.slice\(\s*0\s*,\s*300\s*\)/]]);
for(const [label,re] of [['taille de page du carnet',/PAGE_SIZE\s*=\s*150/],['limite visible progressive',/visibleLimit/],['bouton afficher plus',/Afficher plus/],['reset pagination filtres',/resetAndRender/]])requireMatch('official-catalog.js',label,re);

forbidMany('store-runner-branding.js',[['ancien chargeur secteur',/sector-brand-filter\.js/],['chargement dynamique de scripts',/createElement\(['"]script['"]\)/]]);
const branding=read('store-runner-branding.js');
if(/\bsetInterval\s*\(/.test(branding))throw new Error('Branding: setInterval interdit');
for(const [label,re] of [['cible observer',/observerHost/],['déconnexion observer',/observer\.disconnect\(\)/],['retries bornés',/if\(!ready&&retry<20\)/],['bonne cible observer',/observerHost===host/]])if(!re.test(branding))throw new Error(`Branding: ${label} absent`);

forbidMany('stores-layout-order.js',[['wrapper renderStores',/window\.renderStores\s*=\s*function/],['chargeur imbriqué',/createElement\(['"]script['"]\)|loadScript\s*\(|withModuleRev\s*\(/]]);
for(const [label,re] of [['résultats région observés',/observedRegionResults/],['reconnexion région',/observedRegionResults\s*!==\s*results/],['déconnexion région',/regionResultsObserver\.disconnect\(\)/],['liste magasins observée',/storeListObserver/],['reconnexion magasins',/observedStoreList\s*===\s*list/],['déconnexion magasins',/storeListObserver\.disconnect\(\)/]])requireMatch('stores-layout-order.js',label,re);

const deploy=read('.github/workflows/deploy-pages.yml');
if(!/^name:\s*Deploy Store Runner/m.test(deploy))throw new Error('Workflow: nom Store Runner absent');
if(/Chef Secteur SAMSUNG/.test(deploy))throw new Error('Workflow: ancien branding encore présent');

const calendar=read('calendar-oauth.js');
if(/client_secret/i.test(calendar))throw new Error('Agenda: client_secret interdit côté navigateur');
if(/localStorage\.(?:getItem|setItem)\(\s*TOKEN_KEY/.test(calendar))throw new Error('Agenda: token Google interdit dans localStorage');
if(!/sessionStorage\.getItem\(TOKEN_KEY\)|sget\(sessionStorage,TOKEN_KEY\)/.test(calendar))throw new Error('Agenda: token Google doit rester en sessionStorage');
if((calendar.match(/window\.syncGoogleCalendar\s*=(?!=)/g)||[]).length!==1)throw new Error('Agenda: un seul propriétaire syncGoogleCalendar attendu');
requireMatch('calendar-oauth.js','marqueur propriétaire synchro',/__storeRunnerCalendarSyncOwner/);

const ai=read('ai-gateway-config.js');
if(/\b(?:client_secret|api[_-]?key)\b\s*[:=]\s*['"][^'"]{12,}['"]/i.test(ai))throw new Error('IA: secret ou clé API détecté côté navigateur');
if(!/workers\.dev/.test(ai))throw new Error('IA: passerelle publique attendue absente');
if(!/MAX_TRIES\s*=\s*\d+/.test(ai)||!/setTimeout\(retry,\s*100\)/.test(ai))throw new Error('IA: retry borné attendu absent');

const index=read('index.html'),sw=read('sw.js');
const indexRev=requireMatch('index.html','BUILD_REV',/const BUILD_REV=['\"]([^'\"]+)['\"]/)[1];
const swRev=requireMatch('sw.js','BUILD_REV',/const BUILD_REV\s*=\s*['\"]([^'\"]+)['\"]/)[1];
if(indexRev!==swRev)throw new Error(`PWA: BUILD_REV désaligné (${indexRev} != ${swRev})`);
if(!index.includes(`manifest.webmanifest?rev=${indexRev}`))throw new Error('PWA: manifest non aligné');
for(const [label,re] of [['viewport-fit',/viewport-fit=cover/],['mode Apple',/apple-mobile-web-app-capable[^>]+content=['\"]yes['\"]/],['status bar Apple',/apple-mobile-web-app-status-bar-style/],['apple touch icon',/apple-touch-icon/],['SW no-cache',/serviceWorker\.register\(['\"]\.\/sw\.js['\"],\s*\{updateViaCache:['\"]none['\"]\}/]])if(!re.test(index))throw new Error(`PWA/iPhone: ${label} absent`);
if(!/CACHE_NAME\s*=\s*['\"]chef-secteur-stable-['\"]\s*\+\s*BUILD_REV/.test(sw))throw new Error('PWA: cache non dérivé de BUILD_REV');
if(!/skipWaiting\(\)/.test(sw)||!/clients\.claim\(\)/.test(sw))throw new Error('PWA: activation immédiate incomplète');

for(const asset of ['./region-fetch-resilience.js','./official-catalog.js','./data/official-stores.json'])if(!sw.includes(`"${asset}"`)&&!sw.includes(`'${asset}'`))throw new Error(`PWA: ressource magasins absente du cache: ${asset}`);
for(const asset of ['./navigation-controller.js','./profile-controller.js','./store-runner-branding.js','./planning-autofix.js','./boulanger-national.js','./national-sectors.js','./sector-admin.js','./stores-layout-order.js'])if(!index.includes(`'${asset}'`)&&!index.includes(`"${asset}"`))throw new Error(`Chargeur principal: module explicite absent: ${asset}`);
const runtimeAssets=[...index.matchAll(/['\"](\.\/[A-Za-z0-9_./-]+\.(?:js|css))['\"]/g)].map(m=>m[1]);
for(const asset of new Set(runtimeAssets.filter(a=>a!=='./sw.js')))if(!sw.includes(`"${asset}"`)&&!sw.includes(`'${asset}'`))throw new Error(`PWA: ressource runtime absente du cache: ${asset}`);

console.log(`Architecture guards: OK · PWA ${indexRev}`);
