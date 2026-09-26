const { test, expect } = require('@playwright/test');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
function futureIso(days=7){const d=new Date();d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

test('La fiche magasin retrouve notes, visites et actions à 390 px', async ({ page }) => {
  const pageErrors=[];
  const nextApptDate=futureIso();
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => typeof window.openStoreQuick==='function' && window.StoreRunnerVisits && window.StoreRunnerVisitModel);

  await page.evaluate((nextApptDate) => {
    const st=window.state;
    const M=window.StoreRunnerVisitModel;
    const store={id:'memory-1',enseigne:'Darty',ville:'Ville-Test A',adresse:'10 rue Mémoire',dept: '99',lat:43.66,lon:-0.66,active:true,priority:4};
    st.stores=[store];
    st.notes=Object.assign({},st.notes||{},{'memory-1':'Responsable Julien · PLV à revoir'});
    st.visits={};
    st.businessV2=M.empty();
    st.appointments=[{id:'memory-rdv',storeId:'memory-1',date:nextApptDate,time:'10:00',duration:60,type:'Rendez-vous responsable'}];
    const rows=[
      ['2026-08-20','Implantation corrigée'],
      ['2026-08-27','Stock gamme X faible'],
      ['2026-09-03','Formation vendeurs demandée'],
      ['2026-09-10','PLV manquante, revoir Julien']
    ];
    rows.forEach(([day,conclusion],index)=>{
      const visitId=M.start(st,'memory-1');
      if(index===3){
        const anomaly=M.addAnomaly(st,visitId);
        M.editAnomaly(st,visitId,anomaly,'Installer la nouvelle PLV');
        const actionId=M.actionFromAnomaly(st,visitId,anomaly);
        M.editAction(st,actionId,'owner','Julien');
        M.editAction(st,actionId,'dueDate',nextApptDate);
      }
      M.editVisit(st,visitId,'conclusion',null,conclusion);
      M.complete(st,visitId,day);
      const visit=st.businessV2.visits.find(v=>v.id===visitId);
      visit.completedAt=day+'T12:00:00.000Z';
      visit.updatedAt=visit.completedAt;
    });
    try{if(typeof save==='function')save()}catch(_){}
    window.openStoreQuick('memory-1','Lundi','09:30');
  },nextApptDate);

  const sheet=page.locator('#storeQuickSheet');
  await expect(sheet).toHaveClass(/open/);
  await expect(page.locator('#sqLastNote')).toContainText('Responsable Julien');
  await expect(page.locator('#sqNextAppt')).toContainText(nextApptDate);

  const memory=page.locator('#srStoreMemory');
  await expect(memory).toBeVisible();
  await expect(memory).toContainText('4 visites enregistrées · 1 action en cours');
  await expect(memory).toContainText('PLV manquante, revoir Julien');
  await expect(memory).toContainText('Installer la nouvelle PLV');
  await expect(memory).toContainText('Julien');

  let rows=page.locator('#srStoreHistoryList [data-sr-history-visit]');
  await expect(rows).toHaveCount(3);
  const rowBox=await rows.first().boundingBox();
  if(!rowBox)throw new Error('Historique magasin introuvable');
  expect(rowBox.height).toBeGreaterThanOrEqual(44);

  const toggle=memory.locator('[data-sr-history-toggle]');
  await expect(toggle).toContainText('Voir tout l’historique (4)');
  await toggle.tap();
  rows=page.locator('#srStoreHistoryList [data-sr-history-visit]');
  await expect(rows).toHaveCount(4);
  await expect(memory).toContainText('Implantation corrigée');

  const overflow=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth+1);

  await rows.first().tap();
  await expect(page.locator('#srVisitDialog')).toBeVisible();
  await expect(page.locator('#srVisitTitle')).toContainText('Darty · Ville-Test A');
  await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée');
  expect(pageErrors,'La mémoire magasin ne doit produire aucune erreur JavaScript').toEqual([]);
});

test('La fiche magasin mémorise les contacts et leurs emails après rechargement', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreRunnerStoreContacts && typeof window.openStore==='function' && window.StoreRunnerVisitModel);

  await page.evaluate(() => {
    const st=window.state;
    st.stores=[{id:'contact-1',enseigne:'Boulanger',ville:'Ville-Test C',adresse:'6 boulevard Test',dept: '99',lat:43.6,lon:-0.56,active:true,priority:5,freq:'Hebdo',intervalDays:7,products:['Blanc','Brun']}];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    st.businessV2=window.StoreRunnerVisitModel.empty();
    st.storeContacts={};
    save();
    openStore('contact-1');
  });

  const dialog=page.locator('#storeDlg');
  await expect(dialog).toBeVisible();
  await page.locator('#storeDlg [data-sr-store-tab="contacts"]').tap();
  await expect(page.locator('#srStoreContactsPane')).toBeVisible();
  await page.locator('#srStoreContactAdd').tap();

  const row=page.locator('#srStoreContactList .srStoreContactRow').first();
  await row.locator('[data-sr-contact-name]').fill('Amandine');
  await row.locator('[data-sr-contact-role]').fill('Responsable SAV');
  await row.locator('[data-sr-contact-email]').fill('amandine@example.test');
  await expect(row.locator('[data-sr-contact-mail]')).toHaveAttribute('href','mailto:amandine@example.test');
  await page.locator('#srStoreContactSave').tap();
  await expect(page.locator('#srStoreContactStatus')).toContainText('Contacts enregistrés');

  const stored=await page.evaluate(()=>state.storeContacts['contact-1']);
  expect(stored).toEqual([{name:'Amandine',role:'Responsable SAV',email:'amandine@example.test'}]);
  let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreRunnerStoreContacts && typeof window.openStore==='function');
  await page.evaluate(()=>openStore('contact-1'));
  await page.locator('#storeDlg [data-sr-store-tab="contacts"]').tap();

  const restored=page.locator('#srStoreContactList .srStoreContactRow').first();
  await expect(restored.locator('[data-sr-contact-name]')).toHaveValue('Amandine');
  await expect(restored.locator('[data-sr-contact-role]')).toHaveValue('Responsable SAV');
  await expect(restored.locator('[data-sr-contact-email]')).toHaveValue('amandine@example.test');
  await expect(restored.locator('[data-sr-contact-mail]')).toHaveAttribute('href','mailto:amandine@example.test');
  overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors,'Le carnet de contacts ne doit produire aucune erreur JavaScript').toEqual([]);
});

test('L’écran Terrain rappelle la promesse de la visite précédente, famille par famille', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreRunnerVisits && window.StoreRunnerVisitModel && typeof window.save==='function');

  await page.evaluate(() => {
    const st=window.state;
    const M=window.StoreRunnerVisitModel;
    st.stores=[{id:'promise-1',enseigne:'Darty',ville:'Ville-Test A',adresse:'12 rue Promesse',dept: '99',lat:43.66,lon:-0.66,active:true,priority:4}];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    st.businessV2=M.empty();
    const visitId=M.start(st,'promise-1');
    M.editReport(st,visitId,'brun','training','Revoir le mural TV avec Julien au prochain passage.');
    M.editVisit(st,visitId,'conclusion',null,'Passage BRUN');
    M.complete(st,visitId,'2026-09-10');
    const visit=st.businessV2.visits.find(v=>v.id===visitId);
    visit.completedAt='2026-09-10T12:00:00.000Z';
    visit.updatedAt=visit.completedAt;
    save();
  });

  // Nouvelle visite sur le MÊME magasin : la promesse doit être lue, jamais celle de la visite en cours.
  await page.evaluate(() => window.StoreRunnerVisits.start('promise-1'));

  const dialog=page.locator('#srVisitDialog');
  await expect(dialog).toBeVisible();
  // Une étape unique ne doit pas laisser une barre d'onglets orpheline en haut de l'écran.
  await expect(dialog.locator('.sr-steps')).toHaveCount(0);

  const promise=dialog.locator('.sr-lastPromise');
  await expect(promise).toBeVisible();
  await expect(promise).toContainText('La dernière fois (10/09), tu notais :');
  await expect(promise).toContainText('Revoir le mural TV avec Julien au prochain passage.');

  await dialog.locator('.sr-familyBtn[data-family="blanc"]').tap();
  await expect(dialog.locator('.sr-familyActive')).toContainText('BLANC');
  await expect(dialog.locator('.sr-lastPromise')).toHaveCount(0);

  await dialog.locator('.sr-familyBtn[data-family="brun"]').tap();
  await expect(dialog.locator('.sr-lastPromise')).toContainText('Revoir le mural TV avec Julien au prochain passage.');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors,'Le rappel de promesse ne doit produire aucune erreur JavaScript').toEqual([]);
});