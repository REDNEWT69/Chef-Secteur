const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});
test('r38 : semaine historique, nuit future datée, retour historique sans bandeau périmé',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-03T09:00:00')});
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPeriodDaySlider&&window.StoreRunnerStoreControlsV189&&window.state);
  await page.clock.runFor(1500);
  await page.evaluate(()=>{
    const a={id:'r38-a',enseigne:'Enseigne Test',ville:'Zone distante A',lat:48.6,lon:1,active:true,priority:3,products:['Blanc']};
    const b={...a,id:'r38-b',ville:'Zone distante B',lat:48.62,lon:1.02};
    const blank=()=>({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});
    state.profile={...state.profile,baseName:'Base test',baseAddress:'Base test',baseLat:47,baseLon:1,overnightMode:'auto',overnightMinSaving:40};
    state.settings={...state.settings,weekDate:'2026-09-28',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']};
    state.plan=blank();state.stores=[a,b];state.included={};state.excluded={};state.locks={};state.calendarEvents=[];state.appointments=[];state.hotelReservations={};
    const future=blank();future.Mardi=[a];future.Mercredi=[b];
    __chefStorage.setItem('chef_sector_plan_archive_v1',JSON.stringify({'2026-09-28':{weekMonday:'2026-09-28',plan:blank()},'2026-10-05':{weekMonday:'2026-10-05',plan:future}}));
    __chefStorage.setItem('chef_sector_range_v1',JSON.stringify({start:'2026-09-28',end:'2026-10-16',workDays:state.settings.days}));
    save();renderAll();goTab('planPanel');StoreRunnerPeriodDaySlider.openDate('2026-09-28');
  });
  await page.clock.runFor(300);
  const cue=page.locator('#planningOvernightCueV206');
  await expect(page.locator('#planningHeroWeek')).toHaveText('Semaine du 28 septembre au 3 octobre 2026');
  await expect(cue).toHaveCount(0);
  await expect(page.locator('#overnightBox')).not.toContainText('Nuit sur place');
  await expect(page.locator('#dayTabs [data-date="2026-10-06"] .hotelDayBadge')).toHaveAttribute('aria-label','Découché Mardi → Mercredi · 6/10 → 7/10');
  await page.evaluate(()=>StoreRunnerPeriodDaySlider.openDate('2026-10-06'));await page.clock.runFor(300);
  await expect(page.locator('#planningHeroWeek')).toHaveText('Semaine du 5 octobre au 10 octobre 2026');
  await expect(cue).toContainText('6/10 → 7/10');
  await expect(page.locator('#overnightBox')).toContainText('Nuit sur place');
  await page.evaluate(()=>StoreRunnerPeriodDaySlider.openDate('2026-09-28'));await page.clock.runFor(300);
  await expect(cue).toHaveCount(0);
  await expect(page.locator('#overnightBox')).not.toContainText('Nuit sur place');
  expect(await page.evaluate(()=>({week:state.settings.weekDate,tab:document.querySelector('#dayTabs .periodDayTab.active')?.dataset.date,hotels:Object.keys(state.hotelReservations).length}))).toEqual({week:'2026-09-28',tab:'2026-09-28',hotels:0});
  // Le champ Semaine charge son archive au même point d'entrée propriétaire.
  await page.evaluate(()=>{const field=document.getElementById('weekDate');field.value='2026-10-05';field.dispatchEvent(new Event('change',{bubbles:true}))});await page.clock.runFor(300);
  expect(await page.evaluate(()=>({week:state.settings.weekDate,tuesday:state.plan.Mardi.map(s=>s.id)}))).toEqual({week:'2026-10-05',tuesday:['r38-a']});
  // I : les portes Accueil et vue mensuelle r37 gardent le chargement réel du jour.
  await page.evaluate(()=>{StoreRunnerPeriodDaySlider.openDate('2026-09-28');goTab('homePanel');renderHome()});await page.clock.runFor(300);
  await expect(page.locator('[data-home-next-day="2026-10-06"] .phNextOpen')).toBeVisible();
  await page.locator('[data-home-next-day="2026-10-06"] .phNextOpen').click();await page.clock.runFor(300);
  expect(await page.evaluate(()=>({week:state.settings.weekDate,tab:document.querySelector('#dayTabs .periodDayTab.active')?.dataset.date}))).toEqual({week:'2026-10-05',tab:'2026-10-06'});
  await page.evaluate(()=>{document.getElementById('planningProMonth').open=true});await page.clock.runFor(300);
  await page.locator('#proMonthBody [data-pro-date="2026-10-07"]').click();await page.clock.runFor(300);
  expect(await page.evaluate(()=>({week:state.settings.weekDate,tab:document.querySelector('#dayTabs .periodDayTab.active')?.dataset.date,route:state.plan.Mercredi.map(s=>s.id)}))).toEqual({week:'2026-10-05',tab:'2026-10-07',route:['r38-b']});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
