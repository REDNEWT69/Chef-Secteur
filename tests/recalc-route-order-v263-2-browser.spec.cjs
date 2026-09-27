const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* V263.2 — cas terrain Saint-Étienne, dans la vraie application, à 390 px.
   Mardi 29/09/2026 07:30. Jeudi 01/10 perd Fnac Écully et BUT Tassin (visités jeudi
   dernier) et reçoit Boulanger Saint-Étienne (jamais visité). Avant V263.2, le recalcul
   l'ajoutait en dernier et gelait la semaine : Limonest › Écully › Saint-Étienne, départ
   09:20 pour attendre l'ouverture de Limonest, retour 14:31. Avec V251 sur la journée
   modifiée : Saint-Étienne d'abord, mêmes kilomètres, retour 13:45. */
const NOW='2026-09-29T07:30:00',WEEK='2026-09-28';
async function boot(page,errors,messages){
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  page.on('dialog',d=>{messages.push(d.message());d.accept()});
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerRouteOptimizerV251&&window.StoreRunnerVisitCoverage&&window.StoreRunnerManualPlanning&&typeof window.storeRunnerRecalculateRemainingWeek==='function'&&document.readyState!=='loading'&&document.querySelector('input[data-day]')&&document.getElementById('recalculateRemainingWeekBtn')&&document.getElementById('planningSettingsShortcut'));
}
async function seed(page){
  await page.evaluate(async week=>{
    const mk=(id,enseigne,ville,lat,lon,intervalDays)=>({id,enseigne,ville,adresse:'1 rue '+ville,dept:'69',lat,lon,active:true,priority:3,intervalDays:intervalDays||30});
    const stores=[
      mk('lim','Darty','Limonest',45.806155,4.776187,15),mk('ecu','Carrefour','Écully',45.787,4.763,15),mk('bse','Boulanger','Saint-Étienne',45.441,4.426),
      mk('fnm','Fnac','Écully',45.788,4.769),mk('but','BUT','Tassin-la-Demi-Lune',45.763,4.756),
      mk('pdi','Darty','Lyon Part-Dieu',45.7621058,4.8557052,7),mk('fpd','Fnac','Lyon Part-Dieu',45.7609,4.8566,15),mk('rep','Darty','Lyon République',45.761279,4.836196,15),
      mk('ven','Darty','Vénissieux',45.7168865,4.8562065,15),mk('cve','Carrefour','Vénissieux',45.704,4.882),mk('cfv','Conforama','Vénissieux',45.702,4.876),
      mk('bro','Darty','Bron',45.7213405,4.9198091,15),mk('bbr','Boulanger','Bron',45.7216246,4.9215729,15),mk('spr','Darty','Saint-Priest',45.7135604,4.9634737),
      mk('cal','Darty','Caluire-et-Cuire',45.8043008,4.8572363,15),mk('cvi','Carrefour','Villeurbanne',45.767,4.899),mk('cri','Carrefour','Rillieux',45.82,4.897)];
    const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const before=n=>{const d=new Date('2026-09-29T12:00:00');d.setDate(d.getDate()-n);return iso(d)};
    const visits={};
    for(const s of stores){if(s.id==='bse')continue;const d=before(Math.round(0.6*s.intervalDays));visits[s.id]={lastVisit:d,history:[d]}}
    for(const id of ['fnm','but'])visits[id]={lastVisit:'2026-09-24',history:['2026-09-24']};
    for(const id of ['pdi','fpd','rep'])visits[id]={lastVisit:week,history:[before(20),week]};
    const byId=id=>stores.find(s=>s.id===id);
    state.stores=stores;state.visits=visits;state.businessV2=StoreRunnerVisitModel.empty();
    state.profile=Object.assign({},state.profile,{baseName:'Francheville',baseAddress:'Francheville',baseLat:45.7366,baseLon:4.7636,overnightMode:'never'});
    state.locks={};state.included={};state.excluded={};state.appointments=[];state.manualWeekEdits={};state.calendarEvents=[];state.hotelReservations={};
    state.settings=Object.assign({},state.settings,{weekDate:week,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:6,target:15,startTime:'08:30',endTime:'18:00',visitMinutes:60,brands:[],products:[]});
    state.plan={Lundi:['pdi','fpd','rep'].map(byId),Mardi:['ven','cve','cfv'].map(byId),Mercredi:['bro','bbr','spr'].map(byId),Jeudi:['fnm','lim','ecu','but'].map(byId),Vendredi:['cal','cvi','cri'].map(byId),Samedi:[]};
    const db=window.__chefStorage||localStorage;
    db.setItem('chef_sector_plan_archive_v1',JSON.stringify({[week]:{weekMonday:week,plan:JSON.parse(JSON.stringify(state.plan))}}));
    db.removeItem('chef_sector_range_v1');db.removeItem('store_runner_road_matrix_v248');
    document.getElementById('weekDate').value=week;
    /* Comme au démarrage : Darty et Boulanger reçoivent la règle terrain 09:30–19:30. */
    BoulangerDefaultHoursV1.apply(state);
    save();if(db.flush)await db.flush();
    initControls();renderAll();
    const max=document.getElementById('maxVisitsPerDay');if(max)max.value='6';
    goTab('planPanel');
  },WEEK);
}
async function recalcFromSettings(page){
  await page.locator('#planningSettingsShortcut').click();
  await expect(page.locator('#planningSettings')).toHaveJSProperty('open',true);
  const button=page.locator('#recalculateRemainingWeekBtn');
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForFunction(()=>{const b=document.getElementById('planningGenerateStatus');return !!(b&&/recalculé|stable|impossible|conservé/i.test(b.textContent||''))||!!(state.manualWeekEdits&&Object.keys(state.manualWeekEdits).length)});
}
const jeudi=page=>page.evaluate(()=>(state.plan.Jeudi||[]).map(s=>s.id));

test('V263.2 : après recalcul, Saint-Étienne passe en premier le jeudi (même trajet, retour 13:45 au lieu de 14:31)',async({page})=>{
  const errors=[],messages=[];await boot(page,errors,messages);await seed(page);
  await recalcFromSettings(page);
  expect(messages.length).toBe(1);
  expect(messages[0]).toContain('1 ajouté car en retard ou jamais visité : Boulanger Saint-Étienne');
  expect(messages[0]).toContain('↕ Ordre de passage optimisé : Jeudi 01/10 (retour ~13:45 au lieu de ~14:31)');
  const order=await jeudi(page);
  expect(order[0]).toBe('bse');
  expect(order.slice().sort()).toEqual(['bse','ecu','lim']);
  const checked=await page.evaluate(week=>{
    const route=state.plan.Jeudi,api=StoreRunnerRouteOptimizerV251,e=api.evaluate(route,'Jeudi',state,{weekMonday:week});
    const appended=api.evaluate(['lim','ecu','bse'].map(id=>state.stores.find(s=>s.id===id)),'Jeudi',state,{weekMonday:week});
    const snap=JSON.parse((window.__chefStorage||localStorage).getItem('chef_sector_plan_archive_v1'))[week];
    return{feasible:e.feasible,drive:e.driveMinutes,appendedDrive:appended.driveMinutes,end:e.estimatedEnd,appendedEnd:appended.estimatedEnd,
      archived:snap.plan.Jeudi.map(s=>s.id),marked:!!(snap.recalculated&&snap.recalculated.at===snap.manualEditedAt),
      untouched:{Lundi:state.plan.Lundi.map(s=>s.id),Mardi:state.plan.Mardi.map(s=>s.id),Vendredi:state.plan.Vendredi.map(s=>s.id)},
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  },WEEK);
  expect(checked.feasible).toBeTruthy();
  expect(checked.drive).toBeLessThanOrEqual(checked.appendedDrive+0.1);
  expect(checked.end).toBeLessThan(checked.appendedEnd-30);
  expect(checked.archived).toEqual(order);
  expect(checked.marked).toBeTruthy();
  expect(checked.untouched).toEqual({Lundi:['pdi','fpd','rep'],Mardi:['ven','cve','cfv'],Vendredi:['cal','cvi','cri']});
  expect(checked.overflow).toBeLessThanOrEqual(1);
  // L'ordre survit à la réouverture de l'application.
  await page.evaluate(async()=>{const db=window.__chefStorage||localStorage;if(db.flush)await db.flush()});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&state.plan&&state.plan.Jeudi&&state.plan.Jeudi.length===3);
  expect(await jeudi(page)).toEqual(order);
  expect(errors).toEqual([]);
});

test('V263.2 : une semaine réordonnée au doigt garde son ordre au recalcul',async({page})=>{
  const errors=[],messages=[];await boot(page,errors,messages);await seed(page);
  const moved=await page.evaluate(()=>StoreRunnerManualPlanning.reorderStore(window,'lim','Jeudi',0));
  expect(moved.ok,JSON.stringify(moved)).toBeTruthy();
  await recalcFromSettings(page);
  expect(messages.length).toBe(1);
  expect(messages[0]).not.toContain('Ordre de passage optimisé');
  expect(await jeudi(page)).toEqual(['lim','ecu','bse']);
  const snap=await page.evaluate(week=>JSON.parse((window.__chefStorage||localStorage).getItem('chef_sector_plan_archive_v1'))[week],WEEK);
  expect(snap.manualEdited).toBeTruthy();
  expect(snap.recalculated).toBeUndefined();
  expect(errors).toEqual([]);
});
