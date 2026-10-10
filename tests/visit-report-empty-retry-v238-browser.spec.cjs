/* V287: no automatic legacy regeneration on visit completion. Existing V238
   provider-empty/parser guards remain in unit tests; Groq freeform requires an
   explicit click, must never destroy notes on failure, and only audits anomalies. */
const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});
const audit={missingReferences:[],unexpectedReferences:[],missingPrices:[],unexpectedPrices:[],missingPercentages:[],unexpectedPercentages:[],unexpectedDates:[]};
for(const label of ['vide','mal formé']){
 test('BLANC : réponse '+label+' refusée sans perdre notes ni visite',async({page})=>{
  const transport=await H.installJobs(page),{id,note}=await H.seedAndComplete(page,'blanc',{},'manual-groq');
  await page.route(url=>url.pathname==='/api/ai',async route=>{
   const body=route.request().postDataJSON();
   await route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(label==='vide'?
     {mode:'report_free_preview',reportType:body.reportType,text:'',audit}:
     {mode:'unrelated',reportType:body.reportType,text:'erreur de protocole',audit})});
  });
  const sheet=await H.openReport(page,id,'blanc');
  await sheet.locator('#srReportFreeTest').tap();
  await expect(sheet.locator('#srReportStatus')).toContainText('Génération Groq impossible');
  await expect(sheet.locator('#srReportText')).toHaveValue(/749 €/);
  expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'blanc'),id)).toBe(null);
  expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).blanc.team)).toBe(note);
  expect(transport.calls).toHaveLength(0);await H.noOverflow(page);
 });
}
test('BLANC : un prix inattendu est signalé sans filtrer la rédaction, résultat modifiable',async({page})=>{
 const transport=await H.installJobs(page),{id,note}=await H.seedAndComplete(page,'blanc',{},'manual-groq');
 const text='⚪ Résumé BLANC – Samsung en lavage : 799 €, à vérifier.';
 await page.route(url=>url.pathname==='/api/ai',async route=>{
  const body=route.request().postDataJSON();
  await route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({mode:'report_free_preview',reportType:body.reportType,text,
    provider:'groq',audit:{...audit,unexpectedPrices:['799'],missingPrices:['749']}})});
 });
 const sheet=await H.openReport(page,id,'blanc');
 await sheet.locator('#srReportFreeTest').tap();
 await expect(sheet.locator('#srReportText')).toHaveValue(text);
 await expect(sheet.locator('#srReportStatus')).toContainText('montants nouveaux à vérifier : 799');
 expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'blanc').text,id)).toBe(text);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).blanc.team)).toBe(note);
 await sheet.locator('#srReportEdit').tap();
 await sheet.locator('#srReportText').fill('⚪ Résumé BLANC – Samsung en lavage : 749 €.');
 await sheet.locator('#srReportEdit').tap();
 expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'blanc').text,id)).toContain('749 €');
 expect(transport.calls).toHaveLength(0);await H.noOverflow(page);
});
