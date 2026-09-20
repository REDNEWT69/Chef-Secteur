const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

// Base et magasins synthétiques : Lundi part très loin, Mardi reste tout près, et les
// deux magasins du mardi sont quasiment au même endroit pour couvrir le trajet nul.
const SEED=()=>{
  const st=window.state;
  st.profile=Object.assign({},st.profile||{},{baseName:'Base test',baseAddress:'Villetest',baseLat:45.00,baseLon:4.00});
  st.settings=Object.assign({},st.settings||{},{days:['Lundi','Mardi'],startTime:'08:30',endTime:'19:00',visitMinutes:180,weekDate:'2026-09-14'});
  const loin={id:'hrs-loin',enseigne:'Boulanger',ville:'Loin',adresse:'1 rue Loin',lat:46.40,lon:4.00,active:true,products:['Brun']};
  const a={id:'hrs-a',enseigne:'Boulanger',ville:'Chalon',adresse:'2 rue Proche',lat:45.05,lon:4.00,active:true,products:['Brun']};
  const b={id:'hrs-b',enseigne:'Darty',ville:'Chalon',adresse:'3 rue Proche',lat:45.0501,lon:4.0001,active:true,products:['Brun']};
  st.stores=[loin,a,b];
  st.plan={Lundi:[loin],Mardi:[a,b]};
  st.visits={};st.notes={};st.included={};st.excluded={};st.locks={};st.appointments=[];st.calendarEvents=[];
  try{save()}catch(e){}
};
const ready=page=>page.waitForFunction(()=>window.state&&window.StoreOpeningHoursV1&&window.StoreRunnerTimelineHours&&typeof window.selectPlanningDay==='function');

async function ouvrirPlanning(page){
  const nav=page.locator('.bottomNavBtn[data-panel="planPanel"]');
  if(await nav.count())await nav.tap();
  else await page.evaluate(()=>window.goTab('planPanel'));
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
}

async function ouvrirMardi(page){
  // Chemin utilisateur réel : on appuie sur l'onglet du jour, pas sur une fonction interne.
  const onglet=page.locator('#dayTabs .dayTab, #dayTabs .periodDayTab').filter({hasText:'Mardi'}).first();
  if(await onglet.count()){await onglet.tap()}
  else{await page.evaluate(()=>window.selectPlanningDay('Mardi'))}
  await page.waitForFunction(()=>{
    const m=document.querySelector('#week .timelineRow:not(.calendarEvent) .tlMain[onclick]');
    return !!m&&/','Mardi','/.test(m.getAttribute('onclick')||'');
  });
  await page.waitForTimeout(500);
}

// Régression : la timeline affichait les heures du lundi en face des magasins du mardi,
// parce que le décorateur ne savait pas quel jour était à l'écran.
test('Le planning affiche l’heure du jour consulté, pas celle du premier jour travaillé',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await page.evaluate(()=>{if(typeof window.renderAll==='function')renderAll()});
  await ouvrirPlanning(page);
  await ouvrirMardi(page);

  const attendu=await page.evaluate(()=>{
    const api=window.StoreOpeningHoursV1,s=window.state;
    const clock=m=>String(Math.floor(Math.round(m)/60)).padStart(2,'0')+':'+String(Math.round(m)%60).padStart(2,'0');
    return{
      mardi:api.scheduleRoute(s.plan.Mardi,'Mardi',s).rows.map(r=>clock(r.arrival)),
      lundi:api.scheduleRoute(s.plan.Lundi,'Lundi',s).rows.map(r=>clock(r.arrival)),
      jourVu:api.dayNow()
    };
  });
  expect(attendu.jourVu).toBe('Mardi');

  const heures=await page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').allTextContents();
  expect(heures).toEqual(attendu.mardi);
  expect(heures[0]).not.toBe(attendu.lundi[0]);          // le défaut corrigé
  expect(await page.locator('#week .timelineRow:not(.calendarEvent) .tlName').allTextContents())
    .toEqual(['Boulanger Chalon','Darty Chalon']);
  expect(errors).toEqual([]);
});

test('La timeline dit que l’heure est une arrivée estimée et que le trajet est compté, à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await page.evaluate(()=>{if(typeof window.renderAll==='function')renderAll()});
  await ouvrirPlanning(page);
  await ouvrirMardi(page);

  // 1. La colonne horaire est étiquetée, et l'étiquette survit aux réécritures du texte.
  const label=await page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').first()
    .evaluate(el=>getComputedStyle(el,'::before').content);
  expect(label).toContain('Arriv');

  // 2. Une légende explique d'où vient l'heure.
  const legende=page.locator('#planningHoursLegend');
  await expect(legende).toBeVisible();
  await expect(legende).toContainText('arrivée estimée au magasin');
  await expect(legende).toContainText('trajet');

  // 3. La durée dit qu'il s'agit du temps sur place, et donne la fin.
  const duree=page.locator('#week .timelineRow:not(.calendarEvent) .tlDuration').first();
  await expect(duree).toContainText('180 min sur place');
  await expect(duree).toContainText('fin ');

  // 4. Le trajet est nommé ligne par ligne — y compris celui qui s'arrondit à zéro,
  //    qui est exactement ce qui faisait croire qu'il n'était pas compté.
  const trajets=page.locator('#week .timelineRow:not(.calendarEvent) .tlTravelHint');
  await expect(trajets).toHaveCount(2);
  await expect(trajets.nth(0)).toContainText('depuis le départ');
  await expect(trajets.nth(1)).toContainText('trajet de moins d’une minute depuis le magasin précédent');

  // 5. Tenue à 390 px : rien ne déborde.
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for(const box of await page.locator('#week .timelineRow:not(.calendarEvent)').all()){
    const r=await box.boundingBox();
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x+r.width).toBeLessThanOrEqual(391);
  }
  expect(errors).toEqual([]);
});
