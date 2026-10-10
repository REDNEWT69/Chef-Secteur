/* V287 mobile contract. V232 parsing remains covered by its unit suite.
   The screen exposes ONE working Groq freeform button that persists text. */
const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});
async function mockGroq(page,produce){
 const calls=[];
 await page.route(url=>url.pathname==='/api/ai',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  const value=await produce(body);
  await route.fulfill({status:value.status||200,contentType:'application/json',
   body:JSON.stringify(value.status?{error:value.error||'Erreur simulée'}:
    {mode:'report_free_preview',reportType:body.reportType,text:value.text,
     provider:'groq',model:'openai/gpt-oss-120b',
     audit:{missingReferences:[],unexpectedReferences:[],missingPrices:[],unexpectedPrices:[],missingPercentages:[],unexpectedPercentages:[],unexpectedDates:[]}})});
 });
 return calls;
}
test('Android 390 px : visite clôturée sans ancien job, Groq enregistrable en un clic',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const transport=await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page,'brun',{},'manual-groq');
 const free='⚫ Résumé BRUN – Enseigne-Test Ville-Test\n\nSamsung 77S92H présenté au rayon TV.';
 const calls=await mockGroq(page,()=>({text:free}));
 const sheet=await H.openReport(page,id);
 await expect(sheet.locator('#srReportFreeTest')).toHaveText('✨ Génération auto');
 await expect(sheet.locator('#srReportAI')).toHaveCount(0);
 expect(transport.calls).toHaveLength(0);
 await sheet.locator('#srReportFreeTest').tap();
 await expect(sheet.locator('#srReportText')).toHaveValue(free);
 await expect(sheet.locator('#srReportStatus')).toContainText('Compte rendu Groq enregistré');
 expect(calls).toHaveLength(1);
 expect(calls[0].reportType).toBe('brun');
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
 await H.noOverflow(page);expect(errors).toEqual([]);
});
test('Android : échec Groq ne supprime ni notes ni rapport précédent',async({page})=>{
 const transport=await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page,'brun',{},'manual-groq');
 const calls=await mockGroq(page,()=>({status:503,error:'Groq temporairement indisponible'}));
 const sheet=await H.openReport(page,id);
 await sheet.locator('#srReportFreeTest').tap();
 await expect(sheet.locator('#srReportStatus')).toContainText('Génération Groq impossible');
 await expect(sheet.locator('#srReportFreeTest')).toBeEnabled();
 expect(calls).toHaveLength(1);
 expect(transport.calls).toHaveLength(0);
 expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'brun'),id)).toBe(null);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).brun.team)).toBe(note);
});
test('Android BLANC : double tap sur Génération auto = un seul appel Groq',async({page})=>{
 const transport=await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page,'blanc',{},'manual-groq');
 const text='⚪ Résumé BLANC : Samsung en lavage à 749 €. Formation au prochain passage.';
 const calls=await mockGroq(page,()=>new Promise(resolve=>setTimeout(()=>resolve({text}),120)));
 const sheet=await H.openReport(page,id,'blanc');
 await page.evaluate(()=>{const b=document.getElementById('srReportFreeTest');b.click();b.click()});
 await expect(sheet.locator('#srReportText')).toHaveValue(text);
 expect(calls).toHaveLength(1);
 expect(transport.calls).toHaveLength(0);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).blanc.team)).toBe(note);
 await H.noOverflow(page);
});
test('Cuisiniste : famille unique, source intacte et rapport sauvegardé',async({page})=>{
 await H.installJobs(page);
 const {id,note}=await H.seedAndComplete(page,'blanc',{enseigne:'Cuisine Test',channel:'cuisiniste'},'manual-groq');
 const text='🟠 Compte rendu Cuisine Test : présence d’un Samsung à 749 € dans le showroom.';
 const calls=await mockGroq(page,()=>({text}));
 const sheet=await H.openReport(page,id);
 await expect(sheet.locator('#srReportTabs')).toBeHidden();
 await sheet.locator('#srReportFreeTest').tap();
 await expect(sheet.locator('#srReportText')).toHaveValue(text);
 expect(calls[0].reportType).toBe('cuisiniste');
 expect(await page.evaluate(id=>StoreRunnerVisits.reportFor(id,'cuisiniste').text,id)).toBe(text);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).shared.context)).toBe(note);
 await H.noOverflow(page);
});
