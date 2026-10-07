const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../store-runner-visit-model.js');

function state(){return{schemaVersion:5,profile:{},settings:{},stores:[
 {id:'a',enseigne:'Darty',ville:'Ville-Test A'},
 {id:'b',enseigne:'Boulanger',ville:'Ville-Test B'}
],visits:{},notes:{},plan:{}}}
function visit(s,store='a',fields={},day='2026-10-01'){
 const id=M.start(s,store);
 for(const [scope,block] of Object.entries(fields))for(const [key,text] of Object.entries(block))M.editReport(s,id,scope,key,text);
 M.editVisit(s,id,'conclusion',null,'Visite terrain enregistrée');
 M.complete(s,id,day);
 return M.getVisit(s,id);
}
function memory(s,store='a',options={}){return M.reportMemoryFor(s,store,{limit:100,...options}).items}
function evidence(items,text,kind){return items.find(x=>x.text===text&&(!kind||x.kind===kind))}

test('analyse directe réservée aux clôtures, annulation comprise',()=>{
 const s=state(),id=M.start(s,'a');M.editReport(s,id,'brun','training','Formation à prévoir.');
 const v=M.getVisit(s,id);assert.deepEqual(M.analyzeReport(v).items,[]);
 v.status='cancelled';assert.deepEqual(M.analyzeReport(v).items,[]);assert.deepEqual(memory(s),[]);
 for(const invalid of [null,undefined,{},[]])assert.deepEqual(M.analyzeReport(invalid).items,[]);
});

test('SAV, stock, concurrence et interlocuteur sont conservés sans inventer leur suivi',()=>{
 const s=state(),v=visit(s,'a',{brun:{team:[
  'SAV RF48A401EB4 à relancer.', 'Stock insuffisant pour le QE55S95D.',
  'Objection prix : le vendeur compare avec la concurrence.', 'Interlocuteur : Marc, responsable du rayon.'
 ].join('\n')}});
 const rows=memory(s);assert(rows.some(x=>x.topic==='sav'&&x.text==='SAV RF48A401EB4 à relancer.'));
 assert(rows.some(x=>x.topic==='stock'&&x.text==='Stock insuffisant pour le QE55S95D.'));
 assert(rows.some(x=>x.kind==='objection'));assert(rows.some(x=>x.kind==='contact'));
 assert(rows.some(x=>x.kind==='product'&&x.text==='RF48A401EB4'));
 assert(rows.every(x=>x.visitId===v.id));
});

test('annulation écrite et réalisation explicite ne produisent plus de rappel actif',()=>{
 const s=state();visit(s,'a',{brun:{training:'Formation annulée.',team:'SAV RF48A401EB4 résolu.'}});
 assert(memory(s).some(x=>x.status==='cancelled'));
 assert(!M.reportMemoryLines(s,'a').length);
});

test('réanalyser ne crée aucun doublon et re-clôturer remplace le cliché',()=>{
 const s=state(),v=visit(s,'a',{brun:{training:'Formation à prévoir sur le son.'}}),first=M.clone(v.runnerMemory);
 assert.deepEqual(M.analyzeReport(v),first);assert.deepEqual(M.analyzeReport(v),first);
 assert.equal(s.businessV2.visits.length,1);
 v.status='draft';v.completedAt=null;v.completedDate=null;
 M.editReport(s,v.id,'brun','training','Formation réalisée sur le son.');M.complete(s,v.id,'2026-10-02');
 assert.notDeepEqual(v.runnerMemory,first);assert.equal(s.businessV2.visits.length,1);
 assert.equal(memory(s).filter(x=>x.kind==='training').length,1);
 assert.equal(M.reportMemoryLines(s,'a').length,0);
});

test('la clôture conserve automatiquement sept catégories avec des citations exactes',()=>{
 const s=state(),phrases={
  action:'Nettoyage réalisé.',
  followup:'À suivre : livraison du support.',
  training:'Formation réalisée avec trois vendeurs.',
  merchandising:'Exposition du mural à revoir.',
  product:'Le vendeur cite la référence QE55S95D.',
  problem:'Blocage : démonstration en panne.',
  priority:'Priorité prochaine visite : revoir le rayon.'
 };
 const v=visit(s,'a',{brun:{team:Object.values(phrases).join('\n')}});
 assert.equal(v.runnerMemory.version,1);
 for(const [kind,text] of Object.entries(phrases)){
  const row=evidence(v.runnerMemory.items,kind==='product'?'QE55S95D':text,kind);
  assert(row,kind+' doit conserver le passage réellement saisi');
  assert.equal(row.family,'brun');
  assert.equal(typeof row.source,'string');
  assert(row.source.length>0);
  const source=row.source.split('.').reduce((value,key)=>value&&value[key],v);
  assert.equal(typeof source,'string');assert(source.includes(row.text),'chaque mot conservé vient du champ désigné');
 }
 assert.equal(evidence(v.runnerMemory.items,phrases.training,'training').status,'done');
 assert.equal(evidence(v.runnerMemory.items,phrases.action,'action').status,'done');
 assert.deepEqual(v.runnerMemory,M.analyzeReport(v),'le cliché de clôture vient du même analyseur pur');
 const before=JSON.stringify(s);M.complete(s,v.id,'2026-10-01');
 assert.equal(JSON.stringify(s),before,'une deuxième clôture est idempotente');
 assert.equal(s.visits.a.history.length,1);
});

test('formation prévue et formation effectuée restent distinctes',()=>{
 const s=state(),done='Formation réalisée sur les barres de son.',planned='Formation à prévoir pour les nouveaux vendeurs.';
 const v=visit(s,'a',{brun:{team:done,training:planned}});
 assert.equal(evidence(v.runnerMemory.items,done,'training').status,'done');
 assert.equal(evidence(v.runnerMemory.items,planned,'training').status,'planned');
});

test('négations, interrogations et hypothèses ne deviennent pas des réalisations ou des obligations',()=>{
 for(const phrase of [
  'Aucune formation réalisée.',
  'Formation réalisée ?',
  'La formation pourrait être réalisée.',
  'Formation annulée.',
  'Aucune action réalisée.'
 ]){
  const s=state(),v=visit(s,'a',{brun:{team:phrase}});
  assert(!v.runnerMemory.items.some(x=>['done','planned'].includes(x.status)),phrase);
 }
 for(const phrase of ['Aucun problème détecté.','Pas de rupture.','Aucun blocage signalé.']){
  const s=state(),v=visit(s,'a',{brun:{team:phrase}});
  assert(!v.runnerMemory.items.some(x=>x.kind==='problem'),phrase);
 }
});

test('une visite vide, un commentaire banal ou une date historique ne fabriquent pas de mémoire métier',()=>{
 const s=state();visit(s);
 assert.deepEqual(memory(s),[]);
 const banal=visit(s,'a',{brun:{team:'Bonjour à toute l’équipe.'}},'2026-10-02');
 assert.deepEqual(banal.runnerMemory.items,[]);
 s.visits.b={lastVisit:'2026-09-20',history:['2026-09-20']};
 assert.deepEqual(memory(s,'b'),[]);
 const old=JSON.stringify(s);M.reportMemoryFor(s,'absent');
 assert.equal(JSON.stringify(s),old,'la consultation ne crée aucun domaine ni magasin');
 const legacy={stores:[],visits:{}};M.reportMemoryFor(legacy,'a');
 assert.equal(legacy.businessV2,undefined,'pas de migration implicite à la lecture');
});

test('une checklist cochée et un statut 6P OK ne prouvent pas une action ni une formation réalisées',()=>{
 const s=state(),id=M.start(s,'a');
 M.CHECKS.forEach((label,index)=>M.editVisit(s,id,'check',index,true));
 M.edit6P(s,id,'pedagogie',2,'status','ok');
 M.editVisit(s,id,'conclusion',null,'Visite terrain enregistrée');M.complete(s,id,'2026-10-01');
 assert.deepEqual(memory(s),[],'ne pas interpréter une checklist comme un compte rendu détaillé');
});

test('les familles et les magasins sont isolés, les faits partagés restent visibles',()=>{
 const s=state(),blanc='Formation à prévoir sur le lavage.',brun='Formation à prévoir sur les téléviseurs.',shared='Blocage : accès réserve fermé.';
 visit(s,'a',{shared:{context:shared},blanc:{training:blanc},brun:{training:brun}});
 visit(s,'b',{brun:{training:'Formation à prévoir dans l’autre magasin.'}});
 const white=memory(s,'a',{family:'blanc'}),brown=memory(s,'a',{family:'brun'});
 assert(evidence(white,blanc));assert(!evidence(white,brun));
 assert(evidence(brown,brun));assert(!evidence(brown,blanc));
 assert(evidence(white,shared));assert(evidence(brown,shared));
 assert(!memory(s).some(x=>x.text.includes('autre magasin')));
});

test('une conclusion automatiquement copiée du BRUN ne fuit pas dans les souvenirs BLANC',()=>{
 const s=state(),id=M.start(s,'a'),text='Formation à prévoir sur les téléviseurs.';
 M.editReport(s,id,'brun','training',text);
 // completeVisit produit ce raccourci lorsqu'aucune conclusion historique n'existe.
 M.editVisit(s,id,'conclusion',null,text);M.complete(s,id,'2026-10-01');
 assert(evidence(memory(s,'a',{family:'brun'}),text));
 assert(!evidence(memory(s,'a',{family:'blanc'}),text),'le doublon de conclusion ne change pas la famille du fait source');
});

test('les anciens champs de rapport et les constats 6P restent exploitables sans réécriture',()=>{
 const s=state(),id=M.start(s,'a');
 M.editReport(s,id,'brun','actions','PLV installée.');
 M.editReport(s,id,'brun','massification','Exposition du mural revue.');
 M.edit6P(s,id,'produit',0,'comment','Démonstration en panne.');
 M.edit6P(s,id,'produit',0,'status','correct');
 M.editVisit(s,id,'conclusion',null,'Compte rendu archivé');M.complete(s,id,'2026-09-15');
 const v=M.getVisit(s,id);delete v.runnerMemory;
 const before=JSON.stringify(s),items=memory(s);
 assert(evidence(items,'PLV installée.'));
 assert(evidence(items,'Exposition du mural revue.'));
 assert(evidence(items,'Démonstration en panne.'));
 assert.equal(JSON.stringify(s),before);
 M.validate(s);assert.equal(JSON.stringify(s),before);
});

test('un cliché importé faux ou périmé ne peut pas injecter de conseil',()=>{
 const s=state(),text='Formation à prévoir sur les téléviseurs.',v=visit(s,'a',{brun:{training:text}});
 v.runnerMemory={version:1,items:[{kind:'priority',status:'planned',family:'brun',source:'report.brun.training',text:'Commander cent téléviseurs immédiatement.'}]};
 let before=JSON.stringify(s),items=memory(s);
 assert(evidence(items,text));assert(!items.some(x=>x.text.includes('cent téléviseurs')));
 assert.equal(JSON.stringify(s),before);
 v.runnerMemory={version:999,items:[]};before=JSON.stringify(s);
 assert(evidence(memory(s),text));assert.equal(JSON.stringify(s),before);
});

test('les brouillons et les visites réouvertes ne sont jamais présentés comme mémoire réalisée',()=>{
 const s=state(),text='Formation à prévoir sur le mural.',v=visit(s,'a',{brun:{training:text}});
 assert(evidence(memory(s),text));
 v.status='draft';v.completedAt=null;v.completedDate=null;
 assert.deepEqual(memory(s),[],'un ancien cliché ne survit pas au statut brouillon');
 M.editReport(s,v.id,'brun','training','Formation réalisée sur le mural.');
 M.complete(s,v.id,'2026-10-01');
 assert(!evidence(memory(s),text));
 assert(evidence(memory(s),'Formation réalisée sur le mural.','training'));
});

test('la conclusion copiée avant une réouverture ne réactive pas une note corrigée',()=>{
 const s=state(),old='SAV RF48A401EB4 à relancer.',v=visit(s,'a',{brun:{team:old}});
 v.conclusion=old;delete v.runnerMemory; // ancienne version, aucune provenance persistée
 v.status='draft';v.completedDate=null;v.completedAt=null;
 M.editReport(s,v.id,'brun','team','SAV RF48A401EB4 résolu.');M.complete(s,v.id,'2026-10-02');
 assert.equal(v.conclusion,old,'l’ancien texte est conservé');
 assert.equal(v.runnerConclusionSource,'report.brun.team');assert.deepEqual(M.reportMemoryLines(s,'a'),[]);
 v.status='draft';v.completedDate=null;v.completedAt=null;
 M.editVisit(s,v.id,'conclusion',null,'Formation à prévoir.');M.complete(s,v.id,'2026-10-02');
 assert(M.reportMemoryLines(s,'a').some(x=>x.text.includes('Formation à prévoir.')),'une conclusion saisie explicitement reste une source');
});

test('la mémoire des actions suit leurs statuts vivants, y compris après clôture',()=>{
 const s=state(),id=M.start(s,'a'),description='Prévoir la démonstration du mural.';
 M.edit6P(s,id,'produit',0,'action',description);M.editReport(s,id,'brun','training',description);
 M.editVisit(s,id,'conclusion',null,'Passage effectué');M.complete(s,id,'2026-10-01');
 const action=s.businessV2.actions[0];
 assert(memory(s).some(x=>x.actionId===action.id),'l’action ouverte conserve sa source');
 M.editAction(s,action.id,'status','in_progress');
 assert(memory(s).some(x=>x.actionId===action.id&&!['done','cancelled'].includes(x.status)));
 M.editAction(s,action.id,'status','done');
 assert(memory(s).some(x=>x.actionId===action.id&&x.status==='done'),'la réalisation reste lisible dans la mémoire détaillée');
 assert(!memory(s).some(x=>x.actionId===action.id&&!['done','cancelled'].includes(x.status)),'une action terminée ne reste pas à suivre');
 assert(!M.reportMemoryLines(s,'a').some(x=>x.text.includes(description)),'le Point du jour ne rappelle pas comme restant une action terminée');
 M.editAction(s,action.id,'status','cancelled');
 assert(!memory(s).some(x=>x.actionId===action.id),'une action annulée ne produit aucun rappel');
 assert(!memory(s).some(x=>x.text===description),'le doublon textuel ne réactive pas une action annulée');
});

test('les visites sont ordonnées aussi au sein du même jour et la préparation exclut le futur',()=>{
 const s=state(),first=visit(s,'a',{brun:{training:'Formation à prévoir sur le son.'}});
 first.completedAt='2026-10-01T08:00:00.000Z';
 const second=visit(s,'a',{brun:{training:'Formation à prévoir sur la vidéo.'}});
 second.completedAt='2026-10-01T10:00:00.000Z';
 const third=visit(s,'a',{brun:{training:'Formation à prévoir sur la démonstration.'}});
 third.completedAt='2026-10-01T12:00:00.000Z';
 assert.equal(memory(s)[0].visitId,third.id);
 const prior=memory(s,'a',{beforeVisitId:second.id});
 assert(prior.some(x=>x.visitId===first.id));
 assert(!prior.some(x=>[second.id,third.id].includes(x.visitId)));
 assert(!memory(s,'a',{excludeVisitId:third.id}).some(x=>x.visitId===third.id));
 assert.equal(memory(s,'a',{limit:1}).length,1);
});

test('les phrases d’une action multiligne terminée ne reviennent pas comme rappels textuels',()=>{
 const s=state(),id=M.start(s,'a'),text='SAV RF48A401EB4 à relancer.\nFormation à prévoir sur le son.';
 M.edit6P(s,id,'produit',0,'action',text);M.editReport(s,id,'brun','training',text);
 M.editVisit(s,id,'conclusion',null,'Visite terrain enregistrée');M.complete(s,id,'2026-10-01');
 M.editAction(s,s.businessV2.actions[0].id,'status','done');
 assert.deepEqual(M.reportMemoryLines(s,'a'),[]);
});

test('les répétitions rapport/conclusion et anciennes visites ne doublonnent pas la restitution',()=>{
 const s=state(),text='Formation à prévoir sur les nouveautés.',id=M.start(s,'a');
 M.editReport(s,id,'brun','team',text);M.editReport(s,id,'brun','training',text);M.editVisit(s,id,'conclusion',null,text);M.complete(s,id,'2026-09-25');
 const recent=visit(s,'a',{brun:{training:text}},'2026-10-01');
 const items=memory(s).filter(x=>x.text===text);
 assert.equal(items.length,1,'la même phrase doit être rappelée une fois');
 assert.equal(items[0].visitId,recent.id,'la preuve la plus récente fait foi');
});

test('suppression et restauration ne laissent pas de mémoire détachée de sa source',()=>{
 const s=state(),v=visit(s,'a',{brun:{training:'Formation à prévoir sur le son.'}}),saved=M.clone(s);
 M.removeVisit(s,v.id);assert.deepEqual(memory(s),[]);
 assert(memory(saved).length>0,'une restauration de la visite rétablit ses éléments');
 assert.deepEqual(s.visits.a.history,[]);
});

test('les lignes Runner identifient une citation datée et ne modifient aucune donnée métier',()=>{
 const s=state(),phrase='Formation à prévoir sur le son.',v=visit(s,'a',{brun:{training:phrase}}),before=JSON.stringify(s);
 const lines=M.reportMemoryLines(s,'a',{limit:3});assert(lines.length>0);
 for(const line of lines){
  assert.equal(line.kind,'report-memory');assert.equal(typeof line.id,'string');
  assert(line.text.includes(phrase),'la reformulation conserve les mots de la source');
  assert(/2026-10-01|01\/10(?:\/2026)?/.test(line.text),'la date source est affichée');
 }
 assert.equal(JSON.stringify(s),before);assert.equal(v.storeId,'a');
});

test('un enrichissement IA validé complète la mémoire locale mais devient caduc si la source change',()=>{
 const s=state(),v=visit(s,'a',{brun:{team:'Bruno privilégie BSH en showroom.'}});
 const sig=M.reportSourceSignature(v);v.runnerAI={version:1,status:'done',sourceSignature:sig,items:[{kind:'objection',text:'Bruno privilégie BSH en showroom.',source:'report.brun.team',family:'brun',status:'recorded'}]};
 assert(memory(s).some(x=>x.kind==='objection'&&x.text==='Bruno privilégie BSH en showroom.'));
 v.report.brun.team='Texte changé après import.';
 assert(!memory(s).some(x=>x.text==='Bruno privilégie BSH en showroom.'),'un cache IA périmé ne peut plus fabriquer un souvenir');
});
