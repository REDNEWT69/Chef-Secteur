/* V201 — déplacer des photos vers un autre magasin.
   Fixtures inventées : le dépôt est public. Le stockage est un IndexedDB de
   fortune, assez fidèle pour que moveRecords lise et écrive réellement. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const MODULE=path.join(__dirname,'..','store-photos.js');
const source=fs.readFileSync(MODULE,'utf8');
/* Le module met sa connexion IndexedDB en cache dans `dbPromise`. Sans rechargement,
   tous les blocs ci-dessous partageraient la première base de test et les scénarios
   se contamineraient les uns les autres — ce qui a effectivement masqué un cas. */
function loadModule(){delete require.cache[require.resolve(MODULE)];return require(MODULE)}
let photos=loadModule();

/* Même harnais que tests/store-photos.test.cjs, plus le suivi des écritures. */
function fakeIndexedDB(rows,journal){
  const data=new Map(rows.map(r=>[String(r.id),Object.assign({},r)]));
  function makeTx(){
    const tx={oncomplete:null,onerror:null,onabort:null,abort(){if(tx.onabort)tx.onabort()}};
    let pending=0;
    function settle(fn){pending++;queueMicrotask(()=>{fn();pending--;if(!pending)setTimeout(()=>{if(!pending&&tx.oncomplete)tx.oncomplete()},0)})}
    const os={
      put(r){if(journal)journal.puts.push(String(r.id));data.set(String(r.id),r);const req={};settle(()=>{if(req.onsuccess)req.onsuccess()});return req},
      delete(id){if(journal)journal.deletes.push(String(id));data.delete(String(id));const req={};settle(()=>{if(req.onsuccess)req.onsuccess()});return req},
      get(id){const req={};settle(()=>{req.result=data.get(String(id));if(req.onsuccess)req.onsuccess()});return req},
      index(){return{openCursor(range){
        const req={},matching=[...data.values()].filter(r=>String(r.storeId)===String(range.only));
        let i=0;
        const step=()=>settle(()=>{
          if(i>=matching.length){req.result=null;if(req.onsuccess)req.onsuccess();return}
          req.result={value:matching[i++],continue:step};if(req.onsuccess)req.onsuccess();
        });
        step();return req;
      }}}
    };
    tx.objectStore=()=>os;return tx;
  }
  return {open(){const req={};setTimeout(()=>{req.result={transaction:()=>makeTx(),objectStoreNames:{contains:()=>true}};if(req.onsuccess)req.onsuccess()},0);return req},__data:data};
}

const BLOB_A={marque:'blob-a'},BLOB_B={marque:'blob-b'},BLOB_C={marque:'blob-c'};
function fixture(journal){
  const db=fakeIndexedDB([
    {id:'ph1',storeId:'sA',visitId:'vA',createdAt:'2026-09-14T09:00:00Z',updatedAt:'2026-09-14T09:00:00Z',
     note:'Linéaire lavage à réimplanter',family:'blanc',moment:'avant',blob:BLOB_A,type:'image/jpeg',width:1600,height:1200,size:412000},
    {id:'ph2',storeId:'sA',visitId:null,createdAt:'2026-09-14T10:00:00Z',updatedAt:'2026-09-14T10:00:00Z',
     note:'Mur TV',family:'brun',moment:'apres',blob:BLOB_B,type:'image/jpeg',width:1600,height:900,size:388000},
    {id:'ph3',storeId:'sA',visitId:'vB',createdAt:'2026-09-14T11:00:00Z',updatedAt:'2026-09-14T11:00:00Z',
     note:'',family:'',moment:'',blob:BLOB_C,type:'image/jpeg',width:1200,height:1200,size:301000},
    {id:'ph9',storeId:'sB',visitId:null,createdAt:'2026-09-14T12:00:00Z',updatedAt:'2026-09-14T12:00:00Z',
     note:'Déjà au bon endroit',family:'brun',moment:'',blob:{marque:'blob-d'},type:'image/jpeg',size:120000}
  ],journal);
  globalThis.indexedDB=db;
  globalThis.IDBKeyRange={only:v=>({only:v})};
  globalThis.state={
    stores:[
      {id:'sA',enseigne:'Enseigne A',ville:'Ville-Test 01',adresse:'1 rue Test',active:true},
      {id:'sB',enseigne:'Enseigne B',ville:'Ville-Test 02',adresse:'2 rue Test',active:true},
      {id:'sC',enseigne:'Enseigne C',ville:'Ville-Test 03',adresse:'3 rue Test',active:false}
    ],
    businessV2:{visits:[
      {id:'vA',storeId:'sA',status:'draft',updatedAt:'2026-09-14T09:00:00Z'},
      {id:'vB',storeId:'sB',status:'completed',completedDate:'2026-09-10'}
    ],actions:[]}
  };
  photos=loadModule();
  return db;
}

/* Une promesse jamais résolue ferait sortir node en 0 sans rien exécuter : le
   code de sortie est fautif par défaut et n'est levé qu'à la toute fin. */
process.exitCode=1;
(async()=>{
  /* 1. Déplacement d'une seule photo : le magasin change, le reste ne bouge pas. */
  {
    const journal={puts:[],deletes:[]};
    fixture(journal);
    /* Copie profonde : l'IndexedDB de fortune rend l'objet stocké lui-même, là où
       un vrai IndexedDB rend un clone structuré. Sans cette copie, la comparaison
       avant/après porterait sur le même objet et ne prouverait rien. */
    const vivant=(await photos.list('sA')).find(r=>r.id==='ph1');
    const avant={note:vivant.note,type:vivant.type,size:vivant.size,updatedAt:vivant.updatedAt,createdAt:vivant.createdAt};
    const moved=await photos.moveRecords(['ph1'],'sB');
    assert.deepEqual(moved.map(m=>m.id),['ph1']);
    assert.equal(moved[0].from,'sA');assert.equal(moved[0].to,'sB');assert.equal(moved[0].already,false);

    const restantes=await photos.list('sA');
    assert.deepEqual(restantes.map(r=>r.id),['ph3','ph2'],'la photo quitte le mauvais magasin');
    const arrivees=await photos.list('sB');
    assert.ok(arrivees.some(r=>r.id==='ph1'),'et apparaît dans le bon');

    const apres=arrivees.find(r=>r.id==='ph1');
    assert.equal(apres.blob,BLOB_A,'le blob est conservé, pas recopié');
    assert.equal(apres.note,avant.note,'la note est conservée');
    assert.equal(apres.family,'blanc','la famille est conservée');
    assert.equal(apres.moment,'avant','le moment est conservé');
    assert.equal(apres.createdAt,'2026-09-14T09:00:00Z','la date de prise de vue ne bouge pas');
    assert.equal(apres.type,avant.type);assert.equal(apres.size,avant.size);
    assert.notEqual(apres.updatedAt,avant.updatedAt,'updatedAt est rafraîchi');
    assert.ok(apres.updatedAt>avant.updatedAt);

    assert.deepEqual(journal.deletes,[],'aucune suppression : aucune perte possible');
    assert.deepEqual(journal.puts,['ph1'],'un seul enregistrement réécrit, donc aucun doublon');
    assert.equal(globalThis.indexedDB.__data.size,4,'le nombre total de photos est inchangé');
  }

  /* 2. Déplacement multiple : tout le lot part ensemble. */
  {
    const journal={puts:[],deletes:[]};
    fixture(journal);
    const moved=await photos.moveRecords(['ph1','ph2','ph3'],'sB');
    assert.equal(moved.length,3);
    assert.deepEqual((await photos.list('sA')).map(r=>r.id),[],'le mauvais magasin est vidé');
    assert.deepEqual((await photos.list('sB')).map(r=>r.id).sort(),['ph1','ph2','ph3','ph9'],'les quatre sont au bon endroit');
    assert.deepEqual(journal.deletes,[]);
    assert.equal(globalThis.indexedDB.__data.size,4,'toujours quatre photos au total');
  }

  /* 3. visitId : coupé quand la visite n'est pas celle du magasin d'arrivée. */
  {
    fixture();
    await photos.moveRecords(['ph1','ph2','ph3'],'sB');
    const rows=await photos.list('sB');
    const ph1=rows.find(r=>r.id==='ph1'),ph2=rows.find(r=>r.id==='ph2'),ph3=rows.find(r=>r.id==='ph3');
    assert.equal(ph1.visitId,null,'vA est une visite de sA : le lien est coupé');
    assert.equal(ph2.visitId,null,'une photo sans visite reste sans visite');
    assert.equal(ph3.visitId,'vB','vB est une visite de sB : le lien est conservé');
  }
  {
    /* Une visite inconnue ne peut pas être justifiée comme visite du magasin
       d'arrivée : le lien tombe. */
    fixture();
    globalThis.state.businessV2.visits=[];
    await photos.moveRecords(['ph3'],'sB');
    assert.equal((await photos.list('sB')).find(r=>r.id==='ph3').visitId,null);
    assert.equal(photos.keepsVisitLink('vB','sB'),false,'sans visite connue, pas de lien conservé');
  }

  /* 4. Cas limites. */
  {
    fixture();
    await assert.rejects(()=>photos.moveRecords([],'sB'),
      e=>e.message==='Sélectionne au moins une photo à déplacer.','sélection vide : message propre à cette garde');
    await assert.rejects(()=>photos.moveRecords(['ph1'],''),
      e=>e.message==='Choisis le magasin de destination.','destination vide : message propre à cette garde');
    await assert.rejects(()=>photos.moveRecords(['ph1'],'inconnu'),
      e=>e.message==='Magasin de destination introuvable.','destination inexistante : message distinct du précédent');

    /* Déjà au bon endroit : opération neutre, pas une erreur. */
    const same=await photos.moveRecords(['ph9'],'sB');
    assert.equal(same[0].already,true);
    const ph9=(await photos.list('sB')).find(r=>r.id==='ph9');
    assert.equal(ph9.updatedAt,'2026-09-14T12:00:00Z','un non-déplacement ne touche pas updatedAt');

    /* Photo disparue entre-temps : on saute, on n'échoue pas et on ne crée rien. */
    const journal={puts:[],deletes:[]};
    fixture(journal);
    const mixte=await photos.moveRecords(['ph1','fantome'],'sB');
    assert.deepEqual(mixte.map(m=>m.id),['ph1'],'l’identifiant inconnu est ignoré');
    assert.equal(globalThis.indexedDB.__data.size,4,'rien n’est créé pour un identifiant inconnu');

    /* Doublons dans la sélection : dédupliqués. */
    fixture(journal);journal.puts.length=0;
    await photos.moveRecords(['ph1','ph1','ph1'],'sB');
    assert.deepEqual(journal.puts,['ph1'],'un identifiant répété n’écrit qu’une fois');
  }

  /* 5. Le partage et la comparaison continuent de fonctionner après déplacement. */
  {
    fixture();
    await photos.moveRecords(['ph1'],'sB');
    const rows=await photos.list('sB');
    const ph1=rows.find(r=>r.id==='ph1');
    assert.equal(photos.shareFileName(ph1,globalThis.state.stores[1]),
      'Enseigne-B-Ville-Test-02_blanc_avant_2026-09-14_09-00-00.jpg',
      'le nom de partage suit le nouveau magasin et garde les étiquettes');
    /* Les familles restent lisibles depuis le magasin d'arrivée. */
    assert.ok((await photos.listByFamily('sB','blanc')).some(r=>r.id==='ph1'),'BLANC retrouve la photo déplacée');
    assert.ok(!(await photos.listByFamily('sB','brun')).some(r=>r.id==='ph1'),'BRUN ne la revendique pas');
    assert.deepEqual([...photos.defaultSelection(rows,'')].length,2,'la sélection par défaut reste opérante');
  }

  /* 6. Destinations proposées : le magasin courant et les inactifs sont écartés. */
  {
    fixture();
    assert(source.includes('String(s.id)!==String(activeStoreId)'),'le magasin courant ne peut pas être sa propre destination');
    assert(source.includes("s.active!==false"),'un magasin désactivé n’est pas proposé');
  }

  /* 7. Le module reste local et hors ligne. */
  {
    assert(!/\bfetch\s*\(/.test(source),'aucun appel réseau dans le module photo');
    assert(!/XMLHttpRequest/.test(source),'aucun XMLHttpRequest');
    assert(source.includes('const pending=list.map(id=>({id,req:os.get(id)}));'),
      'toutes les lectures sont émises avant le premier await, sinon la transaction se referme');
  }

  process.exitCode=0;
  console.log('déplacement de photos : OK · une photo · un lot · étiquettes et note conservées · visitId coupé ou gardé selon le magasin · aucun doublon, aucune perte · partage et familles intacts');
})().catch(e=>{console.error(e);process.exit(1)});
