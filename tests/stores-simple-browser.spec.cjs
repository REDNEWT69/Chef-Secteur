const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
const hit={lat:'45.76',lon:'4.84',name:'Schmidt Centre',address:{house_number:'12',road:'rue de Test',postcode:'69002',city:'Lyon'}};
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
async function fill(page,brand='Schmidt'){
 await page.locator('#addStoreBtn').click();
 await page.locator('#createBrand').fill(brand);
 await page.locator('#createName').fill(brand+' Centre');
 await page.locator('#createCity').fill('Lyon');
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
 await page.evaluate(()=>{ChefNationalSectors.loadCatalog=async()=>state.stores});
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
test('creation preview, modify/cancel, confirmation, defaults, duplicate and reload at 390px',async({page})=>{
 await boot(page);let query='';
 await page.route('https://nominatim.openstreetmap.org/**',route=>{query=new URL(route.request().url()).searchParams.get('q');return route.fulfill({json:[hit]})});
 await fill(page);await expect(page.locator('#createStoreDlg input:visible')).toHaveCount(4);
 await page.screenshot({path:'test-results/stores-simple-form-390.png'});
 await page.locator('#locateStoreBtn').click();await expect(page.locator('#createStorePreview')).toBeVisible();
 await page.screenshot({path:'test-results/stores-simple-preview-390.png'});
 expect(query).toContain('Schmidt Centre');expect(query).toContain('Lyon');
 await expect(page.locator('#createFoundAddress')).toHaveText('12 rue de Test');
 expect(await page.evaluate(()=>state.stores.length)).toBe(4);
 await page.getByRole('button',{name:'Modifier la recherche',exact:true}).click();
 expect(await page.evaluate(()=>state.stores.length)).toBe(4);
 await page.locator('#locateStoreBtn').click();await expect(page.locator('#createStorePreview')).toBeVisible();
 await page.locator('#createStoreDlg').getByRole('button',{name:'Annuler',exact:true}).click();
 expect(await page.evaluate(()=>state.stores.length)).toBe(4);
 await fill(page);await page.locator('#locateStoreBtn').click();await expect(page.locator('#confirmCreateStore')).toBeVisible();
 const box=await page.locator('#createStoreDlg').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
 await page.locator('#confirmCreateStore').click();
 expect(await page.evaluate(()=>state.stores.at(-1))).toMatchObject({lat:45.76,lon:4.84,channel:'cuisiniste',freq:'Mensuel',intervalDays:30,priority:3,active:true,products:['À confirmer'],sourceName:'Schmidt Centre'});
 await page.reload();await page.waitForFunction(()=>window.storage&&window.state&&window.RegionStores);expect(await page.evaluate(()=>state.stores.length)).toBe(5);
 await page.evaluate(()=>goTab('storesPanel'));await fill(page);await page.locator('#locateStoreBtn').click();await expect(page.locator('#confirmCreateStore')).toBeVisible();await page.locator('#confirmCreateStore').click();
 await expect(page.locator('#createStoreStatus')).toContainText('déjà présent');expect(await page.evaluate(()=>state.stores.length)).toBe(5);
});
test('no result and cancelled pending lookup never create a store',async({page})=>{
 await boot(page);await page.route('https://nominatim.openstreetmap.org/**',r=>r.fulfill({json:[]}));
 await fill(page);await page.locator('#locateStoreBtn').click();
 await expect(page.locator('#createStoreStatus')).toHaveText('Magasin introuvable. Vérifie le nom, la ville ou l’adresse.');
 expect(await page.evaluate(()=>state.stores.length)).toBe(4);
 await page.unroute('https://nominatim.openstreetmap.org/**');
 let release;await page.route('https://nominatim.openstreetmap.org/**',async r=>{await new Promise(resolve=>release=resolve);await r.fulfill({json:[hit]})});
 await page.locator('#locateStoreBtn').click();await expect.poll(()=>!!release).toBe(true);
 await page.locator('#createStoreDlg').getByRole('button',{name:'Annuler',exact:true}).click();release();
 await page.waitForTimeout(1400);expect(await page.evaluate(()=>state.stores.length)).toBe(4);await expect(page.locator('#createStoreDlg')).toBeHidden();
});
test('AI analysis prefills sequential shared creation and ignores invented coordinates',async({page})=>{
 await boot(page);let requests=0;
 await page.route('https://nominatim.openstreetmap.org/**',r=>{requests++;return r.fulfill({json:[{...hit,lat:String(45+requests)}]})});
 await page.evaluate(()=>{aiConfig.gateway='https://example.test';callAIGateway=async()=>({stores:[{enseigne:'Schmidt',nom:'Centre',ville:'Lyon',lat:1,lon:1},{enseigne:'Darty',ville:'Lyon',lat:2,lon:2}]});document.getElementById('aiStoreText').value='Deux magasins';return aiParseStores()});
 await expect(page.locator('#createStoreProgress')).toContainText('1 / 2');await expect(page.locator('#createName')).toHaveValue('Centre');
 expect(await page.evaluate(()=>state.stores.length)).toBe(4);expect(requests).toBe(0);
 await page.locator('#locateStoreBtn').click();await expect(page.locator('#confirmCreateStore')).toBeVisible();expect(await page.evaluate(()=>state.stores.length)).toBe(4);
 await page.locator('#confirmCreateStore').click();await expect(page.locator('#createStoreProgress')).toContainText('2 / 2');
 await expect(page.locator('#createBrand')).toHaveValue('Darty');expect(await page.evaluate(()=>state.stores.at(-1).lat)).toBe(46);
 await page.locator('#locateStoreBtn').click();await expect(page.locator('#confirmCreateStore')).toBeVisible();await page.locator('#confirmCreateStore').click();
 expect(requests).toBe(2);expect(await page.evaluate(()=>state.stores.length)).toBe(6);await expect(page.locator('#createStoreDlg')).toBeHidden();
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
  await fill(page);await page.locator('#locateStoreBtn').click();
  await expect(page.locator('#createStoreStatus')).toHaveText('Localisation indisponible. Réessaie dans quelques instants.');
  expect(await page.evaluate(()=>state.stores.length)).toBe(4);
 }finally{await context.close()}
});
