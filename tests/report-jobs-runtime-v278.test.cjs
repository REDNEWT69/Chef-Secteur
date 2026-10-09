/* Actual workerd + SQLite Durable Object + alarm, no browser JS or mocked storage.
   The provider network boundary returns fabricated notes; no paid call is performed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { Miniflare, Log, LogLevel } = require('miniflare');
globalThis.crypto ||= webcrypto;
const Report = require('../store-runner-report-renderer.js');
const ROOT = path.resolve(__dirname, '..');
const TOKEN = 'c'.repeat(64), RAW = 'Un réfrigérateur américain Samsung RS68A882 présent en showroom à 749 €.';
const source = { version: 1, visitId: 'workerd-synthetic-visit', storeId: 'workerd-synthetic-store', completedDate: '2026-10-07',
  store: { enseigne: 'Enseigne test', ville: 'Ville test', channel: 'cuisinistes' },
  reports: [{ reportType: 'cuisiniste', entries: [{ source: 'report.cuisiniste.showroom', family: 'cuisiniste', text: RAW }] }] };
const EDITED = 'Le réfrigérateur américain Samsung RS68A882 est exposé en showroom au prix de 749 €.';
const result = { version: 1, reports: [{ reportType: 'cuisiniste', items: [{ section: 'showroom', text: EDITED,
  source: 'report.cuisiniste.showroom', quote: RAW }] }] };

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-report-workerd-'));
  let mf, calls = 0, release;
  const providerGate = new Promise(resolve => { release = resolve; });
  const options = {
    name: 'chef-secteur-ai', modulesRoot: ROOT,
    modules: [
      { type: 'ESModule', path: path.join(ROOT, 'workers/chef-secteur-ai.js') },
      { type: 'ESModule', path: path.join(ROOT, 'store-runner-report-renderer.js') }
    ],
    compatibilityDate: '2026-07-30',
    durableObjects: { REPORT_JOBS: { className: 'VisitReportJob', useSQLite: true } },
    durableObjectsPersist: directory,
    bindings: { GROQ_API_KEY: 'synthetic-key-no-network' },
    log: new Log(LogLevel.ERROR),
    outboundService: async request => {
      assert.equal(new URL(request.url).host, 'api.groq.com');
      calls += 1;
      const payload = await request.json();
      assert.equal(payload.max_completion_tokens, 2600);
      assert.equal(payload.include_reasoning, false);
      await providerGate;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }] }),
        { headers: { 'Content-Type': 'application/json' } });
    }
  };
  const body = { protocolVersion: 1, visitId: source.visitId, storeId: source.storeId, completedDate: source.completedDate,
    sourceSignature: await Report.sourceSignature(source), generation: 0, accessToken: TOKEN, source };
  const post = () => mf.dispatchFetch('https://store-runner.fr/api/ai/report-jobs', { method: 'POST',
    headers: { Origin: 'https://store-runner.fr', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const get = id => mf.dispatchFetch('https://store-runner.fr/api/ai/report-jobs/' + id, { headers: { 'X-Report-Capability': TOKEN } });
  try {
    mf = new Miniflare(options);
    const accepted = await post(), job = await accepted.json();
    assert.equal(accepted.status, 202); assert.equal(job.status, 'pending');
    // No client requests, no page, no visibility listener and no client promise execute
    // while the real Durable Object alarm starts and awaits the provider.
    const deadline = Date.now() + 10000;
    while (!calls && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, 1, 'actual workerd alarm must start without an open application');
    assert.equal((await (await get(job.jobId)).json()).status, 'processing');
    const duplicates = await Promise.all([post(), post()]);
    assert(duplicates.every(response => response.status === 200)); assert.equal(calls, 1);
    release();
    let final;
    while (Date.now() < deadline) {
      final = await (await get(job.jobId)).json();
      if (final.status === 'done') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(final.status, 'done'); assert.equal(final.result.reports[0].items[0].text, EDITED);
    await mf.dispose(); mf = undefined;
    // Reopen an entirely new runtime over the same SQLite data. Results and the claim
    // survive server process lifetime as well as client lifetime.
    mf = new Miniflare(options);
    const restored = await (await get(job.jobId)).json();
    assert.equal(restored.status, 'done');
    assert.equal(restored.result.reports[0].items[0].text, EDITED);
    assert.equal(restored.result.reports[0].items[0].section, 'showroom', 'professional rewrite survives restart');
    assert.equal(restored.result.quality.status, 'complete');
    assert.equal(restored.result.quality.mode, 'editorial');
    assert.doesNotThrow(() => Report.validateDelivered(restored.result, source));
    assert.equal((await post()).status, 200); assert.equal(calls, 1);
    console.log('PASS workerd · real SQLite/alarm processes with no client, concurrent duplicate POST, result survives runtime restart, one provider invocation');
  } finally {
    release();
    if (mf) await mf.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
