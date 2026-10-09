const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});

test('Essai libre : ancienne visite sans reportJob affiche une réponse visible juste sous le bouton',async({page})=>{
 const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page);
 await H.jobState(page,id,'done');
 const sheet=await H.openReport(page,id);
 const report=await sheet.locator('#srReportText').inputValue();
 await page.evaluate(id=>{
  const v=state.businessV2.visits.find(v=>v.id===id);
  delete v.reportJob; // Some historical completed visits have no durable report task.
 },id);
 await page.route(url=>url.pathname==='/api/ai',async route=>{
  calls.push(JSON.parse(route.request().postData()||'{}'));
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   mode:'report_free_preview',reportType:'brun',text:'Compte rendu libre : Samsung 77S92H conservée.',provider:'groq'
  })});
 });
 const btn=sheet.locator('#srReportFreeTest'),panel=sheet.locator('#srReportFreeBox');
 expect(await btn.evaluate(el=>el.nextElementSibling&&el.nextElementSibling.id)).toBe('srReportFreeBox');
 await btn.tap();
 await expect(panel).toBeVisible();
 await expect(panel.locator('#srReportFreeText')).toHaveValue(/Samsung 77S92H/);
 expect(calls).toHaveLength(1);
 expect(calls[0].source.reports[0].entries.some(e=>e.text.includes('77S92H'))).toBe(true);
 await expect(sheet.locator('#srReportText')).toHaveValue(report);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 expect(errors).toEqual([]);
});

test('Essai libre : Worker non à jour répond explicitement au lieu de faire croire que rien ne se passe',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await H.installJobs(page);
 const {id}=await H.seedAndComplete(page);
 await H.jobState(page,id,'done');
 const sheet=await H.openReport(page,id);
 const original=await sheet.locator('#srReportText').inputValue();
 await page.route(url=>url.pathname==='/api/ai',async route=>{
  await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Mode IA non reconnu sur le Worker'})});
 });
 const btn=sheet.locator('#srReportFreeTest');await btn.tap();
 const panel=sheet.locator('#srReportFreeBox');
 await expect(panel).toBeVisible();
 await expect(panel.locator('#srReportFreeStatus')).toContainText('Mode IA non reconnu');
 await expect(btn).toBeEnabled();
 await expect(sheet.locator('#srReportText')).toHaveValue(original);
 expect(errors).toEqual([]);
});
