const fs=require('fs');
const assert=require('node:assert/strict');
const photos=require('../store-photos.js');
const source=fs.readFileSync('store-photos.js','utf8');

(function sizing(){
  assert.deepEqual(photos.scaleSize(4000,2000),{width:1600,height:800});
  assert.deepEqual(photos.scaleSize(800,600),{width:800,height:600});
  assert.deepEqual(photos.scaleSize(1000,3000,1200),{width:400,height:1200});
})();

(function reportSelection(){
  const rows=[
    {id:'p3',visitId:'v2',createdAt:'2026-09-13T12:00:00Z'},
    {id:'p2',visitId:'v2',createdAt:'2026-09-13T11:00:00Z'},
    {id:'p1',visitId:'v1',createdAt:'2026-09-12T11:00:00Z'}
  ];
  assert.deepEqual([...photos.defaultSelection(rows,'v2')],['p3','p2'],'les photos de la visite courante sont sélectionnées pour le rapport');
  assert.deepEqual([...photos.defaultSelection(rows,'')],['p3','p2'],'sans visite courante, les 2 dernières sont proposées');
})();

(function safeNames(){
  assert.equal(photos.safePart('Darty Villetest Quartier-Test'),'Darty-Villetest-Quartier-Test');
  const name=photos.shareFileName({createdAt:'2026-09-13T12:34:56.000Z',type:'image/jpeg'},{enseigne:'Boulanger',ville:'Villetest'});
  assert.match(name,/^Boulanger-Villetest_2026-09-13_12-34-56-000\.jpg$/);
})();

(function storageAndCameraGuards(){
  assert(source.includes("indexedDB.open(DB_NAME,DB_VERSION)"),'les photos doivent utiliser IndexedDB');
  assert(source.includes('capture="environment"'),'le bouton appareil photo doit demander la caméra arrière');
  assert(!source.includes('localStorage.setItem'),'les blobs photo ne doivent jamais être sérialisés dans localStorage');
  assert(!source.includes('state.photos='),'ne pas créer de registre photo dans state');
  assert(source.includes("navigator")||source.includes("root.navigator"),'le partage natif doit rester disponible');
})();

(function nomDeFichierEtiquete(){
  // 12. Non-régression : sans famille ni moment, le nom est celui d'avant ce ticket.
  const nu=photos.shareFileName({createdAt:'2026-09-13T12:34:56.000Z',type:'image/jpeg'},{enseigne:'Boulanger',ville:'Villetest'});
  assert.equal(nu,'Boulanger-Villetest_2026-09-13_12-34-56-000.jpg','un enregistrement sans étiquette garde son nom historique');
  const etiquete=photos.shareFileName({createdAt:'2026-09-13T12:34:56.000Z',type:'image/jpeg',family:'brun',moment:'avant'},{enseigne:'Darty',ville:'Villetest'});
  assert.equal(etiquete,'Darty-Villetest_brun_avant_2026-09-13_12-34-56-000.jpg','famille et moment s’insèrent avant l’horodatage');
  const partiel=photos.shareFileName({createdAt:'2026-09-13T12:34:56.000Z',type:'image/jpeg',moment:'apres'},{enseigne:'Darty',ville:'Villetest'});
  assert.equal(partiel,'Darty-Villetest_apres_2026-09-13_12-34-56-000.jpg','une seule étiquette suffit');
  assert(!/redne|responsable/i.test(etiquete),'aucun nom de personne dans le nom de fichier');
})();

/* IndexedDB de fortune : listByFamily lit réellement le stockage, on ne teste pas une
   copie du filtre. Assez fidèle pour les curseurs et la fin de transaction. */
function fakeIndexedDB(rows){
  const data=new Map(rows.map(r=>[String(r.id),Object.assign({},r)]));
  function makeTx(){
    const tx={oncomplete:null,onerror:null,onabort:null,abort(){if(tx.onabort)tx.onabort()}};
    let pending=0;
    function settle(fn){pending++;queueMicrotask(()=>{fn();pending--;if(!pending)setTimeout(()=>{if(!pending&&tx.oncomplete)tx.oncomplete()},0)})}
    const os={
      put(r){data.set(String(r.id),r);const req={};settle(()=>{if(req.onsuccess)req.onsuccess()});return req},
      delete(id){data.delete(String(id));const req={};settle(()=>{if(req.onsuccess)req.onsuccess()});return req},
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
    tx.objectStore=()=>os;
    return tx;
  }
  return {open(){const req={};setTimeout(()=>{req.result={transaction:(_n,_m)=>makeTx(),objectStoreNames:{contains:()=>true}};if(req.onsuccess)req.onsuccess()},0);return req}};
}

(async function familleDesPhotos(){
  globalThis.indexedDB=fakeIndexedDB([
    {id:'p1',storeId:'s1',createdAt:'2026-09-14T09:00:00Z',family:'brun',moment:'avant'},
    {id:'p2',storeId:'s1',createdAt:'2026-09-14T10:00:00Z',family:'blanc',moment:'apres'},
    {id:'p3',storeId:'s1',createdAt:'2026-09-14T11:00:00Z'},                       // d'avant ce ticket
    {id:'p4',storeId:'s1',createdAt:'2026-09-14T12:00:00Z',family:'',moment:''},
    {id:'p9',storeId:'s2',createdAt:'2026-09-14T13:00:00Z',family:'brun'}
  ]);
  globalThis.IDBKeyRange={only:v=>({only:v})};

  const toutes=await photos.list('s1');
  assert.deepEqual(toutes.map(r=>r.id),['p4','p3','p2','p1'],'la liste reste triée du plus récent au plus ancien');

  // 11. La famille demandée, plus les non étiquetées, jamais celles de l'autre famille.
  const brun=await photos.listByFamily('s1','brun');
  assert.deepEqual(brun.map(r=>r.id).sort(),['p1','p3','p4'],'BRUN : ses photos et les non étiquetées');
  const blanc=await photos.listByFamily('s1','blanc');
  assert.deepEqual(blanc.map(r=>r.id).sort(),['p2','p3','p4'],'BLANC : ses photos et les non étiquetées');
  assert(!brun.some(r=>r.family==='blanc')&&!blanc.some(r=>r.family==='brun'),'jamais la famille opposée');
  const communes=brun.filter(r=>blanc.some(b=>b.id===r.id)).map(r=>r.id).sort();
  assert.deepEqual(communes,['p3','p4'],'les non étiquetées sont volontairement rendues aux deux');
  assert.deepEqual((await photos.listByFamily('s2','brun')).map(r=>r.id),['p9'],'le magasin reste la première clé de lecture');

  // updateTags persiste, et n'accepte que les valeurs du contrat.
  assert.equal(await photos.updateTags('p3',{family:'blanc',moment:'apres'}),true);
  const apres=await photos.listByFamily('s1','blanc');
  assert(apres.some(r=>r.id==='p3'&&r.family==='blanc'&&r.moment==='apres'),'l’étiquette posée après coup est enregistrée');
  assert(!(await photos.listByFamily('s1','brun')).some(r=>r.id==='p3'),'et la photo quitte l’autre famille');
  await photos.updateTags('p3',{family:'violet',moment:'plus tard'});
  const nettoye=(await photos.list('s1')).find(r=>r.id==='p3');
  assert.equal(nettoye.family,'','une famille hors contrat retombe sur non étiquetée');
  assert.equal(nettoye.moment,'','un moment hors contrat aussi');
  assert.equal(await photos.updateTags('inconnue',{family:'brun'}),false,'un identifiant inconnu ne casse rien');

  // Ticket 2B : shareRecords doit fonctionner sans open() préalable et prendre le magasin
  // porté par chaque enregistrement, jamais activeStoreId d'une ancienne galerie.
  const oldState=globalThis.state,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldFile=Object.getOwnPropertyDescriptor(globalThis,'File');
  try{
    globalThis.state={stores:[{id:'s-direct',enseigne:'Boulanger',ville:'Villetest'}]};
    class FakeFile{constructor(parts,name,opts){this.parts=parts;this.name=name;this.type=opts&&opts.type;this.lastModified=opts&&opts.lastModified}}
    Object.defineProperty(globalThis,'File',{configurable:true,writable:true,value:FakeFile});
    let shared=null;
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>true,share:async payload=>{shared=payload}}});
    const result=await photos.shareRecords([{id:'direct',storeId:'s-direct',createdAt:'2026-09-14T14:00:00Z',family:'brun',moment:'avant',type:'image/jpeg',blob:{type:'image/jpeg'}}]);
    assert.equal(result,'shared','shareRecords partage directement sans ouvrir la galerie');
    assert.equal(shared.files[0].name,'Boulanger-Villetest_brun_avant_2026-09-14_14-00-00.jpg','le nom vient du storeId de l’enregistrement');
    assert.equal(shared.title,'Photos terrain · Boulanger · Villetest','le titre vient du même magasin');
    assert(!shared.files[0].name.startsWith('magasin_'),'aucun nom générique quand le magasin est connu');
  }finally{
    globalThis.state=oldState;
    if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
    if(oldFile)Object.defineProperty(globalThis,'File',oldFile);else delete globalThis.File;
  }

  console.error('  listByFamily — BRUN : '+brun.map(r=>r.id).join(', ')+' · BLANC : '+blanc.map(r=>r.id).join(', '));
  console.log('store-photos: OK');
})().catch(e=>{console.error(e);process.exit(1)});
