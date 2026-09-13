// Store Runner V2 — reconnaissance minimale d'un swipe horizontal.
//
// Ce module ne connaît ni le Planning ni le DOM global. Il écoute uniquement
// l'élément qui lui est confié. Surtout, il n'appelle jamais preventDefault :
// le scroll vertical reste la responsabilité native du navigateur. Le CSS de
// la zone interactive utilise `touch-action: pan-y` pour réserver l'axe
// horizontal au geste applicatif sans casser le défilement vertical.

export class HorizontalSwipeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HorizontalSwipeError';
  }
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function eventPoint(event) {
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function attachHorizontalSwipe(element, options = {}) {
  if (!element || typeof element.addEventListener !== 'function' || typeof element.removeEventListener !== 'function') {
    throw new HorizontalSwipeError('Un élément DOM avec addEventListener/removeEventListener est requis.');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new HorizontalSwipeError('Les options du swipe doivent être un objet.');
  }
  if (typeof options.onSwipe !== 'function') {
    throw new HorizontalSwipeError('onSwipe doit être une fonction.');
  }

  const threshold = positiveNumber(options.threshold, 52);
  const intentThreshold = positiveNumber(options.intentThreshold, 10);
  const dominanceRatio = positiveNumber(options.dominanceRatio, 1.15);
  let gesture = null;
  let destroyed = false;

  function reset() {
    gesture = null;
  }

  function samePointer(event) {
    if (!gesture) return false;
    if (event?.pointerId === undefined || gesture.pointerId === undefined) return true;
    return event.pointerId === gesture.pointerId;
  }

  function onPointerDown(event) {
    if (destroyed || gesture) return;
    if (event?.isPrimary === false) return;
    if (event?.pointerType === 'mouse' && event?.button !== undefined && event.button !== 0) return;
    const point = eventPoint(event);
    if (!point) return;
    gesture = {
      pointerId: event?.pointerId,
      startX: point.x,
      startY: point.y,
      horizontalIntent: false,
      cancelled: false,
    };
  }

  function onPointerMove(event) {
    if (!samePointer(event)) return;
    const point = eventPoint(event);
    if (!point) return;
    const dx = point.x - gesture.startX;
    const dy = point.y - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (gesture.cancelled || gesture.horizontalIntent) return;

    // Un mouvement clairement vertical abandonne définitivement ce geste.
    // On ne bloque rien : le navigateur peut donc continuer son scroll natif.
    if (absY >= intentThreshold && absY > absX) {
      gesture.cancelled = true;
      return;
    }

    if (absX >= intentThreshold && absX > absY * dominanceRatio) {
      gesture.horizontalIntent = true;
    }
  }

  function onPointerUp(event) {
    if (!samePointer(event)) return;
    const current = gesture;
    const point = eventPoint(event);
    reset();
    if (!point || !current || current.cancelled || !current.horizontalIntent) return;

    const dx = point.x - current.startX;
    const dy = point.y - current.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < threshold || absX <= absY * dominanceRatio) return;

    options.onSwipe(dx < 0 ? 'next' : 'previous', Object.freeze({ deltaX: dx, deltaY: dy }));
  }

  function onPointerCancel(event) {
    if (samePointer(event)) reset();
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    reset();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
  }

  return Object.freeze({ destroy });
}
