import { cloneState, createEmptyState } from '../core/state.mjs';
import { validateState } from '../core/validate.mjs';

export const STORAGE_KEY = 'store_runner_v2_state';

function requireStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new TypeError('storage: interface getItem/setItem/removeItem attendue');
  }
  return storage;
}

export function saveState(storage, state) {
  requireStorage(storage);
  const valid = validateState(state);
  storage.setItem(STORAGE_KEY, JSON.stringify(valid));
  return cloneState(valid);
}

export function loadState(storage) {
  requireStorage(storage);
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`storage.${STORAGE_KEY}: JSON invalide`);
  }
  return cloneState(validateState(parsed));
}

export function clearState(storage) {
  requireStorage(storage);
  storage.removeItem(STORAGE_KEY);
}

export function resetState(storage) {
  clearState(storage);
  return createEmptyState();
}
