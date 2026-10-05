// V272 — appearance is a bounded presentation preference, outside business state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const script = html.match(/<script>\s*([\s\S]*?StoreRunnerAppearanceBoot[\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'appearance bootstrap must execute inline before external resources');
assert.ok(html.indexOf('StoreRunnerAppearanceBoot') < html.indexOf('<link'), 'theme must precede resource loading and first paint');

function boot(value, { systemDark = false, unavailable = false, mediaAbsent = false } = {}) {
  const attrs = {}, mirror = new Map([['store-runner-appearance-boot-v1', value]]);
  const meta = { setAttribute: (_, v) => { attrs.meta = v; } };
  const window = { localStorage: {
    getItem: key => { if (unavailable) throw Error('unavailable'); return mirror.get(key); },
    setItem: (key, value) => { if (unavailable) throw Error('unavailable'); mirror.set(key, value); }
  } };
  if (!mediaAbsent) window.matchMedia = () => ({ matches: systemDark });
  vm.runInNewContext(script, { window, document: {
    documentElement: { setAttribute: (key, value) => { attrs[key] = value; } },
    querySelector: () => meta
  } });
  return { attrs, api: window.StoreRunnerAppearanceBoot, mirror };
}
const plain = value => JSON.parse(JSON.stringify(value));
for (const bad of [undefined, null, '', '{broken', 'null', '[]', '42', '{"mode":"night","accent":"#f00","personality":"wild"}']) {
  const env = boot(bad);
  assert.deepEqual(plain(env.api.normalize(bad)), { mode: 'light', accent: 'blue' });
  assert.equal(env.attrs['data-sr-theme'], 'light');
}
for (const mode of ['light', 'dark', 'system']) for (const accent of ['blue', 'indigo', 'teal', 'rose']) for (const systemDark of [false, true]) {
  const pref = { mode, accent }, env = boot(JSON.stringify(pref), { systemDark });
  assert.deepEqual(plain(env.api.normalize(pref)), pref);
  assert.equal(env.attrs['data-sr-mode'], mode);
  assert.equal(env.attrs['data-sr-accent'], accent);
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  assert.equal(env.attrs['data-sr-theme'], dark ? 'dark' : 'light');
  assert.equal(env.attrs.meta, dark ? '#151e2c' : '#f2f5fa');
  assert.deepEqual(JSON.parse(env.mirror.get('store-runner-appearance-boot-v1')), pref);
}
assert.equal(boot('{"mode":"system"}', { mediaAbsent: true }).attrs['data-sr-theme'], 'light');
assert.doesNotThrow(() => boot(null, { unavailable: true }), 'restricted storage must never prevent boot');
const normalized = boot(null).api.normalize({ mode: 'dark', accent: 'teal', personality: 'x', state: { plan: [] } });
assert.deepEqual(Object.keys(normalized).sort(), ['accent', 'mode'], 'no arbitrary preference or business field may enter appearance');

assert.match(html, /StoreRunnerAppearanceBoot\.apply\(window\.__chefStorage\.getItem\('store-runner-appearance-v1'\)\)/, 'durable preference is authoritative before revealing the runtime');
assert.match(html, /appearanceAttrs[\s\S]*?html data-store-runner-booting'\+appearanceAttrs/, 'document.write must carry the chosen appearance in the first HTML bytes');
assert.doesNotMatch(script, /\bstate\b\s*[.[=]|indexedDB|fetch\(|setInterval|MutationObserver/, 'pre-paint mirror must remain presentation only');
const nav = read('navigation-controller.js');
assert.match(nav, /window\.StoreRunnerAppearance\s*=/, 'navigation owns the shared sheet');
assert.match(nav, /store-runner-appearance-v1/);
assert.match(nav, /runnerAppearanceSheet/);
assert.match(nav, /runnerAppearancePreview/);
assert.doesNotMatch(nav, /setInterval\s*\(|setTimeout\s*\(/, 'appearance adds no polling or timer');
const runner = read('runner-visual.js');
assert.match(runner, /function react\(/, 'Runner exposes only a presentation reaction');
assert.doesNotMatch(runner, /StoreRunnerAppearance|store-runner-appearance|localStorage|__chefStorage/, 'Runner does not own appearance or persistence');
console.log('PASS: V272 appearance — 24 bounded theme/accent cases, safe boot, durable authority and presentation ownership.');
