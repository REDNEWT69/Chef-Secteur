import assert from 'node:assert/strict';
import { createFakeDocument } from './fake-dom.mjs';
import {
  HorizontalSwipeError,
  bindHorizontalSwipe,
  classifyHorizontalSwipe,
} from '../src/ui/horizontal-swipe.mjs';

assert.equal(classifyHorizontalSwipe({ x: 300, y: 100 }, { x: 180, y: 105 }), 'left');
assert.equal(classifyHorizontalSwipe({ x: 80, y: 100 }, { x: 210, y: 96 }), 'right');
assert.equal(classifyHorizontalSwipe({ x: 300, y: 100 }, { x: 270, y: 102 }), null, 'petit déplacement ignoré');
assert.equal(classifyHorizontalSwipe({ x: 200, y: 100 }, { x: 205, y: 220 }), null, 'scroll vertical ignoré');
assert.equal(classifyHorizontalSwipe({ x: 300, y: 100 }, { x: 220, y: 170 }), null, 'diagonale insuffisamment horizontale ignorée');
assert.equal(classifyHorizontalSwipe(null, { x: 1, y: 1 }), null);

{
  const document = createFakeDocument();
  const zone = document.createElement('div');
  const target = document.createElement('article');
  const other = document.createElement('button');
  zone.appendChild(target);
  zone.appendChild(other);

  let left = 0;
  let right = 0;
  let touchMovePrevented = 0;
  const unbind = bindHorizontalSwipe({
    element: zone,
    onSwipeLeft: () => { left += 1; },
    onSwipeRight: () => { right += 1; },
  });

  zone.dispatch('touchstart', {
    target,
    touches: [{ clientX: 310, clientY: 100 }],
    timeStamp: 10,
  });
  zone.dispatch('touchmove', {
    target,
    touches: [{ clientX: 210, clientY: 104 }],
    preventDefault: () => { touchMovePrevented += 1; },
    timeStamp: 20,
  });
  zone.dispatch('touchend', {
    target,
    changedTouches: [{ clientX: 120, clientY: 105 }],
    timeStamp: 30,
  });
  assert.equal(left, 1);
  assert.equal(right, 0);
  assert.equal(touchMovePrevented, 0, 'le swipe ne doit jamais preventDefault le mouvement vertical/tactile');

  // Le clic synthétique immédiatement après le swipe est supprimé uniquement
  // s'il cible l'élément d'origine du geste.
  let prevented = 0;
  let stopped = 0;
  zone.dispatch('click', {
    target,
    timeStamp: 80,
    preventDefault: () => { prevented += 1; },
    stopImmediatePropagation: () => { stopped += 1; },
  });
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);

  // Un geste vertical ne déclenche ni changement de jour ni suppression de clic.
  zone.dispatch('touchstart', {
    target,
    touches: [{ clientX: 180, clientY: 100 }],
    timeStamp: 100,
  });
  zone.dispatch('touchmove', {
    target,
    touches: [{ clientX: 184, clientY: 180 }],
    timeStamp: 110,
  });
  zone.dispatch('touchend', {
    target,
    changedTouches: [{ clientX: 186, clientY: 240 }],
    timeStamp: 120,
  });
  assert.equal(left, 1);
  assert.equal(right, 0);

  // Swipe droite, puis clic sur une autre cible : aucun blocage global.
  zone.dispatch('touchstart', {
    target,
    touches: [{ clientX: 100, clientY: 90 }],
    timeStamp: 200,
  });
  zone.dispatch('touchend', {
    target,
    changedTouches: [{ clientX: 260, clientY: 92 }],
    timeStamp: 220,
  });
  assert.equal(right, 1);
  zone.dispatch('click', {
    target: other,
    timeStamp: 240,
    preventDefault: () => { prevented += 1; },
    stopImmediatePropagation: () => { stopped += 1; },
  });
  assert.equal(prevented, 1, 'un autre bouton ne doit jamais être bloqué après swipe');

  // Passé la fenêtre courte de suppression, même la cible d'origine redevient libre.
  zone.dispatch('click', {
    target,
    timeStamp: 1000,
    preventDefault: () => { prevented += 1; },
    stopImmediatePropagation: () => { stopped += 1; },
  });
  assert.equal(prevented, 1);

  unbind();
  zone.dispatch('touchstart', {
    target,
    touches: [{ clientX: 300, clientY: 100 }],
    timeStamp: 1100,
  });
  zone.dispatch('touchend', {
    target,
    changedTouches: [{ clientX: 100, clientY: 100 }],
    timeStamp: 1120,
  });
  assert.equal(left, 1, 'destroy/unbind retire les listeners de geste');
}

assert.throws(() => bindHorizontalSwipe(null), HorizontalSwipeError);
assert.throws(() => bindHorizontalSwipe({ element: {} }), HorizontalSwipeError);

console.log('v2 horizontal swipe: ok');
