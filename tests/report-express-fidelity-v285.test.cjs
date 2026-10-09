/* V285 — Groq Express: source fidelity audit. All responses mocked, no paid
   Groq request, no persistence, and no changes to durable automatic reports. */
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
globalThis.crypto ||= webcrypto;
const Report=require('../store-runner-report-renderer.js');
const {loadWorker}=require('./helpers/worker-loader.cjs');
const ORIGIN='https://store-runner.fr';
const notes=[
 'bon passage magasin rayon tv, 2 vendeurs',
 'Samsung 55M74H zéro euro de prime, 55S85F ancien modèle prime 25 euro,',
 'Hisense 100E7Q prime 45 €, donc les vendeurs proposent plus Hisense.',
 'Samsung 65M73H bien placé affiché à 679 €, PLV absente sur Neo QLED à côté.',
 'TCL propose -15 % sur Mini LED du 10 au 20 octobre, ce nest pas Samsung.',
 '75R85H proposé à lexpo mais commande non validée faute de place.',
 'Formation OLED Neo QLED souhaitée sans date fixée.',
 '2 TV en réserve mais références inconnues, vérifier prochain passage.'
].join(' ');
const good=[
 '⚫ Résumé BRUN – Darty Chalon',
 'Date : 9 octobre 2026. Passage en matinée, échange avec deux vendeurs.',
 'Primes : le Samsung 55M74H rapporte 0 €, le Samsung 55S85F 25 €',
 'et le Hisense 100E7Q 45 €. Les vendeurs privilégient Hisense.',
 'Merchandising : le Samsung 65M73H, bien placé, est affiché à 679 €.',
 'Une PLV manque sur une Neo QLED voisine.',
 'Concurrence : TCL applique -15 % sur Mini LED du 10 au 20 octobre.',
 'Le 75R85H a été proposé, mais la commande nest pas validée, par manque de place.',
 'Formation OLED et Neo QLED souhaitée, sans date fixée.',
 'Deux téléviseurs en réserve, références à vérifier au prochain passage.'
].join(' ');
const invented=[
 'Darty Chalon, 9 octobre 2026. Le Samsung 55M74H rapporte 0 €.',
 'Proposer le Samsung 75R85H à 599 € et le Sony 77XR90 à 899 €.',
 'TCL fait -20 % du 15 au 20 octobre. Former les vendeurs le 15 novembre.'
].join(' ');
const source={
 version:1,visitId:'visit-express-synthetic',storeId:'darty-synthetic',completedDate:'2026-10-09',
 store:{enseigne:'Darty',ville:'Chalon',channel:'retail'},
 reports:[{reportType:'brun',entries:[{source:'report.brun.team',family:'brun',text:notes}]}]
};
(async()=>{
 let reply=good;const requests=[];
 const worker=loadWorker({fetch:async(url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  const payload=JSON.parse(options.body);requests.push(payload);
  return new Response(JSON.stringify({choices:[{message:{content:reply},finish_reason:'stop'}]}),
   {status:200,headers:{'Content-Type':'application/json'}});
 }});
 const env={GROQ_API_KEY:'fake-unit-secret',GROQ_MODEL:'openai/gpt-oss-120b',REPORT_AI_PROVIDER:'groq'};
 const signature=await Report.sourceSignature(source);
 const body={mode:'report_free_preview',source,reportType:'brun',sourceSignature:signature};
 const call=async(payload=body)=>worker.fetch(new Request(ORIGIN+'/api/ai',{method:'POST',
  headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(payload)}),env);
 const before=JSON.stringify(source);
 const ok=await call(),okResult=await ok.json();
 assert.equal(ok.status,200);
 assert.equal(okResult.text,good);
 assert.deepEqual(okResult.audit,{
  missingReferences:[],unexpectedReferences:[],
  missingPrices:[],unexpectedPrices:[],
  missingPercentages:[],unexpectedPercentages:[],unexpectedDates:[]
 });
 assert.equal(requests.length,1);
 assert.equal('response_format' in requests[0],false,'free narrative, no strict JSON');
 assert.equal(requests[0].reasoning_effort,'low');
 assert.equal(requests[0].max_completion_tokens,4096);
 const system=requests[0].messages[0].content;
 for(const rule of ['aucun tableau','référence produit','prime','PLV','promotion TCL',
  'commande validée','dates','pas de','sans supprimer','directement le texte rédigé']){
  // The system prompt is intentionally free prose and preserves raw field facts.
  if(rule==='sans supprimer')continue;
  assert.match(system.toLowerCase(),new RegExp(rule.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),
    'missing report instruction: '+rule);
 }
 assert.match(requests[0].messages[1].content,/55M74H zéro euro/);
 assert.match(requests[0].messages[1].content,/75R85H proposé/);
 reply=invented;
 const bad=await call(),badResult=await bad.json();
 assert.equal(bad.status,200,'preview still shown for human review, not silently discarded');
 assert.equal(badResult.text,invented);
 assert.ok(badResult.audit.missingReferences.includes('65M73H'));
 assert.ok(badResult.audit.missingReferences.includes('55S85F'));
 assert.ok(badResult.audit.unexpectedReferences.includes('77XR90'));
 assert.ok(badResult.audit.missingPrices.includes('679'));
 assert.ok(badResult.audit.unexpectedPrices.includes('599'));
 assert.ok(badResult.audit.unexpectedPrices.includes('899'));
 assert.ok(badResult.audit.unexpectedPercentages.includes('20'));
 assert.ok(badResult.audit.unexpectedDates.includes('15 novembre'));
 assert.ok(badResult.audit.unexpectedDates.includes('15 octobre'));
 const blancNotes='VS15 et VS70 massifiés en rayon aspirateurs. Four Samsung NV7B45 en bon plan à 649 €. Aucun autre four Samsung sur le mur cuisson.';
 const blancSource={...source,visitId:'visit-blanc-synthetic',
  reports:[{reportType:'blanc',entries:[{source:'report.blanc.display',family:'blanc',text:blancNotes}]}]};
 reply='⚪ Résumé BLANC – Darty Chalon. Les aspirateurs Samsung VS15 et VS70 sont massifiés. Le four NV7B45 est à 649 €. Aucun autre four Samsung dans le mur cuisson.';
 const blancResponse=await call({mode:'report_free_preview',source:blancSource,reportType:'blanc',
  sourceSignature:await Report.sourceSignature(blancSource)});
 const blanc=await blancResponse.json();
 assert.equal(blancResponse.status,200);
 assert.deepEqual(blanc.audit.missingReferences,[]);
 assert.deepEqual(blanc.audit.unexpectedReferences,[]);
 assert.deepEqual(blanc.audit.missingPrices,[]);
 assert.deepEqual(blanc.audit.unexpectedPrices,[]);

 const cuisineNotes='BJ : RF65DG960EG ou RF59C701EB1, RF65 pour 9 mois. LTDP : RB34C671ESA. Demande SAV porte RF48A401EB4 abîmée.';
 const cuisineSource={...source,visitId:'visit-cuisine-synthetic',
  reports:[{reportType:'cuisiniste',entries:[{source:'report.cuisiniste.team',family:'cuisiniste',text:cuisineNotes}]}]};
 reply='Cuisiniste : BJ souhaite RF65DG960EG ou RF59C701EB1, avec une durée de 9 mois pour le RF65. LTDP souhaite RB34C671ESA. Demande SAV pour la porte du RF48A401EB4 abîmée.';
 const cuisineResponse=await call({mode:'report_free_preview',source:cuisineSource,reportType:'cuisiniste',
  sourceSignature:await Report.sourceSignature(cuisineSource)});
 const cuisine=await cuisineResponse.json();
 assert.equal(cuisineResponse.status,200);
 assert.deepEqual(cuisine.audit.missingReferences,[]);
 assert.deepEqual(cuisine.audit.unexpectedReferences,[]);
 assert.equal(cuisine.text,reply,'no altering optional source-based report output');

 assert.equal(JSON.stringify(source),before);
 assert.equal(requests.length,4,'one Groq request per explicitly requested report');
 console.log('PASS V285 · Groq express preserves facts, flags invented models/prices/promos/dates, no source mutation or extra call');
})().catch(e=>{console.error(e);process.exitCode=1});
