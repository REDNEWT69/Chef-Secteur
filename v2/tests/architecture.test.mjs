// Test de SOURCE : ce fichier lit le code sous v2/src et interdit des motifs
// précis, il ne prouve aucun comportement (voir shell.test.mjs et
// navigation.test.mjs pour les tests de comportement). À n'utiliser que là
// où une recherche de texte est le seul moyen de vérifier le contrat.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const srcRoot = join(root, 'src');

async function listMjsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listMjsFiles(full));
    else if (entry.name.endsWith('.mjs')) files.push(full);
  }
  return files;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const files = await listMjsFiles(srcRoot);
assert(files.length > 0, 'aucun fichier .mjs trouvé sous v2/src');

const sources = new Map();
for (const file of files) sources.set(file, stripComments(await readFile(file, 'utf8')));

// Interdictions liées aux bugs V1 (§5) : aucun rerender structurel déclenché
// par focus, visibilitychange, ou un MutationObserver global.
for (const [file, source] of sources) {
  assert(!/visibilitychange/.test(source), `${file}: "visibilitychange" est interdit dans le shell V2`);
  assert(!/addEventListener\(\s*['"]focus['"]/.test(source), `${file}: écouteur "focus" interdit dans le shell V2`);
  assert(!/MutationObserver/.test(source), `${file}: MutationObserver est interdit dans le shell V2`);
}

// Aucune dépendance npm : aucun package.json propre à v2/, et tous les
// imports des modules du shell sont des chemins relatifs, jamais un
// spécificateur de paquet.
const { existsSync } = await import('node:fs');
assert(!existsSync(join(root, 'package.json')), 'v2/ ne doit pas avoir de package.json');
assert(!existsSync(join(root, 'node_modules')), 'v2/ ne doit pas avoir de node_modules');

const importSpecifierPattern = /import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
for (const [file, source] of sources) {
  for (const match of source.matchAll(importSpecifierPattern)) {
    const specifier = match[1];
    assert(
      specifier.startsWith('./') || specifier.startsWith('../'),
      `${file}: import "${specifier}" doit être un chemin relatif (aucune dépendance npm)`
    );
  }
}

// navigation.mjs doit rester une logique pure, sans DOM : c'est shell.mjs qui
// est seul propriétaire de la structure globale de la page et qui reflète
// l'état de navigation dans le DOM, jamais l'inverse.
const navigationSource = sources.get(join(srcRoot, 'app', 'navigation.mjs'));
assert(navigationSource, 'v2/src/app/navigation.mjs introuvable');
assert(!/\bdocument\b/.test(navigationSource), 'navigation.mjs ne doit référencer aucun `document` (logique pure)');

// render.mjs (aides de rendu) ne doit pas non plus décider de la structure
// globale (pas de mount sur document.body, pas de gestion de slots) : ça
// reste la responsabilité exclusive de shell.mjs.
const renderSource = sources.get(join(srcRoot, 'ui', 'render.mjs'));
assert(renderSource, 'v2/src/ui/render.mjs introuvable');
assert(!/document\.body/.test(renderSource), 'render.mjs ne doit pas toucher document.body : ce n\'est pas le propriétaire du shell');

console.log('v2 architecture: ok (aucun rerender focus/visibilitychange/MutationObserver, aucune dépendance npm, navigation.mjs reste pur)');
