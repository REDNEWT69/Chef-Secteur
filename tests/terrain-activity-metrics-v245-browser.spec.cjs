const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* V245 — Mode terrain contextuel. Mercredi 23/09/2026, tournée de trois magasins. */
const TODAY='2026-09-23';
async function boot(page,errors){
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.clock.setFixedTime(new Date(TODAY+'T10:00:00'));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerActivityMetrics&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&document.querySelector('#premiumHomeV2 .phGrid'));
}
async function seed(page,withTour){
  await page.evaluate(withTour=>{
    const st=window.state;
    const S=(id,enseigne,ville,adresse,lat,lon)=>({id,enseigne,ville,adresse,dept:'73',lat,lon,active:true,priority:3,intervalDays:30});
    st.stores=[S('t1','Boulanger','Chambéry','1253 Avenue des Landiers',45.585,5.905),S('t2','Darty','Chambéry','Rue de la Gare',45.571,5.918),S('t3','Enseigne Simple','Aix-les-Bains','Place Centrale',45.688,5.915),S('t4','Carrefour','Annecy','Route X',45.9,6.12)];
    st.profile=Object.assign({},st.profile,{baseName:'Maison',baseLat:45.19,baseLon:5.72});
    st.settings.weekDate='2026-09-21';st.settings.target=15;st.settings.days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    const byId=id=>st.stores.find(s=>s.id===id);
    st.plan={Lundi:[byId('t4')],Mardi:[],Mercredi:withTour?[byId('t1'),byId('t2'),byId('t3')]:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.visits={};st.businessV2=window.StoreRunnerVisitModel.empty();
    try{save()}catch(e){}
    renderAll();
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'test-v245'}}));
  },withTour);
  await page.evaluate(()=>{if(typeof goTab==='function')goTab('homePanel')});
}

test('Accueil : carte noire Mode terrain, 6P, itinéraire, magasin suivant et fin de tournée à 390 px',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page,true);
  const card=page.locator('#premiumHomeV2 .phTerrain');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-home-terrain','active');
  await expect(card.locator('.phTerrainDay')).toHaveText('Mercredi · visite 1 / 3');
  await expect(card.locator('.phTerrainStore')).toHaveText('Boulanger Chambéry');
  await expect(card.locator('.phTerrainMeta')).toContainText('1253 Avenue des Landiers');
  await expect(card.locator('.phTerrainMeta')).toContainText('km à vol d’oiseau');
  await expect(card.locator('.phTerrainSummary')).toContainText('0/3 magasins faits · 5 crédits de visite');
  await expect(card.locator('.phTerrainNext')).toContainText('Darty Chambéry');
  expect(await page.locator('#premiumHomeV2 .phVisitLink').count(),'pas de doublon « Ta journée est prête »').toBe(0);
  const bg=await card.evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(bg,'identité noire conservée').toBe('rgb(17, 17, 17)');

  // Itinéraire : magasin courant, adresse réelle.
  await page.evaluate(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(String(u));return null}});
  await card.locator('.phTerrainRoute').click();
  const opened=await page.evaluate(()=>window.__opened);
  expect(opened).toHaveLength(1);
  expect(decodeURIComponent(opened[0])).toContain('1253 Avenue des Landiers Chambéry');

  // CTA 6P : même workflow que le terrainPanel (StoreRunnerVisits.start).
  await card.locator('.phTerrainMain').click();
  await expect(page.locator('#srVisitDialog')).toHaveJSProperty('open',true);
  await expect.poll(()=>page.evaluate(()=>state.businessV2.visits.filter(v=>v.storeId==='t1'&&v.status==='draft').length)).toBe(1);
  await page.locator('#srVisitDialog').getByRole('button',{name:'Fermer',exact:true}).first().click();
  await expect(page.locator('#srVisitDialog')).toHaveJSProperty('open',false);
  await expect(card.locator('.phTerrainMain')).toHaveText('Reprendre le run');

  // Visite terminée par le 6P → carte au magasin suivant, sans recharger.
  await page.evaluate(()=>{const M=window.StoreRunnerVisitModel,v=state.businessV2.visits.find(x=>x.storeId==='t1'&&x.status==='draft');M.editVisit(state,v.id,'conclusion',null,'Visite terrain V245');M.complete(state,v.id,'2026-09-23');try{save()}catch(e){}renderAll()});
  await expect(card.locator('.phTerrainDay')).toHaveText('Mercredi · visite 2 / 3');
  await expect(card.locator('.phTerrainStore')).toHaveText('Darty Chambéry');
  await expect(card.locator('.phTerrainMain')).toHaveAttribute('data-sr-start','t2');

  // Le terrainPanel suit la même journée (il ne repart plus du lundi).
  await card.locator('.phTerrainOpen').click();
  await expect(page.locator('#terrainPanel')).toHaveClass(/active/);
  await expect(page.locator('#terrainDay')).toHaveText('Mercredi · visite 2 / 3');
  await expect(page.locator('#terrainStore')).toHaveText('Darty · Chambéry');
  await page.evaluate(()=>goTab('homePanel'));

  // « ✓ Visité » legacy puis dernière visite → fin de tournée propre.
  await page.evaluate(()=>{markVisited('t2')});
  await expect(card.locator('.phTerrainDay')).toHaveText('Mercredi · visite 3 / 3');
  await expect(card.locator('.phTerrainNext')).toContainText('Dernier magasin');
  await page.evaluate(()=>{markVisited('t3')});
  await expect(card).toHaveAttribute('data-home-terrain','done');
  await expect(card).toContainText('tournée terminée');
  await expect(card).toContainText('3 / 3 magasins visités');

  // Compteurs de l'historique : la même source, des libellés explicites.
  await page.evaluate(()=>goTab('historyPanel'));
  const kpis=page.locator('#historyKpis');
  await expect(kpis).toContainText('visites réalisées aujourd’hui');
  await expect(kpis).toContainText('magasins actifs');
  const m=await page.evaluate(()=>StoreRunnerActivityMetrics.compute(state));
  expect(m.completedVisitsToday).toBe(3);
  expect(m.plannedStoresWeek).toBe(4);
  expect(m.plannedVisitCreditsWeek).toBe(6);
  await expect(kpis.locator('.kpi').nth(2).locator('b')).toHaveText('3');
  await expect(kpis.locator('.kpi').nth(3).locator('b')).toHaveText('4');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Planning : « Passer en mode terrain » sur un jour avec visites, rien sur un jour vide, secours dans Plus',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page,true);
  await page.evaluate(()=>goTab('planPanel'));
  await page.locator('#dayTabs .periodDayTab[data-date="2026-09-23"]').click();
  const btn=page.locator('#planningTerrainBtn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('▶ Passer en mode terrain');
  await page.locator('#dayTabs .periodDayTab[data-date="2026-09-22"]').click();
  await expect(btn).toBeHidden();
  await page.locator('#dayTabs .periodDayTab[data-date="2026-09-21"]').click();
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.locator('#terrainPanel')).toHaveClass(/active/);
  await expect(page.locator('#terrainDay')).toHaveText('Lundi · visite 1 / 1');
  await expect(page.locator('#terrainStore')).toHaveText('Carrefour · Annecy');
  expect(await page.locator('#terrainPanel').count(),'un seul terrainPanel').toBe(1);

  // Secours : Plus → Mode terrain, revenu sur la journée du jour.
  await page.evaluate(()=>goTab('homePanel'));
  await page.locator('#bottomAppNav [data-more]').click();
  const fallback=page.locator('#moreSheetV2 [data-terrain-fallback]');
  await expect(fallback).toBeVisible();
  await fallback.click();
  await expect(page.locator('#terrainPanel')).toHaveClass(/active/);
  await expect(page.locator('#terrainDay')).toHaveText('Mercredi · visite 1 / 3');
  expect(await page.locator('#bottomAppNav [data-panel="terrainPanel"]').count(),'pas d’onglet Terrain principal sur mobile').toBe(0);
  expect(errors).toEqual([]);
});

test('Sans tournée aujourd’hui : accueil normal, aucune carte terrain vide',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page,false);
  await expect(page.locator('#premiumHomeV2 .phVisitLink')).toContainText('Prépare ta journée');
  expect(await page.locator('#premiumHomeV2 .phTerrain').count()).toBe(0);
  const week=page.locator('#premiumHomeV2 .phCard[data-home-card="week"]');
  await expect(week.locator('.phValue')).toHaveText('1 magasin planifié');
  await expect(week.locator('.phSub')).toContainText('1 crédit de visite');
  await expect(week.locator('.phSub')).toContainText('objectif 15 magasins');
  expect(errors).toEqual([]);
});
