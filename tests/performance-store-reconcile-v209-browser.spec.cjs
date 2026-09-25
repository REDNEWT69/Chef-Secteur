const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V209 crée explicitement un magasin performance manquant sans toucher au planning',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPerformanceV190&&window.StoreRunnerPerformanceUIV190&&window.RegionStores&&window.state&&window.__chefStorage);
  const before=await page.evaluate(()=>{
    const P=window.StoreRunnerPerformanceV190,db=window.__chefStorage;
    window.state.stores=[];
    window.state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const plan=JSON.stringify(window.state.plan);
    P.saveSnapshot(db,{week:'W34',targetPdm:42.5,targetSource:'explicite',importedAt:'2026-09-17T12:00:00Z',rows:[{key:'boulanger|boulanger aubiere clermont',retailer:'BOULANGER',site:'BOULANGER AUBIERE / Clermont',prio:'P1',pdmYtd:24.2,deltaYtd:-18.3,evolYtd:-42.5,weeks:{W34:25.8},sellOutWeeks:{},comment:''}]});
    window.StoreRunnerPerformanceUIV190.open();return plan;
  });
  const sheet=page.locator('#srPerfSheet');await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('0 rattaché sur 1');
  // V261 : le magasin manquant passe par l'écran unique d'ajout, recherche préremplie.
  const queries=[];
  await page.route('https://nominatim.openstreetmap.org/**',route=>{queries.push(new URL(route.request().url()).searchParams.get('q'));return route.fulfill({json:[{osm_type:'node',osm_id:9209,lat:'45.751',lon:'3.112',category:'shop',type:'electronics',name:'Boulanger Aubière',address:{house_number:'10',road:'Rue des Chazots',town:'Aubière',postcode:'63170'},extratags:{brand:'Boulanger'},namedetails:{}}]})});
  await page.getByRole('button',{name:'＋ Ajouter ce magasin à mon secteur'}).click();
  const add=page.locator('#storeAddDlg');await expect(add).toBeVisible();
  await expect(page.locator('#sraQuery')).toHaveValue('BOULANGER AUBIERE / Clermont');
  await add.locator('.sraResult').first().click();
  await expect(add.locator('[data-sra-address]')).toHaveText('10 Rue des Chazots');
  expect(await page.evaluate(()=>window.state.stores.length)).toBe(0);
  await add.getByRole('button',{name:'Ajouter ce magasin'}).click();
  await add.getByRole('button',{name:'Terminé'}).click();await expect(add).toBeHidden();
  expect(queries).toEqual(['BOULANGER AUBIERE / Clermont']);
  await expect(sheet).toContainText('1 rattaché sur 1');
  const result=await page.evaluate((before)=>{
    const P=window.StoreRunnerPerformanceV190,db=window.__chefStorage,store=window.state.stores[0],mapping=P.readStore(db).mapping;
    return{count:window.state.stores.length,store,mapped:mapping['boulanger|boulanger aubiere clermont'],planStable:JSON.stringify(window.state.plan)===before,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  },before);
  expect(result.count).toBe(1);expect(result.store.enseigne).toBe('Boulanger');expect(result.store.ville).toBe('Aubière');expect(result.store.lat).toBe(45.751);expect(result.mapped).toBe(result.store.id);expect(result.planStable).toBe(true);expect(result.overflow).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
});
