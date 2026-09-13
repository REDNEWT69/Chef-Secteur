// Store Runner V2 — contrôle opérationnel de période Planning.
// Cette feature ne possède que son petit bloc UI ; le shell et planning.mjs
// restent propriétaires de leurs zones respectives.

import { generatePlanningRange, PlanningRangeError, planningReach } from './range.mjs';
import { formatPlanningRangeForTeamHaven, storedLastPlanningRange } from './terrain-tools.mjs';

export class PlanningRangeFeatureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanningRangeFeatureError';
  }
}

function requireOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new PlanningRangeFeatureError('createPlanningRangeFeature attend { document, store }.');
  }
  const { document, store, geolocation, clipboard } = options;
  if (!document || typeof document.createElement !== 'function') {
    throw new PlanningRangeFeatureError('Un document valide est requis.');
  }
  if (!store || typeof store.getState !== 'function' || typeof store.update !== 'function' || typeof store.subscribe !== 'function') {
    throw new PlanningRangeFeatureError('Un store V2 valide est requis.');
  }
  return {
    document,
    store,
    geolocation: geolocation && typeof geolocation.getCurrentPosition === 'function' ? geolocation : null,
    clipboard: clipboard && typeof clipboard.writeText === 'function' ? clipboard : null,
  };
}

function firstWeekDate(state) {
  return state?.planning?.currentWeek || state?.settings?.weekDate || new Date().toISOString().slice(0, 10);
}

function coordinate(value, min, max) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function ensureContainers(draft) {
  if (!draft.planning || typeof draft.planning !== 'object' || Array.isArray(draft.planning)) draft.planning = {};
  if (!draft.planning.weeks || typeof draft.planning.weeks !== 'object' || Array.isArray(draft.planning.weeks)) {
    draft.planning.weeks = {};
  }
  if (!draft.settings || typeof draft.settings !== 'object' || Array.isArray(draft.settings)) draft.settings = {};
}

function reachText(state) {
  const reach = planningReach(state);
  const details = [];
  if (reach.excludedStores) details.push(`${reach.excludedStores} exclu${reach.excludedStores > 1 ? 's' : ''}`);
  if (reach.filteredStores) details.push(`${reach.filteredStores} filtré${reach.filteredStores > 1 ? 's' : ''}`);
  if (reach.inactiveStores) details.push(`${reach.inactiveStores} désactivé${reach.inactiveStores > 1 ? 's' : ''}`);
  return details.length
    ? `${reach.eligibleStores} planifiables sur ${reach.activeStores} actifs · ${details.join(' · ')}`
    : `${reach.eligibleStores} magasins planifiables`;
}

export function createPlanningRangeFeature(options) {
  const {
    document: doc,
    store,
    geolocation,
    clipboard,
  } = requireOptions(options);
  let latestState = store.getState();
  let locating = false;

  const root = doc.createElement('section');
  root.classList.add('srv2-planning-range');

  const title = doc.createElement('h2');
  title.classList.add('srv2-planning-range-title');
  title.textContent = 'Plan opérationnel 3 semaines';

  const description = doc.createElement('p');
  description.classList.add('srv2-planning-range-description');
  description.textContent = 'Mode escargot : on commence par les magasins les plus proches du point de départ, puis on s’éloigne progressivement.';

  const origin = doc.createElement('p');
  origin.classList.add('srv2-planning-origin');

  const originButton = doc.createElement('button');
  originButton.setAttribute('type', 'button');
  originButton.classList.add('srv2-planning-origin-current');
  originButton.textContent = 'Utiliser ma position actuelle';

  const originStatus = doc.createElement('p');
  originStatus.classList.add('srv2-planning-origin-status');
  originStatus.setAttribute('aria-live', 'polite');

  const reach = doc.createElement('p');
  reach.classList.add('srv2-planning-range-reach');

  const button = doc.createElement('button');
  button.setAttribute('type', 'button');
  button.classList.add('srv2-planning-range-generate');
  button.textContent = 'Générer 3 semaines · escargot';

  const status = doc.createElement('p');
  status.classList.add('srv2-planning-range-status');
  status.setAttribute('aria-live', 'polite');

  const exportTitle = doc.createElement('h3');
  exportTitle.classList.add('srv2-planning-range-export-title');
  exportTitle.textContent = 'Préparation TeamHaven';
  exportTitle.hidden = true;

  const exportArea = doc.createElement('textarea');
  exportArea.classList.add('srv2-planning-range-export');
  exportArea.setAttribute('readonly', 'readonly');
  exportArea.setAttribute('aria-label', 'Planning 3 semaines à recopier dans TeamHaven');
  exportArea.hidden = true;

  const copyButton = doc.createElement('button');
  copyButton.setAttribute('type', 'button');
  copyButton.classList.add('srv2-planning-range-copy');
  copyButton.textContent = 'Copier les 3 semaines pour TH';
  copyButton.disabled = true;
  copyButton.hidden = true;

  const copyStatus = doc.createElement('p');
  copyStatus.classList.add('srv2-planning-range-copy-status');
  copyStatus.setAttribute('aria-live', 'polite');

  root.appendChild(title);
  root.appendChild(description);
  root.appendChild(origin);
  root.appendChild(originButton);
  root.appendChild(originStatus);
  root.appendChild(reach);
  root.appendChild(button);
  root.appendChild(status);
  root.appendChild(exportTitle);
  root.appendChild(exportArea);
  root.appendChild(copyButton);
  root.appendChild(copyStatus);

  function renderOrigin(state = latestState) {
    const label = state?.settings?.originName || state?.profile?.baseName || 'Point de départ';
    const rawLat = state?.settings?.originLat ?? state?.profile?.baseLat;
    const rawLon = state?.settings?.originLon ?? state?.profile?.baseLon;
    const lat = coordinate(rawLat, -90, 90);
    const lon = coordinate(rawLon, -180, 180);
    const hasOrigin = lat !== null && lon !== null;
    const currentReach = planningReach(state);
    origin.textContent = hasOrigin
      ? `Départ : ${String(label)} · GPS prêt`
      : 'Départ : GPS manquant';
    reach.textContent = reachText(state);
    button.disabled = !hasOrigin || currentReach.eligibleStores === 0;
    button.setAttribute('aria-disabled', String(button.disabled));
    originButton.disabled = locating || !geolocation;
    originButton.setAttribute('aria-disabled', String(originButton.disabled));
  }

  function renderExport(state = latestState) {
    const stored = storedLastPlanningRange(state);
    const text = stored ? formatPlanningRangeForTeamHaven(state, stored) : '';
    exportArea.value = text;
    const ready = Boolean(text);
    exportTitle.hidden = !ready;
    exportArea.hidden = !ready;
    copyButton.hidden = !ready;
    copyButton.disabled = !ready;
    copyButton.setAttribute('aria-disabled', String(copyButton.disabled));
    if (!ready) copyStatus.textContent = '';
  }

  function useCurrentPosition() {
    if (!geolocation) {
      originStatus.textContent = 'Géolocalisation indisponible sur cet appareil.';
      return Promise.resolve(false);
    }
    locating = true;
    originStatus.textContent = 'Localisation du point de départ…';
    renderOrigin();

    return new Promise(resolve => {
      geolocation.getCurrentPosition(position => {
        const lat = coordinate(position?.coords?.latitude, -90, 90);
        const lon = coordinate(position?.coords?.longitude, -180, 180);
        if (lat === null || lon === null) {
          locating = false;
          originStatus.textContent = 'Position reçue mais coordonnées invalides.';
          renderOrigin();
          resolve(false);
          return;
        }
        store.update(draft => {
          ensureContainers(draft);
          draft.settings.originLat = lat;
          draft.settings.originLon = lon;
          draft.settings.originName = 'Ma position';
        });
        locating = false;
        originStatus.textContent = 'Point de départ enregistré sur cet appareil.';
        renderOrigin(store.getState());
        resolve(true);
      }, () => {
        locating = false;
        originStatus.textContent = 'Impossible de récupérer la position. Autorise la localisation puis réessaie.';
        renderOrigin();
        resolve(false);
      }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });
  }

  function generate() {
    try {
      const snapshot = store.getState();
      const range = generatePlanningRange(snapshot, {
        weekDate: firstWeekDate(snapshot),
        weeks: 3,
      });

      store.update(draft => {
        ensureContainers(draft);
        for (const week of range.weeks) draft.planning.weeks[week.weekMonday] = week;
        draft.planning.currentWeek = range.startWeek;
        draft.settings.weekDate = range.startWeek;
        draft.planning.lastRange = {
          startWeek: range.startWeek,
          endWeek: range.endWeek,
          algorithm: range.algorithm,
          totalVisits: range.totalVisits,
          distinctStores: range.distinctStores,
          eligibleStores: range.eligibleStores,
        };
      });

      const remaining = range.remainingStores > 0
        ? ` ${range.remainingStores} magasin${range.remainingStores > 1 ? 's' : ''} planifiable${range.remainingStores > 1 ? 's' : ''} reste${range.remainingStores > 1 ? 'nt' : ''} hors de ces 3 semaines.`
        : ' Tous les magasins planifiables sont couverts sur la période.';
      const gpsWarning = range.missingCoordinates > 0
        ? ` ${range.missingCoordinates} magasin${range.missingCoordinates > 1 ? 's' : ''} planifiable${range.missingCoordinates > 1 ? 's' : ''} sans GPS ${range.missingCoordinates > 1 ? 'sont placés' : 'est placé'} à la fin.`
        : '';
      status.textContent = `3 semaines générées : ${range.totalVisits} visites, ${range.distinctStores} magasins distincts.${remaining}${gpsWarning}`;
      renderExport(store.getState());
      return range;
    } catch (error) {
      status.textContent = error instanceof PlanningRangeError || error instanceof PlanningRangeFeatureError
        ? error.message
        : 'Impossible de générer les 3 semaines.';
      return null;
    }
  }

  async function copyForTeamHaven() {
    const text = String(exportArea.value || '');
    if (!text) {
      copyStatus.textContent = 'Génère d’abord les 3 semaines.';
      return false;
    }
    if (!clipboard) {
      copyStatus.textContent = 'Copie automatique indisponible : le texte reste sélectionnable ci-dessus.';
      return false;
    }
    try {
      await clipboard.writeText(text);
      copyStatus.textContent = 'Planning copié. Tu peux le coller dans TeamHaven.';
      return true;
    } catch (_) {
      copyStatus.textContent = 'Copie automatique refusée : le texte reste sélectionnable ci-dessus.';
      return false;
    }
  }

  originButton.addEventListener('click', useCurrentPosition);
  button.addEventListener('click', generate);
  copyButton.addEventListener('click', copyForTeamHaven);
  const unsubscribe = store.subscribe(state => {
    latestState = state;
    renderOrigin(state);
    renderExport(state);
  });
  renderOrigin(latestState);
  renderExport(latestState);

  return Object.freeze({
    element: root,
    generate,
    useCurrentPosition,
    copyForTeamHaven,
    destroy: unsubscribe,
  });
}
