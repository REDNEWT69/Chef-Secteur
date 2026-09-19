const { test, expect } = require('@playwright/test');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'allow',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

test('V1 horaires : saisie, défauts Boulanger/Darty, planning et reload hors ligne bloqué par Access à 390 px', async ({ page, context }) => {
  test.setTimeout(60000);
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  // Ce scénario teste le cache et la persistance ; neutraliser uniquement le
  // rechargement automatique initial pour ne pas interrompre la fixture.
  await page.addInitScript(()=>sessionStorage.setItem('store-runner-sw-reload:20260913-storephotos164','1'));
  await page.goto(APP_URL, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreOpeningHoursV1 && window.BoulangerDefaultHoursV1 && window.state && typeof window.openStoreQuick==='function');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await page.evaluate(() => {
    const st=window.state;
    const stores=[
      {id:'hours-1',enseigne:'Fnac',ville:'Premier',adresse:'1 rue Ouverture',dept: '99',lat:43.66,lon:-0.668,active:true,priority:3},
      {id:'hours-2',enseigne:'Boulanger',ville:'Deuxième',adresse:'2 rue Ouverture',dept: '99',lat:43.67,lon:-0.668,active:true,priority:3},
      {id:'hours-3',enseigne:'Darty',ville:'Troisième',adresse:'3 rue Ouverture',dept: '99',lat:43.68,lon:-0.658,active:true,priority:3}
    ];
    st.profile=Object.assign({},st.profile||{},{baseName:'Domicile test',baseAddress:'Ville-Test A',baseLat:43.658,baseLon:-0.668});
    st.settings=Object.assign({},st.settings||{},{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],startTime:'08:30',endTime:'18:00',visitMinutes:60});
    st.stores=stores;st.plan={Lundi:JSON.parse(JSON.stringify(stores)),Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};st.appointments=[];st.calendarEvents=[];
    try{if(typeof save==='function')save()}catch(_){}
    try{if(typeof renderAll==='function')renderAll()}catch(_){}
    try{if(typeof goTab==='function')goTab('planPanel')}catch(_){}
    window.selectedPlanningDay='Lundi';
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });

  await expect.poll(()=>page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-2').openingHoursSource)).toBe('brand-default');
  await expect.poll(()=>page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-3').openingHoursSource)).toBe('brand-default');
  expect(await page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-2').openingHours.Lundi)).toEqual([{open:'09:30',close:'19:30'}]);
  expect(await page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-3').openingHours.Samedi)).toEqual([{open:'09:30',close:'19:30'}]);
  expect(await page.evaluate(()=>window.StoreOpeningHoursV1.scheduleRoute([window.state.stores.find(s=>s.id==='hours-3')],'Lundi',window.state,{base:{},date:'2026-09-14',blocks:[],travelMinutes:()=>20,appointmentFor:()=>null}).unknownCount)).toBe(0);

  const dialog=page.locator('#storeHoursDialog');
  await page.evaluate(()=>window.StoreOpeningHoursV1.openHoursDialog('hours-2'));
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#boulangerDefaultHoursHint')).toContainText('Boulanger');
  await expect(dialog.locator('#boulangerDefaultHoursHint')).toContainText('09:30–19:30');
  await expect(dialog.locator('#boulangerDefaultHoursHint')).toContainText('rien à saisir');
  const monday=dialog.locator('[data-hours-day="Lundi"]');
  await expect(monday).toHaveValue('09:30-19:30');
  await expect(dialog.locator('[data-hours-day="Samedi"]')).toHaveValue('09:30-19:30');
  await dialog.locator('button[value="cancel"]').tap();
  await expect(dialog).not.toBeVisible();

  await page.evaluate(()=>window.StoreOpeningHoursV1.openHoursDialog('hours-3'));
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#boulangerDefaultHoursHint')).toContainText('Darty');
  await expect(monday).toHaveValue('09:30-19:30');
  await dialog.locator('button[value="cancel"]').tap();
  await expect(dialog).not.toBeVisible();

  await page.evaluate(() => window.openStoreQuick('hours-1','Lundi','08:30'));
  const hoursButton=page.locator('#openingHoursQuickBtn');
  await expect(hoursButton).toBeVisible();
  const buttonBox=await hoursButton.boundingBox();
  if(!buttonBox)throw new Error('Bouton Horaires introuvable');
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);
  await hoursButton.tap();

  await expect(dialog).toBeVisible();
  const visibleBox=await dialog.boundingBox();
  expect(visibleBox.x).toBeGreaterThanOrEqual(0);
  expect(visibleBox.x+visibleBox.width).toBeLessThanOrEqual(390);
  await monday.fill('10:00-09:00');
  await dialog.locator('#saveStoreHours').tap();
  await expect(dialog.locator('#storeHoursError')).toContainText('invalide');
  expect(await page.evaluate(()=>window.state.stores[0].openingHours)).toBeUndefined();
  await monday.fill('10:00-19:00');
  await page.evaluate(()=>{window.__hoursTestSave=window.save;window.save=()=>{throw new Error('Quota test')}});
  await dialog.locator('#saveStoreHours').tap();
  await expect(dialog.locator('#storeHoursError')).toContainText('Quota test');
  expect(await page.evaluate(()=>window.state.stores[0].openingHours)).toBeUndefined();
  await page.evaluate(()=>{window.save=window.__hoursTestSave;delete window.__hoursTestSave});
  await dialog.locator('#copyMondayHours').tap();
  await expect(dialog.locator('[data-hours-day="Vendredi"]')).toHaveValue('10:00-19:00');
  await dialog.locator('#saveStoreHours').tap();
  await expect(dialog).not.toBeVisible();

  await expect.poll(async()=>page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').first().textContent()).toBe('10:00');
  const summary=page.locator('#openingHoursDaySummary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Départ conseillé');
  await expect(summary).toContainText('fin estimée');
  await expect(summary).not.toContainText('horaire à vérifier');

  const persisted=await page.evaluate(() => {
    const s=window.state.stores.find(x=>x.id==='hours-1');
    return {hours:s.openingHours,source:s.openingHoursSource};
  });
  expect(persisted.hours.Lundi).toEqual([{open:'10:00',close:'19:00'}]);
  expect(persisted.source).toBe('manual');

  const overflow=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,dialog:document.getElementById('storeHoursDialog').scrollWidth}));
  expect(overflow.sw).toBeLessThanOrEqual(overflow.cw+1);
  expect(overflow.dialog).toBeLessThanOrEqual(390);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreOpeningHoursV1&&window.BoulangerDefaultHoursV1&&window.state);
  expect(await page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-1').openingHours.Lundi)).toEqual([{open:'10:00',close:'19:00'}]);
  expect(await page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-2').openingHoursSource)).toBe('brand-default');
  expect(await page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-3').openingHoursSource)).toBe('brand-default');
  await page.evaluate(()=>window.StoreOpeningHoursV1.openHoursDialog('hours-1'));
  await monday.fill('fermé');
  await dialog.locator('#saveStoreHours').tap();
  expect(await page.evaluate(()=>window.StoreOpeningHoursV1.scheduleRoute(window.state.plan.Lundi,'Lundi').estimatedEnd)).toBeNull();
  await page.evaluate(()=>window.StoreOpeningHoursV1.openHoursDialog('hours-1'));
  for(const day of ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'])await dialog.locator(`[data-hours-day="${day}"]`).fill('');
  await dialog.locator('#saveStoreHours').tap();
  expect(await page.evaluate(()=>window.state.stores[0].openingHours)).toBeUndefined();
  await expect.poll(()=>page.evaluate(()=>window.StoreOpeningHoursV1.scheduleRoute(window.state.plan.Lundi,'Lundi').unknownCount)).toBe(1);

  await expect.poll(()=>page.evaluate(async()=>!!await caches.match(new URL('./boulanger-default-hours.js',location.href).href,{ignoreSearch:true}))).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>!!await caches.match(new URL('./store-opening-hours.js',location.href).href,{ignoreSearch:true}))).toBe(true);

  // V332 : une navigation hors ligne ne doit plus retomber sur la coque PWA
  // en cache. Access doit rester l'autorité pour toute nouvelle navigation.
  await context.setOffline(true);
  let offlineReloadError='';
  try{await page.reload({waitUntil:'domcontentloaded',timeout:5000});}catch(e){offlineReloadError=String(e&&e.message||e);}
  expect(offlineReloadError).toContain('ERR_INTERNET_DISCONNECTED');
  await context.setOffline(false);

  // Les données locales restent persistées et reviennent dès que le réseau est
  // disponible et qu'Access peut de nouveau autoriser la navigation.
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreOpeningHoursV1&&window.BoulangerDefaultHoursV1&&window.state);
  await expect.poll(()=>page.evaluate(()=>window.StoreOpeningHoursV1.scheduleRoute(window.state.plan.Lundi,'Lundi').unknownCount)).toBe(1);
  expect(await page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-2').openingHours.Lundi)).toEqual([{open:'09:30',close:'19:30'}]);
  expect(await page.evaluate(()=>window.state.stores.find(s=>s.id==='hours-3').openingHours.Lundi)).toEqual([{open:'09:30',close:'19:30'}]);
  await page.evaluate(()=>window.StoreOpeningHoursV1.openHoursDialog('hours-1'));
  await monday.fill('10:00-19:00');
  await dialog.locator('#saveStoreHours').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreOpeningHoursV1&&window.BoulangerDefaultHoursV1&&window.state);
  expect(await page.evaluate(()=>window.StoreOpeningHoursV1.scheduleRoute(window.state.plan.Lundi,'Lundi').rows[0].arrival)).toBe(600);
  expect(pageErrors).toEqual([]);
});
