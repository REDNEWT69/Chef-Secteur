const { test, expect } = require('@playwright/test');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

test('V1 horaires : ouverture réelle décale la visite et recalcule départ/fin à 390 px', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  await page.goto(APP_URL, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreOpeningHoursV1 && window.state && typeof window.openStoreQuick==='function');

  await page.evaluate(() => {
    const st=window.state;
    const stores=[
      {id:'hours-1',enseigne:'Darty',ville:'Premier',adresse:'1 rue Ouverture',dept:'69',lat:45.760,lon:4.832,active:true,priority:3},
      {id:'hours-2',enseigne:'Boulanger',ville:'Deuxième',adresse:'2 rue Ouverture',dept:'69',lat:45.770,lon:4.832,active:true,priority:3,
       openingHours:{Lundi:[{open:'10:00',close:'19:00'}]}}
    ];
    st.profile=Object.assign({},st.profile||{},{baseName:'Domicile test',baseAddress:'Lyon',baseLat:45.758,baseLon:4.832});
    st.settings=Object.assign({},st.settings||{},{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],startTime:'08:30',endTime:'18:00',visitMinutes:60});
    st.stores=stores;st.plan={Lundi:stores.slice(),Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};st.appointments=[];st.calendarEvents=[];
    try{if(typeof save==='function')save()}catch(_){}
    try{if(typeof renderAll==='function')renderAll()}catch(_){}
    try{if(typeof goTab==='function')goTab('planPanel')}catch(_){}
    window.selectedPlanningDay='Lundi';
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });

  await page.evaluate(() => window.openStoreQuick('hours-1','Lundi','08:30'));
  const hoursButton=page.locator('#openingHoursQuickBtn');
  await expect(hoursButton).toBeVisible();
  const buttonBox=await hoursButton.boundingBox();
  if(!buttonBox)throw new Error('Bouton Horaires introuvable');
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);
  await hoursButton.tap();

  const dialog=page.locator('#storeHoursDialog');
  await expect(dialog).toBeVisible();
  const monday=dialog.locator('[data-hours-day="Lundi"]');
  await monday.fill('10:00-19:00');
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
  expect(pageErrors).toEqual([]);
});
