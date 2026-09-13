// Store Runner V2 — domaine Planning semaine.
// Ce module ne connaît ni le DOM ni le shell. Il transforme uniquement l'état
// V2 en une semaine déterministe qui référence les magasins par ID.

export const PLANNING_DAYS = Object.freeze([
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
]);

export const PLANNING_ALGORITHM = 'balanced-lru-v1';

export class PlanningWeekError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanningWeekError';
  }
}

function parseIsoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new PlanningWeekError(`Date ISO attendue (YYYY-MM-DD), reçue : "${text}".`);
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new PlanningWeekError(`Date invalide : "${text}".`);
  }
  return date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function weekMondayFromDate(value) {
  const date = parseIsoDate(value);
  const weekday = date.getUTCDay(); // 0 dimanche, 1 lundi, ...
  const delta = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + delta);
  return toIsoDate(date);
}

export function shiftWeekDate(value, offsetWeeks) {
  const offset = Number(offsetWeeks);
  if (!Number.isInteger(offset)) {
    throw new PlanningWeekError(`Décalage de semaine entier attendu, reçu : "${offsetWeeks}".`);
  }
  const monday = parseIsoDate(weekMondayFromDate(value));
  monday.setUTCDate(monday.getUTCDate() + offset * 7);
  return toIsoDate(monday);
}

export function resolvePlanningDays(settings = {}) {
  const requested = Array.isArray(settings.days) ? settings.days : [];
  const seen = new Set();
  const resolved = [];
  for (const raw of requested) {
    const day = String(raw || '').trim();
    if (!PLANNING_DAYS.includes(day) || seen.has(day)) continue;
    seen.add(day);
    resolved.push(day);
  }
  return resolved.length ? resolved : PLANNING_DAYS.slice(0, 5);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function activeStoreIds(state) {
  const stores = Array.isArray(state?.stores) ? state.stores : [];
  const ids = [];
  const seen = new Set();
  for (const store of stores) {
    if (!store || store.active === false || store.id === undefined || store.id === null) continue;
    const id = String(store.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function validPastWeeks(state, targetWeekMonday) {
  const weeks = state?.planning?.weeks;
  if (!weeks || typeof weeks !== 'object' || Array.isArray(weeks)) return [];

  const rows = [];
  for (const [key, week] of Object.entries(weeks)) {
    let monday;
    try {
      monday = weekMondayFromDate(key);
    } catch (_) {
      continue;
    }
    // Une clé non canonique ou une semaine courante/future ne doit pas peser
    // sur le classement d'une semaine antérieure.
    if (monday !== key || monday >= targetWeekMonday) continue;
    if (!week || typeof week !== 'object' || Array.isArray(week)) continue;
    rows.push([monday, week]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return rows;
}

function plannedIdsInWeek(week) {
  const days = week?.days;
  if (!days || typeof days !== 'object' || Array.isArray(days)) return [];
  const result = [];
  const seen = new Set();
  for (const ids of Object.values(days)) {
    if (!Array.isArray(ids)) continue;
    for (const rawId of ids) {
      if (rawId === undefined || rawId === null) continue;
      const id = String(rawId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

export function rankActiveStoreIdsForWeek(state, weekDate) {
  const targetWeekMonday = weekMondayFromDate(weekDate);
  const ids = activeStoreIds(state);
  const stats = new Map(ids.map((id, index) => [id, {
    id,
    catalogIndex: index,
    visitCount: 0,
    lastWeek: null,
  }]));

  for (const [weekMonday, week] of validPastWeeks(state, targetWeekMonday)) {
    for (const id of plannedIdsInWeek(week)) {
      const row = stats.get(id);
      if (!row) continue;
      row.visitCount += 1;
      row.lastWeek = weekMonday;
    }
  }

  return Array.from(stats.values())
    .sort((a, b) => {
      if (a.visitCount !== b.visitCount) return a.visitCount - b.visitCount;
      if (a.lastWeek !== b.lastWeek) {
        if (a.lastWeek === null) return -1;
        if (b.lastWeek === null) return 1;
        return a.lastWeek.localeCompare(b.lastWeek);
      }
      return a.catalogIndex - b.catalogIndex;
    })
    .map(row => row.id);
}

export function createEmptyPlanningWeek(weekDate, settings = {}) {
  const weekMonday = weekMondayFromDate(weekDate);
  const days = resolvePlanningDays(settings);
  const byDay = {};
  for (const day of days) byDay[day] = [];
  return {
    weekMonday,
    algorithm: PLANNING_ALGORITHM,
    days: byDay,
  };
}

export function generatePlanningWeek(state, options = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new PlanningWeekError('Un état V2 est requis pour générer une semaine.');
  }
  const settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
  const weekDate = options.weekDate || settings.weekDate;
  if (!weekDate) throw new PlanningWeekError('Aucune date de semaine disponible.');

  const week = createEmptyPlanningWeek(weekDate, settings);
  const days = Object.keys(week.days);
  const ids = rankActiveStoreIdsForWeek(state, week.weekMonday);
  const maxVisitsPerDay = positiveInteger(settings.maxVisitsPerDay, 4);
  const requestedTarget = positiveInteger(settings.target, ids.length || 1);
  const capacity = days.length * maxVisitsPerDay;
  const count = Math.min(ids.length, requestedTarget, capacity);

  let dayIndex = 0;
  for (const id of ids.slice(0, count)) {
    let attempts = 0;
    while (attempts < days.length && week.days[days[dayIndex]].length >= maxVisitsPerDay) {
      dayIndex = (dayIndex + 1) % days.length;
      attempts += 1;
    }
    if (attempts >= days.length) break;
    week.days[days[dayIndex]].push(id);
    dayIndex = (dayIndex + 1) % days.length;
  }

  return week;
}

export function getPlannedStore(state, storeId) {
  if (storeId === undefined || storeId === null) return null;
  const id = String(storeId);
  const stores = Array.isArray(state?.stores) ? state.stores : [];
  return stores.find(store => store && String(store.id) === id) || null;
}
