/* V255 — galerie photo magasin, à 390 px.
   Fixture inventée : deux magasins de test, une ancienne visite, d'anciennes photos
   écrites directement dans IndexedDB au format d'avant V255 (sans miniature ni catégorie). */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const zlib=require('zlib');
/* Vrai PNG décodable (le PNG 1×1 des anciens specs ne l'est pas : il prend le chemin
   « stockée sans compression »). 800×600 : assez grand pour que la miniature soit réduite. */
function png(width,height){
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
  const crc=buf=>{let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){const o=y*(width*3+1);for(let x=0;x<width;x++){raw[o+1+x*3]=x&255;raw[o+2+x*3]=y&255;raw[o+3+x*3]=128}}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const PNG_FILE=png(800,600);

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

async function boot(page){
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.readyState==='complete'&&window.StorePhotosV1&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.state&&typeof window.openStore==='function');
}
/* Écrit des enregistrements tels que les versions précédentes les stockaient. */
async function seed(page,rows){
  await page.evaluate(async({rows,png})=>{
    const bytes=Uint8Array.from(png);
    const db=await window.StorePhotosV1.openDb(),tx=db.transaction('photos','readwrite'),os=tx.objectStore('photos');
    for(const r of rows){const rec=Object.assign({updatedAt:r.createdAt,note:'',moment:'',type:'image/png',width:1,height:1,size:bytes.length,originalName:''},r,{blob:new Blob([bytes],{type:'image/png'})});if(r.withThumb)rec.thumb=new Blob([bytes],{type:'image/png'});delete rec.withThumb;os.put(rec)}
    await new Promise((ok,ko)=>{tx.oncomplete=ok;tx.onerror=tx.onabort=()=>ko(tx.error)});
  },{rows,png:Array.from(PNG_FILE)});
}
async function noOverflow(page,selector){
  const box=await page.evaluate(sel=>{const d=document.querySelector(sel),r=d.getBoundingClientRect();return{left:r.left,right:r.right,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,dsw:d.scrollWidth,dcw:d.clientWidth}},selector);
  expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(390);
  expect(box.sw).toBeLessThanOrEqual(box.cw+1);expect(box.dsw).toBeLessThanOrEqual(box.dcw+1);
}
async function swipe(stage,fromX,toX){
  await stage.dispatchEvent('pointerdown',{clientX:fromX,clientY:360,pointerId:1,pointerType:'touch',isPrimary:true,bubbles:true});
  await stage.dispatchEvent('pointerup',{clientX:toX,clientY:368,pointerId:1,pointerType:'touch',isPrimary:true,bubbles:true});
}

test('V255 — visite BRUN puis BLANC classée seule, galerie filtrable, plein écran, anciennes photos, reload',async({page})=>{
  test.setTimeout(120000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  page.on('dialog',d=>d.accept().catch(()=>{}));
  await boot(page);

  const oldVisit=await page.evaluate(async()=>{
    await new Promise(r=>{const req=indexedDB.deleteDatabase('store-runner-store-photos-v1');req.onsuccess=req.onerror=req.onblocked=()=>r()});
    const M=window.StoreRunnerVisitModel,st=window.state;
    st.stores=[
      {id:'cham',enseigne:'Boulanger',ville:'Ville-Test Chambé',adresse:'1 rue Photo',dept:'99',lat:45.5,lon:5.9,active:true,priority:3,products:['Brun','Blanc']},
      {id:'annecy',enseigne:'Darty',ville:'Ville-Test Annec',adresse:'2 rue Photo',dept:'99',lat:45.9,lon:6.1,active:true,priority:3,products:['Brun','Blanc']}
    ];
    st.businessV2=M.empty();st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    const old=M.start(st,'cham');M.editVisit(st,old,'conclusion',null,'Ancienne visite de test.');M.complete(st,old,'2026-09-10');
    const v=st.businessV2.visits.find(x=>x.id===old);v.createdAt='2026-09-10T08:00:00.000Z';
    save();return old;
  });
  /* Anciennes photos, format d'avant V255 : deux BRUN liées à l'ancienne visite, une sans visite ni famille. */
  await seed(page,[
    {id:'legacy-brun-1',storeId:'cham',visitId:oldVisit,family:'brun',createdAt:'2026-09-10T09:00:00.000Z',note:'Mural ancien'},
    {id:'legacy-brun-2',storeId:'cham',visitId:oldVisit,family:'brun',createdAt:'2026-09-10T09:05:00.000Z'},
    {id:'legacy-none',storeId:'cham',visitId:null,createdAt:'2026-08-01T10:00:00.000Z'}
  ]);

  /* --- visite du jour, BRUN : la photo se range seule ------------------------ */
  await page.evaluate(()=>window.StoreRunnerVisits.start('cham'));
  const visitDialog=page.locator('#srVisitDialog');await expect(visitDialog).toBeVisible();
  const visitId=await page.evaluate(()=>window.state.businessV2.visits.find(v=>v.storeId==='cham'&&v.status==='draft').id);
  await expect(visitDialog.locator('.sr-photoEntry')).toHaveText('📷 Photos BRUN');
  await visitDialog.locator('.sr-photoEntry').tap();
  const dialog=page.locator('#storePhotosDialog');await expect(dialog).toBeVisible();
  await expect(dialog.locator('#srPhotoClearGroup')).toContainText('Visite du');
  await expect(dialog.locator('.sr-photoEmpty')).toBeVisible();
  await expect(dialog.locator('#srPhotoContext')).toContainText('BRUN');
  await expect(dialog.locator('#srPhotoContext')).toContainText('visite du');
  await dialog.locator('#srPhotoCameraInput').setInputFiles({name:'brun1.png',mimeType:'image/png',buffer:PNG_FILE});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await dialog.locator('#srPhotoCameraInput').setInputFiles({name:'brun2.png',mimeType:'image/png',buffer:PNG_FILE});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(2);
  await noOverflow(page,'#storePhotosDialog');
  await dialog.locator('#srPhotoClose').tap();await expect(dialog).not.toBeVisible();

  /* --- même visite, passage en BLANC : les photos suivantes sont BLANC -------- */
  await visitDialog.locator('.sr-familyBtn',{hasText:'BLANC'}).tap();
  await expect(visitDialog.locator('.sr-photoEntry')).toHaveText('📷 Photos BLANC');
  await visitDialog.locator('.sr-photoEntry').tap();await expect(dialog).toBeVisible();
  await expect(dialog.locator('#srPhotoTags .sr-photoTagRow').nth(0).locator('[data-tag="blanc"]')).toHaveAttribute('aria-pressed','true');
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(2);
  /* Catégorie facultative : posée une fois, jamais exigée. */
  await expect(dialog.locator('#srPendingCategory option')).toHaveCount(12);
  await dialog.locator('#srPendingCategory').selectOption('froid');
  await dialog.locator('#srPhotoLibraryInput').setInputFiles({name:'blanc.png',mimeType:'image/png',buffer:PNG_FILE});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(3);
  await expect(dialog.locator('[data-family-filter="brun"] small')).toHaveText('2');
  await expect(dialog.locator('[data-family-filter="blanc"] small')).toHaveText('1');

  const stored=await page.evaluate(async()=>(await window.StorePhotosV1.list('cham')).map(r=>({id:r.id,visitId:r.visitId,family:r.family||'',category:r.category||'',thumb:!!r.thumb,blob:!!r.blob,smaller:!!(r.thumb&&r.blob&&r.thumb.size<r.blob.size),createdAt:r.createdAt})));
  const fresh=stored.filter(r=>r.visitId===visitId);
  expect(fresh).toHaveLength(3);
  expect(fresh.filter(r=>r.family==='brun')).toHaveLength(2);
  expect(fresh.filter(r=>r.family==='blanc').map(r=>r.category)).toEqual(['froid']);
  expect(fresh.filter(r=>r.family==='brun').every(r=>r.category==='')).toBe(true);
  expect(fresh.every(r=>r.thumb&&r.blob&&r.smaller)).toBe(true);

  /* --- regroupement par visite / date --------------------------------------- */
  const groups=dialog.locator('.sr-photoGroup');
  await expect(groups).toHaveCount(3);
  const current=dialog.locator('.sr-photoGroup[data-photo-group="v:'+visitId+'"]');
  await expect(current).toHaveAttribute('aria-current','true');
  await expect(current.locator('[data-group-family="brun"]')).toHaveText('BRUN · 2');
  await expect(current.locator('[data-group-family="blanc"]')).toHaveText('BLANC · 1');
  const old=dialog.locator('.sr-photoGroup[data-photo-group="v:'+oldVisit+'"]');
  await expect(old.locator('.sr-photoGroupMain b')).toHaveText('10/09/2026');
  await expect(old.locator('[data-group-family="brun"]')).toHaveText('BRUN · 2');
  await expect(dialog.locator('.sr-photoGroup[data-photo-group="d:2026-08-01"] .sr-photoGroupMain')).toContainText('Hors visite');

  await current.locator('[data-group-family="blanc"]').tap();
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await expect(dialog.locator('.sr-photoBadge')).toHaveText('BLANC · Froid');
  await old.locator('.sr-photoGroupMain').tap();
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(2);
  await expect(dialog.locator('[data-family-filter="all"]')).toHaveAttribute('aria-pressed','true');

  /* Toutes les photos du magasin, anciennes comprises. */
  await dialog.locator('#srPhotoClearGroup').tap();
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(6);
  await expect(dialog.locator('#srPhotoSubtitle')).toHaveText('6 photos enregistrées · 2 visites');
  await dialog.locator('[data-family-filter="brun"]').tap();await expect(dialog.locator('.sr-photoCard')).toHaveCount(4);
  await dialog.locator('[data-family-filter="blanc"]').tap();await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await dialog.locator('[data-family-filter="none"]').tap();await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await expect(dialog.locator('.sr-photoCard').first()).toHaveAttribute('data-photo-id','legacy-none');
  await dialog.locator('[data-family-filter="all"]').tap();
  await dialog.locator('#srPhotoCategoryFilter').selectOption('froid');await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await dialog.locator('#srPhotoCategoryFilter').selectOption('');await expect(dialog.locator('.sr-photoCard')).toHaveCount(6);

  /* Tri récent / ancien. */
  await expect(dialog.locator('#srPhotoSort')).toHaveText('↓ Récentes');
  await dialog.locator('#srPhotoSort').tap();
  await expect(dialog.locator('#srPhotoSort')).toHaveText('↑ Anciennes');
  await expect(dialog.locator('.sr-photoCard').first()).toHaveAttribute('data-photo-id','legacy-none');
  await dialog.locator('#srPhotoSort').tap();
  await expect(dialog.locator('.sr-photoCard').last()).toHaveAttribute('data-photo-id','legacy-none');

  /* Anciennes photos : miniature ajoutée, rien d'autre ne bouge. */
  await expect.poll(()=>page.evaluate(async()=>(await window.StorePhotosV1.list('cham')).filter(r=>r.id.startsWith('legacy-')&&r.thumb).length)).toBe(3);
  const legacy=await page.evaluate(async()=>(await window.StorePhotosV1.list('cham')).filter(r=>r.id.startsWith('legacy-')).map(r=>({id:r.id,visitId:r.visitId,family:r.family,category:r.category,note:r.note,updatedAt:r.updatedAt,size:r.blob.size})).sort((a,b)=>a.id.localeCompare(b.id)));
  expect(legacy).toEqual([
    {id:'legacy-brun-1',visitId:oldVisit,family:'brun',category:undefined,note:'Mural ancien',updatedAt:'2026-09-10T09:00:00.000Z',size:PNG_FILE.length},
    {id:'legacy-brun-2',visitId:oldVisit,family:'brun',category:undefined,note:'',updatedAt:'2026-09-10T09:05:00.000Z',size:PNG_FILE.length},
    {id:'legacy-none',visitId:null,family:undefined,category:undefined,note:'',updatedAt:'2026-08-01T10:00:00.000Z',size:PNG_FILE.length}
  ]);

  /* --- plein écran, compteur, balayage -------------------------------------- */
  const viewer=page.locator('#srPhotoViewer'),stage=viewer.locator('#srViewerStage');
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoOpen').tap();
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('#srViewerCount')).toHaveText('1 / 6');
  await expect(viewer.locator('#srViewerPrev')).toBeDisabled();
  await noOverflow(page,'#srPhotoViewer');
  const vbox=await viewer.boundingBox();expect(vbox.width).toBeLessThanOrEqual(390);expect(vbox.height).toBeGreaterThan(700);
  await swipe(stage,320,80);await expect(viewer.locator('#srViewerCount')).toHaveText('2 / 6');
  await swipe(stage,320,80);await expect(viewer.locator('#srViewerCount')).toHaveText('3 / 6');
  await swipe(stage,80,320);await expect(viewer.locator('#srViewerCount')).toHaveText('2 / 6');
  await swipe(stage,200,215);await expect(viewer.locator('#srViewerCount')).toHaveText('2 / 6');
  await viewer.locator('#srViewerNext').tap();await expect(viewer.locator('#srViewerCount')).toHaveText('3 / 6');
  await expect(viewer.locator('#srViewerImg')).toHaveAttribute('src',/^blob:/);
  /* Catégorie ajoutée après coup, puis changement de famille qui la rend impossible. */
  const shownId=await viewer.getAttribute('data-photo-id');
  await viewer.locator('select[data-photo-tag="family"]').selectOption('brun');
  await viewer.locator('select[data-photo-tag="category"]').selectOption('oled');
  await expect(viewer.locator('#srViewerMeta')).toContainText('BRUN · OLED');
  await viewer.locator('select[data-photo-tag="family"]').selectOption('blanc');
  await expect(viewer.locator('select[data-photo-tag="category"]')).toHaveValue('');
  await viewer.locator('select[data-photo-tag="category"]').selectOption('mural');
  await expect.poll(()=>page.evaluate(async id=>{const r=(await window.StorePhotosV1.list('cham')).find(x=>x.id===id);return r.family+'/'+r.category},shownId)).toBe('blanc/mural');
  await viewer.locator('#srViewerBack').tap();await expect(viewer).not.toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-family-filter="blanc"] small')).toHaveText('2');

  /* --- suppression depuis le plein écran ------------------------------------ */
  await dialog.locator('.sr-photoGroup[data-photo-group="v:'+oldVisit+'"] .sr-photoGroupMain').tap();
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(2);
  await dialog.locator('.sr-photoCard[data-photo-id="legacy-brun-2"] .sr-photoOpen').tap();
  await expect(viewer.locator('#srViewerCount')).toHaveText('1 / 2');
  await viewer.locator('#srViewerDelete').tap();
  await expect(viewer.locator('#srViewerCount')).toHaveText('1 / 1');
  await expect(viewer.locator('#srViewerNote')).toHaveValue('Mural ancien');
  await viewer.locator('#srViewerBack').tap();
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  const afterDelete=await page.evaluate(async()=>(await window.StorePhotosV1.list('cham')).map(r=>r.id));
  expect(afterDelete).toHaveLength(5);expect(afterDelete).not.toContain('legacy-brun-2');
  await dialog.locator('#srPhotoClose').tap();
  await visitDialog.locator('button',{hasText:'Fermer'}).first().click().catch(()=>{});

  /* --- deuxième magasin, sans visite : classé hors visite, sans mélange ----- */
  await page.evaluate(()=>window.StorePhotosV1.open('annecy'));
  await expect(dialog.locator('.sr-photoEmpty')).toContainText('Aucune photo pour ce magasin');
  await expect(dialog.locator('#srPhotoContext')).toContainText('hors visite');
  await dialog.locator('#srPhotoCameraInput').setInputFiles({name:'annecy.png',mimeType:'image/png',buffer:PNG_FILE});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  const annecy=await page.evaluate(async()=>(await window.StorePhotosV1.list('annecy')).map(r=>({visitId:r.visitId,family:r.family})));
  expect(annecy).toEqual([{visitId:null,family:''}]);
  await dialog.locator('#srPhotoClose').tap();

  /* --- après rechargement, depuis la fiche magasin -------------------------- */
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.readyState==='complete'&&window.StorePhotosV1&&window.state&&typeof window.openStore==='function'&&window.state.stores.some(s=>s.id==='cham'));
  /* Une restauration de données ne touche jamais au stockage photo. */
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('store-runner:data-restored')));
  expect(await page.evaluate(async()=>(await window.StorePhotosV1.list('cham')).length)).toBe(5);
  await page.evaluate(()=>window.openStore('cham'));
  const storeDlg=page.locator('#storeDlg');await expect(storeDlg).toBeVisible();
  const storeButton=page.locator('#srStorePhotosBtn');await expect(storeButton).toBeVisible();
  const sbox=await storeButton.boundingBox();expect(sbox.height).toBeGreaterThanOrEqual(44);
  await storeButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#srPhotoTitle')).toHaveText('Photos · Boulanger · Ville-Test Chambé');
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(5);
  await expect(dialog.locator('.sr-photoGroup[data-photo-group="v:'+visitId+'"] [data-group-family="brun"]')).toHaveText('BRUN · 1');
  await expect(dialog.locator('.sr-photoGroup[data-photo-group="v:'+visitId+'"] [data-group-family="blanc"]')).toHaveText('BLANC · 2');
  await noOverflow(page,'#storePhotosDialog');
  await dialog.locator('#srPhotoClose').tap();
  await expect(storeDlg).toBeVisible();
  /* Nouveau magasin : pas de galerie à ouvrir. */
  await page.evaluate(()=>{document.getElementById('storeDlg').close();window.openStore(null)});
  await expect(page.locator('#srStorePhotosBtn')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('V255 — 150 photos : miniatures, chargement progressif, aucun original dans la grille',async({page})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  await boot(page);
  await page.evaluate(async()=>{
    await new Promise(r=>{const req=indexedDB.deleteDatabase('store-runner-store-photos-v1');req.onsuccess=req.onerror=req.onblocked=()=>r()});
    const st=window.state;st.stores=[{id:'big',enseigne:'Boulanger',ville:'Ville-Test Grande',adresse:'1 rue Test',dept:'99',lat:45,lon:5,active:true,priority:3}];
    st.businessV2=window.StoreRunnerVisitModel.empty();save();
  });
  const rows=[];
  for(let i=0;i<150;i++){const day=1+Math.floor(i/15);rows.push({id:'p'+String(i).padStart(3,'0'),storeId:'big',visitId:'visite-'+day,family:i%3===0?'blanc':'brun',createdAt:'2026-07-'+String(day).padStart(2,'0')+'T10:'+String(i%60).padStart(2,'0')+':00.000Z',withThumb:true})}
  await seed(page,rows);
  const t0=Date.now();
  await page.evaluate(()=>window.StorePhotosV1.open('big'));
  const dialog=page.locator('#storePhotosDialog');
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(24);
  expect(Date.now()-t0).toBeLessThan(5000);
  await expect(dialog.locator('#srPhotoSubtitle')).toHaveText('150 photos enregistrées · 10 visites');
  await expect(dialog.locator('#srPhotoMore')).toContainText('126 restantes');
  /* La grille n'utilise que des miniatures : aucune URL pour les originaux. */
  const urls=await page.evaluate(()=>[...document.querySelectorAll('#srPhotoGallery img')].filter(i=>i.src).length);
  expect(urls).toBe(24);
  /* Groupes repliés, dépliables. */
  await expect(dialog.locator('.sr-photoGroup')).toHaveCount(3);
  await dialog.getByRole('button',{name:'Tout voir (10)'}).tap();
  await expect(dialog.locator('.sr-photoGroup')).toHaveCount(10);
  /* Défilement : le paquet suivant arrive seul. */
  await page.evaluate(()=>{const d=document.getElementById('storePhotosDialog');d.scrollTop=d.scrollHeight});
  await expect.poll(()=>dialog.locator('.sr-photoCard').count()).toBeGreaterThanOrEqual(48);
  await page.evaluate(()=>{const d=document.getElementById('storePhotosDialog');d.scrollTop=d.scrollHeight});
  await expect.poll(()=>dialog.locator('.sr-photoCard').count()).toBeGreaterThanOrEqual(72);
  /* Jusqu'au bout : 150 tuiles, puis plus de bouton. */
  for(let i=0;i<8&&await dialog.locator('#srPhotoMore').isVisible();i++){await page.evaluate(()=>{const d=document.getElementById('storePhotosDialog');d.scrollTop=d.scrollHeight});await page.waitForTimeout(120)}
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(150);
  await expect(dialog.locator('#srPhotoMore')).toBeHidden();
  await page.evaluate(()=>{document.getElementById('storePhotosDialog').scrollTop=0});
  /* Le plein écran parcourt tout le filtre, pas seulement les tuiles chargées. */
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoOpen').click();
  await expect(page.locator('#srViewerCount')).toHaveText('1 / 150');
  await page.locator('#srViewerBack').click();
  /* Un filtre repart d'un seul paquet. */
  await dialog.locator('[data-family-filter="blanc"]').click();
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(24);
  await expect(dialog.locator('#srPhotoGridTitle')).toHaveText('50 photos');
  await noOverflow(page,'#storePhotosDialog');
  expect(pageErrors).toEqual([]);
});
