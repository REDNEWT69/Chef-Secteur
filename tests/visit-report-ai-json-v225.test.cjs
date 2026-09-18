const assert=require('node:assert/strict');
const api=require('../visit-report-ai-json-v225.js');

(function testPromptIsStrictAndAttributed(){
  const visit={skeleton:'grands-magasins',family:'brun',store:{enseigne:'Boulanger',ville:'Saint-Étienne'},noteTerrain:'le vendeur dit mini led moins lumineux',photos:{total:0}};
  const prompt=api.buildPrompt(visit);
  assert.match(prompt,/UNIQUEMENT par un objet JSON valide/);
  assert.match(prompt,/Une opinion vendeur doit rester explicitement attribuée au vendeur/);
  assert.match(prompt,/N'invente jamais un fait/);
  assert.match(prompt,/"famille": "BRUN"/);
})();

(function testParseFencedJson(){
  const doc=api.parseStructured('```json\n{"famille":"BRUN","contexte":"Test"}\n```');
  assert.equal(doc.famille,'BRUN');
  assert.equal(doc.contexte,'Test');
})();

(function testBrunRenderingKeepsOpinionAndLocalPhotos(){
  const visit={family:'brun',store:{enseigne:'Boulanger',ville:'Saint-Étienne'},photos:{total:3,before:1,after:2,other:0}};
  const doc={
    famille:'BRUN',
    contexte:'Premier contact avec le responsable TV.',
    merchandising:'La gamme Samsung est visible en entrée de rayon.',
    retours_vendeurs:['Le vendeur juge la gamme Mini LED Samsung moins lumineuse que certaines offres concurrentes.'],
    retours_clients:[],
    concurrence:['TCL est régulièrement cité par le vendeur.'],
    audio:'',
    points_positifs:['Les grandes tailles Samsung sont appréciées.'],
    blocages:['Absence de barre de son Samsung dans la gamme recherchée.'],
    actions_realisees:['Présentation du fonctionnement Q-Symphony.'],
    formation:[],
    prochain_passage:['Revoir la disponibilité des barres de son.'],
    priorite:'Travailler la démonstration Mini LED.',
    synthese:'Samsung reste visible mais le discours Mini LED doit être consolidé.'
  };
  const out=api.renderStructured(doc,visit);
  assert.match(out,/^⚫ Résumé BRUN – Boulanger Saint-Étienne/);
  assert.match(out,/Le vendeur juge la gamme Mini LED Samsung moins lumineuse/);
  assert.doesNotMatch(out,/La gamme Mini LED Samsung est moins lumineuse que la concurrence/);
  assert.match(out,/### 🎯 Plan d’action \/ prochain passage/);
  assert.match(out,/\*\*Photos : 3 au total – 1 avant \/ 2 après\.\*\*/);
})();

(function testBlancRendering(){
  const visit={family:'blanc',store:{enseigne:'Darty',ville:'Lyon'},photos:{total:0}};
  const doc={famille:'BLANC',contexte:'Rayon électroménager accessible.',lavage:'Samsung présent sur le lavage.',froid:'',cuisson:'',entretien_sols:'',retours_vendeurs:[],retours_clients:[],concurrence:['LG présent à proximité.'],points_positifs:[],blocages:[],actions_realisees:[],formation:[],prochain_passage:[],priorite:'',synthese:'Présence Samsung à maintenir.'};
  const out=api.renderStructured(doc,visit);
  assert.match(out,/^⚪ Résumé BLANC – Darty Lyon/);
  assert.match(out,/Lavage : Samsung présent sur le lavage/);
  assert.match(out,/Concurrence : LG présent à proximité/);
})();

(async function testGatewayInterceptionAndSingleCall(){
  let calls=0,lastOptions=null;
  const original=async options=>{calls++;lastOptions=options;return{text:JSON.stringify({famille:'BRUN',contexte:'Contexte terrain',merchandising:'Visibilité correcte',retours_vendeurs:[],retours_clients:[],concurrence:[],audio:'',points_positifs:[],blocages:[],actions_realisees:[],formation:[],prochain_passage:['Suivre le rayon'],priorite:'',synthese:'Situation stable.'}),provider:'cloudflare-workers-ai'}};
  const wrapped=api.wrapGateway(original);
  const visit={skeleton:'grands-magasins',family:'brun',store:{enseigne:'Boulanger',ville:'Lyon'},photos:{total:0}};
  const response=await wrapped({mode:'assistant',message:'ancien prompt',context:{task:'visit_report',visit}});
  assert.equal(calls,1,'une génération doit rester un seul appel IA');
  assert.equal(lastOptions.context.task,'visit_report');
  assert.equal(lastOptions.context.outputFormat,'visit_report_json_v225');
  assert.match(lastOptions.message,/SCHÉMA JSON STRICT/);
  assert.match(response.text,/^⚫ Résumé BRUN – Boulanger Lyon/);
  assert.equal(response.outputFormat,'visit_report_json_v225');

  calls=0;
  await wrapped({mode:'assistant',message:'question normale',context:{task:'assistant_chat'}});
  assert.equal(calls,1,'les autres usages IA doivent passer sans interception');
})().catch(err=>{console.error(err);process.exitCode=1});

console.log('visit-report-ai-json-v225: ok');
