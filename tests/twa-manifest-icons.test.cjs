const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function icon(size, purpose) {
  return manifest.icons.find(item => item.type === 'image/png' && item.sizes === size && item.purpose === purpose);
}

function pngInfo(relative) {
  const file = path.join(ROOT, relative);
  const data = fs.readFileSync(file);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${relative} doit être un PNG`);
  assert.equal(data.toString('ascii', 12, 16), 'IHDR', `${relative} doit commencer par IHDR`);
  return {
    data,
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24],
    colorType: data[25]
  };
}

function rgbaPixels(info) {
  assert.equal(info.bitDepth, 8, 'le PNG maskable doit être en 8 bits');
  assert.equal(info.colorType, 6, 'le PNG maskable doit être RGBA');
  const chunks = [];
  for (let offset = 8; offset < info.data.length;) {
    const length = info.data.readUInt32BE(offset);
    const type = info.data.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(info.data.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = info.width * 4;
  const pixels = Buffer.alloc(stride * info.height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < info.height; y++) {
    const filter = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[source + x];
      const left = x >= 4 ? pixels[target + x - 4] : 0;
      const up = y ? pixels[target - stride + x] : 0;
      const upperLeft = y && x >= 4 ? pixels[target - stride + x - 4] : 0;
      if (filter === 0) pixels[target + x] = value;
      else if (filter === 1) pixels[target + x] = value + left;
      else if (filter === 2) pixels[target + x] = value + up;
      else if (filter === 3) pixels[target + x] = value + Math.floor((left + up) / 2);
      else if (filter === 4) pixels[target + x] = value + paeth(left, up, upperLeft);
      else assert.fail(`filtre PNG non pris en charge : ${filter}`);
    }
  }
  return pixels;
}

assert.equal(manifest.name, 'Store Runner');
assert.equal(manifest.short_name, 'Store Runner');
assert.equal(manifest.start_url, './?source=home-screen');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.orientation, 'portrait-primary');

const any192 = icon('192x192', 'any');
const any512 = icon('512x512', 'any');
const maskable512 = icon('512x512', 'maskable');
assert.ok(any192, 'icône PNG 192x192 purpose=any absente');
assert.ok(any512, 'icône PNG 512x512 purpose=any absente');
assert.ok(maskable512, 'icône PNG 512x512 purpose=maskable absente');
assert.notEqual(any512.src, maskable512.src, 'l’icône maskable doit être un asset distinct');
assert.ok(manifest.icons.some(item => item.type === 'image/svg+xml' && item.sizes === 'any' && item.purpose === 'any'), 'le SVG vectoriel doit rester disponible sans prétendre être maskable');

const assets = [
  [any192, 192, 192],
  [any512, 512, 512],
  [maskable512, 512, 512]
];
for (const [entry, width, height] of assets) {
  assert.ok(entry.src.includes(`?rev=${version.latestBuild}`), `${entry.src} doit suivre BUILD_REV`);
  assert.doesNotMatch(entry.src, /(^|\/)v2\//, 'les icônes TWA appartiennent uniquement à V1');
  const relative = entry.src.replace(/^\.\//, '').split('?')[0];
  const info = pngInfo(relative);
  assert.equal(info.width, width, `${relative} largeur incorrecte`);
  assert.equal(info.height, height, `${relative} hauteur incorrecte`);
  assert.ok(sw.includes(`"./${relative}"`), `${relative} doit appartenir au shell PWA hors ligne`);
}

const regularHash = crypto.createHash('sha256').update(pngInfo(any512.src.replace(/^\.\//, '').split('?')[0]).data).digest('hex');
const maskablePath = maskable512.src.replace(/^\.\//, '').split('?')[0];
const maskableInfo = pngInfo(maskablePath);
const maskableHash = crypto.createHash('sha256').update(maskableInfo.data).digest('hex');
assert.notEqual(maskableHash, regularHash, 'l’icône maskable ne doit pas être une copie du PNG standard');

const pixels = rgbaPixels(maskableInfo);
const alphaAt = (x, y) => pixels[(y * maskableInfo.width + x) * 4 + 3];
for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) {
  assert.equal(alphaAt(x, y), 255, `le fond maskable doit être plein jusqu’au coin ${x},${y}`);
}

let foregroundPixels = 0;
let foregroundRadius = 0;
for (let y = 0; y < maskableInfo.height; y++) {
  for (let x = 0; x < maskableInfo.width; x++) {
    const offset = (y * maskableInfo.width + x) * 4;
    const channels = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    const min = Math.min(...channels), max = Math.max(...channels);
    // Les traits, le coureur, la flèche et les textes portent un contraste/saturation
    // nettement plus fort que le fond pastel. Ils doivent rester dans le cercle central
    // de diamètre 80 % recommandé pour une icône maskable.
    if ((min < 150 && max - min > 25) || max < 100) {
      foregroundPixels++;
      foregroundRadius = Math.max(foregroundRadius, Math.hypot(x - 255.5, y - 255.5));
    }
  }
}
assert.ok(foregroundPixels > 5000, 'le contrôle de zone sûre doit bien détecter le logo');
assert.ok(foregroundRadius <= 512 * 0.4, `le logo sort du cercle maskable sûr : rayon ${foregroundRadius.toFixed(1)} px`);

assert.ok(Number(any512.sizes.split('x')[0]) >= 512, 'Bubblewrap doit trouver une icône standard >= 512 px');
assert.ok(Number(maskable512.sizes.split('x')[0]) >= 512, 'Bubblewrap doit trouver une icône maskable >= 512 px');

console.log('PASS: manifest TWA valide, contrat V1 inchangé, PNG 192/512 exacts, icône maskable 512 distincte et plein cadre, sélection Bubblewrap possible.');
