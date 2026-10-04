// Runner movement: anchors are owned by the host, no application data is needed.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'runner-visual.js'), 'utf8');

function environment({ reduced = false, animationSupported = true } = {}) {
  const animations = [], timers = new Map();
  let timerId = 0;
  class Element {
    constructor(doc) {
      this.ownerDocument = doc; this.nodeType = 1; this.children = []; this.parentNode = null;
      this.attributes = {}; this.rect = { left: 0, top: 0, width: 56, height: 56 };
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
      this.style = { setProperty: (key, value) => { this.style[key] = value; } };
      if (animationSupported) this.animate = (frames, options) => {
        const animation = { frames, options, canceled: false, onfinish: null, oncancel: null,
          cancel() { this.canceled = true; if (this.oncancel) this.oncancel(); } };
        animations.push(animation);
        return animation;
      };
    }
    get isConnected() { return this === this.ownerDocument.body || this === this.ownerDocument.head || !!(this.parentNode && this.parentNode.isConnected); }
    appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); this.children.push(child); child.parentNode = this; return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
    contains(other) { return other === this || this.children.some(child => child.contains(other)); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    querySelector(selector) { return this.parts ? this.parts[selector] || null : null; }
    dispatchEvent() { return true; }
    set innerHTML(value) {
      // Only the constant SVG/bubble template used by mount is required here.
      this.children = [];
      for (let i = 0; i < 3; i++) this.appendChild(new Element(this.ownerDocument));
      const bubble = this.children[1]; bubble.hidden = true;
      bubble.parts = { '.srRunnerBubbleTitle': new Element(this.ownerDocument), '.srRunnerBubbleText': new Element(this.ownerDocument) };
      this.children[0].getBoundingClientRect = () => ({ ...this.parentNode.rect, width: 56, height: 56 * 280 / 240 });
    }
    getBoundingClientRect() { return this.rect; }
  }
  const document = {
    createElement: () => new Element(document),
    querySelector: selector => document.selectors[selector] || null,
    getElementById: id => document.head.children.find(node => node.id === id) || null,
    selectors: {}
  };
  document.body = new Element(document); document.head = new Element(document);
  const window = {
    document, matchMedia: () => ({ matches: reduced }),
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id), CustomEvent: class {}
  };
  for (const key of ['state', 'localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(window, key, { get() { throw Error('Forbidden data access: ' + key); } });
  vm.runInNewContext(source, { window });
  function anchor(selector, rect) {
    const node = new Element(document); node.rect = { ...node.rect, ...rect };
    document.body.appendChild(node); document.selectors[selector] = node; return node;
  }
  const origin = anchor('#origin', { left: 240, top: 24 });
  const destination = anchor('#destination', { left: 300, top: 300 });
  const next = anchor('#next', { left: 250, top: 400 });
  return { Runner: window.Runner, document, animations, timers, origin, destination, next };
}

// A public call without an instance never invents an element or reads data.
{
  const env = environment();
  assert.equal(env.Runner.moveTo('#destination'), false);
  assert.equal(env.Runner.mounted(), 0);
  assert.equal(env.animations.length, 0);
}

// One existing SVG moves in the host's flow; repeat calls do not replay it.
{
  const env = environment();
  const runner = env.Runner.mount(env.origin, { decorative: true, size: 'sm' });
  const figure = runner.el.children[0];
  assert.equal(runner.moveTo(env.destination, { from: env.origin }), true);
  assert.equal(runner.el.parentNode, env.destination);
  assert.equal(runner.el.children[0], figure, 'movement preserves the SVG/skin identity');
  assert.equal(runner.el.style.pointerEvents, 'none');
  assert.equal(runner.isMoving(), true);
  assert.equal(env.animations.length, 1);
  assert.equal(env.animations[0].options.iterations, 1);
  assert.equal(env.animations[0].options.duration, 680);
  assert.deepEqual(Object.keys(env.animations[0].frames[0]).sort(), ['opacity', 'transform']);
  const translation = env.animations[0].frames[0].transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/);
  assert.equal(Number(translation[1]), -60, 'departure is centered on the actual origin rectangle');
  assert.ok(Math.abs(Number(translation[2]) - (24 + 28 - 300 - 56 * 280 / 240 / 2)) < 1e-9);
  for (let i = 0; i < 6; i++) assert.equal(runner.moveTo(env.destination, { from: env.origin }), true);
  assert.equal(env.animations.length, 1, 'same destination does not restart movement on rerender');
  env.animations[0].onfinish();
  assert.equal(runner.isMoving(), false);
  assert.equal(env.animations[0].canceled, true, 'finished effect is released');
  assert.equal(env.animations[0].onfinish, null);
  assert.equal(env.animations[0].oncancel, null);
  assert.equal(env.timers.size, 0, 'movement never starts timers');
  assert.equal(runner.destroy(), true);
  assert.equal(env.Runner.mounted(), 0);
  assert.equal(runner.el.parentNode, null);
}

// The host may mount directly at the destination and supply a first-entry origin.
{
  const env = environment(), runner = env.Runner.mount(env.destination, { decorative: true });
  assert.equal(runner.moveTo(env.destination, { from: env.origin }), true);
  assert.equal(env.animations.length, 1, 'first movement can start from a distinct explicit origin in the final flow');
  runner.moveTo(env.destination, { from: env.origin });
  assert.equal(env.animations.length, 1, 'the same explicit origin cannot replay a settled target');
  runner.moveTo(env.destination, { animate: false });
  assert.equal(runner.isMoving(), false, 'an explicit direct placement cancels an existing journey to the same target');
  assert.equal(env.animations[0].canceled, true);
}

// A host can request the reusable peek entrance: it remains one bounded journey.
{
  const env = environment(), runner = env.Runner.mount(env.destination, { decorative: true });
  assert.equal(runner.moveTo(env.destination, { from: env.origin, entrance: 'peek', duration: 1180 }), true);
  assert.equal(env.animations.length, 1, 'the minimal fake DOM records the host journey');
  assert.equal(env.animations[0].options.duration, 1180);
  assert.equal(env.animations[0].frames.length, 7);
  assert.equal(env.animations[0].frames[2].offset, .18, 'peek is visible before the journey');
  assert.equal(env.animations[0].frames[5].offset, .52, 'the final travel starts after the expression');
  assert.ok(env.animations[0].frames.every(frame => frame.opacity === 1), 'peek keeps the normal Runner colors without a fade');
  assert.match(env.animations[0].frames[3].transform, /rotate\(-3deg\)/);
  assert.equal(env.timers.size, 0);
}

// Reduced motion, explicit opt-out, missing/hidden origins and older browsers place directly.
for (const scenario of ['reduced', 'motion-off', 'animate-false', 'missing-origin', 'hidden-origin', 'no-waapi']) {
  const env = environment({ reduced: scenario === 'reduced', animationSupported: scenario !== 'no-waapi' });
  const runner = env.Runner.mount(env.origin, { decorative: true, motion: scenario === 'motion-off' ? 'off' : 'auto' });
  if (scenario === 'hidden-origin') env.origin.rect.width = 0;
  assert.equal(runner.moveTo(env.destination, { from: scenario === 'missing-origin' ? '#absent' : env.origin, animate: scenario !== 'animate-false' }), true, scenario);
  assert.equal(runner.el.parentNode, env.destination, scenario);
  assert.equal(runner.isMoving(), false, scenario);
  assert.equal(env.animations.length, 0, scenario);
  assert.equal(env.timers.size, 0, scenario);
}

// Missing destinations stay safe, or use only the host's explicit fallback.
{
  const env = environment(), runner = env.Runner.mount(env.origin, { decorative: true });
  assert.equal(runner.moveTo('#absent'), false);
  assert.equal(runner.el.parentNode, env.origin);
  assert.equal(runner.moveTo('#absent', { fallback: env.destination, animate: false }), true);
  assert.equal(runner.el.parentNode, env.destination);
  assert.equal(runner.moveTo(runner.el.children[0]), false, 'a Runner cannot be appended inside its own SVG');
  assert.equal(runner.el.parentNode, env.destination);
  assert.equal(env.animations.length, 0);
}

// A stale DOM reference is as absent as an unresolved selector.
{
  const env = environment(), runner = env.Runner.mount(env.origin, { decorative: true });
  env.document.body.removeChild(env.destination);
  assert.equal(runner.moveTo(env.destination), false, 'a detached destination is refused before moving Runner');
  assert.equal(runner.el.parentNode, env.origin, 'the current live origin is retained');
  assert.equal(runner.el.isConnected, true);
  assert.equal(runner.moveTo(env.destination, { fallback: env.next, animate: false }), true);
  assert.equal(runner.el.parentNode, env.next, 'a detached target uses only an explicit live fallback');
  assert.equal(runner.el.isConnected, true);
  assert.equal(env.Runner.mounted(), 1);
  runner.moveTo(env.origin, { from: env.next });
  assert.equal(runner.isMoving(), true);
  env.document.body.removeChild(env.next);
  assert.equal(runner.moveTo(env.destination, { fallback: env.next }), false, 'a detached fallback is also refused');
  assert.equal(runner.el.parentNode, env.origin);
  assert.equal(runner.el.isConnected, true);
  assert.equal(runner.isMoving(), false, 'an invalid destination cancels the old movement at its reserved live place');
  assert.equal(env.animations[0].canceled, true);
  assert.equal(env.animations[0].onfinish, null);
  assert.equal(env.animations[0].oncancel, null);
  assert.equal(env.timers.size, 0);
}

// Navigation/redraw and an interrupted second move release old effects and message timers.
{
  const env = environment(), runner = env.Runner.mount(env.origin, { decorative: true });
  runner.showMessage('A visual message', { duration: 2000 });
  runner.moveTo(env.destination, { from: env.origin, duration: 9999 });
  assert.equal(env.animations[0].options.duration, 1400, 'host cannot request an unbounded movement');
  runner.moveTo(env.next);
  assert.equal(env.animations[0].canceled, true);
  assert.equal(env.animations[0].onfinish, null);
  assert.equal(env.animations.length, 2);
  assert.equal(runner.cancelMove(), true);
  assert.equal(runner.cancelMove(), false);
  runner.moveTo(env.destination);
  env.destination.removeChild(runner.el);
  assert.equal(env.Runner.mounted(), 0, 'removed hosts are destroyed on the next public prune');
  assert.equal(env.animations[2].canceled, true);
  assert.equal(env.timers.size, 0, 'pruning a removed instance also releases message timers');
  assert.equal(runner.moveTo(env.next), false);
  assert.equal(runner.destroy(), false);
}

console.log('PASS: Runner movement V270 — host anchors, one finite FLIP, direct reduced motion, clean lifecycle, no data access');
