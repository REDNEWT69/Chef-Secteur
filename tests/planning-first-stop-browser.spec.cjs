const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

// Francheville -> Chambéry : ~119 min depuis la base, puis ~30 min vers le magasin suivant.
const SEED=()=>{
  const st=window.state;
  st.profile=Object.assign({},st.profile||{},{baseName:'Francheville',baseAddress:'Base',baseLat:45.00,baseLon:4.00});
  st.settings=Object.assign({},st.settings||{},{days:['Lundi','Mardi'],startTime:'08:30',endTime:'20:00',visitMinutes:90,weekDate:'2026-09-14'});
  const large={Lundi:[{open:'06:00',close:'21:00'}],Mardi:[{open:'06:00',close:'21:00'}]};
  const a={id:'fs-chambery',enseigne:'Boulanger',ville:'Chambéry',adresse:'1 rue A',lat:45.78486,lon:4.00,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:large};
  const b={id:'fs-annecy',enseigne:'Carrefour',ville:'Annecy',adresse:'2 rue B',lat:45.98272,lon:4.00,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:JSON.parse(JSON.stringify(large))};
  st.stores=[a,b];
  st.plan={Lundi:[a,b],Mardi:[]};
  st.visits={};st.notes={};st.included={};st.excluded={};st.locks={};st.appointments=[];st.calendarEvents=[];
  try{save()}catch(e){}
};
const ready=page=>page.waitForFunction(()=>window.state&&window.StoreOpeningHoursV1&&window.StoreRunnerManualHours&&window.StoreRunnerTimelineHours);
const board=page=>page.evaluate(()=>{
  const api=window.StoreOpeningHoursV1,s=window.state;
  const r=api.scheduleRoute(s.plan.Lundi,'Lundi',s);
  const c=m=>m==null?null:String(Math.floor(Math.round(m)/60)).padStart(2,'0')+':'+String(Math.round(m)%60).padStart(2,'0');
  return {rows:r.rows.map(x=>({arrival:c(x.arrival),nominal:c(x.nominalArrival),travel:Math.round(x.travel),status:x.status})),
    depart:c(r.recommendedDeparture),start:c(r.start)};
});
async function prepare(page){
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await page.evaluate(()=>renderAll());
  const nav=page.locator('.bottomNavBtn[data-panel="planPanel"]');
  if(await nav.count())await nav.tap(); else await page.evaluate(()=>window.goTab('planPanel'));
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  await page.waitForFunction(()=>{
    const m=document.querySelector('#week .timelineRow:not(.calendarEvent) .tlMain[onclick]');
    return !!m&&/','Lundi','/.test(m.getAttribute('onclick')||'');
  });
  await page.waitForTimeout(500);
}

test('Premier magasin : un horaire plus tôt annonce un départ anticipé, pas une impossibilité',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page);
  const avant=await board(page);
  expect(avant.rows[0].travel).toBeGreaterThan(100);       // vrai long trajet depuis la base
  expect(avant.rows[0].arrival).toBe(avant.rows[0].nominal);
  expect(avant.start).toBe('08:30');

  // Le bloc ARRIVÉE reste le point d'entrée de l'éditeur.
  await page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').first().tap();
  const dialog=page.locator('#manualHoursDialog');
  await expect(dialog).toHaveClass(/open/);
  await dialog.locator('[data-mh-mode="manual"]').tap();
  await dialog.locator('[data-mh-arrival]').fill('09:30');

  // Information, pas alerte : départ conseillé depuis la base, et rappel du début de journée.
  const note=dialog.locator('[data-mh-warn]');
  await expect(note).toBeVisible();
  await expect(note).toHaveClass(/mhNote/);
  const attendu=await page.evaluate(t=>{
    const m=9*60+30-t;
    return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  },avant.rows[0].travel);
  await expect(note).toContainText(`Départ conseillé depuis la base : ${attendu} pour arriver à 09:30`);
  await expect(note).toContainText('habituellement réglée à partir de 08:30');
  await expect(note).not.toContainText('visites et trajets précédents');
  await expect(note).not.toContainText('Impossible');

  await dialog.locator('[data-mh-save]').tap();
  await expect(dialog).not.toHaveClass(/open/);
  await page.waitForTimeout(500);

  // --- Le moteur tient l'heure imposée et propage la suite depuis elle ------------------
  const apres=await board(page);
  expect(apres.rows[0].arrival).toBe('09:30');
  expect(apres.rows[0].status).not.toBe('appointment-conflict');
  expect(apres.depart).toBe(attendu);                      // 07:31 dans l'exemple
  expect(apres.depart < apres.start).toBe(true);           // antérieur au début de journée
  const fin=9*60+30+90, suivant=fin+apres.rows[1].travel;
  expect(apres.rows[1].arrival).toBe(String(Math.floor(suivant/60)).padStart(2,'0')+':'+String(suivant%60).padStart(2,'0'));
  expect(apres.rows[1].arrival).not.toBe(avant.rows[1].arrival);

  // La timeline n'annonce plus aucune impossibilité pour ce premier arrêt.
  const line=page.locator('#week .timelineRow:not(.calendarEvent) .tlManualHint').first();
  await expect(line).toContainText('Arrivée imposée 09:30');
  await expect(line).not.toContainText('impossible');
  await expect(line).not.toHaveClass(/tlManualImpossible/);
  expect(await page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').allTextContents())
    .toEqual([apres.rows[0].arrival,apres.rows[1].arrival]);
  expect(errors).toEqual([]);
});

test('Le second magasin reste protégé, et la fiche magasin n’a plus de bouton horaires',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page);
  const avant=await board(page);

  // --- Magasin suivant : l'impossibilité reste annoncée ---------------------------------
  await page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').nth(1).tap();
  const dialog=page.locator('#manualHoursDialog');
  await expect(dialog).toHaveClass(/open/);
  await dialog.locator('[data-mh-mode="manual"]').tap();
  const tropTot=await page.evaluate(a=>{
    const m=(+a.slice(0,2))*60+(+a.slice(3))-20;
    return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  },avant.rows[1].nominal);
  await dialog.locator('[data-mh-arrival]').fill(tropTot);
  const note=dialog.locator('[data-mh-warn]');
  await expect(note).toBeVisible();
  await expect(note).not.toHaveClass(/mhNote/);
  await expect(note).toContainText('Impossible à tenir');
  await expect(note).toContainText('visites et trajets précédents');
  await expect(note).toContainText('au plus tôt '+avant.rows[1].nominal);
  await dialog.locator('[data-mh-close]').tap();

  // --- Le bouton redondant a disparu de la fiche magasin --------------------------------
  await page.locator('#week .timelineRow:not(.calendarEvent) .tlChevron').first().tap();
  await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
  await expect(page.locator('#srQuickStart')).toHaveAttribute('data-sr-start','fs-chambery');
  await expect(page.locator('#manualHoursQuickBtn')).toHaveCount(0);
  await expect(page.locator('#storeQuickSheet .sheetActions')).not.toContainText('Horaires de la visite');
  // L'éditeur reste disponible par son API publique.
  expect(await page.evaluate(()=>typeof window.StoreRunnerManualHours.open)).toBe('function');
  expect(errors).toEqual([]);
});
