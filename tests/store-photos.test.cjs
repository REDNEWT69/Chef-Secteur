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
  assert.equal(photos.safePart('Darty Lyon Part-Dieu'),'Darty-Lyon-Part-Dieu');
  const name=photos.shareFileName({createdAt:'2026-09-13T12:34:56.000Z',type:'image/jpeg'},{enseigne:'Boulanger',ville:'Lyon'});
  assert.match(name,/^Boulanger-Lyon_2026-09-13_12-34-56-000\.jpg$/);
})();

(function storageAndCameraGuards(){
  assert(source.includes("indexedDB.open(DB_NAME,DB_VERSION)"),'les photos doivent utiliser IndexedDB');
  assert(source.includes('capture="environment"'),'le bouton appareil photo doit demander la caméra arrière');
  assert(!source.includes('localStorage.setItem'),'les blobs photo ne doivent jamais être sérialisés dans localStorage');
  assert(!source.includes('state.photos='),'ne pas créer de registre photo dans state');
  assert(source.includes("navigator")||source.includes("root.navigator"),'le partage natif doit rester disponible');
})();

console.log('store-photos: OK');
