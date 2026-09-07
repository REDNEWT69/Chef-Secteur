// Cloudflare Worker - passerelle IA sécurisée pour Chef Secteur SAMSUNG
// Fournisseur gratuit recommandé : Groq Free Plan.
// IMPORTANT : ne jamais mettre une clé API dans GitHub Pages ou dans ce fichier.
// Ajoute GROQ_API_KEY comme secret Cloudflare. OPENAI_API_KEY reste un fallback optionnel.

const ALLOWED_ORIGINS = new Set(['https://rednewt69.github.io']);

function cors(origin){const allowed=ALLOWED_ORIGINS.has(origin)?origin:'https://rednewt69.github.io';return{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}}
function json(data,status,origin){return new Response(JSON.stringify(data),{status:status||200,headers:{'Content-Type':'application/json; charset=utf-8',...cors(origin)}})}
function stripFence(text){return String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim()}
function compactContext(context){if(!context||typeof context!=='object')return{};return{today:context.today||null,profile:context.profile||{},settings:context.settings||{},plan:context.plan||{},calendarEvents:(context.calendarEvents||[]).slice(0,120),awayRanges:context.awayRanges||[],daySummaries:context.daySummaries||{},overnight:context.overnight||null,instructions:context.instructions||'',stores:(context.stores||[]).slice(0,120)}}

async function callGroq(env,system,user,maxTokens){
  if(!env.GROQ_API_KEY)throw new Error('GROQ_API_KEY manquante dans les secrets Cloudflare.');
  const model=env.GROQ_MODEL||'openai/gpt-oss-20b';
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:user}],temperature:.2,max_tokens:maxTokens||900})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const msg=data&&data.error&&data.error.message?data.error.message:`Groq HTTP ${response.status}`;throw new Error(msg)}
  const text=data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;
  return{text:String(text||'').trim(),model,provider:'groq'};
}

function outputText(data){if(data&&typeof data.output_text==='string')return data.output_text.trim();const out=[];for(const item of(data&&data.output)||[])for(const c of item.content||[])if(c&&typeof c.text==='string')out.push(c.text);return out.join('\n').trim()}
async function callOpenAI(env,system,user,maxTokens){if(!env.OPENAI_API_KEY)throw new Error('Aucune clé IA configurée.');const model=env.OPENAI_MODEL||'gpt-5.6-luna';const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content:[{type:'input_text',text:user}]}],max_output_tokens:maxTokens||900})});const data=await response.json().catch(()=>({}));if(!response.ok){const msg=data&&data.error&&data.error.message?data.error.message:`OpenAI HTTP ${response.status}`;throw new Error(msg)}return{text:outputText(data),model,provider:'openai'}}
async function callAI(env,system,user,maxTokens){if(env.GROQ_API_KEY)return callGroq(env,system,user,maxTokens);return callOpenAI(env,system,user,maxTokens)}

const ASSISTANT_SYSTEM=`Tu es l'assistant opérationnel d'un chef de secteur Samsung Rhône-Alpes.
Tu reçois le planning réel de la semaine, les magasins, Google Agenda, déplacements, hôtels et contraintes.
Règles impératives :
- Ne fabrique jamais un rendez-vous, un horaire, une adresse ou une ouverture de magasin absent du contexte.
- Un déplacement/formation/journée bloquée interdit toute visite terrain concurrente.
- Respecte Google Agenda et les séjours hors secteur.
- Pour une question sur un jour, réponds d'abord avec ce qui est réellement prévu ce jour-là.
- Signale clairement une incohérence du planning au lieu de l'ignorer.
- Réponds en français, brièvement, de façon pratique et exploitable.
- N'effectue aucune modification du planning sans que l'utilisateur le demande explicitement.`;
const STORE_PARSE_SYSTEM=`Transforme les notes fournies en liste structurée de magasins. Réponds UNIQUEMENT avec un objet JSON valide de forme {"stores":[...]}. Chaque magasin peut contenir : enseigne, ville, adresse, codePostal, dept, lat, lon, freq, priority, products, active. N'invente pas les données manquantes.`;

export default{async fetch(request,env){const origin=request.headers.get('Origin')||'';if(request.method==='OPTIONS'){if(origin&&!ALLOWED_ORIGINS.has(origin))return new Response(null,{status:403});return new Response(null,{status:204,headers:cors(origin)})}if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405,origin);if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:'Origine non autorisée.'},403,origin);let body;try{body=await request.json()}catch{return json({error:'JSON invalide.'},400,origin)}const mode=String(body.mode||'assistant');try{if(mode==='ping'){if(!env.GROQ_API_KEY&&!env.OPENAI_API_KEY)return json({error:'Secret GROQ_API_KEY absent.'},500,origin);return json({ok:true,provider:env.GROQ_API_KEY?'groq':'openai',model:env.GROQ_API_KEY?(env.GROQ_MODEL||'openai/gpt-oss-20b'):(env.OPENAI_MODEL||'gpt-5.6-luna')},200,origin)}if(mode==='parse_stores'){const user=String(body.message||'').slice(0,18000);const result=await callAI(env,STORE_PARSE_SYSTEM,user,1600);let parsed;try{parsed=JSON.parse(stripFence(result.text))}catch{return json({error:'Le modèle n’a pas renvoyé un JSON de magasins valide.',raw:result.text.slice(0,500)},502,origin)}return json({stores:Array.isArray(parsed.stores)?parsed.stores:[],model:result.model,provider:result.provider},200,origin)}const message=String(body.message||'').trim().slice(0,12000);if(!message)return json({error:'Message vide.'},400,origin);const context=compactContext(body.context||{});const user=`QUESTION UTILISATEUR:\n${message}\n\nCONTEXTE CHEF SECTEUR (JSON):\n${JSON.stringify(context)}`;const result=await callAI(env,ASSISTANT_SYSTEM,user,1000);if(!result.text)throw new Error('Réponse IA vide.');return json({reply:result.text,answer:result.text,message:result.text,text:result.text,model:result.model,provider:result.provider},200,origin)}catch(err){return json({error:err&&err.message?err.message:String(err)},500,origin)}}};