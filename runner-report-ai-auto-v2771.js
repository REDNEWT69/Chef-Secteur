/* Rapport automatique : outbox durable et réconciliation de tâches serveur.
   Aucun appel au provider IA ici. Le téléphone peut s'arrêter après acceptation ;
   les notes, la clôture et Runner local ne dépendent jamais de cette tâche. */
(function(root){
'use strict';
const RETRY_MS=60000,POLL_MS=3000,REQUEST_MS=15000;
let timer=null;const running=new Set();
function model(){return root.StoreRunnerVisitModel}
function renderer(){return root.StoreRunnerReportRenderer}
function visits(){return root.StoreRunnerVisits}
function state(){return root.state}
function visitById(id){const s=state(),b=s&&s.businessV2;return b&&Array.isArray(b.visits)?b.visits.find(v=>v.id===String(id)):null}
function guard(job){return{generation:job.generation,completedDate:job.completedDate,sourceSignature:job.sourceSignature}}
function current(id,expected){const v=visitById(id);return model()&&model().reportJobGuard(v,expected)?v:null}
function payloadFor(s,visitId){
 const M=model(),v=M&&M.getVisit(s,String(visitId));if(!v||v.status!=='completed')return null;
 const job=v.reportJob;return job?{...M.sourceForReportJob(v),sourceSignature:job.sourceSignature||job.localSourceSignature}:{...M.frozenReportSource(s,v),sourceSignature:M.reportSourceSignature(v)};
}
function promptFor(payload){if(!renderer())throw Error('Renderer du compte rendu indisponible.');return renderer().buildPrompt(payload)}
function ready(){return !!(renderer()&&visits()&&typeof root.fetch==='function'&&root.aiConfig&&root.aiConfig.gateway)}
function online(){return !root.navigator||root.navigator.onLine!==false}
function visible(){return !root.document||root.document.visibilityState!=='hidden'}
function endpoint(){const url=new URL(root.aiConfig.gateway,root.location&&root.location.href||'https://store-runner.fr/');url.pathname='/api/ai/report-jobs';url.search='';url.hash='';return url.href}
function capability(){if(!(root.crypto&&root.crypto.getRandomValues))throw Error('Protection des tâches indisponible.');const b=new Uint8Array(32);root.crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
async function request(url,options){
 const ctrl=new AbortController(),timeout=root.setTimeout(()=>ctrl.abort(),REQUEST_MS);
 try{const response=await root.fetch(url,{...options,signal:ctrl.signal,cache:'no-store'});let data;try{data=await response.json()}catch(e){throw Error('Réponse du serveur illisible.')}
  if(!response.ok){const err=Error(data&&data.error&&data.error.message||'Tâche distante indisponible.');err.httpStatus=response.status;throw err}return data;
 }finally{root.clearTimeout(timeout)}
}
/* V282 experimental report preview: existing network boundary, no durable job
   or state mutation. Separate from automatic report reconciliation. */
async function freePreview(source,reportType,sourceSignature){
 if(!online()||!root.aiConfig||!root.aiConfig.gateway)throw Error('Connexion IA indisponible.');
 const controller=new AbortController(),timeout=root.setTimeout(()=>controller.abort(),70000);
 try{
  const url=new URL(root.aiConfig.gateway,root.location&&root.location.href||'https://store-runner.fr/');
  url.pathname='/api/ai';url.search='';url.hash='';
  const response=await root.fetch(url.href,{method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:'report_free_preview',source,reportType,sourceSignature}),
   signal:controller.signal,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data&&data.error||'Essai IA libre indisponible.');
  if(!data||data.mode!=='report_free_preview'||data.reportType!==reportType||
     typeof data.text!=='string'||!data.text.trim())throw Error('Texte IA libre indisponible.');
  return data;
 }finally{root.clearTimeout(timeout)}
}
function boundResponse(result,job){return !!(result&&result.protocolVersion===1&&typeof result.jobId==='string'&&result.jobId&&model().JOB_STATUSES.includes(result.status)&&result.visitId===job.visitId&&result.storeId===job.storeId&&result.completedDate===job.completedDate&&result.sourceSignature===job.sourceSignature&&result.generation===job.generation)}
async function failed(id,expected,error){return visits().persistReportJob(id,expected,{status:'failed',error:String(error||'Le compte rendu automatique reste à régénérer.').slice(0,240),retryAt:0})}
async function reconcileVisit(visitId){
 const id=String(visitId||'');if(!id||running.has(id)||!ready()||!online())return false;running.add(id);let expected=null;
 try{
  let v=visitById(id);if(!v||v.status!=='completed')return false;
  if(!v.reportJob){if(!await visits().ensureReportIntent(id))return false;v=visitById(id)}
  let job=v&&v.reportJob;if(!job||job.obsolete||!['pending','processing'].includes(job.status)||(job.retryAt||0)>Date.now())return false;
  expected=guard(job);if(!current(id,expected))return false;
  // Une panne après POST mais avant sauvegarde de jobId est sûre : même source,
  // génération et capacité persistées => le serveur renvoie le même job payant.
  const snapshot=model().sourceForReportJob(v);if(!snapshot){await failed(id,expected,'Les sources de cette tâche ont changé. Régénère le compte rendu.');return false}
  const sourceSignature=await renderer().sourceSignature(snapshot),accessToken=job.accessToken||capability();
  if(job.sourceSignature&&job.sourceSignature!==sourceSignature){await failed(id,expected,'Les sources de cette tâche ont changé. Régénère le compte rendu.');return false}
  if(!job.sourceSignature||!job.accessToken){if(!await visits().persistReportJob(id,expected,{sourceSignature,accessToken}))return false;v=visitById(id);job=v.reportJob;expected=guard(job)}
  if(!current(id,expected))return false;
  const result=job.jobId?await request(endpoint()+'/'+encodeURIComponent(job.jobId),{method:'GET',headers:{'X-Report-Capability':job.accessToken}}):await request(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:1,visitId:job.visitId,storeId:job.storeId,completedDate:job.completedDate,sourceSignature:job.sourceSignature,generation:job.generation,accessToken:job.accessToken,source:snapshot})});
  if(!current(id,expected))return false;
  if(!boundResponse(result,job)){await failed(id,expected,'Le serveur a renvoyé une tâche incohérente. Régénère le compte rendu.');return false}
  if(!await visits().persistReportJob(id,expected,{jobId:result.jobId,status:result.status==='done'?'processing':result.status,error:result.error&&result.error.message||'',retryAt:result.status==='failed'?0:Date.now()+POLL_MS}))return false;
  if(result.status==='failed')return false;if(result.status!=='done'){if(visible())schedule(POLL_MS);return true}
  const source={...snapshot,sourceSignature:job.sourceSignature};let validated;
  try{validated=renderer().validateDelivered(result.result,source)}catch(e){await failed(id,expected,'Le résultat IA ne respecte pas les notes sources. Le rapport précédent est conservé.');return false}
  const reports={};for(const report of validated.reports)reports[report.reportType]=renderer().render(report,source);
  const memory=renderer().memory(validated,source);return await visits().applyReportResult(id,expected,validated,reports,memory);
 }catch(e){
  try{if(expected&&current(id,expected)){
   if(e.httpStatus&&e.httpStatus>=400&&e.httpStatus<500&&![408,429].includes(e.httpStatus))await failed(id,expected,'La tâche distante ne peut pas être récupérée. Régénère le compte rendu.');
   else await visits().persistReportJob(id,expected,{error:'Réseau ou serveur indisponible. La visite est enregistrée ; reprise automatique au retour.',retryAt:Date.now()+RETRY_MS});
  }}catch(storageError){/* L'outbox déjà durable reste l'autorité après une erreur disque. */}if(visible()&&online())schedule(RETRY_MS);return false;
 }finally{running.delete(id)}
}
function pendingIds(){
 const M=model(),s=state(),b=s&&s.businessV2;if(!M||!b||!Array.isArray(b.visits))return[];
 return b.visits.filter(v=>v&&v.status==='completed'&&((v.reportJob&&!v.reportJob.obsolete&&['pending','processing'].includes(v.reportJob.status)&&M.reportJobGuard(v,guard(v.reportJob)))||(!v.reportJob&&v.runnerAI&&v.runnerAI.status==='pending'))).sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||''))).map(v=>v.id);
}
async function scan(){
 timer=null;if(!ready()||!online()||!visible())return false;let attempted=0;
 for(const id of pendingIds()){if(attempted>=2)break;const v=visitById(id);if((v&&v.reportJob&&v.reportJob.retryAt||0)>Date.now())continue;attempted++;await reconcileVisit(id)}
 const deadlines=pendingIds().map(id=>Math.max(500,(visitById(id).reportJob&&visitById(id).reportJob.retryAt||0)-Date.now()));
 if(deadlines.length&&visible())schedule(Math.min(RETRY_MS,...deadlines));return attempted>0;
}
function schedule(ms=0){if(timer)return;timer=root.setTimeout?root.setTimeout(scan,ms):null}
function resume(){if(timer){root.clearTimeout(timer);timer=null}schedule(0)}
function boot(){
 schedule(0);if(!root.document)return;
 root.document.addEventListener('store-runner:visit-completed',resume);root.document.addEventListener('store-runner:visit-report-requested',resume);root.document.addEventListener('store-runner:data-restored',resume);
 root.document.addEventListener('visibilitychange',()=>{if(visible())resume();else if(timer){root.clearTimeout(timer);timer=null}});if(root.addEventListener)root.addEventListener('online',resume);
}
const api={payloadFor,promptFor,reconcileVisit,enrichVisit:reconcileVisit,scan,pendingIds,freePreview};root.StoreRunnerReportAIAutoV2771=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
})(typeof window!=='undefined'?window:globalThis);
