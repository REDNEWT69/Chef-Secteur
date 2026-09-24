const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

async function boot(page,errors,iso){
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.clock.setFixedTime(new Date(iso));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerActivityMetrics&&window.StoreRunnerVisitModel&&window.StoreRunnerHomeV204&&document.querySelector('#premiumHomeV2 .phTitle'));
}
async function seed(page){
  await page.evaluate(()=>{
    const st=window.state;
    const S=(id,enseigne,ville)=>({id,enseigne,ville,adresse:'Adresse '+ville,dept:'69',lat:45.7,lon:4.8,active:true,priority:3,intervalDays:30});
    st.stores=[S('today','Darty','Lyon'),S('tomorrow','Boulanger','Villefranche')];
    st.profile=Object.assign({},st.profile,{baseName:'Maison',baseLat:45.75,baseLon:4.85});
    st.settings.weekDate='2026-09-21';st.settings.days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];st.settings.target=15;
    const byId=id=>st.stores.find(s=>s.id===id);
    st.plan={Lundi:[],Mardi:[],Mercredi:[byId('today')],Jeudi:[byId('tomorrow')],Vendredi:[],Samedi:[]};
    st.visits={};st.businessV2=window.StoreRunnerVisitModel.empty();
    try{save()}catch(e){}
    renderAll();
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'test-v250'}}));
    if(typeof goTab==='function')goTab('homePanel');
  });
}
async function expectHomeStack(home,runnerSelector){
  await expect(home.locator('.phBrandRow')).toBeVisible();
  await expect(home.locator('.phHeaderContext')).toBeVisible();
  await expect(home.locator('.phAssistant')).toBeVisible();
  const top=await home.locator('.phTop').boundingBox();
  const assistant=await home.locator('.phVisitCard').boundingBox();
  const runner=await home.locator(runnerSelector).boundingBox();
  const activity=await home.locator('.phActivityHeading').boundingBox();
  expect(top&&assistant&&runner&&activity).toBeTruthy();
  expect(top.y).toBeLessThan(assistant.y);
  expect(assistant.y).toBeLessThan(runner.y);
  expect(runner.y).toBeLessThan(activity.y);
}

test('V250 : avant 20 h reste sur Aujourd’hui puis bascule sur Demain dès la tournée terminée',async({page})=>{
  const errors=[];await boot(page,errors,'2026-09-23T18:00:00');await seed(page);
  const home=page.locator('#premiumHomeV2');
  await expect(home.locator('.phTitle')).toHaveText('Aujourd’hui.');
  await expect(home.locator('.phTerrain')).toHaveAttribute('data-home-terrain','active');
  expect(await home.locator('.phNextDay').count()).toBe(0);
  await expectHomeStack(home,'.phTerrain');

  await page.evaluate(()=>{markVisited('today')});
  await expect(home.locator('.phTitle')).toHaveText('Demain.');
  await expect(home.locator('.phNextDay')).toBeVisible();
  await expect(home.locator('.phNextDay')).toContainText('Boulanger Villefranche');
  await expect(home.locator('.phNextDay')).toContainText('1 magasin');
  expect(await home.locator('.phTerrain').count()).toBe(0);
  await expectHomeStack(home,'.phNextDay');

  await home.locator('.phNextOpen').click();
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  await expect(page.locator('#dayTabs .periodDayTab[data-date="2026-09-24"]')).toHaveClass(/active/);

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('V250 : après 20 h prépare Demain sans cacher une visite encore en attente',async({page})=>{
  const errors=[];await boot(page,errors,'2026-09-23T21:15:00');await seed(page);
  const home=page.locator('#premiumHomeV2');
  await expect(home.locator('.phTitle')).toHaveText('Demain.');
  await expect(home.locator('.phNextDay')).toBeVisible();
  await expect(home.locator('.phNextWarn')).toHaveText('1 visite encore en attente aujourd’hui');
  await expect(home.locator('.phNextDay')).toContainText('Boulanger Villefranche');
  expect(await home.locator('.phTerrain').count()).toBe(0);
  await expectHomeStack(home,'.phNextDay');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});