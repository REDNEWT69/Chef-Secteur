const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* P0.2a — dans la vraie application, à 390 px. Lundi 09/11/2026 08:00, la génération 3 semaines
   laisse vide le férié du mercredi 11/11 (agenda Google « Jours fériés en France », Armistice
   1918). Mardi 10/11 09:00, la seconde visite du lundi a été ratée : « ↻ Recalculer le reste »
   doit la replacer sans jamais utiliser le férié. Sur r27, elle y était posée puis figée par la
   semaine devenue manuelle. */
const WEEK='2026-11-09',HOLIDAY='2026-11-11';
const HOLIDAY_EVENT={id:'fr.french#holiday@group.v.calendar.google.com:20261111_armistice',title:'Armistice 1918',location:'',calendar:'Jours fériés en France',date:HOLIDAY,start:HOLIDAY,end:'2026-11-12',allDay:true,source:'google'};

async function snapshot(page){
  return page.evaluate(()=>{
    const ids=r=>(r||[]).map(s=>String(s.id));
    const archive=JSON.parse((window.__chefStorage||localStorage).getItem('chef_sector_plan_archive_v1')||'{}');
    return{plan:Object.fromEntries(Object.entries(state.plan||{}).map(([d,r])=>[d,ids(r)])),
      weeks:Object.fromEntries(Object.entries(archive).map(([k,s])=>[k,{manualEdited:!!s.manualEdited,plan:Object.fromEntries(Object.entries(s.plan||{}).map(([d,r])=>[d,ids(r)]))}])),
      status:(document.getElementById('planningGenerateStatus')||{}).textContent||''};
  });
}

test('P0.2a : le férié laissé vide par la génération 3 semaines reste vide après « Recalculer le reste »',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  page.on('dialog',d=>d.accept());
  await page.clock.setFixedTime(new Date(WEEK+'T08:00:00'));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerTerrainPlanningV1&&window.StoreRunnerRouteOptimizerV251&&window.StoreRunnerVisitModel&&window.__calendarSemanticBlocks===true&&typeof window.storeRunnerRecalculateRemainingWeek==='function'&&document.readyState!=='loading'&&document.querySelector('input[data-day]'));
  /* V185 enveloppe le moteur 3 semaines après le boot (setTimeout) : on clique ensuite, comme un utilisateur. */
  await page.waitForFunction(()=>window.StoreRunnerTerrainPlanningV1.generateThreeWeekSnail.__v185Geo===true);

  await page.evaluate(async({week,holiday})=>{
    const base={lat:45.764,lon:4.8357};
    state.stores=Array.from({length:30},(_,i)=>{const a=(i*137.508)*Math.PI/180,km=8+(i*7)%38;return{id:'s'+String(i+1).padStart(2,'0'),enseigne:'Fnac',ville:'Ville '+(i+1),adresse:(i+1)+' rue du Test',dept:'69',lat:+(base.lat+km/111*Math.cos(a)).toFixed(5),lon:+(base.lon+km/78*Math.sin(a)).toFixed(5),priority:3,active:true,intervalDays:30}});
    state.visits={};state.excluded={};state.included={};state.locks={};state.appointments=[];state.manualWeekEdits={};state.hotelReservations={};
    state.businessV2=StoreRunnerVisitModel.empty();state.calendarEvents=[holiday];
    state.profile=Object.assign({},state.profile,{baseName:'Lyon',baseLat:base.lat,baseLon:base.lon,overnightMode:'never'});
    state.settings=Object.assign({},state.settings,{weekDate:week,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:8,maxVisitsPerDay:2,startTime:'08:30',endTime:'18:00',visitMinutes:45,brands:[],products:[]});
    state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const db=window.__chefStorage||localStorage;db.setItem('chef_sector_plan_archive_v1','{}');db.removeItem('chef_sector_range_v1');
    save();if(db.flush)await db.flush();
    initControls();
    document.querySelectorAll('[data-day]').forEach(el=>{el.checked=state.settings.days.includes(el.value)});
    const target=document.getElementById('target');if(target)target.value='8';
    const max=document.getElementById('maxVisitsPerDay');if(max)max.value='2';
    readPlanningControls();state.settings.maxVisitsPerDay=2;save();
    renderAll();goTab('planPanel');
  },{week:WEEK,holiday:HOLIDAY_EVENT});
  const blocked=await page.evaluate(date=>({terrain:StoreRunnerTerrainPlanningV1.dateBlocked(date,state),rows:calendarEventsForDate(date).map(r=>r.title)}),HOLIDAY);
  expect(blocked,'le férié est le seul événement du 11/11 et le moteur terrain le bloque').toEqual({terrain:true,rows:['Armistice 1918']});

  /* 1. Génération par le bouton principal : terrain → V185 → V251. */
  await page.evaluate(()=>{window.__p02aEvents=[];document.addEventListener('store-runner:planning-updated',e=>window.__p02aEvents.push(String(e.detail&&(e.detail.source||e.detail.reason)||'')))});
  await page.locator('#planningToolsV2 [data-planning-generate="three-weeks"]').click();
  await page.waitForFunction(()=>(window.__p02aEvents||[]).includes('snail-geo-v185'),null,{timeout:30000});
  await page.waitForTimeout(1500);
  const generated=await snapshot(page);
  expect(generated.status).toContain('Planning généré sur 3 semaines');
  expect(generated.plan.Mercredi,'génération : le férié du 11/11 reste vide').toEqual([]);
  expect(generated.weeks[WEEK].plan.Mercredi,'génération : le férié reste vide dans l’archive').toEqual([]);
  expect(generated.plan.Lundi).toHaveLength(2);
  expect(generated.plan.Mardi,'mardi plein : le férié est le premier jour libre pour une visite ratée').toHaveLength(2);

  /* 2. Mardi 10/11 09:00 : premier magasin du lundi visité, second raté. */
  await page.clock.setFixedTime(new Date('2026-11-10T09:00:00'));
  const [done,missed]=generated.plan.Lundi;
  await page.evaluate(async({done,week})=>{state.visits[done]={lastVisit:week,history:[week]};save();const db=window.__chefStorage||localStorage;if(db.flush)await db.flush();renderAll()},{done,week:WEEK});

  /* 3. Vrai bouton « ↻ Recalculer le reste » depuis les Réglages du planning. */
  await page.evaluate(()=>{window.__p02aRecalc=[];document.addEventListener('store-runner:planning-updated',e=>window.__p02aRecalc.push(String(e.detail&&e.detail.source||'')))});
  await page.locator('#planningSettingsShortcut').click();
  await expect(page.locator('#planningSettings')).toHaveJSProperty('open',true);
  const button=page.locator('#recalculateRemainingWeekBtn');
  await expect(button).toBeVisible();
  await expect(button).toContainText('Recalculer le reste');
  await button.click();
  await page.waitForFunction(()=>(window.__p02aRecalc||[]).includes('recalculatePlanningCascade'),null,{timeout:30000});
  await page.waitForTimeout(500);
  const after=await snapshot(page);
  expect(after.status).toContain('Planning recalculé');
  expect(after.plan.Mercredi,'le recalcul ne doit pas reposer '+missed+' sur le férié du 11/11').toEqual([]);
  expect(after.weeks[WEEK].plan.Mercredi,'le férié reste vide dans l’archive recalculée').toEqual([]);
  expect(after.plan.Lundi).toEqual([done]);
  const placements=Object.entries(after.weeks).flatMap(([week,s])=>Object.entries(s.plan).filter(([,ids])=>ids.includes(missed)).map(([day])=>week+' '+day));
  expect(placements,'la visite ratée est replacée exactement une fois').toHaveLength(1);
  expect(placements[0]).not.toBe(WEEK+' Mercredi');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
