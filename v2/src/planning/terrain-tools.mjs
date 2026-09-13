// Store Runner V2 — sortie terrain du planning multi-semaines.
// Domaine pur : transforme uniquement l'état V2 et les semaines enregistrées
// en une vue texte facile à recopier dans TeamHaven.

import { PLANNING_DAYS, shiftWeekDate, weekMondayFromDate } from './week.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function displayDate(isoDate) {
  const text = String(isoDate || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function dayIso(weekMonday, day) {
  const dayIndex = PLANNING_DAYS.indexOf(day);
  if (dayIndex < 0) return weekMonday;
  const [year, month, date] = String(weekMonday).split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, date + dayIndex));
  return value.toISOString().slice(0, 10);
}

function storeMap(state) {
  const rows = new Map();
  for (const store of Array.isArray(state?.stores) ? state.stores : []) {
    if (!store || store.id === undefined || store.id === null) continue;
    const id = String(store.id);
    if (!id || rows.has(id)) continue;
    rows.set(id, store);
  }
  return rows;
}

function storeLine(store, id, index) {
  if (!store) return `${index}. Magasin ${id} indisponible`;
  const name = String(store.enseigne || store.name || `Magasin ${id}`).trim();
  const location = [store.ville, store.adresse].filter(Boolean).map(String).join(' · ');
  return `${index}. ${name}${location ? ` · ${location}` : ''}`;
}

export function storedLastPlanningRange(state) {
  const planning = isObject(state?.planning) ? state.planning : {};
  const last = isObject(planning.lastRange) ? planning.lastRange : null;
  const weeksMap = isObject(planning.weeks) ? planning.weeks : {};
  if (!last?.startWeek || !last?.endWeek) return null;

  let startWeek;
  let endWeek;
  try {
    startWeek = weekMondayFromDate(last.startWeek);
    endWeek = weekMondayFromDate(last.endWeek);
  } catch (_) {
    return null;
  }
  if (startWeek > endWeek) return null;

  const weeks = [];
  let cursor = startWeek;
  for (let count = 0; count < 12 && cursor <= endWeek; count += 1) {
    const week = weeksMap[cursor];
    if (!isObject(week) || !isObject(week.days)) return null;
    weeks.push(clone(week));
    if (cursor === endWeek) break;
    cursor = shiftWeekDate(cursor, 1);
  }

  if (!weeks.length || weeks[weeks.length - 1].weekMonday !== endWeek) return null;
  return Object.freeze({
    startWeek,
    endWeek,
    algorithm: String(last.algorithm || ''),
    weeks,
  });
}

export function formatPlanningRangeForTeamHaven(state, range) {
  if (!range || !Array.isArray(range.weeks) || !range.weeks.length) return '';
  const stores = storeMap(state);
  const lines = ['PLAN 3 SEMAINES · STORE RUNNER'];

  for (const week of range.weeks) {
    let monday;
    try {
      monday = weekMondayFromDate(week?.weekMonday);
    } catch (_) {
      continue;
    }
    lines.push('', `Semaine du ${displayDate(monday)}`);
    for (const day of PLANNING_DAYS) {
      const ids = Array.isArray(week?.days?.[day]) ? week.days[day] : [];
      if (!ids.length) continue;
      lines.push(`${day} ${displayDate(dayIso(monday, day))}`);
      ids.forEach((rawId, index) => {
        const id = String(rawId);
        lines.push(storeLine(stores.get(id), id, index + 1));
      });
    }
  }

  return `${lines.join('\n')}\n`;
}
