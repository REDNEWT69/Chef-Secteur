const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});

test('V219 garde Planning opérationnel et déplace le résumé mensuel vers Pilotage à 390 px',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPlanningSummaryV219&&window.StoreRunnerSectorPilotage&&window.state&&typeof window.renderAll==='function');

  await page.evaluate(()=>{
    const st=window.state||state;
    const stores=[
      {id:'v219-a',enseigne:'Boulanger',ville:'Alpha',active:true,intervalDays:30,lat:45.73,lon:4.84},
      {id:'v219-b',enseigne:'Darty',ville:'Beta',active:true,intervalDays:30,lat:45.74,lon:4.85},
      {id:'v219-c',enseigne:'Boulanger',ville:'Gamma',active:true,intervalDays:30,lat:45.75,lon:4.86},
      {id:'v219-priority',enseigne:'Darty',ville:'Delta',active:true,intervalDays:30,lat:45.76,lon:4.87}
    ];
    st.profile=Object.assign({},st.profile||{},{baseName:'Départ V219',baseAddress:'Lyon',baseLat:45.7578,baseLon:4.8320});
    st.settings=Object.assign({},st.settings||{},{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],visitMinutes:60,startTime:'08:30',endTime:'18:00'});
    st.stores=stores;
    st.plan={Lundi:[stores[0],stores[1]],Mardi:[stores[2]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.visits={};
    st.awayRanges=[{start:'2026-09-16',end:'2026-09-17'}];
    st.hotelReservations={'2026-09-16':{name:'Hôtel V219'}};
    try{if(typeof save==='function')save()}catch(_){}
    renderAll();
    if(typeof goTab==='function')goTab('planPanel');
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
  await page.waitForTimeout(300);

  const planningTop=page.locator('#planningProTop');
  await expect(planningTop).toBeVisible();
  await expect(planningTop).not.toContainText('Résumé du mois');
  await expect(planningTop).toContainText('Cette semaine');

  const week=page.locator('#proWeekMetricsV219');
  await expect(week).toBeVisible();
  await expect(week.locator('.proWeekMetricV219')).toHaveCount(5);
  const weekText=await week.innerText();
  expect(weekText).not.toContain('NaN');
  expect(weekText).toContain('visites');
  expect(weekText).toContain('priorités hors planning');

  const quality=page.locator('#planningProTop .proQualityCardV219');
  await expect(quality).toBeVisible();
  await expect(quality).toHaveAttribute('aria-expanded','false');
  const compactBox=await quality.boundingBox();
  if(!compactBox)throw new Error('Carte qualité V219 introuvable');
  expect(compactBox.height).toBeLessThan(150);
  await quality.tap();
  await expect(quality).toHaveAttribute('aria-expanded','true');
  await expect(quality.locator('#proQualityDetailV219')).toBeVisible();

  let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.evaluate(()=>window.StoreRunnerSectorPilotage.open(window));
  const panel=page.locator('#pilotagePanel');
  await expect(panel).toBeVisible();
  const month=panel.locator('.spMonthSummaryV219');
  await expect(month).toBeVisible();
  await expect(month).toContainText('Résumé du mois');
  await expect(month).toContainText('activité planifiée');
  await expect(month.locator('.proWeekMetricV219')).toHaveCount(4);
  const monthText=await month.innerText();
  expect(monthText).not.toContain('NaN');

  overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
