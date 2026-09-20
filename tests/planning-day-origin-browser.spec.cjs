const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

// Francheville -> Annemasse est long ; Chambéry -> Annemasse est court. C'est cet écart
// qui prouve depuis où la journée est calculée, sans jamais géocoder en test.
const LUNDI='2026-09-14',MARDI='2026-09-15';
const SEED=nuit=>{
  const st=window.state;
  st.profile=Object.assign({},st.profile||{},{baseName:'Francheville',baseAddress:'Base',baseLat:45.75,baseLon:4.75});
  st.settings=Object.assign({},st.settings||{},{days:['Lundi','Mardi'],startTime:'08:30',endTime:'20:00',visitMinutes:90,weekDate:'2026-09-14'});
  const large={Lundi:[{open:'06:00',close:'21:00'}],Mardi:[{open:'06:00',close:'21:00'}]};
  const a={id:'do-annemasse',enseigne:'Boulanger',ville:'Annemasse',adresse:'1 rue A',lat:46.19,lon:6.23,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:large};
  const b={id:'do-thonon',enseigne:'Carrefour',ville:'Thonon',adresse:'2 rue B',lat:46.37,lon:6.47,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:JSON.parse(JSON.stringify(large))};
  st.stores=[a,b];
  st.plan={Lundi:[],Mardi:[a,b]};
  st.visits={};st.notes={};st.included={};st.excluded={};st.locks={};st.appointments=[];st.calendarEvents=[];
  st.hotelReservations=nuit?{'2026-09-14':nuit}:{};
  delete st.dayOrigins;
  try{save()}catch(e){}
};
const ready=page=>page.waitForFunction(()=>window.state&&window.StoreOpeningHoursV1&&window.StoreRunnerDayOrigin&&window.StoreRunnerTimelineHours);
const board=page=>page.evaluate(d=>{
  const api=window.StoreOpeningHoursV1,s=window.state;
  const r=api.scheduleRoute(s.plan.Mardi,'Mardi',s,{date:d});
  const c=m=>m==null?null:String(Math.floor(Math.round(m)/60)).padStart(2,'0')+':'+String(Math.round(m)%60).padStart(2,'0');
  return {origin:{type:r.origin&&r.origin.type,pending:!!(r.origin&&r.origin.pending),label:r.origin&&r.origin.label,suggestion:r.origin&&r.origin.suggestion},
    premierTrajet:Math.round(r.rows[0].travel),arrivee:c(r.rows[0].arrival),depart:c(r.recommendedDeparture)};
},MARDI);

async function prepare(page,nuit){
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  // Le géocodeur du profil est doublé : ce test porte sur l'origine, pas sur le réseau.
  await page.evaluate(()=>{window.StoreRunnerGeocode=Object.assign({},window.StoreRunnerGeocode,{
    forward:async q=>({lat:45.56,lon:5.92,address:String(q)+', France',city:String(q).split(',')[0].trim(),postcode:'73000'})});});
  await page.evaluate(SEED,nuit);
  await page.evaluate(()=>renderAll());
  const nav=page.locator('.bottomNavBtn[data-panel="planPanel"]');
  if(await nav.count())await nav.tap(); else await page.evaluate(()=>window.goTab('planPanel'));
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  await page.evaluate(()=>window.selectPlanningDay&&window.selectPlanningDay('Mardi'));
  await page.waitForFunction(()=>{
    const m=document.querySelector('#week .timelineRow:not(.calendarEvent) .tlMain[onclick]');
    return !!m&&/','Mardi','/.test(m.getAttribute('onclick')||'');
  });
  await page.waitForTimeout(500);
}

test('Sans découché, la journée part de la base et rien ne s’affiche',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page,null);
  const vue=await board(page);
  expect(vue.origin.type).toBe('base');
  expect(vue.origin.pending).toBe(false);
  await expect(page.locator('#planningDayOrigin')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Après une nuit sur place sans adresse, Store Runner demande le point de départ',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page,{fromDate:LUNDI,toDate:MARDI,hotelName:'Hôtel de Chambéry',reference:'ABC',zone:'Chambéry'});

  const avant=await board(page);
  expect(avant.origin.pending).toBe(true);           // aucune reprise silencieuse de la base
  expect(avant.origin.suggestion).toBe('Chambéry');

  const ask=page.locator('#planningDayOrigin');
  await expect(ask).toBeVisible();
  await expect(ask).toHaveClass(/srOriginAsk/);
  await expect(ask).toContainText('Nuit sur place');
  await expect(ask).toContainText('démarre depuis quel endroit');
  const use=ask.locator('button', {hasText:'Utiliser Chambéry'});
  await expect(use).toBeVisible();
  expect((await use.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(ask.locator('button', {hasText:'Autre point de départ'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // --- Confirmation de la zone : la journée repart de Chambéry -------------------------
  await use.tap();
  await page.waitForFunction(()=>!window.StoreRunnerDayOrigin.originFor('2026-09-15',window.state).pending);
  await page.waitForTimeout(400);
  const apres=await board(page);
  expect(apres.origin.pending).toBe(false);
  expect(apres.origin.type).toBe('zone');
  expect(apres.origin.label).toBe('Chambéry');
  expect(apres.premierTrajet).toBeLessThan(avant.premierTrajet);   // plus Francheville
  await expect(page.locator('#planningDayOrigin')).toHaveClass(/srOriginSet/);
  await expect(page.locator('#planningDayOrigin')).toContainText('Départ : Chambéry');
  await expect(page.locator('#planningDayOrigin .srOriginChange')).toBeVisible();

  // --- Persistance après rechargement --------------------------------------------------
  await page.reload({waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(()=>window.goTab('planPanel'));
  await page.evaluate(()=>window.selectPlanningDay&&window.selectPlanningDay('Mardi'));
  await page.waitForTimeout(600);
  const rechargee=await board(page);
  expect(rechargee.origin.type).toBe('zone');
  expect(rechargee.premierTrajet).toBe(apres.premierTrajet);
  expect(errors).toEqual([]);
});

test('Avec un hôtel localisé, le départ conseillé part de l’hôtel',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page,{fromDate:LUNDI,toDate:MARDI,hotelName:'Hôtel Mercure Chambéry',reference:'ABC',zone:'Chambéry',
    address:'12 rue de la Gare, Chambéry',lat:45.56,lon:5.92});

  const vue=await board(page);
  expect(vue.origin.type).toBe('hotel');
  expect(vue.origin.pending).toBe(false);
  await expect(page.locator('#planningDayOrigin')).toContainText('Départ : Hôtel Mercure Chambéry');

  // Arrivée manuelle 09:30 : le départ conseillé se compte depuis l'hôtel, et le libellé
  // nomme l'hôtel, pas « la base ».
  await page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').first().tap();
  const dialog=page.locator('#manualHoursDialog');
  await expect(dialog).toHaveClass(/open/);
  await dialog.locator('[data-mh-mode="manual"]').tap();
  await dialog.locator('[data-mh-arrival]').fill('09:30');
  const note=dialog.locator('[data-mh-warn]');
  await expect(note).toHaveClass(/mhNote/);
  await expect(note).toContainText('Départ conseillé depuis Hôtel Mercure Chambéry');
  await expect(note).not.toContainText('depuis la base');
  await dialog.locator('[data-mh-save]').tap();
  await expect(dialog).not.toHaveClass(/open/);
  await page.waitForTimeout(500);

  const apres=await board(page);
  expect(apres.arrivee).toBe('09:30');
  const attendu=9*60+30-apres.premierTrajet;
  expect(apres.depart).toBe(String(Math.floor(attendu/60)).padStart(2,'0')+':'+String(attendu%60).padStart(2,'0'));
  expect(errors).toEqual([]);
});
