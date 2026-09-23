/* V247 — « IA indisponible ou réponse incomplète : signal is aborted without reason ».
   Cause : `callAIGateway` coupait tout appel à 45 s par `ctrl.abort()` sans raison, alors
   qu'un compte rendu de visite peut enchaîner côté Worker deux tentatives avec repli Groq.
   Ce fichier charge la vraie fonction du noyau et le vrai module de sortie magasin.
   Fixtures synthétiques uniquement. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const R=require('../visit-report-slack.js');
const J=require('../visit-report-ai-json-v225.js');

const HTML=fs.readFileSync(path.join(__dirname,'..','src/chef-secteur.html'),'utf8');
function slice(startMarker,endMarker){
  const a=HTML.indexOf(startMarker);assert.ok(a>=0,'marqueur absent : '+startMarker);
  const b=HTML.indexOf(endMarker,a);assert.ok(b>a,'fin absente : '+endMarker);
  return HTML.slice(a,b+endMarker.length);
}
const SOURCE=slice("var AI_TIMEOUT_MESSAGE=","finally{clearTimeout(timer)}}");

/* Passerelle qui ne répond jamais : seule l'annulation du signal la fait échouer, comme
   Chrome Android qui rejette avec « signal is aborted without reason ». */
function load({respond}={}){
  const timers=[];
  const sandbox={
    aiConfig:{gateway:'https://passerelle.test/api/ai'},AbortController,JSON,Math,Error,Promise,
    setTimeout(fn,ms){timers.push({fn,ms});return timers.length},
    clearTimeout(){},
    fetch(url,init){
      if(respond)return Promise.resolve(respond());
      return new Promise((resolve,reject)=>{
        init.signal.addEventListener('abort',()=>{const e=new Error('signal is aborted without reason');e.name='AbortError';reject(e)});
      });
    }
  };
  vm.runInNewContext(SOURCE+'\nthis.callAIGateway=callAIGateway;this.aiGatewayTimeout=aiGatewayTimeout;',sandbox);
  return {sandbox,timers};
}

(async function(){
  // Le délai dépend de la tâche : 90 s pour un compte rendu de visite, 45 s ailleurs.
  const {sandbox}=load();
  assert.equal(sandbox.aiGatewayTimeout({mode:'visit_report'}),90000);
  assert.equal(sandbox.aiGatewayTimeout({mode:'assistant',context:{task:'visit_report'}}),90000,'le compte rendu fusionné passe par le mode assistant');
  assert.equal(sandbox.aiGatewayTimeout({mode:'assistant'}),45000);
  assert.equal(sandbox.aiGatewayTimeout({mode:'proofread'}),45000);
  assert.equal(sandbox.aiGatewayTimeout(null),45000);

  // Un dépassement de délai sort en français, jamais en « signal is aborted without reason ».
  for(const [payload,secondes] of [[{mode:'visit_report'},90],[{mode:'assistant'},45]]){
    const {sandbox:s,timers}=load();
    const pending=s.callAIGateway(payload);
    assert.equal(timers.length,1);
    assert.equal(timers[0].ms,secondes*1000);
    timers[0].fn();
    await assert.rejects(pending,e=>{
      assert.match(e.message,/^Délai IA dépassé/);
      assert.ok(e.message.includes('('+secondes+' s)'),e.message);
      assert.doesNotMatch(e.message,/signal|aborted/i);
      return true;
    });
  }

  // Une réponse normale n'est pas touchée.
  {const {sandbox:s}=load({respond:()=>({ok:true,status:200,text:async()=>JSON.stringify({text:'ok'})})});
   assert.deepEqual(JSON.parse(JSON.stringify(await s.callAIGateway({mode:'visit_report'}))),{text:'ok'})}
  // Une erreur HTTP garde son message d'origine.
  {const {sandbox:s}=load({respond:()=>({ok:false,status:502,text:async()=>'{"error":"x"}'})});
   await assert.rejects(s.callAIGateway({mode:'visit_report'}),/Passerelle IA : HTTP 502/)}

  // Un délai dépassé reste une panne de transport : la réparation V232 ne rejoue pas l'appel.
  assert.equal(J.transportFailure(new Error('Délai IA dépassé : le moteur n’a pas répondu à temps (90 s).')),true);

  // Message terrain : délai dépassé, y compris depuis un noyau V246 encore en cache.
  const TIMEOUT=/trop de temps à répondre.*compte rendu local est conservé/;
  for(const e of [
    new Error('Délai IA dépassé : le moteur n’a pas répondu à temps (90 s).'),
    Object.assign(new Error('signal is aborted without reason'),{name:'AbortError'}),
    new Error('signal is aborted without reason'),
    new Error('The operation was aborted.'),
    new Error('Fetch is aborted')
  ]){const m=R.aiFailureMessage(e);assert.match(m,TIMEOUT,e.message);assert.doesNotMatch(m,/signal|aborted/i)}

  // Le cas « réponse vide » V238 garde sa phrase, et un vrai incident réseau garde son détail.
  assert.equal(R.aiFailureMessage(new Error('Passerelle IA : HTTP 502 · {"error":"ai_empty_response"}')),J.EMPTY_RESPONSE_MESSAGE);
  assert.match(R.aiFailureMessage(new Error('Failed to fetch')),/^IA indisponible ou réponse incomplète : Failed to fetch\. Le rapport local est conservé\.$/);

  console.log('visit-report-timeout-v247: OK');
})().catch(e=>{console.error(e);process.exit(1)});
