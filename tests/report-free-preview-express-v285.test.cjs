/* V285 : Groq libre reste libre, fidèle et strictement non enregistré.
   Ce test prouve le contrat envoyé au modèle ; il ne prétend pas valider
   une réponse réelle du fournisseur. Données magasins fictives uniquement. */
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto ||= webcrypto;
const Report = require('../store-runner-report-renderer.js');
const { loadWorker } = require('./helpers/worker-loader.cjs');
const ORIGIN='https://store-runner.fr';
const NOTES=[
 'test fictif magasin Boulanger Chasse sur Rhône matin rayon tv beaucoup de monde échanges 2 vendeurs',
 '55M74H Samsung prime 0 euro 55S85F Samsung ancien 25 euro Hisense 100E7Q prime 45 euro les vendeurs préfèrent Hisense',
 'Samsung 65M73H bien placé prix 679 euros attention ce prix concerne seulement le 65M73H',
 'PLV absente sur une Neo QLED voisine du 65M73H',
 'TCL mini LED promotion 15 pourcent du 10 au 20 octobre ce nest pas une promo Samsung',
 '75R85H expo proposé responsable intéressé mais aucune commande validée faute de place à revoir après promo',
 'équipe demande une formation OLED Neo QLED aucune date fixée',
 '2 téléviseurs en réserve références inconnues à vérifier prochain passage'
].join('\\n');
const source={
 version:1,visitId:'v285-fixture',storeId:'magasin-fictif',completedDate:'2026-10-09',
 store:{enseigne:'Boulanger',ville:'Chasse-sur-Rhône',channel:'retail'},
 reports:[{reportType:'brun',entries:[{source:'report.brun.team',family:'brun',text:NOTES}]}]
};
(async()=>{
 const captured=[];
 const worker=loadWorker({fetch:async(url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  captured.push(JSON.parse(options.body));
  return new Response(JSON.stringify({choices:[{
    message:{content:'Compte rendu BRUN : primes 0 €, 25 € et 45 €. Samsung 65M73H à 679 €.'},
    finish_reason:'stop'
  }]}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 const env={GROQ_API_KEY:'synthetic-not-a-real-key',GROQ_MODEL:'openai/gpt-oss-120b',REPORT_AI_PROVIDER:'groq'};
 const req=body=>worker.fetch(new Request(ORIGIN+'/api/ai',{
  method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
  body:JSON.stringify(body)}),env);
 const before=JSON.stringify(source);
 const result=await req({mode:'report_free_preview',source,reportType:'brun',sourceSignature:await Report.sourceSignature(source)});
 assert.equal(result.status,200);
 const data=await result.json();
 assert.equal(data.mode,'report_free_preview');
 assert.equal(data.reportType,'brun');
 assert.equal(captured.length,1,'one Groq call, no corrective second call');
 const request=captured[0];
 assert.equal(request.model,'openai/gpt-oss-120b');
 assert.equal('response_format' in request,false,'no strict JSON response schema');
 assert.equal(request.max_completion_tokens,4096);
 assert.equal(request.include_reasoning,false);
 const [system,user]=request.messages;
 for(const marker of ['toutes les observations exploitables','ASSOCIATIONS EXACTES','AUCUNE INVENTION','AUCUNE DÉCISION INVENTÉE','STATUTS FIDÈLES','AMBIGUÏTÉS','STYLE EXPRESS','Pas de tableaux']){
  assert.ok(system.content.includes(marker),marker+' absent du prompt libre');
 }
 assert.match(system.content,/Ne réattribue jamais à un modèle le prix d’un autre/);
 assert.match(system.content,/un intérêt ou une proposition ne vaut jamais commande/);
 assert.match(system.content,/absence de promotion/);
 assert.match(system.content,/N’ajoute pas de nom de visiteur/);
 for(const term of ['55M74H','55S85F','100E7Q','65M73H','679 euros','TCL','75R85H','aucune date fixée']){
  assert.ok(user.content.includes(term),'original note missing: '+term);
 }
 assert.equal(JSON.stringify(source),before,'notes never modified');
 console.log('PASS V285 : express-fidelity Groq free prompt, 1 call, no JSON, all synthetic facts carried, no mutation');
})().catch(e=>{console.error(e);process.exitCode=1});
