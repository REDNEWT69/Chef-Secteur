/* Legacy V232 parser/repair behavior remains covered by its unit suite. The field
   interface now submits durable server jobs and renders only validated business JSON. */
const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('Terminer prépare automatiquement un rapport rendu localement à 390 px',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const transport=await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page);await H.jobState(page,id,'done');
 const sheet=await H.openReport(page,id),area=sheet.locator('#srReportText');
 await expect(area).toHaveValue(/^⚫ Résumé BRUN – Enseigne-Test Ville-Test/);
 await expect(area).toHaveValue(/📺 TV \/ Présence Samsung[\s\S]*77S92H[\s\S]*🎯 Plan d’action \/ prochain passage[\s\S]*📝 Synthèse/);
 await expect(sheet.locator('#srReportStatus')).toContainText('Compte rendu enregistré');
 await expect(sheet.locator('#srReportAI')).toContainText('Régénérer le compte rendu');
 expect(transport.calls).toHaveLength(1);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 await H.noOverflow(page);expect(errors).toEqual([]);
});

test('Un échec serveur conserve la visite, les notes et le rapport local',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const transport=await H.installJobs(page,{status:'failed'});
 const {id,note}=await H.seedAndComplete(page);await H.jobState(page,id,'failed');const sheet=await H.openReport(page,id);
 await expect(sheet.locator('#srReportStatus')).toContainText('notes sont conservés');
 await expect(sheet.locator('#srReportText')).toHaveValue(new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 await expect(sheet.locator('#srReportAI')).toBeEnabled();expect((await sheet.locator('#srReportAI').boundingBox()).height).toBeGreaterThanOrEqual(44);
 expect(transport.calls).toHaveLength(1);expect(await page.evaluate(()=>state.businessV2.visits[0].status)).toBe('completed');
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 await H.noOverflow(page);expect(errors).toEqual([]);
});

test('BLANC : le double tap et les reprises online/visibilité coalescent la même tâche',async({page})=>{
 const transport=await H.installJobs(page,{status:'processing',delay:120});const {id,note}=await H.seedAndComplete(page,'blanc');
 await H.jobState(page,id,'processing');const sheet=await H.openReport(page,id,'blanc');
 await page.evaluate(()=>{const b=document.getElementById('srReportAI');b.click();b.click();dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'))});
 await expect(sheet.locator('#srReportAI')).toBeEnabled();await page.waitForTimeout(400);
 expect(transport.calls).toHaveLength(1);expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).blanc.team)).toBe(note);
 await expect(sheet.locator('#srReportText')).toHaveValue(/749 €/);await H.noOverflow(page);
});


test('Canal cuisiniste explicite : un rapport unique même pour une enseigne inconnue',async({page})=>{
 await H.installJobs(page,{status:'processing'});
 const {id,note}=await H.seedAndComplete(page,'blanc',{enseigne:'Cuisine Test',channel:'cuisiniste'});
 await H.jobState(page,id,'processing');const sheet=await H.openReport(page,id);
 await expect(sheet.locator('#srReportTabs')).toBeHidden();
 await expect(sheet.locator('#srReportText')).toHaveValue(/^🟠 COMPTE RENDU CUISINISTE – Cuisine Test/);
 const value=await sheet.locator('#srReportText').inputValue();expect(value).toContain(note);expect(value).not.toMatch(/Résumé (BRUN|BLANC)|Famille (BRUN|BLANC)/);
 await H.noOverflow(page);
});
