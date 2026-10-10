/* V288: fallback icons are strictly presentational, applied to both Groq preview
   and durable delivery. No model calls, edits to notes, references or pricing. */
const assert=require('node:assert/strict');
const R=require('../store-runner-report-renderer.js');
const source={version:1,visitId:'fake-visit',storeId:'fake-store',completedDate:'2026-10-10',
 store:{enseigne:'Carrefour',ville:'Vénissieux',channel:'retail'},
 reports:[{reportType:'brun',entries:[{source:'report.brun.team',family:'brun',
  text:'55M74H prime 0 €. 55S85F prime 25 €. Hisense 100E7Q prime 45 €. 65M73H à 679 €. 75R85H commande non validée.'}]}]};
const generated=[
 '**Compte rendu de visite terrain – Carrefour Vénissieux**',
 '**Date :** 10/10/2026',
 '**Famille :** BRUN',
 '',
 '**Contexte**',
 'Deux vendeurs rencontrés au rayon TV.',
 '',
 '**Primes**',
 '- Samsung 55M74H : 0 €.',
 '- Samsung 55S85F : 25 €.',
 '- Hisense 100E7Q : 45 €.',
 '',
 '**Merchandising**',
 'Samsung **65M73H** affiché à **679 €**. PLV manquante.',
 '',
 '**Concurrence**',
 'TCL propose une remise de 15 % sur Mini LED.',
 '',
 '**Proposition produit**',
 '75R85H proposé. Commande non validée, faute de place.',
 '',
 '**Formation**',
 'Formation OLED et Neo QLED souhaitée.',
 '',
 '**Points à suivre**',
 '- Vérifier les deux TV en réserve.',
 '',
 '**Remarque générale**',
 'Bon contact avec le magasin.'
].join('\n');
(async()=>{
 const original=JSON.stringify(source);
 const expected=R.decorateFreeform(generated,source,'brun');
 for(const text of ['⚫ Résumé BRUN – Carrefour Vénissieux','🏬 Contexte',
  '🏆 Primes','🏬 Merchandising','🆚 Concurrence','📺 Proposition produit',
  '🎓 Formation','🎯 Points à suivre','📝 Remarque générale']){
  assert(expected.includes(text),'missing visual marker: '+text);
 }
 for(const detail of ['55M74H : 0 €','55S85F : 25 €','100E7Q : 45 €',
  '65M73H affiché à 679 €','15 %','75R85H proposé','Commande non validée']){
  assert(expected.includes(detail),'source detail lost: '+detail);
 }
 assert.match(expected,/Date : 10\/10\/2026/);
 assert.match(expected,/Samsung 65M73H affiché à 679 €/);
 assert.doesNotMatch(expected,/\*\*/,'no Markdown bold markers in the displayed report');
 assert.equal(R.decorateFreeform(expected,source,'brun'),expected,'must not duplicate icons');
 const delivered={reportType:'brun',text:generated};
 assert.equal(R.render(delivered,source),expected,'durable reports use same visual formatting');
 assert.equal(delivered.text,generated,'durable Groq output remains untouched');
 assert.equal(JSON.stringify(source),original,'original field notes immutable');
 const already='⚫ Résumé BRUN – Carrefour Vénissieux\n\n🏬 Contexte magasin\n\nSamsung 55M74H : 0 €.';
 assert.equal(R.decorateFreeform(already,source,'brun'),already,'do not double-decorate');
 const groqAuchan=['⚫ Résumé BRUN – Auchan Saint Priest',
  '**Magasin** : Auchan Saint-Priest',
  '**Famille** : BRUN',
  '**Date** : 10/10/2026',
  '',
  '**🏬 Contexte**',
  '- Les vendeurs privilégient le rapport qualité-prix.',
  '',
  '**🏬 Merchandising**',
  '- Modèles **55U7025H**, **43U7025H** et **54Q6fAA**.',
  '- OLED **55S84** affiché à **729 €** ; prix final **779 €**.',
  '',
  '**🎯 Points à suivre**',
  '- Aucun suivi indiqué dans les notes.'
 ].join('\n');
 assert.equal(R.decorateFreeform(groqAuchan,source,'brun'),groqAuchan.replace(/\*\*/g,''),
  'Auchan freeform example: remove only bold delimiters, retain icons, bullets, prices and references');
 const noTitle='Samsung 55M74H : 0 €.\nContexte : vendeurs rapidement rencontrés.';
 assert.equal(R.decorateFreeform(noTitle,source,'brun'),
  '⚫ Résumé BRUN – Carrefour Vénissieux\n\n'+noTitle,
  'do not mistake inline facts for headings');
 const blanc=R.decorateFreeform('**Froid**\nRéfrigérateur exposé.\n\n**Formation**\nFormation prévue.',
  source,'blanc');
 assert.match(blanc,/^⚪ Résumé BLANC/);
 assert.match(blanc,/❄️ Froid/);
 assert.match(blanc,/🎓 Formation/);
 const cuisiniste=R.decorateFreeform('**SAV**\nPorte abîmée à remplacer.',source,'cuisiniste');
 assert.match(cuisiniste,/^🟠 Compte rendu CUISINISTE/);
 assert.match(cuisiniste,/🛠️ SAV/);

 // The opt-in '✨ Génération auto' button receives the decorated text, without
 // modifying the actual provider response, its audit, or triggering another call.
 globalThis.StoreRunnerReportRenderer=R;
 globalThis.aiConfig={gateway:'/api/ai'};
 globalThis.location={href:'https://store-runner.fr/'};
 globalThis.navigator={onLine:true};
 let calls=0;
 const responseText=generated;
 const fakeResponse={mode:'report_free_preview',reportType:'brun',text:responseText,
  audit:{missingReferences:[],unexpectedReferences:[]},provider:'groq',model:'openai/gpt-oss-120b'};
 globalThis.fetch=async (_url,opts)=>{
  calls++;const body=JSON.parse(opts.body);
  assert.equal(body.mode,'report_free_preview');
  assert.equal(body.reportType,'brun');
  return new Response(JSON.stringify(fakeResponse),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const frontend=require('../runner-report-ai-auto-v2771.js');
 const preview=await frontend.freePreview(source,'brun','test-signature');
 assert.equal(preview.text,expected,'preview and durable reports must share icons');
 assert.deepEqual(preview.audit,fakeResponse.audit);
 assert.equal(fakeResponse.text,generated,'raw model output unchanged');
 assert.equal(calls,1,'no extra Groq inference');
 console.log('PASS V288 · Groq reports get deterministic title/section icons, data unchanged');
})().catch(error=>{console.error(error);process.exitCode=1});
