const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

// Un nom volontairement long et composé : c'est lui qui se coupait au milieu d'un mot.
const LONG='Boulanger Villefranche-sur-Saône Nord';
const SEED=()=>{
  const st=window.state;
  st.profile=Object.assign({},st.profile||{},{baseName:'Base test',baseAddress:'Villetest',baseLat:45.00,baseLon:4.00});
  st.settings=Object.assign({},st.settings||{},{days:['Lundi','Mardi'],startTime:'08:30',endTime:'19:00',visitMinutes:90,weekDate:'2026-09-14'});
  const large={Lundi:[{open:'07:00',close:'20:00'}],Mardi:[{open:'07:00',close:'20:00'}]};
  const a={id:'card-a',enseigne:'Boulanger',ville:'Villefranche-sur-Saône Nord',adresse:'12 avenue de la Libération',dept:'69',lat:45.11871,lon:4.00,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:large};
  const b={id:'card-b',enseigne:'Carrefour',ville:'Chalon',adresse:'2 rue B',dept:'71',lat:45.23742,lon:4.00,active:true,products:['Brun'],openingHoursSource:'manual',openingHours:JSON.parse(JSON.stringify(large))};
  st.stores=[a,b];
  st.plan={Lundi:[a,b],Mardi:[]};
  st.visits={};st.notes={};st.included={};st.excluded={};st.locks={'card-b':'Lundi'};st.appointments=[];st.calendarEvents=[];
  try{save()}catch(e){}
};
const ready=page=>page.waitForFunction(()=>window.state&&window.StoreOpeningHoursV1&&window.StoreRunnerManualHours&&window.StoreRunnerTimelineHours);

async function planning(page){
  const nav=page.locator('.bottomNavBtn[data-panel="planPanel"]');
  if(await nav.count())await nav.tap(); else await page.evaluate(()=>window.goTab('planPanel'));
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  await page.waitForFunction(()=>{
    const m=document.querySelector('#week .timelineRow:not(.calendarEvent) .tlMain[onclick]');
    return !!m&&/','Lundi','/.test(m.getAttribute('onclick')||'');
  });
  await expect(page.locator('#week .timelineRow:not(.calendarEvent) .tlSecondary').first()).toBeVisible();
  await page.waitForTimeout(400);
}
const prepare=async page=>{
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await page.evaluate(()=>renderAll());
  await planning(page);
};

test('Le bloc ARRIVÉE ouvre l’éditeur d’horaires, la flèche ouvre la fiche magasin',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page);

  // --- 1. Le bloc horaire est une vraie cible tactile -------------------------------------
  const time=page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').first();
  await expect(time).toHaveAttribute('role','button');
  await expect(time).toHaveAttribute('aria-label',/arriv|horaire/i);
  expect((await time.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(time).toHaveAttribute('data-tl-store','card-a');
  await expect(time).toHaveAttribute('data-tl-day','Lundi');

  // Il ouvre l'éditeur existant, pour ce magasin et ce jour — sans ouvrir la fiche magasin.
  await time.tap();
  const dialog=page.locator('#manualHoursDialog');
  await expect(dialog).toHaveClass(/open/);
  await expect(dialog.locator('[data-mh-store]')).toContainText('Villefranche-sur-Saône Nord');
  await expect(dialog.locator('[data-mh-store]')).toContainText('Lundi');
  await expect(page.locator('#storeQuickSheet')).not.toHaveClass(/open/);
  await dialog.locator('[data-mh-close]').tap();
  await expect(dialog).not.toHaveClass(/open/);

  // --- 2. La flèche bleue ouvre toujours la fiche magasin ---------------------------------
  const chevron=page.locator('#week .timelineRow:not(.calendarEvent) .tlChevron').first();
  await expect(chevron).toBeVisible();
  await chevron.tap();
  await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
  await expect(page.locator('#manualHoursDialog')).not.toHaveClass(/open/);
  await expect(page.locator('#srQuickStart')).toHaveAttribute('data-sr-start','card-a');
  expect(errors).toEqual([]);
});

test('Nom, trajet, durée et repère de pose sont lisibles à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page);

  // --- 3. Le nom ne se coupe jamais au milieu d'un mot ------------------------------------
  const name=page.locator('#week .timelineRow:not(.calendarEvent) .tlName').first();
  await expect(name).toHaveText(LONG);
  const typo=await name.evaluate(el=>{
    const s=getComputedStyle(el);
    return {wordBreak:s.wordBreak,lineClamp:s.webkitLineClamp,lineHeight:parseFloat(s.lineHeight),height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width};
  });
  expect(typo.wordBreak).toBe('normal');                 // break-word autorisait « Boula / nger »
  expect(Math.round(typo.height/typo.lineHeight)).toBeLessThanOrEqual(2);
  expect(typo.width).toBeGreaterThan(150);               // le nom a une vraie largeur

  // --- 4 & 5. Les informations secondaires passent sous la ligne, sur toute la largeur -----
  const secondary=page.locator('#week .timelineRow:not(.calendarEvent) .tlSecondary').first();
  await expect(secondary).toBeVisible();
  const duration=secondary.locator('.tlDuration');
  await expect(duration).toContainText('min sur place');
  await expect(duration).toContainText('fin ');
  // Le conteneur secondaire occupe toute la largeur de la carte, et non plus la seule
  // colonne de gauche : c'est ce qui rendait le trajet illisible.
  const span=await secondary.evaluate(el=>{
    const main=el.closest('.tlMain'),cols=getComputedStyle(main).gridTemplateColumns.split(' ').length;
    return {gridColumn:getComputedStyle(el).gridColumn,width:el.getBoundingClientRect().width,
      mainWidth:main.getBoundingClientRect().width,colonnes:cols};
  });
  expect(span.colonnes).toBeGreaterThan(1);              // .tlMain reste bien une grille à colonnes
  expect(span.gridColumn).toBe('1 / -1');                // et le bloc les traverse toutes
  expect(span.width).toBeGreaterThan(span.mainWidth*0.9);
  expect(span.width).toBeGreaterThan(200);
  const travel=page.locator('#week .timelineRow:not(.calendarEvent) .tlTravelHint').first();
  await expect(travel).toContainText('depuis le départ');
  expect(await duration.evaluate(el=>el.closest('.tlSecondary')!==null)).toBe(true);

  // Chaque libellé de trajet tient en deux lignes au plus : plus d'affichage mot par mot.
  // Le second est le plus long (« … depuis le magasin précédent »).
  for(const hint of await page.locator('#week .timelineRow:not(.calendarEvent) .tlTravelHint').all()){
    const shape=await hint.evaluate(el=>{
      const s=getComputedStyle(el),box=el.getBoundingClientRect();
      return {lines:Math.round(box.height/parseFloat(s.lineHeight)),width:box.width,words:(el.textContent||'').trim().split(/\s+/).length};
    });
    expect(shape.words).toBeGreaterThan(4);              // le libellé testé est bien long
    expect(shape.lines).toBeLessThanOrEqual(2);
    expect(shape.width).toBeGreaterThan(140);
    expect(await hint.evaluate(el=>el.closest('.tlSecondary')!==null)).toBe(true);
  }

  // --- 7. Le repère de pose est explicite et ne touche à aucune logique --------------------
  const pinned=page.locator('#week .timelineRow:not(.calendarEvent)').nth(1).locator('.tlPinned');
  await expect(pinned).toHaveText('📌 Visite placée manuellement');
  expect(await pinned.evaluate(el=>el.closest('.tlSecondary')!==null)).toBe(true);
  await expect(page.locator('#week .timelineRow').nth(1)).toHaveClass(/pinnedVisit/);
  expect(await page.evaluate(()=>({lock:window.state.locks['card-b'],ordre:window.state.plan.Lundi.map(s=>s.id)})))
    .toEqual({lock:'Lundi',ordre:['card-a','card-b']});

  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('Un horaire imposé change le libellé du bloc en ARRIVÉE IMPOSÉE',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await prepare(page);

  const time=page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').first();
  const label=el=>el.evaluate(node=>getComputedStyle(node,'::before').content);
  expect((await label(time)).toLowerCase()).toContain('arriv');
  expect((await label(time)).toLowerCase()).not.toContain('impos');

  await time.tap();
  const dialog=page.locator('#manualHoursDialog');
  await dialog.locator('[data-mh-mode="manual"]').tap();
  await dialog.locator('[data-mh-arrival]').fill('11:15');
  await dialog.locator('[data-mh-save]').tap();
  await expect(dialog).not.toHaveClass(/open/);
  await page.waitForTimeout(500);

  // --- 6. Libellé imposé, heure respectée, éditeur toujours accessible ---------------------
  await expect(time).toHaveClass(/tlTimeImposed/);
  expect((await label(time)).toLowerCase()).toContain('impos');
  await expect(time).toHaveText('11:15');
  await expect(page.locator('#week .timelineRow:not(.calendarEvent) .tlManualHint').first()).toContainText('Arrivée imposée 11:15');
  await expect(time).toHaveAttribute('aria-label',/imposé/i);

  // Le moteur de #367 continue de propager : le magasin suivant suit l'heure imposée.
  const suite=await page.evaluate(()=>{
    const api=window.StoreOpeningHoursV1,s=window.state;
    const r=api.scheduleRoute(s.plan.Lundi,'Lundi',s);
    const c=m=>String(Math.floor(Math.round(m)/60)).padStart(2,'0')+':'+String(Math.round(m)%60).padStart(2,'0');
    return r.rows.map(x=>c(x.arrival));
  });
  expect(suite[0]).toBe('11:15');
  expect(await page.locator('#week .timelineRow:not(.calendarEvent) .tlTime').allTextContents()).toEqual(suite);

  // Le bloc reste cliquable après passage en imposé.
  await time.tap();
  await expect(dialog).toHaveClass(/open/);
  expect(errors).toEqual([]);
});
