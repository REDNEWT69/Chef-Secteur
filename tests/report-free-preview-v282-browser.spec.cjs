/* V287: the formerly unsaved free Groq preview is now the only visible
   report generation button. Successful output is persisted per family without
   overwriting the original field notes or starting legacy durable jobs. */
const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
test('Android : Génération auto Groq enregistre le texte, conserve les notes et survit au rechargement',async({page})=>{
 const errors=[],previewCalls=[];page.on('pageerror',e=>errors.push(e.message));
 const durable=await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page,'brun',{},'manual-groq');
 expect(await page.evaluate(id=>state.businessV2.visits.find(v=>v.id===id).reportJob.obsolete,id)).toBe(true);
 expect(durable.calls).toHaveLength(0);
 const sheet=await H.openReport(page,id);
 const free='⚫ Résumé BRUN — Enseigne-Test Ville-Test\n\nSamsung 77S92H présenté en magasin. Formation à confirmer.';
 await page.route(url=>url.pathname==='/api/ai',async route=>{
  const incoming=JSON.parse(route.request().postData()||'{}');previewCalls.push(incoming);
  await route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({mode:'report_free_preview',reportType:incoming.reportType,text:free,
    model:'openai/gpt-oss-120b',provider:'groq',
    audit:{missingReferences:[],unexpectedReferences:[],missingPrices:[],
      unexpectedPrices:[],missingPercentages:[],unexpectedPercentages:[],unexpectedDates:[]}})});
 });
 const button=sheet.locator('#srReportFreeTest');
 await expect(button).toHaveText(/Génération auto \(Groq\)/);
 await expect(sheet.locator('#srReportAI')).toHaveCount(0);
 await expect(sheet.locator('#srReportFreeBox')).toHaveCount(0);
 await button.tap();
 await expect(sheet.locator('#srReportText')).toHaveValue(free);
 await expect(sheet.locator('#srReportStatus')).toContainText('Compte rendu Groq enregistré');
 expect(previewCalls).toHaveLength(1);
 expect(previewCalls[0].mode).toBe('report_free_preview');
 expect(previewCalls[0].reportType).toBe('brun');
 expect(previewCalls[0].sourceSignature).toMatch(/^sha256-[a-f0-9]{64}$/);
 expect(previewCalls[0].source.reports[0].entries.some(e=>e.text.includes('77S92H'))).toBe(true);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'brun').text,id)).toBe(free);
 expect(durable.calls).toHaveLength(0);
 await page.evaluate(async()=>__chefStorage.flush());
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerVisitReport&&window.StoreRunnerBoot?.settled());
 await H.openReport(page,id);
 await expect(page.locator('#srReportText')).toHaveValue(free);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 expect(errors).toEqual([]);
});
test('Android : réponse Groq échouée ne remplace pas un compte rendu précédent',async({page})=>{
 const durable=await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page,'brun',{},'manual-groq');
 const sheet=await H.openReport(page,id);
 await page.route(url=>url.pathname==='/api/ai',async route=>{
  await route.fulfill({status:500,contentType:'application/json',
   body:JSON.stringify({error:'Groq indisponible'})});
 });
 await sheet.locator('#srReportFreeTest').tap();
 await expect(sheet.locator('#srReportStatus')).toContainText('Génération Groq impossible');
 expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'brun'),id)).toBe(null);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 expect(durable.calls).toHaveLength(0);
});

test('Android : aucune donnée BLANC ne peut être générée depuis une note BRUN uniquement',async({page})=>{
 const durable=await H.installJobs(page),{id,note}=await H.seedAndComplete(page,'brun',{products:['brun','blanc']},'manual-groq');
 let previewCalls=0;
 await page.route(url=>url.pathname==='/api/ai',async route=>{previewCalls++;await route.fulfill({status:500,body:'not expected'})});
 const sheet=await H.openReport(page,id,'blanc');
 await sheet.locator('#srReportFreeTest').tap();
 await expect(sheet.locator('#srReportStatus')).toContainText('Aucune note originale propre à cette famille');
 expect(previewCalls).toBe(0);
 expect(durable.calls).toHaveLength(0);
 expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'blanc'),id)).toBe(null);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
});
