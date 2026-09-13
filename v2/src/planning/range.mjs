// Store Runner V2 — génération multi-semaines et tournée en escargot.
// Domaine pur : aucun DOM, aucun accès navigateur, aucune mutation de l'état reçu.

import {
  PLANNING_DAYS,
  rankActiveStoreIdsForWeek,
  resolvePlanningDays,
  shiftWeekDate,
  weekMondayFromDate,
} from './week.mjs';

export const DEFAULT_RANGE_WEEKS = 3;
export const SNAIL_RANGE_ALGORITHM = 'snail-distance-v1';

export class PlanningRangeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanningRangeError';
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteCoordinate(value, min, max) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizedOrigin(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const lat = finiteCoordinate(candidate.lat, -90, 90);
  const lon = finiteCoordinate(candidate.lon, -180, 180);
  if (lat === null || lon === null) return null;
  return Object.freeze({ lat, lon, label: String(candidate.label || 'Point de départ') });
}

function storeCoordinates(store) {
  const lat = finiteCoordinate(store?.lat, -90, 90);
  const lon = finiteCoordinate(store?.lon, -180, 180);
  return lat === null || lon === null ? null : { lat, lon };
}

export function resolvePlanningOrigin(state) {
  const settings = state?.settings && typeof state.settings === 'object' ? state.settings : {};
  const profile = state?.profile && typeof state.profile === 'object' ? state.profile : {};

  const candidates = [
    {
      lat: settings.originLat,
      lon: settings.originLon,
      label: settings.originName || 'Point de départ',
    },
    {
      lat: profile.baseLat,
      lon: profile.baseLon,
      label: profile.baseName || 'Point de départ',
    },
  ];

  for (const candidate of candidates) {
    const origin = normalizedOrigin(candidate);
    if (origin) return origin;
  }
  return null;
}

export function distanceKm(origin, store) {
  const normalized = normalizedOrigin(origin);
  const coords = storeCoordinates(store);
  if (!normalized || !coords) return null;

  const toRad = degrees => degrees * Math.PI / 180;
  const radiusKm = 6371.0088;
  const dLat = toRad(coords.lat - normalized.lat);
  const dLon = toRad(coords.lon - normalized.lon);
  const lat1 = toRad(normalized.lat);
  const lat2 = toRad(coords.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function sortStoresByDistance(stores, origin) {
  const rows = Array.isArray(stores) ? stores.map((store, index) => ({ store, index })) : [];
  rows.sort((a, b) => {
    const distanceA = distanceKm(origin, a.store);
    const distanceB = distanceKm(origin, b.store);
    if (distanceA === null && distanceB !== null) return 1;
    if (distanceA !== null && distanceB === null) return -1;
    if (distanceA !== null && distanceB !== null && Math.abs(distanceA - distanceB) > 1e-9) {
      return distanceA - distanceB;
    }
    return a.index - b.index;
  });
  return rows.map(row => row.store);
}

function activeUniqueStoreCount(state) {
  const ids = new Set();
  for (const store of Array.isArray(state?.stores) ? state.stores : []) {
    if (!store || store.active === false || store.id === undefined || store.id === null) continue;
    const id = String(store.id);
    if (id) ids.add(id);
  }
  return ids.size;
}

function missingCoordinateCount(state) {
  const seen = new Set();
  let missing = 0;
  for (const store of Array.isArray(state?.stores) ? state.stores : []) {
    if (!store || store.active === false || store.id === undefined || store.id === null) continue;
    const id = String(store.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!storeCoordinates(store)) missing += 1;
  }
  return missing;
}

function createSnailWeek(workingState, weekDate) {
  const weekMonday = weekMondayFromDate(weekDate);
  const settings = workingState?.settings && typeof workingState.settings === 'object'
    ? workingState.settings
    : {};
  const days = resolvePlanningDays(settings);
  const byDay = Object.fromEntries(days.map(day => [day, []]));
  const maxVisitsPerDay = positiveInteger(settings.maxVisitsPerDay, 4);
  const ranked = rankActiveStoreIdsForWeek(workingState, weekMonday);
  const requestedTarget = positiveInteger(settings.target, ranked.length || 1);
  const capacity = days.length * maxVisitsPerDay;
  const selected = ranked.slice(0, Math.min(ranked.length, requestedTarget, capacity));

  let cursor = 0;
  for (const day of days) {
    for (let slot = 0; slot < maxVisitsPerDay && cursor < selected.length; slot += 1) {
      byDay[day].push(selected[cursor]);
      cursor += 1;
    }
  }

  return {
    weekMonday,
    algorithm: SNAIL_RANGE_ALGORITHM,
    days: byDay,
  };
}

export function generatePlanningRange(state, options = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new PlanningRangeError('Un état V2 est requis pour générer une période.');
  }

  const settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
  const startWeek = weekMondayFromDate(options.weekDate || settings.weekDate || state?.planning?.currentWeek);
  const count = positiveInteger(options.weeks, DEFAULT_RANGE_WEEKS);
  if (count > 12) throw new PlanningRangeError('Une période ne peut pas dépasser 12 semaines.');

  const origin = options.origin === undefined
    ? resolvePlanningOrigin(state)
    : normalizedOrigin(options.origin);
  if (!origin) {
    throw new PlanningRangeError('Point de départ GPS manquant : renseigne le domicile / point de départ avant le mode escargot.');
  }

  const working = clone(state);
  working.stores = sortStoresByDistance(working.stores, origin);
  if (!working.planning || typeof working.planning !== 'object' || Array.isArray(working.planning)) {
    working.planning = {};
  }
  // Le mode escargot constitue une nouvelle séquence d'apprentissage du secteur.
  // Les anciens plannings ne doivent donc pas repousser artificiellement un
  // magasin proche derrière un magasin lointain. Les semaines générées dans
  // cette période, elles, sont ajoutées au fur et à mesure pour éviter les
  // doublons tant qu'il reste des magasins jamais vus dans la période.
  working.planning.weeks = {};

  const weeks = [];
  const distinct = new Set();
  let totalVisits = 0;

  for (let index = 0; index < count; index += 1) {
    const monday = shiftWeekDate(startWeek, index);
    const week = createSnailWeek(working, monday);
    weeks.push(week);
    working.planning.weeks[monday] = week;
    for (const ids of Object.values(week.days)) {
      for (const id of ids) distinct.add(String(id));
      totalVisits += ids.length;
    }
  }

  const activeStores = activeUniqueStoreCount(state);
  return Object.freeze({
    startWeek,
    endWeek: shiftWeekDate(startWeek, count - 1),
    algorithm: SNAIL_RANGE_ALGORITHM,
    origin,
    weeks,
    totalVisits,
    distinctStores: distinct.size,
    activeStores,
    remainingStores: Math.max(0, activeStores - distinct.size),
    missingCoordinates: missingCoordinateCount(state),
  });
}

export function flattenRangeChronologically(range) {
  if (!range || !Array.isArray(range.weeks)) return [];
  const rows = [];
  for (const week of range.weeks) {
    for (const day of PLANNING_DAYS) {
      const ids = Array.isArray(week?.days?.[day]) ? week.days[day] : [];
      for (const id of ids) rows.push(String(id));
    }
  }
  return rows;
}
