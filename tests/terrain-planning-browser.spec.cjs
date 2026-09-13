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

test('V1 terrain : 3 semaines escargot puis Commencer par ici restent sûrs à 390 px', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept().catch(()=>{}));
  await page.goto(APP_URL, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerTerrainPlanningV1 && window.state && document.getElementById('planPanel'));

  await page.evaluate(() => {
    const st=window.state;
    const stores=Array.from({length:65},(_,i)=>({
      id:'snail-'+String(i+1).padStart(2,'0'), enseigne:'Magasin Test', ville:'Ville '+(i+1),
      adresse:(i+1)+' rue Escargot', dept:'69', lat:45.758+(i+1)*0.002, lon:4.832,
      active:true, priority:3, intervalDays:30, products:[]
    }));
    st.profile=Object.assign({},st.profile||{},{baseName:'Domicile test',baseAddress:'Lyon',baseLat:45.758,baseLon:4.832});
    st.settings=Object.assign({},st.settings||{},{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:20,maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00',visitMinutes:45,brands:[],products:[]});
    st.stores=stores;st.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};st.locks={};st.included={};st.excluded={};st.appointments=[];st.calendarEvents=[];st.manualWeekEdits={};
    window.syncGoogleCalendar=async()=>({ok:true});
    const db=window.__chefStorage||localStorage;db.removeItem('chef_sector_plan_archive_v1');db.removeItem('chef_sector_range_v1');
    try{if(typeof save==='function')save()}catch(_){}
    try{if(typeof renderAll==='function')renderAll()}catch(_){}
    try{if(typeof goTab==='function')goTab('planPanel')}catch(_){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });

  const settings=page.locator('#planningSettings');
  await settings.evaluate(el=>{el.open=true});
  const range=page.locator('#rangePlannerCard');
  await range.evaluate(el=>{el.open=true});
  const snail=page.locator('#terrainSnailBtn');
  await expect(snail).toBeVisible();
  const box=await snail.boundingBox();
  if(!box)throw new Error('Bouton escargot introuvable');
  expect(box.height).toBeGreaterThanOrEqual(44);
  await snail.tap();
  await expect(page.locator('#terrainSnailStatus')).toContainText('3 semaines escargot');

  const generated=await page.evaluate(() => {
    const db=window.__chefStorage||localStorage;
    const a=JSON.parse(db.getItem('chef_sector_plan_archive_v1')||'{}');
    const keys=['2026-09-14','2026-09-21','2026-09-28'];
    const flatten=k=>['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].flatMap(d=>(a[k]?.plan?.[d]||[]).map(s=>s.id));
    return {keys:keys.filter(k=>a[k]),weeks:keys.map(flatten),firstPlan:(window.state.plan.Lundi||[]).map(s=>s.id)};
  });
  expect(generated.keys).toEqual(['2026-09-14','2026-09-21','2026-09-28']);
  const all=generated.weeks.flat();
  expect(all).toHaveLength(60);
  expect(new Set(all).size).toBe(60);
  expect(all.slice(0,5)).toEqual(['snail-01','snail-02','snail-03','snail-04','snail-05']);

  const chosen=await page.evaluate(() => {
    const route=window.state.plan.Lundi||[];
    const id=route[1]&&route[1].id;
    if(!id)throw new Error('Deuxième magasin du lundi absent');
    window.openStoreQuick(id,'Lundi');
    return {id,before:route.map(s=>s.id)};
  });
  const start=page.locator('#startQuickStoreFirstBtn');
  await expect(start).toBeVisible();
  const startBox=await start.boundingBox();
  if(!startBox)throw new Error('Bouton Commencer par ici introuvable');
  expect(startBox.height).toBeGreaterThanOrEqual(44);
  await start.tap();
  await page.waitForFunction(id => window.state.plan.Lundi[0] && window.state.plan.Lundi[0].id===id, chosen.id);
  const after=await page.evaluate(() => window.state.plan.Lundi.map(s=>s.id));
  expect(after[0]).toBe(chosen.id);
  expect(new Set(after)).toEqual(new Set(chosen.before));
  expect(after).toHaveLength(chosen.before.length);

  const overflow=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  expect(overflow.sw).toBeLessThanOrEqual(overflow.cw+1);
  expect(pageErrors).toEqual([]);
});
