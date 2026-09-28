/* V263.5 — un seul rendu pour le bandeau découché.
   auto-planning-fix.js (V189) possède la décision et le rendu de #overnightBox. L'ancien
   rendu V185 restait branché sur StoreRunnerOvernightV182.render : chaque rafraîchissement
   après génération, recalcul V251 ou priorités V187 (storeRunnerRefreshOvernightDecision)
   effaçait la réservation d'hôtel affichée. Fixture inventée : base (47, 1), deux jours
   enchaînés à ~180 km. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V263.5 : la réservation d’hôtel reste affichée après chaque rafraîchissement du découché',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-14T09:00:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&document.getElementById('planPanel')&&window.StoreRunnerOvernightV182&&typeof window.storeRunnerRefreshOvernightDecision==='function');
  await page.evaluate(()=>{
    const st=window.state;
    const mk=(id,lat,lon)=>({id,enseigne:'Enseigne '+id,ville:'Ville-Test '+id,adresse:'1 rue Test',dept:'99',
      lat,lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    st.profile=Object.assign({},st.profile,{baseName:'Base test',baseAddress:'Base',baseLat:47,baseLon:1,overnightMode:'auto',overnightMinSaving:20});
    st.stores=[mk('a',48.6,1),mk('b',48.62,1.02),mk('c',48.64,1.04),mk('d',48.66,1.06)];
    st.settings=Object.assign({},st.settings,{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',maxVisitsPerDay:4});
    st.plan={Lundi:[st.stores[0],st.stores[1]],Mardi:[st.stores[2],st.stores[3]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.excluded={};st.included={};st.locks={};st.calendarEvents=[];st.appointments=[];st.hotelReservations={};
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
  await page.waitForTimeout(1500);

  // Un seul propriétaire : les trois points d'entrée pointent vers le même rendu.
  expect(await page.evaluate(()=>window.StoreRunnerOvernightV182.render===window.renderOvernight)).toBe(true);
  expect(await page.evaluate(()=>window.StoreRunnerOvernightV182.analyze===window.StoreRunnerStoreControlsV189.futureOvernightAnalysis)).toBe(true);

  await page.locator('#planningOvernightCueV206').click();
  await page.waitForTimeout(250);
  const box=page.locator('#overnightBox');
  await expect(box).toContainText('Zone hôtel conseillée');
  await page.locator('#srHotelNameV212').fill('Hôtel Test');
  await page.locator('#srHotelRefV212').fill('REF-263-5');
  await page.getByRole('button',{name:'Enregistrer la réservation'}).click();
  await expect(box).toContainText('REF-263-5');

  /* Chemins réels qui rafraîchissent le bandeau : statut de génération / V251 / V187
     (storeRunnerRefreshOvernightDecision), appel direct de l'API V185, rendu global. */
  for(const refresh of [
    ()=>window.storeRunnerRefreshOvernightDecision(window.state.plan),
    ()=>window.StoreRunnerOvernightV182.render(),
    ()=>window.renderOvernight()
  ]){
    await page.evaluate(refresh);
    await expect(box).toContainText('Nuit sur place');
    await expect(box).toContainText('Hôtel réservé');
    await expect(box).toContainText('REF-263-5');
  }
  /* Les passes de réparation V185 différées (setTimeout après ces événements) ne
     réécrivent plus le bandeau avec l'ancienne vue. */
  for(const type of ['store-runner:planning-updated','store-runner:home-rendered']){
    await page.evaluate(t=>document.dispatchEvent(new CustomEvent(t)),type);
    await page.waitForTimeout(700);
    await expect(box).toContainText('REF-263-5');
    await expect(box).not.toContainText('Chercher les hôtels près de la fin de tournée');
  }
  expect(await page.evaluate(()=>window.state.hotelReservations['2026-09-14'].reference)).toBe('REF-263-5');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
