// Shell mobile V2 — propriétaire unique de la structure globale de la page.
//
// Principe : structure créée une fois -> slots explicites -> écrans/features
// montés dans leurs slots. Aucun autre module ne doit déplacer ou réparer ce
// que ce fichier construit ; si une feature a besoin d'un point d'ancrage qui
// n'existe pas, l'API de ce shell doit être étendue, jamais contournée.
//
// Ce module n'importe pas `document` depuis le global : il reçoit un document
// (réel dans le navigateur, faux document minimal dans les tests Node — voir
// v2/tests/fake-dom.mjs) afin de rester testable sans navigateur.

import { SCREEN_IDS, createNavigation } from './navigation.mjs';
import { createScreenElement, setScreenActive, createTabButton, setTabActive } from '../ui/render.mjs';

const SCREEN_LABELS = Object.freeze({
  home: 'Accueil',
  planning: 'Planning',
  stores: 'Magasins',
  more: 'Plus',
});

// Marqueur posé sur l'élément racine de montage pour refuser une seconde
// initialisation du shell sur ce même élément (voir §6 : init idempotente ou
// explicitement refusée — ce shell choisit le refus explicite).
const SHELL_OWNER_KEY = '__storeRunnerV2Shell';

export class ShellError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShellError';
  }
}

// Seules options acceptées par createShell. Toute autre clé — y compris une
// faute de frappe ou une clé explicitement valant `undefined` — est un refus
// explicite (ShellError), jamais une valeur silencieusement ignorée.
const ALLOWED_OPTIONS = ['document', 'root', 'initialScreen'];

function describeOptions(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'un tableau';
  return typeof value;
}

export function createShell(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ShellError(
      `createShell attend un objet d'options simple ({ document, root, initialScreen }) ; reçu : ${describeOptions(options)}.`
    );
  }

  const unknownKeys = Object.keys(options).filter(key => !ALLOWED_OPTIONS.includes(key));
  if (unknownKeys.length) {
    throw new ShellError(
      `createShell : option(s) inconnue(s) : ${unknownKeys.join(', ')}. Options acceptées : ${ALLOWED_OPTIONS.join(', ')}.`
    );
  }

  const {
    document: doc = (typeof globalThis !== 'undefined' ? globalThis.document : undefined),
    root,
    initialScreen = SCREEN_IDS[0],
  } = options;
  if (!doc) throw new ShellError('Un document est requis pour créer le shell.');
  const mount = root || doc.body;
  if (!mount) throw new ShellError('Aucune racine de montage disponible pour le shell.');
  if (mount[SHELL_OWNER_KEY]) {
    throw new ShellError('Le shell est déjà initialisé sur cet élément racine.');
  }

  const nav = createNavigation(initialScreen);

  // --- Header ---------------------------------------------------------
  const header = doc.createElement('header');
  header.classList.add('srv2-header');

  const title = doc.createElement('h1');
  title.classList.add('srv2-title');
  title.textContent = 'Store Runner';

  const headerActions = doc.createElement('div');
  headerActions.classList.add('srv2-header-actions');

  header.appendChild(title);
  header.appendChild(headerActions);

  // --- Zone principale : un écran placeholder par entrée de SCREEN_IDS ---
  const main = doc.createElement('main');
  main.classList.add('srv2-main');

  const screenElements = new Map();
  for (const screenId of SCREEN_IDS) {
    const el = createScreenElement(doc, screenId, SCREEN_LABELS[screenId]);
    screenElements.set(screenId, el);
    main.appendChild(el);
  }

  // --- Navigation basse -------------------------------------------------
  const navEl = doc.createElement('nav');
  navEl.classList.add('srv2-nav');
  navEl.setAttribute('role', 'navigation');

  const tabButtons = new Map();
  for (const screenId of SCREEN_IDS) {
    const btn = createTabButton(doc, screenId, SCREEN_LABELS[screenId], goTo);
    tabButtons.set(screenId, btn);
    navEl.appendChild(btn);
  }

  function applyActive() {
    const active = nav.getActive();
    for (const [screenId, el] of screenElements) setScreenActive(el, screenId === active);
    for (const [screenId, btn] of tabButtons) setTabActive(btn, screenId === active);
  }

  function goTo(screenId) {
    // nav.goTo lève avant toute mutation si l'écran est inconnu : l'état
    // affiché ne change donc jamais sur un refus.
    nav.goTo(screenId);
    applyActive();
    return nav.getActive();
  }

  // --- Assemblage : une seule fois, à l'initialisation -----------------
  mount.appendChild(header);
  mount.appendChild(main);
  mount.appendChild(navEl);
  applyActive();
  mount[SHELL_OWNER_KEY] = true;

  // --- Points d'extension explicites -------------------------------------
  const slots = Object.freeze({
    main,
    'header-actions': headerActions,
  });

  function getSlot(name) {
    if (!(name in slots)) throw new ShellError(`Slot inconnu : "${name}"`);
    return slots[name];
  }

  function mountScreen(screenId, node) {
    if (!screenElements.has(screenId)) throw new ShellError(`Écran inconnu : "${screenId}"`);
    if (!node) throw new ShellError('mountScreen requiert un nœud à monter.');
    const target = screenElements.get(screenId);
    target.appendChild(node);
    return target;
  }

  return Object.freeze({
    getActiveScreen: () => nav.getActive(),
    goTo,
    getSlot,
    mountScreen,
    elements: Object.freeze({ header, main, nav: navEl }),
  });
}
