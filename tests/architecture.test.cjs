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
['stores-layout-order.js','auto-planning-fix.js','connection-ui.js'].forEach(file=>forbid(file,noPermanentLoop));

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
