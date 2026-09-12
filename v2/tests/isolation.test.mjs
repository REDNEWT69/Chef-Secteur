import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const index = await readFile(resolve(root, 'index.html'), 'utf8');
const sw = await readFile(resolve(root, 'sw.js'), 'utf8');

// La V1 ne charge, n'importe et ne pré-cache toujours aucun fichier de v2/.
assert(!index.includes('v2/'), 'index.html ne doit charger aucun fichier de v2/');

function extractArrayLiteral(source, name) {
  const match = source.match(new RegExp(name + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  assert(match, `tableau ${name} introuvable dans sw.js`);
  return match[1];
}
const coreShell = extractArrayLiteral(sw, 'CORE_SHELL');
const optionalShell = extractArrayLiteral(sw, 'OPTIONAL_SHELL');
assert(!coreShell.includes('v2/'), 'CORE_SHELL ne doit précacher aucune ressource de v2/');
assert(!optionalShell.includes('v2/'), 'OPTIONAL_SHELL ne doit précacher aucune ressource de v2/');

// Depuis V2-02, sw.js doit connaître le préfixe /v2/ afin de l'EXCLURE de son
// interception (voir README §9 bis). C'est la seule connaissance autorisée de
// v2/ dans ce fichier : elle doit être calculée depuis SCOPE, jamais codée en
// dur comme un chemin absolu, et intervenir avant toute logique de cache.
assert(
  /const V2_PREFIX\s*=\s*new URL\(\s*['"]\.\/v2\/['"]\s*,\s*SCOPE\s*\)/.test(sw),
  'V2_PREFIX doit être calculé depuis SCOPE (new URL("./v2/", SCOPE)), jamais un chemin /v2/ codé en dur'
);
assert(!/['"]\/v2\//.test(sw), 'aucun chemin /v2/ absolu ne doit être codé en dur comme condition');

const fetchHandlerStart = sw.indexOf("addEventListener('fetch'");
assert(fetchHandlerStart !== -1, 'gestionnaire fetch introuvable dans sw.js');
const fetchHandler = sw.slice(fetchHandlerStart);

const exclusionIndex = fetchHandler.indexOf('V2_PREFIX');
const respondWithIndex = fetchHandler.indexOf('event.respondWith');
const cacheOpenIndex = fetchHandler.indexOf('caches.open');
assert(exclusionIndex !== -1, "l'exclusion V2_PREFIX doit apparaître dans le gestionnaire fetch");
assert(respondWithIndex !== -1, 'event.respondWith introuvable dans le gestionnaire fetch');
assert(cacheOpenIndex !== -1, 'ouverture de cache introuvable dans le gestionnaire fetch');
assert(exclusionIndex < respondWithIndex, "l'exclusion v2/ doit intervenir avant event.respondWith(...)");
assert(exclusionIndex < cacheOpenIndex, "l'exclusion v2/ doit intervenir avant toute ouverture du cache V1");

// Aucune ressource V2 n'est lue ou écrite dans le cache V1 : la ligne
// d'exclusion doit être un retour immédiat (pas de respondWith, pas de match/put)
// avant la prochaine instruction utile du gestionnaire.
const exclusionLine = fetchHandler.slice(exclusionIndex, fetchHandler.indexOf('\n', exclusionIndex) + 1);
assert(/return;\s*$/.test(exclusionLine.trim()), "l'exclusion V2 doit se terminer par un retour immédiat (return;), sans toucher au cache");

console.log('v2 isolation: ok (V1 ne charge/pré-cache aucun fichier v2/ ; sw.js exclut /v2/ via SCOPE avant toute logique de cache, sans le lire ni l\'écrire)');
