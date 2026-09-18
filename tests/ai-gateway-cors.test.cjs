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

if(!/mode === 'proofread'/.test(worker))throw new Error('Passerelle IA: mode proofread dédié absent');
if(!/const PROOFREAD_SYSTEM/.test(worker))throw new Error('Passerelle IA: prompt proofread léger absent');
if(!/function proofreadMaxTokens/.test(worker))throw new Error('Passerelle IA: plafond dynamique proofread absent');
if(!/function proofreadRetryTokens/.test(worker))throw new Error('Passerelle IA: retry de budget proofread absent');
if(!/body\.proofreadText/.test(worker))throw new Error('Passerelle IA: proofread doit accepter le texte brut dédié');
if(!/reasoningEffort:\s*['"]low['"]/.test(worker))throw new Error('Passerelle IA: GPT-OSS proofread doit utiliser un raisonnement faible');
if(!/includeReasoning:\s*false/.test(worker))throw new Error('Passerelle IA: le raisonnement proofread ne doit pas être renvoyé');
if(!/max_completion_tokens/.test(worker))throw new Error('Passerelle IA: utiliser max_completion_tokens pour GPT-OSS');
if(!/Math\.max\(320,/.test(worker))throw new Error('Passerelle IA: le plafond proofread est trop bas pour laisser une réponse finale');
if(!/callGroq\(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens\(source\), PROOFREAD_GROQ_OPTIONS\)/.test(worker))throw new Error('Passerelle IA: proofread doit utiliser ses options GPT-OSS dédiées');
if(!/callGroq\(env, PROOFREAD_SYSTEM, user, proofreadRetryTokens\(source\), PROOFREAD_GROQ_OPTIONS\)/.test(worker))throw new Error('Passerelle IA: proofread doit retenter une réponse vide avec plus de marge');
if(worker.indexOf("mode === 'proofread'")>worker.indexOf('const context = compactContext'))throw new Error('Passerelle IA: proofread ne doit pas traverser le contexte assistant');

console.log('AI gateway CORS + proofread reasoning guards: OK');
