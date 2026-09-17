const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V210 partage une métrique aller-retour entre routeCost et le banc planning',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerPlanningQualityV210&&typeof window.routeCost==='function');

  const out=await page.evaluate(()=>{
    const originalHav=window.hav,originalBase=window.baseObj;
    try{
      window.hav=(a,b)=>Math.abs(Number(a.x||0)-Number(b.x||0));
      window.baseObj=()=>({id:'BASE',x:0});
      const route=[{id:'a',x:1,intervalDays:30},{id:'b',x:2,intervalDays:30}];
      state.settings=Object.assign({},state.settings,{days:['Lundi'],startTime:'08:30',endTime:'18:00',visitMinutes:60});
      state.stores=route.slice();state.plan={Lundi:route.slice()};state.visits={};
      const metrics=window.StoreRunnerPlanningQualityV210.measure(state.plan,{today:'2026-09-17'});
      return{cost:window.routeCost(route),api:window.storeRunnerRoundTripRouteKm(route),marker:!!window.routeCost.__v210RoundTrip,metrics};
    }finally{window.hav=originalHav;window.baseObj=originalBase}
  });

  expect(out.marker).toBe(true);
  expect(out.cost).toBe(4);
  expect(out.api).toBe(4);
  expect(out.metrics.totalKm).toBe(4);
  expect(out.metrics.plannedStores).toBe(2);
  expect(out.metrics.infeasibleDayCount).toBe(0);
  expect(errors).toEqual([]);
});
