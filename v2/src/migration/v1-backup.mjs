// Store Runner V2 — pont local depuis une sauvegarde V1.
//
// Objectif limité et explicite : rendre le secteur/planning utilisable dans V2
// sans prétendre migrer des domaines métier dont le contrat n'est pas encore
// stabilisé (visites, actions, Agenda, etc.). Le fichier V1 source n'est jamais
// modifié et cette fonction pure ne fait aucun accès réseau ni stockage.

import { createEmptyState } from '../core/state.mjs';
import { validateState } from '../core/validate.mjs';

export class V1MigrationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'V1MigrationError';
    this.path = path;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonEmpty(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return value !== undefined && value !== null && value !== '' && value !== false;
}

function finiteCoordinate(value, min, max) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function optionalString(value) {
  return value === undefined || value === null ? '' : String(value);
}

const PROFILE_FIELDS = Object.freeze([
  'sectorName',
  'repName',
  'baseName',
  'baseAddress',
  'overnightEnabled',
  'overnightMaxNights',
  'overnightRadiusKm',
]);

const STORE_FIELDS = Object.freeze([
  'enseigne',
  'ville',
  'adresse',
  'codePostal',
  'dept',
  'deptName',
  'type',
  'freq',
  'priority',
  'intervalDays',
  'products',
  'active',
  'source',
]);

const SETTINGS_FIELDS = Object.freeze([
  'target',
  'days',
  'brands',
  'products',
  'strategy',
  'weekDate',
  'startTime',
  'endTime',
  'saturday',
  'saturdayStartTime',
  'saturdayEndTime',
  'visitMinutes',
  'visitCreditsByBrand',
  'maxVisitsPerDay',
]);

// Domaines volontairement non migrés dans ce pont. Ils sont signalés dans le
// rapport lorsqu'ils contiennent des données afin que l'utilisateur sache
// exactement ce qui reste uniquement dans V1.
const UNSUPPORTED_STATE_FIELDS = Object.freeze([
  'visits',
  'notes',
  'included',
  'excluded',
  'locks',
  'appointments',
  'actions',
  'businessV2',
  'calendarEvents',
  'calendarLastSync',
]);

function copyAllowed(source, fields) {
  const target = {};
  for (const key of fields) {
    if (source[key] !== undefined) target[key] = clone(source[key]);
  }
  return target;
}

function migrateProfile(profile) {
  const source = isPlainObject(profile) ? profile : {};
  const target = copyAllowed(source, PROFILE_FIELDS);
  const lat = finiteCoordinate(source.baseLat, -90, 90);
  const lon = finiteCoordinate(source.baseLon, -180, 180);
  if (lat !== null) target.baseLat = lat;
  if (lon !== null) target.baseLon = lon;
  return target;
}

function migrateStores(stores) {
  if (!Array.isArray(stores)) throw new V1MigrationError('state.stores', 'tableau attendu');
  const ids = new Set();
  return stores.map((store, index) => {
    if (!isPlainObject(store)) throw new V1MigrationError(`state.stores[${index}]`, 'objet attendu');
    const id = optionalString(store.id).trim();
    if (!id) throw new V1MigrationError(`state.stores[${index}].id`, 'identifiant requis');
    if (ids.has(id)) throw new V1MigrationError(`state.stores[${index}].id`, `identifiant dupliqué "${id}"`);
    ids.add(id);

    const target = { id, ...copyAllowed(store, STORE_FIELDS) };
    const lat = finiteCoordinate(store.lat, -90, 90);
    const lon = finiteCoordinate(store.lon, -180, 180);
    // Ne jamais convertir une coordonnée vide en 0,0. Si une coordonnée est
    // inutilisable, elle reste absente et le moteur escargot la signale.
    if (lat !== null) target.lat = lat;
    if (lon !== null) target.lon = lon;
    if (target.active === undefined) target.active = true;
    return target;
  });
}

function migrateSettings(settings) {
  const source = isPlainObject(settings) ? settings : {};
  return copyAllowed(source, SETTINGS_FIELDS);
}

function unsupportedWarnings(state, backup) {
  const warnings = [];
  for (const key of UNSUPPORTED_STATE_FIELDS) {
    if (nonEmpty(state[key])) warnings.push(`state.${key} reste uniquement dans V1`);
  }
  if (nonEmpty(backup.archive)) warnings.push('archive V1 non migrée');
  if (nonEmpty(backup.range)) warnings.push('range V1 non migré');
  if (nonEmpty(backup.catalog)) warnings.push('catalog V1 non migré');
  return warnings;
}

export function migrateV1Backup(backup) {
  if (!isPlainObject(backup)) throw new V1MigrationError('$', 'objet de sauvegarde attendu');
  if (backup.format !== 'ChefSecteurBackup') {
    throw new V1MigrationError('format', '"ChefSecteurBackup" attendu');
  }
  if (backup.version !== 1) throw new V1MigrationError('version', 'version de sauvegarde V1 attendue');
  if (!isPlainObject(backup.state)) throw new V1MigrationError('state', 'objet attendu');
  if (backup.state.schemaVersion !== 5) {
    throw new V1MigrationError('state.schemaVersion', 'schéma V1 5 attendu');
  }

  const next = createEmptyState();
  next.profile = migrateProfile(backup.state.profile);
  next.stores = migrateStores(backup.state.stores);
  next.settings = migrateSettings(backup.state.settings);
  next.planning = { weeks: {} };

  const state = validateState(next);
  const activeStores = state.stores.filter(store => store.active !== false).length;
  const gpsStores = state.stores.filter(store =>
    finiteCoordinate(store.lat, -90, 90) !== null && finiteCoordinate(store.lon, -180, 180) !== null
  ).length;
  const warnings = unsupportedWarnings(backup.state, backup);

  return Object.freeze({
    state: clone(state),
    report: Object.freeze({
      totalStores: state.stores.length,
      activeStores,
      gpsStores,
      missingGpsStores: state.stores.length - gpsStores,
      warnings: Object.freeze(warnings.slice()),
    }),
  });
}

export function parseAndMigrateV1Backup(text) {
  if (typeof text !== 'string') throw new V1MigrationError('$', 'texte JSON attendu');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new V1MigrationError('$', 'JSON invalide');
  }
  return migrateV1Backup(parsed);
}
