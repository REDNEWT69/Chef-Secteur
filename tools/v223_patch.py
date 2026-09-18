from pathlib import Path
import json

root=Path('.')
js_path=root/'note-proofreader-v221.js'
s=js_path.read_text(encoding='utf-8')

start=s.index('async function correct(value,options){')
end=s.index('\nfunction ensureStyle()', start)
new_correct=r'''function errorText(data){
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
    const response=await fetchFn(gateway,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'assistant',message:buildPrompt(source,options.label),context:{instructions:'Correction de note uniquement. Ne modifier aucune donnée métier.'}})});
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
}'''
s=s[:start]+new_correct+s[end:]

start=s.index("  let suggestion='';")
end=s.index("  apply.addEventListener", start)
new_attach=r'''  let suggestion='',waitTimer=null,cooldownUntil=0;
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
'''
s=s[:start]+new_attach+s[end:]

old="const api={buildPrompt,cleanReply,correct,attach,enhanceVisitNotes,boot};"
new="const api={buildPrompt,cleanReply,errorText,retryAfterMs,correct,attach,enhanceVisitNotes,boot};"
if old not in s: raise SystemExit('API export marker missing')
s=s.replace(old,new,1)
js_path.write_text(s,encoding='utf-8')

# Strengthen regression tests for 429 + retry + friendly errors.
test_path=root/'tests/note-proofreader-v221.test.cjs'
t=test_path.read_text(encoding='utf-8')
marker="  await assert.rejects(()=>P.correct('texte',{gateway:'https://example.test/ai',fetch:async()=>({ok:false,status:503,json:async()=>({error:'IA indisponible'})})}),/IA indisponible/);\n"
if marker not in t: raise SystemExit('test marker missing')
extra=r'''  await assert.rejects(()=>P.correct('texte',{gateway:'https://example.test/ai',fetch:async()=>({ok:false,status:503,json:async()=>({error:'IA indisponible'})})}),/IA indisponible/);

  let calls=0,waited=0,retryNotice=0;
  const afterLimit=await P.correct('vendeur trouve image tro sombre',{label:'Note terrain BRUN',gateway:'https://example.test/ai',sleep:async ms=>{waited=ms},onRateLimit:info=>{retryNotice=info.retryAfterMs},fetch:async()=>{
    calls++;
    if(calls===1)return{ok:false,status:429,json:async()=>({error:'Rate limit reached on tokens per minute (TPM). Please try again in 6.9s. Upgrade at billing.'})};
    return{ok:true,status:200,json:async()=>({text:'Le vendeur trouve l’image trop sombre.'})};
  }});
  assert.equal(afterLimit,'Le vendeur trouve l’image trop sombre.');
  assert.equal(calls,2);
  assert.equal(waited,6900);
  assert.equal(retryNotice,6900);

  await assert.rejects(async()=>{
    try{
      await P.correct('texte',{gateway:'https://example.test/ai',maxAutoRetryMs:0,fetch:async()=>({ok:false,status:429,json:async()=>({error:'Rate limit reached for model gpt-oss-20b in organization secret-org. Upgrade billing.'})})});
    }catch(err){
      assert.equal(err.code,'RATE_LIMIT');
      assert.ok(err.retryAfterMs>=1000);
      assert.doesNotMatch(err.message,/gpt-oss|organization|billing|tokens per minute/i);
      throw err;
    }
  },/momentanément très sollicité/i);

  let recoveryCalls=0;
  await assert.rejects(()=>P.correct('texte',{gateway:'https://example.test/ai',sleep:async()=>{},fetch:async()=>{
    recoveryCalls++;
    return recoveryCalls===1?{ok:false,status:429,json:async()=>({error:'Rate limit reached. Please try again in 1s.'})}:{ok:true,status:200,json:async()=>({text:''})};
  }}),/récupère encore/i);
'''
t=t.replace(marker,extra,1)
test_path.write_text(t,encoding='utf-8')

old_build='20260918-visitai222'
new_build='20260918-proofreader223'
for name in ['index.html','sw.js']:
    p=root/name
    data=p.read_text(encoding='utf-8')
    if old_build not in data: raise SystemExit(f'{old_build} missing in {name}')
    p.write_text(data.replace(old_build,new_build),encoding='utf-8')

(root/'version.json').write_text(json.dumps({
    'latestBuild':new_build,
    'displayVersion':'223',
    'channel':'stable',
    'releasedAt':'2026-09-18'
},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

print('V223 patch applied')
