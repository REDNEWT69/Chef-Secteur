import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';

const store = createStore();
assert.deepEqual(store.getState(), createEmptyState());

let notifications = 0;
const unsubscribe = store.subscribe(snapshot => {
  notifications += 1;
  assert.equal(snapshot.version, 2);
});

store.update(draft => {
  draft.profile.name = 'Secteur Test';
  draft.stores.push({ id: 'store-1' });
});
assert.equal(store.getState().profile.name, 'Secteur Test');
assert.equal(notifications, 1);

const detached = store.getState();
detached.profile.name = 'Mutation externe';
assert.equal(store.getState().profile.name, 'Secteur Test');

const invalid = createEmptyState();
invalid.appointments = {};
assert.throws(() => store.replace(invalid), /appointments/);
assert.equal(store.getState().profile.name, 'Secteur Test');

unsubscribe();
store.update(draft => { draft.settings.target = 20; });
assert.equal(notifications, 1);

console.log('v2 store: ok');
