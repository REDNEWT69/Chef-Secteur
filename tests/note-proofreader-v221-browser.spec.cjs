const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
 serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('Les notes terrain restent brutes et aucun correcteur IA ne peut les remplacer',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
 await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.state&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.StoreRunnerNoteProofreader);
 await page.evaluate(async()=>{
  const M=window.StoreRunnerVisitModel,st=window.state;
  st.stores=[{id:'v278-source',enseigne:'Boulanger',ville:'Test',adresse:'1 rue Test',active:true,products:['Brun']}];
  st.businessV2=M.empty();st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
  save();await window.StoreRunnerVisits.start('v278-source');
 });
 const dialog=page.locator('#srVisitDialog');await expect(dialog).toBeVisible();
 const field=dialog.locator('label.sr-field').filter({hasText:'Note terrain BRUN'}),note=field.locator('textarea');
 await expect(dialog.getByRole('button',{name:'✨ Corriger',exact:true})).toHaveCount(0);
 const raw='un américain Samsung présent. le magasin pas fermé à l’idée de retravailler; aucun contrat validé';
 await note.fill(raw);
 await page.waitForFunction(expected=>{
  const v=window.state.businessV2.visits.find(x=>x.storeId==='v278-source'&&x.status==='draft');
  return v&&window.StoreRunnerVisitModel.reportOf(v).brun.team===expected;
 },raw);
 const protectedAttach=await page.evaluate(()=>{
  const input=document.querySelector('#srVisitDialog label.sr-field textarea');
  return window.StoreRunnerNoteProofreader.attach(input.closest('label'),input,{label:'Note terrain'});
 });
 expect(protectedAttach).toBe(false);
 await expect(note).toHaveValue(raw);
 await expect(dialog.locator('.sr-noteProof')).toHaveCount(0);
 const overflow=await dialog.evaluate(el=>el.scrollWidth-el.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});
