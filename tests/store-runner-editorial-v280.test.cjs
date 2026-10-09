/* V280 editorial freedom: synthetic store visit notes, no provider charge. */
const assert=require('node:assert/strict');
const R=require('../store-runner-report-renderer.js');
const source={
 version:1,visitId:'synthetic-editorial-visit',storeId:'fictional',
 completedDate:'2026-10-09',
 store:{enseigne:'Boulanger',ville:'Saint-Étienne Villars',channel:'retail'},
 reports:[
  {reportType:'blanc',entries:[
   {source:'report.blanc.context',family:'blanc',text:'beaucoup de vendeur de boulanger Steel ont suivi leur directeur a boulanger Villard'},
   {source:'report.blanc.cooking',family:'blanc',text:'massification sur le four en castrape Samsung NV7B45 bon plan a 649 € et aucun four samsung dans le mur'},
   {source:'report.blanc.vacuum',family:'blanc',text:'massification aspirateurs laveurs rowenta placée vers entrée du rayon cuisson'}
  ]},
  {reportType:'brun',entries:[
   {source:'report.brun.team',family:'brun',text:'Premier contact avec Enzo directeur adjoint'},
   {source:'report.brun.tv',family:'brun',text:'vendeur TCL propose Samsung car il apprécie SmartThings et la grande TV 85U7005H visible entrée du magasin'},
   {source:'report.brun.audio',family:'brun',text:'le vendeur trouve dommage pas de Q pour la synchro TV Samsung les clients commandent sur Amazon la combo TV barre de son pas de Samsung 510 magasin'}
  ]}
 ]
};
const report={
 version:1,reports:[
  {reportType:'blanc',items:[
   {section:'context',source:'report.blanc.context',quote:'beaucoup de vendeur de boulanger Steel',
    text:'Plusieurs vendeurs ont suivi leur directeur vers le magasin Boulanger Saint-Étienne Villars.'},
   {section:'merchandising',source:'report.blanc.cooking',quote:'massification sur le four en castrape Samsung NV7B45',
    text:'Le four encastrable Samsung NV7B45 bénéficie d’une massification avec un prix promotionnel de 649 €.'},
   {section:'cooking',source:'report.blanc.cooking',quote:'aucun four samsung dans le mur',
    text:'Aucun four Samsung n’est exposé dans le mur de fours.'},
   {section:'merchandising',source:'report.blanc.vacuum',quote:'massification aspirateurs laveurs rowenta placée vers entrée du rayon cuisson',
    text:'Les aspirateurs laveurs Rowenta font l’objet d’une massification à l’entrée du rayon cuisson.'}
  ]},
  {reportType:'brun',items:[
   {section:'context',source:'report.brun.team',quote:'Premier contact avec Enzo directeur adjoint',
    text:'Premier contact établi avec Enzo, directeur adjoint du magasin.'},
   {section:'tv',source:'report.brun.tv',quote:'vendeur TCL propose Samsung car il apprécie SmartThings',
    text:'Le vendeur orienté TCL propose aussi Samsung, notamment pour les fonctionnalités SmartThings.'},
   {section:'audio',source:'report.brun.audio',quote:'pas de Q pour la synchro TV Samsung',
    text:'Le vendeur regrette l’absence de barres de son Samsung de série Q permettant la synchronisation avec les téléviseurs de la marque.'},
   {section:'audio',source:'report.brun.audio',quote:'les clients commandent sur Amazon la combo TV barre de son',
    text:'Selon le vendeur, des clients commandent sur Amazon pour associer leur téléviseur Samsung à une barre de son.'},
   {section:'audio',source:'report.brun.audio',quote:'pas de Samsung 510 magasin',
    text:'Aucune barre de son Samsung 510 n’a été repérée en magasin.'}
  ]}
 ]
};
const accepted=R.validateEditorial(report,source);
assert.equal(accepted.quality.status,'complete');
assert.equal(accepted.quality.acceptedItems,9);
assert.equal(accepted.quality.sourceOnlyItems,0);
assert.equal(accepted.quality.omittedItems,0);
assert.equal(accepted.quality.mode,'editorial');
assert.equal(accepted.reports[0].items[3].section,'merchandising','semantic classification must not be dictated by Rowenta keyword');
assert.equal(accepted.reports[1].items[2].section,'audio','audio recognized without exact keyword matching');
assert.equal(accepted.reports[0].items[0].quote,'beaucoup de vendeur de boulanger Steel','raw source kept for audit');
assert(!R.render(accepted.reports[0],source).includes('Notes terrain'),'no raw transcript repeated in a clean report');
assert(!R.render(accepted.reports[1],source).includes('Relecture nécessaire'));
assert.deepEqual(R.validateDelivered(accepted,source).reports,accepted.reports,'browser confirms editorial text without strict lexical grading');
assert.match(R.buildPrompt(source),/Ne classe pas selon des mots-clés/);
assert.match(R.buildPrompt(source),/BLANC signifie électroménager/);
assert.match(R.buildPrompt(source),/visit-report-v280-editorial-autonomy/);

// A bad provider quote is no longer a reason to discard a well written item.
// Worker repairs provenance using the actual immutable source entry.
const wrongQuote=structuredClone(report);
wrongQuote.reports[0].items[1].quote='this is not the actual quote';
const repaired=R.validateEditorial(wrongQuote,source);
assert.equal(repaired.quality.status,'complete');
assert.equal(repaired.reports[0].items[1].quote,source.reports[0].entries[1].text);
assert.doesNotThrow(()=>R.validateDelivered(repaired,source));

// Keep the few hard facts: no invented amounts or product references.
const wrongPrice=structuredClone(report);
wrongPrice.reports[0].items[1].text='Le four encastrable Samsung NV7B45 est en promotion à 749 €.';
const partial=R.validateEditorial(wrongPrice,source);
assert.equal(partial.quality.status,'partial');
assert.equal(partial.quality.omittedItems,1);
assert.equal(partial.quality.sourceOnlyItems,0);
assert(!R.render(partial.reports[0],source).includes('749 €'));
assert(!R.render(partial.reports[0],source).includes('massification sur le four en castrape'));
assert.match(R.render(partial.reports[0],source),/Les notes complètes restent dans la fiche visite/);
assert.throws(()=>R.validateDelivered({...accepted,reports:wrongPrice.reports},source),/rejeté/,'phone independently blocks newly invented price');
const fabricated=structuredClone(report);
fabricated.reports[1].items[4].text='La barre de son Samsung 511 est absente.';
assert.equal(R.validateEditorial(fabricated,source).quality.omittedItems,1,'protect product references');
const fakeSource=structuredClone(report);
fakeSource.reports[1].items[0].source='report.brun.nonexistent';
assert.equal(R.validateEditorial(fakeSource,source).quality.omittedItems,1);
const formatted=structuredClone(report);
formatted.reports[1].items[0].text='<script>danger</script>';
assert.equal(R.validateEditorial(formatted,source).quality.omittedItems,1);
assert.equal(R.validateEditorial(report,source).quality.acceptedItems,9,'inputs untouched after error paths');

// No usable prose means an explicit error, not a 'successful' raw transcript.
// The original dictation remains attached to the visit outside this module.
const raw=structuredClone(report);
for(const r of raw.reports)r.items=[];
assert.throws(()=>R.validateEditorial(raw,source),/rapport vide/);

console.log('PASS V280 autonomous prose, semantic BLANC/BRUN sections, source provenance, figures, browser verification and no duplicates');
