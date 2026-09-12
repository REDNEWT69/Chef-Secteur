import { cloneState } from '../core/state.mjs';
import { validateState } from '../core/validate.mjs';

export function exportStateJson(state, space = 2) {
  return JSON.stringify(validateState(state), null, space);
}

export function importStateJson(text) {
  if (typeof text !== 'string') throw new TypeError('import: chaîne JSON attendue');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('import: JSON invalide');
  }
  return cloneState(validateState(parsed));
}
