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

(function categoriesV255(){
  const brun=photos.categoriesFor('brun').map(c=>c.label),blanc=photos.categoriesFor('blanc').map(c=>c.label);
  assert.deepEqual(brun,['TV','OLED','Neo QLED / Mini LED','QLED','Lifestyle / Frame','Audio','PLV','TG','Entrée magasin','Mural','Concurrence','Anomalie merchandising'],'catégories BRUN dans l’ordre métier');
  assert.deepEqual(blanc,['Froid','Lavage','Cuisson','Micro-ondes','Aspiration','PEM','TG','Entrée magasin','Mural','Concurrence','Anomalie merchandising'],'catégories BLANC dans l’ordre métier');
  assert(photos.categoriesFor('').some(c=>c.id==='oled')&&photos.categoriesFor('').some(c=>c.id==='froid'),'une photo sans famille peut recevoir toute catégorie');
  assert.equal(photos.normalizeCategory('blanc','oled'),'','OLED n’existe pas en BLANC');
  assert.equal(photos.normalizeCategory('blanc','mural'),'mural','une catégorie commune survit au changement de famille');
  assert.equal(photos.normalizeCategory('brun',''),'','la catégorie reste facultative');
  assert.equal(photos.normalizeCategory('brun','inventee'),'','une catégorie inconnue n’est jamais stockée');
  assert.equal(photos.registerCategory('brun','barre-son','Barre de son'),true,'la liste est extensible');
  assert.equal(photos.registerCategory('brun','barre-son','Doublon'),false,'sans doublon d’identifiant');
  assert(photos.categoriesFor('brun').some(c=>c.id==='barre-son')&&!photos.categoriesFor('blanc').some(c=>c.id==='barre-son'),'ajoutée à la seule famille demandée');
  assert.equal(photos.categoryLabel('neo-qled'),'Neo QLED / Mini LED');
})();

(function classementV255(){
  const visits=[{id:'v1',storeId:'s1',createdAt:'2026-09-24T07:30:00'},{id:'v0',storeId:'s1',createdAt:'2026-09-10T08:00:00'}];
  const rows=[
    {id:'a',storeId:'s1',visitId:'v1',family:'brun',createdAt:'2026-09-24T08:00:00'},
    {id:'b',storeId:'s1',visitId:'v1',family:'brun',category:'oled',createdAt:'2026-09-24T08:05:00'},
    {id:'c',storeId:'s1',visitId:'v1',family:'blanc',category:'froid',createdAt:'2026-09-24T08:40:00'},
    {id:'d',storeId:'s1',visitId:'v0',family:'blanc',createdAt:'2026-09-10T09:00:00'},
    {id:'old',storeId:'s1',createdAt:'2026-08-01T10:00:00'},                 // ancienne photo : ni visite, ni famille, ni miniature
    {id:'old2',storeId:'s1',visitId:null,family:'',createdAt:'2026-08-01T11:00:00'}
  ];
  const groups=photos.groupRows(rows,visits);
  assert.deepEqual(groups.map(g=>g.key),['v:v1','v:v0','d:2026-08-01'],'visites puis jours, du plus récent au plus ancien');
  assert.deepEqual([groups[0].brun,groups[0].blanc,groups[0].total],[2,1,3],'24/09 : BRUN · 2, BLANC · 1');
  assert.equal(photos.groupLabel(groups[0]),'Visite du 24/09/2026');
  assert.equal(photos.groupLabel(groups[2]),'Hors visite · 01/08/2026','les anciennes photos sont classées par date, sans migration');
  assert.equal(groups[2].none,2,'une photo sans famille n’est comptée ni en BRUN ni en BLANC');
  assert.equal(photos.localDay('2026-09-24T23:30:00'),'2026-09-24','jour local, pas UTC');
  assert.equal(photos.frenchDay('2026-09-24'),'24/09/2026');

  assert.deepEqual(photos.filterRows(rows,{family:'brun'}).map(r=>r.id),['b','a'],'filtre BRUN strict, récent d’abord');
  assert.deepEqual(photos.filterRows(rows,{family:'blanc',sort:'asc'}).map(r=>r.id),['d','c'],'tri ancien d’abord');
  assert.deepEqual(photos.filterRows(rows,{group:'v:v1',family:'blanc'}).map(r=>r.id),['c'],'visite + famille');
  assert.deepEqual(photos.filterRows(rows,{category:'oled'}).map(r=>r.id),['b'],'filtre catégorie');
  assert.deepEqual(photos.filterRows(rows,{family:'none'}).map(r=>r.id),['old2','old'],'les photos sans famille restent trouvables');
  assert.equal(photos.filterRows(rows,{}).length,rows.length,'Toutes = toutes');
  assert.deepEqual(photos.familyCounts(rows,'v:v1'),{all:3,brun:2,blanc:1,none:0},'compteurs de la visite filtrée');
  assert.deepEqual(photos.familyCounts(rows,''),{all:6,brun:2,blanc:2,none:2});
  assert.equal(photos.groupKeyOf({createdAt:'pas une date'}),'d:inconnue','une date illisible ne casse pas le classement');
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
  // V255 — catégorie facultative : posée, nettoyée si la famille la rend impossible, gardée si commune.
  assert.equal(await photos.updateTags('p1',{category:'oled'}),true);
  assert.equal((await photos.list('s1')).find(r=>r.id==='p1').category,'oled');
  await photos.updateTags('p1',{family:'blanc'});
  assert.equal((await photos.list('s1')).find(r=>r.id==='p1').category,'','OLED tombe quand la photo passe en BLANC');
  await photos.updateTags('p1',{category:'mural'});await photos.updateTags('p1',{family:'brun'});
  const p1=(await photos.list('s1')).find(r=>r.id==='p1');
  assert.equal(p1.category,'mural','une catégorie commune suit la photo');
  assert.equal(p1.moment,'avant','le moment n’est pas touché par la catégorie');
  const legacy=(await photos.list('s1')).find(r=>r.id==='p3');
  assert(!('thumb' in legacy)||legacy.thumb==null,'aucune migration : une ancienne photo n’est pas réécrite à la lecture');
  assert.equal(await photos.ensureThumb(legacy),null,'hors navigateur, pas de miniature et aucune erreur : la galerie retombe sur l’original');

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
