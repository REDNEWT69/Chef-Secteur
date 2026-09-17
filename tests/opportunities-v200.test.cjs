const assert=require('node:assert/strict');
const path=require('node:path');
const M=require(path.join(__dirname,'..','store-runner-visit-model.js'));
const O=require(path.join(__dirname,'..','store-runner-opportunities.js'));
const R=require(path.join(__dirname,'..','reliability-core.js'));

function state(){return{
  schemaVersion:5,
  profile:{sectorName:'Secteur Test'},
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14'},
  stores:[
    {id:'s1',enseigne:'Enseigne Test',ville:'Ville-Test Un',adresse:'1 rue Test',priority:3},
    {id:'s2',enseigne:'Enseigne Test',ville:'Ville-Test Deux',adresse:'2 rue Test',priority:2}
  ],
  visits:{},notes:{},included:{},excluded:{},locks:{},
  plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},appointments:[],calendarEvents:[],
  businessV2:{version:2,revision:0,storeSnapshots:{},visits:[],actions:[]}
}}

/* Une sauvegarde V199 sans clé opportunities reste strictement valide. */
{
 const s=state(),before=JSON.stringify(s);
 assert.equal('opportunities' in s.businessV2,false);
 R.validateState(s);O.validate(s);
 assert.equal(JSON.stringify(s),before,'la lecture/validation ne doit pas migrer silencieusement une ancienne sauvegarde');
}

/* Création depuis la fiche magasin. */
{
 const s=state(),planBefore=JSON.stringify(s.plan),prioBefore=s.stores.map(x=>x.priority);
 const o=O.createOpportunity(s,{storeId:'s1',category:'pdl',description:'Gagner deux facings',owner:'Chef de secteur',dueDate:'2026-10-01'},{id:'opp-1',now:'2026-09-17T12:00:00.000Z'});
 assert.deepEqual(o,{id:'opp-1',storeId:'s1',visitId:null,source:'store',category:'pdl',description:'Gagner deux facings',owner:'Chef de secteur',dueDate:'2026-10-01',status:'open',closedAt:null,createdAt:'2026-09-17T12:00:00.000Z',updatedAt:'2026-09-17T12:00:00.000Z'});
 O.validate(s);R.validateState(s);
 assert.equal(JSON.stringify(s.plan),planBefore,'Opportunity ne doit jamais toucher au planning');
 assert.deepEqual(s.stores.map(x=>x.priority),prioBefore,'Opportunity ne doit jamais écrire store.priority');
 assert.deepEqual(O.list(s,{storeId:'s1',openOnly:true}).map(x=>x.id),['opp-1']);
}

/* Création liée à une visite du même magasin, rejet si magasin différent. */
{
 const s=state(),visitId=M.start(s,'s1');
 const o=O.createOpportunity(s,{storeId:'s1',visitId,category:'training',description:'Former deux vendeurs'},{id:'opp-visit',now:'2026-09-17T12:10:00.000Z'});
 assert.equal(o.visitId,visitId);assert.equal(o.source,'visit');
 assert.throws(()=>O.createOpportunity(s,{storeId:'s2',visitId,category:'pdl',description:'Test'},{id:'bad'}),/Visite source incohérente/);
 O.validate(s);R.validateState(s);
}

/* Statuts, clôture et réouverture. */
{
 const s=state();O.createOpportunity(s,{storeId:'s1',category:'massification',description:'Créer une massification'},{id:'opp-status',now:'2026-09-17T12:00:00.000Z'});
 let o=O.updateOpportunity(s,'opp-status',{status:'in_progress'},{now:'2026-09-18T09:00:00.000Z'});assert.equal(o.closedAt,null);
 o=O.updateOpportunity(s,'opp-status',{status:'won'},{now:'2026-09-20T09:00:00.000Z'});assert.equal(o.closedAt,'2026-09-20T09:00:00.000Z');assert.equal(O.list(s,{openOnly:true}).length,0);
 o=O.updateOpportunity(s,'opp-status',{status:'open'},{now:'2026-09-21T09:00:00.000Z'});assert.equal(o.closedAt,null);assert.equal(O.list(s,{openOnly:true}).length,1);
 O.updateOpportunity(s,'opp-status',{status:'lost'},{now:'2026-09-22T09:00:00.000Z'});assert.equal(O.list(s,{openOnly:true}).length,0);
 O.validate(s);
}

/* Garde-fous métier. */
{
 const s=state();
 assert.throws(()=>O.createOpportunity(s,{storeId:'absent',category:'pdl',description:'x'}),/Magasin introuvable/);
 assert.throws(()=>O.createOpportunity(s,{storeId:'s1',category:'inconnue',description:'x'}),/Choisis une catégorie/);
 assert.throws(()=>O.createOpportunity(s,{storeId:'s1',category:'pdl',description:'   '}),/Décris l’opportunité/);
 assert.throws(()=>O.createOpportunity(s,{storeId:'s1',category:'pdl',description:'x',dueDate:'17\/09\/2026'}),/Échéance invalide/);
}

/* Toutes les catégories produit décidées sont présentes. */
assert.deepEqual(Object.keys(O.CATEGORIES),['pdl','massification','extra_visibility','training','theatricalization','planogram','exposure_contract']);
assert.deepEqual(Object.keys(O.STATUSES),['open','in_progress','won','lost']);

console.log('Opportunity V200 : OK · rétrocompatibilité · création magasin/visite · statuts · planning/priorités intacts');
