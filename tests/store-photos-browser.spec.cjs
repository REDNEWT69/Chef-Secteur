const {test,expect}=require('@playwright/test');

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'allow',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V1 magasin : horaires Boulanger/Darty + photos persistantes et partage rapport',async({page,context})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>sessionStorage.setItem('store-runner-sw-reload:20260913-storephotos164','1'));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.BoulangerDefaultHoursV1&&window.StoreOpeningHoursV1&&window.state&&typeof window.openStoreQuick==='function');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__sharedStorePhotos={count:(data.files||[]).length,names:(data.files||[]).map(f=>f.name),title:data.title||''}}});
  });

  await page.evaluate(()=>{
    const st=window.state;
    st.profile=Object.assign({},st.profile||{},{baseName:'Domicile test',baseAddress:'Lyon',baseLat:45.75,baseLon:4.84});
    st.settings=Object.assign({},st.settings||{},{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],startTime:'08:30',endTime:'18:00',visitMinutes:60});
    st.stores=[
      {id:'photo-store',enseigne:'Boulanger',ville:'Lyon',adresse:'1 rue Photo',dept:'69',lat:45.76,lon:4.84,active:true,priority:3},
      {id:'darty-default',enseigne:'Darty',ville:'Villeurbanne',adresse:'2 rue Photo',dept:'69',lat:45.77,lon:4.85,active:true,priority:3},
      {id:'darty-manual',enseigne:'Darty',ville:'Bron',adresse:'3 rue Photo',dept:'69',lat:45.73,lon:4.91,active:true,priority:3,openingHoursSource:'manual'}
    ];
    st.plan={Lundi:[JSON.parse(JSON.stringify(st.stores[0])),JSON.parse(JSON.stringify(st.stores[1]))],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.appointments=[];st.calendarEvents=[];
    st.businessV2={visits:[{id:'visit-photo',storeId:'photo-store',status:'draft',updatedAt:'2026-09-13T20:00:00.000Z'}],actions:[],storeSnapshots:{}};
    document.dispatchEvent(new CustomEvent('store-runner:data-restored'));
    try{if(typeof save==='function')save()}catch(_){}
    try{if(typeof renderAll==='function')renderAll()}catch(_){}
  });

  const brandHours=await page.evaluate(()=>{
    const by=id=>window.state.stores.find(s=>s.id===id);
    return{
      boulanger:window.StoreOpeningHoursV1.openingLabel(by('photo-store'),'Lundi'),
      darty:window.StoreOpeningHoursV1.openingLabel(by('darty-default'),'Samedi'),
      manual:window.StoreOpeningHoursV1.intervalsFor(by('darty-manual'),'Lundi'),
      sourceB:by('photo-store').openingHoursSource,sourceD:by('darty-default').openingHoursSource
    };
  });
  expect(brandHours.boulanger).toBe('09:30–19:30');
  expect(brandHours.darty).toBe('09:30–19:30');
  expect(brandHours.manual).toBeUndefined();
  expect(brandHours.sourceB).toBe('brand-default');expect(brandHours.sourceD).toBe('brand-default');

  await page.evaluate(()=>window.openStoreQuick('photo-store','Lundi','09:30'));
  const hoursButton=page.locator('#openingHoursQuickBtn'),photoButton=page.locator('#storePhotosQuickBtn');
  await expect(hoursButton).toBeVisible();await expect(photoButton).toBeVisible();
  const photoBox=await photoButton.boundingBox();expect(photoBox.height).toBeGreaterThanOrEqual(44);

  await hoursButton.tap();
  const hoursDialog=page.locator('#storeHoursDialog');await expect(hoursDialog).toBeVisible();
  await expect(hoursDialog.locator('#boulangerDefaultHoursHint')).toContainText('Boulanger');
  await expect(hoursDialog.locator('#boulangerDefaultHoursHint')).toContainText('09:30–19:30');
  await expect(hoursDialog.locator('[data-hours-day="Lundi"]')).toHaveValue('09:30-19:30');
  await expect(hoursDialog.locator('[data-hours-day="Samedi"]')).toHaveValue('09:30-19:30');
  await hoursDialog.locator('button[value="cancel"]').tap();await expect(hoursDialog).not.toBeVisible();

  await photoButton.tap();
  const dialog=page.locator('#storePhotosDialog');await expect(dialog).toBeVisible();
  const dbox=await dialog.boundingBox();expect(dbox.x).toBeGreaterThanOrEqual(0);expect(dbox.x+dbox.width).toBeLessThanOrEqual(390);
  await expect(dialog.locator('#srPhotoCameraInput')).toHaveAttribute('capture','environment');

  await dialog.locator('#srPhotoCameraInput').setInputFiles({name:'avant.png',mimeType:'image/png',buffer:PNG});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoNote').fill('Avant implantation');
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoNote').press('Tab');
  await expect(dialog.locator('#srPhotoStatus')).toContainText('Note photo enregistrée');
  await page.waitForTimeout(15);

  await dialog.locator('#srPhotoLibraryInput').setInputFiles({name:'apres.png',mimeType:'image/png',buffer:PNG});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(2);
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoNote').fill('Après implantation');
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoNote').press('Tab');
  await expect(dialog.locator('#srPhotoStatus')).toContainText('Note photo enregistrée');
  await expect(dialog.locator('[data-photo-select]:checked')).toHaveCount(2);

  await dialog.locator('#srComparePhotos').tap();
  const compare=dialog.locator('#srPhotoComparePanel');await expect(compare).toBeVisible();
  await expect(compare).toContainText('Avant implantation');await expect(compare).toContainText('Après implantation');
  await expect(compare.locator('img')).toHaveCount(2);

  await dialog.locator('#srSharePhotos').tap();
  await expect.poll(()=>page.evaluate(()=>window.__sharedStorePhotos&&window.__sharedStorePhotos.count)).toBe(2);
  await expect(dialog.locator('#srPhotoStatus')).toContainText('partagées');

  const overflow=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,dw:document.getElementById('storePhotosDialog').scrollWidth}));
  expect(overflow.sw).toBeLessThanOrEqual(overflow.cw+1);expect(overflow.dw).toBeLessThanOrEqual(390);
  await dialog.locator('#srPhotoClose').tap();

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.BoulangerDefaultHoursV1&&window.state&&typeof window.openStoreQuick==='function');
  await page.evaluate(()=>window.openStoreQuick('photo-store','Lundi','09:30'));
  await page.locator('#storePhotosQuickBtn').tap();
  await expect(page.locator('#storePhotosDialog .sr-photoCard')).toHaveCount(2);
  await expect(page.locator('#storePhotosDialog')).toContainText('Après implantation');
  await page.locator('#srPhotoClose').tap();

  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.BoulangerDefaultHoursV1&&window.state&&typeof window.openStoreQuick==='function');
  await page.evaluate(()=>window.openStoreQuick('photo-store','Lundi','09:30'));
  await page.locator('#storePhotosQuickBtn').tap();
  await expect(page.locator('#storePhotosDialog .sr-photoCard')).toHaveCount(2);
  expect(await page.evaluate(()=>window.StoreOpeningHoursV1.openingLabel(window.state.stores.find(s=>s.id==='photo-store'),'Lundi'))).toBe('09:30–19:30');
  expect(pageErrors).toEqual([]);
});
