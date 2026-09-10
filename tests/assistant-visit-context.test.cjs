const assert=require('node:assert/strict');

const resolvers=[],transforms=[];
global.storeRunnerRegisterAssistantResolver=(fn,priority)=>resolvers.push({fn,priority});
global.storeRunnerRegisterAssistantContextTransform=(fn,priority)=>transforms.push({fn,priority});
global.state={
  stores:[{id:'s1',enseigne:'Darty',ville:'Lyon'},{id:'s2',enseigne:'Boulanger',ville:'Bron'}],
  businessV2:{version:2,revision:4,storeSnapshots:{},visits:[
    {id:'v1',storeId:'s1',status:'draft',step:2,updatedAt:'2026-09-10T12:00:00Z'},
    {id:'v2',storeId:'s2',status:'completed',completedDate:'2026-09-09',completedAt:'2026-09-09T15:00:00Z',updatedAt:'2026-09-09T15:00:00Z',conclusion:'Formation réalisée'}
  ],actions:[
    {id:'a1',storeId:'s1',visitId:'v1',category:'PRIX',description:'Corriger étiquette',owner:'Alice',dueDate:'2020-01-01',status:'open',updatedAt:'2026-09-10T12:00:00Z'},
    {id:'a2',storeId:'s2',visitId:'v2',category:'PRODUIT',description:'Vérifier stock',owner:'',dueDate:'',status:'done',updatedAt:'2026-09-09T16:00:00Z'}
  ]}
};

const A=require('../assistant-visit-context.js');
assert.equal(resolvers.length,1);assert.equal(resolvers[0].priority,10);
assert.equal(transforms.length,1);assert.equal(transforms[0].priority,60);
assert.match(A.answer('Quelles sont mes actions en retard ?'),/Darty Lyon/);
assert.match(A.answer('Quelles visites sont en cours ?'),/étape 3\/5/);
assert.match(A.answer('Quelle est ma dernière visite détaillée ?'),/Boulanger Bron/);
assert.equal(A.answer('Quand je passe chez Darty Lyon ?'),null);
const context=A.compactContext({today:'2026-09-10'});
assert.equal(context.businessV2.activeDrafts.length,1);
assert.equal(context.businessV2.openActions.length,1);
assert.equal(context.businessV2.recentVisits.length,1);
assert.equal(context.businessV2.openActions[0].description,'Corriger étiquette');

const fs=require('node:fs'),path=require('node:path');
const index=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
const sw=fs.readFileSync(path.join(process.cwd(),'sw.js'),'utf8');
const limiter=fs.readFileSync(path.join(process.cwd(),'ai-context-limit.js'),'utf8');
assert(index.includes("'./assistant-visit-context.js'"));
assert(sw.includes('"./assistant-visit-context.js"'));
assert(/businessV2\s*:\s*slimBusinessV2/.test(limiter));
console.log('PASS: assistant Visit/Action read-only resolver and compact online context.');
