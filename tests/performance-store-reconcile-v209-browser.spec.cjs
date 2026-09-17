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
  await page.getByRole('button',{name:'＋ Ajouter ce magasin à mon secteur'}).click();
  await expect(page.locator('[data-v209-field="ville"]')).toHaveValue('AUBIERE');
  await page.locator('[data-v209-field="adresse"]').fill('10 rue des Chazots');
  await page.locator('[data-v209-field="codePostal"]').fill('63170');
  await page.locator('[data-v209-field="lat"]').fill('45.751');
  await page.locator('[data-v209-field="lon"]').fill('3.112');
  await page.getByRole('button',{name:'＋ Ajouter au secteur'}).click();
  await expect(sheet).toContainText('1 rattaché sur 1');
  const result=await page.evaluate((before)=>{
    const P=window.StoreRunnerPerformanceV190,db=window.__chefStorage,store=window.state.stores[0],mapping=P.readStore(db).mapping;
    return{count:window.state.stores.length,store,mapped:mapping['boulanger|boulanger aubiere clermont'],planStable:JSON.stringify(window.state.plan)===before,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  },before);
  expect(result.count).toBe(1);expect(result.store.enseigne).toBe('Boulanger');expect(result.store.ville).toBe('AUBIERE');expect(result.mapped).toBe(result.store.id);expect(result.planStable).toBe(true);expect(result.overflow).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
});
