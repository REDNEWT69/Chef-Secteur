/* V232 — fiabilisation de la génération IA du compte rendu de visite.
   Fixtures 100 % synthétiques : le dépôt est public, aucune note terrain, aucun magasin,
   aucun nom réel. Chaque cas reproduit un format de réponse réellement possible du Worker. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const api=require('../visit-report-ai-json-v225.js');

const ROOT=path.join(__dirname,'..');
const WORKER=fs.readFileSync(path.join(ROOT,'workers/chef-secteur-ai.js'),'utf8');
const MODULE=fs.readFileSync(path.join(ROOT,'visit-report-ai-json-v225.js'),'utf8');
const SLACK=fs.readFileSync(path.join(ROOT,'visit-report-slack.js'),'utf8');

function visit(family){
  return{skeleton:'grands-magasins',family,store:{enseigne:'Enseigne-Test',ville:'Ville-Test'},
    noteTerrain:'Le vendeur signale une rupture sur deux references.',photos:{total:0}}
}
function doc(family){
  return family==='blanc'
    ?{famille:'BLANC',contexte:'Rayon accessible.',lavage:'Presence correcte.',froid:'',cuisson:'',entretien_sols:'',
      retours_vendeurs:['Le vendeur signale une rupture.'],retours_clients:[],concurrence:[],points_positifs:[],
      blocages:[],actions_realisees:[],formation:[],prochain_passage:['Revoir la disponibilite.'],priorite:'',synthese:'Situation stable.'}
    :{famille:'BRUN',contexte:'Tete de gondole occupee.',merchandising:'Visibilite correcte.',
      retours_vendeurs:['Le vendeur signale une rupture.'],retours_clients:[],concurrence:[],audio:'',
      points_positifs:[],blocages:[],actions_realisees:[],formation:[],prochain_passage:['Revoir la disponibilite.'],
      priorite:'',synthese:'Situation stable.'}
}
/* Le format qui provoquait réellement « JSON de compte rendu invalide » : la sortie est
   coupée par le plafond de tokens. Le schéma étant plat, il ne reste AUCUNE accolade
   fermante — c'est ce qui mettait l'ancien cleanJsonText en échec. */
function truncatedAnswer(family){
  const full=JSON.stringify(doc(family),null,2);
  const cut=full.slice(0,Math.floor(full.length*0.62));
  assert.equal(cut.includes('}'),false,'la fixture de troncature ne doit contenir aucune accolade fermante');
  return cut;
}
async function run(gateway,family='brun',options){
  const wrapped=api.wrapGateway(gateway);
  return wrapped({mode:'assistant',message:'ancien prompt',context:Object.assign({task:'visit_report',visit:visit(family)},options||{})});
}
function counting(answers){
  const calls=[];
  const fn=async opts=>{calls.push(opts);const next=answers[calls.length-1];
    if(typeof next==='function')return next(opts);
    if(next instanceof Error)throw next;
    return next};
  fn.calls=calls;return fn;
}

/* ---------------------------------------------------- 1. reproduction du format fautif */
(function reproduceTheBug(){
  const cut=truncatedAnswer('brun');
  // L'extraction dit maintenant que la réponse est tronquée au lieu de la confondre
  // avec une réponse absurde : c'est cette distinction qui autorise une réparation.
  assert.equal(api.looksTruncated(cut),true,'une sortie coupée doit être reconnue comme tronquée');
  assert.throws(()=>api.parseStructured(cut),/tronqué/);
  // Et la cause racine côté Worker est bien corrigée.
  assert.match(WORKER,/mode === 'visit_report'/,'le Worker doit exposer une route dédiée au compte rendu');
  assert.match(WORKER,/VISIT_REPORT_MAX_TOKENS = 2600/,'le budget de sortie doit dépasser le coût réel d’un compte rendu');
  assert.match(WORKER,/includeReasoning: false/,'le raisonnement ne doit pas consommer le budget du JSON');
  assert.match(WORKER,/truncated: String\(result\.finishReason/,'une réponse coupée doit être signalée au client');
  assert(!/callAI\(env, ASSISTANT_SYSTEM, user, 1000\)[\s\S]{0,200}visit_report/.test(WORKER),
    'le compte rendu ne doit plus emprunter la route assistant');
  console.log('PASS 1 · format fautif reproduit : sortie tronquée sans accolade fermante');
})();

/* ------------------------------------------------------------- 2. formats d'extraction */
(async function extraction(){
  const payload=JSON.stringify(doc('brun'));
  const cases=[
    ['JSON pur',{text:payload}],
    ['bloc markdown','```json\n'+payload+'\n```'],
    ['texte parasite autour',{text:'Voici le compte rendu demandé :\n'+payload+'\nDis-moi si {cela} convient.'}],
    ['JSON dans un autre champ texte',{reply:payload}],
    ['enveloppe provider connue',{choices:[{message:{content:payload}}]}],
    ['objet déjà structuré',{structured:doc('brun')}]
  ];
  for(const [label,answer] of cases){
    const gw=counting([answer]);
    const out=await run(gw,'brun');
    assert.match(out.text,/^⚫ Résumé BRUN – Enseigne-Test Ville-Test/,'format non géré : '+label);
    assert.equal(gw.calls.length,1,'un format directement exploitable ne doit coûter qu’un appel : '+label);
    assert.equal(out.repaired,false);
  }
  // Une accolade dans la prose qui suit ne doit plus casser l'extraction.
  assert.equal(api.cleanJsonText('bla {"a":1} et une accolade } perdue'),'{"a":1}');
  console.log('PASS 2 · JSON pur, fence, prose, champ alternatif, enveloppe provider, objet structuré');
})();

/* --------------------------------------------------- 3. réparation : réussie, échouée */
(async function repair(){
  const payload=JSON.stringify(doc('brun'));
  const ok=counting([{text:truncatedAnswer('brun')},{text:payload}]);
  const repaired=await run(ok,'brun');
  assert.equal(ok.calls.length,2,'une réparation coûte exactement un second appel');
  assert.equal(ok.calls[1].message.startsWith(api.REPAIR_INSTRUCTION),true,'le second appel ne demande que la réparation');
  assert.match(ok.calls[1].message,/SCHÉMA JSON STRICT ATTENDU/);
  assert.equal(repaired.repaired,true,'la réparation doit être signalée à l’interface');
  assert.match(repaired.text,/^⚫ Résumé BRUN/);

  const ko=counting([{text:truncatedAnswer('brun')},{text:'toujours pas du JSON'}]);
  await assert.rejects(()=>run(ko,'brun'),/JSON de compte rendu/);
  assert.equal(ko.calls.length,2,'jamais de troisième appel : le quota est protégé');

  const loop=counting([{text:'{"famille":"BRUN"'},{text:'{"famille":"BRUN"'},{text:payload}]);
  await assert.rejects(()=>run(loop,'brun'));
  assert.equal(loop.calls.length,2,'aucune boucle de réparation');
  console.log('PASS 3 · réparation réussie, réparation échouée, deux appels IA au maximum');
})();

/* ------------------------------------- 4. transport : pas de second appel gaspillé */
(async function transport(){
  for(const err of [new Error('Passerelle IA : HTTP 500 · indisponible'),
                    new Error('The operation was aborted'),
                    new Error('Failed to fetch'),
                    new Error('Réponse IA invalide : <html>')]){
    const gw=counting([err]);
    await assert.rejects(()=>run(gw,'brun'));
    assert.equal(gw.calls.length,1,'une panne de transport ne doit pas consommer la réparation : '+err.message);
  }
  // Timeout au second appel : l'erreur de transport remonte telle quelle.
  const timeout=counting([{text:truncatedAnswer('brun')},new Error('The operation was aborted')]);
  await assert.rejects(()=>run(timeout,'brun'),/aborted/);
  assert.equal(timeout.calls.length,2);
  assert.equal(api.transportFailure(new Error('HTTP 429')),true);
  assert.equal(api.transportFailure(new Error('JSON de compte rendu invalide')),false);
  console.log('PASS 4 · réseau, HTTP, timeout : aucun appel de réparation gaspillé');
})();

/* ------------------------------------------- 5. familles, mauvaise famille, vide */
(async function families(){
  for(const family of ['brun','blanc']){
    const gw=counting([{text:JSON.stringify(doc(family))}]);
    const out=await run(gw,family);
    assert.match(out.text,family==='blanc'?/^⚪ Résumé BLANC/:/^⚫ Résumé BRUN/);
    assert.equal(out.structuredVisitReport.famille,family.toUpperCase());
  }
  // Mauvaise famille : une réparation est tentée, puis refus si elle persiste.
  const wrong=counting([{text:JSON.stringify(doc('blanc'))},{text:JSON.stringify(doc('blanc'))}]);
  await assert.rejects(()=>run(wrong,'brun'),/famille JSON inattendue/);
  assert.equal(wrong.calls.length,2);

  const empty=counting([{text:'{}'},{text:'{}'}]);
  await assert.rejects(()=>run(empty,'brun'),/vide/);
  const nothing=counting([{text:''}]);
  await assert.rejects(()=>run(nothing,'brun'),/vide/);
  assert.equal(nothing.calls.length,1,'une réponse vide n’a rien à réparer');
  console.log('PASS 5 · BLANC, BRUN, mauvaise famille, contenu vide');
})();

/* ------------------------------------------ 6. aucune invention, rapport local préservé */
(async function noInvention(){
  const minimal={famille:'BRUN',contexte:'',merchandising:'',retours_vendeurs:['Le vendeur signale une rupture.'],
    retours_clients:[],concurrence:[],audio:'',points_positifs:[],blocages:[],actions_realisees:[],
    formation:[],prochain_passage:[],priorite:'',synthese:''};
  const gw=counting([{text:JSON.stringify(minimal)}]);
  const out=await run(gw,'brun');
  assert.match(out.text,/Retours vendeurs : Le vendeur signale une rupture\./);
  // Les rubriques absentes ne sont pas comblées, et le plan d'action reste explicitement vide.
  assert.doesNotMatch(out.text,/Concurrence :/);
  assert.doesNotMatch(out.text,/Synthèse :/);
  assert.match(out.text,/- \[Non renseigné par le FMT\]/,'aucun plan d’action inventé');
  // Le prompt de réparation n'autorise aucun ajout.
  assert.match(api.repairPrompt(visit('brun'),'{'),/N’ajoute aucune information\./);
  // L'interface conserve le rapport local et réactive le bouton dans tous les cas.
  assert.match(SLACK,/Le rapport local est conservé/,'le repli doit conserver le rapport local');
  assert.match(SLACK,/finally\{generating=false;if\(button\)\{button\.disabled=false/,'le bouton doit être réactivé quoi qu’il arrive');
  assert.match(SLACK,/if\(generating\)\{say\('Génération déjà en cours/,'un double tap ne doit pas lancer deux générations');
  assert.match(SLACK,/response&&response\.repaired\?' généré après une réparation automatique\.'/,'le retour doit distinguer une réparation');
  assert(!/console\.(log|warn|info)\([^)]*noteTerrain/.test(SLACK+MODULE),'aucune note terrain brute journalisée');
  console.log('PASS 6 · aucune invention, rapport local conservé, bouton réactivé, pas de double appel');
})();

/* ---------------------------------------------- 7. contrat réel du Worker, mode envoyé */
(async function workerContract(){
  const gw=counting([{text:JSON.stringify(doc('brun'))}]);
  await run(gw,'brun');
  assert.equal(gw.calls[0].mode,'visit_report','le client doit emprunter la route dédiée du Worker');
  assert.equal(gw.calls[0].context.outputFormat,'visit_report_json_v225');
  assert.match(gw.calls[0].message,/SCHÉMA JSON STRICT/);
  // Fixture au format exact de la réponse du Worker V232.
  const workerAnswer={text:JSON.stringify(doc('brun')),model:'modele-test',provider:'cloudflare-workers-ai',
    fallbackFrom:null,finishReason:'stop',truncated:false,mode:'visit_report'};
  const shaped=counting([workerAnswer]);
  const out=await run(shaped,'brun');
  assert.match(out.text,/^⚫ Résumé BRUN/);
  assert.equal(out.provider,'cloudflare-workers-ai','les métadonnées du Worker doivent survivre au rendu local');
  // Fixture au format du repli Groq, dont la réponse tronquée était la panne d'origine.
  const groqTruncated={text:truncatedAnswer('brun'),provider:'groq',fallbackFrom:'cloudflare-workers-ai',
    finishReason:'length',truncated:true,mode:'visit_report'};
  const recovered=counting([groqTruncated,{text:JSON.stringify(doc('brun')),finishReason:'stop',truncated:false}]);
  const fixed=await run(recovered,'brun');
  assert.equal(fixed.repaired,true);
  assert.equal(recovered.calls.length,2);
  // Le mode reste intact pour les autres usages IA.
  const other=counting([{text:'réponse libre'}]);
  const wrapped=api.wrapGateway(other);
  await wrapped({mode:'assistant',message:'question',context:{task:'assistant_chat'}});
  assert.equal(other.calls[0].mode,'assistant','les autres usages IA ne changent pas de route');
  console.log('PASS 7 · route visit_report, fixtures Worker et repli Groq tronqué');
})();
