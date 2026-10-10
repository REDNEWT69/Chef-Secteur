const {expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
function reportResult(source){return{version:1,reports:source.reports.map(report=>{
 const items=[];for(const entry of report.entries){
  const quote=String(entry.text||'').trim();if(!quote||entry.source==='conclusion')continue;
  const section=entry.source==='report.shared.context'?'context':entry.source.endsWith('.training')?'actions':report.reportType==='blanc'?'laundry':report.reportType==='cuisiniste'?'showroom':'tv';
  items.push({section,text:quote.replace(/\s+/g,' '),source:entry.source,quote});
 }
 const team=report.entries.find(e=>e.source.endsWith('.team')&&e.text);if(team)items.push({section:'summary',text:team.text.replace(/\s+/g,' ').trim(),source:team.source,quote:team.text.trim()});
 return{reportType:report.reportType,items};
})}}
async function installJobs(page,{status='done',delay=0,mutate,error='Le moteur IA n’a pas produit de résultat valide.'}={}){
 const calls=[],jobs=new Map();
 await page.route(url=>url.pathname.includes('/api/ai/report-jobs'),async route=>{
  const request=route.request();if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  let input;if(request.method()==='POST'){input=JSON.parse(request.postData()||'{}');calls.push(input);jobs.set('test-job-'+input.generation,input)}else input=jobs.get(new URL(request.url()).pathname.split('/').pop());
  if(!input){await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{message:'Tâche inconnue'}})});return}
  const response={protocolVersion:1,jobId:'test-job-'+input.generation,status,visitId:input.visitId,storeId:input.storeId,completedDate:input.completedDate,sourceSignature:input.sourceSignature,generation:input.generation};
  if(status==='done')response.result=reportResult(input.source);if(status==='failed')response.error={message:error};if(mutate)mutate(response,input);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 return{calls,jobs};
}
async function seedAndComplete(page,family='brun',storeOverrides={},mode='legacy-automatic'){
 if(mode==='legacy-automatic')await page.addInitScript(()=>{window.StoreRunnerReportMode='legacy-automatic'});
 await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.state&&window.StoreRunnerVisitModel&&window.StoreRunnerVisits&&window.StoreRunnerVisitReport);
 await page.evaluate(async ({fam,storeOverrides})=>{
  const st=window.state,M=window.StoreRunnerVisitModel;
  st.stores=[{id:'report-test',enseigne:'Enseigne-Test',ville:'Ville-Test',adresse:'3 rue de Test',active:true,products:[fam],...storeOverrides}];
  st.businessV2=M.empty();st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
  window.aiConfig={...(window.aiConfig||{}),gateway:'/api/ai',mode:'online'};
  save();await window.StoreRunnerVisits.start('report-test');
 },{fam:family,storeOverrides});
 const dialog=page.locator('#srVisitDialog');await expect(dialog).toBeVisible();
 const note=family==='blanc'?'Samsung présent dans le rayon lavage à 749 €.':'Samsung présent dans le rayon TV avec la 77S92H.';
 await dialog.locator('label.sr-field').filter({hasText:storeOverrides.channel==='cuisiniste'?'Rapport magasin':'Note terrain '+family.toUpperCase()}).locator('textarea').fill(note);
 // Historical V232 compatibility: training can still exist in legacy
 // persisted state even though the V281 screen exposes only Note terrain.
 // Inject a legacy field through the model to verify that old report jobs
 // continue to read it without reinstating the deleted input widget.
 if(storeOverrides.channel!=='cuisiniste')await page.evaluate(({fam})=>{
   const id=window.state.businessV2.visits[0].id;
   window.StoreRunnerVisitModel.editReport(window.state,id,fam,'training','Confirmer la formation au prochain passage.');
   if(typeof save==='function')save();
 },{fam:family});
 page.once('dialog',dialog=>dialog.accept());await dialog.getByRole('button',{name:'Terminer la visite',exact:true}).click();
 await page.waitForFunction(()=>state.businessV2.visits[0].status==='completed');
 const id=await page.evaluate(()=>state.businessV2.visits[0].id);
 await page.waitForFunction(()=>window.StoreRunnerReportAIAutoV2771&&window.StoreRunnerReportRenderer);
 return{id,note,dialog};
}
async function openReport(page,id,family='brun'){
 await page.evaluate(visitId=>window.StoreRunnerVisitReport.open(visitId),id);
 const sheet=page.locator('#srReportSheet');await expect(sheet).toBeVisible();
 const tab=sheet.locator('.sr-reportTab[data-family="'+family+'"]');if(await tab.count())await tab.click();return sheet;
}
async function jobState(page,id,status){await page.waitForFunction(({id,status})=>{const v=state.businessV2.visits.find(v=>v.id===id);return v&&v.reportJob&&v.reportJob.status===status},{id,status})}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1)}
module.exports={APP_URL,reportResult,installJobs,seedAndComplete,openReport,jobState,noOverflow};
