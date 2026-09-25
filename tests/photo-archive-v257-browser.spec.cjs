/* V257 — archive photo dans un vrai Chromium mobile (390 px).

   240 photos synthétiques (~29 Mo) réparties sur un an et plusieurs magasins, avec et
   sans étiquettes V255 : export .zip, base photo vidée, restauration, comparaison
   octet par octet et champ par champ, restauration répétée sans doublon, export
   découpé en plusieurs archives, rechargement, « nouvelles photos », quota plein. */
const {test,expect}=require('@playwright/test');
const crypto=require('node:crypto');
const {latestBuild}=require('../version.json');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'allow',screenshot:'only-on-failure',trace:'retain-on-failure'});
const ready=page=>page.waitForFunction(()=>document.readyState==='complete'&&window.StorePhotosV1&&window.state&&window.ChefReliability&&typeof window.goTab==='function'&&document.getElementById('photoBackupTools'),null,{timeout:30000});

/* Métadonnées + empreinte des octets, triées : ce qui doit survivre à l'aller-retour. */
const snapshot=page=>page.evaluate(async()=>{
  const db=await StorePhotosV1.openDb(),tx=db.transaction('photos','readonly'),rows=[];
  await new Promise(ok=>{const r=tx.objectStore('photos').openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return ok();rows.push(c.value);c.continue()}});
  const out=[];for(const r of rows){const d=new Uint8Array(await crypto.subtle.digest('SHA-256',await r.blob.arrayBuffer()));out.push({id:r.id,storeId:r.storeId,visitId:r.visitId||null,family:r.family||'',moment:r.moment||'',category:r.category||'',note:r.note||'',createdAt:r.createdAt,updatedAt:r.updatedAt||r.createdAt,type:r.type,size:r.blob.size,sha:Array.from(d.slice(0,8)).join('.')})}
  return out.sort((a,b)=>a.id<b.id?-1:1);
});
const clearPhotos=page=>page.evaluate(async()=>{const db=await StorePhotosV1.openDb(),tx=db.transaction('photos','readwrite');tx.objectStore('photos').clear();await new Promise(ok=>{tx.oncomplete=ok})});

test('V257 : 240 photos exportées, base vidée, restaurées à l’identique, sans doublon',async({page},testInfo)=>{
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(build=>sessionStorage.setItem('store-runner-sw-reload:'+build,'1'),latestBuild);
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});await ready(page);
  const visits=await page.evaluate(()=>{
    const st=window.state,M=window.StoreRunnerVisitModel;
    st.stores=Array.from({length:12},(_,i)=>({id:'ph-st-'+i,enseigne:['Boulanger','Darty','Fnac'][i%3],ville:'Ville-Test '+i,adresse:i+' rue Photo',lat:45+i/100,lon:4,active:true}));
    st.businessV2=M.empty();const ids=[];for(let i=0;i<6;i++)ids.push(M.start(st,'ph-st-'+i));
    save();return ids;
  });
  /* Un an de photos : 20 par mois, étiquetées ou non (photos d'avant V255 comprises). */
  await page.evaluate(async({visits})=>{
    const db=await StorePhotosV1.openDb(),fam=['brun','blanc',''],mom=['avant','apres',''],cat={brun:['oled','tv',''],blanc:['froid','lavage',''],'':['']};
    for(let i=0;i<240;i++){
      const bytes=new Uint8Array(100000+(i%40)*1000);for(let k=0;k<bytes.length;k+=97)bytes[k]=(i*7+k)&255;bytes[0]=0xFF;bytes[1]=0xD8;
      const f=fam[i%3],month=String(1+Math.floor(i/20)).padStart(2,'0'),when='2026-'+month+'-'+String(1+(i%27)).padStart(2,'0')+'T0'+(i%9)+':15:00.000Z';
      const r={id:'photo-'+String(i).padStart(3,'0'),storeId:'ph-st-'+(i%12),visitId:i%4===0?visits[i%6]:null,createdAt:when,updatedAt:when,note:i%5===0?'Note photo '+i:'',
        family:f,moment:mom[i%3],category:cat[f][i%3],blob:new Blob([bytes],{type:'image/jpeg'}),thumb:null,type:'image/jpeg',width:1600,height:1200,size:bytes.length,originalName:'IMG_'+i+'.JPG'};
      if(i%10===9){delete r.family;delete r.moment;delete r.category;delete r.updatedAt}
      const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(r);await new Promise((ok,ko)=>{tx.oncomplete=ok;tx.onerror=()=>ko(tx.error)});
    }
  },{visits});
  const original=await snapshot(page);expect(original).toHaveLength(240);

  await page.evaluate(()=>goTab('importPanel'));
  const card=page.locator('#photoBackupTools');await expect(card).toBeVisible();
  await expect(page.locator('#photoBackupInfo')).toContainText('240 photos');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);

  /* Export par l'interface : une archive. */
  const dl=page.waitForEvent('download');await card.locator('#photoExportAll').tap();
  const zipPath=testInfo.outputPath('photos.zip');await (await dl).saveAs(zipPath);
  /* Fichier passé en mémoire : un chemin disque est ignoré par certains couples Playwright/Chromium. */
  const zipFile=()=>({name:'photos.zip',mimeType:'application/zip',buffer:require('fs').readFileSync(zipPath)});
  await expect(page.locator('#photoBackupFeedback')).toContainText('240 photos exportées en 1 archive');
  await expect(page.locator('#photoBackupInfo')).toContainText('tout est exporté');

  /* Perte des photos, puis restauration par l'interface. */
  await clearPhotos(page);expect(await snapshot(page)).toEqual([]);
  await page.locator('#photoBackupFile').setInputFiles(zipFile());
  await expect(page.locator('#photoBackupFeedback')).toContainText('240 photos ajoutées',{timeout:120000});
  expect(await snapshot(page)).toEqual(original);

  /* Restaurer deux fois : aucun doublon, rien d'écrasé (une note modifiée depuis reste). */
  await page.evaluate(()=>StorePhotosV1.updateNote('photo-001','Modifiée après restauration'));
  await page.locator('#photoBackupFile').setInputFiles(zipFile());
  await expect(page.locator('#photoBackupFeedback')).toContainText('0 photo ajoutée, 240 déjà présentes',{timeout:120000});
  const after=await snapshot(page);expect(after).toHaveLength(240);
  expect(after.find(r=>r.id==='photo-001').note).toBe('Modifiée après restauration');

  /* Gros volume : découpage en archives restaurables seules. */
  const parts=await page.evaluate(async()=>{const res=await StorePhotosV1.exportArchives({maxBytes:10*1024*1024,mark:false});window.__v257Parts=res.parts.map(p=>new File([p.blob],p.name,{type:'application/zip'}));return res.parts.map(p=>({name:p.name,count:p.count,size:p.blob.size}))});
  expect(parts.length).toBeGreaterThanOrEqual(3);expect(parts.reduce((n,p)=>n+p.count,0)).toBe(240);
  expect(parts.every(p=>p.size<=11*1024*1024)).toBe(true);
  await clearPhotos(page);
  const merged=await page.evaluate(async()=>{let added=0;for(const f of window.__v257Parts.slice().reverse())added+=(await StorePhotosV1.importArchive(f)).added;return added});
  expect(merged).toBe(240);
  const reimported=await snapshot(page);
  const neutral=r=>r.id==='photo-001'?{...r,note:'',updatedAt:''}:r;
  expect(reimported.map(neutral)).toEqual(original.map(neutral));
  expect(reimported.find(r=>r.id==='photo-001').note).toBe('Modifiée après restauration');

  /* Rechargement : la base photo persiste ; « nouvelles photos » ne reprend que la nouvelle. */
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect((await snapshot(page)).length).toBe(240);
  await page.evaluate(async()=>{const db=await StorePhotosV1.openDb(),tx=db.transaction('photos','readwrite'),now=new Date().toISOString();tx.objectStore('photos').put({id:'photo-new',storeId:'ph-st-1',visitId:null,createdAt:now,updatedAt:now,note:'',family:'blanc',moment:'',category:'',blob:new Blob([new Uint8Array(5000)],{type:'image/jpeg'}),type:'image/jpeg',size:5000});await new Promise(ok=>{tx.oncomplete=ok})});
  await page.evaluate(()=>goTab('importPanel'));
  await expect(page.locator('#photoBackupInfo')).toContainText('1 nouvelle photo à exporter');
  const dl2=page.waitForEvent('download');await page.locator('#photoExportNew').tap();await dl2;
  await expect(page.locator('#photoBackupFeedback')).toContainText('1 photo exportée en 1 archive');
  await page.locator('#photoExportNew').tap();
  await expect(page.locator('#photoBackupFeedback')).toContainText('Aucune nouvelle photo à exporter');

  /* Connexion fermée par le système (iOS en arrière-plan) : la base se rouvre seule. */
  expect(await page.evaluate(async()=>{const db=await StorePhotosV1.openDb();db.onversionchange();const again=await StorePhotosV1.openDb();return again!==db&&(await StorePhotosV1.listAll()).length})).toBe(241);
  /* Mauvais fichier : refus clair, base intacte. */
  await page.locator('#photoBackupFile').setInputFiles({name:'autre.zip',mimeType:'application/zip',buffer:Buffer.from('pas une archive')});
  await expect(page.locator('#photoBackupFeedback')).toContainText('Restauration photo refusée');
  expect((await snapshot(page)).length).toBe(241);
  expect(errors).toEqual([]);
});

test('V257 : téléphone plein — la prise de photo le dit clairement',async({page})=>{
  test.setTimeout(60000);
  await page.addInitScript(build=>sessionStorage.setItem('store-runner-sw-reload:'+build,'1'),latestBuild);
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});await ready(page);
  const message=await page.evaluate(async()=>{
    state.stores=[{id:'full-st',enseigne:'Darty',ville:'Ville-Test',adresse:'1 rue',lat:45,lon:4,active:true}];save();
    const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('The quota has been exceeded.','QuotaExceededError')};
    try{const c=document.createElement('canvas');c.width=c.height=8;const blob=await new Promise(r=>c.toBlob(r,'image/png'));await StorePhotosV1.addPhoto('full-st',new File([blob],'x.png',{type:'image/png'}));return 'aucune erreur'}
    catch(e){return e.message}finally{IDBObjectStore.prototype.put=put}
  });
  expect(message).toContain('Stockage du téléphone plein');
});
