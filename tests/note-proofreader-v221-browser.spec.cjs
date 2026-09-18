const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V221 corrige une note avec aperçu puis sauvegarde uniquement après Appliquer',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  let payload=null;
  await page.route('https://chef-secteur-ai.rednewtizi.workers.dev/**',async route=>{
    const req=route.request();
    if(req.method()==='POST'){
      payload=JSON.parse(req.postData()||'{}');
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Le vendeur trouve l’image trop sombre sur les Mini LED. Q-Symphony ne fonctionne pas.'})});
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.StoreRunnerNoteProofreader);

  await page.evaluate(async()=>{
    const M=window.StoreRunnerVisitModel,st=window.state;
    st.stores=[{id:'v221-store',enseigne:'Boulanger',ville:'Test',adresse:'1 rue Test',active:true,products:['Brun']}];
    st.businessV2=M.empty();st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    save();await window.StoreRunnerVisits.start('v221-store');
  });

  const dialog=page.locator('#srVisitDialog');await expect(dialog).toBeVisible();
  const field=dialog.locator('label.sr-field').filter({hasText:'Note terrain BRUN'});
  const note=field.locator('textarea');
  const controls=field.locator('xpath=following-sibling::div[contains(@class,"sr-noteProof")][1]');
  await expect(controls.getByRole('button',{name:'✨ Corriger'})).toBeVisible();
  await expect(note).toHaveAttribute('spellcheck','true');

  const raw='vendeur trouve image tro sombre sur mini led q symphony marche pas';
  await note.fill(raw);
  await controls.getByRole('button',{name:'✨ Corriger'}).tap();
  const preview=controls.locator('.sr-noteProofPreview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Le vendeur trouve l’image trop sombre sur les Mini LED. Q-Symphony ne fonctionne pas.');
  await expect(note).toHaveValue(raw);
  expect(payload).not.toBeNull();
  expect(payload.mode).toBe('assistant');
  expect(payload.message).toContain(raw);
  expect(payload.message).toContain('Q-Symphony');

  await preview.getByRole('button',{name:'Appliquer'}).tap();
  await expect(note).toHaveValue('Le vendeur trouve l’image trop sombre sur les Mini LED. Q-Symphony ne fonctionne pas.');
  await page.waitForFunction(()=>{
    const v=window.state.businessV2.visits.find(x=>x.storeId==='v221-store'&&x.status==='draft');
    return v&&window.StoreRunnerVisitModel.reportOf(v).brun.team==='Le vendeur trouve l’image trop sombre sur les Mini LED. Q-Symphony ne fonctionne pas.';
  });
  await expect(controls.locator('.sr-noteProofStatus')).toContainText('Correction appliquée et enregistrée.');

  const overflow=await dialog.evaluate(el=>el.scrollWidth-el.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
