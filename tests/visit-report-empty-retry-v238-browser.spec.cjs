/* The legacy synchronous empty retry is unit-tested in V238. Durable jobs perform
   one provider invocation and surface failure without changing source notes. */
const {test,expect}=require('@playwright/test');
const H=require('./helpers/report-jobs-browser.cjs');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

for(const [label,result] of [['vide',''],['tronqué','{"version":1,"reports":[']]){
 test('BLANC : résultat '+label+' rejeté, clôture et données exactes conservées',async({page})=>{
  const transport=await H.installJobs(page,{mutate(response){response.result=result}});
  const {id,note}=await H.seedAndComplete(page,'blanc');await H.jobState(page,id,'failed');const sheet=await H.openReport(page,id,'blanc');
  await expect(sheet.locator('#srReportStatus')).toContainText('notes sont conservés');await expect(sheet.locator('#srReportText')).toHaveValue(/749 €/);
  const status=await sheet.locator('#srReportStatus').textContent();expect(status).not.toMatch(/HTTP|provider|finishReason|ai_empty_response/);
  await expect(sheet.locator('#srReportAI')).toBeEnabled();expect(transport.calls).toHaveLength(1);
  const stored=await page.evaluate(()=>({status:state.businessV2.visits[0].status,note:StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).blanc.team}));
  expect(stored).toEqual({status:'completed',note});await H.noOverflow(page);
 });
}

test('BLANC : invention de prix rejetée et régénération explicite possible',async({page})=>{
 const transport=await H.installJobs(page,{mutate(response,input){if(input.generation===0){const item=response.result.reports[0].items.find(i=>i.section==='laundry');item.text=item.text.replace('749','799')}}});
 const {id,note}=await H.seedAndComplete(page,'blanc');await H.jobState(page,id,'failed');const sheet=await H.openReport(page,id,'blanc');
 await expect(sheet.locator('#srReportText')).toHaveValue(/749 €/);await expect(sheet.locator('#srReportText')).not.toHaveValue(/799 €/);
 await sheet.locator('#srReportAI').click();await H.jobState(page,id,'done');
 await expect(sheet.locator('#srReportText')).toHaveValue(/^⚪ Résumé BLANC/);await expect(sheet.locator('#srReportText')).toHaveValue(/749 €/);
 expect(transport.calls).toHaveLength(2);expect(transport.calls.map(x=>x.generation)).toEqual([0,1]);
 expect(await page.evaluate(()=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).blanc.team)).toBe(note);await H.noOverflow(page);
});
