import assert from 'node:assert/strict';
import { createEmptyState } from '../src/core/state.mjs';
import { createStore } from '../src/core/store.mjs';
import { loadState, saveState, STORAGE_KEY } from '../src/storage/persistence.mjs';
import { createVisitsService, historyForStore, validateVisits } from '../src/visits/visits.mjs';

function setup(opaque = []) {
  const state = createEmptyState();
  state.stores = [{ id: 'one' }, { id: 'two' }, { id: 'inactive', active: false }];
  state.visits = opaque;
  state.actions = [{ id: 'synthetic-action' }];
  state.appointments = [{ id: 'synthetic-appointment' }];
  const store = createStore(state), values = new Map();
  let serial = 0, clock = new Date('2026-09-18T12:00:00.000Z'), fail = false;
  const storage = { removeItem: key => values.delete(key), getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (fail) throw Error('QuotaExceededError'); values.set(key, String(value));
  } };
  const persist = next => saveState(storage, next);
  persist(state);
  const service = createVisitsService({ store, persist, now: () => clock, makeId: () => String(++serial) });
  return { store, storage, service, persist, setClock(value) { clock = new Date(value); }, setFailure(value) { fail = value; } };
}

// Explicit sync persistence: no implicit successful no-op path.
{
  const { store } = setup();
  assert.throws(() => createVisitsService({ store }), /persist/);
  assert.throws(() => createVisitsService({ store, persist: async () => {} }), /synchrone/);
  const before = store.getState();
  const service = createVisitsService({ store, persist: () => Promise.resolve() });
  assert.throws(() => service.start('one'), /synchrone/);
  assert.deepEqual(store.getState(), before);
}

// Start/finish idempotence, store isolation, immutable reads and true reload.
{
  const { store, storage, service, setClock } = setup();
  const before = store.getState();
  const started = service.start('one');
  assert.equal(started.status, 'in_progress');
  assert.deepEqual(service.start('one'), started);
  assert.equal(store.getState().visits.length, 1);
  const reloadedStore = createStore(loadState(storage));
  const reopened = createVisitsService({ store: reloadedStore, persist: next => saveState(storage, next), now: () => new Date('2026-09-18T13:00:00.000Z') });
  assert.deepEqual(reopened.start('one'), started);
  const finished = reopened.finish(started.id);
  assert.deepEqual(reopened.finish(started.id), finished);
  assert.equal(finished.status, 'completed');
  assert.equal(loadState(storage).visits.length, 1);
  assert.equal(loadState(storage).version, 2);
  assert.deepEqual(historyForStore(loadState(storage), 'one'), [finished]);
  assert.deepEqual(reopened.history('two'), []);
  const copy = reopened.history('one'); copy[0].status = 'cancelled';
  assert.equal(reopened.history('one')[0].status, 'completed');
  for (const key of ['planning', 'actions', 'appointments', 'stores', 'settings']) {
    assert.deepEqual(loadState(storage)[key], before[key], key + ' remains unchanged');
  }
  assert.throws(() => reopened.cancel(started.id), /en cours/);
  assert.throws(() => service.start('missing'), /absent/);
  assert.throws(() => service.start('inactive'), /inactif/);
  assert.throws(() => service.finish('missing'), /introuvable/);
  setClock('2026-09-18T11:00:00.000Z');
  assert.throws(() => service.finish(started.id), /fin invalide/);
}

// Failed writes never publish a start, finish or cancellation to memory/disk.
for (const operation of ['start', 'finish', 'cancel']) {
  const { store, storage, service, setFailure } = setup();
  const visit = operation === 'start' ? null : service.start('one');
  const before = store.getState(), disk = storage.getItem(STORAGE_KEY);
  setFailure(true);
  assert.throws(() => service[operation](visit?.id ?? 'one'), /QuotaExceededError/);
  assert.deepEqual(store.getState(), before);
  assert.equal(storage.getItem(STORAGE_KEY), disk);
  assert.deepEqual(loadState(storage), before);
}

// Completed history is ordered and excludes ongoing/cancelled/other-store rows.
{
  const { service, setClock, store, storage } = setup();
  const first = service.finish(service.start('one').id);
  setClock('2026-09-19T12:00:00.000Z');
  const second = service.finish(service.start('one').id);
  const cancelled = service.start('one');
  service.cancel(cancelled.id);
  assert.equal(service.cancel(cancelled.id).status, 'cancelled');
  assert.throws(() => service.finish(cancelled.id), /ne peut pas/);
  service.start('one'); service.finish(service.start('two').id);
  assert.deepEqual(service.history('one').map(row => row.id), [second.id, first.id]);
  assert.deepEqual(historyForStore(loadState(storage), 'one'), service.history('one'));
  assert.equal(new Set(store.getState().visits.map(row => row.id)).size, 5);
}

// Invalid versioned data and collisions are rejected before persistence.
{
  const { service, store, storage, persist } = setup();
  const completed = service.finish(service.start('one').id);
  for (const patch of [{ visitVersion: 2 }, { status: 'unknown' }, { source: 'v1-date' },
    { startedAt: '2026-02-30T12:00:00.000Z' }, { completedAt: 'yesterday' },
    { completedDate: '2026-02-30' }, { completedAt: '2026-09-17T12:00:00.000Z' }]) {
    assert.throws(() => validateVisits([{ ...completed, ...patch }]), /visits:/);
  }
  assert.throws(() => validateVisits([completed, completed]), /dupliqué/);
  const before = store.getState(), disk = storage.getItem(STORAGE_KEY);
  const collision = createVisitsService({ store, persist, makeId: () => '1' });
  assert.throws(() => collision.start('two'), /dupliqué/);
  assert.deepEqual(store.getState(), before);
  assert.equal(storage.getItem(STORAGE_KEY), disk);
  const incompatible = store.getState(); incompatible.visits[0].visitVersion = 99;
  assert.throws(() => store.replace(incompatible), /visits:/);
  assert.deepEqual(store.getState(), before);
}

// Older opaque V2 placeholders remain intact, ignored by all native operations.
{
  const opaque = [null, { id: 'legacy', history: ['unknown'] }];
  const { service, store, storage, persist } = setup(opaque);
  service.finish(service.start('one').id);
  service.cancel(service.start('two').id);
  assert.deepEqual(store.getState().visits.slice(0, 2), opaque);
  assert.deepEqual(loadState(storage).visits.slice(0, 2), opaque);
  assert.equal(service.history('one').length, 1);
  const previous = store.getState(); previous.visits.push({ id: 'visit:collision' }); store.replace(previous);
  const collision = createVisitsService({ store, persist, makeId: () => 'collision' });
  assert.throws(() => collision.start('two'), /dupliqué/);
}
console.log('v2 visits domain, persistence and reload: ok');
