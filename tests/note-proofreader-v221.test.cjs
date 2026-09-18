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
assert.match(prompt,/uniquement le texte corrigé/i);

(async()=>{
  let request=null;
  const corrected=await P.correct('vendeur trouve image tro sombre',{label:'Note terrain BRUN',gateway:'https://example.test/ai',fetch:async(url,options)=>{
    request={url,options,body:JSON.parse(options.body)};
    return{ok:true,status:200,json:async()=>({text:'Texte corrigé : Le vendeur trouve l’image trop sombre.'})};
  }});
  assert.equal(corrected,'Le vendeur trouve l’image trop sombre.');
  assert.equal(request.url,'https://example.test/ai');
  assert.equal(request.options.method,'POST');
  assert.equal(request.body.mode,'assistant');
  assert.match(request.body.message,/vendeur trouve image tro sombre/);
  assert.equal(request.body.context.instructions,'Correction de note uniquement. Ne modifier aucune donnée métier.');

  await assert.rejects(()=>P.correct('',{fetch:async()=>{throw Error('ne doit pas être appelé')}}),/Écris une note/);
  await assert.rejects(()=>P.correct('texte',{gateway:'https://example.test/ai',fetch:async()=>({ok:false,status:503,json:async()=>({error:'IA indisponible'})})}),/IA indisponible/);
  console.log('note-proofreader-v221.test.cjs: OK');
})().catch(err=>{console.error(err);process.exitCode=1});
