const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V192 affiche un brief performance compact à 390 px sans toucher au planning',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPerformanceV190&&window.StoreRunnerPerformanceV192&&window.state&&window.__chefStorage);
  const result=await page.evaluate(()=>{
    const P=window.StoreRunnerPerformanceV190,A=window.StoreRunnerPerformanceV192,db=window.__chefStorage;
    const store={id:'perf-e2e',enseigne:'Boulanger',ville:'Ville Test V192',adresse:'1 rue du Test',priority:4,active:true};
    window.state.stores=[store];
    window.state.plan={Lundi:[store],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    window.state.businessV2=window.state.businessV2||{visits:[],actions:[],storeSnapshots:{}};
    const before=JSON.stringify(window.state.plan);
    P.saveSnapshot(db,{version:2,week:'W34',targetPdm:42.5,targetSource:'explicite',importedAt:'2026-09-16T12:00:00Z',rows:[{
      key:'boulanger|ville test v192',retailer:'Boulanger',site:'Ville Test V192',prio:'P1',pdmYtd:34.2,deltaYtd:-8.3,evolYtd:-6.1,
      weeks:{W32:39,W33:36,W34:32},sellOutYtd:-4200,sellOutWeeks:{W34:-900},comment:'Revoir visibilité OLED et disponibilité'
    }]});
    const host=document.createElement('div');host.id='perfV192E2E';host.style.width='100%';document.body.appendChild(host);
    const card=A.createBriefing('perf-e2e','visit');if(!card)throw new Error('Brief V192 non rendu');host.appendChild(card);
    const box=card.getBoundingClientRect();
    return{text:card.textContent,width:box.width,viewport:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,planStable:before===JSON.stringify(window.state.plan),priority:store.priority};
  });
  expect(result.text).toContain('Prio 1');expect(result.text).toContain('PDM YTD');expect(result.text).toContain('34,2 %');expect(result.text).toContain('Mission');
  expect(result.width).toBeLessThanOrEqual(result.viewport);expect(result.overflow).toBeLessThanOrEqual(1);expect(result.planStable).toBe(true);expect(result.priority).toBe(4);expect(errors).toEqual([]);
});

require('./performance-store-reconcile-v209-browser.spec.cjs');
