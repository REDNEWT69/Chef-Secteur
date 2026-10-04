const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});
/* Explorer Terrain V1 — Mes magasins + fiche Magasin 360, mobile 390 px : filtres, ligne magasin,
   contraintes actives, frise, liens Planning / Visite / Photos / Pilotage. */
test('Mes magasins filtrable, fiche 360 avec contraintes, frise et liens',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.clock.install({time:new Date('2026-10-07T09:00:00')});
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerStoreExplorer&&window.StoreRunnerPeriodDaySlider&&window.StoreRunnerVisitModel&&window.state&&window.__chefStorage);
  await page.clock.runFor(1500);
  const visitId=await page.evaluate(()=>{
    const M=StoreRunnerVisitModel,blank=()=>({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});
    const mk=(id,ville,extra)=>Object.assign({id,enseigne:'Enseigne',ville,adresse:'1 rue Test',dept:'69',lat:45.7,lon:4.8,freq:'Mensuel',active:true,priority:3,products:['Blanc']},extra||{});
    const a=mk('ex-a','Alpha'),b=mk('ex-b','Bravo',{freq:'Hebdo'}),c=mk('ex-c','Charlie');
    const plan=blank();plan.Jeudi=[a,b];
    state.settings={...state.settings,weekDate:'2026-10-05',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']};
    state.stores=[a,b,c];state.plan=plan;state.notes={};state.included={};state.excluded={};state.calendarEvents=[];state.hotelReservations={};
    state.locks={'ex-a':{day:'Jeudi',week:'2026-10-05'}};
    state.visits={'ex-b':{lastVisit:'2026-08-01',history:['2026-08-01']}};
    state.appointments=[{id:'ex-r1',storeId:'ex-a',date:'2026-10-13',time:'14:00',duration:60,type:'Formation',note:''},{id:'ex-h1',storeId:'ex-a',date:'2026-10-08',time:'09:30',duration:45,type:'Horaire manuel',manualHours:true}];
    state.storeContacts={'ex-a':[{name:'Marie Durand',role:'Responsable',email:'marie@example.com'}]};
    state.businessV2=M.empty();
    const id=M.start(state,'ex-a');M.editVisit(state,id,'conclusion',null,'Passage très utile');M.complete(state,id,'2026-10-05');
    __chefStorage.setItem('chef_sector_plan_archive_v1',JSON.stringify({'2026-10-05':{weekMonday:'2026-10-05',plan}}));
    __chefStorage.setItem('chef_sector_range_v1',JSON.stringify({start:'2026-10-05',end:'2026-10-09',workDays:state.settings.days}));
    save();renderAll();goTab('storesPanel');renderStores();
    window.__opened=null;const real=StoreRunnerVisits.openVisit;StoreRunnerVisits.openVisit=function(v){window.__opened=v;return true};
    return id;
  });
  await page.clock.runFor(300);
  // --- Mes magasins -----------------------------------------------------------------------------------------
  const bar=page.locator('#srExplorerBar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('h2')).toHaveText('Mes magasins');
  await expect(bar.locator('[data-sr-x-count]')).toContainText('3 magasins actifs');
  await expect(page.locator('#storeList .storeline')).toHaveCount(3);
  const lineB=page.locator('#storeList .storeline[data-store-id="ex-b"]');
  await expect(lineB.locator('.srXRow')).toContainText('En retard');
  await expect(lineB.locator('.srXRow')).toContainText('Dernière');
  await expect(lineB.locator('.srXRow')).toContainText('Prochaine');
  await expect(page.locator('#storeList .storeline[data-store-id="ex-c"] .srXRow')).toContainText('Jamais visité');
  await expect(page.locator('#storeList .storeline[data-store-id="ex-a"] .srXRow')).toContainText('3 contraintes');
  for(const sel of ['[data-sr-x-status="late"]','[data-sr-x-priority="P3"]','.srXOpen']){
    const box=await page.locator(sel).first().boundingBox();expect(box.height,sel+' cible tactile').toBeGreaterThanOrEqual(44);
  }
  await bar.locator('[data-sr-x-status="late"]').click();
  await expect(page.locator('#storeList .storeline')).toHaveCount(1);
  await expect(page.locator('#storeList .storeline')).toHaveAttribute('data-store-id','ex-b');
  await expect(bar.locator('[data-sr-x-status="late"]')).toHaveAttribute('aria-pressed','true');
  await bar.locator('[data-sr-x-status="todo"]').click();
  await expect(page.locator('#storeList .storeline')).toHaveCount(2);
  await bar.locator('[data-sr-x-status="all"]').click();
  await expect(page.locator('#storeList .storeline')).toHaveCount(3);
  await page.locator('#storeSearch').fill('charlie');await page.locator('#storeSearch').dispatchEvent('input');
  await expect(page.locator('#storeList .storeline')).toHaveCount(1);
  await page.locator('#storeSearch').fill('');await page.locator('#storeSearch').dispatchEvent('input');
  // --- Fiche 360 --------------------------------------------------------------------------------------------------
  await page.locator('#storeList .storeline[data-store-id="ex-a"] .srXOpen').click();
  const sec=page.locator('#srStore360');
  await expect(sec).toBeVisible();
  await expect(sec).toContainText('Contraintes actives');
  await expect(sec.locator('.srXList [data-kind="lock_dated"]')).toContainText('Pose manuelle');
  await expect(sec.locator('.srXList [data-kind="arrival"]')).toContainText('Arrivée imposée 09:30');
  await expect(sec.locator('.srXList [data-kind="arrival"]')).toContainText('Strict');
  await expect(sec.locator('.srXList [data-kind="appointment"]')).toContainText('Formation');
  await expect(sec).toContainText('Marie Durand');
  await expect(sec.locator('.srXTl [data-kind="planned"]')).toBeVisible();
  await expect(sec.locator('.srXTl [data-kind="visit"]')).toContainText('Visite réalisée');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  for(const sel of ['.srXLinks button','.srXTl button']){const box=await sec.locator(sel).first().boundingBox();expect(box.height,sel).toBeGreaterThanOrEqual(44)}
  // Liens : Visite -> StoreRunnerVisits.openVisit, Photos -> galerie, Pilotage -> panneau, Planning -> date.
  await sec.locator('.srXLinks [data-sr-x-visit]').click();
  expect(await page.evaluate(()=>window.__opened)).toBe(visitId);
  await page.locator('#storeQuickSheet').evaluate(()=>{});
  await expect(page.locator('#storeQuickSheet')).not.toHaveClass(/open/);
  await page.evaluate(()=>openStoreQuick('ex-a'));
  await expect(sec).toBeVisible();
  await sec.locator('.srXLinks [data-sr-x-photos]').click();
  await expect(page.locator('#storePhotosDialog')).toHaveJSProperty('open',true);
  await page.evaluate(()=>{const d=document.getElementById('storePhotosDialog');d.close()});
  await page.evaluate(()=>openStoreQuick('ex-a'));
  await sec.locator('.srXLinks [data-sr-x-pilotage]').click();
  await expect(page.locator('#pilotagePanel')).toHaveClass(/active/);
  await page.evaluate(()=>{goTab('storesPanel');openStoreQuick('ex-a')});
  await sec.locator('.srXLinks [data-sr-x-plan]').click();
  await page.clock.runFor(300);
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  expect(await page.evaluate(()=>({week:state.settings.weekDate,tab:document.querySelector('#dayTabs .periodDayTab.active')?.dataset.date}))).toEqual({week:'2026-10-05',tab:'2026-10-08'});
  // Planning -> Magasin : toucher une visite du planning rouvre la fiche avec ses contraintes.
  await page.evaluate(()=>openStoreQuick('ex-b'));
  await expect(sec).toContainText('Aucune contrainte');
  // Refus lisible : un magasin exclu cherché dans « Ajouter un magasin » n'est plus silencieusement absent.
  await page.evaluate(()=>{state.excluded={'ex-c':true};save();closeStoreQuick();goTab('planPanel');StoreRunnerPeriodDaySlider.openDate('2026-10-08')});
  await page.clock.runFor(300);
  await page.locator('.pmvAdd').first().click();
  await page.locator('#pmvSearch').fill('charlie');await page.locator('#pmvSearch').dispatchEvent('input');
  const refused=page.locator('#pmvResults .pmvRefused');
  await expect(refused).toHaveCount(1);
  await expect(refused).toBeDisabled();
  await expect(refused).toContainText('Exclu du planning');
  await expect(refused).toContainText('Réactiver');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
