const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* P0.2b — dans la vraie application, à 390 px. Vendredi 06/11/2026 08:00, « Planifier plusieurs
   semaines » du 09/11 au 13/11 avec le férié du mercredi 11/11 (agenda Google « Jours fériés en
   France », Armistice 1918). Le vrai bouton « Générer la période » doit laisser le mercredi vide
   et remplir normalement les autres jours travaillés. Sur r28, V211 posait deux magasins sur le
   férié et la période était appliquée telle quelle. */
const WEEK='2026-11-09',HOLIDAY='2026-11-11',END='2026-11-13';
const HOLIDAY_EVENT={id:'fr.french#holiday@group.v.calendar.google.com:20261111_armistice',title:'Armistice 1918',location:'',calendar:'Jours fériés en France',date:HOLIDAY,start:HOLIDAY,end:'2026-11-12',allDay:true,source:'google'};

async function snapshot(page){
  return page.evaluate(()=>{
    const ids=r=>(r||[]).map(s=>String(s.id));
    const archive=JSON.parse((window.__chefStorage||localStorage).getItem('chef_sector_plan_archive_v1')||'{}');
    return{plan:Object.fromEntries(Object.entries(state.plan||{}).map(([d,r])=>[d,ids(r)])),
      weeks:Object.fromEntries(Object.entries(archive).map(([k,s])=>[k,{manualEdited:!!s.manualEdited,plan:Object.fromEntries(Object.entries(s.plan||{}).map(([d,r])=>[d,ids(r)]))}])),
      status:(document.getElementById('rangePlanStatus')||{}).textContent||'',
      global:(document.getElementById('statusText')||{}).textContent||''};
  });
}

test('P0.2b : « Générer la période » laisse vide le férié du mercredi 11/11 et remplit les autres jours',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  page.on('dialog',d=>d.accept());
  await page.clock.setFixedTime(new Date('2026-11-06T08:00:00'));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerTerrainPlanningV1&&window.StoreRunnerPlanningPilotV211&&window.StoreRunnerPartialRangeV182&&window.StoreRunnerVisitModel&&window.ChefReliability&&window.__calendarSemanticBlocks===true&&document.readyState!=='loading'&&document.querySelector('input[data-day]')&&document.getElementById('generateRangeBtn'));
  /* V182 (période partielle) et V248 (amorçage routier) enveloppent le bouton après le boot : on clique ensuite, comme un utilisateur. */
  await page.waitForFunction(()=>{const b=document.getElementById('generateRangeBtn');return !!(b&&b.__v182PartialRange&&typeof b.onclick==='function'&&b.onclick.__v248RoadPrime)},null,{timeout:15000});

  await page.evaluate(async({week,holiday})=>{
    const base={lat:45.764,lon:4.8357};
    state.stores=Array.from({length:30},(_,i)=>{const a=(i*137.508)*Math.PI/180,km=8+(i*7)%38;return{id:'s'+String(i+1).padStart(2,'0'),enseigne:'Fnac',ville:'Ville '+(i+1),adresse:(i+1)+' rue du Test',dept:'69',lat:+(base.lat+km/111*Math.cos(a)).toFixed(5),lon:+(base.lon+km/78*Math.sin(a)).toFixed(5),priority:3,active:true,intervalDays:30}});
    state.visits={};state.excluded={};state.included={};state.locks={};state.appointments=[];state.manualWeekEdits={};state.hotelReservations={};
    state.businessV2=StoreRunnerVisitModel.empty();state.calendarEvents=[holiday];
    state.profile=Object.assign({},state.profile,{baseName:'Lyon',baseLat:base.lat,baseLon:base.lon,overnightMode:'never'});
    state.settings=Object.assign({},state.settings,{weekDate:week,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:8,maxVisitsPerDay:2,startTime:'08:30',endTime:'18:00',visitMinutes:45,brands:[],products:[]});
    state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const db=window.__chefStorage||localStorage;db.setItem('chef_sector_plan_archive_v1','{}');db.removeItem('chef_sector_range_v1');
    save();if(db.flush)await db.flush();
    initControls();
    document.querySelectorAll('[data-day]').forEach(el=>{el.checked=state.settings.days.includes(el.value)});
    const target=document.getElementById('target');if(target)target.value='8';
    const max=document.getElementById('maxVisitsPerDay');if(max)max.value='2';
    readPlanningControls();state.settings.maxVisitsPerDay=2;save();
    renderAll();goTab('planPanel');
  },{week:WEEK,holiday:HOLIDAY_EVENT});
  const blocked=await page.evaluate(date=>({terrain:StoreRunnerTerrainPlanningV1.dateBlocked(date,state),rows:calendarEventsForDate(date).map(r=>r.title)}),HOLIDAY);
  expect(blocked,'le férié est le seul événement du 11/11 et le moteur terrain le bloque').toEqual({terrain:true,rows:['Armistice 1918']});

  /* 1. Réglages du planning → « Planifier plusieurs semaines » → 09/11 → 13/11. */
  await page.locator('#planningSettingsShortcut').click();
  await expect(page.locator('#planningSettings')).toHaveJSProperty('open',true);
  const card=page.locator('#rangePlannerCard');
  await card.locator('summary').click();
  await expect(card).toHaveJSProperty('open',true);
  await expect(card.locator('summary')).toContainText('Planifier plusieurs semaines');
  await page.locator('#rangeStart').fill(WEEK);
  await page.locator('#rangeEnd').fill(END);

  /* 2. Vrai bouton « Générer la période », puis validation de l'aperçu ChefReliability s'il s'ouvre. */
  await page.evaluate(()=>{window.__p02bEvents=[];document.addEventListener('store-runner:planning-updated',e=>window.__p02bEvents.push(String(e.detail&&e.detail.source||'')))});
  const button=page.locator('#generateRangeBtn');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Générer la période');
  await button.click();
  await page.waitForFunction(()=>document.querySelector('dialog.recoveryDialog[open]')||(window.__p02bEvents||[]).includes('partial-range-v182'),null,{timeout:30000});
  const preview=page.locator('dialog.recoveryDialog[open]');
  if(await preview.count()){
    await expect(preview).toContainText('Valider ce nouveau planning');
    await preview.getByRole('button',{name:'Appliquer le planning'}).click();
  }
  await page.waitForFunction(()=>(window.__p02bEvents||[]).includes('partial-range-v182'),null,{timeout:30000});
  await page.waitForTimeout(500);

  const after=await snapshot(page);
  expect(after.status,'la période est appliquée').toContain('Période appliquée');
  expect(after.weeks[WEEK],'la semaine du 09/11 est archivée').toBeTruthy();
  expect(after.weeks[WEEK].plan.Mercredi,'le férié du 11/11 reste vide dans l’archive générée').toEqual([]);
  expect(after.plan.Mercredi,'le férié du 11/11 reste vide dans le plan affiché').toEqual([]);
  for(const day of ['Lundi','Mardi','Jeudi','Vendredi'])expect(after.weeks[WEEK].plan[day].length,day+' reçoit normalement des visites').toBeGreaterThan(0);
  const all=['Lundi','Mardi','Jeudi','Vendredi'].flatMap(d=>after.weeks[WEEK].plan[d]);
  expect(new Set(all).size,'aucun magasin en double').toBe(all.length);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
