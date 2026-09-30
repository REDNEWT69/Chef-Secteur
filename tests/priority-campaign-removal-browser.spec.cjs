const {test,expect}=require('@playwright/test');

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({
  viewport:{width:390,height:844},
  isMobile:true,
  hasTouch:true,
  deviceScaleFactor:1,
  serviceWorkers:'block'
});

test('A4 — la campagne V187 supprimée ne laisse aucun runtime navigateur',async({page})=>{
  const demandes=[];
  const erreurs=[];
  page.on('request',request=>demandes.push(new URL(request.url()).pathname));
  page.on('pageerror',error=>erreurs.push(String((error&&error.message)||error)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!document.querySelector('#premiumHomeV2 .phTop')&&!!window.StoreRunnerUpdates,null,{timeout:30000});
  await expect.poll(()=>page.evaluate(()=>performance.getEntriesByType('resource')
    .filter(entry=>entry.initiatorType==='script').length),{
      timeout:30000,
      message:'les 74 ressources script officielles doivent finir de charger'
    }).toBe(74);

  const scripts=await page.evaluate(()=>performance.getEntriesByType('resource')
    .filter(entry=>entry.initiatorType==='script')
    .map(entry=>new URL(entry.name).pathname.split('/').pop())
    .filter(Boolean));
  const garde=await page.evaluate(()=>({
    api:typeof window.StoreRunnerPriorityCampaignV188,
    element:!!document.getElementById('priorityCampaignV187')
  }));

  expect(scripts.length,'ressources script officielles après suppression').toBe(74);
  expect(scripts.filter(name=>name==='priority-campaign-v187.js')).toEqual([]);
  expect(demandes.filter(path=>path.endsWith('/priority-campaign-v187.js'))).toEqual([]);
  expect(garde).toEqual({api:'undefined',element:false});
  expect(erreurs).toEqual([]);
});
