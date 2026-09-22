#!/usr/bin/env node
// V236 — lanceur unique de la suite navigateur Store Runner.
//
// Pourquoi ce fichier existe
// --------------------------
// La suite navigateur était servie par `python3 -m http.server`. Ce serveur est en
// HTTP/1.0 : il ferme la connexion après chaque réponse, donc le boot de Store Runner
// — qui injecte une soixantaine de <script> d'un coup — ouvre une connexion TCP par
// ressource. Sa file d'écoute vaut 5 (`socketserver.TCPServer.request_queue_size`) :
// au-delà, le noyau refuse les connexions. Le navigateur remonte alors
// ERR_CONNECTION_REFUSED / ERR_CONNECTION_RESET, que le loader d'`index.html` affiche
// en « Erreur de chargement : Failed to fetch ». Le défaut est proportionnel au
// volume : rare sur un spec isolé, systématique sur la suite complète.
//
// Le serveur ci-dessous est en HTTP/1.1 avec keep-alive et la file d'écoute par défaut
// de Node (511). Le même boot réutilise alors quelques connexions au lieu d'en ouvrir
// une par fichier.
//
// Usage
// -----
//   node tools/run-browser-tests.mjs               suite navigateur complète (liste CI)
//   node tools/run-browser-tests.mjs <spec>...     seulement ces specs
//   node tools/run-browser-tests.mjs --serve       sert l'application et reste ouvert
//
// Sans liste de specs, elle est lue dans .github/workflows/reliability-checks.yml :
// le workflow reste la seule source de vérité, donc le local exécute exactement la
// même suite que la CI.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.STORE_RUNNER_E2E_HOST || '127.0.0.1';
const PORT = Number(process.env.STORE_RUNNER_E2E_PORT || 4173);
const WORKFLOW = path.join(ROOT, '.github/workflows/reliability-checks.yml');

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
}));

function typeDe(fichier) {
  return TYPES.get(path.extname(fichier).toLowerCase()) || 'application/octet-stream';
}

// Résout une URL vers un fichier du dépôt, sans jamais sortir de la racine.
async function resoudre(pathname) {
  let decode;
  try { decode = decodeURIComponent(pathname); } catch { return null; }
  const relatif = decode.replace(/^\/+/, '');
  const cible = path.resolve(ROOT, relatif);
  if (cible !== ROOT && !cible.startsWith(ROOT + path.sep)) return null;

  let infos;
  try { infos = await fsp.stat(cible); } catch { return null; }
  if (infos.isDirectory()) {
    const index = path.join(cible, 'index.html');
    let infosIndex;
    try { infosIndex = await fsp.stat(index); } catch { return null; }
    if (!infosIndex.isFile()) return null;
    return { fichier: index, infos: infosIndex };
  }
  if (!infos.isFile()) return null;
  return { fichier: cible, infos };
}

function repondreVide(res, code, message) {
  const corps = Buffer.from(`<!doctype html><meta charset="utf-8"><title>${code}</title><h1>${code} ${message}</h1>\n`);
  res.writeHead(code, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': corps.length
  });
  res.end(corps);
}

function creerServeur() {
  const serveur = http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      repondreVide(res, 405, 'Method Not Allowed');
      return;
    }

    let pathname;
    try { pathname = new URL(req.url, `http://${HOST}:${PORT}`).pathname; }
    catch { repondreVide(res, 400, 'Bad Request'); return; }

    const trouve = await resoudre(pathname);
    if (!trouve) { repondreVide(res, 404, 'Not Found'); return; }

    const { fichier, infos } = trouve;
    const lastModified = infos.mtime.toUTCString();

    // Même sémantique de cache que le serveur Python remplacé : une revalidation
    // conditionnelle répond 304, le reste répond 200 avec la taille exacte.
    const depuis = req.headers['if-modified-since'];
    if (depuis && Date.parse(depuis) >= Math.floor(infos.mtimeMs / 1000) * 1000) {
      res.writeHead(304, { 'Last-Modified': lastModified });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': typeDe(fichier),
      'Content-Length': infos.size,
      'Last-Modified': lastModified
    });
    if (req.method === 'HEAD') { res.end(); return; }

    const flux = fs.createReadStream(fichier);
    flux.on('error', () => res.destroy());
    res.on('close', () => flux.destroy());
    flux.pipe(res);
  });

  // Une suite complète enchaîne des milliers de requêtes : les connexions doivent
  // survivre au temps de réflexion d'un test plutôt que d'être rouvertes sans cesse.
  serveur.keepAliveTimeout = 65_000;
  serveur.headersTimeout = 70_000;
  serveur.requestTimeout = 0;
  return serveur;
}

function demarrer(serveur) {
  return new Promise((resolve, reject) => {
    serveur.once('error', reject);
    serveur.listen(PORT, HOST, () => {
      serveur.removeListener('error', reject);
      resolve();
    });
  });
}

function arreter(serveur) {
  return new Promise(resolve => {
    serveur.closeIdleConnections?.();
    serveur.close(() => resolve());
    // Les connexions keep-alive encore ouvertes ne doivent pas retarder la sortie.
    setTimeout(() => { serveur.closeAllConnections?.(); resolve(); }, 1000).unref();
  });
}

// La liste des specs vit dans le workflow Reliability ; la lire évite d'en tenir une
// seconde, qui divergerait en silence de celle réellement exécutée par la CI.
function specsDuWorkflow() {
  const yaml = fs.readFileSync(WORKFLOW, 'utf8');
  const vus = [];
  for (const trouve of yaml.matchAll(/(?:v2\/)?tests\/[A-Za-z0-9._-]+\.spec\.cjs/g)) {
    if (!vus.includes(trouve[0])) vus.push(trouve[0]);
  }
  return vus;
}

function lancerPlaywright(specs, baseUrl) {
  const cli = path.join(ROOT, 'node_modules/@playwright/test/cli.js');
  if (!fs.existsSync(cli)) {
    console.error(
      'Playwright est absent. Installer la même version que la CI :\n' +
      '  npm install --no-save --no-package-lock @playwright/test@1.55.0\n' +
      '  npx playwright install --with-deps chromium'
    );
    return Promise.resolve(1);
  }
  const args = [cli, 'test', ...specs, '--workers=1', '--reporter=line'];
  const enfant = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, STORE_RUNNER_E2E_URL: baseUrl }
  });
  return new Promise(resolve => {
    enfant.on('close', code => resolve(code == null ? 1 : code));
    enfant.on('error', erreur => { console.error(erreur); resolve(1); });
  });
}

async function principal(argv) {
  const serveulement = argv.includes('--serve');
  const specs = argv.filter(a => !a.startsWith('--'));
  const baseUrl = `http://${HOST}:${PORT}/`;

  const serveur = creerServeur();
  try {
    await demarrer(serveur);
  } catch (erreur) {
    console.error(
      erreur.code === 'EADDRINUSE'
        ? `Le port ${PORT} est déjà pris. Arrêter l'autre serveur, ou définir STORE_RUNNER_E2E_PORT.`
        : erreur
    );
    return 1;
  }
  console.log(`Store Runner servi sur ${baseUrl} (HTTP/1.1, keep-alive, racine ${ROOT})`);

  if (serveulement) {
    console.log('Mode --serve : Ctrl+C pour arrêter.');
    await new Promise(resolve => {
      const stop = () => { arreter(serveur).then(resolve); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return 0;
  }

  const aLancer = specs.length ? specs : specsDuWorkflow();
  if (!aLancer.length) {
    console.error('Aucun spec navigateur trouvé dans le workflow Reliability.');
    await arreter(serveur);
    return 1;
  }
  console.log(`${aLancer.length} fichier(s) de spec à exécuter.`);

  let code;
  try {
    code = await lancerPlaywright(aLancer, baseUrl);
  } finally {
    await arreter(serveur);
  }
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await principal(process.argv.slice(2));
}

export { creerServeur, demarrer, arreter, specsDuWorkflow };
