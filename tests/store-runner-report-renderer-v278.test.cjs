const assert=require('node:assert/strict');
const fs=require('node:fs');
const R=require('../store-runner-report-renderer.js');
const samples=require('./fixtures/visit-report-golden-v278.cjs');
function output(key){const {doc,source}=samples[key];return R.render(R.validate(doc,source).reports[0],source)}
function inOrder(value,needles){let last=-1;for(const needle of needles){const found=value.indexOf(needle);assert(found>last,'ordre/rubrique : '+needle);last=found}}
function one(quote,section='notes',reportType='brun',text=quote){
 const path='report.'+(reportType==='blanc'?'blanc':'brun')+'.team';
 const source={version:1,visitId:'test',storeId:'s',completedDate:'2026-10-07',store:{enseigne:'Test',ville:'Test',channel:reportType==='cuisiniste'?'cuisiniste':'retail'},reports:[{reportType,entries:[{source:path,family:reportType==='blanc'?'blanc':'brun',text:quote}]}]};
 const doc={version:1,reports:[{reportType,items:[{section,text,source:path,quote}]}]};return{source,doc};
}
const brun=output('brun');assert.match(brun,/^⚫ Résumé BRUN – Darty Bourgoin-Jallieu/);
inOrder(brun,['🏬 Contexte magasin','📺 TV / Présence Samsung','🏆 Challenge / Prime vendeur','🆚 Concurrence / Retour vendeur','🏷️ ODR / Offres Samsung','🎓 Formation','🛍️ Black Friday','✅ Points positifs','⚠️ Points à travailler','🎯 Plan d’action / prochain passage','📝 Synthèse']);
assert.equal((brun.match(/⸻/g)||[]).length,6);
for(const fact of ['77S92H','QNED87','144 Hz','1 € à 8 €','899 €','200 €','50 €'])assert(brun.includes(fact),fact);
assert.match(brun,/Le vendeur estime actuellement que LG reste mieux positionné/);
assert.doesNotMatch(brun,/Audio \/ Barres de son|Non renseigné|undefined/);
const blanc=output('blanc');assert.match(blanc,/^⚪ Résumé BLANC/);
inOrder(blanc,['🧺 Lavage','🍳 Cuisson','❄️ Froid','🧹 Aspiration','✅ Points positifs','⚠️ Points à travailler','🎯 Plan d’action / prochain passage','📝 Synthèse']);
for(const fact of ['3 modèles','1 four','749 €','Hisense','Haier','Rowenta','selon les vendeurs','D’après les retours vendeurs'])assert(blanc.includes(fact),fact);
assert.doesNotMatch(blanc,/Petit électroménager|Non renseigné/);
const partial=structuredClone(samples.blanc.doc);partial.reports[0].items=partial.reports[0].items.filter(i=>i.section==='cold');
const partialText=R.render(R.validate(partial,samples.blanc.source).reports[0],samples.blanc.source);
assert.match(partialText,/❄️ Froid/);assert.doesNotMatch(partialText,/Lavage|Cuisson|Aspiration|Plan d’action|Synthèse/);
const kitchen=output('cuisiniste');assert.match(kitchen,/^🟠 COMPTE RENDU CUISINISTE – Schmidt Ville-la-Grand/);
assert.equal((kitchen.match(/COMPTE RENDU CUISINISTE/g)||[]).length,1);
assert.match(kitchen,/Date : 07\/10\/2026/);assert.doesNotMatch(kitchen,/BRUN|BLANC/);
inOrder(kitchen,['🏬 Suivi magasin','❄️ Point produits / Showroom','🆚 Concurrence','🍳 Formation','📑 Contrat d’exposition','🎯 Plan d’action / prochain passage','📝 Synthèse']);
for(const fact of ['RS68A882','Bruno','Dual Cook','multiportes','BSH','pas fermé à l’idée','Aucun nouveau contrat','sous réserve'])assert(kitchen.includes(fact),fact);
assert.doesNotMatch(kitchen,/accord validé|collaboration acceptée|contrat accepté|contrat refusé/);
// Dirty dictation: corrections are allowed only when semantic words remain grounded.
{const f=one('vendeur trouve image tro sombre','notes','brun','Le vendeur trouve l’image trop sombre.');assert.equal(R.validate(f.doc,f.source).reports[0].items[0].text,'Le vendeur trouve l’image trop sombre.')}
{const f=one('Formation pr Bruno.','training','cuisiniste','Formation pour Bruno.');assert.doesNotThrow(()=>R.validate(f.doc,f.source))}
{const f=one('le vendeur di LG mieux placé.','competition','brun','Le vendeur dit LG mieux placé.');assert.doesNotThrow(()=>R.validate(f.doc,f.source))}
{const f=one('un américain Samsung présent','showroom','cuisiniste','Un réfrigérateur américain Samsung présent.');assert.doesNotThrow(()=>R.validate(f.doc,f.source));f.doc.reports[0].items[0].text='Un américain de Samsung était présent.';assert.throws(()=>R.validate(f.doc,f.source),/rejeté/)}
{const f=one('un combiné Samsung présent','notes','brun','Un réfrigérateur combiné Samsung présent.');assert.throws(()=>R.validate(f.doc,f.source),/rejeté/);f.source.reports[0].entries.push({source:'report.shared.context',family:'',text:'Rayon froid'});assert.doesNotThrow(()=>R.validate(f.doc,f.source))}
for(const [quote,wrong,section,type] of [
 ['Le vendeur estime LG mieux placé en techno/prix.','LG mieux placé en techno/prix.','competition','brun'],
 ['Lavante-séchante Samsung à 749 €','Lavante-séchante Samsung à 799 €','laundry','blanc'],
 ['Un réfrigérateur américain RS68A882 présent.','Un réfrigérateur américain RS68A883 présent.','showroom','cuisiniste'],
 ['Le magasin n’est pas fermé à l’idée.','Le magasin a accepté la collaboration.','context','cuisiniste'],
 ['Aucun contrat validé.','Le contrat est refusé.','contract','cuisiniste'],
 ['Samsung présent.','Samsung bénéficie d’une croissance exceptionnelle.','notes','brun'],
 ['Samsung moins représenté que LG.','LG moins représenté que Samsung.','competition','brun'],
 ['Bruno souhaite revoir Samsung.','Bruno a validé un contrat Samsung.','context','cuisiniste'],
 ['Formation à confirmer.','Formation confirmée.','training','brun'],
 ['Bruno présent le 07/10/2026.','Bruno présent le 08/10/2026.','context','cuisiniste'],
 ['Bruno présent.','Marc présent.','context','cuisiniste'],
 ['Samsung est le 3ᵉ choix.','Samsung est le 3 choix.','cold','blanc'],
 ['Samsung présent.','Samsung présent.\n# Contrat accepté','notes','brun'],
 ['Samsung présent.','Samsung présent. 🏆','notes','brun'],
 ['Samsung présent.','**Samsung présent.**','notes','brun'],
 ['Samsung présent.','* Samsung présent.','notes','brun'],
 ['Samsung présent.','Samsung présent. ⸻','notes','brun'],
 ['Le magasin n’est pas forcément fermé.','Le magasin n’est pas fermé.','context','cuisiniste'],
 ['Samsung présent si le contrat est validé.','Samsung présent le contrat est validé.','contract','cuisiniste'],
 ['Samsung est bien représenté, LG ne l’est pas.','Samsung n’est pas bien représenté, LG l’est.','competition','brun'],
 ['Samsung est moins cher que LG et pas moins fiable.','Samsung est pas moins cher que LG et moins fiable.','competition','brun'],
 ['Samsung peut être choisi si LG est absent.','Samsung si peut être choisi LG est absent.','competition','brun'],
 ['Samsung est possible, LG est confirmé.','Samsung est confirmé, LG est possible.','competition','brun'],
 ['Samsung, pas LG.','Samsung pas, LG.','competition','brun'],
 ['Samsung ne collabore avec LG.','Samsung collabore avec LG.','competition','brun'],
 ['Bruno a formé Léa.','Bruno a été formé par Léa.','training','cuisiniste'],
 ['Samsung a remplacé LG.','Samsung a été remplacé par LG.','competition','brun'],
 ['Bruno a été formé par Léa.','Bruno a formé Léa.','training','cuisiniste'],
 ['Formation prévue ou réalisée.','Formation prévue et réalisée.','training','brun'],
 ['Formation pour Bruno.','Formation par Bruno.','training','cuisiniste'],
 ['Samsung est présent avec LG.','Samsung est présent pour LG.','competition','brun']
]){const f=one(quote,section,type,wrong);assert.throws(()=>R.validate(f.doc,f.source),/rejeté/,wrong)}
{const f=one('Samsung présent dans le rayon TV.','contract','cuisiniste');assert.throws(()=>R.validate(f.doc,f.source),/rubrique/)}
for(const quote of ['Samsung présent dans le showroom.','Formation prévue.','Formation pas réalisée.']){const f=one(quote,'actionsDone');assert.throws(()=>R.validate(f.doc,f.source),/rubrique/)}
for(const quote of ['Revoir la gérante vendredi.','Relancer la gérante.','Recontacter le magasin.','Organiser une formation.']){const f=one(quote,'actions','cuisiniste');assert.doesNotThrow(()=>R.validate(f.doc,f.source));assert.equal(R.memory(R.validate(f.doc,f.source),f.source).items[0].status,'planned')}
for(const [quote,status] of [['Formation réalisée.','done'],['Formation prévue.','planned'],['Formation annulée.','cancelled'],['Formation pas réalisée.','recorded']]){const f=one(quote,'training');assert.equal(R.memory(R.validate(f.doc,f.source),f.source).items[0].status,status)}
{const f=one('Samsung présent.');f.doc.reports.push(f.doc.reports[0]);assert.throws(()=>R.validate(f.doc,f.source),/familles/);f.doc.reports=[{reportType:'blanc',items:[]}];assert.throws(()=>R.validate(f.doc,f.source),/inconnu/)}
for(const raw of ['', '{}', '{"version":1,"reports":['])assert.throws(()=>R.validate(raw,samples.brun.source),/rejeté/);
{const f=one('Samsung présent.');f.doc.reports[0].items[0].quote='Samsung absent.';assert.throws(()=>R.validate(f.doc,f.source),/citation/)}
for(const [full,quote] of [['Aucun contrat validé.','contrat validé.'],['Aucun\ncontrat validé.','contrat validé.'],['Selon le vendeur, LG est mieux placé.','LG est mieux placé.'],['D’après le vendeur,\nLG est mieux placé.','LG est mieux placé.'],['Le magasin n’est pas fermé à l’idée de retravailler.','fermé à l’idée de retravailler.']]){const f=one(full);Object.assign(f.doc.reports[0].items[0],{quote,text:quote});assert.throws(()=>R.validate(f.doc,f.source),/contexte/)}
// Everyday field dictation: no punctuation and informal word order are normal inputs.
function voiceNote(raw,quote,rewritten,section='showroom'){
 const f=one(raw,section,'cuisiniste',rewritten);
 f.doc.reports[0].items[0].quote=quote;
 return f;
}
{
 const f=voiceNote(
  'premier passage magasin rayon Samsung un four présent en showroom formation produit prévue ensuite',
  'Samsung un four présent en showroom',
  'Un four Samsung est présent en showroom.'
 );
 assert.doesNotThrow(()=>R.validate(f.doc,f.source),'a spoken note may have no punctuation or strict word order');
}
{
 const f=voiceNote(
  'on a vu avec équipe Samsung trois fours dans le showroom et du coup une formation prévue',
  'Samsung trois fours dans le showroom',
  'Trois fours Samsung sont dans le showroom.'
 );
 assert.doesNotThrow(()=>R.validate(f.doc,f.source),'professional rewrite may change word order');
}
for(const [raw,quote,spoken] of [
 ['aucun contrat validé', 'contrat validé', 'Le contrat est validé.'],
 ['selon le vendeur LG est mieux placé', 'LG est mieux placé', 'LG est mieux placé.'],
 ['le magasin n est pas fermé à idée de travailler avec Samsung', 'fermé à idée de travailler avec Samsung', 'Le magasin est fermé à idée de travailler avec Samsung.']
]){
 const f=voiceNote(raw,quote,spoken,'notes');
 assert.throws(()=>R.validate(f.doc,f.source),/citation privée de son contexte/,'never drop adjacent business reservations in dictated notes');
}
{
 const f=voiceNote('Samsung moins représenté que LG', 'Samsung moins représenté que LG', 'LG est moins représenté que Samsung.','competition');
 assert.throws(()=>R.validate(f.doc,f.source),/rejeté/,'paraphrase cannot invert competitor comparisons');
}
{
 const f=voiceNote('Un réfrigérateur Samsung présent en showroom','Un réfrigérateur Samsung présent en showroom','Un américain Samsung est présent en showroom.','showroom');
 assert.throws(()=>R.validate(f.doc,f.source),/rejeté/,'paraphrase cannot drop the explicit refrigerator product category');
}
{
 const f=voiceNote('Samsung un four dans le showroom','Samsung un four dans le showroom','Samsung expose quatre fours dans le showroom.','showroom');
 assert.throws(()=>R.validate(f.doc,f.source),/rejeté/,'paraphrase must not invent a number');
}

const frozen=JSON.stringify(samples.cuisiniste.source),fallback=R.fallback(samples.cuisiniste.source,'cuisiniste');assert.match(fallback,/📝 Notes terrain/);assert.match(fallback,/RS68A882/);assert.equal(JSON.stringify(samples.cuisiniste.source),frozen);
const mem=R.memory(R.validate(samples.cuisiniste.doc,samples.cuisiniste.source),{...samples.cuisiniste.source,sourceSignature:'sig'});assert.equal(mem.sourceSignature,'sig');assert(mem.items.some(i=>i.kind==='product'&&i.text==='RS68A882'));for(const i of mem.items)assert(samples.cuisiniste.source.reports[0].entries[0].text.includes(i.text));
const prompt=R.buildPrompt(samples.cuisiniste.source);assert.match(prompt,/visit-report-v278-2/);assert.match(prompt,/Cite une phrase entière/);assert.match(prompt,/aucun contrat validé/);assert.doesNotMatch(prompt,/Darty Bourgoin/);
const noteSource=fs.readFileSync(require.resolve('../note-proofreader-v221.js'),'utf8');assert.match(noteSource,/input\.closest\('#srVisitDialog'\)/);assert.doesNotMatch(noteSource,/new root\.MutationObserver/);
(async()=>{const a=await R.sourceSignature({b:2,a:1}),b=await R.sourceSignature({a:1,b:2});assert.equal(a,b);assert.match(a,/^sha256-[a-f0-9]{64}$/);assert.notEqual(a,await R.sourceSignature({a:1,b:3}));console.log('PASS V278 golden BRUN/BLANC/cuisiniste, immutable quotes, facts, attribution, commercial nuance, fallback and SHA-256');})().catch(e=>{console.error(e);process.exitCode=1});
