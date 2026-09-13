// Store Runner V2 — outils terrain locaux : point de départ et recopie TeamHaven.
// Cette feature ne géocode rien et n'envoie rien au réseau. Nom et coordonnées
// sont enregistrés uniquement dans le store V2 local du navigateur.

import {
  formatPlanningForTeamHaven,
  hasCompletePlanningRange,
} from './teamhaven.mjs';

export class TerrainToolsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TerrainToolsError';
  }
}

function requireOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TerrainToolsError('createTerrainToolsFeature attend { document, store }.');
  }
  const { document, store } = options;
  if (!document || typeof document.createElement !== 'function') {
    throw new TerrainToolsError('Un document valide est requis.');
  }
  if (!store || typeof store.getState !== 'function' || typeof store.update !== 'function' || typeof store.subscribe !== 'function') {
    throw new TerrainToolsError('Un store V2 valide est requis.');
  }
  const browserNavigator = typeof globalThis !== 'undefined' ? globalThis.navigator : null;
  return {
    document,
    store,
    clipboard: options.clipboard === undefined ? browserNavigator?.clipboard : options.clipboard,
  };
}

function coordinate(value, min, max) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function ensureSettings(draft) {
  if (!draft.settings || typeof draft.settings !== 'object' || Array.isArray(draft.settings)) draft.settings = {};
}

function originFromState(state) {
  const settings = state?.settings && typeof state.settings === 'object' ? state.settings : {};
  const profile = state?.profile && typeof state.profile === 'object' ? state.profile : {};
  const settingsLat = coordinate(settings.originLat, -90, 90);
  const settingsLon = coordinate(settings.originLon, -180, 180);
  if (settingsLat !== null && settingsLon !== null) {
    return {
      name: String(settings.originName || 'Point de départ'),
      lat: settingsLat,
      lon: settingsLon,
    };
  }
  const profileLat = coordinate(profile.baseLat, -90, 90);
  const profileLon = coordinate(profile.baseLon, -180, 180);
  if (profileLat !== null && profileLon !== null) {
    return {
      name: String(profile.baseName || 'Point de départ'),
      lat: profileLat,
      lon: profileLon,
    };
  }
  return { name: '', lat: null, lon: null };
}

function appendInput(doc, parent, labelText, className, attributes = {}) {
  const label = doc.createElement('label');
  label.classList.add('srv2-terrain-field');
  const caption = doc.createElement('span');
  caption.classList.add('srv2-field-label');
  caption.textContent = labelText;
  const input = doc.createElement('input');
  input.classList.add(className);
  for (const [name, value] of Object.entries(attributes)) input.setAttribute(name, value);
  label.appendChild(caption);
  label.appendChild(input);
  parent.appendChild(label);
  return input;
}

export function createTerrainToolsFeature(options) {
  const { document: doc, store, clipboard } = requireOptions(options);
  let latestState = store.getState();
  let editingOrigin = false;

  const root = doc.createElement('section');
  root.classList.add('srv2-terrain-tools');

  const title = doc.createElement('h2');
  title.classList.add('srv2-terrain-title');
  title.textContent = 'Préparer ma tournée';

  const privacy = doc.createElement('p');
  privacy.classList.add('srv2-terrain-privacy');
  privacy.textContent = 'Le point de départ et le planning restent sur cet appareil. Aucune adresse personnelle n’est publiée.';

  const originTitle = doc.createElement('h3');
  originTitle.classList.add('srv2-terrain-subtitle');
  originTitle.textContent = 'Point de départ';

  const originFields = doc.createElement('div');
  originFields.classList.add('srv2-terrain-origin-fields');
  const nameInput = appendInput(doc, originFields, 'Nom', 'srv2-origin-name', {
    type: 'text',
    autocomplete: 'off',
    placeholder: 'Domicile, agence…',
  });
  const latInput = appendInput(doc, originFields, 'Latitude', 'srv2-origin-lat', {
    type: 'number',
    step: 'any',
    inputmode: 'decimal',
    placeholder: '45.000000',
  });
  const lonInput = appendInput(doc, originFields, 'Longitude', 'srv2-origin-lon', {
    type: 'number',
    step: 'any',
    inputmode: 'decimal',
    placeholder: '4.000000',
  });

  const saveOriginButton = doc.createElement('button');
  saveOriginButton.setAttribute('type', 'button');
  saveOriginButton.classList.add('srv2-origin-save');
  saveOriginButton.textContent = 'Enregistrer le départ';

  const originStatus = doc.createElement('p');
  originStatus.classList.add('srv2-origin-status');
  originStatus.setAttribute('aria-live', 'polite');

  const exportTitle = doc.createElement('h3');
  exportTitle.classList.add('srv2-terrain-subtitle');
  exportTitle.textContent = 'Recopie TeamHaven';

  const exportHelp = doc.createElement('p');
  exportHelp.classList.add('srv2-teamhaven-help');
  exportHelp.textContent = 'Après génération, les 3 semaines apparaissent ici dans l’ordre jour par jour.';

  const output = doc.createElement('textarea');
  output.classList.add('srv2-teamhaven-output');
  output.setAttribute('readonly', 'readonly');
  output.setAttribute('rows', '14');
  output.setAttribute('aria-label', 'Planning trois semaines pour TeamHaven');

  const copyButton = doc.createElement('button');
  copyButton.setAttribute('type', 'button');
  copyButton.classList.add('srv2-teamhaven-copy');
  copyButton.textContent = 'Copier pour TeamHaven';

  const copyStatus = doc.createElement('p');
  copyStatus.classList.add('srv2-teamhaven-status');
  copyStatus.setAttribute('aria-live', 'polite');

  root.appendChild(title);
  root.appendChild(privacy);
  root.appendChild(originTitle);
  root.appendChild(originFields);
  root.appendChild(saveOriginButton);
  root.appendChild(originStatus);
  root.appendChild(exportTitle);
  root.appendChild(exportHelp);
  root.appendChild(output);
  root.appendChild(copyButton);
  root.appendChild(copyStatus);

  for (const input of [nameInput, latInput, lonInput]) {
    input.addEventListener('input', () => { editingOrigin = true; });
  }

  function syncOriginInputs(state = latestState) {
    if (editingOrigin) return;
    const origin = originFromState(state);
    nameInput.value = origin.name;
    latInput.value = origin.lat === null ? '' : String(origin.lat);
    lonInput.value = origin.lon === null ? '' : String(origin.lon);
  }

  function renderTeamHaven(state = latestState) {
    const complete = hasCompletePlanningRange(state, { weeks: 3 });
    output.value = complete ? formatPlanningForTeamHaven(state, { weeks: 3 }) : '';
    copyButton.disabled = !complete;
    copyButton.setAttribute('aria-disabled', String(copyButton.disabled));
    if (!complete) copyStatus.textContent = 'Génère d’abord les 3 semaines pour préparer la recopie.';
    else if (copyStatus.textContent.startsWith('Génère')) copyStatus.textContent = 'Planning 3 semaines prêt à recopier.';
  }

  function render(state) {
    latestState = state || store.getState();
    syncOriginInputs(latestState);
    renderTeamHaven(latestState);
  }

  function saveOrigin() {
    const lat = coordinate(latInput.value, -90, 90);
    const lon = coordinate(lonInput.value, -180, 180);
    if (lat === null || lon === null) {
      originStatus.textContent = 'Coordonnées invalides : latitude -90 à 90, longitude -180 à 180.';
      return false;
    }
    const name = String(nameInput.value || '').trim() || 'Point de départ';
    editingOrigin = false;
    store.update(draft => {
      ensureSettings(draft);
      draft.settings.originName = name;
      draft.settings.originLat = lat;
      draft.settings.originLon = lon;
    });
    originStatus.textContent = `Départ enregistré : ${name}.`;
    return true;
  }

  async function copyTeamHaven() {
    const text = String(output.value || '');
    if (!text) {
      copyStatus.textContent = 'Aucun planning 3 semaines à copier.';
      return false;
    }
    try {
      if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('clipboard unavailable');
      await clipboard.writeText(text);
      copyStatus.textContent = 'Planning 3 semaines copié. Tu peux le coller dans TeamHaven.';
      return true;
    } catch (_) {
      if (typeof output.focus === 'function') output.focus();
      if (typeof output.select === 'function') output.select();
      copyStatus.textContent = 'Copie automatique indisponible : le texte reste affiché pour une copie manuelle.';
      return false;
    }
  }

  saveOriginButton.addEventListener('click', saveOrigin);
  copyButton.addEventListener('click', () => { void copyTeamHaven(); });

  const unsubscribe = store.subscribe(render);
  render(latestState);

  return Object.freeze({
    element: root,
    inputs: Object.freeze({ name: nameInput, lat: latInput, lon: lonInput }),
    output,
    saveOrigin,
    copyTeamHaven,
    destroy: unsubscribe,
  });
}
