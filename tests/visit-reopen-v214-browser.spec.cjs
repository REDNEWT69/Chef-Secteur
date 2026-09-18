const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V214 réouvre une visite clôturée aujourd’hui puis la conserve après actualisation',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.state&&typeof window.save==='function');

  const seeded=await page.evaluate(()=>{
    const st=window.state,M=window.StoreRunnerVisitModel;
    const day=(()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})();
    st.stores=[{id:'v214-recover',enseigne:'Boulanger',ville:'Ville-Test V214',adresse:'1 rue Terrain',dept:'99',lat:45.44,lon:4.39,active:true,priority:5}];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];st.businessV2=M.empty();
    const id=M.start(st,'v214-recover');
    M.editReport(st,id,'brun','team','BRUN déjà saisi avant le refresh');
    M.editVisit(st,id,'conclusion',null,'Passage terrain en cours');
    M.complete(st,id,day);
    save();
    window.StoreRunnerVisits.openVisit(id);
    return{id,day};
  });

  const dialog=page.locator('#srVisitDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée');
  const reopen=dialog.locator('[data-sr-reopen-visit]');
  await expect(reopen).toBeVisible();

  page.once('dialog',async d=>{expect(d.message()).toContain('Réouvrir cette visite');await d.accept()});
  await reopen.tap();
  await expect(page.locator('#srVisitTitle')).toContainText('Visite en cours');
  await expect(dialog.locator('.sr-status')).toContainText('Visite réouverte');

  let snapshot=await page.evaluate(({id,day})=>{
    const v=state.businessV2.visits.find(x=>x.id===id),legacy=state.visits['v214-recover'];
    return{status:v&&v.status,completedDate:v&&v.completedDate,count:state.businessV2.visits.length,history:legacy&&legacy.history||[],hasDay:!!(legacy&&legacy.history||[]).includes(day)};
  },seeded);
  expect(snapshot.status).toBe('draft');
  expect(snapshot.completedDate).toBeNull();
  expect(snapshot.count).toBe(1);
  expect(snapshot.hasDay).toBe(false);

  await dialog.locator('.sr-familyBtn[data-family="blanc"]').tap();
  const blanc=dialog.locator('label.sr-field').filter({hasText:'Note terrain BLANC'}).locator('textarea');
  await blanc.fill('BLANC complété après réouverture');
  await expect(dialog.locator('.sr-status')).toContainText('Enregistré');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.state);
  const resumed=await page.evaluate(async id=>{
    const before=state.businessV2.visits.length;
    const result=await window.StoreRunnerVisits.start('v214-recover');
    const v=state.businessV2.visits.find(x=>x.id===id);
    return{result,before,after:state.businessV2.visits.length,status:v&&v.status,blanc:window.StoreRunnerVisitModel.reportOf(v).blanc.team};
  },seeded.id);
  expect(resumed.result).toBe(seeded.id);
  expect(resumed.after).toBe(resumed.before);
  expect(resumed.status).toBe('draft');
  expect(resumed.blanc).toBe('BLANC complété après réouverture');
  await expect(page.locator('#srVisitTitle')).toContainText('Visite en cours');

  page.once('dialog',async d=>{expect(d.message()).toContain('Terminer cette visite');await d.dismiss()});
  await page.locator('#srVisitDialog [data-sr-complete-visit]').tap();
  await expect(page.locator('#srVisitDialog .sr-status')).toContainText('Visite conservée en cours');
  snapshot=await page.evaluate(id=>{const v=state.businessV2.visits.find(x=>x.id===id);return{status:v&&v.status,count:state.businessV2.visits.length}},seeded.id);
  expect(snapshot.status).toBe('draft');
  expect(snapshot.count).toBe(1);
  expect(errors).toEqual([]);
});
