// Store Runner V2 — réordonnancement manuel d'une journée au doigt.
//
// Ce module est une extension UI du Planning : il ne génère aucune visite,
// ne change jamais de jour et ne possède pas le moteur Planning. Il ajoute une
// poignée tactile aux cartes déjà rendues par planning.mjs et persiste seulement
// l'ordre des IDs de la journée active.

export class PlanningReorderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanningReorderError';
  }
}

function integerIndex(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const index = Math.trunc(number);
  return Math.max(0, Math.min(max, index));
}

export function reorderPlanningIds(ids, storeId, targetIndex) {
  if (!Array.isArray(ids)) throw new PlanningReorderError('Une liste de magasins est requise.');
  if (storeId === undefined || storeId === null) throw new PlanningReorderError('Un magasin est requis.');

  const sourceIndex = ids.findIndex(id => String(id) === String(storeId));
  if (sourceIndex < 0) return ids.slice();
  if (ids.length < 2) return ids.slice();

  const index = integerIndex(targetIndex, ids.length - 1);
  if (index === null) throw new PlanningReorderError('Une position valide est requise.');
  if (index === sourceIndex) return ids.slice();

  const next = ids.slice();
  const [item] = next.splice(sourceIndex, 1);
  next.splice(index, 0, item);
  return next;
}

function requireOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new PlanningReorderError('createPlanningReorderFeature attend { document, store, planningFeature }.');
  }
  const { document, store, planningFeature } = options;
  if (!document || typeof document.createElement !== 'function') {
    throw new PlanningReorderError('Un document valide est requis.');
  }
  if (!store || typeof store.getState !== 'function' || typeof store.update !== 'function') {
    throw new PlanningReorderError('Un store V2 valide est requis.');
  }
  if (
    !planningFeature ||
    !planningFeature.element ||
    typeof planningFeature.getWeekMonday !== 'function' ||
    typeof planningFeature.getSelectedDay !== 'function'
  ) {
    throw new PlanningReorderError('La feature Planning V2 est requise.');
  }
  return { document, store, planningFeature };
}

function sameOrder(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((id, i) => String(id) === String(b[i]));
}

export function createPlanningReorderFeature(options) {
  const { document: doc, store, planningFeature } = requireOptions(options);
  const root = planningFeature.element;
  const list = root.querySelector('.srv2-planning-list');
  const status = root.querySelector('.srv2-planning-status');
  if (!list) throw new PlanningReorderError('La liste Planning V2 est introuvable.');

  let drag = null;
  let destroyed = false;

  function context() {
    const weekMonday = planningFeature.getWeekMonday();
    const day = planningFeature.getSelectedDay();
    const state = store.getState();
    const ids = state?.planning?.weeks?.[weekMonday]?.days?.[day];
    return {
      weekMonday,
      day,
      ids: Array.isArray(ids) ? ids.slice() : [],
    };
  }

  function setStatus(message) {
    if (status) status.textContent = String(message || '');
  }

  function persist(storeId, targetIndex, captured = context()) {
    const current = store.getState()?.planning?.weeks?.[captured.weekMonday]?.days?.[captured.day];
    if (!Array.isArray(current)) return { changed: false, ids: [] };

    const next = reorderPlanningIds(current, storeId, targetIndex);
    if (sameOrder(current, next)) return { changed: false, ids: next };

    store.update(draft => {
      const dayIds = draft?.planning?.weeks?.[captured.weekMonday]?.days?.[captured.day];
      if (!Array.isArray(dayIds)) return;
      draft.planning.weeks[captured.weekMonday].days[captured.day] = reorderPlanningIds(dayIds, storeId, targetIndex);
    });
    return { changed: true, ids: next };
  }

  function cardRows() {
    return Array.from(list.querySelectorAll('.srv2-planning-card[data-store-id]'));
  }

  function targetIndexFor(clientY) {
    if (!drag) return 0;
    const rows = cardRows().filter(card => card !== drag.card);
    let index = 0;
    for (const card of rows) {
      if (typeof card.getBoundingClientRect !== 'function') continue;
      const box = card.getBoundingClientRect();
      if (Number(clientY) > box.top + box.height / 2) index += 1;
    }
    return Math.max(0, Math.min(rows.length, index));
  }

  function preview(targetIndex) {
    if (!drag) return;
    const rows = cardRows().filter(card => card !== drag.card);
    const before = rows[targetIndex] || null;
    if (before) list.insertBefore(drag.card, before);
    else list.appendChild(drag.card);
    drag.targetIndex = targetIndex;
  }

  function resetClasses(active = drag) {
    if (!active) return;
    active.card.classList.remove('is-dragging');
    list.classList.remove('is-reordering');
  }

  function restoreRenderedDay(active) {
    try {
      if (active && planningFeature.getSelectedDay() === active.day && planningFeature.getWeekMonday() === active.weekMonday) {
        planningFeature.selectDay(active.day);
      }
    } catch (_) {
      // Une annulation ne doit jamais casser l'écran Planning.
    }
  }

  function finish(event, commit) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const active = drag;
    drag = null;
    resetClasses(active);
    try {
      if (active.handle?.hasPointerCapture?.(active.pointerId)) active.handle.releasePointerCapture(active.pointerId);
    } catch (_) {}
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!commit) {
      restoreRenderedDay(active);
      setStatus('Déplacement annulé.');
      return;
    }

    const result = persist(active.storeId, active.targetIndex, active);
    if (!result.changed) {
      restoreRenderedDay(active);
      setStatus('Ordre inchangé.');
      return;
    }
    setStatus('Ordre de la journée enregistré.');
  }

  function bindHandle(card) {
    if (!card || card.querySelector('.srv2-planning-drag-handle')) return;
    const storeId = card.getAttribute('data-store-id');
    if (!storeId) return;

    const handle = doc.createElement('button');
    handle.setAttribute('type', 'button');
    handle.classList.add('srv2-planning-drag-handle');
    handle.textContent = '⠿';
    const name = card.querySelector('.srv2-planning-store-name')?.textContent || 'ce magasin';
    handle.setAttribute('aria-label', `Déplacer ${name}`);
    handle.setAttribute('title', 'Maintenir et glisser pour changer l’ordre');

    // La poignée possède le geste vertical. Le swipe horizontal entre jours ne
    // doit pas interpréter le même toucher.
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      handle.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }
    handle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });

    handle.addEventListener('pointerdown', event => {
      if (destroyed || drag) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const captured = context();
      if (captured.ids.length < 2) return;
      const sourceIndex = captured.ids.findIndex(id => String(id) === String(storeId));
      if (sourceIndex < 0) return;

      drag = {
        ...captured,
        storeId,
        sourceIndex,
        targetIndex: sourceIndex,
        pointerId: event.pointerId,
        card,
        handle,
      };
      card.classList.add('is-dragging');
      list.classList.add('is-reordering');
      try { handle.setPointerCapture?.(event.pointerId); } catch (_) {}
      event.preventDefault();
      event.stopPropagation();
      setStatus('Glisse le magasin puis relâche.');
    });

    handle.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId || drag.handle !== handle) return;
      const y = Number(event.clientY);
      if (!Number.isFinite(y)) return;
      event.preventDefault();
      event.stopPropagation();
      preview(targetIndexFor(y));
    });
    handle.addEventListener('pointerup', event => finish(event, true));
    handle.addEventListener('pointercancel', event => finish(event, false));

    card.appendChild(handle);
  }

  function enhance() {
    if (destroyed) return;
    for (const card of cardRows()) bindHandle(card);
  }

  enhance();
  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(() => enhance())
    : null;
  observer?.observe(list, { childList: true });

  function destroy() {
    destroyed = true;
    observer?.disconnect();
    if (drag) {
      const active = drag;
      drag = null;
      resetClasses(active);
    }
  }

  return Object.freeze({
    persist,
    enhance,
    destroy,
  });
}
