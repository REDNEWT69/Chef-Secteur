const assert=require('node:assert/strict');
const M=require('../store-runner-visit-model.js');

function make(enseigne='Darty',channel='grands-magasins'){
 const state={schemaVersion:5,stores:[{id:'v281',enseigne,ville:'Ville test',channel,products:['brun','blanc']}],visits:{},notes:{}};
 const id=M.start(state,'v281');
 M.editReport(state,id,'brun','team','Ancienne dictée BRUN.');
 M.editReport(state,id,'blanc','team','Ancienne dictée BLANC.');
 M.editVisit(state,id,'conclusion',null,'Visite réalisée');
 M.complete(state,id,'2026-10-09');
 return{state,id,visit:M.getVisit(state,id)};
}
{
 const {state,id,visit}=make();
 const oldJob=M.clone(visit.reportJob),oldSource=M.reportSourceSignature(visit);
 const newBrun='⚫ Résumé BRUN – Darty Ville test\nCompte rendu corrigé sur ChatGPT.\nFormation prévue vendredi.';
 const saved=M.editProfessionalReport(state,id,'brun',newBrun);
 assert.equal(saved.text,newBrun);
 assert.equal(M.reportOf(visit).brun.team,newBrun,'the REAL stored terrain field is overwritten with final report');
 assert.equal(M.effectiveTerrainNote(visit,'brun'),newBrun);
 assert.equal(M.professionalReportOf(visit,'brun').text,newBrun);
 assert.equal(M.reportOf(visit).blanc.team,'Ancienne dictée BLANC.','BRUN cannot touch BLANC');
 assert.notEqual(M.reportSourceSignature(visit),oldSource,'source signature must reflect the newly saved terrain text');
 assert.equal(visit.reportJob.obsolete,true,'the old IA job cannot overwrite ChatGPT report');
 assert.equal(M.reportJobGuard(visit,oldJob),false);
 assert.equal(visit.reportSourceHistory.length,1,'accepted source captured before replacing');
 const original=visit.reportSourceHistory[0].source.reports.find(x=>x.reportType==='brun').entries.find(x=>x.source==='report.brun.team');
 assert.equal(original.text,'Ancienne dictée BRUN.');
 const reloaded=M.clone(state);M.validate(reloaded);
 assert.equal(M.reportOf(M.getVisit(reloaded,id)).brun.team,newBrun,'survives app reload and backups');
 const newBlanc='⚪ Résumé BLANC – Darty Ville test\nLa zone cuisson a été contrôlée.';
 M.editProfessionalReport(state,id,'blanc',newBlanc);
 assert.equal(M.reportOf(visit).blanc.team,newBlanc);
 assert.equal(M.reportOf(visit).brun.team,newBrun);
 M.validate(state);
}
{
 const {state,id,visit}=make();
 const expected={generation:visit.reportJob.generation,completedDate:visit.completedDate,sourceSignature:''};
 const generated={brun:'BRUN IA non encore corrigé.',blanc:'BLANC IA non encore corrigé.'};
 assert.equal(M.applyProfessionalReport(state,id,expected,{version:1,reports:[],quality:{status:'complete'}},generated,{items:[]}),true);
 assert.equal(M.reportOf(visit).brun.team,'Ancienne dictée BRUN.','IA alone does not overwrite terrain text until manually saved');
 const manual='Rapport ChatGPT prioritaire sur génération IA.';
 M.editProfessionalReport(state,id,'brun',manual);
 assert.equal(M.reportOf(visit).brun.team,manual);
 assert.equal(M.applyProfessionalReport(state,id,expected,{version:1},generated,{items:[]}),false,'old asynchronous job cannot overwrite final');
 M.validate(state);
}
{
 const {state,id,visit}=make('Schmidt','cuisiniste');
 M.editProfessionalReport(state,id,'cuisiniste','Compte rendu Schmidt corrigé et collé dans Sortie magasin.');
 assert.equal(M.reportOf(visit).shared.context,'Compte rendu Schmidt corrigé et collé dans Sortie magasin.');
 assert.equal(M.effectiveTerrainNote(visit,'cuisiniste'),M.reportOf(visit).shared.context);
 assert.equal(M.reportOf(visit).brun.team,'');
 assert.equal(M.reportOf(visit).blanc.team,'');
 M.validate(state);
}
console.log('PASS V281: collage Sortie magasin stocké réellement dans Note terrain BRUN/BLANC, relu après sauvegarde, source précédente protégée, aucune écriture IA tardive, cuisiniste');
