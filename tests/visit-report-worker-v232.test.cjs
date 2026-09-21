/* V232 — contrat réel du Worker pour la route visit_report.
   Le module Worker est chargé tel quel depuis workers/chef-secteur-ai.js : seul
   `export default` est réécrit pour pouvoir l'exécuter hors Cloudflare. L'environnement
   (binding AI, secret Groq, fetch) est simulé ; le code testé est le code déployé.
   Fixtures 100 % synthétiques — le dépôt est public. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.join(__dirname,'..');
const SOURCE=fs.readFileSync(path.join(ROOT,'workers/chef-secteur-ai.js'),'utf8');
assert.match(SOURCE,/^export default \{/m,'le Worker doit rester un module ES exportant son handler');

function loadWorker(){
  const sandbox={Response,Request,Headers,URL,console,fetch:async()=>{throw new Error('fetch non simulé')},module:{exports:{}}};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(SOURCE.replace(/^export default \{/m,'module.exports = {'),sandbox,{filename:'chef-secteur-ai.js'});
  return sandbox.module.exports;
}
const worker=loadWorker();
const ORIGIN='https://store-runner.fr';

function doc(){
  return{famille:'BRUN',contexte:'Tete de gondole occupee.',merchandising:'Visibilite correcte.',
    retours_vendeurs:['Le vendeur signale une rupture sur deux references.'],retours_clients:[],concurrence:[],
    audio:'',points_positifs:[],blocages:[],actions_realisees:[],formation:[],
    prochain_passage:['Revoir la disponibilite au prochain passage.'],priorite:'',synthese:'Situation stable.'};
}
/* Compte rendu au volume réellement observé : ~3 100 caractères, soit ~980 tokens en
   français. C'est ce volume, et non un exemple court, qui butait sur l'ancien plafond. */
function filledDoc(){
  const s=n=>('Le vendeur signale une rupture sur deux references et juge la gamme moins lumineuse que certaines offres concurrentes. ').repeat(4).slice(0,n);
  return{famille:'BRUN',contexte:s(260),merchandising:s(240),
    retours_vendeurs:[s(150),s(140)],retours_clients:[s(120)],concurrence:[s(130)],audio:s(170),
    points_positifs:[s(120),s(115)],blocages:[s(140),s(135)],actions_realisees:[s(130),s(125)],
    formation:[s(120)],prochain_passage:[s(130),s(120)],priorite:s(110),synthese:s(230)};
}
function filledBlanc(){
  const b=filledDoc(),s=n=>b.contexte.slice(0,n);
  return{famille:'BLANC',contexte:b.contexte,lavage:s(240),froid:s(230),cuisson:s(225),entretien_sols:s(215),
    retours_vendeurs:b.retours_vendeurs,retours_clients:b.retours_clients,concurrence:b.concurrence,
    points_positifs:b.points_positifs,blocages:b.blocages,actions_realisees:b.actions_realisees,
    formation:b.formation,prochain_passage:b.prochain_passage,priorite:b.priorite,synthese:b.synthese};
}

/* Binding AI de fortune. Il modélise le mécanisme réel de la panne : `max_completion_tokens`
   couvre la réponse ET le raisonnement. Tant que le raisonnement n'est pas coupé, il
   consomme une part du budget avant le premier caractère de JSON — c'est ce qui rendait la
   troncature certaine sur le repli gpt-oss, où la marge de la famille BRUN était déjà
   inférieure à 4 %. Coupure en fin de budget, exactement comme le vrai moteur.
   REASONING_TOKENS est une hypothèse basse pour un effort de raisonnement non borné. */
const CHARS_PER_TOKEN=3.2; // français
const REASONING_TOKENS=260;
function fakeEnv(answer,seen){
  return{AI:{run:async(model,payload)=>{
    if(seen){seen.model=model;seen.payload=payload}
    const text=typeof answer==='function'?answer(payload):answer;
    const budget=Number(payload.max_completion_tokens)||0;
    const reasoning=payload.include_reasoning===false?0:REASONING_TOKENS;
    const limit=Math.max(0,Math.floor((budget-reasoning)*CHARS_PER_TOKEN));
    const cut=text.length>limit;
    return{response:cut?text.slice(0,limit):text,finish_reason:cut?'length':'stop'};
  }}};
}
function post(body,env,origin=ORIGIN){
  return worker.fetch(new Request('https://store-runner.fr/api/ai',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}),env);
}

(async()=>{
 /* ------------------------------------------------------------------ 1. /ping */
 {
  const res=await worker.fetch(new Request('https://store-runner.fr/api/ai?mode=ping',{method:'GET'}),fakeEnv(''));
  const body=await res.json();
  assert.equal(res.status,200);
  assert.equal(body.ok,true,'le ping doit confirmer un moteur disponible');
  assert.equal(body.workersAiBinding,true);
  assert.equal(body.provider,'cloudflare-workers-ai');
  assert(body.model,'le ping doit nommer le modèle servi');
  console.log('PASS 1 · /ping répond ok, binding et modèle annoncés');
 }

 /* ------------------------------- 2. visit_report : JSON complet, non tronqué */
 {
  const seen={};
  const payload=JSON.stringify(filledDoc(),null,2);
  assert(payload.length>3000,'la fixture doit avoir le volume réel d’un compte rendu rempli');
  const res=await post({mode:'visit_report',message:'SCHÉMA JSON STRICT ...\nDONNEES_SOURCE :\n{}'},fakeEnv(payload,seen));
  const body=await res.json();
  assert.equal(res.status,200);
  assert.equal(body.mode,'visit_report','la route dédiée doit être empruntée');
  assert.equal(body.truncated,false,'la réponse ne doit pas être tronquée');
  assert.equal(body.finishReason,'stop');
  // Le JSON revient complet et exploitable.
  const parsed=JSON.parse(body.text);
  assert.equal(parsed.famille,'BRUN');
  assert.equal(parsed.retours_vendeurs.length,2);
  assert.deepEqual(Object.keys(parsed).sort(),Object.keys(filledDoc()).sort(),'aucun champ ne doit manquer');
  // Le contrat côté moteur : budget suffisant et raisonnement coupé.
  assert.equal(seen.payload.max_completion_tokens,2600);
  assert.equal(seen.payload.reasoning_effort,'low');
  assert.equal(seen.payload.messages[0].role,'system');
  assert.match(seen.payload.messages[0].content,/UNIQUEMENT par un objet JSON valide, complet, refermé/);
  console.log('PASS 2 · visit_report rend un JSON complet, non tronqué, budget 2600 tokens');
 }

 /* ------------------------ 3. la panne d'origine, reproduite sur les deux réglages */
 {
  const env=fakeEnv('');
  const brun=JSON.stringify(filledDoc(),null,2);
  const blanc=JSON.stringify(filledBlanc(),null,2);
  // La marge de BRUN était déjà sous 4 % avant même de raisonner.
  assert(brun.length/CHARS_PER_TOKEN>950,'un compte rendu BRUN rempli frôle déjà 1000 tokens');
  // BLANC, plus long de deux rubriques, dépassait le plafond à lui seul.
  assert(blanc.length/CHARS_PER_TOKEN>1000,'un compte rendu BLANC rempli dépasse 1000 tokens à lui seul');

  // Ancien réglage : 1000 tokens, raisonnement non coupé. Les deux familles sont coupées.
  for(const [famille,payload] of [['BRUN',brun],['BLANC',blanc]]){
    const ancien=fakeEnv(payload);
    const cut=await ancien.AI.run('modele-test',{max_completion_tokens:1000,messages:[]});
    assert.equal(cut.finish_reason,'length','ancien réglage : '+famille+' devait être coupé');
    assert.equal(cut.response.includes('}'),false,'le schéma étant plat, une sortie coupée n’a aucune accolade fermante');
    assert.throws(()=>JSON.parse(cut.response),'c’est exactement ce qui levait « JSON de compte rendu invalide »');
  }

  // Réglage V232 : 2600 tokens, raisonnement coupé. Les deux familles passent entières.
  for(const [famille,payload] of [['BRUN',brun],['BLANC',blanc]]){
    const neuf=fakeEnv(payload);
    const ok=await neuf.AI.run('modele-test',{max_completion_tokens:2600,include_reasoning:false,messages:[]});
    assert.equal(ok.finish_reason,'stop','réglage V232 : '+famille+' doit passer entier');
    JSON.parse(ok.response);
  }
  void env;
  console.log('PASS 3 · panne reproduite sur BRUN et BLANC avec l’ancien réglage, résolue avec le nouveau');
 }

 /* ------------------------------------ 4. troncature signalée si elle survient */
 {
  const enorme=JSON.stringify(Object.assign(doc(),{synthese:'x'.repeat(12000)}),null,2);
  const res=await post({mode:'visit_report',message:'prompt'},fakeEnv(enorme));
  const body=await res.json();
  assert.equal(body.truncated,true,'une réponse coupée doit être signalée au client');
  assert.equal(body.finishReason,'length');
  console.log('PASS 4 · une troncature résiduelle reste détectable côté client');
 }

 /* -------------------------------------- 5. garde-fous inchangés et cas d'erreur */
 {
  const refus=await post({mode:'visit_report',message:'prompt'},fakeEnv('{}'),'https://exemple-non-autorise.test');
  assert.equal(refus.status,403,'les origines autorisées restent inchangées');
  const vide=await post({mode:'visit_report',message:'   '},fakeEnv('{}'));
  assert.equal(vide.status,400,'un message vide est refusé avant tout appel moteur');
  const sansMoteur=await post({mode:'visit_report',message:'prompt'},{});
  assert.equal(sansMoteur.status,500);
  assert.match((await sansMoteur.json()).error,/Aucun moteur IA configuré/);
  // La route assistant n'a pas bougé.
  const assistant=await post({mode:'assistant',message:'question'},fakeEnv('réponse libre'));
  const corps=await assistant.json();
  assert.equal(assistant.status,200);
  assert.equal(corps.text,'réponse libre');
  assert.equal(corps.mode,undefined,'la réponse assistant garde sa forme historique');
  assert.match(SOURCE,/const ALLOWED_ORIGINS = new Set\(\[\n  'https:\/\/rednewt69\.github\.io',/,'la liste des origines ne doit pas avoir changé');
  console.log('PASS 5 · origines, message vide, absence de moteur, route assistant intacte');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
