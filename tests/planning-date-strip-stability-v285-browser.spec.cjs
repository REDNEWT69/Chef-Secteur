const {test,expect}=require('@playwright/test');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

// Regression from real Android recording: tap Oct 13 in the second week,
// then the 3-week horizontal strip snaps back to Oct 5 although the selected
// day's content is still Oct 13. Navigation should remain mounted in its
// existing DOM position; no reparenting of #dayTabs on a mere selection.
test('Android 390 : toucher le 13 conserve le défilement horizontal au lieu de revenir au 5',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-09T14:00:00+02:00')});
 await page.goto(APP,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerPeriodDaySlider&&window.state&&window.__chefStorage&&document.querySelector('#dayTabs'));
 await page.clock.runFor(1100);
 await page.evaluate(()=>{
  const s=window.state;
  s.settings={...s.settings,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-10-05'};
  const blank=()=>({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});
  s.plan=blank();s.appointments=[];s.calendarEvents=[];s.locks={};s.included={};s.excluded={};
  __chefStorage.setItem('chef_sector_range_v1',JSON.stringify({start:'2026-10-05',end:'2026-10-23',workDays:s.settings.days}));
  __chefStorage.setItem('chef_sector_plan_archive_v1','{}');
  save();renderAll();goTab('planPanel');
  StoreRunnerPeriodDaySlider.openDate('2026-10-12');
 });
 await page.clock.runFor(200);
 const band=page.locator('#dayTabs'),twelve=band.locator('[data-date="2026-10-12"]'),thirteen=band.locator('[data-date="2026-10-13"]');
 await expect(twelve).toHaveClass(/active/);
 await expect(thirteen).toBeVisible();
 // Start from a real horizontal position where the second week is readable.
 await page.evaluate(()=>{
  const box=document.getElementById('dayTabs');
  box.querySelector('[data-date="2026-10-13"]').scrollIntoView({block:'nearest',inline:'center'});
 });
 await page.clock.runFor(200);
 const before=await page.evaluate(()=>{
  const box=document.getElementById('dayTabs');
  window.__stripMoved=0;
  window.__stripObserver=new MutationObserver(records=>{
    for(const record of records)for(const node of record.removedNodes)if(node===box)window.__stripMoved++;
  });
  window.__stripObserver.observe(box.parentElement,{childList:true});
  return box.scrollLeft;
 });
 expect(before).toBeGreaterThan(100);
 await thirteen.tap();
 await expect(thirteen).toHaveClass(/active/);
 await expect.poll(()=>page.evaluate(()=>state.settings.weekDate)).toBe('2026-10-12');
 await page.clock.runFor(250);
 const after=await page.evaluate(()=>{
  const box=document.getElementById('dayTabs'),selected=box.querySelector('.periodDayTab.active');
  return{scrollLeft:box.scrollLeft,moves:window.__stripMoved,selected:selected&&selected.dataset.date,
   navigationBeforeBand:document.getElementById('periodWeekNavV266')?.nextElementSibling===box,
   visible:!!selected&&selected.getBoundingClientRect().right<=box.getBoundingClientRect().right+1&&selected.getBoundingClientRect().left>=box.getBoundingClientRect().left-1};
 });
 expect(after.selected).toBe('2026-10-13');
 expect(after.navigationBeforeBand).toBe(true);
 expect(after.moves,'#dayTabs ne doit jamais être retiré de son parent quand on sélectionne un jour').toBe(0);
 expect(after.scrollLeft,'le défilement horizontal doit rester vers la deuxième semaine').toBeGreaterThan(100);
 expect(Math.abs(after.scrollLeft-before)).toBeLessThanOrEqual(55);
 expect(after.visible).toBe(true);
 expect(errors).toEqual([]);
});
