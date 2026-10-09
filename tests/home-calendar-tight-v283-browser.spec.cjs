const {test,expect}=require('@playwright/test');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});

test('Accueil 390px : Google Agenda est immédiatement sous la position, sans nouveau bouton ni copie de statut',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(APP,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#premiumHomeV2 .phHeaderContext .phBase')
   &&document.querySelector('#premiumHomeV2 .phHeaderContext #calendarHomeStatus'));
 await expect(page.locator('#homePanel')).toHaveClass(/active/);
 const geometry=await page.evaluate(()=>{
  const host=document.querySelector('#premiumHomeV2 .phHeaderContext');
  const gps=host.querySelector('.phBase');
  const cal=host.querySelector('#calendarHomeStatus');
  const gr=gps.getBoundingClientRect(),cr=cal.getBoundingClientRect();
  const line=cal.querySelector('.calendarHomeLine').getBoundingClientRect();
  return {
   directSiblings:gps.parentNode===cal.parentNode,
   after:gps.nextElementSibling===cal,
   unique:document.querySelectorAll('#calendarHomeStatus').length,
   gapBetweenCenters:(line.top+line.height/2)-(gr.top+gr.height/2),
   gpsHeight:gr.height,calendarHeight:cr.height,
   actionHeight:cal.querySelector('button').getBoundingClientRect().height,
   actionExists:!!cal.querySelector('button'),
   cardExistsInPlanning:!!document.querySelector('#planningGoogleStatusShortcut')
  };
 });
 expect(geometry.directSiblings).toBe(true);
 expect(geometry.after).toBe(true);
 expect(geometry.unique).toBe(1);
 expect(geometry.gapBetweenCenters).toBeGreaterThan(20);
 expect(geometry.gapBetweenCenters).toBeLessThanOrEqual(34);
 expect(geometry.gpsHeight).toBeGreaterThanOrEqual(44);
 expect(geometry.calendarHeight).toBeGreaterThanOrEqual(44);
 expect(geometry.actionHeight).toBeGreaterThanOrEqual(44);
 expect(geometry.actionExists).toBe(true);
 expect(geometry.cardExistsInPlanning).toBe(false);
 // Live connection state still travels through the exact same existing element.
 await page.evaluate(()=>{
   const badge=document.getElementById('googleCalendarBadge');
   const status=document.getElementById('googleCalendarStatus');
   const old=window.chefGoogleStatus;
   window.chefGoogleStatus={...old,connected:false,phase:'expired',canRetry:false};
   if(status)status.textContent='Session Google à reconnecter';
   if(badge)badge.textContent='À reconnecter';
 });
 await expect(page.locator('#premiumHomeV2 #calendarHomeStatus button')).toHaveText('Reconnecter');
 expect(errors).toEqual([]);
});
