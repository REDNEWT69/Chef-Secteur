/* V277.1 — enrichissement IA automatique après clôture.
   La clôture et la mémoire locale V277 restent l'autorité. L'IA ne peut ajouter qu'une
   citation présente dans une source réelle de la visite ; toute paraphrase/invention est rejetée. */
(function(root){
'use strict';
const VERSION=1,MAX_ITEMS=12,MAX_SOURCE_CHARS=16000,RETRY_MS=60000;
const KINDS=new Set(['action','followup','training','merchandising','product','problem','priority','objection','contact']);
const STATUSES=new Set(['recorded','planned','done','cancelled']);
let timer=null,lastVisibility=0;const running=new Set(),retryAfter=new Map();
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function model(){return root.StoreRunnerVisitModel}
function state(){return root.state}
function visitById(id){const s=state(),b=s&&s.businessV2;return b&&Array.isArray(b.visits)?b.visits.find(v=>v.id===String(id)):null}
function storeOf(s,v){const stores=s&&Array.isArray(s.stores)?s.stores:[],hit=stores.find(x=>String(x.id)===String(v.storeId));return hit||(s&&s.businessV2&&s.businessV2.storeSnapshots&&s.businessV2.storeSnapshots[String(v.storeId)])||{}}
function payloadFor(s,visitId){
 const M=model(),v=M&&M.getVisit(s,String(visitId));if(!M||!v||v.status!=='completed')return null;
 let used=0;const entries=[];for(const row of M.reportSourceEntries(v)){const text=String(row.text||'').trim();if(!text)continue;const room=MAX_SOURCE_CHARS-used;if(room<=0)break;const kept=text.slice(0,room);used+=kept.length;entries.push({source:row.source,family:row.family||'',text:kept})}
 const store=storeOf(s,v);
 return{version:VERSION,visitId:v.id,storeId:String(v.storeId),date:v.completedDate||'',sourceSignature:M.reportSourceSignature(v),store:{enseigne:String(store.enseigne||''),ville:String(store.ville||'')},entries};
}
function promptFor(payload){
 return `Tu enrichis la mémoire terrain de Store Runner après une visite clôturée.

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec un JSON valide, sans markdown ni commentaire.
- Format : {"items":[{"kind":"...","text":"...","source":"...","status":"..."}]}
- 12 éléments maximum.
- kind autorisé : action, followup, training, merchandising, product, problem, priority, objection, contact.
- status autorisé : recorded, planned, done, cancelled.
- text doit être une CITATION EXACTE présente dans le champ source indiqué. Ne reformule jamais.
- source doit être exactement l'un des chemins fournis dans SOURCES.
- N'invente jamais un fait, une personne, une référence, une action, une échéance ou une conclusion.
- Si rien d'utile ne manque, réponds {"items":[]}.
- planned uniquement si la source exprime explicitement quelque chose à faire/revoir/prévoir.
- done uniquement si la source dit explicitement que c'est fait/réalisé/résolu.
- cancelled uniquement si la source dit explicitement que c'est annulé.
- product : cite uniquement la référence exacte, jamais un nom supposé.

MAGASIN : ${payload.store.enseigne} ${payload.store.ville}
DATE : ${payload.date}
SOURCES :
${JSON.stringify(payload.entries,null,2)}`;
}
function cleanJSON(value){let text=String(value||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a>=0&&b>a)text=text.slice(a,b+1);return text}
function parseResponse(value,payload){
 let parsed;try{parsed=JSON.parse(cleanJSON(value))}catch(e){return{version:VERSION,sourceSignature:payload.sourceSignature,items:[]}}
 const rows=parsed&&Array.isArray(parsed.items)?parsed.items:[],bySource=new Map(payload.entries.map(x=>[x.source,x])),items=[],seen=new Set();
 for(const row of rows.slice(0,MAX_ITEMS*2)){if(!row||!KINDS.has(row.kind)||!STATUSES.has(row.status))continue;const src=bySource.get(String(row.source||'')),text=String(row.text||'').replace(/\s+/g,' ').trim();if(!src||text.length<4||text.length>600||!norm(src.text).includes(norm(text)))continue;const key=row.kind+'|'+row.source+'|'+norm(text);if(seen.has(key))continue;seen.add(key);items.push({kind:row.kind,text,source:row.source,family:src.family||'',status:row.status});if(items.length>=MAX_ITEMS)break}
 return{version:VERSION,sourceSignature:payload.sourceSignature,items};
}
function ready(){return typeof root.callAIGateway==='function'&&root.aiConfig&&root.aiConfig.gateway}
function persistResult(visitId,result){
 if(!root.document||typeof root.document.dispatchEvent!=='function'||typeof root.CustomEvent!=='function')return Promise.resolve(false);
 return new Promise(resolve=>{let settled=false,timer=null;const done=ok=>{if(settled)return;settled=true;if(timer&&root.clearTimeout)root.clearTimeout(timer);resolve(!!ok)};try{root.document.dispatchEvent(new root.CustomEvent('store-runner:report-ai-enrichment-ready',{detail:{visitId:String(visitId||''),result,respond:done}}));if(root.setTimeout)timer=root.setTimeout(()=>done(false),15000)}catch(e){done(false)}})
}
async function enrichVisit(visitId){
 const id=String(visitId||'');if(!id||running.has(id))return false;const v=visitById(id),M=model();if(!v||v.status!=='completed'||!M)return false;
 const cache=v.runnerAI,sig=M.reportSourceSignature(v);if(cache&&cache.status==='done'&&cache.sourceSignature===sig)return true;if(!cache||cache.status!=='pending'||cache.sourceSignature!==sig)return false;
 if(!ready()||(root.navigator&&root.navigator.onLine===false))return false;
 running.add(id);try{
  const payload=payloadFor(state(),id);if(!payload)return false;
  if(!payload.entries.length)return await persistResult(id,{version:VERSION,sourceSignature:payload.sourceSignature,items:[]});
  const response=await root.callAIGateway({mode:'assistant',message:promptFor(payload),context:{task:'runner_report_memory_enrichment',visit:{id:payload.visitId,storeId:payload.storeId,date:payload.date}}});
  const result=parseResponse(response&&response.text,payload),ok=await persistResult(id,result);if(ok)retryAfter.delete(id);return !!ok;
 }catch(e){retryAfter.set(id,Date.now()+RETRY_MS);try{console.warn('Enrichissement IA Runner reporté',e)}catch(_){}return false}
 finally{running.delete(id)}
}
function pendingIds(){
 const M=model(),s=state(),b=s&&s.businessV2;if(!M||!b||!Array.isArray(b.visits))return[];
 return b.visits.filter(v=>v&&v.status==='completed'&&v.runnerAI&&v.runnerAI.status==='pending'&&v.runnerAI.sourceSignature===M.reportSourceSignature(v)).sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||''))).map(v=>v.id);
}
async function scan(){
 timer=null;if(!ready()||(root.navigator&&root.navigator.onLine===false))return false;let attempted=0;
 for(const id of pendingIds()){if(attempted>=2)break;if((retryAfter.get(id)||0)>Date.now())continue;attempted++;await enrichVisit(id)}
 if(pendingIds().some(id=>(retryAfter.get(id)||0)<=Date.now()))schedule(1500);
 return attempted>0;
}
function schedule(ms=0){if(timer)return;timer=root.setTimeout?root.setTimeout(scan,ms):null}
function boot(){
 schedule(900);
 if(!root.document)return;
 root.document.addEventListener('store-runner:visit-completed',()=>schedule(0));
 root.document.addEventListener('store-runner:data-restored',()=>schedule(500));
 root.document.addEventListener('visibilitychange',()=>{if(root.document.visibilityState!=='visible')return;const now=Date.now();if(now-lastVisibility<60000)return;lastVisibility=now;schedule(0)});
 if(root.addEventListener)root.addEventListener('online',()=>schedule(0));
}
const api={payloadFor,promptFor,parseResponse,enrichVisit,scan,pendingIds};root.StoreRunnerReportAIAutoV2771=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
})(typeof window!=='undefined'?window:globalThis);
