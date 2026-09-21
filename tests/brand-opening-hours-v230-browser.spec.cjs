const {test,expect}=require('@playwright/test');
const {latestBuild}=require('../version.json');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'allow',screenshot:'only-on-failure',trace:'retain-on-failure'});
const ready=page=>page.waitForFunction(()=>document.readyState==='complete'&&window.state&&window.StoreOpeningHoursV1&&window.StoreBrandDefaultHoursV1&&typeof window.goTab==='function');
async function boot(page){
  await page.addInitScript(build=>sessionStorage.setItem('store-runner-sw-reload:'+build,'1'),latestBuild);
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});await ready(page);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&document.readyState==='complete');
}
async function fixture(page){
  await page.evaluate(()=>{
    const st=window.state;st.stores=[
      {id:'brand-test-a',enseigne:'Darty',ville:'Ville Test A',adresse:'1 rue Fictive',lat:45,lon:4,active:true},
      {id:'brand-test-b',enseigne:' DÁR-TY. ',ville:'Ville Test B',adresse:'2 rue Fictive',lat:45.001,lon:4,active:true},
      {id:'brand-test-custom',enseigne:'Darty',ville:'Ville Test C',adresse:'3 rue Fictive',lat:45.002,lon:4,active:true,openingHoursSource:'manual',openingHours:{Lundi:[{open:'11:00',close:'18:00'}]}},
      {id:'brand-test-other',enseigne:'Magasin Test',ville:'Ville Test D',adresse:'4 rue Fictive',lat:45,lon:4,active:true}
    ];
    st.profile={...st.profile,baseName:'Base Test',baseAddress:'1 place Fictive',baseLat:45,baseLon:4};
    st.settings={...st.settings,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:10,startTime:'08:30',endTime:'18:00',visitMinutes:60,weekDate:'2026-09-21'};
    st.plan={Lundi:[{id:'brand-test-a'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};st.appointments=[];st.calendarEvents=[];st.visits={};st.notes={};st.locks={};st.included={};st.excluded={};
    delete st.brandOpeningHours;save();renderAll();goTab('planPanel');
  });
}
async function geometry(dialog){
  const metrics=await dialog.evaluate(d=>({left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right,overflow:d.scrollWidth>d.clientWidth+1,controls:[...d.querySelectorAll('button,input[type="text"],select')].filter(el=>!el.hidden&&el.getClientRects().length).map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,right:el.getBoundingClientRect().right,font:parseFloat(getComputedStyle(el).fontSize),tag:el.tagName}))}));
  expect(metrics.left).toBeGreaterThanOrEqual(0);expect(metrics.right).toBeLessThanOrEqual(390);expect(metrics.overflow).toBe(false);
  for(const c of metrics.controls){expect(c.height).toBeGreaterThanOrEqual(44);expect(c.right).toBeLessThanOrEqual(metrics.right);if(c.tag==='INPUT')expect(c.font).toBeGreaterThanOrEqual(16)}
}

test('V230 : modèle, exceptions, restauration et hors ligne à 390 px',async({page,context},testInfo)=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);await fixture(page);
  // Accès par les réglages existants.
  await page.locator('#planningSettingsShortcut').tap();
  await page.locator('#brandOpeningHoursBtn').tap();
  const brand=page.locator('#brandHoursDialog'),monday=brand.locator('[data-brand-hours-day="Lundi"]');
  await expect(brand).toBeVisible();await brand.locator('#brandHoursSelect').selectOption('darty');
  await expect(brand.locator('#brandHoursCount')).toContainText('3 magasins');
  await expect(brand.locator('#brandHoursCount')).toContainText('1 avec horaires personnalisés');
  await expect(monday).toHaveValue('');await expect(brand.locator('[data-brand-hours-day="Dimanche"]')).toHaveValue('fermé');
  await geometry(brand);
  await monday.fill('09:30-08:30');await brand.locator('#saveBrandHours').tap();
  await expect(brand.locator('#brandHoursError')).toContainText('invalide');
  expect(await page.evaluate(()=>state.brandOpeningHours)).toBeUndefined();
  await monday.fill('09:30-12:30,14:00-19:30');await brand.locator('#copyBrandMondayHours').tap();
  await expect(brand.locator('[data-brand-hours-day="Samedi"]')).toHaveValue('09:30-12:30,14:00-19:30');
  await expect(brand.locator('[data-brand-hours-day="Dimanche"]')).toHaveValue('fermé');
  await brand.locator('[data-brand-hours-day="Mardi"]').fill('fermé');
  await brand.locator('[data-brand-hours-day="Jeudi"]').fill('');
  await page.screenshot({path:testInfo.outputPath('brand-hours-390.png')});
  const before=await page.evaluate(()=>JSON.stringify(state.stores));
  await page.evaluate(()=>{window.__v230Save=window.save;window.save=()=>{throw Error('Quota test V230')}});
  await brand.locator('#saveBrandHours').tap();await expect(brand.locator('#brandHoursError')).toContainText('Quota test V230');
  expect(await page.evaluate(()=>state.brandOpeningHours)).toBeUndefined();
  await page.evaluate(()=>{window.save=window.__v230Save;delete window.__v230Save});
  await brand.locator('#saveBrandHours').tap();await expect(brand).not.toBeVisible();
  expect(await page.evaluate(()=>JSON.stringify(state.stores))).toBe(before);
  expect(await page.evaluate(()=>state.brandOpeningHours.darty.Jeudi)).toBeUndefined();
  expect(await page.evaluate(()=>state.brandOpeningHours.darty.Dimanche)).toEqual([]);
  expect(await page.evaluate(()=>state.settings.days.includes('Dimanche'))).toBe(false);
  expect(await page.evaluate(()=>state.settings.target)).toBe(10);
  await expect.poll(()=>page.locator('#week .tlTime').first().textContent()).toBe('09:30');
  await expect(page.locator('#openingHoursDaySummary')).toContainText('fin estimée');

  // Modification : tous les héritiers changent, aucun override ne bouge.
  await page.locator('#brandOpeningHoursBtn').tap();await brand.locator('#brandHoursSelect').selectOption('darty');
  await expect(monday).toHaveValue('09:30-12:30,14:00-19:30');await monday.fill('10:30-19:00');
  await brand.locator('#saveBrandHours').tap();await expect(brand).not.toBeVisible();
  const effective=await page.evaluate(()=>state.stores.slice(0,3).map(s=>StoreOpeningHoursV1.openingLabel(s,'Lundi')));
  expect(effective).toEqual(['10:30–19:00','10:30–19:00','11:00–18:00']);
  expect(await page.evaluate(()=>JSON.stringify(state.stores))).toBe(before);

  const store=page.locator('#storeHoursDialog');
  await page.evaluate(()=>StoreOpeningHoursV1.openHoursDialog('brand-test-b'));
  await expect(store.locator('#storeHoursInheritance')).toContainText('Hérite de l’enseigne');
  await expect(store.locator('[data-hours-day="Lundi"]')).toHaveValue('');
  await expect(store).toContainText('Actuellement : 10:30–19:00');await geometry(store);
  await store.locator('button[value="cancel"]').tap();
  await page.evaluate(()=>StoreOpeningHoursV1.openHoursDialog('brand-test-custom'));
  await expect(store.locator('#storeHoursInheritance')).toContainText('Horaires personnalisés');
  await page.screenshot({path:testInfo.outputPath('store-hours-390.png')});
  const model=await page.evaluate(()=>JSON.stringify(state.brandOpeningHours));
  await store.locator('#resetStoreHours').tap();await expect(store).not.toBeVisible();
  expect(await page.evaluate(()=>state.stores[2].openingHours)).toBeUndefined();
  expect(await page.evaluate(()=>StoreOpeningHoursV1.openingLabel(state.stores[2],'Lundi'))).toBe('10:30–19:00');
  expect(await page.evaluate(()=>JSON.stringify(state.brandOpeningHours))).toBe(model);

  // Export réel puis restauration par l'interface existante.
  const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>window.exportFull());
  const download=await downloadEvent,path=testInfo.outputPath('synthetic-backup.json');await download.saveAs(path);
  await page.evaluate(()=>{StoreOpeningHoursV1.setBrandModel('Darty',{Lundi:[]});save();StoreOpeningHoursV1.openBrandHoursDialog('Darty')});
  // Le dialogue de saisie est fermé par data-restored ; fermer avant le dialogue de confirmation.
  await brand.locator('button[value="cancel"]').tap();
  await page.locator('#restoreBackupFile').setInputFiles(path);
  const confirm=page.getByRole('button',{name:'Restaurer',exact:true});await expect(confirm).toBeVisible();await confirm.tap();
  await expect.poll(()=>page.evaluate(()=>JSON.stringify(state.brandOpeningHours))).toBe(model);
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await page.evaluate(()=>JSON.stringify(state.brandOpeningHours))).toBe(model);
  await expect.poll(()=>page.evaluate(async()=>!!await caches.match(new URL('./store-opening-hours.js',location.href).href,{ignoreSearch:true}))).toBe(true);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await page.evaluate(()=>StoreOpeningHoursV1.openingLabel(state.stores[1],'Lundi'))).toBe('10:30–19:00');
  await page.evaluate(()=>StoreOpeningHoursV1.openBrandHoursDialog('Darty'));await monday.fill('12:00-19:00');
  await monday.press('Enter');await expect(brand).not.toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await page.evaluate(()=>StoreOpeningHoursV1.openingLabel(state.stores[1],'Lundi'))).toBe('12:00–19:00');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.locator('.bottomNavBtn[data-panel="planPanel"]').tap();await expect(page.locator('#planPanel')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('V230 : modèle durable via IndexedDB et rejet d’une écriture interrompue',async({page})=>{
  test.setTimeout(60000);
  await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='__chef_storage_test__')throw Error('localStorage désactivé pour le test');return original.call(this,key,value)}});
  await boot(page);await fixture(page);
  expect(await page.evaluate(()=>window.__chefStorageMode)).toBe('indexedDB');
  await page.evaluate(()=>StoreOpeningHoursV1.openBrandHoursDialog('Darty'));
  const d=page.locator('#brandHoursDialog');await d.locator('[data-brand-hours-day="Lundi"]').fill('10:00-19:00');
  await d.locator('#saveBrandHours').tap();await expect(d).not.toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await page.evaluate(()=>StoreOpeningHoursV1.openingLabel(state.stores[1],'Lundi'))).toBe('10:00–19:00');
  await page.evaluate(()=>{StoreOpeningHoursV1.openBrandHoursDialog('Darty');window.__v230Flush=__chefStorage.flush;__chefStorage.flush=async()=>{throw Error('Transaction interrompue V230')}});
  await d.locator('[data-brand-hours-day="Lundi"]').fill('11:00-19:00');await d.locator('#saveBrandHours').tap();
  await expect(d.locator('#brandHoursError')).toContainText('Transaction interrompue V230');
  expect(await page.evaluate(()=>StoreOpeningHoursV1.openingLabel(state.stores[1],'Lundi'))).toBe('10:00–19:00');
  await page.evaluate(()=>{__chefStorage.flush=window.__v230Flush;delete window.__v230Flush;return __chefStorage.flush()});
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await page.evaluate(()=>StoreOpeningHoursV1.openingLabel(state.stores[1],'Lundi'))).toBe('10:00–19:00');
});
