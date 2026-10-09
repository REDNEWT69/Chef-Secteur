const {test,expect}=require('@playwright/test');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});

test('Planning : Google Agenda juste sous la localisation, statut reflété, réglages existants réutilisés',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(APP,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.state&&document.querySelector('#planningSettingsShortcut')&&document.querySelector('#planningCalendarDetails'));
 await page.evaluate(()=>window.goTab('planPanel'));
 const status=page.locator('#planningGoogleStatusShortcut');
 await expect(status).toBeVisible();
 const placement=await status.evaluate(el=>({
   previous:el.previousElementSibling&&el.previousElementSibling.className,
   panel:!!el.closest('#planPanel'),hasDuplicate:document.querySelectorAll('#googleCalendarBadge').length
 }));
 expect(placement.previous).toContain('departureCard');
 expect(placement.panel).toBe(true);
 expect(placement.hasDuplicate).toBe(1);
 const badge=page.locator('#googleCalendarBadge');
 await badge.evaluate(el=>{el.textContent='Connecté';el.classList.add('on')});
 await expect(status).toContainText('Connecté');
 await expect(status).toHaveClass(/connected/);
 await expect(status).toHaveAttribute('aria-label',/Connecté/);
 const height=await status.evaluate(el=>el.getBoundingClientRect().height);
 expect(height).toBeGreaterThanOrEqual(44);
 await status.tap();
 await expect(page.locator('#planningSettings')).toHaveClass(/planningSettingsSheetOpen/);
 await expect(page.locator('#planningCalendarDetails')).toHaveAttribute('open','');
 await expect(page.locator('#googleClientId')).toHaveCount(1);
 await page.locator('[data-planning-settings-close]').tap();
 await expect(page.locator('#planningSettings')).not.toHaveClass(/planningSettingsSheetOpen/);
 await badge.evaluate(el=>{el.textContent='À reconnecter';el.classList.remove('on')});
 await expect(status).toContainText('À reconnecter');
 await expect(status).not.toHaveClass(/connected/);
 expect(errors).toEqual([]);
});
