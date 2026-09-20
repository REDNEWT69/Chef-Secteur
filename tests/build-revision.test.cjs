const fs=require('fs');
const assert=require('assert');
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const indexMatch=index.match(/const BUILD_REV='([^']+)'/);
const swMatch=sw.match(/const BUILD_REV = "([^"]+)"/);
assert(indexMatch,'BUILD_REV absent de index.html');
assert(swMatch,'BUILD_REV absent de sw.js');
assert.strictEqual(indexMatch[1],swMatch[1],'index.html et sw.js doivent partager le même BUILD_REV');
assert.strictEqual(indexMatch[1],version.latestBuild,'version.json doit publier exactement le BUILD_REV courant');
assert(!index.includes('20260910-assistant-visits1'),'ancienne révision encore présente dans index.html');
assert(!sw.includes('20260910-assistant-visits1'),'ancienne révision encore présente dans sw.js');
assert(index.includes("navigator.serviceWorker.addEventListener('controllerchange'"),'le bootloader doit recharger une fois quand un nouveau service worker prend le contrôle');
assert(index.includes("store-runner-sw-reload:"),'le rechargement de version doit être borné pour éviter une boucle');
assert(index.includes("window.__STORE_RUNNER_BUILD_REV=BUILD_REV"),'le build réellement exécuté doit être exposé à l’interface de mise à jour');
/* La révision publie aussi la version visible : store-runner-whats-new.js dérive le
   numéro affiché des derniers chiffres de BUILD_REV. Une révision qui ne finit pas par
   ces chiffres casse silencieusement l'écran Nouveautés. */
assert(new RegExp('(\\d{2,})$').test(indexMatch[1]),'BUILD_REV doit se terminer par la version visible');
assert.strictEqual(indexMatch[1].match(/(\d{2,})$/)[1],String(version.displayVersion),
  'les derniers chiffres de BUILD_REV doivent être exactement displayVersion');
console.log('build revision ok:',indexMatch[1]);
