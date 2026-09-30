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

function profileLayersOf(fn){
  const out=[];let cur=fn,guard=0;
  while(typeof cur==='function'&&guard++<20){
    out.push(cur.__v184PlanNeutral?'v184':cur.__v182Wrapped?'v182':'owner');
    cur=cur.__v184Original||cur.__v182Original||cur.__original||null;
  }
  return out;
}

test('r25 : le seuil 0 km survit au vrai saveProfile async, au formulaire et à la restauration',async({page})=>{
  const errors=[];let nominatimRequests=0;
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.route('https://nominatim.openstreetmap.org/search**',async route=>{
    nominatimRequests++;
    await new Promise(resolve=>setTimeout(resolve,120));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      lat:'45.736600',lon:'4.763600',display_name:'1 rue du Test, 69340 Francheville, France',
      address:{town:'Francheville',postcode:'69340'}
    }])});
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.__chefStorage&&window.ChefReliability&&
    typeof window.saveProfile==='function'&&typeof window.fillProfileForm==='function'&&
    document.getElementById('pSaving'));
  await page.waitForTimeout(1800);

  const saved=await page.evaluate(async()=>{
    state.profile=Object.assign({},state.profile||{}, {
      sectorName:'Secteur r25',repName:'Leia',baseName:'',baseAddress:'',baseLat:null,baseLon:null,
      overnightMode:'auto',overnightMinSaving:80
    });
    save();
    const values={pSector:'Secteur r25',pRep:'Leia',pBaseName:'Francheville',
      pBaseAddress:'1 rue du Test, Francheville',pBaseLat:'',pBaseLon:'',pOvernight:'auto',pSaving:'0'};
    for(const [id,value] of Object.entries(values))document.getElementById(id).value=value;
    const result=await window.saveProfile();
    const afterSave=state.profile.overnightMinSaving;
    fillProfileForm();
    const formAfterSave=document.getElementById('pSaving').value;
    if(typeof window.__chefStorage.flush==='function')await window.__chefStorage.flush();
    const persisted=ChefReliability.load(window.__chefStorage);
    const persistedValue=persisted.profile.overnightMinSaving;
    window.state=persisted;
    fillProfileForm();
    return{result,afterSave,formAfterSave,persistedValue,
      restoredValue:state.profile.overnightMinSaving,
      formAfterRestore:document.getElementById('pSaving').value,
      lat:state.profile.baseLat,lon:state.profile.baseLon};
  });

  expect(saved.result).toBe(true);
  expect(nominatimRequests,'le chemin async doit réellement géocoder une fois').toBe(1);
  expect(saved.lat).toBe(45.7366);
  expect(saved.lon).toBe(4.7636);
  expect(saved.afterSave).toBe(0);
  expect(saved.formAfterSave).toBe('0');
  expect(saved.persistedValue).toBe(0);
  expect(saved.restoredValue).toBe(0);
  expect(saved.formAfterRestore).toBe('0');

  const contract=await page.evaluate(async()=>{
    const input=document.getElementById('pSaving'),values={};
    input.value='';await window.saveProfile();values.empty=state.profile.overnightMinSaving;
    input.type='text';input.value='pas-un-nombre';await window.saveProfile();values.nonNumeric=state.profile.overnightMinSaving;
    input.type='number';input.value='37.5';await window.saveProfile();values.numeric=state.profile.overnightMinSaving;
    input.value='0';await window.saveProfile();values.zero=state.profile.overnightMinSaving;
    if(typeof window.__chefStorage.flush==='function')await window.__chefStorage.flush();
    values.persisted=ChefReliability.load(window.__chefStorage).profile.overnightMinSaving;
    fillProfileForm();values.form=document.getElementById('pSaving').value;
    return values;
  });
  expect(contract).toEqual({empty:80,nonNumeric:80,numeric:37.5,zero:0,persisted:0,form:'0'});

  await page.evaluate(()=>{
    for(const type of ['store-runner:profile-saved','store-runner:planning-updated','store-runner:home-rendered','store-runner:data-restored']){
      document.dispatchEvent(new CustomEvent(type,{detail:{reason:'r25-zero-stability'}}));
    }
  });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>({state:state.profile.overnightMinSaving,form:(fillProfileForm(),document.getElementById('pSaving').value)})))
    .toEqual({state:0,form:'0'});
  expect(errors).toEqual([]);
});

test('B3 : ownership découché stable et rafraîchi au changement de jour',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const RealDate=Date;
    window.__r25Now=RealDate.parse('2026-09-14T09:00:00');
    class R25Date extends RealDate{
      constructor(...args){super(...(args.length?args:[window.__r25Now]))}
      static now(){return window.__r25Now}
    }
    window.Date=R25Date;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerOvernightV182&&window.StoreRunnerStoreControlsV189&&
    typeof window.saveProfile==='function'&&typeof window.storeRunnerRefreshOvernightDecision==='function');
  await page.waitForTimeout(1800);
  await page.evaluate(()=>{
    const mk=(id,lat)=>({id,enseigne:'Test',ville:'Ville '+id,adresse:'1 rue Test',dept:'99',
      lat,lon:1,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    state.profile=Object.assign({},state.profile,{baseName:'Base',baseAddress:'Base',baseLat:47,baseLon:1,
      overnightMode:'auto',overnightMinSaving:0});
    state.settings=Object.assign({},state.settings,{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi']});
    state.stores=[mk('lundi',49),mk('mardi',49.01),mk('mercredi',48.6)];
    state.plan={Lundi:[state.stores[0]],Mardi:[state.stores[1]],Mercredi:[state.stores[2]],Jeudi:[],Vendredi:[],Samedi:[]};
    state.excluded={};state.included={};state.locks={};state.calendarEvents=[];state.appointments=[];state.hotelReservations={};
    document.getElementById('weekDate').value='2026-09-14';
    save();renderAll();
  });
  const before=await page.evaluate(profileLayers=>({
    layers:(0,eval)('('+profileLayers+')(window.saveProfile)'),
    analyzeAvailable:typeof StoreRunnerOvernightV182.analyze==='function',
    v189AnalyzeOwner:StoreRunnerOvernightV182.analyze===StoreRunnerStoreControlsV189.futureOvernightAnalysis,
    v189RenderOwner:StoreRunnerOvernightV182.render===window.renderOvernight,
    fromDate:storeRunnerRefreshOvernightDecision(state.plan).candidate.fromDate
  }),profileLayersOf.toString());
  expect(before.layers).toEqual(['v184','v182','owner']);
  expect(before.analyzeAvailable).toBe(true);
  expect(before.v189AnalyzeOwner).toBe(true);
  expect(before.v189RenderOwner).toBe(true);
  expect(before.fromDate).toBe('2026-09-14');

  await page.evaluate(()=>{
    for(let index=0;index<12;index++)for(const type of ['store-runner:planning-updated','store-runner:home-rendered','store-runner:data-restored']){
      document.dispatchEvent(new CustomEvent(type,{detail:{reason:'b3-ownership'}}));
    }
  });
  await page.waitForTimeout(500);
  const after=await page.evaluate(profileLayers=>{
    window.__r25Now=Date.parse('2026-09-15T09:00:00');
    const analysis=storeRunnerRefreshOvernightDecision(state.plan);
    return{
      layers:(0,eval)('('+profileLayers+')(window.saveProfile)'),
      analyzeAvailable:typeof StoreRunnerOvernightV182.analyze==='function',
      v189AnalyzeOwner:StoreRunnerOvernightV182.analyze===StoreRunnerStoreControlsV189.futureOvernightAnalysis,
      v189RenderOwner:StoreRunnerOvernightV182.render===window.renderOvernight,
      fromDate:analysis&&analysis.candidate&&analysis.candidate.fromDate,
      box:document.getElementById('overnightBox').textContent
    };
  },profileLayersOf.toString());
  expect(after.layers).toEqual(before.layers);
  expect(after.layers.filter(x=>x==='v184')).toHaveLength(1);
  expect(after.layers.filter(x=>x==='v182')).toHaveLength(1);
  expect(after.analyzeAvailable).toBe(true);
  expect(after.v189AnalyzeOwner).toBe(true);
  expect(after.v189RenderOwner).toBe(true);
  expect(after.fromDate,'le jour passé doit être écarté lors du rafraîchissement').toBe('2026-09-15');
  expect(after.box).toContain('Nuit sur place');
  expect(errors).toEqual([]);
});

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
