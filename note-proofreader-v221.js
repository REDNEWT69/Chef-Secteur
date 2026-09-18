(function(root){
'use strict';
const DEFAULT_GATEWAY='https://chef-secteur-ai.rednewtizi.workers.dev';
const PRIMARY_BRAND='Sam'+'sung';
let visitObserver=null;

function text(v){return String(v==null?'':v).trim()}
function cleanReply(value){
  let out=text(value).replace(/^```(?:text|markdown)?\s*/i,'').replace(/\s*```$/i,'').trim();
  out=out.replace(/^(?:texte\s+corrig[eé]|correction|version\s+corrig[eé]e)\s*:\s*/i,'').trim();
  if((out.startsWith('"')&&out.endsWith('"'))||(out.startsWith('“')&&out.endsWith('”')))out=out.slice(1,-1).trim();
  return out
}
function buildPrompt(value,label){
  const source=text(value),field=text(label)||'note terrain';
  return [
    'Corrige cette note terrain en français professionnel, sans changer le sens.',
    'Corrige orthographe, grammaire, accords, conjugaison, ponctuation et mots manifestement mal saisis.',
    'N’invente rien. Conserve exactement faits, chiffres, noms, enseignes, villes, références produits, marques et termes métier.',
    'Préserve tels quels OLED, QLED, Neo QLED, Mini LED, Q-Symphony, SmartThings, Samsung et TCL lorsqu’ils sont présents.',
    'Reformule seulement si nécessaire pour la lisibilité. Ne fais ni analyse, ni résumé, ni recommandation.',
    'Réponds uniquement avec le texte corrigé, sans introduction, guillemets ni markdown.',
    'Champ : '+field+'.',
    '',
    'TEXTE :',
    source
  ].join('\n')
}
function errorText(data){
  const value=data&&data.error!=null?data.error:data;
  if(value&&typeof value==='object')return text(value.message||value.error||value.detail||'');
  return text(value)
}
function retryAfterMs(response,message){
  let raw='';try{if(response&&response.headers&&typeof response.headers.get==='function')raw=text(response.headers.get('retry-after'))}catch(e){}
  const headerSeconds=Number.parseFloat(raw);if(Number.isFinite(headerSeconds)&&headerSeconds>=0)return Math.max(1000,Math.ceil(headerSeconds*1000));
  const msg=text(message);const match=msg.match(/(?:try again in|retry in|réessa(?:ie|yer) dans)\s*([0-9]+(?:[.,][0-9]+)?)\s*(ms|milliseconds?|s|sec|secs|seconds?|secondes?)/i);
  if(match){const amount=Number.parseFloat(match[1].replace(',','.'));if(Number.isFinite(amount))return Math.max(1000,Math.ceil(amount*(/^ms|millisecond/i.test(match[2])?1:1000)))}
  return 8000
}
function rateLimitError(ms,message){
  const retry=Math.max(1000,Number(ms)||8000),seconds=Math.max(1,Math.ceil(retry/1000));
  const err=new Error(message||('Le correcteur IA est momentanément très sollicité. Réessaie dans '+seconds+' s.'));err.code='RATE_LIMIT';err.retryAfterMs=retry;return err
}
function defaultSleep(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)))}
async function correct(value,options){
  options=options||{};const source=text(value);if(!source)throw new Error('Écris une note avant de la corriger.');
  if(source.length>12000)throw new Error('Cette note est trop longue pour le correcteur.');
  if(root.navigator&&root.navigator.onLine===false)throw new Error('Correcteur indisponible hors ligne.');
  const gateway=text(options.gateway||(root.aiConfig&&root.aiConfig.gateway)||DEFAULT_GATEWAY);
  if(!gateway)throw new Error('Passerelle IA indisponible.');
  const fetchFn=options.fetch||root.fetch;if(typeof fetchFn!=='function')throw new Error('Connexion IA indisponible.');
  const sleepFn=typeof options.sleep==='function'?options.sleep:defaultSleep,maxAutoRetryMs=options.maxAutoRetryMs==null?15000:Math.max(0,Number(options.maxAutoRetryMs)||0);
  let hadRateLimit=false,lastRetryMs=8000;
  for(let attempt=0;attempt<2;attempt++){
    const response=await fetchFn(gateway,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'proofread',message:buildPrompt(source,options.label),context:{instructions:'Correction de note uniquement. Ne modifier aucune donnée métier.'}})});
    let data={};try{data=await response.json()}catch(e){}
    const rawError=errorText(data),limited=response.status===429||/rate\s*limit|too many requests|tokens per minute|\btpm\b/i.test(rawError);
    if(!response.ok){
      if(limited){
        hadRateLimit=true;lastRetryMs=retryAfterMs(response,rawError);
        if(attempt===0&&lastRetryMs<=maxAutoRetryMs){if(typeof options.onRateLimit==='function')options.onRateLimit({retryAfterMs:lastRetryMs,attempt:1});await sleepFn(lastRetryMs);continue}
        throw rateLimitError(lastRetryMs)
      }
      throw new Error(rawError||('Correcteur indisponible ('+response.status+').'))
    }
    const corrected=cleanReply(data.text||data.reply||data.answer||data.message||'');
    if(!corrected){
      if(hadRateLimit)throw rateLimitError(Math.min(lastRetryMs||5000,8000),'Le service IA récupère encore après la saturation. Réessaie dans quelques secondes.');
      throw new Error('Le correcteur n’a renvoyé aucun texte.')
    }
    return corrected
  }
  throw rateLimitError(lastRetryMs)
}
function ensureStyle(){
  if(!root.document||root.document.getElementById('srNoteProofreaderStyle'))return;
  const style=root.document.createElement('style');style.id='srNoteProofreaderStyle';style.textContent='\n.sr-noteProof{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 12px}.sr-noteProofBtn{min-height:38px;padding:8px 12px;border-radius:12px;font-size:13px;font-weight:750}.sr-noteProofStatus{font-size:12px;color:#667085}.sr-noteProofPreview{width:100%;padding:12px;border:1px solid #dbe2ea;border-radius:14px;background:#f8fafc;color:#111827}.sr-noteProofPreview[hidden]{display:none!important}.sr-noteProofPreview b{display:block;margin-bottom:6px;font-size:12px}.sr-noteProofPreview p{margin:0 0 10px;white-space:pre-wrap;line-height:1.45;font-size:14px}.sr-noteProofActions{display:flex;gap:8px}.sr-noteProofActions button{min-height:38px;padding:8px 12px;border-radius:11px}@media(max-width:420px){.sr-noteProof{align-items:stretch}.sr-noteProofBtn{width:auto}.sr-noteProofPreview{box-sizing:border-box}.sr-noteProofActions button{flex:1}}';root.document.head.appendChild(style)
}
function attach(labelNode,input,options){
  options=options||{};if(!root.document||!labelNode||!input||input.disabled||input.readOnly||input.dataset.noteProofreader==='1')return false;
  ensureStyle();input.dataset.noteProofreader='1';input.setAttribute('spellcheck','true');input.setAttribute('autocorrect','on');
  const row=root.document.createElement('div');row.className='sr-noteProof';
  const button=root.document.createElement('button');button.type='button';button.className='secondary sr-noteProofBtn';button.textContent='✨ Corriger';
  const status=root.document.createElement('span');status.className='sr-noteProofStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const preview=root.document.createElement('div');preview.className='sr-noteProofPreview';preview.hidden=true;
  const heading=root.document.createElement('b');heading.textContent='Proposition corrigée';
  const proposed=root.document.createElement('p');
  const actions=root.document.createElement('div');actions.className='sr-noteProofActions';
  const apply=root.document.createElement('button');apply.type='button';apply.className='primary';apply.textContent='Appliquer';
  const cancel=root.document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Annuler';
  actions.append(apply,cancel);preview.append(heading,proposed,actions);row.append(button,status,preview);
  if(labelNode.parentNode)labelNode.insertAdjacentElement('afterend',row);else return false;
  let suggestion='',waitTimer=null,cooldownUntil=0;
  function hide(){preview.hidden=true;suggestion=''}
  function stopWait(){if(waitTimer){clearInterval(waitTimer);waitTimer=null}}
  function showAutoRetry(ms){
    stopWait();const until=Date.now()+Math.max(1000,Number(ms)||8000);
    const tick=()=>{const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));if(seconds<=0){stopWait();button.textContent='Nouvel essai…';status.textContent='Nouvel essai automatique en cours…';return}button.textContent='Patiente '+seconds+' s';status.textContent='Limite IA atteinte. Nouvel essai automatique dans '+seconds+' s.'};
    tick();waitTimer=setInterval(tick,250)
  }
  function startCooldown(ms,message){
    stopWait();cooldownUntil=Date.now()+Math.max(1000,Number(ms)||8000);button.disabled=true;
    const tick=()=>{const seconds=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));if(seconds<=0){stopWait();cooldownUntil=0;button.disabled=false;button.textContent='✨ Corriger';status.textContent='Tu peux relancer la correction.';return}button.textContent='Réessaie dans '+seconds+' s';status.textContent=message||('Le correcteur IA est temporairement saturé. Réessaie dans '+seconds+' s.')};
    tick();waitTimer=setInterval(tick,250)
  }
  button.addEventListener('click',async()=>{
    if(cooldownUntil>Date.now())return;
    const source=text(input.value);if(!source){status.textContent='Écris une note avant de la corriger.';hide();return}
    button.disabled=true;button.textContent='Correction…';status.textContent='';hide();let keepDisabled=false;
    try{
      suggestion=await correct(source,{label:options.label||'',gateway:options.gateway,onRateLimit:info=>showAutoRetry(info&&info.retryAfterMs)});
      stopWait();
      if(suggestion===source){status.textContent='Aucune correction nécessaire.';return}
      proposed.textContent=suggestion;preview.hidden=false;status.textContent='Vérifie avant d’appliquer.'
    }catch(e){
      stopWait();
      if(e&&e.code==='RATE_LIMIT'){keepDisabled=true;startCooldown(e.retryAfterMs||8000,e.message)}else status.textContent=e&&e.message?e.message:String(e)
    }finally{if(!keepDisabled){stopWait();button.disabled=false;button.textContent='✨ Corriger'}}
  });
  apply.addEventListener('click',()=>{if(!suggestion)return;input.value=suggestion;input.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='Correction appliquée et enregistrée.';hide();input.focus()});
  cancel.addEventListener('click',()=>{status.textContent='Texte original conservé.';hide();input.focus()});
  return true
}
function labelFor(field){
  if(!field)return'note terrain';
  for(const node of Array.from(field.childNodes||[])){if(node.nodeType===3&&text(node.textContent))return text(node.textContent)}
  return text(field.getAttribute&&field.getAttribute('aria-label'))||'note terrain'
}
function enhanceVisitNotes(){
  if(!root.document)return 0;const dialog=root.document.getElementById('srVisitDialog');if(!dialog)return 0;let count=0;
  dialog.querySelectorAll('.sr-field textarea').forEach(input=>{const field=input.closest('.sr-field');if(field&&attach(field,input,{label:labelFor(field)}))count++});
  return count
}
function boot(){
  if(!root.document)return false;const dialog=root.document.getElementById('srVisitDialog');if(!dialog)return false;enhanceVisitNotes();
  if(!visitObserver&&typeof root.MutationObserver==='function'){visitObserver=new root.MutationObserver(()=>enhanceVisitNotes());visitObserver.observe(dialog,{childList:true,subtree:true})}
  return true
}
const api={buildPrompt,cleanReply,errorText,retryAfterMs,correct,attach,enhanceVisitNotes,boot};root.StoreRunnerNoteProofreader=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else root.setTimeout(boot,0)}
})(typeof window!=='undefined'?window:globalThis);
