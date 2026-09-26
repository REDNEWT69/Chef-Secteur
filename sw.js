const BUILD_REV = "20260926-pwa261";
/* V261.2 hotfix : même révision applicative, nouveau namespace de cache afin que les
   PWA déjà installées récupèrent le correctif de capacité à la source (visit-counting.js)
   sans mélanger ancien et nouveau shell. Le BUILD_REV reste V261 : aucune migration. */
const CACHE_NAME = "chef-secteur-stable-" + BUILD_REV + "-capacity2612";
/* V260 — tout ce que index.html charge au démarrage est OBLIGATOIRE : un worker ne
   s'active jamais avec une version incomplète. Avant, 70 modules sur 80 étaient
   « optionnels » : un seul échec réseau pendant install() laissait une version qui
   cassait hors ligne. Si un fichier manque, l'installation échoue, l'ancienne version
   reste en place intacte et le navigateur réessaiera. */
const CORE_SHELL = [
  "./", "./index.html", "./src/chef-secteur.html", "./store-runner-visit-model.js",
  "./store-runner-visit-store.js", "./store-runner-visits.js", "./note-proofreader-v221.js",
  "./store-runner-visits.css", "./store-opening-hours.js", "./reliability-core.js",
  "./visit-report-slack.js", "./store-runner-opportunities.js", "./performance-data-v190.js",
  "./performance-ui-v190.js", "./assistant-performance-context-v192.js", "./weekly-brief-v246.js",
  "./weekly-brief-ui-v246.js", "./weekly-brief-import-v246b.js", "./visit-mobile-ux-v215.js",
  "./visit-mobile-tabs-v216.js", "./cuisiniste-contracts-v193.js",
  "./cuisiniste-contract-proposal-v225.js", "./cuisiniste-followup-v229.js", "./region-stores.js", "./store-add-v261.js",
  "./region-stores.css", "./region-fetch-resilience.js", "./official-catalog.js",
  "./manifest.webmanifest", "./app-icon.svg", "./store-runner-branding.js",
  "./navigation-controller.js", "./profile-controller.js", "./calendar-oauth.js",
  "./planning-generation-controller.js", "./planning-cascade-v181.js",
  "./calendar-enhancements.js", "./ui-polish.js", "./route-polish.js", "./planning-ui-fixes.js",
  "./ai-gateway-config.js", "./assistant-upgrade.js", "./assistant-visit-context.js",
  "./ai-context-limit.js", "./assistant-store-lookup.js", "./map-layer-fix.js",
  "./timeline-end-times.js", "./visit-counting.js", "./range-planner-v2.js",
  "./planning-day-origin.js", "./boulanger-default-hours.js", "./store-photos.js",
  "./terrain-planning-v1.js", "./working-hours-end.js", "./daily-capacity.js",
  "./planning-pro-plus.js", "./planning-summary-v219.js", "./period-day-slider.js",
  "./planning-manual-visits.js", "./planning-reorder-v254.js", "./workdays-enforcer.js",
  "./visit-history-delete.js", "./assistant-sheet-drag.js", "./visual-refresh-v1.js",
  "./home-refresh-v2.js", "./sector-pilotage.js", "./v182-fixes.js",
  "./planning-route-optimizer-v251.js", "./priority-campaign-v187.js", "./auto-planning-fix.js",
  "./connection-ui.js", "./update-manager.js", "./store-runner-whats-new.js",
  "./planning-manual-hours.js", "./glass-theme.css", "./reliability-ui.js",
  "./stores-layout-order.js", "./boulanger-national.js", "./national-sectors.js",
  "./sector-admin.js"
];
/* Données, pas code : leur absence ne doit pas bloquer une mise à jour. */
const OPTIONAL_SHELL = [
  "./data/official-stores.json"
];
const SCOPE = self.registration.scope;
const SCOPE_PATH = new URL(SCOPE).pathname;
// Store Runner V2 (v2/) est une application volontairement isolée de ce
// service worker V1 : ne jamais coder /v2/ en dur, toujours le calculer
// depuis SCOPE (fonctionne aussi bien sous store-runner.fr que sous une URL
// GitHub Pages du type /Chef-Secteur/v2/).
const V2_PREFIX = new URL('./v2/', SCOPE).href;
const VERSION_URL = new URL('./version.json', SCOPE).href;
const SHELL_KEYS = [new URL('./', SCOPE).href, new URL('./index.html', SCOPE).href];
/* V260 — sur le terrain (sous-sol, zone blanche, réseau qui « traîne »), attendre le
   réseau pour la page d'accueil laissait l'écran figé 40 s et plus. Au-delà de ce délai,
   la version installée — complète et cohérente — s'ouvre ; la fraîcheur est ensuite
   l'affaire du gestionnaire de mise à jour. */
const NAVIGATION_TIMEOUT_MS = 4000;
const INSTALL_ATTEMPTS = 3;

function wait(ms){return new Promise(resolve => setTimeout(resolve, ms));}
function revUrl(path){const url = new URL(path, SCOPE); url.searchParams.set('rev', BUILD_REV); return url.href;}
/* Clé sans paramètre : les modules ajoutent des « ?ts=Date.now() » anti-cache. Avant
   V260, chaque ouverture du catalogue officiel ajoutait une copie de 450 Ko au cache,
   sans limite, dans le quota partagé avec les photos et la base IndexedDB. */
function plainKey(url){return url.origin + url.pathname;}
function unavailable(){return new Response('Fichier indisponible hors ligne', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});}
function isAppShellNavigation(request, url){
  return request.mode === 'navigate' && (url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH + 'index.html');
}

/* Le précache vise l'URL versionnée (?rev=BUILD_REV) : une URL jamais demandée ne peut
   pas sortir d'un cache CDN resté sur la version précédente. Plusieurs essais par
   fichier, parce qu'un réseau mobile coupe souvent une requête sur quatre-vingts. */
async function fetchForInstall(path){
  let lastError = null;
  for (let attempt = 0; attempt < INSTALL_ATTEMPTS; attempt++) {
    if (attempt) await wait(500 * attempt * attempt);
    try {
      const response = await fetch(revUrl(path), {cache:'no-store'});
      if (response.ok) return response;
      lastError = new Error(path + ' : HTTP ' + response.status);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error(path + ' indisponible');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    /* Le shell doit être exactement celui de cette révision : sinon ce worker servirait
       hors ligne l'ancienne page avec ses nouveaux fichiers. Refuser l'installation
       laisse l'ancienne version en place intacte et le navigateur réessaiera. */
    const shell = await fetchForInstall('./index.html');
    const html = await shell.clone().text();
    if (!html.includes("const BUILD_REV='" + BUILD_REV + "'")) {
      throw new Error('index.html publié ne correspond pas à ' + BUILD_REV + ' : installation reportée');
    }
    const assets = CORE_SHELL.filter(path => path !== './' && path !== './index.html');
    await Promise.all(assets.map(async path => cache.put(revUrl(path), await fetchForInstall(path))));
    await Promise.allSettled(OPTIONAL_SHELL.map(async path => cache.put(plainKey(new URL(path, SCOPE)), await fetchForInstall(path))));
    const type = shell.headers.get('Content-Type') || 'text/html; charset=utf-8';
    for (const key of SHELL_KEYS) await cache.put(key, new Response(html, {status:200, headers:{'Content-Type':type}}));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Seuls les caches de fichiers de l'application sont remplacés. IndexedDB (données
    // terrain, photos), localStorage et sessionStorage ne sont jamais touchés ici.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('chef-secteur-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  // V244 : update-manager.js demande la révision servie pour savoir si un simple
  // rechargement suffit (worker déjà à jour, page restée sur l'ancienne version).
  // V260 : il la demande aussi au worker en attente pour l'activer sans rechargement
  // quand la page tourne déjà sur cette même révision.
  if (event.data && event.data.type === 'GET_BUILD_REV' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({type:'BUILD_REV', buildRev: BUILD_REV});
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Exclusion V2 : avant toute logique de cache et avant tout respondWith. Le
  // navigateur effectue sa requête réseau normale pour /v2/, sans lecture ni
  // écriture dans le cache V1.
  if (url.href.startsWith(V2_PREFIX)) return;
  // Le manifeste de version doit toujours venir du réseau : sinon l'interface de mise à
  // jour peut comparer l'application à une ancienne copie mise en cache. On ignore ici
  // le query-string anti-cache ajouté par update-manager.js.
  if (url.href.split('?')[0] === VERSION_URL && request.method === 'GET') {
    event.respondWith(fetch(request, {cache:'no-store'}));
    return;
  }
  if (request.method !== 'GET' || !url.href.startsWith(SCOPE)) return;
  if (url.searchParams.get('rev') === BUILD_REV) { event.respondWith(ownRevisionAsset(request)); return; }
  if (isAppShellNavigation(request, url)) { event.respondWith(appShellNavigation(request)); return; }
  event.respondWith(networkFirst(request, url));
});

/* Stratégies du gestionnaire fetch — déclarées après lui, donc toujours après
   l'exclusion V2 (v2/tests/isolation.test.mjs).
   Une écriture de cache refusée (quota plein, réponse partielle…) ne doit jamais faire
   perdre une réponse réseau valide. Avant V260, l'échec de cache.put() partait dans le
   catch et servait 503 « hors ligne » alors que le fichier venait d'arriver. */
async function putSafely(cache, key, response){
  try { await cache.put(key, response); } catch (error) {}
}
/* BUILD_REV finit toujours par le numéro de version, qui ne fait que croître. */
function revisionNumber(rev){const m = String(rev || '').match(/(\d+)$/); return m ? Number(m[1]) : NaN;}
function pageRevision(html){const m = String(html || '').match(/const BUILD_REV='([^']+)'/); return m ? m[1] : null;}
async function cachedShell(cache){
  for (const key of SHELL_KEYS) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  return null;
}

/* Page d'accueil : réseau d'abord, borné dans le temps, puis la version installée.
   La réponse réseau n'est jamais écrite dans le cache : ce cache ne contient que le
   shell de SA révision, vérifié à l'installation. Un HTML plus récent servi en ligne
   ne peut donc pas se retrouver hors ligne sans les fichiers qui vont avec.
   Une page réseau PLUS ANCIENNE que la version installée (CDN encore sur l'ancienne
   publication juste après un déploiement) n'est jamais servie : elle chargerait ses
   anciens fichiers depuis un CDN à moitié à jour, et ferait redescendre l'appareil
   d'une version. La version installée, vérifiée, passe devant. */
async function appShellNavigation(request){
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request, {cache:'no-store'}).then(async response => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const html = await response.text();
    const type = response.headers.get('Content-Type') || 'text/html; charset=utf-8';
    return {html, page: new Response(html, {status:response.status, statusText:response.statusText, headers:{'Content-Type':type}})};
  });
  network.catch(() => {});
  const shell = await cachedShell(cache);
  if (!shell) {
    try { return (await network).page; } catch (error) { return unavailable(); }
  }
  let timer = null;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS); });
  try {
    const fresh = await Promise.race([network, timeout]);
    if (fresh) {
      const served = revisionNumber(pageRevision(fresh.html));
      if (!(served < revisionNumber(BUILD_REV))) return fresh.page;
    }
  } catch (error) {
  } finally {
    clearTimeout(timer);
  }
  return shell;
}

/* Fichier de CETTE révision : immuable, servi depuis le cache préchargé. */
async function ownRevisionAsset(request){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request, {cache:'no-store'});
    if (response.ok) await putSafely(cache, request, response.clone());
    return response;
  } catch (error) {
    return unavailable();
  }
}

/* Réseau d'abord pour tout le reste. Un fichier d'une AUTRE révision (?rev= différent)
   n'est jamais remplacé par une copie d'une autre version : avant V260, la recherche
   « ignoreSearch » servait l'ancien module à une page neuve dès qu'un fichier échouait
   — le mélange ancien HTML / nouveaux scripts que cette version supprime. */
async function networkFirst(request, url){
  const cache = await caches.open(CACHE_NAME);
  const foreignRevision = url.searchParams.has('rev');
  let response = null;
  try {
    response = await fetch(request, {cache:'no-store'});
    if (response.ok) {
      if (!foreignRevision) await putSafely(cache, plainKey(url), response.clone());
      return response;
    }
  } catch (error) {}
  let cached = null;
  if (!foreignRevision) {
    cached = await cache.match(plainKey(url));
    if (!cached) cached = await cache.match(request, {ignoreSearch:true});
  }
  if (cached) return cached;
  if (request.mode === 'navigate') {
    const shell = await cachedShell(cache);
    if (shell) return shell;
  }
  return response || unavailable();
}
