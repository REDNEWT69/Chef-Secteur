const CACHE_NAME = "chef-secteur-region17";
const APP_SHELL = [
  "./region-stores.js?rev=region17", "./region-stores.css?rev=region17",
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./samsung-wordmark.svg",
  "./src/chef-secteur.html?rev=safe16",
  "./calendar-oauth.js?rev=safe16",
  "./calendar-enhancements.js?rev=20260907-4",
  "./ui-polish.js?rev=20260907-2",
  "./route-polish.js?rev=20260907-free-map2",
  "./planning-ui-fixes.js?rev=20260907-1",
  "./ai-gateway-config.js?rev=20260907-groq4",
  "./assistant-upgrade.js?rev=20260907-groq4",
  "./ai-context-limit.js?rev=20260907-1",
  "./assistant-store-lookup.js?rev=20260907-2",
  "./map-layer-fix.js?rev=20260907-1",
  "./timeline-end-times.js?rev=20260907-2",
  "./range-planner-v2.js?rev=safe16",
  "./working-hours-end.js?rev=safe16",
  "./daily-capacity.js?rev=safe16",
  "./planning-pro-plus.js?rev=20260907-3",
  "./period-day-slider.js?rev=20260907-4",
  "./workdays-enforcer.js?rev=safe16",
  "./visit-history-delete.js?rev=20260907-1",
  "./assistant-sheet-drag.js?rev=observer10",
  "./visual-refresh-v1.js?rev=20260907-glass4",
  "./home-refresh-v2.js?rev=safe16",
  "./connection-ui.js?rev=safe16",
  "./reliability-core.js?rev=safe16",
  "./glass-theme.css?rev=safe16",
  "./reliability-ui.js?rev=safe16"
];
const SCOPE = self.registration.scope;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map(path => new Request(new URL(path,SCOPE), {cache:'reload'})));
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
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // Only page navigation may use the app entry point; never scripts or CSS.
      if (event.request.mode === 'navigate') {
        const entry = await cache.match(new URL('./index.html',SCOPE).href);
        if (entry) return entry;
      }
      return new Response('Fichier indisponible hors ligne', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
