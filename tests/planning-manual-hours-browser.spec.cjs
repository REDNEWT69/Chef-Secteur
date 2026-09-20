const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

const SEED=()=>{
  const st=window.state;
  st.profile=Object.assign({},st.profile||{},{baseName:'Base test',baseAddress:'Villetest',baseLat:45.00,baseLon:4.00});
  st.settings=Object.assign({},st.settings||{},{days:['Lundi','Mardi'],startTime:'08:30',endTime:'19:00',visitMinutes:60,weekDate:'2026-09-14'});
  // Horaires explicites des deux côtés : ce test porte sur les horaires imposés, pas sur
  // les défauts d'enseigne, qui s'appliquent après le premier rendu et déplaceraient la
  // référence en cours de route.
  const large={Lundi:[{open:'07:00',close:'20:00'}],Mardi:[{open:'07:00',close:'20:00'}]};
  const a={id:'mh-boulanger',enseigne:'Boulanger',ville:'Chalon',adresse:'1 rue A',lat:45.11871,lon:4.00,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:large};
  const b={id:'mh-carrefour',enseigne:'Carrefour',ville:'Chalon',adresse:'2 rue B',lat:45.23742,lon:4.00,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:JSON.parse(JSON.stringify(large))};
  st.stores=[a,b];
  st.plan={Lundi:[a,b],Mardi:[]};
  st.visits={};st.notes={};st.included={};st.excluded={};st.locks={};st.appointments=[];st.calendarEvents=[];
  try{save()}catch(e){}
};
const ready=page=>page.waitForFunction(()=>window.state&&window.StoreOpeningHoursV1&&window.StoreRunnerManualHours&&typeof window.openStoreQuick==='function');
const rowTimes=page=>page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').allTextContents();

async function planning(page){
  const nav=page.locator('.bottomNavBtn[data-panel="planPanel"]');
  if(await nav.count())await nav.tap(); else await page.evaluate(()=>window.goTab('planPanel'));
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  await page.waitForFunction(()=>{
    const m=document.querySelector('#week .timelineRow:not(.calendarEvent) .tlMain[onclick]');
    return !!m&&/','Lundi','/.test(m.getAttribute('onclick')||'');
  });
  await page.waitForTimeout(400);
}
async function openEditor(page,index){
  await page.locator('#week .timelineRow:not(.calendarEvent) .tlMain').nth(index).tap();
  await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
  await page.locator('#manualHoursQuickBtn').tap();
  await expect(page.locator('#manualHoursDialog')).toHaveClass(/open/);
}
const expected=page=>page.evaluate(()=>{
  const api=window.StoreOpeningHoursV1,s=window.state;
  const r=api.scheduleRoute(s.plan.Lundi,'Lundi',s);
  const clock=m=>m==null?null:String(Math.floor(Math.round(m)/60)).padStart(2,'0')+':'+String(Math.round(m)%60).padStart(2,'0');
  return r.rows.map(x=>({arrival:clock(x.arrival),nominal:clock(x.nominalArrival),travel:Math.round(x.travel),duration:x.duration,status:x.status}));
});

// Les horaires d'ouverture par défaut d'une enseigne s'appliquent après le premier rendu :
// on attend que la timeline affiche exactement ce que l'ordonnanceur calcule avant de
// prendre une référence, sinon on fige un état intermédiaire.
async function settle(page){
  let rows=null;
  await expect.poll(async()=>{
    rows=await expected(page);
    const dom=await rowTimes(page);
    return JSON.stringify(dom)===JSON.stringify(rows.map(r=>r.arrival))?'ok':JSON.stringify([dom,rows.map(r=>r.arrival)]);
  },{timeout:8000}).toBe('ok');
  return rows;
}

test('Une visite peut recevoir une arrivée et un départ imposés, qui se propagent, à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await page.evaluate(()=>renderAll());
  await planning(page);

  const before=await settle(page);
  expect(before[1].travel).toBeGreaterThan(0);          // le trajet inter-magasin existe bien

  // --- Édition depuis la ligne du magasin ------------------------------------------------
  await openEditor(page,0);
  const dialog=page.locator('#manualHoursDialog');
  expect((await dialog.locator('[data-mh-mode="manual"]').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await dialog.locator('[data-mh-mode="manual"]').tap();
  await dialog.locator('[data-mh-arrival]').fill('10:30');
  await dialog.locator('[data-mh-departure]').fill('12:00');
  await expect(dialog.locator('[data-mh-readout]')).toContainText('90 min');
  await expect(dialog.locator('[data-mh-warn]')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await dialog.locator('[data-mh-save]').tap();
  await expect(dialog).not.toHaveClass(/open/);

  // --- Arrivée respectée, durée déduite, propagation --------------------------------------
  const after=await settle(page);
  expect(after[0].arrival).toBe('10:30');
  expect(after[0].duration).toBe(90);
  expect(after[1].travel).toBe(before[1].travel);        // le trajet reste compté
  const suivant=12*60+after[1].travel;
  expect(after[1].arrival).toBe(String(Math.floor(suivant/60)).padStart(2,'0')+':'+String(suivant%60).padStart(2,'0'));

  const manualLine=page.locator('#week .timelineRow:not(.calendarEvent) .tlManualHint').first();
  await expect(manualLine).toContainText('Arrivée imposée 10:30');
  await expect(manualLine).toContainText('départ 12:00');
  await expect(page.locator('#week .timelineRow:not(.calendarEvent) .tlDuration').first()).toContainText('90 min sur place');
  await expect(page.locator('#week .timelineRow:not(.calendarEvent) .tlDuration').first()).toContainText('fin 12:00');
  await expect(page.locator('#week .timelineRow:not(.calendarEvent) .tlTravelHint').nth(1)).toContainText('trajet');

  // --- Persistance ------------------------------------------------------------------------
  const stored=await page.evaluate(()=>window.state.appointments.filter(a=>a.manualHours===true));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({storeId:'mh-boulanger',date:'2026-09-14',time:'10:30',endTime:'12:00',duration:90});
  await page.reload({waitUntil:'domcontentloaded'});
  await ready(page);
  await planning(page);
  const reloaded=await settle(page);
  expect(reloaded.map(r=>r.arrival)).toEqual([after[0].arrival,after[1].arrival]);
  await expect(page.locator('#week .timelineRow:not(.calendarEvent) .tlManualHint').first()).toContainText('Arrivée imposée 10:30');

  // --- Retour en automatique ---------------------------------------------------------------
  await openEditor(page,0);
  await page.locator('#manualHoursDialog [data-mh-auto]').tap();
  await expect(page.locator('#manualHoursDialog')).not.toHaveClass(/open/);
  const backToAuto=await settle(page);
  expect(backToAuto.map(r=>r.arrival)).toEqual([before[0].arrival,before[1].arrival]);
  await expect(page.locator('#week .timelineRow:not(.calendarEvent) .tlManualHint')).toHaveCount(0);
  expect(await page.evaluate(()=>window.state.appointments.filter(a=>a.manualHours===true))).toHaveLength(0);

  // --- Rien ne déborde ---------------------------------------------------------------------
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('Une arrivée impossible est signalée, dans l’éditeur et dans la timeline',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await page.evaluate(()=>renderAll());
  await planning(page);
  const before=await settle(page);

  // Le second magasin ne peut pas être atteint avant son arrivée au plus tôt.
  await openEditor(page,1);
  const dialog=page.locator('#manualHoursDialog');
  await dialog.locator('[data-mh-mode="manual"]').tap();
  await dialog.locator('[data-mh-arrival]').fill('08:45');
  const warn=dialog.locator('[data-mh-warn]');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('au plus tôt '+before[1].nominal);
  await dialog.locator('[data-mh-save]').tap();

  await page.waitForTimeout(500);
  const line=page.locator('#week .timelineRow:not(.calendarEvent) .tlManualHint').first();
  await expect(line).toContainText('impossible : au plus tôt '+before[1].nominal);
  await expect(line).toHaveClass(/tlManualImpossible/);
  const after=await expected(page);
  expect(after[1].status).toBe('appointment-conflict');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
