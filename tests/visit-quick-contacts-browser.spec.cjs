/* In-place contact book in an active visit on Android/iPhone-sized screens.
   No backend inference or actual device contacts; all addresses are synthetic. */
const {test,expect}=require('@playwright/test');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
test('Visite : consulter/copier un email et ajouter un responsable sans quitter la note terrain',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(APP,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.state&&window.StoreRunnerVisitModel&&window.StoreRunnerVisits&&window.ChefReliability);
 const id=await page.evaluate(async()=>{
  const s=window.state,M=window.StoreRunnerVisitModel;
  s.stores=[{id:'quick-contacts-test',enseigne:'Boulanger',ville:'Ville-Test',adresse:'1 rue du Test',
    active:true,products:['brun'],phone:'04 00 00 00 00',email:'accueil@magasin-test.example'}];
  s.businessV2=M.empty();s.visits={};s.notes={};
  s.storeContacts={'quick-contacts-test':[{name:'Responsable actuel',role:'Chef de rayon',
    email:'rayon@magasin-test.example'}]};
  window.save();
  const newId=await window.StoreRunnerVisits.start('quick-contacts-test');
  return newId;
 });
 const dialog=page.locator('#srVisitDialog');
 await expect(dialog).toBeVisible();
 const note=dialog.locator('label.sr-field').filter({hasText:'Note terrain BRUN'}).locator('textarea');
 await note.fill('Formation BRUN programmée. Nouvelle référence Samsung à suivre.');
 const toggle=dialog.locator('.sr-contactsToggle');
 await expect(toggle).toBeVisible();
 await toggle.tap();
 const panel=dialog.locator('.sr-contactsPanel');
 await expect(panel).toBeVisible();
 await expect(panel).toContainText('Responsable actuel');
 await expect(panel).toContainText('accueil@magasin-test.example');
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,
   value:{writeText:async value=>{window.__copiedEmail=value}}})});
 await panel.locator('.sr-contactRow').filter({hasText:'Responsable actuel'}).getByRole('button',{name:/Copier/}).tap();
 expect(await page.evaluate(()=>window.__copiedEmail)).toBe('rayon@magasin-test.example');
 const editor=panel.locator('.sr-contactEditor');
 await editor.locator('label.sr-contactField').filter({hasText:'Nom'}).locator('input').fill('Ibrahim');
 await editor.locator('label.sr-contactField').filter({hasText:'Fonction'}).locator('input').fill('Assistant manager');
 await editor.locator('label.sr-contactField').filter({hasText:'E-mail'}).locator('input').fill('ibrahim@magasin-test.example');
 await editor.getByRole('button',{name:'Ajouter le contact'}).tap();
 await expect(dialog.locator('.sr-contactsToggle')).toContainText('(2)');
 await expect(dialog.locator('.sr-contactsPanel')).toContainText('Ibrahim');
 const before=await page.evaluate(()=>({
  contacts:window.state.storeContacts['quick-contacts-test'],note:window.StoreRunnerVisitModel.reportOf(
   window.state.businessV2.visits[0]).brun.team
 }));
 // Compare the actual visit instead of relying on an order of unrelated visits.
 expect(before.contacts).toHaveLength(2);
 await dialog.getByRole('button',{name:'Fermer',exact:true}).tap();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerVisits&&window.state&&window.state.stores.some(s=>s.id==='quick-contacts-test'));
 await page.evaluate(visitId=>window.StoreRunnerVisits.openVisit(visitId),id);
 await expect(dialog).toBeVisible();await dialog.locator('.sr-contactsToggle').tap();
 await expect(dialog.locator('.sr-contactsPanel')).toContainText('ibrahim@magasin-test.example');
 await expect(note).toHaveValue('Formation BRUN programmée. Nouvelle référence Samsung à suivre.');
 await expect(dialog.locator('.sr-contactActions').first().locator('a')).toHaveAttribute('href','mailto:accueil@magasin-test.example');
 expect(errors).toEqual([]);
});
