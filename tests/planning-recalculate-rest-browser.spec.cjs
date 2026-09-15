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
    state.stores=[a,b,f,but];state.visits={};
    state.businessV2=window.StoreRunnerVisitModel&&typeof StoreRunnerVisitModel.empty==='function'?StoreRunnerVisitModel.empty():{version:2,revision:0,visits:[],actions:[],storeSnapshots:{}};
    state.locks={};state.appointments=[];state.manualWeekEdits={};state.calendarEvents=[];
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

  const recalc=await page.evaluate(async()=>await window.storeRunnerRecalculateRemainingWeek());
  expect(recalc&&recalc.ok,JSON.stringify(recalc)).toBeTruthy();

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

test('V179 : un dépassement fixe explique les vrais crédits sans casser le planning à 390px',async({page})=>{
  page.on('dialog',d=>d.accept());
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&typeof window.storeRunnerRecalculateRemainingWeek==='function'&&document.getElementById('recalculateRemainingWeekBtn'));
  const seeded=await page.evaluate(()=>{
    const mk=(id,enseigne,ville)=>({id,enseigne,ville,adresse:'1 rue test',dept:'69',active:true,lat:45.7,lon:4.9,priority:3});
    const but=mk('but-fixed','BUT','Saint-Priest'),darty=mk('darty-fixed','Darty','Bron');
    const now=new Date(),nextMonday=new Date(now),weekday=now.getDay()||7,delta=(8-weekday)%7||7;nextMonday.setDate(now.getDate()+delta);
    const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const week=iso(nextMonday);
    state.stores=[but,darty];state.visits={};
    state.businessV2=window.StoreRunnerVisitModel&&typeof StoreRunnerVisitModel.empty==='function'?StoreRunnerVisitModel.empty():{version:2,revision:0,visits:[],actions:[],storeSnapshots:{}};
    state.locks={
      'but-fixed':{day:'Mardi',week},
      'darty-fixed':{day:'Mardi',week}
    };
    state.appointments=[];state.manualWeekEdits={};state.calendarEvents=[];
    state.settings=Object.assign({},state.settings,{weekDate:week,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:3});
    state.plan={Lundi:[],Mardi:[but,darty],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const input=document.getElementById('weekDate');if(input)input.value=week;
    if(typeof renderAll==='function')renderAll();
    if(typeof goTab==='function')goTab('planPanel');
    return{week,before:JSON.stringify(state.plan)};
  });

  const recalc=await page.evaluate(async()=>await window.storeRunnerRecalculateRemainingWeek());
  expect(recalc&&recalc.ok).toBeFalsy();
  expect(recalc.error).toContain('Mardi contient déjà 4 crédits fixes');
  expect(recalc.error).toContain('BUT Saint-Priest (2)');
  expect(recalc.error).toContain('Darty Bron (2)');
  expect(recalc.error).toContain('maximum est réglé sur 3');
  expect(recalc.error).toContain('Passe-le à 4 dans Réglages');
  expect(recalc.error).toContain('Rien n’a été changé');

  const status=page.locator('#planningGenerateStatus');
  await expect(status).toBeVisible();
  await expect(status).toContainText('4 crédits fixes');
  await expect(status).toContainText('Passe-le à 4 dans Réglages');

  const after=await page.evaluate(()=>JSON.stringify(state.plan));
  expect(after).toBe(seeded.before);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
