const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../store-runner-visit-model.js');
global.StoreRunnerVisitModel=M;
const A=require('../runner-report-ai-auto-v2771.js');

function state(){return{stores:[{id:'c',enseigne:'Schmidt',ville:'Ville-Test',channel:'cuisiniste'}],visits:{},notes:{},businessV2:M.empty()}}
function completed(){const s=state(),id=M.start(s,'c');M.editReport(s,id,'shared','context','Bruno privilégie BSH en showroom.\nRevoir la gérante vendredi.\nRéférence RS68A882 proposée.');M.editVisit(s,id,'conclusion',null,'Visite cuisine');M.complete(s,id,'2026-10-07');return{s,id,v:M.getVisit(s,id)}}

test('le payload automatique ne contient que des sources réelles et une signature stable',()=>{const {s,id,v}=completed(),p=A.payloadFor(s,id);assert.equal(p.sourceSignature,M.reportSourceSignature(v));assert(p.entries.some(x=>x.source==='report.shared.context'&&x.text.includes('BSH')));assert.equal(p.store.enseigne,'Schmidt')});

test('l IA ne peut enrichir qu avec une citation exacte de la source',()=>{const {s,id}=completed(),p=A.payloadFor(s,id),r=A.parseResponse(JSON.stringify({items:[
 {kind:'objection',text:'Bruno privilégie BSH en showroom.',source:'report.shared.context',status:'recorded'},
 {kind:'followup',text:'Revoir la gérante vendredi.',source:'report.shared.context',status:'planned'},
 {kind:'priority',text:'Commander 100 téléviseurs.',source:'report.shared.context',status:'planned'},
 {kind:'contact',text:'Bruno',source:'source.inventee',status:'recorded'}
]}),p);assert.equal(r.items.length,2);assert(r.items.some(x=>x.kind==='objection'));assert(!r.items.some(x=>x.text.includes('100 téléviseurs')))});

test('une réponse IA illisible devient un enrichissement vide, jamais un fait inventé',()=>{const {s,id}=completed(),p=A.payloadFor(s,id),r=A.parseResponse('bonjour je suis une IA très créative',p);assert.deepEqual(r.items,[])});

test('le prompt impose JSON, citations exactes et absence d invention',()=>{const {s,id}=completed(),p=A.payloadFor(s,id),text=A.promptFor(p);assert.match(text,/JSON valide/);assert.match(text,/CITATION EXACTE/);assert.match(text,/N'invente jamais/);assert.match(text,/Schmidt/)});
