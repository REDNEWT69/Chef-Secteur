const BUILD_REV = "20260911-fieldfix1";
const CACHE_NAME = "chef-secteur-stable-" + BUILD_REV;
const CORE_SHELL = [
  "./",
  "./index.html",
  "./src/chef-secteur.html",
  "./store-runner-visit-model.js",
  "./store-runner-visit-store.js",
  "./store-runner-visits.js",
  "./store-runner-visits.css",
  "./reliability-core.js"
];
const OPTIONAL_SHELL = [
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
  "./samsung-wordmark.svg",
  "./calendar-oauth.js",
  "./planning-generation-controller.js",
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
  "./working-hours-end.js",
  "./daily-capacity.js",
  "./planning-pro-plus.js",
  "./period-day-slider.js",
  "./workdays-enforcer.js",
  "./visit-history-delete.js",
  "./assistant-sheet-drag.js",
  "./visual-refresh-v1.js",
  "./home-refresh-v2.js",
  "./auto-planning-fix.js",
  "./connection-ui.js",
  "./reliability-core.js",
  "./glass-theme.css",
  "./reliability-ui.js",
  "./stores-layout-order.js",
  "./boulanger-national.js",
  "./national-sectors.js",
  "./sector-admin.js"
];
const SCOPE = self.registration.scope;
function requestFor(path){return new Request(new URL(path,SCOPE), {cache:'reload'});}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_SHELL.map(requestFor));
    await Promise.allSettled(OPTIONAL_SHELL.map(path => cache.add(requestFor(path))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('chef-secteur-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(SCOPE)) return;
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
