/* V201 — déplacer des photos vers un autre magasin, à 390 px.
   Fixture inventée : deux magasins de test et deux photos prises dans le mauvais. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('Photos : déplacer la sélection vers le bon magasin à 390 px',async({page})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  page.on('dialog',d=>d.accept().catch(()=>{}));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.state&&typeof window.openStoreQuick==='function');

  await page.evaluate(async()=>{
    /* Base photo vierge : le scénario ne doit rien hériter d'un essai précédent. */
    await new Promise(r=>{const req=indexedDB.deleteDatabase('store-runner-store-photos-v1');req.onsuccess=req.onerror=req.onblocked=()=>r()});
    const st=window.state;
    st.stores=[
      {id:'mauvais',enseigne:'Enseigne A',ville:'Ville-Test 01',adresse:'1 rue Test',dept:'99',lat:47.1,lon:1,active:true,priority:3},
      {id:'bon',enseigne:'Enseigne B',ville:'Ville-Test 02',adresse:'2 rue Test',dept:'99',lat:47.2,lon:1,active:true,priority:3},
      {id:'inactif',enseigne:'Enseigne C',ville:'Ville-Test 03',adresse:'3 rue Test',dept:'99',lat:47.3,lon:1,active:false,priority:3}
    ];
    st.plan={Lundi:[JSON.parse(JSON.stringify(st.stores[0]))],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.businessV2=st.businessV2||{visits:[],actions:[],storeSnapshots:{}};
    st.businessV2.visits=[{id:'visite-mauvais',storeId:'mauvais',status:'draft',updatedAt:'2026-09-17T08:00:00Z',activeFamily:'blanc'}];
    st.excluded={};st.included={};st.locks={};
    try{save()}catch(e){}try{renderAll()}catch(e){}
  });

  /* --- deux photos prises dans le mauvais magasin ------------------------ */
  await page.evaluate(()=>window.StorePhotosV1.open('mauvais'));
  const dialog=page.locator('#storePhotosDialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#srPhotoCameraInput').setInputFiles({name:'une.png',mimeType:'image/png',buffer:PNG});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await dialog.locator('#srPhotoLibraryInput').setInputFiles({name:'deux.png',mimeType:'image/png',buffer:PNG});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(2);

  /* on étiquette la première, pour vérifier que l'étiquette survit au voyage */
  /* V255 — étiquettes posées depuis la visionneuse plein écran. */
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoOpen').click();
  const viewer=page.locator('#srPhotoViewer');await expect(viewer).toBeVisible();
  await viewer.locator('select[data-photo-tag="family"]').selectOption('brun');
  await expect(viewer.locator('#srViewerStatus')).toContainText('Étiquette photo enregistrée');
  await viewer.locator('select[data-photo-tag="moment"]').selectOption('apres');
  await expect(viewer.locator('#srViewerStatus')).toContainText('Étiquette photo enregistrée');
  await viewer.locator('#srViewerBack').click();await expect(viewer).not.toBeVisible();
  await page.waitForTimeout(100);

  /* --- le bouton n'apparaît que si une photo est cochée ------------------ */
  await page.evaluate(()=>{
    document.querySelectorAll('#storePhotosDialog input[data-photo-select]').forEach(c=>{
      if(c.checked){c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}))}
    });
  });
  await expect(page.locator('#srPhotoMoveBar')).toBeHidden();

  await page.evaluate(()=>{
    const c=document.querySelector('#storePhotosDialog input[data-photo-select]');
    c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const bar=page.locator('#srPhotoMoveBar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('#srMovePhotos')).toHaveText('Déplacer la photo sélectionnée');
  const boite=await bar.locator('#srMovePhotos').boundingBox();
  expect(boite.height).toBeGreaterThanOrEqual(44);

  /* --- on coche les deux et on déplace ----------------------------------- */
  await page.evaluate(()=>{
    document.querySelectorAll('#storePhotosDialog input[data-photo-select]').forEach(c=>{
      if(!c.checked){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))}
    });
  });
  await expect(bar.locator('#srMovePhotos')).toHaveText('Déplacer les 2 photos sélectionnées');
  await bar.locator('#srMovePhotos').click();

  const sheet=page.locator('#srPhotoMoveDialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('#srPhotoMoveCount')).toContainText('2 photos');

  /* le magasin courant et l'inactif ne sont pas proposés */
  const destinations=await sheet.locator('.sr-photoMoveItem').evaluateAll(n=>n.map(b=>b.dataset.moveTarget));
  expect(destinations).toEqual(['bon']);

  /* déplacer sans choisir refuse proprement */
  await sheet.locator('#srPhotoMoveConfirm').click();
  await expect(sheet.locator('#srPhotoMoveStatus')).toHaveText('Choisis le magasin de destination.');
  await expect(sheet).toBeVisible();

  /* la recherche filtre */
  await sheet.locator('#srPhotoMoveSearch').fill('Ville-Test 02');
  await expect(sheet.locator('.sr-photoMoveItem')).toHaveCount(1);
  await sheet.locator('#srPhotoMoveSearch').fill('introuvable');
  await expect(sheet.locator('.sr-photoMoveEmpty')).toBeVisible();
  await sheet.locator('#srPhotoMoveSearch').fill('');

  await sheet.locator('.sr-photoMoveItem[data-move-target="bon"]').click();
  await expect(sheet.locator('.sr-photoMoveItem[data-move-target="bon"]')).toHaveAttribute('aria-pressed','true');

  /* aucun débordement horizontal dans la feuille à 390 px */
  const deborde=await page.evaluate(()=>{
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth)return'page';
    const bad=[...document.querySelectorAll('#srPhotoMoveDialog *')].find(e=>e.scrollWidth>e.clientWidth+2&&e.clientWidth>0&&getComputedStyle(e).overflowY!=='auto');
    return bad?(bad.className||bad.tagName):'';
  });
  expect(deborde).toBe('');

  await sheet.locator('#srPhotoMoveConfirm').click();
  await expect(sheet).toBeHidden();

  /* --- le mauvais magasin est vide, le bon a tout ------------------------ */
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(0);
  await expect(dialog.locator('.sr-photoEmpty')).toBeVisible();
  await expect(dialog.locator('#srPhotoStatus')).toHaveText('2 photos déplacées vers Enseigne B · Ville-Test 02.');
  await expect(page.locator('#srPhotoMoveBar')).toBeHidden();

  const apres=await page.evaluate(async()=>{
    const rows=await window.StorePhotosV1.list('bon');
    return {
      compte:rows.length,
      restantMauvais:(await window.StorePhotosV1.list('mauvais')).length,
      familles:rows.map(r=>r.family+'/'+r.moment).sort(),
      visitIds:rows.map(r=>r.visitId),
      blobs:rows.every(r=>r.blob&&r.blob.size>0),
      dates:rows.every(r=>!!r.createdAt)
    };
  });
  expect(apres.compte).toBe(2);
  expect(apres.restantMauvais).toBe(0);
  /* « blanc » vient de la famille active de la visite en cours au moment de la prise,
     « brun/apres » de l'étiquetage manuel : les deux traversent le déplacement intacts. */
  expect(apres.familles).toEqual(['blanc/','brun/apres']);
  expect(apres.visitIds).toEqual([null,null]);
  expect(apres.blobs).toBe(true);
  expect(apres.dates).toBe(true);

  /* --- elles sont bien visibles dans le bon magasin ---------------------- */
  await page.evaluate(()=>window.StorePhotosV1.open('bon'));
  await expect(dialog.locator('#srPhotoTitle')).toHaveText('Photos · Enseigne B · Ville-Test 02');
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(2);

  expect(pageErrors).toEqual([]);
});
