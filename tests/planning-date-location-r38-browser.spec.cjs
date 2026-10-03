const {test,expect}=require('@playwright/test');
const URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'});
async function setup(page,{shown='2026-09-28',denied=false,reliable=false}={}){
  await page.addInitScript(()=>{
    const Real=Date,fixed=new Real('2026-10-03T10:00:00+02:00').getTime();
    window.Date=class extends Real{constructor(...a){super(...(a.length?a:[fixed]))}static now(){return fixed}};
  });
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerTerrainPlanningV1&&window.storeRunnerGenerateThreeWeeks&&window.state);
  await page.waitForTimeout(500);
  await page.evaluate(({shown,denied,reliable})=>{
    const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    state.profile={...state.profile,baseName:reliable?'Domicile Chambéry':'Ma position actuelle',baseAddress:reliable?'10 rue de la Gare, Chambéry':'Paris, Île-de-France',baseLat:reliable?45.57:48.8566,baseLon:reliable?5.91:2.3522,overnightMode:'auto'};
    state.settings={...state.settings,weekDate:shown,days:days.slice(0,5),target:5,maxVisitsPerDay:2,startTime:'08:00',endTime:'20:00',visitMinutes:30,products:[],brands:[]};
    state.stores=Array.from({length:18},(_,i)=>({id:'r38-'+i,enseigne:'Fnac',ville:'Fixture '+i,adresse:i+' rue Fixture',active:true,lat:45.58+i*.001,lon:5.92,intervalDays:30,priority:3,products:[]}));
    state.plan=Object.fromEntries(days.map(day=>[day,[]]));state.locks={};state.visits={};state.appointments=[];state.calendarEvents=[];state.included={};state.excluded={};state.manualWeekEdits={};state.hotelReservations={};
    const db=window.__chefStorage||localStorage;db.removeItem('chef_sector_range_v1');db.setItem('chef_sector_plan_archive_v1','{}');
    window.__r38Calls=[];
    const geo={getCurrentPosition(ok,fail,opts){window.__r38Calls.push({type:'gps',options:opts});setTimeout(()=>denied?fail({code:1,message:'Permission refusée'}):ok({coords:{latitude:45.58,longitude:5.92,accuracy:5},timestamp:Date.now()}),40)}};
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:geo});
    const owner=StoreRunnerTerrainPlanningV1.generateThreeWeekSnail;
    StoreRunnerTerrainPlanningV1.generateThreeWeekSnail=async function(options){window.__r38Calls.push({type:'engine',lat:state.profile.baseLat,lon:state.profile.baseLon,start:String(options.start),today:options.today});return owner.call(this,options)};
    window.syncGoogleCalendar=async()=>({ok:true});save();initControls();renderAll();goTab('planPanel');
    const start=document.getElementById('rangeStart');if(start)delete start.dataset.snailUserEdited;
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  },{shown,denied,reliable});
}
async function generate(page){await page.locator('#planningToolsV2 [data-planning-generate="three-weeks"]').tap();}
for(const shown of ['2026-09-28','2026-10-12'])test('r38 : date réelle et GPS frais avant calcul, semaine consultée '+shown,async({page})=>{
  await setup(page,{shown});await generate(page);
  await expect(page.locator('#planningGenerateStatus')).toContainText('Planning généré sur 3 semaines',{timeout:20000});
  const result=await page.evaluate(()=>({calls:window.__r38Calls,profile:state.profile,range:JSON.parse(__chefStorage.getItem('chef_sector_range_v1')),archive:JSON.parse(__chefStorage.getItem('chef_sector_plan_archive_v1')),week:state.settings.weekDate}));
  expect(result.calls.map(x=>x.type)).toEqual(['gps','engine']);expect(result.calls[0].options.maximumAge).toBe(0);
  expect(result.calls[1].lat).toBe(45.58);expect(result.calls[1].lon).toBe(5.92);expect(result.week).toBe('2026-10-05');
  expect(result.range.start).toBe('2026-10-05');expect(result.range.end).toBe('2026-10-25');
  expect(Object.keys(result.archive).filter(key=>Object.values(result.archive[key].plan).flat().length)).toEqual(['2026-10-05','2026-10-12','2026-10-19']);
  expect(JSON.stringify(result.profile)).not.toContain('Paris');expect(result.profile.baseLat).toBe(45.58);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
test('r38 : permission refusée, base utilisateur annoncée comme repli',async({page})=>{
  await setup(page,{denied:true,reliable:true});await generate(page);
  await expect(page.locator('#planningGenerateStatus')).toContainText('Planning généré sur 3 semaines',{timeout:20000});
  await expect(page.locator('#planningGenerateStatus')).toContainText('Domicile Chambéry');
  expect(await page.evaluate(()=>window.__r38Calls.find(row=>row.type==='engine').lat)).toBe(45.57);
});
test('r38 : permission refusée et ancien GPS Paris, génération bloquée sans données écrites',async({page})=>{
  await setup(page,{denied:true});const before=await page.evaluate(()=>JSON.stringify({state,archive:__chefStorage.getItem('chef_sector_plan_archive_v1'),range:__chefStorage.getItem('chef_sector_range_v1')}));await generate(page);
  await expect(page.locator('#planningGenerateStatus')).toContainText(/localisation|position|départ/i);
  await expect(page.locator('#planningToolsV2 [data-planning-generate="three-weeks"]')).toBeEnabled();
  expect(await page.evaluate(()=>window.__r38Calls.some(row=>row.type==='engine'))).toBe(false);
  expect(await page.evaluate(()=>JSON.stringify({state,archive:__chefStorage.getItem('chef_sector_plan_archive_v1'),range:__chefStorage.getItem('chef_sector_range_v1')}))).toBe(before);
});
