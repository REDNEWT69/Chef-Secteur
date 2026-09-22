const BUILD_REV = "20260922-rotation-memory-escargot243";
const CACHE_NAME = "chef-secteur-stable-" + BUILD_REV;
const CORE_SHELL = [
  "./",
  "./index.html",
  "./src/chef-secteur.html",
  "./store-runner-visit-model.js",
  "./store-runner-visit-store.js",
  "./store-runner-visits.js",
  "./note-proofreader-v221.js",
  "./store-runner-visits.css",
  "./store-opening-hours.js",
  "./reliability-core.js"
];
const OPTIONAL_SHELL = [
  "./visit-report-slack.js",
  "./store-runner-opportunities.js",
  "./performance-data-v190.js", "./performance-ui-v190.js", "./assistant-performance-context-v192.js", "./visit-mobile-ux-v215.js", "./visit-mobile-tabs-v216.js", "./cuisiniste-contracts-v193.js", "./cuisiniste-contract-proposal-v225.js", "./cuisiniste-followup-v229.js",
  "./region-stores.js", "./region-stores.css",
  "./region-fetch-resilience.js",
  "./official-catalog.js",
  "./data/official-stores.json",
  "./manifest.webmanifest",
  "./app-icon.svg",
  "./store-runner-logo.jpg",
  "./store-runner-branding.js",
  "./navigation-controller.js",
  "./profile-controller.js",
  "./calendar-oauth.js",
  "./planning-generation-controller.js",
  "./planning-cascade-v181.js",
  "./calendar-enhancements.js",
  "./ui-polish.js",
  "./route-polish.js",
  "./planning-ui-fixes.js",
  "./ai-gateway-config.js",
  "./assistant-upgrade.js",
  "./assistant-visit-context.js",
  "./ai-context-limit.js",
  "./assistant-store-lookup.js",
  "./map-layer-fix.js",
  "./timeline-end-times.js",
  "./visit-counting.js",
  "./range-planner-v2.js",
  "./planning-day-origin.js",
  "./boulanger-default-hours.js",
  "./store-photos.js",
  "./terrain-planning-v1.js",
  "./working-hours-end.js",
  "./daily-capacity.js",
  "./planning-pro-plus.js",
  "./planning-summary-v219.js",
  "./period-day-slider.js",
  "./planning-manual-visits.js",
  "./workdays-enforcer.js",
  "./visit-history-delete.js",
  "./assistant-sheet-drag.js",
  "./visual-refresh-v1.js",
  "./home-refresh-v2.js",
  "./sector-pilotage.js",
  "./v182-fixes.js",
  "./priority-campaign-v187.js",
  "./auto-planning-fix.js",
  "./connection-ui.js",
  "./update-manager.js",
  "./store-runner-whats-new.js",
  "./planning-manual-hours.js",
  "./reliability-core.js",
  "./glass-theme.css",
  "./reliability-ui.js",
  "./stores-layout-order.js",
  "./boulanger-national.js",
  "./national-sectors.js",
  "./sector-admin.js"
];
const SCOPE = self.registration.scope;
// Store Runner V2 (v2/) est une application volontairement isolée de ce
// service worker V1 : ne jamais coder /v2/ en dur, toujours le calculer
// depuis SCOPE (fonctionne aussi bien sous store-runner.fr que sous une URL
// GitHub Pages du type /Chef-Secteur/v2/).
const V2_PREFIX = new URL('./v2/', SCOPE).href;
const VERSION_URL = new URL('./version.json', SCOPE).href;
function requestFor(path){return new Request(new URL(path,SCOPE), {cache:'reload'});}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_SHELL.map(requestFor));
    await Promise.allSettled(OPTIONAL_SHELL.map(path => cache.add(requestFor(path))));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('chef-secteur-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Exclusion V2 : avant toute logique de cache et avant tout respondWith. Le
  // navigateur effectue sa requête réseau normale pour /v2/, sans lecture ni
  // écriture dans le cache V1.
  if (url.href.startsWith(V2_PREFIX)) return;
  // Le manifeste de version doit toujours venir du réseau : sinon l'interface de mise à
  // jour peut comparer l'application à une ancienne copie mise en cache. On ignore ici
  // le query-string anti-cache ajouté par update-manager.js.
  if (url.href.split('?')[0] === VERSION_URL && event.request.method === 'GET') {
    event.respondWith(fetch(event.request, {cache:'no-store'}));
    return;
  }
  if (event.request.method !== 'GET' || !url.href.startsWith(SCOPE)) return;

  // V234 : les assets explicitement rattachés au BUILD_REV courant sont immuables pour
  // cette version. Le nouveau SW les a déjà préchargés pendant install(), donc les
  // reprendre immédiatement du cache évite de refaire des dizaines d'allers-retours
  // réseau au démarrage Android. Un asset absent du cache retombe proprement sur le réseau.
  if (url.searchParams.get('rev') === BUILD_REV) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      let cached = await cache.match(event.request);
      if (!cached) cached = await cache.match(event.request, {ignoreSearch:true});
      if (cached) return cached;
      try {
        const response = await fetch(event.request, {cache:'no-store'});
        if (!response.ok) throw new Error('HTTP '+response.status);
        await cache.put(event.request,response.clone());
        return response;
      } catch (error) {
        return new Response('Fichier indisponible hors ligne', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }

  // Les requêtes non versionnées restent network-first : cela préserve le comportement
  // historique pour les pages et données dont la fraîcheur n'est pas garantie par BUILD_REV.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request, {cache:'no-store'});
      if (!response.ok) throw new Error('HTTP '+response.status);
      await cache.put(event.request,response.clone());
      return response;
    } catch (error) {
      let cached = await cache.match(event.request);
      if (!cached) cached = await cache.match(event.request, {ignoreSearch:true});
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const entry = await cache.match(new URL('./index.html',SCOPE).href, {ignoreSearch:true});
        if (entry) return entry;
      }
      return new Response('Fichier indisponible hors ligne', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
