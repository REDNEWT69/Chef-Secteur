import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { exportStateJson, importStateJson } from '../src/storage/json-transfer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const validText = await readFile(resolve(here, '../fixtures/valid-state.json'), 'utf8');
const invalidText = await readFile(resolve(here, '../fixtures/invalid-state.json'), 'utf8');

const imported = importStateJson(validText);
assert.equal(imported.version, 2);
assert.equal(imported.stores.length, 1);
assert.equal(imported.profile.sectorName, 'Test');

assert.throws(() => importStateJson(invalidText), /version/);
assert.throws(() => importStateJson('{oops'), /JSON invalide/);

const exported = exportStateJson(imported);
const roundTrip = importStateJson(exported);
assert.deepEqual(roundTrip, imported);

console.log('v2 json transfer: ok');
