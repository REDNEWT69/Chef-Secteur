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
if(!/callGroq\(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens\(user\)\)/.test(worker))throw new Error('Passerelle IA: proofread doit utiliser son prompt et son plafond dédiés');
if(worker.indexOf("mode === 'proofread'")>worker.indexOf('const context = compactContext'))throw new Error('Passerelle IA: proofread ne doit pas traverser le contexte assistant');

console.log('AI gateway CORS + proofread quota guards: OK');
