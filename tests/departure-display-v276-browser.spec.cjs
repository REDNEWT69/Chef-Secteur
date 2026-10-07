const {test,expect}=require('@playwright/test');

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});

async function ready(page){
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerProfile&&document.querySelector('#premiumHomeV2 .phDepartureTitle')&&document.querySelector('#planningDeparture'));
}

test('Accueil et Planning affichent Ville · Position précise sans muter le profil',async({page})=>{
  let reverseCalls=0;
  await page.route('https://nominatim.openstreetmap.org/reverse**',async route=>{
    reverseCalls++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      display_name:'Place Bellecour, Lyon, France',address:{city:'Lyon'}
    })});
  });
  await ready(page);
  const result=await page.evaluate(async()=>{
    state.profile=Object.assign({},state.profile,{
      sectorName:'Secteur Rhône',baseName:'Ma position actuelle',
      baseAddress:'Position GPS · 45.76400, 4.83570',baseLat:45.764,baseLon:4.8357
    });
    sessionStorage.removeItem('store-runner-departure-display-v1');
    const before=JSON.stringify(state.profile);
    await StoreRunnerProfile.refreshDepartureDisplay(state.profile);
    renderAll();
    document.dispatchEvent(new CustomEvent('store-runner:departure-display-updated'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return{before,after:JSON.stringify(state.profile),cache:sessionStorage.getItem('store-runner-departure-display-v1')};
  });
  expect(result.after).toBe(result.before);
  expect(result.cache).toContain('Lyon');
  expect(reverseCalls).toBe(1);
  await expect(page.locator('#premiumHomeV2 .phDepartureTitle')).toHaveText('Lyon · Position précise');
  await expect(page.locator('#premiumHomeV2 .phDepartureAddress')).toHaveText('');
  await expect(page.locator('#premiumHomeV2 .phSector')).toHaveCount(0);
  await expect(page.locator('#planningDeparture')).toHaveText('Lyon · Position précise');
  await expect(page.locator('#headerDeparture')).toHaveText('Lyon');
  const visible=await page.locator('#premiumHomeV2 .phHeaderContext,#planningDeparture,#headerDeparture').allTextContents();
  expect(visible.join(' ')).not.toMatch(/45[.,]764|4[.,]8357|Position GPS/);
});

test('hors ligne sans ville en cache : fallback propre sans coordonnées',async({page,context})=>{
  await ready(page);
  await context.setOffline(true);
  const snapshot=await page.evaluate(async()=>{
    state.profile=Object.assign({},state.profile,{
      baseName:'Ma position actuelle',baseAddress:'Position GPS · 48.85660, 2.35220',baseLat:48.8566,baseLon:2.3522
    });
    sessionStorage.removeItem('store-runner-departure-display-v1');
    const before=JSON.stringify(state.profile);
    const display=await StoreRunnerProfile.refreshDepartureDisplay(state.profile);
    renderHeader();renderHome();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return{before,after:JSON.stringify(state.profile),display};
  });
  expect(snapshot.after).toBe(snapshot.before);
  expect(snapshot.display).toEqual({kind:'gps',title:'Position actuelle',detail:'Position précise',address:''});
  await expect(page.locator('#planningDeparture')).toHaveText('Position actuelle · Position précise');
  await expect(page.locator('#premiumHomeV2 .phDepartureTitle')).toHaveText('Position actuelle · Position précise');
  const visible=await page.locator('#premiumHomeV2 .phHeaderContext,#planningDeparture').allTextContents();
  expect(visible.join(' ')).not.toMatch(/48[.,]8566|2[.,]3522|Position GPS/);
});
