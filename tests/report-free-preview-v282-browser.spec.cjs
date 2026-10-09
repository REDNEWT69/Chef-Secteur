/* V282 comparison of strict report and unsaved freeform output, mobile 390px.
   The provider response is simulated; no confidential notes or real paid calls. */
const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
test('Sortie magasin : essai IA libre sans JSON visible à part, note et rapport habituel inchangés',async({page})=>{
 const errors=[],previewCalls=[];page.on('pageerror',e=>errors.push(e.message));
 await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page);
 await H.jobState(page,id,'done');
 const sheet=await H.openReport(page,id);
 const original=await sheet.locator('#srReportText').inputValue();
 const free='🏬 Concurrence\nSamsung 77S92H : rapport rédigé librement. Prix comparés préservés.';
 await page.route(url=>url.pathname==='/api/ai',async route=>{
  const incoming=JSON.parse(route.request().postData()||'{}');previewCalls.push(incoming);
  await route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({mode:'report_free_preview',reportType:incoming.reportType,text:free,
    model:'openai/gpt-oss-120b',provider:'groq'})});
 });
 const button=sheet.locator('#srReportFreeTest');
 await expect(button).toBeVisible();await expect(sheet.locator('#srReportFreeBox')).toBeHidden();
 await button.tap();
 await expect(sheet.locator('#srReportFreeBox')).toBeVisible();
 await expect(sheet.locator('#srReportFreeText')).toHaveValue(free);
 await expect(sheet.locator('#srReportFreeStatus')).toContainText('non enregistré, non vérifié');
 expect(previewCalls).toHaveLength(1);
 expect(previewCalls[0].mode).toBe('report_free_preview');
 expect(previewCalls[0].reportType).toBe('brun');
 expect(previewCalls[0].source.reports[0].entries.some(e=>e.text.includes('77S92H'))).toBe(true);
 expect(previewCalls[0].sourceSignature).toMatch(/^sha256-[a-f0-9]{64}$/);
 await expect(sheet.locator('#srReportText')).toHaveValue(original);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 // The experiment must not trigger another durable paid job.
 expect(await page.evaluate(()=>state.businessV2.visits[0].reportJob.status)).toBe('done');
 await sheet.getByRole('button',{name:'Fermer',exact:true}).tap();
 await H.openReport(page,id);
 await expect(sheet.locator('#srReportFreeBox')).toBeHidden();
 await expect(sheet.locator('#srReportFreeText')).toHaveValue('');
 await expect(sheet.locator('#srReportText')).toHaveValue(original);
 expect(errors).toEqual([]);
});
