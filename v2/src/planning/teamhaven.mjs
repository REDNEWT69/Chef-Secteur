// Store Runner V2 — représentation texte du planning pour recopie dans TeamHaven.
// Domaine pur : aucune API navigateur, aucun stockage, aucune donnée personnelle
// ajoutée au dépôt. Le texte est construit uniquement depuis l'état local reçu.

import {
  PLANNING_DAYS,
  getPlannedStore,
  shiftWeekDate,
  weekMondayFromDate,
} from './week.mjs';

const DAY_OFFSET = Object.freeze({
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
});

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function formatIsoDate(value) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value || '');
}

function dayDate(weekMonday, day) {
  const offset = DAY_OFFSET[day];
  if (!Number.isInteger(offset)) return weekMonday;
  const date = new Date(`${weekMonday}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function planningWeeks(state) {
  const weeks = state?.planning?.weeks;
  return weeks && typeof weeks === 'object' && !Array.isArray(weeks) ? weeks : {};
}

function storeLabel(state, rawId) {
  const id = String(rawId);
  const store = getPlannedStore(state, id);
  if (!store) return `Magasin ${id}`;
  const primary = String(store.enseigne || store.name || `Magasin ${id}`).trim();
  const parts = [primary, store.ville, store.adresse]
    .filter(value => value !== undefined && value !== null && String(value).trim())
    .map(value => String(value).trim());
  return parts.join(' · ');
}

export function resolveTeamHavenStartWeek(state, candidate) {
  const raw = candidate
    || state?.planning?.lastRange?.startWeek
    || state?.planning?.currentWeek
    || state?.settings?.weekDate;
  if (!raw) return null;
  try {
    return weekMondayFromDate(raw);
  } catch (_) {
    return null;
  }
}

export function hasCompletePlanningRange(state, options = {}) {
  const startWeek = resolveTeamHavenStartWeek(state, options.startWeek);
  if (!startWeek) return false;
  const count = Math.min(12, positiveInteger(options.weeks, 3));
  const weeks = planningWeeks(state);
  for (let index = 0; index < count; index += 1) {
    if (!weeks[shiftWeekDate(startWeek, index)]) return false;
  }
  return true;
}

export function formatPlanningForTeamHaven(state, options = {}) {
  const startWeek = resolveTeamHavenStartWeek(state, options.startWeek);
  if (!startWeek) return '';
  const count = Math.min(12, positiveInteger(options.weeks, 3));
  const weeks = planningWeeks(state);
  const lines = [];

  for (let index = 0; index < count; index += 1) {
    const monday = shiftWeekDate(startWeek, index);
    const week = weeks[monday];
    lines.push(`SEMAINE DU ${formatIsoDate(monday)}`);

    if (!week || !week.days || typeof week.days !== 'object' || Array.isArray(week.days)) {
      lines.push('Planning non généré');
      lines.push('');
      continue;
    }

    for (const day of PLANNING_DAYS) {
      if (!(day in week.days)) continue;
      const ids = Array.isArray(week.days[day]) ? week.days[day] : [];
      lines.push(`${day} ${formatIsoDate(dayDate(monday, day))}`);
      if (!ids.length) {
        lines.push('  Aucun magasin');
        continue;
      }
      ids.forEach((id, visitIndex) => {
        lines.push(`  ${visitIndex + 1}. ${storeLabel(state, id)}`);
      });
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
