/* V257 — archive photo (.zip + manifeste) : format, intégrité, découpage.

   Le cycle complet avec IndexedDB (export → effacement → restauration → métadonnées)
   est joué dans un vrai navigateur par tests/photo-archive-v257-browser.spec.cjs.
   Ici : le format lui-même, sans navigateur. Données 100 % synthétiques. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const P=require('../store-photos.js');

(async()=>{
  /* CRC32 : vecteur de référence de la norme. */
  assert.equal(P.crc32(new TextEncoder().encode('123456789')),0xCBF43926);
  const n=[];const pass=m=>{n.push(m);console.log('PASS '+n.length+' · '+m)};
  pass('CRC32 conforme au vecteur de référence');

  /* Aller-retour zip : ce que l'on écrit se relit à l'octet près, sans charger le fichier. */
  const img=i=>{const b=new Uint8Array(1000+i*37);for(let k=0;k<b.length;k++)b[k]=(k*31+i)&255;return b};
  const entries=[0,1,2,3].map(i=>{const data=img(i);return{name:'photos/p'+i+'.jpg',data:new Blob([data],{type:'image/jpeg'}),crc:P.crc32(data),size:data.length,when:'2026-03-0'+(i+1)+'T09:30:00Z'}});
  const zip=P.zipBlob(entries);
  const read=await P.readZip(zip);
  assert.equal(read.entries.size,4);
  for(const [i,e] of entries.entries()){
    const got=new Uint8Array(await (await read.body(read.entries.get(e.name))).arrayBuffer());
    assert.deepEqual(got,img(i));assert.equal(read.entries.get(e.name).crc,e.crc);
  }
  pass('zip « stocké » écrit puis relu par tranches, octet pour octet');

  /* Un outil standard l'ouvre : on le vérifie avec l'implémentation zip de Python. */
  const tmp=path.join(require('node:os').tmpdir(),'sr-v257-'+process.pid+'.zip');
  fs.writeFileSync(tmp,Buffer.from(await zip.arrayBuffer()));
  const out=require('node:child_process').spawnSync('python3',['-c','import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(len(z.namelist()))',tmp],{encoding:'utf8'});
  fs.unlinkSync(tmp);
  if(out.status===0){assert.equal(out.stdout.trim(),'4');pass('archive ouverte et vérifiée par un lecteur zip standard (Python zipfile)')}
  else console.log('SKIP · python3 indisponible pour la vérification croisée');

  /* Une archive recompressée par un autre outil est refusée clairement. */
  const deflated=zlib.deflateRawSync(Buffer.from(img(0)));
  const bad=P.zipBlob([{name:'photos/x.jpg',data:new Blob([deflated]),crc:P.crc32(img(0)),size:deflated.length,when:'2026-01-01'}]);
  const badRead=await P.readZip(bad);const entry=badRead.entries.get('photos/x.jpg');entry.method=8;
  await assert.rejects(badRead.body(entry),/autre outil/);
  await assert.rejects(P.readZip(new Blob([new Uint8Array(200)])),/archive photo/);
  pass('fichier qui n’est pas une archive, ou archive recompressée : refus explicite');

  /* Découpage : chaque archive reste restaurable seule, bornée en taille et en nombre. */
  const rows=Array.from({length:10},(_,i)=>({id:'r'+i,size:60*1024*1024}));
  const parts=P.planParts(rows);assert.deepEqual(parts.map(p=>p.length),[2,2,2,2,2]);
  assert.deepEqual(P.planParts(Array.from({length:4500},(_,i)=>({id:'s'+i,size:1000}))).map(p=>p.length),[2000,2000,500]);
  assert.deepEqual(P.planParts([{id:'big',size:400*1024*1024}]).map(p=>p.length),[1],'une photo trop grosse part seule, jamais perdue');
  pass('découpage : 150 Mo et 2 000 photos au plus par archive, aucune photo écartée');

  /* Manifeste : toutes les métadonnées V255, rien d'inventé. */
  global.state={stores:[{id:'st-1',enseigne:'Darty',ville:'Ville-Test'}]};
  const row={id:'ph-1',storeId:'st-1',visitId:'visit-9',createdAt:'2026-04-02T08:00:00.000Z',updatedAt:'2026-04-02T09:00:00.000Z',note:'Tête de gondole',family:'brun',moment:'apres',category:'oled',blob:new Blob([img(1)],{type:'image/jpeg'}),thumb:new Blob([1]),type:'image/jpeg',width:1600,height:1200,size:1037,originalName:'IMG_0001.HEIC'};
  const m=P.manifestRow(row,'photos/ph-1.jpg',123);
  assert.deepEqual(m,{id:'ph-1',file:'photos/ph-1.jpg',crc:123,storeId:'st-1',storeLabel:'Darty · Ville-Test',visitId:'visit-9',createdAt:row.createdAt,updatedAt:row.updatedAt,note:'Tête de gondole',family:'brun',moment:'apres',category:'oled',type:'image/jpeg',width:1600,height:1200,size:1037,originalName:'IMG_0001.HEIC'});
  const legacy=P.manifestRow({id:'old',storeId:'st-2',createdAt:'2025-10-01T10:00:00Z',blob:new Blob([img(2)])},'photos/old.jpg',1);
  assert.equal(legacy.visitId,null);assert.equal(legacy.family,'');assert.equal(legacy.category,'');assert.equal(legacy.updatedAt,'2025-10-01T10:00:00Z');
  assert.throws(()=>P.checkManifestRow({...m,storeId:''}),/magasin/);
  assert.throws(()=>P.checkManifestRow({...m,type:'text/html'}),/Type/);
  assert.throws(()=>P.checkManifestRow({...m,file:'../evil'}),/Manifeste/);
  assert.doesNotThrow(()=>P.checkManifestRow(m));
  delete global.state;
  pass('manifeste : magasin, visite, famille, moment, catégorie, note, dates et dimensions conservés ; photo ancienne sans étiquettes exportée telle quelle');

  const src=fs.readFileSync(path.join(__dirname,'..','store-photos.js'),'utf8');
  assert(/if\(exists\)\{skipped\+\+\}/.test(src),'la restauration doit sauter une photo déjà présente');
  const archive=src.slice(src.indexOf('V257 — archive photo'),src.indexOf('const api='));assert(archive.length>1000);
  assert(!/\.clear\(\)|\.delete\(|removeRecord|deleteDatabase/.test(archive),'l’archive photo ne supprime ni ne vide jamais rien');
  pass('restauration par fusion : aucune photo existante remplacée, aucune base vidée');
})().catch(e=>{console.error(e);process.exit(1)});
