const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V212 : escargot futur, durée magasin et hôtel réservé à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-18T10:00:00+02:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerTerrainPlanningV1&&window.StoreRunnerStoreControlsV189&&typeof window.storeVisitDuration==='function');

  const start=await page.evaluate(()=>{
    const field=document.getElementById('rangeStart');if(field){field.value='2026-09-14';delete field.dataset.snailUserEdited}
    return StoreRunnerTerrainPlanningV1.resolveSnailStart(state,document,new Date()).toISOString().slice(0,10);
  });
  expect(start).toBe('2026-09-21');

  await page.evaluate(()=>{
    const mk=(id,brand,visitMinutes,lat,lon)=>({id,enseigne:brand,ville:'Ville '+id,adresse:'1 rue Test',dept:'99',lat,lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc'],visitMinutes});
    state.profile=Object.assign({},state.profile,{baseName:'Base',baseAddress:'Base',baseLat:47,baseLon:1,overnightMode:'auto',overnightMinSaving:20});
    state.settings=Object.assign({},state.settings,{weekDate:'2026-09-21',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],visitMinutes:60,startTime:'08:30',endTime:'18:00',maxVisitsPerDay:4});
    state.stores=[mk('b','Boulanger',120,48.60,1),mk('c','Carrefour',45,48.62,1.02),mk('d','Darty',75,48.64,1.04),mk('e','Fnac',60,48.66,1.06)];
    state.plan={Lundi:[state.stores[0],state.stores[1]],Mardi:[state.stores[2],state.stores[3]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    state.visits={};state.notes={};state.hotelReservations={};state.included={};state.excluded={};state.locks={};state.appointments=[];state.calendarEvents=[];
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });

  expect(await page.evaluate(()=>storeVisitDuration(state.stores[0],state))).toBe(120);
  expect(await page.evaluate(()=>storeVisitDuration(state.stores[1],state))).toBe(45);
  const schedule=await page.evaluate(()=>StoreOpeningHoursV1.scheduleRoute(state.plan.Lundi,'Lundi',state,{blocks:[],appointmentFor:()=>null,travelMinutes:()=>0}));
  expect(schedule.rows.map(r=>r.duration)).toEqual([120,45]);

  await page.evaluate(()=>openStore('b'));
  await expect(page.locator('#storeDlg')).toBeVisible();
  await expect(page.locator('#fVisitMinutes')).toHaveValue('120');
  await page.locator('#fVisitMinutes').fill('135');
  await page.locator('#storeDlg button[onclick*="saveStore"]').click();
  await expect(page.locator('#storeDlg')).not.toBeVisible();
  expect(await page.evaluate(()=>state.stores.find(s=>s.id==='b').visitMinutes)).toBe(135);

  await page.evaluate(()=>{try{renderOvernight()}catch(e){throw e}});
  const box=page.locator('#overnightBox');
  await expect(box).toContainText('Zone hôtel conseillée');
  await expect(page.locator('#srHotelNameV212')).toBeVisible();
  await page.locator('#srHotelNameV212').fill('Hôtel Test Lyon Est');
  await page.locator('#srHotelRefV212').fill('RES-212-ABC');
  await page.getByRole('button',{name:'Enregistrer la réservation'}).click();
  await expect(box).toContainText('Hôtel Test Lyon Est');
  await expect(box).toContainText('RES-212-ABC');

  const saved=await page.evaluate(()=>state.hotelReservations['2026-09-21']);
  expect(saved).toMatchObject({fromDate:'2026-09-21',toDate:'2026-09-22',hotelName:'Hôtel Test Lyon Est',reference:'RES-212-ABC'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
