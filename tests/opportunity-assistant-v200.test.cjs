const assert=require('node:assert/strict');
const path=require('node:path');

global.state={
  stores:[{id:'s1',enseigne:'Enseigne Test',ville:'Ville-Test Un'}],
  businessV2:{version:2,revision:1,storeSnapshots:{},visits:[],actions:[],opportunities:[
    {id:'opp-1',storeId:'s1',visitId:null,source:'store',category:'pdl',description:'Gagner deux facings',owner:'Chef de secteur',dueDate:'2099-10-01',status:'open',closedAt:null,createdAt:'2026-09-17T12:00:00.000Z',updatedAt:'2026-09-17T12:00:00.000Z'}
  ]}
};
const A=require(path.join(__dirname,'..','assistant-visit-context.js'));
const rows=A.openOpportunities();
assert.equal(rows.length,1);assert.equal(rows[0].description,'Gagner deux facings');
const context=A.compactContext({});
assert.equal(context.businessV2.openOpportunities.length,1);
assert.equal(context.businessV2.openOpportunities[0].store,'Enseigne Test Ville-Test Un');
const answer=A.answer('Quelles opportunités ouvertes ?');
assert.match(answer,/Opportunités ouvertes/);assert.match(answer,/Gagner deux facings/);assert.match(answer,/Enseigne Test Ville-Test Un/);
console.log('Assistant Opportunity V200 : OK · contexte lecture seule · réponse locale');
