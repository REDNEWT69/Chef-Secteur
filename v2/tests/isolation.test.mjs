import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const index = await readFile(resolve(root, 'index.html'), 'utf8');
const sw = await readFile(resolve(root, 'sw.js'), 'utf8');

assert(!index.includes('v2/'), 'index.html ne doit charger aucun fichier de v2/ pendant V2-01');
assert(!sw.includes('v2/'), 'sw.js ne doit mettre aucun fichier de v2/ en cache pendant V2-01');

console.log('v2 isolation: ok');
