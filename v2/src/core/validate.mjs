import { STATE_VERSION } from './state.mjs';

export class V2ValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'V2ValidationError';
    this.path = path;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function requirePlainObject(state, key) {
  if (!isPlainObject(state[key])) throw new V2ValidationError(key, 'objet attendu');
}

function requireArray(state, key) {
  if (!Array.isArray(state[key])) throw new V2ValidationError(key, 'tableau attendu');
}

export function validateState(state) {
  if (!isPlainObject(state)) throw new V2ValidationError('$', 'objet racine attendu');
  if (state.version !== STATE_VERSION) {
    throw new V2ValidationError('version', `version ${STATE_VERSION} attendue`);
  }

  requirePlainObject(state, 'profile');
  requireArray(state, 'stores');
  requireArray(state, 'visits');
  requireArray(state, 'actions');
  requireArray(state, 'appointments');
  requirePlainObject(state, 'planning');
  requirePlainObject(state, 'settings');

  return state;
}
