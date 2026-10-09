/* Quick full store sheet from inside an in-progress visit, at 390px.
   All data is synthetic; the nested native dialog must preserve the terrain input. */
const {test,expect}=require('@playwright/test');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
test('Fiche magasin depuis la visite : lecture, modification puis retour sans perdre les notes ni les contacts',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(APP,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.state&&window.StoreRunnerVisitModel&&window.StoreRunnerVisits&&window.ChefReliability&&typeof window.openStore==='function');
 const id=await page.evaluate(async()=>{
  const s=window.state,M=window.StoreRunnerVisitModel;
  s.stores=[{id:'visit-full-sheet-test',enseigne:'Darty',ville:'Ville-Test',adresse:'5 rue Initiale',dept:'69',
    active:true,products:['brun'],priority:3,freq:'Mensuel',intervalDays:30}];
  s.businessV2=M.empty();s.notes={'visit-full-sheet-test':'Note générale du magasin déjà enregistrée'};
  s.storeContacts={'visit-full-sheet-test':[{name:'Chef de rayon',role:'Responsable',email:'chef@magasin-test.example'}]};
  s.visits={};s.included={};s.excluded={};s.locks={};s.plan={};s.appointments=[];s.calendarEvents=[];
  window.save();
  return await window.StoreRunnerVisits.start('visit-full-sheet-test');
 });
 const visit=page.locator('#srVisitDialog');
 await expect(visit).toBeVisible();
 const note=visit.locator('label.sr-field').filter({hasText:'Note terrain BRUN'}).locator('textarea');
 await note.fill('Visite en cours : suivi merchandising Samsung, ne pas perdre cette saisie.');
 await expect(visit.locator('.sr-contactsToggle')).toBeVisible();
 const button=visit.locator('[data-sr-visit-store="visit-full-sheet-test"]');
 await expect(button).toBeVisible();
 await button.tap();
 const store=page.locator('#storeDlg');await expect(store).toBeVisible();
 await expect(visit).toBeVisible();
 await expect(store.locator('#fAddress')).toHaveValue('5 rue Initiale');
 await expect(store.locator('#fNote')).toHaveValue('Note générale du magasin déjà enregistrée');
 await store.locator('#fAddress').fill('7 avenue Mise à jour');
 await store.getByRole('button',{name:'Enregistrer',exact:true}).tap();
 await expect(store).not.toBeVisible();
 await expect(visit).toBeVisible();
 await expect(note).toHaveValue('Visite en cours : suivi merchandising Samsung, ne pas perdre cette saisie.');
 const current=await page.evaluate(id=>{
  const v=state.businessV2.visits.find(v=>v.id===id);
  return {address:state.stores[0].adresse,contacts:state.storeContacts['visit-full-sheet-test'],
    note:StoreRunnerVisitModel.reportOf(v).brun.team,status:v.status,count:state.businessV2.visits.length};
 },id);
 expect(current).toEqual({address:'7 avenue Mise à jour',contacts:[{name:'Chef de rayon',role:'Responsable',email:'chef@magasin-test.example'}],
  note:'Visite en cours : suivi merchandising Samsung, ne pas perdre cette saisie.',status:'draft',count:1});
 // Opening the existing contacts panel still shows saved addresses, no re-entry.
 await visit.locator('.sr-contactsToggle').tap();
 await expect(visit.locator('.sr-contactsPanel')).toContainText('chef@magasin-test.example');
 await expect(visit.locator('[data-sr-visit-store="visit-full-sheet-test"]')).toBeVisible();
 await visit.getByRole('button',{name:'Fermer',exact:true}).tap();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerVisits&&window.state&&window.state.stores.some(x=>x.id==='visit-full-sheet-test'));
 await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
 await expect(visit).toBeVisible();
 await expect(note).toHaveValue('Visite en cours : suivi merchandising Samsung, ne pas perdre cette saisie.');
 expect(await page.evaluate(()=>state.stores.find(x=>x.id==='visit-full-sheet-test').adresse)).toBe('7 avenue Mise à jour');
 expect(errors).toEqual([]);
});
