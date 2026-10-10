const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
test('V278 Android 390 px : Google + séminaire multi-jours dans agenda mensuel, sans export externe',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerProfessionalEvents&&window.StoreRunnerBoot?.settled()&&document.getElementById('planningProMonth'));
 await page.evaluate(()=>{
   const local={id:'v278-seminaire',kind:'Séminaire',title:'Séminaire terrain 2026',startDate:'2026-10-19',endDate:'2026-10-21',location:'Saint-Ouen',address:'10 rue du Séminaire'};
   state.professionalEvents=[local];
   state.calendarEvents=[{id:'google-v278',title:'Google formation',date:'2026-10-19',start:'2026-10-19',end:'2026-10-22',allDay:true,calendar:'Agenda de travail'}];
   state.calendarLastSync='2026-10-10T08:00:00Z';
   window.chefGoogleStatus={phase:'expired',connected:false,lastSync:state.calendarLastSync};
   window.dispatchEvent(new CustomEvent('chef-range-generated',{detail:{start:'2026-10-19'}}));
   document.dispatchEvent(new CustomEvent('store-runner:professional-events-updated'));
   document.dispatchEvent(new CustomEvent('store-runner:calendar-updated'));
   goTab('planPanel');
 });
 const details=page.locator('#planningProMonth');
 await expect(details.locator('#proMonthStatus')).toContainText('Google à reconnecter');
 await expect(details.locator('#proMonthStatus')).toContainText('1 événement(s) Store Runner');
 await details.locator('summary').tap();
 for(const date of ['2026-10-19','2026-10-20','2026-10-21']){
   const day=details.locator('[data-pro-date="'+date+'"]');
   await expect(day).toContainText('Séminaire terrain 2026');
   await expect(day).toContainText('Google formation');
 }
 const last=details.locator('[data-pro-date="2026-10-22"]');
 await expect(last).not.toContainText('Séminaire terrain 2026');
 await expect(last).not.toContainText('Google formation');
 await page.evaluate(()=>window.StoreRunnerPeriodDaySlider.openDate('2026-10-21'));
 await expect(page.locator('#proDayAgenda')).toContainText('Séminaire terrain 2026');
 await expect(page.locator('#proDayAgenda')).toContainText('Google formation');
 await page.evaluate(()=>goTab('appointmentsPanel'));
 await expect(page.locator('#srProList')).toContainText('Séminaire terrain 2026');
 await expect(page.locator('[data-sr-pro-calendar]')).toHaveCount(0);
 const before=await page.evaluate(()=>JSON.stringify({plan:state.plan,appointments:state.appointments,calendarEvents:state.calendarEvents,professionalEvents:state.professionalEvents}));
 const after=await page.evaluate(()=>JSON.stringify({plan:state.plan,appointments:state.appointments,calendarEvents:state.calendarEvents,professionalEvents:state.professionalEvents}));
 expect(after).toBe(before);
 expect(errors).toEqual([]);
});