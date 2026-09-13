// Store Runner V2 — interaction tactile horizontale réutilisable.
//
// Contrat :
// - ne bloque jamais le scroll vertical (aucun preventDefault sur les events tactiles) ;
// - un swipe doit être franchement horizontal et dépasser un seuil ;
// - après un swipe reconnu, seul le clic synthétique immédiat sur la cible du
//   geste est supprimé, jamais les clics du reste de l'écran.

export class HorizontalSwipeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HorizontalSwipeError';
  }
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function classifyHorizontalSwipe(start, end, options = {}) {
  if (!start || !end) return null;
  const threshold = positiveNumber(options.threshold, 48);
  const dominance = positiveNumber(options.dominance, 1.35);
  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < threshold) return null;
  if (absX <= absY * dominance) return null;
  return dx < 0 ? 'left' : 'right';
}

function firstTouch(list) {
  return list && list.length === 1 ? list[0] : null;
}

function pointFromTouch(touch) {
  if (!touch) return null;
  const x = Number(touch.clientX);
  const y = Number(touch.clientY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function eventClock(event) {
  const t = Number(event?.timeStamp);
  return Number.isFinite(t) && t >= 0 ? t : Date.now();
}

function sameTarget(startTarget, clickTarget) {
  if (!startTarget || !clickTarget) return false;
  if (startTarget === clickTarget) return true;
  return typeof startTarget.contains === 'function' && startTarget.contains(clickTarget);
}

export function bindHorizontalSwipe(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new HorizontalSwipeError('bindHorizontalSwipe attend un objet d’options.');
  }
  const {
    element,
    onSwipeLeft,
    onSwipeRight,
    threshold = 48,
    dominance = 1.35,
    clickSuppressMs = 450,
  } = options;
  if (!element || typeof element.addEventListener !== 'function' || typeof element.removeEventListener !== 'function') {
    throw new HorizontalSwipeError('Un élément DOM valide est requis.');
  }
  if (typeof onSwipeLeft !== 'function' || typeof onSwipeRight !== 'function') {
    throw new HorizontalSwipeError('Les callbacks onSwipeLeft et onSwipeRight sont requis.');
  }

  const suppressDuration = positiveNumber(clickSuppressMs, 450);
  let gesture = null;
  let suppressClick = null;

  function onTouchStart(event) {
    const touch = firstTouch(event?.touches);
    const point = pointFromTouch(touch);
    if (!point) {
      gesture = null;
      return;
    }
    gesture = {
      start: point,
      last: point,
      target: event.target || null,
    };
  }

  function onTouchMove(event) {
    if (!gesture) return;
    const touch = firstTouch(event?.touches);
    const point = pointFromTouch(touch);
    if (point) gesture.last = point;
    // Intentionnellement aucun preventDefault : le scroll vertical appartient
    // au navigateur. Le CSS de la zone porte touch-action: pan-y.
  }

  function finishGesture(event) {
    if (!gesture) return;
    const changed = event?.changedTouches && event.changedTouches.length
      ? event.changedTouches[0]
      : null;
    const end = pointFromTouch(changed) || gesture.last;
    const direction = classifyHorizontalSwipe(gesture.start, end, { threshold, dominance });
    const startTarget = gesture.target;
    gesture = null;
    if (!direction) return;

    suppressClick = {
      target: startTarget,
      until: eventClock(event) + suppressDuration,
    };
    if (direction === 'left') onSwipeLeft();
    else onSwipeRight();
  }

  function cancelGesture() {
    gesture = null;
  }

  function onClickCapture(event) {
    if (!suppressClick) return;
    const now = eventClock(event);
    if (now > suppressClick.until) {
      suppressClick = null;
      return;
    }
    if (!sameTarget(suppressClick.target, event.target)) return;

    suppressClick = null;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    else if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: true });
  element.addEventListener('touchend', finishGesture, { passive: true });
  element.addEventListener('touchcancel', cancelGesture, { passive: true });
  element.addEventListener('click', onClickCapture, true);

  return function unbindHorizontalSwipe() {
    gesture = null;
    suppressClick = null;
    element.removeEventListener('touchstart', onTouchStart, { passive: true });
    element.removeEventListener('touchmove', onTouchMove, { passive: true });
    element.removeEventListener('touchend', finishGesture, { passive: true });
    element.removeEventListener('touchcancel', cancelGesture, { passive: true });
    element.removeEventListener('click', onClickCapture, true);
  };
}
