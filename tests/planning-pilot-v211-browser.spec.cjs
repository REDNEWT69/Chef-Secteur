const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V211 expose le pilote de besoin de visite sur mobile',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerPlanningPilotV211&&window.StoreRunnerPlanningPilotV211.version===211);

  const out=await page.evaluate(()=>{
    const api=window.StoreRunnerPlanningPilotV211;
    const need=api.explain({id:'v211-browser',enseigne:'Test',ville:'Test',adresse:'Test',priority:5,intervalDays:30,lastVisit:'2026-08-01',lat:45,lon:4},'2026-10-12');
    return{version:api.version,need,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  expect(out.version).toBe(211);
  expect(out.need.tier).toBeGreaterThanOrEqual(4);
  expect(out.need.overdueDays).toBeGreaterThan(0);
  expect(out.need.reasons.length).toBeGreaterThan(0);
  expect(out.overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
