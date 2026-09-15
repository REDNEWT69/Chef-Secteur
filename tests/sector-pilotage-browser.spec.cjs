const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

test('Pilotage reste dans Plus sans carte dédiée sur l’accueil à 390 px',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerSectorPilotage&&document.getElementById('premiumHomeV2')&&document.getElementById('moreSheetV2'));
  await page.waitForTimeout(300);

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
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await panel.locator('[data-sp-family="brun"]').click();
  await expect(panel.locator('[data-sp-family="brun"]')).toHaveClass(/on/);
  expect(errors).toEqual([]);
});
