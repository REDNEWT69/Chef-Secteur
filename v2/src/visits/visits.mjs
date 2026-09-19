// Domain only: no planning mutations, DOM or implicit storage.
export const VISIT_VERSION = 1;
export const isVisit = row => row?.visitVersion === VISIT_VERSION;

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function validateVisits(rows) {
  if (!Array.isArray(rows)) throw Error('visits: tableau attendu');
  const ids = new Set();
  for (const row of rows) {
    // Pre-existing opaque placeholders remain readable, never interpreted as visits.
    if (!row || !Object.hasOwn(row, 'visitVersion')) continue;
    if (!isVisit(row) || typeof row.id !== 'string' || !row.id || typeof row.storeId !== 'string' || !row.storeId
      || ids.has(row.id) || rows.filter(other => other?.id === row.id).length !== 1 || !['in_progress', 'completed', 'cancelled'].includes(row.status)) throw Error('visits: visite invalide ou identifiant dupliqué');
    ids.add(row.id);
    if (row.source === 'native') {
      if (!isInstant(row.startedAt)) throw Error('visits: début invalide');
      if (row.status === 'completed') {
        if (!isInstant(row.completedAt) || row.completedAt < row.startedAt || !isDate(row.completedDate)) throw Error('visits: fin invalide');
      } else if (row.completedAt !== null || row.completedDate !== null) throw Error('visits: visite non terminée');
    } else throw Error('visits: provenance inconnue');
  }
  return rows;
}

export function historyForStore(state, storeId) {
  return state.visits.filter(row => isVisit(row) && row.storeId === String(storeId) && row.status === 'completed')
    .map(row => ({ ...row })).sort((a, b) => b.completedDate.localeCompare(a.completedDate)
      || String(b.completedAt || '').localeCompare(String(a.completedAt || '')) || a.id.localeCompare(b.id));
}

export function createVisitsService({ store, persist, now = () => new Date(), makeId = () => globalThis.crypto.randomUUID() }) {
  if (typeof persist !== 'function') throw new TypeError('persist: sauvegarde synchrone obligatoire');
  if (persist.constructor.name === 'AsyncFunction') throw new TypeError('persist: sauvegarde synchrone obligatoire');
  function commit(mutate) {
    const next = store.getState();
    const result = mutate(next);
    validateVisits(next.visits);
    const saved = persist(next); // An unavailable disk must not turn a visit into a false success.
    if (saved && typeof saved.then === 'function') throw new TypeError('persist: sauvegarde synchrone obligatoire');
    store.replace(next);
    return { ...result };
  }
  function start(storeId) {
    const id = String(storeId);
    const state = store.getState();
    if (!state.stores.some(row => String(row.id) === id && row.active !== false)) throw Error('Magasin absent ou inactif.');
    const current = state.visits.find(row => isVisit(row) && row.storeId === id && row.status === 'in_progress');
    if (current) return { ...current };
    return commit(next => {
      const row = { visitVersion: VISIT_VERSION, id: 'visit:' + makeId(), storeId: id, status: 'in_progress',
        startedAt: now().toISOString(), completedAt: null, completedDate: null, source: 'native' };
      next.visits.push(row);
      return row;
    });
  }
  function finish(id) {
    const current = store.getState().visits.find(row => isVisit(row) && row.id === id);
    if (!current) throw Error('Visite introuvable.');
    if (current.status === 'completed') return { ...current };
    if (current.status !== 'in_progress') throw Error('Cette visite ne peut pas être terminée.');
    return commit(next => {
      const row = next.visits.find(row => isVisit(row) && row.id === id), date = now();
      row.status = 'completed';
      row.completedAt = date.toISOString();
      row.completedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return row;
    });
  }
  function cancel(id) {
    const current = store.getState().visits.find(row => isVisit(row) && row.id === id);
    if (!current || current.status === 'completed') throw Error('Seule une visite en cours peut être annulée.');
    if (current.status === 'cancelled') return { ...current };
    return commit(next => { const row = next.visits.find(row => isVisit(row) && row.id === id); row.status = 'cancelled'; return row; });
  }
  return Object.freeze({ start, finish, cancel, history: id => historyForStore(store.getState(), id) });
}
