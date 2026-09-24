// V254.3 — réordonner une journée au doigt (issue #426), dans un vrai Chromium mobile
// à 390 px.
//
// Les gestes passent par Input.dispatchTouchEvent (CDP) : c'est le vrai pipeline tactile
// du navigateur, défilement natif compris. Un balayage doit donc réellement faire défiler
// la page, et un appui long doit réellement l'empêcher.
//
// Le planning utilisé est celui de la semaine prochaine : toutes ses journées sont à
// venir quel que soit le jour où la suite tourne (une journée passée ne se réorganise pas).
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});

const ROWS='#week .timelineRow:not(.calendarEvent)';
async function boot(page){
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPlanningReorder&&window.StoreRunnerManualPlanning&&window.state&&window.StoreRunnerBoot&&StoreRunnerBoot.settled());
}
/* Semaine prochaine par défaut (weekOffset:-1 pour la semaine dernière), jeudi affiché. */
async function seed(page,options={}){
  return page.evaluate(options=>{
    const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const now=new Date();now.setHours(12,0,0,0);const mon=new Date(now);mon.setDate(now.getDate()-((now.getDay()||7)-1)+7*(options.weekOffset===undefined?1:options.weekOffset));
    const day=i=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return iso(d)};
    const mk=(id,enseigne,ville,lat,lon)=>({id,enseigne,ville,adresse:'1 rue test',dept:'69',active:true,lat,lon,priority:3});
    const b=mk('b1','Boulanger','Villeurbanne',45.77,4.88),d=mk('d1','Darty','Bron',45.73,4.91),c=mk('c1','Carrefour','Vénissieux',45.70,4.88),f=mk('f1','Fnac','Lyon',45.76,4.83);
    state.stores=[b,d,c,f];state.excluded={};state.locks={};state.manualWeekEdits={};
    for(const [id,hours] of Object.entries(options.hours||{}))state.stores.find(s=>s.id===id).openingHours=hours;
    state.appointments=(options.appointments||[]).map(a=>Object.assign({duration:60,type:'Rendez-vous',note:''},a,{date:day(a.dayIndex)}));
    state.profile=Object.assign({},state.profile,{baseName:'Lyon',baseLat:45.75,baseLon:4.85});
    state.settings=Object.assign({},state.settings,{weekDate:day(0),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:6,startTime:'08:30',endTime:'18:00',visitMinutes:60});
    state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:(options.thursday||['b1','d1','c1','f1']).map(id=>state.stores.find(s=>s.id===id)),Vendredi:[],Samedi:[]};
    const db=window.__chefStorage;
    db.setItem('chef_sector_plan_archive_v1',JSON.stringify({[day(0)]:{weekMonday:day(0),plan:JSON.parse(JSON.stringify(state.plan))}}));
    db.setItem('chef_sector_range_v1',JSON.stringify({start:day(0),end:day(4),weeks:1,workDays:state.settings.days.slice()}));
    save();renderAll();goTab('planPanel');window.dispatchEvent(new Event('chef-range-generated'));
    return{monday:day(0),thursday:day(3)};
  },options);
}
async function openDay(page,date){
  const tab=page.locator('#dayTabs .periodDayTab[data-date="'+date+'"]');
  await expect(tab).toBeVisible();await tab.click();
  await expect(page.locator(ROWS).first()).toBeVisible();
  await page.waitForTimeout(250);
}
async function touch(page){
  const client=await page.context().newCDPSession(page);
  const send=(type,x,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  return{start:(x,y)=>send('touchStart',x,y),move:(x,y)=>send('touchMove',x,y),end:()=>send('touchEnd')};
}
async function glide(page,finger,from,to,steps=12){
  for(let i=1;i<=steps;i++){await finger.move(from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps);await page.waitForTimeout(24)}
}
async function lift(page,finger,point){
  await finger.start(point.x,point.y);
  await page.waitForTimeout(420);
  await page.waitForFunction(()=>StoreRunnerPlanningReorder.isDragging());
}
const order=(page,day)=>page.evaluate(day=>state.plan[day].map(s=>s.id).join(','),day);
/* Le noyau déclare html{scroll-behavior:smooth} : on aligne donc sans animation, pour que
   les positions mesurées soient celles que le doigt touchera. */
async function align(page,index,top){
  await page.evaluate(({index,top})=>{const row=document.querySelectorAll('#week .timelineRow:not(.calendarEvent)')[index],r=row.getBoundingClientRect();window.scrollTo({top:window.scrollY+r.top-top,behavior:'instant'})},{index,top});
  await page.waitForTimeout(150);
}
/* Un point sur le texte de la carte (nom du magasin), jamais sur le bloc « Arrivée » ni la flèche. */
async function point(page,index){
  const box=await page.locator(ROWS).nth(index).locator('.tlName').boundingBox();
  return{x:box.x+Math.min(60,box.width/2),y:box.y+box.height/2};
}
async function center(page,index){const b=await page.locator(ROWS).nth(index).boundingBox();return b.y+b.height/2}

test('V254.3 : un balayage défile, un appui long soulève la carte, les autres se décalent et l’ordre survit au rechargement',async({page})=>{
  page.on('dialog',d=>d.dismiss());
  await boot(page);const dates=await seed(page);await openDay(page,dates.thursday);
  const finger=await touch(page);
  await expect(page.locator('#week')).not.toContainText('⠿');

  // 1. Un balayage vertical rapide reste un défilement natif : aucune carte ne se soulève.
  await align(page,0,160);
  let p=await point(page,1);const scrollBefore=await page.evaluate(()=>scrollY);
  await finger.start(p.x,p.y);await glide(page,finger,p,{x:p.x,y:p.y-240},8);await finger.end();await page.waitForTimeout(700);
  expect(await page.evaluate(()=>scrollY)).not.toBe(scrollBefore);
  expect(await order(page,'Jeudi')).toBe('b1,d1,c1,f1');
  await expect(page.locator('#week .srReorderLifted')).toHaveCount(0);

  // 2. Appui long sur Carrefour (3e visite) : seule cette carte se soulève.
  await align(page,0,160);
  const start=await point(page,2),target=start.y+(await center(page,0))-(await center(page,2))-30;
  await lift(page,finger,start);
  await expect(page.locator(ROWS).nth(2)).toHaveClass(/srReorderLifted/);
  expect(await page.locator(ROWS).nth(2).evaluate(el=>getComputedStyle(el).transform)).toMatch(/^matrix\(1\.02/);
  await expect(page.locator('.srReorderTray')).toHaveCount(0);
  // Pendant le glissement, la page ne défile pas sous le doigt (hors bords).
  const scrollLifted=await page.evaluate(()=>scrollY);
  await glide(page,finger,start,{x:start.x,y:start.y-100},5);
  expect(await page.evaluate(()=>scrollY)).toBe(scrollLifted);
  await glide(page,finger,{x:start.x,y:start.y-100},{x:start.x,y:target},8);await page.waitForTimeout(260);
  // Les autres cartes se sont décalées d'une place vers le bas pour montrer l'insertion.
  const shifted=await page.evaluate(()=>[...document.querySelectorAll('#week .timelineRow:not(.calendarEvent)')].map(r=>new DOMMatrixReadOnly(getComputedStyle(r).transform).m42));
  expect(shifted[0]).toBeGreaterThan(100);expect(shifted[1]).toBeGreaterThan(100);expect(shifted[3]).toBe(0);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await finger.end();

  // 3. Nouvel ordre enregistré, heures recalculées, aucune fiche ouverte par erreur.
  await page.waitForFunction(()=>state.plan.Jeudi.map(s=>s.id).join(',')==='c1,b1,d1,f1');
  await expect(page.locator(ROWS+' .tlName').first()).toContainText('Carrefour');
  await expect(page.locator('.srReorderSnack')).toContainText('Carrefour Vénissieux passe en 1re visite');
  const arrival=(await page.locator('.srReorderSnack').textContent()).match(/arrivée (\d{2}:\d{2})/);
  expect(arrival).toBeTruthy();
  await expect(page.locator(ROWS+' .tlTime').first()).toHaveText(arrival[1]);
  await expect(page.locator(ROWS).nth(1).locator('.tlTravelHint')).toContainText('magasin précédent');
  await expect(page.locator('#week .srReorderLifted')).toHaveCount(0);
  expect(await page.evaluate(()=>document.getElementById('storeQuickSheet').classList.contains('open'))).toBe(false);
  const saved=await page.evaluate(week=>{const a=JSON.parse(__chefStorage.getItem('chef_sector_plan_archive_v1'))[week];return{archive:a.plan.Jeudi.map(s=>s.id).join(','),manual:a.manualEdited===true,edits:!!state.manualWeekEdits[week]}},dates.monday);
  expect(saved).toEqual({archive:'c1,b1,d1,f1',manual:true,edits:true});

  // 4. Le nouvel ordre survit au rechargement de l'application.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerBoot&&StoreRunnerBoot.settled());
  await page.evaluate(()=>{goTab('planPanel');window.dispatchEvent(new Event('chef-range-generated'))});
  await openDay(page,dates.thursday);
  expect(await order(page,'Jeudi')).toBe('c1,b1,d1,f1');
  await expect(page.locator(ROWS+' .tlName').first()).toContainText('Carrefour');
});

test('V254.3 : un tap ouvre la fiche, un appui relâché ou posé sur « Arrivée » ne change rien',async({page})=>{
  page.on('dialog',d=>d.dismiss());
  await boot(page);const dates=await seed(page);await openDay(page,dates.thursday);
  const finger=await touch(page);
  const unchanged=async()=>{
    expect(await order(page,'Jeudi')).toBe('b1,d1,c1,f1');
    await expect(page.locator('.srReorderSnack')).toHaveCount(0);
    await expect(page.locator('#week .srReorderLifted')).toHaveCount(0);
    expect(await page.evaluate(week=>!!state.manualWeekEdits[week],dates.monday)).toBe(false);
  };
  await align(page,0,160);
  let p=await point(page,1);
  await page.touchscreen.tap(p.x,p.y);
  await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
  await page.evaluate(()=>closeStoreQuick());await page.waitForTimeout(250);

  // Appui long relâché sur place : la carte se repose, rien n'est enregistré, aucune fiche.
  await align(page,0,160);p=await point(page,1);
  await lift(page,finger,p);
  await finger.end();await page.waitForTimeout(500);
  await unchanged();
  expect(await page.evaluate(()=>document.getElementById('storeQuickSheet').classList.contains('open'))).toBe(false);

  // Le bloc « Arrivée » reste un bouton : un appui long n'y soulève rien.
  const time=await page.locator(ROWS).nth(1).locator('.tlTime').boundingBox();
  await finger.start(time.x+time.width/2,time.y+time.height/2);await page.waitForTimeout(600);
  expect(await page.evaluate(()=>StoreRunnerPlanningReorder.isDragging())).toBe(false);
  await finger.end();await page.waitForTimeout(300);
  await unchanged();
});

test('V254.3 : un ordre infaisable est enregistré tel quel avec un avertissement clair, s’annule d’un geste et survit au rechargement',async({page})=>{
  page.on('dialog',d=>d.dismiss());
  await boot(page);
  const dates=await seed(page,{thursday:['f1','b1','c1'],hours:{f1:{Jeudi:[{open:'08:00',close:'10:00'}]}}});
  await openDay(page,dates.thursday);
  const finger=await touch(page);
  // Fnac ferme à 10:00 : la poser en dernière visite rend son passage impossible.
  const fnacLast=async()=>{
    await align(page,0,100);
    const start=await point(page,0),target=start.y+(await center(page,2))-(await center(page,0))+30;
    await lift(page,finger,start);
    await glide(page,finger,start,{x:start.x,y:target},12);await page.waitForTimeout(200);
    await finger.end();
    await page.waitForFunction(()=>state.plan.Jeudi.map(s=>s.id).join(',')==='b1,c1,f1');
  };
  await fnacLast();
  await expect(page.locator('.srReorderSnack')).toContainText('Fnac Lyon passe en dernière visite');
  await expect(page.locator('.srReorderSnack .srReorderWarning')).toHaveText('⚠ Fnac Lyon serait fermé à ton arrivée avec cet ordre.');
  await expect(page.locator(ROWS).last()).toContainText('Aucun créneau disponible');
  expect(await page.evaluate(week=>JSON.parse(__chefStorage.getItem('chef_sector_plan_archive_v1'))[week].plan.Jeudi.map(s=>s.id).join(','),dates.monday)).toBe('b1,c1,f1');
  await page.locator('.srReorderUndo').click();
  await page.waitForFunction(()=>state.plan.Jeudi.map(s=>s.id).join(',')==='f1,b1,c1');
  await expect(page.locator('.srReorderSnack')).toContainText('Ordre précédent rétabli');

  // Reposé puis rechargé : l'ordre choisi n'est pas « réparé » en silence au démarrage.
  await fnacLast();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerBoot&&StoreRunnerBoot.settled());
  await page.evaluate(()=>{goTab('planPanel');window.dispatchEvent(new Event('chef-range-generated'))});
  await openDay(page,dates.thursday);
  expect(await order(page,'Jeudi')).toBe('b1,c1,f1');
  await expect(page.locator(ROWS).last()).toContainText('Aucun créneau disponible');
});

test('V254.3 : l’ordre posé au doigt résiste à l’optimisation automatique et au rendez-vous au rechargement',async({page})=>{
  page.on('dialog',d=>d.dismiss());
  await boot(page);
  const dates=await seed(page,{thursday:['b1','c1','d1'],appointments:[{id:'rdv-d1',storeId:'d1',dayIndex:3,time:'10:00'}]});
  await openDay(page,dates.thursday);
  const finger=await touch(page);
  await align(page,0,160);
  const start=await point(page,2),target=start.y+(await center(page,0))-(await center(page,2))-30;
  await lift(page,finger,start);
  await glide(page,finger,start,{x:start.x,y:target},12);await page.waitForTimeout(200);
  await finger.end();
  await page.waitForFunction(()=>state.plan.Jeudi.map(s=>s.id).join(',')==='d1,b1,c1');
  // Une finalisation de génération (V251) ne réordonne pas une journée posée à la main.
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{source:'generateWeek'}})));
  await page.waitForTimeout(600);
  expect(await order(page,'Jeudi')).toBe('d1,b1,c1');
  // Au rechargement, le magasin avec rendez-vous garde la place choisie.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerBoot&&StoreRunnerBoot.settled());
  await page.waitForTimeout(400);
  expect(await order(page,'Jeudi')).toBe('d1,b1,c1');
  const archived=await page.evaluate(week=>JSON.parse(__chefStorage.getItem('chef_sector_plan_archive_v1'))[week].plan.Jeudi.map(s=>s.id).join(','),dates.monday);
  expect(archived).toBe('d1,b1,c1');
});

test('V254.3 : une journée passée ne se soulève pas et le dit',async({page})=>{
  page.on('dialog',d=>d.dismiss());
  await boot(page);const dates=await seed(page,{weekOffset:-1});await openDay(page,dates.thursday);
  const finger=await touch(page);
  await align(page,0,160);const p=await point(page,1);
  await finger.start(p.x,p.y);await page.waitForTimeout(600);
  expect(await page.evaluate(()=>StoreRunnerPlanningReorder.isDragging())).toBe(false);
  await expect(page.locator('.srReorderSnack')).toHaveText('Une journée passée ne se réorganise plus.');
  await glide(page,finger,p,{x:p.x,y:p.y-200},8);await finger.end();await page.waitForTimeout(300);
  await expect(page.locator('#week .srReorderLifted')).toHaveCount(0);
  expect(await order(page,'Jeudi')).toBe('b1,d1,c1,f1');
});
