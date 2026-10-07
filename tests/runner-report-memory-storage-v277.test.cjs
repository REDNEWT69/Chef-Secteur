const assert=require('node:assert/strict');
const M=require('../store-runner-visit-model.js');
const R=require('../reliability-core.js');
const Store=require('../store-runner-visit-store.js');

// La façade synchrone et la copie disque ne convergent qu'après flush(), comme
// le moteur durable. Une interruption ne doit jamais annoncer la clôture.
class DB{
 constructor(){this.map=new Map();this.disk=new Map();this.atomic=true;this.fail=false;this.failFlush=false;this.hold=null}
 getItem(k){return this.map.get(k)??null}
 setItem(k,v){if(this.fail)throw Error('quota');this.map.set(k,String(v))}
 removeItem(k){this.map.delete(k)}
 async flush(){if(this.hold)await this.hold;if(this.failFlush)throw Error('IndexedDB interrompu');this.disk=new Map(this.map)}
 restart(){const copy=new DB();copy.map=new Map(this.disk);copy.disk=new Map(this.disk);return copy}
}
function base(){return{schemaVersion:5,profile:{baseName:'Ville-Test A'},settings:{},stores:[{id:'a',enseigne:'Darty',ville:'Ville-Test A'}],visits:{},notes:{},plan:{}}}

(async()=>{
 let state=base(),id;const db=new DB(),statuses=[];
 const setState=s=>{state=s;global.state=s};setState(state);
 const session=Store.create({model:M,reliability:R,db,getState:()=>state,setState,onStatus:(phase,error)=>statuses.push({phase,error})});
 await session.edit(s=>{id=M.start(s,'a');M.editReport(s,id,'brun','training','Formation à prévoir sur les nouveautés.');M.editVisit(s,id,'conclusion',null,'Passage effectué')});
 assert.equal(M.getVisit(state,id).runnerMemory,undefined,'la saisie ne crée aucun fait clôturé');
 const before=JSON.stringify(state),diskBefore=db.disk.get(R.keys.MAIN);

 db.failFlush=true;
 await assert.rejects(session.edit(s=>M.complete(s,id,'2026-10-07')),/IndexedDB interrompu/);
 assert.equal(JSON.stringify(state),before,'la visite et la mémoire sont publiées ensemble après durabilité');
 assert.equal(db.disk.get(R.keys.MAIN),diskBefore);
 assert.equal(statuses.at(-1).phase,'error');assert(session.hasPending());
 assert.equal(M.getVisit(R.load(db.restart()),id).status,'draft','un redémarrage après interruption garde le brouillon durable');
 state.notes.a='Note conservée pendant la relance';db.failFlush=false;
 await session.flush();
 const completed=M.getVisit(state,id);
 assert.equal(completed.status,'completed');assert.equal(completed.runnerMemory.version,1);
 assert(completed.runnerMemory.items.some(x=>x.text==='Formation à prévoir sur les nouveautés.'));
 assert.equal(state.notes.a,'Note conservée pendant la relance');
 assert.deepEqual(state.visits.a.history,['2026-10-07']);
 assert.equal(statuses.at(-1).phase,'saved');assert(!session.hasPending());
 assert.deepEqual(R.load(db.restart()),state,'la mémoire survit à un redémarrage du moteur de stockage');

 const snapshot=M.clone(completed.runnerMemory),items=M.reportMemoryFor(state,'a');
 const exported=JSON.stringify(R.seal(R.capture(state,db))),decoded=R.decode(exported,state);
 assert.deepEqual(M.getVisit(decoded.state,id).runnerMemory,snapshot,'la sauvegarde existante contient le cliché sans clé auxiliaire');
 const restoredDb=new DB();global.state=base();
 const restored=R.restore(decoded,restoredDb);await restoredDb.flush();
 assert.deepEqual(M.reportMemoryFor(restored,'a'),items);
 assert.deepEqual(R.load(restoredDb.restart()),restored);
 assert.equal(restored.schemaVersion,5);assert.equal(restored.businessV2.version,2,'aucun bump incompatible du schéma métier');

 const old=M.clone(decoded);delete old.integrity;delete M.getVisit(old.state,id).runnerMemory;
 const oldBefore=JSON.stringify(old),oldRead=R.decode(JSON.stringify(old),state);
 assert.equal(JSON.stringify(old),oldBefore);
 assert(M.reportMemoryFor(oldRead.state,'a').items.length>0,'les sauvegardes anciennes restent exploitables');
 assert.equal(M.getVisit(oldRead.state,id).runnerMemory,undefined,'la compatibilité ne réécrit pas la sauvegarde');

 setState(state);await session.edit(s=>{id=M.start(s,'a');M.editReport(s,id,'brun','training','Formation à prévoir sur le nouveau mural.');M.editVisit(s,id,'conclusion',null,'Second passage')});
 db.fail=true;
 await assert.rejects(session.edit(s=>M.complete(s,id,'2026-10-07')),/quota/);
 assert.equal(M.getVisit(state,id).status,'draft');assert.equal(M.getVisit(state,id).runnerMemory,undefined);
 db.fail=false;await session.flush();
 assert.equal(M.getVisit(state,id).status,'completed');
 assert.equal(M.reportMemoryFor(state,'a').items.filter(x=>x.text==='Formation à prévoir sur le nouveau mural.').length,1);

 const backup=R.capture(state,db);await session.edit(s=>M.removeVisit(s,id));
 assert(!M.reportMemoryFor(state,'a').items.some(x=>x.visitId===id));
 session.invalidate();setState(R.restore(backup,db));await db.flush();
 assert(M.reportMemoryFor(state,'a').items.some(x=>x.visitId===id),'la restauration reconstruit la lecture depuis les visites restaurées');
 assert.equal(db.map.has('store-runner-report-memory-v277'),false,'aucun registre détaché des sauvegardes');
 console.log('PASS V277 : clôture/mémoire atomiques, flush et quota interrompus puis relancés, reprise disque, sauvegarde scellée, restauration, ancienne sauvegarde, suppression et absence de doublons.');
})().catch(e=>{console.error(e);process.exitCode=1});
