/* V256 — moteur de stockage durable (IndexedDB) : bascule, atomicité, échecs visibles.

   Le bloc STORAGE-ENGINE d'index.html est extrait et exécuté TEL QUEL contre un
   IndexedDB simulé (tests/helpers/fake-indexeddb.cjs) : ce qui est testé est ce qui
   tourne sur l'iPhone. Données 100 % synthétiques. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FakeIDB,FakeLocalStorage,domError}=require('./helpers/fake-indexeddb.cjs');
const F=require('./helpers/durability-fixture.cjs');
const R=require('../reliability-core.js');

const ROOT=path.join(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const begin=HTML.indexOf('/* STORAGE-ENGINE:BEGIN'),end=HTML.indexOf('/* STORAGE-ENGINE:END */');
assert(begin>0&&end>begin,'bloc STORAGE-ENGINE introuvable dans index.html');
const SOURCE=HTML.slice(begin,end);
const {createStorageEngine}=new Function(SOURCE+';return{createStorageEngine,createMemoryStorage};')();
const MAIN=R.keys.MAIN,ARCHIVE=R.keys.ARCHIVE;
const wait=(ms=5)=>new Promise(r=>setTimeout(r,ms));

function makeWin({idb=new FakeIDB(),ls=new FakeLocalStorage()}={}){
  const events=[];
  const win={indexedDB:idb,localStorage:ls,events,
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init&&init.detail}},
    dispatchEvent(e){events.push(e);return true},addEventListener(){},queueMicrotask};
  return win;
}
async function boot(win){const s=await createStorageEngine(win);return s}

const tests=[];const test=(name,fn)=>tests.push([name,fn]);

test('installation neuve : IndexedDB principal, écriture relue après « rechargement »',async()=>{
  const idb=new FakeIDB(),win=makeWin({idb});
  const s=await boot(win);
  assert.equal(win.__chefStorageMode,'indexedDB');assert.equal(s.atomic,true);
  s.setItem(MAIN,'{"a":1}');await s.flush();
  const again=await boot(makeWin({idb,ls:new FakeLocalStorage()}));
  assert.equal(again.getItem(MAIN),'{"a":1}');
  assert.equal(win.__chefStorageHealth.activatedFrom,'vide');
});

test('bascule depuis localStorage (6 mois de terrain) : copie exacte, jetons exclus, localStorage intact',async()=>{
  const data=F.build({months:6}),ls=new FakeLocalStorage();
  ls.setItem(MAIN,JSON.stringify(data.state));ls.setItem(ARCHIVE,JSON.stringify(data.archive));
  ls.setItem(R.keys.PERFORMANCE,JSON.stringify(data.performance));ls.setItem('chef_secteur_google_token_v2','SECRET');
  const before=new Map(ls.map),idb=new FakeIDB(),win=makeWin({idb,ls});
  const s=await boot(win);
  assert.equal(win.__chefStorageMode,'indexedDB');
  assert.equal(s.getItem(MAIN),before.get(MAIN));assert.equal(s.getItem(ARCHIVE),before.get(ARCHIVE));
  assert.equal(s.getItem('chef_secteur_google_token_v2'),null,'un jeton OAuth ne doit jamais être recopié');
  const disk=idb.dump();assert.equal(disk.get(MAIN),before.get(MAIN));assert(!disk.has('chef_secteur_google_token_v2'));
  for(const [k,v] of before)assert.equal(ls.getItem(k),v,'localStorage modifié : '+k);
  assert(ls.getItem('store-runner-storage-engine'),'marqueur de bascule absent');
  /* Second démarrage : pas de seconde copie, la base fait foi. */
  s.setItem(MAIN,'{"schemaVersion":5}');await s.flush();
  const again=await boot(makeWin({idb,ls}));
  assert.equal(again.getItem(MAIN),'{"schemaVersion":5}');
  assert.equal(ls.getItem(MAIN),before.get(MAIN));
});

test('localStorage PLEIN (écriture refusée) : la bascule sauve quand même les données',async()=>{
  const ls=new FakeLocalStorage(),state=JSON.stringify(F.build({months:1}).state);
  ls.setItem(MAIN,state);ls.quota=ls.getItem(MAIN).length+MAIN.length;   /* plus un octet libre */
  assert.throws(()=>ls.setItem('__chef_storage_test__','1'));
  const win=makeWin({ls});const s=await boot(win);
  assert.equal(win.__chefStorageMode,'indexedDB');assert.equal(s.getItem(MAIN),state);
});

test('écritures d’une même tâche = une transaction : quota atteint, rien d’écrit à moitié',async()=>{
  const idb=new FakeIDB(),win=makeWin({idb});const s=await boot(win);
  s.setItem(MAIN,'v1-main');s.setItem(ARCHIVE,'v1-archive');await s.flush();
  const commits=idb.commits;
  idb.quota=idb.size()+10;
  s.setItem(ARCHIVE,'v2-archive-'+'x'.repeat(50));s.setItem(MAIN,'v2-main-'+'x'.repeat(50));
  assert.equal(idb.commits,commits);
  await assert.rejects(s.flush(),e=>e.name==='QuotaExceededError');
  const disk=idb.dump();assert.equal(disk.get(MAIN),'v1-main');assert.equal(disk.get(ARCHIVE),'v1-archive');
  assert.equal(s.getItem(MAIN).startsWith('v2-main'),true,'la mémoire garde le travail en cours');
  const h=s.health();assert.deepEqual(h.failedKeys.sort(),[ARCHIVE,MAIN].sort());assert.equal(h.lastErrorName,'QuotaExceededError');
  assert(win.events.some(e=>e.type==='store-runner:storage-status'&&e.detail.failedKeys.length===2),'échec non publié');
  /* Place libérée : l'écriture suivante emporte les clés en retard, d'un bloc. */
  idb.quota=Infinity;s.setItem('autre','1');await s.flush();
  const after=idb.dump();assert(after.get(MAIN).startsWith('v2-main'));assert(after.get(ARCHIVE).startsWith('v2-archive'));
  assert.deepEqual(s.health().failedKeys,[]);assert.equal(s.health().lastError,null);
  assert((await s.verify([MAIN,ARCHIVE,'autre'])).ok);
});

test('connexion fermée par iOS en arrière-plan : réouverture et réécriture automatiques',async()=>{
  const idb=new FakeIDB(),win=makeWin({idb});const s=await boot(win);
  s.setItem(MAIN,'avant');await s.flush();
  idb.dropConnections();
  s.setItem(MAIN,'après');
  await wait(20);
  await s.flush();
  assert.equal(idb.dump().get(MAIN),'après');assert.deepEqual(s.health().failedKeys,[]);
});

test('base IndexedDB perdue après bascule : reprise de la copie localStorage, signalée',async()=>{
  const ls=new FakeLocalStorage();ls.setItem(MAIN,'{"copie":"figée"}');
  const idb=new FakeIDB();await boot(makeWin({idb,ls}));
  idb.deleteAll();
  const win=makeWin({idb,ls});const s=await boot(win);
  assert.equal(s.getItem(MAIN),'{"copie":"figée"}');
  assert(win.__chefStorageHealth.recoveredFromLegacy,'la reprise doit être signalée');
});

test('ancienne version relancée après bascule : écart localStorage détecté, rien d’écrasé',async()=>{
  const ls=new FakeLocalStorage();ls.setItem(MAIN,'{"v":1}');
  const idb=new FakeIDB();const s=await boot(makeWin({idb,ls}));s.setItem(MAIN,'{"v":2}');await s.flush();
  ls.setItem(MAIN,'{"v":"ancienne-version"}');
  const win=makeWin({idb,ls});const again=await boot(win);
  assert.equal(win.__chefStorageHealth.legacyChanged,true);
  assert.equal(again.getItem(MAIN),'{"v":2}');assert.equal(again.legacy().getItem(MAIN),'{"v":"ancienne-version"}');
});

test('replis : sans IndexedDB → localStorage ; ouverture refusée → localStorage ; rien → mémoire signalée',async()=>{
  const ls=new FakeLocalStorage();ls.setItem(MAIN,'x');
  const w1=makeWin({ls});delete w1.indexedDB;const s1=await boot(w1);assert.equal(w1.__chefStorageMode,'localStorage');assert.equal(s1,ls);
  const idb=new FakeIDB();idb.failOpen=domError('UnknownError','boom');const w2=makeWin({idb,ls});const s2=await boot(w2);assert.equal(w2.__chefStorageMode,'localStorage');assert.equal(s2.getItem(MAIN),'x');
  const dead=new FakeLocalStorage();dead.disabled=true;const w3=makeWin({ls:dead});delete w3.indexedDB;await boot(w3);assert.equal(w3.__chefStorageMode,'memory');assert(w3.__chefStorageHealth.lastError);
});

test('ChefReliability sur le moteur atomique : pas de journal, restauration d’un an sans plafond de 1,5 Mo',async()=>{
  const idb=new FakeIDB(),win=makeWin({idb});const s=await boot(win);
  const year=F.build({months:12});
  const bundle={format:'ChefSecteurBackup',version:1,state:year.state,archive:year.archive,range:year.range,catalog:[],performance:year.performance};
  const journalWrites=[];const orig=s.setItem.bind(s);s.setItem=(k,v)=>{if(k===R.keys.JOURNAL)journalWrites.push(k);return orig(k,v)};
  R.persist(bundle,s);await s.flush();
  assert.equal(journalWrites.length,0,'le moteur atomique ne doit pas recopier l’état dans un journal');
  assert.deepEqual(JSON.parse(idb.dump().get(MAIN)),year.state);
  /* Restauration d'une version plus ancienne (6 mois) par-dessus un an : historique conservé. */
  global.state=year.state;
  const six=F.build({months:6});
  const restored=R.restore({format:'ChefSecteurBackup',version:1,state:six.state,archive:six.archive,range:six.range},s);await s.flush();
  assert.equal(restored.businessV2.visits.length,six.visitCount);
  const rows=R.backups(s);assert(rows.length>=1&&rows[0].reason==='Avant restauration');
  assert.equal(rows[0].bundle.state.businessV2.visits.length,year.visitCount,'la version d’avant restauration doit contenir l’année complète');
  assert((await s.verify([MAIN,ARCHIVE,R.keys.RANGE,R.keys.PERFORMANCE])).ok);
  delete global.state;
});

test('deux fenêtres : chaque validation est annoncée, l’autre fenêtre le signale',async()=>{
  const channels=[];
  class BC{constructor(){this.onmessage=null;channels.push(this)}postMessage(data){for(const c of channels)if(c!==this&&c.onmessage)c.onmessage({data})}}
  const idb=new FakeIDB(),ls=new FakeLocalStorage();
  const w1=makeWin({idb,ls});w1.BroadcastChannel=BC;const s1=await boot(w1);
  const w2=makeWin({idb,ls});w2.BroadcastChannel=BC;const s2=await boot(w2);
  assert.equal(s2.health().otherWindow,false);
  s1.setItem(MAIN,'fenêtre 1');await s1.flush();
  assert.equal(s2.health().otherWindow,true);assert.equal(s1.health().otherWindow,false,'une fenêtre ne s’alerte pas elle-même');
  assert(w2.events.some(e=>e.detail&&e.detail.otherWindow),'alerte non publiée');
});

(async()=>{
  let n=0;
  for(const [name,fn] of tests){await fn();n++;console.log('PASS '+n+' · '+name)}
})().catch(e=>{console.error(e);process.exit(1)});
