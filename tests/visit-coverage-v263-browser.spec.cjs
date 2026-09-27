const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});

/* V263 — bloc « Couverture » du planning et aperçu du recalcul, sur un vrai téléphone 390 px.
   Les dates sont calculées depuis la vraie date du navigateur : le test ne vieillit pas. */
async function seed(page){
  return page.evaluate(()=>{
    const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const ago=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d)};
    const now=new Date(),nextMonday=new Date(now),weekday=now.getDay()||7;nextMonday.setDate(now.getDate()+((8-weekday)%7||7));
    const week=iso(nextMonday);
    const mk=(id,enseigne,ville,dLat,extra)=>Object.assign({id,enseigne,ville,adresse:'1 rue du Test',dept:'69',active:true,lat:45.75+dLat,lon:4.85,priority:3,intervalDays:30,products:['À confirmer']},extra||{});
    const stores=[
      mk('cov-late','Darty','Chambéry',0.01),
      mk('cov-over','Boulanger','Limonest',0.02),
      mk('cov-never','Fnac','Villeurbanne',0.03),
      mk('cov-ok','Fnac','Bron',0.04),
      mk('cov-weekly','Carrefour','Vénissieux',0.05,{intervalDays:7})
    ];
    state.stores=stores;
    state.visits={
      'cov-late':{lastVisit:ago(40),history:[ago(40)]},
      'cov-over':{lastVisit:ago(1),history:[ago(13),ago(9),ago(5),ago(1)]},
      'cov-ok':{lastVisit:ago(10),history:[ago(10)]},
      'cov-weekly':{lastVisit:ago(4),history:[ago(4)]}
    };
    state.businessV2=window.StoreRunnerVisitModel&&typeof StoreRunnerVisitModel.empty==='function'?StoreRunnerVisitModel.empty():{version:2,revision:0,visits:[],actions:[],storeSnapshots:{}};
    state.profile=Object.assign({},state.profile,{baseLat:45.75,baseLon:4.85,baseName:'Lyon'});
    state.excluded={};state.included={};state.locks={};state.appointments=[];state.manualWeekEdits={};state.calendarEvents=[];
    state.settings=Object.assign({},state.settings,{weekDate:week,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00',visitMinutes:45,brands:[],products:[]});
    state.plan={Lundi:[],Mardi:[stores[4]],Mercredi:[stores[1]],Jeudi:[],Vendredi:[],Samedi:[]};
    const input=document.getElementById('weekDate');if(input)input.value=week;
    try{(window.__chefStorage||localStorage).setItem('chef_sector_plan_archive_v1',JSON.stringify({[week]:{weekMonday:week,plan:JSON.parse(JSON.stringify(state.plan))}}))}catch(e){}
    if(typeof save==='function')save();
    if(typeof renderAll==='function')renderAll();
    if(typeof goTab==='function')goTab('planPanel');
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'test-v263'}}));
    return{week};
  });
}

test('V263 : le bloc Couverture dit en une ligne ce qui manque, ce qui est à jour et ce qui est déjà bien couvert',async({page})=>{
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerVisitCoverage&&document.readyState!=='loading'&&document.getElementById('planPanel'));
  await seed(page);
  const block=page.locator('#planningCoverageV263');
  await expect(block).toBeVisible();
  await expect(block.locator('summary')).toContainText('Couverture du secteur');
  await expect(block.locator('summary')).toContainText('2 à rattraper');
  await expect(block.locator('summary')).toContainText('2 déjà bien couverts');
  await expect(block.locator('summary')).toContainText('1 à jour');

  await block.locator('summary').click();
  await expect(block).toHaveJSProperty('open',true);
  const late=block.locator('[data-cov-store="cov-late"]');
  await expect(late).toContainText('Darty Chambéry');
  await expect(late).toContainText(/il y a 40 j · fréquence 30 j · retard 10 j · 0 visite ce mois/);
  await expect(late).toContainText('En retard');
  await expect(late).toContainText('hors planning');
  await expect(block.locator('[data-cov-store="cov-never"]')).toContainText('Jamais visité');
  const over=block.locator('[data-cov-store="cov-over"]');
  await expect(over).toContainText('Sur-visité');
  await expect(over).toContainText('prévu le');
  await expect(block.locator('[data-cov-store="cov-ok"]')).toContainText('Déjà suffisamment visité');

  const layout=await page.evaluate(()=>{
    const b=document.getElementById('planningCoverageV263'),r=b.getBoundingClientRect(),tools=document.getElementById('planningToolsV2');
    const rows=[...b.querySelectorAll('.cov263Row')].map(x=>x.getBoundingClientRect());
    return{overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,left:r.left,right:r.right,width:window.innerWidth,
      afterTools:!!tools&&tools.nextElementSibling===b,rowsInside:rows.every(x=>x.left>=r.left-1&&x.right<=r.right+1),minRowHeight:Math.min(...rows.map(x=>x.height))};
  });
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.width);
  expect(layout.rowsInside).toBeTruthy();
  expect(layout.minRowHeight).toBeGreaterThanOrEqual(44);
  expect(layout.afterTools).toBeTruthy();

  await late.click();
  const quick=page.locator('#sqCoverageV263');
  await expect(quick).toBeVisible();
  await expect(quick).toContainText('En retard');
  await expect(quick).toContainText('retard 10 j');
});

test('V263 : le recalcul montre ce qu’il retire et ce qu’il ajoute avant de l’appliquer',async({page})=>{
  const messages=[];
  page.on('dialog',d=>{messages.push(d.message());d.accept()});
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerVisitCoverage&&typeof window.storeRunnerRecalculateRemainingWeek==='function'&&document.readyState!=='loading'&&document.querySelector('input[data-day]'));
  await seed(page);
  const result=await page.evaluate(async()=>{const r=await window.storeRunnerRecalculateRemainingWeek();return{ok:r.ok,error:r.error||'',removed:(r.removed||[]).length,added:(r.added||[]).length}});
  expect(result.ok,result.error).toBeTruthy();
  expect(result.removed).toBe(1);
  expect(result.added).toBe(1);
  expect(messages.length).toBe(1);
  expect(messages[0]).toContain('Ce que le recalcul change');
  expect(messages[0]).toContain('1 retiré car déjà visité récemment : Boulanger Limonest');
  expect(messages[0]).toMatch(/1 ajouté car en retard ou jamais visité : Darty Chambéry/);
  expect(messages[0]).toMatch(/Magasins à rattraper planifiés : 0 → 1/);
  const after=await page.evaluate(()=>({ids:Object.values(state.plan).flat().map(s=>s.id),status:(document.getElementById('planningGenerateStatus')||{}).textContent||''}));
  expect(after.ids).not.toContain('cov-over');
  expect(after.ids).toContain('cov-late');
  expect(after.ids).toContain('cov-weekly');
  expect(after.ids).not.toContain('cov-ok');
});

test('V263 : le graphique du Pilotage résume le planning et filtre la liste d’un tap, à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerVisitCoverage&&window.StoreRunnerSectorPilotage&&document.readyState!=='loading'&&document.getElementById('planPanel'));
  await seed(page);
  const block=page.locator('#planningCoverageV263');
  await block.locator('summary').click();
  await expect(block.locator('.cov263Month')).toContainText('Ce mois-ci');
  await block.locator('.cov263Link').click();

  const panel=page.locator('#pilotagePanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.spHead')).toContainText('Planning et suivi terrain');
  await expect(panel.locator('.spKpi')).toHaveCount(4);
  await expect(panel.locator('.spKpi').first()).toContainText('3/5 magasins à jour');
  await expect(panel.locator('[data-sp-cov="todo"].spKpi')).toContainText('2');
  await expect(panel.locator('[data-sp-cov="todo"].spKpi')).toContainText('1 en retard · 1 jamais vus');
  await expect(panel.locator('.spKpi').nth(2)).toContainText('visites faites cette semaine');
  await expect(panel.locator('.spKpi').nth(2)).toContainText('0 prévue cette semaine');
  await expect(panel.locator('.spRingCenter')).toContainText('60%');
  // Ouvert depuis le planning : directement sur les magasins restants à voir.
  await expect(panel.locator('.spCovFilter')).toContainText('Restants à voir · 2 magasins');
  await expect(panel.locator('.spTableRow')).toHaveCount(2);

  await panel.locator('.spCovLegend [data-sp-cov="covered"]').click();
  await expect(panel.locator('.spCovLegend [data-sp-cov="covered"]')).toHaveAttribute('aria-pressed','true');
  await expect(panel.locator('.spCovFilter')).toContainText('Déjà bien couverts · 2 magasins');
  await expect(panel.locator('.spTableRow[data-sp-store="cov-over"]')).toContainText('Sur-visité');
  await expect(panel.locator('.spTableRow[data-sp-store="cov-late"]')).toHaveCount(0);

  await panel.locator('.spCovFilter button').click();
  await expect(panel.locator('.spCovFilter')).toHaveCount(0);
  await expect(panel.locator('.spTableRow')).toHaveCount(5);
  const late=panel.locator('.spTableRow[data-sp-store="cov-late"]');
  await expect(late).toContainText('retard 10 j');
  await expect(late).toContainText('En retard');

  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,minLegend:Math.min(...[...document.querySelectorAll('#pilotagePanel .spCovLegend button')].map(b=>b.getBoundingClientRect().height))}));
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.minLegend).toBeGreaterThanOrEqual(44);
  await late.click();
  await expect(page.locator('#sqCoverageV263')).toContainText('En retard');
  expect(errors).toEqual([]);
});
