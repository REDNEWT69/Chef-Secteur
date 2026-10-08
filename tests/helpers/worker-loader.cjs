/* Execute the deployed Worker and its shared, pure report module in legacy VM tests.
   Only module plumbing is replaced; provider, routes and job class remain unchanged. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
function loadWorker(overrides = {}) {
  const sandbox = {
    Response, Request, Headers, URL, TextEncoder, TextDecoder, crypto: webcrypto,
    AbortController, setTimeout, clearTimeout, console,
    fetch: async () => { throw new Error('fetch non simulé'); },
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    module: { exports: {} }, ...overrides
  };
  sandbox.globalThis = sandbox;
  const reportPath = path.join(ROOT, 'store-runner-report-renderer.js');
  if (fs.existsSync(reportPath)) vm.runInNewContext(fs.readFileSync(reportPath, 'utf8'), sandbox, { filename: 'store-runner-report-renderer.js' });
  sandbox.module = { exports: {} };
  const source = fs.readFileSync(path.join(ROOT, 'workers/chef-secteur-ai.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export class VisitReportJob/m, 'class VisitReportJob')
    .replace(/^export default \{/m, 'module.exports = {');
  vm.runInNewContext(source + '\nmodule.exports.VisitReportJob = VisitReportJob;', sandbox, { filename: 'chef-secteur-ai.js' });
  return sandbox.module.exports;
}
module.exports = { loadWorker };
