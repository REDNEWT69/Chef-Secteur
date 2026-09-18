const assert=require('node:assert/strict');
const path=require('node:path');
const modPath=path.join(__dirname,'..','note-proofreader-v221.js');
delete require.cache[require.resolve(modPath)];
const P=require(modPath);

assert.equal(P.cleanReply('```text\nTexte corrigé : Le vendeur apprécie le Neo QLED.\n```'),'Le vendeur apprécie le Neo QLED.');
assert.equal(P.cleanReply('“Samsung reste bien visible.”'),'Samsung reste bien visible.');

const prompt=P.buildPrompt('vendeur di mini led tro sombre et q symphony marche pas','Note terrain BRUN');
assert.match(prompt,/Note terrain BRUN/);
assert.match(prompt,/vendeur di mini led tro sombre/);
assert.match(prompt,/sans changer le sens/i);
assert.match(prompt,/Q-Symphony/);
assert.match(prompt,/uniquement (?:avec )?le texte corrigé/i);

(async()=>{
  let request=null;
  const corrected=await P.correct('vendeur trouve image tro sombre',{label:'Note terrain BRUN',gateway:'https://example.test/ai',fetch:async(url,options)=>{
    request={url,options,body:JSON.parse(options.body)};
    return{ok:true,status:200,json:async()=>({text:'Texte corrigé : Le vendeur trouve l’image trop sombre.'})};
  }});
  assert.equal(corrected,'Le vendeur trouve l’image trop sombre.');
  assert.equal(request.url,'https://example.test/ai');
  assert.equal(request.options.method,'POST');
  assert.equal(request.body.mode,'proofread');
  assert.ok(request.body.message.length<900,'Le prompt correcteur doit rester compact pour préserver le quota TPM');
  assert.equal(request.body.proofreadText,'vendeur trouve image tro sombre');
  assert.equal(request.body.proofreadLabel,'Note terrain BRUN');
  assert.match(request.body.message,/vendeur trouve image tro sombre/);
  assert.equal(request.body.context.instructions,'Correction de note uniquement. Ne modifier aucune donnée métier.');

  await assert.rejects(()=>P.correct('',{fetch:async()=>{throw Error('ne doit pas être appelé')}}),/Écris une note/);
  await assert.rejects(()=>P.correct('texte',{gateway:'https://example.test/ai',fetch:async()=>({ok:false,status:503,json:async()=>({error:'IA indisponible'})})}),/IA indisponible/);

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
  console.log('note-proofreader-v221.test.cjs: OK');
})().catch(err=>{console.error(err);process.exitCode=1});
