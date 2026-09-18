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
  await page.addInitScript(() => {
    const RealDate=Date;
    const fixed=RealDate.parse('2026-09-13T12:00:00Z');
    class FixedDate extends RealDate{
      constructor(...args){super(...(args.length?args:[fixed]))}
      static now(){return fixed}
    }
    window.Date=FixedDate;
  });
  await page.goto(APP_URL, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerTerrainPlanningV1 && window.state && document.getElementById('planPanel'));

  await page.evaluate(() => {
    const st=window.state;
    const stores=Array.from({length:65},(_,i)=>({
      id:'snail-'+String(i+1).padStart(2,'0'), enseigne:'Magasin Test', ville:'Ville '+(i+1),
      adresse:(i+1)+' rue Escargot', dept: '99', lat:i===64?null:43.658+(i+1)*0.002, lon:i===64?null:-0.668,
      active:true, priority:3, intervalDays:30, products:[]
    }));
    stores[0].openingHours={Lundi:[{open:'09:30',close:'19:30'}],Mardi:[{open:'09:30',close:'19:30'}],Mercredi:[{open:'09:30',close:'19:30'}],Jeudi:[{open:'09:30',close:'19:30'}],Vendredi:[{open:'09:30',close:'19:30'}]};
    st.profile=Object.assign({},st.profile||{},{baseName:'Domicile test',baseAddress:'Ville-Test A',baseLat:43.658,baseLon:-0.668,overnightMode:'auto',overnightMinSaving:80});
    st.settings=Object.assign({},st.settings||{},{weekDate:'2026-09-21',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:12,maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00',visitMinutes:45,brands:[],products:[]});
    st.stores=stores;st.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};st.locks={};st.included={};st.excluded={};st.appointments=[];st.calendarEvents=[];st.manualWeekEdits={};
    window.syncGoogleCalendar=async()=>({ok:true});
    const db=window.__chefStorage||localStorage;db.removeItem('chef_sector_plan_archive_v1');db.removeItem('chef_sector_range_v1');
    try{if(typeof save==='function')save()}catch(_){}
    try{if(typeof renderAll==='function')renderAll()}catch(_){}
    try{if(typeof goTab==='function')goTab('planPanel')}catch(_){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });

  const settings=page.locator('#planningSettings');
  await page.locator('#planningSettingsShortcut').tap();
  await expect(settings).toHaveAttribute('role','dialog');
  const range=page.locator('#rangePlannerCard');
  await range.evaluate(el=>{el.open=true});
  await page.evaluate(() => {
    const week=document.getElementById('weekDate'),start=document.getElementById('rangeStart');
    if(week)week.value='2026-09-21';
    if(start){start.value='2026-09-21';delete start.dataset.snailUserEdited}
  });
  await expect(page.locator('#rangeStart')).toHaveValue('2026-09-21');
  const snail=page.locator('#terrainSnailBtn');
  await expect(snail).toBeVisible();
  const box=await snail.boundingBox();
  if(!box)throw new Error('Bouton escargot introuvable');
  expect(box.height).toBeGreaterThanOrEqual(44);
  await snail.tap();
  const terrainStatus=page.locator('#terrainSnailStatus');
  await expect(terrainStatus).toContainText('3 semaines escargot');
  await expect(terrainStatus).toContainText('65 planifiables');
  await expect(terrainStatus).toContainText('1 GPS à vérifier');
  await expect(terrainStatus).toContainText('horaires à vérifier');
  const insights=page.locator('#terrainSnailInsights');
  await expect(insights).toBeVisible();
  await expect(insights).toContainText('Découchés sur 3 semaines');
  await expect(insights).toContainText('Mode Automatique · seuil 80 km');
  await expect(insights).toContainText('Horaires');
  await expect(insights).toContainText('Répartition');
  await expect(insights).toContainText('5/5 jours travaillés couverts');
  await expect(page.locator('#rangeStart')).toHaveValue('2026-09-14');
  await expect(page.locator('#rangeEnd')).toHaveValue('2026-10-04');
  await expect(page.locator('#weekDate')).toHaveValue('2026-09-14');

  const generated=await page.evaluate(() => {
    const db=window.__chefStorage||localStorage;
    const a=JSON.parse(db.getItem('chef_sector_plan_archive_v1')||'{}');
    const keys=['2026-09-14','2026-09-21','2026-09-28'];
    const flatten=k=>['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].flatMap(d=>(a[k]?.plan?.[d]||[]).map(s=>s.id));
    const range=JSON.parse(db.getItem('chef_sector_range_v1')||'{}');
    const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];const counts=k=>Object.fromEntries(days.map(d=>[d,(a[k]?.plan?.[d]||[]).length]));return {keys:keys.filter(k=>a[k]),weeks:keys.map(flatten),dayCounts:keys.map(counts),planningDiagnostics:range.planningDiagnostics||[],dayCoverage:range.dayCoverage||null,firstPlan:(window.state.plan.Lundi||[]).map(s=>s.id),poolReport:range.poolReport||null,overnightReport:range.overnightReport||null,hoursReport:range.hoursReport||null,rangeStart:range.start,rangeEnd:range.end};
  });
  expect(generated.keys).toEqual(['2026-09-14','2026-09-21','2026-09-28']);
  expect(generated.rangeStart).toBe('2026-09-14');
  expect(generated.rangeEnd).toBe('2026-10-04');
  expect(generated.poolReport).toMatchObject({planifiable:65,withGps:64,withoutGps:1,imposed:0});
  expect(generated.overnightReport).toHaveLength(3);
  expect(generated.overnightReport[0]).toMatchObject({mode:'auto',threshold:80});
  expect(generated.hoursReport.available).toBe(true);
  expect(generated.hoursReport.unknown).toBeGreaterThan(0);
  expect(generated.hoursReport.uniqueUnknown).toBeGreaterThan(0);
  const all=generated.weeks.flat();
  expect(all).toHaveLength(36);
  expect(new Set(all).size).toBe(36);
  expect(generated.dayCoverage).toMatchObject({planned:15,active:15,empty:0});
  // Le navigateur valide les invariants métier réels : couverture, cible et capacité.
  // La répartition exacte peut varier si les horaires et temps de route imposent un autre équilibre.
  for(let wi=0;wi<generated.dayCounts.length;wi++){
    const values=Object.values(generated.dayCounts[wi]);
    expect(values.reduce((n,v)=>n+v,0)).toBe(12);
    expect(values.every(v=>v>0)).toBe(true);
    expect(values.every(v=>v<=4)).toBe(true);
    const diag=(generated.planningDiagnostics[wi]?.days||[]).filter(d=>d.status==='planned'||d.status==='empty').map(d=>d.count);
    expect(diag).toEqual(values);
  }
  expect(generated.planningDiagnostics).toHaveLength(3);
  const expectedWeek=(from,to)=>new Set(Array.from({length:to-from+1},(_,i)=>'snail-'+String(from+i).padStart(2,'0')));
  expect(new Set(generated.weeks[0])).toEqual(expectedWeek(1,12));
  expect(new Set(generated.weeks[1])).toEqual(expectedWeek(13,24));
  expect(new Set(generated.weeks[2])).toEqual(expectedWeek(25,36));
  expect(generated.weeks[0][0]).toBe('snail-01');

  await page.locator('[data-planning-settings-close]').tap();
  await expect(settings).not.toBeVisible();
  const week2Tab=page.locator('#dayTabs .periodDayTab[data-date="2026-09-21"]');
  const week3Tab=page.locator('#dayTabs .periodDayTab[data-date="2026-09-28"]');
  const week1Tab=page.locator('#dayTabs .periodDayTab[data-date="2026-09-14"]');
  await expect(week2Tab).toHaveCount(1);
  await expect(week3Tab).toHaveCount(1);

  await week2Tab.click();
  await page.waitForFunction(() => String(window.state?.settings?.weekDate||'')==='2026-09-21');
  let visibleWeek=await page.evaluate(() => ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].flatMap(d=>(window.state.plan[d]||[]).map(s=>s.id)));
  expect(visibleWeek).toEqual(generated.weeks[1]);
  await expect(page.locator('#planPanel')).toContainText('Ville 13');

  await week3Tab.click();
  await page.waitForFunction(() => String(window.state?.settings?.weekDate||'')==='2026-09-28');
  visibleWeek=await page.evaluate(() => ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].flatMap(d=>(window.state.plan[d]||[]).map(s=>s.id)));
  expect(visibleWeek).toEqual(generated.weeks[2]);
  await expect(page.locator('#planPanel')).toContainText('Ville 25');

  await week1Tab.click();
  await page.waitForFunction(() => String(window.state?.settings?.weekDate||'')==='2026-09-14');
  visibleWeek=await page.evaluate(() => ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].flatMap(d=>(window.state.plan[d]||[]).map(s=>s.id)));
  expect(visibleWeek).toEqual(generated.weeks[0]);
  await expect(page.locator('#planPanel')).toContainText('Ville 1');

  const chosen=await page.evaluate(() => {
    const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    const day=days.find(d=>(window.state.plan[d]||[]).length>=2);
    if(!day)throw new Error('Aucune journée avec deux magasins pour tester Commencer par ici');
    const route=window.state.plan[day]||[],id=route[1]&&route[1].id;
    window.openStoreQuick(id,day);
    return {id,day,before:route.map(s=>s.id)};
  });
  const start=page.locator('#startQuickStoreFirstBtn');
  await expect(start).toBeVisible();
  const startBox=await start.boundingBox();
  if(!startBox)throw new Error('Bouton Commencer par ici introuvable');
  expect(startBox.height).toBeGreaterThanOrEqual(44);
  await start.tap();
  await page.waitForFunction(({id,day}) => window.state.plan[day][0] && window.state.plan[day][0].id===id, {id:chosen.id,day:chosen.day});
  const after=await page.evaluate(day => window.state.plan[day].map(s=>s.id), chosen.day);
  expect(after[0]).toBe(chosen.id);
  expect(new Set(after)).toEqual(new Set(chosen.before));
  expect(after).toHaveLength(chosen.before.length);

  const overflow=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  expect(overflow.sw).toBeLessThanOrEqual(overflow.cw+1);
  expect(pageErrors).toEqual([]);
});