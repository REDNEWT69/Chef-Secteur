const fs=require('fs');
const assert=require('assert/strict');

const gateway=fs.readFileSync('ai-gateway-config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

assert.match(gateway,/const DEFAULT_GATEWAY='\/api\/ai'/,'V332: la passerelle IA doit rester sous le domaine Store Runner');
assert.doesNotMatch(gateway,/https:\/\/[^'"\s]+\.workers\.dev/,'V332: le frontend ne doit plus exposer d’URL workers.dev');

assert.match(sw,/const AI_API_PREFIX = new URL\('\.\/api\/ai', SCOPE\)\.href/,'V332: le service worker doit connaître la route IA protégée');
assert.match(sw,/const ACCESS_PATH_PREFIX = '\/cdn-cgi\/access\/'/,'V332: le service worker doit connaître les endpoints natifs Cloudflare Access');
assert.match(sw,/url\.origin === SCOPE_ORIGIN && url\.pathname\.startsWith\(ACCESS_PATH_PREFIX\)/,'V332: logout et callbacks Access doivent contourner totalement le service worker');
assert.match(sw,/if \(event\.request\.mode === 'navigate'\) return;/,'V332: les navigations doivent rester sous contrôle réseau/Cloudflare Access');
assert.match(sw,/if \(url\.href\.startsWith\(AI_API_PREFIX\)\) return;/,'V332: le service worker ne doit jamais intercepter l’API IA');
assert.doesNotMatch(sw,/cache\.match\(new URL\('\.\/index\.html',SCOPE\)\.href/,'V332: aucune navigation ne doit retomber sur une coque PWA en cache');
assert.match(sw,/!response\.redirected/,'V332: une redirection d’authentification ne doit pas être mise en cache');
assert.match(sw,/responseOrigin === SCOPE_ORIGIN/,'V332: seuls les assets répondant depuis le domaine attendu peuvent rafraîchir le cache');

console.log('Cloudflare Access V332 guards: OK · same-origin AI + Access endpoints/network-only navigation + no Access redirect cache');
