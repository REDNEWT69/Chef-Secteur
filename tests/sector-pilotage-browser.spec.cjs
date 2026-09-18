const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

test('Pilotage reste dans Plus sans carte dédiée sur l’accueil à 390 px',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerSectorPilotage&&window.StoreRunnerPerformanceV190&&window.state&&document.getElementById('premiumHomeV2')&&document.getElementById('moreSheetV2'));
  await page.waitForTimeout(300);

  await page.evaluate(()=>{
    const st=window.state,P=window.StoreRunnerPerformanceV190,db=window.__chefStorage||localStorage;
    st.stores=[{id:'pilot-v220',enseigne:'Boulanger',ville:'Alpha',adresse:'1 rue Test',active:true,products:['Brun','Blanc'],intervalDays:30}];
    st.visits={};st.businessV2=Object.assign({},st.businessV2||{},{visits:[],actions:[]});
    const key=P.sourceKey('Boulanger','Alpha');
    P.writeStore(db,{version:2,imports:[{week:'W37',targetPdm:42.5,targetSource:'explicite',importedAt:'2026-09-18T12:00:00Z',rows:[{key,retailer:'Boulanger',site:'Alpha',prio:'P1',pdmYtd:21,evolYtd:-4,deltaYtd:-21.5,weeks:{},deltaWeeks:{},sellOutWeeks:{},sellOutYtd:null,sellOutWeek:null,comment:'Priorité fichier',storeId:null}]}],mapping:{[key]:'pilot-v220'},treated:{}});
    try{if(typeof save==='function')save()}catch(e){}
  });

  await expect(page.locator('#premiumHomeV2 .phPilotageShortcut')).toHaveCount(0);
  const menuShortcut=page.locator('#moreSheetV2 .moreSheetGrid [data-pilotage]');
  await expect(menuShortcut).toHaveCount(1);

  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('store-runner:home-rendered')));
  await page.waitForTimeout(80);
  await expect(page.locator('#premiumHomeV2 .phPilotageShortcut')).toHaveCount(0);
  await expect(menuShortcut).toHaveCount(1);

  await page.locator('.bottomNavBtn[data-more="1"]').click();
  await expect(menuShortcut).toBeVisible();
  await menuShortcut.click();

  const panel=page.locator('#pilotagePanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.spKpi')).toHaveCount(4);
  await expect(panel.locator('[data-sp-family="brun"]')).toBeVisible();
  await expect(panel.locator('#spBrandFilter')).toBeVisible();
  await expect(panel.locator('.spOfficialSummary')).toContainText('W37');
  await expect(panel.locator('.spOfficialSummary')).toContainText('1 P1');
  await expect(panel.locator('.spOfficial.p1')).toHaveCount(2);
  await expect(panel).toContainText('21%');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await panel.locator('[data-sp-family="brun"]').click();
  await expect(panel.locator('[data-sp-family="brun"]')).toHaveClass(/on/);
  expect(errors).toEqual([]);
});
