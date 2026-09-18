const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V215 compacte la visite sans perdre actions, famille ni performance',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.StoreRunnerVisitMobileUXV215);

  await page.evaluate(()=>{
    const M=window.StoreRunnerVisitModel,st=window.state;
    st.stores=[{id:'v215-store',enseigne:'Boulanger',ville:'Saint Etienne Villars',adresse:'1 rue Test',dept:'42',lat:45.47,lon:4.36,active:true,priority:5,products:['Blanc','Brun']}];
    st.businessV2=M.empty();st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    save();
    window.StoreRunnerVisits.start('v215-store');
  });

  const dialog=page.locator('#srVisitDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/srVisitV215/);

  const header=dialog.locator(':scope > .sr-head');
  const position=await header.evaluate(el=>getComputedStyle(el).position);
  expect(position).toBe('sticky');
  await expect(header.getByRole('button',{name:/Fermer/i})).toBeVisible();
  await expect(page.locator('#srReportBtn')).toBeVisible();

  const active=dialog.locator('.sr-familyActive');
  await expect(active).toContainText(/actif · notes & photos classées ici/i);
  await dialog.locator('.sr-familyBtn[data-family="brun"]').tap();
  await expect(active).toContainText('BRUN actif');
  await dialog.locator('.sr-familyBtn[data-family="blanc"]').tap();
  await expect(active).toContainText('BLANC actif');

  await page.evaluate(()=>{
    const d=document.getElementById('srVisitDialog'),intro=d.querySelector('.sr-terrainIntro')||d.lastElementChild;
    const old=d.querySelector('.srPerfBrief192');if(old)old.remove();
    const perf=document.createElement('section');perf.className='srPerfBrief192';perf.dataset.storeId='v215-store';
    perf.innerHTML='<div class="srPerfBrief192Head"><span class="srPerfBrief192Badge p1">Prio 1</span><b>Brief performance · Boulanger Saint Etienne Villars</b></div><div class="srPerfBrief192Grid"><div class="srPerfBrief192Cell"><span>PDM YTD</span><b>35 %</b></div><div class="srPerfBrief192Cell"><span>Écart cible</span><b>−7,2 pt</b></div><div class="srPerfBrief192Cell"><span>Évolution vs N-1</span><b>−12 %</b></div><div class="srPerfBrief192Cell"><span>Tendance hebdo</span><b>baisse</b></div></div><p class="srPerfBrief192Note">Mission très longue de test destinée à vérifier que le détail reste disponible.</p>';
    intro.parentNode.insertBefore(perf,intro);
    window.StoreRunnerVisitMobileUXV215.enhance();
  });

  /* Depuis V216, Performance vit volontairement dans Vue. Le garde V215 continue
     donc de tester son accordéon, mais dans son nouvel emplacement produit. */
  const tabsV216=dialog.locator('#srVisitTabsV216');
  if(await tabsV216.count())await tabsV216.getByRole('tab',{name:'Vue'}).tap();

  const fold=dialog.locator('details.srVisitPerfFoldV215');
  await expect(fold).toBeVisible();
  await expect(fold.locator('summary')).toContainText('Prio 1');
  await expect(fold.locator('summary')).toContainText('Écart −7,2 pt');
  await expect(fold).not.toHaveAttribute('open','');
  await fold.locator('summary').tap();
  await expect(fold).toHaveAttribute('open','');
  await expect(fold.locator('.srPerfBrief192')).toContainText('Mission très longue');

  await page.evaluate(()=>{
    const d=document.getElementById('srVisitDialog'),spacer=document.createElement('div');spacer.id='v215Spacer';spacer.style.height='900px';spacer.style.pointerEvents='none';d.appendChild(spacer);d.scrollTop=600;d.dispatchEvent(new Event('scroll'));
  });
  const top=dialog.locator('.srVisitTopV215');
  await expect(top).toBeVisible();
  const headerBox=await header.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(headerBox.y).toBeGreaterThanOrEqual(0);
  expect(headerBox.y).toBeLessThan(100);
  await top.tap();
  await page.waitForFunction(()=>document.getElementById('srVisitDialog').scrollTop<80);

  const overflow=await dialog.evaluate(el=>el.scrollWidth-el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('V216 sépare Vue Action Historique sans toucher aux actions métier',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.StoreRunnerVisitMobileUXV215&&window.StoreRunnerVisitTabsV216);

  await page.evaluate(()=>{
    const M=window.StoreRunnerVisitModel,st=window.state;
    st.stores=[{id:'v216-store',enseigne:'Boulanger',ville:'Saint Etienne Villars',adresse:'1 rue Test',dept:'42',lat:45.47,lon:4.36,active:true,priority:5,products:['Blanc','Brun']}];
    st.businessV2=M.empty();st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    let id=M.start(st,'v216-store');M.editVisit(st,id,'conclusion',null,'Premier passage terrain');M.complete(st,id,'2026-08-20');
    id=M.start(st,'v216-store');M.editVisit(st,id,'conclusion',null,'Deuxième passage terrain');M.complete(st,id,'2026-09-05');
    save();window.StoreRunnerVisits.start('v216-store');
  });

  const dialog=page.locator('#srVisitDialog');await expect(dialog).toBeVisible();
  const tabs=dialog.locator('#srVisitTabsV216');await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('tab',{name:'Action'})).toHaveAttribute('aria-selected','true');
  await expect(dialog.locator('.sr-familySwitch')).toBeVisible();

  await page.evaluate(()=>{
    const d=document.getElementById('srVisitDialog'),body=[...d.children].filter(n=>n.tagName==='DIV'&&!n.classList.contains('sr-head')&&n.id!=='srVisitTabsV216').pop(),intro=d.querySelector('.sr-terrainIntro')||body.lastElementChild;
    const perf=document.createElement('section');perf.className='srPerfBrief192';perf.innerHTML='<div class="srPerfBrief192Head"><span class="srPerfBrief192Badge p1">Prio 1</span><b>Brief performance</b></div><div class="srPerfBrief192Grid"><div class="srPerfBrief192Cell"><span>Écart cible</span><b>−7,2 pt</b></div></div>';
    intro.parentNode.insertBefore(perf,intro);window.StoreRunnerVisitMobileUXV215.enhance();window.StoreRunnerVisitTabsV216.enhance();
  });

  await tabs.getByRole('tab',{name:'Vue'}).tap();
  await expect(tabs.getByRole('tab',{name:'Vue'})).toHaveAttribute('aria-selected','true');
  await expect(dialog.locator('#srVisitOverviewV216')).toBeVisible();
  await expect(dialog.locator('details.srVisitPerfFoldV215')).toBeVisible();
  await expect(dialog.locator('.sr-familySwitch')).not.toBeVisible();
  await expect(dialog.locator('#srVisitOverviewV216')).toContainText('Famille BRUN');

  await tabs.getByRole('tab',{name:/Historique/}).tap();
  await expect(tabs.getByRole('tab',{name:/Historique/})).toHaveAttribute('aria-selected','true');
  const history=dialog.locator('#srVisitHistoryV216');await expect(history).toBeVisible();
  await expect(history.locator('.srVisitHistoryRowV216')).toHaveCount(2);
  await expect(history).toContainText('Premier passage terrain');
  await expect(history).toContainText('Deuxième passage terrain');
  await expect(dialog.locator('.sr-familySwitch')).not.toBeVisible();

  await expect(dialog.locator(':scope > .sr-head').getByRole('button',{name:/Fermer/i})).toBeVisible();
  await expect(page.locator('#srReportBtn')).toBeVisible();
  const overflow=await dialog.evaluate(el=>el.scrollWidth-el.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('V217 épure la visite selon les familles configurées dans la fiche magasin',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.StoreRunnerVisitMobileUXV215&&window.StoreRunnerVisitTabsV216);

  await page.evaluate(()=>{
    const M=window.StoreRunnerVisitModel,st=window.state;
    st.stores=[
      {id:'v217-blanc',enseigne:'Darty',ville:'Blanc',adresse:'1 rue Test',active:true,products:['Blanc']},
      {id:'v217-brun',enseigne:'Darty',ville:'Brun',adresse:'2 rue Test',active:true,products:['Brun']},
      {id:'v217-legacy',enseigne:'Darty',ville:'Legacy',adresse:'3 rue Test',active:true,products:[]}
    ];
    st.businessV2=M.empty();st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    save();
  });

  await page.evaluate(async()=>{await window.StoreRunnerVisits.start('v217-blanc')});
  const dialog=page.locator('#srVisitDialog');await expect(dialog).toBeVisible();
  await expect(dialog.locator('.sr-familyBtn')).toHaveCount(1);
  await expect(dialog.locator('.sr-familyBtn')).toHaveText('BLANC');
  await expect(dialog.locator('.sr-familyBtn[data-family="brun"]')).toHaveCount(0);
  await expect(dialog.locator('.sr-familyActive')).toHaveCount(0);
  await expect(dialog.getByText('Contexte magasin · facultatif',{exact:true})).toBeVisible();
  await expect(dialog.locator('.sr-terrainExitHint')).toHaveCount(0);
  expect(await page.evaluate(()=>window.state.businessV2.visits.find(v=>v.storeId==='v217-blanc'&&v.status==='draft').activeFamily)).toBe('blanc');

  await dialog.locator(':scope > .sr-head').getByRole('button',{name:/Fermer/i}).tap();
  await expect(dialog).not.toBeVisible();

  await page.evaluate(async()=>{await window.StoreRunnerVisits.start('v217-brun')});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.sr-familyBtn')).toHaveCount(1);
  await expect(dialog.locator('.sr-familyBtn')).toHaveText('BRUN');
  await expect(dialog.locator('.sr-familyBtn[data-family="blanc"]')).toHaveCount(0);
  await expect(dialog.locator('.sr-familyActive')).toHaveCount(0);
  expect(await page.evaluate(()=>window.state.businessV2.visits.find(v=>v.storeId==='v217-brun'&&v.status==='draft').activeFamily)).toBe('brun');

  await dialog.locator(':scope > .sr-head').getByRole('button',{name:/Fermer/i}).tap();
  await expect(dialog).not.toBeVisible();

  await page.evaluate(async()=>{await window.StoreRunnerVisits.start('v217-legacy')});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.sr-familyBtn')).toHaveCount(2);
  await expect(dialog.locator('.sr-familyActive')).toHaveCount(1);
  expect(errors).toEqual([]);
});