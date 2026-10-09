const assert = require('node:assert/strict');
const M = require('../store-runner-visit-model.js');

function make(enseigne='Darty',channel='grands-magasins') {
  const state={schemaVersion:5,stores:[{id:'store-v281',enseigne,ville:'Ville test',channel,products:['brun','blanc']}],visits:{},notes:{}};
  const id=M.start(state,'store-v281');
  M.editReport(state,id,'brun','team','Dictée BRUN à conserver sans modification.');
  M.editReport(state,id,'blanc','team','Dictée BLANC à conserver sans modification.');
  M.editVisit(state,id,'conclusion',null,'Visite réalisée');
  M.complete(state,id,'2026-10-09');
  return {state,id,v:M.getVisit(state,id)};
}
{
 const {state,id,v}=make();
 const before=M.clone(v.report),signature=M.reportSourceSignature(v),job=M.clone(v.reportJob);
 assert.equal(M.effectiveTerrainNote(v,'brun'),before.brun.team);
 assert.equal(M.effectiveTerrainNote(v,'blanc'),before.blanc.team);
 const result=M.editProfessionalReport(state,id,'brun','⚫ Résumé BRUN – Darty\\nCompte rendu révisé sur ChatGPT.\\nProchain passage vendredi.');
 assert.equal(result.manual,true);
 assert.equal(M.effectiveTerrainNote(v,'brun'),'⚫ Résumé BRUN – Darty\\nCompte rendu révisé sur ChatGPT.\\nProchain passage vendredi.');
 assert.equal(M.effectiveTerrainNote(v,'blanc'),before.blanc.team,'BRUN must not change BLANC');
 assert.deepEqual(v.report,before,'Original dictation stays immutable');
 assert.equal(M.reportSourceSignature(v),signature,'Report job source signature does not change');
 assert.equal(v.reportJob.obsolete,true,'Previous generation cannot overwrite the edited final');
 assert.equal(M.reportJobGuard(v,job),false);
 const saved=M.clone(state);M.validate(saved);
 assert.equal(M.effectiveTerrainNote(M.getVisit(saved,id),'brun'),result.text,'Final survives state export/import');
 M.editProfessionalReport(state,id,'blanc','⚪ Résumé BLANC – Darty\\nLa zone lavage est à suivre.');
 assert.equal(M.effectiveTerrainNote(v,'blanc'),'⚪ Résumé BLANC – Darty\\nLa zone lavage est à suivre.');
 assert.equal(M.effectiveTerrainNote(v,'brun'),result.text);
}
{
 const {state,id,v}=make();
 const expected={generation:v.reportJob.generation,completedDate:v.completedDate,sourceSignature:''};
 const report={brun:'Rapport automatique BRUN reformulé.',blanc:'Rapport automatique BLANC reformulé.'};
 const applied=M.applyProfessionalReport(state,id,expected,{version:1,reports:[],quality:{status:'complete'}},report,{items:[]});
 assert.equal(applied,true);
 assert.equal(M.effectiveTerrainNote(v,'brun'),report.brun);
 assert.equal(M.effectiveTerrainNote(v,'blanc'),report.blanc);
 assert.equal(M.reportOf(v).brun.team,'Dictée BRUN à conserver sans modification.');
 assert.equal(M.reportOf(v).blanc.team,'Dictée BLANC à conserver sans modification.');
 M.editProfessionalReport(state,id,'brun','Rapport BRUN corrigé dans Sortie magasin après Gemini.');
 assert.equal(M.effectiveTerrainNote(v,'brun'),'Rapport BRUN corrigé dans Sortie magasin après Gemini.');
 assert.equal(M.effectiveTerrainNote(v,'blanc'),report.blanc);
 assert.equal(M.applyProfessionalReport(state,id,expected,{version:1},report,{items:[]}),false,'Stale IA reply cannot replace a manually saved report');
 M.validate(state);
}
{
 const {state,id,v}=make();
 v.reportJob.status='failed';
 assert.equal(M.effectiveTerrainNote(v,'brun'),'Dictée BRUN à conserver sans modification.','Failed AI means no final report; fallback to dictated notes');
 M.editProfessionalReport(state,id,'brun','Texte final relu.');
 assert.equal(M.effectiveTerrainNote(v,'brun'),'Texte final relu.');
 v.status='draft';
 assert.equal(M.effectiveTerrainNote(v,'brun'),'Dictée BRUN à conserver sans modification.','Reopened visit exposes the original editable dictation');
 v.status='completed';
 assert.equal(M.effectiveTerrainNote(v,'brun'),'Texte final relu.');
}
{
 const {state,id,v}=make('Schmidt','cuisiniste');
 assert.equal(M.effectiveTerrainNote(v,'cuisiniste'),'');
 M.editProfessionalReport(state,id,'cuisiniste','Compte rendu SCHMIDT retravaillé dans Sortie magasin.');
 assert.equal(M.effectiveTerrainNote(v,'cuisiniste'),'Compte rendu SCHMIDT retravaillé dans Sortie magasin.');
 assert.equal(M.reportOf(v).brun.team,'Dictée BRUN à conserver sans modification.');
 M.validate(state);
}
console.log('PASS V281: Sortie magasin final authoritative in visit BRUN/BLANC/cuisiniste, signatures/raw preserved, save/reopen/stale-result guards');
