const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
test('Android 390px : séminaire local multi-jours bloque le générateur, reste modifiable et survit au rechargement',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerProfessionalEvents&&window.StoreRunnerTerrainPlanningV1&&window.StoreRunnerBoot?.settled());
 await page.evaluate(()=>{
   state.settings.weekDate='2026-11-16';
   state.calendarEvents=[];
   state.plan.Mercredi=[state.stores[0]];
   save();
   goTab('appointmentsPanel');
 });
 const section=page.locator('#srProfessionalEvents');
 await expect(section).toBeVisible();
 await section.locator('#srProAdd').tap();
 const modal=page.locator('#srProDialog');
 await expect(modal).toBeVisible();
 await modal.locator('[name="title"]').fill('Séminaire Samsung');
 await modal.locator('[name="startDate"]').fill('2026-11-18');
 await modal.locator('[name="endDate"]').fill('2026-11-19');
 await modal.locator('[name="location"]').fill('Paris');
 await modal.locator('[name="address"]').fill('10 rue du Séminaire, Paris');
 await modal.locator('[type="submit"]').tap();
 await expect(modal).toHaveCount(0);
 await expect(section).toContainText('Séminaire Samsung');
 await expect(section).toContainText('Visites ou RDV déjà prévus');
 await expect(section.locator('a[href*="maps"]')).toHaveAttribute('href',/10%20rue%20du%20S%C3%A9minaire/);
 const actual=await page.evaluate(()=>({
   stored:state.professionalEvents.length,
   paris:state.professionalEvents[0].location,
   prior:StoreRunnerTerrainPlanningV1.dateBlocked('2026-11-17',state),
   first:StoreRunnerTerrainPlanningV1.dateBlocked('2026-11-18',state),
   second:StoreRunnerTerrainPlanningV1.dateBlocked('2026-11-19',state),
   after:StoreRunnerTerrainPlanningV1.dateBlocked('2026-11-20',state),
   existing:state.plan.Mercredi.length
 }));
 expect(actual).toEqual({stored:1,paris:'Paris',prior:false,first:true,second:true,after:false,existing:1});
 // Agenda interne : le séminaire est visible aux deux dates, même sans Google Agenda.
 await page.evaluate(()=>goTab('planPanel'));
 await expect(page.locator('#srProPlanning')).toHaveCount(0);
 const calendar=page.locator('#planningProMonth'),monthBody=page.locator('#proMonthBody');
 await expect(calendar).toBeVisible();
 await calendar.locator('summary').tap();
 let november=false;
 for(let i=0;i<16;i++){
   const label=String(await monthBody.locator('.proMonthHead b').textContent());
   if(/novembre 2026/i.test(label)){november=true;break}
   await monthBody.locator('.proMonthNext').tap();
 }
 expect(november).toBe(true);
 await expect(calendar.locator('[data-pro-date="2026-11-18"]')).toHaveClass(/proDayBlocked/);
 await expect(calendar.locator('[data-pro-date="2026-11-18"]')).toContainText('Séminaire Samsung');
 await expect(calendar.locator('[data-pro-date="2026-11-19"]')).toContainText('Séminaire Samsung');
 await expect(calendar.locator('[data-pro-date="2026-11-17"]')).not.toContainText('Séminaire Samsung');
 await expect(calendar.locator('.proMonthLocalSummary')).toContainText('Paris');
 expect(await page.evaluate(()=>state.calendarEvents.length)).toBe(0);
 await page.evaluate(()=>goTab('appointmentsPanel'));
 await page.evaluate(async()=>{await __chefStorage.flush()});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerProfessionalEvents&&window.StoreRunnerBoot?.settled());
 await page.evaluate(()=>goTab('appointmentsPanel'));
 await expect(page.locator('#srProList')).toContainText('Séminaire Samsung');
 expect(await page.evaluate(()=>StoreRunnerTerrainPlanningV1.dateBlocked('2026-11-19',state))).toBe(true);
 await page.locator('[data-sr-pro-edit]').tap();
 await modal.locator('[name="endDate"]').fill('2026-11-20');
 await modal.locator('[type="submit"]').tap();
 expect(await page.evaluate(()=>StoreRunnerTerrainPlanningV1.dateBlocked('2026-11-20',state))).toBe(true);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-sr-pro-delete]').tap();
 expect(await page.evaluate(()=>StoreRunnerTerrainPlanningV1.dateBlocked('2026-11-18',state))).toBe(false);
 expect(await page.evaluate(()=>state.plan.Mercredi.length)).toBe(1);
 expect(errors).toEqual([]);
});
