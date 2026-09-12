// Aides de rendu V2 — fonctions de construction DOM pures : elles reçoivent un
// `document` (réel ou faux document de test) et des données, et retournent des
// éléments. Elles ne connaissent ni le shell, ni la navigation, ni aucun état
// global : c'est ./shell.mjs qui les assemble et qui décide de la structure.

export function createScreenElement(document, screenId, label) {
  const section = document.createElement('section');
  section.setAttribute('data-screen', screenId);
  section.setAttribute('role', 'region');
  section.setAttribute('aria-hidden', 'true');
  section.classList.add('srv2-screen');

  const heading = document.createElement('h1');
  heading.textContent = label;

  const placeholder = document.createElement('p');
  placeholder.textContent = `Écran ${label} — placeholder V2.`;

  section.appendChild(heading);
  section.appendChild(placeholder);
  return section;
}

export function setScreenActive(screenEl, isActive) {
  screenEl.classList.toggle('is-active', isActive);
  screenEl.setAttribute('aria-hidden', String(!isActive));
  if ('hidden' in screenEl) screenEl.hidden = !isActive;
}

export function createTabButton(document, screenId, label, onSelect) {
  const button = document.createElement('button');
  button.setAttribute('type', 'button');
  button.setAttribute('data-tab', screenId);
  button.setAttribute('aria-selected', 'false');
  button.classList.add('srv2-tab');
  button.textContent = label;
  button.addEventListener('click', () => onSelect(screenId));
  return button;
}

export function setTabActive(tabEl, isActive) {
  tabEl.classList.toggle('is-active', isActive);
  tabEl.setAttribute('aria-selected', String(isActive));
}
