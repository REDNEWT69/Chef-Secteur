const fs=require('fs');
const assert=require('assert');

const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const manager=fs.readFileSync('update-manager.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));

assert(index.includes("'./update-manager.js'"),'update-manager.js doit être chargé par le shell V1');
assert(sw.includes('"./update-manager.js"'),'update-manager.js doit être disponible dans le shell hors ligne');
assert(manager.includes("const VERSION_URL='./version.json'"),'le gestionnaire doit utiliser version.json');
assert(manager.includes("cache:'no-store'"),'la vérification de version doit contourner le cache HTTP');
assert(manager.includes("window.__STORE_RUNNER_BUILD_REV"),'la version réellement exécutée doit venir du bootloader');
assert(manager.includes("#moreSheetV2 .moreSheetGrid"),'l’accès aux mises à jour doit vivre dans le menu Plus');
assert(manager.includes("button.textContent='↻ Mise à jour'"),'le menu Plus doit exposer une entrée Mise à jour');
assert(manager.includes('openUpdateCenter'),'l’entrée du menu doit ouvrir le centre de mise à jour');
assert(!manager.includes("#planningSettings .settingsInner"),'le centre de mise à jour ne doit plus être injecté dans les réglages planning');
assert(manager.includes('Vérifier les mises à jour'),'le contrôle manuel doit être visible');
assert(manager.includes('Mettre à jour maintenant'),'le bouton d’installation doit exister');
assert(manager.includes('state.latest!==state.current'),'une alerte ne doit apparaître que si la version distante diffère');
assert(manager.includes('registration.update()'),'le bouton doit demander une vérification réelle du service worker');
assert(manager.includes("postMessage({type:'SKIP_WAITING'})"),'un worker en attente doit pouvoir être activé explicitement');
assert(manager.includes("addEventListener('controllerchange'"),'l’installation doit observer la prise de contrôle du nouveau worker');
assert(manager.includes("document.addEventListener('visibilitychange'"),'le retour au premier plan doit pouvoir revérifier la version');
assert(manager.includes('store-runner-last-seen-build'),'la première ouverture d’un nouveau build doit pouvoir être annoncée');
assert(manager.includes('catch(error)'),'une erreur réseau ne doit pas casser le démarrage de l’application');
assert(!manager.includes('new MutationObserver'),'le déplacement ne doit pas ajouter un observer global pour réparer le DOM');
assert(sw.includes("url.href.split('?')[0] === VERSION_URL"),'version.json avec query-string doit contourner le cache du service worker');
assert(sw.includes("event.data.type === 'SKIP_WAITING'"),'le service worker doit accepter l’activation demandée par l’interface');
const installStart=sw.indexOf("self.addEventListener('install'");
const activateStart=sw.indexOf("self.addEventListener('activate'");
assert(installStart>=0&&activateStart>installStart,'les blocs install/activate du service worker doivent exister');
const installBlock=sw.slice(installStart,activateStart);
assert(!installBlock.includes('skipWaiting()'),'une nouvelle version ne doit plus s’activer toute seule avant le clic utilisateur');
assert.strictEqual(version.channel,'stable','le manifeste de version doit rester sur le canal stable');
assert(/^\d+$/.test(String(version.displayVersion)),'displayVersion doit être un numéro lisible');

console.log('update manager menu contract ok:',version.displayVersion,version.latestBuild);
