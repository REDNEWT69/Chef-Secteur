const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});

test('V177 : recalcul du reste de semaine sépare les Boulanger sans perdre de magasin',async({page})=>{
  page.on('dialog',d=>d.accept());
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&typeof window.storeRunnerRecalculateRemainingWeek==='function'&&document.getElementById('recalculateRemainingWeekBtn')&&document.getElementById('planningSettingsShortcut'));
  await page.evaluate(()=>{
    const mk=(id,enseigne,ville)=>({id,enseigne,ville,adresse:'1 rue test',dept:'69',active:true,lat:45.7,lon:4.9,priority:3});
    const a=mk('b1','Boulanger','Saint-Priest'),b=mk('b2','Boulanger','Vénissieux'),f=mk('f1','Fnac','Bron'),but=mk('but1','BUT','Villeurbanne');
    const now=new Date(),nextMonday=new Date(now),weekday=now.getDay()||7,delta=(8-weekday)%7||7;nextMonday.setDate(now.getDate()+delta);
    const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    state.stores=[a,b,f,but];state.visits={};state.businessV2=state.businessV2||{visits:[],actions:[],storeSnapshots:{}};state.locks={};state.appointments=[];state.manualWeekEdits={};state.calendarEvents=[];
    state.settings=Object.assign({},state.settings,{weekDate:iso(nextMonday),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:4});
    state.plan={Lundi:[a,b,f],Mardi:[but],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const input=document.getElementById('weekDate');if(input)input.value=iso(nextMonday);
    if(window.ChefReliability)ChefReliability.propose=async candidate=>{state.plan=candidate.plan;return true};
    if(typeof renderAll==='function')renderAll();
    if(typeof goTab==='function')goTab('planPanel');
  });

  const settingsShortcut=page.locator('#planningSettingsShortcut');
  await expect(settingsShortcut).toBeVisible();
  await settingsShortcut.click();
  await expect(page.locator('#planningSettings')).toHaveJSProperty('open',true);

  const button=page.locator('#recalculateRemainingWeekBtn');
  await expect(button).toBeVisible();
  await expect(button).toContainText('Recalculer le reste de la semaine');
  const before=await page.evaluate(()=>Object.values(state.plan).flat().map(s=>s.id).sort());
  await button.click();
  await page.waitForFunction(()=>{
    const routes=Object.values(state.plan||{});
    return routes.every(route=>(route||[]).filter(s=>/boulanger/i.test(s.enseigne||'')).length<=1);
  });
  const result=await page.evaluate(()=>({
    after:Object.values(state.plan).flat().map(s=>s.id).sort(),
    routes:Object.fromEntries(Object.entries(state.plan).map(([d,r])=>[d,(r||[]).map(s=>({id:s.id,enseigne:s.enseigne}))])),
    manual:!!(state.manualWeekEdits&&Object.keys(state.manualWeekEdits).length),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
  }));
  expect(result.after).toEqual(before);
  for(const route of Object.values(result.routes))expect(route.filter(s=>/boulanger/i.test(s.enseigne)).length).toBeLessThanOrEqual(1);
  expect(result.manual).toBeTruthy();
  expect(result.overflow).toBeLessThanOrEqual(1);
});
