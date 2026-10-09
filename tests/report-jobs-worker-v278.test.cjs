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
  const editorial = raw === RAW ? 'Le réfrigérateur américain Samsung RS68A882 est exposé en showroom au prix de 749 €.' : raw;
  return { version: 1, reports: [{ reportType: 'cuisiniste', items: [{ section: 'showroom', text: editorial,
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
    text: report.reportType === 'brun' ? 'Le rayon TV dispose d’une présence Samsung OLED.' : 'Trois modèles Samsung sont exposés au rayon lavage au prix de 749 €.', quote: report.entries[0].text
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

    ['empty structured report', { response: JSON.stringify({ version: 1, reports: [{ reportType: 'cuisiniste', items: [] }] }) }, 'report_invalid_result']
  ]) {
    const f = setup(response);
    const p = await (await f.post(first)).json(); await f.env.REPORT_JOBS.get(p.jobId).alarm();
    const status = await (await f.get(p.jobId)).json();
    assert.equal(status.status, 'failed', name); assert.equal(status.error.code, expected, name);
    assert.equal(f.calls.length, 1, name + ': no fallback or repair'); assert(!('result' in status));
  }
  console.log('PASS jobs · empty, truncated and empty business JSON fail without paid repair/fallback');

  // A price invented by the provider is not published; the original note is
  // preserved for manual review, without an extra inference or another provider.
  const inventedPrice = setup({ response: JSON.stringify(result(RAW.replace('749', '899'))) });
  const inventedPending = await (await inventedPrice.post(first)).json();
  await inventedPrice.env.REPORT_JOBS.get(inventedPending.jobId).alarm();
  const inventedStatus = await (await inventedPrice.get(inventedPending.jobId)).json();
  assert.equal(inventedStatus.status, 'failed', 'do not display a raw note as a successful report');
  assert.equal(inventedStatus.error.code, 'report_invalid_result');
  assert(!('result' in inventedStatus));
  assert(!JSON.stringify(inventedStatus).includes('899 €'));
  assert.equal(inventedPrice.calls.length, 1);
  console.log('PASS jobs · invented price fails without raw-note copy or a second inference');

  // V280: a verbatim Gemini result must not be persisted as a successful report.
  const verbatimRaw = { version: 1, reports: [{ reportType: 'cuisiniste', items: [{
    section: 'showroom', text: RAW, source: 'report.cuisiniste.showroom', quote: RAW
  }] }] };
  const verbatimJob = setup({ response: JSON.stringify(verbatimRaw) });
  const verbatimPending = await (await verbatimJob.post(first)).json();
  await verbatimJob.env.REPORT_JOBS.get(verbatimPending.jobId).alarm();
  const verbatimStatus = await (await verbatimJob.get(verbatimPending.jobId)).json();
  assert.equal(verbatimStatus.status, 'failed');
  assert.equal(verbatimStatus.error.code, 'report_invalid_result');
  assert(!('result' in verbatimStatus));
  assert.equal(verbatimJob.calls.length, 1, 'no paid correction attempt');
  console.log('PASS jobs · verbatim AI output fails without duplicating notes');

  // Natural field dictation: a grounded partial quote is valid when adjacent
  // notes do not alter its meaning, even if the dictation has no punctuation.
  const dictated = 'Premiere visite avec une responsable magasin un four Samsung present en showroom formation produit prevue';
  const extracted = 'un four Samsung present en showroom';
  const extractedDoc = {
    version: 1, reports: [{ reportType: 'cuisiniste', items: [{
      section: 'showroom', text: 'Un four Samsung est exposé dans le showroom.',
      source: 'report.cuisiniste.showroom', quote: extracted
    }] }]
  };
  const dictatedSource = source(dictated);
  const dictatedJob = setup({ response: JSON.stringify(extractedDoc) });
  const dictatedPending = await (await dictatedJob.post(await body(dictatedSource))).json();
  await dictatedJob.env.REPORT_JOBS.get(dictatedPending.jobId).alarm();
  const dictatedStatus = await (await dictatedJob.get(dictatedPending.jobId)).json();
  assert.equal(dictatedStatus.status, 'done', 'a contextual spoken excerpt must not be rejected only for missing punctuation');
  assert.equal(dictatedStatus.result.reports[0].items[0].text, 'Un four Samsung est exposé dans le showroom.');
  assert(!JSON.stringify(dictatedStatus).includes(dictated));
  assert(!('source' in dictatedStatus));

  // In contrast, a clipped contractual negation must still fail, and the
  // diagnostic only returns a fixed safe reason, never the original notes.
  const unsafeDictation = 'aucun contrat validé et un four Samsung present en showroom';
  const unsafeExcerpt = 'contrat validé';
  const unsafeDoc = {
    version: 1, reports: [{ reportType: 'cuisiniste', items: [{
      section: 'contract', text: unsafeExcerpt,
      source: 'report.cuisiniste.showroom', quote: unsafeExcerpt
    }] }]
  };
  const unsafeSource = source(unsafeDictation);
  const unsafeJob = setup({ response: JSON.stringify(unsafeDoc) });
  const unsafePending = await (await unsafeJob.post(await body(unsafeSource))).json();
  await unsafeJob.env.REPORT_JOBS.get(unsafePending.jobId).alarm();
  const unsafeStatus = await (await unsafeJob.get(unsafePending.jobId)).json();
  assert.equal(unsafeStatus.status, 'failed', 'contractual negation must never become a confirmed agreement');
  assert.equal(unsafeStatus.error.code, 'report_invalid_result');
  assert(!('result' in unsafeStatus));
  assert(!('source' in unsafeStatus));
  assert.equal(unsafeJob.calls.length, 1);


  const fullDictation = {
    version: 1, reports: [{ reportType: 'cuisiniste', items: [{
      section: 'showroom', text: dictated,
      source: 'report.cuisiniste.showroom', quote: dictated
    }] }]
  };
  assert.doesNotThrow(() => Report.validate(fullDictation, dictatedSource),
    'absence of punctuation itself is not an invalid source');
  console.log('PASS jobs · natural spoken evidence accepted, missing contractual negation rejected with controlled diagnostics');

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
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Le réfrigérateur américain Samsung RS68A882 est exposé en showroom au prix de 749 €.' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  both.env.GROQ_API_KEY = 'synthetic-key';
  both.env.GROQ_MODEL = 'openai/gpt-oss-120b';
  both.env.REPORT_AI_PROVIDER = 'groq';
  const bothJob = await (await both.post(first)).json();
  await both.env.REPORT_JOBS.get(bothJob.jobId).alarm();
  const bothStatus = await (await both.get(bothJob.jobId)).json();
  assert.equal(bothStatus.status, 'done');
  assert.equal(bothStatus.provider, 'groq');
  assert.equal(groqCalls.length, 1, 'Groq is the single provider when its secret is configured');
  assert.equal(both.calls.length, 0, 'Workers AI must not be called for durable reports when Groq is configured');
  assert.equal(groqCalls[0].max_completion_tokens, 4096,
    'long reports need headroom for answer and GPT-OSS reasoning');
  assert.equal(groqCalls[0].include_reasoning, false);
  assert.equal(groqCalls[0].response_format, undefined, 'l’IA libre ne force pas le JSON');
  assert.equal(bothStatus.result.quality.mode, 'free');
  assert.equal(bothStatus.result.reports[0].text, 'Le réfrigérateur américain Samsung RS68A882 est exposé en showroom au prix de 749 €.');
  assert.equal(groqCalls[0].model, 'openai/gpt-oss-120b');
  console.log('PASS jobs · Groq 120B free prose, 4096 output tokens, one request and no hidden paid fallback');

  // Regression: a historical Gitem-like buying-groups visit is a single merged
  // report, not a BRUN/BLANC duplicate. The mocked model obeys strict schema,
  // and the Worker validates its original quotation before marking it done.
  const buyingQuote = 'Selon le vendeur, TCL est davantage exposée que Samsung ; une meilleure présentation Samsung est en discussion.';
  const buyingSource = {
    version: 1, visitId: 'synthetic-historical-visit', storeId: 'synthetic-buying-group',
    completedDate: '2026-10-07',
    store: { enseigne: 'Enseigne synthétique', ville: 'Ville test', channel: 'buying-groups' },
    reports: [{ reportType: 'buying-groups', entries: [{
      source: 'report.shared.context', family: '', text: buyingQuote
    }] }]
  };
  const buyingOutput = { version: 1, reports: [{
    reportType: 'buying-groups', items: [{
      section: 'competition',
      text: 'Selon le vendeur, TCL bénéficie actuellement d’une visibilité supérieure à Samsung ; un rééquilibrage est envisagé.',
      source: 'report.shared.context', quote: buyingQuote
    }]
  }] };
  const buyingCalls = [];
  const buying = setup({ response: '' }, {
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      const request = JSON.parse(init.body); buyingCalls.push(request);
      return new Response(JSON.stringify({ choices: [{ message: { content: buyingOutput.reports[0].items[0].text },
        finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  buying.env.GROQ_API_KEY = 'synthetic-key';
  buying.env.GROQ_MODEL = 'openai/gpt-oss-120b';
  buying.env.REPORT_AI_PROVIDER = 'groq';
  const buyingJob = await (await buying.post(await body(buyingSource))).json();
  await buying.env.REPORT_JOBS.get(buyingJob.jobId).alarm();
  const buyingResult = await (await buying.get(buyingJob.jobId)).json();
  assert.equal(buyingResult.status, 'done');
  assert.equal(buyingResult.provider, 'groq');
  assert.equal(buyingResult.result.reports[0].reportType, 'buying-groups');
  assert.equal(buyingCalls.length, 1, 'no second inference for an old buying-group visit');
  assert.equal(buyingCalls[0].response_format, undefined);
  assert.equal(buyingResult.result.quality.mode, 'free');
  console.log('PASS jobs · a historical buying-group visit uses one free Groq report');

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
  gemini.env.OPENAI_API_KEY = 'synthetic-openai-key';
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
        choices: [{ message: { content: 'Le réfrigérateur américain Samsung RS68A882 est exposé en showroom au prix de 749 €.' }, finish_reason: 'stop' }]
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

  // Explicit OpenAI opt-in: secret remains server-only, structured output
  // passes the same visit-job validation, without changing Gemini's default.
  const openaiCalls = [];
  const openai = setup({ response: '' }, {
    fetch: async (url, init) => {
      openaiCalls.push({ url, headers: init.headers, payload: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        status: 'completed', output: [
          { type: 'reasoning', summary: [] },
          { type: 'message', role: 'assistant', content: [
            { type: 'output_text', text: JSON.stringify(result()) }
          ] }
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  openai.env.REPORT_AI_PROVIDER = 'openai';
  openai.env.OPENAI_API_KEY = 'synthetic-openai-secret';
  openai.env.GEMINI_API_KEY = 'synthetic-gemini-secret';
  openai.env.GROQ_API_KEY = 'synthetic-groq-secret';
  const openaiJob = await (await openai.post(first)).json();
  await openai.env.REPORT_JOBS.get(openaiJob.jobId).alarm();
  const openaiDone = await (await openai.get(openaiJob.jobId)).json();
  assert.equal(openaiDone.status, 'done');
  assert.equal(openaiDone.provider, 'openai');
  assert.equal(openaiDone.model, 'gpt-5.6-terra');
  assert.equal(openaiCalls.length, 1, 'one paid OpenAI request, even when other secrets are configured');
  assert.equal(openai.calls.length, 0, 'no Workers AI call after OpenAI');
  assert.equal(openaiCalls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(openaiCalls[0].headers.Authorization, 'Bearer synthetic-openai-secret');
  assert.equal(openaiCalls[0].payload.model, 'gpt-5.6-terra');
  assert.equal(openaiCalls[0].payload.store, false, 'do not retain report inputs in OpenAI response application state');
  assert.equal(openaiCalls[0].payload.reasoning.effort, 'none');
  assert.equal(openaiCalls[0].payload.max_output_tokens, 2600);
  assert.equal(openaiCalls[0].payload.text.format.type, 'json_schema');
  assert.equal(openaiCalls[0].payload.text.format.strict, true);
  assert.equal(openaiCalls[0].payload.text.format.schema.properties.reports.type, 'array');
  assert.match(openaiCalls[0].payload.input, /RS68A882/, 'provider receives dictated source');
  assert.match(openaiCalls[0].payload.instructions, /JSON/);
  assert(!JSON.stringify(openaiDone).includes('synthetic-openai-secret'));
  await openai.env.REPORT_JOBS.get(openaiJob.jobId).alarm();
  assert.equal(openaiCalls.length, 1, 'alarm redelivery must not repeat a paid GPT request');

  const selectedModel = setup({ response: '' }, {
    fetch: async (_, init) => new Response(JSON.stringify({
      status: 'completed', output: [{ type: 'message', role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(result()) }] }]
    }), { status: 200 })
  });
  selectedModel.env.REPORT_AI_PROVIDER = 'openai';
  selectedModel.env.OPENAI_API_KEY = 'synthetic-openai-key';
  selectedModel.env.OPENAI_MODEL = 'gpt-5.6-sol';
  const modelJob = await (await selectedModel.post(first)).json();
  await selectedModel.env.REPORT_JOBS.get(modelJob.jobId).alarm();
  assert.equal((await (await selectedModel.get(modelJob.jobId)).json()).model, 'gpt-5.6-sol');

  const noOpenaiKey = setup();
  noOpenaiKey.env.REPORT_AI_PROVIDER = 'openai';
  noOpenaiKey.env.GEMINI_API_KEY = 'synthetic-gemini-secret';
  const noKeyJob = await (await noOpenaiKey.post(first)).json();
  await noOpenaiKey.env.REPORT_JOBS.get(noKeyJob.jobId).alarm();
  const noKeyStatus = await (await noOpenaiKey.get(noKeyJob.jobId)).json();
  assert.equal(noKeyStatus.status, 'failed');
  assert.equal(noKeyStatus.error.code, 'ai_no_provider');
  assert.equal(noOpenaiKey.calls.length, 0, 'explicit OpenAI without secret cannot silently use Gemini');

  const openaiFailed = setup({ response: '' }, {
    fetch: async () => new Response(JSON.stringify({ error: { message: 'synthetic-sensitive-field-notes-key' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } })
  });
  openaiFailed.env.REPORT_AI_PROVIDER = 'openai';
  openaiFailed.env.OPENAI_API_KEY = 'synthetic-openai-key';
  openaiFailed.env.GEMINI_API_KEY = 'synthetic-gemini-key';
  const failedOpenAIJob = await (await openaiFailed.post(first)).json();
  await openaiFailed.env.REPORT_JOBS.get(failedOpenAIJob.jobId).alarm();
  const failedOpenAI = await (await openaiFailed.get(failedOpenAIJob.jobId)).json();
  assert.equal(failedOpenAI.status, 'failed');
  assert.equal(failedOpenAI.error.code, 'ai_provider_unavailable');
  assert.equal(failedOpenAI.error.provider, 'openai');
  assert.equal(failedOpenAI.error.httpStatus, 429);
  assert(!JSON.stringify(failedOpenAI).includes('synthetic-sensitive-field-notes-key'));
  assert.equal(openaiFailed.calls.length, 0, 'no hidden Gemini retry on OpenAI error');

  const openaiTruncated = setup({ response: '' }, {
    fetch: async () => new Response(JSON.stringify({
      status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', role: 'assistant', content: [
        { type: 'output_text', text: '{"version":1' }
      ] }]
    }), { status: 200 })
  });
  openaiTruncated.env.REPORT_AI_PROVIDER = 'openai';
  openaiTruncated.env.OPENAI_API_KEY = 'synthetic-openai-key';
  const shortOpenAIJob = await (await openaiTruncated.post(first)).json();
  await openaiTruncated.env.REPORT_JOBS.get(shortOpenAIJob.jobId).alarm();
  assert.equal((await (await openaiTruncated.get(shortOpenAIJob.jobId)).json()).error.code, 'report_truncated');
  console.log('PASS jobs · OpenAI explicit opt-in, schema, no state storage, single call, no secret leaks or fallback');

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
