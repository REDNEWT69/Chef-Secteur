const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});
/* Explorer Terrain V1 — navigation par semaine : précédente / suivante / Aujourd'hui / calendrier.
   Naviguer ne génère rien : une semaine passée garde son archive à l'octet près, une semaine à venir
   sans archive s'ouvre vide et annoncée « non générée ». */
test('semaine précédente/suivante, Aujourd’hui et calendrier sans régénération silencieuse',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-07T09:00:00')});
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPeriodDaySlider&&window.state&&window.__chefStorage);
  await page.clock.runFor(1500);
  const before=await page.evaluate(()=>{
    const a={id:'nav-a',enseigne:'Enseigne Test',ville:'Ville A',lat:45.7,lon:4.8,active:true,priority:3,products:['Blanc']};
    const b={...a,id:'nav-b',ville:'Ville B',lat:45.8,lon:4.9};
    const blank=()=>({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});
    const past=blank();past.Mardi=[a];past.Jeudi=[b];
    const cur=blank();cur.Mercredi=[a];cur.Vendredi=[b];
    state.settings={...state.settings,weekDate:'2026-10-05',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']};
    state.plan=cur;state.stores=[a,b];state.included={};state.excluded={};state.locks={};state.appointments=[];state.calendarEvents=[];
    const archive={'2026-09-28':{weekMonday:'2026-09-28',plan:past},'2026-10-05':{weekMonday:'2026-10-05',plan:cur}};
    __chefStorage.setItem('chef_sector_plan_archive_v1',JSON.stringify(archive));
    __chefStorage.setItem('chef_sector_range_v1',JSON.stringify({start:'2026-10-05',end:'2026-10-09',workDays:state.settings.days}));
    window.__gen=0;const og=window.generateWeek;window.generateWeek=function(){window.__gen++;return og.apply(this,arguments)};
    window.__reasons=[];window.__ranges=0;
    document.addEventListener('store-runner:planning-updated',e=>window.__reasons.push(String(e.detail&&e.detail.reason||'')));
    window.addEventListener('chef-range-generated',()=>window.__ranges++);
    save();renderAll();goTab('planPanel');StoreRunnerPeriodDaySlider.openDate('2026-10-07');
    return JSON.stringify(archive['2026-09-28']);
  });
  await page.clock.runFor(300);
  const nav=page.locator('#periodWeekNavV266');
  await expect(nav).toBeVisible();
  await expect(nav).toHaveAttribute('data-relation','current');
  await expect(nav.locator('[data-week-relation]')).toHaveText('Semaine en cours');
  for(const sel of ['[data-week-nav="prev"]','[data-week-nav="next"]','[data-week-nav="today"]','[data-week-pick]']){
    const box=await nav.locator(sel).boundingBox();expect(box.height,sel+' cible tactile').toBeGreaterThanOrEqual(44);
  }
  // Précédente : semaine passée, archive intacte, aucune génération.
  await nav.locator('[data-week-nav="prev"]').click();await page.clock.runFor(300);
  await expect(nav).toHaveAttribute('data-relation','past');
  await expect(nav.locator('[data-week-relation]')).toContainText('Semaine passée');
  expect(await page.evaluate(()=>({week:state.settings.weekDate,mer:state.plan.Mercredi.map(s=>s.id),mar:state.plan.Mardi.map(s=>s.id),tab:document.querySelector('#dayTabs .periodDayTab.active')?.dataset.date}))).toEqual({week:'2026-09-28',mer:[],mar:['nav-a'],tab:'2026-09-30'});
  // Suivante ×2 : semaine à venir jamais générée, ouverte vide et annoncée.
  await nav.locator('[data-week-nav="next"]').click();await page.clock.runFor(200);
  await nav.locator('[data-week-nav="next"]').click();await page.clock.runFor(300);
  await expect(nav.locator('[data-week-relation]')).toHaveText('Semaine à venir · non générée');
  await expect(page.locator('#periodDayNotice')).toContainText('non générée');
  const after=await page.evaluate(()=>({gen:window.__gen,week:state.settings.weekDate,empty:Object.values(state.plan).every(d=>!d.length),archive:JSON.parse(__chefStorage.getItem('chef_sector_plan_archive_v1')||'{}')}));
  expect(after.gen).toBe(0);expect(after.week).toBe('2026-10-12');expect(after.empty).toBe(true);
  expect(JSON.stringify(after.archive['2026-09-28'])).toBe(before);
  expect(after.archive['2026-10-12']).toBeUndefined();
  // Aujourd'hui : retour semaine courante, jour du jour actif.
  await nav.locator('[data-week-nav="today"]').click();await page.clock.runFor(300);
  await expect(nav).toHaveAttribute('data-relation','current');
  expect(await page.evaluate(()=>({week:state.settings.weekDate,tab:document.querySelector('#dayTabs .periodDayTab.active')?.dataset.date,ven:state.plan.Vendredi.map(s=>s.id)}))).toEqual({week:'2026-10-05',tab:'2026-10-07',ven:['nav-b']});
  // Calendrier : une date de l'historique ouvre sa semaine, un dimanche ouvre la semaine sans journée invalide.
  await page.locator('[data-week-pick]').fill('2026-09-29');await page.clock.runFor(300);
  expect(await page.evaluate(()=>({week:state.settings.weekDate,tab:document.querySelector('#dayTabs .periodDayTab.active')?.dataset.date,day:window.selectedPlanningDay}))).toEqual({week:'2026-09-28',tab:'2026-09-29',day:'Mardi'});
  await page.locator('[data-week-pick]').fill('2026-10-04');await page.clock.runFor(300);
  expect(await page.evaluate(()=>({week:state.settings.weekDate,day:window.selectedPlanningDay}))).toEqual({week:'2026-09-28',day:'Mardi'});
  expect(await page.evaluate(()=>window.__gen)).toBe(0);
  // Aucun événement de génération pendant toute la navigation : seulement des chargements de date.
  expect(await page.evaluate(()=>({ranges:window.__ranges,reasons:[...new Set(window.__reasons)]}))).toEqual({ranges:0,reasons:['period-date-loaded']});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
