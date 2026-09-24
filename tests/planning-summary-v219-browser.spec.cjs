const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});

test('Planning masque les résumés redondants et garde le détail dans Pilotage à 390 px',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPlanningSummaryV219&&window.StoreRunnerSectorPilotage&&window.StoreRunnerNavigation&&window.state&&typeof window.renderAll==='function');

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

  /* Le point de départ reste éditable dans le header / Secteur mais sa grande carte
     n'a plus de raison de prendre de la hauteur dans le Planning. */
  const departureCard=page.locator('#planPanel .departureCard');
  await expect(departureCard).toHaveCount(1);
  await expect(departureCard).not.toBeVisible();

  /* Les alertes opérationnelles restent dans Planning. Seul le duo de reporting
     « Qualité du planning / Cette semaine » disparaît, car ces infos existent déjà
     dans les tuiles d'accueil et dans le détail d'activité. */
  const alerts=page.locator('#planningProTop>.proAlertCard');
  await expect(alerts).toBeVisible();
  const redundant=page.locator('#planningProTop>.proTop');
  await expect(redundant).toHaveCount(1);
  await expect(redundant).not.toBeVisible();

  const week=page.locator('#proWeekMetricsV219');
  await expect(week).toHaveCount(1);
  await expect(week).not.toBeVisible();

  const quality=page.locator('#planningProTop .proQualityCardV219');
  await expect(quality).toHaveCount(1);
  await expect(quality).not.toBeVisible();

  let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  /* V252.2 : le recalcul reste en tête de la vraie bottom sheet mais devient une carte
     compacte. À 390 px elle ne doit plus ressembler à un panneau géant qui écrase le
     reste des réglages. Le clic garde exactement le contrat V252.1. */
  await page.evaluate(()=>{
    window.StoreRunnerPlanningSummaryV219.repairPlanningSettingsUi(window);
    window.__v2521RecalcCalls=0;
    window.storeRunnerRecalculateRemainingWeek=async()=>{window.__v2521RecalcCalls++;return{ok:true}};
    window.StoreRunnerNavigation.openPlanningSettings();
  });
  const settings=page.locator('#planningSettings');
  await expect(settings).toHaveClass(/planningSettingsSheetOpen/);
  const repair=page.locator('#planningSettings .settingsInner > #planningRepairSettings');
  await expect(repair).toHaveCount(1);
  await expect(repair).toBeVisible();
  await expect(repair).toHaveClass(/planningRepairCardV2522/);
  await expect(repair.locator('.planningRepairTitleV2522')).toHaveText('Ajuster cette semaine');
  await expect(repair.locator('.planningRepairHintV2522')).toHaveText('Replacer une visite sans régénérer tes 3 semaines.');
  const recalc=repair.locator('#recalculateRemainingWeekBtn');
  await expect(recalc).toHaveText('↻ Recalculer le reste');
  const repairBox=await repair.boundingBox();
  expect(repairBox).toBeTruthy();
  expect(repairBox.y).toBeGreaterThanOrEqual(0);
  expect(repairBox.y).toBeLessThan(844);
  expect(repairBox.height).toBeLessThanOrEqual(190);
  const recalcBox=await recalc.boundingBox();
  expect(recalcBox).toBeTruthy();
  expect(recalcBox.height).toBeLessThanOrEqual(52);
  const fontSize=await recalc.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeLessThanOrEqual(14);
  const header=page.locator('#planningSettingsSheetHeader');
  await expect(header).toBeVisible();
  const order=await page.evaluate(()=>{
    const h=document.getElementById('planningSettingsSheetHeader'),r=document.getElementById('planningRepairSettings');
    return !!(h&&r&&h.nextElementSibling===r);
  });
  expect(order).toBeTruthy();
  await recalc.click();
  await expect(settings).not.toHaveClass(/planningSettingsSheetOpen/);
  expect(await page.evaluate(()=>window.__v2521RecalcCalls)).toBe(1);

  /* Le reporting détaillé n'est pas supprimé : il reste accessible dans l'écran
     d'activité / Pilotage, qui est précisément sa bonne place. */
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