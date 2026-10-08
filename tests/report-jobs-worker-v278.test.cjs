/* Durable orchestration and failure boundaries; synthetic notes only. */
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto ||= webcrypto;
const Report = require('../store-runner-report-renderer.js');
const { loadWorker } = require('./helpers/worker-loader.cjs');
const ORIGIN = 'https://store-runner.fr';
const TOKEN = 'a'.repeat(64);
const RAW = 'Un réfrigérateur américain Samsung RS68A882 présent en showroom à 749 €.';

function source(raw = RAW) {
  return { version: 1, visitId: 'synthetic-visit', storeId: 'synthetic-store', completedDate: '2026-10-07',
    store: { enseigne: 'Enseigne test', ville: 'Ville test', channel: 'cuisinistes' },
    reports: [{ reportType: 'cuisiniste', entries: [{ source: 'report.cuisiniste.showroom', family: 'cuisiniste', text: raw }] }] };
}
function result(raw = RAW) {
  return { version: 1, reports: [{ reportType: 'cuisiniste', items: [{ section: 'showroom', text: raw,
    source: 'report.cuisiniste.showroom', quote: raw }] }] };
}
async function body(value = source(), extras = {}) {
  return { protocolVersion: 1, visitId: value.visitId, storeId: value.storeId, completedDate: value.completedDate,
    sourceSignature: await Report.sourceSignature(value), generation: 0, accessToken: TOKEN, source: value, ...extras };
}
class Storage {
  constructor() { this.map = new Map(); this.alarmAt = null; this.tail = Promise.resolve(); }
  async get(key) { return structuredClone(this.map.get(key)); }
  async put(key, value) { if (this.failPut) throw new Error('synthetic storage failure'); this.map.set(key, structuredClone(value)); }
  async setAlarm(value) { if (this.failAlarm) throw new Error('synthetic alarm failure'); this.alarmAt = value; }
  async transaction(fn) {
    const previous = this.tail;
    let unlock; this.tail = new Promise(resolve => { unlock = resolve; });
    await previous;
    const backup = structuredClone(this.map), alarm = this.alarmAt;
    try { return await fn(this); }
    catch (err) { this.map = backup; this.alarmAt = alarm; throw err; }
    finally { unlock(); }
  }
}
function setup(answer = { response: JSON.stringify(result()), finish_reason: 'stop' }, overrides = {}) {
  const worker = loadWorker(overrides), stores = new Map(), objects = new Map(), calls = [];
  const env = { AI: { run: async (model, payload) => { calls.push({ model, payload }); return typeof answer === 'function' ? answer() : answer; } } };
  env.REPORT_JOBS = {
    idFromName: id => id,
    get(id) {
      if (!stores.has(id)) stores.set(id, new Storage());
      if (!objects.has(id)) objects.set(id, new worker.VisitReportJob({ storage: stores.get(id) }, env));
      return objects.get(id);
    }
  };
  const post = async value => worker.fetch(new Request(ORIGIN + '/api/ai/report-jobs', { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }), env);
  const get = async (id, token = TOKEN) => worker.fetch(new Request(ORIGIN + '/api/ai/report-jobs/' + id,
    { headers: { 'X-Report-Capability': token } }), env);
  return { worker, env, stores, objects, calls, post, get };
}

(async () => {
  const first = await body(), fixture = setup();
  const accepted = await fixture.post(first), pending = await accepted.json();
  assert.equal(accepted.status, 202); assert.equal(pending.status, 'pending');
  assert.equal(fixture.calls.length, 0, 'acceptance must not wait for or invoke the provider');
  assert.equal(fixture.stores.get(pending.jobId).alarmAt > 0, true, 'durable alarm must exist before acceptance');
  assert(!('source' in pending)); assert(!('capabilityHash' in pending));
  const duplicate = await Promise.all([fixture.post(first), fixture.post(first)]);
  assert(duplicate.every(x => x.status === 200)); assert.equal(fixture.stores.size, 1);
  assert.equal((await fixture.get(pending.jobId, 'b'.repeat(64))).status, 403);
  assert.equal((await fixture.post({ ...first, accessToken: 'b'.repeat(64) })).status, 403,
    'changing a capability must not create a second job for the same visit version');
  assert.equal(fixture.stores.size, 1);
  assert.equal((await fixture.post({ ...first, sourceSignature: 'sha256-' + '0'.repeat(64) })).status, 400);
  const tooManyChars = source();
  tooManyChars.reports[0].entries = Array.from({ length: 4 }, (_, i) => ({ source: 'synthetic.' + i, family: 'cuisiniste', text: 'a'.repeat(17000) }));
  assert.equal((await fixture.post(await body(tooManyChars))).status, 413);
  const oversized = await fixture.worker.fetch(new Request(ORIGIN + '/api/ai/report-jobs', { method: 'POST',
    headers: { Origin: ORIGIN }, body: ' '.repeat(160001) }), fixture.env);
  assert.equal(oversized.status, 413, 'body stream must be bounded before JSON parsing');
  assert.equal((await fixture.worker.fetch(new Request(ORIGIN + '/api/ai/report-jobs', { method: 'POST',
    headers: { Origin: 'https://untrusted.example' }, body: JSON.stringify(first) }), fixture.env)).status, 403);
  const modified = await fixture.post(await body(source(RAW.replace('749', '899'))));
  assert.notEqual((await modified.json()).jobId, pending.jobId);
  const generation = await fixture.post({ ...first, generation: 1 });
  assert.notEqual((await generation.json()).jobId, pending.jobId);
  // Recreate the object after acceptance: no original client promise keeps it alive.
  fixture.objects.delete(pending.jobId);
  await fixture.env.REPORT_JOBS.get(pending.jobId).alarm();
  const completed = await (await fixture.get(pending.jobId)).json();
  assert.equal(completed.status, 'done'); assert.equal(completed.result.reports.length, 1);
  assert.equal(fixture.calls.length, 1); assert.equal(fixture.calls[0].payload.max_completion_tokens, 2600);
  await fixture.env.REPORT_JOBS.get(pending.jobId).alarm();
  await fixture.post(first);
  assert.equal(fixture.calls.length, 1, 'alarm redelivery and client retries never repeat a paid inference');
  console.log('PASS jobs · accepted durable pending, capability, signature, concurrent idempotence, independent alarm, single 2600-token invocation');

  const retail = source(); retail.store.channel = 'grands-magasins';
  retail.reports = [
    { reportType: 'brun', entries: [{ source: 'report.brun.team', family: 'brun', text: 'Samsung bénéficie d’une présence OLED.' }] },
    { reportType: 'blanc', entries: [{ source: 'report.blanc.team', family: 'blanc', text: '3 modèles Samsung en lavage à 749 €.' }] }
  ];
  const retailResult = { version: 1, reports: retail.reports.map(report => ({ reportType: report.reportType, items: [{
    section: report.reportType === 'brun' ? 'tv' : 'laundry', source: report.entries[0].source,
    text: report.entries[0].text, quote: report.entries[0].text
  }] })) };
  const multi = setup({ response: JSON.stringify(retailResult) }), m = await (await multi.post(await body(retail))).json();
  await multi.env.REPORT_JOBS.get(m.jobId).alarm();
  assert.equal((await (await multi.get(m.jobId)).json()).result.reports.length, 2);
  assert.equal(multi.calls.length, 1); assert.equal(multi.calls[0].payload.max_completion_tokens, 2600);
  console.log('PASS jobs · BRUN + BLANC share one validated visit inference and one unchanged token budget');

  for (const [name, response, expected] of [
    ['empty', { response: '' }, 'ai_empty_response'],
    ['truncated JSON', { response: '{"version":1,"reports":[' }, 'report_invalid_result'],
    ['provider truncation', { response: JSON.stringify(result()), finish_reason: 'length' }, 'report_truncated'],
    ['invented price', { response: JSON.stringify(result(RAW.replace('749', '899'))) }, 'report_invalid_result'],
    ['empty structured report', { response: JSON.stringify({ version: 1, reports: [{ reportType: 'cuisiniste', items: [] }] }) }, 'report_invalid_result']
  ]) {
    const f = setup(response);
    const p = await (await f.post(first)).json(); await f.env.REPORT_JOBS.get(p.jobId).alarm();
    const status = await (await f.get(p.jobId)).json();
    assert.equal(status.status, 'failed', name); assert.equal(status.error.code, expected, name);
    assert.equal(f.calls.length, 1, name + ': no fallback or repair'); assert(!('result' in status));
  }
  console.log('PASS jobs · empty, truncated, ungrounded and empty business JSON fail without paid repair/fallback');

  const outage = setup(() => { throw new Error('source-secret-must-not-leak'); });
  const o = await (await outage.post(first)).json(); await outage.env.REPORT_JOBS.get(o.jobId).alarm();
  const outageStatus = await (await outage.get(o.jobId)).json();
  assert.equal(outageStatus.error.code, 'ai_provider_unavailable'); assert(!JSON.stringify(outageStatus).includes('source-secret'));
  const timeout = setup(() => new Promise(() => {}), {
    setTimeout(fn, ms) { assert.equal(ms, 90000); return setTimeout(fn, 1); }, clearTimeout
  });
  const t = await (await timeout.post(first)).json(); await timeout.env.REPORT_JOBS.get(t.jobId).alarm();
  assert.equal((await (await timeout.get(t.jobId)).json()).error.code, 'report_provider_timeout');
  assert.equal(timeout.calls.length, 1);
  console.log('PASS jobs · provider timeout/outage, controlled diagnostics and one provider per job');

  const groqCalls = [];
  const both = setup({ response: '' }, {
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      groqCalls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result()) }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  both.env.GROQ_API_KEY = 'synthetic-key';
  const bothJob = await (await both.post(first)).json();
  await both.env.REPORT_JOBS.get(bothJob.jobId).alarm();
  const bothStatus = await (await both.get(bothJob.jobId)).json();
  assert.equal(bothStatus.status, 'done');
  assert.equal(bothStatus.provider, 'groq');
  assert.equal(groqCalls.length, 1, 'Groq is the single provider when its secret is configured');
  assert.equal(both.calls.length, 0, 'Workers AI must not be called for durable reports when Groq is configured');
  assert.equal(groqCalls[0].max_completion_tokens, 2600);
  assert.equal(groqCalls[0].include_reasoning, false);
  console.log('PASS jobs · Groq is preferred for durable reports when configured, with no second provider call');

  // A Gemini key selects one request to Google, even when Groq and Workers AI are also available.
  const geminiCalls = [];
  const gemini = setup({ response: '' }, {
    fetch: async (url, init) => {
      const payload = JSON.parse(init.body);
      geminiCalls.push({ url, payload, key: init.headers['x-goog-api-key'] });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(result()) }] }, finishReason: 'STOP' }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  gemini.env.GEMINI_API_KEY = 'synthetic-gemini-key';
  gemini.env.GROQ_API_KEY = 'synthetic-groq-key';
  const geminiJob = await (await gemini.post(first)).json();
  await gemini.env.REPORT_JOBS.get(geminiJob.jobId).alarm();
  const geminiStatus = await (await gemini.get(geminiJob.jobId)).json();
  assert.equal(geminiStatus.status, 'done');
  assert.equal(geminiStatus.provider, 'gemini');
  assert.equal(geminiStatus.model, 'gemini-3.8-flash');
  assert.equal(geminiCalls.length, 1, 'only one Gemini request per durable job');
  assert.equal(gemini.calls.length, 0, 'Workers AI is not called when Gemini is configured');
  assert.equal(groqCalls.length, 1, 'Gemini does not trigger a hidden Groq fallback');
  assert.match(geminiCalls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(geminiCalls[0].key, 'synthetic-gemini-key');
  assert.equal(geminiCalls[0].payload.generationConfig.maxOutputTokens, 2600);
  assert.equal(geminiCalls[0].payload.generationConfig.responseMimeType, 'application/json');
  assert.equal(geminiCalls[0].payload.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.match(geminiCalls[0].payload.contents[0].parts[0].text, /RS68A882/);
  assert.match(geminiCalls[0].payload.systemInstruction.parts[0].text, /JSON/);
  await gemini.env.REPORT_JOBS.get(geminiJob.jobId).alarm();
  assert.equal(geminiCalls.length, 1, 'alarm redelivery must not bill a second Gemini call');

  // Provider failures are controlled, retain field notes, and never leak provider bodies.
  const geminiError = setup({ response: '' }, {
    fetch: async (url, init) => {
      return new Response(JSON.stringify({ error: { message: 'synthetic-secret-in-provider-error' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
  });
  geminiError.env.GEMINI_API_KEY = 'synthetic-gemini-key';
  geminiError.env.GROQ_API_KEY = 'synthetic-groq-key';
  const failedGeminiJob = await (await geminiError.post(first)).json();
  await geminiError.env.REPORT_JOBS.get(failedGeminiJob.jobId).alarm();
  const failedGeminiStatus = await (await geminiError.get(failedGeminiJob.jobId)).json();
  assert.equal(failedGeminiStatus.status, 'failed');
  assert.equal(failedGeminiStatus.error.code, 'ai_provider_unavailable');
  assert.equal(failedGeminiStatus.error.provider, 'gemini');
  assert.equal(failedGeminiStatus.error.httpStatus, 429);
  assert.equal(failedGeminiStatus.error.message, 'Gemini a renvoyé une erreur HTTP 429.');
  assert(!JSON.stringify(failedGeminiStatus).includes('synthetic-secret-in-provider-error'));

  const geminiUnavailable = setup({ response: '' }, {
    fetch: async () => new Response(JSON.stringify({ error: { message: 'sensitive-note-secret' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } })
  });
  geminiUnavailable.env.GEMINI_API_KEY = 'synthetic-key';
  const unavailableJob = await (await geminiUnavailable.post(first)).json();
  await geminiUnavailable.env.REPORT_JOBS.get(unavailableJob.jobId).alarm();
  const unavailable = await (await geminiUnavailable.get(unavailableJob.jobId)).json();
  assert.equal(unavailable.status, 'failed');
  assert.equal(unavailable.error.httpStatus, 503);
  assert.equal(unavailable.error.provider, 'gemini');
  assert(!JSON.stringify(unavailable).includes('sensitive-note-secret'));

  // Explicit Groq selection must override the configured Gemini secret, without
  // a hidden paid fallback or leaking either credential.
  const selectedCalls = [];
  const explicit = setup({ response: '' }, {
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      selectedCalls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(result()) }, finish_reason: 'stop' }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  explicit.env.GEMINI_API_KEY = 'synthetic-gemini-key';
  explicit.env.GROQ_API_KEY = 'synthetic-groq-key';
  explicit.env.REPORT_AI_PROVIDER = 'groq';
  const explicitJob = await (await explicit.post(first)).json();
  await explicit.env.REPORT_JOBS.get(explicitJob.jobId).alarm();
  const selected = await (await explicit.get(explicitJob.jobId)).json();
  assert.equal(selected.status, 'done');
  assert.equal(selected.provider, 'groq');
  assert.equal(selectedCalls.length, 1);
  assert.equal(explicit.calls.length, 0);
  await explicit.env.REPORT_JOBS.get(explicitJob.jobId).alarm();
  assert.equal(selectedCalls.length, 1);
  console.log('PASS jobs · explicit Groq selection and safe Gemini 429/503 diagnostics');

  const geminiTruncated = setup({ response: '' }, {
    fetch: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(result()) }] }, finishReason: 'MAX_TOKENS' }]
    }), { status: 200 })
  });
  geminiTruncated.env.GEMINI_API_KEY = 'synthetic-gemini-key';
  const truncatedGeminiJob = await (await geminiTruncated.post(first)).json();
  await geminiTruncated.env.REPORT_JOBS.get(truncatedGeminiJob.jobId).alarm();
  const truncatedGeminiStatus = await (await geminiTruncated.get(truncatedGeminiJob.jobId)).json();
  assert.equal(truncatedGeminiStatus.error.code, 'report_truncated');
  console.log('PASS jobs · Gemini is the single selected provider, validates JSON, and errors stay controlled');

  const uncertain = setup(), u = await (await uncertain.post(first)).json(), storage = uncertain.stores.get(u.jobId);
  const record = await storage.get('job'); record.status = 'processing'; await storage.put('job', record);
  uncertain.objects.delete(u.jobId); await uncertain.env.REPORT_JOBS.get(u.jobId).alarm();
  assert.equal((await (await uncertain.get(u.jobId)).json()).error.code, 'report_processing_uncertain');
  assert.equal(uncertain.calls.length, 0, 'a crashed processing record cannot safely invoke the provider again');
  const expired = await storage.get('job'); expired.expiresAt = '2020-01-01T00:00:00.000Z'; expired.result = result(); await storage.put('job', expired);
  await uncertain.env.REPORT_JOBS.get(u.jobId).alarm();
  const tombstone = await storage.get('job'); assert(!('source' in tombstone)); assert(!('result' in tombstone));
  assert.equal((await uncertain.post(first)).status, 200); assert.equal(uncertain.calls.length, 0);
  console.log('PASS jobs · uncertain processing never rebills; retention erases business payload and preserves idempotent tombstone');

  for (const failure of ['failPut', 'failAlarm']) {
    const f = setup(); const firstTry = await f.post(first); const id = (await firstTry.json()).jobId;
    f.stores.get(id).map.clear(); f.stores.get(id)[failure] = true;
    assert.equal((await f.post(first)).status, 503); assert.equal(f.stores.get(id).map.size, 0);
    assert.equal(f.calls.length, 0);
  }
  const noBinding = setup(); delete noBinding.env.REPORT_JOBS;
  assert.equal((await noBinding.post(first)).status, 503);
  console.log('PASS jobs · failed storage/alarm transaction cannot claim acceptance; missing binding fails safely');
})().catch(err => { console.error(err); process.exitCode = 1; });
