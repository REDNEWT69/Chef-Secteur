const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
async function boot(page){
 await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.RegionStores&&window.StoreRunnerStoreContacts&&window.ChefSectorAdmin&&window.state&&window.storage);
 await page.evaluate(()=>{
  state.stores=[{id:'old',enseigne:'Darty',ville:'Lyon',adresse:'1 rue Ancienne',lat:44,lon:3,type:'Gros',active:true,products:['Blanc'],priority:3},
   {id:'kitchen',enseigne:'Schmidt',ville:'Paris',adresse:'2 rue Test',lat:48.8,lon:2.3,active:true},
   {id:'kitchen-2',enseigne:' SCHMIDT ',ville:'Lyon',adresse:'3 rue Test',lat:46,lon:5,active:true},
   {id:'cuisinella',enseigne:'Cuisinella',ville:'Nantes',adresse:'4 rue Test',lat:47,lon:-1,active:true}];
  state.notes={old:'Note conservée'};state.storeContacts={old:[{name:'Alice',role:'Responsable',email:'alice@example.com'}]};
  state.settings.brands=['Darty'];state.included={old:true};state.excluded={kitchen:true};state.plan={Samedi:[]};
  save();renderAll();goTab('storesPanel');
 });
}
test('channel filters combine with search, dynamic catalog brands, preserved business state and contacts',async({page})=>{
 await boot(page);
 const before=await page.evaluate(()=>JSON.stringify({stores:state.stores,settings:state.settings,included:state.included,excluded:state.excluded,plan:state.plan}));
 await expect(page.locator('#addStoreBtn')).toBeVisible();
 expect(await page.locator('#storeChannelTabs').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 for(const button of await page.locator('#storeChannelTabs button').all()) expect(await button.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'test-results/stores-simple-list-390.png'});
 await expect(page.locator('#storeList .storeline')).toHaveCount(4);
 await page.getByRole('button',{name:'Cuisinistes',exact:true}).click();
 await expect(page.locator('#storeList .storeline')).toHaveCount(3);
 await page.locator('#storeSearch').fill('Lyon');
 await expect(page.locator('#storeList .storeline')).toHaveCount(1);
 await page.getByRole('button',{name:'Retail',exact:true}).click();
 await expect(page.locator('#storeList')).toContainText('Darty');
 await page.getByRole('button',{name:'Tous',exact:true}).click();
 await expect(page.locator('#storeList .storeline')).toHaveCount(2);
 expect(await page.evaluate(()=>JSON.stringify({stores:state.stores,settings:state.settings,included:state.included,excluded:state.excluded,plan:state.plan}))).toBe(before);
 // V261 : la gestion du secteur vit dans Données › Outils avancés, plus dans Magasins.
 await expect(page.locator('#storesPanel #sectorAdminBtn')).toHaveCount(0);
 await expect(page.locator('#storesPanel #officialCatalogBtn')).toHaveCount(0);
 await page.evaluate(()=>{ChefNationalSectors.loadCatalog=async()=>state.stores;goTab('importPanel')});
 await expect(page.locator('#sectorAdminBtn')).toBeHidden();
 await page.locator('#storeToolsAdvanced > summary').click();
 await expect(page.locator('#storeToolsHost #officialCatalogBtn')).toBeVisible();
 await page.screenshot({path:'test-results/stores-simple-advanced-tools-390.png'});
 await page.locator('#sectorAdminBtn').click();
 await expect(page.locator('#saBrandFilter option').filter({hasText:/^Schmidt$/})).toHaveCount(1);
 await page.locator('#saBrandFilter').selectOption('Schmidt');
 await expect(page.locator('#saList .catalogCard')).toHaveCount(2);
 await page.locator('dialog[open] .catalogClose').click();
 await page.evaluate(()=>openStore('old'));
 await expect(page.locator('#fLat')).toBeHidden();await expect(page.locator('#fLon')).toBeHidden();
 await page.locator('#fChannel').selectOption('cuisiniste');
 await page.evaluate(()=>saveStore());
 expect(await page.evaluate(()=>({type:state.stores[0].type,lat:state.stores[0].lat,lon:state.stores[0].lon,channel:state.stores[0].channel,contact:state.storeContacts.old[0].name}))).toEqual({type:'Gros',lat:44,lon:3,channel:'cuisiniste',contact:'Alice'});
 await page.evaluate(()=>openStore('old'));
 await page.locator('[data-sr-store-tab="contacts"]').click();
 await expect(page.locator('[data-sr-contact-email]')).toHaveValue('alice@example.com');
 await page.locator('[data-sr-contact-email]').fill('alice.updated@example.com');
 await page.evaluate(()=>StoreRunnerStoreContacts.save());
 await page.reload();await page.waitForFunction(()=>window.storage&&window.state&&window.RegionStores);
 expect(await page.evaluate(()=>state.storeContacts.old[0].email)).toBe('alice.updated@example.com');
 expect(await page.evaluate(()=>state.stores.find(s=>s.id==='old').channel)).toBe('cuisiniste');
});
test('cached PWA reload preserves stores and filters offline; lookup cannot create without a result',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
 try{
  const page=await context.newPage();
  await page.goto(APP_URL);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  // Activation may reload the page once; install the fixture after it settles.
  await boot(page);
  await context.setOffline(true);
  await page.reload();await page.waitForFunction(()=>window.storage&&window.RegionStores);
  expect(await page.evaluate(()=>state.stores.length)).toBe(4);
  await page.evaluate(()=>goTab('storesPanel'));
  await page.getByRole('button',{name:'Cuisinistes',exact:true}).click();
  await expect(page.locator('#storeList .storeline')).toHaveCount(3);
  // V261 : hors ligne, l'ajout ne lance aucune recherche et le dit simplement.
  await page.locator('#addStoreBtn').click();
  await expect(page.locator('#sraStatus')).toContainText('la recherche nécessite une connexion');
  await expect(page.locator('#storeAddDlg').getByRole('button',{name:'Saisir manuellement'})).toBeVisible();
  expect(await page.evaluate(()=>state.stores.length)).toBe(4);
 }finally{await context.close()}
});
