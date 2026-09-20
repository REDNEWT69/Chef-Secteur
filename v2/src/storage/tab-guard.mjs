// Store Runner V2 — protection des écritures locales entre onglets.
//
// Deux onglets de la même application partagent un seul stockage local. Sans
// garde, le second écrit par-dessus ce que le premier vient d'enregistrer, sans
// que personne ne le voie : une visite terminée disparaît, un import écrase un
// historique plus récent.
//
// Deux mécanismes, tous deux minimaux et adaptés au stockage actuel (une clé,
// une chaîne JSON) :
//
//  1. un verrou Web Locks portant le nom de la clé de stockage. Deux écritures
//     simultanées s'attendent au lieu de se croiser ; la seconde voit donc
//     l'état écrit par la première et peut décider en connaissance de cause.
//  2. une comparaison de la charge brute que CET onglet a réellement lue avec
//     celle présente dans le stockage au moment d'écrire. Toute écriture venue
//     d'ailleurs change cette chaîne : l'onglet sait alors qu'il est périmé et
//     refuse d'écrire plutôt que d'écraser.
//
// Les écritures de cet onglet passent par le proxy `storage` et mettent la
// référence à jour au passage : un onglet n'est jamais périmé vis-à-vis de
// lui-même, seul un autre onglet le rend périmé.

export const STALE_TAB_MESSAGE =
  'Un autre onglet a modifié ces données. Recharge la page pour repartir de la version la plus récente.';

export function createTabGuard(options = {}) {
  const { storage, key } = options;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'
    || typeof storage.removeItem !== 'function') {
    throw new TypeError('tabGuard: storage getItem/setItem/removeItem attendu');
  }
  if (typeof key !== 'string' || !key) throw new TypeError('tabGuard: clé de stockage attendue');

  // Web Locks absent (navigateur ancien, contexte non sécurisé) : la comparaison
  // de charge protège encore de l'écrasement silencieux, qui est l'essentiel.
  const locks = options.locks === undefined
    ? (globalThis.navigator && globalThis.navigator.locks) || null
    : options.locks;

  function read() {
    try { return storage.getItem(key); } catch (error) { return null; }
  }

  let seen = read();

  const guardedStorage = Object.freeze({
    getItem: name => storage.getItem(name),
    setItem(name, value) {
      storage.setItem(name, value);
      if (name === key) seen = value;
    },
    removeItem(name) {
      storage.removeItem(name);
      if (name === key) seen = null;
    },
  });

  function sync() { seen = read(); return seen; }
  function isStale() { return read() !== seen; }

  function withLock(callback) {
    if (locks && typeof locks.request === 'function') return locks.request(key, callback);
    return Promise.resolve().then(callback);
  }

  // La mutation reste synchrone : la persistance V2 l'est aussi, et un `await`
  // au milieu rouvrirait la fenêtre de course que le verrou vient de fermer.
  function commit(mutation) {
    if (isStale()) return { ok: false, reason: 'stale' };
    const value = mutation();
    if (value && typeof value.then === 'function') {
      throw new TypeError('tabGuard.run: mutation synchrone attendue');
    }
    sync();
    return { ok: true, value };
  }

  async function run(mutation) {
    if (typeof mutation !== 'function') throw new TypeError('tabGuard.run: fonction attendue');
    return withLock(() => commit(mutation));
  }

  return Object.freeze({ storage: guardedStorage, run, sync, isStale, seen: () => seen });
}
