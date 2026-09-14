const {test,expect}=require('@playwright/test');

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'allow',screenshot:'only-on-failure',trace:'retain-on-failure'});

async function reopenQuickAndTapPhotos(page){
  await page.waitForFunction(()=>window.state&&Array.isArray(window.state.stores)&&window.state.stores.some(s=>s.id==='photo-store'));
  await page.evaluate(()=>window.openStoreQuick('photo-store','Lundi','09:30'));
  const sheet=page.locator('#storeQuickSheet'),photo=page.locator('#storePhotosQuickBtn');
  await expect(sheet).toHaveClass(/open/);
  await page.waitForTimeout(350);
  await expect(photo).toBeVisible();
  await expect(photo).toBeInViewport();
  await photo.tap();
}

test('V1 magasin : horaires Boulanger/Darty + photos persistantes et partage rapport',async({page,context})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>sessionStorage.setItem('store-runner-sw-reload:20260915-slackphotos169','1'));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.StoreRunnerVisitReport&&window.BoulangerDefaultHoursV1&&window.StoreOpeningHoursV1&&window.StoreRunnerVisitModel&&window.ChefReliability&&window.state&&typeof window.openStoreQuick==='function');
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
    st.businessV2=window.StoreRunnerVisitModel.empty();
    window.StoreRunnerVisitModel.start(st,'photo-store');
    document.dispatchEvent(new CustomEvent('store-runner:data-restored'));
    if(typeof save==='function')save();
    const persisted=window.ChefReliability.load(window.__chefStorage||window.localStorage);
    if(!persisted||!persisted.stores.some(s=>s.id==='photo-store'))throw new Error('Fixture magasin non persistée avant reload');
    if(typeof renderAll==='function')renderAll();
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
  const sheet=page.locator('#storeQuickSheet'),hoursButton=page.locator('#openingHoursQuickBtn'),photoButton=page.locator('#storePhotosQuickBtn'),pinButton=page.locator('#pinQuickStoreBtn'),fullButton=page.locator('#storeQuickSheet .sheetActions>button[onclick*="fullStoreFromQuick"]'),reportQuick=page.locator('#srReportQuickBtn');
  await expect(sheet).toHaveClass(/open/);await page.waitForTimeout(350);
  await expect(hoursButton).toBeVisible();await expect(photoButton).toBeVisible();await expect(photoButton).toBeInViewport();await expect(reportQuick).toBeVisible();
  const photoBox=await photoButton.boundingBox(),pinBox=await pinButton.boundingBox(),fullBox=await fullButton.boundingBox(),quickReportBox=await reportQuick.boundingBox();
  expect(photoBox.height).toBeGreaterThanOrEqual(44);expect(pinBox).toBeTruthy();expect(fullBox).toBeTruthy();expect(quickReportBox).toBeTruthy();
  expect(Math.abs(photoBox.y-pinBox.y)).toBeLessThanOrEqual(2);
  expect(pinBox.x+pinBox.width).toBeLessThanOrEqual(photoBox.x+2);
  expect(Math.abs(quickReportBox.y-fullBox.y)).toBeLessThanOrEqual(2);
  expect(fullBox.x+fullBox.width).toBeLessThanOrEqual(quickReportBox.x+2);

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
  const tagRows=dialog.locator('#srPhotoTags .sr-photoTagRow');
  await expect(tagRows.nth(0).locator('[data-tag="brun"]')).toHaveAttribute('aria-pressed','true');
  await tagRows.nth(1).locator('[data-tag="avant"]').tap();

  await dialog.locator('#srPhotoCameraInput').setInputFiles({name:'avant.png',mimeType:'image/png',buffer:PNG});
  await expect(dialog.locator('.sr-photoCard')).toHaveCount(1);
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoNote').fill('Avant implantation');
  await dialog.locator('.sr-photoCard').first().locator('.sr-photoNote').press('Tab');
  await expect(dialog.locator('#srPhotoStatus')).toContainText('Note photo enregistrée');
  await page.waitForTimeout(15);

  await tagRows.nth(1).locator('[data-tag="apres"]').tap();
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

  // Ticket 2B : depuis « Sortie magasin », le bouton partage exactement les photos BRUN
  // déjà comptées dans le texte, sans devoir rouvrir la galerie.
  await page.evaluate(()=>{window.__sharedStorePhotos=null});
  await expect(reportQuick).toBeVisible();await expect(reportQuick).toBeInViewport();await reportQuick.tap();
  const report=page.locator('#srReportSheet');await expect(report).toBeVisible();
  const reportBox=await report.boundingBox();expect(reportBox.x).toBeGreaterThanOrEqual(0);expect(reportBox.x+reportBox.width).toBeLessThanOrEqual(390);
  await expect(report.locator('[data-family="brun"]')).toHaveAttribute('aria-selected','true');
  await expect(report.locator('#srReportText')).toHaveValue(/1 avant \/ 1 après jointes à ce message\./);
  const shareFamily=report.locator('#srReportSharePhotos');await expect(shareFamily).toBeEnabled();await expect(shareFamily).toHaveText('Partager les 2 photos BRUN');
  const shareBox=await shareFamily.boundingBox();expect(shareBox.height).toBeGreaterThanOrEqual(44);
  await shareFamily.tap();
  await expect.poll(()=>page.evaluate(()=>window.__sharedStorePhotos&&window.__sharedStorePhotos.count)).toBe(2);
  const sharedFromReport=await page.evaluate(()=>window.__sharedStorePhotos);
  expect(sharedFromReport.title).toBe('Photos terrain · Boulanger · Lyon');
  expect(sharedFromReport.names.every(n=>n.startsWith('Boulanger-Lyon_brun_'))).toBe(true);
  expect(sharedFromReport.names.some(n=>n.includes('_avant_'))).toBe(true);
  expect(sharedFromReport.names.some(n=>n.includes('_apres_'))).toBe(true);
  await expect(report.locator('#srReportStatus')).toContainText('2 photos BRUN partagées');
  await report.locator('.sr-reportClose').tap();await expect(report).not.toBeVisible();

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.BoulangerDefaultHoursV1&&window.state&&typeof window.openStoreQuick==='function'&&window.state.stores.some(s=>s.id==='photo-store'));
  await reopenQuickAndTapPhotos(page);
  const reloadedCards=page.locator('#storePhotosDialog .sr-photoCard');
  await expect(reloadedCards).toHaveCount(2);
  await expect(reloadedCards.first().locator('.sr-photoNote')).toHaveValue('Après implantation');
  await expect(reloadedCards.nth(1).locator('.sr-photoNote')).toHaveValue('Avant implantation');
  await page.locator('#srPhotoClose').tap();

  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.BoulangerDefaultHoursV1&&window.state&&typeof window.openStoreQuick==='function'&&window.state.stores.some(s=>s.id==='photo-store'));
  await reopenQuickAndTapPhotos(page);
  await expect(page.locator('#storePhotosDialog .sr-photoCard')).toHaveCount(2);
  expect(await page.evaluate(()=>window.StoreOpeningHoursV1.openingLabel(window.state.stores.find(s=>s.id==='photo-store'),'Lundi'))).toBe('09:30–19:30');
  expect(pageErrors).toEqual([]);
});