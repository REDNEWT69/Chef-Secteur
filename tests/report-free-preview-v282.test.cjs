/* V282: opt-in freeform report probe. No output filtering, durable job or
   persistence. Synthetic business data only; no paid provider requests. */
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto ||= webcrypto;
const Report = require('../store-runner-report-renderer.js');
const { loadWorker } = require('./helpers/worker-loader.cjs');
const ORIGIN='https://store-runner.fr';
const NOTES='Deuxième passage. Trois têtes de gondole Samsung. Mini LED 65M73H à 679 € et M60H à 349 €. Hisense 75E7S à 679 € contre Samsung 75U7005 à 749 €.';
const source={version:1,visitId:'v282-fixture',storeId:'shop-fixture',completedDate:'2026-10-09',
 store:{enseigne:'Electro Dépôt',ville:'Ville-Test',channel:'retail'},
 reports:[{reportType:'brun',entries:[{source:'report.brun.team',family:'brun',text:NOTES}]}]};
const free='🏬 Concurrence / Merchandising\n\nLes trois têtes de gondole Samsung sont en place. La 65M73H est proposée à 679 € et la M60H à 349 €. Sur les grandes tailles, Hisense 75E7S à 679 € concurrence la Samsung 75U7005 à 749 €, soit 70 € de différence.';
(async()=>{
 const calls=[];
 const worker=loadWorker({fetch:async (url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  calls.push(JSON.parse(options.body));
  return new Response(JSON.stringify({choices:[{message:{content:free},finish_reason:'stop'}]}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 const env={GROQ_API_KEY:'synthetic-no-network',GROQ_MODEL:'openai/gpt-oss-120b',REPORT_AI_PROVIDER:'groq'};
 const req=async (body,origin=ORIGIN)=>worker.fetch(new Request(ORIGIN+'/api/ai',{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
 const original=JSON.stringify(source),signature=await Report.sourceSignature(source);
 const payload={mode:'report_free_preview',reportType:'brun',source,sourceSignature:signature};
 const result=await req(payload),doc=await result.json();
 assert.equal(result.status,200);assert.equal(doc.mode,'report_free_preview');assert.equal(doc.text,free);
 assert.equal(doc.provider,'groq');assert.equal(doc.reportType,'brun');
 assert.equal(calls.length,1);
 assert.equal(calls[0].model,'openai/gpt-oss-120b');
 assert.equal(calls[0].max_completion_tokens,4096);
 assert.equal('response_format' in calls[0],false,'no forced JSON schema for experimental prose');
 assert.match(calls[0].messages[1].content,/65M73H à 679/);
 assert.match(calls[0].messages[1].content,/75E7S à 679/);
 assert.match(calls[0].messages[0].content,/directement le texte rédigé/);
 assert.equal(JSON.stringify(source),original,'immutable notes unchanged');
 const bad=await req({...payload,sourceSignature:'sha256-'+'0'.repeat(64)});
 assert.equal(bad.status,409);assert.equal(calls.length,1,'tampered sources cost no inference');
 const invalid=await req({...payload,reportType:'blanc'});
 assert.equal(invalid.status,400);assert.equal(calls.length,1);
 const blocked=await req(payload,'https://unknown.example');
 assert.equal(blocked.status,403);assert.equal(calls.length,1);
 const failing=loadWorker({fetch:async()=>new Response(JSON.stringify({error:{message:'TOKEN_FROM_USER_NOTES'}}),
  {status:500,headers:{'Content-Type':'application/json'}})});
 const err=await failing.fetch(new Request(ORIGIN+'/api/ai',{method:'POST',
  headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(payload)}),env);
 assert.equal(err.status,502);assert.doesNotMatch(JSON.stringify(await err.json()),/TOKEN_FROM_USER_NOTES/);
 console.log('PASS V282 · freeform, one request, no JSON/output filtering, no notes mutation, guarded origin/source, no leaked errors');
})().catch(e=>{console.error(e);process.exitCode=1});
