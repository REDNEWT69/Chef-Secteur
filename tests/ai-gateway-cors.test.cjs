const fs=require('fs');
const path=require('path');
const vm=require('vm');

const worker=fs.readFileSync(path.join(process.cwd(),'workers/chef-secteur-ai.js'),'utf8');

for(const origin of [
  'https://store-runner.fr',
  'https://www.store-runner.fr',
  'https://rednewt69.github.io'
]){
  if(!worker.includes(`'${origin}'`))throw new Error(`Passerelle IA: origine autorisée absente: ${origin}`);
}

if(!/ALLOWED_ORIGINS\.has\(origin\)/.test(worker))throw new Error('Passerelle IA: validation explicite de Origin absente');
if(!/headers\[['"]Access-Control-Allow-Origin['"]\]\s*=\s*origin/.test(worker))throw new Error('Passerelle IA: l’origine autorisée doit être reflétée dans Access-Control-Allow-Origin');
if(/Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/.test(worker))throw new Error('Passerelle IA: wildcard CORS interdit');
if(!/request\.method === 'OPTIONS'/.test(worker)||!/Origine non autorisée/.test(worker))throw new Error('Passerelle IA: garde-fou preflight CORS absent');

if(!/DEFAULT_WORKERS_AI_MODEL\s*=\s*['"]@cf\/google\/gemma-4-26b-a4b-it['"]/.test(worker))throw new Error('Passerelle IA: Gemma 4 Workers AI doit être le modèle principal');
if(!/function hasWorkersAI/.test(worker)||!/env\.AI\.run/.test(worker))throw new Error('Passerelle IA: binding Workers AI `AI` absent du code');
if(!/async function callWorkersAI/.test(worker))throw new Error('Passerelle IA: appel Workers AI dédié absent');
if(!/async function callAI/.test(worker))throw new Error('Passerelle IA: routeur de fournisseur absent');
if(!/provider:\s*['"]cloudflare-workers-ai['"]/.test(worker))throw new Error('Passerelle IA: fournisseur Workers AI non exposé');
if(!/fallback Groq/.test(worker)||!/fallbackFrom/.test(worker))throw new Error('Passerelle IA: repli Groq explicite absent');
if(!/workersAiBinding:\s*workersReady/.test(worker))throw new Error('Passerelle IA: ping ne signale pas le binding Workers AI');
if(!/workersReady && groqReady/.test(worker))throw new Error('Passerelle IA: ping ne signale pas le fallback Groq');

if(!/mode === 'proofread'/.test(worker))throw new Error('Passerelle IA: mode proofread dédié absent');
if(!/const PROOFREAD_SYSTEM/.test(worker))throw new Error('Passerelle IA: prompt proofread léger absent');
if(!/N’invente, n’ajoute et ne déduis aucune information absente du texte/.test(worker))throw new Error('Passerelle IA: le correcteur doit interdire invention, ajout et déduction');
if(!/Ne change aucun fait et ne supprime aucun fait utile/.test(worker))throw new Error('Passerelle IA: le correcteur doit préserver tous les faits utiles');
if(!/Fluidifie les phrases et rends le texte plus professionnel, naturel et concis/.test(worker))throw new Error('Passerelle IA: le correcteur doit fluidifier et professionnaliser la forme');
if(!/y compris lorsque le texte est déjà grammaticalement correct/.test(worker))throw new Error('Passerelle IA: la fluidification doit aussi s’appliquer aux textes déjà corrects');
if(!/sans changer le sens ni transformer la note en résumé/.test(worker))throw new Error('Passerelle IA: le correcteur ne doit pas résumer ni changer le sens');
if(!/Conserve le niveau de détail du texte source/.test(worker))throw new Error('Passerelle IA: le correcteur doit conserver le niveau de détail');
if(!/function proofreadMaxTokens/.test(worker))throw new Error('Passerelle IA: plafond dynamique proofread absent');
if(!/function proofreadRetryTokens/.test(worker))throw new Error('Passerelle IA: retry de budget proofread absent');
if(!/body\.proofreadText/.test(worker))throw new Error('Passerelle IA: proofread doit accepter le texte brut dédié');
if(!/reasoningEffort:\s*['"]low['"]/.test(worker))throw new Error('Passerelle IA: proofread doit limiter le raisonnement');
if(!/includeReasoning:\s*false/.test(worker))throw new Error('Passerelle IA: le raisonnement Groq proofread ne doit pas être renvoyé');
if(!/max_completion_tokens/.test(worker))throw new Error('Passerelle IA: utiliser max_completion_tokens');
if(!/Math\.max\(320,/.test(worker))throw new Error('Passerelle IA: le plafond proofread est trop bas pour laisser une réponse finale');
if(!/callAI\(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens\(source\), PROOFREAD_OPTIONS\)/.test(worker))throw new Error('Passerelle IA: proofread doit passer par le routeur Workers AI/Groq');
if(!/callAI\(env, PROOFREAD_SYSTEM, user, proofreadRetryTokens\(source\), PROOFREAD_OPTIONS\)/.test(worker))throw new Error('Passerelle IA: proofread doit retenter une réponse vide avec plus de marge');
if(!/callAI\(env, STORE_PARSE_SYSTEM, user, 1600\)/.test(worker))throw new Error('Passerelle IA: parse_stores doit passer par le routeur Workers AI/Groq');
if(!/callAI\(env, ASSISTANT_SYSTEM, user, 1000\)/.test(worker))throw new Error('Passerelle IA: assistant doit passer par le routeur Workers AI/Groq');
if(worker.indexOf("mode === 'proofread'")>worker.indexOf('const context = compactContext'))throw new Error('Passerelle IA: proofread ne doit pas traverser le contexte assistant');

class TestResponse{
  constructor(body,init={}){
    this.body=body==null?'':String(body);
    this.status=init.status||200;
    this.headers=init.headers||{};
  }
  async json(){return this.body?JSON.parse(this.body):null;}
}

function makeRequest(body){
  return {
    method:'POST',
    url:'https://chef-secteur-ai.example.workers.dev/',
    headers:{get:(name)=>String(name).toLowerCase()==='origin'?'https://store-runner.fr':''},
    json:async()=>body
  };
}

async function exerciseProviderRouting(){
  const transformed=worker.replace('export default {','module.exports = {');
  let fetchCalls=0;
  const sandbox={
    module:{exports:{}},
    exports:{},
    Response:TestResponse,
    URL,
    console:{warn:()=>{},log:()=>{},error:()=>{}},
    fetch:async()=>{
      fetchCalls+=1;
      return {
        ok:true,
        status:200,
        json:async()=>({choices:[{message:{content:'Groq secours'},finish_reason:'stop'}]})
      };
    }
  };
  vm.runInNewContext(transformed,sandbox,{filename:'chef-secteur-ai.js'});
  const handler=sandbox.module.exports;

  const primary=await handler.fetch(
    makeRequest({mode:'assistant',message:'Test Gemma',context:{}}),
    {
      AI:{run:async(model,payload)=>{
        if(model!=='@cf/google/gemma-4-26b-a4b-it')throw new Error(`Modèle Workers AI inattendu: ${model}`);
        if(!payload||!Array.isArray(payload.messages))throw new Error('Payload Workers AI invalide');
        return {response:'Gemma primaire'};
      }},
      GROQ_API_KEY:'secours-present'
    }
  );
  const primaryJson=await primary.json();
  if(primary.status!==200||primaryJson.provider!=='cloudflare-workers-ai'||primaryJson.text!=='Gemma primaire')throw new Error('Passerelle IA: Workers AI n’est pas réellement prioritaire');
  if(fetchCalls!==0)throw new Error('Passerelle IA: Groq a été appelé alors que Workers AI fonctionnait');

  const fallback=await handler.fetch(
    makeRequest({mode:'assistant',message:'Test fallback',context:{}}),
    {
      AI:{run:async()=>{throw new Error('Workers AI indisponible');}},
      GROQ_API_KEY:'secours-present'
    }
  );
  const fallbackJson=await fallback.json();
  if(fallback.status!==200||fallbackJson.provider!=='groq'||fallbackJson.text!=='Groq secours')throw new Error('Passerelle IA: fallback Groq non fonctionnel');
  if(fallbackJson.fallbackFrom!=='cloudflare-workers-ai')throw new Error('Passerelle IA: origine du fallback non exposée');
  if(fetchCalls!==1)throw new Error(`Passerelle IA: nombre d’appels Groq inattendu (${fetchCalls})`);

  const ping=await handler.fetch(
    makeRequest({mode:'ping'}),
    {
      AI:{run:async()=>({response:'ok'})},
      GROQ_API_KEY:'secours-present'
    }
  );
  const pingJson=await ping.json();
  if(!pingJson.ok||pingJson.provider!=='cloudflare-workers-ai'||pingJson.workersAiBinding!==true)throw new Error('Passerelle IA: ping Workers AI incorrect');
  if(!pingJson.fallback||pingJson.fallback.provider!=='groq')throw new Error('Passerelle IA: ping ne publie pas le fallback Groq');
}

exerciseProviderRouting()
  .then(()=>console.log('AI gateway CORS + Workers AI Gemma + Groq fallback + proofread style guards: OK'))
  .catch((err)=>{console.error(err);process.exitCode=1;});