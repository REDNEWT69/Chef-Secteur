'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'home-refresh-v2.js'), 'utf8');

assert(!/samsung-wordmark\.svg/i.test(home), 'home-refresh-v2.js ne doit plus générer le wordmark Samsung');
assert(!/>\s*Chef Secteur\s*</i.test(home), 'home-refresh-v2.js ne doit plus générer le libellé visible « Chef Secteur »');
assert(!/alt=["']SAMSUNG["']/i.test(home), 'home-refresh-v2.js ne doit plus générer un alt visible Samsung');
assert(/srBrandName[^>]*>Store Runner</i.test(home), 'la home doit générer directement le nom Store Runner');
assert(/srBrandLogo[^>]*app-icon\.svg/i.test(home), 'la home doit générer directement le logo Store Runner');

console.log('runtime-branding-source: ok');
