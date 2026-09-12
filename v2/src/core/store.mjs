import { cloneState, createEmptyState } from './state.mjs';
import { validateState } from './validate.mjs';

export function createStore(initialState = createEmptyState()) {
  let current = cloneState(validateState(initialState));
  const subscribers = new Set();

  function notify() {
    const snapshot = getState();
    for (const subscriber of subscribers) subscriber(snapshot);
  }

  function getState() {
    return cloneState(current);
  }

  function replace(nextState) {
    current = cloneState(validateState(nextState));
    notify();
    return getState();
  }

  function update(mutator) {
    if (typeof mutator !== 'function') throw new TypeError('mutator: fonction attendue');
    const draft = getState();
    const returned = mutator(draft);
    const candidate = returned === undefined ? draft : returned;
    current = cloneState(validateState(candidate));
    notify();
    return getState();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener: fonction attendue');
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  return Object.freeze({ getState, replace, update, subscribe });
}
