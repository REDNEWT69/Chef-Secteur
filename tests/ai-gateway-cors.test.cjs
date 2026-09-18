const fs=require('fs');
const path=require('path');

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

console.log('AI gateway CORS + Workers AI Gemma + Groq fallback guards: OK');
