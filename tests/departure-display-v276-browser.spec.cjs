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
  const headerTooltip=await page.locator('#headerDeparture').getAttribute('title');
  expect(headerTooltip).toContain('Lyon');
  expect(headerTooltip).not.toMatch(/45[.,]764|4[.,]8357|Position GPS/);
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
  const headerTooltip=await page.locator('#headerDeparture').getAttribute('title');
  expect(headerTooltip).not.toMatch(/48[.,]8566|2[.,]3522|Position GPS/);
});

test('une base enregistrée au nom générique conserve son adresse utile',async({page})=>{
  await ready(page);
  await page.evaluate(async()=>{
    state.profile=Object.assign({},state.profile,{
      baseName:'Maison',baseAddress:'12 rue Test, Lyon',baseLat:45.75,baseLon:4.85
    });
    renderAll();
    document.dispatchEvent(new CustomEvent('store-runner:profile-saved'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await expect(page.locator('#headerDeparture')).toHaveText('12 rue Test, Lyon');
  await expect(page.locator('#premiumHomeV2 .phDepartureAddress')).toHaveText('12 rue Test, Lyon');
  await expect(page.locator('#premiumHomeV2 .phDepartureTitle')).toHaveText('Départ');
});

test('une restauration avec une autre position GPS relance la résolution de ville',async({page})=>{
  let reverseCalls=0;
  await page.route('https://nominatim.openstreetmap.org/reverse**',async route=>{
    reverseCalls++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      display_name:'Annemasse, Haute-Savoie, France',address:{city:'Annemasse'}
    })});
  });
  await ready(page);
  await page.evaluate(()=>{
    sessionStorage.removeItem('store-runner-departure-display-v1');
    state.profile=Object.assign({},state.profile,{
      baseName:'Ma position actuelle',
      baseAddress:'Position GPS · 46.19560, 6.23640',
      baseLat:46.1956,baseLon:6.2364
    });
    document.dispatchEvent(new CustomEvent('store-runner:data-restored'));
  });
  await expect(page.locator('#planningDeparture')).toHaveText('Annemasse · Position précise');
  await expect(page.locator('#premiumHomeV2 .phDepartureTitle')).toHaveText('Annemasse · Position précise');
  expect(reverseCalls).toBeGreaterThanOrEqual(1);
});


test('Position reste en place et Google Agenda · Connecter forme une vraie ligne',async({page})=>{
  await ready(page);
  await expect(page.locator('#calendarHomeStatus')).toBeVisible();
  await expect(page.locator('#calendarHomeStatus .calendarHomeLine')).toBeVisible();
  const layout=await page.evaluate(()=>{
    const host=document.querySelector('#premiumHomeV2 .phHeaderContext');
    const line=document.querySelector('#calendarHomeStatus .calendarHomeLine');
    const title=line&&line.querySelector('strong');
    const action=line&&line.querySelector('button');
    const tr=title&&title.getBoundingClientRect(),ar=action&&action.getBoundingClientRect();
    const style=line&&getComputedStyle(line);
    return{
      transform:host?getComputedStyle(host).transform:'none',
      display:style&&style.display,
      flexWrap:style&&style.flexWrap,
      alignItems:style&&style.alignItems,
      titleCenter:tr&&tr.top+tr.height/2,
      buttonCenter:ar&&ar.top+ar.height/2,
      gap:tr&&ar?ar.left-tr.right:null,
      buttonHeight:ar&&ar.height
    };
  });
  expect(layout.transform).not.toBe('none');
  expect(layout.display).toContain('flex');
  expect(layout.flexWrap).toBe('nowrap');
  expect(layout.alignItems).toBe('center');
  expect(Math.abs(layout.titleCenter-layout.buttonCenter)).toBeLessThanOrEqual(1);
  expect(layout.gap).toBeGreaterThanOrEqual(0);
  expect(layout.gap).toBeLessThanOrEqual(12);
  expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
});
