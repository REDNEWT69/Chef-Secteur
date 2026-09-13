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

export function createEmptyPlanningWeek(weekDate, settings = {}) {
  const weekMonday = weekMondayFromDate(weekDate);
  const days = resolvePlanningDays(settings);
  const byDay = {};
  for (const day of days) byDay[day] = [];
  return {
    weekMonday,
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
  const ids = activeStoreIds(state);
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
