// Store Runner V2 — feature Planning semaine.
// Propriétaire de son contenu uniquement. Le shell reste propriétaire de
// l'écran Planning et reçoit cet élément via mountScreen('planning', ...).

import { attachHorizontalSwipe } from '../ui/horizontal-swipe.mjs';
import {
  PlanningWeekError,
  generatePlanningWeek,
  getPlannedStore,
  resolvePlanningDays,
  weekMondayFromDate,
} from './week.mjs';

export class PlanningFeatureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanningFeatureError';
  }
}

function requireOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new PlanningFeatureError('createPlanningFeature attend un objet { document, store }.');
  }
  const { document, store } = options;
  if (!document || typeof document.createElement !== 'function') {
    throw new PlanningFeatureError('Un document valide est requis pour la feature Planning.');
  }
  if (
    !store ||
    typeof store.getState !== 'function' ||
    typeof store.subscribe !== 'function' ||
    typeof store.update !== 'function'
  ) {
    throw new PlanningFeatureError('Un store V2 avec getState(), subscribe() et update() est requis.');
  }
  return { document, store };
}

function appendTextElement(doc, parent, tagName, className, text) {
  const el = doc.createElement(tagName);
  if (className) el.classList.add(className);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function displayName(store) {
  return String(store?.enseigne || store?.name || 'Magasin sans nom').trim();
}

function displayLocation(store) {
  return [store?.codePostal, store?.ville].filter(Boolean).map(String).join(' · ');
}

function planningWeeks(state) {
  const weeks = state?.planning?.weeks;
  return weeks && typeof weeks === 'object' && !Array.isArray(weeks) ? weeks : {};
}

export function createPlanningFeature(options) {
  const { document: doc, store } = requireOptions(options);
  let latestState = store.getState();
  const initialSettings = latestState.settings || {};
  let selectedDay = resolvePlanningDays(initialSettings)[0];

  const root = doc.createElement('div');
  root.classList.add('srv2-planning-feature');

  const controls = doc.createElement('div');
  controls.classList.add('srv2-planning-controls');

  const dateLabel = doc.createElement('label');
  dateLabel.classList.add('srv2-planning-date');
  appendTextElement(doc, dateLabel, 'span', 'srv2-field-label', 'Semaine');

  const dateInput = doc.createElement('input');
  dateInput.setAttribute('type', 'date');
  dateInput.setAttribute('aria-label', 'Date de la semaine');
  dateInput.value = String(initialSettings.weekDate || todayIso());
  dateLabel.appendChild(dateInput);

  const generateButton = doc.createElement('button');
  generateButton.setAttribute('type', 'button');
  generateButton.classList.add('srv2-planning-generate');
  generateButton.textContent = 'Générer la semaine';

  controls.appendChild(dateLabel);
  controls.appendChild(generateButton);

  const status = doc.createElement('p');
  status.classList.add('srv2-planning-status');
  status.setAttribute('aria-live', 'polite');

  const dayTabs = doc.createElement('div');
  dayTabs.classList.add('srv2-planning-days');
  dayTabs.setAttribute('role', 'tablist');
  dayTabs.setAttribute('aria-label', 'Jours de la semaine');

  const list = doc.createElement('div');
  list.classList.add('srv2-planning-list');

  root.appendChild(controls);
  root.appendChild(status);
  root.appendChild(dayTabs);
  root.appendChild(list);

  function selectedWeekMonday() {
    return weekMondayFromDate(dateInput.value || todayIso());
  }

  function currentWeek(state = latestState) {
    return planningWeeks(state)[selectedWeekMonday()] || null;
  }

  function configuredDays(state = latestState) {
    return resolvePlanningDays(state?.settings || {});
  }

  function ensureSelectedDay(state = latestState) {
    const days = configuredDays(state);
    if (!days.includes(selectedDay)) selectedDay = days[0];
    return days;
  }

  function createPlannedCard(storeRow, storeId) {
    const card = doc.createElement('article');
    card.classList.add('srv2-planning-card');
    card.setAttribute('data-store-id', String(storeId));
    appendTextElement(doc, card, 'strong', 'srv2-planning-store-name', displayName(storeRow));
    const location = displayLocation(storeRow);
    if (location) appendTextElement(doc, card, 'span', 'srv2-planning-store-location', location);
    if (storeRow?.adresse) appendTextElement(doc, card, 'span', 'srv2-planning-store-address', String(storeRow.adresse));
    return card;
  }

  function renderList(state = latestState) {
    const week = currentWeek(state);
    if (!week) {
      const empty = doc.createElement('p');
      empty.classList.add('srv2-planning-empty');
      empty.textContent = 'Aucune semaine générée pour cette date.';
      list.replaceChildren(empty);
      return;
    }

    const ids = Array.isArray(week?.days?.[selectedDay]) ? week.days[selectedDay] : [];
    if (!ids.length) {
      const empty = doc.createElement('p');
      empty.classList.add('srv2-planning-empty');
      empty.textContent = `Aucun magasin prévu ${selectedDay.toLowerCase()}.`;
      list.replaceChildren(empty);
      return;
    }

    const cards = [];
    for (const id of ids) {
      const storeRow = getPlannedStore(state, id);
      if (!storeRow) continue;
      cards.push(createPlannedCard(storeRow, id));
    }

    if (!cards.length) {
      const empty = doc.createElement('p');
      empty.classList.add('srv2-planning-empty');
      empty.textContent = 'Les magasins planifiés ne sont plus disponibles.';
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...cards);
  }

  function selectDay(day) {
    const days = configuredDays();
    if (!days.includes(day)) throw new PlanningFeatureError(`Jour non configuré : "${day}".`);
    selectedDay = day;
    renderDays();
    renderList();
    return selectedDay;
  }

  function moveDay(delta) {
    const days = configuredDays();
    const currentIndex = days.indexOf(selectedDay);
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    const requested = safeIndex + Number(delta || 0);
    const nextIndex = Math.max(0, Math.min(days.length - 1, requested));
    if (nextIndex === safeIndex) return selectedDay;
    return selectDay(days[nextIndex]);
  }

  function renderDays(state = latestState) {
    const days = ensureSelectedDay(state);
    const week = currentWeek(state);
    const buttons = days.map(day => {
      const button = doc.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('role', 'tab');
      button.setAttribute('data-day', day);
      button.setAttribute('aria-selected', String(day === selectedDay));
      button.classList.add('srv2-planning-day');
      if (day === selectedDay) button.classList.add('is-active');
      const count = Array.isArray(week?.days?.[day]) ? week.days[day].length : 0;
      button.textContent = `${day.slice(0, 3)} ${count}`;
      button.addEventListener('click', () => selectDay(day));
      return button;
    });
    dayTabs.replaceChildren(...buttons);
  }

  function render(state) {
    latestState = state || store.getState();
    renderDays(latestState);
    renderList(latestState);
  }

  function generate() {
    try {
      const snapshot = store.getState();
      const week = generatePlanningWeek(snapshot, { weekDate: dateInput.value });
      store.update(draft => {
        if (!draft.planning || typeof draft.planning !== 'object' || Array.isArray(draft.planning)) {
          draft.planning = {};
        }
        if (!draft.planning.weeks || typeof draft.planning.weeks !== 'object' || Array.isArray(draft.planning.weeks)) {
          draft.planning.weeks = {};
        }
        draft.planning.weeks[week.weekMonday] = week;
        draft.planning.currentWeek = week.weekMonday;
        draft.settings.weekDate = dateInput.value;
      });
      selectedDay = Object.keys(week.days)[0];
      const total = Object.values(week.days).reduce((sum, ids) => sum + ids.length, 0);
      status.textContent = `Semaine du ${week.weekMonday} générée : ${total} magasin${total > 1 ? 's' : ''}.`;
      render(store.getState());
      return week;
    } catch (error) {
      const message = error instanceof PlanningWeekError || error instanceof PlanningFeatureError
        ? error.message
        : 'Impossible de générer la semaine.';
      status.textContent = message;
      return null;
    }
  }

  dateInput.addEventListener('change', () => {
    try {
      weekMondayFromDate(dateInput.value);
      selectedDay = configuredDays()[0];
      status.textContent = '';
      renderDays();
      renderList();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Date invalide.';
    }
  });
  generateButton.addEventListener('click', generate);

  const swipe = attachHorizontalSwipe(list, {
    onSwipe(direction) {
      moveDay(direction === 'next' ? 1 : -1);
    },
  });

  const unsubscribe = store.subscribe(render);
  render(latestState);

  function destroy() {
    swipe.destroy();
    unsubscribe();
  }

  return Object.freeze({
    element: root,
    destroy,
    generate,
    selectDay,
    moveDay,
    getSelectedDay: () => selectedDay,
    getWeekMonday: selectedWeekMonday,
  });
}
