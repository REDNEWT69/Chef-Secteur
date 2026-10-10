/* V286: identical free Groq request on preview + automatic report.
   Provider is mocked; no paid inference or production data. */
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
globalThis.crypto ||= webcrypto;
const R=require('../store-runner-report-renderer.js');
const {loadWorker}=require('./helpers/worker-loader.cjs');
const HOST='https://store-runner.fr';
class Storage{
 constructor(){this.data=new Map();this.alarmAt=0;}
 async get(k){return this.data.get(k);}
 async put(k,v){this.data.set(k,structuredClone(v));}
 async setAlarm(at){this.alarmAt=at;}
 async transaction(fn){return fn();}
}
const notes='Darty Annecy : aspirateurs Samsung VS15 et VS70 massifiés en allée centrale. Four NV7B45 au prix de 649 €. Aucun four Samsung sur le mur.';
const prose='⚪ Résumé BLANC – Darty Annecy\n\nLes aspirateurs Samsung VS15 et VS70 sont massifiés en allée centrale. Le four NV7B45 est mis en avant à 649 €. Aucun four Samsung n’est présent sur le mur.';
const source={version:1,visitId:'visit-test',storeId:'store-test',completedDate:'2026-10-09',
 store:{enseigne:'Darty',ville:'Annecy',channel:'retail'},
 reports:[{reportType:'blanc',entries:[{source:'report.blanc.team',family:'blanc',text:notes}]}]};
(async()=>{
 const calls=[],stores=new Map(),objects=new Map();
 let reply=prose;
 const worker=loadWorker({fetch:async(url,opts)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  calls.push(JSON.parse(opts.body));
  return new Response(JSON.stringify({choices:[{message:{content:reply},finish_reason:'stop'}]}),
   {status:200,headers:{'Content-Type':'application/json'}});
 }});
 const env={GROQ_API_KEY:'fake',GROQ_MODEL:'openai/gpt-oss-120b',
  GEMINI_API_KEY:'a-configured-but-unused-gemini-key',
  REPORT_JOBS:{idFromName:id=>id,get(id){
   if(!stores.has(id))stores.set(id,new Storage());
   if(!objects.has(id))objects.set(id,new worker.VisitReportJob({storage:stores.get(id)},env));
   return objects.get(id);
  }}};
 const signature=await R.sourceSignature(source),snapshot=JSON.stringify(source);
 const post=(endpoint,body)=>worker.fetch(new Request(HOST+endpoint,{method:'POST',
  headers:{Origin:HOST,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
 const preview=await (await post('/api/ai',{mode:'report_free_preview',source,
  reportType:'blanc',sourceSignature:signature})).json();
 assert.equal(preview.text,prose);
 const jobBody={protocolVersion:1,visitId:source.visitId,storeId:source.storeId,
  completedDate:source.completedDate,generation:0,sourceSignature:signature,
  accessToken:'a'.repeat(64),source};
 const pending=await (await post('/api/ai/report-jobs',jobBody)).json();
 assert.equal(pending.status,'pending');
 assert(stores.get(pending.jobId).alarmAt>0,'Durable Object alarm persisted');
 await env.REPORT_JOBS.get(pending.jobId).alarm();
 const read=id=>worker.fetch(new Request(HOST+'/api/ai/report-jobs/'+id,{
  headers:{'X-Report-Capability':jobBody.accessToken}}),env);
 const received=await (await read(pending.jobId)).json();
 assert.equal(received.status,'done');
 assert.equal(received.provider,'groq');
 assert.equal(received.result.format,'groq-freeform');
 const validated=R.validateDelivered(received.result,source);
 assert.equal(R.render(validated.reports[0],source),prose);
 assert.deepEqual(received.result.reports[0].audit.missingReferences,[]);
 assert.equal(calls.length,2,'preview + one durable invocation');
 assert.deepEqual(calls[0].messages,calls[1].messages,'identical preview/auto prompts on single family');
 const instructions=calls[0].messages[0].content;
 for(const title of ['⚫ Résumé BRUN','⚪ Résumé BLANC','🆚 Concurrence','🎓 Formation','📝 Synthèse']){
  assert(instructions.includes(title),'missing icon instruction: '+title);
 }
 assert.match(instructions,/Les icônes servent seulement à rendre les titres/);

 assert(!('response_format' in calls[1]),'no JSON schema in the automatic Groq call');
 assert.equal(calls[1].reasoning_effort,'low');
 assert.equal(calls[1].include_reasoning,false);
 assert.equal(calls[1].max_completion_tokens,4096);
 await post('/api/ai/report-jobs',jobBody);
 await env.REPORT_JOBS.get(pending.jobId).alarm();
 assert.equal(calls.length,2,'duplicate job/alarm never charges again');
 assert.equal(JSON.stringify(source),snapshot,'original dictation stays immutable');
 assert.deepEqual(R.memory(validated,{...source,sourceSignature:signature}).items,[]);
 // Advisory audit must not edit or discard a hallucinated output.
 const hallucinated={...received.result,reports:[{...received.result.reports[0],
   text:prose+' Sony 77XR90 à 899 €.'}]};
 assert.equal(R.validateFreeform(hallucinated,source).reports[0].text,hallucinated.reports[0].text);
 // Multiple families must be split without a second AI request.
 const source2={...source,visitId:'visit-two',reports:[
  {reportType:'brun',entries:[{source:'report.brun.team',family:'brun',text:'75R85H proposé, commande non validée.'}]},
  source.reports[0]
 ]};
 reply='[[SR_REPORT_0_BRUN]]\n⚫ BRUN : 75R85H proposé, commande non validée.\n[[SR_REPORT_1_BLANC]]\n'+prose;
 const pending2=await (await post('/api/ai/report-jobs',{...jobBody,visitId:source2.visitId,
   source:source2,sourceSignature:await R.sourceSignature(source2)})).json();
 await env.REPORT_JOBS.get(pending2.jobId).alarm();
 const result2=await (await read(pending2.jobId)).json();
 assert.equal(result2.status,'done');
 assert.deepEqual(result2.result.reports.map(x=>x.reportType),['brun','blanc']);
 assert.match(result2.result.reports[0].text,/75R85H/);
 assert.equal(result2.result.reports[1].text,prose);
 assert.equal(calls.length,3,'BRUN and BLANC share one durable inference');
 console.log('PASS Groq V286 · original free preview prompt, durable single provider, untouched source');
})().catch(e=>{console.error(e);process.exitCode=1});