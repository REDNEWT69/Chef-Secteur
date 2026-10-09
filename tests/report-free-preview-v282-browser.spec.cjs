/* V285: Groq free prose is automatic, so the experimental V282 button is gone.
   The browser fixture simulates durable jobs, never a paid provider call. */
const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});

test('Sortie magasin : un seul bouton Régénérer, plus de double génération IA libre',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const mock=await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page);
 await H.jobState(page,id,'done');
 const sheet=await H.openReport(page,id);
 await expect(sheet.locator('#srReportFreeTest')).toHaveCount(0);
 await expect(sheet.locator('#srReportFreeBox')).toHaveCount(0);
 const before=await sheet.locator('#srReportText').inputValue();
 expect(before).toContain('77S92H');
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 const generation=await page.evaluate(()=>state.businessV2.visits[0].reportJob.generation);
 await sheet.getByRole('button',{name:'Régénérer le compte rendu'}).tap();
 await page.waitForFunction(prev=>state.businessV2.visits[0].reportJob.generation>prev,generation);
 await H.jobState(page,id,'done');
 await expect(sheet.locator('#srReportFreeTest')).toHaveCount(0);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 expect(await page.evaluate(()=>state.businessV2.visits[0].reportJob.generation)).toBe(generation+1);
 expect(mock.calls.length).toBeGreaterThanOrEqual(1);
 expect(errors).toEqual([]);
});
