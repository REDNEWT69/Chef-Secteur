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
 assert.equal(M.reportOf(visit).brun.team,'Ancienne dictée BRUN.','typing has not yet replaced the terrain note');
 M.editProfessionalReport(state,id,'brun',newBrun,true);

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
 M.editProfessionalReport(state,id,'blanc',newBlanc,true);
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
 M.editProfessionalReport(state,id,'brun',manual,true);
 assert.equal(M.reportOf(visit).brun.team,manual);
 assert.equal(M.applyProfessionalReport(state,id,expected,{version:1},generated,{items:[]}),false,'old asynchronous job cannot overwrite final');
 M.validate(state);
}
{
 const {state,id,visit}=make('Schmidt','cuisiniste');
 M.editProfessionalReport(state,id,'cuisiniste','Compte rendu Schmidt corrigé et collé dans Sortie magasin.',true);
 assert.equal(M.reportOf(visit).shared.context,'Compte rendu Schmidt corrigé et collé dans Sortie magasin.');
 assert.equal(M.effectiveTerrainNote(visit,'cuisiniste'),M.reportOf(visit).shared.context);
 assert.equal(M.reportOf(visit).brun.team,'');
 assert.equal(M.reportOf(visit).blanc.team,'');
 M.validate(state);
}

{
 const s={schemaVersion:5,stores:[{id:'x',enseigne:'Darty',ville:'Test',products:['brun','blanc']}],visits:{},notes:{}};
 const id=M.start(s,'x');
 M.editReport(s,id,'brun','team','Visite en cours : facing à vérifier.');
 M.editReport(s,id,'brun','training','Former les vendeurs vendredi.');
 M.editReport(s,id,'brun','massification','TG TV Samsung à reprendre.');
 M.editReport(s,id,'blanc','team','Électroménager contrôlé.');
 M.editReport(s,id,'blanc','training','Faire le point sur le SAV.');
 M.editReport(s,id,'shared','context','Flux important à l’entrée.');
 const v=M.getVisit(s,id),initial=M.unifiedTerrainNote(v,'brun');
 assert.match(initial,/facing à vérifier/);
 assert.match(initial,/Contexte magasin:\nFlux important/);
 assert.match(initial,/Former les vendeurs vendredi/);
 assert.match(initial,/TG TV Samsung à reprendre/);
 assert.equal(M.compactTerrainFields(s,id),true);
 assert.equal(M.compactTerrainFields(s,id),false,'migration idempotente');
 const migrated=M.reportOf(v);
 assert.equal(migrated.brun.team,initial,'exact legacy text is folded into BRUN note');
 assert.match(migrated.blanc.team,/Faire le point sur le SAV/);
 assert.match(migrated.blanc.team,/Flux important à l’entrée/);
 assert.equal(migrated.brun.training,'');
 assert.equal(migrated.blanc.training,'');
 assert.equal(migrated.brun.massification,'');
 assert.equal(migrated.shared.context,'');
 M.validate(s);
 const clone=M.clone(s);M.validate(clone);
 assert.equal(M.reportOf(M.getVisit(clone,id)).brun.team,initial);
}
{
 const s={schemaVersion:5,stores:[{id:'x',enseigne:'Boulanger',ville:'Test',products:['brun']}],visits:{},notes:{}};
 const id=M.start(s,'x');M.editReport(s,id,'shared','context','Contexte mono BRUN');
 assert.equal(M.compactTerrainFields(s,id),true);
 assert.match(M.reportOf(M.getVisit(s,id)).brun.team,/Contexte mono BRUN/);
 assert.equal(M.reportOf(M.getVisit(s,id)).blanc.team,'','a shared legacy context cannot create a phantom BLANC report');
}
{
 const {state,id,visit}=make();
 visit.report.shared.context='Contexte magasin ancien.';
 visit.report.blanc.training='Suivi SAV BLANC au prochain passage.';
 const pasted='Compte rendu BRUN final, sans ancienne note.';
 M.editProfessionalReport(state,id,'brun',pasted,true);
 assert.equal(M.reportOf(visit).brun.team,pasted,'final ChatGPT report must be exact');
 assert.equal(M.reportOf(visit).shared.context,'');
 assert.equal(M.reportOf(visit).blanc.training,'');
 assert.match(M.reportOf(visit).blanc.team,/Suivi SAV BLANC au prochain passage/);
 assert.match(M.reportOf(visit).blanc.team,/Contexte magasin ancien/);
 M.validate(state);
}

console.log('PASS V281: finish-edit transfers report into terrain; drafts do not, original source preserved and AI stale results rejected');
