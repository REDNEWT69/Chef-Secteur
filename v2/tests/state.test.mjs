import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { V2ValidationError, validateState } from '../src/core/validate.mjs';

const first = createEmptyState();
const second = createEmptyState();
assert.equal(validateState(first), first);

first.profile.name = 'Premier';
first.stores.push({ id: 'a' });
assert.deepEqual(second.profile, {});
assert.deepEqual(second.stores, []);

const wrongVersion = createEmptyState();
wrongVersion.version = 1;
assert.throws(() => validateState(wrongVersion), error => error instanceof V2ValidationError && error.path === 'version');

const wrongType = createEmptyState();
wrongType.stores = {};
assert.throws(() => validateState(wrongType), error => error instanceof V2ValidationError && error.path === 'stores');

console.log('v2 state: ok');
