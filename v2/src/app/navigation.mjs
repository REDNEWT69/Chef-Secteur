// Navigation V2 — logique pure, sans DOM.
//
// Ce module ne connaît ni `document` ni aucun élément d'interface : il ne fait
// que décrire les écrans valides et l'écran actif courant. Le shell (voir
// ./shell.mjs) est seul responsable de refléter cet état dans le DOM.

export const SCREEN_IDS = Object.freeze(['home', 'planning', 'stores', 'more']);

export class NavigationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NavigationError';
  }
}

export function isValidScreen(screenId) {
  return SCREEN_IDS.includes(screenId);
}

export function createNavigation(initialScreen = SCREEN_IDS[0]) {
  if (!isValidScreen(initialScreen)) {
    throw new NavigationError(`Écran initial inconnu : "${initialScreen}"`);
  }
  let active = initialScreen;

  return Object.freeze({
    getActive() {
      return active;
    },
    goTo(screenId) {
      if (!isValidScreen(screenId)) {
        throw new NavigationError(`Écran inconnu : "${screenId}"`);
      }
      active = screenId;
      return active;
    },
  });
}
