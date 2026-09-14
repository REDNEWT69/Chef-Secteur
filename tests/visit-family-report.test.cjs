const assert=require('node:assert/strict');
const M=require('../store-runner-visit-model.js');

// Une visite Store Runner était un tas unique : ni les 36 lignes 6P, ni les anomalies 360°
// ne portaient d'indication de famille, et les cinq blocs de texte du compte rendu
// n'existaient pas. Impossible d'en tirer deux comptes rendus séparés BLANC / BRUN.
// Ce test fige le contrat, et surtout la règle qui le rend applicable en production :
// aucune de ces clés n'est obligatoire.

const base={schemaVersion:5,profile:{baseName:'Lyon'},settings:{days:['Lundi']},
  stores:[{id:'x',enseigne:'Darty',ville:'Lyon'}],notes:{},visits:{},plan:{Lundi:[]},
  appointments:[],calendarEvents:[]};

// --- 1. Une visite d'avant ce ticket passe validate() SANS être modifiée --------------
// C'est la garantie qui compte : l'utilisateur a des données réelles en production.
(function ancienne(){
  const s=M.clone(base),id=M.start(s,'x'),v=M.getVisit(s,id);
  // On ramène la visite au format d'avant : ni activeFamily, ni report, ni family.
  delete v.activeFamily;delete v.report;
  for(const rows of Object.values(v.sixP))for(const row of rows)delete row.family;
  v.arrival.anomalies.push({id:'a-legacy',text:'Démo éteinte',actionId:null});
  const avant=JSON.stringify(s);
  M.validate(s);
  const apres=JSON.stringify(s);
  assert.equal(apres,avant,'validate() ne doit rien réécrire sur une visite d’avant ce ticket');
  // Et elle reste lisible : les lecteurs reconstruisent à la volée.
  assert.deepEqual(Object.keys(M.reportOf(v)),['shared','blanc','brun'],'reportOf reconstruit le bloc absent');
  assert.equal(JSON.stringify(s),avant,'reportOf ne doit pas muter la visite lue');
  console.error('  Point 1 — visite ancienne, empreinte identique avant/après validate() : '+(apres===avant));
  console.error('            longueur JSON : '+avant.length+' caractères, inchangée');
})();

// --- 2. start() produit le contrat complet -------------------------------------------
(function neuve(){
  const s=M.clone(base),id=M.start(s,'x'),v=M.getVisit(s,id);
  assert.equal(v.activeFamily,'brun','la famille par défaut à la création est BRUN');
  assert.deepEqual(Object.keys(v.report).sort(),['blanc','brun','shared']);
  assert.deepEqual(Object.keys(v.report.shared),Object.keys(M.REPORT_SHARED));
  assert.deepEqual(Object.keys(v.report.blanc),Object.keys(M.REPORT_FIELDS));
  assert.deepEqual(Object.keys(v.report.brun),Object.keys(M.REPORT_FIELDS));
  assert.equal(Object.keys(v.report.shared).length+Object.keys(v.report.blanc).length,1+5,'six clés attendues par famille, contexte compris');
  for(const rows of Object.values(v.sixP))for(const row of rows)assert.equal(row.family,'','chaque ligne 6P naît non étiquetée');
  assert.deepEqual(M.FAMILIES,['blanc','brun']);
  assert.deepEqual(M.FAMILY_VALUES,['','blanc','brun','both']);
  assert.deepEqual(Object.keys(M.FAMILY_LABELS),['blanc','brun']);
})();

// --- 3 & 4. Étiquetage automatique, et ce qu'il ne touche pas ------------------------
(function etiquetage(){
  const s=M.clone(base),id=M.start(s,'x');
  M.edit6P(s,id,'prix',0,'comment','Relevé fait');            // famille active : brun
  assert.equal(M.getVisit(s,id).sixP.prix[0].family,'brun');
  M.editVisit(s,id,'activeFamily',null,'blanc');
  M.edit6P(s,id,'prix',1,'comment','texte');
  assert.equal(M.getVisit(s,id).sixP.prix[1].family,'blanc','une ligne vierge prend la famille active');
  assert.equal(M.getVisit(s,id).sixP.prix[0].family,'brun','une ligne déjà étiquetée n’est jamais réécrite');
  M.edit6P(s,id,'prix',2,'comment','');
  assert.equal(M.getVisit(s,id).sixP.prix[2].family,'','une valeur vide n’étiquette rien');
  M.edit6P(s,id,'prix',3,'owner','Alice');
  assert.equal(M.getVisit(s,id).sixP.prix[3].family,'','seuls status, comment et action étiquettent');
  M.edit6P(s,id,'prix',3,'status','ok');
  assert.equal(M.getVisit(s,id).sixP.prix[3].family,'blanc','le statut étiquette aussi');
})();

// --- 5. Une anomalie naît dans la famille active -------------------------------------
(function anomalies(){
  const s=M.clone(base),id=M.start(s,'x');
  const brun=M.addAnomaly(s,id);
  assert.equal(M.getVisit(s,id).arrival.anomalies.find(a=>a.id===brun).family,'brun');
  M.editVisit(s,id,'activeFamily',null,'blanc');
  const blanc=M.addAnomaly(s,id);
  assert.equal(M.getVisit(s,id).arrival.anomalies.find(a=>a.id===blanc).family,'blanc');
  M.setAnomalyFamily(s,id,blanc,'both');
  assert.equal(M.getVisit(s,id).arrival.anomalies.find(a=>a.id===blanc).family,'both');
  assert.throws(()=>M.setAnomalyFamily(s,id,blanc,'violet'),/Famille invalide/);
  assert.throws(()=>M.editVisit(s,id,'activeFamily',null,'both'),/Famille invalide/,'both ne se choisit pas comme famille de saisie');
})();

// --- 6. L'étape Compte rendu porte la borne à 5 --------------------------------------
(function etapes(){
  const s=M.clone(base),id=M.start(s,'x');
  M.editVisit(s,id,'step',null,5);
  assert.equal(M.getVisit(s,id).step,5);
  assert.throws(()=>M.editVisit(s,id,'step',null,6),/Champ visite inconnu/);
  M.validate(s);
  const hors=M.clone(s);hors.businessV2.visits[0].step=6;
  assert.throws(()=>M.validate(hors),/État visite invalide/);
})();

// --- 7, 8, 9. editReport : portées, clés, visite terminée ----------------------------
(function compteRendu(){
  const s=M.clone(base),id=M.start(s,'x');
  M.editReport(s,id,'shared','context','Magasin en travaux');
  M.editReport(s,id,'brun','training','Formation barres de son');
  M.editReport(s,id,'blanc','team','Vu Karim, chef de rayon');
  const v=M.getVisit(s,id);
  assert.equal(v.report.shared.context,'Magasin en travaux');
  assert.equal(v.report.brun.training,'Formation barres de son');
  assert.equal(v.report.blanc.team,'Vu Karim, chef de rayon');
  assert.equal(v.report.brun.team,'','les deux familles restent étanches');
  assert.throws(()=>M.editReport(s,id,'blanc','inconnu','z'),/Champ compte rendu inconnu/);
  assert.throws(()=>M.editReport(s,id,'vert','team','z'),/Champ compte rendu inconnu/);
  assert.throws(()=>M.editReport(s,id,'shared','team','z'),/Champ compte rendu inconnu/,'un champ de famille n’est pas un champ partagé');
  assert.throws(()=>M.edit6P(s,id,'prix',0,'family','violet'),/Famille invalide/);
  M.validate(s);
  // 9. Une visite terminée refuse le compte rendu, comme le reste.
  M.editVisit(s,id,'conclusion',null,'Priorités convenues');
  M.complete(s,id,'2026-09-14');
  assert.throws(()=>M.editReport(s,id,'brun','actions','trop tard'),/terminée/);
  assert.throws(()=>M.setAnomalyFamily(s,id,'peu-importe','blanc'),/terminée/);
})();

// --- Le compte rendu n'est pas obligatoire pour terminer -----------------------------
(function cloture(){
  const s=M.clone(base),id=M.start(s,'x');
  M.editVisit(s,id,'conclusion',null,'Rien à signaler');
  M.complete(s,id,'2026-09-14');                 // aucun bloc de compte rendu rempli
  assert.equal(M.getVisit(s,id).status,'completed','complete() ne réclame pas le compte rendu');
})();

// --- validate() reste strict sur ce qui est présent ----------------------------------
(function validationOptionnelle(){
  const s=M.clone(base),id=M.start(s,'x');
  for(const casse of [
    v=>{v.activeFamily='violet'},
    v=>{v.sixP.prix[0].family='violet'},
    v=>{v.arrival.anomalies.push({id:'a1',text:'t',actionId:null,family:'violet'})},
    v=>{v.report.vert={team:''}},
    v=>{v.report.blanc.inconnu=''},
    v=>{v.report.brun.team=42}
  ]){const bad=M.clone(s);casse(bad.businessV2.visits[0]);assert.throws(()=>M.validate(bad),/invalide|inconnu/)}
  // …et tolérant sur ce qui est absent.
  for(const retire of [v=>{delete v.activeFamily},v=>{delete v.report},v=>{delete v.sixP.prix[0].family}]){
    const ok=M.clone(s);retire(ok.businessV2.visits[0]);M.validate(ok);
  }
})();

console.log('PASS: familles BLANC/BRUN sur les 6P et les anomalies, cinq blocs de compte rendu par famille, étiquetage automatique, et aucune clé rendue obligatoire pour les visites déjà enregistrées.');
