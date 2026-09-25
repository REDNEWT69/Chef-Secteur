const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* V258 — carte « Cette semaine » (réalisé d'abord) et vocabulaire Runner, à 390 px.
   Mercredi 23/09/2026. 12 magasins planifiés (6 Darty x2 + 6 simples = 18 crédits),
   17 visites terminées lundi → mercredi, chacune écrite par le 6P ET l'historique. */
const TODAY='2026-09-23';
async function boot(page,errors){
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.clock.setFixedTime(new Date(TODAY+'T10:00:00'));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerActivityMetrics&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&document.querySelector('#premiumHomeV2 .phGrid'));
}
async function seed(page,completed){
  await page.evaluate(completed=>{
    const st=window.state,M=window.StoreRunnerVisitModel;
    const mk=(p,e,i)=>({id:p+i,enseigne:e,ville:'Ville-Test '+p+i,adresse:i+' rue Test',dept:'73',lat:45.5+i/100,lon:5.9,active:true,priority:3,intervalDays:30});
    const list=[0,1,2,3,4,5].map(i=>mk('d','Darty',i)).concat([0,1,2,3,4,5].map(i=>mk('s','Enseigne Simple',i)));
    st.stores=list;st.profile=Object.assign({},st.profile,{baseName:'Maison',baseLat:45.19,baseLon:5.72});
    st.settings.weekDate='2026-09-21';st.settings.target=15;st.settings.days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    st.plan={Lundi:list.slice(0,3),Mardi:list.slice(3,6),Mercredi:list.slice(6,9),Jeudi:list.slice(9,12),Vendredi:[],Samedi:[]};
    st.visits={};st.businessV2=M.empty();
    let k=0;
    for(const day of ['2026-09-21','2026-09-22','2026-09-23'])for(const s of list){
      if(k>=completed)break;
      const id=M.start(st,s.id);M.editVisit(st,id,'conclusion',null,'Visite synthétique V258');M.complete(st,id,day);k++;
    }
    try{save()}catch(e){}
    renderAll();
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'test-v258'}}));
    goTab('homePanel');
  },completed);
}

test('Cette semaine : « 17 visites réalisées » en tête, planifié et crédits dessous, à 390 px',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page,17);
  const m=await page.evaluate(()=>StoreRunnerActivityMetrics.compute(state));
  expect(m.completedVisitsWeek,'6P + historique legacy du même jour : une seule visite').toBe(17);
  expect(m.plannedStoresWeek).toBe(12);expect(m.plannedVisitCreditsWeek).toBe(18);
  const legacyDays=await page.evaluate(()=>Object.values(state.visits).reduce((n,h)=>n+h.history.length,0));
  expect(legacyDays,'le 6P a bien aussi écrit l’historique legacy').toBe(17);
  const week=page.locator('#premiumHomeV2 .phCard[data-home-card="week"]');
  await expect(week.locator('.phLabel')).toHaveText('Cette semaine');
  await expect(week.locator('.phValue')).toHaveText('17 visites réalisées');
  await expect(week.locator('.phSub')).toHaveText('12 magasins planifiés · 18 crédits de visite · objectif 15 magasins');
  const box=await week.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  const clipped=await week.locator('.phValue').evaluate(el=>el.scrollWidth>el.clientWidth+1);
  expect(clipped,'la valeur principale tient dans la carte').toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Cette semaine sans visite réalisée : magasins planifiés en tête, comme avant',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page,0);
  const week=page.locator('#premiumHomeV2 .phCard[data-home-card="week"]');
  await expect(week.locator('.phValue')).toHaveText('12 magasins planifiés');
  await expect(week.locator('.phSub')).toHaveText('18 crédits de visite · objectif 15 magasins');
  expect(errors).toEqual([]);
});

test('Mode Runner : « Démarrer le run » puis « Reprendre le run », accueil et panneau',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page,6);  /* lundi + mardi faits : mercredi reste à courir */
  const card=page.locator('#premiumHomeV2 .phTerrain');
  await expect(card).toHaveAttribute('data-home-terrain','active');
  await expect(card.locator('.phTerrainMain')).toHaveText('Démarrer le run');
  await card.locator('.phTerrainOpen').click();
  await expect(page.locator('#terrainPanel')).toHaveClass(/active/);
  const runBtn=page.locator('#terrainPanel [data-sr-terrain]');
  await expect(runBtn).toHaveText('Démarrer le run');
  expect(await page.locator('#terrainPanel').evaluate(el=>/Reprendre la visite 6P|Démarrer la visite 6P/.test(el.textContent))).toBe(false);
  /* Le bouton ouvre toujours la visite 6P (même gestionnaire) ; au retour, on reprend le run. */
  await runBtn.click();
  await expect(page.locator('#srVisitDialog')).toHaveJSProperty('open',true);
  await expect.poll(()=>page.evaluate(()=>state.businessV2.visits.filter(v=>v.status==='draft').length)).toBe(1);
  await page.locator('#srVisitDialog').getByRole('button',{name:'Fermer',exact:true}).first().click();
  await expect(page.locator('#srVisitDialog')).toHaveJSProperty('open',false);
  await expect(runBtn).toHaveText('Reprendre le run');
  await page.evaluate(()=>goTab('homePanel'));
  await expect(card.locator('.phTerrainMain')).toHaveText('Reprendre le run');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
