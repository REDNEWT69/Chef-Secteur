const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../profile-controller.js'), 'utf8');
const NOW = Date.parse('2026-10-03T10:00:00.000Z');
const paris = { baseName: 'Ma position actuelle', baseAddress: 'Paris, Île-de-France', baseLat: 48.8566, baseLon: 2.3522 };
const home = { baseName: 'Domicile', baseAddress: '1 rue de Test, Chambéry', baseLat: 45.5646, baseLon: 5.9178 };
const fresh = { timestamp: NOW, coords: { latitude: 45.9001, longitude: 6.1002, accuracy: 8 } };

function harness(profile, geolocation) {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  const context = {
    state: { profile: structuredClone(profile) }, navigator: { geolocation, onLine: false }, Date: Clock,
    document: { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, dispatchEvent() {} },
    addEventListener() {}, setTimeout, clearTimeout, queueMicrotask, console,
    hav(a, b) { return Math.abs(a.lat - b.lat) + Math.abs(a.lon - b.lon); }, renderHeader() {},
    save() { throw new Error('Fresh location must not persist outside generation.'); }
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'profile-controller.js' });
  return context;
}

function prepare(context) {
  assert.equal(typeof context.StoreRunnerProfile?.preparePlanningOrigin, 'function', 'profile owner must expose the awaited generation origin API');
  return context.StoreRunnerProfile.preparePlanningOrigin();
}

test('E — current location is awaited and published before geographic calculations', async () => {
  let deliver, requested;
  const c = harness(home, { getCurrentPosition(success, failure, options) { deliver = success; requested = options; } });
  let resolved = false;
  const pending = prepare(c).then(value => { resolved = true; return value; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(c.state.profile.baseLat, home.baseLat);
  assert.equal(requested.maximumAge, 0);
  assert.equal(requested.enableHighAccuracy, true);
  assert.ok(requested.timeout > 0 && requested.timeout <= 10000);
  deliver(fresh);
  const result = await pending;
  assert.equal(result.source, 'gps');
  assert.equal(c.state.profile.baseLat, fresh.coords.latitude);
  assert.equal(c.state.profile.baseLon, fresh.coords.longitude);
  assert.equal(c.baseObj().lat, fresh.coords.latitude);
  assert.equal(c.baseObj().lon, fresh.coords.longitude);
  assert.equal(c.havBase({ lat: fresh.coords.latitude, lon: fresh.coords.longitude }), 0);
});

test('F — a restored Paris GPS value never wins over a fresh fix', async () => {
  let calls = 0;
  const c = harness(paris, { getCurrentPosition(success) { calls++; success(fresh); } });
  const result = await prepare(c);
  assert.equal(calls, 1);
  assert.equal(result.base.lat, fresh.coords.latitude);
  assert.equal(result.base.lon, fresh.coords.longitude);
  assert.doesNotMatch(c.state.profile.baseAddress, /Paris/);
  assert.equal(c.state.profile.baseName, 'Ma position actuelle');
});

test('G — denied or unavailable location uses only an explicit saved user base with visible fallback', async () => {
  for (const code of [1, 2, 3]) {
    const c = harness(home, { getCurrentPosition(success, reject) { reject({ code }); } });
    const result = await prepare(c);
    assert.equal(result.source, 'saved_base');
    assert.equal(result.base.lat, home.baseLat);
    assert.match(result.message, /base enregistrée.*Domicile/i);
    assert.deepEqual(c.state.profile, home);
  }
});

test('a named user base saved by explicit coordinates remains a valid fallback without an address', async () => {
  const profile = { ...home, baseAddress: '' };
  const c = harness(profile, { getCurrentPosition(success, reject) { reject({ code: 1 }); } });
  const result = await prepare(c);
  assert.equal(result.source, 'saved_base');
  assert.match(result.message, /base enregistrée.*Domicile/i);
  assert.deepEqual(c.state.profile, profile);
});

test('H — missing or ambiguous saved origins block generation without reusing old GPS', async () => {
  const profiles = [paris, { baseName: '', baseAddress: '', baseLat: null, baseLon: null },
    { baseName: 'Départ', baseAddress: '', baseLat: 45, baseLon: 5 },
    { baseName: 'Base', baseAddress: '', baseLat: 45, baseLon: 5 },
    { ...paris, baseName: 'Ma position actuelle (GPS)' },
    { ...home, baseLat: null }, { ...home, baseLon: '' }];
  for (const profile of profiles) {
    const c = harness(profile, { getCurrentPosition(success, reject) { reject({ code: 1 }); } });
    await assert.rejects(prepare(c), /localisation.*(autorise|enregistre|base)/i);
    assert.deepEqual(c.state.profile, profile);
  }
});

test('an API returning a cached timestamp despite maximumAge=0 cannot publish that location', async () => {
  const c = harness(paris, { getCurrentPosition(success) { success({ ...fresh, timestamp: NOW - 60000 }); } });
  await assert.rejects(prepare(c), /localisation.*(fraîche|base|enregistre)/i);
  assert.deepEqual(c.state.profile, paris);
});

test('imprecise or invalid fixes never contaminate the origin', async () => {
  for (const position of [{ ...fresh, coords: { ...fresh.coords, accuracy: 900 } },
    { ...fresh, coords: { ...fresh.coords, latitude: 100 } }]) {
    const c = harness(paris, { getCurrentPosition(success) { success(position); } });
    await assert.rejects(prepare(c), /localisation|position/i);
    assert.deepEqual(c.state.profile, paris);
  }
});

test('best-fix acquisition is finite and its watch is always cleared, including synchronous callbacks', async () => {
  const cleared = [];
  const c = harness(home, {
    watchPosition(success, reject, options) { assert.equal(options.maximumAge, 0); success(fresh); return 7; },
    clearWatch(id) { cleared.push(id); }
  });
  assert.equal((await prepare(c)).source, 'gps');
  assert.deepEqual(cleared, [7]);
});

test('the profile owner never falls back after receiving a fresh fix only because the old base was invalid', async () => {
  const c = harness({ baseLat: null, baseLon: null, baseName: '', baseAddress: '' }, {
    getCurrentPosition(success) { success(fresh); }
  });
  assert.equal((await prepare(c)).source, 'gps');
  assert.equal(c.storeRunnerHasValidBase(), true);
});
