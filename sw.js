const CACHE_NAME='chef-secteur-apple-v2-20260907b';
const APP_SHELL=['./','./index.html','./manifest.webmanifest','./apple-v2/part01.txt','./apple-v2/part02.txt','./apple-v2/part03a.txt','./apple-v2/part03b.txt','./apple-v2/part04.txt','./apple-v2/part05.txt','./apple-v2/part06.txt','./apple-v2/part07.txt'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(c=>c||caches.match('./index.html'))))});
