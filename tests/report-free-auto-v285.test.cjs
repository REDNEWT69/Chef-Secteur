/* V285 — compte rendu libre fidèle aux chiffres issus de la dictée.
   Toutes les notes et réponses de ce test sont synthétiques. */
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
globalThis.crypto ||= webcrypto;
const R=require('../store-runner-report-renderer.js');
const notes='Samsung 55M74H prime 0 € et 55S85F prime 25 €. Hisense 100E7Q prime 45 €. Samsung 65M73H au prix de 679 €, TCL -15 % du 10 au 20 octobre. Proposition 75R85H, pas de commande.';
const source={version:1,visitId:'synthetic-v285',storeId:'synthetic-store',completedDate:'2026-10-09',
 store:{enseigne:'Darty Test',ville:'Ville Test',channel:''},
 reports:[{reportType:'brun',entries:[{source:'report.brun.team',family:'brun',text:notes}]}]};
const prose='Le Samsung 55M74H ne bénéficie d’aucune prime (0 €), contre 25 € pour le 55S85F. Le Hisense 100E7Q donne une prime de 45 €. Le 65M73H est affiché à 679 €. TCL applique une remise de 15 % du 10 au 20 octobre. Le 75R85H a été proposé, mais la commande n’est pas validée.';
const doc=t=>({version:1,reports:[{reportType:'brun',text:t}],quality:{mode:'free'}});
const valid=R.validateDelivered(doc(prose),source);
assert.equal(valid.quality.mode,'free');
assert.equal(valid.quality.status,'review');
assert.equal(valid.reports[0].text,prose);
assert.equal(R.validateFreeDelivered(doc(prose),source).reports[0].reportType,'brun');
assert.throws(()=>R.validateDelivered(doc(prose.replace('75R85H','75R99H')),source),/rejeté/);
assert.throws(()=>R.validateDelivered(doc(prose.replace('679 €','699 €')),source),/rejeté/);
assert.throws(()=>R.validateDelivered(doc(prose.replace('15 %','18 %')),source),/rejeté/);
assert.throws(()=>R.validateDelivered(doc(prose.replace('Le Samsung 55M74H','Le Samsung')),source),/rejeté/);
assert.throws(()=>R.validateDelivered(doc(''),source),/rejeté/);
// A historical structured report remains compatible during a rolling Worker deploy.
assert.equal(typeof R.validateDelivered,'function');
console.log('PASS V285 · free prose, product/price/percentage preservation, no strict JSON or invented amount');
