import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { STORAGE_KEY, loadState, resetState, saveState } from '../src/storage/persistence.mjs';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const storage = new MemoryStorage();
storage.setItem('chef_sector_legacy', 'keep-me');

const state = createEmptyState();
state.profile.name = 'Test';
saveState(storage, state);
assert.equal(storage.getItem('chef_sector_legacy'), 'keep-me');
assert.equal(loadState(storage).profile.name, 'Test');

storage.setItem(STORAGE_KEY, '{broken');
assert.throws(() => loadState(storage), /JSON invalide/);

const invalidStored = createEmptyState();
invalidStored.planning = [];
storage.setItem(STORAGE_KEY, JSON.stringify(invalidStored));
assert.throws(() => loadState(storage), /planning/);

storage.setItem(STORAGE_KEY, JSON.stringify(state));
const reset = resetState(storage);
assert.equal(storage.getItem(STORAGE_KEY), null);
assert.equal(storage.getItem('chef_sector_legacy'), 'keep-me');
assert.deepEqual(reset, createEmptyState());

console.log('v2 storage: ok');
