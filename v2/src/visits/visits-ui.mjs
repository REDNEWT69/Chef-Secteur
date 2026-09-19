import { historyForStore, isVisit } from './visits.mjs';

// Mounted only by the owner of the store detail; no shell/global mutations.
export function appendStoreVisits(doc, host, state, storeId, service) {
  const section = doc.createElement('section');
  section.classList.add('srv2-store-visits');
  const heading = doc.createElement('h3'); heading.textContent = 'Visites'; section.appendChild(heading);
  const history = historyForStore(state, storeId);
  const label = doc.createElement('p'); label.classList.add('srv2-last-visit');
  const displayDate = date => date.split('-').reverse().join('/');
  label.textContent = history.length ? 'Dernière visite : ' + displayDate(history[0].completedDate) : 'Aucune visite terminée.';
  section.appendChild(label);
  const current = state.visits.find(row => isVisit(row) && row.storeId === String(storeId) && row.status === 'in_progress');
  const status = doc.createElement('p'); status.setAttribute('role', 'status');
  status.classList.add('srv2-visit-status'); status.textContent = current ? 'Visite en cours' : '';
  if (service) {
    const controls = doc.createElement('div'); controls.classList.add('srv2-visit-controls');
    function button(text, className, action) {
      const el = doc.createElement('button'); el.setAttribute('type', 'button'); el.classList.add(className); el.textContent = text;
      el.addEventListener('click', () => { try { action(); } catch (error) { status.textContent = 'Visite non enregistrée : ' + error.message; } });
      controls.appendChild(el);
    }
    if (current) {
      button('Terminer la visite', 'srv2-visit-finish', () => service.finish(current.id));
      button('Annuler la visite en cours', 'srv2-visit-cancel', () => service.cancel(current.id));
    } else if (state.stores.some(row => String(row.id) === String(storeId) && row.active !== false)) {
      button('Démarrer une visite', 'srv2-visit-start', () => service.start(storeId));
    }
    section.appendChild(controls);
  }
  section.appendChild(status);
  const list = doc.createElement('ol'); list.classList.add('srv2-visit-history'); list.setAttribute('aria-label', 'Historique des visites terminées');
  for (const visit of history) {
    const item = doc.createElement('li'); item.textContent = displayDate(visit.completedDate) + ' — Terminée';
    item.setAttribute('data-visit-id', visit.id); list.appendChild(item);
  }
  section.appendChild(list); host.appendChild(section);
}
